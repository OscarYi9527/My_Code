/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { validateAiEditorProxyArtifact } from '../lib/aiEditorProxyArtifact.ts';
import {
	type AiEditorProxyReleaseTargetName,
	type IAiEditorProxyReleaseTarget,
	isAiEditorProxyReleaseTargetName,
	readAiEditorProxyReleaseSource
} from '../lib/aiEditorProxyRelease.ts';

interface IArguments {
	source?: string;
	out?: string;
	platform?: string;
	target?: AiEditorProxyReleaseTargetName;
}

function parseArguments(argv: string[]): IArguments {
	const result: IArguments = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--source' || argument === '--out' || argument === '--platform' || argument === '--target') {
			const value = argv[++index];
			if (!value) {
				throw new Error(`Missing value for ${argument}.`);
			}
			if (argument === '--target') {
				if (!isAiEditorProxyReleaseTargetName(value)) {
					throw new Error(`Unsupported AI Editor Proxy release target: ${value}.`);
				}
				result.target = value;
			} else {
				result[argument.slice(2) as 'source' | 'out' | 'platform'] = value;
			}
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}
	return result;
}

function isInside(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function run(command: string, args: string[], cwd: string): string {
	return cp.execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		windowsHide: true
	}).trim();
}

export function copyAiEditorProxyTargetFiles(
	sourceRoot: string,
	artifactRoot: string,
	targetName: AiEditorProxyReleaseTargetName,
	target: IAiEditorProxyReleaseTarget
): void {
	const resolvedSourceRoot = path.resolve(sourceRoot);
	const resolvedArtifactRoot = path.resolve(artifactRoot);
	for (const include of target.include) {
		const recursiveDirectory = include.endsWith('/**');
		const relativePath = recursiveDirectory ? include.slice(0, -3) : include;
		const source = path.resolve(resolvedSourceRoot, ...relativePath.split('/'));
		const destination = path.resolve(resolvedArtifactRoot, ...relativePath.split('/'));
		if (!isInsideOrEqual(resolvedSourceRoot, source) || !isInsideOrEqual(resolvedArtifactRoot, destination)) {
			throw new Error(`Unsafe ${targetName} release path: ${include}.`);
		}

		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(source);
		} catch {
			throw new Error(`Required ${targetName} release path is missing: ${source}.`);
		}
		if (recursiveDirectory) {
			if (!stat.isDirectory()) {
				throw new Error(`Required ${targetName} release directory is not a directory: ${source}.`);
			}
			fs.cpSync(source, destination, { recursive: true });
		} else {
			if (!stat.isFile()) {
				throw new Error(`Required ${targetName} release file is not a file: ${source}.`);
			}
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.copyFileSync(source, destination);
		}
	}
}

function assertCleanSource(sourceRoot: string): string {
	const status = run('git', ['status', '--porcelain', '--untracked-files=all'], sourceRoot);
	if (status) {
		throw new Error(
			'The codex_proxy source tree has uncommitted files. Commit or remove them before creating a release artifact.'
		);
	}
	const commit = run('git', ['rev-parse', 'HEAD'], sourceRoot);
	if (!/^[0-9a-f]{40}$/i.test(commit)) {
		throw new Error(`Unable to resolve a full codex_proxy commit: ${commit}`);
	}
	return commit;
}

function sourceDate(): string {
	const epoch = Number(process.env['SOURCE_DATE_EPOCH']);
	return Number.isFinite(epoch) && epoch >= 0
		? new Date(epoch * 1000).toISOString()
		: new Date().toISOString();
}

function assertArtifactSafe(artifactRoot: string): void {
	const forbiddenNames = new Set([
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
	const forbiddenExtensions = new Set(['.log', '.pid']);

	const pending = [artifactRoot];
	while (pending.length) {
		const directory = pending.pop()!;
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === '.git' || entry.name === '.config-backups' || entry.name === '.account-backups') {
					throw new Error(`Forbidden directory in Proxy artifact: ${fullPath}`);
				}
				pending.push(fullPath);
			} else if (forbiddenNames.has(entry.name) || forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) {
				throw new Error(`Forbidden runtime/user-data file in Proxy artifact: ${fullPath}`);
			}
		}
	}
}

