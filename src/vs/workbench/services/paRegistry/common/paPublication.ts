/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IPaGalleryItem } from './paRegistry.js';

export const PA_PUBLICATION_CHANNEL_NAME = 'paPublication';
export const PUBLISH_PA_CREATOR_SESSION_ACTION_ID = 'aiEditor.paCreator.publishSession';

export interface IPaPublicationDraft {
	readonly manifest: object;
	readonly files: Readonly<Record<string, string>>;
	readonly evidence: {
		readonly permissionsConfirmed: boolean;
		readonly trialRunPassed: boolean;
		readonly sourcesRecorded: boolean;
		readonly finalConfirmationId?: string;
		readonly changeSummary: string;
	};
}

export interface IPaPublicationResponse {
	readonly item: IPaGalleryItem;
	readonly packagePath: string;
}

export const IPaPublicationMainService = createDecorator<IPaPublicationMainService>('paPublicationMainService');
export interface IPaPublicationMainService {
	readonly _serviceBrand: undefined;
	publish(profileId: string, draft: IPaPublicationDraft): Promise<IPaPublicationResponse>;
	listGallery(profileId: string): Promise<readonly IPaGalleryItem[]>;
	listVersions(profileId: string, artifactId: string): Promise<readonly { version: string; createdAt: string }[]>;
	setStatus(profileId: string, artifactId: string, status: string): Promise<boolean>;
	rollback(profileId: string, artifactId: string, version: string): Promise<boolean>;
	deleteArtifact(profileId: string, artifactId: string): Promise<boolean>;
	exportVersion(profileId: string, artifactId: string, version: string, targetZip: string): Promise<string>;
	importPackage(profileId: string, zipPath: string): Promise<IPaPublicationResponse>;
}

export const IPaPublicationService = createDecorator<IPaPublicationService>('paPublicationService');
export interface IPaPublicationService {
	readonly _serviceBrand: undefined;
	publish(draft: IPaPublicationDraft): Promise<IPaPublicationResponse>;
	listVersions(artifactId: string): Promise<readonly { version: string; createdAt: string }[]>;
	setStatus(artifactId: string, status: string): Promise<boolean>;
	rollback(artifactId: string, version: string): Promise<boolean>;
	deleteArtifact(artifactId: string): Promise<boolean>;
	exportVersion(artifactId: string, version: string, targetZip: string): Promise<string>;
	importPackage(zipPath: string): Promise<IPaPublicationResponse>;
}
