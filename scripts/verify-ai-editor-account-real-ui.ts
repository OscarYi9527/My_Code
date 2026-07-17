/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * Verifies the real, isolated Black Gateway/Edge pre-login surface. It never
 * logs in, configures a Provider, or touches the shared Proxy. Its purpose is
 * to ensure an Edge 401 model catalog does not leave the Codex Chat group
 * blank before the user signs in.
 */

const { spawn, spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const repositoryRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, '.build', 'ai-editor-account-gateway');
const connectorPath = path.join(repositoryRoot, 'scripts', 'connect-ai-editor-black-dev.ps1');
const codeLauncherPath = path.join(repositoryRoot, 'scripts', 'code.bat');
const edgeOrigin = 'http://127.0.0.1:47921';
const gatewayOrigin = 'http://127.0.0.1:47920';
const sharedProxyOrigin = 'http://127.0.0.1:47892';
const codeRemoteDebuggingPort = 49232;

interface ISharedProxySnapshot {
	readonly processId: number | undefined;
	readonly liveStatus: string;
}

interface ICheck {
	readonly name: string;
	readonly result: 'PASS';
	readonly detail: string;
}

interface IReport {
	readonly schemaVersion: 1;
	readonly generatedAt: string;
	readonly result: 'PASS' | 'FAIL';
	readonly checks: readonly ICheck[];
	readonly sharedProxy: {
		readonly before: ISharedProxySnapshot;
		readonly after: ISharedProxySnapshot | undefined;
		readonly unchanged: boolean;
	};
	readonly cleanup: {
		readonly codeDebugPortReleased: boolean;
		readonly isolatedStackReused: boolean;
	};
	readonly error: string | undefined;
}

