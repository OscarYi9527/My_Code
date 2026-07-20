/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import {
	PaCheckpoint,
	PaCheckState,
	PaConfirmationState,
	PaManifest,
	PaRun,
	PaRuntimeState,
	PaRuntimeStateSchema
} from './paContracts.js';
import { validatePaManifest } from './paManifestValidator.js';

export const PA_CREATOR_CONFIRMATION_ACTIVITIES = ['AA-01', 'AA-03', 'AA-05', 'AA-08'] as const;

export type PaRuntimeEvent =
	| { readonly type: 'runStarted'; readonly entryActivity: string }
	| { readonly type: 'userInputReceived'; readonly inputId: string }
	| { readonly type: 'activityStarted'; readonly activityId: string; readonly operationId: string; readonly resumed: boolean }
	| { readonly type: 'activityCompleted'; readonly activityId: string; readonly operationId: string; readonly artifactIds: readonly string[] }
	| { readonly type: 'activityFailed'; readonly activityId: string; readonly operationId: string; readonly message: string }
	| { readonly type: 'checkPassed'; readonly checkId: string; readonly activityId: string }
	| {
		readonly type: 'checkFailed';
		readonly checkId: string;
		readonly responsibleActivity: string;
		readonly evidence: readonly string[];
		readonly affectedActivities: readonly string[];
		readonly resolution: 'automaticCorrection' | 'userDecision';
	}
	| { readonly type: 'confirmationAccepted'; readonly confirmationId: string; readonly activityId: string }
	| { readonly type: 'confirmationRejected'; readonly confirmationId: string; readonly activityId: string; readonly reason: string }
	| { readonly type: 'userDecisionResolved'; readonly checkId: string; readonly decision: 'retry' | 'abandon' }
	| { readonly type: 'runCompleted' };

export interface IPaRuntimeEventRecord {
	readonly id: string;
	readonly runId: string;
	readonly sequence: number;
	readonly createdAt: string;
	readonly event: PaRuntimeEvent;
}

export interface IPaRuntimePersistence {
	createRun(run: PaRun, updatedAt: string): Promise<void>;
	saveRuntimeTransition(run: PaRun, checkpoint: PaCheckpoint, event: IPaRuntimeEventRecord): Promise<void>;
	getRun(runId: string): Promise<PaRun | undefined>;
	getLatestCheckpoint(runId: string): Promise<PaCheckpoint | undefined>;
}

export interface IPaActivityExecutionRequest {
	readonly runId: string;
	readonly activityId: string;
	readonly attempt: number;
	/**
	 * Stable across recovery. Agent Host adapters and tools that produce external
	 * side effects must de-duplicate this key.
	 */
	readonly idempotencyKey: string;
}

export interface IPaActivityExecutionResult {
	readonly artifactIds: readonly string[];
}

export interface IPaActivityExecutor {
	execute(request: IPaActivityExecutionRequest): Promise<IPaActivityExecutionResult>;
}

export type PaRuntimeAction =
	| { readonly type: 'executeActivity'; readonly activityId: string; readonly operationId: string; readonly resume: boolean }
	| { readonly type: 'runCheck'; readonly checkId: string; readonly activityId: string }
	| { readonly type: 'confirm'; readonly confirmation: PaConfirmationState }
	| { readonly type: 'userDecision'; readonly checkId: string; readonly evidence: readonly string[] }
	| { readonly type: 'completed' };

export interface IPaCheckFailure {
	readonly rule: string;
	readonly evidence: readonly string[];
}

export interface IPaRuntimeOptions {
	readonly confirmationActivityIds?: readonly string[];
	readonly now?: () => string;
	readonly createId?: () => string;
}

interface IPaRuntimeMutableSnapshot {
	readonly run: PaRun;
	readonly runtimeState: PaRuntimeState;
	readonly artifactIds: readonly string[];
	readonly confirmationIds: readonly string[];
	readonly sequence: number;
}

/**
 * Deterministic PA state machine. The Agent Host is intentionally behind the
 * executor interface: runtime transitions are checkpointed independently from
 * model/provider choice, while side effects use a stable idempotency key.
 */
export class PaRuntime {
	private readonly confirmationActivityIds: ReadonlySet<string>;
	private readonly now: () => string;
	private readonly createId: () => string;
	private artifactIds: string[];
	private confirmationIds: string[];
	private sequence: number;

