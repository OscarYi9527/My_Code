/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorAccountAction,
	AiEditorAccountRole,
	AiEditorAccountState,
	createAiEditorTurnGateResult,
	isAiEditorProduct,
	normalizeAiEditorAccountEdgeUrl,
	normalizeAiEditorAccountGatewayUrl
} from '../../common/aiEditorAccount.js';
import { parseAiEditorSafeStatus } from '../../common/aiEditorAccountIpc.js';

suite('AI Editor Account', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the safe status contract and excludes unknown actions', () => {
		assert.deepStrictEqual(parseAiEditorSafeStatus({
			state: 'ready',
			checkedAt: '2026-07-16T00:00:00.000Z',
			account: {
				display: 'oscar@example.test',
				role: 'user',
				providerCredential: 'must-not-cross-the-contract'
			},
			currentModel: 'mock-gpt',
			availableCredits: '1000.000000',
			usedCreditsPercent: '12.5',
			actions: ['openAccount', 'unsafeAction'],
			providers: { secret: true }
		}), {
			state: AiEditorAccountState.Ready,
			checkedAt: Date.parse('2026-07-16T00:00:00.000Z'),
			accountDisplay: 'oscar@example.test',
			role: AiEditorAccountRole.User,
			currentModel: 'mock-gpt',
			availableCredits: '1000.000000',
			usedCreditsPercent: '12.5',
			errorId: undefined,
			actions: [AiEditorAccountAction.OpenAccount]
		});
	});

	test('maps failure states to fail-closed Turn gate results', () => {
		const status = parseAiEditorSafeStatus({
			state: 'service_unavailable',
			checkedAt: 1,
			errorId: 'safe-error-id',
			actions: ['retry']
		});
		assert.deepStrictEqual(createAiEditorTurnGateResult(status), {
			allowed: false,
			status,
			reason: AiEditorAccountState.ServiceUnavailable
		});
	});

	test('allows a Turn only for ready status', () => {
		const status = parseAiEditorSafeStatus({
			state: 'ready',
			checkedAt: 1,
			actions: []
		});
		assert.deepStrictEqual(createAiEditorTurnGateResult(status), {
			allowed: true,
			status
		});
	});

	test('identifies AI Editor products from the bundled Proxy marker', () => {
		assert.strictEqual(isAiEditorProduct(true), true);
		assert.strictEqual(isAiEditorProduct(false), false);
		assert.strictEqual(isAiEditorProduct(undefined), false);
	});

	test('normalizes loopback Edge URLs', () => {
		assert.deepStrictEqual([
			normalizeAiEditorAccountEdgeUrl(undefined),
			normalizeAiEditorAccountEdgeUrl('http://localhost:47921/'),
			normalizeAiEditorAccountEdgeUrl('http://[::1]:47921')
		], [
			'http://127.0.0.1:47892',
			'http://localhost:47921',
			'http://[::1]:47921'
		]);
	});

	test('rejects remote and credential-bearing Edge URLs', () => {
		for (const value of [
			'https://127.0.0.1:47921',
			'http://192.168.1.2:47921',
			'http://localhost:47921/v1',
			'http://user:password@localhost:47921'
		]) {
			assert.throws(() => normalizeAiEditorAccountEdgeUrl(value));
		}
	});

	test('allows an insecure Gateway only for loopback development', () => {
		assert.strictEqual(
			normalizeAiEditorAccountGatewayUrl('http://127.0.0.1:47920', true),
			'http://127.0.0.1:47920'
		);
		assert.strictEqual(
			normalizeAiEditorAccountGatewayUrl('https://gateway.example.test', false),
			'https://gateway.example.test'
		);
		assert.throws(() => normalizeAiEditorAccountGatewayUrl('http://127.0.0.1:47920', false));
		assert.throws(() => normalizeAiEditorAccountGatewayUrl('http://gateway.example.test', true));
	});

	test('rejects malformed safe status payloads', () => {
		assert.throws(() => parseAiEditorSafeStatus(undefined));
		assert.throws(() => parseAiEditorSafeStatus({ state: 'unknown', checkedAt: 1, actions: [] }));
		assert.throws(() => parseAiEditorSafeStatus({ state: 'ready', checkedAt: 'not-a-date', actions: [] }));
	});

	test('drops unsafe renderer status strings and error identifiers', () => {
		const status = parseAiEditorSafeStatus({
			state: 'service_unavailable',
			checkedAt: 1,
			account: { display: `Oscar\u0000${'x'.repeat(200)}` },
			currentModel: 'model\nsecret',
			availableCredits: 'x'.repeat(100),
			usedCreditsPercent: 'x'.repeat(100),
			errorId: 'http://127.0.0.1/token=secret',
			actions: []
		});

		assert.strictEqual(status.accountDisplay, undefined);
		assert.strictEqual(status.currentModel, undefined);
		assert.strictEqual(status.availableCredits, undefined);
		assert.strictEqual(status.usedCreditsPercent, undefined);
		assert.strictEqual(status.errorId, undefined);
	});
});
