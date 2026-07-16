/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { setTimeout as delay } from 'timers/promises';
import { validateAiEditorProxyArtifact } from '../lib/aiEditorProxyArtifact.ts';
import { assertAiEditorProxyReleaseIdentity, readAiEditorProxyReleaseSource } from '../lib/aiEditorProxyRelease.ts';

interface IArguments {
	productRoot?: string;
	report?: string;
	arch?: string;
	skipCleanStart: boolean;
	keepCleanStartArtifacts: boolean;
	requireSignature: boolean;
}

interface IHttpResponse {
	readonly statusCode: number;
	readonly headers: http.IncomingHttpHeaders;
	readonly body: Buffer;
}

interface IFileRecord {
	readonly name: string;
	readonly path: string;
	readonly bytes: number;
	readonly sha256: string;
}

interface ICleanStartResult {
	readonly baseUrl: string;
	readonly proxyProcessId: number;
	readonly proxyEntryPoint: string;
	readonly initialProxyDataEntries: number;
	readonly cdpTargetCount: number;
	readonly readyStatusCode: number;
	readonly readyStatus: string;
	readonly modelCount: number;
	readonly adminStatusCode: number;
	readonly proxySurvivedCodeExit: boolean;
	readonly artifactDirectory: string | null;
}

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const cleanEnvironmentKeys = [
	'CODEX_CHATGPT_RESPONSES_URL',
	'CODEX_OPENAI_API_BASE_URL',
	'CODEX_OPENAI_API_CHAT_COMPLETIONS_URL',
	'CODEX_OPENAI_API_RESPONSES_URL',
	'CODEX_OPENAI_API_UPSTREAM',
	'CODEX_PROXY_DATA_DIR',
	'CODEX_RELAYS',
	'DEEPSEEK_API_KEY',
	'OPENAI_API_KEY',
	'OPENAI_BASE_URL',
	'OPENAI_ORG_ID',
	'OPENAI_PROJECT_ID',
	'VSCODE_AI_EDITOR_PROXY_ROOT'
];

function parseArguments(argv: string[]): IArguments {
	const result: IArguments = {
		skipCleanStart: false,
		keepCleanStartArtifacts: false,
		requireSignature: false
	};

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--skip-clean-start') {
			result.skipCleanStart = true;
		} else if (argument === '--keep-clean-start-artifacts') {
			result.keepCleanStartArtifacts = true;
		} else if (argument === '--require-signature') {
			result.requireSignature = true;
		} else if (argument === '--product-root' || argument === '--report' || argument === '--arch') {
			const value = argv[++index];
			if (!value) {
				throw new Error(`Missing value for ${argument}.`);
			}
			const key = argument.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as 'productRoot' | 'report' | 'arch';
			result[key] = value;
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	return result;
}

function assertDirectory(directoryPath: string, description: string): void {
	if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
		throw new Error(`${description} was not found: ${directoryPath}`);
	}
}

function assertFile(filePath: string, description: string): void {
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		throw new Error(`${description} was not found: ${filePath}`);
	}
}

function readJson<T>(filePath: string): T {
	assertFile(filePath, 'JSON file');
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
	} catch (error) {
		throw new Error(`Unable to read JSON file: ${filePath}`, { cause: error });
	}
}

