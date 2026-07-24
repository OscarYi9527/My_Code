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
const blackRepository = resolveBlackRepository(getOption('--black-repository'));
const dataRoot = getOption('--data-root') ?? path.join(blackRepository, '.ai-editor-dev', 'oscar-login-verify');
const expectedModel = getOption('--model');
const expectedProviderId = getOption('--expected-provider-id');
const expectedWorkerId = getOption('--expected-worker-id');
const expectedWorkerRegion = getOption('--expected-worker-region');
const prompt = getOption('--prompt') ?? 'Reply only with: AI_EDITOR_SSE_OK';
const responseTimeoutMs = getIntegerOption('--timeout-ms', 180_000, 1_000, 600_000);
const reportRoot = path.join(repositoryRoot, '.build', 'ai-editor-account-gateway');
const edgeOrigin = normalizeOrigin(
	getOption('--edge-origin') ??
	process.env['AI_EDITOR_VERIFY_EDGE_ORIGIN'] ??
	'http://127.0.0.1:47921'
);
const configuredNonceFile = getOption('--edge-nonce-file') ?? process.env['AI_EDITOR_VERIFY_EDGE_NONCE_FILE'];
const sharedProxyOrigin = 'http://127.0.0.1:47892';

interface ICheck {
	readonly name: string;
	readonly result: 'PASS' | 'BLOCKED' | 'FAIL';
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
	let trustedRoute: {
		readonly providerId: string | null;
		readonly workerId: string | null;
		readonly workerRegion: string | null;
	} | undefined;

	try {
		const edgeUrl = new URL(edgeOrigin);
		if (!isLocalEdge(edgeUrl)) {
			throw new Error('Real model/SSE verification only trusts the isolated loopback Edge on port 47921.');
		}
		assertIsolatedService(47921, resolvedDataRoot, 'Edge');
		const gatewayProcessId = listenerProcessId(47920);
		const gatewayCommandLine = gatewayProcessId === undefined ? '' : processCommandLine(gatewayProcessId);
		const gatewayIsSshForward = gatewayProcessId !== undefined && isLoopbackGatewaySshForward(gatewayCommandLine);
		if (gatewayProcessId !== undefined && !gatewayIsSshForward) {
			assertIsolatedService(47920, resolvedDataRoot, 'Gateway');
		}
		const live = await fetchJson(`${edgeOrigin}/live`) as { status?: unknown; mode?: unknown };
		if (live.status !== 'ok' || live.mode !== 'edge') {
			throw new Error('The isolated Edge /live response is invalid.');
		}
		checks.push({
			name: 'isolated-edge-topology',
			result: 'PASS',
			detail: gatewayProcessId === undefined
				? 'Verified the repository-owned local Edge with an external Gateway.'
				: (gatewayIsSshForward
					? 'Verified the repository-owned local Edge with a fail-closed loopback SSH Gateway forward.'
					: 'Verified the repository-owned local Gateway and Edge.')
		});

		const noncePath = path.resolve(configuredNonceFile ?? path.join(resolvedDataRoot, 'edge-local-nonce.secret'));
		if (!noncePath.startsWith(`${resolvedDataRoot}${path.sep}`)) {
			throw new Error('The Edge nonce file must stay under the isolated data root.');
		}
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
			body: JSON.stringify({
				model,
				input: [{
					type: 'message',
					role: 'user',
					content: [{ type: 'input_text', text: prompt }]
				}],
				stream: true,
				store: false
			}),
			signal: AbortSignal.timeout(responseTimeoutMs)
		});
		if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
			checks.push({
				name: 'responses-sse',
				result: 'FAIL',
				detail: `Responses endpoint did not provide an SSE stream (HTTP ${response.status}).`
			});
			throw new Error('The real Responses request did not return an SSE stream.');
		}
		trustedRoute = {
			providerId: safeRouteHeader(response, 'x-ai-editor-provider-id'),
			workerId: safeRouteHeader(response, 'x-ai-editor-worker-id'),
			workerRegion: safeRouteHeader(response, 'x-ai-editor-worker-region')
		};
		assertExpectedRoute(trustedRoute);
		checks.push({
			name: 'trusted-route-metadata',
			result: 'PASS',
			detail: [
				`Provider ${trustedRoute.providerId ?? 'not-disclosed'}`,
				`Worker ${trustedRoute.workerId ?? 'not-disclosed'}`,
				`region ${trustedRoute.workerRegion ?? 'not-disclosed'}`
			].join(', ') + '.'
		});
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
			checks.push({
				name: 'responses-sse',
				result: 'FAIL',
				detail: 'Responses endpoint returned SSE but did not emit response.completed.'
			});
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
		trustedRoute,
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
	if (result === 'BLOCKED') {
		process.exitCode = 2;
	} else if (result === 'FAIL') {
		process.exitCode = 1;
	}
}

