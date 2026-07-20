/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IncomingMessage } from 'http';
import {
	IAiEditorSafeStatus,
	IAiEditorWebviewTicket
} from '../common/aiEditorAccount.js';
import { AI_EDITOR_ACCOUNT_ENDPOINTS, parseAiEditorSafeStatus } from '../common/aiEditorAccountIpc.js';

const GATEWAY_API_BASE_PATH = '/api/v1';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT = 10_000;

export interface IAiEditorPkce {
	readonly state: string;
	readonly verifier: string;
	readonly challenge: string;
}

export interface IAiEditorAuthorizationCodeExchange {
	readonly code: string;
	readonly codeVerifier: string;
	readonly redirectUri: string;
	readonly deviceName: string;
	readonly platform: string;
}

export interface IAiEditorTokenResponse {
	readonly accessToken: string;
	readonly accessTokenExpiresIn: number;
	readonly refreshToken: string;
	readonly deviceSessionId: string;
}

export interface IAiEditorHandoffGrant {
	readonly handoffId: string;
	readonly nonce: string;
	readonly expiresIn: number;
}

export interface IAiEditorEdgeLocalAuthorization {
	getLocalNonce(): Promise<string | undefined>;
}

/**
 * Reloads the Edge-local authorization nonce for every request so an isolated
 * Edge restart can rotate the nonce without exposing it to the renderer.
 */
export class AiEditorEdgeLocalNonceFileAuthorization implements IAiEditorEdgeLocalAuthorization {
	constructor(private readonly nonceFile: string) { }

	async getLocalNonce(): Promise<string> {
		const path = await import('path');
		if (!path.isAbsolute(this.nonceFile)) {
			throw new AiEditorAccountHttpError('account_edge_local_nonce_path_invalid');
		}

		const fs = await import('fs/promises');
		let contents: Buffer | undefined;
		try {
			contents = await fs.readFile(this.nonceFile);
			const localNonce = contents.toString('utf8').trim();
			validateLocalNonce(localNonce);
			return localNonce;
		} catch (error) {
			if (error instanceof AiEditorAccountHttpError) {
				throw error;
			}
			throw new AiEditorAccountHttpError('account_edge_local_nonce_unavailable');
		} finally {
			contents?.fill(0);
		}
	}
}

export interface IAiEditorAccountHttpClient {
	getStatus(): Promise<IAiEditorSafeStatus>;
	retryStatus(): Promise<IAiEditorSafeStatus>;
	logout(): Promise<void>;
	requestWebviewTicket(): Promise<IAiEditorWebviewTicket>;
	startHandoff(state: string): Promise<IAiEditorHandoffGrant>;
	completeHandoff(state: string, grant: IAiEditorHandoffGrant, tokens: IAiEditorTokenResponse): Promise<void>;
	createAuthorizationUrl(pkce: IAiEditorPkce, redirectUri: string): string;
	exchangeAuthorizationCode(exchange: IAiEditorAuthorizationCodeExchange): Promise<IAiEditorTokenResponse>;
}

export class AiEditorAccountHttpError extends Error {
	constructor(
		readonly errorId: string,
		readonly statusCode?: number
	) {
		super(errorId);
		this.name = 'AiEditorAccountHttpError';
	}
}

export class AiEditorAccountHttpClient implements IAiEditorAccountHttpClient {
	constructor(
		private readonly edgeOrigin: string,
		private readonly gatewayOrigin: string | undefined,
		private readonly edgeLocalAuthorization?: IAiEditorEdgeLocalAuthorization
	) { }

