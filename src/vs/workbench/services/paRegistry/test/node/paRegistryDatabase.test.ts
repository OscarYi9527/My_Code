/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PA_REGISTRY_SCHEMA_VERSION } from '../../common/paCompatibility.js';
import { IPaGalleryItem, PaArtifactKind, PaPublicationStatus } from '../../common/paRegistry.js';
import { PaCheckpoint, PaManifest, PaRun } from '../../node/paContracts.js';
import {
	paRegistryMigrations,
	PaRegistryDatabase,
	validatePaRegistryMigrations
} from '../../node/paRegistryDatabase.js';

suite('PA registry database', () => {
	test('freezes contiguous migrations at the supported registry schema', () => {
		validatePaRegistryMigrations();
		assert.strictEqual(PA_REGISTRY_SCHEMA_VERSION, 2);
		assert.deepStrictEqual(paRegistryMigrations.map(migration => migration.version), [1, 2]);
	});

	test('isolates gallery items by profile', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			await database.registerPublishedVersion(createVersionRecord('profile-a', '0.1.0'));
			await database.registerPublishedVersion(createVersionRecord('profile-b', '0.1.0'));

			assert.deepStrictEqual({
				profileA: await database.listGallery('profile-a'),
				profileB: await database.listGallery('profile-b')
			}, {
				profileA: [createGalleryItem('0.1.0')],
				profileB: [createGalleryItem('0.1.0')]
			});
		} finally {
			await database.dispose();
		}
	});

	test('keeps published versions immutable when a duplicate transaction fails', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			await database.registerPublishedVersion(createVersionRecord('profile-a', '0.1.0'));

			await assert.rejects(
				database.registerPublishedVersion(createVersionRecord('profile-a', '0.1.0')),
				/UNIQUE constraint failed/
			);

			assert.deepStrictEqual(await database.listGallery('profile-a'), [createGalleryItem('0.1.0')]);
		} finally {
			await database.dispose();
		}
	});

	test('persists checkpoints and advances the run atomically', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const run = createRun();
			const checkpoint = createCheckpoint(run.id);
			await database.createRun(run, '2026-07-18T00:00:00.000Z');
			await database.saveCheckpoint(checkpoint);

			assert.deepStrictEqual({
				run: await database.getRun(run.id),
				checkpoint: await database.getLatestCheckpoint(run.id)
			}, {
				run: {
					...run,
					nodeStates: checkpoint.nodeStates,
					latestCheckpointId: checkpoint.id
				},
				checkpoint
			});
		} finally {
			await database.dispose();
		}
	});

	test('rolls back a checkpoint for a missing run', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const checkpoint = createCheckpoint('11111111-1111-4111-8111-111111111111');

			await assert.rejects(database.saveCheckpoint(checkpoint), /FOREIGN KEY constraint failed/);

			assert.strictEqual(await database.getLatestCheckpoint(checkpoint.runId), undefined);
		} finally {
			await database.dispose();
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

function createVersionRecord(profileId: string, version: string) {
	const item = createGalleryItem(version);
	return {
		profileId,
		item,
		packagePath: `C:\\pa\\${profileId}\\${item.id}\\${version}`,
		manifest: createManifest(profileId, version),
		createdAt: '2026-07-18T00:00:00.000Z'
	};
}

function createGalleryItem(version: string): IPaGalleryItem {
	return {
		id: 'builtin.pa-creator',
		kind: PaArtifactKind.Pa,
		name: 'PA Creator',
		description: 'Creates Process Agents.',
		iconId: 'sparkle',
		version,
		status: PaPublicationStatus.Published,
		updatedAt: '2026-07-18T00:00:00.000Z',
		primaryActionId: 'aiEditor.pa.create'
	};
}

function createManifest(profileId: string, version: string): PaManifest {
	return {
		schemaVersion: '1.0',
		id: 'builtin.pa-creator',
		kind: 'pa',
		name: 'PA Creator',
		description: 'Creates Process Agents.',
		icon: 'sparkle',
		version,
		entryActivity: 'AA-01',
		hostCompatibility: { minVersion: '1.127.0' },
		structure: {
			identity: 'Identity.md',
			manifesto: 'Manifesto.md',
			plan: 'Plan.md',
			dataObjects: 'DataObjects',
			activities: 'AAList',
			checks: 'CAList',
			knowledge: 'Knowledge',
			bestPractice: 'BestPractice',
			tests: 'Tests',
			assets: 'assets'
		},
		capabilities: {
			modelAdapter: true,
			tools: [],
			permissions: []
		},
		dataObjects: [
			{
				name: 'SourceMaterialCatalog',
				schemaVersion: '1.0',
				producer: 'root',
				consumers: ['AA-01'],
				critical: false
			},
			{
				name: 'PublishedPAModule',
				schemaVersion: '1.0',
				producer: 'AA-01',
				consumers: [],
				critical: true
			}
		],
		activities: [{
			id: 'AA-01',
			name: 'Publish',
			responsibility: 'Publish the accepted PA.',
			inputs: ['SourceMaterialCatalog'],
			outputs: ['PublishedPAModule'],
			dependsOn: [],
			tools: []
		}],
		checks: [{
			id: 'CA-01',
			name: 'Publication Gate',
			target: 'PublishedPAModule',
			rules: ['Module is visible and runnable.'],
			failureRoute: 'AA-01',
			maxAutomaticCorrections: 0
		}],
		publication: {
			status: 'published',
			profileId,
			updatedAt: '2026-07-18T00:00:00.000Z'
		}
	};
}

function createRun(): PaRun {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		paId: 'builtin.pa-creator',
		paVersion: '0.1.0',
		profileId: 'profile-a',
		status: 'running',
		nodeStates: {
			'AA-01': {
				status: 'inProgress',
				attempts: 1,
				startedAt: '2026-07-18T00:00:00.000Z'
			}
		},
		currentActivity: 'AA-01'
	};
}

function createCheckpoint(runId: string): PaCheckpoint {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		runId,
		sequence: 1,
		createdAt: '2026-07-18T00:00:01.000Z',
		nodeStates: {
			'AA-01': {
				status: 'completed',
				attempts: 1,
				startedAt: '2026-07-18T00:00:00.000Z',
				completedAt: '2026-07-18T00:00:01.000Z'
			}
		},
		artifactIds: [],
		confirmationIds: []
	};
}
