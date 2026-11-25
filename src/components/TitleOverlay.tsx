import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudRain,
  Download,
  Eye,
  FlipVertical2,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  Music,
  Palette,
  RotateCcw,
  ScrollText,
  Shuffle,
  Swords,
  Trash2,
  Trees,
  Upload,
  UserPlus,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

import {
  ARENA_STAGES,
  ArenaStageId,
  CHARACTER_PRESETS,
  CharacterPreset,
  CharacterPresetId,
  GameMode,
  OBITO_PORTRAIT_URL,
  STORM4_FEATURED_IDS,
} from '../types/game';
import { soundEngine, BATTLE_MUSIC_TRACKS } from '../audio/soundEngine';
import {
  classifyDeidaraTextureFilename,
  DeidaraTextureSlot,
  ObitoEyeSide,
  SavedCustomCharacter,
  SavedCustomStage,
  SavedDeidaraTextures,
  SavedObitoEyes,
} from '../utils/characterStorage';
import { DeidaraMeshDiagnostic } from '../three/models/deidaraTexturer';
import { shouldApplyWarObitoPalette } from '../three/models/warObitoColorizer';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleOverlayProps {
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  selectedStage: ArenaStageId;
  onSelectStage: (stage: ArenaStageId) => void;
  onStart: (mode: GameMode, comPresetId?: string) => void;
  onBackToStartScreen: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  customModelLoaded: boolean;
  selectedCharacterId: CharacterPresetId;
  selectedComId: string;
  onSelectComCharacter: (presetId: string) => void;
  savedCharacters: SavedCustomCharacter[];
  switchingCharacter: boolean;
  characterError: string | null;
  onSelectCharacterPreset: (preset: CharacterPreset) => Promise<void>;
  onSelectSavedCharacter: (saved: SavedCustomCharacter) => Promise<void>;
  onToggleSavedCharacterPalette: (saved: SavedCustomCharacter) => Promise<void>;
  onDeleteSavedCharacter: (id: string) => Promise<void>;
  onLoadCustomModel: (source: string | File) => Promise<void>;
  onResetCustomModel: () => void;
  hasCustomDeidara?: boolean;
  onReplaceDeidaraModel?: (file: File) => Promise<void>;
  onResetDeidaraModel?: () => Promise<void>;
  deidaraTextures?: SavedDeidaraTextures | null;
  deidaraMeshParts?: DeidaraMeshDiagnostic[];
  onSaveDeidaraTextures?: (updates: Partial<Record<DeidaraTextureSlot, File>>) => Promise<void>;
  onToggleDeidaraFlipY?: () => Promise<void>;
  onToggleDeidaraSlotFlipY?: (slot: DeidaraTextureSlot) => Promise<void>;
  onSetDeidaraMeshSlot?: (meshKey: string, slot: DeidaraTextureSlot) => Promise<void>;
  onClearDeidaraTextures?: () => Promise<void>;
  deidaraPublishState?: 'idle' | 'publishing' | 'published' | 'error';
  publishedApkSizeBytes?: number;
  onPublishDeidaraPermanent?: () => Promise<void>;
  obitoEyes?: SavedObitoEyes | null;
  onSaveObitoEyes?: (updates: Partial<Record<ObitoEyeSide, File>>) => Promise<void>;
  onClearObitoEyes?: () => Promise<void>;
  savedStages?: SavedCustomStage[];
  onSaveStageFile?: (file: File) => Promise<void>;
  onSaveStageUrl?: (url: string) => Promise<void>;
  onDeleteStage?: (id: string) => Promise<void>;
  runAnimStyle?: 'new' | 'old';
  onToggleRunAnimStyle?: () => void;
}


const DEIDARA_TEXTURE_SLOT_META: Array<{
  slot: DeidaraTextureSlot;
  titleAr: string;
  shortAr: string;
  hintName: string;
}> = [
  { slot: 'body', titleAr: 'الجسم والشعر', shortAr: 'جسم', hintName: '2ddrbody_0.png' },
  { slot: 'mant', titleAr: 'عباءة الأكاتسوكي', shortAr: 'عباءة', hintName: '2ddrmant_0.png' },
  { slot: 'eye', titleAr: 'العين', shortAr: 'عين', hintName: '2ddreye_0.png' },
  { slot: 'tongue', titleAr: 'اللسان والفم', shortAr: 'لسان', hintName: '2ddrtongue_0.png' },
];

type SelectionStep = 'pick_1p' | 'pick_com' | 'ready';

