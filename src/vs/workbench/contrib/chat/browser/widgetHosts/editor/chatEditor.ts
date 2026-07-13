/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditor.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as nls from '../../../../../../nls.js';
import { ITextResourceConfigurationService } from '../../../../../../editor/common/services/textResourceConfiguration.js';
import { IContextKeyService, IScopedContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { AbstractEditorWithViewState } from '../../../../../browser/parts/editor/editorWithViewState.js';
import { IEditorOpenContext } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../../../common/theme.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatModel, IChatModelInputState, IExportableChatData, ISerializableChatData } from '../../../common/model/chatModel.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../common/constants.js';
import { clearChatEditor } from '../../actions/chatClear.js';
import { AgentSessionsControl } from '../../agentSessions/agentSessionsControl.js';
import { AgentSessionProviders } from '../../agentSessions/agentSessions.js';
import { AgentSessionsFilter, AgentSessionsGrouping, AgentSessionsSorting } from '../../agentSessions/agentSessionsFilter.js';
import { IAgentSessionsService } from '../../agentSessions/agentSessionsService.js';
import { ChatEditorInput } from './chatEditorInput.js';
import { ChatWidget } from '../../widget/chatWidget.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';

export interface IChatEditorOptions extends IEditorOptions {
	/**
	 * Input state of the model when the editor is opened. Currently needed since
	 * new sessions are not persisted but may go away with
	 * https://github.com/microsoft/vscode/pull/278476 as input state is stored on the model.
	 */
	modelInputState?: IChatModelInputState;
	target?: { data: IExportableChatData | ISerializableChatData };
	title?: {
		preferred?: string;
		fallback?: string;
	};
}

export interface IChatEditorViewState {
	scrollTop: number;
}

export class ChatEditor extends AbstractEditorWithViewState<IChatEditorViewState> {
	private static readonly VIEW_STATE_KEY = 'chatEditorViewState';

