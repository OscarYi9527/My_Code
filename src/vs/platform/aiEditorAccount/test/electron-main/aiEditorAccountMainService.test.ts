/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorAccountState,
	createAiEditorAccountUnavailableStatus,
	IAiEditorSafeStatus
} from '../../common/aiEditorAccount.js';
import {
	AiEditorAccountHttpError,
	IAiEditorAccountHttpClient
} from '../../electron-main/aiEditorAccountHttpClient.js';
import {
	AiEditorAccountMainServiceCore,
	performAiEditorAccountLogin
} from '../../electron-main/aiEditorAccountMainService.js';

suite('AI Editor Account main service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('coalesces concurrent forced status checks', async () => {
		const statusResult = new DeferredPromise<IAiEditorSafeStatus>();
		let statusCalls = 0;
		const client = createClient({
			getStatus: () => {
				statusCalls++;
				return statusResult.p;
			}
		});
		const service = store.add(new AiEditorAccountMainServiceCore({
			client,
			login: async () => readyStatus()
		}));

		const first = service.getStatus({ force: true });
		const second = service.getStatus({ force: true });
		assert.strictEqual(statusCalls, 1);

		statusResult.complete(readyStatus());
		assert.strictEqual((await first).state, AiEditorAccountState.Ready);
		assert.strictEqual(await second, await first);
	});

	test('fails closed for account errors and invalid Turn requests', async () => {
		const client = createClient({
			getStatus: async () => {
				throw new AiEditorAccountHttpError('account_disabled', 403);
			}
		});
		const service = store.add(new AiEditorAccountMainServiceCore({
			client,
			login: async () => readyStatus(),
			now: () => 100
		}));

		const disabled = await service.canStartTurn({
			modelId: 'mock-gpt',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(disabled.allowed, false);
		assert.strictEqual(disabled.status.state, AiEditorAccountState.AccountUnavailable);

		const invalid = await service.canStartTurn({
			modelId: '',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(invalid.allowed, false);
		assert.strictEqual(invalid.status.errorId, 'account_turn_gate_request_invalid');
	});

	test('coalesces duplicate login clicks', async () => {
		const loginResult = new DeferredPromise<IAiEditorSafeStatus>();
		let loginCalls = 0;
		const service = store.add(new AiEditorAccountMainServiceCore({
			client: createClient(),
			login: async () => {
				loginCalls++;
				return loginResult.p;
			}
		}));

		const first = service.login('login');
		const duplicate = service.login('register');
		assert.strictEqual(loginCalls, 1);
		loginResult.complete(readyStatus());
		assert.strictEqual(await first, await duplicate);
	});

	test('performs browser PKCE exchange before the one-time Edge handoff', async () => {
		const calls: string[] = [];
		let callbackDisposed = false;
		const client = createClient({
			createAuthorizationUrl: (pkce, redirectUri) => {
				calls.push(`authorize:${pkce.challenge}:${redirectUri}`);
				return 'http://gateway.test/authorize';
			},
			exchangeAuthorizationCode: async exchange => {
				calls.push(`exchange:${exchange.code}:${exchange.codeVerifier}`);
				return {
					accessToken: 'access-token',
					accessTokenExpiresIn: 300,
					refreshToken: 'refresh-token',
					deviceSessionId: 'device-session'
				};
			},
			startHandoff: async state => {
				calls.push(`handoff-start:${state}`);
				return { handoffId: 'handoff', nonce: 'nonce', expiresIn: 60 };
			},
			completeHandoff: async (state, grant, tokens) => {
				calls.push(`handoff-complete:${state}:${grant.handoffId}:${tokens.deviceSessionId}`);
				return readyStatus();
			}
		});

		const status = await performAiEditorAccountLogin('register', {
			client,
			createPkce: async () => ({ state: 'login-state', verifier: 'verifier', challenge: 'challenge' }),
			createCallback: async () => ({
				redirectUri: 'http://127.0.0.1:54321/callback',
				waitForResult: async () => ({ code: 'authorization-code' }),
				dispose: () => callbackDisposed = true
			}),
			openExternal: async url => { calls.push(`open:${url}`); },
			getDevice: async () => ({ name: 'Test Device', platform: 'windows' })
		});

		assert.strictEqual(status.state, AiEditorAccountState.Ready);
		assert.deepStrictEqual(calls, [
			'authorize:challenge:http://127.0.0.1:54321/callback',
			'open:http://gateway.test/authorize',
			'exchange:authorization-code:verifier',
			'handoff-start:login-state',
			'handoff-complete:login-state:handoff:device-session'
		]);
		assert.strictEqual(callbackDisposed, true);
	});
});

function createClient(overrides: Partial<IAiEditorAccountHttpClient> = {}): IAiEditorAccountHttpClient {
	return {
		getStatus: async () => createAiEditorAccountUnavailableStatus(AiEditorAccountState.LoginRequired, 1),
		retryStatus: async () => readyStatus(),
		logout: async () => createAiEditorAccountUnavailableStatus(AiEditorAccountState.LoginRequired, 1),
		requestWebviewTicket: async () => ({ ticket: 'ticket', expiresIn: 60 }),
		startHandoff: async () => ({ handoffId: 'handoff', nonce: 'nonce', expiresIn: 60 }),
		completeHandoff: async () => readyStatus(),
		createAuthorizationUrl: () => 'http://gateway.test/authorize',
		exchangeAuthorizationCode: async () => ({
			accessToken: 'access-token',
			accessTokenExpiresIn: 300,
			refreshToken: 'refresh-token',
			deviceSessionId: 'device-session'
		}),
		...overrides
	};
}

function readyStatus(): IAiEditorSafeStatus {
	return {
		state: AiEditorAccountState.Ready,
		checkedAt: 1,
		actions: []
	};
}
