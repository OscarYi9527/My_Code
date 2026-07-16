/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, type TestContext } from 'node:test';
import {
	assertAiEditorAccountReleaseReady,
	verifyAiEditorAccountRelease
} from '../../darwin/verify-ai-editor-account-release.ts';

suite('AI Editor account release checks', () => {
	test('reports migration prerequisites without claiming final Edge readiness', t => {
		const fixture = createFixture(t, { productTarget: 'legacy-standalone' });
		const report = verifyAiEditorAccountRelease({
			repositoryRoot: fixture.root,
			proxySourceRoot: fixture.proxyRoot
		});

		assert.strictEqual(report.result, 'BLOCKED');
		assert.ok(report.blockers.some(blocker => blocker.startsWith('product-target-edge:')));
		assert.ok(report.blockers.some(blocker => blocker.startsWith('fixed-gateway-origin:')));
		assert.ok(report.blockers.some(blocker => blocker.startsWith('macos-keychain:')));
		assert.throws(() => assertAiEditorAccountReleaseReady(report), /final Edge release is blocked/);
	});

	test('accepts an Edge-only release with a fixed HTTPS Gateway and Keychain store', t => {
		const fixture = createFixture(t, {
			productTarget: 'edge',
			gatewayOrigin: 'https://gateway.ai-editor.example',
			keychain: true
		});
		const report = verifyAiEditorAccountRelease({
			repositoryRoot: fixture.root,
			proxySourceRoot: fixture.proxyRoot,
			requireFinalEdge: true
		});

		assert.strictEqual(report.result, 'PASS');
		assert.deepStrictEqual(report.blockers, []);
		assert.doesNotThrow(() => assertAiEditorAccountReleaseReady(report));
	});

	test('blocks loopback and path-bearing production Gateway origins', t => {
		const fixture = createFixture(t, {
			productTarget: 'edge',
			gatewayOrigin: 'https://127.0.0.1:47920/admin',
			keychain: true
		});
		const report = verifyAiEditorAccountRelease({
			repositoryRoot: fixture.root,
			proxySourceRoot: fixture.proxyRoot
		});

		assert.strictEqual(report.result, 'BLOCKED');
		assert.ok(report.blockers.some(blocker => blocker.startsWith('fixed-gateway-origin:')));
	});

	test('rejects an Edge allowlist that includes Gateway resources', t => {
		const fixture = createFixture(t, { productTarget: 'edge', keychain: true });
		const releasePath = path.join(fixture.root, 'build', 'ai-editor-proxy', 'release.json');
		const release = JSON.parse(fs.readFileSync(releasePath, 'utf8')) as {
			targets: { edge: { include: string[] } };
		};
		release.targets.edge.include.push('gateway/**');
		fs.writeFileSync(releasePath, JSON.stringify(release));

		assert.throws(
			() => verifyAiEditorAccountRelease({
				repositoryRoot: fixture.root,
				proxySourceRoot: fixture.proxyRoot
			}),
			/target boundary: edge/
		);
	});
});

function createFixture(
	t: TestContext,
	options: {
		productTarget: 'legacy-standalone' | 'edge';
		gatewayOrigin?: string;
		keychain?: boolean;
	}
): { root: string; proxyRoot: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-editor-account-release-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const releaseDirectory = path.join(root, 'build', 'ai-editor-proxy');
	fs.mkdirSync(releaseDirectory, { recursive: true });
	const metadata = ['package.json', 'package-lock.json', 'LICENSE', 'ThirdPartyNotices.txt'];
	fs.writeFileSync(path.join(releaseDirectory, 'release.json'), JSON.stringify({
		schemaVersion: 2,
		repository: 'example/codex_proxy',
		commit: 'a'.repeat(40),
		version: '2.2.0',
		productTarget: options.productTarget,
		targets: {
			'legacy-standalone': {
				entryPoint: 'src/server.js',
				include: [...metadata, 'src/**'],
				npmWorkspaces: false
			},
			edge: {
				entryPoint: 'src/launcher.js',
				include: [...metadata, 'src/launcher.js', 'src/mode.js', 'src/edge/**'],
				npmWorkspaces: false
			},
			gateway: {
				entryPoint: 'gateway/dist/server.js',
				include: [...metadata, 'gateway/package.json', 'gateway/dist/**'],
				npmWorkspaces: true
			}
		}
	}));
	fs.writeFileSync(
		path.join(root, 'product.json'),
		JSON.stringify(options.gatewayOrigin ? { aiEditorAccountGatewayOrigin: options.gatewayOrigin } : {})
	);

	const accountService = path.join(
		root,
		'src',
		'vs',
		'platform',
		'aiEditorAccount',
		'electron-main',
		'aiEditorAccountMainService.ts'
	);
	fs.mkdirSync(path.dirname(accountService), { recursive: true });
	fs.writeFileSync(
		accountService,
		`if (!environmentMainService.isBuilt) {
			return process.env['VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN'];
		}
		return productService.aiEditorAccountGatewayOrigin;`
	);

	const proxyRoot = path.join(root, 'proxy');
	for (const relativePath of [
		'package-lock.json',
		'src/launcher.js',
		'src/mode.js',
		'src/edge/edge-server.js'
	]) {
		const filePath = path.join(proxyRoot, ...relativePath.split('/'));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, '');
	}
	fs.writeFileSync(path.join(proxyRoot, 'package.json'), JSON.stringify({ name: 'codex-proxy' }));
	const accountStorePath = path.join(proxyRoot, 'src', 'edge', 'local-account-store.js');
	fs.writeFileSync(
		accountStorePath,
		options.keychain
			? `if (process.platform === 'darwin') {
				execFile('security', ['add-generic-password']);
				execFile('security', ['find-generic-password']);
				execFile('security', ['delete-generic-password']);
			}`
			: 'export class LocalAccountStore {}'
	);

	return { root, proxyRoot };
}