	private constructor(
		readonly manifest: PaManifest,
		private run: PaRun,
		private runtimeState: PaRuntimeState,
		private readonly persistence: IPaRuntimePersistence,
		artifactIds: readonly string[],
		confirmationIds: readonly string[],
		sequence: number,
		options: IPaRuntimeOptions
	) {
		this.confirmationActivityIds = new Set(options.confirmationActivityIds ?? []);
		this.now = options.now ?? (() => new Date().toISOString());
		this.createId = options.createId ?? generateUuid;
		this.artifactIds = [...artifactIds];
		this.confirmationIds = [...confirmationIds];
		this.sequence = sequence;
		this.assertConfirmationActivities();
	}

	static async create(
		manifest: PaManifest,
		profileId: string,
		persistence: IPaRuntimePersistence,
		options: IPaRuntimeOptions = {}
	): Promise<PaRuntime> {
		assertValidManifest(manifest);
		const createId = options.createId ?? generateUuid;
		const run: PaRun = {
			id: createId(),
			paId: manifest.id,
			paVersion: manifest.version,
			profileId,
			status: 'draft',
			nodeStates: Object.fromEntries(manifest.activities.map(activity => [
				activity.id,
				{ status: 'pending' as const, attempts: 0 }
			]))
		};
		const runtimeState: PaRuntimeState = {
			checkStates: Object.fromEntries(manifest.checks.map(check => [
				check.id,
				{ status: 'pending' as const, attempts: 0, automaticCorrections: 0 }
			])),
			confirmations: {},
			committedSideEffects: {}
		};
		const runtime = new PaRuntime(
			manifest,
			run,
			runtimeState,
			persistence,
			[],
			[],
			0,
			{ ...options, createId }
		);
		const createdAt = runtime.now();
		await persistence.createRun(run, createdAt);
		await runtime.withTransition(() => {
			runtime.run = { ...runtime.run, status: 'running' };
			return { type: 'runStarted', entryActivity: manifest.entryActivity };
		});
		return runtime;
	}

	static async restore(
		manifest: PaManifest,
		runId: string,
		persistence: IPaRuntimePersistence,
		options: IPaRuntimeOptions = {}
	): Promise<PaRuntime> {
		assertValidManifest(manifest);
		const [run, checkpoint] = await Promise.all([
			persistence.getRun(runId),
			persistence.getLatestCheckpoint(runId)
		]);
		if (!run || !checkpoint) {
			throw new Error(`Cannot restore PA run '${runId}' without a run and checkpoint.`);
		}
		if (run.paId !== manifest.id || run.paVersion !== manifest.version) {
			throw new Error(`PA run '${runId}' does not match manifest '${manifest.id}@${manifest.version}'.`);
		}
		if (!checkpoint.runtimeState) {
			throw new Error(`Checkpoint '${checkpoint.id}' does not contain PA runtime state.`);
		}
		return new PaRuntime(
			manifest,
			run,
			PaRuntimeStateSchema.parse(checkpoint.runtimeState),
			persistence,
			checkpoint.artifactIds,
			checkpoint.confirmationIds,
			checkpoint.sequence,
			options
		);
	}

	getRun(): PaRun {
		return clone(this.run);
	}

	getActions(): readonly PaRuntimeAction[] {
		if (this.run.status === 'completed') {
			return [{ type: 'completed' }];
		}
		if (this.run.status === 'abandoned' || this.run.status === 'failed') {
			return [];
		}
		if (this.runtimeState.pendingUserDecision) {
			return [{
				type: 'userDecision',
				checkId: this.runtimeState.pendingUserDecision.checkId,
				evidence: this.runtimeState.pendingUserDecision.evidence
			}];
		}
		const confirmations = Object.values(this.runtimeState.confirmations)
			.filter(confirmation => confirmation.status === 'requested');
		if (confirmations.length > 0) {
			return confirmations.map(confirmation => ({ type: 'confirm', confirmation }));
		}
		const inProgress = this.manifest.activities
			.filter(activity => this.run.nodeStates[activity.id]?.status === 'inProgress');
		if (inProgress.length > 0) {
			return inProgress.map(activity => ({
				type: 'executeActivity',
				activityId: activity.id,
				operationId: this.operationId(activity.id, this.run.nodeStates[activity.id].attempts),
				resume: true
			}));
		}
		const pendingChecks = this.manifest.checks.filter(check => {
			const activityId = this.checkActivityId(check.id);
			return this.run.nodeStates[activityId]?.status === 'completed'
				&& this.runtimeState.checkStates[check.id]?.status === 'pending';
		});
		if (pendingChecks.length > 0) {
			return pendingChecks.map(check => ({
				type: 'runCheck',
				checkId: check.id,
				activityId: this.checkActivityId(check.id)
			}));
		}
		return this.manifest.activities
			.filter(activity => this.isActivityReady(activity.id))
			.map(activity => ({
				type: 'executeActivity',
				activityId: activity.id,
				operationId: this.operationId(activity.id, this.run.nodeStates[activity.id].attempts + 1),
				resume: false
			}));
	}

