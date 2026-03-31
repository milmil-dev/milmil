import ReactDOM from 'react-dom/client';
import App from './App';
import { availableLanguages, detectBrowserLocale, loadAndActivate } from './i18n/config';
import './styles/global.css';

// Migrate old locale codes and validate saved locale
const LOCALE_MIGRATIONS: Record<string, string> = {
  'zh-Hant': 'zh-TW',
  'zh-Hans': 'zh-CN',
};
const supportedCodes = new Set(availableLanguages.map((l) => l.code));

function resolveLocale(): string {
  let saved = localStorage.getItem('milmil-locale');
  if (saved && LOCALE_MIGRATIONS[saved]) {
    saved = LOCALE_MIGRATIONS[saved];
    localStorage.setItem('milmil-locale', saved);
  }
  if (saved && supportedCodes.has(saved)) return saved;
  if (saved) localStorage.removeItem('milmil-locale');
  return detectBrowserLocale();
}

async function boot() {
  await loadAndActivate(resolveLocale());
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
}
boot();

// Register Serwist service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const { Serwist } = await import('@serwist/window');
      const serwist = new Serwist('/sw.js', { scope: '/' });
      await serwist.register();
    } catch {
      // Service worker registration failed — fine in dev
    }
  });
}
