/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

export interface IAiEditorProxyReleaseSource {
	readonly schemaVersion: number;
	readonly repository: string;
	readonly commit: string;
	readonly version: string;
}

export interface IAiEditorProxyReleaseIdentity {
	readonly commit: string;
	readonly version: string;
}

export function validateAiEditorProxyReleaseSource(
	value: unknown,
	description = 'AI Editor Proxy release source'
): IAiEditorProxyReleaseSource {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid ${description}.`);
	}

	const source = value as Partial<IAiEditorProxyReleaseSource>;
	if (
		source.schemaVersion !== 1 ||
		typeof source.repository !== 'string' ||
		!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(source.repository) ||
		typeof source.commit !== 'string' ||
		!/^[0-9a-f]{40}$/i.test(source.commit) ||
		typeof source.version !== 'string' ||
		!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(source.version)
	) {
		throw new Error(`Invalid ${description}.`);
	}

	return source as IAiEditorProxyReleaseSource;
}

export function readAiEditorProxyReleaseSource(filePath: string): IAiEditorProxyReleaseSource {
	let value: unknown;
	try {
		value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (error) {
		throw new Error(`Unable to read AI Editor Proxy release source: ${filePath}`, { cause: error });
	}
	return validateAiEditorProxyReleaseSource(value, `AI Editor Proxy release source at ${filePath}`);
}

export function assertAiEditorProxyReleaseIdentity(
	identity: IAiEditorProxyReleaseIdentity,
	source: IAiEditorProxyReleaseSource
): void {
	if (identity.commit.toLowerCase() !== source.commit.toLowerCase()) {
		throw new Error(
			`AI Editor Proxy release commit mismatch: expected ${source.commit}, found ${identity.commit}.`
		);
	}
	if (identity.version !== source.version) {
		throw new Error(
			`AI Editor Proxy release version mismatch: expected ${source.version}, found ${identity.version}.`
		);
	}
}
