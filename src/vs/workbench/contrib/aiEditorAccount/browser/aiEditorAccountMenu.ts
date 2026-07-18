/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import {
	AiEditorAccountRole,
	AiEditorAccountState,
	AiEditorManagementRoute,
	IAiEditorAccountService,
	IAiEditorSafeStatus
} from '../../../../platform/aiEditorAccount/common/aiEditorAccount.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';

export const AI_EDITOR_ACCOUNT_MENU_GROUP = '0_aiEditorAccount';

export const enum AiEditorAccountMenuCommandId {
	Summary = 'aiEditor.account.summary',
	Login = 'aiEditor.account.login',
	Register = 'aiEditor.account.register',
	OpenAccount = 'aiEditor.account.openAccount',
	OpenSecurity = 'aiEditor.account.openSecurity',
	OpenOrganization = 'aiEditor.account.openOrganization',
	OpenInvitations = 'aiEditor.account.openInvitations',
	OpenUsage = 'aiEditor.account.openUsage',
	OpenProviders = 'aiEditor.account.openProviders',
	OpenDiagnostics = 'aiEditor.account.openDiagnostics',
	Retry = 'aiEditor.account.retry',
	Logout = 'aiEditor.account.logout'
}

export interface IAiEditorAccountMenuItem {
	readonly id: AiEditorAccountMenuCommandId;
	readonly label: string;
	readonly enabled: boolean;
}

export function isAiEditorProductAccountEnabled(isBuilt: boolean, gatewayOrigin: string | undefined): boolean {
	return !isBuilt || !!gatewayOrigin;
}

export function resolveAiEditorProductAccountService<T>(
	isBuilt: boolean,
	gatewayOrigin: string | undefined,
	resolve: () => T
): T | undefined {
	return isAiEditorProductAccountEnabled(isBuilt, gatewayOrigin) ? resolve() : undefined;
}

export function getAiEditorAccountMenuItems(status: IAiEditorSafeStatus): readonly IAiEditorAccountMenuItem[] {
	switch (status.state) {
		case AiEditorAccountState.LoginRequired:
			return [
				menuItem(AiEditorAccountMenuCommandId.Summary, localize('aiEditor.account.menu.loggedOut', "未登录"), false),
				menuItem(AiEditorAccountMenuCommandId.Login, localize('aiEditor.account.menu.login', "登录")),
				menuItem(AiEditorAccountMenuCommandId.Register, localize('aiEditor.account.menu.register', "邀请码注册"))
			];
		case AiEditorAccountState.ServiceUnavailable:
			return [
				menuItem(AiEditorAccountMenuCommandId.Summary, localize('aiEditor.account.menu.serviceUnavailable', "账号服务不可用"), false),
				menuItem(AiEditorAccountMenuCommandId.Retry, localize('aiEditor.account.menu.retry', "重试"))
			];
		case AiEditorAccountState.AccountUnavailable:
			return [
				menuItem(AiEditorAccountMenuCommandId.Summary, localize('aiEditor.account.menu.accountUnavailable', "账号不可用"), false),
				menuItem(AiEditorAccountMenuCommandId.OpenAccount, localize('aiEditor.account.menu.openAccount', "查看我的账号")),
				menuItem(AiEditorAccountMenuCommandId.Logout, localize('aiEditor.account.menu.logout', "退出登录"))
			];
		case AiEditorAccountState.PasswordChangeRequired:
			return [
				menuItem(AiEditorAccountMenuCommandId.Summary, localize('aiEditor.account.menu.passwordChangeRequired', "需要修改密码"), false),
				menuItem(AiEditorAccountMenuCommandId.OpenSecurity, localize('aiEditor.account.menu.changePassword', "修改密码")),
				menuItem(AiEditorAccountMenuCommandId.Logout, localize('aiEditor.account.menu.logout', "退出登录"))
			];
		case AiEditorAccountState.Ready:
			return getReadyMenuItems(status);
	}
}

