/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export type PaPlazaRoute = 'plaza' | 'personal';

export class PaPlazaEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.paPlaza';
	static readonly EDITOR_ID = 'workbench.editor.paPlaza';
	static readonly RESOURCE = URI.from({ scheme: 'pa-plaza', path: '/local' });

	private readonly _onDidChangeRoute = this._register(new Emitter<PaPlazaRoute>());
	readonly onDidChangeRoute: Event<PaPlazaRoute> = this._onDidChangeRoute.event;
	private _route: PaPlazaRoute = 'plaza';

	get route(): PaPlazaRoute {
		return this._route;
	}

	setRoute(route: PaPlazaRoute): void {
		if (this._route !== route) {
			this._route = route;
			this._onDidChangeRoute.fire(route);
			this._onDidChangeLabel.fire();
		}
	}

	override get typeId(): string {
		return PaPlazaEditorInput.ID;
	}

	override get editorId(): string {
		return PaPlazaEditorInput.EDITOR_ID;
	}

	override get resource(): URI {
		return PaPlazaEditorInput.RESOURCE;
	}

	override getName(): string {
		return this._route === 'plaza'
			? localize('aiEditor.pa.plaza.title', "PA 广场")
			: localize('aiEditor.pa.personalCreations.title', "个人创作");
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof PaPlazaEditorInput;
	}
}
