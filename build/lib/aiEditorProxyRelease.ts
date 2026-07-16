/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

export const AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET = 'legacy-standalone';
export const AI_EDITOR_PROXY_EDGE_TARGET = 'edge';
export const AI_EDITOR_PROXY_GATEWAY_TARGET = 'gateway';

export type AiEditorProxyReleaseTargetName =
	| typeof AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET
	| typeof AI_EDITOR_PROXY_EDGE_TARGET
	| typeof AI_EDITOR_PROXY_GATEWAY_TARGET;

export interface IAiEditorProxyReleaseTarget {
	readonly entryPoint: string;
	readonly include: readonly string[];
	readonly npmWorkspaces: boolean;
}

export interface IAiEditorProxyReleaseSource {
	readonly schemaVersion: number;
	readonly repository: string;
	readonly commit: string;
	readonly version: string;
	readonly productTarget: AiEditorProxyReleaseTargetName;
	readonly targets: Readonly<Record<AiEditorProxyReleaseTargetName, IAiEditorProxyReleaseTarget>>;
}

export interface IAiEditorProxyReleaseIdentity {
	readonly commit: string;
	readonly version: string;
	readonly target?: AiEditorProxyReleaseTargetName;
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
		source.schemaVersion !== 2 ||
		typeof source.repository !== 'string' ||
		!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(source.repository) ||
		typeof source.commit !== 'string' ||
		!/^[0-9a-f]{40}$/i.test(source.commit) ||
		typeof source.version !== 'string' ||
		!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(source.version) ||
		!isAiEditorProxyReleaseTargetName(source.productTarget) ||
		!source.targets ||
		typeof source.targets !== 'object' ||
		Array.isArray(source.targets)
	) {
		throw new Error(`Invalid ${description}.`);
	}

	const targets = source.targets as Partial<Record<AiEditorProxyReleaseTargetName, unknown>>;
	for (const targetName of [
		AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET,
		AI_EDITOR_PROXY_EDGE_TARGET,
		AI_EDITOR_PROXY_GATEWAY_TARGET
	] as const) {
		validateReleaseTarget(targetName, targets[targetName], description);
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
	const artifactTarget = identity.target ?? AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET;
	if (artifactTarget !== source.productTarget) {
		throw new Error(
			`AI Editor Proxy release target mismatch: expected ${source.productTarget}, found ${artifactTarget}.`
		);
	}
}

export function isAiEditorProxyReleaseTargetName(value: unknown): value is AiEditorProxyReleaseTargetName {
	return value === AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET ||
		value === AI_EDITOR_PROXY_EDGE_TARGET ||
		value === AI_EDITOR_PROXY_GATEWAY_TARGET;
}

function validateReleaseTarget(
	targetName: AiEditorProxyReleaseTargetName,
	value: unknown,
	description: string
): asserts value is IAiEditorProxyReleaseTarget {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid ${description} target: ${targetName}.`);
	}

	const target = value as Partial<IAiEditorProxyReleaseTarget>;
	if (
		typeof target.entryPoint !== 'string' ||
		!Array.isArray(target.include) ||
		typeof target.npmWorkspaces !== 'boolean'
	) {
		throw new Error(`Invalid ${description} target: ${targetName}.`);
	}
	const entryPoint = target.entryPoint;
	const include = target.include;
	if (
		!isSafeReleasePath(entryPoint, false) ||
		include.length === 0 ||
		include.some(candidate => typeof candidate !== 'string' || !isSafeReleasePath(candidate, true)) ||
		new Set(include).size !== include.length ||
		!include.some(candidate => releasePathIncludes(candidate, entryPoint))
	) {
		throw new Error(`Invalid ${description} target: ${targetName}.`);
	}

	for (const requiredFile of ['LICENSE', 'ThirdPartyNotices.txt', 'package-lock.json', 'package.json']) {
		if (!include.some(candidate => releasePathIncludes(candidate, requiredFile))) {
			throw new Error(`Invalid ${description} target ${targetName}: missing ${requiredFile}.`);
		}
	}

	if (
		(targetName === AI_EDITOR_PROXY_LEGACY_STANDALONE_TARGET && entryPoint !== 'src/server.js') ||
		(targetName === AI_EDITOR_PROXY_EDGE_TARGET && (
			entryPoint !== 'src/launcher.js' ||
			target.npmWorkspaces ||
			include.some(candidate => isForbiddenEdgeReleaseInclude(candidate))
		)) ||
		(targetName === AI_EDITOR_PROXY_GATEWAY_TARGET && (
			entryPoint !== 'gateway/dist/server.js' ||
			!target.npmWorkspaces ||
			include.some(candidate => releaseIncludeStartsWith(candidate, 'src/edge/'))
		))
	) {
		throw new Error(`Invalid ${description} target boundary: ${targetName}.`);
	}
}

function isSafeReleasePath(value: string, allowRecursiveDirectory: boolean): boolean {
	const candidate = allowRecursiveDirectory && value.endsWith('/**')
		? value.slice(0, -3)
		: value;
	return !!candidate &&
		!candidate.endsWith('/') &&
		!candidate.includes('\\') &&
		!candidate.startsWith('/') &&
		!candidate.includes('*') &&
		candidate.split('/').every(part => !!part && part !== '.' && part !== '..');
}

function releasePathIncludes(include: string, relativePath: string): boolean {
	if (include.endsWith('/**')) {
		const directory = include.slice(0, -3);
		return relativePath === directory || relativePath.startsWith(`${directory}/`);
	}
	return include === relativePath;
}

function isForbiddenEdgeReleaseInclude(include: string): boolean {
	const candidate = include.endsWith('/**') ? include.slice(0, -3) : include;
	return candidate === 'gateway' ||
		candidate.startsWith('gateway/') ||
		candidate === 'src/admin' ||
		candidate.startsWith('src/admin/') ||
		candidate === 'src/admin_modules' ||
		candidate.startsWith('src/admin_modules/') ||
		candidate === 'src/routes' ||
		candidate.startsWith('src/routes/') ||
		[
			'src/admin.html',
			'src/admin.js',
			'src/admin_app.js',
			'src/admin_html_head.txt',
			'src/admin_ui_behaviors.cjs',
			'src/chatgpt-accounts.js',
			'src/credential-store.js',
			'src/migrations.js',
			'src/server.js'
		].includes(candidate);
}

function releaseIncludeStartsWith(include: string, prefix: string): boolean {
	const candidate = include.endsWith('/**') ? include.slice(0, -3) : include;
	return candidate === prefix.slice(0, -1) || candidate.startsWith(prefix);
}
