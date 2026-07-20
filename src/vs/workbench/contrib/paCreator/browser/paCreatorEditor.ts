/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/paCreator.css';
import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import {
	IPaCreatorArtifact,
	IPaCreatorService,
	IPaCreatorSession,
	PA_CREATOR_ACTIVITIES,
	PaCreatorSessionStatus,
	PaCreatorStepStatus
} from '../../../services/paCreator/common/paCreator.js';
import { PUBLISH_PA_CREATOR_SESSION_ACTION_ID } from '../../../services/paRegistry/common/paPublication.js';
import { PaCreatorEditorInput } from './paCreatorEditorInput.js';

export class PaCreatorEditor extends EditorPane {
	static readonly ID = PaCreatorEditorInput.EDITOR_ID;

	private readonly renderDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private session: IPaCreatorSession | undefined;
	private selectedArtifactId: string | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IPaCreatorService private readonly creatorService: IPaCreatorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(PaCreatorEditor.ID, group, telemetryService, themeService, storageService);
		this._register(this.creatorService.onDidChangeSession(id => {
			if (id === this.session?.id) {
				this.session = this.creatorService.getSession(id);
				this.render();
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.pa-creator-editor'));
	}

	override async setInput(input: PaCreatorEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.session = this.creatorService.getSession(input.sessionId);
		this.selectedArtifactId = this.session?.artifacts.at(-1)?.id;
		this.render();
	}

	override focus(): void {
		this.container?.focus();
	}

	override layout(): void {
		// Responsive grid sizing is handled by CSS.
	}

	private render(): void {
		if (!this.container || !this.session) {
			return;
		}
		this.renderDisposables.clear();
		clearNode(this.container);
		const layout = append(this.container, $('.pa-creator-layout'));
		this.renderProgress(layout);
		const main = append(layout, $('.pa-creator-main'));
		this.renderConversation(main);
		this.renderDetails(main);
	}

	private renderProgress(parent: HTMLElement): void {
		const progress = append(parent, $('.pa-creator-progress'));
		for (const activity of PA_CREATOR_ACTIVITIES) {
			const step = append(progress, $('.pa-creator-step'));
			const state = this.session!.steps[activity.id];
			step.classList.toggle('current', this.session!.currentActivityId === activity.id);
			step.classList.toggle('completed', state.status === PaCreatorStepStatus.Completed);
			step.textContent = `${activity.id}\n${activity.name}`;
			step.title = activity.responsibility;
		}
	}

	private renderConversation(parent: HTMLElement): void {
		const conversation = append(parent, $('.pa-creator-conversation'));
		const heading = append(conversation, $('h2'));
		const current = PA_CREATOR_ACTIVITIES.find(activity => activity.id === this.session!.currentActivityId);
		heading.textContent = current ? `${current.id} · ${current.name}` : this.session!.title;
		for (const message of this.session!.messages) {
			const card = append(conversation, $('.pa-creator-message'));
			card.classList.add(message.role);
			const label = append(card, $('.pa-creator-message-label'));
			label.textContent = `${message.activityId} · ${message.role === 'user' ? localize('aiEditor.paCreator.you', "你") : 'PA Creator'}`;
			const body = append(card, $('div'));
			body.textContent = message.text;
		}
		if (this.session!.pendingConfirmation) {
			this.renderConfirmation(conversation);
		}
		if (this.session!.status === PaCreatorSessionStatus.ReadyForPublication) {
			const publish = append(conversation, $('button.primary'));
			publish.textContent = localize('aiEditor.paCreator.publishNow', "发布到 PA 广场");
			this.renderDisposables.add(addDisposableListener(publish, 'click', () => {
				void this.commandService.executeCommand(PUBLISH_PA_CREATOR_SESSION_ACTION_ID, this.session!.id);
			}));
		}
		this.renderComposer(conversation);
	}

	private renderConfirmation(parent: HTMLElement): void {
		const confirmation = this.session!.pendingConfirmation!;
		const card = append(parent, $('.pa-creator-confirmation'));
		const title = append(card, $('h3'));
		title.textContent = confirmation.kind === 'mandatory'
			? `${localize('aiEditor.paCreator.requiredConfirmation', "强制确认")} · ${confirmation.title}`
			: confirmation.title;
		const summary = append(card, $('div'));
		summary.textContent = confirmation.summary;
		const actions = append(card, $('.pa-creator-confirmation-actions'));
		const accept = append(actions, $('button.primary'));
		accept.textContent = localize('aiEditor.paCreator.confirm', "确认并继续");
		this.renderDisposables.add(addDisposableListener(accept, 'click', () => {
			this.creatorService.confirm(this.session!.id, confirmation.id);
		}));
		const revise = append(actions, $('button'));
		revise.textContent = localize('aiEditor.paCreator.revise', "返回修改");
		this.renderDisposables.add(addDisposableListener(revise, 'click', async () => {
			const reason = await this.quickInputService.input({
				title: localize('aiEditor.paCreator.revisionReason', "说明需要修改的内容"),
				prompt: localize('aiEditor.paCreator.revisionPrompt', "只会重新计算当前节点及其下游节点")
			});
			if (reason) {
				this.creatorService.rejectConfirmation(this.session!.id, confirmation.id, reason);
			}
		}));
	}

	private renderComposer(parent: HTMLElement): void {
		const composer = append(parent, $('.pa-creator-composer'));
		const input = append(composer, $('textarea')) as HTMLTextAreaElement;
		input.placeholder = this.session!.pendingConfirmation
			? localize('aiEditor.paCreator.input.revise', "也可以直接输入修改意见")
			: localize('aiEditor.paCreator.input.continue', "补充当前步骤的信息");
		const actions = append(composer, $('.pa-creator-composer-actions'));
		const send = append(actions, $('button.primary'));
		send.textContent = localize('aiEditor.paCreator.send', "发送");
		this.renderDisposables.add(addDisposableListener(send, 'click', () => {
			if (input.value.trim()) {
				this.creatorService.submitInput(this.session!.id, input.value);
			}
		}));
	}

	private renderDetails(parent: HTMLElement): void {
		const details = append(parent, $('.pa-creator-details'));
		const heading = append(details, $('h2'));
		heading.textContent = localize('aiEditor.paCreator.details', "产物详情");
		for (const artifact of this.session!.artifacts) {
			const item = append(details, $('.pa-creator-artifact'));
			item.textContent = `${artifact.activityId} · ${artifact.name}`;
			this.renderDisposables.add(addDisposableListener(item, 'click', () => {
				this.selectedArtifactId = artifact.id;
				this.render();
			}));
		}
		const selected = this.selectedArtifact();
		if (selected) {
			const detail = append(details, $('.pa-creator-artifact-detail'));
			detail.textContent = selected.detail;
		}
	}

	private selectedArtifact(): IPaCreatorArtifact | undefined {
		return this.session?.artifacts.find(artifact => artifact.id === this.selectedArtifactId)
			?? this.session?.artifacts.at(-1);
	}
}
