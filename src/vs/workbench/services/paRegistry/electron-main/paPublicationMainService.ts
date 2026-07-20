/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as fs from 'fs';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IPaGalleryItem, PaPublicationStatus } from '../common/paRegistry.js';
import {
	IPaPublicationDraft,
	IPaPublicationMainService,
	IPaPublicationResponse
} from '../common/paPublication.js';
import { PaManifestSchema } from '../node/paContracts.js';
import { PaPackagePublisher } from '../node/paPackagePublisher.js';
import { PaRegistryDatabase } from '../node/paRegistryDatabase.js';

export class PaPublicationMainService extends Disposable implements IPaPublicationMainService {
	readonly _serviceBrand: undefined;
	private readonly databasePromise: Promise<PaRegistryDatabase>;
	private readonly publisherPromise: Promise<PaPackagePublisher>;

	constructor(@IEnvironmentMainService environmentService: IEnvironmentMainService) {
		super();
		const root = join(environmentService.userDataPath, 'pa-registry');
		this.databasePromise = PaRegistryDatabase.open(join(root, 'registry.sqlite'));
		this.publisherPromise = this.databasePromise.then(database => new PaPackagePublisher(join(root, 'packages'), database));
	}

	async publish(profileId: string, draft: IPaPublicationDraft): Promise<IPaPublicationResponse> {
		const publisher = await this.publisherPromise;
		const result = await publisher.publish(profileId, {
			...draft,
			manifest: PaManifestSchema.parse(draft.manifest)
		});
		return { item: result.item, packagePath: result.packagePath };
	}

	async listGallery(profileId: string): Promise<readonly IPaGalleryItem[]> {
		return (await this.databasePromise).listGallery(profileId);
	}

	async listVersions(profileId: string, artifactId: string): Promise<readonly { version: string; createdAt: string }[]> {
		return (await this.databasePromise).listVersions(profileId, artifactId)
			.then(versions => versions.map(version => ({ version: version.item.version, createdAt: version.createdAt })));
	}

	async setStatus(profileId: string, artifactId: string, status: string): Promise<boolean> {
		if (status !== PaPublicationStatus.Draft
			&& status !== PaPublicationStatus.Published
			&& status !== PaPublicationStatus.Unpublished) {
			throw new Error(`Invalid PA publication status '${status}'.`);
		}
		return (await this.databasePromise).setPublicationStatus(
			profileId, artifactId, status as PaPublicationStatus, new Date().toISOString()
		);
	}

	async rollback(profileId: string, artifactId: string, version: string): Promise<boolean> {
		return (await this.databasePromise).rollbackToVersion(profileId, artifactId, version, new Date().toISOString());
	}

	async deleteArtifact(profileId: string, artifactId: string): Promise<boolean> {
		const database = await this.databasePromise;
		const versions = await database.listVersions(profileId, artifactId);
		const deleted = await database.deleteArtifact(profileId, artifactId, new Date().toISOString());
		if (deleted) {
			await Promise.all(versions.map(version => fs.promises.rm(version.packagePath, { recursive: true, force: true })));
		}
		return deleted;
	}

	async exportVersion(profileId: string, artifactId: string, version: string, targetZip: string): Promise<string> {
		return (await this.publisherPromise).exportVersion(profileId, artifactId, version, targetZip);
	}

	async importPackage(profileId: string, zipPath: string): Promise<IPaPublicationResponse> {
		const result = await (await this.publisherPromise).importPackage(profileId, zipPath);
		return { item: result.item, packagePath: result.packagePath };
	}

	override dispose(): void {
		void this.databasePromise.then(database => database.dispose());
		super.dispose();
	}
}
