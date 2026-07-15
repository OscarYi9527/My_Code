/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { access } from 'fs/promises';
import * as http from 'http';
import { dirname, join } from 'path';
import { shell } from 'electron';
import { timeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILogService } from '../../log/common/log.js';
import {
	AI_EDITOR_PROXY_AUTO_START_SETTING_ID,
	AI_EDITOR_PROXY_BASE_URL_SETTING_ID,
	AiEditorProxyLifecycleState,
	hasAvailableAiEditorProxyProvider,
	IAiEditorProxyHealthResponse,
	IAiEditorProxyService,
	IAiEditorProxyStatus,
	normalizeAiEditorProxyBaseUrl,
	parseAiEditorProxyProviderStatus
} from '../common/aiEditorProxy.js';

const HEALTH_POLL_INTERVAL = 15_000;
const STARTUP_POLL_INTERVAL = 250;
// A first launch from the installed product can spend more than ten seconds
// initializing the writable data directory and Windows credential protection.
// Keep the poll responsive, but do not spawn a duplicate recovery process
// while that cold start is still healthy and progressing.
const STARTUP_TIMEOUT = 30_000;
const MAX_RESTART_ATTEMPTS = 3;

interface IHttpJsonResponse {
	readonly statusCode: number;
	readonly body?: IAiEditorProxyHealthResponse;
}

