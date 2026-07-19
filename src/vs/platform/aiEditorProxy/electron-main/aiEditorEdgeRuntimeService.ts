/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from '../../../base/common/path.js';
import { IEncryptionMainService } from '../../encryption/common/encryptionService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

const LOCAL_AUTHORIZATION_FILE = 'local-authorization.encrypted.json';
const LOCAL_AUTHORIZATION_TYPE = 'ai-editor-edge-local-authorization';

interface IAiEditorEdgeLocalAuthorizationEnvelope {
	readonly version: 1;
	readonly type: typeof LOCAL_AUTHORIZATION_TYPE;
	readonly encryptedNonce: string;
}

export const IAiEditorEdgeRuntimeService = createDecorator<IAiEditorEdgeRuntimeService>('aiEditorEdgeRuntimeService');

/**
 * Main-process-only state shared by the bundled Edge launcher and account
 * client. This service is deliberately not registered as an IPC channel.
 */
export interface IAiEditorEdgeRuntimeService {
	readonly _serviceBrand: undefined;
	readonly dataRoot: string;

	getLocalNonce(): Promise<string | undefined>;
	getOrCreateLocalNonce(): Promise<string>;
}

export class AiEditorEdgeRuntimeService implements IAiEditorEdgeRuntimeService {
	declare readonly _serviceBrand: undefined;

	readonly dataRoot: string;
	private readonly authorizationFile: string;
	private operation: Promise<string | undefined> | undefined;

	constructor(
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IEncryptionMainService private readonly encryptionMainService: IEncryptionMainService,
		@ILogService private readonly logService: ILogService
	) {
		this.dataRoot = join(environmentMainService.userDataPath, 'ai-editor-edge');
		this.authorizationFile = join(this.dataRoot, LOCAL_AUTHORIZATION_FILE);
	}

	getLocalNonce(): Promise<string | undefined> {
		return this.runExclusive(() => this.load());
	}

	getOrCreateLocalNonce(): Promise<string> {
		return this.runExclusive(async () => {
			const existing = await this.load();
			if (existing) {
				return existing;
			}
			if (!await this.encryptionMainService.isEncryptionAvailable()) {
				throw new Error('Secure product Edge authorization storage is unavailable.');
			}
			const nonce = randomBytes(32).toString('base64url');
			const encryptedNonce = await this.encryptionMainService.encrypt(nonce);
			const envelope: IAiEditorEdgeLocalAuthorizationEnvelope = {
				version: 1,
				type: LOCAL_AUTHORIZATION_TYPE,
				encryptedNonce
			};
			await mkdir(this.dataRoot, { recursive: true, mode: 0o700 });
			const temporary = `${this.authorizationFile}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(temporary, `${JSON.stringify(envelope)}\n`, {
				encoding: 'utf8',
				mode: 0o600,
				flag: 'wx'
			});
			await rename(temporary, this.authorizationFile);
			try {
				await chmod(this.authorizationFile, 0o600);
			} catch {
				// Windows protects the file through the user profile ACL.
			}
			return nonce;
		}).then(value => {
			if (!value) {
				throw new Error('Secure product Edge authorization could not be created.');
			}
			return value;
		});
	}

	private async load(): Promise<string | undefined> {
		let raw: string;
		try {
			raw = await readFile(this.authorizationFile, 'utf8');
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}
			throw error;
		}

		try {
			const envelope = JSON.parse(raw) as Partial<IAiEditorEdgeLocalAuthorizationEnvelope>;
			if (
				envelope.version !== 1 ||
				envelope.type !== LOCAL_AUTHORIZATION_TYPE ||
				typeof envelope.encryptedNonce !== 'string' ||
				!envelope.encryptedNonce
			) {
				throw new Error('invalid envelope');
			}
			const nonce = await this.encryptionMainService.decrypt(envelope.encryptedNonce);
			validateLocalNonce(nonce);
			return nonce;
		} catch {
			// A damaged or no-longer-decryptable authorization must never be
			// replaced with plaintext. Remove it so a stopped Edge can receive a
			// fresh encrypted authorization on the next safe start attempt.
			this.logService.warn('[aiEditorEdge] Secure local authorization is unavailable.');
			try {
				await rm(this.authorizationFile, { force: true });
			} catch {
				// A later start remains fail-closed if cleanup is unavailable.
			}
			return undefined;
		}
	}

	private runExclusive(operation: () => Promise<string | undefined>): Promise<string | undefined> {
		if (!this.operation) {
			this.operation = operation().finally(() => this.operation = undefined);
		}
		return this.operation;
	}
}

function validateLocalNonce(value: string): void {
	const bytes = Buffer.byteLength(value, 'utf8');
	if (bytes < 32 || bytes > 4096 || /[\r\n]/.test(value)) {
		throw new Error('invalid local authorization');
	}
}

function isFileNotFound(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}
