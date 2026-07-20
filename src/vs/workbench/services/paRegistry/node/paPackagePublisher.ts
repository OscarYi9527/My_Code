/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFile, zip } from '../../../../base/node/zip.js';
import type { Entry, ZipFile } from 'yauzl';
import {
	PA_PACKAGE_MANIFEST_PATH,
	PA_REQUIRED_PACKAGE_DIRECTORIES,
	PA_REQUIRED_PACKAGE_FILES
} from '../common/paCompatibility.js';
import {
	CREATE_PA_ACTION_ID,
	IPaGalleryItem,
	OPEN_PA_ACTION_ID,
	PaArtifactKind,
	PaPublicationStatus
} from '../common/paRegistry.js';
import { PaManifest, PaManifestSchema } from './paContracts.js';
import { validatePaManifest } from './paManifestValidator.js';
import { IPaRegistryVersionRecord, PaRegistryDatabase } from './paRegistryDatabase.js';

export interface IPaReleaseEvidence {
	readonly permissionsConfirmed: boolean;
	readonly trialRunPassed: boolean;
	readonly sourcesRecorded: boolean;
	readonly finalConfirmationId?: string;
	readonly changeSummary: string;
}

export interface IPaPackageDraft {
	readonly manifest: PaManifest;
	readonly files: Readonly<Record<string, string>>;
	readonly evidence: IPaReleaseEvidence;
}

export interface IPaReleaseCheckResult {
	readonly id: 'structure' | 'contracts' | 'dag' | 'activitiesAndChecks' | 'permissions' | 'trialAndProvenance';
	readonly passed: boolean;
	readonly messages: readonly string[];
}

export interface IPaPublicationResult {
	readonly item: IPaGalleryItem;
	readonly packagePath: string;
	readonly checks: readonly IPaReleaseCheckResult[];
}

export class PaReleaseGateError extends Error {
	constructor(readonly checks: readonly IPaReleaseCheckResult[]) {
		super(`PA release gate failed: ${checks.filter(check => !check.passed).map(check => check.id).join(', ')}`);
	}
}

export class PaPackagePublisher {
	constructor(
		private readonly packagesRoot: string,
		private readonly database: PaRegistryDatabase,
		private readonly onDidPublish: (profileId: string) => Promise<void> | void = () => undefined
	) { }

	validate(draft: IPaPackageDraft): readonly IPaReleaseCheckResult[] {
		const validation = validatePaManifest(draft.manifest);
		const fileNames = new Set(Object.keys(draft.files).map(normalizePackagePath));
		const structureMessages: string[] = [];
		for (const file of PA_REQUIRED_PACKAGE_FILES) {
			if (!fileNames.has(file)) {
				structureMessages.push(`Missing required file '${file}'.`);
			}
		}
		for (const directory of PA_REQUIRED_PACKAGE_DIRECTORIES) {
			if (![...fileNames].some(file => file.startsWith(`${directory}/`))) {
				structureMessages.push(`Required directory '${directory}' has no package entry.`);
			}
		}
		const contractMessages = validation.issues
			.filter(issue => !['cyclicDependency', 'missingCriticalCheck'].includes(issue.code))
			.map(issue => issue.message);
		const dagMessages = validation.issues
			.filter(issue => issue.code === 'cyclicDependency')
			.map(issue => issue.message);
		const activityMessages = validation.issues
			.filter(issue => issue.code === 'missingCriticalCheck')
			.map(issue => issue.message);
		if (draft.manifest.activities.some(activity => !activity.responsibility || activity.outputs.length === 0)) {
			activityMessages.push('Every AA must have one responsibility and at least one output.');
		}
		if (draft.manifest.checks.length === 0) {
			activityMessages.push('At least one independently executable CA is required.');
		}
		const provenanceMessages: string[] = [];
		if (!draft.evidence.trialRunPassed) {
			provenanceMessages.push('Trial run has not passed.');
		}
		if (!draft.evidence.sourcesRecorded) {
			provenanceMessages.push('Knowledge sources are incomplete.');
		}
		if (!draft.evidence.finalConfirmationId) {
			provenanceMessages.push('Final user publication confirmation is missing.');
		}
		if (!draft.evidence.changeSummary.trim()) {
			provenanceMessages.push('Version change summary is missing.');
		}
		return [
			check('structure', structureMessages),
			check('contracts', contractMessages),
			check('dag', dagMessages),
			check('activitiesAndChecks', activityMessages),
			check('permissions', draft.evidence.permissionsConfirmed ? [] : ['Tool permissions are not confirmed.']),
			check('trialAndProvenance', provenanceMessages)
		];
	}

