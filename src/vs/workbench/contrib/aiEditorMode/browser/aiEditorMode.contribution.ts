/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Memento } from '../../../common/memento.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { GroupDirection, GroupsArrangement, GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { AiEditorMode, AI_EDITOR_MODE_SETTING_ID, IAiEditorModeService } from '../../../services/aiEditorMode/common/aiEditorMode.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { ChatEditorInput } from '../../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';

interface IAiEditorLayoutSnapshot {
	activityBarVisible?: boolean;
	sideBarVisible?: boolean;
	panelVisible?: boolean;
	auxiliaryBarVisible?: boolean;
	auxiliaryBarMaximized?: boolean;
	statusBarVisible?: boolean;
}

(function registerAiEditorModeConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

	registry.registerConfiguration({
		id: 'aiEditor',
		title: nls.localize('aiEditor.configurationTitle', "AI Editor"),
		type: 'object',
		properties: {
			[AI_EDITOR_MODE_SETTING_ID]: {
				type: 'string',
				enum: [AiEditorMode.Dev, AiEditorMode.Simple],
				enumDescriptions: [
					nls.localize('aiEditor.mode.devDescription', "Shows the full development workbench layout."),
					nls.localize('aiEditor.mode.simpleDescription', "Shows the simplified AI-first workbench layout.")
				],
				default: AiEditorMode.Dev,
				description: nls.localize('aiEditor.modeDescription', "Controls whether the AI editor starts in development mode or simple mode.")
			}
		}
	});
})();

class AiEditorModeLayoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorModeLayout';

	private static readonly LAYOUT_MEMENTO_ID = 'aiEditorModeLayout';

	private readonly memento: Memento<IAiEditorLayoutSnapshot>;
	private readonly layoutSnapshot: Partial<IAiEditorLayoutSnapshot>;
	private readonly modeDisposables = this._register(new DisposableStore());

	constructor(
		@IAiEditorModeService aiEditorModeService: IAiEditorModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		this.memento = new Memento<IAiEditorLayoutSnapshot>(AiEditorModeLayoutContribution.LAYOUT_MEMENTO_ID, storageService);
		this.layoutSnapshot = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);

		void this.applyMode(aiEditorModeService.getMode(), false);
		this._register(aiEditorModeService.onDidChangeMode(mode => {
			void this.applyMode(mode, true);
		}));
	}

	private async applyMode(mode: AiEditorMode, captureCurrentLayout: boolean): Promise<void> {
		this.modeDisposables.clear();

		if (mode === AiEditorMode.Simple) {
			if (captureCurrentLayout) {
				this.captureCurrentLayout();
			}

			await this.applySimpleLayout();
			return;
		}

		await this.restoreDevelopmentLayout(captureCurrentLayout);
	}

	private captureCurrentLayout(): void {
		this.layoutSnapshot.activityBarVisible = this.layoutService.isVisible(Parts.ACTIVITYBAR_PART);
		this.layoutSnapshot.sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
		this.layoutSnapshot.panelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
		this.layoutSnapshot.auxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this.layoutSnapshot.auxiliaryBarMaximized = this.layoutService.isAuxiliaryBarMaximized();
		this.layoutSnapshot.statusBarVisible = this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow);
		this.memento.saveMemento();
	}

	private async restoreDevelopmentLayout(resetEditors: boolean): Promise<void> {
		const snapshot = this.getRestoredLayoutSnapshot();

		if (resetEditors) {
			await this.resetEditorArea();
		}
		this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(!snapshot.panelVisible, Parts.PANEL_PART);
		this.layoutService.setPartHidden(!snapshot.auxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.STATUSBAR_PART);
		this.layoutService.setAuxiliaryBarMaximized(snapshot.auxiliaryBarMaximized);
		await this.commandService.executeCommand('workbench.view.explorer');

		if (resetEditors) {
			await this.ensureDevelopmentEditorLayout();
		}
	}

	private async applySimpleLayout(): Promise<void> {
		await this.resetEditorArea();
		this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(true, Parts.PANEL_PART);
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		this.layoutService.setPartHidden(true, Parts.STATUSBAR_PART);
		this.layoutService.setAuxiliaryBarMaximized(false);

		await this.commandService.executeCommand('workbench.view.explorer');

		const chatGroup = this.editorGroupsService.activeGroup;
		await this.chatWidgetService.openSession(ChatEditorInput.getNewEditorUri(), chatGroup, { pinned: true });

		const fileGroup = this.editorGroupsService.addGroup(chatGroup, GroupDirection.RIGHT);
		chatGroup.lock(true);
		this.registerSimpleModeFileGroupExpansion(fileGroup);
		this.editorGroupsService.activateGroup(fileGroup);
		this.editorGroupsService.arrangeGroups(GroupsArrangement.MAXIMIZE, chatGroup);
	}

	private async ensureDevelopmentEditorLayout(): Promise<void> {
		const fileGroup = this.editorGroupsService.activeGroup;
		const chatGroup = this.editorGroupsService.addGroup(fileGroup, GroupDirection.RIGHT);

		await this.chatWidgetService.openSession(ChatEditorInput.getNewEditorUri(), chatGroup, { pinned: true });
		this.editorGroupsService.arrangeGroups(GroupsArrangement.EVEN);
		this.editorGroupsService.activateGroup(fileGroup);
	}

	private registerSimpleModeFileGroupExpansion(fileGroup: IEditorGroup): void {
		this.modeDisposables.add(fileGroup.onDidModelChange(() => this.expandSimpleModeFileGroup(fileGroup)));
	}

	private expandSimpleModeFileGroup(fileGroup: IEditorGroup): void {
		if (fileGroup.isEmpty) {
			return;
		}

		this.editorGroupsService.arrangeGroups(GroupsArrangement.EVEN);
		this.editorGroupsService.activateGroup(fileGroup);
	}

	private async resetEditorArea(): Promise<void> {
		await this.editorGroupsService.whenReady;

		for (const group of this.editorGroupsService.groups) {
			group.lock(false);
			group.closeAllEditors({ excludeConfirming: true });
		}

		const firstGroup = this.getFirstEditorGroup();
		this.editorGroupsService.mergeAllGroups(firstGroup);
		this.editorGroupsService.activateGroup(firstGroup);
	}

	private getFirstEditorGroup(): IEditorGroup {
		return this.editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[0] ?? this.editorGroupsService.activeGroup;
	}

	private getRestoredLayoutSnapshot(): Required<IAiEditorLayoutSnapshot> {
		return {
			activityBarVisible: this.layoutSnapshot.activityBarVisible ?? true,
			sideBarVisible: this.layoutSnapshot.sideBarVisible ?? true,
			panelVisible: this.layoutSnapshot.panelVisible ?? false,
			auxiliaryBarVisible: this.layoutSnapshot.auxiliaryBarVisible ?? false,
			auxiliaryBarMaximized: this.layoutSnapshot.auxiliaryBarMaximized ?? false,
			statusBarVisible: this.layoutSnapshot.statusBarVisible ?? true,
		};
	}
}

