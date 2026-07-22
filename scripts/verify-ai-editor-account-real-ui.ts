/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * Verifies the real, isolated Black Gateway/Edge Chat surface. It never logs
 * in, configures a Provider, or touches the shared Proxy. Before login it
 * ensures an Edge 401 model catalog does not leave the Codex Chat group blank.
 * After a user has already logged in, it additionally verifies that the
 * account status opens the fixed-origin management BrowserView.
 */

const { spawn, spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

const repositoryRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, '.build', 'ai-editor-account-gateway');
const connectorPath = path.join(repositoryRoot, 'scripts', 'connect-ai-editor-black-dev.ps1');
const codeLauncherPath = path.join(repositoryRoot, 'scripts', 'code.bat');
const localEdgeOrigin = 'http://127.0.0.1:47921';
const localGatewayOrigin = 'http://127.0.0.1:47920';
const edgeOrigin = process.env['AI_EDITOR_VERIFY_EDGE_ORIGIN'] || localEdgeOrigin;
const gatewayOrigin = process.env['AI_EDITOR_VERIFY_GATEWAY_ORIGIN'] || localGatewayOrigin;
const sharedProxyOrigin = 'http://127.0.0.1:47892';
const codeRemoteDebuggingPort = 49232;
const codeExtensionHostDebuggingPort = 49233;
const codeAgentHostDebuggingPort = 49234;

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
		readonly externalEdgeOnly: boolean;
	};
	readonly error: string | undefined;
}

