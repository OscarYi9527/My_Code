/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { hasAvailableAiEditorProxyProvider, normalizeAiEditorProxyBaseUrl, parseAiEditorProxyProviderStatus } from '../../common/aiEditorProxy.js';

suite('AI Editor Proxy', () => {
	test('normalizes supported loopback URLs', () => {
		assert.deepStrictEqual([
			normalizeAiEditorProxyBaseUrl(undefined),
			normalizeAiEditorProxyBaseUrl('http://localhost:47892/'),
			normalizeAiEditorProxyBaseUrl('http://[::1]:47892')
		], [
			'http://127.0.0.1:47892',
			'http://localhost:47892',
			'http://[::1]:47892'
		]);
	});

	test('rejects remote and unsafe URLs', () => {
		for (const value of ['https://127.0.0.1:47892', 'http://192.168.1.2:47892', 'http://localhost:47892/v1', 'http://user:pass@localhost:47892']) {
			assert.throws(() => normalizeAiEditorProxyBaseUrl(value));
		}
	});

	test('parses provider availability', () => {
		const status = parseAiEditorProxyProviderStatus({
			providers: {
				deepseek: false,
				'openai-api': true,
				'chatgpt-sub': false,
				relays: ['relay-a']
			}
		});
		assert.deepStrictEqual({
			status,
			available: hasAvailableAiEditorProxyProvider(status)
		}, {
			status: {
				deepseek: false,
				openaiApi: true,
				chatgptSubscription: false,
				relays: ['relay-a']
			},
			available: true
		});
	});
});
