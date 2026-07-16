/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
	AI_EDITOR_PROXY_EDGE_TARGET,
	readAiEditorProxyReleaseSource
} from '../lib/aiEditorProxyRelease.ts';

export interface IAiEditorAccountReleaseCheck {
	readonly id: string;
	readonly status: 'PASS' | 'BLOCKED';
	readonly detail: string;
}

export interface IAiEditorAccountReleaseReport {
	readonly schemaVersion: 1;
	readonly generatedAt: string;
	readonly result: 'PASS' | 'BLOCKED';
	readonly finalEdgeRequired: boolean;
	readonly checks: readonly IAiEditorAccountReleaseCheck[];
	readonly blockers: readonly string[];
}

export interface IAiEditorAccountReleaseOptions {
	readonly repositoryRoot: string;
	readonly proxySourceRoot?: string;
	readonly releaseSourcePath?: string;
	readonly productJsonPath?: string;
	readonly accountMainServicePath?: string;
	readonly requireFinalEdge?: boolean;
}

interface IProductConfiguration {
	readonly aiEditorAccountGatewayOrigin?: unknown;
}

interface IParsedArguments {
	readonly proxySourceRoot?: string;
	readonly releaseSourcePath?: string;
	readonly productJsonPath?: string;
	readonly accountMainServicePath?: string;
	readonly reportPath?: string;
	readonly requireFinalEdge: boolean;
}

const defaultRepositoryRoot = path.resolve(import.meta.dirname, '..', '..');

export function verifyAiEditorAccountRelease(
	options: IAiEditorAccountReleaseOptions
): IAiEditorAccountReleaseReport {
	const repositoryRoot = path.resolve(options.repositoryRoot);
	const releaseSourcePath = path.resolve(
		options.releaseSourcePath ?? path.join(repositoryRoot, 'build', 'ai-editor-proxy', 'release.json')
	);
	const productJsonPath = path.resolve(options.productJsonPath ?? path.join(repositoryRoot, 'product.json'));
	const accountMainServicePath = path.resolve(
		options.accountMainServicePath ??
		path.join(
			repositoryRoot,
			'src',
			'vs',
			'platform',
			'aiEditorAccount',
			'electron-main',
			'aiEditorAccountMainService.ts'
		)
	);
	const checks: IAiEditorAccountReleaseCheck[] = [];
	const addCheck = (id: string, passed: boolean, detail: string): void => {
		checks.push({ id, status: passed ? 'PASS' : 'BLOCKED', detail });
	};

	const releaseSource = readAiEditorProxyReleaseSource(releaseSourcePath);
	addCheck(
		'release-target-boundaries',
		true,
		'Edge and Gateway release allowlists are structurally valid and mutually isolated.'
	);
	addCheck(
		'product-target-edge',
		releaseSource.productTarget === AI_EDITOR_PROXY_EDGE_TARGET,
		releaseSource.productTarget === AI_EDITOR_PROXY_EDGE_TARGET
			? 'The product release target is Edge.'
			: `The migration product still targets ${releaseSource.productTarget}; switch only after the production Edge is pinned.`
	);

	const product = readJson<IProductConfiguration>(productJsonPath, 'product configuration');
	const gatewayOrigin = validateFixedGatewayOrigin(product.aiEditorAccountGatewayOrigin);
	addCheck(
		'fixed-gateway-origin',
		gatewayOrigin.valid,
		gatewayOrigin.detail
	);

	const runtimePolicy = validateBuiltGatewayOriginPolicy(accountMainServicePath);
	addCheck('built-gateway-origin-policy', runtimePolicy.valid, runtimePolicy.detail);

	const edgeSource = validateEdgeSource(options.proxySourceRoot);
	for (const check of edgeSource) {
		checks.push(check);
	}

	const blockers = checks
		.filter(check => check.status === 'BLOCKED')
		.map(check => `${check.id}: ${check.detail}`);
	return {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		result: blockers.length === 0 ? 'PASS' : 'BLOCKED',
		finalEdgeRequired: options.requireFinalEdge === true,
		checks,
		blockers
	};
}

