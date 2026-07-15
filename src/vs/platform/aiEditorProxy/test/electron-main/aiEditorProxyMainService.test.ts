/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { AiEditorProxyLifecycleState, type IAiEditorProxyStatus } from '../../common/aiEditorProxy.js';
import { AiEditorProxyMainService } from '../../electron-main/aiEditorProxyMainService.js';

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
