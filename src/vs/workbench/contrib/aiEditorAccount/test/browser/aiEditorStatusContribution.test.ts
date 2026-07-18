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
import { getAiEditorAccountStatusPresentation } from '../../browser/aiEditorStatusContribution.js';

suite('AI Editor account status contribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ready status includes only service state and safe credit usage summary', () => {
		const presentation = getAiEditorAccountStatusPresentation({
			...status(AiEditorAccountState.Ready),
			accountDisplay: 'Oscar',
			role: AiEditorAccountRole.User,
			currentModel: 'gpt-mock',
			availableCredits: '100',
			usedCreditsPercent: '25'
		});

		assert.ok(presentation.label.includes('AI 服务正常'));
		assert.ok(presentation.label.includes('100'));
		assert.ok(presentation.label.includes('25%'));
		assert.ok(!presentation.label.includes('Oscar'));
		assert.ok(!presentation.label.includes('gpt-mock'));
		assert.ok(!presentation.label.toLowerCase().includes('provider'));
		assert.ok(!presentation.label.includes('47921'));
	});

	test('service unavailable status keeps its label compact and exposes a safe error identifier in the tooltip', () => {
		const presentation = getAiEditorAccountStatusPresentation({
			...status(AiEditorAccountState.ServiceUnavailable),
			errorId: 'account_edge_unavailable'
		});

		assert.ok(!presentation.label.includes('account_edge_unavailable'));
		assert.ok(presentation.tooltip.includes('account_edge_unavailable'));
		assert.ok(presentation.tooltip.includes('重试'));
		assert.ok(!presentation.tooltip.includes('http://'));
	});

	test('login, account and password states have distinct safe labels', () => {
		const login = getAiEditorAccountStatusPresentation(status(AiEditorAccountState.LoginRequired));
		const unavailable = getAiEditorAccountStatusPresentation(status(AiEditorAccountState.AccountUnavailable));
		const password = getAiEditorAccountStatusPresentation(status(AiEditorAccountState.PasswordChangeRequired));

		assert.notStrictEqual(login.label, unavailable.label);
		assert.notStrictEqual(unavailable.label, password.label);
	});
});

function status(state: AiEditorAccountState): IAiEditorSafeStatus {
	return {
		state,
		checkedAt: 1,
		actions: []
	};
}
