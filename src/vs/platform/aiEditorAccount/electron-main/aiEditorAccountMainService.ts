/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import {
	AI_EDITOR_ACCOUNT_DEFAULT_EDGE_URL,
	AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL,
	AI_EDITOR_ACCOUNT_DEVELOPMENT_GATEWAY_URL,
	AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID,
	AI_EDITOR_ACCOUNT_STATUS_REFRESH_INTERVAL,
	AI_EDITOR_ACCOUNT_TURN_GATE_TIMEOUT,
	AiEditorManagementRoute,
	AiEditorAccountState,
	createAiEditorAccountUnavailableStatus,
	createAiEditorTurnGateResult,
	IAiEditorAccountMainService,
	IAiEditorSafeStatus,
	IAiEditorTurnGateRequest,
	IAiEditorTurnGateResult,
	IAiEditorWebviewTicket,
	normalizeAiEditorAccountEdgeUrl,
	normalizeAiEditorAccountGatewayUrl
} from '../common/aiEditorAccount.js';
import {
	AiEditorAccountHttpClient,
	AiEditorAccountHttpError,
	AiEditorEdgeLocalNonceFileAuthorization,
	IAiEditorAccountHttpClient,
	IAiEditorEdgeLocalAuthorization,
	IAiEditorPkce,
	IAiEditorTokenResponse
} from './aiEditorAccountHttpClient.js';
import {
	AiEditorLoopbackCallbackError,
	AiEditorLoopbackCallbackServer,
	IAiEditorAuthorizationCallback
} from './loopbackCallbackServer.js';
import {
	AiEditorGatewayOriginPolicy,
	AiEditorGatewayNavigationDecision,
	decideAiEditorGatewayNavigation,
	createAiEditorManagementUrl
} from './gatewayOriginPolicy.js';

interface IAiEditorAccountLoginCallback extends IDisposable {
	readonly redirectUri: string;
	waitForResult(): Promise<IAiEditorAuthorizationCallback>;
}

export interface IAiEditorAccountLoginDependencies {
	readonly client: IAiEditorAccountHttpClient;
	readonly createPkce: () => Promise<IAiEditorPkce>;
	readonly createCallback: (state: string) => Promise<IAiEditorAccountLoginCallback>;
	readonly openExternal: (url: string) => Promise<void>;
	readonly getDevice: () => Promise<{ readonly name: string; readonly platform: string }>;
}

export interface IAiEditorAccountMainServiceDependencies {
	readonly client: IAiEditorAccountHttpClient;
	readonly login: (kind: 'login' | 'register') => Promise<IAiEditorSafeStatus>;
	readonly prepareManagementView?: (viewId: string, route: AiEditorManagementRoute) => Promise<void>;
	readonly disposeManagementView?: (viewId: string) => Promise<void>;
	readonly now?: () => number;
	readonly logSafeError?: (errorId: string) => void;
}

