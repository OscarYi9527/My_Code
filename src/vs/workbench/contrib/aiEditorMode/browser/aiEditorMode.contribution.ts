/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { OpenFolderWorkspaceSupportContext, WorkbenchStateContext } from '../../../common/contextkeys.js';
import { Memento } from '../../../common/memento.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { GroupDirection, GroupsArrangement, GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AiEditorMode, AI_EDITOR_MODE_SETTING_ID, AI_EDITOR_SIMPLE_MODE_CONTEXT, IAiEditorModeService } from '../../../services/aiEditorMode/common/aiEditorMode.js';
import { IChatWidgetService } from '../../../contrib/chat/browser/chat.js';
import { OpenFolderAction, OpenFolderViaWorkspaceAction } from '../../../browser/actions/workspaceActions.js';
import { AI_EDITOR_PROXY_AUTO_START_SETTING_ID, AI_EDITOR_PROXY_BASE_URL_SETTING_ID, AI_EDITOR_PROXY_DEFAULT_BASE_URL, AI_EDITOR_PROXY_DIAGNOSTICS_SETTING_ID } from '../../../../platform/aiEditorProxy/common/aiEditorProxy.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IChatSessionsService, SessionType } from '../../../contrib/chat/common/chatSessionsService.js';
import { isUntitledChatSession } from '../../../contrib/chat/common/model/chatUri.js';
import { IAgentHostNewSessionFolderService } from '../../../contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { ChatContextKeys } from '../../../contrib/chat/common/actions/chatContextKeys.js';

interface IAiEditorLayoutSnapshot {
	activityBarVisible?: boolean;
	sideBarVisible?: boolean;
	panelVisible?: boolean;
	auxiliaryBarVisible?: boolean;
	auxiliaryBarMaximized?: boolean;
	statusBarVisible?: boolean;
}

const aiEditorModeMenu = new MenuId('AiEditorModeMenu');
const aiEditorSimpleFileMenu = new MenuId('AiEditorSimpleFileMenu');
const aiEditorModeMenuTitle = nls.localize2('aiEditor.modeMenu', "切换 AI Editor 模式");
const aiEditorSimpleOpenFolderTitle = nls.localize({ key: 'aiEditor.simpleMode.openFolder', comment: ['&& denotes a mnemonic'] }, "Open &&Folder...");

MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	submenu: aiEditorModeMenu,
	title: aiEditorModeMenuTitle,
	icon: Codicon.chatSparkle,
	group: 'navigation',
	order: 20
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: aiEditorModeMenu,
	title: aiEditorModeMenuTitle,
	group: '5_aiEditor',
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: aiEditorSimpleFileMenu,
	title: {
		value: 'File',
		original: 'File',
		mnemonicTitle: nls.localize({ key: 'aiEditor.simpleMode.fileMenu', comment: ['&& denotes a mnemonic'] }, "&&File"),
	},
	when: AI_EDITOR_SIMPLE_MODE_CONTEXT,
	order: 1
});

MenuRegistry.appendMenuItem(aiEditorSimpleFileMenu, {
	group: '1_open',
	command: {
		id: OpenFolderAction.ID,
		title: aiEditorSimpleOpenFolderTitle
	},
	when: OpenFolderWorkspaceSupportContext,
	order: 1
});

