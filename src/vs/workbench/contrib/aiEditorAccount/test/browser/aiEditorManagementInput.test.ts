/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AiEditorManagementRoute } from '../../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { IBrowserViewWorkbenchService } from '../../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../../browserView/common/browserEditorInput.js';
import { AiEditorManagementInput } from '../../browser/aiEditorManagementInput.js';

suite('AI Editor management input', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('is singleton, readonly and matches another management input', () => {
		const first = createInput();
		const second = createInput();
		try {
			assert.ok(first.capabilities & EditorInputCapabilities.Singleton);
			assert.ok(first.capabilities & EditorInputCapabilities.Readonly);
			assert.strictEqual(first.matches(second), true);
			assert.strictEqual(first.getName(), 'AI Editor 管理');
		} finally {
			first.dispose();
			second.dispose();
		}
	});

	test('updates the requested route without putting credentials in the editor resource', () => {
		const input = createInput();
		try {
			let route: AiEditorManagementRoute | undefined;
			const listener = input.onDidChangeRoute(value => route = value);
			input.setRoute(AiEditorManagementRoute.Diagnostics);
			listener.dispose();

			assert.strictEqual(route, AiEditorManagementRoute.Diagnostics);
			assert.strictEqual(input.resource.query, '');
			assert.strictEqual(input.resource.fragment, '');
		} finally {
			input.dispose();
		}
	});
});

function createInput(): AiEditorManagementInput {
	const browserInput = {
		dispose: () => undefined,
		resolve: () => Promise.resolve(undefined)
	} as unknown as BrowserEditorInput;
	const browserService = {
		onDidChangeBrowserViews: Event.None,
		getOrCreatePrivateLazy: () => browserInput
	} as unknown as IBrowserViewWorkbenchService;
	const channel = {
		call: () => Promise.resolve(undefined),
		listen: () => Event.None
	};
	const mainProcessService = {
		getChannel: () => channel
	} as unknown as IMainProcessService;
	return new AiEditorManagementInput(browserService, mainProcessService);
}
