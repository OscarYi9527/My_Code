/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NULL_CHECKPOINT_SERVICE, IAgentHostCheckpointService } from '../../../common/agentHostCheckpointService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent, isCodexThreadUnavailableError } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import type { Thread } from '../../../node/codex/protocol/generated/v2/Thread.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

function createAgent(disposables: Pick<DisposableStore, 'add'>): CodexAgent {
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined });
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(ILogService, new NullLogService());
	return disposables.add(instantiationService.createInstance(CodexAgent));
}

function historicalThread(id: string): Thread {
	return {
		id,
		sessionId: id,
		forkedFromId: null,
		preview: 'historical prompt',
		ephemeral: false,
		modelProvider: 'openai',
		createdAt: 1,
		updatedAt: 2,
		status: { type: 'idle' },
		path: null,
		cwd: 'D:\\workspace',
		cliVersion: 'test',
		source: 'vscode',
		threadSource: null,
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
	};
}

suite('Codex historical session restore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes app-server unloaded-thread errors', () => {
		assert.strictEqual(isCodexThreadUnavailableError('thread not found: abc'), true);
		assert.strictEqual(isCodexThreadUnavailableError('Thread not loaded: abc'), true);
		assert.strictEqual(isCodexThreadUnavailableError('upstream returned 404'), false);
	});

	test('marks a rollout-only historical read for resume before the next turn', async () => {
		const agent = createAgent(disposables);
		const session = URI.parse('codex:/historical-thread');
		const internals = agent as unknown as {
			_readSession(session: URI): Promise<{ thread: Thread; isLoaded: boolean }>;
			_sessions: Map<string, { needsResume: boolean }>;
		};
		internals._readSession = async () => ({
			thread: historicalThread('historical-thread'),
			isLoaded: false,
		});

		const metadata = await agent.getSessionMetadata(session);

		assert.strictEqual(metadata?.summary, 'historical prompt');
		assert.strictEqual(internals._sessions.get('historical-thread')?.needsResume, true);
	});
});
