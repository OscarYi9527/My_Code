/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import {
	BUILTIN_PA_CREATOR_ID,
	CREATE_PA_ACTION_ID,
	IPaGalleryItem,
	PaArtifactKind,
	PaPublicationStatus
} from '../../common/paRegistry.js';
import { PaRegistryService } from '../../browser/paRegistryService.js';

suite('PaRegistryService', () => {
	test('exposes PA Creator as the built-in plaza entry', () => {
		const profiles = new TestProfileService('profile-a');
		const service = new PaRegistryService(profiles.service);
		try {
			assert.deepStrictEqual(service.getGalleryItems(), [{
				id: BUILTIN_PA_CREATOR_ID,
				kind: PaArtifactKind.Pa,
				name: 'PA Creator',
				description: '创建、验证并发布新的流程智能体。',
				iconId: 'sparkle',
				version: '0.1.0',
				status: PaPublicationStatus.Published,
				updatedAt: '2026-07-18T00:00:00.000Z',
				primaryActionId: CREATE_PA_ACTION_ID
			}]);
		} finally {
			service.dispose();
			profiles.dispose();
		}
	});

	test('looks up entries without exposing runtime-only card fields', () => {
		const profiles = new TestProfileService('profile-a');
		const service = new PaRegistryService(profiles.service);
		try {
			const item = service.getGalleryItem(BUILTIN_PA_CREATOR_ID);

			assert.deepStrictEqual(
				item && Object.keys(item).sort(),
				['description', 'iconId', 'id', 'kind', 'name', 'primaryActionId', 'status', 'updatedAt', 'version']
			);
			assert.strictEqual(service.getGalleryItem('missing'), undefined);
		} finally {
			service.dispose();
			profiles.dispose();
		}
	});

	test('isolates personal creations and gallery visibility by current profile', () => {
		const profiles = new TestProfileService('profile-a');
		const service = new PaRegistryService(profiles.service);
		try {
			service.replaceProfileItems('profile-a', [
				createItem('profile-a.pa', PaArtifactKind.Pa, PaPublicationStatus.Published),
				createItem('profile-a.skill', PaArtifactKind.Skill, PaPublicationStatus.Published)
			]);
			service.replaceProfileItems('profile-b', [
				createItem('profile-b.pa', PaArtifactKind.Pa, PaPublicationStatus.Published)
			]);

			assert.deepStrictEqual(service.getPersonalItems().map(item => item.id), ['profile-a.pa', 'profile-a.skill']);
			assert.deepStrictEqual(service.getGalleryItems().map(item => item.id), [BUILTIN_PA_CREATOR_ID, 'profile-a.pa']);

			profiles.switchTo('profile-b');
			assert.deepStrictEqual(service.getPersonalItems().map(item => item.id), ['profile-b.pa']);
			assert.deepStrictEqual(service.getGalleryItems().map(item => item.id), [BUILTIN_PA_CREATOR_ID, 'profile-b.pa']);
		} finally {
			service.dispose();
			profiles.dispose();
		}
	});

	test('filters PA and Skill creations and unpublishes without deleting metadata', () => {
		const profiles = new TestProfileService('profile-a');
		const service = new PaRegistryService(profiles.service);
		try {
			service.replaceProfileItems('profile-a', [
				createItem('diagram.pa', PaArtifactKind.Pa, PaPublicationStatus.Published, 'Diagram Builder'),
				createItem('diagram.skill', PaArtifactKind.Skill, PaPublicationStatus.Draft, 'Diagram Review'),
				createItem('writer.pa', PaArtifactKind.Pa, PaPublicationStatus.Unpublished, 'Writer')
			]);

			assert.deepStrictEqual(service.getPersonalItems({
				kind: PaArtifactKind.Skill,
				status: PaPublicationStatus.Draft,
				query: 'diagram'
			}).map(item => item.id), ['diagram.skill']);

			assert.strictEqual(service.setPublicationStatus('diagram.pa', PaPublicationStatus.Unpublished), true);
			assert.strictEqual(service.getGalleryItem('diagram.pa'), undefined);
			assert.strictEqual(
				service.getPersonalItems().find(item => item.id === 'diagram.pa')?.status,
				PaPublicationStatus.Unpublished
			);
		} finally {
			service.dispose();
			profiles.dispose();
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

class TestProfileService {
	private readonly emitter = new Emitter<DidChangeUserDataProfileEvent>();
	private profile: IUserDataProfile;

	readonly service: IUserDataProfileService;

	constructor(id: string) {
		this.profile = { id } as IUserDataProfile;
		const owner = this;
		this.service = {
			_serviceBrand: undefined,
			get currentProfile() {
				return owner.profile;
			},
			onDidChangeCurrentProfile: this.emitter.event,
			updateCurrentProfile: async (profile: IUserDataProfile) => this.switchTo(profile.id)
		} as unknown as IUserDataProfileService;
	}

	switchTo(id: string): void {
		const previous = this.profile;
		this.profile = { id } as IUserDataProfile;
		this.emitter.fire({
			previous,
			profile: this.profile,
			join: () => undefined
		});
	}

	dispose(): void {
		this.emitter.dispose();
	}
}

function createItem(
	id: string,
	kind: PaArtifactKind,
	status: PaPublicationStatus,
	name = id
): IPaGalleryItem {
	return {
		id,
		kind,
		name,
		description: `${name} description`,
		iconId: kind === PaArtifactKind.Pa ? 'circuit-board' : 'tools',
		version: '0.1.0',
		status,
		updatedAt: '2026-07-19T00:00:00.000Z'
	};
}
