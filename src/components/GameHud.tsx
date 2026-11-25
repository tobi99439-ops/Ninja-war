import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Crosshair,
  Eye,
  Flame,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  SunMedium,
  Swords,
  Trees,
  Users,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import {
  ARENA_STAGES,
  ArenaStageId,
  CHARACTER_PRESETS,
  CharacterPreset,
  CharacterPresetId,
  getCharacterPortrait,
  HudSnapshot,
  JutsuId,
  OBITO_JUTSU_LIST,
  ParticleDensity,
  ShadowQuality,
} from '../types/game';
import { SavedCustomCharacter } from '../utils/characterStorage';
import { MobileJoystick } from './MobileJoystick';
import { PWAInstallButton } from './PWAInstallButton';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  isFullscreen: boolean;
  selectedStage: ArenaStageId;
  onSelectStage: (stage: ArenaStageId) => void;
  selectedCharacterId: CharacterPresetId;
  savedCharacters: SavedCustomCharacter[];
  switchingCharacter: boolean;
  characterError: string | null;
  shadowQuality: ShadowQuality;
  particleDensity: ParticleDensity;
  onChangeShadowQuality: (quality: ShadowQuality) => void;
  onChangeParticleDensity: (density: ParticleDensity) => void;
  onSelectCharacterPreset: (preset: CharacterPreset) => Promise<void>;
  onSelectSavedCharacter: (saved: SavedCustomCharacter) => Promise<void>;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onTriggerJutsu: (id: JutsuId) => void;
  onTriggerJump: () => void;
  onTriggerFinisher: () => void;
  onTriggerObitoGaze: () => void;
  onTriggerSubstitution: () => void;
  onTriggerChakraDash: () => void;
  onSetGuarding: (active: boolean) => void;
  onSetChargingChakra: (active: boolean) => void;
  onTriggerAwakening: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onResetCamera: () => void;
  onVirtualMove: (x: number, y: number) => void;
}

const SHADOW_OPTIONS: Array<{ id: ShadowQuality; labelAr: string; hintAr: string }> = [
  { id: 'off', labelAr: 'إيقاف', hintAr: 'أعلى أداء' },
  { id: 'low', labelAr: 'منخفض', hintAr: '512' },
  { id: 'medium', labelAr: 'متوسط', hintAr: '1024' },
  { id: 'high', labelAr: 'عالي', hintAr: '2048' },
];

const PARTICLE_OPTIONS: Array<{ id: ParticleDensity; labelAr: string; hintAr: string }> = [
  { id: 'low', labelAr: 'منخفض', hintAr: '35%' },
  { id: 'medium', labelAr: 'متوسط', hintAr: '65%' },
  { id: 'high', labelAr: 'عالي', hintAr: '100%' },
];

interface ArcSlotCoord {
  right: number;
  bottom: number;
  size: number;
}

function JutsuIcon({ id, className }: { id: JutsuId; className?: string }) {
  switch (id) {
    case 'katon':
    case 'amaterasu':
    case 'c2_dragon':
    case 'kurama_roar':
    case 'sage_kata':
      return <Flame className={className} />;
    case 'tsukuyomi':
      return <Eye className={className} />;
    case 'kamui':
    case 'bijuu_dama':
    case 'bijuu_barrage':
    case 'sage_odama':
    case 'sage_barrage':
      return <Orbit className={className} />;
    case 'raikiri':
      return <Zap className={className} />;
    case 'suiton':
      return <Waves className={className} />;
    case 'fuma':
    case 'c1_birds':
    case 'rasenshuriken':
      return <Crosshair className={className} />;
    case 'rinnegan':
    case 'c3_ultimate':
      return <Sparkles className={className} />;
    case 'gedo':
    case 'susanoo':
    case 'susanoo_ribcage':
    case 'susanoo_armored':
    case 'susanoo_muscular':
    case 'susanoo_perfect':
      return <ShieldAlert className={className} />;
    default:
      return <Swords className={className} />;
  }
}

function getShortJutsuLabel(
  id: JutsuId,
  isKakashi: boolean,
  isItachi: boolean,
  fallbackNameAr: string
): string {
  if (id === 'gedo') return 'غيدو';
  if (id === 'susanoo') return 'سوسانو';
  if (id === 'susanoo_ribcage') return 'الأضلاع';
  if (id === 'susanoo_armored') return 'الهيكلي';
  if (id === 'susanoo_muscular') return 'الشيطاني';
  if (id === 'susanoo_perfect') return 'الكامل';
  if (id === 'raikiri') return 'البرق';
  if (id === 'suiton') return 'الماء';
  if (id === 'amaterasu') return 'أماتيراس';
  if (id === 'tsukuyomi') return 'تسوكويومي';
  if (id === 'c1_birds') return 'طيور C1';
  if (id === 'c2_dragon') return 'تنين C2';
  if (id === 'c3_ultimate') return 'انفجار C0';
  if (id === 'rasenshuriken') return 'راسين';
  if (id === 'bijuu_dama') return 'البيجو';
  if (id === 'kurama_roar') return 'كوراما';
  if (id === 'bijuu_barrage') return 'وابل';
  if (id === 'sage_odama') return 'أوداما';
  if (id === 'sage_kata') return 'كاوازو';
  if (id === 'sage_barrage') return 'وابل';
  if (id === 'katon') return isItachi ? 'كرة النار' : isKakashi ? 'النار' : 'كاتون';
  if (id === 'kamui') return 'كاموي';
  if (id === 'fuma') return 'فوما';
  if (id === 'rinnegan') return 'رينيغان';
  return fallbackNameAr.split(' ')[0];
}

