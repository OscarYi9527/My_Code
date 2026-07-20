/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { IPaPublicationMainService } from '../../common/paPublication.js';
import { IPaGalleryItem, PaArtifactKind, PaPublicationStatus } from '../../common/paRegistry.js';
import { PaRegistryService } from '../../browser/paRegistryService.js';
import { PaRegistrySynchronizer } from '../../electron-browser/paPublicationService.js';

suite('PA registry synchronization', () => {
	test('hydrates the current profile during startup', async () => {
		const profiles = new TestProfileService('profile-a');
		const registry = new PaRegistryService(profiles.service);
		const remote = new TestPublicationMainService(profileId => Promise.resolve([createItem(`${profileId}.pa`)]));
		const synchronizer = new PaRegistrySynchronizer(remote, profiles.service, registry, new NullLogService());
		try {
			await synchronizer.whenInitialized;

			assert.deepStrictEqual(remote.requestedProfiles, ['profile-a']);
			assert.deepStrictEqual(registry.getPersonalItems().map(item => item.id), ['profile-a.pa']);
		} finally {
			synchronizer.dispose();
			registry.dispose();
			profiles.dispose();
		}
	});

	test('hydrates a newly selected profile and joins the profile change', async () => {
		const profiles = new TestProfileService('profile-a');
		const registry = new PaRegistryService(profiles.service);
		const remote = new TestPublicationMainService(profileId => Promise.resolve([createItem(`${profileId}.pa`)]));
		const synchronizer = new PaRegistrySynchronizer(remote, profiles.service, registry, new NullLogService());
		try {
			await synchronizer.whenInitialized;
			await profiles.switchTo('profile-b');

			assert.deepStrictEqual(remote.requestedProfiles, ['profile-a', 'profile-b']);
			assert.deepStrictEqual(registry.getPersonalItems().map(item => item.id), ['profile-b.pa']);
		} finally {
			synchronizer.dispose();
			registry.dispose();
			profiles.dispose();
		}
	});

	test('ignores a stale startup response after the current profile changes', async () => {
		const profileAResponse = new DeferredPromise<readonly IPaGalleryItem[]>();
		const profiles = new TestProfileService('profile-a');
		const registry = new PaRegistryService(profiles.service);
		const remote = new TestPublicationMainService(profileId =>
			profileId === 'profile-a'
				? profileAResponse.p
				: Promise.resolve([createItem('profile-b.pa')])
		);
		const synchronizer = new PaRegistrySynchronizer(remote, profiles.service, registry, new NullLogService());
		try {
			await profiles.switchTo('profile-b');
			profileAResponse.complete([createItem('stale.pa')]);
			await synchronizer.whenInitialized;

			assert.deepStrictEqual(registry.getPersonalItems().map(item => item.id), ['profile-b.pa']);
		} finally {
			synchronizer.dispose();
			registry.dispose();
			profiles.dispose();
		}
	});

	test('contains startup IPC failures and leaves the built-in projection available', async () => {
		const profiles = new TestProfileService('profile-a');
		const registry = new PaRegistryService(profiles.service);
		const remote = new TestPublicationMainService(() => Promise.reject(new Error('registry unavailable')));
		const synchronizer = new PaRegistrySynchronizer(remote, profiles.service, registry, new NullLogService());
		try {
			await synchronizer.whenInitialized;

			assert.deepStrictEqual(registry.getPersonalItems(), []);
			assert.strictEqual(registry.getGalleryItems().length, 1);
		} finally {
			synchronizer.dispose();
			registry.dispose();
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

	async switchTo(id: string): Promise<void> {
		const joined: Promise<void>[] = [];
		const previous = this.profile;
		this.profile = { id } as IUserDataProfile;
		this.emitter.fire({
			previous,
			profile: this.profile,
			join: promise => joined.push(promise)
		});
		await Promise.all(joined);
	}

	dispose(): void {
		this.emitter.dispose();
	}
}

class TestPublicationMainService implements IPaPublicationMainService {
	readonly _serviceBrand: undefined;
	readonly requestedProfiles: string[] = [];

	constructor(
		private readonly galleryProvider: (profileId: string) => Promise<readonly IPaGalleryItem[]>
	) { }

	listGallery(profileId: string): Promise<readonly IPaGalleryItem[]> {
		this.requestedProfiles.push(profileId);
		return this.galleryProvider(profileId);
	}

	publish(): never { throw new Error('Not implemented.'); }
	listVersions(): never { throw new Error('Not implemented.'); }
	setStatus(): never { throw new Error('Not implemented.'); }
	rollback(): never { throw new Error('Not implemented.'); }
	deleteArtifact(): never { throw new Error('Not implemented.'); }
	exportVersion(): never { throw new Error('Not implemented.'); }
	importPackage(): never { throw new Error('Not implemented.'); }
}

function createItem(id: string): IPaGalleryItem {
	return {
		id,
		kind: PaArtifactKind.Pa,
		name: id,
		description: `${id} description`,
		iconId: 'circuit-board',
		version: '0.1.0',
		status: PaPublicationStatus.Published,
		updatedAt: '2026-07-20T00:00:00.000Z'
	};
}