function sha256(filePath: string): string {
	return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function base64Sha256(filePath: string): string {
	return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('base64').replace(/=+$/, '');
}

function fileRecord(name: string, filePath: string): IFileRecord {
	assertFile(filePath, name);
	const stats = fs.statSync(filePath);
	return {
		name,
		path: filePath,
		bytes: stats.size,
		sha256: sha256(filePath)
	};
}

function assertExecutable(filePath: string, description: string): void {
	assertFile(filePath, description);
	if ((fs.statSync(filePath).mode & 0o111) === 0) {
		throw new Error(`${description} is not executable: ${filePath}`);
	}
}

function request(url: string, timeoutMs = 3_000): Promise<IHttpResponse> {
	return new Promise((resolve, reject) => {
		const req = http.request(url, { method: 'GET', timeout: timeoutMs }, response => {
			const chunks: Buffer[] = [];
			let length = 0;
			response.on('data', (chunk: Buffer) => {
				length += chunk.length;
				if (length <= 1024 * 1024) {
					chunks.push(chunk);
				}
			});
			response.on('end', () => {
				if (length > 1024 * 1024) {
					reject(new Error(`Response exceeded 1 MiB: ${url}`));
					return;
				}
				resolve({
					statusCode: response.statusCode ?? 0,
					headers: response.headers,
					body: Buffer.concat(chunks)
				});
			});
		});
		req.on('timeout', () => req.destroy(new Error(`Request timed out: ${url}`)));
		req.on('error', reject);
		req.end();
	});
}

function responseJson<T>(response: IHttpResponse, description: string): T {
	try {
		return JSON.parse(response.body.toString('utf8')) as T;
	} catch (error) {
		throw new Error(`${description} did not return valid JSON.`, { cause: error });
	}
}

async function freeTcpPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Unable to allocate a loopback TCP port.'));
				return;
			}
			server.close(error => error ? reject(error) : resolve(address.port));
		});
	});
}

function listenerProcessId(port: number): number | undefined {
	try {
		const output = cp.execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
		const processIds = output.split(/\s+/).filter(Boolean).map(value => Number(value)).filter(Number.isInteger);
		return processIds.length === 1 ? processIds[0] : undefined;
	} catch {
		return undefined;
	}
}

function processCommand(processId: number): string {
	try {
		return cp.execFileSync('ps', ['-p', String(processId), '-o', 'command='], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return '';
	}
}

function processExists(processId: number): boolean {
	if (!Number.isInteger(processId) || processId <= 0) {
		return false;
	}
	try {
		process.kill(processId, 0);
		return true;
	} catch {
		return false;
	}
}

async function terminateProcess(processId: number): Promise<void> {
	if (!Number.isInteger(processId) || processId <= 0) {
		return;
	}
	if (!processExists(processId)) {
		return;
	}
	try {
		process.kill(processId, 'SIGTERM');
	} catch {
		return;
	}
	for (let attempt = 0; attempt < 20; attempt++) {
		await delay(100);
		if (!processExists(processId)) {
			return;
		}
	}
	try {
		process.kill(processId, 'SIGKILL');
	} catch {
		// The process exited between the final probe and forced termination.
	}
}

function processesContaining(value: string): number[] {
	const output = cp.execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
	const result: number[] = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^\s*(\d+)\s+(.*)$/.exec(line);
		if (match && match[2].includes(value)) {
			const processId = Number(match[1]);
			if (processId !== process.pid) {
				result.push(processId);
			}
		}
	}
	return result;
}

function bundleExecutable(productRoot: string): string {
	const infoPlist = path.join(productRoot, 'Contents', 'Info.plist');
	assertFile(infoPlist, 'macOS Info.plist');
	let executableName = '';
	if (process.platform === 'darwin') {
		try {
			executableName = cp.execFileSync(
				'plutil',
				['-extract', 'CFBundleExecutable', 'raw', '-o', '-', infoPlist],
				{ encoding: 'utf8' }
			).trim();
		} catch {
			// Fall back to the XML representation below.
		}
	}
	if (!executableName) {
		const plist = fs.readFileSync(infoPlist, 'utf8');
		executableName = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? '';
	}
	if (!executableName || executableName.includes('/') || executableName.includes('\\')) {
		throw new Error(`Unable to resolve CFBundleExecutable from ${infoPlist}.`);
	}
	return path.join(productRoot, 'Contents', 'MacOS', executableName);
}

function productChecksums(appRoot: string, productJson: { checksums?: Record<string, string> }): Array<{ path: string; expected: string; actual: string; match: boolean }> {
	const entries = Object.entries(productJson.checksums ?? {});
	if (entries.length === 0) {
		throw new Error('Product checksum list is empty.');
	}
	return entries.map(([relativePath, expected]) => {
		const filePath = path.join(appRoot, 'out', ...relativePath.split('/'));
		assertFile(filePath, `Product checksum file ${relativePath}`);
		const actual = base64Sha256(filePath);
		if (actual !== expected) {
			throw new Error(`Product checksum mismatch: ${relativePath}`);
		}
		return { path: relativePath, expected, actual, match: true };
	});
}

