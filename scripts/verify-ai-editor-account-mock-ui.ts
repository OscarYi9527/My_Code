/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { spawn, spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');
const CDP = require('chrome-remote-interface') as typeof import('chrome-remote-interface');

const repositoryRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repositoryRoot, '.build', 'ai-editor-account-gateway');
const mockEdgePort = 47921;
const sharedProxyPort = 47892;
const codeRemoteDebuggingPort = 49231;
const mockEdgeOrigin = `http://127.0.0.1:${mockEdgePort}`;

const statusCases = [
	{
		state: 'ready',
		label: 'AI 服务正常',
		tooltip: 'AI Editor 账号可用。点击查看我的账号。',
		requiredText: ['oscar.mock@example.test', 'mock-gpt', '1000.000000 积分']
	},
	{
		state: 'login_required',
		label: 'AI 服务：需要登录',
		tooltip: '登录 AI Editor 账号后才能发送新的 AI 消息。',
		requiredText: []
	},
	{
		state: 'account_unavailable',
		label: 'AI 服务：账号不可用',
		tooltip: '点击查看账号状态。',
		requiredText: []
	},
	{
		state: 'service_unavailable',
		label: 'AI 服务：暂不可用',
		tooltip: '账号服务暂不可用。点击重试；本地编辑不受影响。',
		requiredText: ['错误编号 mock_service_unavailable']
	},
	{
		state: 'password_change_required',
		label: 'AI 服务：需要修改密码',
		tooltip: '点击修改密码后再开始新的 AI 任务。',
		requiredText: []
	}
] as const;

interface ISharedProxySnapshot {
	readonly processId: number | undefined;
	readonly liveStatus: string;
}

interface ICheck {
	readonly name: string;
	readonly result: 'PASS';
	readonly detail: string;
}

interface IRunResult {
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
		readonly mockPortReleased: boolean;
		readonly codeDebugPortReleased: boolean;
	};
	readonly error: string | undefined;
}

