/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { AiEditorMode, AI_EDITOR_MODE_SETTING_ID, IAiEditorModeService } from '../common/aiEditorMode.js';

interface IAiEditorModeState {
	mode?: AiEditorMode;
}

export class AiEditorModeService extends Disposable implements IAiEditorModeService {
	readonly _serviceBrand: undefined;

	private static readonly MEMENTO_ID = 'aiEditorMode';

	private readonly onDidChangeModeEmitter = this._register(new Emitter<AiEditorMode>());
	readonly onDidChangeMode = this.onDidChangeModeEmitter.event;
	private readonly storageListenerDisposables = this._register(new DisposableStore());
	private readonly memento: Memento<IAiEditorModeState>;
	private readonly state: Partial<IAiEditorModeState>;

	private mode: AiEditorMode;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.memento = new Memento<IAiEditorModeState>(AiEditorModeService.MEMENTO_ID, this.storageService);
		this.state = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		this._register(this.storageService.onWillSaveState(() => this.memento.saveMemento()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration(AI_EDITOR_MODE_SETTING_ID)) {
				return;
			}

			const mode = this.readStoredMode();
			if (mode !== this.mode) {
				this.mode = mode;
				this.onDidChangeModeEmitter.fire(mode);
			}
		}));
		this.mode = this.readStoredMode();
		this._register(this.memento.onDidChangeValue(StorageScope.PROFILE, this.storageListenerDisposables)(() => {
			this.memento.reloadMemento(StorageScope.PROFILE);
			const mode = this.readStoredMode();
			if (mode !== this.mode) {
				this.mode = mode;
				this.onDidChangeModeEmitter.fire(mode);
			}
		}));
	}

	getMode(): AiEditorMode {
		return this.readStoredMode();
	}

	setMode(mode: AiEditorMode): void {
		if (this.getMode() === mode) {
			return;
		}

		this.state.mode = mode;
		this.mode = mode;
		this.memento.saveMemento();
		this.onDidChangeModeEmitter.fire(mode);
	}

	toggleMode(): AiEditorMode {
		const nextMode = this.mode === AiEditorMode.Simple ? AiEditorMode.Dev : AiEditorMode.Simple;
		this.setMode(nextMode);
		return nextMode;
	}

	private readStoredMode(): AiEditorMode {
		const mode = this.configurationService.getValue<string>(AI_EDITOR_MODE_SETTING_ID) ?? this.state.mode;
		return mode === AiEditorMode.Simple ? AiEditorMode.Simple : AiEditorMode.Dev;
	}
}

registerSingleton(IAiEditorModeService, AiEditorModeService, InstantiationType.Delayed);
