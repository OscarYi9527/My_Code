/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';

suite('AgentHostLanguageModelProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function makeModel(id: string, meta?: Record<string, unknown>): SessionModelInfo {
		return { id, provider: 'copilotcli', name: id === 'auto' ? 'Auto' : id, ...(meta && { _meta: meta }) };
	}

	function createProvider(): AgentHostLanguageModelProvider {
		return store.add(new AgentHostLanguageModelProvider('agent-host-copilotcli', 'copilotcli'));
	}

	test('renders the auto-mode discount as the Auto model detail (and a tooltip)', async () => {
		const provider = createProvider();
		provider.updateModels([makeModel('auto', { discountPercent: 10 }), makeModel('gpt-5')]);

		const infos = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const auto = infos.find(m => m.metadata.id === 'auto');
		const concrete = infos.find(m => m.metadata.id === 'gpt-5');

		assert.strictEqual(auto?.metadata.detail, '10% discount');
		assert.ok(auto?.metadata.tooltip && auto.metadata.tooltip.length > 0, 'Auto should have a tooltip');

		// Concrete models get neither the discount detail nor the Auto tooltip.
		assert.strictEqual(concrete?.metadata.detail, undefined);
		assert.strictEqual(concrete?.metadata.tooltip, undefined);
	});

	test('publishes startup models and dynamically added models after refresh', async () => {
		const provider = createProvider();
		let changeCount = 0;
		store.add(provider.onDidChange(() => changeCount++));

		provider.updateModels([makeModel('mock-gpt'), makeModel('mock-deepseek')]);
		assert.deepStrictEqual(
			(await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).map(model => model.metadata.id),
			['mock-gpt', 'mock-deepseek']
		);

		provider.updateModels([
			makeModel('mock-gpt'),
			makeModel('mock-deepseek'),
			makeModel('mock-new-model')
		]);
		assert.deepStrictEqual(
			(await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).map(model => model.metadata.id),
			['mock-gpt', 'mock-deepseek', 'mock-new-model']
		);
		assert.strictEqual(changeCount, 2);
	});

	test('clears stale models after an Edge failure and restores models after login', async () => {
		const provider = createProvider();
		provider.updateModels([makeModel('stale-model')]);
		assert.strictEqual(
			(await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).length,
			1
		);

		provider.updateModels([]);
		assert.deepStrictEqual(
			await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None),
			[]
		);

		provider.updateModels([makeModel('ready-model')]);
		assert.deepStrictEqual(
			(await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).map(model => model.metadata.id),
			['ready-model']
		);
	});

	test('shows the Auto tooltip but no detail when there is no positive discount', async () => {
		const provider = createProvider();

		// The realistic cold-open case: the runtime omits billing, so there is no discount to show.
		provider.updateModels([makeModel('auto')]);
		let auto = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).find(m => m.metadata.id === 'auto');
		assert.strictEqual(auto?.metadata.detail, undefined, 'absent discount → no detail');
		assert.ok(auto?.metadata.tooltip && auto.metadata.tooltip.length > 0, 'Auto still has a tooltip');

		// Guard: a literal 0 must not render a misleading "0% discount".
		provider.updateModels([makeModel('auto', { discountPercent: 0 })]);
		auto = (await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None)).find(m => m.metadata.id === 'auto');
		assert.strictEqual(auto?.metadata.detail, undefined, 'discountPercent 0 → no detail');
	});
});
