/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AiEditorLoopbackCallbackError,
	AiEditorLoopbackCallbackServer
} from '../../electron-main/loopbackCallbackServer.js';

suite('AI Editor Account loopback callback', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts exactly a matching state and returns the authorization code', async () => {
		const callback = store.add(await AiEditorLoopbackCallbackServer.start('expected-state', 5_000));

		const invalid = await requestCallback(`${callback.redirectUri}?state=wrong-state&code=wrong-code`);
		assert.strictEqual(invalid, 400);

		const accepted = await requestCallback(`${callback.redirectUri}?state=expected-state&code=one-time-code`);
		assert.strictEqual(accepted, 200);
		assert.deepStrictEqual(await callback.waitForResult(), { code: 'one-time-code' });
	});

	test('returns a stable safe error for an OAuth denial', async () => {
		const callback = store.add(await AiEditorLoopbackCallbackServer.start('expected-state', 5_000));
		const result = assert.rejects(callback.waitForResult(), error =>
			error instanceof AiEditorLoopbackCallbackError &&
			error.errorId === 'account_login_cancelled'
		);

		const denied = await requestCallback(`${callback.redirectUri}?state=expected-state&error=access_denied`);
		assert.strictEqual(denied, 400);
		await result;
	});

	test('closes after a bounded timeout', async () => {
		const callback = store.add(await AiEditorLoopbackCallbackServer.start('expected-state', 10));
		await assert.rejects(callback.waitForResult(), error =>
			error instanceof AiEditorLoopbackCallbackError &&
			error.errorId === 'account_callback_timeout'
		);
	});
});

async function requestCallback(url: string): Promise<number> {
	const http = await import('http');
	return new Promise<number>((resolve, reject) => {
		const request = http.get(url, { agent: false }, response => {
			response.resume();
			response.once('end', () => resolve(response.statusCode ?? 0));
		});
		request.once('error', reject);
	});
}