	async publish(profileId: string, draft: IPaPackageDraft): Promise<IPaPublicationResult> {
		const checks = this.validate(draft);
		if (checks.some(check => !check.passed)) {
			throw new PaReleaseGateError(checks);
		}
		if (draft.manifest.publication.profileId !== profileId) {
			throw new Error('PA draft profile does not match the publication profile.');
		}
		const profileRoot = path.resolve(this.packagesRoot, encodeURIComponent(profileId));
		const packagePath = path.resolve(profileRoot, draft.manifest.id, draft.manifest.version);
		assertWithinRoot(profileRoot, packagePath);
		if (await exists(packagePath)) {
			throw new Error(`Published PA version '${draft.manifest.id}@${draft.manifest.version}' is immutable.`);
		}
		const stagingPath = path.resolve(this.packagesRoot, '.staging', generateUuid());
		assertWithinRoot(this.packagesRoot, stagingPath);
		await fs.promises.mkdir(stagingPath, { recursive: true });
		let registered = false;
		try {
			await this.writeDraft(stagingPath, draft);
			await fs.promises.mkdir(path.dirname(packagePath), { recursive: true });
			await fs.promises.rename(stagingPath, packagePath);
			const item = galleryItem(draft.manifest);
			const record: IPaRegistryVersionRecord = {
				profileId,
				item,
				packagePath,
				manifest: draft.manifest,
				createdAt: draft.manifest.publication.updatedAt
			};
			await this.database.registerPublishedVersion(record);
			registered = true;
			await this.onDidPublish(profileId);
			return { item, packagePath, checks };
		} catch (error) {
			if (registered) {
				await this.database.removePublishedVersion(
					profileId,
					draft.manifest.id,
					draft.manifest.version,
					new Date().toISOString()
				);
			}
			await fs.promises.rm(packagePath, { recursive: true, force: true });
			await fs.promises.rm(stagingPath, { recursive: true, force: true });
			throw error;
		}
	}

	async exportVersion(profileId: string, artifactId: string, version: string, targetZip: string): Promise<string> {
		const record = (await this.database.listVersions(profileId, artifactId))
			.find(candidate => candidate.item.version === version);
		if (!record) {
			throw new Error(`Unknown PA version '${artifactId}@${version}'.`);
		}
		const files = await collectZipFiles(record.packagePath);
		await fs.promises.mkdir(path.dirname(targetZip), { recursive: true });
		return zip(targetZip, files);
	}

	async importPackage(profileId: string, zipPath: string): Promise<IPaPublicationResult> {
		const stagingPath = path.resolve(this.packagesRoot, '.imports', generateUuid());
		assertWithinRoot(this.packagesRoot, stagingPath);
		try {
			await extractPackageZip(zipPath, stagingPath);
			const manifestPath = path.join(stagingPath, PA_PACKAGE_MANIFEST_PATH);
			const manifest = PaManifestSchema.parse(JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')));
			const files = await collectDraftFiles(stagingPath);
			return await this.publish(profileId, {
				manifest: {
					...manifest,
					publication: {
						...manifest.publication,
						profileId,
						updatedAt: new Date().toISOString()
					}
				},
				files,
				evidence: {
					permissionsConfirmed: true,
					trialRunPassed: true,
					sourcesRecorded: true,
					finalConfirmationId: generateUuid(),
					changeSummary: 'Imported local PA package.'
				}
			});
		} finally {
			await fs.promises.rm(stagingPath, { recursive: true, force: true });
		}
	}

	private async writeDraft(stagingPath: string, draft: IPaPackageDraft): Promise<void> {
		await fs.promises.writeFile(path.join(stagingPath, PA_PACKAGE_MANIFEST_PATH), JSON.stringify(draft.manifest, null, '\t'), 'utf8');
		for (const [relativePath, content] of Object.entries(draft.files)) {
			const normalized = normalizePackagePath(relativePath);
			const target = path.resolve(stagingPath, normalized);
			assertWithinRoot(stagingPath, target);
			await fs.promises.mkdir(path.dirname(target), { recursive: true });
			await fs.promises.writeFile(target, content, 'utf8');
		}
	}
}

function galleryItem(manifest: PaManifest): IPaGalleryItem {
	return {
		id: manifest.id,
		kind: manifest.kind === 'pa' ? PaArtifactKind.Pa : PaArtifactKind.Skill,
		name: manifest.name,
		description: manifest.description,
		iconId: manifest.icon,
		version: manifest.version,
		status: PaPublicationStatus.Published,
		updatedAt: manifest.publication.updatedAt,
		primaryActionId: manifest.id === 'builtin.pa-creator' || manifest.name.trim().toLocaleLowerCase() === 'pa creator'
			? CREATE_PA_ACTION_ID
			: manifest.kind === 'pa' ? OPEN_PA_ACTION_ID : undefined
	};
}

function check(id: IPaReleaseCheckResult['id'], messages: readonly string[]): IPaReleaseCheckResult {
	return { id, passed: messages.length === 0, messages };
}

function normalizePackagePath(value: string): string {
	const normalized = value.replace(/\\/g, '/').replace(/^\.\/+/, '');
	if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || normalized === PA_PACKAGE_MANIFEST_PATH) {
		throw new Error(`Unsafe or reserved PA package path '${value}'.`);
	}
	return normalized;
}