// Radial fan matching the user's gameplay screenshots (bottom-right cluster: attack, jump, and character jutsus only)
function computeClassicJutsuSlots(count: number, scale: number): ArcSlotCoord[] {
  const s = (n: number) => Math.round(n * scale);
  const sat = s(44);

  if (count <= 0) return [];
  if (count === 1) {
    return [{ right: s(110), bottom: s(32), size: sat }];
  }
  if (count === 2) {
    return [
      { right: s(110), bottom: s(32), size: sat },
      { right: s(100), bottom: s(86), size: sat },
    ];
  }
  if (count === 3) {
    return [
      { right: s(110), bottom: s(32), size: sat },
      { right: s(104), bottom: s(86), size: sat },
      { right: s(76), bottom: s(134), size: sat },
    ];
  }
  if (count === 4) {
    return [
      { right: s(110), bottom: s(32), size: sat },
      { right: s(104), bottom: s(86), size: sat },
      { right: s(82), bottom: s(138), size: sat },
      { right: s(34), bottom: s(164), size: sat },
    ];
  }

  if (count === 5) {
    return [
      { right: s(110), bottom: s(32), size: sat },
      { right: s(104), bottom: s(86), size: sat },
      { right: s(82), bottom: s(138), size: sat },
      { right: s(34), bottom: s(164), size: sat },
      { right: s(134), bottom: s(148), size: sat },
    ];
  }

  if (count === 6) {
    return [
      { right: s(110), bottom: s(32), size: sat },
      { right: s(104), bottom: s(86), size: sat },
      { right: s(82), bottom: s(138), size: sat },
      { right: s(34), bottom: s(166), size: sat },
      { right: s(160), bottom: s(54), size: sat },
      { right: s(144), bottom: s(118), size: sat },
    ];
  }

  // 7 jutsu slots (Madara with 4 individual Susanoo stage buttons + Fuma, Katon, Rinnegan)
  return [
    { right: s(110), bottom: s(32), size: sat },
    { right: s(104), bottom: s(86), size: sat },
    { right: s(82), bottom: s(138), size: sat },
    { right: s(34), bottom: s(166), size: sat },
    { right: s(162), bottom: s(46), size: sat },
    { right: s(152), bottom: s(106), size: sat },
    { right: s(124), bottom: s(162), size: sat },
  ];
}

