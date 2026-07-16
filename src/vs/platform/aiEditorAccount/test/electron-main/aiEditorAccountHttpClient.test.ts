/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as http from 'http';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AiEditorAccountState } from '../../common/aiEditorAccount.js';
import {
	AiEditorAccountHttpClient,
	AiEditorAccountHttpError
} from '../../electron-main/aiEditorAccountHttpClient.js';

suite('AI Editor Account HTTP client', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let origin: string;
	let server: http.Server;
	let requests: Array<{ readonly path: string; readonly body: Record<string, unknown> }>;
	let statusFailure = false;

	setup(async () => {
		requests = [];
		statusFailure = false;
		const httpModule = await import('http');
		server = httpModule.createServer(async (request, response) => {
			const body = await readBody(request);
			requests.push({ path: request.url ?? '/', body });

			if (request.url === '/ai-editor/status') {
				if (statusFailure) {
					return sendJson(response, 502, {
						error: {
							code: 'provider_unavailable',
							message: 'secret upstream route details'
						}
					});
				}
				return sendJson(response, 200, safeStatus('login_required'));
			}
			if (request.url === '/ai-editor/status/retry') {
				return sendJson(response, 200, safeStatus('ready'));
			}
			if (request.url === '/ai-editor/handoff/start') {
				return sendJson(response, 200, { handoffId: 'lh_test', nonce: 'nonce_test', expiresIn: 60 });
			}
			if (request.url === '/ai-editor/handoff/complete') {
				return sendJson(response, 200, safeStatus('ready'));
			}
			if (request.url === '/ai-editor/webview-ticket') {
				return sendJson(response, 200, { ticket: 'wvt_test', expiresIn: 60 });
			}
			if (request.url === '/ai-editor/logout') {
				return sendJson(response, 200, safeStatus('login_required'));
			}
			if (request.url === '/api/v1/oauth/token') {
				return sendJson(response, 200, {
					accessToken: 'access-token',
					accessTokenExpiresIn: 300,
					refreshToken: 'refresh-token',
					deviceSessionId: 'device-session'
				});
			}
			return sendJson(response, 404, { error: { code: 'not_found' } });
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		assert.ok(address && typeof address === 'object');
		origin = `http://127.0.0.1:${address.port}`;
	});

	teardown(async () => {
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	test('implements status, PKCE exchange, handoff, ticket and logout contracts', async () => {
		const client = new AiEditorAccountHttpClient(origin, origin);

		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.LoginRequired);
		assert.strictEqual((await client.retryStatus()).state, AiEditorAccountState.Ready);

		const authorizationUrl = new URL(client.createAuthorizationUrl({
			state: 'login-state',
			verifier: 'verifier-secret',
			challenge: 'challenge'
		}, 'http://127.0.0.1:54321/callback'));
		assert.strictEqual(authorizationUrl.pathname, '/api/v1/oauth/authorize');
		assert.strictEqual(authorizationUrl.searchParams.get('client_id'), 'ai-editor-code');
		assert.strictEqual(authorizationUrl.searchParams.get('code_challenge'), 'challenge');
		assert.strictEqual(authorizationUrl.searchParams.has('code_verifier'), false);

		const tokens = await client.exchangeAuthorizationCode({
			code: 'authorization-code',
			codeVerifier: 'verifier-secret',
			redirectUri: 'http://127.0.0.1:54321/callback',
			deviceName: 'Test Device',
			platform: 'windows'
		});
		const grant = await client.startHandoff('login-state');
		assert.strictEqual((await client.completeHandoff('login-state', grant, tokens)).state, AiEditorAccountState.Ready);
		assert.deepStrictEqual(await client.requestWebviewTicket(), { ticket: 'wvt_test', expiresIn: 60 });
		assert.strictEqual((await client.logout()).state, AiEditorAccountState.LoginRequired);

		const exchange = requests.find(request => request.path === '/api/v1/oauth/token');
		assert.deepStrictEqual(exchange?.body, {
			grantType: 'authorization_code',
			clientId: 'ai-editor-code',
			code: 'authorization-code',
			codeVerifier: 'verifier-secret',
			redirectUri: 'http://127.0.0.1:54321/callback',
			device: {
				name: 'Test Device',
				platform: 'windows'
			}
		});
		const completion = requests.find(request => request.path === '/ai-editor/handoff/complete');
		assert.deepStrictEqual(completion?.body, {
			handoffId: 'lh_test',
			nonce: 'nonce_test',
			state: 'login-state',
			deviceSessionId: 'device-session',
			refreshToken: 'refresh-token',
			accessToken: 'access-token',
			accessTokenExpiresIn: 300
		});
	});

	test('exposes only a stable server error code', async () => {
		statusFailure = true;
		const client = new AiEditorAccountHttpClient(origin, origin);
		await assert.rejects(client.getStatus(), error =>
			error instanceof AiEditorAccountHttpError &&
			error.errorId === 'provider_unavailable' &&
			!error.message.includes('secret upstream')
		);
	});
});

function safeStatus(state: 'ready' | 'login_required'): object {
	return {
		state,
		checkedAt: '2026-07-16T00:00:00.000Z',
		actions: state === 'ready' ? [] : ['login']
	};
}

async function readBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}
	return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function sendJson(response: http.ServerResponse, statusCode: number, body: object): void {
	response.writeHead(statusCode, { 'Content-Type': 'application/json' });
	response.end(JSON.stringify(body));
}