export function assertAiEditorAccountReleaseReady(report: IAiEditorAccountReleaseReport): void {
	if (report.result !== 'PASS') {
		throw new Error(`AI Editor final Edge release is blocked:\n- ${report.blockers.join('\n- ')}`);
	}
}

function readJson<T>(filePath: string, description: string): T {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
	} catch (error) {
		throw new Error(`Unable to read ${description}: ${filePath}`, { cause: error });
	}
}

function validateFixedGatewayOrigin(value: unknown): { valid: boolean; detail: string } {
	if (typeof value !== 'string' || !value.trim()) {
		return {
			valid: false,
			detail: 'product.json does not yet define the production aiEditorAccountGatewayOrigin.'
		};
	}

	try {
		const url = new URL(value);
		const isLoopback = url.hostname === 'localhost' ||
			url.hostname === '::1' ||
			/^127(?:\.\d{1,3}){3}$/.test(url.hostname);
		const valid = url.protocol === 'https:' &&
			value === url.origin &&
			!url.username &&
			!url.password &&
			!isLoopback;
		return valid
			? { valid: true, detail: `The production Gateway origin is fixed to ${url.origin}.` }
			: {
				valid: false,
				detail: 'aiEditorAccountGatewayOrigin must be a non-loopback HTTPS origin without a path, query, fragment, or credentials.'
			};
	} catch {
		return { valid: false, detail: 'aiEditorAccountGatewayOrigin is not a valid URL origin.' };
	}
}

function validateBuiltGatewayOriginPolicy(filePath: string): { valid: boolean; detail: string } {
	let source: string;
	try {
		source = fs.readFileSync(filePath, 'utf8');
	} catch {
		return { valid: false, detail: `The account main-process source was not found: ${filePath}` };
	}

	const hasDevelopmentOverride = source.includes(`process.env['VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN']`);
	const hasBuiltBoundary = source.includes('if (!environmentMainService.isBuilt)');
	const hasProductOrigin = source.includes('productService.aiEditorAccountGatewayOrigin');
	const valid = hasDevelopmentOverride && hasBuiltBoundary && hasProductOrigin;
	return valid
		? {
			valid: true,
			detail: 'Development overrides are confined to unbuilt Code; built products resolve the Gateway from product configuration.'
		}
		: {
			valid: false,
			detail: 'The built-product Gateway origin policy is missing its development/production boundary.'
		};
}

function validateEdgeSource(proxySourceRoot: string | undefined): IAiEditorAccountReleaseCheck[] {
	if (!proxySourceRoot) {
		return [
			{
				id: 'edge-source',
				status: 'BLOCKED',
				detail: 'No Proxy source was supplied; pass --proxy-source to validate the production Edge.'
			},
			{
				id: 'macos-keychain',
				status: 'BLOCKED',
				detail: 'macOS Keychain support cannot be verified without the pinned Proxy source.'
			}
		];
	}

	const sourceRoot = path.resolve(proxySourceRoot);
	const requiredFiles = [
		'package.json',
		'package-lock.json',
		'src/launcher.js',
		'src/mode.js',
		'src/edge/edge-server.js',
		'src/edge/local-account-store.js'
	];
	const missingFiles = requiredFiles.filter(relativePath => !isFile(path.join(sourceRoot, ...relativePath.split('/'))));
	const sourceCheck: IAiEditorAccountReleaseCheck = missingFiles.length === 0
		? {
			id: 'edge-source',
			status: 'PASS',
			detail: 'The pinned Proxy source contains the Edge launcher, server, package metadata, and local account store.'
		}
		: {
			id: 'edge-source',
			status: 'BLOCKED',
			detail: `The pinned Proxy source is missing production Edge files: ${missingFiles.join(', ')}.`
		};

	const localAccountStorePath = path.join(sourceRoot, 'src', 'edge', 'local-account-store.js');
	if (!isFile(localAccountStorePath)) {
		return [
			sourceCheck,
			{
				id: 'macos-keychain',
				status: 'BLOCKED',
				detail: 'src/edge/local-account-store.js is not available, so macOS Keychain storage is not implemented.'
			}
		];
	}

	const source = fs.readFileSync(localAccountStorePath, 'utf8');
	const packageSource = isFile(path.join(sourceRoot, 'package.json'))
		? fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')
		: '';
	const hasDarwinPath = /\bdarwin\b|macOS/i.test(source);
	const usesSecurityCli = /\bsecurity\b/.test(source) &&
		/add-generic-password/.test(source) &&
		/find-generic-password/.test(source) &&
		/delete-generic-password/.test(source);
	const keychainLibrarySource = `${packageSource}\n${source}`;
	const usesKeytar = /\bkeytar\b/.test(keychainLibrarySource) &&
		/\bsetPassword\b/.test(source) &&
		/\bgetPassword\b/.test(source) &&
		/\bdeletePassword\b/.test(source);
	const usesKeyring = /(?:keyring|keychain)/i.test(keychainLibrarySource) &&
		/\b(?:set|store|save)\w*(?:Password|Secret|Credential)\b/i.test(source) &&
		/\b(?:get|find|read)\w*(?:Password|Secret|Credential)\b/i.test(source) &&
		/\b(?:delete|remove|clear)\w*(?:Password|Secret|Credential)\b/i.test(source);
	const hasKeychain = hasDarwinPath && (usesSecurityCli || usesKeytar || usesKeyring);

	return [
		sourceCheck,
		hasKeychain
			? {
				id: 'macos-keychain',
				status: 'PASS',
				detail: 'The Edge local account store contains a macOS-specific Keychain read/write/delete path.'
			}
			: {
				id: 'macos-keychain',
				status: 'BLOCKED',
				detail: 'The Edge local account store does not expose a verifiable macOS Keychain read/write/delete path.'
			}
	];
}

