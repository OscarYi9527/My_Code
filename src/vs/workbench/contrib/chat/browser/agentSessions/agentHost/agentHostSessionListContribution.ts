/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostEnabledSettingId, claudePreferAgentHostSettingId, IAgentHostService, shouldSurfaceLocalAgentHostProvider, type AgentProvider } from '../../../../../../platform/agentHost/common/agentService.js';
import { type AgentInfo, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import type { IAgentSession } from '../agentSessionsModel.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { AgentHostSessionListController } from './agentHostSessionListController.js';
import { AgentHostSessionListStore } from './agentHostSessionListStore.js';

export class AgentHostSessionListContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSessionListContribution';

	private readonly _agentRegistrations = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	private readonly _archiveRollbackResources = new Set<string>();
	private readonly _archiveSyncGenerations = new Map<string, number>();

	private readonly _isSessionsWindow: boolean;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;

		if (this._isSessionsWindow || !this._configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		const sessionListStore = this._register(this._instantiationService.createInstance(AgentHostSessionListStore, this._agentHostService));

		this._register(this._agentSessionsService.onDidChangeSessionArchivedState(session => {
			this._handleSessionArchivedStateChange(session, sessionListStore);
		}));

		this._register(this._agentHostService.rootState.onDidChange(rootState => {
			this._handleRootStateChange(rootState, sessionListStore);
		}));

		this._register(this._agentHostService.onAgentHostStart(() => {
			sessionListStore.resetCache();
		}));

		const initialRootState = this._agentHostService.rootState.value;
		if (initialRootState && !(initialRootState instanceof Error)) {
			this._handleRootStateChange(initialRootState, sessionListStore);
		}

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			const relevantSetting = claudePreferAgentHostSettingId(this._isSessionsWindow);
			if (!e.affectsConfiguration(relevantSetting)) {
				return;
			}
			const current = this._agentHostService.rootState.value;
			if (current && !(current instanceof Error)) {
				this._handleRootStateChange(current, sessionListStore);
			}
		}));
	}

	private _handleSessionArchivedStateChange(session: IAgentSession, sessionListStore: AgentHostSessionListStore): void {
		const resourceKey = session.resource.toString();
		if (this._archiveRollbackResources.delete(resourceKey)) {
			return;
		}

		if (!session.resource.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
			return;
		}

		const provider = session.resource.scheme.substring(LOCAL_AGENT_HOST_SCHEME_PREFIX.length);
		if (!provider) {
			return;
		}

		const rawId = session.resource.path.substring(1);
		const isArchived = session.isArchived();
		const generation = (this._archiveSyncGenerations.get(resourceKey) ?? 0) + 1;
		this._archiveSyncGenerations.set(resourceKey, generation);

		void sessionListStore.setSessionArchived(provider, rawId, isArchived).catch(error => {
			this._logService.error(`[AgentHostSessionListContribution] Failed to ${isArchived ? 'archive' : 'restore'} ${resourceKey}`, error);

			// Do not overwrite a newer user action. If this is still the latest
			// requested state, restore the local model so the UI does not claim
			// a backend operation succeeded when it could not be dispatched.
			if (this._archiveSyncGenerations.get(resourceKey) === generation && session.isArchived() === isArchived) {
				this._archiveRollbackResources.add(resourceKey);
				session.setArchived(!isArchived);
			}
		}).finally(() => {
			if (this._archiveSyncGenerations.get(resourceKey) === generation) {
				this._archiveSyncGenerations.delete(resourceKey);
			}
		});
	}

	private _shouldRegisterAgent(provider: AgentProvider): boolean {
		return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
	}

	private _handleRootStateChange(rootState: RootState, sessionListStore: AgentHostSessionListStore): void {
		const allowed = rootState.agents.filter(agent => this._shouldRegisterAgent(agent.provider));
		const incoming = new Set(allowed.map(agent => agent.provider));

		for (const [provider] of this._agentRegistrations) {
			if (!incoming.has(provider)) {
				this._agentRegistrations.deleteAndDispose(provider);
			}
		}

		for (const agent of allowed) {
			if (!this._agentRegistrations.has(agent.provider)) {
				this._registerAgent(agent, sessionListStore);
			}
		}
	}

	private _registerAgent(agent: AgentInfo, sessionListStore: AgentHostSessionListStore): void {
		const store = new DisposableStore();
		this._agentRegistrations.set(agent.provider, store);

		const sessionType = `agent-host-${agent.provider}`;
		const listController = store.add(this._instantiationService.createInstance(AgentHostSessionListController, sessionType, agent.provider, sessionListStore, undefined, 'local'));

		store.add(this._chatSessionsService.registerChatSessionItemController(sessionType, listController));
		store.add(this._workingDirectoryResolver.registerResolver(sessionType, _sessionResource => undefined, sessionResource => listController.isNewSession(sessionResource)));
	}
}
