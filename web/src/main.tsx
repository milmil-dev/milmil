import ReactDOM from 'react-dom/client';
import App from './App';
import { loadAndActivate } from './i18n/config';
import './styles/global.css';

loadAndActivate('en');

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
