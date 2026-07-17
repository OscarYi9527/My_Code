/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runs only against an already-running, isolated Black Edge. It never starts
 * or stops a service and never writes credentials, prompts, replies, tickets,
 * or local nonces to its report.
 */

const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const blackRepository = 'D:\\AI_prejoct\\codex_proxy-gateway-dev';
const dataRoot = getOption('--data-root') ?? path.join(blackRepository, '.ai-editor-dev', 'oscar-login-verify');
const expectedModel = getOption('--model');
const prompt = getOption('--prompt') ?? 'Reply only with: AI_EDITOR_SSE_OK';
const reportRoot = path.join(repositoryRoot, '.build', 'ai-editor-account-gateway');
const edgeOrigin = 'http://127.0.0.1:47921';
const sharedProxyOrigin = 'http://127.0.0.1:47892';

interface ICheck {
	readonly name: string;
	readonly result: 'PASS' | 'BLOCKED';
	readonly detail: string;
}

async function main(): Promise<void> {
	const resolvedDataRoot = assertDataRoot(dataRoot);
	const reportPath = path.join(reportRoot, 'real-model-sse-acceptance.json');
	const markdownPath = path.join(reportRoot, 'real-model-sse-acceptance.md');
	const checks: ICheck[] = [];
	const sharedBefore = await sharedSnapshot();
	let result: 'PASS' | 'BLOCKED' | 'FAIL' = 'FAIL';
	let error: string | undefined;

	try {
		assertIsolatedService(47920, resolvedDataRoot, 'Gateway');
		assertIsolatedService(47921, resolvedDataRoot, 'Edge');
		const noncePath = path.join(resolvedDataRoot, 'edge-local-nonce.secret');
		const nonce = fs.readFileSync(noncePath, 'utf8').trim();
		if (Buffer.byteLength(nonce, 'utf8') < 32) {
			throw new Error('The isolated Edge nonce is malformed.');
		}

		const status = await fetchJson(`${edgeOrigin}/ai-editor/status`, {
			headers: { 'X-AI-Editor-Local-Nonce': nonce }
		}) as { state?: unknown };
		const state = typeof status.state === 'string' ? status.state : 'unknown';
		if (state !== 'ready') {
			result = 'BLOCKED';
			checks.push({ name: 'account-ready', result: 'BLOCKED', detail: `Edge safe account state: ${state}.` });
			throw new Error('The account is not ready; model and SSE checks were not sent.');
		}
		checks.push({ name: 'account-ready', result: 'PASS', detail: 'Edge safe account state: ready.' });

		const models = await fetchJson(`${edgeOrigin}/v1/models`) as { data?: unknown };
		const modelIds = Array.isArray(models.data)
			? models.data.map(model => typeof model === 'object' && model ? (model as { id?: unknown }).id : undefined)
				.filter((id): id is string => typeof id === 'string' && id.length > 0)
			: [];
		if (modelIds.length === 0 || modelIds.includes('gpt-mock')) {
			throw new Error('The real Edge model catalog is empty or exposed gpt-mock.');
		}
		const model = expectedModel ?? modelIds[0];
		if (!modelIds.includes(model)) {
			throw new Error('The requested model is not in the authorized Edge catalog.');
		}
		checks.push({ name: 'model-catalog', result: 'PASS', detail: `Selected an authorized model from ${modelIds.length} catalog entries.` });

		const response = await fetch(`${edgeOrigin}/v1/responses`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
			body: JSON.stringify({ model, input: prompt, stream: true })
		});
		if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
			throw new Error('The real Responses request did not return an SSE stream.');
		}
		let bytesRead = 0;
		let sawCompleted = false;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) {
				break;
			}
			bytesRead += chunk.value.byteLength;
			if (bytesRead > 1024 * 1024) {
				throw new Error('The Responses SSE verification exceeded its 1 MiB safety limit.');
			}
			if (decoder.decode(chunk.value, { stream: true }).includes('response.completed')) {
				sawCompleted = true;
			}
		}
		if (!sawCompleted) {
			throw new Error('The Responses SSE stream did not emit response.completed.');
		}
		checks.push({ name: 'responses-sse', result: 'PASS', detail: 'Responses SSE emitted response.completed.' });
		result = 'PASS';
	} catch (caught) {
		error = caught instanceof Error ? caught.message : 'Model/SSE verification failed.';
		if (result !== 'BLOCKED') {
			result = 'FAIL';
		}
	}

	const sharedAfter = await sharedSnapshot();
	const unchanged = sharedBefore.processId === sharedAfter.processId && sharedBefore.liveStatus === sharedAfter.liveStatus;
	if (!unchanged) {
		result = 'FAIL';
		error = 'The shared Proxy changed during model/SSE verification.';
	} else {
		checks.push({ name: 'shared-proxy-invariant', result: 'PASS', detail: 'Shared Proxy PID and /live status stayed unchanged.' });
	}

	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		result,
		checks,
		sharedProxy: { before: sharedBefore, after: sharedAfter, unchanged },
		error: error ? 'Real model/SSE acceptance did not complete. No prompt, reply, nonce, ticket, or token was written to this report.' : undefined
	};
	fs.mkdirSync(reportRoot, { recursive: true });
	fs.writeFileSync(reportPath, `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
	fs.writeFileSync(markdownPath, [
		'# AI Editor real model and SSE acceptance',
		'',
		`- Result: **${result}**`,
		`- Shared Proxy unchanged: ${unchanged}`,
		'',
		'| Check | Result | Detail |',
		'| --- | --- | --- |',
		...checks.map(check => `| ${check.name} | ${check.result} | ${check.detail} |`),
		...(error ? ['', '> Acceptance did not complete; inspect only isolated local logs.'] : [])
	].join('\n').concat('\n'), 'utf8');
	console.log(JSON.stringify({ result, report: reportPath, markdown: markdownPath, checks: checks.length, sharedProxyPid: sharedAfter.processId }, undefined, 2));
	if (result !== 'PASS') {
		process.exitCode = 1;
	}
}

function getOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
}

function assertDataRoot(value: string): string {
	const allowed = path.resolve(blackRepository, '.ai-editor-dev');
	const resolved = path.resolve(value);
	if (!resolved.startsWith(`${allowed}${path.sep}`)) {
		throw new Error('The data root must stay under the isolated Black .ai-editor-dev directory.');
	}
	return resolved;
}

function listenerProcessId(port: number): number | undefined {
	const command = `$listener = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { [int]$listener.OwningProcess }`;
	const output = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }).stdout.trim();
	return /^\d+$/.test(output) ? Number(output) : undefined;
}

function assertIsolatedService(port: number, dataRoot: string, name: string): void {
	const processId = listenerProcessId(port);
	if (!processId) {
		throw new Error(`${name} is not listening.`);
	}
	const pidFile = path.join(dataRoot, `${name.toLowerCase()}.pid.json`);
	const recorded = JSON.parse(fs.readFileSync(pidFile, 'utf8').replace(/^\uFEFF/, '')) as { pid?: unknown };
	if (recorded.pid !== processId) {
		throw new Error(`${name} is not the requested isolated Black service.`);
	}
	const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${processId}').CommandLine`;
	const commandLine = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }).stdout;
	if (!commandLine.includes(blackRepository)) {
		throw new Error(`${name} is not the requested isolated Black service.`);
	}
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from isolated Edge.`);
	}
	return response.json();
}

async function sharedSnapshot(): Promise<{ processId: number | undefined; liveStatus: string }> {
	const response = await fetchJson(`${sharedProxyOrigin}/live`) as { status?: unknown };
	if (response.status !== 'ok') {
		throw new Error('Shared Proxy /live is not healthy.');
	}
	return { processId: listenerProcessId(47892), liveStatus: 'ok' };
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : 'Model/SSE verification failed.');
	process.exitCode = 1;
});
