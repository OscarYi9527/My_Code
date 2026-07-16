/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorAccountState,
	AiEditorManagementRoute,
	createAiEditorTurnGateResult,
	IAiEditorAccountTransport,
	IAiEditorSafeStatus
} from '../../common/aiEditorAccount.js';
import { AiEditorAccountRendererServiceCore } from '../../electron-browser/aiEditorAccountServiceCore.js';

suite('AI Editor Account renderer service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes at startup and every 30 seconds only while active', async () => {
		let statusCalls = 0;
		let active = false;
		let timerCallback: (() => void) | undefined;
		let openedRoute: AiEditorManagementRoute | undefined;
		const transport = createTransport({
			getStatus: async () => {
				statusCalls++;
				return readyStatus(statusCalls);
			}
		});
		const service = store.add(new AiEditorAccountRendererServiceCore({
			transport,
			openManagement: async route => { openedRoute = route; },
			isActive: () => active,
			setRefreshInterval: callback => {
				timerCallback = callback;
				return 1;
			},
			clearRefreshInterval: () => undefined
		}));

		await service.getStatus();
		assert.strictEqual(statusCalls, 1);
		timerCallback?.();
		await timeout(0);
		assert.strictEqual(statusCalls, 1);

		active = true;
		timerCallback?.();
		await timeout(0);
		assert.strictEqual(statusCalls, 2);

		await service.openAccountManagement(AiEditorManagementRoute.Security);
		assert.strictEqual(openedRoute, AiEditorManagementRoute.Security);
	});

	test('fails a new Turn closed when main-process IPC is unavailable', async () => {
		const service = store.add(new AiEditorAccountRendererServiceCore({
			transport: createTransport({
				canStartTurn: async () => {
					throw new Error('unsafe IPC details');
				}
			}),
			openManagement: async () => undefined,
			setRefreshInterval: () => 1,
			clearRefreshInterval: () => undefined
		}));

		await service.getStatus();
		const result = await service.canStartTurn({
			modelId: 'mock-gpt',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(result.allowed, false);
		assert.strictEqual(result.status.state, AiEditorAccountState.ServiceUnavailable);
		assert.strictEqual(result.status.errorId, 'account_ipc_unavailable');
	});
});

function createTransport(overrides: Partial<IAiEditorAccountTransport> = {}): IAiEditorAccountTransport {
	return {
		onDidChangeStatus: Event.None,
		getStatus: async () => readyStatus(1),
		login: async () => readyStatus(1),
		logout: async () => undefined,
		canStartTurn: async () => createAiEditorTurnGateResult(readyStatus(1)),
		retryStatus: async () => readyStatus(1),
		requestWebviewTicket: async () => ({ ticket: 'ticket', expiresIn: 60 }),
		...overrides
	};
}

function readyStatus(checkedAt: number): IAiEditorSafeStatus {
	return {
		state: AiEditorAccountState.Ready,
		checkedAt,
		actions: []
	};
}
