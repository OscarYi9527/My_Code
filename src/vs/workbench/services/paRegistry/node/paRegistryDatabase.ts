/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import type { Database, RunResult } from '@vscode/sqlite3';
import { dirname } from '../../../../base/common/path.js';
import { PA_REGISTRY_SCHEMA_VERSION } from '../common/paCompatibility.js';
import { IPaGalleryItem, PaArtifactKind, PaPublicationStatus } from '../common/paRegistry.js';
import { PaCheckpoint, PaCheckpointSchema, PaManifest, PaRun, PaRunSchema } from './paContracts.js';
import { validatePaManifest } from './paManifestValidator.js';
import type { IPaRuntimeEventRecord } from './paRuntime.js';

export interface IPaRegistryVersionRecord {
	readonly profileId: string;
	readonly item: IPaGalleryItem;
	readonly packagePath: string;
	readonly manifest: PaManifest;
	readonly createdAt: string;
}

interface IPaRegistryMigration {
	readonly version: number;
	readonly sql: string;
}

export const paRegistryMigrations: readonly IPaRegistryMigration[] = [
	{
		version: 1,
		sql: [
			`CREATE TABLE IF NOT EXISTS pa_artifacts (
				profile_id       TEXT NOT NULL,
				id               TEXT NOT NULL,
				kind             TEXT NOT NULL,
				name             TEXT NOT NULL,
				description      TEXT NOT NULL,
				icon_id          TEXT NOT NULL,
				status           TEXT NOT NULL,
				current_version  TEXT NOT NULL,
				updated_at       TEXT NOT NULL,
				primary_action_id TEXT,
				PRIMARY KEY (profile_id, id)
			)`,
			`CREATE TABLE IF NOT EXISTS pa_versions (
				profile_id  TEXT NOT NULL,
				artifact_id TEXT NOT NULL,
				version     TEXT NOT NULL,
				package_path TEXT NOT NULL,
				manifest_json TEXT NOT NULL,
				created_at  TEXT NOT NULL,
				PRIMARY KEY (profile_id, artifact_id, version),
				FOREIGN KEY (profile_id, artifact_id)
					REFERENCES pa_artifacts(profile_id, id) ON DELETE CASCADE
			)`,
			`CREATE TABLE IF NOT EXISTS pa_runs (
				id                   TEXT PRIMARY KEY NOT NULL,
				profile_id           TEXT NOT NULL,
				pa_id                TEXT NOT NULL,
				pa_version           TEXT NOT NULL,
				status               TEXT NOT NULL,
				current_activity     TEXT,
				latest_checkpoint_id TEXT,
				node_states_json     TEXT NOT NULL,
				updated_at           TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS pa_checkpoints (
				id               TEXT PRIMARY KEY NOT NULL,
				run_id           TEXT NOT NULL REFERENCES pa_runs(id) ON DELETE CASCADE,
				sequence         INTEGER NOT NULL,
				created_at       TEXT NOT NULL,
				snapshot_json    TEXT NOT NULL,
				UNIQUE (run_id, sequence)
			)`,
			`CREATE TABLE IF NOT EXISTS pa_audit_events (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				profile_id  TEXT NOT NULL,
				action      TEXT NOT NULL,
				subject_id  TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				created_at  TEXT NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS idx_pa_artifacts_profile_status
				ON pa_artifacts(profile_id, status)`,
			`CREATE INDEX IF NOT EXISTS idx_pa_runs_profile
				ON pa_runs(profile_id, updated_at)`,
			`CREATE INDEX IF NOT EXISTS idx_pa_audit_profile
				ON pa_audit_events(profile_id, created_at)`
		].join(';\n')
	},
	{
		version: 2,
		sql: [
			`CREATE TABLE IF NOT EXISTS pa_runtime_events (
				id          TEXT PRIMARY KEY NOT NULL,
				run_id      TEXT NOT NULL REFERENCES pa_runs(id) ON DELETE CASCADE,
				sequence    INTEGER NOT NULL,
				event_json  TEXT NOT NULL,
				created_at  TEXT NOT NULL,
				UNIQUE (run_id, sequence)
			)`,
			`CREATE INDEX IF NOT EXISTS idx_pa_runtime_events_run
				ON pa_runtime_events(run_id, sequence)`
		].join(';\n')
	}
];