// Authentic Naruto Storm 4 stylized fiery brushstroke VS emblem
function Storm4VsEmblem({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 220 220"
      className={`${
        compact ? 'h-20 w-20' : 'h-36 w-36 lg:h-44 lg:w-44'
      } select-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={compact ? 'stormVsFlameCompact' : 'stormVsFlameWide'}
          x1="15%"
          y1="0%"
          x2="85%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="35%" stopColor="#ef4444" />
          <stop offset="72%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
      </defs>
      <path
        d="M18 30 L56 18 L86 96 L124 22 L152 34 L88 156 L58 148 Z"
        fill={`url(#${compact ? 'stormVsFlameCompact' : 'stormVsFlameWide'})`}
        stroke="#0b0d14"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="M27 36 L52 27 L83 108 L124 31 L142 39 L84 146 L63 140 Z"
        fill="none"
        stroke="#fef08a"
        strokeOpacity="0.45"
        strokeWidth="2.5"
      />
      <path
        d="M184 56 C158 38 118 46 112 72 C106 96 132 106 154 114 C178 122 186 144 174 166 C158 194 114 204 82 188 L98 160 C118 172 142 168 148 154 C154 142 138 134 116 126 C90 116 78 96 86 70 C96 34 146 18 198 36 Z"
        fill={`url(#${compact ? 'stormVsFlameCompact' : 'stormVsFlameWide'})`}
        stroke="#0b0d14"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="M178 58 C156 44 123 50 118 72 C113 90 135 100 156 108 C176 116 182 136 171 158 C158 182 120 193 92 181"
        fill="none"
        stroke="#fffbeb"
        strokeOpacity="0.5"
        strokeWidth="2.5"
      />
    </svg>
  );
}

// Subtle locked shinobi bust silhouette for Storm 4 roster grid
function LockedShinobiSilhouette({ variant, prefix }: { variant: number; prefix: string }) {
  const hairVariant = variant % 4;
  const gradId = `${prefix}LockBg${variant}`;
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full opacity-55" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3248" />
          <stop offset="100%" stopColor="#0d1724" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill={`url(#${gradId})`} />
      <path d="M8 48 C10 37 16 33 24 33 C32 33 38 37 40 48 Z" fill="#09101a" />
      <ellipse cx="24" cy="22" rx="9" ry="10.5" fill="#0a121d" />
      {hairVariant === 0 && (
        <path d="M13 20 L11 11 L18 13 L23 6 L28 13 L36 10 L35 20 Z" fill="#070d16" />
      )}
      {hairVariant === 1 && (
        <path d="M12 24 L10 14 L16 8 L24 6 L33 9 L38 16 L36 25 Z" fill="#070d16" />
      )}
      {hairVariant === 2 && (
        <path d="M13 21 L9 15 L15 11 L20 7 L29 7 L35 12 L39 17 L35 22 Z" fill="#070d16" />
      )}
      {hairVariant === 3 && (
        <path d="M14 23 L14 10 L24 7 L34 10 L34 23 Z" fill="#070d16" />
      )}
    </svg>
  );
}

export function TitleOverlay({
  selectedMode,
  onSelectMode,
  selectedStage,
  onSelectStage,
  onStart,
  onBackToStartScreen,
  muted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  selectedCharacterId,
  selectedComId,
  onSelectComCharacter,
  savedCharacters = [],
  switchingCharacter,
  characterError,
  onSelectCharacterPreset,
  onSelectSavedCharacter,
  onToggleSavedCharacterPalette,
  onDeleteSavedCharacter,
  onLoadCustomModel,
  hasCustomDeidara = false,
  onReplaceDeidaraModel,
  onResetDeidaraModel,
  deidaraTextures = null,
  deidaraMeshParts = [],
  onSaveDeidaraTextures,
  onToggleDeidaraFlipY,
  onToggleDeidaraSlotFlipY,
  onSetDeidaraMeshSlot,
  onClearDeidaraTextures,
  deidaraPublishState = 'idle',
  publishedApkSizeBytes = 0,
  onPublishDeidaraPermanent,
  obitoEyes = null,
  onSaveObitoEyes,
  onClearObitoEyes,
  savedStages = [],
  onSaveStageFile,
  onSaveStageUrl,
  onDeleteStage,
  runAnimStyle = 'new',
  onToggleRunAnimStyle,
}: TitleOverlayProps) {

  const [selectionStep, setSelectionStep] = useState<SelectionStep>('pick_1p');
  const [activeTrackIdx, setActiveTrackIdx] = useState(() => soundEngine.getActiveTrackIndex());
  const cycleMusicTrack = () => {
    const nextIdx = soundEngine.nextTrack();
    setActiveTrackIdx(nextIdx);
  };
  const [showCustomCharModal, setShowCustomCharModal] = useState(false);
  const [showCustomStageModal, setShowCustomStageModal] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customStageUrlInput, setCustomStageUrlInput] = useState('');
  const [customImportError, setCustomImportError] = useState<string | null>(null);
  const [customStageError, setCustomStageError] = useState<string | null>(null);
  const customCharFileInputRef = useRef<HTMLInputElement | null>(null);
  const stageFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStageFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onSaveStageFile) {
      setCustomStageError(null);
      try {
        await onSaveStageFile(file);
        setShowCustomStageModal(false);
      } catch {
        setCustomStageError('تعذر حفظ ملف الساحة. حاول مرة أخرى.');
      }
    }
  };

  const handleStageUrlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = customStageUrlInput.trim();
    if (!trimmed) {
      setCustomStageError('أدخل رابط الساحة أولاً.');
      return;
    }
    if (onSaveStageUrl) {
      setCustomStageError(null);
      try {
        await onSaveStageUrl(trimmed);
        setCustomStageUrlInput('');
        setShowCustomStageModal(false);
      } catch {
        setCustomStageError('تعذر تحميل الساحة من الرابط.');
      }
    }
  };
  const [showDeidaraTexturesPanel, setShowDeidaraTexturesPanel] = useState(false);
  const [showObitoEyesPanel, setShowObitoEyesPanel] = useState(false);
  const obitoRightEyeInputRef = useRef<HTMLInputElement | null>(null);
  const obitoLeftEyeInputRef = useRef<HTMLInputElement | null>(null);
  const [deidaraTexHint, setDeidaraTexHint] = useState<string | null>(null);
  const deidaraFileInputRef = useRef<HTMLInputElement | null>(null);
  const deidaraBatchTexInputRef = useRef<HTMLInputElement | null>(null);
  const deidaraSlotInputRefs = useRef<Record<DeidaraTextureSlot, HTMLInputElement | null>>({
    body: null,
    mant: null,
    eye: null,
    tongue: null,
  });
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const isCompactLandscape = viewport.w > viewport.h && viewport.h <= 620;
  const isDesktopLayout = !isCompactLandscape && viewport.w >= 768;
  const desktopGridCols = viewport.w < 1080 ? 12 : 14;
  const desktopRowCount = viewport.h < 700 ? 3 : 4;
  const landscapeGridCols = viewport.w >= 780 ? 12 : 10;

  const featuredFighters = useMemo(() => {
    return STORM4_FEATURED_IDS.map((id) => CHARACTER_PRESETS.find((p) => p.id === id)).filter(
      (p): p is CharacterPreset => Boolean(p)
    );
  }, []);

  const p1Fighter = useMemo(() => {
    const savedMatch = savedCharacters.find((s) => s.id === selectedCharacterId);
    if (savedMatch) {
      return {
        id: savedMatch.id,
        nameAr: savedMatch.nameAr,
        subtitleAr: savedMatch.subtitleAr,
        glbUrl: savedMatch.url || savedMatch.fileUrl || '',
        displayNameEn: savedMatch.nameAr.toUpperCase(),
        teamNameEn: 'CUSTOM SHINOBI',
        ultimateJutsuEn: 'SHINOBI ARTS',
        portraitUrl: OBITO_PORTRAIT_URL,
      } satisfies CharacterPreset;
    }
    return (
      featuredFighters.find((f) => f.id === selectedCharacterId) ??
      CHARACTER_PRESETS.find((p) => p.id === selectedCharacterId) ??
      featuredFighters[0]
    );
  }, [featuredFighters, savedCharacters, selectedCharacterId]);

  const comFighter = useMemo(() => {
    return (
      featuredFighters.find((f) => f.id === selectedComId) ??
      CHARACTER_PRESETS.find((p) => p.id === selectedComId) ??
      featuredFighters[1]
    );
  }, [featuredFighters, selectedComId]);

  const totalRosterCount = featuredFighters.length + savedCharacters.length;
  const desktopTotalCells = desktopGridCols * desktopRowCount;
  const desktopLockedCount = Math.max(0, desktopTotalCells - totalRosterCount);
  const mobileLockedCount = Math.max(0, 15 - totalRosterCount);
  const landscapeLockedCount = Math.max(0, landscapeGridCols * 2 - totalRosterCount);

  const handleTileTap = (fighter: CharacterPreset) => {
    if (selectionStep === 'pick_1p') {
      void onSelectCharacterPreset(fighter);
      setSelectionStep('pick_com');
    } else if (selectionStep === 'pick_com') {
      onSelectComCharacter(fighter.id);
      setSelectionStep('ready');
    } else {
      void onSelectCharacterPreset(fighter);
      setSelectionStep('pick_com');
    }
  };

  const handleRandom = () => {
    if (featuredFighters.length < 2) return;
    const p1Idx = Math.floor(Math.random() * featuredFighters.length);
    let comIdx = Math.floor(Math.random() * featuredFighters.length);
    if (comIdx === p1Idx) {
      comIdx = (p1Idx + 1) % featuredFighters.length;
    }
    void onSelectCharacterPreset(featuredFighters[p1Idx]);
    onSelectComCharacter(featuredFighters[comIdx].id);
    setSelectionStep('ready');
  };

  const allStages = useMemo(() => {
    const list = [...ARENA_STAGES];
    if (savedStages) {
      for (const st of savedStages) {
        if (!list.some((l) => l.id === st.id)) {
          list.push({
            id: st.id as ArenaStageId,
            nameAr: st.nameAr,
            subtitleAr: st.subtitleAr,
          });
        }
      }
    }
    return list;
  }, [savedStages]);

  const cycleStage = () => {
    const idx = allStages.findIndex((s) => s.id === selectedStage);
    const next = allStages[(idx + 1) % allStages.length];
    onSelectStage(next.id);
  };

  const activeStageMeta = allStages.find((s) => s.id === selectedStage) ?? allStages[0];
  const isDeidaraSelected = p1Fighter?.id === 'deidara' || comFighter?.id === 'deidara';
  const uploadedDeidaraTexCount = DEIDARA_TEXTURE_SLOT_META.reduce(
    (acc, item) => (deidaraTextures?.slots[item.slot] ? acc + 1 : acc),
    0
  );

  const isObitoSelected = p1Fighter
    ? /أوبيتو|اوبيتو|توبي|obito|tobi/i.test(p1Fighter.nameAr || p1Fighter.id)
    : false;
  const uploadedObitoEyeCount = (obitoEyes?.rightEye ? 1 : 0) + (obitoEyes?.leftEye ? 1 : 0);

  const obitoRightThumbUrl = useMemo(() => {
    if (obitoEyes?.rightEye?.blob) return URL.createObjectURL(obitoEyes.rightEye.blob);
    return undefined;
  }, [obitoEyes]);

  const obitoLeftThumbUrl = useMemo(() => {
    if (obitoEyes?.leftEye?.blob) return URL.createObjectURL(obitoEyes.leftEye.blob);
    return undefined;
  }, [obitoEyes]);

  useEffect(() => {
    return () => {
      if (obitoRightThumbUrl && obitoRightThumbUrl.startsWith('blob:')) URL.revokeObjectURL(obitoRightThumbUrl);
      if (obitoLeftThumbUrl && obitoLeftThumbUrl.startsWith('blob:')) URL.revokeObjectURL(obitoLeftThumbUrl);
    };
  }, [obitoRightThumbUrl, obitoLeftThumbUrl]);

  useEffect(() => {
    if (!isDeidaraSelected) {
      setShowDeidaraTexturesPanel(false);
    }
    if (!isObitoSelected) {
      setShowObitoEyesPanel(false);
    }
  }, [isDeidaraSelected, isObitoSelected]);

  const handleObitoEyePick = (side: ObitoEyeSide, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onSaveObitoEyes) {
      void onSaveObitoEyes({ [side]: file });
    }
  };

  const deidaraThumbUrls = useMemo(() => {
    const urls: Partial<Record<DeidaraTextureSlot, string>> = {};
    if (!deidaraTextures?.slots) return urls;
    for (const { slot } of DEIDARA_TEXTURE_SLOT_META) {
      const entry = deidaraTextures.slots[slot];
      if (entry?.blob) {
        urls[slot] = URL.createObjectURL(entry.blob);
      } else if (entry?.url) {
        urls[slot] = entry.url;
      }
    }
    return urls;
  }, [deidaraTextures]);

  useEffect(() => {
    return () => {
      Object.values(deidaraThumbUrls).forEach((url) => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [deidaraThumbUrls]);

  const handleDeidaraFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onReplaceDeidaraModel) {
      void onReplaceDeidaraModel(file);
    }
  };

  const handleBatchDeidaraTexturesPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !onSaveDeidaraTextures) return;

    const matched: Partial<Record<DeidaraTextureSlot, File>> = {};
    let matchCount = 0;
    for (const file of files) {
      const slot = classifyDeidaraTextureFilename(file.name);
      if (slot) {
        matched[slot] = file;
        matchCount++;
      }
    }

    if (matchCount > 0) {
      setDeidaraTexHint(
        matchCount < files.length
          ? `تم التعرف على ${matchCount} صور وتطبيقها — باقي الصور يمكنك اختيارها في المربعات بالأسفل.`
          : null
      );
      void onSaveDeidaraTextures(matched);
    } else {
      setDeidaraTexHint(
        'لم يتطابق اسم الملفات تلقائياً (مثل 2ddrbody_0). اختر كل صورة في المربع الخاص بها بالأسفل.'
      );
    }
  };

  const handleSingleDeidaraTexturePick = (
    slot: DeidaraTextureSlot,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && onSaveDeidaraTextures) {
      setDeidaraTexHint(null);
      void onSaveDeidaraTextures({ [slot]: file });
    }
  };

  const handleCustomModelFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCustomImportError(null);
    try {
      await onLoadCustomModel(file);
      setShowCustomCharModal(false);
    } catch (err) {
      setCustomImportError(
        err instanceof Error && err.message === 'UNSUPPORTED_FORMAT'
          ? 'صيغة الملف غير مدعومة — جرب .glb أو .gltf أو .vrm أو .fbx أو .obj أو .dae أو .stl أو .ply أو .zip.'
          : 'تعذر قراءة هذا المجسم. تأكد من سلامة الملف أو وجود الألوان داخله.'
      );
    }
  };

  const handleCustomModelUrlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = customUrlInput.trim();
    if (!trimmed) {
      setCustomImportError('أدخل رابط المجسم أولاً (يدعم أي صيغة أو رابط مباشر مثل catbox).');
      return;
    }
    setCustomImportError(null);
    try {
      await onLoadCustomModel(trimmed);
      setCustomUrlInput('');
      setShowCustomCharModal(false);
    } catch {
      setCustomImportError('تعذر تحميل المجسم من الرابط. تأكد من أن الرابط مباشر ويدعم CORS.');
    }
  };

  return (
    <div
      dir="ltr"
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between overflow-hidden select-none"
    >
      <input
        ref={customCharFileInputRef}
        type="file"
        accept=".glb,.gltf,.vrm,.fbx,.obj,.dae,.stl,.ply,.zip,*"
        onChange={(e) => void handleCustomModelFilePick(e)}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={deidaraFileInputRef}
        type="file"
        accept=".glb,.gltf,.vrm,.fbx,.obj,.dae,.stl,.ply,.zip"
        onChange={handleDeidaraFilePick}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={deidaraBatchTexInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={handleBatchDeidaraTexturesPick}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={obitoRightEyeInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={(e) => handleObitoEyePick('right', e)}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={obitoLeftEyeInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={(e) => handleObitoEyePick('left', e)}
        className="hidden"
        aria-hidden="true"
      />
      {DEIDARA_TEXTURE_SLOT_META.map(({ slot }) => (
        <input
          key={`dtex-input-${slot}`}
          ref={(el) => {
            deidaraSlotInputRefs.current[slot] = el;
          }}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(e) => handleSingleDeidaraTexturePick(slot, e)}
          className="hidden"
          aria-hidden="true"
        />
      ))}
      {/* ================================================================= */}
      {/* 1. COMPACT TOP BAR (Single Row · Zero Wrap · Responsive)          */}
      {/* ================================================================= */}
      <header
        className={`pointer-events-auto relative flex shrink-0 items-center justify-between border-b-2 border-[#f59e0b]/80 bg-[#060910] px-2.5 sm:px-5 shadow-[0_4px_14px_rgba(0,0,0,0.6)] ${
          isCompactLandscape
            ? 'min-h-[36px] py-1 pt-[max(0.2rem,env(safe-area-inset-top))]'
            : 'min-h-[44px] md:min-h-[48px] py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]'
        }`}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-amber-400/55 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-amber-400/55 to-transparent"
          aria-hidden="true"
        />

        {/* Left Cluster: Title + RANDOM + Add Dropdown */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <h1
            className={`font-display italic font-black tracking-tight leading-none whitespace-nowrap ${
              isCompactLandscape ? 'text-[13px] sm:text-base' : 'text-[15px] sm:text-xl md:text-[26px]'
            }`}
            style={{
              color: '#fde047',
              textShadow:
                '0 2px 0 #78350f, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
            }}
          >
            Character Select
          </h1>

          <button
            type="button"
            onClick={handleRandom}
            title="اختيار عشوائي"
            className={`flex items-center gap-1 rounded-md border border-emerald-400/50 bg-[#111827] px-1.5 sm:px-2.5 text-[11px] sm:text-xs font-black tracking-wide text-white transition-colors hover:border-emerald-300 hover:bg-emerald-500/20 active:scale-95 cursor-pointer shrink-0 ${
              isCompactLandscape ? 'h-7' : 'h-8 md:h-9'
            }`}
          >
            <Shuffle className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
            <span className="hidden md:inline">RANDOM</span>
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAddDropdown((prev) => !prev)}
              title="إضافة شخصية أو ساحة قتال 3D"
              className={`flex items-center gap-1 rounded-lg border-2 border-amber-400 bg-gradient-to-r from-amber-600 to-amber-700 px-2 sm:px-3 text-[11px] sm:text-xs font-black text-white shadow-[0_2px_10px_rgba(245,158,11,0.4)] transition-all hover:border-yellow-300 hover:from-amber-500 hover:to-amber-600 active:scale-95 cursor-pointer ${
                isCompactLandscape ? 'h-7' : 'h-8 md:h-9'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 text-yellow-200 shrink-0" />
              <span className="whitespace-nowrap">إضافة ▾</span>
            </button>

            {showAddDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowAddDropdown(false)}
                  aria-hidden="true"
                />
                <div
                  dir="rtl"
                  className="absolute top-full left-0 mt-1.5 w-48 rounded-xl border-2 border-amber-400/80 bg-[#09111d] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.85)] z-40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDropdown(false);
                      setCustomImportError(null);
                      setShowCustomCharModal(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/25 transition-colors cursor-pointer text-right"
                  >
                    <UserPlus className="h-4 w-4 text-amber-300 shrink-0" />
                    <span>إضافة شخصية 3D</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDropdown(false);
                      setCustomStageError(null);
                      setShowCustomStageModal(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-black text-indigo-200 hover:bg-indigo-500/25 transition-colors cursor-pointer text-right border-t border-white/10 mt-1 pt-2"
                  >
                    <MapPin className="h-4 w-4 text-indigo-300 shrink-0" />
                    <span>إضافة ساحة قتال 3D</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Cluster: Stage + Run + Music + Audio/FS + BACK */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!isCompactLandscape && (
            <div className="hidden md:block">
              <PWAInstallButton variant="header" />
            </div>
          )}

          <button
            type="button"
            onClick={cycleStage}
            title="تغيير ساحة القتال"
            className={`flex items-center gap-1 rounded-md border border-sky-400/45 bg-[#0f1d2e] px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-bold text-sky-100 hover:border-sky-300 cursor-pointer ${
              isCompactLandscape ? 'h-7' : 'h-8 md:h-9'
            }`}
          >
            {selectedStage === 'amegakure' ? (
              <CloudRain className="h-3.5 w-3.5 text-sky-300 shrink-0" />
            ) : selectedStage === 'konoha' ? (
              <Trees className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
            ) : (
              <MapPin className="h-3.5 w-3.5 text-indigo-300 shrink-0" />
            )}
            <span className="max-w-[70px] sm:max-w-none truncate">{activeStageMeta.nameAr}</span>
          </button>

          {onToggleRunAnimStyle && (
            <button
              type="button"
              onClick={onToggleRunAnimStyle}
              title={
                runAnimStyle === 'new'
                  ? 'حركة الجري: جديدة (7j2k57) - انقر للعودة للجري الكلاسيكي'
                  : 'حركة الجري: كلاسيكية (توبي الأصلي) - انقر لتفعيل الجري الجديد'
              }
              className={`flex items-center gap-1 rounded-md border px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                runAnimStyle === 'new'
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-900/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                  : 'border-slate-500/50 bg-slate-900/60 text-slate-200 hover:border-slate-400 hover:bg-slate-800/70'
              } ${isCompactLandscape ? 'h-7' : 'h-8 md:h-9'}`}
            >
              <Zap className={`h-3.5 w-3.5 shrink-0 ${runAnimStyle === 'new' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="whitespace-nowrap">
                {runAnimStyle === 'new' ? 'جري: جديد' : 'جري: كلاسيكي'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={cycleMusicTrack}
            title="تغيير الموسيقى (ثيم هيدان / ثيم باين)"
            className={`flex items-center gap-1 rounded-md border border-amber-400/40 bg-[#1c160b] px-1.5 sm:px-2 text-[10px] sm:text-xs font-bold text-amber-200 hover:border-amber-300 cursor-pointer ${
              isCompactLandscape ? 'h-7' : 'h-8 md:h-9'
            }`}
          >
            <Music className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="max-w-[66px] sm:max-w-none truncate">
              {BATTLE_MUSIC_TRACKS[activeTrackIdx]?.id === 'girei' ? 'ثيم باين' : 'ثيم هيدان'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className={`flex items-center justify-center rounded-md border border-white/15 bg-[#121622] text-slate-200 hover:border-white/35 cursor-pointer ${
              isCompactLandscape ? 'h-7 w-7' : 'h-8 w-8'
            }`}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
            className={`hidden sm:flex items-center justify-center rounded-md border border-white/15 bg-[#121622] text-slate-200 hover:border-white/35 cursor-pointer ${
              isCompactLandscape ? 'h-7 w-7' : 'h-8 w-8'
            }`}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onBackToStartScreen}
            className={`flex items-center gap-1 rounded-md border border-rose-500/60 bg-[#1c1014] px-2.5 sm:px-3.5 text-[11px] sm:text-xs font-black tracking-wide text-white transition-colors hover:border-rose-400 hover:bg-rose-600/30 active:scale-95 cursor-pointer ${
              isCompactLandscape ? 'h-7' : 'h-8 md:h-9'
            }`}
          >
            <span>BACK</span>
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* 2A. COMPACT MOBILE LANDSCAPE LAYOUT (Height <= 560px)             */}
      {/* Small Character Squares + Always-Visible Centered Start CTA       */}
      {/* ================================================================= */}
      {isCompactLandscape && (
        <div className="flex flex-1 flex-col justify-between min-h-0">
          <section className="relative flex flex-1 flex-col justify-between px-3 pt-1.5 pb-1 min-h-0">
            {/* Compact Top-Left 1P & Top-Right COM Selector Cards */}
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectionStep('pick_1p')}
                className={`pointer-events-auto flex items-center gap-2 rounded-md border px-2.5 py-1 text-left transition-colors cursor-pointer max-w-[34%] ${
                  selectionStep === 'pick_1p'
                    ? 'border-yellow-300 bg-[#080d18]/94 shadow-[0_0_12px_rgba(250,204,21,0.45)]'
                    : 'border-amber-500/50 bg-[#080d18]/88'
                }`}
              >
                <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded border border-yellow-300 bg-gradient-to-b from-amber-500 to-orange-700 text-[10px] font-black italic text-white">
                  1P
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-black italic text-white leading-tight">
                    {p1Fighter?.displayNameEn || p1Fighter?.nameAr}
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-bold text-amber-300 leading-tight">
                    <span className="truncate">{p1Fighter?.nameAr}</span>
                    {switchingCharacter && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectionStep('pick_com')}
                className={`pointer-events-auto flex flex-row-reverse items-center gap-2 rounded-md border px-2.5 py-1 text-right transition-colors cursor-pointer max-w-[34%] ${
                  selectionStep === 'pick_com'
                    ? 'border-red-400 bg-[#080d18]/94 shadow-[0_0_12px_rgba(239,68,68,0.45)]'
                    : 'border-red-500/50 bg-[#080d18]/88'
                }`}
              >
                <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded border border-lime-300 bg-gradient-to-b from-emerald-600 to-green-900 text-[9px] font-black italic text-lime-200">
                  COM
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-black italic text-white leading-tight">
                    {comFighter?.displayNameEn || comFighter?.nameAr}
                  </div>
                  <div className="truncate text-[9px] font-bold text-rose-300 leading-tight">
                    {comFighter?.nameAr}
                  </div>
                </div>
              </button>
            </div>

            {/* Unobstructed Center VS + START (CONFIRM BATTLE) CTA + Mode Strip */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3">
              <div className="pointer-events-auto flex flex-col items-center gap-1">
                <div className="scale-75 -my-2">
                  <Storm4VsEmblem compact />
                </div>

                <button
                  type="button"
                  onClick={() => onStart(selectedMode, comFighter.id)}
                  className="flex min-h-[38px] items-center justify-center gap-2 rounded-md border-2 border-yellow-300 bg-gradient-to-b from-red-600 via-red-700 to-orange-700 px-5 py-1.5 text-xs sm:text-sm font-black tracking-wide text-white shadow-[0_0_22px_rgba(249,115,22,0.85),0_4px_12px_rgba(0,0,0,0.65)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Swords className="h-4 w-4 text-yellow-200 shrink-0" />
                  <span style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}>
                    ابدأ المعركة · START
                  </span>
                </button>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5 rounded border border-white/15 bg-[#070a12]/90 p-0.5 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => onSelectMode('survival')}
                      className={`rounded-sm px-2 py-0.5 transition-colors cursor-pointer ${
                        selectedMode === 'survival'
                          ? 'bg-amber-500 text-black font-black'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      البقاء
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectMode('boss_rush')}
                      className={`rounded-sm px-2 py-0.5 transition-colors cursor-pointer ${
                        selectedMode === 'boss_rush'
                          ? 'bg-red-600 text-white font-black'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      الزعماء
                    </button>
                  </div>

                  {selectionStep !== 'ready' && (
                    <span
                      className={`rounded border border-white/15 bg-[#070a12]/90 px-2 py-0.5 text-[10px] font-black ${
                        selectionStep === 'pick_1p' ? 'text-yellow-300' : 'text-red-400'
                      }`}
                    >
                      {selectionStep === 'pick_1p' ? 'اختر 1P' : 'اختر COM'}
                    </span>
                  )}

                  {isObitoSelected && onSaveObitoEyes && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowObitoEyesPanel(true)}
                        className="flex min-h-[30px] items-center gap-1 rounded border border-purple-400/75 bg-[#080d18]/92 px-2 py-0.5 text-[10px] font-black text-purple-200 transition-colors hover:border-purple-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                      >
                        <Eye className="h-3 w-3 text-purple-300 shrink-0" />
                        <span>عيون أوبيتو ({uploadedObitoEyeCount}/2)</span>
                      </button>
                      {uploadedObitoEyeCount > 0 && onClearObitoEyes && (
                        <button
                          type="button"
                          onClick={() => void onClearObitoEyes()}
                          title="استعادة العيون الأصلية"
                          className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded border border-sky-400/60 bg-[#080d18]/92 px-1.5 text-[10px] font-bold text-sky-200 hover:border-sky-300 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3 shrink-0" />
                        </button>
                      )}
                    </div>
                  )}

                  {isDeidaraSelected && (onReplaceDeidaraModel || onSaveDeidaraTextures) && (
                    <div className="flex items-center gap-1">
                      {onReplaceDeidaraModel && (
                        <button
                          type="button"
                          onClick={() => deidaraFileInputRef.current?.click()}
                          className="flex min-h-[30px] items-center gap-1 rounded border border-amber-400/75 bg-[#080d18]/92 px-2 py-0.5 text-[10px] font-black text-amber-200 transition-colors hover:border-yellow-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                        >
                          <Upload className="h-3 w-3 text-amber-300 shrink-0" />
                          <span>{hasCustomDeidara ? 'تبديل ديدارا GLB' : 'رفع مجسم ديدارا'}</span>
                        </button>
                      )}
                      {onSaveDeidaraTextures && (
                        <button
                          type="button"
                          onClick={() => setShowDeidaraTexturesPanel(true)}
                          className="flex min-h-[30px] items-center gap-1 rounded border border-emerald-400/75 bg-[#080d18]/92 px-2 py-0.5 text-[10px] font-black text-emerald-200 transition-colors hover:border-emerald-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                        >
                          <Palette className="h-3 w-3 text-emerald-300 shrink-0" />
                          <span>ألوان ديدارا ({uploadedDeidaraTexCount}/4)</span>
                        </button>
                      )}
                      {hasCustomDeidara && onResetDeidaraModel && (
                        <button
                          type="button"
                          onClick={() => void onResetDeidaraModel()}
                          title="استعادة مجسم ديدارا الافتراضي"
                          className="flex min-h-[30px] min-w-[30px] items-center justify-center rounded border border-sky-400/60 bg-[#080d18]/92 px-1.5 text-[10px] font-bold text-sky-200 hover:border-sky-300 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3 shrink-0" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {characterError && (
                  <div className="max-w-xs rounded border border-red-400/60 bg-[#1a0b0e]/95 px-2 py-0.5 text-center text-[10px] font-bold text-red-200">
                    {characterError}
                  </div>
                )}
              </div>
            </div>
            <div aria-hidden="true" />
          </section>

          {/* Ultra-Compact 2-Row Small Character Squares Bar */}
          <footer className="pointer-events-auto shrink-0 border-t-2 border-sky-400/50 bg-[#0d3a57]/96 px-3 py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-6px_18px_rgba(0,0,0,0.55)]">
            <div
              className="mx-auto grid max-w-[640px] gap-1"
              style={{ gridTemplateColumns: `repeat(${landscapeGridCols}, minmax(0, 1fr))` }}
            >
              {featuredFighters.map((fighter) => {
                const isP1 = p1Fighter?.id === fighter.id;
                const isCom = comFighter?.id === fighter.id;
                const isBoth = isP1 && isCom;

                const borderStyle = isBoth
                  ? 'border-yellow-300 ring-1 ring-red-500 shadow-[0_0_10px_rgba(250,204,21,0.85)] z-10'
                  : isP1
                    ? 'border-yellow-300 ring-1 ring-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.85)] z-10'
                    : isCom
                      ? 'border-red-400 ring-1 ring-red-500 shadow-[0_0_10px_rgba(239,68,68,0.85)] z-10'
                      : 'border-sky-300/65 hover:border-yellow-300';

                return (
                  <button
                    key={fighter.id}
                    type="button"
                    onClick={() => handleTileTap(fighter)}
                    title={fighter.nameAr}
                    className={`relative mx-auto h-9 w-9 sm:h-10 sm:w-10 overflow-hidden rounded border-2 bg-[#0e2236] transition-transform active:scale-95 cursor-pointer ${borderStyle}`}
                  >
                    <img
                      src={fighter.portraitUrl}
                      alt={fighter.nameAr}
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent px-0.5 pb-0.5 text-center">
                      <span className="block truncate text-[7px] font-black leading-none text-white">
                        {fighter.nameAr.split(' ')[0]}
                      </span>
                    </div>
                    {isP1 && (
                      <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-0.5 text-[7px] font-black leading-none text-black">
                        1P
                      </span>
                    )}
                    {isCom && (
                      <span className="pointer-events-none absolute right-0 top-0 rounded-bl bg-red-600 px-0.5 text-[7px] font-black leading-none text-white">
                        COM
                      </span>
                    )}
                  </button>
                );
              })}

              {savedCharacters.map((saved) => {
                const isP1 = selectedCharacterId === saved.id;
                const borderStyle = isP1
                  ? 'border-yellow-300 ring-1 ring-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.85)] z-10'
                  : 'border-amber-400/65 hover:border-yellow-300';
                return (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => {
                      void onSelectSavedCharacter(saved);
                      setSelectionStep('pick_com');
                    }}
                    title={saved.nameAr}
                    className={`relative mx-auto h-9 w-9 sm:h-10 sm:w-10 overflow-hidden rounded border-2 bg-[#162133] transition-transform active:scale-95 cursor-pointer ${borderStyle}`}
                  >
                    <img
                      src={OBITO_PORTRAIT_URL}
                      alt={saved.nameAr}
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent px-0.5 pb-0.5 text-center">
                      <span className="block truncate text-[7px] font-black leading-none text-amber-200">
                        {saved.nameAr.split(' ')[0]}
                      </span>
                    </div>
                    {isP1 && (
                      <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-0.5 text-[7px] font-black leading-none text-black">
                        1P
                      </span>
                    )}
                  </button>
                );
              })}

              {Array.from({ length: landscapeLockedCount }, (_, idx) => (
                <div
                  key={`land-locked-${idx}`}
                  aria-label="شخصية مقفلة"
                  className="relative mx-auto h-9 w-9 sm:h-10 sm:w-10 overflow-hidden rounded border border-[#143652] bg-[#0b1826]"
                >
                  <LockedShinobiSilhouette variant={idx} prefix="l" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#060c14]/45">
                    <Lock className="h-2.5 w-2.5 text-slate-400/70" />
                  </div>
                </div>
              ))}
            </div>
          </footer>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2B. MOBILE PORTRAIT LAYOUT (< md & not compact landscape)         */}
      {/* Upper Live 3D Dual Showcase + Lower Compact Character Tiles       */}
      {/* ================================================================= */}
      {!isCompactLandscape && !isDesktopLayout && (
        <div className="flex flex-1 flex-col justify-between min-h-0">
          {/* Upper Transparent 3D Showcase */}
          <section className="relative flex flex-1 min-h-[42dvh] flex-col justify-between px-2.5 pt-2 pb-1.5">
            {/* Interactive 1P vs COM Fighter Selector Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectionStep('pick_1p')}
                className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                  selectionStep === 'pick_1p'
                    ? 'border-yellow-300 bg-[#080d18]/94 shadow-[0_0_16px_rgba(250,204,21,0.45)]'
                    : 'border-amber-500/50 bg-[#080d18]/88'
                }`}
              >
                <span className="flex h-7 w-8 shrink-0 items-center justify-center rounded border border-yellow-300 bg-gradient-to-b from-amber-500 to-orange-700 text-[11px] font-black italic text-white">
                  1P
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black italic text-white leading-tight">
                    {p1Fighter?.displayNameEn || p1Fighter?.nameAr}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-amber-300">
                    <span className="truncate">{p1Fighter?.nameAr}</span>
                    {switchingCharacter && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectionStep('pick_com')}
                className={`pointer-events-auto flex flex-row-reverse items-center gap-2 rounded-lg border px-2 py-1.5 text-right transition-colors cursor-pointer ${
                  selectionStep === 'pick_com'
                    ? 'border-red-400 bg-[#080d18]/94 shadow-[0_0_16px_rgba(239,68,68,0.45)]'
                    : 'border-red-500/50 bg-[#080d18]/88'
                }`}
              >
                <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded border border-lime-300 bg-gradient-to-b from-emerald-600 to-green-900 text-[10px] font-black italic text-lime-200">
                  COM
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black italic text-white leading-tight">
                    {comFighter?.displayNameEn || comFighter?.nameAr}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-bold text-rose-300">
                    {comFighter?.nameAr}
                  </div>
                </div>
              </button>
            </div>

            {/* Compact Center Fiery VS Emblem between the two live 3D characters */}
            <div className="pointer-events-none flex flex-col items-center justify-center my-auto">
              <Storm4VsEmblem compact />
              {characterError && (
                <div className="mt-1 max-w-xs rounded border border-red-400/60 bg-[#1a0b0e]/95 px-2.5 py-1 text-center text-[10px] font-bold text-red-200">
                  {characterError}
                </div>
              )}
            </div>

            {isObitoSelected && onSaveObitoEyes && (
              <div dir="rtl" className="mb-1.5 flex flex-wrap items-center justify-center gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setShowObitoEyesPanel(true)}
                  className="flex min-h-[44px] items-center gap-2 rounded-md border border-purple-400/75 bg-[#080d18]/94 px-3 text-xs font-black text-purple-200 shadow-md transition-colors hover:border-purple-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                >
                  <Eye className="h-4 w-4 text-purple-300 shrink-0" />
                  <span>عيون أوبيتو ({uploadedObitoEyeCount}/2)</span>
                </button>
                {uploadedObitoEyeCount > 0 && onClearObitoEyes && (
                  <button
                    type="button"
                    onClick={() => void onClearObitoEyes()}
                    className="flex min-h-[44px] items-center gap-1 rounded-md border border-sky-400/60 bg-[#080d18]/94 px-3 text-xs font-bold text-sky-200 hover:border-sky-300 active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>استعادة</span>
                  </button>
                )}
              </div>
            )}

            {/* Direct Device GLB & 4-Texture Picker when Deidara is selected (Mobile Portrait) */}
            {isDeidaraSelected && (onReplaceDeidaraModel || onSaveDeidaraTextures) && (
              <div dir="rtl" className="mb-1.5 flex flex-wrap items-center justify-center gap-1.5 pointer-events-auto">
                {onReplaceDeidaraModel && (
                  <button
                    type="button"
                    onClick={() => deidaraFileInputRef.current?.click()}
                    className="flex min-h-[44px] items-center gap-2 rounded-md border border-amber-400/75 bg-[#080d18]/94 px-3 text-xs font-black text-amber-200 shadow-md transition-colors hover:border-yellow-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                    <span>{hasCustomDeidara ? 'تبديل مجسم ديدارا (.glb)' : 'استبدال مجسم ديدارا (.glb)'}</span>
                  </button>
                )}
                {onSaveDeidaraTextures && (
                  <button
                    type="button"
                    onClick={() => setShowDeidaraTexturesPanel(true)}
                    className="flex min-h-[44px] items-center gap-2 rounded-md border border-emerald-400/75 bg-[#080d18]/94 px-3 text-xs font-black text-emerald-200 shadow-md transition-colors hover:border-emerald-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                  >
                    <Palette className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                    <span>ألوان ديدارا ({uploadedDeidaraTexCount}/4)</span>
                  </button>
                )}
                {hasCustomDeidara && onResetDeidaraModel && (
                  <button
                    type="button"
                    onClick={() => void onResetDeidaraModel()}
                    title="استعادة مجسم ديدارا الافتراضي"
                    className="flex min-h-[44px] items-center gap-1 rounded-md border border-sky-400/60 bg-[#080d18]/94 px-3 text-xs font-bold text-sky-200 hover:border-sky-300 active:scale-95 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                    <span>استعادة</span>
                  </button>
                )}
              </div>
            )}

            {/* Sleek Bottom Ultimate Jutsu Summary Strip above Drawer Seam */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-[#080d18]/90 px-2.5 py-1 text-[10px] font-bold">
              <div className="flex items-center gap-1 min-w-0 text-amber-200">
                <ScrollText className="h-3 w-3 shrink-0 text-amber-400" />
                <span className="truncate">{p1Fighter?.ultimateJutsuEn || 'ULTIMATE'}</span>
              </div>
              <span className="text-slate-600 shrink-0" aria-hidden="true">
                ·
              </span>
              <div className="flex flex-row-reverse items-center gap-1 min-w-0 text-rose-200 text-right">
                <ScrollText className="h-3 w-3 shrink-0 text-rose-400" />
                <span className="truncate">{comFighter?.ultimateJutsuEn || 'ULTIMATE'}</span>
              </div>
            </div>
          </section>

          {/* Lower Smooth Vertically Scrollable Character Roster Drawer */}
          <footer className="pointer-events-auto flex h-[38dvh] min-h-[222px] max-h-[316px] shrink-0 flex-col border-t-2 border-sky-400/45 bg-[#09131f]/98 shadow-[0_-10px_28px_rgba(0,0,0,0.65)]">
            {/* Drawer Controls Sub-Header (Step Prompt + Mode Toggle) */}
            <div
              dir="rtl"
              className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5"
            >
              <div className="min-w-0 text-xs font-black tracking-tight">
                {selectionStep === 'pick_1p' && (
                  <span className="text-yellow-300">اختر مقاتلك (1P)</span>
                )}
                {selectionStep === 'pick_com' && (
                  <span className="text-red-400">اختر الخصم (COM)</span>
                )}
                {selectionStep === 'ready' && (
                  <span className="text-emerald-300">جاهز للقتال · اضغط ابدأ</span>
                )}
              </div>

              {/* Compact Survival / Boss Rush Segmented Control */}
              <div className="flex items-center gap-1 rounded-md border border-white/12 bg-[#0d1929] p-0.5 text-[11px] font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectMode('survival')}
                  className={`min-h-[28px] rounded px-2.5 transition-colors cursor-pointer ${
                    selectedMode === 'survival'
                      ? 'bg-amber-500 text-black font-black'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  البقاء
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMode('boss_rush')}
                  className={`min-h-[28px] rounded px-2.5 transition-colors cursor-pointer ${
                    selectedMode === 'boss_rush'
                      ? 'bg-red-600 text-white font-black'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  الزعماء
                </button>
              </div>
            </div>

            {/* Vertically Scrollable 5-Column Smaller Character Squares Grid */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-2"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              <div className="grid grid-cols-5 gap-1.5">
                {featuredFighters.map((fighter) => {
                  const isP1 = p1Fighter?.id === fighter.id;
                  const isCom = comFighter?.id === fighter.id;
                  const isBoth = isP1 && isCom;

                  const borderStyle = isBoth
                    ? 'border-yellow-300 ring-2 ring-red-500 shadow-[0_0_12px_rgba(250,204,21,0.75)]'
                    : isP1
                      ? 'border-yellow-300 ring-2 ring-yellow-400/90 shadow-[0_0_12px_rgba(250,204,21,0.7)]'
                      : isCom
                        ? 'border-red-400 ring-2 ring-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                        : 'border-sky-300/45 active:border-yellow-300';

                  return (
                    <button
                      key={fighter.id}
                      type="button"
                      onClick={() => handleTileTap(fighter)}
                      title={fighter.nameAr}
                      className={`relative aspect-square min-h-[48px] w-full overflow-hidden rounded-md border-2 bg-[#0e2236] transition-transform active:scale-95 cursor-pointer ${borderStyle}`}
                    >
                      <img
                        src={fighter.portraitUrl}
                        alt={fighter.nameAr}
                        className="h-full w-full object-cover object-top"
                        draggable={false}
                      />

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-0.5 pt-2.5 pb-0.5 text-center">
                        <span className="block truncate text-[9px] font-black leading-none text-white">
                          {fighter.nameAr.split(' ')[0]}
                        </span>
                      </div>

                      {isP1 && (
                        <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-px text-[8px] font-black leading-none text-black shadow">
                          1P
                        </span>
                      )}
                      {isCom && (
                        <span className="pointer-events-none absolute right-0 top-0 rounded-bl bg-red-600 px-1 py-px text-[8px] font-black leading-none text-white shadow">
                          COM
                        </span>
                      )}
                    </button>
                  );
                })}

                {savedCharacters.map((saved) => {
                  const isP1 = selectedCharacterId === saved.id;
                  const borderStyle = isP1
                    ? 'border-yellow-300 ring-2 ring-yellow-400/90 shadow-[0_0_12px_rgba(250,204,21,0.7)]'
                    : 'border-amber-400/65 active:border-yellow-300';
                  return (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => {
                        void onSelectSavedCharacter(saved);
                        setSelectionStep('pick_com');
                      }}
                      title={saved.nameAr}
                      className={`relative aspect-square min-h-[48px] w-full overflow-hidden rounded-md border-2 bg-[#162133] transition-transform active:scale-95 cursor-pointer ${borderStyle}`}
                    >
                      <img
                        src={OBITO_PORTRAIT_URL}
                        alt={saved.nameAr}
                        className="h-full w-full object-cover object-top"
                        draggable={false}
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-0.5 pt-2.5 pb-0.5 text-center">
                        <span className="block truncate text-[9px] font-black leading-none text-amber-200">
                          {saved.nameAr.split(' ')[0]}
                        </span>
                      </div>
                      {isP1 && (
                        <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-px text-[8px] font-black leading-none text-black shadow">
                          1P
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Locked Shinobi Roster Slots below Playable Fighters */}
                {Array.from({ length: mobileLockedCount }, (_, idx) => (
                  <div
                    key={`mobile-locked-${idx}`}
                    aria-label="شخصية مقفلة"
                    className="relative aspect-square min-h-[48px] w-full overflow-hidden rounded-md border border-[#143652] bg-[#0b1826]"
                  >
                    <LockedShinobiSilhouette variant={idx} prefix="m" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#060c14]/45">
                      <Lock className="h-3.5 w-3.5 text-slate-400/70" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-center">
                <PWAInstallButton variant="header" />
              </div>
            </div>

            {/* Sticky Bottom Thumb-Zone Battle CTA */}
            <div className="shrink-0 border-t border-white/10 bg-[#060e18] px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onStart(selectedMode, comFighter.id)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-yellow-300 bg-gradient-to-b from-red-600 via-red-700 to-orange-700 px-5 py-2 text-sm font-black tracking-wide text-white shadow-[0_0_22px_rgba(249,115,22,0.6),0_4px_14px_rgba(0,0,0,0.6)] transition-transform active:scale-[0.98] cursor-pointer"
              >
                <Swords className="h-4 w-4 text-yellow-200 shrink-0" />
                <span style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}>
                  ابدأ المعركة · CONFIRM BATTLE
                </span>
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2C. DESKTOP & LARGE TABLET LAYOUT (md+ & height > 560px)          */}
      {/* ================================================================= */}
      {isDesktopLayout && (
        <div className="flex flex-1 flex-col justify-between min-h-0">
          <section className="relative flex flex-1 flex-col justify-between px-5 pt-2.5 pb-2 min-h-0">
            {/* Top Row: 1P Nameplate Ribbon (Left) + COM Nameplate Ribbon (Right) */}
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => setSelectionStep('pick_1p')}
                className={`pointer-events-auto group relative flex items-center gap-3 rounded-r-sm border-y-2 border-r-2 px-4 py-2 text-left transition-transform cursor-pointer ${
                  selectionStep === 'pick_1p'
                    ? 'border-yellow-300 bg-[#070a12]/95 shadow-[0_0_20px_rgba(250,204,21,0.55)] scale-[1.02]'
                    : 'border-amber-500/70 bg-[#070a12]/90 hover:border-yellow-300'
                }`}
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 94% 50%, 100% 100%, 0 100%)',
                  paddingRight: '1.75rem',
                }}
              >
                <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-sm border-2 border-yellow-300 bg-gradient-to-b from-amber-500 to-orange-700 text-sm font-black italic text-white shadow">
                  1P
                </span>
                <div className="min-w-0">
                  <div
                    className="truncate text-xl lg:text-2xl font-black italic tracking-tight text-white leading-none"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
                  >
                    {p1Fighter?.displayNameEn || p1Fighter?.nameAr}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <span className="truncate">{p1Fighter?.nameAr}</span>
                    {switchingCharacter && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectionStep('pick_com')}
                className={`pointer-events-auto group relative flex flex-row-reverse items-center gap-3 rounded-l-sm border-y-2 border-l-2 px-4 py-2 text-right transition-transform cursor-pointer ${
                  selectionStep === 'pick_com'
                    ? 'border-red-400 bg-[#070a12]/95 shadow-[0_0_20px_rgba(239,68,68,0.6)] scale-[1.02]'
                    : 'border-red-500/70 bg-[#070a12]/90 hover:border-red-400'
                }`}
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 6% 50%)',
                  paddingLeft: '1.75rem',
                }}
              >
                <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-sm border-2 border-lime-300 bg-gradient-to-b from-emerald-600 to-green-900 text-sm font-black italic text-lime-200 shadow">
                  COM
                </span>
                <div className="min-w-0">
                  <div
                    className="truncate text-xl lg:text-2xl font-black italic tracking-tight text-white leading-none"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
                  >
                    {comFighter?.displayNameEn || comFighter?.nameAr}
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-rose-300 truncate">
                    {comFighter?.nameAr}
                  </div>
                </div>
              </button>
            </div>

            {/* Center Floating Fiery VS Emblem + CONFIRM BATTLE */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3">
              <div className="flex flex-col items-center">
                <Storm4VsEmblem compact={viewport.h < 700} />

                <div className="pointer-events-auto mt-2 flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onStart(selectedMode, comFighter.id)}
                    className="group relative flex min-h-[46px] items-center justify-center gap-2.5 rounded-md border-2 border-yellow-300 bg-gradient-to-b from-red-600 via-red-700 to-orange-700 px-8 py-2 text-base lg:text-lg font-black uppercase tracking-wider text-white shadow-[0_0_28px_rgba(249,115,22,0.85),0_6px_16px_rgba(0,0,0,0.6)] transition-transform hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
                  >
                    <Swords className="h-5 w-5 text-yellow-200" />
                    <span style={{ textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}>CONFIRM BATTLE</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded border border-black/60 bg-[#070a12]/90 p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => onSelectMode('survival')}
                        className={`rounded-sm px-2.5 py-0.5 transition-colors cursor-pointer ${
                          selectedMode === 'survival'
                            ? 'bg-amber-500 text-black font-black'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        البقاء (5 موجات)
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectMode('boss_rush')}
                        className={`rounded-sm px-2.5 py-0.5 transition-colors cursor-pointer ${
                          selectedMode === 'boss_rush'
                            ? 'bg-red-600 text-white font-black'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        الزعماء
                      </button>
                    </div>

                    {selectionStep !== 'ready' && (
                      <span
                        className={`rounded border border-black/70 bg-[#070a12]/90 px-2.5 py-1 text-xs font-black ${
                          selectionStep === 'pick_1p' ? 'text-yellow-300' : 'text-red-400'
                        }`}
                      >
                        {selectionStep === 'pick_1p' ? '1P · اختر مقاتلك' : 'COM · اختر الخصم'}
                      </span>
                    )}
                  </div>
                </div>

                {isObitoSelected && onSaveObitoEyes && (
                  <div dir="rtl" className="pointer-events-auto mt-1 flex flex-wrap items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowObitoEyesPanel(true)}
                      className="flex min-h-[44px] items-center gap-2 rounded-md border border-purple-400/75 bg-[#080d18]/94 px-3.5 text-xs font-black text-purple-200 shadow-md transition-colors hover:border-purple-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                    >
                      <Eye className="h-4 w-4 text-purple-300 shrink-0" />
                      <span>عيون أوبيتو ({uploadedObitoEyeCount}/2)</span>
                    </button>
                    {uploadedObitoEyeCount > 0 && onClearObitoEyes && (
                      <button
                        type="button"
                        onClick={() => void onClearObitoEyes()}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-sky-400/60 bg-[#080d18]/94 px-3 text-xs font-bold text-sky-200 hover:border-sky-300 active:scale-95 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                        <span>استعادة</span>
                      </button>
                    )}
                  </div>
                )}

                {isDeidaraSelected && (onReplaceDeidaraModel || onSaveDeidaraTextures) && (
                  <div dir="rtl" className="pointer-events-auto mt-1 flex flex-wrap items-center justify-center gap-1.5">
                    {onReplaceDeidaraModel && (
                      <button
                        type="button"
                        onClick={() => deidaraFileInputRef.current?.click()}
                        className="flex min-h-[44px] items-center gap-2 rounded-md border border-amber-400/75 bg-[#080d18]/94 px-3.5 text-xs font-black text-amber-200 shadow-md transition-colors hover:border-yellow-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                      >
                        <Upload className="h-4 w-4 text-amber-300 shrink-0" />
                        <span>{hasCustomDeidara ? 'تبديل مجسم ديدارا (.glb)' : 'استبدال مجسم ديدارا من الجهاز (.glb)'}</span>
                      </button>
                    )}
                    {onSaveDeidaraTextures && (
                      <button
                        type="button"
                        onClick={() => setShowDeidaraTexturesPanel(true)}
                        className="flex min-h-[44px] items-center gap-2 rounded-md border border-emerald-400/75 bg-[#080d18]/94 px-3.5 text-xs font-black text-emerald-200 shadow-md transition-colors hover:border-emerald-300 hover:bg-[#111b2e] active:scale-95 cursor-pointer"
                      >
                        <Palette className="h-4 w-4 text-emerald-300 shrink-0" />
                        <span>ألوان ديدارا ({uploadedDeidaraTexCount}/4)</span>
                      </button>
                    )}
                    {hasCustomDeidara && onResetDeidaraModel && (
                      <button
                        type="button"
                        onClick={() => void onResetDeidaraModel()}
                        title="استعادة مجسم ديدارا الافتراضي"
                        className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-sky-400/60 bg-[#080d18]/94 px-3 text-xs font-bold text-sky-200 hover:border-sky-300 active:scale-95 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                        <span>استعادة</span>
                      </button>
                    )}
                  </div>
                )}

                {characterError && (
                  <div className="mt-1.5 max-w-xs rounded border border-red-400/60 bg-[#1a0b0e]/95 px-2.5 py-1 text-center text-[10px] font-bold text-red-200">
                    {characterError}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom of Showcase Zone: 1P & COM Team + Ultimate Jutsu Bars */}
            <div className="flex items-end justify-between gap-6">
              <div className="w-[46%] max-w-[310px] space-y-1">
                <div
                  className="border border-amber-400/70 bg-gradient-to-r from-[#7f1d1d]/95 via-[#991b1b]/90 to-[#450a0a]/88 px-3 py-1 shadow-md"
                  style={{ clipPath: 'polygon(0 0, 94% 0, 100% 100%, 0 100%)' }}
                >
                  <div className="truncate text-xs font-black italic tracking-wide text-white">
                    {p1Fighter?.teamNameEn || 'UCHIHA TEAM'}
                  </div>
                </div>
                <div
                  className="flex items-center gap-1.5 border border-yellow-300/60 bg-gradient-to-r from-[#b91c1c] via-[#dc2626] to-[#7f1d1d] px-2.5 py-1 shadow-md"
                  style={{ clipPath: 'polygon(0 0, 97% 0, 100% 100%, 0 100%)' }}
                >
                  <ScrollText className="h-3.5 w-3.5 shrink-0 text-yellow-300" />
                  <span className="truncate text-[11px] font-black tracking-tight text-yellow-50">
                    {p1Fighter?.ultimateJutsuEn || 'ULTIMATE JUTSU'}
                  </span>
                </div>
              </div>

              <div className="w-[46%] max-w-[310px] space-y-1 text-right">
                <div
                  className="border border-lime-400/70 bg-gradient-to-l from-[#14532d]/95 via-[#166534]/90 to-[#052e16]/88 px-3 py-1 shadow-md"
                  style={{ clipPath: 'polygon(6% 0, 100% 0, 100% 100%, 0 100%)' }}
                >
                  <div className="truncate text-xs font-black italic tracking-wide text-white">
                    {comFighter?.teamNameEn || 'SHINOBI RIVAL'}
                  </div>
                </div>
                <div
                  className="flex flex-row-reverse items-center gap-1.5 border border-yellow-300/60 bg-gradient-to-l from-[#b91c1c] via-[#dc2626] to-[#7f1d1d] px-2.5 py-1 shadow-md"
                  style={{ clipPath: 'polygon(3% 0, 100% 0, 100% 100%, 0 100%)' }}
                >
                  <ScrollText className="h-3.5 w-3.5 shrink-0 text-yellow-300" />
                  <span className="truncate text-[11px] font-black tracking-tight text-yellow-50">
                    {comFighter?.ultimateJutsuEn || 'ULTIMATE JUTSU'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Packed Desktop Character Roster with Smaller Tiles */}
          <footer className="pointer-events-auto shrink-0 border-t-2 border-[#0b273a] bg-[#1a6894] px-3 py-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(0,0,0,0.45)]">
            <div
              className="mx-auto grid max-w-[1060px] gap-1"
              style={{ gridTemplateColumns: `repeat(${desktopGridCols}, minmax(0, 1fr))` }}
            >
              {featuredFighters.map((fighter) => {
                const isP1 = p1Fighter?.id === fighter.id;
                const isCom = comFighter?.id === fighter.id;
                const isBoth = isP1 && isCom;

                const borderStyle = isBoth
                  ? 'border-yellow-300 ring-2 ring-red-500 shadow-[0_0_16px_rgba(250,204,21,0.95),0_0_18px_rgba(239,68,68,0.9)] z-20 scale-[1.04]'
                  : isP1
                    ? 'border-yellow-300 ring-2 ring-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.95)] z-20 scale-[1.04]'
                    : isCom
                      ? 'border-red-400 ring-2 ring-red-500 shadow-[0_0_16px_rgba(239,68,68,0.95)] z-20 scale-[1.04]'
                      : 'border-[#7ec4e8]/75 hover:border-yellow-300 hover:scale-[1.04] hover:z-10';

                return (
                  <button
                    key={fighter.id}
                    type="button"
                    onClick={() => handleTileTap(fighter)}
                    title={`${fighter.nameAr} (${fighter.displayNameEn || fighter.nameAr})`}
                    className={`group relative aspect-square w-full overflow-hidden rounded-[2px] border-2 bg-[#0e2236] transition-transform cursor-pointer ${borderStyle}`}
                  >
                    <img
                      src={fighter.portraitUrl}
                      alt={fighter.nameAr}
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-0.5 pt-2 pb-0.5 text-center">
                      <span className="block truncate text-[8px] font-black leading-none text-white">
                        {fighter.nameAr.split(' ')[0]}
                      </span>
                    </div>

                    {isP1 && (
                      <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-px text-[8px] font-black leading-none text-black shadow">
                        1P
                      </span>
                    )}
                    {isCom && (
                      <span className="pointer-events-none absolute right-0 top-0 rounded-bl bg-red-600 px-1 py-px text-[8px] font-black leading-none text-white shadow">
                        COM
                      </span>
                    )}
                  </button>
                );
              })}

              {savedCharacters.map((saved) => {
                const isP1 = selectedCharacterId === saved.id;
                const borderStyle = isP1
                  ? 'border-yellow-300 ring-2 ring-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.95)] z-20 scale-[1.04]'
                  : 'border-amber-400/75 hover:border-yellow-300 hover:scale-[1.04] hover:z-10';
                return (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => {
                      void onSelectSavedCharacter(saved);
                      setSelectionStep('pick_com');
                    }}
                    title={saved.nameAr}
                    className={`group relative aspect-square w-full overflow-hidden rounded-[2px] border-2 bg-[#162133] transition-transform cursor-pointer ${borderStyle}`}
                  >
                    <img
                      src={OBITO_PORTRAIT_URL}
                      alt={saved.nameAr}
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-0.5 pt-2 pb-0.5 text-center">
                      <span className="block truncate text-[8px] font-black leading-none text-amber-200">
                        {saved.nameAr.split(' ')[0]}
                      </span>
                    </div>
                    {isP1 && (
                      <span className="pointer-events-none absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-px text-[8px] font-black leading-none text-black shadow">
                        1P
                      </span>
                    )}
                  </button>
                );
              })}

              {Array.from({ length: desktopLockedCount }, (_, idx) => (
                <div
                  key={`desktop-locked-${idx}`}
                  aria-label="شخصية مقفلة"
                  className="relative aspect-square w-full overflow-hidden rounded-[2px] border border-[#0c3148] bg-[#0d1926]"
                >
                  <LockedShinobiSilhouette variant={idx} prefix="d" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#060c14]/45">
                    <Lock className="h-3 w-3 text-slate-400/75" />
                  </div>
                </div>
              ))}
            </div>
          </footer>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. DEIDARA 4-TEXTURE MAPPER MODAL PANEL                           */}
      {/* ================================================================= */}
      {showDeidaraTexturesPanel && isDeidaraSelected && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-3"
          onClick={() => setShowDeidaraTexturesPanel(false)}
        >
          <div
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-xl border-2 border-amber-400/80 bg-[#09111d] p-4 text-right shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-black text-white">ألوان ديدارا الأصلية (4 صور PNG)</h2>
                  <p className="text-[11px] text-slate-300">
                    ارفع صور الجسم والعباءة والعين واللسان من جهازك لتلوين المجسم فوراً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeidaraTexturesPanel(false)}
                aria-label="إغلاق"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#101c2e] text-slate-200 hover:border-white/40 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => deidaraBatchTexInputRef.current?.click()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-emerald-400/75 bg-[#0e261f] px-3 text-xs font-black text-emerald-100 transition-colors hover:border-emerald-300 hover:bg-[#133329] active:scale-[0.99] cursor-pointer"
              >
                <Upload className="h-4 w-4 text-emerald-300 shrink-0" />
                <span>اختيار الـ 4 صور دفعة واحدة (من الجهاز)</span>
              </button>

              {deidaraTexHint && (
                <div className="rounded-md border border-amber-400/50 bg-[#1f1609] px-2.5 py-1.5 text-[11px] font-bold text-amber-200">
                  {deidaraTexHint}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {DEIDARA_TEXTURE_SLOT_META.map(({ slot, titleAr, hintName }) => {
                  const slotEntry = deidaraTextures?.slots[slot];
                  const thumbUrl = deidaraThumbUrls[slot];
                  const effectiveSlotFlip =
                    deidaraTextures?.slotFlipY?.[slot] ?? Boolean(deidaraTextures?.flipY ?? false);
                  return (
                    <div
                      key={slot}
                      className={`flex items-center gap-1.5 rounded-lg border p-1.5 transition-colors ${
                        slotEntry
                          ? 'border-emerald-400/70 bg-[#0d1c2b]'
                          : 'border-white/15 bg-[#0c1624]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => deidaraSlotInputRefs.current[slot]?.click()}
                        className="flex min-h-[58px] min-w-0 flex-1 items-center gap-2 text-right cursor-pointer"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-[#060b12]">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={titleAr}
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-black text-white">{titleAr}</div>
                          <div className="mt-0.5 truncate text-[10px] font-bold text-slate-300">
                            {slotEntry ? slotEntry.fileName : hintName}
                          </div>
                        </div>
                      </button>

                      {slotEntry && onToggleDeidaraSlotFlipY && (
                        <button
                          type="button"
                          onClick={() => void onToggleDeidaraSlotFlipY(slot)}
                          title={`قلب UV لصورة ${titleAr}`}
                          className={`flex min-h-[44px] min-w-[34px] shrink-0 flex-col items-center justify-center rounded border px-1 text-[9px] font-black transition-colors cursor-pointer ${
                            effectiveSlotFlip
                              ? 'border-amber-400 bg-[#231908] text-amber-200'
                              : 'border-white/15 bg-[#101c2e] text-slate-300 hover:border-white/35'
                          }`}
                        >
                          <FlipVertical2 className="h-3.5 w-3.5" />
                          <span>{effectiveSlotFlip ? 'مقلوب' : 'عادي'}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                {onToggleDeidaraFlipY && (
                  <button
                    type="button"
                    onClick={() => void onToggleDeidaraFlipY()}
                    className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-black transition-colors cursor-pointer ${
                      deidaraTextures?.flipY
                        ? 'border-amber-400 bg-[#231908] text-amber-200'
                        : 'border-white/20 bg-[#0f1a2a] text-slate-200 hover:border-white/40'
                    }`}
                  >
                    <FlipVertical2 className="h-4 w-4 shrink-0" />
                    <span>
                      عكس UV الكل: {deidaraTextures?.flipY ? 'مفعل' : 'افتراضي GLB'}
                    </span>
                  </button>
                )}

                {onClearDeidaraTextures && uploadedDeidaraTexCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void onClearDeidaraTextures()}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-rose-500/65 bg-[#241016] px-3 text-xs font-black text-rose-200 hover:border-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span>مسح</span>
                  </button>
                )}
              </div>

              {deidaraMeshParts.length > 0 && onSetDeidaraMeshSlot && (
                <div className="mt-1 border-t border-white/10 pt-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-amber-200">
                      توزيع الصور على أجزاء المجسم ({deidaraMeshParts.length})
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      اضغط لتغيير صورة أي جزء فوراً
                    </span>
                  </div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                    {deidaraMeshParts.map((part) => (
                      <div
                        key={part.meshKey}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0c1624] px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-black text-white">
                            {part.mesh}
                            {part.material && part.material !== part.mesh ? ` · ${part.material}` : ''}
                          </div>
                          <div className="truncate text-[9px] font-bold text-slate-400">
                            الارتفاع {part.yMinPct}%–{part.yMaxPct}%
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {DEIDARA_TEXTURE_SLOT_META.map(({ slot, shortAr }) => {
                            const active = part.slot === slot;
                            return (
                              <button
                                key={`${part.meshKey}-${slot}`}
                                type="button"
                                onClick={() => void onSetDeidaraMeshSlot(part.meshKey, slot)}
                                className={`min-h-[32px] rounded px-1.5 text-[10px] font-black transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-emerald-500 text-black'
                                    : 'border border-white/15 bg-[#101c2e] text-slate-300 hover:border-amber-300/60'
                                }`}
                              >
                                {shortAr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {onPublishDeidaraPermanent &&
                (typeof window === 'undefined' || window.location.hostname !== 'naruto.local') && (
                  <div className="mt-1 space-y-2 border-t border-white/10 pt-2.5">
                    <button
                      type="button"
                      disabled={deidaraPublishState === 'publishing'}
                      onClick={() => void onPublishDeidaraPermanent()}
                      className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 px-3 text-xs font-black transition-colors cursor-pointer disabled:opacity-65 ${
                        deidaraPublishState === 'published'
                          ? 'border-emerald-400 bg-[#0d2b22] text-emerald-100 hover:bg-[#11382c]'
                          : 'border-amber-400 bg-[#231908] text-amber-100 hover:border-yellow-300 hover:bg-[#2d210b]'
                      }`}
                    >
                      {deidaraPublishState === 'publishing' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-amber-300" />
                          <span>جاري تثبيت ألوان ديدارا وتجهيز نسخة APK...</span>
                        </>
                      ) : deidaraPublishState === 'published' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                          <span>إعادة التثبيت وتحديث نسخة الموبايل APK</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-300" />
                          <span>تثبيت الألوان والمجسم في اللعبة والـ APK دائماً</span>
                        </>
                      )}
                    </button>

                    {deidaraPublishState === 'published' && (
                      <div className="rounded-lg border border-emerald-400/50 bg-[#0b201b] p-2.5 text-[11px] font-bold text-emerald-200">
                        <div>
                          تم تثبيت ألوان ومجسم ديدارا بشكل دائم في اللعبة وتحديث نسخة الأندرويد APK.
                        </div>
                        <a
                          href={`/api/download-apk?v=${publishedApkSizeBytes || Date.now()}`}
                          download="Naruto_Obito_3D.apk"
                          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-emerald-400/75 bg-emerald-600 px-3 text-xs font-black text-white shadow transition-colors hover:bg-emerald-500"
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          <span>
                            تحميل نسخة الموبايل APK المحدّثة
                            {publishedApkSizeBytes > 0
                              ? ` (${(publishedApkSizeBytes / (1024 * 1024)).toFixed(1)} MB)`
                              : ''}
                          </span>
                        </a>
                      </div>
                    )}

                    {deidaraPublishState === 'error' && (
                      <div className="rounded-md border border-rose-400/55 bg-[#220e14] px-2.5 py-2 text-[11px] font-bold text-rose-200">
                        تعذر التثبيت الآن — اضغط مرة أخرى لإعادة المحاولة.
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {showObitoEyesPanel && isObitoSelected && onSaveObitoEyes && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-3"
          onClick={() => setShowObitoEyesPanel(false)}
        >
          <div
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-xl border-2 border-purple-400/80 bg-[#09111d] p-4 text-right shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-purple-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-black text-white">تخصيص عيون أوبيتو أوتشيها (يمين ويسار)</h2>
                  <p className="text-[11px] text-slate-300">
                    ارفع صورتي العين اليمنى واليسرى من جهازك لتطبيقهما فوراً على المجسم بدقة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowObitoEyesPanel(false)}
                aria-label="إغلاق"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#101c2e] text-slate-200 hover:border-white/40 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {/* Right Eye */}
              <div className="flex flex-col items-center rounded-xl border border-white/12 bg-[#0d1624] p-3 text-center">
                <span className="text-xs font-black text-amber-300">العين اليمنى (Sharingan)</span>
                <div className="my-2.5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-amber-400/60 bg-black/50">
                  {obitoRightThumbUrl ? (
                    <img src={obitoRightThumbUrl} alt="Right Eye" className="h-full w-full object-cover" />
                  ) : (
                    <Eye className="h-8 w-8 text-slate-500" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => obitoRightEyeInputRef.current?.click()}
                  className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-amber-400/75 bg-[#1d1b0c] px-2 text-xs font-black text-amber-200 hover:border-amber-300 active:scale-95 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                  <span>{obitoEyes?.rightEye ? 'تغيير العين اليمنى' : 'رفع العين اليمنى'}</span>
                </button>
              </div>

              {/* Left Eye */}
              <div className="flex flex-col items-center rounded-xl border border-white/12 bg-[#0d1624] p-3 text-center">
                <span className="text-xs font-black text-purple-300">العين اليسرى (Rinnegan)</span>
                <div className="my-2.5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-purple-400/60 bg-black/50">
                  {obitoLeftThumbUrl ? (
                    <img src={obitoLeftThumbUrl} alt="Left Eye" className="h-full w-full object-cover" />
                  ) : (
                    <Eye className="h-8 w-8 text-slate-500" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => obitoLeftEyeInputRef.current?.click()}
                  className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-purple-400/75 bg-[#1d1024] px-2 text-xs font-black text-purple-200 hover:border-purple-300 active:scale-95 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 text-purple-300 shrink-0" />
                  <span>{obitoEyes?.leftEye ? 'تغيير العين اليسرى' : 'رفع العين اليسرى'}</span>
                </button>
              </div>
            </div>

            {uploadedObitoEyeCount > 0 && onClearObitoEyes && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    void onClearObitoEyes();
                    setShowObitoEyesPanel(false);
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-rose-500/70 bg-[#241016] px-3 text-xs font-black text-rose-200 hover:border-rose-400 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <span>استعادة العيون الأصلية الافتراضية</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. UNIVERSAL ANY-FORMAT 3D CHARACTER IMPORTER MODAL               */}
      {/* ================================================================= */}
      {showCustomCharModal && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-3"
          onClick={() => setShowCustomCharModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-xl border-2 border-amber-400/80 bg-[#09111d] p-4 text-right shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-black text-white">إضافة شخصية 3D بأي صيغة</h2>
                  <p className="text-[11px] text-slate-300">
                    يدعم GLB, GLTF, VRM, FBX, OBJ, DAE, STL, PLY, ZIP أو رابط مباشر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomCharModal(false)}
                aria-label="إغلاق"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#101c2e] text-slate-200 hover:border-white/40 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <button
                type="button"
                disabled={switchingCharacter}
                onClick={() => customCharFileInputRef.current?.click()}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg border-2 border-amber-400/80 bg-[#1e1609] px-3 text-xs font-black text-amber-100 transition-colors hover:border-yellow-300 hover:bg-[#2a1f0c] active:scale-[0.99] cursor-pointer disabled:opacity-60"
              >
                {switchingCharacter ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-300 shrink-0" />
                ) : (
                  <Upload className="h-4 w-4 text-amber-300 shrink-0" />
                )}
                <span>اختيار ملف 3D من الجهاز (أي صيغة)</span>
              </button>

              <form onSubmit={(e) => void handleCustomModelUrlSubmit(e)} className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  أو إضافة عبر رابط مباشر (URL):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    dir="ltr"
                    type="url"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://files.catbox.moe/..."
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/20 bg-[#0d1828] px-3 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={switchingCharacter}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/75 bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-500 cursor-pointer disabled:opacity-60"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span>إضافة</span>
                  </button>
                </div>
              </form>

              {(customImportError || characterError) && (
                <div className="rounded-md border border-rose-400/60 bg-[#220e14] px-3 py-2 text-[11px] font-bold text-rose-200">
                  {customImportError || characterError}
                </div>
              )}

              {savedCharacters.length > 0 && (
                <div className="border-t border-white/10 pt-2.5">
                  <div className="mb-2 flex items-center justify-between text-xs font-black text-amber-200">
                    <span>الشخصيات المضافة ({savedCharacters.length})</span>
                  </div>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
                    {savedCharacters.map((saved) => {
                      const isActive = selectedCharacterId === saved.id;
                      const isWarPalette = shouldApplyWarObitoPalette(
                        saved.nameAr,
                        saved.fileName,
                        saved.colorPreset
                      );
                      return (
                        <div
                          key={saved.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                            isActive
                              ? 'border-yellow-300 bg-[#192338]'
                              : 'border-white/12 bg-[#0c1624]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              void onSelectSavedCharacter(saved);
                              setSelectionStep('pick_com');
                              setShowCustomCharModal(false);
                            }}
                            className="min-w-0 flex-1 text-right cursor-pointer"
                          >
                            <div className="truncate text-xs font-black text-white">
                              {saved.nameAr}
                            </div>
                            <div className="truncate text-[10px] font-bold text-slate-400">
                              {saved.subtitleAr}
                            </div>
                          </button>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void onToggleSavedCharacterPalette(saved)}
                              title="تبديل الألوان (الأصلية / أوبيتو)"
                              className={`flex h-8 items-center gap-1 rounded border px-2 text-[10px] font-black cursor-pointer ${
                                isWarPalette
                                  ? 'border-amber-400 bg-[#251908] text-amber-200'
                                  : 'border-white/15 bg-[#101c2e] text-slate-200 hover:border-white/35'
                              }`}
                            >
                              <Palette className="h-3 w-3 shrink-0" />
                              <span>{isWarPalette ? 'أوبيتو' : 'أصلي'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void onDeleteSavedCharacter(saved.id)}
                              aria-label={`حذف ${saved.nameAr}`}
                              className="flex h-8 w-8 items-center justify-center rounded border border-rose-500/50 bg-[#241016] text-rose-200 hover:border-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. CUSTOM STAGE UPLOADER MODAL                                    */}
      {/* ================================================================= */}
      {showCustomStageModal && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-3"
          onClick={() => setShowCustomStageModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-xl border-2 border-indigo-400/80 bg-[#09111d] p-4 text-right shadow-[0_18px_48px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-indigo-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-black text-white">إضافة ساحة قتال 3D مخصصة</h2>
                  <p className="text-[11px] text-slate-300">
                    يدعم GLB, GLTF, FBX, OBJ, ZIP أو رابط مباشر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomStageModal(false)}
                aria-label="إغلاق"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#101c2e] text-slate-200 hover:border-white/40 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <input
                ref={stageFileInputRef}
                type="file"
                accept=".glb,.gltf,.fbx,.obj,.zip"
                className="hidden"
                onChange={(e) => void handleStageFilePick(e)}
              />
              <button
                type="button"
                onClick={() => stageFileInputRef.current?.click()}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg border-2 border-indigo-400/80 bg-[#151c2e] px-3 text-xs font-black text-indigo-100 transition-colors hover:border-indigo-300 hover:bg-[#1d2742] active:scale-[0.99] cursor-pointer"
              >
                <Upload className="h-4 w-4 text-indigo-300 shrink-0" />
                <span>اختيار ملف ساحة من الجهاز</span>
              </button>

              <form onSubmit={(e) => void handleStageUrlSubmit(e)} className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  أو إضافة عبر رابط مباشر (URL):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    dir="ltr"
                    type="url"
                    value={customStageUrlInput}
                    onChange={(e) => setCustomStageUrlInput(e.target.value)}
                    placeholder="https://files.catbox.moe/..."
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/20 bg-[#0d1828] px-3 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/75 bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span>إضافة</span>
                  </button>
                </div>
              </form>

              {customStageError && (
                <div className="rounded-md border border-rose-400/60 bg-[#220e14] px-3 py-2 text-[11px] font-bold text-rose-200">
                  {customStageError}
                </div>
              )}

              {savedStages && savedStages.length > 0 && (
                <div className="border-t border-white/10 pt-2.5">
                  <div className="mb-2 flex items-center justify-between text-xs font-black text-indigo-200">
                    <span>الساحات المضافة ({savedStages.length})</span>
                  </div>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                    {savedStages.map((st) => {
                      const isActive = selectedStage === st.id;
                      return (
                        <div
                          key={st.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                            isActive
                              ? 'border-indigo-300 bg-[#182138]'
                              : 'border-white/12 bg-[#0c1624]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStage(st.id as ArenaStageId);
                              setShowCustomStageModal(false);
                            }}
                            className="min-w-0 flex-1 text-right cursor-pointer"
                          >
                            <div className="truncate text-xs font-black text-white">
                              {st.nameAr}
                            </div>
                            <div className="truncate text-[10px] font-bold text-slate-400">
                              {st.subtitleAr}
                            </div>
                          </button>

                          {onDeleteStage && (
                            <button
                              type="button"
                              onClick={() => void onDeleteStage(st.id)}
                              aria-label={`حذف ${st.nameAr}`}
                              className="flex h-8 w-8 items-center justify-center rounded border border-rose-500/50 bg-[#241016] text-rose-200 hover:border-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
