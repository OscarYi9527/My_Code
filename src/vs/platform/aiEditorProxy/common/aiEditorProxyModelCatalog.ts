/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IAiEditorProxyCatalogModel {
	readonly id: string;
	readonly name: string;
	readonly contextWindow?: number;
	readonly supportsVision: boolean;
}

export interface IAiEditorProxyCatalogResponse {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}

export type AiEditorProxyCatalogFetch = (
	url: string,
	init: { readonly headers: Readonly<Record<string, string>> }
) => Promise<IAiEditorProxyCatalogResponse>;

interface IAiEditorProxyCatalogPayload {
	readonly models?: readonly {
		readonly slug?: unknown;
		readonly display_name?: unknown;
		readonly context_window?: unknown;
		readonly input_modalities?: unknown;
	}[];
	readonly data?: readonly {
		readonly id?: unknown;
	}[];
}

export function parseAiEditorProxyModelCatalog(value: unknown): IAiEditorProxyCatalogModel[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return [];
	}

	const catalog = value as IAiEditorProxyCatalogPayload;
	const richModels = Array.isArray(catalog.models)
		? catalog.models
			.filter(model => typeof model.slug === 'string' && model.slug.length > 0)
			.map(model => ({
				id: model.slug as string,
				name: typeof model.display_name === 'string' && model.display_name.length > 0
					? model.display_name
					: model.slug as string,
				contextWindow: typeof model.context_window === 'number' && Number.isFinite(model.context_window)
					? model.context_window
					: undefined,
				supportsVision: Array.isArray(model.input_modalities) && model.input_modalities.includes('image')
			}))
		: [];
	const models = richModels.length > 0
		? richModels
		: (Array.isArray(catalog.data) ? catalog.data : [])
			.filter(model => typeof model.id === 'string' && model.id.length > 0)
			.map(model => ({
				id: model.id as string,
				name: model.id as string,
				contextWindow: undefined,
				supportsVision: false
			}));

	const seen = new Set<string>();
	return models.filter(model => {
		if (seen.has(model.id)) {
			return false;
		}
		seen.add(model.id);
		return true;
	});
}

/**
 * Loads and atomically replaces the Edge model catalog.
 *
 * Failures deliberately publish an empty catalog before being rethrown so a
 * signed-out, expired, or unavailable Edge cannot leave stale selectable
 * models in the Workbench.
 */
export async function refreshAiEditorProxyModelCatalog(
	baseUrl: string,
	userAgent: string,
	apply: (models: readonly IAiEditorProxyCatalogModel[]) => void,
	fetcher: AiEditorProxyCatalogFetch = globalThis.fetch
): Promise<number> {
	try {
		const response = await fetcher(`${baseUrl}/v1/models`, {
			headers: { 'User-Agent': userAgent }
		});
		if (!response.ok) {
			throw new Error(`Proxy model catalog request failed with HTTP ${response.status}`);
		}
		const models = parseAiEditorProxyModelCatalog(await response.json());
		apply(models);
		return models.length;
	} catch (error) {
		apply([]);
		throw error;
	}
}