export function validatePaRegistryMigrations(migrations: readonly IPaRegistryMigration[] = paRegistryMigrations): void {
	const versions = migrations.map(migration => migration.version).sort((left, right) => left - right);
	if (versions.length !== PA_REGISTRY_SCHEMA_VERSION
		|| versions.some((version, index) => version !== index + 1)
		|| versions.at(-1) !== PA_REGISTRY_SCHEMA_VERSION) {
		throw new Error(
			`PA registry migrations must be contiguous through schema version ${PA_REGISTRY_SCHEMA_VERSION}.`
		);
	}
}

export class PaRegistryDatabase {
	private databasePromise: Promise<Database> | undefined;
	private closed: Promise<void> | true | undefined;
	private writeQueue = Promise.resolve();

	constructor(
		private readonly path: string,
		private readonly migrations: readonly IPaRegistryMigration[] = paRegistryMigrations
	) { }

	static async open(path: string): Promise<PaRegistryDatabase> {
		const database = new PaRegistryDatabase(path);
		await database.ensureDatabase();
		return database;
	}

	async listGallery(profileId: string): Promise<readonly IPaGalleryItem[]> {
		const database = await this.ensureDatabase();
		const rows = await dbAll(database, `SELECT
			id, kind, name, description, icon_id, current_version, status, updated_at, primary_action_id
			FROM pa_artifacts
			WHERE profile_id = ?
			ORDER BY updated_at DESC, name COLLATE NOCASE ASC`, [profileId]);
		return rows.map(row => ({
			id: readString(row, 'id'),
			kind: readString(row, 'kind') as PaArtifactKind,
			name: readString(row, 'name'),
			description: readString(row, 'description'),
			iconId: readString(row, 'icon_id'),
			version: readString(row, 'current_version'),
			status: readString(row, 'status') as PaPublicationStatus,
			updatedAt: readString(row, 'updated_at'),
			primaryActionId: readOptionalString(row, 'primary_action_id')
		}));
	}

	async listVersions(profileId: string, artifactId: string): Promise<readonly IPaRegistryVersionRecord[]> {
		const database = await this.ensureDatabase();
		const rows = await dbAll(database, `SELECT
			v.version, v.package_path, v.manifest_json, v.created_at,
			a.kind, a.name, a.description, a.icon_id, a.status, a.current_version,
			a.updated_at, a.primary_action_id
			FROM pa_versions v
			JOIN pa_artifacts a
				ON a.profile_id = v.profile_id AND a.id = v.artifact_id
			WHERE v.profile_id = ? AND v.artifact_id = ?
			ORDER BY v.created_at DESC, v.version DESC`, [profileId, artifactId]);
		return rows.map(row => ({
			profileId,
			packagePath: readString(row, 'package_path'),
			manifest: JSON.parse(readString(row, 'manifest_json')),
			createdAt: readString(row, 'created_at'),
			item: {
				id: artifactId,
				kind: readString(row, 'kind') as PaArtifactKind,
				name: readString(row, 'name'),
				description: readString(row, 'description'),
				iconId: readString(row, 'icon_id'),
				version: readString(row, 'version'),
				status: readString(row, 'status') as PaPublicationStatus,
				updatedAt: readString(row, 'updated_at'),
				primaryActionId: readOptionalString(row, 'primary_action_id')
			}
		}));
	}

