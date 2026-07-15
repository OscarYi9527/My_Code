/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface IAiEditorProxyReleaseManifest {
	schemaVersion: number;
	name: string;
	version: string;
	commit: string;
	builtAt: string;
	platform: string;
	entryPoint: string;
	files: Record<string, string>;
}

const forbiddenFileNames = new Set([
	'.auth-debug.log',
	'.credential-key.dpapi.json',
	'auth.json',
	'codex-proxy-config.json',
	'codex-proxy-provider-health.json',
	'codex-proxy-requests.log',
	'codex-proxy-stats.json',
	'current-model.json',
	'quota-status.json'
]);

const forbiddenDirectoryNames = new Set([
	'.account-backups',
	'.config-backups',
	'.git',
	'.github',
	'coverage',
	'tests'
]);

const requiredFiles = [
	'LICENSE',
	'ThirdPartyNotices.txt',
	'package-lock.json',
	'package.json',
	'src/server.js'
];

function sha256(filePath: string): string {
	return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertSafeArtifactPath(relativePath: string): void {
	if (
		!relativePath ||
		path.isAbsolute(relativePath) ||
		relativePath.includes('\\') ||
		relativePath.split('/').some(part => !part || part === '.' || part === '..')
	) {
		throw new Error(`Invalid AI Editor Proxy artifact path: ${relativePath}`);
	}

	const parts = relativePath.split('/');
	if (parts.some(part => forbiddenDirectoryNames.has(part))) {
		throw new Error(`Forbidden user-data directory in AI Editor Proxy artifact: ${relativePath}`);
	}

	const fileName = parts.at(-1)!.toLowerCase();
	if (
		forbiddenFileNames.has(fileName) ||
		fileName.endsWith('.log') ||
		fileName.endsWith('.pid') ||
		(parts.length === 1 && (
			/^config.*\.json$/i.test(fileName) ||
			/^stats.*\.json$/i.test(fileName) ||
			/^provider-health.*\.json$/i.test(fileName) ||
			/^route-decisions.*\.json$/i.test(fileName)
		))
	) {
		throw new Error(`Forbidden user-data file in AI Editor Proxy artifact: ${relativePath}`);
	}
}

function collectArtifactFiles(artifactRoot: string, releaseManifestPath: string): string[] {
	const files: string[] = [];
	const pending = [artifactRoot];

	while (pending.length) {
		const directory = pending.pop()!;
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(`Symbolic links are not allowed in the AI Editor Proxy artifact: ${fullPath}`);
			}
			if (entry.isDirectory()) {
				pending.push(fullPath);
			} else if (entry.isFile() && fullPath !== releaseManifestPath) {
				const relativePath = path.relative(artifactRoot, fullPath).replace(/\\/g, '/');
				assertSafeArtifactPath(relativePath);
				files.push(relativePath);
			} else if (!entry.isFile()) {
				throw new Error(`Unsupported file type in the AI Editor Proxy artifact: ${fullPath}`);
			}
		}
	}

	return files.sort();
}

export function validateAiEditorProxyArtifact(
	artifactRoot: string,
	expectedPlatform?: string
): IAiEditorProxyReleaseManifest {
	const resolvedRoot = path.resolve(artifactRoot);
	const releaseManifestPath = path.join(resolvedRoot, 'release-manifest.json');
	const entryPointPath = path.join(resolvedRoot, 'src', 'server.js');

	if (!fs.existsSync(entryPointPath) || !fs.existsSync(releaseManifestPath)) {
		throw new Error(`AI Editor Proxy artifact is missing at ${resolvedRoot}.`);
	}

	let metadata: IAiEditorProxyReleaseManifest;
	try {
		metadata = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8')) as IAiEditorProxyReleaseManifest;
	} catch (error) {
		throw new Error(`Unable to read AI Editor Proxy release manifest: ${releaseManifestPath}`, { cause: error });
	}

	if (
		metadata.schemaVersion !== 1 ||
		metadata.name !== 'codex_proxy' ||
		typeof metadata.version !== 'string' ||
		!metadata.version ||
		metadata.entryPoint !== 'src/server.js' ||
		!/^[0-9a-f]{40}$/i.test(metadata.commit) ||
		!Number.isFinite(Date.parse(metadata.builtAt)) ||
		typeof metadata.platform !== 'string' ||
		!metadata.platform ||
		!metadata.files ||
		typeof metadata.files !== 'object' ||
		Array.isArray(metadata.files) ||
		Object.keys(metadata.files).length === 0
	) {
		throw new Error(`Invalid AI Editor Proxy release manifest: ${releaseManifestPath}`);
	}

	if (expectedPlatform && metadata.platform !== expectedPlatform) {
		throw new Error(
			`AI Editor Proxy artifact platform mismatch: expected ${expectedPlatform}, found ${metadata.platform}.`
		);
	}

	const expectedFiles = Object.keys(metadata.files).sort();
	for (const requiredFile of requiredFiles) {
		if (!Object.hasOwn(metadata.files, requiredFile)) {
			throw new Error(`AI Editor Proxy artifact is missing required file: ${requiredFile}`);
		}
	}
	for (const relativePath of expectedFiles) {
		assertSafeArtifactPath(relativePath);
		if (!/^[0-9a-f]{64}$/i.test(metadata.files[relativePath])) {
			throw new Error(`Invalid AI Editor Proxy artifact checksum: ${relativePath}`);
		}
	}

	const actualFiles = collectArtifactFiles(resolvedRoot, releaseManifestPath);
	if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
		throw new Error(`AI Editor Proxy artifact file list does not match its release manifest: ${resolvedRoot}`);
	}

	for (const relativePath of expectedFiles) {
		const filePath = path.join(resolvedRoot, ...relativePath.split('/'));
		if (sha256(filePath) !== metadata.files[relativePath].toLowerCase()) {
			throw new Error(`AI Editor Proxy artifact checksum mismatch: ${relativePath}`);
		}
	}

	const packageJson = JSON.parse(fs.readFileSync(path.join(resolvedRoot, 'package.json'), 'utf8')) as {
		name?: string;
		version?: string;
	};
	if (packageJson.name !== 'codex-proxy' || packageJson.version !== metadata.version) {
		throw new Error('AI Editor Proxy package metadata does not match its release manifest.');
	}

	return metadata;
}
