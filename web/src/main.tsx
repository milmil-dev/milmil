import ReactDOM from 'react-dom/client';
import App from './App';
import { detectBrowserLocale, loadAndActivate } from './i18n/config';
import './styles/global.css';

const savedLocale = localStorage.getItem('milmil-locale');
const locale = savedLocale ?? detectBrowserLocale();
loadAndActivate(locale);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);

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