export class AiEditorAccountMainServiceCore extends Disposable implements IAiEditorAccountMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IAiEditorSafeStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly now: () => number;
	private status: IAiEditorSafeStatus;
	private statusOperation: Promise<IAiEditorSafeStatus> | undefined;
	private loginOperation: Promise<IAiEditorSafeStatus> | undefined;

	constructor(private readonly dependencies: IAiEditorAccountMainServiceDependencies) {
		super();
		this.now = dependencies.now ?? Date.now;
		this.status = createAiEditorAccountUnavailableStatus(
			AiEditorAccountState.ServiceUnavailable,
			0,
			'account_status_not_checked'
		);
	}

	async getStatus(options?: { readonly force?: boolean }): Promise<IAiEditorSafeStatus> {
		const isFresh = this.status.checkedAt > 0 && this.now() - this.status.checkedAt < AI_EDITOR_ACCOUNT_STATUS_REFRESH_INTERVAL;
		if (!options?.force && isFresh) {
			return this.status;
		}
		return this.refreshStatus(() => this.dependencies.client.getStatus());
	}

	login(kind: 'login' | 'register'): Promise<IAiEditorSafeStatus> {
		if (!this.loginOperation) {
			this.loginOperation = this.dependencies.login(kind)
				.then(status => this.updateStatus(status))
				.catch(error => this.updateStatus(this.statusForError(error)))
				.finally(() => this.loginOperation = undefined);
		}
		return this.loginOperation;
	}

	async logout(): Promise<void> {
		try {
			await this.dependencies.client.logout();
			this.updateStatus(await this.dependencies.client.getStatus());
		} catch (error) {
			this.updateStatus(this.statusForError(error));
		}
	}

	async canStartTurn(request: IAiEditorTurnGateRequest): Promise<IAiEditorTurnGateResult> {
		if (!isValidTurnGateRequest(request)) {
			return createAiEditorTurnGateResult(this.updateStatus(createAiEditorAccountUnavailableStatus(
				AiEditorAccountState.ServiceUnavailable,
				this.now(),
				'account_turn_gate_request_invalid'
			)));
		}

		const status = await raceTimeout(
			this.getStatus({ force: true }),
			AI_EDITOR_ACCOUNT_TURN_GATE_TIMEOUT
		);
		if (!status) {
			return createAiEditorTurnGateResult(this.updateStatus(createAiEditorAccountUnavailableStatus(
				AiEditorAccountState.ServiceUnavailable,
				this.now(),
				'account_turn_gate_timeout'
			)));
		}
		return createAiEditorTurnGateResult(status);
	}

	retryStatus(): Promise<IAiEditorSafeStatus> {
		return this.refreshStatus(() => this.dependencies.client.retryStatus());
	}

	requestWebviewTicket(): Promise<IAiEditorWebviewTicket> {
		return this.dependencies.client.requestWebviewTicket();
	}

	prepareManagementView(viewId: string, route: AiEditorManagementRoute): Promise<void> {
		if (!this.dependencies.prepareManagementView) {
			throw new AiEditorAccountHttpError('account_management_unavailable');
		}
		return this.dependencies.prepareManagementView(viewId, route);
	}

	disposeManagementView(viewId: string): Promise<void> {
		return this.dependencies.disposeManagementView?.(viewId) ?? Promise.resolve();
	}

	private refreshStatus(operation: () => Promise<IAiEditorSafeStatus>): Promise<IAiEditorSafeStatus> {
		if (!this.statusOperation) {
			this.statusOperation = operation()
				.then(status => this.updateStatus(status))
				.catch(error => this.updateStatus(this.statusForError(error)))
				.finally(() => this.statusOperation = undefined);
		}
		return this.statusOperation;
	}

	private statusForError(error: unknown): IAiEditorSafeStatus {
		const errorId = safeErrorId(error);
		this.dependencies.logSafeError?.(errorId);
		switch (errorId) {
			case 'login_required':
			case 'account_login_cancelled':
			case 'account_callback_cancelled':
				return createAiEditorAccountUnavailableStatus(AiEditorAccountState.LoginRequired, this.now(), errorId);
			case 'account_disabled':
			case 'account_expired':
				return createAiEditorAccountUnavailableStatus(AiEditorAccountState.AccountUnavailable, this.now(), errorId);
			case 'password_change_required':
				return createAiEditorAccountUnavailableStatus(AiEditorAccountState.PasswordChangeRequired, this.now(), errorId);
			default:
				return createAiEditorAccountUnavailableStatus(AiEditorAccountState.ServiceUnavailable, this.now(), errorId);
		}
	}

	private updateStatus(status: IAiEditorSafeStatus): IAiEditorSafeStatus {
		if (JSON.stringify(this.status) !== JSON.stringify(status)) {
			this.status = status;
			this._onDidChangeStatus.fire(status);
		}
		return this.status;
	}
}

export class AiEditorAccountMainService extends AiEditorAccountMainServiceCore {
	constructor(
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(createRuntimeDependencies(environmentMainService, productService, logService, instantiationService));
	}
}

export async function performAiEditorAccountLogin(
	kind: 'login' | 'register',
	dependencies: IAiEditorAccountLoginDependencies
): Promise<IAiEditorSafeStatus> {
	if (kind !== 'login' && kind !== 'register') {
		throw new AiEditorAccountHttpError('account_login_kind_invalid');
	}

	const pkce = await dependencies.createPkce();
	const callback = await dependencies.createCallback(pkce.state);
	try {
		const authorizationUrl = dependencies.client.createAuthorizationUrl(pkce, callback.redirectUri);
		await dependencies.openExternal(authorizationUrl);
		const authorization = await callback.waitForResult();
		const device = await dependencies.getDevice();
		let tokens: IAiEditorTokenResponse | undefined = await dependencies.client.exchangeAuthorizationCode({
			code: authorization.code,
			codeVerifier: pkce.verifier,
			redirectUri: callback.redirectUri,
			deviceName: device.name,
			platform: device.platform
		});
		try {
			const grant = await dependencies.client.startHandoff(pkce.state);
			await dependencies.client.completeHandoff(pkce.state, grant, tokens);
			return await dependencies.client.getStatus();
		} finally {
			tokens = undefined;
		}
	} finally {
		callback.dispose();
	}
}

