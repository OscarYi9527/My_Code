/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AiEditorModeLayoutContribution } from '../../browser/aiEditorMode.contribution.js';
import { AiEditorMode } from '../../../../services/aiEditorMode/common/aiEditorMode.js';

const LAST_CODEX_SESSION_STORAGE_KEY = 'aiEditor.codex.lastSession';

interface IContributionHarness {
	readonly contribution: {
		codexSessionResource: URI | undefined;
		resolveCodexSessionResource(): URI;
	};
	readonly stored: string | undefined;
	readonly writes: Array<{ key: string; value: string; scope: StorageScope; target: StorageTarget }>;
	setEditors(resources: readonly URI[]): void;
}

function createHarness(stored: string | undefined, resources: readonly URI[] = []): IContributionHarness {
	let storedValue = stored;
	const writes: Array<{ key: string; value: string; scope: StorageScope; target: StorageTarget }> = [];
	const contribution = Object.create(AiEditorModeLayoutContribution.prototype) as IContributionHarness['contribution'] & {
		storageService: {
			get(key: string, scope: StorageScope): string | undefined;
			store(key: string, value: string, scope: StorageScope, target: StorageTarget): void;
		};
		editorGroupsService: { groups: Array<{ editors: Array<{ resource?: URI }> }> };
	};
	const setEditors = (editorResources: readonly URI[]) => {
		contribution.editorGroupsService = {
			groups: [{ editors: editorResources.map(resource => ({ resource })) }],
		};
	};
	contribution.storageService = {
		get(key, scope) {
			assert.strictEqual(key, LAST_CODEX_SESSION_STORAGE_KEY);
			assert.strictEqual(scope, StorageScope.WORKSPACE);
			return storedValue;
		},
		store(key, value, scope, target) {
			writes.push({ key, value, scope, target });
			storedValue = value;
		},
	};
	setEditors(resources);

	return {
		contribution,
		get stored() { return storedValue; },
		writes,
		setEditors,
	};
}

suite('AiEditorModeLayoutContribution', () => {
	test('reuses the active Codex session when a mode switch resets editor groups', () => {
		const codexSession = URI.from({ scheme: 'agent-host-codex', path: '/thread-42' });
		const harness = createHarness(undefined, [codexSession]);

		const first = harness.contribution.resolveCodexSessionResource();
		harness.setEditors([]);
		const afterLayoutReset = harness.contribution.resolveCodexSessionResource();

		assert.strictEqual(first.toString(), codexSession.toString());
		assert.strictEqual(afterLayoutReset.toString(), codexSession.toString());
		assert.strictEqual(harness.stored, codexSession.toString());
		assert.deepStrictEqual(harness.writes, [{
			key: LAST_CODEX_SESSION_STORAGE_KEY,
			value: codexSession.toString(),
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.USER,
		}]);
	});

	test('restores the last workspace Codex session when no editor is open', () => {
		const codexSession = URI.from({ scheme: 'agent-host-codex', path: '/persisted-thread' });
		const harness = createHarness(codexSession.toString());

		assert.strictEqual(harness.contribution.resolveCodexSessionResource().toString(), codexSession.toString());
		assert.strictEqual(harness.contribution.codexSessionResource?.toString(), codexSession.toString());
		assert.deepStrictEqual(harness.writes, []);
	});

	test('ignores non-Codex or malformed workspace state and creates a new Codex session', () => {
		for (const stored of ['file:///workspace/readme.md', 'not a URI']) {
			const harness = createHarness(stored);
			const resolved = harness.contribution.resolveCodexSessionResource();

			assert.strictEqual(resolved.scheme, 'agent-host-codex');
			assert.ok(resolved.path.startsWith('/untitled-'));
			assert.strictEqual(harness.stored, resolved.toString());
			assert.strictEqual(harness.writes.length, 1);
		}
	});

	test('serializes overlapping layout applications while the workbench is restoring editors', async () => {
		const contribution = Object.create(AiEditorModeLayoutContribution.prototype) as {
			modeApplication: Promise<void>;
			applyMode(mode: AiEditorMode, captureCurrentLayout: boolean): Promise<void>;
			doApplyMode(mode: AiEditorMode, captureCurrentLayout: boolean): Promise<void>;
		};
		const calls: string[] = [];
		let finishDevelopmentLayout: (() => void) | undefined;
		contribution.modeApplication = Promise.resolve();
		contribution.doApplyMode = async mode => {
			calls.push(`start:${mode}`);
			if (mode === AiEditorMode.Dev) {
				await new Promise<void>(resolve => finishDevelopmentLayout = resolve);
			}
			calls.push(`finish:${mode}`);
		};

		const development = contribution.applyMode(AiEditorMode.Dev, false);
		const simple = contribution.applyMode(AiEditorMode.Simple, true);
		await Promise.resolve();
		assert.deepStrictEqual(calls, ['start:dev']);

		finishDevelopmentLayout?.();
		await Promise.all([development, simple]);
		assert.deepStrictEqual(calls, [
			'start:dev',
			'finish:dev',
			'start:simple',
			'finish:simple',
		]);
	});

	test('allows the Codex chat session to open before the model catalog is available', async () => {
		const contribution = Object.create(AiEditorModeLayoutContribution.prototype) as {
			chatSessionsService: {
				getChatSessionContribution(sessionType: string): object | undefined;
			};
			waitForCodexSessionContribution(): Promise<void>;
		};
		contribution.chatSessionsService = {
			getChatSessionContribution: () => ({}),
		};

		await contribution.waitForCodexSessionContribution();
	});
});
