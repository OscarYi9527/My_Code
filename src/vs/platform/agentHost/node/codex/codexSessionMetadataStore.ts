/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { ICodexRecoveryRecord, META_CODEX_RECOVERY_REQUIRED } from '../../common/agentHostRecovery.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

/**
 * Per-session bookkeeping codex needs to persist across agent host
 * restarts. The fundamental tension this store resolves: codex's
 * `thread/start` mints the canonical thread id server-side, but the
 * workbench owns the chat session URI and refuses to accept a different
 * one back from `createSession`. We therefore keep a stable mapping
 * `workbench session URI ↔ codex thread id` here so restored sessions
 * can be resumed without leaking duplicate sidebar entries.
 *
 * Layout (per-session SQLite DB, opened via {@link ISessionDataService}):
 *   `codex.threadId` — the codex app-server thread id assigned at
 *                      materialize time.
 *   `codex.cwd`      — absolute path to the working directory the
 *                      session was created against (URI string).
 *   `codex.model`    — serialized {@link ModelSelection.id} string,
 *                      remembered for restore so resumed sessions reuse
 *                      the model picked during the prior process.
 */

export interface ICodexSessionOverlay {
	readonly threadId?: string;
	readonly cwd?: URI;
	readonly modelId?: string;
}

export interface ICodexSessionOverlayUpdate {
	readonly threadId?: string;
	readonly cwd?: URI;
	readonly modelId?: string;
}

export interface ICodexRecoveryContext {
	readonly recovery?: ICodexRecoveryRecord;
	readonly toolStates: readonly {
		readonly toolName: string;
		readonly displayName: string;
		readonly state: string;
	}[];
}

export class CodexSessionMetadataStore {

	private static readonly KEY_THREAD_ID = 'codex.threadId';
	private static readonly KEY_CWD = 'codex.cwd';
	private static readonly KEY_MODEL = 'codex.model';

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Persist the supplied overlay fields. Only-write-on-defined.
	 * Best-effort: failures are logged and swallowed because the caller
	 * has already committed in-memory state and a corrupt DB shouldn't
	 * abort the current turn.
	 */
	async write(session: URI, fields: ICodexSessionOverlayUpdate): Promise<void> {
		try {
			const ref = this._sessionDataService.openDatabase(session);
			const db = ref.object;
			try {
				const work: Promise<void>[] = [];
				if (fields.threadId !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_THREAD_ID, fields.threadId));
				}
				if (fields.cwd !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_CWD, fields.cwd.toString()));
				}
				if (fields.modelId !== undefined) {
					work.push(db.setMetadata(CodexSessionMetadataStore.KEY_MODEL, fields.modelId));
				}
				await Promise.all(work);
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] metadata write failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Read overlay fields for `session`. Returns `{}` when no DB has
	 * been created yet (fresh session, or external codex CLI thread the
	 * workbench has never touched).
	 */
	async read(session: URI): Promise<ICodexSessionOverlay> {
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			if (!ref) {
				return {};
			}
			try {
				const [threadId, cwdRaw, modelId] = await Promise.all([
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_THREAD_ID),
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_CWD),
					ref.object.getMetadata(CodexSessionMetadataStore.KEY_MODEL),
				]);
				return {
					threadId: threadId ?? undefined,
					cwd: cwdRaw ? URI.parse(cwdRaw) : undefined,
					modelId: modelId ?? undefined,
				};
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] metadata read failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return {};
		}
	}

	/**
	 * Records the turn that needs a conservative recovery check. This is kept
	 * separately from the Codex transcript so it survives an Agent Host restart
	 * without storing the user's prompt or tool output.
	 */
	async writeRecovery(session: URI, recovery: ICodexRecoveryRecord): Promise<void> {
		try {
			const ref = this._sessionDataService.openDatabase(session);
			try {
				await ref.object.setMetadata(META_CODEX_RECOVERY_REQUIRED, JSON.stringify(recovery));
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] recovery metadata write failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Consumes the compact recovery data needed to construct a new diagnostic
	 * turn. Tool inputs and outputs are intentionally excluded: only names and
	 * terminal states are supplied to the model.
	 */
	async consumeRecoveryContext(session: URI): Promise<ICodexRecoveryContext> {
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			if (!ref) {
				return { toolStates: [] };
			}
			try {
				const rawRecovery = await ref.object.getMetadata(META_CODEX_RECOVERY_REQUIRED);
				const recovery = parseRecoveryRecord(rawRecovery);
				if (rawRecovery) {
					await ref.object.setMetadata(META_CODEX_RECOVERY_REQUIRED, '');
				}

				const rawExecutions = await ref.object.getMetadata('turn.executionRecords');
				return {
					recovery,
					toolStates: recovery ? parseToolStates(rawExecutions, recovery.turnId) : [],
				};
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[Codex] recovery metadata read failed for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return { toolStates: [] };
		}
	}
}

function parseRecoveryRecord(raw: string | undefined): ICodexRecoveryRecord | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const candidate = JSON.parse(raw) as Partial<ICodexRecoveryRecord>;
		if (typeof candidate.turnId === 'string' && typeof candidate.cause === 'string' && typeof candidate.recordedAt === 'number') {
			return { turnId: candidate.turnId, cause: candidate.cause, recordedAt: candidate.recordedAt };
		}
	} catch {
		// Ignore malformed stale metadata and continue safely without it.
	}
	return undefined;
}

function parseToolStates(raw: string | undefined, turnId: string): ICodexRecoveryContext['toolStates'] {
	if (!raw) {
		return [];
	}
	try {
		const records = JSON.parse(raw) as unknown[];
		if (!Array.isArray(records)) {
			return [];
		}
		return records.flatMap(record => {
			if (!record || typeof record !== 'object') {
				return [];
			}
			const value = record as { turnId?: unknown; toolName?: unknown; displayName?: unknown; state?: unknown };
			if (value.turnId !== turnId || typeof value.toolName !== 'string' || typeof value.displayName !== 'string' || typeof value.state !== 'string') {
				return [];
			}
			return [{ toolName: value.toolName, displayName: value.displayName, state: value.state }];
		});
	} catch {
		return [];
	}
}
