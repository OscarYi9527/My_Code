/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import * as nls from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import {
	EDIT_PA_ACTION_ID,
	CREATE_PA_ACTION_ID,
	EXPORT_PA_ACTION_ID,
	IMPORT_PA_ACTION_ID,
	IPaRegistryService,
	OPEN_PA_ACTION_ID,
	OPEN_PA_PLAZA_ACTION_ID,
	OPEN_PERSONAL_CREATIONS_ACTION_ID,
	PaPublicationStatus,
	ROLLBACK_PA_ACTION_ID,
	SET_PA_PUBLICATION_STATUS_ACTION_ID,
	SHOW_PA_DETAILS_ACTION_ID
} from '../../../services/paRegistry/common/paRegistry.js';
import { IPaPublicationService } from '../../../services/paRegistry/common/paPublication.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { PaPlazaEditor } from './paPlazaEditor.js';
import { PaPlazaEditorInput, PaPlazaRoute } from './paPlazaEditorInput.js';

registerAction2(class OpenPaPlazaAction extends Action2 {
	constructor() {
		const codexSession = ContextKeyExpr.and(
			ChatContextKeys.chatIsAgentHostSession,
			ChatContextKeys.chatAgentHostProviderId.isEqualTo('codex')
		);
		super({
			id: OPEN_PA_PLAZA_ACTION_ID,
			title: nls.localize2('aiEditor.pa.openPlaza', "打开 PA 广场"),
			tooltip: nls.localize2('aiEditor.pa.openPlaza.tooltip', "浏览和使用本地流程智能体"),
			icon: Codicon.library,
			f1: true,
			menu: {
				id: MenuId.ChatTitleBarMenu,
				group: 'navigation',
				order: 30,
				when: codexSession
			}
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return openPaPlaza(accessor, 'plaza');
	}
});

registerAction2(class OpenPersonalCreationsAction extends Action2 {
	constructor() {
		super({
			id: OPEN_PERSONAL_CREATIONS_ACTION_ID,
			title: nls.localize2('aiEditor.pa.openPersonalCreations', "打开个人创作"),
			icon: Codicon.account,
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		return openPaPlaza(accessor, 'personal');
	}
});

CommandsRegistry.registerCommand(OPEN_PA_ACTION_ID, (accessor, id: string) => {
	const item = accessor.get(IPaRegistryService).getGalleryItem(id);
	if (item) {
		accessor.get(INotificationService).info(nls.localize(
			'aiEditor.pa.open.nextPhase',
			"“{0}”的运行会话将在 PA Creator 工作流接入后启动。",
			item.name
		));
	}
});

CommandsRegistry.registerCommand(SHOW_PA_DETAILS_ACTION_ID, (accessor, id: string) => {
	const item = accessor.get(IPaRegistryService).getGalleryItem(id)
		?? accessor.get(IPaRegistryService).getPersonalItems().find(candidate => candidate.id === id);
	if (item) {
		accessor.get(INotificationService).info(nls.localize(
			'aiEditor.pa.details.summary',
			"{0}\n版本：{1}\n状态：{2}\n最后更新：{3}",
			item.description,
			item.version,
			item.status,
			new Date(item.updatedAt).toLocaleString()
		));
	}
});

CommandsRegistry.registerCommand(SET_PA_PUBLICATION_STATUS_ACTION_ID, async (
	accessor,
	id: string,
	status: PaPublicationStatus
) => {
	const publicationService = accessor.get(IPaPublicationService);
	const notificationService = accessor.get(INotificationService);
	if (!await publicationService.setStatus(id, status)) {
		notificationService.warn(nls.localize('aiEditor.pa.notFound', "找不到当前 Profile 中的创作物。"));
	}
});

CommandsRegistry.registerCommand(EDIT_PA_ACTION_ID, async (accessor, id: string) => {
	const item = accessor.get(IPaRegistryService).getPersonalItems().find(candidate => candidate.id === id);
	if (!item) {
		return;
	}
	await accessor.get(ICommandService).executeCommand(CREATE_PA_ACTION_ID, {
		title: item.name,
		requirement: nls.localize(
			'aiEditor.pa.update.requirement',
			"基于 {0}@{1} 创建新版本。请说明本次变更，随后重新执行受影响的 AA、CA 和发布门禁。",
			item.id,
			item.version
		),
		publicationTarget: {
			artifactId: item.id,
			baseVersion: item.version,
			version: nextPatchVersion(item.version)
		}
	});
});
CommandsRegistry.registerCommand(IMPORT_PA_ACTION_ID, async accessor => {
	const fileDialogService = accessor.get(IFileDialogService);
	const publicationService = accessor.get(IPaPublicationService);
	const notificationService = accessor.get(INotificationService);
	const selected = await fileDialogService.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: [{ name: 'PA Package', extensions: ['zip'] }]
	});
	if (selected?.[0]) {
		const result = await publicationService.importPackage(selected[0].fsPath);
		notificationService.info(nls.localize('aiEditor.pa.imported', "已导入“{0}”。", result.item.name));
	}
});
CommandsRegistry.registerCommand(EXPORT_PA_ACTION_ID, async (accessor, id: string) => {
	const registry = accessor.get(IPaRegistryService);
	const fileDialogService = accessor.get(IFileDialogService);
	const publicationService = accessor.get(IPaPublicationService);
	const item = registry.getPersonalItems().find(candidate => candidate.id === id);
	if (!item) {
		return;
	}
	const target = await fileDialogService.showSaveDialog({
		title: nls.localize('aiEditor.pa.export.title', "导出 PA 包"),
		filters: [{ name: 'PA Package', extensions: ['zip'] }]
	});
	if (target) {
		await publicationService.exportVersion(id, item.version, target.fsPath);
	}
});
CommandsRegistry.registerCommand(ROLLBACK_PA_ACTION_ID, async (accessor, id: string) => {
	const publication = accessor.get(IPaPublicationService);
	const quickInputService = accessor.get(IQuickInputService);
	const versions = await publication.listVersions(id);
	const selected = await quickInputService.pick(
		versions.map(version => ({
			label: version.version,
			description: new Date(version.createdAt).toLocaleString()
		})),
		{ title: nls.localize('aiEditor.pa.rollback.title', "选择要回滚到的版本") }
	);
	if (selected) {
		await publication.rollback(id, selected.label);
	}
});

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		PaPlazaEditor,
		PaPlazaEditor.ID,
		nls.localize('aiEditor.pa.plaza.title', "PA 广场")
	),
	[new SyncDescriptor(PaPlazaEditorInput)]
);

async function openPaPlaza(accessor: ServicesAccessor, route: PaPlazaRoute): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const existing = editorService.findEditors(PaPlazaEditorInput.RESOURCE)
		.map(identifier => identifier.editor)
		.find((editor): editor is PaPlazaEditorInput => editor instanceof PaPlazaEditorInput);
	const input = existing ?? accessor.get(IInstantiationService).createInstance(PaPlazaEditorInput);
	input.setRoute(route);
	await editorService.openEditor(input, { pinned: true });
}

function nextPatchVersion(version: string): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Cannot create an update from non-semantic version '${version}'.`);
	}
	return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
