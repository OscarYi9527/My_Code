/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import {
	BUILTIN_PA_CREATOR_ID,
	CREATE_PA_ACTION_ID,
	IPaCreationFilter,
	IPaGalleryItem,
	IPaRegistryService,
	PaArtifactKind,
	PaPublicationStatus
} from '../common/paRegistry.js';

const BUILTIN_GALLERY_ITEMS: readonly IPaGalleryItem[] = Object.freeze([
	Object.freeze({
		id: BUILTIN_PA_CREATOR_ID,
		kind: PaArtifactKind.Pa,
		name: 'PA Creator',
		description: localize('aiEditor.paCreator.description', "创建、验证并发布新的流程智能体。"),
		iconId: 'sparkle',
		version: '0.1.0',
		status: PaPublicationStatus.Published,
		updatedAt: '2026-07-18T00:00:00.000Z',
		primaryActionId: CREATE_PA_ACTION_ID
	})
]);

/**
 * Workbench projection of the profile-scoped local registry.
 *
 * The node/electron storage adapter replaces one profile projection after
 * reading SQLite. Keeping profile filtering in this service prevents a view
 * from accidentally retaining another profile's creation list.
 */
export class PaRegistryService extends Disposable implements IPaRegistryService {
	readonly _serviceBrand: undefined;
	private readonly itemsByProfile = new Map<string, readonly IPaGalleryItem[]>();
	private readonly _onDidChangeGallery = this._register(new Emitter<void>());
	readonly onDidChangeGallery = this._onDidChangeGallery.event;

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService
	) {
		super();
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
			this._onDidChangeGallery.fire();
		}));
	}

	getGalleryItems(): readonly IPaGalleryItem[] {
		return [
			...BUILTIN_GALLERY_ITEMS,
			...this.currentProfileItems().filter(item =>
				item.kind === PaArtifactKind.Pa && item.status === PaPublicationStatus.Published
			)
		];
	}

	getGalleryItem(id: string): IPaGalleryItem | undefined {
		return this.getGalleryItems().find(item => item.id === id);
	}

	getPersonalItems(filter: IPaCreationFilter = {}): readonly IPaGalleryItem[] {
		const query = filter.query?.trim().toLocaleLowerCase();
		return this.currentProfileItems().filter(item =>
			(!filter.kind || item.kind === filter.kind)
			&& (!filter.status || item.status === filter.status)
			&& (!query || item.name.toLocaleLowerCase().includes(query))
		);
	}

	replaceProfileItems(profileId: string, items: readonly IPaGalleryItem[]): void {
		if (!profileId) {
			throw new Error('PA registry profile ID cannot be empty.');
		}
		const uniqueIds = new Set<string>();
		const projection = items.map(item => {
			if (item.id === BUILTIN_PA_CREATOR_ID) {
				throw new Error('The built-in PA Creator cannot be replaced by a profile item.');
			}
			if (uniqueIds.has(item.id)) {
				throw new Error(`Duplicate PA registry item '${item.id}'.`);
			}
			uniqueIds.add(item.id);
			return Object.freeze({ ...item });
		});
		this.itemsByProfile.set(profileId, Object.freeze(projection));
		if (profileId === this.userDataProfileService.currentProfile.id) {
			this._onDidChangeGallery.fire();
		}
	}

	setPublicationStatus(id: string, status: PaPublicationStatus): boolean {
		const profileId = this.userDataProfileService.currentProfile.id;
		const items = this.currentProfileItems();
		const index = items.findIndex(item => item.id === id);
		if (index < 0) {
			return false;
		}
		const updated = [...items];
		updated[index] = Object.freeze({
			...updated[index],
			status,
			updatedAt: new Date().toISOString()
		});
		this.itemsByProfile.set(profileId, Object.freeze(updated));
		this._onDidChangeGallery.fire();
		return true;
	}

	private currentProfileItems(): readonly IPaGalleryItem[] {
		return this.itemsByProfile.get(this.userDataProfileService.currentProfile.id) ?? [];
	}
}

registerSingleton(IPaRegistryService, PaRegistryService, InstantiationType.Delayed);
