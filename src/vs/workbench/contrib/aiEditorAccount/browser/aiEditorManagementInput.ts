/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import {
	AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
	AiEditorManagementRoute,
	IAiEditorManagementService
} from '../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';

export class AiEditorManagementInput extends EditorInput {
	static readonly ID = 'workbench.input.aiEditorManagement';
	static readonly EDITOR_ID = 'workbench.editor.aiEditorManagement';
	static readonly RESOURCE = URI.from({ scheme: 'ai-editor-management', path: '/account' });

	private readonly browserInput: BrowserEditorInput;
	private readonly _onDidChangeRoute = this._register(new Emitter<AiEditorManagementRoute>());
	readonly onDidChangeRoute: Event<AiEditorManagementRoute> = this._onDidChangeRoute.event;

	private _route = AiEditorManagementRoute.Account;

	constructor(
		@IBrowserViewWorkbenchService browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IAiEditorManagementService private readonly managementService: IAiEditorManagementService
	) {
		super();
		this.browserInput = browserViewWorkbenchService.getOrCreatePrivateLazy(AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID, {
			title: this.getName()
		});
	}

	get route(): AiEditorManagementRoute {
		return this._route;
	}

	setRoute(route: AiEditorManagementRoute): void {
		if (this._route === route) {
			return;
		}
		this._route = route;
		this._onDidChangeRoute.fire(route);
	}

	resolveBrowserModel(): Promise<IBrowserViewModel> {
		return this.browserInput.resolve();
	}

	prepareManagementView(): Promise<void> {
		return this.managementService.prepareManagementView(AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID, this._route);
	}

	override get typeId(): string {
		return AiEditorManagementInput.ID;
	}

	override get editorId(): string {
		return AiEditorManagementInput.EDITOR_ID;
	}

	override get resource(): URI {
		return AiEditorManagementInput.RESOURCE;
	}

	override getName(): string {
		return 'AI Editor 管理';
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof AiEditorManagementInput;
	}

	override dispose(): void {
		super.dispose();
		const model = this.browserInput.model;
		if (model) {
			void this.managementService.disposeManagementView(AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID)
				.finally(() => model.clearStorage())
				.finally(() => this.browserInput.dispose(true));
		} else {
			this.browserInput.dispose(true);
		}
	}
}
