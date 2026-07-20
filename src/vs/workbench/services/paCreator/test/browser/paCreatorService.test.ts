/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { PaCreatorService } from '../../browser/paCreatorService.js';
import {
	PA_CREATOR_ACTIVITIES,
	PaCreatorSessionStatus,
	PaCreatorStepStatus
} from '../../common/paCreator.js';

suite('PA Creator workflow', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	test('defines nine single-responsibility AAs and exactly four mandatory confirmations', () => {
		assert.strictEqual(PA_CREATOR_ACTIVITIES.length, 9);
		assert.strictEqual(new Set(PA_CREATOR_ACTIVITIES.map(activity => activity.responsibility)).size, 9);
		assert.strictEqual(new Set(PA_CREATOR_ACTIVITIES.map(activity => activity.outputName)).size, 9);
		assert.deepStrictEqual(
			PA_CREATOR_ACTIVITIES.filter(activity => activity.requiresConfirmation).map(activity => activity.id),
			['AA-01', 'AA-03', 'AA-05', 'AA-08']
		);
	});

	test('runs one continuous session through four non-skippable confirmations', () => {
		const { service } = createService(disposables);
		let session = service.startSession({
			title: 'Report PA',
			requirement: 'Create a PA that turns source documents into a verified report.'
		});

		const confirmations: string[] = [];
		while (session.pendingConfirmation) {
			confirmations.push(session.pendingConfirmation.activityId);
			session = service.confirm(session.id, session.pendingConfirmation.id);
		}

		assert.deepStrictEqual(confirmations, ['AA-01', 'AA-03', 'AA-05', 'AA-08']);
		assert.strictEqual(session.status, PaCreatorSessionStatus.ReadyForPublication);
		assert.strictEqual(session.currentActivityId, 'AA-09');
		assert.deepStrictEqual(session.artifacts.map(artifact => artifact.activityId), PA_CREATOR_ACTIVITIES.map(activity => activity.id));
		assert.ok(session.artifacts.find(artifact => artifact.activityId === 'AA-07')?.detail.includes('pa.json'));
		assert.ok(session.artifacts.find(artifact => artifact.activityId === 'AA-07')?.detail.includes('CAList/'));
		session = service.completePublication(session.id, 'report.pa');
		assert.strictEqual(session.status, PaCreatorSessionStatus.Completed);
		assert.strictEqual(session.steps['AA-09'].status, PaCreatorStepStatus.Completed);
		assert.deepStrictEqual(service.getIncompleteSessions(), []);
	});

	test('pauses uncertain source interpretation before defining data objects', () => {
		const { service } = createService(disposables);
		let session = service.startSession({
			title: 'Knowledge PA',
			requirement: 'Create a PA from mixed source material.',
			sources: [{
				name: 'unordered.zip',
				uri: 'file:///unordered.zip',
				kind: 'archive',
				interpretation: 'The image order inside the archive is uncertain.',
				uncertain: true
			}]
		});
		session = service.confirm(session.id, session.pendingConfirmation!.id);

		assert.strictEqual(session.pendingConfirmation?.kind, 'sourceInterpretation');
		assert.strictEqual(session.pendingConfirmation?.activityId, 'AA-02');
		assert.strictEqual(session.steps['AA-03'].status, PaCreatorStepStatus.Pending);

		session = service.confirm(session.id, session.pendingConfirmation!.id);
		assert.strictEqual(session.pendingConfirmation?.activityId, 'AA-03');
		assert.strictEqual(session.sources[0].uncertain, false);
	});

	test('revision invalidates only the selected AA and downstream artifacts', () => {
		const { service } = createService(disposables);
		let session = service.startSession({ title: 'Review PA', requirement: 'Create a review workflow.' });
		session = service.confirm(session.id, session.pendingConfirmation!.id);
		session = service.confirm(session.id, session.pendingConfirmation!.id);
		session = service.confirm(session.id, session.pendingConfirmation!.id);
		assert.strictEqual(session.pendingConfirmation?.activityId, 'AA-08');
		const preservedIds = session.artifacts
			.filter(artifact => Number(artifact.activityId.slice(3)) < 5)
			.map(artifact => artifact.id);

		session = service.reviseFrom(session.id, 'AA-05', 'Add an independent evidence quality CA.');

		assert.strictEqual(session.pendingConfirmation?.activityId, 'AA-05');
		assert.deepStrictEqual(
			session.artifacts.filter(artifact => Number(artifact.activityId.slice(3)) < 5).map(artifact => artifact.id),
			preservedIds
		);
		assert.strictEqual(session.artifacts.some(artifact => artifact.activityId === 'AA-06'), false);
		assert.strictEqual(session.steps['AA-06'].status, PaCreatorStepStatus.Invalidated);
	});

	test('keeps unfinished sessions isolated by local profile', () => {
		const { service, profiles } = createService(disposables);
		const profileASession = service.startSession({ title: 'A', requirement: 'Profile A workflow.' });
		profiles.switchTo('profile-b');
		assert.deepStrictEqual(service.getIncompleteSessions(), []);
		const profileBSession = service.startSession({ title: 'B', requirement: 'Profile B workflow.' });
		assert.deepStrictEqual(service.getIncompleteSessions().map(session => session.id), [profileBSession.id]);
		profiles.switchTo('profile-a');
		assert.deepStrictEqual(service.getIncompleteSessions().map(session => session.id), [profileASession.id]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

function createService(disposables: DisposableStore): { service: PaCreatorService; profiles: TestProfileService } {
	const storage = disposables.add(new TestStorageService());
	const profiles = disposables.add(new TestProfileService('profile-a'));
	const service = disposables.add(new PaCreatorService(storage, profiles.service));
	return { service, profiles };
}

class TestProfileService extends DisposableStore {
	private readonly emitter = this.add(new Emitter<DidChangeUserDataProfileEvent>());
	private profile: IUserDataProfile;
	readonly service: IUserDataProfileService;

	constructor(id: string) {
		super();
		this.profile = { id } as IUserDataProfile;
		const owner = this;
		this.service = {
			_serviceBrand: undefined,
			get currentProfile() { return owner.profile; },
			onDidChangeCurrentProfile: this.emitter.event,
			updateCurrentProfile: async (profile: IUserDataProfile) => this.switchTo(profile.id)
		} as IUserDataProfileService;
	}

	switchTo(id: string): void {
		const previous = this.profile;
		this.profile = { id } as IUserDataProfile;
		this.emitter.fire({ previous, profile: this.profile, join: () => undefined });
	}
}
