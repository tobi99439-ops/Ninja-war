import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Capture `beforeinstallprompt` at module load so we never miss it across screen transitions
let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(ev: BeforeInstallPromptEvent | null) => void>();

function notifyPromptListeners() {
  for (const listener of promptListeners) {
    listener(cachedDeferredPrompt);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });

  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    notifyPromptListeners();
  });
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    /Obito3DApk/i.test(window.navigator.userAgent)
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOS;
}

function detectAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /android/.test(window.navigator.userAgent.toLowerCase());
}

function detectInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isAndroid] = useState<boolean>(() => detectAndroid());
  const [isInIframe] = useState<boolean>(() => detectInIframe());

  useEffect(() => {
    setIsInstalled(detectStandalone());

    const syncPrompt = (ev: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(ev);
    };
    promptListeners.add(syncPrompt);
    if (cachedDeferredPrompt !== deferredPrompt) {
      setDeferredPrompt(cachedDeferredPrompt);
    }

    const handleAppInstalled = () => {
      setIsInstalled(true);
      cachedDeferredPrompt = null;
      setDeferredPrompt(null);
    };

    const standaloneMq = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsInstalled(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneMq.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      promptListeners.delete(syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneMq.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, [deferredPrompt]);

  const install = async (): Promise<boolean> => {
    const promptEvent = deferredPrompt || cachedDeferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      cachedDeferredPrompt = null;
      setDeferredPrompt(null);
      notifyPromptListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt || cachedDeferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
