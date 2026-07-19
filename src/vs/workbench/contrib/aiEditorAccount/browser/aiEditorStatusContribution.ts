/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import {
	AiEditorAccountRole,
	AiEditorAccountState,
	AiEditorManagementRoute,
	IAiEditorAccountService,
	IAiEditorSafeStatus
} from '../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { resolveAiEditorProductAccountService } from './aiEditorAccountMenu.js';

export const AI_EDITOR_ACCOUNT_STATUS_COMMAND_ID = 'aiEditor.account.runStatusAction';

export interface IAiEditorAccountStatusPresentation {
	readonly label: string;
	readonly tooltip: string;
}

export function getAiEditorAccountStatusPresentation(status: IAiEditorSafeStatus): IAiEditorAccountStatusPresentation {
	switch (status.state) {
		case AiEditorAccountState.Ready: {
			if (status.role === AiEditorAccountRole.Level1) {
				return {
					label: localize('aiEditor.account.status.readyLevel1', "AI 服务正常 · 一级管理员额度不受限"),
					tooltip: localize('aiEditor.account.status.readyLevel1Tooltip', "一级管理员账号不参与个人积分限制。点击管理组织与额度。")
				};
			}
			const credits = localize(
				'aiEditor.account.status.credits',
				" · 剩余额度 {0}",
				status.availableCredits
					? localize('aiEditor.account.status.creditsValue', "{0} 积分", status.availableCredits)
					: localize('aiEditor.account.status.creditsUnknown', "—")
			);
			const usage = localize(
				'aiEditor.account.status.usage',
				" · 已使用 {0}",
				status.usedCreditsPercent
					? localize('aiEditor.account.status.usageValue', "{0}%", status.usedCreditsPercent)
					: localize('aiEditor.account.status.usageUnknown', "—")
			);
			return {
				label: localize('aiEditor.account.status.ready', "AI 服务正常{0}{1}", credits, usage),
				tooltip: localize('aiEditor.account.status.readyTooltip', "AI Editor 账号可用。点击查看我的账号。")
			};
		}
		case AiEditorAccountState.LoginRequired:
			return {
				label: localize('aiEditor.account.status.loginRequired', "AI 服务：需要登录"),
				tooltip: localize('aiEditor.account.status.loginRequiredTooltip', "登录 AI Editor 账号后才能发送新的 AI 消息。")
			};
		case AiEditorAccountState.AccountUnavailable:
			return {
				label: localize('aiEditor.account.status.accountUnavailable', "AI 服务：账号不可用"),
				tooltip: withSafeErrorId(localize('aiEditor.account.status.accountUnavailableTooltip', "点击查看账号状态。"), status.errorId)
			};
		case AiEditorAccountState.ServiceUnavailable:
			return {
				label: localize('aiEditor.account.status.serviceUnavailable', "AI 服务：暂不可用"),
				tooltip: withSafeErrorId(localize('aiEditor.account.status.serviceUnavailableTooltip', "账号服务暂不可用。点击重试；本地编辑不受影响。"), status.errorId)
			};
		case AiEditorAccountState.PasswordChangeRequired:
			return {
				label: localize('aiEditor.account.status.passwordChangeRequired', "AI 服务：需要修改密码"),
				tooltip: localize('aiEditor.account.status.passwordChangeRequiredTooltip', "点击修改密码后再开始新的 AI 任务。")
			};
	}
}

function withSafeErrorId(label: string, errorId: string | undefined): string {
	return errorId ? localize('aiEditor.account.status.errorId', "{0} · 错误编号 {1}", label, errorId) : label;
}

export function shouldRefreshCodexModels(
	previous: IAiEditorSafeStatus | undefined,
	next: IAiEditorSafeStatus
): boolean {
	return next.state === AiEditorAccountState.Ready && previous?.state !== AiEditorAccountState.Ready;
}

export class AiEditorStatusContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorAccountStatus';

	private readonly menuItem = this._register(new MutableDisposable());
	private accountService: IAiEditorAccountService | undefined;
	private status: IAiEditorSafeStatus | undefined;
	private modelCatalogRefreshPending = true;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IAgentHostService private readonly agentHostService: IAgentHostService
	) {
		super();

		const accountService = resolveAiEditorProductAccountService(
			environmentService.isBuilt,
			productService.aiEditorAccountGatewayOrigin,
			() => instantiationService.invokeFunction(accessor => accessor.get(IAiEditorAccountService))
		);
		if (!accountService) {
			return;
		}

		this.accountService = accountService;
		this._register(CommandsRegistry.registerCommand(AI_EDITOR_ACCOUNT_STATUS_COMMAND_ID, () => this.runStatusAction()));
		this._register(accountService.onDidChangeStatus(status => this.updateStatus(status)));
		void accountService.getStatus().then(status => this.updateStatus(status));
	}

	private updateStatus(status: IAiEditorSafeStatus): void {
		if (status.state !== AiEditorAccountState.Ready) {
			this.modelCatalogRefreshPending = true;
		}
		const refreshModels = status.state === AiEditorAccountState.Ready
			&& (this.modelCatalogRefreshPending || shouldRefreshCodexModels(this.status, status));
		this.status = status;
		const presentation = getAiEditorAccountStatusPresentation(status);
		this.menuItem.value = MenuRegistry.appendMenuItem(MenuId.ChatInputStatus, {
			group: 'navigation',
			order: 100,
			command: {
				id: AI_EDITOR_ACCOUNT_STATUS_COMMAND_ID,
				title: presentation.label,
				tooltip: presentation.tooltip
			}
		});
		if (refreshModels) {
			this.modelCatalogRefreshPending = false;
			void this.agentHostService.refreshModels('codex').catch(() => {
				// Retry on the next 30-second account status update if the
				// Agent Host or Edge catalog is not ready immediately after login.
				this.modelCatalogRefreshPending = true;
			});
		}
	}

	private runStatusAction(): Promise<unknown> | undefined {
		const accountService = this.accountService;
		if (!accountService) {
			return undefined;
		}
		switch (this.status?.state) {
			case AiEditorAccountState.LoginRequired:
				return accountService.login('login');
			case AiEditorAccountState.ServiceUnavailable:
				return accountService.retryStatus();
			case AiEditorAccountState.Ready:
			case AiEditorAccountState.AccountUnavailable:
				return accountService.openAccountManagement(AiEditorManagementRoute.Account);
			case AiEditorAccountState.PasswordChangeRequired:
				return accountService.openAccountManagement(AiEditorManagementRoute.Security);
			default:
				return undefined;
		}
	}
}

registerWorkbenchContribution2(AiEditorStatusContribution.ID, AiEditorStatusContribution, WorkbenchPhase.AfterRestored);
