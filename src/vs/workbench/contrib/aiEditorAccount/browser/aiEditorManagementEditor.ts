/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomFactor } from '../../../../base/browser/browser.js';
import { $, Dimension, IDomPosition } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AI_EDITOR_ACCOUNT_OPEN_MANAGEMENT_COMMAND_ID, AiEditorManagementRoute } from '../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorOpenContext } from '../../../common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../browserView/common/browserView.js';
import { AiEditorManagementInput } from './aiEditorManagementInput.js';

export class AiEditorManagementEditor extends EditorPane {
	static readonly ID = AiEditorManagementInput.EDITOR_ID;

	private readonly inputDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private message: HTMLElement | undefined;
	private model: IBrowserViewModel | undefined;
	private editorVisible = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(AiEditorManagementEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = $('.ai-editor-management-editor');
		this.container.style.position = 'relative';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
		this.container.tabIndex = 0;

		this.message = $('.ai-editor-management-message');
		this.message.style.display = 'flex';
		this.message.style.alignItems = 'center';
		this.message.style.justifyContent = 'center';
		this.message.style.width = '100%';
		this.message.style.height = '100%';
		this.message.textContent = localize('aiEditor.management.loading', "正在打开 AI Editor 管理...");
		this.container.appendChild(this.message);
		parent.appendChild(this.container);
	}

	override async setInput(input: AiEditorManagementInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.inputDisposables.clear();
		this.showMessage(localize('aiEditor.management.loading', "正在打开 AI Editor 管理..."));

		const model = await input.resolveBrowserModel();
		if (token.isCancellationRequested || this.input !== input) {
			return;
		}
		this.model = model;
		this.inputDisposables.add(model.onWillDispose(() => {
			if (this.model === model) {
				this.model = undefined;
			}
		}));
		this.inputDisposables.add(input.onDidChangeRoute(() => void this.prepare(input)));
		await this.prepare(input);
		this.layout();
		this.updateVisibility();
	}

	private async prepare(input: AiEditorManagementInput): Promise<void> {
		this.showMessage(localize('aiEditor.management.loading', "正在打开 AI Editor 管理..."));
		try {
			await input.prepareManagementView();
			this.hideMessage();
			this.updateVisibility();
		} catch {
			this.showMessage(localize(
				'aiEditor.management.unavailable',
				"AI Editor 管理暂不可用。请确认账号服务已启动，然后从账户菜单重试。"
			));
		}
	}

	override focus(): void {
		if (this.model) {
			void this.model.focus();
		} else {
			this.container?.focus();
		}
	}

	protected override setEditorVisible(visible: boolean): void {
		this.editorVisible = visible;
		this.updateVisibility();
	}

	override layout(_dimension?: Dimension, _position?: IDomPosition): void {
		if (!this.container || !this.model) {
			return;
		}
		const rect = this.container.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		void this.model.layout({
			windowId: this.group.windowId,
			x: rect.left,
			y: rect.top,
			width: rect.width,
			height: rect.height,
			zoomFactor: getZoomFactor(this.window),
			cornerRadius: 0
		});
	}

	override clearInput(): void {
		if (this.model) {
			void this.model.setVisible(false);
		}
		this.model = undefined;
		this.inputDisposables.clear();
		super.clearInput();
	}

	private updateVisibility(): void {
		if (this.model) {
			void this.model.setVisible(this.editorVisible && !this.message?.textContent);
		}
	}

	private showMessage(message: string): void {
		if (this.message) {
			this.message.textContent = message;
			this.message.style.display = 'flex';
		}
		this.updateVisibility();
	}

	private hideMessage(): void {
		if (this.message) {
			this.message.textContent = '';
			this.message.style.display = 'none';
		}
	}
}

class AiEditorManagementContribution extends DisposableStore implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorManagement';

	private input: AiEditorManagementInput | undefined;
	private readonly inputDisposeListener = this.add(new MutableDisposable());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();
		this.add(CommandsRegistry.registerCommand(AI_EDITOR_ACCOUNT_OPEN_MANAGEMENT_COMMAND_ID, (_accessor, route?: AiEditorManagementRoute) => this.open(route)));
	}

	private async open(route: AiEditorManagementRoute = AiEditorManagementRoute.Account): Promise<void> {
		if (!isManagementRoute(route)) {
			route = AiEditorManagementRoute.Account;
		}
		if (!this.input || this.input.isDisposed()) {
			this.input = this.instantiationService.createInstance(AiEditorManagementInput);
			this.inputDisposeListener.value = this.input.onWillDispose(() => {
				this.input = undefined;
				this.inputDisposeListener.clear();
			});
		}
		// The management editor is a singleton. Reopening the same route must
		// also retry preparation after a transient Edge, ticket, or navigation
		// failure; otherwise the existing editor remains permanently stuck on
		// its unavailable message.
		this.input.setRoute(route, true);
		await this.editorService.openEditor(this.input, { pinned: true });
	}
}

function isManagementRoute(route: AiEditorManagementRoute): boolean {
	switch (route) {
		case AiEditorManagementRoute.Account:
		case AiEditorManagementRoute.Security:
		case AiEditorManagementRoute.Organization:
		case AiEditorManagementRoute.Invitations:
		case AiEditorManagementRoute.Credits:
		case AiEditorManagementRoute.Usage:
		case AiEditorManagementRoute.Providers:
		case AiEditorManagementRoute.Diagnostics:
			return true;
		default:
			return false;
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		AiEditorManagementEditor,
		AiEditorManagementEditor.ID,
		localize('aiEditor.management.title', "AI Editor 管理")
	),
	[new SyncDescriptor(AiEditorManagementInput)]
);

registerWorkbenchContribution2(AiEditorManagementContribution.ID, AiEditorManagementContribution, WorkbenchPhase.AfterRestored);
