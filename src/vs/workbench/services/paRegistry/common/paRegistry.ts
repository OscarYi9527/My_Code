/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IPaRegistryService = createDecorator<IPaRegistryService>('paRegistryService');

export const BUILTIN_PA_CREATOR_ID = 'builtin.pa-creator';
export const OPEN_PA_PLAZA_ACTION_ID = 'aiEditor.pa.openPlaza';
export const OPEN_PERSONAL_CREATIONS_ACTION_ID = 'aiEditor.pa.openPersonalCreations';
export const OPEN_PA_ACTION_ID = 'aiEditor.pa.open';
export const CREATE_PA_ACTION_ID = 'aiEditor.pa.create';
export const SHOW_PA_DETAILS_ACTION_ID = 'aiEditor.pa.showDetails';
export const EDIT_PA_ACTION_ID = 'aiEditor.pa.edit';
export const IMPORT_PA_ACTION_ID = 'aiEditor.pa.import';
export const EXPORT_PA_ACTION_ID = 'aiEditor.pa.export';
export const ROLLBACK_PA_ACTION_ID = 'aiEditor.pa.rollback';
export const SET_PA_PUBLICATION_STATUS_ACTION_ID = 'aiEditor.pa.setPublicationStatus';

export const enum PaArtifactKind {
	Pa = 'pa',
	Skill = 'skill'
}

export const enum PaPublicationStatus {
	Draft = 'draft',
	Published = 'published',
	Unpublished = 'unpublished'
}

/**
 * User-facing metadata that can be displayed by the local PA Plaza.
 *
 * Runtime model, tool, permission, and recent-run details are deliberately
 * excluded from this projection. Those details belong to the package and run
 * records, not to the plaza card.
 */
export interface IPaGalleryItem {
	readonly id: string;
	readonly kind: PaArtifactKind;
	readonly name: string;
	readonly description: string;
	readonly iconId: string;
	readonly version: string;
	readonly status: PaPublicationStatus;
	readonly updatedAt: string;
	readonly primaryActionId?: string;
}

export interface IPaCreationFilter {
	readonly kind?: PaArtifactKind;
	readonly status?: PaPublicationStatus;
	readonly query?: string;
}

export interface IPaRegistryService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGallery: Event<void>;

	getGalleryItems(): readonly IPaGalleryItem[];
	getGalleryItem(id: string): IPaGalleryItem | undefined;
	getPersonalItems(filter?: IPaCreationFilter): readonly IPaGalleryItem[];

	/**
	 * Replaces the persisted projection for one profile. The node/electron
	 * registry adapter calls this after loading or publishing SQLite records.
	 */
	replaceProfileItems(profileId: string, items: readonly IPaGalleryItem[]): void;
	setPublicationStatus(id: string, status: PaPublicationStatus): boolean;
}