	async getStatus(): Promise<IAiEditorSafeStatus> {
		return parseAiEditorSafeStatus(await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.status,
			'GET',
			undefined
		));
	}

	async retryStatus(): Promise<IAiEditorSafeStatus> {
		return parseAiEditorSafeStatus(await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.retryStatus,
			'POST',
			{}
		));
	}

	async logout(): Promise<void> {
		await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.logout,
			'POST',
			{}
		);
	}

	async requestWebviewTicket(): Promise<IAiEditorWebviewTicket> {
		const response = asRecord(await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.webviewTicket,
			'POST',
			{}
		));
		return {
			ticket: readRequiredString(response, 'ticket'),
			expiresIn: readPositiveNumber(response, 'expiresIn')
		};
	}

	async startHandoff(state: string): Promise<IAiEditorHandoffGrant> {
		const response = asRecord(await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.handoffStart,
			'POST',
			{ state }
		));
		return {
			handoffId: readRequiredString(response, 'handoffId'),
			nonce: readRequiredString(response, 'nonce'),
			expiresIn: readPositiveNumber(response, 'expiresIn')
		};
	}

	async completeHandoff(state: string, grant: IAiEditorHandoffGrant, tokens: IAiEditorTokenResponse): Promise<void> {
		const response = asRecord(await this.requestEdgeJson(
			AI_EDITOR_ACCOUNT_ENDPOINTS.handoffComplete,
			'POST',
			{
				handoffId: grant.handoffId,
				nonce: grant.nonce,
				state,
				deviceSessionId: tokens.deviceSessionId,
				refreshToken: tokens.refreshToken,
				accessToken: tokens.accessToken,
				accessTokenExpiresIn: tokens.accessTokenExpiresIn
			}
		));
		if (response['status'] !== 'completed' || !isPositiveInteger(response['bindingVersion'])) {
			throw new AiEditorAccountHttpError('account_handoff_response_invalid');
		}
	}

	createAuthorizationUrl(pkce: IAiEditorPkce, redirectUri: string): string {
		const gatewayOrigin = this.requireGatewayOrigin();
		const url = new URL(`${GATEWAY_API_BASE_PATH}/oauth/authorize`, gatewayOrigin);
		url.searchParams.set('client_id', 'ai-editor-code');
		url.searchParams.set('redirect_uri', redirectUri);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('code_challenge', pkce.challenge);
		url.searchParams.set('code_challenge_method', 'S256');
		url.searchParams.set('state', pkce.state);
		return url.toString();
	}

	async exchangeAuthorizationCode(exchange: IAiEditorAuthorizationCodeExchange): Promise<IAiEditorTokenResponse> {
		const gatewayOrigin = this.requireGatewayOrigin();
		const response = asRecord(await requestJson(
			new URL(`${GATEWAY_API_BASE_PATH}/oauth/token`, gatewayOrigin),
			'POST',
			{
				grantType: 'authorization_code',
				clientId: 'ai-editor-code',
				code: exchange.code,
				codeVerifier: exchange.codeVerifier,
				redirectUri: exchange.redirectUri,
				device: {
					name: exchange.deviceName,
					platform: exchange.platform
				}
			},
			'account_gateway_unreachable'
		));
		return {
			accessToken: readRequiredString(response, 'accessToken'),
			accessTokenExpiresIn: readPositiveNumber(response, 'accessTokenExpiresIn'),
			refreshToken: readRequiredString(response, 'refreshToken'),
			deviceSessionId: readRequiredString(response, 'deviceSessionId')
		};
	}

	private async requestEdgeJson(path: string, method: 'GET' | 'POST', body: object | undefined): Promise<unknown> {
		const localNonce = await this.getValidatedLocalNonce();
		return requestJson(
			new URL(path, this.edgeOrigin),
			method,
			body,
			'account_edge_unreachable',
			localNonce ? { 'X-AI-Editor-Local-Nonce': localNonce } : undefined
		);
	}

	private async getValidatedLocalNonce(): Promise<string | undefined> {
		let localNonce: string | undefined;
		try {
			localNonce = await this.edgeLocalAuthorization?.getLocalNonce();
		} catch (error) {
			if (error instanceof AiEditorAccountHttpError) {
				throw error;
			}
			throw new AiEditorAccountHttpError('account_edge_local_nonce_unavailable');
		}
		if (localNonce === undefined) {
			return undefined;
		}
		validateLocalNonce(localNonce);
		return localNonce;
	}

	private requireGatewayOrigin(): string {
		if (!this.gatewayOrigin) {
			throw new AiEditorAccountHttpError('account_gateway_not_configured');
		}
		return this.gatewayOrigin;
	}
}

