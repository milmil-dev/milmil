import { i18n } from '@lingui/core';

const locales = {
  en: () => import('../locales/en/messages'),
  'zh-CN': () => import('../locales/zh-CN/messages'),
  'zh-TW': () => import('../locales/zh-TW/messages'),
  'zh-HK': () => import('../locales/zh-HK/messages'),
};

export async function loadCatalog(locale: string) {
  const mod = await (locales[locale as keyof typeof locales] ?? locales.en)();
  i18n.loadAndActivate({ locale, messages: mod.messages });
}

export { i18n };