async function createPkce(): Promise<IAiEditorPkce> {
	const crypto = await import('crypto');
	const verifier = crypto.randomBytes(32).toString('base64url');
	return {
		state: crypto.randomBytes(32).toString('base64url'),
		verifier,
		challenge: crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url')
	};
}

function createRuntimeDependencies(
	environmentMainService: IEnvironmentMainService,
	productService: IProductService,
	logService: ILogService,
	instantiationService: IInstantiationService
): IAiEditorAccountMainServiceDependencies {
	const edgeOrigin = resolveEdgeOrigin(environmentMainService, productService);
	const gatewayOrigin = resolveGatewayOrigin(environmentMainService, productService, logService);
	const client = new AiEditorAccountHttpClient(
		edgeOrigin,
		gatewayOrigin,
		resolveEdgeLocalAuthorization(environmentMainService)
	);
	const loginDependencies: IAiEditorAccountLoginDependencies = {
		client,
		createPkce,
		createCallback: state => AiEditorLoopbackCallbackServer.start(state),
		openExternal: async url => {
			const { shell } = await import('electron');
			await shell.openExternal(url);
		},
		getDevice: async () => {
			const os = await import('os');
			return {
				name: os.hostname() || productService.nameShort,
				platform: accountPlatform()
			};
		}
	};
	const getBrowserViewMainService = async () => {
		const { IBrowserViewMainService } = await import('../../browserView/electron-main/browserViewMainService.js');
		return instantiationService.invokeFunction(accessor => accessor.get(IBrowserViewMainService));
	};
	return {
		client,
		login: kind => performAiEditorAccountLogin(kind, loginDependencies),
		prepareManagementView: async (viewId, route) => {
			return prepareAiEditorManagementView({
				viewId,
				route,
				gatewayOrigin,
				client,
				browserViewMainService: await getBrowserViewMainService(),
				openExternal: loginDependencies.openExternal
			});
		},
		disposeManagementView: async viewId => disposeAiEditorManagementView(
			viewId,
			gatewayOrigin,
			await getBrowserViewMainService()
		),
		logSafeError: errorId => logService.warn(`[aiEditorAccount] Account operation failed (${errorId}).`)
	};
}

const managementPolicies = new WeakMap<Electron.WebContents, AiEditorGatewayOriginPolicy>();

export async function prepareAiEditorManagementView(options: {
	readonly viewId: string;
	readonly route: AiEditorManagementRoute;
	readonly gatewayOrigin: string | undefined;
	readonly client: Pick<IAiEditorAccountHttpClient, 'requestWebviewTicket'>;
	readonly browserViewMainService: {
		tryGetBrowserView(id: string): {
			readonly webContents: Electron.WebContents;
			loadURL(url: string): Promise<void>;
		} | undefined;
	};
	readonly openExternal: (url: string) => Promise<void>;
}): Promise<void> {
	if (options.viewId !== AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID || !isAiEditorManagementRoute(options.route)) {
		throw new AiEditorAccountHttpError('account_management_request_invalid');
	}
	if (!options.gatewayOrigin) {
		throw new AiEditorAccountHttpError('account_management_unavailable');
	}

	const view = options.browserViewMainService.tryGetBrowserView(options.viewId);
	if (!view || view.webContents.isDestroyed()) {
		throw new AiEditorAccountHttpError('account_management_view_missing');
	}

	if (!managementPolicies.has(view.webContents)) {
		managementPolicies.set(
			view.webContents,
			new AiEditorGatewayOriginPolicy(view.webContents, options.gatewayOrigin, options.openExternal)
		);
	}

	const managementUrl = createAiEditorManagementUrl(options.gatewayOrigin, options.route);
	const currentUrl = view.webContents.getURL();
	if (decideAiEditorGatewayNavigation(currentUrl, options.gatewayOrigin) === AiEditorGatewayNavigationDecision.AllowInView) {
		await view.loadURL(managementUrl);
		return;
	}

	await view.loadURL(managementUrl);
	if (new URL(view.webContents.getURL()).origin !== options.gatewayOrigin) {
		throw new AiEditorAccountHttpError('account_management_origin_mismatch');
	}

	let ticket: IAiEditorWebviewTicket | undefined = await options.client.requestWebviewTicket();
	try {
		const payload = JSON.stringify({
			type: 'ai-editor-management-bootstrap',
			version: 1,
			route: options.route,
			ticket: ticket.ticket,
			expiresIn: ticket.expiresIn
		});
		const targetOrigin = JSON.stringify(options.gatewayOrigin);
		await view.webContents.executeJavaScriptInIsolatedWorld(
			1001,
			[{ code: `window.postMessage(${payload}, ${targetOrigin});` }]
		);
	} finally {
		ticket = undefined;
	}
}