async function requestJson(
	url: URL,
	method: 'GET' | 'POST',
	body: object | undefined,
	unavailableErrorId: string,
	additionalHeaders?: Readonly<Record<string, string>>
): Promise<unknown> {
	let requestBody: Buffer | undefined;
	try {
		requestBody = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
		const transport = url.protocol === 'https:' ? await import('https') : await import('http');
		return await new Promise<unknown>((resolve, reject) => {
			const request = transport.request(url, {
				method,
				headers: requestBody ? {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
					'Content-Length': String(requestBody.byteLength),
					...additionalHeaders
				} : {
					'Accept': 'application/json',
					...additionalHeaders
				}
			}, response => readJsonResponse(response, resolve, reject));

			request.setTimeout(REQUEST_TIMEOUT, () => request.destroy(new AiEditorAccountHttpError(unavailableErrorId)));
			request.on('error', error => reject(
				error instanceof AiEditorAccountHttpError
					? error
					: new AiEditorAccountHttpError(unavailableErrorId)
			));
			if (requestBody) {
				request.write(requestBody);
			}
			request.end();
		});
	} finally {
		requestBody?.fill(0);
	}
}

function readJsonResponse(response: IncomingMessage, resolve: (value: unknown) => void, reject: (error: Error) => void): void {
	const chunks: Buffer[] = [];
	let length = 0;
	let tooLarge = false;
	response.on('data', (chunk: Buffer) => {
		length += chunk.byteLength;
		if (length > MAX_RESPONSE_BYTES) {
			tooLarge = true;
			return;
		}
		chunks.push(chunk);
	});
	response.on('error', () => reject(new AiEditorAccountHttpError('account_http_response_failed', response.statusCode)));
	response.on('end', () => {
		const responseBuffer = Buffer.concat(chunks);
		try {
			if (tooLarge) {
				throw new AiEditorAccountHttpError('account_http_response_too_large', response.statusCode);
			}

			let value: unknown = {};
			if (responseBuffer.byteLength > 0) {
				try {
					value = JSON.parse(responseBuffer.toString('utf8'));
				} catch {
					throw new AiEditorAccountHttpError('account_http_response_invalid', response.statusCode);
				}
			}

			const statusCode = response.statusCode ?? 0;
			if (statusCode < 200 || statusCode >= 300) {
				throw new AiEditorAccountHttpError(readSafeServerErrorId(value, statusCode), statusCode);
			}
			resolve(value);
		} catch (error) {
			reject(error instanceof Error ? error : new AiEditorAccountHttpError('account_http_response_failed', response.statusCode));
		} finally {
			responseBuffer.fill(0);
			for (const chunk of chunks) {
				chunk.fill(0);
			}
		}
	});
}

function readSafeServerErrorId(value: unknown, statusCode: number): string {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const error = (value as Record<string, unknown>)['error'];
		if (error && typeof error === 'object' && !Array.isArray(error)) {
			const code = (error as Record<string, unknown>)['code'];
			if (typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)) {
				return code;
			}
		}
	}
	return `account_http_${statusCode}`;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new AiEditorAccountHttpError('account_http_response_invalid');
	}
	return value as Record<string, unknown>;
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
	const candidate = value[key];
	if (typeof candidate !== 'string' || candidate.length === 0) {
		throw new AiEditorAccountHttpError('account_http_response_invalid');
	}
	return candidate;
}

function readPositiveNumber(value: Record<string, unknown>, key: string): number {
	const candidate = value[key];
	if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= 0) {
		throw new AiEditorAccountHttpError('account_http_response_invalid');
	}
	return candidate;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateLocalNonce(localNonce: string): void {
	if (
		Buffer.byteLength(localNonce, 'utf8') < 32 ||
		Buffer.byteLength(localNonce, 'utf8') > 4096 ||
		/[\r\n]/.test(localNonce)
	) {
		throw new AiEditorAccountHttpError('account_edge_local_nonce_invalid');
	}
}