function signatureStatus(productRoot: string, requireSignature: boolean): { verified: boolean; required: boolean; detail: string } {
	if (process.platform !== 'darwin') {
		if (requireSignature) {
			throw new Error('A macOS signature can only be verified on macOS.');
		}
		return { verified: false, required: false, detail: 'Not checked outside macOS.' };
	}
	try {
		cp.execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', productRoot], {
			stdio: ['ignore', 'ignore', 'pipe']
		});
		return { verified: true, required: requireSignature, detail: 'codesign --verify --deep --strict passed.' };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		if (requireSignature) {
			throw new Error(`macOS product signature verification failed: ${detail}`);
		}
		return { verified: false, required: false, detail: 'Unsigned CI product; signing is required at release promotion.' };
	}
}

async function stopCodeProcesses(userData: string): Promise<void> {
	const processIds = processesContaining(userData);
	await Promise.all(processIds.map(processId => terminateProcess(processId)));
}

async function testCleanProductStart(
	productExecutable: string,
	bundledProxyEntryPoint: string,
	verificationRoot: string,
	keepArtifacts: boolean
): Promise<ICleanStartResult> {
	if (process.platform !== 'darwin') {
		throw new Error('Clean macOS product startup must run on a macOS host.');
	}

	// VS Code creates a Unix domain socket below --user-data-dir. macOS limits
	// that socket path to roughly 103 bytes, so the deep GitHub workspace/report
	// directory cannot safely host the clean profile.
	const cleanRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-macos-'));
	const failureEvidenceRoot = path.join(verificationRoot, 'macos-clean-start-failure');
	const userData = path.join(cleanRoot, 'user-data');
	const extensions = path.join(cleanRoot, 'extensions');
	const sharedData = path.join(cleanRoot, 'shared-data');
	const proxyData = path.join(cleanRoot, 'proxy-data');
	const codexHome = path.join(cleanRoot, 'codex-home');
	const stdoutPath = path.join(cleanRoot, 'code.stdout.log');
	const stderrPath = path.join(cleanRoot, 'code.stderr.log');
	for (const directory of [userData, extensions, sharedData, proxyData, codexHome]) {
		fs.mkdirSync(directory, { recursive: true });
	}
	const initialProxyDataEntries = fs.readdirSync(proxyData).length;
	if (initialProxyDataEntries !== 0) {
		throw new Error('Clean-start Proxy data directory was not empty.');
	}

	const proxyPort = await freeTcpPort();
	let cdpPort = await freeTcpPort();
	while (cdpPort === proxyPort) {
		cdpPort = await freeTcpPort();
	}
	const baseUrl = `http://127.0.0.1:${proxyPort}`;
	const settingsDirectory = path.join(userData, 'User');
	fs.mkdirSync(settingsDirectory, { recursive: true });
	fs.writeFileSync(path.join(settingsDirectory, 'settings.json'), `${JSON.stringify({
		'aiEditor.proxy.baseUrl': baseUrl,
		'aiEditor.proxy.autoStart': true,
		'workbench.startupEditor': 'none'
	}, null, '\t')}\n`);

	const environment = { ...process.env };
	for (const key of cleanEnvironmentKeys) {
		delete environment[key];
	}
	environment['VSCODE_AI_EDITOR_PROXY_DATA_DIR'] = proxyData;
	environment['CODEX_HOME'] = codexHome;

	const stdout = fs.openSync(stdoutPath, 'w');
	const stderr = fs.openSync(stderrPath, 'w');
	const launcher = cp.spawn(productExecutable, [
		'--user-data-dir', userData,
		'--extensions-dir', extensions,
		'--shared-data-dir', sharedData,
		`--remote-debugging-port=${cdpPort}`,
		'--disable-workspace-trust',
		'--disable-gpu'
	], {
		detached: false,
		env: environment,
		stdio: ['ignore', stdout, stderr]
	});
	fs.closeSync(stdout);
	fs.closeSync(stderr);

	let proxyProcessId: number | undefined;
	let completed = false;
	try {
		let liveResponse: IHttpResponse | undefined;
		let cdpTargets: unknown[] = [];
		for (let attempt = 0; attempt < 180; attempt++) {
			await delay(500);
			try {
				liveResponse = await request(`${baseUrl}/live`, 1_000);
			} catch {
				liveResponse = undefined;
			}
			try {
				const cdpResponse = await request(`http://127.0.0.1:${cdpPort}/json/list`, 1_000);
				cdpTargets = responseJson<unknown[]>(cdpResponse, 'CDP target list');
			} catch {
				cdpTargets = [];
			}
			if (liveResponse?.statusCode === 200 && cdpTargets.length > 0) {
				break;
			}
			if (launcher.exitCode !== null) {
				break;
			}
		}

		if (liveResponse?.statusCode !== 200) {
			throw new Error(`Bundled Proxy did not become live on ${baseUrl}. Failure logs: ${failureEvidenceRoot}`);
		}
		if (cdpTargets.length === 0) {
			throw new Error(`Clean macOS product did not expose a Workbench target on CDP port ${cdpPort}.`);
		}

		proxyProcessId = listenerProcessId(proxyPort);
		if (!proxyProcessId) {
			throw new Error(`Unable to identify the bundled Proxy listening on port ${proxyPort}.`);
		}
		const command = processCommand(proxyProcessId);
		if (!command.includes(bundledProxyEntryPoint)) {
			throw new Error(`Clean-start listener was not launched from the bundled Proxy entry point: ${command}`);
		}

		const readyResponse = await request(`${baseUrl}/ready`);
		const ready = responseJson<{ status?: string }>(readyResponse, 'Clean bundled Proxy /ready');
		if (readyResponse.statusCode !== 503 || ready.status !== 'unavailable') {
			throw new Error(`Clean bundled Proxy /ready must report HTTP 503 status=unavailable.`);
		}

		const modelsResponse = await request(`${baseUrl}/v1/models`);
		const models = responseJson<{ data?: unknown[] }>(modelsResponse, 'Clean bundled Proxy /v1/models');
		if (modelsResponse.statusCode !== 200 || !Array.isArray(models.data) || models.data.length !== 0) {
			throw new Error('Clean bundled Proxy unexpectedly inherited a configured model catalog.');
		}

		const adminResponse = await request(`${baseUrl}/admin`);
		if (adminResponse.statusCode !== 200 || !String(adminResponse.headers['content-type']).includes('text/html')) {
			throw new Error('Clean bundled Proxy /admin did not return HTML.');
		}

		await stopCodeProcesses(userData);
		await terminateProcess(launcher.pid ?? 0);
		await delay(2_000);

		const afterExitLive = await request(`${baseUrl}/live`);
		if (afterExitLive.statusCode !== 200 || listenerProcessId(proxyPort) !== proxyProcessId) {
			throw new Error('Bundled Proxy exited or changed process when Code closed.');
		}

		completed = true;
		return {
			baseUrl,
			proxyProcessId,
			proxyEntryPoint: bundledProxyEntryPoint,
			initialProxyDataEntries,
			cdpTargetCount: cdpTargets.length,
			readyStatusCode: readyResponse.statusCode,
			readyStatus: ready.status,
			modelCount: models.data.length,
			adminStatusCode: adminResponse.statusCode,
			proxySurvivedCodeExit: true,
			artifactDirectory: keepArtifacts ? cleanRoot : null
		};
	} finally {
		await stopCodeProcesses(userData);
		await terminateProcess(launcher.pid ?? 0);
		if (proxyPort !== 47892) {
			const currentListener = listenerProcessId(proxyPort);
			if (currentListener && processCommand(currentListener).includes(bundledProxyEntryPoint)) {
				await terminateProcess(currentListener);
			}
		}
		if (!completed) {
			fs.mkdirSync(failureEvidenceRoot, { recursive: true });
			for (const source of [stdoutPath, stderrPath, path.join(settingsDirectory, 'settings.json')]) {
				if (fs.existsSync(source)) {
					fs.copyFileSync(source, path.join(failureEvidenceRoot, path.basename(source)));
				}
			}
		}
		if (!keepArtifacts) {
			fs.rmSync(cleanRoot, { recursive: true, force: true });
		}
	}
}

