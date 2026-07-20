/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	PA_PACKAGE_MANIFEST_PATH,
	PA_REQUIRED_PACKAGE_DIRECTORIES,
	PA_REQUIRED_PACKAGE_FILES
} from '../../common/paCompatibility.js';
import { PaPublicationStatus } from '../../common/paRegistry.js';
import { PaManifest, PaRun } from '../../node/paContracts.js';
import { IPaPackageDraft, PaPackagePublisher, PaReleaseGateError } from '../../node/paPackagePublisher.js';
import { PaRegistryDatabase } from '../../node/paRegistryDatabase.js';

suite('PA package publisher', () => {
	let root: string;
	let database: PaRegistryDatabase;

	setup(async () => {
		root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pa-publisher-'));
		database = await PaRegistryDatabase.open(path.join(root, 'registry.sqlite'));
	});

	teardown(async () => {
		await database.dispose();
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	test('blocks publication when any release gate group fails', async () => {
		const publisher = new PaPackagePublisher(path.join(root, 'packages'), database);
		const draft = createDraft('profile-a', '0.1.0');
		draft.files = { 'Identity.md': '# Identity' };
		draft.evidence = {
			permissionsConfirmed: false,
			trialRunPassed: false,
			sourcesRecorded: false,
			changeSummary: ''
		};

		await assert.rejects(publisher.publish('profile-a', draft), error => {
			assert.ok(error instanceof PaReleaseGateError);
			assert.deepStrictEqual(
				error.checks.filter(check => !check.passed).map(check => check.id),
				['structure', 'permissions', 'trialAndProvenance']
			);
			return true;
		});
		assert.deepStrictEqual(await database.listGallery('profile-a'), []);
	});

	test('freezes the required package layout', () => {
		assert.strictEqual(PA_PACKAGE_MANIFEST_PATH, 'pa.json');
		assert.deepStrictEqual([...PA_REQUIRED_PACKAGE_FILES], ['Identity.md', 'Manifesto.md', 'Plan.md']);
		assert.deepStrictEqual([...PA_REQUIRED_PACKAGE_DIRECTORIES], [
			'DataObjects', 'AAList', 'CAList', 'Knowledge', 'BestPractice', 'Tests', 'assets'
		]);
	});

	test('publishes an immutable package and refreshes after SQLite registration', async () => {
		const refreshes: string[] = [];
		const publisher = new PaPackagePublisher(
			path.join(root, 'packages'),
			database,
			profileId => { refreshes.push(profileId); }
		);
		const result = await publisher.publish('profile-a', createDraft('profile-a', '0.1.0'));

		assert.strictEqual(await fs.promises.readFile(path.join(result.packagePath, 'Identity.md'), 'utf8'), '# Identity');
		assert.strictEqual(JSON.parse(await fs.promises.readFile(path.join(result.packagePath, 'pa.json'), 'utf8')).version, '0.1.0');
		assert.deepStrictEqual(refreshes, ['profile-a']);
		assert.deepStrictEqual((await database.listGallery('profile-a')).map(item => item.id), ['test.pa']);
		await assert.rejects(
			publisher.publish('profile-a', createDraft('profile-a', '0.1.0')),
			/immutable/
		);
	});

	test('rolls back the package and registry if Workbench refresh fails', async () => {
		const publisher = new PaPackagePublisher(path.join(root, 'packages'), database, () => {
			throw new Error('simulated refresh failure');
		});
		const draft = createDraft('profile-a', '0.1.0');

		await assert.rejects(publisher.publish('profile-a', draft), /simulated refresh failure/);

		assert.deepStrictEqual(await database.listGallery('profile-a'), []);
		const packagePath = path.join(root, 'packages', 'profile-a', draft.manifest.id, draft.manifest.version);
		assert.strictEqual(fs.existsSync(packagePath), false);
	});

	test('exports and imports a validated package across profiles', async () => {
		const publisher = new PaPackagePublisher(path.join(root, 'packages'), database);
		await publisher.publish('profile-a', createDraft('profile-a', '0.1.0'));
		const archive = path.join(root, 'exports', 'test-pa.zip');

		await publisher.exportVersion('profile-a', 'test.pa', '0.1.0', archive);
		assert.strictEqual(fs.existsSync(archive), true);
		await publisher.importPackage('profile-b', archive);

		assert.deepStrictEqual((await database.listGallery('profile-b')).map(item => ({
			id: item.id,
			version: item.version
		})), [{ id: 'test.pa', version: '0.1.0' }]);
	});

	test('supports unpublish, rollback, and guarded permanent deletion', async () => {
		const publisher = new PaPackagePublisher(path.join(root, 'packages'), database);
		await publisher.publish('profile-a', createDraft('profile-a', '0.1.0'));
		await publisher.publish('profile-a', createDraft('profile-a', '0.2.0'));

		assert.strictEqual(await database.setPublicationStatus(
			'profile-a',
			'test.pa',
			PaPublicationStatus.Unpublished,
			'2026-07-19T01:00:00.000Z'
		), true);
		assert.strictEqual((await database.listGallery('profile-a'))[0].status, PaPublicationStatus.Unpublished);
		assert.strictEqual(await database.rollbackToVersion(
			'profile-a',
			'test.pa',
			'0.1.0',
			'2026-07-19T01:01:00.000Z'
		), true);
		assert.strictEqual((await database.listGallery('profile-a'))[0].version, '0.1.0');

		const run = createActiveRun();
		await database.createRun(run, '2026-07-19T01:02:00.000Z');
		await assert.rejects(
			database.deleteArtifact('profile-a', 'test.pa', '2026-07-19T01:03:00.000Z'),
			/while a run is active/
		);
		assert.strictEqual((await database.listGallery('profile-a')).length, 1);

		await publisher.publish('profile-b', createDraft('profile-b', '0.1.0'));
		assert.strictEqual(await database.deleteArtifact(
			'profile-b',
			'test.pa',
			'2026-07-19T01:04:00.000Z'
		), true);
		assert.deepStrictEqual(await database.listGallery('profile-b'), []);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

function createDraft(profileId: string, version: string): IPaPackageDraft & {
	files: Record<string, string>;
	evidence: {
		permissionsConfirmed: boolean;
		trialRunPassed: boolean;
		sourcesRecorded: boolean;
		finalConfirmationId?: string;
		changeSummary: string;
	};
} {
	return {
		manifest: createManifest(profileId, version),
		files: {
			'Identity.md': '# Identity',
			'Manifesto.md': '# Manifesto',
			'Plan.md': '# Plan',
			'DataObjects/PublishedPAModule.json': '{}',
			'AAList/AA-01.md': '# AA-01',
			'CAList/CA-01.md': '# CA-01',
			'Knowledge/sources.json': '[]',
			'BestPractice/README.md': '# Best Practice',
			'Tests/release.test.json': '{}',
			'assets/icon.txt': 'sparkle'
		},
		evidence: {
			permissionsConfirmed: true,
			trialRunPassed: true,
			sourcesRecorded: true,
			finalConfirmationId: '11111111-1111-4111-8111-111111111111',
			changeSummary: `Publish ${version}.`
		}
	};
}

function createManifest(profileId: string, version: string): PaManifest {
	return {
		schemaVersion: '1.0',
		id: 'test.pa',
		kind: 'pa',
		name: 'Test PA',
		description: 'A published test PA.',
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
			responsibility: 'Produce a runnable PA module.',
			inputs: ['SourceMaterialCatalog'],
			outputs: ['PublishedPAModule'],
			dependsOn: [],
			tools: []
		}],
		checks: [{
			id: 'CA-01',
			name: 'Publication gate',
			target: 'PublishedPAModule',
			rules: ['Module is visible and runnable.'],
			failureRoute: 'AA-01',
			maxAutomaticCorrections: 2
		}],
		publication: {
			status: 'published',
			profileId,
			updatedAt: `2026-07-19T00:00:0${version === '0.1.0' ? '1' : '2'}.000Z`
		}
	};
}

function createActiveRun(): PaRun {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		paId: 'test.pa',
		paVersion: '0.1.0',
		profileId: 'profile-a',
		status: 'running',
		nodeStates: {
			'AA-01': { status: 'inProgress', attempts: 1 }
		},
		currentActivity: 'AA-01'
	};
}
