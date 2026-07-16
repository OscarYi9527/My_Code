/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Server, ServerResponse } from 'http';
import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';

const DEFAULT_CALLBACK_TIMEOUT = 2 * 60_000;
const MAX_CALLBACK_REQUESTS = 20;

export interface IAiEditorAuthorizationCallback {
	readonly code: string;
}

export class AiEditorLoopbackCallbackError extends Error {
	constructor(readonly errorId: string) {
		super(errorId);
		this.name = 'AiEditorLoopbackCallbackError';
	}
}

export class AiEditorLoopbackCallbackServer extends Disposable {
	private readonly result = new DeferredPromise<IAiEditorAuthorizationCallback>();
	private requestCount = 0;
	private settled = false;
	private serverClosing = false;
	private timer: ReturnType<typeof setTimeout> | undefined;

	private constructor(
		private readonly server: Server,
		readonly redirectUri: string,
		private readonly expectedState: string
	) {
		super();
	}

	static async start(expectedState: string, timeoutMs = DEFAULT_CALLBACK_TIMEOUT): Promise<AiEditorLoopbackCallbackServer> {
		if (!expectedState) {
			throw new AiEditorLoopbackCallbackError('account_callback_state_missing');
		}

		const http = await import('http');
		const server = http.createServer();

		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});

		const address = server.address();
		if (!address || typeof address === 'string') {
			server.close();
			throw new AiEditorLoopbackCallbackError('account_callback_port_unavailable');
		}

		const callbackServer = new AiEditorLoopbackCallbackServer(
			server,
			`http://127.0.0.1:${address.port}/callback`,
			expectedState
		);
		server.on('request', (request, response) => callbackServer.handleRequest(request.url, request.method, request.headers.host, response));
		callbackServer.timer = setTimeout(
			() => callbackServer?.finishWithError('account_callback_timeout'),
			Math.max(1, timeoutMs)
		);
		return callbackServer;
	}

	waitForResult(): Promise<IAiEditorAuthorizationCallback> {
		return this.result.p;
	}

	override dispose(): void {
		if (!this.settled) {
			this.finishWithError('account_callback_cancelled');
		} else {
			this.closeServer();
		}
		super.dispose();
	}

	private handleRequest(requestUrl: string | undefined, method: string | undefined, host: string | undefined, response: ServerResponse): void {
		this.requestCount++;
		if (this.requestCount > MAX_CALLBACK_REQUESTS) {
			this.sendResponse(response, 429, 'Too many callback attempts.');
			this.finishWithError('account_callback_attempt_limit');
			return;
		}

		const expectedHost = new URL(this.redirectUri).host;
		if (host !== expectedHost) {
			this.sendResponse(response, 400, 'Invalid callback host.');
			return;
		}
		if (method !== 'GET') {
			this.sendResponse(response, 405, 'Only GET is accepted.');
			return;
		}

		let url: URL;
		try {
			url = new URL(requestUrl ?? '/', this.redirectUri);
		} catch {
			this.sendResponse(response, 400, 'Invalid callback request.');
			return;
		}
		if (url.pathname !== '/callback') {
			this.sendResponse(response, 404, 'Callback route not found.');
			return;
		}
		if (url.searchParams.get('state') !== this.expectedState) {
			this.sendResponse(response, 400, 'Invalid authorization state.');
			return;
		}

		const oauthError = url.searchParams.get('error');
		if (oauthError) {
			this.sendResponse(response, 400, 'AI Editor sign-in was not completed.');
			this.finishWithError(safeOAuthErrorId(oauthError));
			return;
		}

		const code = url.searchParams.get('code');
		if (!code) {
			this.sendResponse(response, 400, 'Authorization code missing.');
			this.finishWithError('account_callback_code_missing');
			return;
		}

		this.sendResponse(response, 200, 'AI Editor sign-in completed. You can close this browser tab.');
		this.settled = true;
		this.clearTimer();
		this.closeServer(() => this.result.complete({ code }));
	}

	private finishWithError(errorId: string): void {
		if (this.settled) {
			return;
		}
		this.settled = true;
		this.clearTimer();
		this.closeServer(() => this.result.error(new AiEditorLoopbackCallbackError(errorId)));
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private closeServer(onClosed?: () => void): void {
		if (this.serverClosing) {
			if (onClosed) {
				this.server.once('close', onClosed);
			}
			return;
		}
		if (!this.server.listening) {
			if (onClosed) {
				queueMicrotask(onClosed);
			}
			return;
		}
		this.serverClosing = true;
		this.server.close(onClosed);
	}

	private sendResponse(response: ServerResponse, statusCode: number, message: string): void {
		response.writeHead(statusCode, {
			'Cache-Control': 'no-store',
			'Connection': 'close',
			// eslint-disable-next-line local/code-no-unexternalized-strings -- Browser callback security policy, not visible UI.
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
			'Content-Type': 'text/html; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		});
		response.end(`<!doctype html><meta charset="utf-8"><title>AI Editor</title><main><h1>AI Editor</h1><p>${escapeHtml(message)}</p></main>`);
	}
}

function safeOAuthErrorId(value: string): string {
	switch (value) {
		case 'access_denied':
			return 'account_login_cancelled';
		case 'temporarily_unavailable':
			return 'account_login_temporarily_unavailable';
		default:
			return 'account_login_failed';
	}
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => {
		switch (character) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			default: return '&#39;';
		}
	});
}