	async recordUserInput(inputId: string): Promise<void> {
		if (!inputId) {
			throw new Error('PA runtime input ID cannot be empty.');
		}
		if (this.run.status === 'completed' || this.run.status === 'failed' || this.run.status === 'abandoned') {
			throw new Error(`PA run '${this.run.id}' no longer accepts user input.`);
		}
		await this.withTransition(() => ({ type: 'userInputReceived', inputId }));
	}

	async executeActivity(activityId: string, executor: IPaActivityExecutor): Promise<void> {
		const state = this.requireNodeState(activityId);
		const resumed = state.status === 'inProgress';
		if (!resumed && !this.isActivityReady(activityId)) {
			throw new Error(`Activity '${activityId}' is not ready.`);
		}
		if (!resumed && this.run.currentActivity) {
			throw new Error(`Activity '${this.run.currentActivity}' is already in progress.`);
		}
		const attempt = resumed ? state.attempts : state.attempts + 1;
		const operationId = this.operationId(activityId, attempt);
		if (!resumed) {
			await this.withTransition(() => {
				const startedAt = this.now();
				this.run = {
					...this.run,
					status: this.run.status === 'reworking' ? 'reworking' : 'running',
					currentActivity: activityId,
					nodeStates: {
						...this.run.nodeStates,
						[activityId]: {
							status: 'inProgress',
							attempts: attempt,
							startedAt
						}
					}
				};
				return { type: 'activityStarted', activityId, operationId, resumed: false };
			});
		}

		let result: IPaActivityExecutionResult;
		try {
			result = await executor.execute({
				runId: this.run.id,
				activityId,
				attempt,
				idempotencyKey: operationId
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.withTransition(() => {
				const failedAt = this.now();
				this.run = {
					...this.run,
					status: 'failed',
					currentActivity: undefined,
					nodeStates: {
						...this.run.nodeStates,
						[activityId]: {
							...this.requireNodeState(activityId),
							status: 'failed',
							completedAt: failedAt
						}
					}
				};
				return { type: 'activityFailed', activityId, operationId, message };
			});
			throw error;
		}
		await this.completeActivity(activityId, operationId, result.artifactIds);
	}

	async reportCheckPassed(checkId: string): Promise<void> {
		const checkState = this.requireCheckState(checkId);
		const activityId = this.checkActivityId(checkId);
		if (this.requireNodeState(activityId).status !== 'completed' || checkState.status !== 'pending') {
			throw new Error(`Check '${checkId}' is not ready.`);
		}
		await this.withTransition(() => {
			const checkedAt = this.now();
			this.runtimeState = {
				...this.runtimeState,
				checkStates: {
					...this.runtimeState.checkStates,
					[checkId]: {
						...checkState,
						status: 'passed',
						attempts: checkState.attempts + 1,
						checkedAt,
						lastRule: undefined,
						evidence: undefined,
						responsibleActivity: undefined,
						affectedActivities: undefined
					}
				}
			};
			this.requestConfirmationIfReady(activityId, checkedAt);
			this.refreshRunStatus();
			return { type: 'checkPassed', checkId, activityId };
		});
	}

	async reportCheckFailed(checkId: string, failure: IPaCheckFailure): Promise<void> {
		if (!failure.rule || failure.evidence.length === 0 || failure.evidence.some(item => !item)) {
			throw new Error('A failed CA must identify a rule and factual evidence.');
		}
		const check = this.manifest.checks.find(candidate => candidate.id === checkId);
		const checkState = this.requireCheckState(checkId);
		if (!check || this.requireNodeState(this.checkActivityId(checkId)).status !== 'completed' || checkState.status !== 'pending') {
			throw new Error(`Check '${checkId}' is not ready.`);
		}
		const affectedActivities = this.collectAffectedActivities(check.failureRoute);
		const automaticCorrections = checkState.automaticCorrections + 1;
		const canCorrectAutomatically = automaticCorrections <= check.maxAutomaticCorrections;
		await this.withTransition(() => {
			const checkedAt = this.now();
			this.invalidateActivities(affectedActivities, check.failureRoute);
			this.runtimeState = {
				...this.runtimeState,
				checkStates: {
					...this.runtimeState.checkStates,
					[checkId]: {
						status: 'failed',
						attempts: checkState.attempts + 1,
						automaticCorrections: Math.min(automaticCorrections, 2),
						lastRule: failure.rule,
						evidence: [...failure.evidence],
						responsibleActivity: check.failureRoute,
						affectedActivities,
						checkedAt
					}
				},
				pendingUserDecision: canCorrectAutomatically ? undefined : {
					checkId,
					responsibleActivity: check.failureRoute,
					evidence: [...failure.evidence],
					affectedActivities
				}
			};
			this.run = {
				...this.run,
				status: canCorrectAutomatically ? 'reworking' : 'waitingForUser',
				currentActivity: undefined
			};
			return {
				type: 'checkFailed',
				checkId,
				responsibleActivity: check.failureRoute,
				evidence: [...failure.evidence],
				affectedActivities,
				resolution: canCorrectAutomatically ? 'automaticCorrection' : 'userDecision'
			};
		});
	}

	async acceptConfirmation(confirmationId: string): Promise<void> {
		const confirmation = this.findConfirmation(confirmationId);
		if (confirmation.status !== 'requested') {
			throw new Error(`Confirmation '${confirmationId}' is not pending.`);
		}
		await this.withTransition(() => {
			const resolvedAt = this.now();
			this.runtimeState = {
				...this.runtimeState,
				confirmations: {
					...this.runtimeState.confirmations,
					[confirmation.activityId]: {
						...confirmation,
						status: 'accepted',
						resolvedAt
					}
				}
			};
			this.refreshRunStatus();
			return {
				type: 'confirmationAccepted',
				confirmationId,
				activityId: confirmation.activityId
			};
		});
	}

	async rejectConfirmation(confirmationId: string, reason: string): Promise<void> {
		const confirmation = this.findConfirmation(confirmationId);
		if (confirmation.status !== 'requested' || !reason) {
			throw new Error(`Confirmation '${confirmationId}' cannot be rejected without a reason.`);
		}
		const affectedActivities = this.collectAffectedActivities(confirmation.activityId);
		await this.withTransition(() => {
			this.invalidateActivities(affectedActivities, confirmation.activityId);
			this.runtimeState = {
				...this.runtimeState,
				confirmations: {
					...this.runtimeState.confirmations,
					[confirmation.activityId]: {
						...confirmation,
						status: 'rejected',
						resolvedAt: this.now(),
						reason
					}
				}
			};
			this.run = { ...this.run, status: 'reworking', currentActivity: undefined };
			return {
				type: 'confirmationRejected',
				confirmationId,
				activityId: confirmation.activityId,
				reason
			};
		});
	}

	async resolveUserDecision(checkId: string, decision: 'retry' | 'abandon'): Promise<void> {
		const pending = this.runtimeState.pendingUserDecision;
		if (!pending || pending.checkId !== checkId) {
			throw new Error(`Check '${checkId}' is not waiting for a user decision.`);
		}
		await this.withTransition(() => {
			this.runtimeState = { ...this.runtimeState, pendingUserDecision: undefined };
			this.run = {
				...this.run,
				status: decision === 'retry' ? 'reworking' : 'abandoned',
				currentActivity: undefined
			};
			return { type: 'userDecisionResolved', checkId, decision };
		});
	}

	private async completeActivity(activityId: string, operationId: string, artifactIds: readonly string[]): Promise<void> {
		const state = this.requireNodeState(activityId);
		if (state.status !== 'inProgress' || operationId !== this.operationId(activityId, state.attempts)) {
			throw new Error(`Activity '${activityId}' does not own operation '${operationId}'.`);
		}
		await this.withTransition(() => {
			const completedAt = this.now();
			this.artifactIds = unique([...this.artifactIds, ...artifactIds]);
			const resetChecks = { ...this.runtimeState.checkStates };
			for (const check of this.checksForActivity(activityId)) {
				resetChecks[check.id] = {
					status: 'pending',
					attempts: resetChecks[check.id].attempts,
					automaticCorrections: resetChecks[check.id].automaticCorrections
				};
			}
			this.runtimeState = {
				...this.runtimeState,
				checkStates: resetChecks,
				committedSideEffects: {
					...this.runtimeState.committedSideEffects,
					[operationId]: {
						activityId,
						artifactIds: [...artifactIds],
						committedAt: completedAt
					}
				}
			};
			this.run = {
				...this.run,
				currentActivity: undefined,
				nodeStates: {
					...this.run.nodeStates,
					[activityId]: {
						...state,
						status: 'completed',
						completedAt,
						invalidatedBy: undefined
					}
				}
			};
			this.requestConfirmationIfReady(activityId, completedAt);
			this.refreshRunStatus();
			return {
				type: 'activityCompleted',
				activityId,
				operationId,
				artifactIds: [...artifactIds]
			};
		});
	}

	private requestConfirmationIfReady(activityId: string, requestedAt: string): void {
		if (!this.confirmationActivityIds.has(activityId)
			|| this.checksForActivity(activityId).some(check => this.runtimeState.checkStates[check.id].status !== 'passed')) {
			return;
		}
		const current = this.runtimeState.confirmations[activityId];
		if (current?.status === 'requested' || current?.status === 'accepted') {
			return;
		}
		const confirmation: PaConfirmationState = {
			id: this.createId(),
			activityId,
			status: 'requested',
			requestedAt
		};
		this.confirmationIds = [...this.confirmationIds, confirmation.id];
		this.runtimeState = {
			...this.runtimeState,
			confirmations: {
				...this.runtimeState.confirmations,
				[activityId]: confirmation
			}
		};
	}

	private refreshRunStatus(): void {
		const pendingConfirmation = Object.values(this.runtimeState.confirmations)
			.some(confirmation => confirmation.status === 'requested');
		if (pendingConfirmation || this.runtimeState.pendingUserDecision) {
			this.run = { ...this.run, status: 'waitingForUser', currentActivity: undefined };
			return;
		}
		if (this.manifest.activities.every(activity => this.isActivityReleased(activity.id))) {
			this.run = { ...this.run, status: 'completed', currentActivity: undefined };
			return;
		}
		this.run = {
			...this.run,
			status: this.run.status === 'reworking' ? 'reworking' : 'running',
			currentActivity: undefined
		};
	}

	private isActivityReady(activityId: string): boolean {
		const activity = this.manifest.activities.find(candidate => candidate.id === activityId);
		const state = this.run.nodeStates[activityId];
		return !!activity
			&& (state?.status === 'pending' || state?.status === 'invalidated')
			&& activity.dependsOn.every(dependency => this.isActivityReleased(dependency));
	}

	private isActivityReleased(activityId: string): boolean {
		if (this.run.nodeStates[activityId]?.status !== 'completed') {
			return false;
		}
		if (this.checksForActivity(activityId).some(check => this.runtimeState.checkStates[check.id]?.status !== 'passed')) {
			return false;
		}
		return !this.confirmationActivityIds.has(activityId)
			|| this.runtimeState.confirmations[activityId]?.status === 'accepted';
	}

	private checksForActivity(activityId: string) {
		return this.manifest.checks.filter(check => this.checkActivityId(check.id) === activityId);
	}

	private checkActivityId(checkId: string): string {
		const check = this.manifest.checks.find(candidate => candidate.id === checkId);
		if (!check) {
			throw new Error(`Unknown PA check '${checkId}'.`);
		}
		const dataObject = this.manifest.dataObjects.find(candidate => candidate.name === check.target);
		return dataObject?.producer === 'root' || !dataObject ? check.failureRoute : dataObject.producer;
	}

	private collectAffectedActivities(activityId: string): string[] {
		const affected = new Set([activityId]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const activity of this.manifest.activities) {
				if (!affected.has(activity.id) && activity.dependsOn.some(dependency => affected.has(dependency))) {
					affected.add(activity.id);
					changed = true;
				}
			}
		}
		return this.manifest.activities.map(activity => activity.id).filter(id => affected.has(id));
	}

	private invalidateActivities(activityIds: readonly string[], invalidatedBy: string): void {
		const nodeStates = { ...this.run.nodeStates };
		const checkStates = { ...this.runtimeState.checkStates };
		const confirmations = { ...this.runtimeState.confirmations };
		for (const activityId of activityIds) {
			const state = this.requireNodeState(activityId);
			nodeStates[activityId] = {
				status: 'invalidated',
				attempts: state.attempts,
				invalidatedBy
			};
			delete confirmations[activityId];
			for (const check of this.checksForActivity(activityId)) {
				checkStates[check.id] = {
					status: 'pending',
					attempts: checkStates[check.id].attempts,
					automaticCorrections: checkStates[check.id].automaticCorrections
				};
			}
		}
		this.run = { ...this.run, nodeStates };
		this.runtimeState = { ...this.runtimeState, checkStates, confirmations };
	}

	private requireNodeState(activityId: string) {
		const state = this.run.nodeStates[activityId];
		if (!state) {
			throw new Error(`Unknown PA activity '${activityId}'.`);
		}
		return state;
	}

	private requireCheckState(checkId: string): PaCheckState {
		const state = this.runtimeState.checkStates[checkId];
		if (!state) {
			throw new Error(`Unknown PA check '${checkId}'.`);
		}
		return state;
	}

	private findConfirmation(confirmationId: string): PaConfirmationState {
		const confirmation = Object.values(this.runtimeState.confirmations)
			.find(candidate => candidate.id === confirmationId);
		if (!confirmation) {
			throw new Error(`Unknown PA confirmation '${confirmationId}'.`);
		}
		return confirmation;
	}

	private operationId(activityId: string, attempt: number): string {
		return `${this.run.id}:${activityId}:${attempt}`;
	}

	private assertConfirmationActivities(): void {
		const activityIds = new Set(this.manifest.activities.map(activity => activity.id));
		for (const activityId of this.confirmationActivityIds) {
			if (!activityIds.has(activityId)) {
				throw new Error(`Confirmation activity '${activityId}' is not present in the PA manifest.`);
			}
		}
	}

	private async withTransition(mutate: () => PaRuntimeEvent): Promise<void> {
		const before = this.captureMutableState();
		try {
			const event = mutate();
			const sequence = this.sequence + 1;
			const createdAt = this.now();
			const checkpointId = this.createId();
			const checkpoint: PaCheckpoint = {
				id: checkpointId,
				runId: this.run.id,
				sequence,
				createdAt,
				nodeStates: clone(this.run.nodeStates),
				artifactIds: [...this.artifactIds],
				confirmationIds: [...this.confirmationIds],
				runtimeState: clone(this.runtimeState)
			};
			this.run = { ...this.run, latestCheckpointId: checkpointId };
			const record: IPaRuntimeEventRecord = {
				id: this.createId(),
				runId: this.run.id,
				sequence,
				createdAt,
				event
			};
			await this.persistence.saveRuntimeTransition(this.run, checkpoint, record);
			this.sequence = sequence;
		} catch (error) {
			this.restoreMutableState(before);
			throw error;
		}
	}

	private captureMutableState(): IPaRuntimeMutableSnapshot {
		return {
			run: clone(this.run),
			runtimeState: clone(this.runtimeState),
			artifactIds: [...this.artifactIds],
			confirmationIds: [...this.confirmationIds],
			sequence: this.sequence
		};
	}

	private restoreMutableState(snapshot: IPaRuntimeMutableSnapshot): void {
		this.run = clone(snapshot.run);
		this.runtimeState = clone(snapshot.runtimeState);
		this.artifactIds = [...snapshot.artifactIds];
		this.confirmationIds = [...snapshot.confirmationIds];
		this.sequence = snapshot.sequence;
	}
}

function assertValidManifest(manifest: PaManifest): void {
	const validation = validatePaManifest(manifest);
	if (!validation.success) {
		throw new Error(`Cannot start invalid PA manifest: ${validation.issues.map(issue => issue.code).join(', ')}`);
	}
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
