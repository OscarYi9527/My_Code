/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('node:assert/strict') as typeof import('node:assert/strict');
const { test } = require('node:test') as typeof import('node:test');
const {
	defaultAiEditorAccountContractFixturePath,
	loadAiEditorAccountContractFixtures
} = require('../ai-editor-account-contract-fixtures.ts') as typeof import('../ai-editor-account-contract-fixtures');

test('loads the shared Edge/Code contract fixture', () => {
	const fixtures = loadAiEditorAccountContractFixtures();

	assert.match(defaultAiEditorAccountContractFixturePath, /contracts[\\/]fixtures[\\/]edge-code-contract\.json$/);
	assert.deepEqual(fixtures.statuses.map(status => status.state), [
		'ready',
		'login_required',
		'account_unavailable',
		'service_unavailable',
		'password_change_required'
	]);
	assert.equal(fixtures.localAuthorization.headerName, 'X-AI-Editor-Local-Nonce');
	assert.equal(fixtures.statusRetry.path, '/ai-editor/status/retry');
	assert.equal(fixtures.handoff.complete.response.status, 'completed');
	assert.equal(fixtures.logout.successStatuses[0], 204);
	assert.deepEqual(fixtures.models.example.data.map(model => model.id), ['mock-gpt', 'mock-deepseek']);
});

test('keeps report secrets synthetic and safe-status fields restricted', () => {
	const fixtures = loadAiEditorAccountContractFixtures();

	assert.ok(fixtures.reportSecretValues.every(value => value.startsWith('fixture-')));
	assert.ok(fixtures.safeStatusForbiddenFields.includes('credentials'));
	assert.ok(fixtures.safeStatusForbiddenFields.includes('upstream'));
	assert.ok(fixtures.safeError.requiredFields.includes('requestId'));
	assert.ok(!JSON.stringify(fixtures.statuses).includes('fixture-refresh-token-secret'));
});
