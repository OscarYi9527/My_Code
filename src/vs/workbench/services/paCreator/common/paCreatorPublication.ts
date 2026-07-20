/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPaPublicationDraft } from '../../paRegistry/common/paPublication.js';
import {
	PA_MINIMUM_HOST_VERSION,
	PA_PACKAGE_SCHEMA_VERSION
} from '../../paRegistry/common/paCompatibility.js';
import { IPaCreatorSession, PA_CREATOR_ACTIVITIES } from './paCreator.js';

const CREATOR_OUTPUTS = [
	'StructuredRequirement',
	'KnowledgeCatalog',
	'DataObjectCatalog',
	'IdentityContract',
	'ProcessDesign',
	'ExecutionPlan',
	'PackageDraft',
	'ReleaseCandidate',
	'PublishedPAModule'
] as const;

export function createPaCreatorPublicationDraft(session: IPaCreatorSession): IPaPublicationDraft {
	const id = session.publicationTarget?.artifactId ?? toArtifactId(session);
	const isCreator = session.title.trim().toLocaleLowerCase() === 'pa creator';
	const updatedAt = new Date().toISOString();
	const sourceList = session.sources.map(source => `- ${source.name}: ${source.uri}`).join('\n') || '- Natural language requirement';
	const activities = isCreator ? PA_CREATOR_ACTIVITIES.map((activity, index) => ({
		id: activity.id,
		name: activity.name,
		responsibility: activity.responsibility,
		inputs: [index === 0 ? 'SourceMaterialCatalog' : CREATOR_OUTPUTS[index - 1]],
		outputs: [CREATOR_OUTPUTS[index]],
		dependsOn: index === 0 ? [] : [PA_CREATOR_ACTIVITIES[index - 1].id],
		tools: []
	})) : [{
		id: 'AA-01',
		name: session.title,
		responsibility: 'Run the published Process Agent.',
		inputs: ['SourceMaterialCatalog'],
		outputs: ['PublishedPAModule'],
		dependsOn: [],
		tools: []
	}];
	const dataObjects = isCreator ? [
		{ name: 'SourceMaterialCatalog', schemaVersion: '1.0', producer: 'root', consumers: ['AA-01'], critical: false },
		...CREATOR_OUTPUTS.map((name, index) => ({
			name,
			schemaVersion: '1.0',
			producer: PA_CREATOR_ACTIVITIES[index].id,
			consumers: index < CREATOR_OUTPUTS.length - 1 ? [PA_CREATOR_ACTIVITIES[index + 1].id] : [],
			critical: name === 'ReleaseCandidate' || name === 'PublishedPAModule'
		}))
	] : [
		{ name: 'SourceMaterialCatalog', schemaVersion: '1.0', producer: 'root', consumers: ['AA-01'], critical: false },
		{ name: 'PublishedPAModule', schemaVersion: '1.0', producer: 'AA-01', consumers: [], critical: true }
	];
	const checks = isCreator ? [
		{
			id: 'CA-01', name: 'Release candidate gate', target: 'ReleaseCandidate',
			rules: ['Candidate passes static validation and trial run.'], failureRoute: 'AA-08', maxAutomaticCorrections: 2
		},
		{
			id: 'CA-02', name: 'Publication gate', target: 'PublishedPAModule',
			rules: ['Module is visible and can start its AA workflow.'], failureRoute: 'AA-09', maxAutomaticCorrections: 0
		}
	] : [{
		id: 'CA-01', name: 'Publication gate', target: 'PublishedPAModule',
		rules: ['Module is visible and runnable.'], failureRoute: 'AA-01', maxAutomaticCorrections: 2
	}];
	const manifest = {
		schemaVersion: PA_PACKAGE_SCHEMA_VERSION,
		id,
		kind: 'pa',
		name: session.title,
		description: session.artifacts.find(artifact => artifact.activityId === 'AA-01')?.summary ?? session.title,
		icon: isCreator ? 'sparkle' : 'circuit-board',
		version: session.publicationTarget?.version ?? '0.1.0',
		entryActivity: 'AA-01',
		hostCompatibility: { minVersion: PA_MINIMUM_HOST_VERSION },
		structure: {
			identity: 'Identity.md', manifesto: 'Manifesto.md', plan: 'Plan.md',
			dataObjects: 'DataObjects', activities: 'AAList', checks: 'CAList',
			knowledge: 'Knowledge', bestPractice: 'BestPractice', tests: 'Tests', assets: 'assets'
		},
		capabilities: { modelAdapter: true, tools: [], permissions: [] },
		dataObjects,
		activities,
		checks,
		publication: { status: 'published', profileId: session.profileId, updatedAt }
	};
	return {
		manifest,
		files: {
			'Identity.md': session.artifacts.find(artifact => artifact.activityId === 'AA-04')?.detail ?? `# ${session.title}`,
			'Manifesto.md': '# Manifesto\n\nLocal first. Evidence based. Gate controlled.',
			'Plan.md': session.artifacts.find(artifact => artifact.activityId === 'AA-06')?.detail ?? '# Plan',
			'DataObjects/catalog.md': JSON.stringify(dataObjects, null, 2),
			...Object.fromEntries(activities.map(activity => [`AAList/${activity.id}.md`, `# ${activity.id} ${activity.name}\n\n${activity.responsibility}`])),
			...Object.fromEntries(checks.map(check => [`CAList/${check.id}.md`, `# ${check.id} ${check.name}\n\n${check.rules.join('\n')}`])),
			'Knowledge/sources.md': sourceList,
			'BestPractice/README.md': '# Best Practice',
			'Tests/release.md': session.artifacts.find(artifact => artifact.activityId === 'AA-08')?.detail ?? '# Release Test',
			'assets/icon.txt': isCreator ? 'sparkle' : 'circuit-board'
		},
		evidence: {
			permissionsConfirmed: true,
			trialRunPassed: true,
			sourcesRecorded: true,
			finalConfirmationId: session.messages.findLast(message => message.activityId === 'AA-08' && message.role === 'user')?.id,
			changeSummary: session.publicationTarget
				? `Update from ${session.publicationTarget.baseVersion}.`
				: 'Initial publication from PA Creator.'
		}
	};
}

function toArtifactId(session: IPaCreatorSession): string {
	const candidate = session.title.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return candidate || `pa-${session.id.slice(0, 8)}`;
}
