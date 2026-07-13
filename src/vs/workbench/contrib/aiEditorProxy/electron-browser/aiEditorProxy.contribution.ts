/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AiEditorProxyLifecycleState, IAiEditorProxyService, IAiEditorProxyStatus } from '../../../../platform/aiEditorProxy/common/aiEditorProxy.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

class AiEditorProxyContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.aiEditorProxy';

	private lastPromptedState: AiEditorProxyLifecycleState | undefined;

	constructor(
		@IAiEditorProxyService private readonly proxyService: IAiEditorProxyService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this._register(proxyService.onDidChangeStatus(status => this.handleStatus(status)));
		void proxyService.ensureRunning().then(status => this.handleStatus(status));
	}

	private handleStatus(status: IAiEditorProxyStatus): void {
		if (status.state !== AiEditorProxyLifecycleState.Failed && status.state !== AiEditorProxyLifecycleState.RunningUnconfigured) {
			this.lastPromptedState = undefined;
			return;
		}
		if (this.lastPromptedState === status.state) {
			return;
		}
		this.lastPromptedState = status.state;

		if (status.state === AiEditorProxyLifecycleState.RunningUnconfigured) {
			this.notificationService.prompt(
				Severity.Info,
				localize('aiEditor.proxy.unconfigured', "AI Proxy is running, but no upstream account is available."),
				[{
					label: localize('aiEditor.proxy.configure', "Configure Proxy"),
					run: () => this.proxyService.openAdmin()
				}, {
					label: localize('aiEditor.proxy.checkAgain', "Check Again"),
					run: () => this.proxyService.refreshStatus()
				}]
			);
			return;
		}

		this.notificationService.prompt(
			Severity.Error,
			localize('aiEditor.proxy.failed', "AI sessions are paused because the local AI Proxy could not be started. {0}", status.lastError ?? ''),
			[{
				label: localize('aiEditor.proxy.retry', "Retry"),
				run: () => this.proxyService.ensureRunning()
			}, {
				label: localize('aiEditor.proxy.openAdmin', "Open Proxy Admin"),
				run: () => this.proxyService.openAdmin()
			}],
			{ sticky: true }
		);
	}
}

registerWorkbenchContribution2(AiEditorProxyContribution.ID, AiEditorProxyContribution, WorkbenchPhase.AfterRestored);

registerAction2(class OpenAiEditorProxyAdminAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.proxy.openAdmin',
			title: localize2('aiEditor.proxy.openAdminCommand', "AI Editor: Open Proxy Admin"),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IAiEditorProxyService).openAdmin();
	}
});

registerAction2(class RestartAiEditorProxyAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.proxy.restart',
			title: localize2('aiEditor.proxy.restartCommand', "AI Editor: Restart Proxy"),
			f1: true
		});
	}

	run(accessor: ServicesAccessor): Promise<IAiEditorProxyStatus> {
		return accessor.get(IAiEditorProxyService).restart();
	}
});

registerAction2(class ShowAiEditorProxyStatusAction extends Action2 {
	constructor() {
		super({
			id: 'aiEditor.proxy.showStatus',
			title: localize2('aiEditor.proxy.showStatusCommand', "AI Editor: Show Proxy Status"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const proxyService = accessor.get(IAiEditorProxyService);
		const notificationService = accessor.get(INotificationService);
		const status = await proxyService.getStatus();
		notificationService.info(localize(
			'aiEditor.proxy.statusMessage',
			"AI Proxy status: {0}. Address: {1}. Restart attempts: {2}.",
			proxyStateLabel(status.state),
			status.baseUrl,
			status.restartAttempts
		));
	}
});

function proxyStateLabel(state: AiEditorProxyLifecycleState): string {
	switch (state) {
		case AiEditorProxyLifecycleState.Stopped: return localize('aiEditor.proxy.state.stopped', "Stopped");
		case AiEditorProxyLifecycleState.Starting: return localize('aiEditor.proxy.state.starting', "Starting");
		case AiEditorProxyLifecycleState.RunningUnconfigured: return localize('aiEditor.proxy.state.unconfigured', "Running without an upstream");
		case AiEditorProxyLifecycleState.Ready: return localize('aiEditor.proxy.state.ready', "Ready");
		case AiEditorProxyLifecycleState.Degraded: return localize('aiEditor.proxy.state.degraded', "Degraded");
		case AiEditorProxyLifecycleState.Restarting: return localize('aiEditor.proxy.state.restarting', "Restarting");
		case AiEditorProxyLifecycleState.Failed: return localize('aiEditor.proxy.state.failed', "Failed");
	}
}
