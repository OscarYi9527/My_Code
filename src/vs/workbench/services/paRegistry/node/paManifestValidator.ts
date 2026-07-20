/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	comparePaSemanticVersions,
	PA_CURRENT_HOST_VERSION,
	PA_MINIMUM_HOST_VERSION
} from '../common/paCompatibility.js';
import { PaManifest, PaManifestSchema } from './paContracts.js';

export const enum PaManifestIssueCode {
	Schema = 'schema',
	DuplicateActivity = 'duplicateActivity',
	DuplicateCheck = 'duplicateCheck',
	DuplicateDataObject = 'duplicateDataObject',
	DuplicateOutput = 'duplicateOutput',
	MissingEntryActivity = 'missingEntryActivity',
	MissingDependency = 'missingDependency',
	CyclicDependency = 'cyclicDependency',
	MissingInput = 'missingInput',
	MissingOutput = 'missingOutput',
	ProducerMismatch = 'producerMismatch',
	ConsumerMismatch = 'consumerMismatch',
	UndeclaredProducerDependency = 'undeclaredProducerDependency',
	MissingFailureRoute = 'missingFailureRoute',
	UnknownCheckTarget = 'unknownCheckTarget',
	MissingCriticalCheck = 'missingCriticalCheck',
	InvalidHostVersionRange = 'invalidHostVersionRange',
	UnsupportedHostBaseline = 'unsupportedHostBaseline',
	IncompatibleHostVersion = 'incompatibleHostVersion'
}

export interface IPaManifestValidationIssue {
	readonly code: PaManifestIssueCode;
	readonly message: string;
	readonly path?: string;
}

export interface IPaManifestValidationResult {
	readonly success: boolean;
	readonly manifest?: PaManifest;
	readonly issues: readonly IPaManifestValidationIssue[];
}

const KNOWN_CHECK_TARGETS = new Set(['package', 'trialRun', 'publication']);