	private _widget!: ChatWidget;
	public get widget(): ChatWidget {
		return this._widget;
	}
	private _scopedContextKeyService!: IScopedContextKeyService;
	override get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	private dimension = new dom.Dimension(0, 0);
	private _loadingContainer: HTMLElement | undefined;
	private _editorContainer: HTMLElement | undefined;
	private _taskHistoryContainer: HTMLElement | undefined;
	private _taskHistoryHeader: HTMLElement | undefined;
	private _taskHistoryControl: AgentSessionsControl | undefined;
	private _taskHistoryVisible = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatService private readonly chatService: IChatService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
	) {
		super(ChatEditorInput.EditorID, group, ChatEditor.VIEW_STATE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);
	}

	private async clear() {
		if (this.input) {
			return this.instantiationService.invokeFunction(clearChatEditor, this.input as ChatEditorInput);
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this._editorContainer = parent;
		// Ensure the container has position relative for the loading overlay
		parent.classList.add('chat-editor-relative');
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		ChatContextKeys.inChatEditor.bindTo(this._scopedContextKeyService).set(true);

		this._widget = this._register(
			scopedInstantiationService.createInstance(
				ChatWidget,
				ChatAgentLocation.Chat,
				undefined,
				{
					autoScroll: mode => mode !== ChatModeKind.Ask,
					renderFollowups: true,
					supportsFileReferences: true,
					clear: () => this.clear(),
					rendererOptions: {
						renderTextEditsAsSummary: (uri) => {
							return true;
						},
						referencesExpandedWhenEmptyResponse: false,
						progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
					},
					enableImplicitContext: true,
					enableWorkingSet: 'explicit',
					supportsChangingModes: true,
				},
				{
					listForeground: editorForeground,
					listBackground: editorBackground,
					overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
					inputEditorBackground: inputBackground,
					resultEditorBackground: editorBackground
				}));
		this._register(this.widget.onDidSubmitAgent(() => {
			this.group.pinEditor(this.input);
		}));
		this._register(this.widget.onDidChangeViewModel((e) => {
			if (e.currentSessionResource && this.input instanceof ChatEditorInput) {
				const newModel = this.chatService.getSession(e.currentSessionResource);
				if (newModel) {
					this.input.updateModel(newModel);
				}
			}
		}));
		this.widget.render(parent);
		this.widget.setVisible(true);
		this.createTaskHistory(parent, scopedInstantiationService);
	}

	private createTaskHistory(parent: HTMLElement, instantiationService: IInstantiationService): void {
		const historyContainer = this._taskHistoryContainer = dom.append(parent, dom.$('.chat-editor-task-history'));
		historyContainer.hidden = true;
		historyContainer.setAttribute('role', 'region');
		historyContainer.setAttribute('aria-label', nls.localize('chatEditor.workspaceTasks', "Tasks in Current Folder"));

		const header = this._taskHistoryHeader = dom.append(historyContainer, dom.$('.chat-editor-task-history-header'));
		const heading = dom.append(header, dom.$('span.chat-editor-task-history-title'));
		heading.textContent = nls.localize('chatEditor.workspaceTasks', "Tasks in Current Folder");

		const closeButton = dom.append(header, dom.$<HTMLButtonElement>('button.chat-editor-task-history-close'));
		closeButton.type = 'button';
		closeButton.title = nls.localize('chatEditor.closeWorkspaceTasks', "Close Task List");
		closeButton.setAttribute('aria-label', closeButton.title);
		closeButton.appendChild(renderIcon(Codicon.close));
		this._register(dom.addDisposableListener(closeButton, dom.EventType.CLICK, () => this.hideTaskHistory(true)));

		const controlContainer = dom.append(historyContainer, dom.$('.chat-editor-task-history-control'));
		const filter = this._register(instantiationService.createInstance(AgentSessionsFilter, {
			allowedProviders: [AgentSessionProviders.AgentHostCodex],
			groupResults: () => AgentSessionsGrouping.Date,
			sortResults: () => AgentSessionsSorting.Created,
			overrideExclude: session => session.providerType !== AgentSessionProviders.AgentHostCodex,
		}));
		const control = this._taskHistoryControl = this._register(instantiationService.createInstance(AgentSessionsControl, controlContainer, {
			source: 'chatEditorTaskHistory',
			filter,
			overrideStyles: {},
			disableHover: true,
			hideSessionBadge: true,
			showCreatedTime: true,
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
			overrideSessionOpenOptions: openEvent => ({
				...openEvent,
				sideBySide: true,
				editorOptions: {
					...openEvent.editorOptions,
					pinned: true,
					preserveFocus: false,
				}
			}),
			notifySessionOpened: () => this.hideTaskHistory(false),
		}));
		control.setVisible(false);
	}

	/**
	 * Shows or hides the tasks created for the current workspace by Codex Agent Host.
	 */
	async toggleTaskHistory(): Promise<void> {
		if (this._taskHistoryVisible) {
			this.hideTaskHistory(true);
			return;
		}

		if (!this._taskHistoryContainer || !this._taskHistoryControl) {
			return;
		}

		this._taskHistoryVisible = true;
		this._taskHistoryContainer.hidden = false;
		this._taskHistoryControl.setVisible(true);
		this.layoutTaskHistory();

		await this.agentSessionsService.model.resolve(AgentSessionProviders.AgentHostCodex);
		if (!this._taskHistoryVisible) {
			return;
		}

		await this._taskHistoryControl.update();
		this.layoutTaskHistory();
		this._taskHistoryControl.openFind();
	}

	private hideTaskHistory(focusChatInput: boolean): void {
		if (!this._taskHistoryContainer || !this._taskHistoryControl) {
			return;
		}

		this._taskHistoryVisible = false;
		this._taskHistoryControl.setVisible(false);
		this._taskHistoryControl.clearFocus();
		this._taskHistoryContainer.hidden = true;

		if (focusChatInput) {
			this.widget.focusInput();
		}
	}

	private layoutTaskHistory(): void {
		if (!this._taskHistoryVisible || !this._taskHistoryContainer || !this._taskHistoryControl || !this._taskHistoryHeader) {
			return;
		}

		const width = this._taskHistoryContainer.clientWidth;
		const height = Math.max(0, this._taskHistoryContainer.clientHeight - this._taskHistoryHeader.offsetHeight);
		this._taskHistoryControl.layout(height, width);
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);

		this.widget?.setVisible(visible);

		if (visible && this.widget) {
			this.widget.layout(this.dimension.height, this.dimension.width);
		}
	}

	public override focus(): void {
		super.focus();

		this.widget?.focusInput();
	}

	override clearInput(): void {
		this.widget.setModel(undefined);
		// Clear the bound-resource attribute while the rebind is in flight so
		// test automation can wait for the next `updateModel` cycle to finish
		// before acting on the editor.
		if (this._editorContainer) {
			delete this._editorContainer.dataset.boundChatResource;
		}
		super.clearInput();
	}

	private showLoadingInChatWidget(message: string): void {
		if (!this._editorContainer) {
			return;
		}

		// If already showing, just update text
		if (this._loadingContainer) {
			// eslint-disable-next-line no-restricted-syntax
			const existingText = this._loadingContainer.querySelector('.chat-loading-content span');
			if (existingText) {
				existingText.textContent = message;
				return; // aria-live will announce the text change
			}
			this.hideLoadingInChatWidget(); // unexpected structure
		}

		// Mark container busy for assistive technologies
		this._editorContainer.setAttribute('aria-busy', 'true');

		this._loadingContainer = dom.append(this._editorContainer, dom.$('.chat-loading-overlay'));
		// Accessibility: announce loading state politely without stealing focus
		this._loadingContainer.setAttribute('role', 'status');
		this._loadingContainer.setAttribute('aria-live', 'polite');
		// Rely on live region text content instead of aria-label to avoid duplicate announcements
		this._loadingContainer.tabIndex = -1; // ensure it isn't focusable
		const loadingContent = dom.append(this._loadingContainer, dom.$('.chat-loading-content'));
		const spinner = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
		spinner.setAttribute('aria-hidden', 'true');
		loadingContent.appendChild(spinner);
		const text = dom.append(loadingContent, dom.$('span'));
		text.textContent = message;
	}

	private hideLoadingInChatWidget(): void {
		if (this._loadingContainer) {
			this._loadingContainer.remove();
			this._loadingContainer = undefined;
		}
		if (this._editorContainer) {
			this._editorContainer.removeAttribute('aria-busy');
		}
	}

	override async setInput(input: ChatEditorInput, options: IChatEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Show loading indicator early for non-local sessions to prevent layout shifts
		let isContributedChatSession = false;
		const chatSessionType = input.getSessionType();
		if (chatSessionType !== localChatSessionType) {
			const loadingMessage = nls.localize('chatEditor.loadingSession', "Loading...");
			this.showLoadingInChatWidget(loadingMessage);
		}

		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			this.hideLoadingInChatWidget();
			return;
		}

		if (!this.widget) {
			throw new Error('ChatEditor lifecycle issue: no editor widget');
		}

		if (chatSessionType !== localChatSessionType) {
			try {
				await raceCancellationError(this.chatSessionsService.canResolveChatSession(chatSessionType), token);
				const contributions = this.chatSessionsService.getAllChatSessionContributions();
				const contribution = contributions.find(c => c.type === chatSessionType);
				if (contribution) {
					this.widget.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type, contribution.agentHostProviderId);
					isContributedChatSession = true;
				} else {
					this.widget.unlockFromCodingAgent();
				}
			} catch (error) {
				this.hideLoadingInChatWidget();
				throw error;
			}
		} else {
			this.widget.unlockFromCodingAgent();
		}

		try {
			const editorModel = await raceCancellationError(input.resolve(), token);

			if (!editorModel) {
				throw new Error(`Failed to get model for chat editor. resource: ${input.sessionResource}`);
			}

			// Hide loading state before updating model
			if (chatSessionType !== localChatSessionType) {
				this.hideLoadingInChatWidget();
			}

			if (options?.modelInputState) {
				editorModel.model.inputModel.setState(options.modelInputState);
			}

			this.updateModel(editorModel.model);

			const viewState = this.loadEditorViewState(input, context);
			if (viewState) {
				this._widget.scrollTop = viewState.scrollTop;
			}

			if (isContributedChatSession && options?.title?.preferred && input.sessionResource) {
				this.chatService.setChatSessionTitle(input.sessionResource, options.title.preferred);
			}
		} catch (error) {
			this.hideLoadingInChatWidget();
			throw error;
		}
	}

	private updateModel(model: IChatModel): void {
		this.widget.setModel(model);
		// Expose the bound chat resource on the DOM so test automation can
		// synchronize with the post-rebind state without polling timeouts.
		// Set AFTER `setModel` so observers see the attribute only once the
		// widget is fully attached to the loaded model. Mirrors the same
		// signal exposed by the Agents Window's `ChatView`.
		if (this._editorContainer) {
			this._editorContainer.dataset.boundChatResource = model.sessionResource.toString();
		}
	}

	protected computeEditorViewState(_resource: URI): IChatEditorViewState | undefined {
		if (!this._widget) {
			return undefined;
		}
		return { scrollTop: this._widget.scrollTop };
	}

	protected tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof ChatEditorInput;
	}

	protected toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as ChatEditorInput).sessionResource;
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		this.dimension = dimension;
		if (this.widget) {
			this.widget.layout(dimension.height, dimension.width);
		}
		this.layoutTaskHistory();
	}
}
