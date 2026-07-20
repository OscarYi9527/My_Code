/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PaPlazaEditorInput } from '../../browser/paPlazaEditorInput.js';

suite('PA Plaza editor input', () => {
	test('switches between plaza and personal creation routes in one editor', () => {
		const input = new PaPlazaEditorInput();
		const routes: string[] = [];
		const listener = input.onDidChangeRoute(route => routes.push(route));

		assert.strictEqual(input.route, 'plaza');
		assert.strictEqual(input.getName(), 'PA 广场');

		input.setRoute('personal');
		input.setRoute('personal');
		input.setRoute('plaza');

		assert.deepStrictEqual(routes, ['personal', 'plaza']);
		assert.strictEqual(input.getName(), 'PA 广场');
		listener.dispose();
		input.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
