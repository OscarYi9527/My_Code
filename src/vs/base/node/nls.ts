/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../common/path.js';
import { promises } from 'fs';
import { mark } from '../common/performance.js';
import { ILanguagePacks, INLSConfiguration } from '../../nls.js';
import { Promises } from './pfs.js';

export interface IResolveNLSConfigurationContext {

	/**
	 * Location where `nls.messages.json` and `nls.keys.json` are stored.
	 */
	readonly nlsMetadataPath: string;

	/**
	 * Path to the user data directory. Used as a cache for
	 * language packs converted to the format we need.
	 */
	readonly userDataPath: string;

	/**
	 * Commit of the running application. Can be `undefined`
	 * when not built.
	 */
	readonly commit: string | undefined;

	/**
	 * Locale as defined in `argv.json` or `app.getLocale()`.
	 */
	readonly userLocale: string;

	/**
	 * Locale as defined by the OS (e.g. `app.getPreferredSystemLanguages()`).
	 */
	readonly osLocale: string;
}

export async function resolveNLSConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }: IResolveNLSConfigurationContext): Promise<INLSConfiguration> {
	mark('code/willGenerateNls');

	if (
		userLocale === 'pseudo' ||
		userLocale.startsWith('en') ||
		!userDataPath
	) {
		return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
	}

	const embeddedFallback = async (): Promise<INLSConfiguration> =>
		(await resolveEmbeddedLanguagePackConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }))
		?? defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);

	// Development launches do not carry a product commit and therefore
	// cannot use the normal installed-language-pack cache. The distributable
	// also needs a first-launch fallback before languagepacks.json has been
	// generated. In both cases use the language pack shipped with Code.
	if (process.env['VSCODE_DEV'] || !commit) {
		return embeddedFallback();
	}

	try {
		const languagePacks = await getLanguagePackConfigurations(userDataPath);
		if (!languagePacks) {
			return embeddedFallback();
		}

		const resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
		if (!resolvedLanguage) {
			return embeddedFallback();
		}

		const languagePack = languagePacks[resolvedLanguage];
		const mainLanguagePackPath = languagePack?.translations?.['vscode'];
		if (
			!languagePack ||
			typeof languagePack.hash !== 'string' ||
			!languagePack.translations ||
			typeof mainLanguagePackPath !== 'string' ||
			!(await Promises.exists(mainLanguagePackPath))
		) {
			return embeddedFallback();
		}

		const languagePackId = `${languagePack.hash}.${resolvedLanguage}`;
		const globalLanguagePackCachePath = join(userDataPath, 'clp', languagePackId);
		const commitLanguagePackCachePath = join(globalLanguagePackCachePath, commit);
		const languagePackMessagesFile = join(commitLanguagePackCachePath, 'nls.messages.json');
		const translationsConfigFile = join(globalLanguagePackCachePath, 'tcf.json');
		const languagePackCorruptMarkerFile = join(globalLanguagePackCachePath, 'corrupted.info');

		if (await Promises.exists(languagePackCorruptMarkerFile)) {
			await promises.rm(globalLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }); // delete corrupted cache folder
		}

		const result: INLSConfiguration = {
			userLocale,
			osLocale,
			resolvedLanguage,
			defaultMessagesFile: join(nlsMetadataPath, 'nls.messages.json'),
			languagePack: {
				translationsConfigFile,
				messagesFile: languagePackMessagesFile,
				corruptMarkerFile: languagePackCorruptMarkerFile
			},

			// NLS: below properties are a relic from old times only used by vscode-nls and deprecated
			locale: userLocale,
			availableLanguages: { '*': resolvedLanguage },
			_languagePackId: languagePackId,
			_languagePackSupport: true,
			_translationsConfigFile: translationsConfigFile,
			_cacheRoot: globalLanguagePackCachePath,
			_resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
			_corruptedFile: languagePackCorruptMarkerFile
		};

		if (await Promises.exists(languagePackMessagesFile)) {
			touch(commitLanguagePackCachePath).catch(() => { }); // We don't wait for this. No big harm if we can't touch
			mark('code/didGenerateNls');
			return result;
		}

		const [
			nlsDefaultKeys,
			nlsDefaultMessages,
			nlsPackdata
		]:
			[Array<[string, string[]]>, string[], { contents: Record<string, Record<string, string>> }]
			//      ^moduleId ^nlsKeys                               ^moduleId      ^nlsKey ^nlsValue
			= await Promise.all([
				promises.readFile(join(nlsMetadataPath, 'nls.keys.json'), 'utf-8').then(content => JSON.parse(content)),
				promises.readFile(join(nlsMetadataPath, 'nls.messages.json'), 'utf-8').then(content => JSON.parse(content)),
				promises.readFile(mainLanguagePackPath, 'utf-8').then(content => JSON.parse(content)),
			]);

		const nlsResult: string[] = [];

		// We expect NLS messages to be in a flat array in sorted order as they
		// where produced during build time. We use `nls.keys.json` to know the
		// right order and then lookup the related message from the translation.
		// If a translation does not exist, we fallback to the default message.

		let nlsIndex = 0;
		for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
			const moduleTranslations = nlsPackdata.contents[moduleId];
			for (const nlsKey of nlsKeys) {
				nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
				nlsIndex++;
			}
		}

		await promises.mkdir(commitLanguagePackCachePath, { recursive: true });

		await Promise.all([
			promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
			promises.writeFile(translationsConfigFile, JSON.stringify(languagePack.translations), 'utf-8')
		]);

		mark('code/didGenerateNls');

		return result;
	} catch (error) {
		console.error('Generating translation files failed.', error);
	}

	return embeddedFallback();
}

