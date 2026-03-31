import { detectBrowserLocale, loadAndActivate } from './config';

// Accepts an optional saved locale (from localStorage or external caller).
// Falls back to browser-detected locale if none provided.
export async function initializeLanguage(savedLanguage?: string | null): Promise<void> {
  const locale = savedLanguage ?? localStorage.getItem('milmil-locale') ?? detectBrowserLocale();
  await loadAndActivate(locale);
}