async function main(): Promise<void> {
	await assertPortAvailable(codeRemoteDebuggingPort, 'Code remote debugging');
	const isolatedStackWasRunning = isPortListening(47920) || isPortListening(47921);
	if (isolatedStackWasRunning && !(isPortListening(47920) && isPortListening(47921))) {
		throw new Error('Only one isolated Gateway/Edge listener is running; the verifier will not modify it.');
	}

	const runDirectory = path.join(artifactRoot, `real-ui-${randomId()}`);
	const userDataDirectory = path.join(runDirectory, 'user-data');
	const extensionsDirectory = path.join(runDirectory, 'extensions');
	const sharedDataDirectory = path.join(runDirectory, 'shared-data');
	fs.mkdirSync(userDataDirectory, { recursive: true });
	fs.mkdirSync(extensionsDirectory, { recursive: true });
	fs.mkdirSync(sharedDataDirectory, { recursive: true });

	const reportPath = path.join(artifactRoot, 'real-ui-prelogin-acceptance.json');
	const markdownPath = path.join(artifactRoot, 'real-ui-prelogin-acceptance.md');
	const checks: ICheck[] = [];
	const sharedBefore = await getSharedProxySnapshot();
	let sharedAfter: ISharedProxySnapshot | undefined;
	let browser: import('@playwright/test').Browser | undefined;
	let failure: unknown;
	let codeDebugPortReleased = false;
	let startedIsolatedStack = false;

	try {
		const connector = runConnector(['-AuthenticationMode', 'real']);
		startedIsolatedStack = !isolatedStackWasRunning;
		const nonceFile = parseConnectorValue(connector, 'Code main-process nonce file');
		if (!nonceFile || !fs.existsSync(nonceFile)) {
			throw new Error('The isolated Edge nonce file was not created.');
		}
		await waitFor(
			() => fetchJson(`${edgeOrigin}/live`),
			value => isEdgeLive(value),
			'isolated Edge /live'
		);
		checks.push(pass('isolated-edge-start', 'The isolated real Gateway and Edge are available.'));

		startCode(userDataDirectory, extensionsDirectory, sharedDataDirectory, runDirectory, nonceFile);
		await waitFor(
			() => fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`),
			value => Array.isArray(value) && value.some((target: { url?: unknown }) => typeof target.url === 'string' && target.url.includes('workbench')),
			'Code workbench CDP target'
		);
		browser = await chromium.connectOverCDP(`http://127.0.0.1:${codeRemoteDebuggingPort}`);
		const page = browser.contexts()[0]?.pages().find(candidate => candidate.url().includes('workbench'));
		if (!page) {
			throw new Error('The Code workbench page was not found through CDP.');
		}

		await page.keyboard.press('Control+Alt+i');
		const statusText = await waitFor(
			() => page.locator('body').innerText(),
			value => value.includes('AI 服务'),
			'AI Editor Chat input status'
		);
		if (!statusText.includes('需要登录')) {
			throw new Error('The real pre-login Edge did not expose the safe login-required Chat status.');
		}
		checks.push(pass('prelogin-chat-visible', 'The real pre-login Edge opened Codex Chat and exposed the login-required status.'));
	} catch (error) {
		failure = error;
	} finally {
		await browser?.close().catch(() => undefined);
		await stopRunCodeProcesses(runDirectory);
		codeDebugPortReleased = await isPortReleased(codeRemoteDebuggingPort);
		if (startedIsolatedStack) {
			try {
				runConnector(['-Stop']);
			} catch (error) {
				failure ??= error;
			}
		}
		try {
			sharedAfter = await getSharedProxySnapshot();
		} catch (error) {
			failure ??= error;
		}
	}

	const sharedUnchanged = !!sharedAfter &&
		sharedBefore.processId === sharedAfter.processId &&
		sharedBefore.liveStatus === sharedAfter.liveStatus;
	if (!sharedUnchanged && !failure) {
		failure = new Error('The shared Proxy changed while the real Edge UI verification ran.');
	}
	if (!codeDebugPortReleased && !failure) {
		failure = new Error('The isolated Code debugging port was not released.');
	}
	if (!failure) {
		checks.push(pass('shared-proxy-invariant', 'Shared Proxy PID and /live status stayed unchanged.'));
		checks.push(pass('isolated-code-cleanup', 'The isolated Code debugging port was released.'));
	}

	const report: IReport = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		result: failure ? 'FAIL' : 'PASS',
		checks,
		sharedProxy: {
			before: sharedBefore,
			after: sharedAfter,
			unchanged: sharedUnchanged
		},
		cleanup: {
			codeDebugPortReleased,
			isolatedStackReused: isolatedStackWasRunning
		},
		error: failure ? 'Real Edge pre-login UI verification failed. Inspect only the isolated local run logs.' : undefined
	};
	writeReports(reportPath, markdownPath, report);
	console.log(JSON.stringify({
		result: report.result,
		report: reportPath,
		markdown: markdownPath,
		checks: report.checks.length,
		sharedProxyPid: report.sharedProxy.after?.processId,
		codeDebugPortReleased,
		isolatedStackReused: isolatedStackWasRunning
	}, undefined, 2));

	if (failure) {
		throw failure;
	}
}

function runConnector(arguments_: readonly string[]): string {
	const result = spawnSync('powershell.exe', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		connectorPath,
		...arguments_
	], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		windowsHide: true
	});
	if (result.status !== 0) {
		throw new Error('The isolated Black Gateway/Edge connector failed.');
	}
	return result.stdout;
}

function parseConnectorValue(output: string, label: string): string | undefined {
	const prefix = `[ai-editor-black-dev] ${label}: `;
	const line = output.split(/\r?\n/).find(value => value.startsWith(prefix));
	return line?.slice(prefix.length).trim();
}

function startCode(
	userDataDirectory: string,
	extensionsDirectory: string,
	sharedDataDirectory: string,
	runDirectory: string,
	nonceFile: string
): void {
	const launcherPath = path.join(runDirectory, 'launch-code.cmd');
	const command = [
		`call "${codeLauncherPath}"`,
		'--user-data-dir', `"${userDataDirectory}"`,
		'--extensions-dir', `"${extensionsDirectory}"`,
		'--shared-data-dir', `"${sharedDataDirectory}"`,
		`--remote-debugging-port=${codeRemoteDebuggingPort}`,
		'--disable-workspace-trust',
		'--new-window',
		`"${repositoryRoot}"`
	].join(' ');
	fs.writeFileSync(launcherPath, `@echo off\r\n${command}\r\n`, 'utf8');
	spawn('cmd.exe', ['/d', '/c', launcherPath], {
		cwd: repositoryRoot,
		env: {
			...process.env,
			VSCODE_SKIP_PRELAUNCH: '1',
			VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN: edgeOrigin,
			VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN: gatewayOrigin,
			VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE: nonceFile,
			VSCODE_AGENT_HOST_CODEX_PROXY_MODE: 'external-local-proxy',
			VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL: edgeOrigin
		},
		windowsHide: true,
		stdio: ['ignore', fs.openSync(path.join(runDirectory, 'code.stdout.log'), 'w'), fs.openSync(path.join(runDirectory, 'code.stderr.log'), 'w')]
	});
}