function getReadyMenuItems(status: IAiEditorSafeStatus): readonly IAiEditorAccountMenuItem[] {
	const items: IAiEditorAccountMenuItem[] = [
		menuItem(AiEditorAccountMenuCommandId.Summary, getReadySummary(status), false),
		menuItem(AiEditorAccountMenuCommandId.OpenAccount, localize('aiEditor.account.menu.myAccount', "我的账号")),
		menuItem(AiEditorAccountMenuCommandId.OpenSecurity, localize('aiEditor.account.menu.security', "设备与安全"))
	];

	if (status.role === AiEditorAccountRole.Level1 || status.role === AiEditorAccountRole.Level2) {
		items.push(
			menuItem(AiEditorAccountMenuCommandId.OpenOrganization, localize('aiEditor.account.menu.organization', "组织用户")),
			menuItem(AiEditorAccountMenuCommandId.OpenInvitations, localize('aiEditor.account.menu.invitations', "邀请码")),
			menuItem(AiEditorAccountMenuCommandId.OpenUsage, localize('aiEditor.account.menu.organizationUsage', "组织使用情况"))
		);
	}

	if (status.role === AiEditorAccountRole.Level1) {
		items.push(
			menuItem(AiEditorAccountMenuCommandId.OpenProviders, localize('aiEditor.account.menu.providers', "Provider 与路由")),
			menuItem(AiEditorAccountMenuCommandId.OpenDiagnostics, localize('aiEditor.account.menu.diagnostics', "系统诊断"))
		);
	}

	items.push(menuItem(AiEditorAccountMenuCommandId.Logout, localize('aiEditor.account.menu.logout', "退出登录")));
	return items;
}

function getReadySummary(status: IAiEditorSafeStatus): string {
	const display = status.accountDisplay ?? localize('aiEditor.account.menu.accountFallback', "AI Editor 用户");
	const role = getRoleLabel(status.role);
	const credits = status.availableCredits
		? localize('aiEditor.account.menu.creditsSummary', " · {0} 积分", status.availableCredits)
		: '';
	return localize('aiEditor.account.menu.readySummary', "{0} · {1}{2}", display, role, credits);
}

function getRoleLabel(role: AiEditorAccountRole | undefined): string {
	switch (role) {
		case AiEditorAccountRole.Level1:
			return localize('aiEditor.account.menu.level1', "一级管理员");
		case AiEditorAccountRole.Level2:
			return localize('aiEditor.account.menu.level2', "二级管理员");
		default:
			return localize('aiEditor.account.menu.user', "用户");
	}
}

function menuItem(id: AiEditorAccountMenuCommandId, label: string, enabled = true): IAiEditorAccountMenuItem {
	return { id, label, enabled };
}

export class AiEditorAccountMenuContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorAccountMenu';

	private readonly menuItems = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService
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

		this.registerCommands(accountService);
		this._register(accountService.onDidChangeStatus(status => this.updateMenu(status)));
		void accountService.getStatus().then(status => this.updateMenu(status));
	}

	private registerCommands(accountService: IAiEditorAccountService): void {
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.Summary, () => undefined));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.Login, () => accountService.login('login')));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.Register, () => accountService.login('register')));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenAccount, () => accountService.openAccountManagement(AiEditorManagementRoute.Account)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenSecurity, () => accountService.openAccountManagement(AiEditorManagementRoute.Security)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenOrganization, () => accountService.openAccountManagement(AiEditorManagementRoute.Organization)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenInvitations, () => accountService.openAccountManagement(AiEditorManagementRoute.Invitations)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenUsage, () => accountService.openAccountManagement(AiEditorManagementRoute.Usage)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenProviders, () => accountService.openAccountManagement(AiEditorManagementRoute.Providers)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.OpenDiagnostics, () => accountService.openAccountManagement(AiEditorManagementRoute.Diagnostics)));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.Retry, () => accountService.retryStatus()));
		this._register(CommandsRegistry.registerCommand(AiEditorAccountMenuCommandId.Logout, () => accountService.logout()));
	}

	private updateMenu(status: IAiEditorSafeStatus): void {
		const items = getAiEditorAccountMenuItems(status);
		const store = new DisposableStore();
		items.forEach((item, index) => {
			store.add(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
				group: AI_EDITOR_ACCOUNT_MENU_GROUP,
				order: index,
				command: {
					id: item.id,
					title: item.label,
					precondition: item.enabled ? undefined : ContextKeyExpr.false()
				}
			}));
		});
		this.menuItems.value = store;
	}
}

registerWorkbenchContribution2(AiEditorAccountMenuContribution.ID, AiEditorAccountMenuContribution, WorkbenchPhase.AfterRestored);
