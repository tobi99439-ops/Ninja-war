import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Package, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'menu' | 'floating';
}

interface ApkInfo {
  available: boolean;
  sizeBytes: number;
  updatedAt?: number;
  bundleTag?: string | null;
  upToDate?: boolean;
  fileName: string;
  downloadUrl: string;
}

const SHARED_DIRECT_APP_URL =
  typeof window !== 'undefined' ? window.location.origin + '/' : '/';

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback to execCommand below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatMb(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);

  useEffect(() => {
    if (isInstalled) return;
    let active = true;
    void fetch(`/api/apk-info?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ApkInfo | null) => {
        if (active && data) {
          setApkInfo(data);
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      active = false;
    };
  }, [isInstalled, showGuide]);

  // Already running as an installed app (PWA standalone or native APK) — hide install button
  if (isInstalled) {
    return null;
  }

  const stopBubble = (e: PointerEvent | MouseEvent) => {
    e.stopPropagation();
  };

  const handlePress = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowGuide(true);
  };

  const handleCopyUrl = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const ok = await copyTextSafe(SHARED_DIRECT_APP_URL);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    }
  };

  const buttonClasses =
    variant === 'menu'
      ? 'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/55 bg-gradient-to-r from-emerald-600/25 via-emerald-500/20 to-amber-500/20 px-4 py-2.5 text-sm font-black text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-emerald-500/30 cursor-pointer'
      : variant === 'floating'
        ? 'flex h-9 items-center gap-1.5 rounded-lg border border-emerald-400/70 bg-[#0b1414]/92 px-3 text-xs font-extrabold text-emerald-100 shadow-[0_4px_16px_rgba(0,0,0,0.65)] transition-colors hover:border-emerald-300 hover:bg-[#112420] active:scale-95 cursor-pointer whitespace-nowrap'
        : 'flex h-8 sm:h-9 items-center gap-1.5 rounded border border-emerald-400/65 bg-gradient-to-b from-emerald-600/30 to-emerald-800/35 px-2 sm:px-3 text-[10px] sm:text-xs font-black text-emerald-100 transition-colors hover:border-emerald-300 hover:from-emerald-500/40 hover:to-emerald-700/40 active:scale-95 cursor-pointer whitespace-nowrap';

  const label =
    variant === 'header'
      ? 'تحميل APK'
      : 'تحميل اللعبة APK للموبايل';

  const modal =
    showGuide && typeof document !== 'undefined'
      ? createPortal(
          <div
            dir="rtl"
            onPointerDown={stopBubble}
            onClick={(e) => {
              e.stopPropagation();
              setShowGuide(false);
            }}
            className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          >
            <div
              onPointerDown={stopBubble}
              onClick={stopBubble}
              className="w-full max-w-md rounded-2xl border border-emerald-400/45 bg-[#0c101a] p-5 text-right text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.85)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/45 bg-emerald-500/15 text-emerald-300">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">تحميل وتثبيت اللعبة على الموبايل</h3>
                    <p className="text-[11px] font-semibold text-emerald-300/90">
                      ملف APK مباشر لأندرويد + تثبيت فوري للآيفون
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowGuide(false);
                  }}
                  aria-label="إغلاق"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#141a29] text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* PRIMARY DIRECT APK DOWNLOAD CARD */}
              {apkInfo?.available && (
                <div className="mt-3.5 rounded-xl border border-emerald-400/50 bg-[#0d1c19] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                      <Smartphone className="h-4 w-4 shrink-0" />
                      <span>ملف أندرويد جاهز (APK)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {apkInfo.upToDate !== false && (
                        <span className="rounded bg-blue-500/20 border border-blue-400/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-200">
                          أحدث تحديث
                        </span>
                      )}
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-200">
                        {formatMb(apkInfo.sizeBytes)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                    اضغط الزر بالأسفل لتحميل ملف <strong dir="ltr" className="text-white">Naruto_Obito_3D.apk</strong> بأحدث تحديثات اللعبة وتثبيته مباشرة على هاتفك.
                  </p>
                  <a
                    href={apkInfo.downloadUrl}
                    download={apkInfo.fileName}
                    onClick={stopBubble}
                    className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 px-4 py-2.5 text-sm font-black text-slate-950 shadow-[0_6px_20px_rgba(16,185,129,0.4)] transition-transform hover:brightness-110 active:scale-[0.98] cursor-pointer"
                  >
                    <Download className="h-4 w-4 stroke-[2.6]" />
                    <span>تحميل ملف APK الآن ({formatMb(apkInfo.sizeBytes)})</span>
                  </a>
                  <p className="mt-2 text-[10px] leading-relaxed text-emerald-200/80">
                    بعد التحميل افتح الملف من الإشعارات أو مدير الملفات ووافق على «التثبيت من مصادر غير معروفة» عند الطلب.
                  </p>
                </div>
              )}

              {/* One-tap PWA install when browser supports native prompt */}
              {isInstallable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void install().then((ok) => {
                      if (ok) setShowGuide(false);
                    });
                  }}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-xs font-black text-amber-100 hover:bg-amber-500/30 cursor-pointer"
                >
                  <Download className="h-4 w-4 text-amber-300" />
                  <span>تثبيت فوري كتطبيق من المتصفح (PWA)</span>
                </button>
              )}

              {isInIframe && (
                <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-100">
                  إذا لم يبدأ التحميل داخل نافذة المعاينة، انسخ الرابط بالأسفل وافتحه مباشرة في متصفح موبايلك.
                </div>
              )}

              {/* Direct Copy Link Bar */}
              <div className="mt-3 rounded-xl border border-white/10 bg-[#131826] p-3">
                <div className="mb-1.5 text-[11px] font-bold text-slate-400">
                  رابط فتح وتحميل اللعبة من متصفح الموبايل:
                </div>
                <div className="flex items-center gap-2">
                  <div
                    dir="ltr"
                    className="flex-1 truncate rounded-lg border border-white/10 bg-[#0a0d14] px-2.5 py-2 font-mono text-[11px] text-sky-300"
                  >
                    {SHARED_DIRECT_APP_URL}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold transition-colors cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    }`}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
                  </button>
                </div>
              </div>

              {/* iPhone / Safari Guide */}
              <div className="mt-3 rounded-xl border border-sky-500/30 bg-[#101826] p-3">
                <div className="flex items-center gap-2 text-xs font-black text-sky-300">
                  <Share className="h-4 w-4" />
                  <span>هواتف آيفون وآيباد (Safari)</span>
                  {isIOS && (
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
                      جهازك الحالي
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                  افتح الرابط في <strong>Safari</strong> ◀ اضغط <strong>المشاركة (Share ⬆)</strong> ◀ اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.
                </p>
              </div>

              {!apkInfo?.available && !isIOS && (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-[#111922] p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                    <Download className="h-4 w-4" />
                    <span>هواتف أندرويد (Google Chrome)</span>
                    {isAndroid && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                        جهازك الحالي
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                    افتح الرابط في <strong>Chrome</strong> ◀ اضغط القائمة <strong>(⋮)</strong> ◀ اختر <strong>تثبيت التطبيق (Install app)</strong>.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGuide(false);
                }}
                className="mt-4 min-h-[42px] w-full rounded-xl bg-[#1a2030] border border-white/15 py-2 text-xs font-black text-slate-200 transition-colors hover:bg-[#242c42] cursor-pointer"
              >
                إغلاق والعودة للعبة
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onPointerDown={stopBubble}
        onClick={handlePress}
        title="تحميل ملف APK وتثبيت اللعبة على الموبايل"
        className={buttonClasses}
      >
        <Download className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
        <span>{label}</span>
      </button>
      {modal}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isOnline || dismissed) return null;

  return (
    <div
      dir="rtl"
      className="pointer-events-auto fixed top-1.5 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-[#1a1307]/95 px-2.5 py-1 text-[10.5px] font-bold text-amber-200 shadow-lg"
    >
      <WifiOff className="h-3 w-3 text-amber-400 shrink-0" />
      <span className="whitespace-nowrap">وضع عدم الاتصال — ملفات محفوظة</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="إخفاء التنبيه"
        className="mr-0.5 flex h-4 w-4 items-center justify-center rounded-full text-amber-300/80 hover:bg-amber-400/20 hover:text-white cursor-pointer"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
