/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	AiEditorAccountRole,
	AiEditorAccountState,
	IAiEditorSafeStatus
} from '../../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import {
	AiEditorAccountMenuCommandId,
	getAiEditorAccountMenuItems,
	isAiEditorProductAccountEnabled,
	resolveAiEditorProductAccountService
} from '../../browser/aiEditorAccountMenu.js';

suite('AI Editor account menu', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enables the product account replacement in development and configured products', () => {
		assert.strictEqual(isAiEditorProductAccountEnabled(false, undefined), true);
		assert.strictEqual(isAiEditorProductAccountEnabled(true, 'https://gateway.example.com'), true);
		assert.strictEqual(isAiEditorProductAccountEnabled(true, undefined), false);
	});

	test('does not instantiate the account service for an unconfigured product', () => {
		let resolveCalls = 0;
		const disabled = resolveAiEditorProductAccountService(true, undefined, () => ++resolveCalls);
		assert.strictEqual(disabled, undefined);
		assert.strictEqual(resolveCalls, 0);

		const configured = resolveAiEditorProductAccountService(true, 'https://gateway.example.com', () => ++resolveCalls);
		assert.strictEqual(configured, 1);
		assert.strictEqual(resolveCalls, 1);
	});

	test('shows only login and invitation registration while logged out', () => {
		assert.deepStrictEqual(
			commandIds(status(AiEditorAccountState.LoginRequired)),
			[
				AiEditorAccountMenuCommandId.Summary,
				AiEditorAccountMenuCommandId.Login,
				AiEditorAccountMenuCommandId.Register
			]
		);
	});

	test('shows retry without account or diagnostic actions when the service is unavailable', () => {
		assert.deepStrictEqual(
			commandIds(status(AiEditorAccountState.ServiceUnavailable)),
			[AiEditorAccountMenuCommandId.Summary, AiEditorAccountMenuCommandId.Retry]
		);
	});

	test('keeps password recovery and logout available without exposing administration actions', () => {
		assert.deepStrictEqual(
			commandIds(status(AiEditorAccountState.PasswordChangeRequired)),
			[
				AiEditorAccountMenuCommandId.Summary,
				AiEditorAccountMenuCommandId.OpenSecurity,
				AiEditorAccountMenuCommandId.Logout
			]
		);
	});

	test('limits ordinary users to their account, security and logout', () => {
		assert.deepStrictEqual(
			commandIds(readyStatus(AiEditorAccountRole.User)),
			[
				AiEditorAccountMenuCommandId.Summary,
				AiEditorAccountMenuCommandId.OpenAccount,
				AiEditorAccountMenuCommandId.OpenSecurity,
				AiEditorAccountMenuCommandId.Logout
			]
		);
	});

	test('adds organization actions for level 2 without provider or diagnostic access', () => {
		assert.deepStrictEqual(
			commandIds(readyStatus(AiEditorAccountRole.Level2)),
			[
				AiEditorAccountMenuCommandId.Summary,
				AiEditorAccountMenuCommandId.OpenAccount,
				AiEditorAccountMenuCommandId.OpenSecurity,
				AiEditorAccountMenuCommandId.OpenOrganization,
				AiEditorAccountMenuCommandId.OpenInvitations,
				AiEditorAccountMenuCommandId.OpenCredits,
				AiEditorAccountMenuCommandId.OpenUsage,
				AiEditorAccountMenuCommandId.Logout
			]
		);
	});

	test('adds provider and diagnostic actions only for level 1', () => {
		const items = getAiEditorAccountMenuItems(readyStatus(AiEditorAccountRole.Level1));
		assert.deepStrictEqual(
			items.map(item => item.id),
			[
				AiEditorAccountMenuCommandId.Summary,
				AiEditorAccountMenuCommandId.OpenAccount,
				AiEditorAccountMenuCommandId.OpenSecurity,
				AiEditorAccountMenuCommandId.OpenOrganization,
				AiEditorAccountMenuCommandId.OpenInvitations,
				AiEditorAccountMenuCommandId.OpenCredits,
				AiEditorAccountMenuCommandId.OpenUsage,
				AiEditorAccountMenuCommandId.OpenProviders,
				AiEditorAccountMenuCommandId.OpenDiagnostics,
				AiEditorAccountMenuCommandId.Logout
			]
		);
		assert.ok(items[0].label.includes('额度不受限'));
		assert.ok(!items[0].label.includes('100 积分'));
		assert.strictEqual(
			items.find(item => item.id === AiEditorAccountMenuCommandId.OpenOrganization)?.label,
			'组织与用户'
		);
		assert.strictEqual(
			items.find(item => item.id === AiEditorAccountMenuCommandId.OpenCredits)?.label,
			'组织额度'
		);
	});
});

function commandIds(value: IAiEditorSafeStatus): readonly AiEditorAccountMenuCommandId[] {
	return getAiEditorAccountMenuItems(value).map(item => item.id);
}

function readyStatus(role: AiEditorAccountRole): IAiEditorSafeStatus {
	return {
		...status(AiEditorAccountState.Ready),
		accountDisplay: 'Oscar',
		role,
		currentModel: 'gpt-mock',
		availableCredits: '100'
	};
}

function status(state: AiEditorAccountState): IAiEditorSafeStatus {
	return {
		state,
		checkedAt: 1,
		actions: []
	};
}