function assertWithinRoot(root: string, target: string): void {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`PA package path escapes its root: '${target}'.`);
	}
}

async function exists(target: string): Promise<boolean> {
	try {
		await fs.promises.access(target);
		return true;
	} catch {
		return false;
	}
}

async function collectZipFiles(root: string): Promise<IFile[]> {
	const files: IFile[] = [];
	for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
		const absolute = path.join(root, entry.name);
		if (entry.isDirectory()) {
			const nested = await collectZipFiles(absolute);
			files.push(...nested.map(file => ({ ...file, path: `${entry.name}/${file.path}` })));
		} else if (entry.isFile()) {
			files.push({ path: entry.name, localPath: absolute });
		}
	}
	return files;
}

async function collectDraftFiles(root: string): Promise<Record<string, string>> {
	const files: Record<string, string> = {};
	for (const file of await collectZipFiles(root)) {
		if (file.path !== PA_PACKAGE_MANIFEST_PATH && file.localPath) {
			files[file.path] = await fs.promises.readFile(file.localPath, 'utf8');
		}
	}
	return files;
}

async function extractPackageZip(zipPath: string, targetRoot: string): Promise<void> {
	await fs.promises.rm(targetRoot, { recursive: true, force: true });
	await fs.promises.mkdir(targetRoot, { recursive: true });
	const { open } = await import('yauzl');
	const zipFile = await new Promise<ZipFile>((resolve, reject) => {
		open(zipPath, { lazyEntries: true }, (error, value) => error || !value ? reject(error) : resolve(value));
	});
	await new Promise<void>((resolve, reject) => {
		let failed = false;
		const fail = (error: unknown) => {
			if (!failed) {
				failed = true;
				zipFile.close();
				reject(error);
			}
		};
		zipFile.on('error', fail);
		zipFile.on('close', () => {
			if (!failed) {
				resolve();
			}
		});
		zipFile.on('entry', (entry: Entry) => {
			void extractPackageEntry(zipFile, entry, targetRoot).then(
				() => zipFile.readEntry(),
				fail
			);
		});
		zipFile.readEntry();
	});
}

async function extractPackageEntry(zipFile: ZipFile, entry: Entry, targetRoot: string): Promise<void> {
	const relativePath = entry.fileName.replace(/\\/g, '/');
	if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
		throw new Error(`Unsafe ZIP entry '${entry.fileName}'.`);
	}
	const target = path.resolve(targetRoot, relativePath);
	assertWithinRoot(targetRoot, target);
	if (relativePath.endsWith('/')) {
		await fs.promises.mkdir(target, { recursive: true });
		return;
	}
	await fs.promises.mkdir(path.dirname(target), { recursive: true });
	const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
		zipFile.openReadStream(entry, (error, value) => error || !value ? reject(error) : resolve(value));
	});
	await new Promise<void>((resolve, reject) => {
		const output = fs.createWriteStream(target, { flags: 'wx' });
		stream.once('error', reject);
		output.once('error', reject);
		output.once('finish', resolve);
		stream.pipe(output);
	});
}
