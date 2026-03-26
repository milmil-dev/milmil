import { defaultLocale, loadAndActivate } from './config';

// Accepts an optional saved locale (from localStorage or external caller).
// Falls back to defaultLocale (zh-Hant) if none provided.
export async function initializeLanguage(savedLanguage?: string | null): Promise<void> {
  const locale = savedLanguage ?? localStorage.getItem('milmil-locale') ?? defaultLocale;
  await loadAndActivate(locale);
}
