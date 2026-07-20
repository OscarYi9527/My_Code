/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export class PaCreatorEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.paCreator';
	static readonly EDITOR_ID = 'workbench.editor.paCreator';

	readonly resource: URI;

	constructor(readonly sessionId: string, private readonly title: string) {
		super();
		this.resource = URI.from({ scheme: 'pa-creator', path: `/${sessionId}` });
	}

	override get typeId(): string {
		return PaCreatorEditorInput.ID;
	}

	override get editorId(): string {
		return PaCreatorEditorInput.EDITOR_ID;
	}

	override getName(): string {
		return this.title;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override matches(other: EditorInput | unknown): boolean {
		return other instanceof PaCreatorEditorInput && other.sessionId === this.sessionId;
	}
}
