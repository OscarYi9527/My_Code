/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	PA_CURRENT_HOST_VERSION,
	PA_MINIMUM_HOST_VERSION,
	PA_PACKAGE_SCHEMA_VERSION
} from '../../common/paCompatibility.js';
import { PaArtifactSchema, PaCheckpointSchema, PaManifest, PaRunSchema } from '../../node/paContracts.js';
import { PaManifestIssueCode, validatePaManifest } from '../../node/paManifestValidator.js';

suite('PA manifest contracts', () => {
	test('accepts a closed, acyclic manifest with CA coverage', () => {
		const result = validatePaManifest(createValidManifest());

		assert.deepStrictEqual(result.issues, []);
		assert.strictEqual(result.success, true);
	});

	test('rejects package traversal at the schema boundary', () => {
		const manifest = createValidManifest();
		manifest.structure.identity = '../Identity.md';

		const result = validatePaManifest(manifest);

		assert.strictEqual(result.success, false);
		assert.deepStrictEqual(
			result.issues.map(issue => issue.code),
			[PaManifestIssueCode.Schema]
		);
	});

	test('freezes the package schema and host compatibility baseline', () => {
		assert.deepStrictEqual({
			schema: PA_PACKAGE_SCHEMA_VERSION,
			minimumHost: PA_MINIMUM_HOST_VERSION,
			currentHost: PA_CURRENT_HOST_VERSION
		}, {
			schema: '1.0',
			minimumHost: '1.127.0',
			currentHost: '1.127.0'
		});

		const futureSchema = { ...createValidManifest(), schemaVersion: '2.0' };
		assert.deepStrictEqual(
			validatePaManifest(futureSchema).issues.map(issue => issue.code),
			[PaManifestIssueCode.Schema]
		);
	});

	test('rejects packages outside the supported host baseline', () => {
		const oldBaseline = createValidManifest();
		oldBaseline.hostCompatibility.minVersion = '1.126.0';
		assert.deepStrictEqual(
			validatePaManifest(oldBaseline).issues.map(issue => issue.code),
			[PaManifestIssueCode.UnsupportedHostBaseline]
		);

		const prereleaseHost = createValidManifest();
		prereleaseHost.hostCompatibility.minVersion = '1.127.0-preview.1';
		assert.deepStrictEqual(
			validatePaManifest(prereleaseHost).issues.map(issue => issue.code),
			[PaManifestIssueCode.UnsupportedHostBaseline]
		);

		const futureHost = createValidManifest();
		futureHost.hostCompatibility.minVersion = '1.128.0';
		assert.deepStrictEqual(
			validatePaManifest(futureHost).issues.map(issue => issue.code),
			[PaManifestIssueCode.IncompatibleHostVersion]
		);
	});

	test('detects duplicate outputs and undeclared producer dependencies', () => {
		const manifest = createValidManifest();
		manifest.activities[1].dependsOn = [];
		manifest.activities[1].outputs.push('NormalizedRequirement');

		const result = validatePaManifest(manifest);

		assert.deepStrictEqual(
			new Set(result.issues.map(issue => issue.code)),
			new Set([
				PaManifestIssueCode.DuplicateOutput,
				PaManifestIssueCode.ProducerMismatch,
				PaManifestIssueCode.UndeclaredProducerDependency
			])
		);
	});

	test('detects cycles and missing critical CA coverage', () => {
		const manifest = createValidManifest();
		manifest.activities[0].dependsOn = ['AA-03'];
		manifest.checks = manifest.checks.filter(check => check.target !== 'ReleaseCandidate');

		const result = validatePaManifest(manifest);

		assert.deepStrictEqual(
			new Set(result.issues.map(issue => issue.code)),
			new Set([
				PaManifestIssueCode.CyclicDependency,
				PaManifestIssueCode.MissingCriticalCheck
			])
		);
	});

	test('validates run, checkpoint and artifact persistence contracts', () => {
		const runId = '11111111-1111-4111-8111-111111111111';
		const checkpointId = '22222222-2222-4222-8222-222222222222';
		const artifactId = '33333333-3333-4333-8333-333333333333';
		const nodeStates = {
			'AA-01': {
				status: 'completed',
				attempts: 1,
				startedAt: '2026-07-18T00:00:00.000Z',
				completedAt: '2026-07-18T00:00:01.000Z'
			}
		};

		assert.deepStrictEqual({
			run: PaRunSchema.safeParse({
				id: runId,
				paId: 'builtin.pa-creator',
				paVersion: '0.1.0',
				profileId: 'local-default',
				status: 'running',
				nodeStates,
				currentActivity: 'AA-02',
				latestCheckpointId: checkpointId
			}).success,
			checkpoint: PaCheckpointSchema.safeParse({
				id: checkpointId,
				runId,
				sequence: 1,
				createdAt: '2026-07-18T00:00:01.000Z',
				nodeStates,
				artifactIds: [artifactId],
				confirmationIds: []
			}).success,
			artifact: PaArtifactSchema.safeParse({
				id: artifactId,
				runId,
				dataObject: 'NormalizedRequirement',
				producer: 'AA-01',
				uri: 'pa-artifact:/requirements.json',
				contentHash: 'a'.repeat(64),
				createdAt: '2026-07-18T00:00:01.000Z'
			}).success,
			invalidArtifact: PaArtifactSchema.safeParse({
				id: artifactId,
				runId,
				dataObject: 'NormalizedRequirement',
				producer: 'AA-01',
				uri: 'pa-artifact:/requirements.json',
				contentHash: 'not-a-sha256',
				createdAt: '2026-07-18T00:00:01.000Z'
			}).success
		}, {
			run: true,
			checkpoint: true,
			artifact: true,
			invalidArtifact: false
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

function createValidManifest(): PaManifest {
	return {
		schemaVersion: '1.0',
		id: 'builtin.pa-creator',
		kind: 'pa',
		name: 'PA Creator',
		description: 'Creates and publishes Process Agents.',
		icon: 'sparkle',
		version: '0.1.0',
		entryActivity: 'AA-01',
		hostCompatibility: {
			minVersion: '1.127.0'
		},
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
			tools: ['knowledge-reader'],
			permissions: ['workspace.read']
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
				name: 'NormalizedRequirement',
				schemaVersion: '1.0',
				producer: 'AA-01',
				consumers: ['AA-02'],
				critical: false
			},
			{
				name: 'ReleaseCandidate',
				schemaVersion: '1.0',
				producer: 'AA-02',
				consumers: ['AA-03'],
				critical: true
			},
			{
				name: 'PublishedPAModule',
				schemaVersion: '1.0',
				producer: 'AA-03',
				consumers: [],
				critical: true
			}
		],
		activities: [
			{
				id: 'AA-01',
				name: 'Clarify Requirements',
				responsibility: 'Normalize the creation request.',
				inputs: ['SourceMaterialCatalog'],
				outputs: ['NormalizedRequirement'],
				dependsOn: [],
				tools: ['knowledge-reader']
			},
			{
				id: 'AA-02',
				name: 'Build Candidate',
				responsibility: 'Generate and validate the PA package.',
				inputs: ['NormalizedRequirement'],
				outputs: ['ReleaseCandidate'],
				dependsOn: ['AA-01'],
				tools: ['package-builder']
			},
			{
				id: 'AA-03',
				name: 'Publish',
				responsibility: 'Atomically publish the accepted package.',
				inputs: ['ReleaseCandidate'],
				outputs: ['PublishedPAModule'],
				dependsOn: ['AA-02'],
				tools: ['pa-registry']
			}
		],
		checks: [
			{
				id: 'CA-01',
				name: 'Candidate Gate',
				target: 'ReleaseCandidate',
				rules: ['Candidate is valid.'],
				failureRoute: 'AA-02',
				maxAutomaticCorrections: 2
			},
			{
				id: 'CA-02',
				name: 'Publication Gate',
				target: 'PublishedPAModule',
				rules: ['Module is visible and runnable.'],
				failureRoute: 'AA-03',
				maxAutomaticCorrections: 0
			}
		],
		publication: {
			status: 'published',
			profileId: 'local-default',
			updatedAt: '2026-07-18T00:00:00.000Z'
		}
	};
}