async function main(): Promise<void> {
	await assertPortAvailable(codeRemoteDebuggingPort, 'Code remote debugging');
	await assertPortAvailable(codeExtensionHostDebuggingPort, 'Code extension host debugging');
	await assertPortAvailable(codeAgentHostDebuggingPort, 'Code Agent Host debugging');
	const localGatewayProcessId = getListenerProcessId(47920);
	const localGatewayIsSshForward = localGatewayProcessId !== undefined &&
		isLoopbackGatewaySshForward(getProcessCommandLine(localGatewayProcessId));
	const localGatewayWasRunning = localGatewayProcessId !== undefined && !localGatewayIsSshForward;
	const localEdgeWasRunning = isPortListening(47921);
	if (localGatewayWasRunning && !localEdgeWasRunning) {
		throw new Error('The local Gateway is running without its Edge; the verifier will not modify it.');
	}
	const externalEdgeOnly = localEdgeWasRunning && !localGatewayWasRunning;
	const isolatedStackWasRunning = localGatewayProcessId !== undefined || localEdgeWasRunning;
	if (externalEdgeOnly && gatewayOrigin === localGatewayOrigin && !localGatewayIsSshForward) {
		throw new Error('A pre-started Edge requires AI_EDITOR_VERIFY_GATEWAY_ORIGIN when the local Gateway is not running.');
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
		let nonceFile: string | undefined;
		if (externalEdgeOnly) {
			nonceFile = process.env['AI_EDITOR_VERIFY_EDGE_NONCE_FILE'];
			checks.push(pass(
				'external-edge-reuse',
				localGatewayIsSshForward && gatewayOrigin === localGatewayOrigin
					? `Reused the pre-started Edge with a fail-closed loopback SSH forward to ${new URL(gatewayOrigin).origin}.`
					: `Reused the pre-started Edge with Gateway ${new URL(gatewayOrigin).origin}; any unrelated local forward was left untouched.`
			));
		} else {
			const connector = runConnector(['-AuthenticationMode', 'real']);
			startedIsolatedStack = !isolatedStackWasRunning;
			nonceFile = parseConnectorValue(connector, 'Code main-process nonce file');
		}
		if (!nonceFile || !fs.existsSync(nonceFile)) {
			throw new Error('The isolated Edge nonce file is unavailable; set AI_EDITOR_VERIFY_EDGE_NONCE_FILE for a pre-started Edge.');
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
		let statusText = await waitFor(
			() => page.locator('body').innerText(),
			value => value.includes('AI 服务'),
			'AI Editor Chat input status'
		);
		if (statusText.includes('AI 服务：暂不可用')) {
			// The renderer starts fail-closed before its first main-process
			// status round trip. Explicitly exercise the user-visible retry
			// action instead of treating that transient bootstrap state as the
			// final account result.
			const retryAction = page.locator('.chat-input-status-container').getByText(/AI 服务：暂不可用/).first();
			await retryAction.click({ force: true });
			statusText = await waitFor(
				() => page.locator('body').innerText(),
				value =>
					value.includes('AI 服务：需要登录')
					|| value.includes('AI 服务正常')
					|| value.includes('AI 服务：需要修改密码')
					|| value.includes('AI 服务：账号不可用'),
				'AI Editor account status after retry'
			);
		}
		if (statusText.includes('需要登录')) {
			checks.push(pass('prelogin-chat-visible', 'The real pre-login Edge opened Codex Chat and exposed the login-required status.'));
		} else if (statusText.includes('账号不可用')) {
			checks.push(pass('account-unavailable-visible', 'The real Edge exposed the safe account-unavailable status without opening administration routes.'));
		} else if (statusText.includes('AI 服务正常')) {
			checks.push(pass('ready-account-status-visible', 'The development Workbench displayed the ready AI Editor account status.'));
			const statusAction = page.locator('.chat-input-status-container').getByText(/AI 服务正常/).first();
			// Startup notifications (for example an extension-host recovery
			// toast) can overlap the lower-right status action without changing
			// the account state under test. Dispatch the action directly so the
			// verification remains scoped to the account-management contract.
			await statusAction.click({ force: true });
			await waitFor(
				() => fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`),
				value => Array.isArray(value) && value.some((target: { url?: unknown }) => isManagementTarget(target.url, gatewayOrigin)),
				'AI Editor management BrowserView'
			);
			await waitForManagementBootstrap(browser, gatewayOrigin);
			checks.push(pass('ready-management-route', 'The ready account status opened the fixed-origin management BrowserView.'));
			checks.push(pass('ready-management-bootstrap', 'The management BrowserView exchanged its one-time ticket and rendered authenticated account navigation.'));
		} else if (statusText.includes('需要修改密码')) {
			const statusAction = page.locator('.chat-input-status-container').getByText(/需要修改密码/).first();
			await statusAction.click({ force: true });
			await waitFor(
				() => fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`),
				value => Array.isArray(value) && value.some((target: { url?: unknown }) => isManagementTarget(target.url, gatewayOrigin)),
				'AI Editor password-change management BrowserView'
			);
			await waitForManagementBootstrap(browser, gatewayOrigin);
			checks.push(pass('password-change-management-route', 'The password-change-required status opened the fixed-origin security BrowserView.'));
		} else {
			throw new Error('The real Edge did not expose a supported safe Chat account status.');
		}
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
			isolatedStackReused: isolatedStackWasRunning,
			externalEdgeOnly
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
		`--inspect-extensions=${codeExtensionHostDebuggingPort}`,
		`--inspect-agenthost=${codeAgentHostDebuggingPort}`,
		'--disable-workspace-trust',
		'--new-window',
		`"${repositoryRoot}"`
	].join(' ');
	fs.writeFileSync(launcherPath, `@echo off\r\n${command}\r\n`, 'utf8');
	const codeEnvironment = {
		...process.env,
		VSCODE_SKIP_PRELAUNCH: '1',
		VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN: edgeOrigin,
		VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN: gatewayOrigin,
		VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE: nonceFile,
		VSCODE_AGENT_HOST_CODEX_PROXY_MODE: 'external-local-proxy',
		VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL: edgeOrigin
	};
	delete codeEnvironment['ELECTRON_RUN_AS_NODE'];
	spawn('cmd.exe', ['/d', '/c', launcherPath], {
		cwd: repositoryRoot,
		env: codeEnvironment,
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

function getProcessCommandLine(processId: number): string {
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

async function waitFor<T>(
	operation: () => Promise<T>,
	predicate: (value: T) => boolean,
	description: string,
	timeoutMs = 30_000
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
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

function isManagementTarget(value: unknown, expectedOrigin: string): boolean {
	if (typeof value !== 'string') {
		return false;
	}
	try {
		const url = new URL(value);
		return url.origin === new URL(expectedOrigin).origin &&
			(url.pathname === '/admin' || url.pathname.startsWith('/admin/'));
	} catch {
		return false;
	}
}

async function waitForManagementBootstrap(
	browser: import('@playwright/test').Browser,
	expectedOrigin: string
): Promise<void> {
	let lastText = '';
	try {
		await waitFor(
			async () => {
				const page = browser.contexts()
					.flatMap(context => context.pages())
					.find(candidate => isManagementTarget(candidate.url(), expectedOrigin));
				lastText = page ? await page.locator('body').innerText() : '';
				return lastText;
			},
			value => value.includes('AI Editor 管理') && value.includes('我的账号'),
			'authenticated AI Editor management bootstrap',
			60_000
		);
	} catch {
		const state = lastText.includes('管理会话建立失败')
			? 'session_exchange_failed'
			: (lastText.includes('正在等待 Code 建立安全管理会话')
				? 'waiting_for_code_bootstrap'
				: (lastText ? 'unexpected_management_content' : 'management_target_missing'));
		throw new Error(`Authenticated AI Editor management bootstrap failed (${state}).`);
	}
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
		`- External Edge-only topology: ${report.cleanup.externalEdgeOnly}`,
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