/**
 * Resolves the Simplified Chinese language pack bundled under `extensions/`.
 *
 * A normal marketplace language pack is discovered after the extension
 * scanner has populated languagepacks.json, which is too late for a localized
 * first launch. Flattening the bundled pack here lets the main process select
 * Chinese directly from the operating-system locale without hard-coding
 * Chinese for users of other system languages.
 */
async function resolveEmbeddedLanguagePackConfiguration(context: IResolveNLSConfigurationContext): Promise<INLSConfiguration | undefined> {
	const { userLocale, osLocale, userDataPath, commit, nlsMetadataPath } = context;
	if (!['zh', 'zh-cn', 'zh-hans', 'zh-sg'].includes(userLocale)) {
		return undefined;
	}

	const extensionRoot = join(nlsMetadataPath, '..', 'extensions', 'vscode-language-pack-zh-hans');
	const packPath = join(extensionRoot, 'translations', 'main.i18n.json');
	const manifestPath = join(extensionRoot, 'package.json');
	if (!(await Promises.exists(packPath)) || !(await Promises.exists(manifestPath))) {
		return undefined;
	}

	try {
		// Product builds place NLS metadata next to main.js. Source launches
		// normally omit it, but `core-ci` generates the same files under
		// out-build; accepting that location makes localization verifiable in
		// an isolated development instance without changing product behavior.
		let metadataRoot = nlsMetadataPath;
		if (!(await Promises.exists(join(metadataRoot, 'nls.keys.json')))) {
			const buildMetadataRoot = join(nlsMetadataPath, '..', 'out-build');
			if (!(await Promises.exists(join(buildMetadataRoot, 'nls.keys.json')))) {
				return undefined;
			}
			metadataRoot = buildMetadataRoot;
		}

		const [
			nlsDefaultKeys,
			nlsDefaultMessages,
			nlsPackdata,
			manifest,
		]: [
			Array<[string, string[]]>,
			string[],
			{ contents: Record<string, Record<string, string>> },
			{ contributes?: { localizations?: Array<{ languageId: string; translations?: Array<{ id: string; path: string }> }> } },
		] = await Promise.all([
			promises.readFile(join(metadataRoot, 'nls.keys.json'), 'utf-8').then(content => JSON.parse(content)),
			promises.readFile(join(metadataRoot, 'nls.messages.json'), 'utf-8').then(content => JSON.parse(content)),
			promises.readFile(packPath, 'utf-8').then(content => JSON.parse(content)),
			promises.readFile(manifestPath, 'utf-8').then(content => JSON.parse(content)),
		]);

		const nlsResult: string[] = [];
		let nlsIndex = 0;
		for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
			const moduleTranslations = nlsPackdata.contents[moduleId];
			for (const nlsKey of nlsKeys) {
				nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
				nlsIndex++;
			}
		}

		const translations: Record<string, string> = {};
		const localization = manifest.contributes?.localizations?.find(candidate => candidate.languageId === 'zh-cn');
		for (const translation of localization?.translations ?? []) {
			translations[translation.id] = join(extensionRoot, translation.path);
		}

		const languagePackId = 'embedded.zh-cn';
		const globalLanguagePackCachePath = join(userDataPath, 'clp', languagePackId);
		const commitLanguagePackCachePath = join(globalLanguagePackCachePath, commit ?? 'dev');
		const languagePackMessagesFile = join(commitLanguagePackCachePath, 'nls.messages.json');
		const translationsConfigFile = join(globalLanguagePackCachePath, 'tcf.json');
		const languagePackCorruptMarkerFile = join(globalLanguagePackCachePath, 'corrupted.info');

		await promises.mkdir(commitLanguagePackCachePath, { recursive: true });
		await Promise.all([
			promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
			promises.writeFile(translationsConfigFile, JSON.stringify(translations), 'utf-8'),
		]);

		mark('code/didGenerateNls');
		return {
			userLocale,
			osLocale,
			resolvedLanguage: 'zh-cn',
			defaultMessagesFile: join(metadataRoot, 'nls.messages.json'),
			languagePack: {
				translationsConfigFile,
				messagesFile: languagePackMessagesFile,
				corruptMarkerFile: languagePackCorruptMarkerFile
			},
			locale: userLocale,
			availableLanguages: { '*': 'zh-cn' },
			_languagePackId: languagePackId,
			_languagePackSupport: true,
			_translationsConfigFile: translationsConfigFile,
			_cacheRoot: globalLanguagePackCachePath,
			_resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
			_corruptedFile: languagePackCorruptMarkerFile
		};
	} catch (error) {
		console.error('Generating embedded translation files failed.', error);
		return undefined;
	}
}

