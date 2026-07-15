/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import { suite, test } from 'node:test';
import { assertAiEditorProxyReleaseIdentity, readAiEditorProxyReleaseSource, validateAiEditorProxyReleaseSource } from '../aiEditorProxyRelease.ts';

suite('AI Editor Proxy release source', () => {
	test('pins the distributable Proxy repository, commit, and version', () => {
		const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
		const source = readAiEditorProxyReleaseSource(
			path.join(repositoryRoot, 'build', 'ai-editor-proxy', 'release.json')
		);

		assert.strictEqual(source.schemaVersion, 1);
		assert.strictEqual(source.repository, 'OscarYi9527/codex_proxy');
		assert.match(source.commit, /^[0-9a-f]{40}$/);
		assert.match(source.version, /^\d+\.\d+\.\d+$/);
	});

	test('rejects mutable refs and incomplete package versions', () => {
		assert.throws(
			() => validateAiEditorProxyReleaseSource({
				schemaVersion: 1,
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
				schemaVersion: 1,
				repository: 'https://github.com/OscarYi9527/codex_proxy',
				commit: 'a'.repeat(40),
				version: '2.2.0'
			}),
			/Invalid AI Editor Proxy release source/
		);
	});

	test('rejects artifacts that differ from the pinned release identity', () => {
		const source = {
			schemaVersion: 1,
			repository: 'OscarYi9527/codex_proxy',
			commit: 'a'.repeat(40),
			version: '2.2.0'
		};

		assert.throws(
			() => assertAiEditorProxyReleaseIdentity({ commit: 'b'.repeat(40), version: '2.2.0' }, source),
			/release commit mismatch/
		);
		assert.throws(
			() => assertAiEditorProxyReleaseIdentity({ commit: source.commit, version: '2.3.0' }, source),
			/release version mismatch/
		);
	});
});
