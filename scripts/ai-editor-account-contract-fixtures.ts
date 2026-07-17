/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

interface IAiEditorAccountStatusFixture {
	readonly state: string;
	readonly actions: readonly string[];
	readonly requiredFields: readonly string[];
	readonly forbiddenFields: readonly string[];
	readonly example: Record<string, unknown>;
}

interface IAiEditorAccountContractFixtures {
	readonly schemaVersion: number;
	readonly localAuthorization: {
		readonly headerName: string;
		readonly missingStatus: number;
		readonly missingErrorCode: string;
	};
	readonly statuses: readonly IAiEditorAccountStatusFixture[];
	readonly statusRetry: {
		readonly method: string;
		readonly path: string;
		readonly successStatuses: readonly number[];
	};
	readonly handoff: {
		readonly start: {
			readonly method: string;
			readonly path: string;
			readonly successStatuses: readonly number[];
			readonly request: { readonly state: string };
			readonly responseRequiredFields: readonly string[];
		};
		readonly complete: {
			readonly method: string;
			readonly path: string;
			readonly successStatuses: readonly number[];
			readonly request: {
				readonly deviceSessionId: string;
				readonly refreshToken: string;
				readonly accessToken: string;
				readonly accessTokenExpiresIn: number;
			};
			readonly response: {
				readonly status: string;
				readonly minimumBindingVersion: number;
			};
			readonly replayStatuses: readonly number[];
			readonly replayErrorCode: string;
		};
	};
	readonly webviewTicket: {
		readonly method: string;
		readonly path: string;
		readonly successStatuses: readonly number[];
		readonly responseRequiredFields: readonly string[];
	};
	readonly logout: {
		readonly method: string;
		readonly path: string;
		readonly successStatuses: readonly number[];
		readonly resultingState: string;
	};
	readonly models: {
		readonly method: string;
		readonly path: string;
		readonly successStatuses: readonly number[];
		readonly loggedOutStatuses: readonly number[];
		readonly loggedOutErrorCode: string;
		readonly example: {
			readonly object: string;
			readonly data: readonly {
				readonly id: string;
				readonly object: string;
				readonly owned_by: string;
			}[];
		};
	};
	readonly safeStatusForbiddenFields: readonly string[];
	readonly safeError: {
		readonly requiredFields: readonly string[];
		readonly forbiddenFields: readonly string[];
	};
	readonly reportSecretValues: readonly string[];
}

const defaultAiEditorAccountContractFixturePath = path.resolve(
	__dirname,
	'..',
	'specs',
	'002-ai-editor-account-gateway',
	'contracts',
	'fixtures',
	'edge-code-contract.json'
);

function loadAiEditorAccountContractFixtures(
	fixturePath = defaultAiEditorAccountContractFixturePath
): IAiEditorAccountContractFixtures {
	const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as IAiEditorAccountContractFixtures;
	assertFixtureContract(fixtures);
	return fixtures;
}

function assertFixtureContract(fixtures: IAiEditorAccountContractFixtures): void {
	const expectedStates = [
		'ready',
		'login_required',
		'account_unavailable',
		'service_unavailable',
		'password_change_required'
	];
	if (
		fixtures.schemaVersion !== 1 ||
		fixtures.localAuthorization.headerName !== 'X-AI-Editor-Local-Nonce' ||
		fixtures.localAuthorization.missingStatus !== 401 ||
		fixtures.statusRetry.path !== '/ai-editor/status/retry' ||
		fixtures.handoff.start.path !== '/ai-editor/handoff/start' ||
		fixtures.handoff.complete.path !== '/ai-editor/handoff/complete' ||
		fixtures.webviewTicket.path !== '/ai-editor/webview-ticket' ||
		fixtures.logout.path !== '/ai-editor/logout' ||
		fixtures.models.path !== '/v1/models' ||
		JSON.stringify(fixtures.statuses.map(fixture => fixture.state)) !== JSON.stringify(expectedStates)
	) {
		throw new Error(`Invalid AI Editor account contract fixture: ${defaultAiEditorAccountContractFixturePath}`);
	}

	for (const status of fixtures.statuses) {
		if (
			status.example.state !== status.state ||
			JSON.stringify(status.example.actions) !== JSON.stringify(status.actions) ||
			typeof status.example.checkedAt !== 'string'
		) {
			throw new Error(`Invalid AI Editor account status fixture: ${status.state}`);
		}
	}
	if (
		fixtures.models.example.object !== 'list' ||
		fixtures.models.example.data.length === 0 ||
		fixtures.models.example.data.some(model => !model.id)
	) {
		throw new Error('The AI Editor model-catalog fixture must contain at least one model.');
	}
}

module.exports = {
	defaultAiEditorAccountContractFixturePath,
	loadAiEditorAccountContractFixtures
};