function writeMarkdownReport(reportPath: string, report: Record<string, unknown>): void {
	const versions = report['versions'] as Record<string, Record<string, unknown>>;
	const signature = report['signature'] as Record<string, unknown>;
	const cleanStart = report['cleanStart'] as Record<string, unknown> | null;
	const lines = [
		'# AI Editor macOS Release Acceptance',
		'',
		`- Generated: ${report['generatedAt']}`,
		`- Result: **${report['result']}**`,
		`- Platform: ${report['platform']}`,
		`- Code: ${versions['code']['version']} (${versions['code']['commit']})`,
		`- Proxy: ${versions['proxy']['version']} (${versions['proxy']['commit']})`,
		`- Codex: ${versions['codex']['version']}`,
		`- Product checksums: ${(report['productChecksums'] as unknown[]).length}/${(report['productChecksums'] as unknown[]).length}`,
		`- Proxy payload files: ${report['proxyPayloadFileCount']}`,
		`- Signature verified: ${signature['verified']}`,
		cleanStart
			? `- Clean start: /ready=${cleanStart['readyStatusCode']} ${cleanStart['readyStatus']}, models=${cleanStart['modelCount']}, Proxy survived Code exit=${cleanStart['proxySurvivedCodeExit']}`
			: '- Clean start: skipped',
		''
	];
	fs.writeFileSync(reportPath, lines.join('\n'));
}

