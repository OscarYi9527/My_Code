/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runs a deterministic PA Plaza/PA Creator UI smoke against either the
 * development Workbench or the packaged Windows product. It uses an isolated
 * user-data directory, writes no account credentials, and verifies the shared
 * Proxy invariant before cleaning up every Code process started by the run.
 */

const { spawn, spawnSync } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { chromium } = require('@playwright/test') as typeof import('@playwright/test');

type Surface = 'development' | 'product';

interface ICheck {
	readonly name: string;
	readonly result: 'PASS';
	readonly detail: string;
}

interface ISharedProxySnapshot {
	readonly processId: number | undefined;
	readonly liveStatus: string;
}

const repositoryRoot = path.resolve(__dirname, '..');
const repositoryParent = path.dirname(repositoryRoot);
const surface = getSurface(getOption('--surface') ?? 'development');
const productRoot = path.resolve(getOption('--product-root') ?? path.join(repositoryParent, 'VSCode-win32-x64'));
const remoteDebuggingPort = getIntegerOption('--remote-debugging-port', surface === 'development' ? 49234 : 49235);
const artifactRoot = path.join(repositoryRoot, '.build', 'ai-editor-pa-creator');
const sharedProxyOrigin = 'http://127.0.0.1:47892';

async function main(): Promise<void> {
	await assertPortAvailable(remoteDebuggingPort, 'Code remote debugging');
	const runDirectory = path.join(artifactRoot, `${surface}-${randomId()}`);
	const userDataDirectory = path.join(runDirectory, 'user-data');
	const extensionsDirectory = path.join(runDirectory, 'extensions');
	const sharedDataDirectory = path.join(runDirectory, 'shared-data');
	fs.mkdirSync(path.join(userDataDirectory, 'User'), { recursive: true });
	fs.mkdirSync(extensionsDirectory, { recursive: true });
	fs.mkdirSync(sharedDataDirectory, { recursive: true });
	fs.writeFileSync(path.join(userDataDirectory, 'User', 'settings.json'), JSON.stringify({
		'workbench.startupEditor': 'none',
		'security.workspace.trust.enabled': false
	}, undefined, 2), 'utf8');

	const reportPath = path.join(artifactRoot, `pa-creator-${surface}-ui.json`);
	const markdownPath = path.join(artifactRoot, `pa-creator-${surface}-ui.md`);
	const screenshotPath = path.join(artifactRoot, `pa-creator-${surface}-ui.png`);
	const checks: ICheck[] = [];
	const sharedBefore = await getSharedProxySnapshot();
	let sharedAfter: ISharedProxySnapshot | undefined;
	let browser: import('@playwright/test').Browser | undefined;
	let failure: unknown;
	let codeDebugPortReleased = false;

	try {
		startCode(userDataDirectory, extensionsDirectory, sharedDataDirectory, runDirectory);
		await waitFor(
			() => fetchJson(`http://127.0.0.1:${remoteDebuggingPort}/json/list`),
			value => Array.isArray(value) && value.some((target: { url?: unknown }) => typeof target.url === 'string' && target.url.includes('workbench')),
			'Code Workbench CDP target',
			60_000
		);
		checks.push(pass('workbench-start', `Started the isolated ${surface} Workbench.`));

		browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
		const page = browser.contexts()[0]?.pages().find(candidate => candidate.url().includes('workbench'));
		if (!page) {
			throw new Error('The Code Workbench page was not found through CDP.');
		}
		await page.bringToFront();
		const workbench = page.locator('.monaco-workbench');
		await workbench.waitFor({ state: 'visible', timeout: 20_000 });
		await workbench.click({ position: { x: 20, y: 20 } });
		// The packaged Workbench becomes paint-ready before all restored-phase
		// contributions are registered. Wait for that deterministic startup
		// boundary before querying the Command Palette.
		await page.waitForTimeout(surface === 'product' ? 3_000 : 500);

		await openPaPlazaFromCommandPalette(page);
		const plaza = page.locator('.pa-plaza-editor');
		await plaza.waitFor({ state: 'visible', timeout: 20_000 });
		const plazaTitle = await plaza.locator('.pa-plaza-title').textContent();
		if (!plazaTitle?.includes('PA')) {
			throw new Error('PA Plaza did not expose its expected title.');
		}
		const creatorCard = plaza.locator('.pa-card').filter({ hasText: 'PA Creator' }).first();
		await creatorCard.waitFor({ state: 'visible', timeout: 10_000 });
		if (await creatorCard.locator('.pa-card-name').textContent() !== 'PA Creator') {
			throw new Error('The built-in PA Creator card was not discoverable.');
		}
		checks.push(pass('pa-plaza', 'Opened PA Plaza and discovered the built-in PA Creator card.'));

		await page.waitForTimeout(500);
		await creatorCard.locator('button.primary').click();
		const requirementInput = page.locator('.quick-input-widget input[aria-label*="PA"]:visible').last();
		await requirementInput.waitFor({ state: 'visible', timeout: 10_000 });
		await requirementInput.fill('创建一个用于 MVP 自动验收的本地流程智能体');
		await requirementInput.press('Enter');

		const creator = page.locator('.pa-creator-editor');
		try {
			await creator.waitFor({ state: 'visible', timeout: 20_000 });
		} catch {
			const quickInputText = await page.locator('.quick-input-widget:visible').allInnerTexts();
			throw new Error(`PA Creator did not open after requirement submission; visible Quick Input count: ${quickInputText.length}.`);
		}
		const steps = creator.locator('.pa-creator-step');
		if (await steps.count() !== 9) {
			throw new Error('PA Creator did not render exactly nine AA steps.');
		}
		const currentBefore = await creator.locator('.pa-creator-step.current').textContent();
		if (!currentBefore?.includes('AA-01')) {
			throw new Error('PA Creator did not start at AA-01.');
		}
		await creator.locator('.pa-creator-confirmation button.primary').click();
		await waitFor(
			() => creator.locator('.pa-creator-step.current').textContent(),
			value => typeof value === 'string' && !value.includes('AA-01'),
			'PA Creator confirmation transition'
		);
		if (!await creator.locator('.pa-creator-composer textarea').isVisible()) {
			throw new Error('PA Creator did not expose its local workflow composer.');
		}
		checks.push(pass('pa-creator-workflow', 'Created an isolated session, rendered nine AAs, and advanced through the first mandatory confirmation.'));

		await page.screenshot({ path: screenshotPath });
		checks.push(pass('visual-evidence', 'Captured the PA Creator surface without account or model content.'));
	} catch (error) {
		failure = error;
	} finally {
		await browser?.close().catch(() => undefined);
		await stopRunCodeProcesses(runDirectory);
		codeDebugPortReleased = await isPortReleased(remoteDebuggingPort);
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
		failure = new Error('The shared Proxy changed while PA Creator UI verification ran.');
	}
	if (!codeDebugPortReleased && !failure) {
		failure = new Error('The isolated Code debugging port was not released.');
	}
	if (!failure) {
		checks.push(pass('shared-proxy-invariant', 'Shared Proxy PID and /live stayed unchanged.'));
		checks.push(pass('isolated-cleanup', 'Released the isolated Code debugging port.'));
	}

	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		result: failure ? 'FAIL' : 'PASS',
		surface,
		checks,
		sharedProxy: {
			before: sharedBefore,
			after: sharedAfter,
			unchanged: sharedUnchanged
		},
		cleanup: {
			codeDebugPortReleased
		},
		screenshot: failure ? undefined : screenshotPath,
		error: failure ? 'PA Creator UI verification failed. Inspect only the isolated local run logs.' : undefined
	};
	fs.mkdirSync(artifactRoot, { recursive: true });
	writeReports(reportPath, markdownPath, report);
	console.log(JSON.stringify({
		result: report.result,
		surface,
		report: reportPath,
		markdown: markdownPath,
		screenshot: report.screenshot,
		checks: checks.length,
		sharedProxyPid: sharedAfter?.processId,
		codeDebugPortReleased
	}, undefined, 2));
	if (failure) {
		throw failure;
	}
}