function safeRouteHeader(response: Response, name: string): string | null {
	const value = response.headers.get(name)?.trim() ?? '';
	return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function assertExpectedRoute(route: {
	readonly providerId: string | null;
	readonly workerId: string | null;
	readonly workerRegion: string | null;
}): void {
	const expected = [
		['Provider', expectedProviderId, route.providerId],
		['Worker', expectedWorkerId, route.workerId],
		['Worker region', expectedWorkerRegion, route.workerRegion]
	] as const;
	for (const [label, expectedValue, actualValue] of expected) {
		if (expectedValue && actualValue !== expectedValue) {
			throw new Error(`${label} route mismatch: expected ${expectedValue}, found ${actualValue ?? 'not-disclosed'}.`);
		}
	}
}

function getOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
}

function getIntegerOption(name: string, defaultValue: number, minimum: number, maximum: number): number {
	const value = getOption(name);
	if (value === undefined) {
		return defaultValue;
	}
	if (!/^\d+$/.test(value)) {
		throw new Error(`${name} must be an integer.`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
	}
	return parsed;
}

function normalizeOrigin(value: string): string {
	const url = new URL(value);
	if (
		(url.protocol !== 'http:' && url.protocol !== 'https:') ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	) {
		throw new Error('The Edge origin must be an HTTP(S) origin without credentials, path, query, or fragment.');
	}
	return url.origin;
}

function isLocalEdge(url: URL): boolean {
	return url.protocol === 'http:' &&
		(url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
		url.port === '47921';
}

function resolveBlackRepository(option: string | undefined): string {
	if (option) {
		return path.resolve(option);
	}

	const candidates = [
		process.env['AI_EDITOR_BLACK_REPOSITORY'],
		path.resolve(repositoryRoot, '..', 'codex_proxy-provider-worker'),
		path.resolve(repositoryRoot, '..', 'codex_proxy-oscar'),
		path.resolve(repositoryRoot, '..', 'codex_proxy-gateway-dev'),
		path.resolve(repositoryRoot, '..', 'codex_proxy-dev')
	].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
	const existing = candidates.find(candidate => fs.existsSync(path.join(candidate, '.git')));
	if (existing) {
		return existing;
	}

	throw new Error('No Black Gateway checkout was found. Pass --black-repository with its checkout root.');
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
	const commandLine = processCommandLine(processId);
	if (!commandLine.includes(blackRepository)) {
		throw new Error(`${name} is not the requested isolated Black service.`);
	}
}

function processCommandLine(processId: number): string {
	const command = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${processId}').CommandLine`;
	return spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }).stdout.trim();
}

function isLoopbackGatewaySshForward(commandLine: string): boolean {
	const normalized = commandLine.replace(/\s+/g, ' ').trim();
	return /(?:^|[\\/"\s])ssh(?:\.exe)?(?=["\s]|$)/i.test(normalized) &&
		/(?:^|\s)-N(?:\s|$)/.test(normalized) &&
		/(?:^|\s)-o\s+BatchMode=yes(?:\s|$)/i.test(normalized) &&
		/(?:^|\s)-o\s+ExitOnForwardFailure=yes(?:\s|$)/i.test(normalized) &&
		/(?:^|\s)-L\s+(?:127\.0\.0\.1:)?47920:127\.0\.0\.1:47920(?:\s|$)/.test(normalized);
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
