/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { randomBytes, randomUUID } = require('node:crypto') as typeof import('node:crypto');
const http = require('node:http') as typeof import('node:http');
const {
	loadAiEditorAccountContractFixtures
} = require('./ai-editor-account-contract-fixtures.ts') as typeof import('./ai-editor-account-contract-fixtures');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 47921;
const MAX_BODY_BYTES = 64 * 1024;
const HANDOFF_TTL_MS = 60_000;
const contractFixtures = loadAiEditorAccountContractFixtures();

const mockAiEditorAccountStates = Object.freeze(contractFixtures.statuses.map(fixture => fixture.state));

interface IMockAiEditorEdgeServerOptions {
	readonly initialState?: string;
	readonly now?: () => number;
}

/**
 * Creates an isolated, memory-only Edge contract simulator for Code development.
 */
function createMockAiEditorEdgeServer(options: IMockAiEditorEdgeServerOptions = {}): import('node:http').Server {
	const now = options.now ?? Date.now;
	let state = parseState(options.initialState ?? 'login_required');
	const handoffs = new Map();
	const tickets = new Set();
	let bindingVersion = 0;

	return http.createServer(async (request, response) => {
		const requestId = `mock_${randomUUID()}`;
		setCommonHeaders(response, requestId);

		try {
			if (!isLoopbackAddress(request.socket.remoteAddress)) {
				return sendError(response, 403, 'loopback_required', 'The mock Edge only accepts loopback requests.', requestId);
			}
			if (!isAllowedHost(request.headers.host)) {
				return sendError(response, 400, 'invalid_host', 'The request Host is not allowed.', requestId);
			}

			const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);

			if (request.method === 'GET' && url.pathname === '/live') {
				return sendJson(response, 200, { status: 'ok', service: 'ai-editor-edge-mock' });
			}
			if (request.method === 'GET' && url.pathname === '/ready') {
				return sendJson(response, state === 'service_unavailable' ? 503 : 200, {
					status: state === 'service_unavailable' ? 'unavailable' : 'ok',
					accountState: state
				});
			}
			if (request.method === 'GET' && url.pathname === '/ai-editor/status') {
				return sendJson(response, 200, buildSafeStatus(state, now()));
			}
			if (request.method === 'POST' && url.pathname === '/ai-editor/status/retry') {
				await readJson(request);
				return sendJson(response, 200, buildSafeStatus(state, now()));
			}
			if (request.method === 'POST' && url.pathname === '/ai-editor/handoff/start') {
				const body = await readJson(request);
				const expectedState = readRequiredString(body, 'state');
				const handoffId = `lh_${randomUUID()}`;
				const nonce = randomBytes(32).toString('base64url');
				handoffs.set(handoffId, { nonce, expectedState, expiresAt: now() + HANDOFF_TTL_MS });
				return sendJson(response, 200, { handoffId, nonce, expiresIn: HANDOFF_TTL_MS / 1000 });
			}
			if (request.method === 'POST' && url.pathname === '/ai-editor/handoff/complete') {
				const body = await readJson(request);
				const handoffId = readRequiredString(body, 'handoffId');
				const nonce = readRequiredString(body, 'nonce');
				const callbackState = readRequiredString(body, 'state');
				readRequiredString(body, 'deviceSessionId');
				readRequiredString(body, 'refreshToken');
				readRequiredString(body, 'accessToken');
				const grant = handoffs.get(handoffId);
				handoffs.delete(handoffId);
				if (!grant || grant.expiresAt < now() || grant.nonce !== nonce || grant.expectedState !== callbackState) {
					return sendError(response, 409, 'handoff_invalid', 'The local account handoff is invalid or expired.', requestId);
				}
				state = 'ready';
				bindingVersion++;
				return sendJson(response, 200, { status: 'completed', bindingVersion });
			}
			if (request.method === 'POST' && url.pathname === '/ai-editor/webview-ticket') {
				await readJson(request);
				if (state !== 'ready') {
					return sendError(response, 401, 'login_required', 'Sign in to open AI Editor management.', requestId);
				}
				const ticket = `wvt_${randomBytes(32).toString('base64url')}`;
				tickets.add(ticket);
				return sendJson(response, 200, { ticket, expiresIn: 60 });
			}
			if (request.method === 'POST' && url.pathname === '/ai-editor/logout') {
				await readJson(request);
				handoffs.clear();
				tickets.clear();
				state = 'login_required';
				bindingVersion++;
				return sendNoContent(response);
			}
			if (request.method === 'GET' && url.pathname === '/v1/models') {
				if (state !== 'ready') {
					return sendError(response, 401, 'login_required', 'Sign in before requesting models.', requestId);
				}
				return sendJson(response, 200, contractFixtures.models.example);
			}
			if (request.method === 'GET' && url.pathname === '/management') {
				response.writeHead(200, {
					'Content-Type': 'text/html; charset=utf-8',
					// eslint-disable-next-line local/code-no-unexternalized-strings -- This mock-only CSP is not product UI.
					'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self' vscode-webview:"
				});
				// eslint-disable-next-line local/code-no-unexternalized-strings -- This mock-only page is not shipped as product UI.
				return response.end("<!doctype html><meta charset=\"utf-8\"><title>AI Editor 管理 Mock</title><h1>AI Editor 管理 Mock</h1>");
			}
			if (url.pathname === '/__mock/state' && request.method === 'GET') {
				return sendJson(response, 200, { state });
			}
			if (url.pathname === '/__mock/state' && request.method === 'POST') {
				const body = await readJson(request);
				state = parseState(readRequiredString(body, 'state'));
				return sendJson(response, 200, buildSafeStatus(state, now()));
			}

			return sendError(response, 404, 'not_found', 'The mock Edge endpoint was not found.', requestId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return sendError(response, 400, 'invalid_request', message, requestId);
		}
	});
}

