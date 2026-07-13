/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiEditorModeService = createDecorator<IAiEditorModeService>('aiEditorModeService');
export const AI_EDITOR_MODE_SETTING_ID = 'aiEditor.mode';
export const AI_EDITOR_SIMPLE_MODE_CONTEXT = new RawContextKey<boolean>('aiEditorSimpleMode', false);

export const enum AiEditorMode {
	Dev = 'dev',
	Simple = 'simple'
}

export interface IAiEditorModeService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeMode: Event<AiEditorMode>;

	getMode(): AiEditorMode;
	setMode(mode: AiEditorMode): void;
	toggleMode(): AiEditorMode;
}
