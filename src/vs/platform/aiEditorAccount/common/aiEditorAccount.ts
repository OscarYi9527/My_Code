/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const AI_EDITOR_ACCOUNT_DEFAULT_EDGE_URL = 'http://127.0.0.1:47892';
export const AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL = 'http://127.0.0.1:47921';
export const AI_EDITOR_ACCOUNT_DEVELOPMENT_GATEWAY_URL = 'http://127.0.0.1:47920';

export const IAiEditorAccountService = createDecorator<IAiEditorAccountService>('aiEditorAccountService');

export const enum AiEditorAccountState {
	Ready = 'ready',
	LoginRequired = 'loginRequired',
	AccountUnavailable = 'accountUnavailable',
	ServiceUnavailable = 'serviceUnavailable',
	PasswordChangeRequired = 'passwordChangeRequired'
}

export const enum AiEditorAccountRole {
	Level1 = 'level1',
	Level2 = 'level2',
	User = 'user'
}

export const enum AiEditorAccountAction {
	Login = 'login',
	OpenAccount = 'openAccount',
	Retry = 'retry',
	OpenDiagnostics = 'openDiagnostics'
}

export const enum AiEditorManagementRoute {
	Account = 'account',
	Security = 'security',
	Organization = 'organization',
	Invitations = 'invitations',
	Usage = 'usage',
	Providers = 'providers',
	Diagnostics = 'diagnostics'
}

export interface IAiEditorSafeStatus {
	readonly state: AiEditorAccountState;
	readonly checkedAt: number;
	readonly accountDisplay?: string;
	readonly role?: AiEditorAccountRole;
	readonly currentModel?: string;
	readonly availableCredits?: string;
	readonly errorId?: string;
	readonly actions: readonly AiEditorAccountAction[];
}

export interface IAiEditorTurnGateRequest {
	readonly modelId: string;
	readonly sessionId: string;
	readonly clientTurnId: string;
}

export interface IAiEditorTurnGateResult {
	readonly allowed: boolean;
	readonly status: IAiEditorSafeStatus;
	readonly reason?: Exclude<AiEditorAccountState, AiEditorAccountState.Ready>;
}

export interface IAiEditorWebviewTicket {
	readonly ticket: string;
	readonly expiresIn: number;
}

export interface IAiEditorAccountService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeStatus: Event<IAiEditorSafeStatus>;

	getStatus(options?: { readonly force?: boolean }): Promise<IAiEditorSafeStatus>;
	login(kind: 'login' | 'register'): Promise<IAiEditorSafeStatus>;
	logout(): Promise<void>;
	canStartTurn(request: IAiEditorTurnGateRequest): Promise<IAiEditorTurnGateResult>;
	openAccountManagement(route?: AiEditorManagementRoute): Promise<void>;
	retryStatus(): Promise<IAiEditorSafeStatus>;
}

export interface IAiEditorAccountTransport {
	readonly onDidChangeStatus: Event<IAiEditorSafeStatus>;

	getStatus(options?: { readonly force?: boolean }): Promise<IAiEditorSafeStatus>;
	login(kind: 'login' | 'register'): Promise<IAiEditorSafeStatus>;
	logout(): Promise<void>;
	requestWebviewTicket(): Promise<IAiEditorWebviewTicket>;
}

export function createAiEditorTurnGateResult(status: IAiEditorSafeStatus): IAiEditorTurnGateResult {
	if (status.state === AiEditorAccountState.Ready) {
		return { allowed: true, status };
	}
	return { allowed: false, status, reason: status.state };
}

export function normalizeAiEditorAccountEdgeUrl(value: string | undefined, fallback = AI_EDITOR_ACCOUNT_DEFAULT_EDGE_URL): string {
	const candidate = value?.trim() || fallback;
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		throw new Error('The AI Editor Edge address must be a valid HTTP URL.');
	}

	if (url.protocol !== 'http:' || !isLoopbackHostname(url.hostname)) {
		throw new Error('The AI Editor Edge address must use HTTP on a loopback host.');
	}
	if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
		throw new Error('The AI Editor Edge address cannot contain credentials, a path, a query, or a fragment.');
	}
	return url.origin;
}

function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}