export async function disposeAiEditorManagementView(
	viewId: string,
	gatewayOrigin: string | undefined,
	browserViewMainService: {
		tryGetBrowserView(id: string): {
			readonly webContents: Electron.WebContents;
		} | undefined;
	}
): Promise<void> {
	if (viewId !== AI_EDITOR_ACCOUNT_MANAGEMENT_VIEW_ID) {
		throw new AiEditorAccountHttpError('account_management_request_invalid');
	}
	const view = browserViewMainService.tryGetBrowserView(viewId);
	if (!view || view.webContents.isDestroyed()) {
		return;
	}

	try {
		if (
			gatewayOrigin &&
			decideAiEditorGatewayNavigation(view.webContents.getURL(), gatewayOrigin) === AiEditorGatewayNavigationDecision.AllowInView
		) {
			await view.webContents.executeJavaScriptInIsolatedWorld(1001, [{
				code: `fetch(new URL('/api/v1/webview/session', location.origin).toString(), { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => undefined);`
			}]);
		}
	} finally {
		managementPolicies.get(view.webContents)?.dispose();
		managementPolicies.delete(view.webContents);
	}
}

function resolveEdgeLocalAuthorization(
	environmentMainService: IEnvironmentMainService
): IAiEditorEdgeLocalAuthorization | undefined {
	if (environmentMainService.isBuilt) {
		return undefined;
	}
	const nonceFile = process.env['VSCODE_AI_EDITOR_ACCOUNT_EDGE_NONCE_FILE']?.trim();
	if (!nonceFile) {
		return undefined;
	}
	return new AiEditorEdgeLocalNonceFileAuthorization(nonceFile);
}

function resolveEdgeOrigin(environmentMainService: IEnvironmentMainService, productService: IProductService): string {
	if (!environmentMainService.isBuilt) {
		return normalizeAiEditorAccountEdgeUrl(
			process.env['VSCODE_AI_EDITOR_ACCOUNT_EDGE_ORIGIN'],
			AI_EDITOR_ACCOUNT_DEVELOPMENT_EDGE_URL
		);
	}
	return normalizeAiEditorAccountEdgeUrl(productService.aiEditorAccountEdgeOrigin, AI_EDITOR_ACCOUNT_DEFAULT_EDGE_URL);
}

function resolveGatewayOrigin(
	environmentMainService: IEnvironmentMainService,
	productService: IProductService,
	logService: ILogService
): string | undefined {
	try {
		if (!environmentMainService.isBuilt) {
			return normalizeAiEditorAccountGatewayUrl(
				process.env['VSCODE_AI_EDITOR_ACCOUNT_GATEWAY_ORIGIN'] ?? AI_EDITOR_ACCOUNT_DEVELOPMENT_GATEWAY_URL,
				true
			);
		}
		return productService.aiEditorAccountGatewayOrigin
			? normalizeAiEditorAccountGatewayUrl(productService.aiEditorAccountGatewayOrigin, false)
			: undefined;
	} catch {
		logService.warn('[aiEditorAccount] Product Gateway origin is invalid.');
		return undefined;
	}
}

function safeErrorId(error: unknown): string {
	if (error instanceof AiEditorAccountHttpError || error instanceof AiEditorLoopbackCallbackError) {
		return error.errorId;
	}
	return 'account_operation_failed';
}

function isValidTurnGateRequest(request: IAiEditorTurnGateRequest): boolean {
	return typeof request?.modelId === 'string' && request.modelId.length > 0 &&
		typeof request.sessionId === 'string' && request.sessionId.length > 0 &&
		typeof request.clientTurnId === 'string' && request.clientTurnId.length > 0;
}

function isAiEditorManagementRoute(route: AiEditorManagementRoute): boolean {
	switch (route) {
		case AiEditorManagementRoute.Account:
		case AiEditorManagementRoute.Security:
		case AiEditorManagementRoute.Organization:
		case AiEditorManagementRoute.Invitations:
		case AiEditorManagementRoute.Usage:
		case AiEditorManagementRoute.Providers:
		case AiEditorManagementRoute.Diagnostics:
			return true;
		default:
			return false;
	}
}

function accountPlatform(): string {
	switch (process.platform) {
		case 'win32': return 'windows';
		case 'darwin': return 'macos';
		default: return 'linux';
	}
}
