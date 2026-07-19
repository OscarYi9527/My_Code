/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AiEditorProxyLifecycleState, type IAiEditorProxyStatus } from '../../common/aiEditorProxy.js';
import {
	AiEditorProxyMainService,
	createAiEditorStandaloneProxyEnvironment,
	parseAiEditorBundledProxyRuntimeManifest
} from '../../electron-main/aiEditorProxyMainService.js';

interface IRestartHarness {
	circuitOpen: boolean;
	operation: Promise<IAiEditorProxyStatus> | undefined;
	refreshStatus(): Promise<IAiEditorProxyStatus>;
	doEnsureRunning(): Promise<IAiEditorProxyStatus>;
	restart(): Promise<IAiEditorProxyStatus>;
}

function status(state: AiEditorProxyLifecycleState): IAiEditorProxyStatus {
	return {
		state,
		baseUrl: 'http://127.0.0.1:47892',
		restartAttempts: 0,
	};
}

function createRestartHarness(current: IAiEditorProxyStatus, recovered: IAiEditorProxyStatus): { readonly service: IRestartHarness; readonly calls: { refresh: number; ensure: number } } {
	const calls = { refresh: 0, ensure: 0 };
	const service = Object.create(AiEditorProxyMainService.prototype) as IRestartHarness;
	service.circuitOpen = true;
	service.operation = undefined;
	service.refreshStatus = async () => {
		calls.refresh++;
		return current;
	};
	service.doEnsureRunning = async () => {
		calls.ensure++;
		return recovered;
	};
	return { service, calls };
}

suite('AiEditorProxyMainService restart safety', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts only standalone and Edge product runtime manifests', () => {
		assert.deepStrictEqual(parseAiEditorBundledProxyRuntimeManifest(JSON.stringify({
			schemaVersion: 2,
			target: 'edge',
			entryPoint: 'src/launcher.js'
		})), {
			target: 'edge',
			entryPoint: 'src/launcher.js'
		});
		assert.deepStrictEqual(parseAiEditorBundledProxyRuntimeManifest(JSON.stringify({
			schemaVersion: 1,
			entryPoint: 'src/server.js'
		})), {
			target: 'legacy-standalone',
			entryPoint: 'src/server.js'
		});
		assert.throws(() => parseAiEditorBundledProxyRuntimeManifest(JSON.stringify({
			schemaVersion: 2,
			target: 'gateway',
			entryPoint: 'gateway/dist/server.js'
		})), /not an Edge or standalone product runtime/);
		assert.throws(() => parseAiEditorBundledProxyRuntimeManifest(JSON.stringify({
			schemaVersion: 2,
			target: 'edge',
			entryPoint: 'src/server.js'
		})), /entry point is invalid/);
	});

	test('keeps standalone runtime data outside the installed application resources', () => {
		const storageRoot = 'C:\\Users\\example\\AppData\\Roaming\\AI Editor\\proxy';

		assert.deepStrictEqual(
			createAiEditorStandaloneProxyEnvironment(new URL('http://localhost:48765'), storageRoot),
			{
				CODEX_PROXY_DATA_DIR: storageRoot,
				CODEX_PROXY_STORAGE_ROOT: storageRoot,
				CODEX_PROXY_HOST: '127.0.0.1',
				CODEX_PROXY_PORT: '48765'
			}
		);
	});

	test('reuses a healthy shared Proxy instead of invoking a forced restart', async () => {
		const ready = status(AiEditorProxyLifecycleState.Ready);
		const { service, calls } = createRestartHarness(ready, status(AiEditorProxyLifecycleState.Ready));

		assert.strictEqual(await service.restart(), ready);
		assert.deepStrictEqual(calls, { refresh: 1, ensure: 0 });
		assert.strictEqual(service.circuitOpen, false);
	});

	test('starts recovery only when the Proxy is no longer live', async () => {
		const stopped = status(AiEditorProxyLifecycleState.Stopped);
		const recovered = status(AiEditorProxyLifecycleState.Ready);
		const { service, calls } = createRestartHarness(stopped, recovered);

		assert.strictEqual(await service.restart(), recovered);
		assert.deepStrictEqual(calls, { refresh: 1, ensure: 1 });
		assert.strictEqual(service.circuitOpen, false);
	});
});
