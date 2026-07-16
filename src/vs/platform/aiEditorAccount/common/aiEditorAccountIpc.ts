/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	AiEditorAccountAction,
	AiEditorAccountRole,
	AiEditorAccountState,
	IAiEditorSafeStatus
} from './aiEditorAccount.js';

export const AI_EDITOR_ACCOUNT_CHANNEL_NAME = 'aiEditorAccount';

export const AI_EDITOR_ACCOUNT_ENDPOINTS = Object.freeze({
	status: '/ai-editor/status',
	retryStatus: '/ai-editor/status/retry',
	handoffStart: '/ai-editor/handoff/start',
	handoffComplete: '/ai-editor/handoff/complete',
	webviewTicket: '/ai-editor/webview-ticket',
	logout: '/ai-editor/logout'
});

const stateMap: Readonly<Record<string, AiEditorAccountState>> = Object.freeze({
	ready: AiEditorAccountState.Ready,
	login_required: AiEditorAccountState.LoginRequired,
	account_unavailable: AiEditorAccountState.AccountUnavailable,
	service_unavailable: AiEditorAccountState.ServiceUnavailable,
	password_change_required: AiEditorAccountState.PasswordChangeRequired
});

const roles = new Set<string>([
	AiEditorAccountRole.Level1,
	AiEditorAccountRole.Level2,
	AiEditorAccountRole.User
]);

const actions = new Set<string>([
	AiEditorAccountAction.Login,
	AiEditorAccountAction.OpenAccount,
	AiEditorAccountAction.Retry,
	AiEditorAccountAction.OpenDiagnostics
]);

export function parseAiEditorSafeStatus(value: unknown): IAiEditorSafeStatus {
	const record = asRecord(value, 'status');
	const rawState = readString(record, 'state', true);
	const state = stateMap[rawState];
	if (!state) {
		throw new Error(`Unsupported AI Editor account state: ${rawState}`);
	}

	const checkedAtValue = record['checkedAt'];
	const checkedAt = typeof checkedAtValue === 'number'
		? checkedAtValue
		: Date.parse(readString(record, 'checkedAt', true));
	if (!Number.isFinite(checkedAt)) {
		throw new Error('The AI Editor account status has an invalid checkedAt value.');
	}

	const account = record['account'] === undefined ? undefined : asRecord(record['account'], 'account');
	const roleValue = account?.['role'];
	const role = typeof roleValue === 'string' && roles.has(roleValue) ? roleValue as AiEditorAccountRole : undefined;
	const rawActions = Array.isArray(record['actions']) ? record['actions'] : [];
	const safeActions = rawActions.filter((action): action is AiEditorAccountAction => typeof action === 'string' && actions.has(action));

	return {
		state,
		checkedAt,
		accountDisplay: readOptionalString(account, 'display'),
		role,
		currentModel: readOptionalString(record, 'currentModel'),
		availableCredits: readOptionalString(record, 'availableCredits'),
		errorId: readOptionalString(record, 'errorId'),
		actions: safeActions
	};
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`The AI Editor account ${name} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string, required: boolean): string {
	const candidate = value[key];
	if (typeof candidate === 'string' && candidate.length > 0) {
		return candidate;
	}
	if (required) {
		throw new Error(`The AI Editor account ${key} field is required.`);
	}
	return '';
}

function readOptionalString(value: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!value) {
		return undefined;
	}
	const candidate = value[key];
	return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