async function main(): Promise<void> {
	await assertPortAvailable(mockEdgePort, 'Mock Edge');
	await assertPortAvailable(codeRemoteDebuggingPort, 'Code remote debugging');

	const runDirectory = path.join(artifactRoot, `mock-ui-${randomId()}`);
	const userDataDirectory = path.join(runDirectory, 'user-data');
	const extensionsDirectory = path.join(runDirectory, 'extensions');
	const sharedDataDirectory = path.join(runDirectory, 'shared-data');
	fs.mkdirSync(userDataDirectory, { recursive: true });
	fs.mkdirSync(extensionsDirectory, { recursive: true });
	fs.mkdirSync(sharedDataDirectory, { recursive: true });

	const reportPath = path.join(artifactRoot, 'mock-ui-acceptance.json');
	const markdownPath = path.join(artifactRoot, 'mock-ui-acceptance.md');
	const checks: ICheck[] = [];
	const sharedBefore = await getSharedProxySnapshot();
	let sharedAfter: ISharedProxySnapshot | undefined;
	let mockProcess: import('node:child_process').ChildProcess | undefined;
	let browser: import('@playwright/test').Browser | undefined;
	let failure: unknown;
	let mockPortReleased = false;
	let codeDebugPortReleased = false;

	try {
		mockProcess = startMockEdge(runDirectory);
		await waitFor(() => fetchJson(`${mockEdgeOrigin}/live`), value => value.status === 'ok', 'Mock Edge /live');
		checks.push(pass('mock-edge-start', 'Started the isolated Mock Edge on 47921.'));

		startCode(userDataDirectory, extensionsDirectory, sharedDataDirectory, runDirectory);
		await waitFor(
			() => fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`),
			value => Array.isArray(value) && value.some((target: { url?: unknown }) => typeof target.url === 'string' && target.url.includes('workbench')),
			'Code workbench CDP target'
		);
		browser = await chromium.connectOverCDP(`http://127.0.0.1:${codeRemoteDebuggingPort}`);
		const context = browser.contexts()[0];
		const page = context?.pages().find(candidate => candidate.url().includes('workbench'));
		if (!page) {
			throw new Error('The Code workbench page was not found through CDP.');
		}

		for (const statusCase of statusCases) {
			await setMockState(statusCase.state);
			await page.reload({ waitUntil: 'domcontentloaded' });
			await page.keyboard.press('Control+Alt+i');

			const statusAction = page.getByRole('button', { name: statusCase.tooltip }).first();
			await statusAction.waitFor({ state: 'visible', timeout: 20_000 });
			const statusText = await statusAction.textContent();
			if (!statusText?.includes(statusCase.label) || statusCase.requiredText.some(text => !statusText.includes(text))) {
				throw new Error(`The ${statusCase.state} status presentation did not match the contracted safe text.`);
			}

			if (statusCase.state === 'service_unavailable') {
				await statusAction.click();
				await statusAction.waitFor({ state: 'visible', timeout: 10_000 });
			}
			checks.push(pass(`status-${statusCase.state}`, 'Chat input exposed the expected safe status action.'));

			if (statusCase.state === 'ready') {
				await statusAction.click();
				await waitFor(
					() => fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`),
					(value: unknown) => Array.isArray(value) && value.some((target: { url?: unknown }) => target.url === `${mockEdgeOrigin}/admin#account`),
					'AI Editor management BrowserView'
				);
				const targets = await fetchJson(`http://127.0.0.1:${codeRemoteDebuggingPort}/json/list`) as Array<{ url?: string }>;
				const managementTarget = targets.find(target => target.url === `${mockEdgeOrigin}/admin#account`);
				if (!managementTarget) {
					throw new Error('The AI Editor management BrowserView target was not found.');
				}
				await waitFor(
					() => readTargetBodyText(managementTarget),
					value => value === 'AI Editor 管理 Mock',
					'AI Editor management Mock page'
				);
				checks.push(pass('management-route', 'Ready status opened the fixed-origin AI Editor management BrowserView.'));
			}
		}
	} catch (error) {
		failure = error;
	} finally {
		await browser?.close().catch(() => undefined);
		await stopRunCodeProcesses(runDirectory);
		await stopChild(mockProcess);
		mockPortReleased = await isPortReleased(mockEdgePort);
		codeDebugPortReleased = await isPortReleased(codeRemoteDebuggingPort);
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
		failure = new Error('The shared Proxy changed while the Mock UI verification ran.');
	}
	if ((!mockPortReleased || !codeDebugPortReleased) && !failure) {
		failure = new Error('The Mock UI verification did not release its isolated processes.');
	}
	if (!failure) {
		checks.push(pass('shared-proxy-invariant', 'Shared Proxy PID and /live status stayed unchanged.'));
		checks.push(pass('isolated-cleanup', 'Mock Edge and isolated Code debugging ports were released.'));
	}

	const report: IRunResult = {
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
			mockPortReleased,
			codeDebugPortReleased
		},
		error: failure ? 'Mock UI verification failed. Inspect the isolated local logs for details.' : undefined
	};
	writeReports(reportPath, markdownPath, report);
	console.log(JSON.stringify({
		result: report.result,
		report: reportPath,
		markdown: markdownPath,
		checks: report.checks.length,
		sharedProxyPid: report.sharedProxy.after?.processId,
		mockPortReleased,
		codeDebugPortReleased
	}, undefined, 2));

	if (failure) {
		throw failure;
	}
}

function startMockEdge(runDirectory: string): import('node:child_process').ChildProcess {
	return spawn(process.execPath, [
		'--experimental-strip-types',
		path.join(repositoryRoot, 'scripts', 'mock-ai-editor-edge.ts'),
		'--host', '127.0.0.1',
		'--port', String(mockEdgePort),
		'--state', 'ready'
	], {
		cwd: repositoryRoot,
		windowsHide: true,
		stdio: ['ignore', fs.openSync(path.join(runDirectory, 'mock-edge.stdout.log'), 'w'), fs.openSync(path.join(runDirectory, 'mock-edge.stderr.log'), 'w')]
	});
}

