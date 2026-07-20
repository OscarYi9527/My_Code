/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { PA_PACKAGE_SCHEMA_VERSION } from '../common/paCompatibility.js';

const PA_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PA_ACTIVITY_ID_PATTERN = /^AA-\d{2,}$/;
const PA_CHECK_ID_PATTERN = /^CA-\d{2,}$/;
const PA_DATA_OBJECT_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;

const PaIdSchema = z.string().min(1).regex(PA_ID_PATTERN);
const PaActivityIdSchema = z.string().regex(PA_ACTIVITY_ID_PATTERN);
const PaCheckIdSchema = z.string().regex(PA_CHECK_ID_PATTERN);
const PaDataObjectNameSchema = z.string().regex(PA_DATA_OBJECT_NAME_PATTERN);
const PaVersionSchema = z.string().regex(SEMANTIC_VERSION_PATTERN);
const PaRelativePathSchema = z.string().min(1).refine(value => {
	if (value.startsWith('/') || value.startsWith('\\') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) {
		return false;
	}
	return !value.split(/[\\/]/).includes('..');
}, 'Package paths must be relative and cannot traverse parent directories.');

export const PaArtifactKindSchema = z.enum(['pa', 'skill']);
export const PaPublicationStatusSchema = z.enum(['draft', 'published', 'unpublished']);
export const PaRunStatusSchema = z.enum(['draft', 'validated', 'running', 'waitingForUser', 'reworking', 'completed', 'failed', 'abandoned']);
export const PaNodeStatusSchema = z.enum(['pending', 'inProgress', 'waitingForUser', 'completed', 'failed', 'invalidated']);
export const PaCheckStateStatusSchema = z.enum(['pending', 'passed', 'failed']);
export const PaConfirmationStatusSchema = z.enum(['requested', 'accepted', 'rejected']);

export const PaDataObjectContractSchema = z.object({
	name: PaDataObjectNameSchema,
	schemaVersion: z.string().min(1),
	producer: z.union([z.literal('root'), PaActivityIdSchema]),
	consumers: z.array(PaActivityIdSchema),
	critical: z.boolean()
}).strict();

export const PaActivityContractSchema = z.object({
	id: PaActivityIdSchema,
	name: z.string().min(1),
	responsibility: z.string().min(1),
	inputs: z.array(PaDataObjectNameSchema),
	outputs: z.array(PaDataObjectNameSchema).min(1),
	dependsOn: z.array(PaActivityIdSchema),
	tools: z.array(z.string().min(1))
}).strict();

export const PaCheckContractSchema = z.object({
	id: PaCheckIdSchema,
	name: z.string().min(1),
	target: z.string().min(1),
	rules: z.array(z.string().min(1)).min(1),
	failureRoute: PaActivityIdSchema,
	maxAutomaticCorrections: z.number().int().min(0).max(2)
}).strict();

export const PaPackageStructureSchema = z.object({
	identity: PaRelativePathSchema,
	manifesto: PaRelativePathSchema,
	plan: PaRelativePathSchema,
	dataObjects: PaRelativePathSchema,
	activities: PaRelativePathSchema,
	checks: PaRelativePathSchema,
	knowledge: PaRelativePathSchema,
	bestPractice: PaRelativePathSchema,
	tests: PaRelativePathSchema,
	assets: PaRelativePathSchema
}).strict();

export const PaManifestSchema = z.object({
	schemaVersion: z.literal(PA_PACKAGE_SCHEMA_VERSION),
	id: PaIdSchema,
	kind: PaArtifactKindSchema,
	name: z.string().min(1),
	description: z.string().min(1),
	icon: z.string().min(1),
	version: PaVersionSchema,
	entryActivity: PaActivityIdSchema,
	hostCompatibility: z.object({
		minVersion: PaVersionSchema,
		maxVersion: PaVersionSchema.optional()
	}).strict(),
	structure: PaPackageStructureSchema,
	capabilities: z.object({
		modelAdapter: z.boolean(),
		tools: z.array(z.string().min(1)),
		permissions: z.array(z.string().min(1))
	}).strict(),
	dataObjects: z.array(PaDataObjectContractSchema).min(1),
	activities: z.array(PaActivityContractSchema).min(1),
	checks: z.array(PaCheckContractSchema).min(1),
	publication: z.object({
		status: PaPublicationStatusSchema,
		profileId: z.string().min(1),
		updatedAt: z.string().datetime({ offset: true })
	}).strict()
}).strict();