export function validatePaManifest(value: object): IPaManifestValidationResult {
	const parsed = PaManifestSchema.safeParse(value);
	if (!parsed.success) {
		return {
			success: false,
			issues: parsed.error.issues.map(issue => ({
				code: PaManifestIssueCode.Schema,
				message: issue.message,
				path: issue.path.join('.')
			}))
		};
	}

	const manifest = parsed.data;
	const issues: IPaManifestValidationIssue[] = [];
	const activityIds = collectUniqueIds(
		manifest.activities.map(activity => activity.id),
		PaManifestIssueCode.DuplicateActivity,
		'activity',
		issues
	);
	collectUniqueIds(
		manifest.checks.map(check => check.id),
		PaManifestIssueCode.DuplicateCheck,
		'check',
		issues
	);
	const dataObjectNames = collectUniqueIds(
		manifest.dataObjects.map(dataObject => dataObject.name),
		PaManifestIssueCode.DuplicateDataObject,
		'data object',
		issues
	);

	if (!activityIds.has(manifest.entryActivity)) {
		issues.push({
			code: PaManifestIssueCode.MissingEntryActivity,
			message: `Entry activity '${manifest.entryActivity}' does not exist.`,
			path: 'entryActivity'
		});
	}

	const outputProducers = new Map<string, string>();
	for (const activity of manifest.activities) {
		for (const dependency of activity.dependsOn) {
			if (!activityIds.has(dependency)) {
				issues.push({
					code: PaManifestIssueCode.MissingDependency,
					message: `Activity '${activity.id}' depends on missing activity '${dependency}'.`,
					path: `activities.${activity.id}.dependsOn`
				});
			}
		}
		for (const input of activity.inputs) {
			if (!dataObjectNames.has(input)) {
				issues.push({
					code: PaManifestIssueCode.MissingInput,
					message: `Activity '${activity.id}' consumes undeclared data object '${input}'.`,
					path: `activities.${activity.id}.inputs`
				});
			}
		}
		for (const output of activity.outputs) {
			if (!dataObjectNames.has(output)) {
				issues.push({
					code: PaManifestIssueCode.MissingOutput,
					message: `Activity '${activity.id}' produces undeclared data object '${output}'.`,
					path: `activities.${activity.id}.outputs`
				});
			}
			const declaredDataObject = manifest.dataObjects.find(dataObject => dataObject.name === output);
			if (declaredDataObject && declaredDataObject.producer !== activity.id) {
				issues.push({
					code: PaManifestIssueCode.ProducerMismatch,
					message: `Activity '${activity.id}' produces '${output}', but its declared producer is '${declaredDataObject.producer}'.`,
					path: `activities.${activity.id}.outputs`
				});
			}
			const existingProducer = outputProducers.get(output);
			if (existingProducer) {
				issues.push({
					code: PaManifestIssueCode.DuplicateOutput,
					message: `Data object '${output}' is produced by both '${existingProducer}' and '${activity.id}'.`,
					path: `activities.${activity.id}.outputs`
				});
			} else {
				outputProducers.set(output, activity.id);
			}
		}
	}

	if (hasDependencyCycle(manifest.activities.map(activity => ({
		id: activity.id,
		dependsOn: activity.dependsOn.filter(dependency => activityIds.has(dependency))
	})))) {
		issues.push({
			code: PaManifestIssueCode.CyclicDependency,
			message: 'Activity dependency graph contains a cycle.',
			path: 'activities'
		});
	}

	const activitiesById = new Map(manifest.activities.map(activity => [activity.id, activity]));
	for (const dataObject of manifest.dataObjects) {
		if (dataObject.producer !== 'root') {
			const producer = activitiesById.get(dataObject.producer);
			if (!producer || !producer.outputs.includes(dataObject.name)) {
				issues.push({
					code: PaManifestIssueCode.ProducerMismatch,
					message: `Data object '${dataObject.name}' declares producer '${dataObject.producer}', but that activity does not produce it.`,
					path: `dataObjects.${dataObject.name}.producer`
				});
			}
		}
		for (const consumerId of dataObject.consumers) {
			const consumer = activitiesById.get(consumerId);
			if (!consumer || !consumer.inputs.includes(dataObject.name)) {
				issues.push({
					code: PaManifestIssueCode.ConsumerMismatch,
					message: `Data object '${dataObject.name}' declares consumer '${consumerId}', but that activity does not consume it.`,
					path: `dataObjects.${dataObject.name}.consumers`
				});
			}
		}
	}

	for (const activity of manifest.activities) {
		for (const input of activity.inputs) {
			const dataObject = manifest.dataObjects.find(candidate => candidate.name === input);
			if (!dataObject || dataObject.producer === 'root') {
				continue;
			}
			if (!activity.dependsOn.includes(dataObject.producer)) {
				issues.push({
					code: PaManifestIssueCode.UndeclaredProducerDependency,
					message: `Activity '${activity.id}' consumes '${input}' without depending on producer '${dataObject.producer}'.`,
					path: `activities.${activity.id}.dependsOn`
				});
			}
		}
	}

	const checkTargets = new Set<string>();
	for (const check of manifest.checks) {
		if (!activityIds.has(check.failureRoute)) {
			issues.push({
				code: PaManifestIssueCode.MissingFailureRoute,
				message: `Check '${check.id}' routes to missing activity '${check.failureRoute}'.`,
				path: `checks.${check.id}.failureRoute`
			});
		}
		if (!dataObjectNames.has(check.target) && !KNOWN_CHECK_TARGETS.has(check.target)) {
			issues.push({
				code: PaManifestIssueCode.UnknownCheckTarget,
				message: `Check '${check.id}' targets unknown artifact '${check.target}'.`,
				path: `checks.${check.id}.target`
			});
		}
		checkTargets.add(check.target);
	}

	for (const dataObject of manifest.dataObjects) {
		if (dataObject.critical && !checkTargets.has(dataObject.name)) {
			issues.push({
				code: PaManifestIssueCode.MissingCriticalCheck,
				message: `Critical data object '${dataObject.name}' has no CA coverage.`,
				path: `dataObjects.${dataObject.name}.critical`
			});
		}
	}

	const maxVersion = manifest.hostCompatibility.maxVersion;
	if (maxVersion && comparePaSemanticVersions(maxVersion, manifest.hostCompatibility.minVersion) < 0) {
		issues.push({
			code: PaManifestIssueCode.InvalidHostVersionRange,
			message: 'Maximum host version cannot be lower than minimum host version.',
			path: 'hostCompatibility'
		});
	}
	if (comparePaSemanticVersions(manifest.hostCompatibility.minVersion, PA_MINIMUM_HOST_VERSION) < 0) {
		issues.push({
			code: PaManifestIssueCode.UnsupportedHostBaseline,
			message: `PA packages must require host version ${PA_MINIMUM_HOST_VERSION} or newer.`,
			path: 'hostCompatibility.minVersion'
		});
	}
	if (comparePaSemanticVersions(manifest.hostCompatibility.minVersion, PA_CURRENT_HOST_VERSION) > 0
		|| (maxVersion && comparePaSemanticVersions(maxVersion, PA_CURRENT_HOST_VERSION) < 0)) {
		issues.push({
			code: PaManifestIssueCode.IncompatibleHostVersion,
			message: `PA package is not compatible with host version ${PA_CURRENT_HOST_VERSION}.`,
			path: 'hostCompatibility'
		});
	}

	return {
		success: issues.length === 0,
		manifest,
		issues
	};
}

function collectUniqueIds(
	values: readonly string[],
	code: PaManifestIssueCode,
	label: string,
	issues: IPaManifestValidationIssue[]
): Set<string> {
	const unique = new Set<string>();
	for (const value of values) {
		if (unique.has(value)) {
			issues.push({
				code,
				message: `Duplicate ${label} '${value}'.`
			});
		}
		unique.add(value);
	}
	return unique;
}

function hasDependencyCycle(activities: readonly { readonly id: string; readonly dependsOn: readonly string[] }[]): boolean {
	const indegree = new Map(activities.map(activity => [activity.id, 0]));
	const outgoing = new Map(activities.map(activity => [activity.id, [] as string[]]));
	for (const activity of activities) {
		for (const dependency of activity.dependsOn) {
			indegree.set(activity.id, (indegree.get(activity.id) ?? 0) + 1);
			outgoing.get(dependency)?.push(activity.id);
		}
	}

	const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
	let visited = 0;
	while (ready.length > 0) {
		const id = ready.pop();
		if (!id) {
			continue;
		}
		visited++;
		for (const target of outgoing.get(id) ?? []) {
			const nextDegree = (indegree.get(target) ?? 0) - 1;
			indegree.set(target, nextDegree);
			if (nextDegree === 0) {
				ready.push(target);
			}
		}
	}
	return visited !== activities.length;
}