function isFile(filePath: string): boolean {
	return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function parseArguments(argv: readonly string[]): IParsedArguments {
	let proxySourceRoot: string | undefined;
	let releaseSourcePath: string | undefined;
	let productJsonPath: string | undefined;
	let accountMainServicePath: string | undefined;
	let reportPath: string | undefined;
	let requireFinalEdge = false;

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--require-final-edge') {
			requireFinalEdge = true;
			continue;
		}
		if (
			argument === '--proxy-source' ||
			argument === '--release-source' ||
			argument === '--product-json' ||
			argument === '--account-main-service' ||
			argument === '--report'
		) {
			const value = argv[++index];
			if (!value) {
				throw new Error(`Missing value for ${argument}.`);
			}
			switch (argument) {
				case '--proxy-source':
					proxySourceRoot = value;
					break;
				case '--release-source':
					releaseSourcePath = value;
					break;
				case '--product-json':
					productJsonPath = value;
					break;
				case '--account-main-service':
					accountMainServicePath = value;
					break;
				case '--report':
					reportPath = value;
					break;
			}
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	return {
		proxySourceRoot,
		releaseSourcePath,
		productJsonPath,
		accountMainServicePath,
		reportPath,
		requireFinalEdge
	};
}

function writeReport(reportPath: string, report: IAiEditorAccountReleaseReport): void {
	const resolvedPath = path.resolve(reportPath);
	fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
	fs.writeFileSync(resolvedPath, `${JSON.stringify(report, undefined, '\t')}\n`);
}

async function main(): Promise<void> {
	const args = parseArguments(process.argv.slice(2));
	const report = verifyAiEditorAccountRelease({
		repositoryRoot: defaultRepositoryRoot,
		proxySourceRoot: args.proxySourceRoot,
		releaseSourcePath: args.releaseSourcePath,
		productJsonPath: args.productJsonPath,
		accountMainServicePath: args.accountMainServicePath,
		requireFinalEdge: args.requireFinalEdge
	});
	const reportPath = args.reportPath ??
		path.join(defaultRepositoryRoot, '.build', 'ai-editor-release', 'macos-account-static-report.json');
	writeReport(reportPath, report);
	process.stdout.write(`${JSON.stringify({ ...report, reportPath }, undefined, '\t')}\n`);
	if (args.requireFinalEdge) {
		assertAiEditorAccountReleaseReady(report);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch(error => {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