export const PaNodeStateSchema = z.object({
	status: PaNodeStatusSchema,
	attempts: z.number().int().min(0),
	startedAt: z.string().datetime({ offset: true }).optional(),
	completedAt: z.string().datetime({ offset: true }).optional(),
	invalidatedBy: PaActivityIdSchema.optional()
}).strict();

export const PaCheckStateSchema = z.object({
	status: PaCheckStateStatusSchema,
	attempts: z.number().int().min(0),
	automaticCorrections: z.number().int().min(0).max(2),
	lastRule: z.string().min(1).optional(),
	evidence: z.array(z.string().min(1)).optional(),
	responsibleActivity: PaActivityIdSchema.optional(),
	affectedActivities: z.array(PaActivityIdSchema).optional(),
	checkedAt: z.string().datetime({ offset: true }).optional()
}).strict();

export const PaConfirmationStateSchema = z.object({
	id: z.string().uuid(),
	activityId: PaActivityIdSchema,
	status: PaConfirmationStatusSchema,
	requestedAt: z.string().datetime({ offset: true }),
	resolvedAt: z.string().datetime({ offset: true }).optional(),
	reason: z.string().min(1).optional()
}).strict();

export const PaPendingUserDecisionSchema = z.object({
	checkId: PaCheckIdSchema,
	responsibleActivity: PaActivityIdSchema,
	evidence: z.array(z.string().min(1)),
	affectedActivities: z.array(PaActivityIdSchema)
}).strict();

export const PaCommittedSideEffectSchema = z.object({
	activityId: PaActivityIdSchema,
	artifactIds: z.array(z.string().uuid()),
	committedAt: z.string().datetime({ offset: true })
}).strict();

export const PaRuntimeStateSchema = z.object({
	checkStates: z.record(PaCheckStateSchema),
	confirmations: z.record(PaConfirmationStateSchema),
	pendingUserDecision: PaPendingUserDecisionSchema.optional(),
	committedSideEffects: z.record(PaCommittedSideEffectSchema)
}).strict();

export const PaRunSchema = z.object({
	id: z.string().uuid(),
	paId: PaIdSchema,
	paVersion: PaVersionSchema,
	profileId: z.string().min(1),
	status: PaRunStatusSchema,
	nodeStates: z.record(PaNodeStateSchema),
	currentActivity: PaActivityIdSchema.optional(),
	latestCheckpointId: z.string().uuid().optional()
}).strict();

export const PaCheckpointSchema = z.object({
	id: z.string().uuid(),
	runId: z.string().uuid(),
	sequence: z.number().int().nonnegative(),
	createdAt: z.string().datetime({ offset: true }),
	nodeStates: z.record(PaNodeStateSchema),
	artifactIds: z.array(z.string().uuid()),
	confirmationIds: z.array(z.string().uuid()),
	runtimeState: PaRuntimeStateSchema.optional()
}).strict();

export const PaArtifactSchema = z.object({
	id: z.string().uuid(),
	runId: z.string().uuid(),
	dataObject: PaDataObjectNameSchema,
	producer: PaActivityIdSchema,
	uri: z.string().min(1),
	contentHash: z.string().regex(/^[a-f0-9]{64}$/),
	createdAt: z.string().datetime({ offset: true })
}).strict();

export type PaManifest = z.infer<typeof PaManifestSchema>;
export type PaActivityContract = z.infer<typeof PaActivityContractSchema>;
export type PaCheckContract = z.infer<typeof PaCheckContractSchema>;
export type PaDataObjectContract = z.infer<typeof PaDataObjectContractSchema>;
export type PaRun = z.infer<typeof PaRunSchema>;
export type PaCheckpoint = z.infer<typeof PaCheckpointSchema>;
export type PaArtifact = z.infer<typeof PaArtifactSchema>;
export type PaCheckState = z.infer<typeof PaCheckStateSchema>;
export type PaConfirmationState = z.infer<typeof PaConfirmationStateSchema>;
export type PaRuntimeState = z.infer<typeof PaRuntimeStateSchema>;
