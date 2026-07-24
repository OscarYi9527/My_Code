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
	AiEditorAccountHttpError,
	AiEditorEdgeLocalNonceFileAuthorization
} from '../../electron-main/aiEditorAccountHttpClient.js';

suite('AI Editor Account HTTP client', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let origin: string;
	let server: http.Server;
	let requests: Array<{
		readonly path: string;
		readonly body: Record<string, unknown>;
		readonly localNonce: string | undefined;
	}>;
	let statusFailure = false;
	let statusTransportFailuresRemaining = 0;
	let statusRetryableFailuresRemaining = 0;
	let retryStatusTransportFailuresRemaining = 0;
	let accountState: 'ready' | 'login_required';

	setup(async () => {
		requests = [];
		statusFailure = false;
		statusTransportFailuresRemaining = 0;
		statusRetryableFailuresRemaining = 0;
		retryStatusTransportFailuresRemaining = 0;
		accountState = 'login_required';
		const httpModule = await import('http');
		server = httpModule.createServer(async (request, response) => {
			const body = await readBody(request);
			requests.push({
				path: request.url ?? '/',
				body,
				localNonce: typeof request.headers['x-ai-editor-local-nonce'] === 'string'
					? request.headers['x-ai-editor-local-nonce']
					: undefined
			});

			if (request.url === '/ai-editor/status') {
				if (statusTransportFailuresRemaining > 0) {
					statusTransportFailuresRemaining -= 1;
					response.destroy();
					return;
				}
				if (statusRetryableFailuresRemaining > 0) {
					statusRetryableFailuresRemaining -= 1;
					return sendJson(response, 503, {
						error: {
							code: 'account_service_unavailable',
							message: 'temporary ingress failure',
							retryable: true
						}
					});
				}
				if (statusFailure) {
					return sendJson(response, 502, {
						error: {
							code: 'provider_unavailable',
							message: 'secret upstream route details'
						}
					});
				}
				return sendJson(response, 200, safeStatus(accountState));
			}
			if (request.url === '/ai-editor/status/retry') {
				if (retryStatusTransportFailuresRemaining > 0) {
					retryStatusTransportFailuresRemaining -= 1;
					response.destroy();
					return;
				}
				return sendJson(response, 200, safeStatus('ready'));
			}
			if (request.url === '/ai-editor/handoff/start') {
				return sendJson(response, 200, { handoffId: 'lh_test', nonce: 'nonce_test', expiresIn: 60 });
			}
			if (request.url === '/ai-editor/handoff/complete') {
				accountState = 'ready';
				return sendJson(response, 200, { status: 'completed', bindingVersion: 1 });
			}
			if (request.url === '/ai-editor/webview-ticket') {
				return sendJson(response, 200, { ticket: 'wvt_test', expiresIn: 60 });
			}
			if (request.url === '/ai-editor/logout') {
				accountState = 'login_required';
				return sendNoContent(response);
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
		await closeServer(server);
	});

	test('implements status, PKCE exchange, handoff, ticket and logout contracts', async () => {
		const localNonce = 'test-local-nonce-with-at-least-32-bytes';
		const client = new AiEditorAccountHttpClient(origin, origin, {
			getLocalNonce: async () => localNonce
		});

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
		await client.completeHandoff('login-state', grant, tokens);
		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.Ready);
		assert.deepStrictEqual(await client.requestWebviewTicket(), { ticket: 'wvt_test', expiresIn: 60 });
		await client.logout();
		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.LoginRequired);

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
		assert.strictEqual(exchange?.localNonce, undefined);
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
		assert.strictEqual(
			requests
				.filter(request => request.path.startsWith('/ai-editor/'))
				.every(request => request.localNonce === localNonce),
			true
		);
	});

	test('exposes only a stable server error code', async () => {
		statusFailure = true;
		const client = new AiEditorAccountHttpClient(origin, origin);
		await assert.rejects(client.getStatus(), error =>
			error instanceof AiEditorAccountHttpError &&
			error.errorId === 'provider_unavailable' &&
			!error.message.includes('secret upstream')
		);
		assert.strictEqual(
			requests.filter(request => request.path === '/ai-editor/status').length,
			1
		);
	});

	test('retries one transient status transport failure and then returns fresh status', async () => {
		statusTransportFailuresRemaining = 1;
		const client = new AiEditorAccountHttpClient(origin, origin);

		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.LoginRequired);
		assert.strictEqual(
			requests.filter(request => request.path === '/ai-editor/status').length,
			2
		);
	});

	test('retries one explicitly retryable status 5xx and then returns fresh status', async () => {
		statusRetryableFailuresRemaining = 1;
		const client = new AiEditorAccountHttpClient(origin, origin);

		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.LoginRequired);
		assert.strictEqual(
			requests.filter(request => request.path === '/ai-editor/status').length,
			2
		);
	});

	test('retries the user status action after one transient transport failure', async () => {
		retryStatusTransportFailuresRemaining = 1;
		const client = new AiEditorAccountHttpClient(origin, origin);

		assert.strictEqual((await client.retryStatus()).state, AiEditorAccountState.Ready);
		assert.strictEqual(
			requests.filter(request => request.path === '/ai-editor/status/retry').length,
			2
		);
	});

	test('fails closed with a stable error when the Edge process exits between requests', async () => {
		const client = new AiEditorAccountHttpClient(origin, origin);
		assert.strictEqual((await client.getStatus()).state, AiEditorAccountState.LoginRequired);

		await closeServer(server);

		await assert.rejects(client.getStatus(), error =>
			error instanceof AiEditorAccountHttpError &&
			error.errorId === 'account_edge_unreachable' &&
			error.statusCode === undefined
		);
	});

	test('rejects an invalid local nonce before sending an Edge request', async () => {
		const client = new AiEditorAccountHttpClient(origin, origin, {
			getLocalNonce: async () => 'short'
		});
		await assert.rejects(
			client.getStatus(),
			error => error instanceof AiEditorAccountHttpError && error.errorId === 'account_edge_local_nonce_invalid'
		);
		assert.strictEqual(requests.length, 0);
	});

	test('reloads a rotated local nonce from an absolute Unicode path', async () => {
		const fs = await import('fs/promises');
		const os = await import('os');
		const path = await import('path');
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-editor-本机 nonce '));
		try {
			const nonceFile = path.join(directory, 'edge local nonce.secret');
			const authorization = new AiEditorEdgeLocalNonceFileAuthorization(nonceFile);
			await fs.writeFile(nonceFile, 'first-local-nonce-with-at-least-32-bytes', 'utf8');
			assert.strictEqual(await authorization.getLocalNonce(), 'first-local-nonce-with-at-least-32-bytes');

			await fs.writeFile(nonceFile, 'rotated-local-nonce-with-at-least-32-bytes', 'utf8');
			assert.strictEqual(await authorization.getLocalNonce(), 'rotated-local-nonce-with-at-least-32-bytes');
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	test('rejects relative, missing, and malformed local nonce files with stable errors', async () => {
		await assert.rejects(
			new AiEditorEdgeLocalNonceFileAuthorization('relative-nonce.secret').getLocalNonce(),
			error => error instanceof AiEditorAccountHttpError && error.errorId === 'account_edge_local_nonce_path_invalid'
		);

		const fs = await import('fs/promises');
		const os = await import('os');
		const path = await import('path');
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-editor-nonce-'));
		try {
			const missingFile = path.join(directory, 'missing.secret');
			await assert.rejects(
				new AiEditorEdgeLocalNonceFileAuthorization(missingFile).getLocalNonce(),
				error => error instanceof AiEditorAccountHttpError && error.errorId === 'account_edge_local_nonce_unavailable'
			);

			const malformedFile = path.join(directory, 'malformed.secret');
			await fs.writeFile(malformedFile, 'short', 'utf8');
			await assert.rejects(
				new AiEditorEdgeLocalNonceFileAuthorization(malformedFile).getLocalNonce(),
				error => error instanceof AiEditorAccountHttpError && error.errorId === 'account_edge_local_nonce_invalid'
			);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
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

function sendNoContent(response: http.ServerResponse): void {
	response.writeHead(204);
	response.end();
}

async function closeServer(server: http.Server): Promise<void> {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server.close(error => error ? reject(error) : resolve());
	});
}