MenuRegistry.appendMenuItem(aiEditorSimpleFileMenu, {
	group: '1_open',
	command: {
		id: OpenFolderViaWorkspaceAction.ID,
		title: aiEditorSimpleOpenFolderTitle
	},
	when: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo('workspace')),
	order: 1
});

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
			},
			[AI_EDITOR_PROXY_BASE_URL_SETTING_ID]: {
				type: 'string',
				default: AI_EDITOR_PROXY_DEFAULT_BASE_URL,
				description: nls.localize('aiEditor.proxy.baseUrlDescription', "Advanced: Sets the local multi-upstream Proxy address. This release only accepts localhost, 127.0.0.1, or [::1].")
			},
			[AI_EDITOR_PROXY_AUTO_START_SETTING_ID]: {
				type: 'boolean',
				default: true,
				description: nls.localize('aiEditor.proxy.autoStartDescription', "Automatically starts and monitors the bundled local AI Proxy.")
			},
			[AI_EDITOR_PROXY_DIAGNOSTICS_SETTING_ID]: {
				type: 'boolean',
				default: false,
				description: nls.localize('aiEditor.proxy.diagnosticsDescription', "Temporarily enables detailed local Proxy diagnostics. Prompts, files, replies, and terminal output remain excluded by default.")
			}
		}
	});
})();

