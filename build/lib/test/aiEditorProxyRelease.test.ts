/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { copyAiEditorProxyTargetFiles } from '../../ai-editor-proxy/prepare.ts';
import {
	AI_EDITOR_PROXY_EDGE_TARGET,
	assertAiEditorProxyReleaseIdentity,
	type IAiEditorProxyReleaseSource,
	readAiEditorProxyReleaseSource,
	validateAiEditorProxyReleaseSource
} from '../aiEditorProxyRelease.ts';

suite('AI Editor Proxy release source', () => {
	test('pins the distributable Proxy identity and separate release targets', () => {
		const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
		const source = readAiEditorProxyReleaseSource(
			path.join(repositoryRoot, 'build', 'ai-editor-proxy', 'release.json')
		);

		assert.strictEqual(source.schemaVersion, 2);
		assert.strictEqual(source.repository, 'OscarYi9527/codex_proxy');
		assert.match(source.commit, /^[0-9a-f]{40}$/);
		assert.match(source.version, /^\d+\.\d+\.\d+$/);
		assert.strictEqual(source.productTarget, 'legacy-standalone');
		assert.strictEqual(source.targets.edge.entryPoint, 'src/launcher.js');
		assert.strictEqual(source.targets.gateway.entryPoint, 'gateway/dist/server.js');
		assert.ok(!source.targets.edge.include.some(include => include.startsWith('gateway/')));
		assert.ok(!source.targets.gateway.include.some(include => include.startsWith('src/edge/')));
	});

	test('rejects mutable refs and incomplete package versions', () => {
		assert.throws(
			() => validateAiEditorProxyReleaseSource({
				...validReleaseSource(),
				repository: 'OscarYi9527/codex_proxy',
				commit: 'master',
				version: '2.2'
			}),
			/Invalid AI Editor Proxy release source/
		);
	});

	test('rejects repository URLs so checkout ownership remains explicit', () => {
		assert.throws(
			() => validateAiEditorProxyReleaseSource({
				...validReleaseSource(),
				repository: 'https://github.com/OscarYi9527/codex_proxy',
			}),
			/Invalid AI Editor Proxy release source/
		);
	});

	test('rejects release targets that cross the Edge and Gateway boundary', () => {
		const source = validReleaseSource();
		assert.throws(
			() => validateAiEditorProxyReleaseSource({
				...source,
				targets: {
					...source.targets,
					edge: {
						...source.targets.edge,
						include: [...source.targets.edge.include, 'gateway/**']
					}
				}
			}),
			/target boundary: edge/
		);
	});

	test('copies only files selected by the Edge allowlist', t => {
		const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-editor-proxy-source-'));
		const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-editor-edge-artifact-'));
		t.after(() => {
			fs.rmSync(sourceRoot, { recursive: true, force: true });
			fs.rmSync(artifactRoot, { recursive: true, force: true });
		});
		for (const relativePath of [
			'LICENSE',
			'ThirdPartyNotices.txt',
			'package-lock.json',
			'package.json',
			'src/launcher.js',
			'src/mode.js',
			'src/edge/edge-server.js',
			'src/server.js',
			'src/admin/admin.js',
			'gateway/dist/server.js'
		]) {
			const filePath = path.join(sourceRoot, ...relativePath.split('/'));
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, relativePath);
		}

		const target = validReleaseSource().targets.edge;
		copyAiEditorProxyTargetFiles(sourceRoot, artifactRoot, AI_EDITOR_PROXY_EDGE_TARGET, target);

		assert.ok(fs.existsSync(path.join(artifactRoot, 'src', 'edge', 'edge-server.js')));
		assert.ok(fs.existsSync(path.join(artifactRoot, 'src', 'launcher.js')));
		assert.ok(!fs.existsSync(path.join(artifactRoot, 'src', 'server.js')));
		assert.ok(!fs.existsSync(path.join(artifactRoot, 'src', 'admin')));
		assert.ok(!fs.existsSync(path.join(artifactRoot, 'gateway')));
	});

	test('rejects artifacts that differ from the pinned release identity', () => {
		const source = validReleaseSource();

		assert.throws(
			() => assertAiEditorProxyReleaseIdentity({ commit: 'b'.repeat(40), version: '2.2.0', target: source.productTarget }, source),
			/release commit mismatch/
		);
		assert.throws(
			() => assertAiEditorProxyReleaseIdentity({ commit: source.commit, version: '2.3.0', target: source.productTarget }, source),
			/release version mismatch/
		);
		assert.throws(
			() => assertAiEditorProxyReleaseIdentity({ commit: source.commit, version: source.version, target: 'edge' }, source),
			/release target mismatch/
		);
	});
});

function validReleaseSource(): IAiEditorProxyReleaseSource {
	const metadata = ['package.json', 'package-lock.json', 'LICENSE', 'ThirdPartyNotices.txt'];
	return {
		schemaVersion: 2,
		repository: 'OscarYi9527/codex_proxy',
		commit: 'a'.repeat(40),
		version: '2.2.0',
		productTarget: 'legacy-standalone',
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
	};
}