function buildSafeStatus(state, checkedAt) {
	const fixture = contractFixtures.statuses.find(candidate => candidate.state === state);
	if (!fixture) {
		throw new Error(`Missing mock account fixture: ${state}`);
	}
	const status = JSON.parse(JSON.stringify(fixture.example));
	status.checkedAt = new Date(checkedAt).toISOString();
	return status;
}

function parseState(value) {
	if (!mockAiEditorAccountStates.includes(value)) {
		throw new Error(`Unsupported mock account state: ${value}`);
	}
	return value;
}

function isAllowedHost(value) {
	if (!value) {
		return false;
	}
	try {
		const url = new URL(`http://${value}`);
		return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
	} catch {
		return false;
	}
}

function isLoopbackAddress(value) {
	return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function setCommonHeaders(response, requestId) {
	response.setHeader('Cache-Control', 'no-store');
	response.setHeader('X-Content-Type-Options', 'nosniff');
	response.setHeader('X-AI-Editor-Mock', 'true');
	response.setHeader('X-Request-Id', requestId);
}

function sendJson(response, statusCode, body) {
	response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
}

function sendNoContent(response) {
	response.writeHead(204);
	response.end();
}

function sendError(response, statusCode, code, message, requestId) {
	sendJson(response, statusCode, {
		error: {
			code,
			message,
			requestId,
			retryable: statusCode >= 500
		}
	});
}

async function readJson(request) {
	const chunks = [];
	let length = 0;
	for await (const chunk of request) {
		length += chunk.length;
		if (length > MAX_BODY_BYTES) {
			throw new Error('The request body is too large.');
		}
		chunks.push(chunk);
	}
	if (chunks.length === 0) {
		return {};
	}
	const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('The request body must be a JSON object.');
	}
	return value;
}

function readRequiredString(value, key) {
	const candidate = value[key];
	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new Error(`The ${key} field is required.`);
	}
	return candidate;
}

function parseArguments(argv) {
	const options = { host: DEFAULT_HOST, port: DEFAULT_PORT, state: 'login_required' };
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		const value = argv[index + 1];
		switch (argument) {
			case '--host':
				options.host = value;
				index++;
				break;
			case '--port':
				options.port = Number(value);
				index++;
				break;
			case '--state':
				options.state = value;
				index++;
				break;
			default:
				throw new Error(`Unknown argument: ${argument}`);
		}
	}
	if (options.host !== DEFAULT_HOST) {
		throw new Error(`The mock Edge must bind ${DEFAULT_HOST}.`);
	}
	if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535 || options.port === 47892 || options.port === 47920) {
		throw new Error('The mock Edge port must be an unprivileged port other than 47892 or 47920.');
	}
	options.state = parseState(options.state);
	return options;
}

async function run() {
	const options = parseArguments(process.argv.slice(2));
	const server = createMockAiEditorEdgeServer({ initialState: options.state });
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port, options.host, resolve);
	});
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : options.port;
	console.log(`[ai-editor-edge-mock] ready http://${options.host}:${port} state=${options.state}`);

	const shutdown = () => server.close(() => process.exit(0));
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
}

if (require.main === module) {
	run().catch(error => {
		console.error(`[ai-editor-edge-mock] ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}

module.exports = {
	createMockAiEditorEdgeServer,
	mockAiEditorAccountStates
};
