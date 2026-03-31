import { i18n } from '@lingui/core';

const rtlLanguages = ['he', 'fa', 'ur'];

function onLocaleChange(locale: string) {
  const dir = rtlLanguages.includes(locale) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
}

async function loadAndActivate(locale: string): Promise<void> {
  try {
    const { messages } = await import(`../locales/${locale}/messages.ts`);
    i18n.loadAndActivate({ locale, messages });
    onLocaleChange(locale);
  } catch (error) {
    console.error(`Failed to load locale: ${locale}`, error);
    if (locale !== 'zh-TW') {
      await loadAndActivate('zh-TW');
    }
  }
}

export const availableLanguages = [
  { code: 'zh-TW', label: '繁體中文（台灣）' },
  { code: 'zh-HK', label: '粵語' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

export const defaultLocale = 'zh-TW';

/**
 * Detect the best matching locale from browser preferences.
 * Falls back to defaultLocale if no match is found.
 */
export function detectBrowserLocale(): string {
  const supported = availableLanguages.map((l) => l.code);
  const browserLangs = navigator.languages ?? [navigator.language];

  for (const lang of browserLangs) {
    // Exact match (e.g., zh-TW)
    if (supported.includes(lang)) return lang;
    // Try with region normalization (e.g., zh-tw → zh-TW)
    const normalized = lang.replace(/-(\w+)$/, (_, r) => `-${r.toUpperCase()}`);
    if (supported.includes(normalized)) return normalized;
    // Base language match (e.g., zh → zh-TW, ja → ja, ko → ko, en → en)
    const base = lang.split('-')[0];
    const match = supported.find((s) => s === base || s.startsWith(base + '-'));
    if (match) return match;
  }

  return defaultLocale;
}

export const isRTL = (lng?: string): boolean => !!lng && rtlLanguages.includes(lng);

export default i18n;
export { i18n, loadAndActivate, onLocaleChange };
