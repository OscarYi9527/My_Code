/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { type IEncryptionMainService, KnownStorageProvider } from '../../../encryption/common/encryptionService.js';
import type { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AiEditorEdgeRuntimeService } from '../../electron-main/aiEditorEdgeRuntimeService.js';

function encryptionService(): IEncryptionMainService {
	return {
		_serviceBrand: undefined,
		encrypt: async value => JSON.stringify({
			data: Buffer.from(value, 'utf8').reverse().toString('base64')
		}),
		decrypt: async value => {
			const parsed = JSON.parse(value) as { readonly data: string };
			return Buffer.from(parsed.data, 'base64').reverse().toString('utf8');
		},
		isEncryptionAvailable: async () => true,
		setUsePlainTextEncryption: async () => undefined,
		getKeyStorageProvider: async () => KnownStorageProvider.unknown
	};
}

suite('AiEditorEdgeRuntimeService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let root: string;

	setup(async () => {
		root = await mkdtemp(join(tmpdir(), 'ai-editor-edge-runtime-'));
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('persists only encrypted local authorization and restores it for the next Code process', async () => {
		const environment = { userDataPath: root } as IEnvironmentMainService;
		const first = new AiEditorEdgeRuntimeService(environment, encryptionService(), new NullLogService());
		const nonce = await first.getOrCreateLocalNonce();

		assert.ok(Buffer.byteLength(nonce, 'utf8') >= 32);
		const envelopePath = join(first.dataRoot, 'local-authorization.encrypted.json');
		const onDisk = await readFile(envelopePath, 'utf8');
		assert.ok(!onDisk.includes(nonce));

		const restarted = new AiEditorEdgeRuntimeService(environment, encryptionService(), new NullLogService());
		assert.strictEqual(await restarted.getLocalNonce(), nonce);
		assert.strictEqual(await restarted.getOrCreateLocalNonce(), nonce);
	});

	test('serializes an initial read with local authorization creation', async () => {
		const environment = { userDataPath: root } as IEnvironmentMainService;
		const service = new AiEditorEdgeRuntimeService(environment, encryptionService(), new NullLogService());

		const [initial, created] = await Promise.all([
			service.getLocalNonce(),
			service.getOrCreateLocalNonce()
		]);

		assert.strictEqual(initial, undefined);
		assert.ok(Buffer.byteLength(created, 'utf8') >= 32);
		assert.strictEqual(await service.getLocalNonce(), created);
	});

	test('fails closed and removes a malformed encrypted authorization envelope', async () => {
		const environment = { userDataPath: root } as IEnvironmentMainService;
		const service = new AiEditorEdgeRuntimeService(environment, encryptionService(), new NullLogService());
		await service.getOrCreateLocalNonce();
		const envelopePath = join(service.dataRoot, 'local-authorization.encrypted.json');
		await writeFile(envelopePath, '{"version":1,"type":"wrong"}\n', 'utf8');

		const restarted = new AiEditorEdgeRuntimeService(environment, encryptionService(), new NullLogService());
		assert.strictEqual(await restarted.getLocalNonce(), undefined);
	});
});
