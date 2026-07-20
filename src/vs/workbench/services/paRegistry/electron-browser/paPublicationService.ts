/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IPaPublicationDraft, IPaPublicationMainService, IPaPublicationResponse, IPaPublicationService, PA_PUBLICATION_CHANNEL_NAME } from '../common/paPublication.js';
import { IPaRegistryService } from '../common/paRegistry.js';

/**
 * Keeps the in-memory Workbench projection synchronized with the persisted,
 * profile-scoped registry owned by the main process.
 */
export class PaRegistrySynchronizer extends Disposable {
	readonly whenInitialized: Promise<void>;
	private readonly refreshGenerationByProfile = new Map<string, number>();

	constructor(
		private readonly remote: IPaPublicationMainService,
		private readonly profileService: IUserDataProfileService,
		private readonly registryService: IPaRegistryService,
		private readonly logService: ILogService
	) {
		super();
		this.whenInitialized = this.refreshProfile(this.profileService.currentProfile.id, true);
		this._register(this.profileService.onDidChangeCurrentProfile(event => {
			event.join(this.refreshProfile(event.profile.id, true));
		}));
	}

	async refreshProfile(profileId: string, requireCurrentProfile = false): Promise<void> {
		const generation = (this.refreshGenerationByProfile.get(profileId) ?? 0) + 1;
		this.refreshGenerationByProfile.set(profileId, generation);
		try {
			const items = await this.remote.listGallery(profileId);
			if (
				this.refreshGenerationByProfile.get(profileId) !== generation
				|| (requireCurrentProfile && this.profileService.currentProfile.id !== profileId)
			) {
				return;
			}
			this.registryService.replaceProfileItems(profileId, items);
		} catch (error) {
			this.logService.error(`Failed to hydrate PA registry for profile '${profileId}'.`, error);
		}
	}
}

export class PaPublicationService extends Disposable implements IPaPublicationService {
	readonly _serviceBrand: undefined;
	private readonly remote: IPaPublicationMainService;
	private readonly synchronizer: PaRegistrySynchronizer;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IUserDataProfileService private readonly profileService: IUserDataProfileService,
		@IPaRegistryService registryService: IPaRegistryService,
		@ILogService logService: ILogService
	) {
		super();
		this.remote = ProxyChannel.toService<IPaPublicationMainService>(mainProcessService.getChannel(PA_PUBLICATION_CHANNEL_NAME));
		this.synchronizer = this._register(new PaRegistrySynchronizer(this.remote, profileService, registryService, logService));
	}

	async publish(draft: IPaPublicationDraft): Promise<IPaPublicationResponse> {
		return this.runAndRefresh(profileId => this.remote.publish(profileId, draft));
	}

	listVersions(artifactId: string): Promise<readonly { version: string; createdAt: string }[]> {
		return this.remote.listVersions(this.profileService.currentProfile.id, artifactId);
	}

	async setStatus(artifactId: string, status: string): Promise<boolean> {
		return this.runAndRefresh(profileId => this.remote.setStatus(profileId, artifactId, status));
	}

	async rollback(artifactId: string, version: string): Promise<boolean> {
		return this.runAndRefresh(profileId => this.remote.rollback(profileId, artifactId, version));
	}

	async deleteArtifact(artifactId: string): Promise<boolean> {
		return this.runAndRefresh(profileId => this.remote.deleteArtifact(profileId, artifactId));
	}

	exportVersion(artifactId: string, version: string, targetZip: string): Promise<string> {
		return this.remote.exportVersion(this.profileService.currentProfile.id, artifactId, version, targetZip);
	}

	async importPackage(zipPath: string): Promise<IPaPublicationResponse> {
		return this.runAndRefresh(profileId => this.remote.importPackage(profileId, zipPath));
	}

	private async runAndRefresh<T>(operation: (profileId: string) => Promise<T>): Promise<T> {
		const profileId = this.profileService.currentProfile.id;
		const result = await operation(profileId);
		await this.synchronizer.refreshProfile(profileId);
		return result;
	}
}

class PaRegistryHydrationContribution {
	static readonly ID = 'workbench.contrib.paRegistryHydration';

	constructor(@IPaPublicationService _publicationService: IPaPublicationService) { }
}

registerSingleton(IPaPublicationService, PaPublicationService, InstantiationType.Eager);
registerWorkbenchContribution2(
	PaRegistryHydrationContribution.ID,
	PaRegistryHydrationContribution,
	WorkbenchPhase.AfterRestored
);
