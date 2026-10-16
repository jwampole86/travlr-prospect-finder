// The four most widely used languages in travel: English, Spanish, French and Mandarin Chinese.
export const LANGUAGES = [
  { code: 'en', short: 'EN', native: 'English', htmlLang: 'en' },
  { code: 'es', short: 'ES', native: 'Español', htmlLang: 'es' },
  { code: 'fr', short: 'FR', native: 'Français', htmlLang: 'fr' },
  { code: 'zh', short: '中文', native: '中文', htmlLang: 'zh-Hans' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANG: LangCode = 'en';
export const LANG_STORAGE_KEY = 'app_language';

export function isLangCode(value: unknown): value is LangCode {
  return LANGUAGES.some((l) => l.code === value);
}

/** Maps a browser language such as "fr-CA" or "zh-TW" to a supported code, or null when unsupported. */
export function matchBrowserLang(value: string | null | undefined): LangCode | null {
  const base = String(value ?? '').toLowerCase().split('-')[0];
  return isLangCode(base) ? base : null;
}