function startCode(
	userDataDirectory: string,
	extensionsDirectory: string,
	sharedDataDirectory: string,
	runDirectory: string
): import('node:child_process').ChildProcess {
	const launcherPath = path.join(runDirectory, 'launch-code.cmd');
	const command = [
		`call "${path.join(repositoryRoot, 'scripts', 'code.bat')}"`,
		'--user-data-dir', `"${userDataDirectory}"`,
		'--extensions-dir', `"${extensionsDirectory}"`,
		'--shared-data-dir', `"${sharedDataDirectory}"`,
		`--remote-debugging-port=${codeRemoteDebuggingPort}`,
		'--disable-workspace-trust',
		'--new-window',
		`"${repositoryRoot}"`
	].join(' ');
	fs.writeFileSync(launcherPath, `@echo off\r\n${command}\r\n`, 'utf8');
	return spawn('cmd.exe', ['/d', '/c', launcherPath], {
		cwd: repositoryRoot,
		env: {
			...process.env,
			VSCODE_SKIP_PRELAUNCH: '1',
			VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN: mockEdgeOrigin,
			VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN: mockEdgeOrigin
		},
		windowsHide: true,
		stdio: ['ignore', fs.openSync(path.join(runDirectory, 'code.stdout.log'), 'w'), fs.openSync(path.join(runDirectory, 'code.stderr.log'), 'w')]
	});
}

async function setMockState(state: string): Promise<void> {
	const response = await fetch(`${mockEdgeOrigin}/__mock/state`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ state })
	});
	if (!response.ok) {
		throw new Error(`The Mock Edge rejected state ${state}.`);
	}
}

async function getSharedProxySnapshot(): Promise<ISharedProxySnapshot> {
	const live = await fetchJson(`http://127.0.0.1:${sharedProxyPort}/live`) as { status?: unknown };
	if (live.status !== 'ok') {
		throw new Error('The shared Proxy /live check failed.');
	}
	return {
		processId: getListenerProcessId(sharedProxyPort),
		liveStatus: 'ok'
	};
}

function getListenerProcessId(port: number): number | undefined {
	const command = `$listener = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { [int]$listener.OwningProcess }`;
	const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true });
	const value = result.stdout.trim();
	return /^\d+$/.test(value) ? Number(value) : undefined;
}

async function assertPortAvailable(port: number, name: string): Promise<void> {
	if (!(await isPortReleased(port))) {
		throw new Error(`${name} port ${port} is already in use; the verifier will not modify another process.`);
	}
}

async function isPortReleased(port: number): Promise<boolean> {
	return getListenerProcessId(port) === undefined;
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

async function readTargetBodyText(target: object): Promise<unknown> {
	const client = await CDP({ port: codeRemoteDebuggingPort, target });
	try {
		const body = await client.Runtime.evaluate({ expression: 'document.body.innerText', returnByValue: true });
		return body.result.value;
	} finally {
		await client.close();
	}
}

async function stopRunCodeProcesses(runDirectory: string): Promise<void> {
	const cleanupPath = path.join(runDirectory, 'stop-code.ps1');
	// eslint-disable-next-line local/code-no-unexternalized-strings -- PowerShell single-quote escaping is required for the generated cleanup script.
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

async function stopChild(child: import('node:child_process').ChildProcess | undefined): Promise<void> {
	if (!child || child.exitCode !== null || child.pid === undefined) {
		return;
	}
	child.kill('SIGTERM');
	await new Promise<void>(resolve => {
		const timeout = setTimeout(resolve, 5_000);
		child.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});
	});
	if (child.exitCode === null) {
		child.kill('SIGKILL');
	}
}

function pass(name: string, detail: string): ICheck {
	return { name, result: 'PASS', detail };
}

function writeReports(jsonPath: string, markdownPath: string, report: IRunResult): void {
	fs.writeFileSync(jsonPath, `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
	const lines = [
		'# AI Editor Mock UI isolated acceptance',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Result: **${report.result}**`,
		`- Shared Proxy PID unchanged: ${report.sharedProxy.unchanged}`,
		`- Mock port released: ${report.cleanup.mockPortReleased}`,
		`- Code debug port released: ${report.cleanup.codeDebugPortReleased}`,
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
	console.error(error instanceof Error ? error.message : 'Mock UI verification failed.');
	process.exitCode = 1;
});
