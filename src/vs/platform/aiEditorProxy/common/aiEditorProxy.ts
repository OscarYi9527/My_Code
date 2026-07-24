/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL } from '../../aiEditorAccount/common/aiEditorAccount.js';

export const AI_EDITOR_PROXY_CHANNEL_NAME = 'aiEditorProxy';
export const AI_EDITOR_PROXY_BASE_URL_SETTING_ID = 'aiEditor.proxy.baseUrl';
export const AI_EDITOR_PROXY_AUTO_START_SETTING_ID = 'aiEditor.proxy.autoStart';
export const AI_EDITOR_PROXY_DIAGNOSTICS_SETTING_ID = 'aiEditor.proxy.diagnostics.enabled';
export const AI_EDITOR_PROXY_DEFAULT_BASE_URL = 'http://127.0.0.1:47892';

export const IAiEditorProxyService = createDecorator<IAiEditorProxyService>('aiEditorProxyService');

export const enum AiEditorProxyLifecycleState {
	Stopped,
	Starting,
	RunningUnconfigured,
	Ready,
	Degraded,
	Restarting,
	Failed
}

export interface IAiEditorProxyProviderStatus {
	readonly deepseek: boolean;
	readonly openaiApi: boolean;
	readonly chatgptSubscription: boolean;
	readonly relays: readonly string[];
}

export interface IAiEditorProxyStatus {
	readonly state: AiEditorProxyLifecycleState;
	readonly baseUrl: string;
	readonly providers?: IAiEditorProxyProviderStatus;
	readonly restartAttempts: number;
	readonly lastError?: string;
}

export interface IAiEditorProxyService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeStatus: Event<IAiEditorProxyStatus>;

	getStatus(): Promise<IAiEditorProxyStatus>;
	refreshStatus(): Promise<IAiEditorProxyStatus>;
	ensureRunning(): Promise<IAiEditorProxyStatus>;
	restart(): Promise<IAiEditorProxyStatus>;
	openAdmin(): Promise<void>;
}

export interface IAiEditorProxyHealthResponse {
	readonly status?: string;
	readonly service?: string;
	readonly mode?: string;
	readonly providers?: {
		readonly deepseek?: boolean;
		readonly 'openai-api'?: boolean;
		readonly 'chatgpt-sub'?: boolean;
		readonly relays?: readonly string[];
	};
}

export function normalizeAiEditorProxyBaseUrl(value: string | undefined): string {
	const candidate = value?.trim() || AI_EDITOR_PROXY_DEFAULT_BASE_URL;
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		throw new Error('The AI Editor Proxy address must be a valid HTTP URL.');
	}

	if (url.protocol !== 'http:') {
		throw new Error('The AI Editor Proxy address must use HTTP in this release.');
	}
	if (!isLoopbackHostname(url.hostname)) {
		throw new Error('The AI Editor Proxy address must use localhost, 127.0.0.1, or [::1].');
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error('The AI Editor Proxy address cannot contain credentials, a query, or a fragment.');
	}
	if (url.pathname !== '/' && url.pathname !== '') {
		throw new Error('The AI Editor Proxy address must not contain a path.');
	}

	return url.origin;
}

/**
 * During account/Gateway development the Agent Host must use the same isolated
 * Edge as the account service. Production deliberately omits this override:
 * its proxy address remains controlled by the product release configuration.
 */
export function resolveAiEditorAgentHostProxyBaseUrl(
	configuredBaseUrl: string | undefined,
	developmentEdgeOrigin: string | undefined,
	useDevelopmentDefault: boolean
): string {
	// In development, the account service and Agent Host must share the
	// repository-owned Edge. Falling back to the user-facing shared Proxy
	// default (47892) would silently bypass the isolated Gateway/Worker route
	// whenever Code was started without the preview helper script.
	const candidate = normalizeAiEditorProxyBaseUrl(
		developmentEdgeOrigin?.trim()
			|| (useDevelopmentDefault ? AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL : configuredBaseUrl)
	);
	if (useDevelopmentDefault && isSharedProxyBaseUrl(candidate)) {
		return AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL;
	}
	return candidate;
}

export function isLoopbackHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

function isSharedProxyBaseUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return isLoopbackHostname(url.hostname) && url.port === '47892';
	} catch {
		return false;
	}
}

export function parseAiEditorProxyProviderStatus(value: IAiEditorProxyHealthResponse | undefined): IAiEditorProxyProviderStatus {
	return {
		deepseek: value?.providers?.deepseek === true,
		openaiApi: value?.providers?.['openai-api'] === true,
		chatgptSubscription: value?.providers?.['chatgpt-sub'] === true,
		relays: Array.isArray(value?.providers?.relays) ? value.providers.relays.filter(relay => typeof relay === 'string') : []
	};
}

export function hasAvailableAiEditorProxyProvider(status: IAiEditorProxyProviderStatus): boolean {
	return status.deepseek || status.openaiApi || status.chatgptSubscription || status.relays.length > 0;
}
