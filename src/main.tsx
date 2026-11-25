import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        if (regs.length > 0) {
          Promise.all(regs.map((r) => r.unregister())).then(() => {
            if ('caches' in window) {
              caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
            }
          });
        }
      })
      .catch(() => {});
  } else if (!/Obito3DApk/i.test(navigator.userAgent)) {
    let refreshing = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        registration?.update().catch(() => {});
      },
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
