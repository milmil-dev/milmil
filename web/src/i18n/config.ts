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
    if (locale !== 'zh-Hant') {
      await loadAndActivate('zh-Hant');
    }
  }
}

export const availableLanguages = [
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'en', label: 'English' },
];

export const defaultLocale = 'zh-Hant';

export const isRTL = (lng?: string): boolean => !!lng && rtlLanguages.includes(lng);

export default i18n;
export { i18n, loadAndActivate, onLocaleChange };
