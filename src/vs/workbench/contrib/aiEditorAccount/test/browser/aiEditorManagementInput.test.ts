/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AiEditorManagementRoute, IAiEditorManagementService } from '../../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
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

	test('can request preparation again when reopening the same route', () => {
		const input = createInput();
		try {
			let requests = 0;
			const listener = input.onDidChangeRoute(() => requests++);
			input.setRoute(AiEditorManagementRoute.Account);
			input.setRoute(AiEditorManagementRoute.Account, true);
			listener.dispose();

			assert.strictEqual(requests, 1);
		} finally {
			input.dispose();
		}
	});

	test('prepares the selected route through the browser-safe management service', async () => {
		const preparedRoutes: AiEditorManagementRoute[] = [];
		const input = createInput(preparedRoutes);
		try {
			input.setRoute(AiEditorManagementRoute.Usage);

			await input.prepareManagementView();

			assert.deepStrictEqual(preparedRoutes, [AiEditorManagementRoute.Usage]);
		} finally {
			input.dispose();
		}
	});
});

function createInput(preparedRoutes: AiEditorManagementRoute[] = []): AiEditorManagementInput {
	const browserInput = {
		dispose: () => undefined,
		resolve: () => Promise.resolve(undefined)
	} as unknown as BrowserEditorInput;
	const browserService = {
		onDidChangeBrowserViews: Event.None,
		getOrCreatePrivateLazy: () => browserInput
	} as unknown as IBrowserViewWorkbenchService;
	const managementService = {
		_serviceBrand: undefined,
		prepareManagementView: (_viewId: string, route: AiEditorManagementRoute) => {
			preparedRoutes.push(route);
			return Promise.resolve();
		},
		disposeManagementView: () => Promise.resolve()
	};
	return new AiEditorManagementInput(browserService, managementService as IAiEditorManagementService);
}
