/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorGatewayNavigationDecision,
	AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL,
	AI_EDITOR_OPEN_FULL_MANAGEMENT_URL,
	createAiEditorBrowserManagementUrl,
	createAiEditorManagementUrl,
	decideAiEditorGatewayNavigation
} from '../../electron-main/gatewayOriginPolicy.js';

suite('AI Editor Gateway origin policy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const gatewayOrigin = 'http://127.0.0.1:47920';

	test('allows only same-origin management routes inside the dedicated view', () => {
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${gatewayOrigin}/admin#account`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.AllowInView
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${gatewayOrigin}/admin/users`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.AllowInView
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${gatewayOrigin}/ready`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
	});

	test('opens approved login and help links externally and blocks arbitrary origins', () => {
		assert.strictEqual(
			decideAiEditorGatewayNavigation('https://accounts.example.com/oauth/authorize', gatewayOrigin),
			AiEditorGatewayNavigationDecision.OpenExternal
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation('https://docs.example.com/help/account', gatewayOrigin),
			AiEditorGatewayNavigationDecision.OpenExternal
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation('https://evil.example/download', gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
	});

	test('reserves one exact native action URL for importing the current Codex account', () => {
		assert.strictEqual(
			decideAiEditorGatewayNavigation(AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL, gatewayOrigin),
			AiEditorGatewayNavigationDecision.ImportCurrentCodexAccount
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL}/other`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL}?auth=secret`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
	});

	test('reserves a validated native action for opening full management', () => {
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${AI_EDITOR_OPEN_FULL_MANAGEMENT_URL}?route=providers`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.OpenFullManagement
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${AI_EDITOR_OPEN_FULL_MANAGEMENT_URL}?route=unknown`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${AI_EDITOR_OPEN_FULL_MANAGEMENT_URL}?route=providers&ticket=secret`, gatewayOrigin),
			AiEditorGatewayNavigationDecision.Block
		);
	});

	test('denies all new windows inside the dedicated view', () => {
		assert.strictEqual(
			decideAiEditorGatewayNavigation(`${gatewayOrigin}/admin`, gatewayOrigin, { isNewWindow: true }),
			AiEditorGatewayNavigationDecision.Block
		);
	});

	test('builds a fixed management URL without a credential query', () => {
		const url = new URL(createAiEditorManagementUrl(gatewayOrigin, 'account'));
		assert.strictEqual(url.origin, gatewayOrigin);
		assert.strictEqual(url.pathname, '/admin');
		assert.strictEqual(url.search, '');
		assert.strictEqual(url.hash, '#account');
	});

	test('puts a one-time browser ticket only in the fragment', () => {
		const url = new URL(createAiEditorBrowserManagementUrl(
			gatewayOrigin,
			'providers',
			'one-time-browser-ticket'
		));
		assert.strictEqual(url.origin, gatewayOrigin);
		assert.strictEqual(url.pathname, '/admin');
		assert.strictEqual(url.search, '');
		assert.strictEqual(
			url.hash,
			'#browser?ticket=one-time-browser-ticket&route=providers'
		);
	});
});
