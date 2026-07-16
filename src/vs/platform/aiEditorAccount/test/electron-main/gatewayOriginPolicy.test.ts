/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorGatewayNavigationDecision,
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
});
