/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PaCheckpoint, PaManifest, PaRun } from '../../node/paContracts.js';
import {
	IPaActivityExecutor,
	IPaRuntimeEventRecord,
	IPaRuntimePersistence,
	PaRuntime
} from '../../node/paRuntime.js';
import { PaRegistryDatabase } from '../../node/paRegistryDatabase.js';

suite('PA runtime', () => {
	test('blocks dependencies on CA and mandatory confirmation gates', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const runtime = await PaRuntime.create(
				createManifest(2),
				'profile-a',
				database,
				createEnvironment(['AA-01'])
			);
			const executor = new IdempotentExecutor();

			assert.deepStrictEqual(actionTypes(runtime), ['executeActivity:AA-01']);
			await runtime.executeActivity('AA-01', executor);
			assert.deepStrictEqual(actionTypes(runtime), ['runCheck:CA-01']);

			await runtime.reportCheckPassed('CA-01');
			assert.deepStrictEqual(actionTypes(runtime), ['confirm:AA-01']);
			assert.strictEqual(runtime.getRun().status, 'waitingForUser');

			const confirmation = runtime.getActions()[0];
			assert.strictEqual(confirmation.type, 'confirm');
			if (confirmation.type !== 'confirm') {
				throw new Error('Expected a confirmation action.');
			}
			await runtime.acceptConfirmation(confirmation.confirmation.id);

			assert.deepStrictEqual(actionTypes(runtime), ['executeActivity:AA-02']);
			assert.strictEqual(runtime.getRun().status, 'running');
		} finally {
			await database.dispose();
		}
	});

	test('invalidates only the responsible AA and downstream nodes and bounds automatic correction', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const runtime = await PaRuntime.create(
				createManifest(2),
				'profile-a',
				database,
				createEnvironment()
			);
			const executor = new IdempotentExecutor();

			for (let failure = 1; failure <= 3; failure++) {
				await runtime.executeActivity('AA-01', executor);
				await runtime.reportCheckFailed('CA-01', {
					rule: 'Output must be accepted.',
					evidence: [`failure-${failure}`]
				});

				const run = runtime.getRun();
				assert.strictEqual(run.nodeStates['AA-01'].status, 'invalidated');
				assert.strictEqual(run.nodeStates['AA-02'].status, 'invalidated');
				if (failure < 3) {
					assert.strictEqual(run.status, 'reworking');
					assert.deepStrictEqual(actionTypes(runtime), ['executeActivity:AA-01']);
				}
			}

			assert.strictEqual(runtime.getRun().status, 'waitingForUser');
			assert.deepStrictEqual(actionTypes(runtime), ['userDecision:CA-01']);
			await runtime.resolveUserDecision('CA-01', 'retry');
			assert.strictEqual(runtime.getRun().status, 'reworking');
			assert.deepStrictEqual(actionTypes(runtime), ['executeActivity:AA-01']);
		} finally {
			await database.dispose();
		}
	});

	test('resumes an in-progress activity with the same idempotency key after checkpoint recovery', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const persistence = new FailCompletionOncePersistence(database);
			const environment = createEnvironment();
			const runtime = await PaRuntime.create(createManifest(1), 'profile-a', persistence, environment);
			const executor = new IdempotentExecutor();

			await assert.rejects(runtime.executeActivity('AA-01', executor), /simulated checkpoint failure/);
			assert.strictEqual(executor.sideEffectCount, 1);

			const restored = await PaRuntime.restore(
				createManifest(1),
				runtime.getRun().id,
				database,
				environment
			);
			const action = restored.getActions()[0];
			assert.deepStrictEqual(action, {
				type: 'executeActivity',
				activityId: 'AA-01',
				operationId: `${runtime.getRun().id}:AA-01:1`,
				resume: true
			});

			await restored.executeActivity('AA-01', executor);
			assert.strictEqual(executor.sideEffectCount, 1);
			assert.deepStrictEqual(actionTypes(restored), ['runCheck:CA-01']);

			const events = await database.listRuntimeEvents(runtime.getRun().id);
			assert.deepStrictEqual(events.map(event => event.event.type), [
				'runStarted',
				'activityStarted',
				'activityCompleted'
			]);
			assert.deepStrictEqual(events.map(event => event.sequence), [1, 2, 3]);
		} finally {
			await database.dispose();
		}
	});

	test('rolls back an invalid runtime transition atomically', async () => {
		const database = await PaRegistryDatabase.open(':memory:');
		try {
			const runtime = await PaRuntime.create(createManifest(1), 'profile-a', database, createEnvironment());
			const run = runtime.getRun();
			const checkpoint = await database.getLatestCheckpoint(run.id);
			assert.ok(checkpoint);
			const existingEvent = (await database.listRuntimeEvents(run.id))[0];
			const nextCheckpoint = {
				...checkpoint,
				id: '99999999-9999-4999-8999-999999999999',
				sequence: checkpoint.sequence + 1,
				createdAt: '2026-07-18T00:01:00.000Z'
			};

			await assert.rejects(database.saveRuntimeTransition(
				{ ...run, latestCheckpointId: nextCheckpoint.id },
				nextCheckpoint,
				{
					id: existingEvent.id,
					runId: run.id,
					sequence: nextCheckpoint.sequence,
					createdAt: nextCheckpoint.createdAt,
					event: { type: 'runCompleted' }
				}
			), /UNIQUE constraint failed/);

			assert.strictEqual((await database.getLatestCheckpoint(run.id))?.id, checkpoint.id);
			assert.strictEqual((await database.getRun(run.id))?.latestCheckpointId, checkpoint.id);
			assert.strictEqual((await database.listRuntimeEvents(run.id)).length, 1);
		} finally {
			await database.dispose();
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

class IdempotentExecutor implements IPaActivityExecutor {
	private readonly results = new Map<string, readonly string[]>();
	sideEffectCount = 0;

	async execute(request: { readonly idempotencyKey: string }): Promise<{ readonly artifactIds: readonly string[] }> {
		let artifactIds = this.results.get(request.idempotencyKey);
		if (!artifactIds) {
			this.sideEffectCount++;
			artifactIds = [`00000000-0000-4000-8000-${this.sideEffectCount.toString().padStart(12, '0')}`];
			this.results.set(request.idempotencyKey, artifactIds);
		}
		return { artifactIds };
	}
}

class FailCompletionOncePersistence implements IPaRuntimePersistence {
	private shouldFail = true;

	constructor(private readonly database: PaRegistryDatabase) { }

	createRun(run: PaRun, updatedAt: string): Promise<void> {
		return this.database.createRun(run, updatedAt);
	}

	saveRuntimeTransition(run: PaRun, checkpoint: PaCheckpoint, event: IPaRuntimeEventRecord): Promise<void> {
		if (event.event.type === 'activityCompleted' && this.shouldFail) {
			this.shouldFail = false;
			return Promise.reject(new Error('simulated checkpoint failure'));
		}
		return this.database.saveRuntimeTransition(run, checkpoint, event);
	}

	getRun(runId: string): Promise<PaRun | undefined> {
		return this.database.getRun(runId);
	}

	getLatestCheckpoint(runId: string): Promise<PaCheckpoint | undefined> {
		return this.database.getLatestCheckpoint(runId);
	}
}

function actionTypes(runtime: PaRuntime): string[] {
	return runtime.getActions().map(action => {
		switch (action.type) {
			case 'executeActivity':
				return `${action.type}:${action.activityId}`;
			case 'runCheck':
				return `${action.type}:${action.checkId}`;
			case 'confirm':
				return `${action.type}:${action.confirmation.activityId}`;
			case 'userDecision':
				return `${action.type}:${action.checkId}`;
			case 'completed':
				return action.type;
		}
	});
}

function createEnvironment(confirmationActivityIds: readonly string[] = []) {
	let id = 1;
	let second = 0;
	return {
		confirmationActivityIds,
		createId: () => `10000000-0000-4000-8000-${(id++).toString().padStart(12, '0')}`,
		now: () => `2026-07-18T00:00:${(second++).toString().padStart(2, '0')}.000Z`
	};
}

function createManifest(activityCount: 1 | 2): PaManifest {
	const activities: PaManifest['activities'] = [{
		id: 'AA-01',
		name: 'Produce',
		responsibility: 'Produce a checked artifact.',
		inputs: ['SourceMaterialCatalog'],
		outputs: ['CheckedOutput'],
		dependsOn: [],
		tools: []
	}];
	const dataObjects: PaManifest['dataObjects'] = [
		{
			name: 'SourceMaterialCatalog',
			schemaVersion: '1.0',
			producer: 'root',
			consumers: ['AA-01'],
			critical: false
		},
		{
			name: 'CheckedOutput',
			schemaVersion: '1.0',
			producer: 'AA-01',
			consumers: activityCount === 2 ? ['AA-02'] : [],
			critical: true
		}
	];
	if (activityCount === 2) {
		activities.push({
			id: 'AA-02',
			name: 'Publish',
			responsibility: 'Publish the checked artifact.',
			inputs: ['CheckedOutput'],
			outputs: ['PublishedOutput'],
			dependsOn: ['AA-01'],
			tools: []
		});
		dataObjects.push({
			name: 'PublishedOutput',
			schemaVersion: '1.0',
			producer: 'AA-02',
			consumers: [],
			critical: true
		});
	}
	return {
		schemaVersion: '1.0',
		id: 'test.pa',
		kind: 'pa',
		name: 'Test PA',
		description: 'Exercises the PA runtime.',
		icon: 'beaker',
		version: '0.1.0',
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
		dataObjects,
		activities,
		checks: [
			{
				id: 'CA-01',
				name: 'Output gate',
				target: 'CheckedOutput',
				rules: ['Output is accepted.'],
				failureRoute: 'AA-01',
				maxAutomaticCorrections: 2
			},
			...(activityCount === 2 ? [{
				id: 'CA-02' as const,
				name: 'Publication gate',
				target: 'PublishedOutput',
				rules: ['Publication is visible.'],
				failureRoute: 'AA-02' as const,
				maxAutomaticCorrections: 0
			}] : [])
		],
		publication: {
			status: 'published',
			profileId: 'profile-a',
			updatedAt: '2026-07-18T00:00:00.000Z'
		}
	};
}