registerWorkbenchContribution2(AiEditorModeLayoutContribution.ID, AiEditorModeLayoutContribution, WorkbenchPhase.AfterRestored);

async function setAiEditorMode(accessor: ServicesAccessor, nextMode: AiEditorMode): Promise<void> {
	const aiEditorModeService = accessor.get(IAiEditorModeService);
	const configurationService = accessor.get(IConfigurationService);
	const notificationService = accessor.get(INotificationService);

	if (aiEditorModeService.getMode() === nextMode) {
		notificationService.info(
			nextMode === AiEditorMode.Simple
				? nls.localize('aiEditor.alreadySimpleMode', "当前已经是简约模式")
				: nls.localize('aiEditor.alreadyDevMode', "当前已经是开发模式")
		);
		return;
	}

	try {
		aiEditorModeService.setMode(nextMode);
		await configurationService.updateValue(AI_EDITOR_MODE_SETTING_ID, nextMode, ConfigurationTarget.USER);

		if (nextMode === AiEditorMode.Simple) {
			notificationService.info(nls.localize('aiEditor.simpleModeEnabled', "已切换到简约模式"));
		} else {
			notificationService.info(nls.localize('aiEditor.devModeEnabled', "已切换到开发模式"));
		}
	} catch (error) {
		notificationService.error(nls.localize('aiEditor.modePersistFailed', "模式切换成功，但持久化失败：{0}", error instanceof Error ? error.message : String(error)));
	}
}

registerAction2(class ToggleSimpleModeAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.toggleSimpleMode',
			title: nls.localize2('aiEditor.toggleSimpleMode', "AI Editor: Toggle Simple Mode"),
			icon: Codicon.chatSparkle,
			f1: true,
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '5_aiEditor',
				order: 1
			}, {
				id: MenuId.TitleBar,
				group: 'navigation',
				order: 20
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const aiEditorModeService = accessor.get(IAiEditorModeService);
		const nextMode = aiEditorModeService.getMode() === AiEditorMode.Simple ? AiEditorMode.Dev : AiEditorMode.Simple;
		await setAiEditorMode(accessor, nextMode);
	}
});

registerAction2(class SwitchToSimpleModeAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.switchToSimpleMode',
			title: nls.localize2('aiEditor.switchToSimpleMode', "AI Editor: Switch to Simple Mode"),
			f1: true,
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '5_aiEditor',
				order: 2
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await setAiEditorMode(accessor, AiEditorMode.Simple);
	}
});

registerAction2(class SwitchToDevelopmentModeAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.switchToDevelopmentMode',
			title: nls.localize2('aiEditor.switchToDevelopmentMode', "AI Editor: Switch to Development Mode"),
			f1: true,
			menu: [{
				id: MenuId.MenubarAppearanceMenu,
				group: '5_aiEditor',
				order: 3
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await setAiEditorMode(accessor, AiEditorMode.Dev);
	}
});

registerAction2(class ShowCurrentModeAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.showCurrentMode',
			title: nls.localize2('aiEditor.showCurrentMode', "AI Editor: Show Current Mode"),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): void {
		const aiEditorModeService = accessor.get(IAiEditorModeService);
		const notificationService = accessor.get(INotificationService);
		const mode = aiEditorModeService.getMode();

		notificationService.info(
			mode === AiEditorMode.Simple
				? nls.localize('aiEditor.currentModeSimple', "当前模式：简约模式")
				: nls.localize('aiEditor.currentModeDev', "当前模式：开发模式")
		);
	}
});
