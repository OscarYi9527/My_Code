/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict') as typeof import('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test') as typeof import('node:test');
const { createMockAiEditorEdgeServer } = require('../mock-ai-editor-edge.ts') as typeof import('../mock-ai-editor-edge');

let baseUrl;
let server;

beforeEach(async () => {
	server = createMockAiEditorEdgeServer({
		initialState: 'login_required',
		now: () => Date.parse('2026-07-16T00:00:00.000Z')
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
	await new Promise(resolve => server.close(resolve));
});

test('exposes safe status and supports explicit state changes', async () => {
	const initial = await getJson('/ai-editor/status');
	assert.equal(initial.status, 200);
	assert.deepEqual(initial.body, {
		state: 'login_required',
		checkedAt: '2026-07-16T00:00:00.000Z',
		actions: ['login']
	});

	const changed = await postJson('/__mock/state', { state: 'service_unavailable' });
	assert.equal(changed.status, 200);
	assert.equal(changed.body.state, 'service_unavailable');
	assert.equal(changed.body.errorId, 'mock_service_unavailable');
	assert.deepEqual(changed.body.actions, ['retry']);
});

test('completes a one-time handoff before exposing models and a Webview ticket', async () => {
	const started = await postJson('/ai-editor/handoff/start', { state: 'login-state' });
	assert.equal(started.status, 200);

	const completed = await postJson('/ai-editor/handoff/complete', {
		handoffId: started.body.handoffId,
		nonce: started.body.nonce,
		state: 'login-state',
		deviceSessionId: 'device-session',
		refreshToken: 'test-refresh-token',
		accessToken: 'test-access-token'
	});
	assert.equal(completed.status, 200);
	assert.equal(completed.body.state, 'ready');

	const models = await getJson('/v1/models');
	assert.equal(models.status, 200);
	assert.deepEqual(models.body.data.map(model => model.id), ['mock-gpt', 'mock-deepseek']);

	const ticket = await postJson('/ai-editor/webview-ticket', {});
	assert.equal(ticket.status, 200);
	assert.match(ticket.body.ticket, /^wvt_/);

	const replay = await postJson('/ai-editor/handoff/complete', {
		handoffId: started.body.handoffId,
		nonce: started.body.nonce,
		state: 'login-state',
		deviceSessionId: 'device-session',
		refreshToken: 'test-refresh-token',
		accessToken: 'test-access-token'
	});
	assert.equal(replay.status, 409);
	assert.equal(replay.body.error.code, 'handoff_invalid');
});

test('logout removes access to account-scoped endpoints', async () => {
	await postJson('/__mock/state', { state: 'ready' });
	const logout = await postJson('/ai-editor/logout', {});
	assert.equal(logout.status, 200);
	assert.equal(logout.body.state, 'login_required');

	const models = await getJson('/v1/models');
	assert.equal(models.status, 401);
	assert.equal(models.body.error.code, 'login_required');
});

test('rejects unsupported account states', async () => {
	const response = await postJson('/__mock/state', { state: 'unknown' });
	assert.equal(response.status, 400);
	assert.equal(response.body.error.code, 'invalid_request');
});

async function getJson(path) {
	const response = await fetch(`${baseUrl}${path}`);
	return { status: response.status, body: await response.json() };
}

async function postJson(path, body) {
	const response = await fetch(`${baseUrl}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { status: response.status, body: await response.json() };
}
