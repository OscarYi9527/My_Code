/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CREATE_PA_ACTION_ID, IPaGalleryItem } from '../../../paRegistry/common/paRegistry.js';
import { PaManifestSchema } from '../../../paRegistry/node/paContracts.js';
import { PaPackagePublisher } from '../../../paRegistry/node/paPackagePublisher.js';
import { PaRegistryDatabase } from '../../../paRegistry/node/paRegistryDatabase.js';
import {
	IPaCreatorSession,
	PA_CREATOR_ACTIVITIES,
	PaCreatorSessionStatus,
	PaCreatorStepStatus
} from '../../common/paCreator.js';
import { createPaCreatorPublicationDraft } from '../../common/paCreatorPublication.js';

suite('PA Creator bootstrap acceptance', () => {
	let root: string;
	let database: PaRegistryDatabase;

	setup(async () => {
		root = await fs.promises.mkdtemp(join(os.tmpdir(), 'pa-bootstrap-'));
		database = await PaRegistryDatabase.open(join(root, 'registry.sqlite'));
	});

	teardown(async () => {
		await database.dispose();
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	test('publishes another discoverable and startable nine-AA PA Creator', async () => {
		let liveProjection: readonly IPaGalleryItem[] = [];
		const publisher = new PaPackagePublisher(join(root, 'packages'), database, async profileId => {
			liveProjection = await database.listGallery(profileId);
		});
		const session = createAcceptedCreatorSession();
		const rawDraft = createPaCreatorPublicationDraft(session);
		const result = await publisher.publish('profile-a', {
			...rawDraft,
			manifest: PaManifestSchema.parse(rawDraft.manifest)
		});

		const published = liveProjection.find(item => item.id === result.item.id);
		assert.ok(published);
		assert.strictEqual(published.primaryActionId, CREATE_PA_ACTION_ID);
		const manifest = (await database.listVersions('profile-a', result.item.id))[0].manifest;
		assert.strictEqual(manifest.entryActivity, 'AA-01');
		assert.strictEqual(manifest.activities.length, 9);
		assert.deepStrictEqual(manifest.activities.map(activity => activity.id), PA_CREATOR_ACTIVITIES.map(activity => activity.id));
		assert.strictEqual((await fs.promises.readdir(join(result.packagePath, 'AAList'))).length, 9);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

function createAcceptedCreatorSession(): IPaCreatorSession {
	const now = '2026-07-20T00:00:00.000Z';
	const steps = Object.fromEntries(PA_CREATOR_ACTIVITIES.map(activity => [
		activity.id,
		{
			activityId: activity.id,
			status: PaCreatorStepStatus.Completed,
			attempts: 1,
			artifactId: `10000000-0000-4000-8000-${activity.order.toString().padStart(12, '0')}`
		}
	]));
	return {
		id: '20000000-0000-4000-8000-000000000001',
		profileId: 'profile-a',
		title: 'PA Creator',
		status: PaCreatorSessionStatus.ReadyForPublication,
		currentActivityId: 'AA-09',
		createdAt: now,
		updatedAt: now,
		steps,
		sources: [],
		artifacts: PA_CREATOR_ACTIVITIES.map(activity => ({
			id: steps[activity.id].artifactId!,
			activityId: activity.id,
			name: activity.outputName,
			summary: `${activity.outputName}已生成`,
			detail: `# ${activity.outputName}`,
			createdAt: now
		})),
		messages: [{
			id: '30000000-0000-4000-8000-000000000001',
			role: 'user',
			activityId: 'AA-08',
			text: '已确认：确认发布',
			createdAt: now
		}]
	};
}