export class AiEditorProxyMainService extends Disposable implements IAiEditorProxyService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IAiEditorProxyStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private status: IAiEditorProxyStatus;
	private operation: Promise<IAiEditorProxyStatus> | undefined;
	private circuitOpen = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.status = {
			state: AiEditorProxyLifecycleState.Stopped,
			baseUrl: this.readBaseUrlSafely(),
			restartAttempts: 0
		};

		const monitor = setInterval(() => void this.monitor(), HEALTH_POLL_INTERVAL);
		this._register({ dispose: () => clearInterval(monitor) });
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AI_EDITOR_PROXY_BASE_URL_SETTING_ID) || event.affectsConfiguration(AI_EDITOR_PROXY_AUTO_START_SETTING_ID)) {
				this.circuitOpen = false;
				this.updateStatus({
					state: AiEditorProxyLifecycleState.Stopped,
					baseUrl: this.readBaseUrlSafely(),
					restartAttempts: 0
				});
				void this.ensureRunning();
			}
		}));
	}

	async getStatus(): Promise<IAiEditorProxyStatus> {
		return this.status;
	}

	async refreshStatus(): Promise<IAiEditorProxyStatus> {
		let baseUrl: string;
		try {
			baseUrl = this.readBaseUrl();
		} catch (error) {
			return this.updateStatus({
				state: AiEditorProxyLifecycleState.Failed,
				baseUrl: this.configurationService.getValue<string>(AI_EDITOR_PROXY_BASE_URL_SETTING_ID) ?? '',
				restartAttempts: this.status.restartAttempts,
				lastError: this.errorMessage(error)
			});
		}

		try {
			const live = await requestJson(`${baseUrl}/live`);
			if (live.statusCode < 200 || live.statusCode >= 300) {
				throw new Error(`Proxy liveness check returned HTTP ${live.statusCode}.`);
			}
		} catch (error) {
			return this.updateStatus({
				state: AiEditorProxyLifecycleState.Stopped,
				baseUrl,
				restartAttempts: this.status.restartAttempts,
				lastError: this.errorMessage(error)
			});
		}

		try {
			const ready = await requestJson(`${baseUrl}/ready`);
			const providers = parseAiEditorProxyProviderStatus(ready.body);
			const hasProvider = hasAvailableAiEditorProxyProvider(providers);
			const state = ready.statusCode >= 200 && ready.statusCode < 300 && hasProvider
				? AiEditorProxyLifecycleState.Ready
				: AiEditorProxyLifecycleState.RunningUnconfigured;
			this.circuitOpen = false;
			return this.updateStatus({ state, baseUrl, providers, restartAttempts: 0 });
		} catch (error) {
			return this.updateStatus({
				state: AiEditorProxyLifecycleState.Degraded,
				baseUrl,
				restartAttempts: this.status.restartAttempts,
				lastError: this.errorMessage(error)
			});
		}
	}

	ensureRunning(): Promise<IAiEditorProxyStatus> {
		this.circuitOpen = false;
		return this.runExclusive(() => this.doEnsureRunning());
	}

	restart(): Promise<IAiEditorProxyStatus> {
		this.circuitOpen = false;
		return this.runExclusive(async () => {
			// The Proxy is shared by all local Codex clients. Its admin restart
			// endpoint terminates the running process before a replacement is
			// guaranteed to be alive, so using it here could leave every client
			// offline. A user-initiated retry therefore only starts a missing
			// Proxy; an already healthy shared Proxy is deliberately reused.
			const current = await this.refreshStatus();
			if (current.state === AiEditorProxyLifecycleState.Ready || current.state === AiEditorProxyLifecycleState.RunningUnconfigured) {
				return current;
			}
			return this.doEnsureRunning();
		});
	}

	async openAdmin(): Promise<void> {
		const baseUrl = this.readBaseUrl();
		await shell.openExternal(`${baseUrl}/admin`);
	}

	private async monitor(): Promise<void> {
		if (this.operation) {
			return;
		}
		const status = await this.refreshStatus();
		if (status.state === AiEditorProxyLifecycleState.Stopped && !this.circuitOpen && this.isAutoStartEnabled()) {
			await this.runExclusive(() => this.doEnsureRunning(true));
		}
	}

	private async doEnsureRunning(automaticRecovery = false): Promise<IAiEditorProxyStatus> {
		const current = await this.refreshStatus();
		if (current.state === AiEditorProxyLifecycleState.Ready || current.state === AiEditorProxyLifecycleState.RunningUnconfigured) {
			return current;
		}
		if (current.state === AiEditorProxyLifecycleState.Failed || !this.isAutoStartEnabled()) {
			return current;
		}

		let attempts = automaticRecovery ? current.restartAttempts : 0;
		while (attempts < MAX_RESTART_ATTEMPTS) {
			attempts++;
			this.updateStatus({
				state: attempts === 1 ? AiEditorProxyLifecycleState.Starting : AiEditorProxyLifecycleState.Restarting,
				baseUrl: current.baseUrl,
				restartAttempts: attempts
			});
			try {
				await this.startProxy(current.baseUrl);
				const started = await this.waitForStartup();
				if (started.state === AiEditorProxyLifecycleState.Ready || started.state === AiEditorProxyLifecycleState.RunningUnconfigured) {
					return started;
				}
			} catch (error) {
				this.logService.warn(`[aiEditorProxy] Start attempt ${attempts} failed: ${this.errorMessage(error)}`);
			}
			await timeout(250 * (2 ** (attempts - 1)));
		}

		this.circuitOpen = true;
		return this.updateStatus({
			state: AiEditorProxyLifecycleState.Failed,
			baseUrl: current.baseUrl,
			restartAttempts: attempts,
			lastError: 'The local AI Proxy could not be started after repeated attempts.'
		});
	}

	private async waitForStartup(): Promise<IAiEditorProxyStatus> {
		const deadline = Date.now() + STARTUP_TIMEOUT;
		let status = this.status;
		while (Date.now() < deadline) {
			await timeout(STARTUP_POLL_INTERVAL);
			status = await this.refreshStatus();
			if (status.state === AiEditorProxyLifecycleState.Ready || status.state === AiEditorProxyLifecycleState.RunningUnconfigured) {
				return status;
			}
		}
		return status;
	}

	private async startProxy(baseUrl: string): Promise<void> {
		const proxyRoot = await this.findProxyRoot();
		const entryPoint = join(proxyRoot, 'src', 'server.js');
		const url = new URL(baseUrl);
		const child = spawn(process.execPath, [entryPoint], {
			cwd: proxyRoot,
			detached: true,
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: '1',
				CODEX_PROXY_DATA_DIR: process.env['VSCODE_AI_EDITOR_PROXY_DATA_DIR'] ??
					join(this.environmentMainService.userHome.fsPath, '.claude', 'proxy'),
				CODEX_PROXY_HOST: url.hostname === '[::1]' ? '::1' : (url.hostname === 'localhost' ? '127.0.0.1' : url.hostname),
				CODEX_PROXY_PORT: url.port || '80'
			},
			stdio: 'ignore',
			windowsHide: true
		});
		child.unref();
		this.logService.info(`[aiEditorProxy] Started bundled Proxy process from ${proxyRoot}.`);
	}

	private async findProxyRoot(): Promise<string> {
		const override = process.env['VSCODE_AI_EDITOR_PROXY_ROOT'];
		const candidates = [
			override,
			join(dirname(this.environmentMainService.appRoot), 'ai-editor-proxy'),
			join(this.environmentMainService.appRoot, 'resources', 'ai-editor-proxy'),
			join(this.environmentMainService.appRoot, 'ai-editor-proxy')
		].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

		for (const candidate of candidates) {
			try {
				await access(join(candidate, 'src', 'server.js'));
				return candidate;
			} catch {
				// Continue looking through the supported product installation locations.
			}
		}
		throw new Error('The bundled AI Proxy runtime was not found. Repair or reinstall Code.');
	}

	private runExclusive(operation: () => Promise<IAiEditorProxyStatus>): Promise<IAiEditorProxyStatus> {
		if (!this.operation) {
			this.operation = operation().finally(() => this.operation = undefined);
		}
		return this.operation;
	}

	private updateStatus(status: IAiEditorProxyStatus): IAiEditorProxyStatus {
		if (JSON.stringify(this.status) !== JSON.stringify(status)) {
			this.status = status;
			this._onDidChangeStatus.fire(status);
		}
		return this.status;
	}

	private readBaseUrl(): string {
		return normalizeAiEditorProxyBaseUrl(this.configurationService.getValue<string>(AI_EDITOR_PROXY_BASE_URL_SETTING_ID));
	}

	private readBaseUrlSafely(): string {
		try {
			return this.readBaseUrl();
		} catch {
			return this.configurationService.getValue<string>(AI_EDITOR_PROXY_BASE_URL_SETTING_ID) ?? '';
		}
	}

	private isAutoStartEnabled(): boolean {
		return this.configurationService.getValue<boolean>(AI_EDITOR_PROXY_AUTO_START_SETTING_ID) !== false;
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}

function requestJson(url: string): Promise<IHttpJsonResponse> {
	return new Promise((resolve, reject) => {
		const request = http.request(url, { method: 'GET', timeout: 3_000 }, response => {
			const chunks: Buffer[] = [];
			let length = 0;
			response.on('data', (chunk: Buffer) => {
				length += chunk.length;
				if (length <= 1024 * 1024) {
					chunks.push(chunk);
				}
			});
			response.on('end', () => {
				let body: IAiEditorProxyHealthResponse | undefined;
				if (chunks.length > 0 && length <= 1024 * 1024) {
					try {
						body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as IAiEditorProxyHealthResponse;
					} catch {
						// Liveness only requires an HTTP response; malformed readiness is handled as unconfigured.
					}
				}
				resolve({ statusCode: response.statusCode ?? 0, body });
			});
		});
		request.on('timeout', () => request.destroy(new Error('Proxy health check timed out.')));
		request.on('error', reject);
		request.end();
	});
}