/**
 * The `languagepacks.json` file is a JSON file that contains all metadata
 * about installed language extensions per language. Specifically, for
 * core (`vscode`) and all extensions it supports, it points to the related
 * translation files.
 *
 * The file is updated whenever a new language pack is installed or removed.
 */
async function getLanguagePackConfigurations(userDataPath: string): Promise<ILanguagePacks | undefined> {
	const configFile = join(userDataPath, 'languagepacks.json');
	try {
		return JSON.parse(await promises.readFile(configFile, 'utf-8'));
	} catch (err) {
		return undefined; // Do nothing. If we can't read the file we have no language pack config.
	}
}

function resolveLanguagePackLanguage(languagePacks: ILanguagePacks, locale: string | undefined): string | undefined {
	try {
		while (locale) {
			if (languagePacks[locale]) {
				return locale;
			}

			const index = locale.lastIndexOf('-');
			if (index > 0) {
				locale = locale.substring(0, index);
			} else {
				return undefined;
			}
		}
	} catch (error) {
		console.error('Resolving language pack configuration failed.', error);
	}

	return undefined;
}

function defaultNLSConfiguration(userLocale: string, osLocale: string, nlsMetadataPath: string): INLSConfiguration {
	mark('code/didGenerateNls');

	return {
		userLocale,
		osLocale,
		resolvedLanguage: 'en',
		defaultMessagesFile: join(nlsMetadataPath, 'nls.messages.json'),

		// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
		locale: userLocale,
		availableLanguages: {}
	};
}

//#region fs helpers

function touch(path: string): Promise<void> {
	const date = new Date();

	return promises.utimes(path, date, date);
}

//#endregion