export function GameHud({
  hud,
  muted,
  isFullscreen,
  selectedStage,
  onSelectStage,
  selectedCharacterId,
  savedCharacters,
  switchingCharacter,
  characterError,
  shadowQuality,
  particleDensity,
  onChangeShadowQuality,
  onChangeParticleDensity,
  onSelectCharacterPreset,
  onSelectSavedCharacter,
  onToggleMute,
  onToggleFullscreen,
  onTriggerJutsu,
  onTriggerJump,
  onTriggerFinisher,
  onTriggerObitoGaze,
  onTriggerSubstitution,
  onTriggerChakraDash,
  onSetGuarding,
  onSetChargingChakra,
  onTriggerAwakening,
  onTogglePause,
  onRestart,
  onReturnTitle,
  onResetCamera,
  onVirtualMove,
}: GameHudProps) {
  const activePreset = CHARACTER_PRESETS.find((c) => c.id === selectedCharacterId);
  const activeSaved = savedCharacters.find((c) => c.id === selectedCharacterId);
  const activeName = activeSaved ? activeSaved.nameAr : activePreset ? activePreset.nameAr : 'مخصص 3D';
  const portraitSrc = getCharacterPortrait(selectedCharacterId);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [useTouchControls, setUseTouchControls] = useState(false);
  const [isTabletTouch, setIsTabletTouch] = useState(false);
  const [isCompactLandscape, setIsCompactLandscape] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [portraitSrc]);

  useEffect(() => {
    const checkTouch = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const compactLand = w > h && h <= 540;
      const small = w < 768 || compactLand;
      setIsCompactLandscape(compactLand);
      setUseTouchControls(coarse || small);
      setIsTabletTouch(w >= 768 && !compactLand);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    window.addEventListener('orientationchange', checkTouch);
    return () => {
      window.removeEventListener('resize', checkTouch);
      window.removeEventListener('orientationchange', checkTouch);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const chakraPct = Math.max(0, Math.min(100, (hud.chakra / hud.maxChakra) * 100));
  const targetHpPct = hud.activeTarget
    ? Math.max(0, Math.min(100, (hud.activeTarget.hp / hud.activeTarget.maxHp) * 100))
    : 0;

  const activeSkills = useMemo(() => {
    return OBITO_JUTSU_LIST.filter((j) => {
      if (hud.isNarutoSage) {
        return (
          j.id === 'melee' ||
          j.id === 'rasenshuriken' ||
          j.id === 'sage_odama' ||
          j.id === 'sage_kata' ||
          j.id === 'sage_barrage'
        );
      }
      if (hud.isNarutoKurama) {
        return (
          j.id === 'melee' ||
          j.id === 'rasenshuriken' ||
          j.id === 'bijuu_dama' ||
          j.id === 'kurama_roar' ||
          j.id === 'bijuu_barrage'
        );
      }
      if (hud.isDeidara) {
        return (
          j.id === 'melee' ||
          j.id === 'c1_birds' ||
          j.id === 'c2_dragon' ||
          j.id === 'c3_ultimate'
        );
      }
      if (hud.isKakashi) {
        return (
          j.id === 'melee' ||
          j.id === 'fuma' ||
          j.id === 'raikiri' ||
          j.id === 'katon' ||
          j.id === 'suiton'
        );
      }
      if (hud.isItachi) {
        return (
          j.id === 'melee' ||
          j.id === 'fuma' ||
          j.id === 'amaterasu' ||
          j.id === 'katon' ||
          j.id === 'tsukuyomi' ||
          j.id === 'susanoo_ribcage' ||
          j.id === 'susanoo_armored' ||
          j.id === 'susanoo_muscular'
        );
      }
      if (hud.isMadara) {
        return (
          j.id === 'melee' ||
          j.id === 'fuma' ||
          j.id === 'katon' ||
          j.id === 'rinnegan' ||
          j.id === 'susanoo_ribcage' ||
          j.id === 'susanoo_armored' ||
          j.id === 'susanoo_muscular' ||
          j.id === 'susanoo_perfect'
        );
      }
      if (
        j.id === 'raikiri' ||
        j.id === 'suiton' ||
        j.id === 'amaterasu' ||
        j.id === 'tsukuyomi' ||
        j.id === 'susanoo' ||
        j.id === 'susanoo_ribcage' ||
        j.id === 'susanoo_armored' ||
        j.id === 'susanoo_muscular' ||
        j.id === 'susanoo_perfect' ||
        j.id === 'c1_birds' ||
        j.id === 'c2_dragon' ||
        j.id === 'c3_ultimate' ||
        j.id === 'rasenshuriken' ||
        j.id === 'bijuu_dama' ||
        j.id === 'kurama_roar' ||
        j.id === 'bijuu_barrage' ||
        j.id === 'sage_odama' ||
        j.id === 'sage_kata' ||
        j.id === 'sage_barrage'
      ) {
        return false;
      }
      return (j.id !== 'gedo' || hud.hasGedoMazo) && (j.id !== 'kamui' || hud.hasKamui);
    });
  }, [
    hud.isNarutoSage,
    hud.isNarutoKurama,
    hud.isDeidara,
    hud.isKakashi,
    hud.isItachi,
    hud.isMadara,
    hud.hasGedoMazo,
    hud.hasKamui,
  ]);

  const arcScale = isCompactLandscape ? 0.84 : isTabletTouch ? 1.06 : 0.96;
  const mobileJutsus = useMemo(() => activeSkills.filter((j) => j.id !== 'melee'), [activeSkills]);
  const arcSlots = useMemo(
    () => computeClassicJutsuSlots(mobileJutsus.length, arcScale),
    [mobileJutsus.length, arcScale]
  );

  const s = (n: number) => Math.round(n * arcScale);
  const arcContainerW = mobileJutsus.length >= 7 ? s(212) : mobileJutsus.length >= 6 ? s(192) : s(172);
  const arcContainerH = mobileJutsus.length >= 7 ? s(208) : mobileJutsus.length >= 4 ? s(196) : s(168);
  const attackSize = s(64);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.45rem,env(safe-area-inset-top))] ${
        isCompactLandscape ? 'px-2.5 sm:px-3.5' : 'p-2.5 sm:p-3.5 md:p-5'
      }`}
    >
      {/* ================================================================= */}
      {/* ULTIMATE FINISHER: LETTERBOX BARS, WHITE FLASH & K.O! BANNER      */}
      {/* ================================================================= */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-20 bg-black transition-transform duration-300 ease-out ${
          isCompactLandscape ? 'h-[8vh]' : 'h-[9vh]'
        } ${hud.finisherActive ? 'translate-y-0' : '-translate-y-full'}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-black transition-transform duration-300 ease-out ${
          isCompactLandscape ? 'h-[8vh]' : 'h-[9vh]'
        } ${hud.finisherActive ? 'translate-y-0' : 'translate-y-full'}`}
      />

      {hud.finisherFlashOpacity > 0.01 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-40 bg-white"
          style={{ opacity: Math.min(1, Math.max(0, hud.finisherFlashOpacity)) }}
        />
      )}

      {hud.obitoGazeActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-45 animate-pulse border-[16px] border-red-600/90 bg-red-950/25 shadow-[inset_0_0_140px_rgba(239,68,68,0.8)] flex items-start justify-center pt-12"
        >
          <div className="rounded-full bg-black/90 px-6 py-2 border border-red-500/70 text-red-300 font-extrabold text-sm tracking-wider shadow-2xl">
            شارينغان / كاموي: إسقاط الأعمدة الجاذبية
          </div>
        </div>
      )}

      {hud.finisherOverlay === 'ko' && hud.phase === 'playing' && (
        <div
          dir="ltr"
          className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center px-4 text-center"
        >
          <div className="rounded-2xl border-2 border-amber-300/90 bg-black/80 px-8 py-4 shadow-[0_0_55px_rgba(245,158,11,0.75)]">
            <div className="bg-gradient-to-b from-white via-amber-300 to-red-600 bg-clip-text text-6xl sm:text-8xl font-black italic tracking-[0.14em] text-transparent drop-shadow-[0_6px_18px_rgba(0,0,0,0.95)]">
              K.O!
            </div>
            <div className="mt-1 text-sm sm:text-base font-black tracking-wide text-amber-200">
              الضربة القاضية النهائية!
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TOP BAR (EXACT SCREENSHOT LAYOUT)                                 */}
      {/* ================================================================= */}
      <div
        className={`flex items-start justify-between gap-2 md:gap-4 transition-opacity duration-200 ${
          hud.finisherActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* TOP-RIGHT PLAYER CARD */}
        <div
          className={`pointer-events-auto flex items-center rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.58)] ${
            isCompactLandscape ? 'gap-2 px-2 py-1.5' : 'gap-2.5 px-2.5 py-2'
          }`}
        >
          <div
            className={`relative shrink-0 overflow-hidden rounded-lg border border-red-500/80 bg-[#121622] shadow-[0_0_12px_rgba(239,68,68,0.28)] ${
              isCompactLandscape ? 'h-10 w-10' : 'h-11 w-11 sm:h-12 sm:w-12'
            }`}
          >
            {!imgFailed ? (
              <img
                src={portraitSrc}
                alt={activeName}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-red-300">
                شينوبي
              </div>
            )}
          </div>

          <div className={isCompactLandscape ? 'w-32 sm:w-40' : 'w-36 sm:w-48 md:w-52'}>
            <div className="flex items-center justify-between gap-1.5 text-[11px] sm:text-xs font-black">
              <span className="truncate text-white">{activeName}</span>
              <span className="font-mono-num text-[10px] sm:text-[11px] font-bold text-slate-200 shrink-0">
                {hud.hp}/{hud.maxHp}
              </span>
            </div>

            {/* Clean Rounded Crimson-Rose HP Bar */}
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#1a1f2e]">
              <div
                className="h-full rounded-full bg-gradient-to-l from-red-500 via-rose-500 to-pink-500 transition-[width] duration-150"
                style={{ width: `${hpPct}%` }}
              />
            </div>

            {/* Clean Rounded Cyan-Blue Chakra Bar + Value */}
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1a1f2e]">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-cyan-300 via-sky-400 to-indigo-500 transition-[width] duration-100"
                  style={{ width: `${chakraPct}%` }}
                />
              </div>
              <span className="font-mono-num text-[10px] sm:text-[11px] font-bold text-sky-400 min-w-[20px] text-left">
                {hud.chakra}
              </span>
            </div>

            {(hud.kamuiActive || hud.gedoMazoActive || hud.susanooActive) && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold leading-none">
                {hud.kamuiActive && (
                  <span className="text-purple-300">
                    {hud.kamuiIntangible ? 'كاموي غير ملموس' : 'كاموي'} ·{' '}
                    <span className="font-mono-num">{hud.kamuiRemaining}ث</span>
                  </span>
                )}
                {hud.gedoMazoActive && (
                  <span className="text-fuchsia-300">
                    غيدو مازو · <span className="font-mono-num">{hud.gedoMazoRemaining}ث</span>
                  </span>
                )}
                {hud.susanooActive && (
                  <span
                    className={
                      hud.isItachi
                        ? 'text-orange-400'
                        : hud.susanooStage === 'perfect'
                          ? 'text-sky-300'
                          : 'text-blue-400'
                    }
                  >
                    {hud.susanooStage === 'ribcage'
                      ? 'سوسانو الأضلاع'
                      : hud.susanooStage === 'perfect'
                        ? 'السوسانو الكامل'
                        : hud.susanooStage === 'muscular'
                          ? 'السوسانو الشيطاني'
                          : 'السوسانو الهيكلي'}{' '}
                    · <span className="font-mono-num">{hud.susanooRemaining}ث</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* TOP-CENTER WAVE · SCORE · COMBO PILL + TARGET BAR */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 sm:gap-3 rounded-full border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md px-3 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-sm shadow-[0_8px_22px_rgba(0,0,0,0.52)]">
            <div className="whitespace-nowrap">
              <span className="text-slate-300">موجة </span>
              <span className="font-mono-num font-black text-white">
                {hud.wave}/{hud.maxWaves}
              </span>
            </div>
            <span className="text-slate-500" aria-hidden="true">
              ·
            </span>
            <div className="whitespace-nowrap">
              <span className="text-slate-300">نقاط </span>
              <span className="font-mono-num font-black text-amber-400">{hud.score}</span>
            </div>
            {hud.combo > 1 && (
              <>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <div className="whitespace-nowrap font-black text-orange-400">
                  <span className="font-mono-num">{hud.combo}</span>× كومبو
                </div>
              </>
            )}
          </div>

          {hud.activeTarget && (
            <div className="w-40 sm:w-48 rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md px-3 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.52)]">
              <div className="flex items-center justify-between gap-1.5 text-[10.5px] sm:text-xs">
                <span className="truncate font-extrabold text-white">
                  {hud.activeTarget.nameAr}
                </span>
                <span className="font-mono-num text-[10.5px] text-slate-200 shrink-0">
                  {hud.activeTarget.hp}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#1a1f2e]">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-[width] duration-150"
                  style={{ width: `${targetHpPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* TOP-LEFT 5 UTILITY BUTTONS ROW */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            title="إعدادات الأداء والرسوميات"
            aria-label="إعدادات الأداء والرسوميات"
            className={`flex ${
              isCompactLandscape ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
            } items-center justify-center rounded-xl border backdrop-blur-md transition-colors cursor-pointer ${
              settingsOpen
                ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                : 'border-white/15 bg-[#0a0e18]/72 text-slate-200 hover:border-amber-400/60'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onResetCamera}
            title="إعادة ضبط الكاميرا"
            aria-label="إعادة ضبط الكاميرا"
            className={`flex ${
              isCompactLandscape ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
            } items-center justify-center rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md text-slate-200 hover:border-white/35 cursor-pointer`}
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
            aria-label={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
            className={`hidden min-[440px]:flex ${
              isCompactLandscape ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
            } items-center justify-center rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md text-slate-200 hover:border-white/35 cursor-pointer`}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className={`hidden min-[440px]:flex ${
              isCompactLandscape ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
            } items-center justify-center rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md text-slate-200 hover:border-white/35 cursor-pointer`}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            title="إيقاف مؤقت"
            aria-label="إيقاف مؤقت"
            className={`flex ${
              isCompactLandscape ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10'
            } items-center justify-center rounded-xl border border-white/15 bg-[#0a0e18]/72 backdrop-blur-md text-slate-200 hover:border-red-500/60 cursor-pointer`}
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live In-HUD Performance & Graphics Settings Panel */}
      {settingsOpen && hud.phase === 'playing' && (
        <div
          dir="rtl"
          className={`pointer-events-auto fixed left-3 right-3 z-30 mx-auto w-auto max-w-sm max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-xl border border-amber-400/35 bg-[#0b0e18]/97 shadow-2xl sm:left-auto sm:right-6 sm:mx-0 sm:w-80 ${
            isCompactLandscape ? 'top-12 p-3' : 'top-16 p-4'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-black text-white">إعدادات الرسوميات والأداء</h3>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="إغلاق الإعدادات"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#151a28] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3.5 space-y-3.5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-200">
                  <SunMedium className="h-3.5 w-3.5 text-amber-400" />
                  <span>جودة الظلال</span>
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {SHADOW_OPTIONS.map((opt) => {
                  const active = shadowQuality === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeShadowQuality(opt.id)}
                      className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1 py-1 text-center transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-white/10 bg-[#141926] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold leading-tight">{opt.labelAr}</span>
                      <span className="font-mono-num text-[9px] text-slate-400">{opt.hintAr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>كثافة الجزيئات</span>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PARTICLE_OPTIONS.map((opt) => {
                  const active = particleDensity === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeParticleDensity(opt.id)}
                      className={`flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-[#141926] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className="text-xs font-extrabold leading-tight">{opt.labelAr}</span>
                      <span className="font-mono-num text-[10px] text-slate-400">{opt.hintAr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="rounded-lg border border-white/8 bg-[#121622] px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
              تعمل اللعبة افتراضياً بأعلى جودة رسومية (<strong className="text-slate-200">ظلال 2048 وجزيئات 100%</strong>) مع ضبط تلقائي ذكي يوازن الإطارات تلقائياً لمنع التهنيج على الموبايل.
            </p>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MOBILE / TOUCH CONTROLS (EXACT SCREENSHOT LAYOUT)                 */}
      {/* ================================================================= */}
      {hud.finisherActive ? (
        <div />
      ) : useTouchControls ? (
        <div dir="ltr" className="relative flex items-end justify-between gap-2 pt-1">
          {/* Left Thumb: Red Concentric Joystick */}
          <div className="flex flex-col items-center pb-0.5 pl-0.5 shrink-0">
            <MobileJoystick onMove={onVirtualMove} compact={isCompactLandscape} />
          </div>

          {/* Center Tactical Actions (Defense, Gravity Columns, Chakra Dash, Ultimate Finisher) */}
          <div className="pointer-events-auto z-20 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pb-1.5">
            {/* Guard / Defense Button */}
            <button
              type="button"
              aria-label="دفاع"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!hud.guardBroken) onSetGuarding(true);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSetGuarding(false);
              }}
              onPointerLeave={() => {
                if (hud.isGuarding) onSetGuarding(false);
              }}
              onPointerCancel={() => {
                if (hud.isGuarding) onSetGuarding(false);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!hud.guardBroken) onSetGuarding(!hud.isGuarding);
              }}
              disabled={hud.guardBroken}
              style={{ touchAction: 'none' }}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-full border-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-black transition-all duration-100 active:scale-90 select-none ${
                hud.isGuarding
                  ? 'border-emerald-300 bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 text-white shadow-[0_0_22px_rgba(52,211,153,0.85)] scale-95'
                  : hud.guardBroken
                    ? 'border-red-500/40 bg-[#12080a]/85 text-red-400 cursor-not-allowed'
                    : 'border-emerald-500/70 bg-[#071612]/85 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] hover:border-emerald-400'
              }`}
            >
              <Shield className={`h-3.5 w-3.5 shrink-0 ${hud.isGuarding ? 'animate-pulse text-emerald-100' : 'text-emerald-400'}`} />
              <span>{hud.guardBroken ? 'مكسور' : hud.isGuarding ? 'صد' : 'دفاع'}</span>
              <span className="font-mono-num text-[9px] sm:text-[10px] text-emerald-200/80">
                {Math.round(hud.guardGauge)}%
              </span>
            </button>

            {/* Obito / Tobi v2 / Madara Rikudo Special: Gravity Columns Drop */}
            {hud.isObitoOrTobi && (
              <button
                type="button"
                aria-label="أعمدة الجاذبية"
                disabled={hud.obitoGazeCooldown > 0}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (hud.obitoGazeCooldown <= 0) onTriggerObitoGaze();
                }}
                style={{ touchAction: 'none' }}
                className={`flex items-center gap-1 sm:gap-1.5 rounded-full border-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-black transition-all duration-100 active:scale-90 select-none ${
                  hud.obitoGazeCooldown <= 0
                    ? 'border-purple-300 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-900 text-white shadow-[0_0_20px_rgba(168,85,247,0.75)]'
                    : 'border-white/15 bg-[#0e0a18]/85 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Eye className="h-3.5 w-3.5 shrink-0 text-purple-300" />
                <span>
                  {hud.obitoGazeCooldown > 0
                    ? `${hud.obitoGazeCooldown.toFixed(1)}ث`
                    : 'الأعمدة'}
                </span>
              </button>
            )}

            {/* Chakra Dash Button */}
            <button
              type="button"
              aria-label="اندفاع التشاكرا"
              disabled={hud.chakraDashCooldown > 0 || hud.chakra < 14}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hud.chakraDashCooldown <= 0 && hud.chakra >= 14) onTriggerChakraDash();
              }}
              style={{ touchAction: 'none' }}
              className={`flex items-center gap-1 rounded-full border-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-black transition-all duration-100 active:scale-90 select-none ${
                hud.chakraDashCooldown <= 0 && hud.chakra >= 14
                  ? 'border-cyan-400 bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-800 text-white shadow-[0_0_16px_rgba(56,189,248,0.55)]'
                  : 'border-white/15 bg-[#0a0e18]/85 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
              <span>
                {hud.chakraDashCooldown > 0
                  ? `${hud.chakraDashCooldown.toFixed(1)}ث`
                  : 'اندفاع'}
              </span>
            </button>

            {/* Manual Ultimate Finisher Trigger */}
            <button
              type="button"
              aria-label="الضربة القاضية"
              disabled={!hud.finisherReady}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hud.finisherReady) onTriggerFinisher();
              }}
              style={{ touchAction: 'none' }}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-full border-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-black transition-all duration-100 active:scale-90 select-none ${
                hud.finisherReady
                  ? 'border-amber-300 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 text-white shadow-[0_0_22px_rgba(245,158,11,0.75)]'
                  : 'border-white/15 bg-[#0a0e18]/85 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-200" />
              <span>
                {hud.finisherCooldown > 0
                  ? `${hud.finisherCooldown.toFixed(1)}ث`
                  : 'القاضية'}
              </span>
            </button>
          </div>

          {/* Right Thumb: Attack + Jump + Character Jutsu Radial Fan */}
          <div
            className="pointer-events-none relative shrink-0 select-none"
            style={{ width: `${arcContainerW}px`, height: `${arcContainerH}px` }}
          >
            {/* Jutsu Buttons */}
            {mobileJutsus.map((jutsu, idx) => {
              const slot = arcSlots[idx];
              if (!slot) return null;

              const cd = hud.cooldowns[jutsu.id] || 0;
              const cdRatio = Math.min(1, cd / (jutsu.cooldownSec || 1));
              const lackChakra = hud.chakra < jutsu.chakraCost;
              const alreadySummoned =
                (jutsu.id === 'gedo' && hud.gedoMazoActive) ||
                (jutsu.id === 'susanoo' && hud.susanooActive) ||
                (jutsu.id === 'susanoo_ribcage' && hud.susanooStage === 'ribcage') ||
                (jutsu.id === 'susanoo_armored' && hud.susanooStage === 'armored') ||
                (jutsu.id === 'susanoo_muscular' && hud.susanooStage === 'muscular') ||
                (jutsu.id === 'susanoo_perfect' && hud.susanooStage === 'perfect');
              const disabled = cd > 0 || lackChakra || alreadySummoned;
              const shortLabel = getShortJutsuLabel(
                jutsu.id,
                hud.isKakashi,
                hud.isItachi,
                jutsu.nameAr
              );

              const svgRadius = 21;
              const svgCirc = 2 * Math.PI * svgRadius;
              const svgOffset = svgCirc * (1 - cdRatio);

              const accentHex =
                hud.isItachi &&
                (jutsu.id === 'susanoo_ribcage' ||
                  jutsu.id === 'susanoo_armored' ||
                  jutsu.id === 'susanoo_muscular')
                  ? jutsu.id === 'susanoo_muscular'
                    ? '#dc2626'
                    : '#f97316'
                  : jutsu.accentHex;

              return (
                <button
                  key={jutsu.id}
                  type="button"
                  aria-label={jutsu.nameAr}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!disabled) onTriggerJutsu(jutsu.id);
                  }}
                  disabled={disabled}
                  style={{
                    touchAction: 'none',
                    width: `${slot.size}px`,
                    height: `${slot.size}px`,
                    right: `${slot.right - slot.size / 2}px`,
                    bottom: `${slot.bottom - slot.size / 2}px`,
                    background: disabled
                      ? 'rgba(10, 14, 24, 0.86)'
                      : `radial-gradient(circle at 50% 42%, ${accentHex}36 0%, rgba(10, 14, 26, 0.88) 74%)`,
                    borderColor: cd > 0
                      ? 'rgba(255,255,255,0.18)'
                      : lackChakra || alreadySummoned
                        ? 'rgba(255,255,255,0.16)'
                        : accentHex,
                    boxShadow: disabled
                      ? '0 4px 12px rgba(0,0,0,0.48)'
                      : `0 0 22px ${accentHex}88, 0 0 8px ${accentHex}55, inset 0 0 12px ${accentHex}38, 0 6px 16px rgba(0,0,0,0.72)`,
                  }}
                  className={`pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border-2 backdrop-blur-sm transition-transform duration-100 active:scale-90 select-none ${
                    disabled
                      ? 'text-slate-400'
                      : 'text-white'
                  }`}
                >
                  {cd > 0 && (
                    <svg
                      viewBox="0 0 48 48"
                      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
                      style={{ filter: `drop-shadow(0 0 5px ${accentHex})` }}
                      aria-hidden="true"
                    >
                      <circle
                        cx="24"
                        cy="24"
                        r={svgRadius}
                        fill="rgba(5,7,14,0.72)"
                        stroke={accentHex}
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeDasharray={svgCirc}
                        strokeDashoffset={svgOffset}
                      />
                    </svg>
                  )}

                  {cd > 0 ? (
                    <span
                      className={`relative z-10 font-mono-num font-bold text-white leading-none ${
                        isCompactLandscape ? 'text-[10px]' : 'text-[11px]'
                      }`}
                    >
                      {cd.toFixed(1)}
                    </span>
                  ) : (
                    <>
                      <span
                        className="relative z-10"
                        style={{
                          color: disabled ? '#64748b' : accentHex,
                          filter: disabled ? 'none' : `drop-shadow(0 0 6px ${accentHex})`,
                        }}
                      >
                        <JutsuIcon
                          id={jutsu.id}
                          className={isCompactLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4'}
                        />
                      </span>
                      <span
                        className={`relative z-10 mt-0.5 font-extrabold leading-none tracking-tight text-white ${
                          isCompactLandscape ? 'text-[7.5px]' : 'text-[8.5px]'
                        }`}
                      >
                        {shortLabel}
                      </span>
                    </>
                  )}
                </button>
              );
            })}

            {/* Jump Button (Top-Right Edge Above Attack) */}
            <button
              type="button"
              aria-label="قفز"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTriggerJump();
              }}
              style={{
                touchAction: 'none',
                width: `${s(44)}px`,
                height: `${s(44)}px`,
                right: `${s(26) - s(22)}px`,
                bottom: `${s(112) - s(22)}px`,
              }}
              className="pointer-events-auto absolute flex flex-col items-center justify-center rounded-full border border-sky-400/65 bg-[#0b1322]/78 backdrop-blur-sm text-white shadow-[0_0_14px_rgba(56,189,248,0.34),0_5px_14px_rgba(0,0,0,0.65)] transition-transform duration-100 select-none active:scale-90"
            >
              <ArrowUp className={`${isCompactLandscape ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-sky-300`} />
              <span className={`${isCompactLandscape ? 'text-[7.5px]' : 'text-[8.5px]'} font-extrabold leading-none`}>
                قفز
              </span>
            </button>

            {/* Primary Crimson Attack Button */}
            {(() => {
              const meleeMeta = OBITO_JUTSU_LIST[0];
              const meleeCd = hud.cooldowns.melee || 0;
              const meleeRatio = Math.min(1, meleeCd / (meleeMeta?.cooldownSec || 0.35));
              const radius = 31;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset = circumference * (1 - meleeRatio);

              return (
                <button
                  type="button"
                  aria-label="هجوم"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTriggerJutsu('melee');
                  }}
                  style={{
                    touchAction: 'none',
                    width: `${attackSize}px`,
                    height: `${attackSize}px`,
                    right: `${s(40) - attackSize / 2}px`,
                    bottom: `${s(40) - attackSize / 2}px`,
                  }}
                  className={`pointer-events-auto absolute flex flex-col items-center justify-center gap-0.5 rounded-full border-2 text-white transition-transform duration-100 active:scale-90 select-none ${
                    meleeCd > 0
                      ? 'border-sky-300/85 bg-[#1a1120]/92 shadow-[0_0_18px_rgba(56,189,248,0.45),0_6px_18px_rgba(0,0,0,0.65)]'
                      : 'border-amber-300/95 bg-gradient-to-b from-red-500 via-red-600 to-rose-800 shadow-[0_0_28px_rgba(239,68,68,0.78),0_0_12px_rgba(251,191,36,0.45),0_6px_18px_rgba(0,0,0,0.72)]'
                  }`}
                >
                  {meleeCd > 0 && (
                    <svg
                      viewBox="0 0 68 68"
                      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
                      aria-hidden="true"
                    >
                      <circle
                        cx="34"
                        cy="34"
                        r={radius}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                      />
                    </svg>
                  )}

                  <Swords
                    className={`relative z-10 ${isCompactLandscape ? 'h-5 w-5' : 'h-6 w-6'} text-white drop-shadow`}
                  />
                  <span
                    className={`relative z-10 ${isCompactLandscape ? 'text-[9.5px]' : 'text-[11px]'} font-black leading-none tracking-tight`}
                  >
                    هجوم
                  </span>
                </button>
              );
            })()}
          </div>
        </div>
      ) : (
        /* =============================================================== */
        /* DESKTOP ACTION BAR                                              */
        /* =============================================================== */
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/15 bg-[#0a0d16]/92 px-3.5 py-1 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>إظهار أزرار المهارات</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>إخفاء المهارات (H)</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#0a0d16]/92 p-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.68)]">
              <button
                type="button"
                onClick={onTriggerJump}
                className="flex flex-col items-center justify-center rounded-xl border border-sky-400/50 bg-[#101829] px-3 py-2 text-xs font-extrabold text-sky-200 hover:border-sky-300 cursor-pointer"
              >
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3.5 w-3.5" />
                  <span>قفز</span>
                </span>
                <span className="mt-1 font-mono-num text-[10px] text-slate-400">Space</span>
              </button>

              <button
                type="button"
                onMouseDown={() => onSetGuarding(true)}
                onMouseUp={() => onSetGuarding(false)}
                onMouseLeave={() => {
                  if (hud.isGuarding) onSetGuarding(false);
                }}
                onClick={() => onSetGuarding(!hud.isGuarding)}
                disabled={hud.guardBroken}
                title="الدفاع وصد الضربات (F) — اضغط مطولاً أو انقر للتبديل"
                className={`relative flex flex-col items-center justify-center rounded-xl border px-3 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                  hud.isGuarding
                    ? 'border-emerald-400 bg-emerald-950/70 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.55)] scale-95'
                    : hud.guardBroken
                      ? 'border-red-500/50 bg-red-950/30 text-red-400 cursor-not-allowed'
                      : 'border-emerald-500/60 bg-[#101c24] text-emerald-200 hover:border-emerald-400 hover:bg-emerald-950/40'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Shield
                    className={`h-3.5 w-3.5 ${
                      hud.isGuarding ? 'text-emerald-300 animate-pulse' : 'text-emerald-400'
                    }`}
                  />
                  <span>دفاع</span>
                </span>
                <span className="mt-1 font-mono-num text-[10px] text-emerald-300/80">
                  {hud.guardBroken ? 'مكسور' : `${Math.round(hud.guardGauge)}% · F`}
                </span>
              </button>

              <button
                type="button"
                onClick={onTriggerChakraDash}
                disabled={hud.chakraDashCooldown > 0 || hud.chakra < 14}
                title="اندفاع التشاكرا السريع نحو الخصم (Q)"
                className={`relative flex flex-col items-center justify-center rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                  hud.chakraDashCooldown <= 0 && hud.chakra >= 14
                    ? 'border-cyan-400/75 bg-cyan-950/40 text-cyan-200 hover:border-cyan-300 shadow-[0_0_14px_rgba(56,189,248,0.25)]'
                    : 'border-white/10 bg-[#101829] text-slate-500 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-cyan-300" />
                  <span>اندفاع</span>
                </span>
                <span className="mt-1 font-mono-num text-[10px] text-cyan-300/80">
                  {hud.chakraDashCooldown > 0 ? `${hud.chakraDashCooldown.toFixed(1)}ث` : 'Q'}
                </span>
              </button>

              <button
                type="button"
                onClick={onTriggerFinisher}
                disabled={!hud.finisherReady}
                title="تنفيذ المشهد القاضي السينمائي على العدو"
                className={`relative flex min-w-[118px] flex-col items-start overflow-hidden rounded-xl border px-3 py-2 text-right transition-colors ${
                  hud.finisherReady
                    ? 'border-amber-400/85 bg-gradient-to-br from-amber-600/35 to-red-700/35 text-white hover:border-amber-300 cursor-pointer shadow-[0_0_16px_rgba(245,158,11,0.32)]'
                    : 'border-white/10 bg-[#111522] text-slate-500 cursor-not-allowed'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-extrabold whitespace-nowrap">الضربة القاضية</span>
                  <Sparkles className={`h-3.5 w-3.5 ${hud.finisherReady ? 'text-amber-300' : 'text-slate-500'}`} />
                </div>
                <div className="mt-1 flex w-full items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono-num text-amber-200/80">
                    {hud.finisherCooldown > 0 ? `${hud.finisherCooldown.toFixed(1)}ث` : 'V'}
                  </span>
                  <span className="text-[10px] font-bold text-amber-300/90">سينمائي</span>
                </div>
              </button>

              {hud.isObitoOrTobi && (
                <button
                  type="button"
                  onClick={onTriggerObitoGaze}
                  disabled={hud.obitoGazeCooldown > 0}
                  title="مهارة أوبيتو الخاصة: إسقاط الأعمدة الحجرية بالجاذبية"
                  className={`relative flex min-w-[124px] flex-col items-start overflow-hidden rounded-xl border px-3 py-2 text-right transition-colors ${
                    hud.obitoGazeCooldown <= 0
                      ? 'border-purple-400/85 bg-gradient-to-br from-purple-700/35 to-indigo-900/35 text-white hover:border-purple-300 cursor-pointer shadow-[0_0_16px_rgba(168,85,247,0.32)]'
                      : 'border-white/10 bg-[#111522] text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-extrabold whitespace-nowrap">أعمدة الجاذبية</span>
                    <Eye className={`h-3.5 w-3.5 ${hud.obitoGazeCooldown <= 0 ? 'text-purple-300' : 'text-slate-500'}`} />
                  </div>
                  <div className="mt-1 flex w-full items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono-num text-purple-200/80">
                      {hud.obitoGazeCooldown > 0 ? `${hud.obitoGazeCooldown.toFixed(1)}ث` : 'B'}
                    </span>
                    <span className="text-[10px] font-bold text-purple-300/90">أوبيتو</span>
                  </div>
                </button>
              )}

              {activeSkills.map((jutsu) => {
                const cd = hud.cooldowns[jutsu.id] || 0;
                const lackChakra = hud.chakra < jutsu.chakraCost;
                const alreadySummoned =
                  (jutsu.id === 'gedo' && hud.gedoMazoActive) ||
                  (jutsu.id === 'susanoo' && hud.susanooActive) ||
                  (jutsu.id === 'susanoo_ribcage' && hud.susanooStage === 'ribcage') ||
                  (jutsu.id === 'susanoo_armored' && hud.susanooStage === 'armored') ||
                  (jutsu.id === 'susanoo_muscular' && hud.susanooStage === 'muscular') ||
                  (jutsu.id === 'susanoo_perfect' && hud.susanooStage === 'perfect');
                const disabled = cd > 0 || lackChakra || alreadySummoned;
                const cdPct = Math.min(100, (cd / jutsu.cooldownSec) * 100);
                const accentHex =
                  hud.isItachi &&
                  (jutsu.id === 'susanoo_ribcage' ||
                    jutsu.id === 'susanoo_armored' ||
                    jutsu.id === 'susanoo_muscular')
                    ? jutsu.id === 'susanoo_muscular'
                      ? '#dc2626'
                      : '#f97316'
                    : jutsu.accentHex;

                return (
                  <button
                    key={jutsu.id}
                    type="button"
                    onClick={() => onTriggerJutsu(jutsu.id)}
                    disabled={disabled}
                    title={jutsu.descriptionAr}
                    className={`relative flex min-w-[116px] flex-col items-start overflow-hidden rounded-xl border px-3 py-2 text-right transition-colors cursor-pointer ${
                      disabled
                        ? 'border-white/8 bg-[#111522] text-slate-500 cursor-not-allowed'
                        : 'border-white/15 bg-[#151a2a] text-white hover:border-amber-400/75'
                    }`}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
                      style={{
                        backgroundColor: disabled ? 'rgba(148,163,184,0.2)' : accentHex,
                      }}
                    />

                    {cd > 0 && (
                      <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60"
                        style={{ height: `${cdPct}%` }}
                      />
                    )}

                    <div className="relative z-10 flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-extrabold whitespace-nowrap">
                        {jutsu.nameAr}
                      </span>
                      <span
                        className="shrink-0"
                        style={{ color: disabled ? '#64748b' : accentHex }}
                      >
                        <JutsuIcon id={jutsu.id} className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    <div className="relative z-10 mt-1 flex w-full items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono-num text-slate-400">
                        {cd > 0 ? `${cd.toFixed(1)}ث` : jutsu.keyLabel}
                      </span>
                      {jutsu.chakraCost > 0 && (
                        <span className="font-mono-num text-sky-400">
                          {jutsu.chakraCost} شاكرا
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* PAUSE / VICTORY / DEFEAT MODAL                                    */}
      {/* ================================================================= */}
      {(hud.phase === 'paused' || hud.phase === 'victory' || hud.phase === 'defeat') && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-amber-500/35 bg-[#0d1018] p-5 text-center shadow-2xl">
            {hud.phase === 'victory' && (
              <div className="mb-1.5 bg-gradient-to-b from-white via-amber-300 to-amber-500 bg-clip-text text-4xl font-black tracking-[0.16em] text-transparent">
                VICTORY
              </div>
            )}
            <h2 className="text-2xl font-black text-white">
              {hud.phase === 'paused' && 'اللعبة متوقفة مؤقتاً'}
              {hud.phase === 'victory' && 'انتصار ساحق!'}
              {hud.phase === 'defeat' && 'سقوط في ساحة المعركة'}
            </h2>

            <p className="mt-1.5 text-sm text-slate-300">
              {hud.phase === 'paused' && 'استرح قليلاً أو اضبط إعدادات الرسوميات ثم عد للقتال.'}
              {hud.phase === 'victory' && `أتممت جميع الموجات بنجاح! مجموع نقاطك: ${hud.score}`}
              {hud.phase === 'defeat' && `وصلت إلى الموجة ${hud.wave} وحققت ${hud.score} نقطة.`}
            </p>

            {hud.phase === 'paused' && (
              <div className="mt-4 space-y-3 text-right">
                <div className="rounded-lg border border-amber-400/20 bg-[#121521] p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Settings className="h-3.5 w-3.5" />
                    <span>إعدادات الرسوميات (أعلى جرافيك + ضبط ذكي)</span>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-slate-300">جودة الظلال</div>
                      <div className="grid grid-cols-4 gap-1">
                        {SHADOW_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChangeShadowQuality(opt.id)}
                            className={`min-h-[36px] rounded-md border px-1 text-[10px] font-bold transition-colors cursor-pointer ${
                              shadowQuality === opt.id
                                ? 'border-amber-400 bg-amber-500/20 text-white'
                                : 'border-white/10 bg-[#161a29] text-slate-300 hover:border-white/25'
                            }`}
                          >
                            {opt.labelAr}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-slate-300">كثافة الجزيئات</div>
                      <div className="grid grid-cols-3 gap-1">
                        {PARTICLE_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChangeParticleDensity(opt.id)}
                            className={`min-h-[36px] rounded-md border px-1 text-[10px] font-bold transition-colors cursor-pointer ${
                              particleDensity === opt.id
                                ? 'border-sky-400 bg-sky-500/20 text-white'
                                : 'border-white/10 bg-[#161a29] text-slate-300 hover:border-white/25'
                            }`}
                          >
                            {opt.labelAr}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#121521] p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <MapPin className="h-3.5 w-3.5 text-sky-400" />
                    <span>تغيير المكان</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ARENA_STAGES.map((stage) => {
                      const isSelected = selectedStage === stage.id;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => onSelectStage(stage.id)}
                          className={`flex min-h-[38px] items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-center transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-[#161a29] text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {stage.id === 'amegakure' ? (
                            <CloudRain className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                          ) : stage.id === 'konoha' ? (
                            <Trees className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5 text-indigo-300 shrink-0" />
                          )}
                          <span className="text-[10px] font-bold truncate">{stage.nameAr}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#121521] p-3">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-red-400" />
                      <span>تغيير الشخصية</span>
                    </span>
                    {switchingCharacter && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>تحميل...</span>
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto">
                    {CHARACTER_PRESETS.map((preset) => {
                      const isSelected = selectedCharacterId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => void onSelectCharacterPreset(preset)}
                          className={`flex min-h-[36px] flex-col items-center justify-center rounded-md border px-1.5 py-1 text-center transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-red-500 bg-red-600/20 text-white'
                              : 'border-white/10 bg-[#161a29] text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate max-w-full">
                            {preset.nameAr}
                          </span>
                        </button>
                      );
                    })}
                    {savedCharacters.map((saved) => {
                      const isSelected = selectedCharacterId === saved.id;
                      return (
                        <button
                          key={saved.id}
                          type="button"
                          onClick={() => void onSelectSavedCharacter(saved)}
                          className={`flex min-h-[36px] flex-col items-center justify-center rounded-md border px-1.5 py-1 text-center transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-red-500 bg-red-600/20 text-white'
                              : 'border-white/10 bg-[#161a29] text-emerald-200 hover:border-white/25'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate max-w-full">
                            {saved.nameAr}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {characterError && (
                    <p className="mt-1.5 text-[11px] text-red-300">{characterError}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              {hud.phase === 'paused' && (
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 px-4 py-2.5 text-sm font-bold text-white hover:from-orange-500 hover:to-red-500 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>متابعة القتال</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRestart}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#191e2e] border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:border-red-400/60 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>إعادة المعركة</span>
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                className="sm:hidden flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                <span>{muted ? 'تشغيل الصوت' : 'كتم الصوت'}</span>
              </button>

              <PWAInstallButton variant="menu" />

              <button
                type="button"
                onClick={onReturnTitle}
                className="min-h-[44px] w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-white cursor-pointer"
              >
                العودة لاختيار الشخصيات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
