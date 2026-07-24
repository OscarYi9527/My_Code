/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AI_EDITOR_ACCOUNT_HTTP_REQUEST_TIMEOUT,
	AI_EDITOR_ACCOUNT_TURN_GATE_TIMEOUT,
	AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
	AiEditorAccountState,
	AiEditorManagementRoute,
	createAiEditorAccountUnavailableStatus,
	IAiEditorSafeStatus
} from '../../common/aiEditorAccount.js';
import {
	AiEditorAccountHttpError,
	IAiEditorAccountHttpClient
} from '../../electron-main/aiEditorAccountHttpClient.js';
import {
	AiEditorAccountMainServiceCore,
	disposeAiEditorManagementView,
	performAiEditorAccountLogin,
	prepareAiEditorManagementView,
	validateAiEditorCurrentCodexAuthJson
} from '../../electron-main/aiEditorAccountMainService.js';
import { AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL } from '../../electron-main/gatewayOriginPolicy.js';

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

	test('blocks a new Turn with a stable state after the Edge process exits', async () => {
		const service = store.add(new AiEditorAccountMainServiceCore({
			client: createClient({
				getStatus: async () => {
					throw new AiEditorAccountHttpError('account_edge_unreachable');
				}
			}),
			login: async () => readyStatus(),
			now: () => 100
		}));

		const result = await service.canStartTurn({
			modelId: 'mock-gpt',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(result.allowed, false);
		assert.strictEqual(result.status.state, AiEditorAccountState.ServiceUnavailable);
		assert.strictEqual(result.status.errorId, 'account_edge_unreachable');
	});

	test('allows a slow but healthy status response within the Turn gate deadline', async () => {
		const service = store.add(new AiEditorAccountMainServiceCore({
			client: createClient({
				getStatus: async () => {
					await new Promise(resolve => setTimeout(resolve, 10));
					return readyStatus();
				}
			}),
			login: async () => readyStatus(),
			turnGateTimeoutMs: 50
		}));

		const result = await service.canStartTurn({
			modelId: 'mock-gpt',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(result.allowed, true);
		assert.strictEqual(result.status.state, AiEditorAccountState.Ready);
	});

	test('fails closed only after the configured Turn gate deadline', async () => {
		const service = store.add(new AiEditorAccountMainServiceCore({
			client: createClient({
				getStatus: () => new Promise<IAiEditorSafeStatus>(() => undefined)
			}),
			login: async () => readyStatus(),
			turnGateTimeoutMs: 10,
			now: () => 100
		}));

		const result = await service.canStartTurn({
			modelId: 'mock-gpt',
			sessionId: 'session',
			clientTurnId: 'turn'
		});
		assert.strictEqual(result.allowed, false);
		assert.strictEqual(result.status.errorId, 'account_turn_gate_timeout');
	});

	test('keeps the production Turn gate above the account request timeout', () => {
		assert.ok(AI_EDITOR_ACCOUNT_TURN_GATE_TIMEOUT >= AI_EDITOR_ACCOUNT_HTTP_REQUEST_TIMEOUT * 2 + 1_000);
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

	test('refreshes safe status after a no-content logout', async () => {
		const calls: string[] = [];
		const service = store.add(new AiEditorAccountMainServiceCore({
			client: createClient({
				logout: async () => { calls.push('logout'); },
				getStatus: async () => {
					calls.push('status');
					return createAiEditorAccountUnavailableStatus(AiEditorAccountState.LoginRequired, 2);
				}
			}),
			login: async () => readyStatus()
		}));

		await service.logout();

		assert.deepStrictEqual(calls, ['logout', 'status']);
		assert.strictEqual((await service.getStatus()).state, AiEditorAccountState.LoginRequired);
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
			},
			getStatus: async () => {
				calls.push('status');
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
			'handoff-complete:login-state:handoff:device-session',
			'status'
		]);
		assert.strictEqual(callbackDisposed, true);
	});

	test('injects the one-time management ticket from the main process without placing it in the URL', async () => {
		let currentUrl = 'about:blank';
		let injectedCode = '';
		let ticketCalls = 0;
		let destroyedListener: (() => void) | undefined;
		const webContents = {
			isDestroyed: () => false,
			getURL: () => currentUrl,
			executeJavaScriptInIsolatedWorld: async (_worldId: number, scripts: readonly { readonly code: string }[]) => {
				injectedCode = scripts[0].code;
			},
			on: () => undefined,
			once: (event: string, listener: () => void) => {
				if (event === 'destroyed') {
					destroyedListener = listener;
				}
			},
			removeListener: () => undefined,
			removeAllListeners: () => undefined,
			setWindowOpenHandler: () => undefined,
			session: {
				on: () => undefined,
				removeListener: () => undefined
			}
		} as unknown as Electron.WebContents;
		const view = {
			webContents,
			loadURL: async (url: string) => { currentUrl = url; }
		};

		await prepareAiEditorManagementView({
			viewId: AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			route: AiEditorManagementRoute.Account,
			gatewayOrigin: 'http://127.0.0.1:47920',
			client: {
				requestWebviewTicket: async () => {
					ticketCalls++;
					return { ticket: 'one-time-secret', expiresIn: 60 };
				}
			},
			browserViewMainService: {
				tryGetBrowserView: () => view
			},
			openExternal: async () => undefined
		});

		assert.strictEqual(new URL(currentUrl).search, '');
		assert.ok(!currentUrl.includes('one-time-secret'));
		assert.ok(injectedCode.includes('one-time-secret'));
		assert.ok(injectedCode.includes('ai-editor-management-bootstrap'));
		assert.ok(injectedCode.includes('"surface":"embedded"'));

		await prepareAiEditorManagementView({
			viewId: AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			route: AiEditorManagementRoute.Security,
			gatewayOrigin: 'http://127.0.0.1:47920',
			client: {
				requestWebviewTicket: async () => {
					ticketCalls++;
					return { ticket: 'unused', expiresIn: 60 };
				}
			},
			browserViewMainService: {
				tryGetBrowserView: () => view
			},
			openExternal: async () => undefined
		});
		assert.strictEqual(ticketCalls, 1);
		assert.strictEqual(new URL(currentUrl).hash, '#security');

		await disposeAiEditorManagementView(
			AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			'http://127.0.0.1:47920',
			{ tryGetBrowserView: () => view }
		);
		assert.match(injectedCode, /method: 'DELETE'/);
		assert.ok(injectedCode.includes('/api/v1/webview/session'));
		destroyedListener?.();
	});

	test('requests a fresh management ticket after the initial bootstrap fails', async () => {
		let currentUrl = 'about:blank';
		let ticketCalls = 0;
		let injectedCode = '';
		const webContents = {
			isDestroyed: () => false,
			getURL: () => currentUrl,
			executeJavaScriptInIsolatedWorld: async (_worldId: number, scripts: readonly { readonly code: string }[]) => {
				injectedCode = scripts[0].code;
			},
			on: () => undefined,
			once: () => undefined,
			removeListener: () => undefined,
			removeAllListeners: () => undefined,
			setWindowOpenHandler: () => undefined,
			session: {
				on: () => undefined,
				removeListener: () => undefined
			}
		} as unknown as Electron.WebContents;
		const view = {
			webContents,
			loadURL: async (url: string) => { currentUrl = url; }
		};
		const options = {
			viewId: AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			route: AiEditorManagementRoute.Security,
			gatewayOrigin: 'https://gateway.example.com',
			client: {
				requestWebviewTicket: async () => {
					ticketCalls++;
					if (ticketCalls === 1) {
						throw new AiEditorAccountHttpError('account_edge_unreachable');
					}
					return { ticket: 'retry-ticket', expiresIn: 60 };
				}
			},
			browserViewMainService: {
				tryGetBrowserView: () => view
			},
			openExternal: async () => undefined
		};

		await assert.rejects(
			prepareAiEditorManagementView(options),
			(error: unknown) => error instanceof AiEditorAccountHttpError &&
				error.errorId === 'account_edge_unreachable'
		);
		assert.strictEqual(new URL(currentUrl).origin, 'https://gateway.example.com');

		await prepareAiEditorManagementView(options);
		assert.strictEqual(ticketCalls, 2);
		assert.ok(injectedCode.includes('retry-ticket'));
		assert.ok(injectedCode.includes('ai-editor-management-bootstrap'));

		await disposeAiEditorManagementView(
			AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			'https://gateway.example.com',
			{ tryGetBrowserView: () => view }
		);
	});

	test('validates the minimum Codex auth.json shape before native import', () => {
		const valid = validateAiEditorCurrentCodexAuthJson(JSON.stringify({
			tokens: {
				access_token: 'access-secret',
				refresh_token: 'refresh-secret',
				account_id: 'account-id'
			}
		}));
		assert.deepStrictEqual(JSON.parse(valid), {
			tokens: {
				access_token: 'access-secret',
				refresh_token: 'refresh-secret',
				account_id: 'account-id'
			}
		});
		assert.throws(
			() => validateAiEditorCurrentCodexAuthJson(JSON.stringify({
				tokens: { access_token: 'access-only' }
			})),
			(error: unknown) => error instanceof AiEditorAccountHttpError &&
				error.errorId === 'current_codex_auth_invalid'
		);
	});

	test('handles the exact native import action only from the trusted management document', async () => {
		let currentUrl = 'about:blank';
		let navigate: ((event: { preventDefault(): void }, url: string) => void) | undefined;
		const injectedCode: string[] = [];
		let importCalls = 0;
		let ticketCalls = 0;
		const externalUrls: string[] = [];
		const webContents = {
			isDestroyed: () => false,
			getURL: () => currentUrl,
			executeJavaScriptInIsolatedWorld: async (_worldId: number, scripts: readonly { readonly code: string }[]) => {
				injectedCode.push(scripts[0].code);
			},
			on: (event: string, listener: (event: { preventDefault(): void }, url: string) => void) => {
				if (event === 'will-navigate') {
					navigate = listener;
				}
			},
			once: () => undefined,
			removeListener: () => undefined,
			removeAllListeners: () => undefined,
			setWindowOpenHandler: () => undefined,
			session: {
				on: () => undefined,
				removeListener: () => undefined
			}
		} as unknown as Electron.WebContents;
		const view = {
			webContents,
			loadURL: async (url: string) => { currentUrl = url; }
		};
		await prepareAiEditorManagementView({
			viewId: AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			route: AiEditorManagementRoute.Providers,
			gatewayOrigin: 'http://127.0.0.1:47920',
			client: {
				requestWebviewTicket: async () => ({
					ticket: `one-time-management-ticket-${++ticketCalls}`,
					expiresIn: 60
				})
			},
			browserViewMainService: {
				tryGetBrowserView: () => view
			},
			openExternal: async url => { externalUrls.push(url); },
			importCurrentCodexAccount: async () => {
				importCalls++;
				return {
					authJson: JSON.stringify({
						tokens: {
							access_token: 'native-access-secret',
							refresh_token: 'native-refresh-secret',
							account_id: 'native-account-id'
						}
					})
				};
			}
		});

		let prevented = false;
		navigate?.({ preventDefault: () => { prevented = true; } }, AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(prevented, true);
		assert.strictEqual(importCalls, 1);
		assert.ok(injectedCode.at(-1)?.includes('ai-editor-current-codex-auth'));
		assert.ok(injectedCode.at(-1)?.includes('native-access-secret'));
		assert.ok(!currentUrl.includes('native-access-secret'));

		navigate?.(
			{ preventDefault: () => { prevented = true; } },
			'ai-editor-code://open-full-management?route=providers'
		);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(ticketCalls, 2);
		assert.strictEqual(externalUrls.length, 1);
		const external = new URL(externalUrls[0]);
		assert.strictEqual(external.origin, 'http://127.0.0.1:47920');
		assert.strictEqual(external.pathname, '/admin');
		assert.strictEqual(external.search, '');
		assert.ok(external.hash.includes('one-time-management-ticket-2'));
		assert.ok(external.hash.includes('route=providers'));

		currentUrl = 'about:blank';
		navigate?.({ preventDefault: () => undefined }, AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL);
		navigate?.({ preventDefault: () => undefined }, 'ai-editor-code://open-full-management?route=providers');
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(importCalls, 1);
		assert.strictEqual(ticketCalls, 2);

		await disposeAiEditorManagementView(
			AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
			'http://127.0.0.1:47920',
			{ tryGetBrowserView: () => view }
		);
	});
});

function createClient(overrides: Partial<IAiEditorAccountHttpClient> = {}): IAiEditorAccountHttpClient {
	return {
		getStatus: async () => createAiEditorAccountUnavailableStatus(AiEditorAccountState.LoginRequired, 1),
		retryStatus: async () => readyStatus(),
		logout: async () => { },
		requestWebviewTicket: async () => ({ ticket: 'ticket', expiresIn: 60 }),
		startHandoff: async () => ({ handoffId: 'handoff', nonce: 'nonce', expiresIn: 60 }),
		completeHandoff: async () => { },
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
