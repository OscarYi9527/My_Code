/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import {
	AI_EDITOR_ACCOUNT_STATUS_REFRESH_INTERVAL,
	AiEditorAccountState,
	AiEditorManagementRoute,
	createAiEditorAccountUnavailableStatus,
	createAiEditorTurnGateResult,
	IAiEditorAccountService,
	IAiEditorAccountTransport,
	IAiEditorSafeStatus,
	IAiEditorTurnGateRequest,
	IAiEditorTurnGateResult
} from '../common/aiEditorAccount.js';

export interface IAiEditorAccountRendererServiceDependencies {
	readonly transport: IAiEditorAccountTransport;
	readonly openManagement: (route?: AiEditorManagementRoute) => Promise<void>;
	readonly now?: () => number;
	readonly isActive?: () => boolean;
	readonly setRefreshInterval?: (callback: () => void, delay: number) => unknown;
	readonly clearRefreshInterval?: (handle: unknown) => void;
}

export class AiEditorAccountRendererServiceCore extends Disposable implements IAiEditorAccountService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IAiEditorSafeStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly now: () => number;
	private status: IAiEditorSafeStatus;
	private refreshOperation: Promise<IAiEditorSafeStatus> | undefined;

	constructor(private readonly dependencies: IAiEditorAccountRendererServiceDependencies) {
		super();
		this.now = dependencies.now ?? Date.now;
		this.status = createAiEditorAccountUnavailableStatus(
			AiEditorAccountState.ServiceUnavailable,
			0,
			'account_status_not_checked'
		);

		this._register(dependencies.transport.onDidChangeStatus(status => this.updateStatus(status)));
		const setRefreshInterval = dependencies.setRefreshInterval ?? ((callback: () => void, delay: number) => globalThis.setInterval(callback, delay));
		const clearRefreshInterval = dependencies.clearRefreshInterval ?? (handle => globalThis.clearInterval(handle as ReturnType<typeof setInterval>));
		const refreshTimer = setRefreshInterval(() => {
			if (dependencies.isActive?.() !== false) {
				void this.getStatus({ force: true });
			}
		}, AI_EDITOR_ACCOUNT_STATUS_REFRESH_INTERVAL);
		this._register({ dispose: () => clearRefreshInterval(refreshTimer) });
		void this.getStatus({ force: true });
	}

	getStatus(options?: { readonly force?: boolean }): Promise<IAiEditorSafeStatus> {
		const isFresh = this.status.checkedAt > 0 && this.now() - this.status.checkedAt < AI_EDITOR_ACCOUNT_STATUS_REFRESH_INTERVAL;
		if (!options?.force && isFresh) {
			return Promise.resolve(this.status);
		}
		if (!this.refreshOperation) {
			this.refreshOperation = this.dependencies.transport.getStatus({ force: options?.force })
				.then(status => this.updateStatus(status))
				.catch(() => this.updateStatus(this.createIpcUnavailableStatus()))
				.finally(() => this.refreshOperation = undefined);
		}
		return this.refreshOperation;
	}

	async login(kind: 'login' | 'register'): Promise<IAiEditorSafeStatus> {
		try {
			return this.updateStatus(await this.dependencies.transport.login(kind));
		} catch {
			return this.updateStatus(this.createIpcUnavailableStatus());
		}
	}

	async logout(): Promise<void> {
		try {
			await this.dependencies.transport.logout();
			await this.getStatus({ force: true });
		} catch {
			this.updateStatus(this.createIpcUnavailableStatus());
		}
	}

	async canStartTurn(request: IAiEditorTurnGateRequest): Promise<IAiEditorTurnGateResult> {
		try {
			const result = await this.dependencies.transport.canStartTurn(request);
			this.updateStatus(result.status);
			return result;
		} catch {
			return createAiEditorTurnGateResult(this.updateStatus(this.createIpcUnavailableStatus()));
		}
	}

	openAccountManagement(route?: AiEditorManagementRoute): Promise<void> {
		return this.dependencies.openManagement(route);
	}

	async retryStatus(): Promise<IAiEditorSafeStatus> {
		try {
			return this.updateStatus(await this.dependencies.transport.retryStatus());
		} catch {
			return this.updateStatus(this.createIpcUnavailableStatus());
		}
	}

	private createIpcUnavailableStatus(): IAiEditorSafeStatus {
		return createAiEditorAccountUnavailableStatus(
			AiEditorAccountState.ServiceUnavailable,
			this.now(),
			'account_ipc_unavailable'
		);
	}

	private updateStatus(status: IAiEditorSafeStatus): IAiEditorSafeStatus {
		if (JSON.stringify(this.status) !== JSON.stringify(status)) {
			this.status = status;
			this._onDidChangeStatus.fire(status);
		}
		return this.status;
	}
}
