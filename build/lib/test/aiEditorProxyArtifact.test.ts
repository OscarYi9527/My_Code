/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { validateAiEditorProxyArtifact } from '../aiEditorProxyArtifact.ts';

function createArtifact(platform = 'win32-x64'): string {
	const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-editor-proxy-artifact-'));
	const files: Record<string, string> = {
		'LICENSE': 'MIT\n',
		'ThirdPartyNotices.txt': 'undici 8.7.0\nMIT License\n',
		'package-lock.json': '{}\n',
		'package.json': '{"name":"codex-proxy","version":"2.2.0"}\n',
		'src/server.js': 'console.log("proxy");\n'
	};
	const checksums: Record<string, string> = {};

	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = path.join(artifactRoot, ...relativePath.split('/'));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
		checksums[relativePath] = crypto.createHash('sha256').update(contents).digest('hex');
	}

	fs.writeFileSync(path.join(artifactRoot, 'release-manifest.json'), JSON.stringify({
		schemaVersion: 1,
		name: 'codex_proxy',
		version: '2.2.0',
		commit: 'a'.repeat(40),
		builtAt: '2026-07-15T00:00:00.000Z',
		platform,
		entryPoint: 'src/server.js',
		files: checksums
	}));

	return artifactRoot;
}

suite('AI Editor Proxy release artifact', () => {
	test('accepts a complete artifact for the requested platform', t => {
		const artifactRoot = createArtifact();
		t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));

		const manifest = validateAiEditorProxyArtifact(artifactRoot, 'win32-x64');

		assert.strictEqual(manifest.name, 'codex_proxy');
		assert.strictEqual(manifest.version, '2.2.0');
	});

	test('rejects a platform mismatch', t => {
		const artifactRoot = createArtifact('darwin-arm64');
		t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));

		assert.throws(
			() => validateAiEditorProxyArtifact(artifactRoot, 'win32-x64'),
			/platform mismatch/
		);
	});

	test('rejects user data even when it is added to the manifest', t => {
		const artifactRoot = createArtifact();
		t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));
		const credentialPath = path.join(artifactRoot, 'auth.json');
		const contents = '{"token":"must-not-ship"}';
		fs.writeFileSync(credentialPath, contents);

		const manifestPath = path.join(artifactRoot, 'release-manifest.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
			files: Record<string, string>;
		};
		manifest.files['auth.json'] = crypto.createHash('sha256').update(contents).digest('hex');
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		assert.throws(
			() => validateAiEditorProxyArtifact(artifactRoot, 'win32-x64'),
			/Forbidden user-data file/
		);
	});

	test('rejects changed program files', t => {
		const artifactRoot = createArtifact();
		t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));
		fs.appendFileSync(path.join(artifactRoot, 'src', 'server.js'), '// changed');

		assert.throws(
			() => validateAiEditorProxyArtifact(artifactRoot, 'win32-x64'),
			/checksum mismatch/
		);
	});

	test('rejects an artifact without third-party notices', t => {
		const artifactRoot = createArtifact();
		t.after(() => fs.rmSync(artifactRoot, { recursive: true, force: true }));
		fs.rmSync(path.join(artifactRoot, 'ThirdPartyNotices.txt'));

		const manifestPath = path.join(artifactRoot, 'release-manifest.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
			files: Record<string, string>;
		};
		delete manifest.files['ThirdPartyNotices.txt'];
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		assert.throws(
			() => validateAiEditorProxyArtifact(artifactRoot, 'win32-x64'),
			/missing required file: ThirdPartyNotices\.txt/
		);
	});

	test('keeps installer cleanup inside the application directory', () => {
		const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
		const installer = fs.readFileSync(path.join(repositoryRoot, 'build', 'win32', 'code.iss'), 'utf8');
		const proxyCleanup = 'Name: "{app}\\{#VersionedResourcesFolder}\\resources\\app\\ai-editor-proxy"';

		assert.ok(installer.includes(proxyCleanup), 'installer must replace the bundled Proxy program directory');
		assert.ok(!/\\.claude[\\/]proxy/i.test(installer), 'installer must not reference the Proxy user-data directory');
	});
});
