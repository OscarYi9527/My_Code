/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPaCreatorService, IPaCreatorStartOptions, PaCreatorSessionStatus } from '../../../services/paCreator/common/paCreator.js';
import { createPaCreatorPublicationDraft } from '../../../services/paCreator/common/paCreatorPublication.js';
import { IPaPublicationService, PUBLISH_PA_CREATOR_SESSION_ACTION_ID } from '../../../services/paRegistry/common/paPublication.js';
import { CREATE_PA_ACTION_ID } from '../../../services/paRegistry/common/paRegistry.js';
import { PaCreatorEditor } from './paCreatorEditor.js';
import { PaCreatorEditorInput } from './paCreatorEditorInput.js';

interface IPaCreatorSessionPick extends IQuickPickItem {
	readonly sessionId?: string;
	readonly createNew?: boolean;
}

CommandsRegistry.registerCommand(CREATE_PA_ACTION_ID, async (accessor, preset?: IPaCreatorStartOptions) => {
	const creatorService = accessor.get(IPaCreatorService);
	const quickInputService = accessor.get(IQuickInputService);
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	if (preset && typeof preset === 'object' && typeof preset.requirement === 'string') {
		await openCreatorSession(creatorService, editorService, instantiationService, creatorService.startSession(preset).id);
		return;
	}
	const incomplete = creatorService.getIncompleteSessions();
	let sessionId: string | undefined;
	if (incomplete.length > 0) {
		const items: IPaCreatorSessionPick[] = [
			{
				label: `$(add) ${localize('aiEditor.paCreator.new', "创建新的 PA")}`,
				createNew: true
			},
			...incomplete.map(session => ({
				label: session.title,
				description: session.currentActivityId,
				detail: localize('aiEditor.paCreator.resume.detail', "继续未完成的创建流程"),
				sessionId: session.id
			}))
		];
		const selected = await quickInputService.pick(items, {
			title: localize('aiEditor.paCreator.resume.title', "PA Creator"),
			placeHolder: localize('aiEditor.paCreator.resume.placeholder', "继续任务或创建新的 PA")
		});
		if (!selected) {
			return;
		}
		sessionId = selected.sessionId;
	}
	if (!sessionId) {
		const requirement = await quickInputService.input({
			title: localize('aiEditor.paCreator.requirement.title', "你要创建什么 PA？"),
			prompt: localize('aiEditor.paCreator.requirement.prompt', "描述目标、使用者、输入、输出和成功标准；后续会逐步确认")
		});
		if (!requirement?.trim()) {
			return;
		}
		const title = requirement.trim().split(/[\r\n。！？]/, 1)[0].slice(0, 48) || '新的 PA';
		sessionId = creatorService.startSession({ title, requirement }).id;
	}
	await openCreatorSession(creatorService, editorService, instantiationService, sessionId);
});

CommandsRegistry.registerCommand(PUBLISH_PA_CREATOR_SESSION_ACTION_ID, async (accessor, sessionId: string) => {
	const creatorService = accessor.get(IPaCreatorService);
	const publicationService = accessor.get(IPaPublicationService);
	const notificationService = accessor.get(INotificationService);
	const session = creatorService.getSession(sessionId);
	if (!session || session.status !== PaCreatorSessionStatus.ReadyForPublication) {
		throw new Error('PA Creator session is not ready for publication.');
	}
	const draft = createPaCreatorPublicationDraft(session);
	const result = await publicationService.publish(draft);
	creatorService.completePublication(session.id, result.item.id);
	notificationService.info(localize(
		'aiEditor.paCreator.published',
		"“{0}”已发布到当前 Profile 的 PA 广场。",
		result.item.name
	));
});

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		PaCreatorEditor,
		PaCreatorEditor.ID,
		localize('aiEditor.paCreator.title', "PA Creator")
	),
	[new SyncDescriptor(PaCreatorEditorInput)]
);

async function openCreatorSession(
	creatorService: IPaCreatorService,
	editorService: IEditorService,
	instantiationService: IInstantiationService,
	sessionId: string
): Promise<void> {
	const session = creatorService.getSession(sessionId);
	if (!session) {
		return;
	}
	const existing = editorService.editors.find(
		(editor): editor is PaCreatorEditorInput => editor instanceof PaCreatorEditorInput && editor.sessionId === sessionId
	);
	const input = existing ?? instantiationService.createInstance(PaCreatorEditorInput, sessionId, session.title);
	await editorService.openEditor(input, { pinned: true });
}