function artifactChecksums(artifactRoot: string): Record<string, string> {
	const checksums: Record<string, string> = {};
	const pending = [artifactRoot];
	while (pending.length) {
		const directory = pending.pop()!;
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(fullPath);
			} else if (entry.name !== 'release-manifest.json') {
				const relativePath = path.relative(artifactRoot, fullPath).replace(/\\/g, '/');
				checksums[relativePath] = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
			}
		}
	}
	return Object.fromEntries(Object.entries(checksums).sort(([left], [right]) => left.localeCompare(right)));
}

export function main(): void {
	const args = parseArguments(process.argv.slice(2));
	const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
	const buildRoot = path.join(repositoryRoot, '.build');
	const sourceRoot = path.resolve(args.source ?? process.env['VSCODE_AI_EDITOR_PROXY_ROOT'] ?? '');
	const artifactRoot = path.resolve(args.out ?? path.join(buildRoot, 'ai-editor-proxy'));
	const releaseSource = readAiEditorProxyReleaseSource(path.join(import.meta.dirname, 'release.json'));
	const targetName = args.target ?? releaseSource.productTarget;
	const target = releaseSource.targets[targetName];

	if (!args.source && !process.env['VSCODE_AI_EDITOR_PROXY_ROOT']) {
		throw new Error('Pass --source or set VSCODE_AI_EDITOR_PROXY_ROOT to the codex_proxy checkout.');
	}
	if (!isInside(buildRoot, artifactRoot)) {
		throw new Error(`Proxy artifact output must stay inside ${buildRoot}: ${artifactRoot}`);
	}
	if (!fs.existsSync(path.join(sourceRoot, ...target.entryPoint.split('/')))) {
		throw new Error(`codex_proxy ${targetName} entry point was not found under ${sourceRoot}.`);
	}

	const commit = assertCleanSource(sourceRoot);
	if (commit.toLowerCase() !== releaseSource.commit.toLowerCase()) {
		throw new Error(
			`codex_proxy commit mismatch: expected ${releaseSource.commit}, found ${commit}. ` +
			'Update build/ai-editor-proxy/release.json explicitly before shipping a different Proxy revision.'
		);
	}
	const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')) as {
		name?: string;
		version?: string;
	};
	if (packageJson.name !== 'codex-proxy' || !packageJson.version) {
		throw new Error('Unexpected codex_proxy package metadata.');
	}
	if (packageJson.version !== releaseSource.version) {
		throw new Error(
			`codex_proxy version mismatch: expected ${releaseSource.version}, found ${packageJson.version}.`
		);
	}

	// The output target is checked above before this recursive removal.
	fs.rmSync(artifactRoot, { recursive: true, force: true });
	fs.mkdirSync(artifactRoot, { recursive: true });

	copyAiEditorProxyTargetFiles(sourceRoot, artifactRoot, targetName, target);

	const npmCli = process.env['npm_execpath'];
	if (!npmCli) {
		throw new Error('npm_execpath is unavailable. Run this preparer through npm run prepare-ai-editor-proxy.');
	}
	const npmArguments = [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
	if (!target.npmWorkspaces) {
		npmArguments.push('--workspaces=false');
	}
	run(process.execPath, npmArguments, artifactRoot);

	assertArtifactSafe(artifactRoot);
	const releaseManifest = {
		schemaVersion: 2,
		name: 'codex_proxy',
		version: packageJson.version,
		commit,
		builtAt: sourceDate(),
		platform: args.platform ?? `${process.platform}-${process.arch}`,
		target: targetName,
		entryPoint: target.entryPoint,
		files: artifactChecksums(artifactRoot)
	};
	fs.writeFileSync(
		path.join(artifactRoot, 'release-manifest.json'),
		`${JSON.stringify(releaseManifest, null, '\t')}\n`,
		'utf8'
	);
	validateAiEditorProxyArtifact(artifactRoot, releaseManifest.platform, targetName);
	console.log(JSON.stringify({
		artifactRoot,
		name: releaseManifest.name,
		version: releaseManifest.version,
		commit: releaseManifest.commit,
		platform: releaseManifest.platform,
		target: releaseManifest.target,
		fileCount: Object.keys(releaseManifest.files).length
	}));
}

function isInsideOrEqual(parent: string, candidate: string): boolean {
	return parent === candidate || isInside(parent, candidate);
}

if (import.meta.main) {
	main();
}
