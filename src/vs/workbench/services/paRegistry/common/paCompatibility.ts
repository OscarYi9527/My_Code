/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * P9 release baseline. Changes to these values require a package migration,
 * registry migration, or host compatibility review rather than an in-place
 * edit to an already published PA version.
 */
export const PA_PACKAGE_SCHEMA_VERSION = '1.0' as const;
export const PA_REGISTRY_SCHEMA_VERSION = 2;
export const PA_MINIMUM_HOST_VERSION = '1.127.0' as const;
export const PA_CURRENT_HOST_VERSION = '1.127.0' as const;

export const PA_PACKAGE_MANIFEST_PATH = 'pa.json' as const;
export const PA_REQUIRED_PACKAGE_FILES = [
	'Identity.md',
	'Manifesto.md',
	'Plan.md'
] as const;
export const PA_REQUIRED_PACKAGE_DIRECTORIES = [
	'DataObjects',
	'AAList',
	'CAList',
	'Knowledge',
	'BestPractice',
	'Tests',
	'assets'
] as const;

export function comparePaSemanticVersions(left: string, right: string): number {
	const [leftCore, leftPrerelease] = left.split('-', 2);
	const [rightCore, rightPrerelease] = right.split('-', 2);
	const leftParts = leftCore.split('.').map(Number);
	const rightParts = rightCore.split('.').map(Number);
	for (let index = 0; index < 3; index++) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) {
			return difference;
		}
	}
	if (leftPrerelease === undefined || rightPrerelease === undefined) {
		return leftPrerelease === rightPrerelease ? 0 : leftPrerelease === undefined ? 1 : -1;
	}
	const leftIdentifiers = leftPrerelease.split('.');
	const rightIdentifiers = rightPrerelease.split('.');
	for (let index = 0; index < Math.max(leftIdentifiers.length, rightIdentifiers.length); index++) {
		const leftIdentifier = leftIdentifiers[index];
		const rightIdentifier = rightIdentifiers[index];
		if (leftIdentifier === undefined || rightIdentifier === undefined) {
			return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
		}
		if (leftIdentifier === rightIdentifier) {
			continue;
		}
		const leftNumber = /^\d+$/.test(leftIdentifier) ? Number(leftIdentifier) : undefined;
		const rightNumber = /^\d+$/.test(rightIdentifier) ? Number(rightIdentifier) : undefined;
		if (leftNumber !== undefined || rightNumber !== undefined) {
			return leftNumber !== undefined && rightNumber !== undefined
				? leftNumber - rightNumber
				: leftNumber !== undefined ? -1 : 1;
		}
		return leftIdentifier < rightIdentifier ? -1 : 1;
	}
	return 0;
}
