/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasAvailableAiEditorProxyProvider, normalizeAiEditorProxyBaseUrl, parseAiEditorProxyProviderStatus, resolveAiEditorAgentHostProxyBaseUrl } from '../../common/aiEditorProxy.js';
import { type AiEditorProxyCatalogFetch, parseAiEditorProxyModelCatalog, refreshAiEditorProxyModelCatalog } from '../../common/aiEditorProxyModelCatalog.js';

suite('AI Editor Proxy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('uses the isolated development Edge for Agent Host routing', () => {
		assert.strictEqual(
			resolveAiEditorAgentHostProxyBaseUrl('http://127.0.0.1:47892', 'http://127.0.0.1:47921/', true),
			'http://127.0.0.1:47921'
		);
		assert.strictEqual(
			resolveAiEditorAgentHostProxyBaseUrl('http://127.0.0.1:47892', undefined, true),
			'http://127.0.0.1:47921'
		);
		assert.strictEqual(
			resolveAiEditorAgentHostProxyBaseUrl('http://localhost:47892', '  ', true),
			'http://127.0.0.1:47921'
		);
		assert.strictEqual(
			resolveAiEditorAgentHostProxyBaseUrl('http://127.0.0.1:47921', 'http://127.0.0.1:47892', true),
			'http://127.0.0.1:47921'
		);
		assert.strictEqual(
			resolveAiEditorAgentHostProxyBaseUrl('http://127.0.0.1:47892', undefined, false),
			'http://127.0.0.1:47892'
		);
		assert.throws(() => resolveAiEditorAgentHostProxyBaseUrl('http://127.0.0.1:47892', 'https://gateway.example.test', true));
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

	test('loads the startup catalog and publishes dynamically added models after manual refresh', async () => {
		const responses: unknown[] = [
			{
				object: 'list',
				data: [
					{ id: 'mock-gpt' },
					{ id: 'mock-deepseek' }
				]
			},
			{
				object: 'list',
				data: [
					{ id: 'mock-gpt' },
					{ id: 'mock-deepseek' },
					{ id: 'mock-new-model' }
				]
			}
		];
		const applied: string[][] = [];
		const fetcher = queuedCatalogFetch(responses);

		assert.strictEqual(await refreshAiEditorProxyModelCatalog(
			'http://127.0.0.1:47921',
			'ai-editor-test',
			models => applied.push(models.map(model => model.id)),
			fetcher
		), 2);
		assert.strictEqual(await refreshAiEditorProxyModelCatalog(
			'http://127.0.0.1:47921',
			'ai-editor-test',
			models => applied.push(models.map(model => model.id)),
			fetcher
		), 3);
		assert.deepStrictEqual(applied, [
			['mock-gpt', 'mock-deepseek'],
			['mock-gpt', 'mock-deepseek', 'mock-new-model']
		]);
	});

	test('clears stale models on failure and reloads after login becomes ready', async () => {
		const applied: string[][] = [];
		const responses: Array<{ ok: boolean; status: number; body?: unknown }> = [
			{ ok: true, status: 200, body: { data: [{ id: 'stale-model' }] } },
			{ ok: false, status: 401 },
			{ ok: true, status: 200, body: { data: [{ id: 'ready-model' }] } }
		];
		const fetcher: AiEditorProxyCatalogFetch = async () => {
			const response = responses.shift();
			assert.ok(response);
			return {
				ok: response.ok,
				status: response.status,
				json: async () => response.body
			};
		};
		const refresh = () => refreshAiEditorProxyModelCatalog(
			'http://127.0.0.1:47921',
			'ai-editor-test',
			models => applied.push(models.map(model => model.id)),
			fetcher
		);

		await refresh();
		await assert.rejects(refresh(), /HTTP 401/);
		await refresh();
		assert.deepStrictEqual(applied, [
			['stale-model'],
			[],
			['ready-model']
		]);
	});

	test('prefers rich Edge model metadata and removes duplicate ids', () => {
		assert.deepStrictEqual(parseAiEditorProxyModelCatalog({
			models: [
				{
					slug: 'vision-model',
					display_name: 'Vision Model',
					context_window: 128_000,
					input_modalities: ['text', 'image']
				},
				{ slug: 'vision-model', display_name: 'Duplicate' },
				{ slug: '' }
			],
			data: [{ id: 'fallback-must-not-win' }]
		}), [{
			id: 'vision-model',
			name: 'Vision Model',
			contextWindow: 128_000,
			supportsVision: true
		}]);
	});
});

function queuedCatalogFetch(values: unknown[]): AiEditorProxyCatalogFetch {
	return async (_url, init) => {
		assert.strictEqual(init.headers['User-Agent'], 'ai-editor-test');
		const value = values.shift();
		assert.ok(value);
		return {
			ok: true,
			status: 200,
			json: async () => value
		};
	};
}
