/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';

export const enum AiEditorGatewayNavigationDecision {
	AllowInView = 'allowInView',
	OpenExternal = 'openExternal',
	ImportCurrentCodexAccount = 'importCurrentCodexAccount',
	Block = 'block'
}

export const AI_EDITOR_IMPORT_CURRENT_CODEX_ACCOUNT_URL = 'ai-editor-code://import-current-codex-account';

export function decideAiEditorGatewayNavigation(
	rawUrl: string,
	gatewayOrigin: string,
	options: { readonly isNewWindow?: boolean } = {}
): AiEditorGatewayNavigationDecision {
	let url: URL;
	let origin: URL;
	try {
		url = new URL(rawUrl);
		origin = new URL(gatewayOrigin);
	} catch {
		return AiEditorGatewayNavigationDecision.Block;
	}

	if (
		url.protocol === 'ai-editor-code:' &&
		url.hostname === 'import-current-codex-account' &&
		(url.pathname === '' || url.pathname === '/') &&
		!url.username &&
		!url.password &&
		!url.port &&
		!url.search &&
		!url.hash
	) {
		return AiEditorGatewayNavigationDecision.ImportCurrentCodexAccount;
	}

	if (url.origin === origin.origin) {
		if (options.isNewWindow) {
			return AiEditorGatewayNavigationDecision.Block;
		}
		return isManagementPath(url.pathname)
			? AiEditorGatewayNavigationDecision.AllowInView
			: AiEditorGatewayNavigationDecision.Block;
	}

	if ((url.protocol === 'https:' || url.protocol === 'http:') && isApprovedExternalPath(url.pathname)) {
		return AiEditorGatewayNavigationDecision.OpenExternal;
	}
	return AiEditorGatewayNavigationDecision.Block;
}

export function createAiEditorManagementUrl(gatewayOrigin: string, route: string): string {
	const url = new URL('/admin', gatewayOrigin);
	url.hash = route;
	return url.toString();
}

function isManagementPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isApprovedExternalPath(pathname: string): boolean {
	return /(?:^|\/)(?:login|signin|authorize|oauth|help|support)(?:\/|$)/i.test(pathname);
}

export interface IAiEditorGatewayWebContents {
	readonly session: {
		on(event: 'will-download', listener: (event: { preventDefault(): void }, item: unknown, webContents: IAiEditorGatewayWebContents) => void): void;
		removeListener(event: 'will-download', listener: (event: { preventDefault(): void }, item: unknown, webContents: IAiEditorGatewayWebContents) => void): void;
	};
	getURL(): string;
	on(event: 'will-navigate' | 'will-redirect', listener: (event: { preventDefault(): void }, url: string) => void): void;
	removeListener(event: 'will-navigate' | 'will-redirect', listener: (event: { preventDefault(): void }, url: string) => void): void;
	once(event: 'destroyed', listener: () => void): void;
	removeListener(event: 'destroyed', listener: () => void): void;
	removeAllListeners(event: 'context-menu'): void;
	setWindowOpenHandler(handler: (details: { readonly url: string }) => { readonly action: 'deny' }): void;
}

export class AiEditorGatewayOriginPolicy extends Disposable {
	constructor(
		webContents: IAiEditorGatewayWebContents,
		gatewayOrigin: string,
		openExternal: (url: string) => Promise<void>,
		importCurrentCodexAccount?: () => Promise<void>
	) {
		super();

		// The management surface is not a general browser. Remove the integrated-browser context
		// menu before the page becomes interactive so sharing, inspection, and browser actions are
		// not offered for account data.
		webContents.removeAllListeners('context-menu');

		const handleNavigation = (event: { preventDefault(): void }, url: string) => {
			const decision = decideAiEditorGatewayNavigation(url, gatewayOrigin);
			if (decision === AiEditorGatewayNavigationDecision.AllowInView) {
				return;
			}
			event.preventDefault();
			if (decision === AiEditorGatewayNavigationDecision.OpenExternal) {
				void openExternal(url);
			} else if (
				decision === AiEditorGatewayNavigationDecision.ImportCurrentCodexAccount &&
				isTrustedManagementDocument(webContents.getURL(), gatewayOrigin)
			) {
				void importCurrentCodexAccount?.();
			}
		};
		webContents.on('will-navigate', handleNavigation);
		webContents.on('will-redirect', handleNavigation);
		this._register({
			dispose: () => {
				webContents.removeListener('will-navigate', handleNavigation);
				webContents.removeListener('will-redirect', handleNavigation);
			}
		});

		webContents.setWindowOpenHandler(details => {
			const decision = decideAiEditorGatewayNavigation(details.url, gatewayOrigin, { isNewWindow: true });
			if (decision === AiEditorGatewayNavigationDecision.OpenExternal) {
				void openExternal(details.url);
			} else if (
				decision === AiEditorGatewayNavigationDecision.ImportCurrentCodexAccount &&
				isTrustedManagementDocument(webContents.getURL(), gatewayOrigin)
			) {
				void importCurrentCodexAccount?.();
			}
			return { action: 'deny' };
		});
		this._register({ dispose: () => webContents.setWindowOpenHandler(() => ({ action: 'deny' })) });

		const handleDownload = (event: { preventDefault(): void }, _item: unknown, source: IAiEditorGatewayWebContents) => {
			if (source === webContents) {
				event.preventDefault();
			}
		};
		webContents.session.on('will-download', handleDownload);
		this._register({ dispose: () => webContents.session.removeListener('will-download', handleDownload) });

		const handleDestroyed = () => this.dispose();
		webContents.once('destroyed', handleDestroyed);
		this._register({ dispose: () => webContents.removeListener('destroyed', handleDestroyed) });
	}
}

function isTrustedManagementDocument(rawUrl: string, gatewayOrigin: string): boolean {
	return decideAiEditorGatewayNavigation(rawUrl, gatewayOrigin) === AiEditorGatewayNavigationDecision.AllowInView;
}