export class AiEditorModeLayoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorModeLayout';

	private static readonly LAYOUT_MEMENTO_ID = 'aiEditorModeLayout';
	private static readonly LAST_CODEX_SESSION_STORAGE_KEY = 'aiEditor.codex.lastSession';

	private readonly memento: Memento<IAiEditorLayoutSnapshot>;
	private readonly layoutSnapshot: Partial<IAiEditorLayoutSnapshot>;
	private readonly modeDisposables = this._register(new DisposableStore());
	private codexSessionResource: URI | undefined;
	private modeApplication = Promise.resolve();

	constructor(
		@IAiEditorModeService aiEditorModeService: IAiEditorModeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly newSessionFolderService: IAgentHostNewSessionFolderService,
	) {
		super();
		this.memento = new Memento<IAiEditorLayoutSnapshot>(AiEditorModeLayoutContribution.LAYOUT_MEMENTO_ID, storageService);
		this.layoutSnapshot = this.memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		this._register(editorService.onDidActiveEditorChange(() => {
			const resource = editorService.activeEditor?.resource;
			if (resource?.scheme === 'agent-host-codex') {
				this.codexSessionResource = resource;
				this.storeCodexSession(resource);
				void this.agentHostService.refreshModels('codex').catch(() => {
					// Proxy lifecycle diagnostics own automatic failure prompts.
					// Keep the last successful model catalog on transient failures.
				});
			}
		}));
		if (this.hasOpenCodexSession()) {
			void this.agentHostService.refreshModels('codex').catch(() => {
				// Restored editors refresh on every Code launch. The Proxy
				// lifecycle contribution surfaces availability failures.
			});
		}

		void this.applyMode(aiEditorModeService.getMode(), false).catch(() => {
			// A later mode application is queued independently, so a transient
			// startup failure must not prevent the selected mode from being
			// applied on the next configuration change.
		});
		this._register(aiEditorModeService.onDidChangeMode(mode => {
			void this.applyMode(mode, true).catch(() => {
				// Keep the workbench responsive if a layout operation is
				// interrupted while editors are being restored.
			});
		}));
	}

	private applyMode(mode: AiEditorMode, captureCurrentLayout: boolean): Promise<void> {
		// Mode changes can arrive while the workbench is still restoring its
		// initial editors. Do not let reset/open editor operations overlap:
		// overlapping calls can dispose an editor pane that another call is
		// trying to activate, leaving the requested layout only partly applied.
		const application = this.modeApplication.then(
			() => this.doApplyMode(mode, captureCurrentLayout),
			() => this.doApplyMode(mode, captureCurrentLayout)
		);
		this.modeApplication = application.catch(() => undefined);
		return application;
	}

	private async doApplyMode(mode: AiEditorMode, captureCurrentLayout: boolean): Promise<void> {
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
		// AI Editor owns the Codex conversation in an editor group. Restoring a
		// previously visible auxiliary Chat opens a second, general-purpose Chat
		// surface whose picker uses the global model pool and makes it look like
		// the Proxy model filter was ignored.
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.STATUSBAR_PART);
		this.layoutService.setAuxiliaryBarMaximized(false);
		await this.commandService.executeCommand('workbench.view.explorer');

		if (resetEditors || !this.hasOpenCodexSession()) {
			await this.ensureDevelopmentEditorLayout();
		}
	}

	private async applySimpleLayout(): Promise<void> {
		const codexSessionResource = this.resolveCodexSessionResource();
		await this.resetEditorArea();
		this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(true, Parts.PANEL_PART);
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		this.layoutService.setPartHidden(true, Parts.STATUSBAR_PART);
		this.layoutService.setAuxiliaryBarMaximized(false);

		await this.commandService.executeCommand('workbench.view.explorer');

		const chatGroup = this.editorGroupsService.activeGroup;
		await this.openCodexSession(codexSessionResource, chatGroup);

		const fileGroup = this.editorGroupsService.addGroup(chatGroup, GroupDirection.RIGHT);
		chatGroup.lock(true);
		this.registerSimpleModeFileGroupExpansion(fileGroup);
		this.editorGroupsService.activateGroup(fileGroup);
		this.editorGroupsService.arrangeGroups(GroupsArrangement.MAXIMIZE, chatGroup);
	}

	private async ensureDevelopmentEditorLayout(): Promise<void> {
		await this.editorGroupsService.whenReady;
		const codexSessionResource = this.resolveCodexSessionResource();
		const fileGroup = this.editorGroupsService.activeGroup;
		const chatGroup = this.editorGroupsService.addGroup(fileGroup, GroupDirection.RIGHT);

		await this.openCodexSession(codexSessionResource, chatGroup);
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

	private resolveCodexSessionResource(): URI {
		for (const group of this.editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.resource?.scheme === 'agent-host-codex') {
					this.codexSessionResource = editor.resource;
					this.storeCodexSession(editor.resource);
					return editor.resource;
				}
			}
		}
		if (this.codexSessionResource) {
			return this.codexSessionResource;
		}
		const stored = this.storageService.get(AiEditorModeLayoutContribution.LAST_CODEX_SESSION_STORAGE_KEY, StorageScope.WORKSPACE);
		if (stored) {
			try {
				const resource = URI.parse(stored);
				if (resource.scheme === 'agent-host-codex') {
					this.codexSessionResource = resource;
					return resource;
				}
			} catch {
				// Ignore invalid workspace state and create a new Codex session.
			}
		}
		this.codexSessionResource = URI.from({ scheme: 'agent-host-codex', path: `/untitled-${generateUuid()}` });
		this.storeCodexSession(this.codexSessionResource);
		return this.codexSessionResource;
	}

	private hasOpenCodexSession(): boolean {
		return this.editorGroupsService.groups.some(group => group.editors.some(editor => editor.resource?.scheme === 'agent-host-codex'));
	}

	private async openCodexSession(resource: URI, group: IEditorGroup): Promise<void> {
		await this.agentHostService.refreshModels('codex').catch(() => {
			// The readiness wait below remains authoritative on first launch;
			// transient failures retain the last successful catalog.
		});
		await this.waitForCodexSessionContribution();
		if (isUntitledChatSession(resource)) {
			const workingDirectory = this.newSessionFolderService.getFolder(resource)
				?? this.newSessionFolderService.getDefaultFolder()
				?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
			if (workingDirectory) {
				this.newSessionFolderService.setFolder(resource, workingDirectory);
			}
		}
		await this.chatWidgetService.openSession(resource, group, { pinned: true });
		this.codexSessionResource = resource;
		this.storeCodexSession(resource);
	}

	private async waitForCodexSessionContribution(): Promise<void> {
		const contributionReady = this.chatSessionsService.getChatSessionContribution(SessionType.AgentHostCodex)
			? Promise.resolve()
			: Event.toPromise(Event.once(Event.filter(
				this.chatSessionsService.onDidChangeAvailability,
				() => !!this.chatSessionsService.getChatSessionContribution(SessionType.AgentHostCodex)
			)));
		const modelsReady = this.hasCodexModels()
			? Promise.resolve()
			: Event.toPromise(Event.once(Event.filter(
				this.agentHostService.rootState.onDidChange,
				state => !(state instanceof Error) && state.agents.some(agent => agent.provider === 'codex' && agent.models.length > 0)
			)));

		await Promise.all([contributionReady, modelsReady]);
	}

	private hasCodexModels(): boolean {
		const state = this.agentHostService.rootState.value;
		if (!state || state instanceof Error) {
			return false;
		}
		return state.agents.some(agent => agent.provider === 'codex' && agent.models.length > 0);
	}

	private storeCodexSession(resource: URI): void {
		this.storageService.store(
			AiEditorModeLayoutContribution.LAST_CODEX_SESSION_STORAGE_KEY,
			resource.toString(),
			StorageScope.WORKSPACE,
			StorageTarget.USER
		);
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

registerAction2(class RefreshCodexModelCatalogAction extends Action2 {
	constructor() {
		const codexSession = ContextKeyExpr.and(
			ChatContextKeys.chatIsAgentHostSession,
			ChatContextKeys.chatAgentHostProviderId.isEqualTo('codex')
		);
		super({
			id: 'aiEditor.refreshCodexModelCatalog',
			title: nls.localize2('aiEditor.refreshCodexModelCatalog', "刷新模型目录"),
			tooltip: nls.localize2('aiEditor.refreshCodexModelCatalog.tooltip', "从 AI Proxy 刷新模型目录"),
			icon: Codicon.refresh,
			f1: true,
			precondition: codexSession,
			menu: {
				id: MenuId.ChatTitleBarMenu,
				group: 'navigation',
				order: 20,
				when: codexSession
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const agentHostService = accessor.get(IAgentHostService);
		const notificationService = accessor.get(INotificationService);
		try {
			const count = await agentHostService.refreshModels('codex');
			notificationService.info(nls.localize('aiEditor.refreshCodexModelCatalog.success', "模型目录已刷新，共 {0} 个模型。", count));
		} catch (error) {
			notificationService.error(nls.localize(
				'aiEditor.refreshCodexModelCatalog.failed',
				"模型目录刷新失败。请确认 AI Proxy 正在运行后重试：{0}",
				error instanceof Error ? error.message : String(error)
			));
		}
	}
});

async function setAiEditorMode(accessor: ServicesAccessor, nextMode: AiEditorMode): Promise<void> {
	const aiEditorModeService = accessor.get(IAiEditorModeService);
	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);
	const notificationService = accessor.get(INotificationService);

	if (aiEditorModeService.getMode() === nextMode) {
		notificationService.info(
			nextMode === AiEditorMode.Simple
				? nls.localize('aiEditor.alreadySimpleMode', "当前已经是简约模式")
				: nls.localize('aiEditor.alreadyDevMode', "当前已经是开发模式")
		);
		return;
	}

	const modeLabel = nextMode === AiEditorMode.Simple
		? nls.localize('aiEditor.simpleMode', "简约模式")
		: nls.localize('aiEditor.devMode', "开发模式");
	const { confirmed } = await dialogService.confirm({
		title: nls.localize('aiEditor.confirmModeSwitchTitle', "切换 AI Editor 模式"),
		message: nls.localize('aiEditor.confirmModeSwitchMessage', "是否切换到{0}？", modeLabel),
		primaryButton: nls.localize('aiEditor.confirmModeSwitchButton', "确认"),
		cancelButton: nls.localize('aiEditor.cancelModeSwitchButton', "否")
	});

	if (!confirmed) {
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
			f1: true
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
			title: nls.localize2('aiEditor.switchToSimpleMode', "切换到简约模式"),
			f1: true,
			menu: [{
				id: aiEditorModeMenu,
				group: 'navigation',
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
			title: nls.localize2('aiEditor.switchToDevelopmentMode', "切换到开发模式"),
			f1: true,
			menu: [{
				id: aiEditorModeMenu,
				group: 'navigation',
				order: 1
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