	registerPublishedVersion(record: IPaRegistryVersionRecord): Promise<void> {
		return this.enqueueWrite(async () => {
			const validation = validatePaManifest(record.manifest);
			if (!validation.success) {
				throw new Error(`Cannot publish invalid PA manifest: ${validation.issues.map(issue => issue.code).join(', ')}`);
			}
			if (record.profileId !== record.manifest.publication.profileId) {
				throw new Error('Publication profile does not match the manifest profile.');
			}
			if (record.item.id !== record.manifest.id || record.item.version !== record.manifest.version) {
				throw new Error('Published item identity does not match the manifest.');
			}

			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				await dbRun(database, `INSERT INTO pa_artifacts (
					profile_id, id, kind, name, description, icon_id, status,
					current_version, updated_at, primary_action_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(profile_id, id) DO UPDATE SET
					kind = excluded.kind,
					name = excluded.name,
					description = excluded.description,
					icon_id = excluded.icon_id,
					status = excluded.status,
					current_version = excluded.current_version,
					updated_at = excluded.updated_at,
					primary_action_id = excluded.primary_action_id`, [
					record.profileId,
					record.item.id,
					record.item.kind,
					record.item.name,
					record.item.description,
					record.item.iconId,
					record.item.status,
					record.item.version,
					record.item.updatedAt,
					record.item.primaryActionId ?? null
				]);
				await dbRun(database, `INSERT INTO pa_versions (
					profile_id, artifact_id, version, package_path, manifest_json, created_at
				) VALUES (?, ?, ?, ?, ?, ?)`, [
					record.profileId,
					record.item.id,
					record.item.version,
					record.packagePath,
					JSON.stringify(record.manifest),
					record.createdAt
				]);
				await this.insertAuditEvent(database, record.profileId, 'publish', record.item.id, {
					version: record.item.version,
					packagePath: record.packagePath
				}, record.createdAt);
				await dbExec(database, 'COMMIT');
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	setPublicationStatus(profileId: string, artifactId: string, status: PaPublicationStatus, updatedAt: string): Promise<boolean> {
		return this.enqueueWrite(async () => {
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				const update = await dbRun(database, `UPDATE pa_artifacts
					SET status = ?, updated_at = ?
					WHERE profile_id = ? AND id = ?`, [status, updatedAt, profileId, artifactId]);
				if (update.changes === 1) {
					await this.insertAuditEvent(database, profileId, status, artifactId, {}, updatedAt);
				}
				await dbExec(database, 'COMMIT');
				return update.changes === 1;
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	rollbackToVersion(profileId: string, artifactId: string, version: string, updatedAt: string): Promise<boolean> {
		return this.enqueueWrite(async () => {
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				const versionRow = await dbGet(database, `SELECT version FROM pa_versions
					WHERE profile_id = ? AND artifact_id = ? AND version = ?`, [profileId, artifactId, version]);
				if (!versionRow) {
					await dbExec(database, 'ROLLBACK');
					return false;
				}
				const update = await dbRun(database, `UPDATE pa_artifacts SET
					current_version = ?, status = ?, updated_at = ?
					WHERE profile_id = ? AND id = ?`, [
					version,
					PaPublicationStatus.Published,
					updatedAt,
					profileId,
					artifactId
				]);
				if (update.changes !== 1) {
					await dbExec(database, 'ROLLBACK');
					return false;
				}
				await this.insertAuditEvent(database, profileId, 'rollback', artifactId, { version }, updatedAt);
				await dbExec(database, 'COMMIT');
				return true;
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	deleteArtifact(profileId: string, artifactId: string, createdAt: string): Promise<boolean> {
		return this.enqueueWrite(async () => {
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				const active = await dbGet(database, `SELECT COUNT(*) AS count FROM pa_runs
					WHERE profile_id = ? AND pa_id = ?
					AND status IN ('running', 'waitingForUser', 'reworking')`, [profileId, artifactId]);
				if ((readOptionalNumber(active, 'count') ?? 0) > 0) {
					throw new Error(`Cannot delete PA '${artifactId}' while a run is active.`);
				}
				const deletion = await dbRun(database, `DELETE FROM pa_artifacts
					WHERE profile_id = ? AND id = ?`, [profileId, artifactId]);
				if (deletion.changes === 1) {
					await this.insertAuditEvent(database, profileId, 'delete', artifactId, {
						retainedAudit: true
					}, createdAt);
				}
				await dbExec(database, 'COMMIT');
				return deletion.changes === 1;
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	removePublishedVersion(profileId: string, artifactId: string, version: string, createdAt: string): Promise<void> {
		return this.enqueueWrite(async () => {
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				await dbRun(database, `DELETE FROM pa_versions
					WHERE profile_id = ? AND artifact_id = ? AND version = ?`, [profileId, artifactId, version]);
				const latest = await dbGet(database, `SELECT version FROM pa_versions
					WHERE profile_id = ? AND artifact_id = ?
					ORDER BY created_at DESC, version DESC LIMIT 1`, [profileId, artifactId]);
				if (latest) {
					await dbRun(database, `UPDATE pa_artifacts SET current_version = ?, updated_at = ?
						WHERE profile_id = ? AND id = ?`, [
						readString(latest, 'version'),
						createdAt,
						profileId,
						artifactId
					]);
				} else {
					await dbRun(database, `DELETE FROM pa_artifacts
						WHERE profile_id = ? AND id = ?`, [profileId, artifactId]);
				}
				await this.insertAuditEvent(database, profileId, 'publishRollback', artifactId, { version }, createdAt);
				await dbExec(database, 'COMMIT');
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	createRun(run: PaRun, updatedAt: string): Promise<void> {
		return this.enqueueWrite(async () => {
			const parsed = PaRunSchema.parse(run);
			const database = await this.ensureDatabase();
			await dbRun(database, `INSERT INTO pa_runs (
				id, profile_id, pa_id, pa_version, status, current_activity,
				latest_checkpoint_id, node_states_json, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
				parsed.id,
				parsed.profileId,
				parsed.paId,
				parsed.paVersion,
				parsed.status,
				parsed.currentActivity ?? null,
				parsed.latestCheckpointId ?? null,
				JSON.stringify(parsed.nodeStates),
				updatedAt
			]);
		});
	}

	saveCheckpoint(checkpoint: PaCheckpoint): Promise<void> {
		return this.enqueueWrite(async () => {
			const parsed = PaCheckpointSchema.parse(checkpoint);
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				await dbRun(database, `INSERT INTO pa_checkpoints (
					id, run_id, sequence, created_at, snapshot_json
				) VALUES (?, ?, ?, ?, ?)`, [
					parsed.id,
					parsed.runId,
					parsed.sequence,
					parsed.createdAt,
					JSON.stringify(parsed)
				]);
				const update = await dbRun(database, `UPDATE pa_runs SET
					latest_checkpoint_id = ?,
					node_states_json = ?,
					updated_at = ?
					WHERE id = ?`, [
					parsed.id,
					JSON.stringify(parsed.nodeStates),
					parsed.createdAt,
					parsed.runId
				]);
				if (update.changes !== 1) {
					throw new Error(`Cannot checkpoint missing PA run '${parsed.runId}'.`);
				}
				await dbExec(database, 'COMMIT');
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	saveRuntimeTransition(run: PaRun, checkpoint: PaCheckpoint, event: IPaRuntimeEventRecord): Promise<void> {
		return this.enqueueWrite(async () => {
			const parsedRun = PaRunSchema.parse(run);
			const parsedCheckpoint = PaCheckpointSchema.parse(checkpoint);
			if (parsedRun.id !== parsedCheckpoint.runId
				|| event.runId !== parsedRun.id
				|| event.sequence !== parsedCheckpoint.sequence
				|| event.createdAt !== parsedCheckpoint.createdAt
				|| parsedRun.latestCheckpointId !== parsedCheckpoint.id) {
				throw new Error('PA runtime transition run, checkpoint, and event metadata do not match.');
			}
			const database = await this.ensureDatabase();
			await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
			try {
				await dbRun(database, `INSERT INTO pa_checkpoints (
					id, run_id, sequence, created_at, snapshot_json
				) VALUES (?, ?, ?, ?, ?)`, [
					parsedCheckpoint.id,
					parsedCheckpoint.runId,
					parsedCheckpoint.sequence,
					parsedCheckpoint.createdAt,
					JSON.stringify(parsedCheckpoint)
				]);
				const update = await dbRun(database, `UPDATE pa_runs SET
					status = ?,
					current_activity = ?,
					latest_checkpoint_id = ?,
					node_states_json = ?,
					updated_at = ?
					WHERE id = ?`, [
					parsedRun.status,
					parsedRun.currentActivity ?? null,
					parsedCheckpoint.id,
					JSON.stringify(parsedRun.nodeStates),
					parsedCheckpoint.createdAt,
					parsedRun.id
				]);
				if (update.changes !== 1) {
					throw new Error(`Cannot checkpoint missing PA run '${parsedRun.id}'.`);
				}
				await dbRun(database, `INSERT INTO pa_runtime_events (
					id, run_id, sequence, event_json, created_at
				) VALUES (?, ?, ?, ?, ?)`, [
					event.id,
					event.runId,
					event.sequence,
					JSON.stringify(event.event),
					event.createdAt
				]);
				await dbExec(database, 'COMMIT');
			} catch (error) {
				await dbExec(database, 'ROLLBACK');
				throw error;
			}
		});
	}

	async getRun(runId: string): Promise<PaRun | undefined> {
		const database = await this.ensureDatabase();
		const row = await dbGet(database, `SELECT
			id, profile_id, pa_id, pa_version, status, current_activity,
			latest_checkpoint_id, node_states_json
			FROM pa_runs WHERE id = ?`, [runId]);
		if (!row) {
			return undefined;
		}
		return PaRunSchema.parse({
			id: readString(row, 'id'),
			profileId: readString(row, 'profile_id'),
			paId: readString(row, 'pa_id'),
			paVersion: readString(row, 'pa_version'),
			status: readString(row, 'status'),
			currentActivity: readOptionalString(row, 'current_activity'),
			latestCheckpointId: readOptionalString(row, 'latest_checkpoint_id'),
			nodeStates: JSON.parse(readString(row, 'node_states_json'))
		});
	}

	async getLatestCheckpoint(runId: string): Promise<PaCheckpoint | undefined> {
		const database = await this.ensureDatabase();
		const row = await dbGet(database, `SELECT snapshot_json
			FROM pa_checkpoints
			WHERE run_id = ?
			ORDER BY sequence DESC
			LIMIT 1`, [runId]);
		return row ? PaCheckpointSchema.parse(JSON.parse(readString(row, 'snapshot_json'))) : undefined;
	}

	async listRuntimeEvents(runId: string): Promise<readonly IPaRuntimeEventRecord[]> {
		const database = await this.ensureDatabase();
		const rows = await dbAll(database, `SELECT id, run_id, sequence, event_json, created_at
			FROM pa_runtime_events
			WHERE run_id = ?
			ORDER BY sequence ASC`, [runId]);
		return rows.map(row => ({
			id: readString(row, 'id'),
			runId: readString(row, 'run_id'),
			sequence: readNumber(row, 'sequence'),
			createdAt: readString(row, 'created_at'),
			event: JSON.parse(readString(row, 'event_json'))
		}));
	}

	async dispose(): Promise<void> {
		if (this.closed) {
			await (this.closed === true ? Promise.resolve() : this.closed);
			return;
		}
		const databasePromise = this.databasePromise;
		this.closed = databasePromise ? databasePromise.then(database => dbClose(database)) : true;
		await (this.closed === true ? Promise.resolve() : this.closed);
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.writeQueue.then(operation, operation);
		this.writeQueue = result.then(() => undefined, () => undefined);
		return result;
	}

	private async ensureDatabase(): Promise<Database> {
		if (this.closed) {
			throw new Error('PA registry database has been disposed.');
		}
		if (!this.databasePromise) {
			this.databasePromise = (async () => {
				validatePaRegistryMigrations(this.migrations);
				if (this.path !== ':memory:') {
					await fs.promises.mkdir(dirname(this.path), { recursive: true });
				}
				const database = await dbOpen(this.path);
				await runMigrations(database, this.migrations);
				return database;
			})();
		}
		return this.databasePromise;
	}

	private insertAuditEvent(
		database: Database,
		profileId: string,
		action: string,
		subjectId: string,
		payload: object,
		createdAt: string
	): Promise<{ changes: number; lastID: number }> {
		return dbRun(database, `INSERT INTO pa_audit_events (
			profile_id, action, subject_id, payload_json, created_at
		) VALUES (?, ?, ?, ?, ?)`, [
			profileId,
			action,
			subjectId,
			JSON.stringify(payload),
			createdAt
		]);
	}
}

async function runMigrations(database: Database, migrations: readonly IPaRegistryMigration[]): Promise<void> {
	await dbExec(database, 'PRAGMA foreign_keys = ON');
	const row = await dbGet(database, 'PRAGMA user_version', []);
	const currentVersion = readOptionalNumber(row, 'user_version') ?? 0;
	if (currentVersion > PA_REGISTRY_SCHEMA_VERSION) {
		throw new Error(
			`PA registry schema ${currentVersion} is newer than supported schema ${PA_REGISTRY_SCHEMA_VERSION}.`
		);
	}
	const pending = migrations
		.filter(migration => migration.version > currentVersion)
		.sort((left, right) => left.version - right.version);
	if (pending.length === 0) {
		return;
	}

	await dbExec(database, 'BEGIN IMMEDIATE TRANSACTION');
	try {
		for (const migration of pending) {
			await dbExec(database, migration.sql);
			await dbExec(database, `PRAGMA user_version = ${migration.version}`);
		}
		await dbExec(database, 'COMMIT');
	} catch (error) {
		await dbExec(database, 'ROLLBACK');
		throw error;
	}
}

function dbOpen(path: string): Promise<Database> {
	return new Promise((resolve, reject) => {
		import('@vscode/sqlite3').then(sqlite3 => {
			const database = new sqlite3.default.Database(path, (error: Error | null) => {
				if (error) {
					reject(error);
				} else {
					resolve(database);
				}
			});
		}, reject);
	});
}

function dbExec(database: Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		database.exec(sql, error => error ? reject(error) : resolve());
	});
}

function dbRun(database: Database, sql: string, parameters: unknown[]): Promise<{ changes: number; lastID: number }> {
	return new Promise((resolve, reject) => {
		database.run(sql, parameters, function (this: RunResult, error: Error | null) {
			if (error) {
				reject(error);
			} else {
				resolve({ changes: this.changes, lastID: this.lastID });
			}
		});
	});
}

function dbGet(database: Database, sql: string, parameters: unknown[]): Promise<Record<string, unknown> | undefined> {
	return new Promise((resolve, reject) => {
		database.get(sql, parameters, (error: Error | null, row: Record<string, unknown> | undefined) => {
			if (error) {
				reject(error);
			} else {
				resolve(row);
			}
		});
	});
}

function dbAll(database: Database, sql: string, parameters: unknown[]): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		database.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => {
			if (error) {
				reject(error);
			} else {
				resolve(rows);
			}
		});
	});
}

function dbClose(database: Database): Promise<void> {
	return new Promise((resolve, reject) => {
		database.close(error => error ? reject(error) : resolve());
	});
}

function readString(row: Record<string, unknown>, key: string): string {
	const value = row[key];
	if (typeof value !== 'string') {
		throw new Error(`Expected database column '${key}' to be a string.`);
	}
	return value;
}

function readOptionalString(row: Record<string, unknown>, key: string): string | undefined {
	const value = row[key];
	if (value === null || value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`Expected database column '${key}' to be a string or null.`);
	}
	return value;
}

function readOptionalNumber(row: Record<string, unknown> | undefined, key: string): number | undefined {
	const value = row?.[key];
	if (value === null || value === undefined) {
		return undefined;
	}
	if (typeof value !== 'number') {
		throw new Error(`Expected database column '${key}' to be a number or null.`);
	}
	return value;
}

function readNumber(row: Record<string, unknown>, key: string): number {
	const value = row[key];
	if (typeof value !== 'number') {
		throw new Error(`Expected database column '${key}' to be a number.`);
	}
	return value;
}