async function main(): Promise<void> {
	const args = parseArguments(process.argv.slice(2));
	const arch = args.arch ?? process.env['VSCODE_ARCH'] ?? process.arch;
	if (arch !== 'x64' && arch !== 'arm64') {
		throw new Error(`Unsupported macOS architecture: ${arch}`);
	}

	const product = readJson<{ nameLong: string }>(path.join(repositoryRoot, 'product.json'));
	const productRoot = path.resolve(
		args.productRoot ?? path.join(repositoryRoot, '..', `VSCode-darwin-${arch}`, `${product.nameLong}.app`)
	);
	const reportPath = path.resolve(
		args.report ?? path.join(repositoryRoot, '.build', 'ai-editor-release', `macos-${arch}-release-report.json`)
	);
	const reportDirectory = path.dirname(reportPath);
	fs.mkdirSync(reportDirectory, { recursive: true });

	assertDirectory(productRoot, 'macOS product app');
	const appRoot = path.join(productRoot, 'Contents', 'Resources', 'app');
	assertDirectory(appRoot, 'macOS product application resources');
	const executable = bundleExecutable(productRoot);
	assertExecutable(executable, 'Code macOS executable');

	const productJsonPath = path.join(appRoot, 'product.json');
	const packageJsonPath = path.join(appRoot, 'package.json');
	const proxyRoot = path.join(appRoot, 'ai-editor-proxy');
	const releaseSource = readAiEditorProxyReleaseSource(path.join(repositoryRoot, 'build', 'ai-editor-proxy', 'release.json'));
	const proxyManifest = validateAiEditorProxyArtifact(proxyRoot, `darwin-${arch}`, releaseSource.productTarget);
	assertAiEditorProxyReleaseIdentity(proxyManifest, releaseSource);
	const proxyEntryPoint = path.join(proxyRoot, ...proxyManifest.entryPoint.split('/'));
	const codexRoot = path.join(appRoot, 'node_modules', '@openai');
	const nativePackageName = `codex-darwin-${arch}`;
	const nativeTarget = arch === 'x64' ? 'x86_64-apple-darwin' : 'aarch64-apple-darwin';
	const nativeBinary = path.join(codexRoot, nativePackageName, 'vendor', nativeTarget, 'bin', 'codex');

	const requiredResourcePaths: Array<[string, string]> = [
		['Code executable', executable],
		['Product license', path.join(appRoot, 'LICENSE.txt')],
		['Product third-party notices', path.join(appRoot, 'ThirdPartyNotices.txt')],
		['Codex Agent Host', path.join(appRoot, 'out', 'vs', 'platform', 'agentHost', 'node', 'agentHostMain.js')],
		['Codex JavaScript launcher', path.join(codexRoot, 'codex', 'bin', 'codex.js')],
		[`Codex macOS ${arch} runtime`, nativeBinary],
		['Simplified Chinese language pack', path.join(appRoot, 'extensions', 'vscode-language-pack-zh-hans', 'package.json')],
		['Bundled Proxy entry point', proxyEntryPoint],
		['Bundled Proxy license', path.join(proxyRoot, 'LICENSE')],
		['Bundled Proxy third-party notices', path.join(proxyRoot, 'ThirdPartyNotices.txt')],
		['Bundled Proxy release manifest', path.join(proxyRoot, 'release-manifest.json')]
	];
	const resources = requiredResourcePaths.map(([name, filePath]) => fileRecord(name, filePath));
	assertExecutable(nativeBinary, `Codex macOS ${arch} runtime`);

	const productJson = readJson<{
		aiEditorProxyBundled?: boolean;
		checksums?: Record<string, string>;
		commit?: string;
		date?: string;
		nameLong?: string;
	}>(productJsonPath);
	const packageJson = readJson<{ version?: string }>(packageJsonPath);
	if (productJson.aiEditorProxyBundled !== true) {
		throw new Error('Product does not require the bundled AI Editor Proxy.');
	}
	const checksums = productChecksums(appRoot, productJson);

	const productNotices = fs.readFileSync(path.join(appRoot, 'ThirdPartyNotices.txt'), 'utf8');
	if (!/^codex\s*$/im.test(productNotices) || !productNotices.includes('github.com/openai/codex')) {
		throw new Error('Product ThirdPartyNotices.txt does not contain the Codex notice.');
	}
	const proxyNotices = fs.readFileSync(path.join(proxyRoot, 'ThirdPartyNotices.txt'), 'utf8');
	if (!/^undici 8\.7\.0\s*$/im.test(proxyNotices) || !proxyNotices.includes('Matteo Collina and Undici contributors')) {
		throw new Error('Bundled Proxy ThirdPartyNotices.txt does not contain the undici notice.');
	}

	const codexPackage = readJson<{ version?: string }>(path.join(codexRoot, 'codex', 'package.json'));
	const codexNativePackage = readJson<{ version?: string }>(path.join(codexRoot, nativePackageName, 'package.json'));
	const languagePack = readJson<{ version?: string }>(
		path.join(appRoot, 'extensions', 'vscode-language-pack-zh-hans', 'package.json')
	);
	if (codexNativePackage.version !== `${codexPackage.version}-darwin-${arch}`) {
		throw new Error('Codex macOS native package version does not match the JavaScript launcher.');
	}

	const signature = signatureStatus(productRoot, args.requireSignature);
	const cleanStart = args.skipCleanStart
		? null
		: await testCleanProductStart(executable, proxyEntryPoint, reportDirectory, args.keepCleanStartArtifacts);

	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		result: 'PASS',
		platform: `darwin-${arch}`,
		productRoot,
		versions: {
			code: {
				name: productJson.nameLong,
				version: packageJson.version,
				commit: productJson.commit,
				date: productJson.date
			},
			proxy: {
				name: proxyManifest.name,
				version: proxyManifest.version,
				commit: proxyManifest.commit,
				builtAt: proxyManifest.builtAt,
				repository: releaseSource.repository,
				target: proxyManifest.target ?? 'legacy-standalone'
			},
			codex: {
				version: codexPackage.version,
				nativePackageVersion: codexNativePackage.version
			},
			languagePack: {
				version: languagePack.version
			}
		},
		signature,
		resources,
		productChecksums: checksums,
		proxyPayloadFileCount: Object.keys(proxyManifest.files).length,
		cleanStart
	};
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, '\t')}\n`);
	writeMarkdownReport(reportPath.replace(/\.json$/i, '.md'), report);
	console.log(JSON.stringify({
		result: report.result,
		platform: report.platform,
		reportPath,
		productChecksumCount: checksums.length,
		proxyPayloadFileCount: report.proxyPayloadFileCount,
		signatureVerified: signature.verified,
		cleanStart: cleanStart ? 'passed' : 'skipped'
	}));
}

main().catch(error => {
	console.error(error instanceof Error ? error.stack ?? error.message : String(error));
	process.exit(1);
});