async function openPaPlazaFromCommandPalette(page: import('@playwright/test').Page): Promise<void> {
	await page.keyboard.press('Control+Shift+P');
	const input = page.locator('.quick-input-widget input:visible').last();
	await input.waitFor({ state: 'visible', timeout: 10_000 });
	// Quick input keeps old list rows mounted while replacing its result set.
	// Restrict both label inspection and the click target to the currently
	// visible rows so a stale hidden command cannot win the index lookup.
	const rows = page.locator('.quick-input-list .monaco-list-row:visible');
	const queries = ['>打开 PA 广场', '>Open PA Plaza', '>PA 广场'];
	const observedResults: string[] = [];
	for (const query of queries) {
		await input.fill(query);
		await page.waitForTimeout(250);
		const labels = await rows.allInnerTexts();
		observedResults.push(`${query}: ${JSON.stringify(labels.slice(0, 20))}`);
		const index = labels.findIndex(value =>
			value.toUpperCase().includes('PA')
			&& (value.includes('广场') || value.includes('廣場') || value.toLowerCase().includes('plaza'))
		);
		if (index >= 0) {
			await rows.nth(index).click();
			await page.locator('.quick-input-widget').waitFor({ state: 'hidden', timeout: 10_000 });
			return;
		}
	}
	throw new Error(`The PA Plaza command was not found with precise queries. Observed results: ${observedResults.join('; ')}`);
}

