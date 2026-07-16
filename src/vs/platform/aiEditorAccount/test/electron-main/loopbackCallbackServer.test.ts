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

	test('allocates isolated random loopback ports for concurrent login flows', async () => {
		const first = store.add(await AiEditorLoopbackCallbackServer.start('first-state', 5_000));
		const second = store.add(await AiEditorLoopbackCallbackServer.start('second-state', 5_000));
		const firstUrl = new URL(first.redirectUri);
		const secondUrl = new URL(second.redirectUri);

		assert.strictEqual(firstUrl.protocol, 'http:');
		assert.strictEqual(firstUrl.hostname, '127.0.0.1');
		assert.strictEqual(firstUrl.pathname, '/callback');
		assert.ok(Number.isInteger(Number(firstUrl.port)) && Number(firstUrl.port) > 0);
		assert.strictEqual(secondUrl.protocol, 'http:');
		assert.strictEqual(secondUrl.hostname, '127.0.0.1');
		assert.strictEqual(secondUrl.pathname, '/callback');
		assert.ok(Number.isInteger(Number(secondUrl.port)) && Number(secondUrl.port) > 0);
		assert.notStrictEqual(firstUrl.port, secondUrl.port);

		assert.deepStrictEqual(
			await Promise.all([
				requestCallback(`${first.redirectUri}?state=first-state&code=first-code`),
				requestCallback(`${second.redirectUri}?state=second-state&code=second-code`)
			]),
			[200, 200]
		);
		assert.deepStrictEqual(await first.waitForResult(), { code: 'first-code' });
		assert.deepStrictEqual(await second.waitForResult(), { code: 'second-code' });
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