async function getSharedProxySnapshot(): Promise<ISharedProxySnapshot> {
	const live = await fetchJson(`${sharedProxyOrigin}/live`) as { status?: unknown };
	if (live.status !== 'ok') {
		throw new Error('The shared Proxy /live check failed.');
	}
	return {
		processId: getListenerProcessId(47892),
		liveStatus: 'ok'
	};
}

function getListenerProcessId(port: number): number | undefined {
	const command = `$listener = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { [int]$listener.OwningProcess }`;
	const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
	const value = result.stdout.trim();
	return /^\d+$/.test(value) ? Number(value) : undefined;
}

function isPortListening(port: number): boolean {
	return getListenerProcessId(port) !== undefined;
}

async function assertPortAvailable(port: number, name: string): Promise<void> {
	if (!(await isPortReleased(port))) {
		throw new Error(`${name} port ${port} is already in use; the verifier will not modify another process.`);
	}
}

async function isPortReleased(port: number): Promise<boolean> {
	return !isPortListening(port);
}

async function waitFor<T>(operation: () => Promise<T>, predicate: (value: T) => boolean, description: string): Promise<T> {
	const deadline = Date.now() + 30_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const value = await operation();
			if (predicate(value)) {
				return value;
			}
		} catch (error) {
			lastError = error;
		}
		await delay(250);
	}
	throw new Error(`${description} did not become ready.${lastError ? ' The isolated process did not expose its expected endpoint.' : ''}`);
}

async function fetchJson(url: string): Promise<unknown> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from isolated verification endpoint.`);
	}
	return response.json();
}

function isEdgeLive(value: unknown): value is { status: 'ok'; mode: 'edge' } {
	return !!value &&
		typeof value === 'object' &&
		(value as { status?: unknown }).status === 'ok' &&
		(value as { mode?: unknown }).mode === 'edge';
}

async function stopRunCodeProcesses(runDirectory: string): Promise<void> {
	const cleanupPath = path.join(runDirectory, 'stop-code.ps1');
	// eslint-disable-next-line local/code-no-unexternalized-strings -- PowerShell single-quote escaping is required for generated cleanup.
	const quotedRunDirectory = runDirectory.replaceAll("'", "''");
	fs.writeFileSync(cleanupPath, [
		`$target = '${quotedRunDirectory}'`,
		'Get-CimInstance Win32_Process |',
		'\tWhere-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 } |',
		'\tForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
	].join('\r\n'), 'utf8');
	spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cleanupPath], { windowsHide: true });
	await waitFor(() => isPortReleased(codeRemoteDebuggingPort), value => value, 'isolated Code cleanup');
}

function pass(name: string, detail: string): ICheck {
	return { name, result: 'PASS', detail };
}

function writeReports(jsonPath: string, markdownPath: string, report: IReport): void {
	fs.writeFileSync(jsonPath, `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
	const lines = [
		'# AI Editor real Edge pre-login UI acceptance',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Result: **${report.result}**`,
		`- Shared Proxy PID unchanged: ${report.sharedProxy.unchanged}`,
		`- Code debug port released: ${report.cleanup.codeDebugPortReleased}`,
		`- Isolated Gateway/Edge reused: ${report.cleanup.isolatedStackReused}`,
		'',
		'## Checks',
		'',
		'| Check | Result | Detail |',
		'| --- | --- | --- |',
		...report.checks.map(check => `| ${check.name} | ${check.result} | ${check.detail} |`)
	];
	if (report.error) {
		lines.push('', `> ${report.error}`);
	}
	fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`, 'utf8');
}

function delay(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function randomId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : 'Real Edge pre-login UI verification failed.');
	process.exitCode = 1;
});
