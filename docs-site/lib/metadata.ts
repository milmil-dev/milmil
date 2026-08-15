import type { Metadata } from 'next';
import { locales } from '@/i18n/locales';

/** Canonical plus the hreflang map, for a route that exists under every locale prefix. */
export function localeAlternates(lang: string, path = ''): Metadata['alternates'] {
  return {
    canonical: `/${lang}${path}`,
    languages: Object.fromEntries(locales.map((locale) => [locale, `/${locale}${path}`])),
  };
}
