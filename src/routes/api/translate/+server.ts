import { json, type RequestHandler } from '@sveltejs/kit';
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type TranslationCache = {
	[englishTitle: string]: {
		[language: string]: string;
	};
};

const cacheFilePath = join(__dirname, '..', '..', '..', '..', 'translation-cache.json');

async function loadCache(): Promise<TranslationCache> {
	try {
		const data = await readFile(cacheFilePath, 'utf-8');
		return JSON.parse(data);
	} catch (error) {
		console.warn('Failed to load cache, starting with empty cache');
		return {};
	}
}

async function saveCache(cache: TranslationCache): Promise<void> {
	try {
		await writeFile(cacheFilePath, JSON.stringify(cache, null, 2));
	} catch (error) {
		console.error('Failed to save cache:', error);
	}
}

async function translateText(text: string, targetLang: string): Promise<string> {
	const apiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;

	const response = await fetch(apiUrl);

	if (!response.ok) {
		throw new Error(`Translation API error: ${response.statusText}`);
	}

	const data = await response.json();
	return data.responseData.translatedText;
}

async function translateTitles(
	titles: string[],
	targetLang: string,
	cache: TranslationCache
): Promise<{ translations: Record<string, string>; updatedCache: TranslationCache }> {
	const translations: Record<string, string> = {};
	const updatedCache = { ...cache };
	const maxLength = 500;
	let batch: string[] = [];
	let batchLength = 0;

	async function translateBatch(batchToTranslate: string[]) {
		const batchText = batchToTranslate.join('||');
		const translatedBatch = await translateText(batchText, targetLang);
		const translatedTitles = translatedBatch.split('||');

		batchToTranslate.forEach((title, index) => {
			translations[title] = translatedTitles[index];
			if (!(title in updatedCache)) updatedCache[title] = {};
			updatedCache[title][targetLang] = translatedTitles[index];
		});
	}

	for (const title of titles) {
		if (targetLang in (updatedCache[title] || {})) {
			translations[title] = updatedCache[title][targetLang];
			continue;
		}

		if (batchLength + title.length + 2 > maxLength && batch.length > 0) {
			await translateBatch(batch);
			batch = [];
			batchLength = 0;
		}

		batch.push(title);
		batchLength += title.length + 2; // +2 for the separator
	}

	if (batch.length > 0) {
		await translateBatch(batch);
	}

	return { translations, updatedCache };
}

export const GET: RequestHandler = async ({ url }) => {
	const titles = url.searchParams.get('titles')?.split(',') || [];
	const targetLang = url.searchParams.get('targetLang') || '';

	if (titles.length === 0 || !targetLang) {
		return json({ error: 'Invalid input: titles and targetLang are required' }, { status: 400 });
	}

	try {
		const cache: TranslationCache = await loadCache();
		const { translations, updatedCache } = await translateTitles(titles, targetLang, cache);
		await saveCache(updatedCache);

		return json(translations);
	} catch (error) {
		console.error('Translation error:', error);
		return json({ error: 'Translation failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const { titles, targetLang } = await request.json();

	if (!Array.isArray(titles) || titles.length === 0 || !targetLang) {
		return json(
			{ error: 'Invalid input: titles must be a non-empty array and targetLang is required' },
			{ status: 400 }
		);
	}

	try {
		const cache: TranslationCache = await loadCache();
		const { translations, updatedCache } = await translateTitles(titles, targetLang, cache);
		await saveCache(updatedCache);

		return json(translations);
	} catch (error) {
		console.error('Translation error:', error);
		return json({ error: 'Translation failed' }, { status: 500 });
	}
};
