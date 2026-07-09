/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AiEditorMode, AI_EDITOR_MODE_SETTING_ID } from '../../common/aiEditorMode.js';
import { AiEditorModeService } from '../../browser/aiEditorModeService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

interface IAiEditorModeServiceTestAccessor {
	state: {
		mode?: AiEditorMode;
	};
}

suite('AiEditorModeService', () => {
	const disposables = new DisposableStore();
	let storageService: TestStorageService;
	let configurationService: TestConfigurationService;

	setup(() => {
		storageService = disposables.add(new TestStorageService());
		configurationService = new TestConfigurationService();
		Memento.clear(StorageScope.APPLICATION);
		Memento.clear(StorageScope.PROFILE);
		Memento.clear(StorageScope.WORKSPACE);
	});

	teardown(() => {
		disposables.clear();
	});

	test('defaults to dev mode', () => {
		const service = disposables.add(new AiEditorModeService(storageService, configurationService));

		assert.strictEqual(service.getMode(), AiEditorMode.Dev);
	});

	test('persists mode across service instances', () => {
		const service = disposables.add(new AiEditorModeService(storageService, configurationService));

		service.setMode(AiEditorMode.Simple);

		assert.strictEqual(service.getMode(), AiEditorMode.Simple);
		assert.deepStrictEqual(
			JSON.parse(storageService.get('memento/aiEditorMode', StorageScope.PROFILE, '{}')),
			{ mode: AiEditorMode.Simple }
		);

		Memento.clear(StorageScope.PROFILE);

		const reloadedService = disposables.add(new AiEditorModeService(storageService, configurationService));

		assert.strictEqual(reloadedService.getMode(), AiEditorMode.Simple);
	});

	test('reacts to external profile storage updates', () => {
		const service = disposables.add(new AiEditorModeService(storageService, configurationService));
		const events: AiEditorMode[] = [];

		disposables.add(service.onDidChangeMode(mode => events.push(mode)));

		storageService.store('memento/aiEditorMode', JSON.stringify({ mode: AiEditorMode.Simple }), StorageScope.PROFILE, StorageTarget.USER);

		assert.deepStrictEqual(events, [AiEditorMode.Simple]);
		assert.strictEqual(service.getMode(), AiEditorMode.Simple);
	});

	test('persists latest mode during shutdown save', () => {
		const service = disposables.add(new AiEditorModeService(storageService, configurationService));
		const statefulService = service as unknown as IAiEditorModeServiceTestAccessor;

		statefulService.state.mode = AiEditorMode.Simple;
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		assert.deepStrictEqual(
			JSON.parse(storageService.get('memento/aiEditorMode', StorageScope.PROFILE, '{}')),
			{ mode: AiEditorMode.Simple }
		);
	});

	test('prefers persisted configuration mode', async () => {
		await configurationService.setUserConfiguration(AI_EDITOR_MODE_SETTING_ID, AiEditorMode.Simple);

		const service = disposables.add(new AiEditorModeService(storageService, configurationService));

		assert.strictEqual(service.getMode(), AiEditorMode.Simple);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