function startCode(
	userDataDirectory: string,
	extensionsDirectory: string,
	sharedDataDirectory: string,
	runDirectory: string
): void {
	const launcherPath = path.join(runDirectory, 'launch-code.cmd');
	const executable = surface === 'development'
		? path.join(repositoryRoot, 'scripts', 'code.bat')
		: path.join(productRoot, 'Code - OSS.exe');
	if (!fs.existsSync(executable)) {
		throw new Error(`The ${surface} Code launcher was not found.`);
	}
	const prefix = surface === 'development' ? 'call ' : '';
	const command = [
		`${prefix}"${executable}"`,
		'--user-data-dir', `"${userDataDirectory}"`,
		'--extensions-dir', `"${extensionsDirectory}"`,
		'--shared-data-dir', `"${sharedDataDirectory}"`,
		`--remote-debugging-port=${remoteDebuggingPort}`,
		'--locale=zh-cn',
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
			VSCODE_AGENT_HOST_CODEX_PROXY_MODE: 'external-local-proxy',
			VSCODE_AGENT_HOST_CODEX_PROXY_BASE_URL: sharedProxyOrigin
		},
		windowsHide: true,
		stdio: ['ignore', fs.openSync(path.join(runDirectory, 'code.stdout.log'), 'w'), fs.openSync(path.join(runDirectory, 'code.stderr.log'), 'w')]
	});
}

function getOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
}

function getSurface(value: string): Surface {
	if (value === 'development' || value === 'product') {
		return value;
	}
	throw new Error('--surface must be development or product.');
}

function getIntegerOption(name: string, defaultValue: number): number {
	const value = getOption(name);
	if (value === undefined) {
		return defaultValue;
	}
	if (!/^\d+$/.test(value)) {
		throw new Error(`${name} must be an integer.`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1024 || parsed > 65535) {
		throw new Error(`${name} must be between 1024 and 65535.`);
	}
	return parsed;
}

async function getSharedProxySnapshot(): Promise<ISharedProxySnapshot> {
	const live = await fetchJson(`${sharedProxyOrigin}/live`) as { status?: unknown };
	if (live.status !== 'ok') {
		throw new Error('Shared Proxy /live is not healthy.');
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

async function assertPortAvailable(port: number, name: string): Promise<void> {
	if (!await isPortReleased(port)) {
		throw new Error(`${name} port ${port} is already in use; the verifier will not modify another process.`);
	}
}

async function isPortReleased(port: number): Promise<boolean> {
	return getListenerProcessId(port) === undefined;
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
	await waitFor(() => isPortReleased(remoteDebuggingPort), value => value, 'isolated Code cleanup');
}

async function fetchJson(url: string): Promise<unknown> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from verification endpoint.`);
	}
	return response.json();
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
	throw new Error(`${description} did not become ready.${lastError ? ' The expected local surface was not available.' : ''}`);
}

function pass(name: string, detail: string): ICheck {
	return { name, result: 'PASS', detail };
}

function writeReports(jsonPath: string, markdownPath: string, report: {
	readonly generatedAt: string;
	readonly result: string;
	readonly surface: string;
	readonly checks: readonly ICheck[];
	readonly sharedProxy: { readonly unchanged: boolean };
	readonly cleanup: { readonly codeDebugPortReleased: boolean };
	readonly screenshot?: string;
	readonly error?: string;
}): void {
	fs.writeFileSync(jsonPath, `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
	const lines = [
		'# AI Editor PA Creator UI acceptance',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Surface: ${report.surface}`,
		`- Result: **${report.result}**`,
		`- Shared Proxy unchanged: ${report.sharedProxy.unchanged}`,
		`- Code debug port released: ${report.cleanup.codeDebugPortReleased}`,
		`- Screenshot: ${report.screenshot ?? 'unavailable'}`,
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
	console.error(error instanceof Error ? error.message : 'PA Creator UI verification failed.');
	process.exitCode = 1;
});
