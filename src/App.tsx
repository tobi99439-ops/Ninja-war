/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { GameHud } from './components/GameHud';
import { OfflineIndicator } from './components/PWAInstallButton';
import { StartTitleScreen } from './components/StartTitleScreen';
import { TitleOverlay } from './components/TitleOverlay';
import { NarutoGameEngine } from './three/NarutoGameEngine';
import {
  ArenaStageId,
  CHARACTER_PRESETS,
  CharacterPreset,
  CharacterPresetId,
  DEFAULT_GRAPHICS_SETTINGS,
  DEFAULT_OBITO_GLB_URL,
  FALLBACK_OBITO_GLB_URL,
  GameMode,
  GraphicsSettings,
  HudSnapshot,
  JutsuId,
  ParticleDensity,
  ShadowQuality,
} from './types/game';
import {
  BundledDeidaraConfig,
  clearDeidaraOverride,
  clearDeidaraTextures,
  clearObitoEyes,
  DeidaraTextureSlot,
  deleteSavedCharacter,
  deleteSavedStage,
  getActiveCharacterSelection,
  loadBundledDeidaraConfig,
  loadDeidaraOverride,
  loadDeidaraTextures,
  loadObitoEyes,
  loadSavedCharactersAndSelection,
  listSavedStages,
  ObitoEyeSide,
  publishDeidaraDefaultsToServer,
  saveCharacterFile,
  saveCharacterUrl,
  saveDeidaraOverrideFile,
  saveDeidaraTextures,
  saveObitoEyes,
  saveStageFile,
  saveStageUrl,
  SavedCustomCharacter,
  SavedCustomStage,
  SavedDeidaraOverride,
  SavedDeidaraTextures,
  SavedObitoEyes,
  setActiveCharacterSelection,
  setDeidaraMeshSlotOverride,
  setDeidaraTextureFlipY,
  setSavedCharacterColorPreset,
  toggleDeidaraSlotFlipY,
} from './utils/characterStorage';
import {
  DeidaraMeshDiagnostic,
  getLastDeidaraMeshDiagnostics,
  subscribeDeidaraMeshDiagnostics,
} from './three/models/deidaraTexturer';
import { isRunCharacterName, shouldApplyWarObitoPalette } from './three/models/warObitoColorizer';
import { setActiveCustomMapSource } from './three/models/customMapEnvironment';

const GRAPHICS_STORAGE_KEY = 'naruto_obito_graphics_v2';

function loadSavedGraphicsSettings(): GraphicsSettings {
  try {
    const raw = window.localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
      const validShadow =
        parsed.shadowQuality === 'off' ||
        parsed.shadowQuality === 'low' ||
        parsed.shadowQuality === 'medium' ||
        parsed.shadowQuality === 'high';
      const validParticle =
        parsed.particleDensity === 'low' ||
        parsed.particleDensity === 'medium' ||
        parsed.particleDensity === 'high';
      if (validShadow && validParticle) {
        return {
          shadowQuality: parsed.shadowQuality as ShadowQuality,
          particleDensity: parsed.particleDensity as ParticleDensity,
        };
      }
    }
  } catch {
    // Fallback to highest graphics default
  }
  return {
    shadowQuality: DEFAULT_GRAPHICS_SETTINGS.shadowQuality,
    particleDensity: DEFAULT_GRAPHICS_SETTINGS.particleDensity,
  };
}

function mergeDeidaraTexturesWithBundled(
  saved: SavedDeidaraTextures | null,
  bundled: BundledDeidaraConfig | null
): SavedDeidaraTextures | null {
  if (!saved && !bundled) return null;
  const slots: SavedDeidaraTextures['slots'] = {};
  for (const slot of ['body', 'mant', 'eye', 'tongue'] as DeidaraTextureSlot[]) {
    const savedSlot = saved?.slots?.[slot];
    const bundledSlot = bundled?.slots?.[slot];
    if (savedSlot) {
      slots[slot] = savedSlot;
    } else if (bundledSlot?.url) {
      slots[slot] = {
        url: bundledSlot.url,
        fileName: bundledSlot.fileName || `${slot}.png`,
        fileSize: 0,
      };
    }
  }
  const slotFlipY: Partial<Record<DeidaraTextureSlot, boolean>> = {
    ...(bundled?.slotFlipY ?? {}),
    ...(saved?.slotFlipY ?? {}),
  };
  const meshSlotOverrides: Record<string, DeidaraTextureSlot> = {
    ...(bundled?.meshSlotOverrides ?? {}),
    ...(saved?.meshSlotOverrides ?? {}),
  };
  const flipY = saved ? saved.flipY : Boolean(bundled?.flipY ?? false);
  const hasContent =
    Object.keys(slots).length > 0 ||
    Object.keys(slotFlipY).length > 0 ||
    Object.keys(meshSlotOverrides).length > 0;
  if (!hasContent) return null;
  return {
    slots,
    flipY,
    slotFlipY: Object.keys(slotFlipY).length > 0 ? slotFlipY : undefined,
    meshSlotOverrides: Object.keys(meshSlotOverrides).length > 0 ? meshSlotOverrides : undefined,
    updatedAt: Math.max(saved?.updatedAt || 0, bundled?.updatedAt || 0) || Date.now(),
  };
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  mode: 'survival',
  hp: 100,
  maxHp: 100,
  chakra: 100,
  maxChakra: 100,
  kamuiActive: false,
  kamuiRemaining: 0,
  hasKamui: true,
  kamuiIntangible: false,
  hasGedoMazo: false,
  gedoMazoActive: false,
  gedoMazoRemaining: 0,
  susanooActive: false,
  susanooStage: null,
  susanooRemaining: 0,
  substitutionLogs: 4,
  maxSubstitutionLogs: 4,
  substitutionRechargePct: 100,
  guardGauge: 100,
  maxGuardGauge: 100,
  isGuarding: false,
  guardBroken: false,
  isChargingChakra: false,
  chakraDashCooldown: 0,
  awakeningGauge: 0,
  awakeningActive: false,
  awakeningRemaining: 0,
  isKakashi: false,
  isItachi: false,
  isMadara: false,
  isDeidara: false,
  isNarutoKurama: false,
  isNarutoSage: false,
  combo: 0,
  score: 0,
  wave: 1,
  maxWaves: 5,
  enemiesRemaining: 0,
  activeTarget: null,
  cooldowns: {
    melee: 0,
    fuma: 0,
    kamui: 0,
    katon: 0,
    rinnegan: 0,
    gedo: 0,
    raikiri: 0,
    suiton: 0,
    amaterasu: 0,
    tsukuyomi: 0,
    susanoo: 0,
    susanoo_ribcage: 0,
    susanoo_armored: 0,
    susanoo_muscular: 0,
    susanoo_perfect: 0,
    c1_birds: 0,
    c2_dragon: 0,
    c3_ultimate: 0,
    rasenshuriken: 0,
    bijuu_dama: 0,
    kurama_roar: 0,
    bijuu_barrage: 0,
    sage_odama: 0,
    sage_kata: 0,
    sage_barrage: 0,
  },
  announcementAr: null,
  finisherActive: false,
  finisherOverlay: 'none',
  finisherFlashOpacity: 0,
  finisherCooldown: 0,
  finisherReady: false,
  isObitoOrTobi: true,
  obitoGazeActive: false,
  obitoGazeCooldown: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const engineRef = useRef<NarutoGameEngine | null>(null);
  const characterSwitchSeqRef = useRef(0);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [selectedMode, setSelectedMode] = useState<GameMode>('survival');
  const [selectedStage, setSelectedStage] = useState<ArenaStageId>(() => {
    try {
      const saved = window.localStorage.getItem('naruto_obito_arena_stage_v2');
      if (saved && typeof saved === 'string') {
        return saved as ArenaStageId;
      }
      return 'amegakure';
    } catch {
      return 'amegakure';
    }
  });
  const [graphicsSettings, setGraphicsSettings] = useState<GraphicsSettings>(
    loadSavedGraphicsSettings
  );
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [customModelLoaded, setCustomModelLoaded] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterPresetId>(
    () => getActiveCharacterSelection() || 'obito_uchiha'
  );
  const [selectedComId, setSelectedComId] = useState<string>('kakashi');
  const [savedCharacters, setSavedCharacters] = useState<SavedCustomCharacter[]>([]);
  const [savedStages, setSavedStages] = useState<SavedCustomStage[]>([]);
  const [runAnimStyle, setRunAnimStyle] = useState<'new' | 'old'>(() => {
    try {
      return (window.localStorage.getItem('naruto_obito_run_style_v1') as 'new' | 'old') || 'new';
    } catch {
      return 'new';
    }
  });

  const handleToggleRunAnimStyle = useCallback(() => {
    const next = runAnimStyle === 'new' ? 'old' : 'new';
    setRunAnimStyle(next);
    try {
      window.localStorage.setItem('naruto_obito_run_style_v1', next);
    } catch {}
    engineRef.current?.setRunAnimationStyle(next);
  }, [runAnimStyle]);

  useEffect(() => {
    listSavedStages()
      .then((stages) => {
        setSavedStages(stages);
        try {
          const saved = window.localStorage.getItem('naruto_obito_arena_stage_v2');
          if (saved && saved !== 'amegakure' && saved !== 'konoha' && saved !== 'kamui') {
            const match = stages.find((s) => s.id === saved);
            if (match) {
              setActiveCustomMapSource(match.fileBlob || match.url || null);
              engineRef.current?.setArenaStage(match.id as ArenaStageId);
            } else if (saved === 'custom_map') {
              setActiveCustomMapSource(null);
              engineRef.current?.setArenaStage('custom_map');
            }
          }
        } catch {}
      })
      .catch(() => {});
  }, []);

  const [switchingCharacter, setSwitchingCharacter] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [hasCustomDeidara, setHasCustomDeidara] = useState(false);
  const deidaraOverrideRef = useRef<SavedDeidaraOverride | null>(null);
  const bundledDeidaraConfigRef = useRef<BundledDeidaraConfig | null>(null);
  const deidaraAutoSyncStartedRef = useRef(false);
  const [deidaraTextures, setDeidaraTextures] = useState<SavedDeidaraTextures | null>(null);
  const deidaraTexturesRef = useRef<SavedDeidaraTextures | null>(null);
  const [obitoEyes, setObitoEyes] = useState<SavedObitoEyes | null>(null);
  const [deidaraPublishState, setDeidaraPublishState] = useState<
    'idle' | 'publishing' | 'published' | 'error'
  >('idle');
  const [publishedApkSizeBytes, setPublishedApkSizeBytes] = useState(0);
  const [deidaraMeshParts, setDeidaraMeshParts] = useState<DeidaraMeshDiagnostic[]>(
    () => getLastDeidaraMeshDiagnostics()
  );

  useEffect(() => {
    return subscribeDeidaraMeshDiagnostics(setDeidaraMeshParts);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const syncSelection = getActiveCharacterSelection() || 'obito_uchiha';
    const skipInitialMaskMan = Boolean(syncSelection && syncSelection !== 'mask_man');

    const initialStage: ArenaStageId = (() => {
      try {
        const saved = window.localStorage.getItem('naruto_obito_arena_stage_v2');
        if (saved && typeof saved === 'string') {
          return saved as ArenaStageId;
        }
        return 'amegakure';
      } catch {
        return 'amegakure';
      }
    })();


    const initialGraphics = loadSavedGraphicsSettings();

    let engine: NarutoGameEngine;
    try {
      engine = new NarutoGameEngine(
        container,
        (snapshot) => {
          setHud(snapshot);
        },
        (loaded) => {
          setCustomModelLoaded(loaded);
        },
        !skipInitialMaskMan,
        initialStage
      );
      engine.setShadowQuality(initialGraphics.shadowQuality);
      engine.setParticleDensity(initialGraphics.particleDensity);
      setWebglError(false);
    } catch {
      setWebglError(true);
      return;
    }
    engineRef.current = engine;

    let cancelled = false;
    const startupSeq = characterSwitchSeqRef.current;
    void (async () => {
      const [{ items, activeId }, deidaraOverride, savedDeidaraTex, bundledConfig, savedObitoEyes] =
        await Promise.all([
          loadSavedCharactersAndSelection(),
          loadDeidaraOverride(),
          loadDeidaraTextures(),
          loadBundledDeidaraConfig(),
          loadObitoEyes(),
        ]);
      if (cancelled) return;
      setSavedCharacters(items);
      setObitoEyes(savedObitoEyes);
      if (savedObitoEyes) {
        engine.setObitoEyeOverrides({
          rightEye: savedObitoEyes.rightEye ? { blob: savedObitoEyes.rightEye.blob, fileName: savedObitoEyes.rightEye.fileName } : undefined,
          leftEye: savedObitoEyes.leftEye ? { blob: savedObitoEyes.leftEye.blob, fileName: savedObitoEyes.leftEye.fileName } : undefined,
        });
      }
      deidaraOverrideRef.current = deidaraOverride;
      bundledDeidaraConfigRef.current = bundledConfig;
      setHasCustomDeidara(Boolean(deidaraOverride));

      const effectiveModelSource = deidaraOverride
        ? deidaraOverride.fileBlob
        : bundledConfig?.hasCustomModel && bundledConfig.modelUrl
          ? bundledConfig.modelUrl
          : null;
      const effectiveModelName = deidaraOverride
        ? deidaraOverride.fileName
        : bundledConfig?.modelFileName || 'deidara.glb';
      if (effectiveModelSource) {
        engine.setPresetModelOverride('deidara', effectiveModelSource, effectiveModelName, 'ديدارا');
      }

      const effectiveTextures = mergeDeidaraTexturesWithBundled(savedDeidaraTex, bundledConfig);
      deidaraTexturesRef.current = effectiveTextures;
      setDeidaraTextures(effectiveTextures);
      if (effectiveTextures) {
        engine.setDeidaraTextureOverrides({
          slots: effectiveTextures.slots,
          flipY: effectiveTextures.flipY,
          slotFlipY: effectiveTextures.slotFlipY,
          meshSlotOverrides: effectiveTextures.meshSlotOverrides,
        });
      }

      if (bundledConfig?.hasCustomModel || (bundledConfig?.slots && Object.keys(bundledConfig.slots).length > 0)) {
        setDeidaraPublishState('published');
      }

      // Auto-sync user's IndexedDB Deidara GLB / 4 PNGs / mappings permanently to server + APK if newer
      const localUpdatedAt = Math.max(deidaraOverride?.updatedAt || 0, savedDeidaraTex?.updatedAt || 0);
      const bundledUpdatedAt = bundledConfig?.updatedAt || 0;
      const needsModelSync = Boolean(deidaraOverride && !bundledConfig?.hasCustomModel);
      const hasLocalChanges = Boolean(
        deidaraOverride ||
          (savedDeidaraTex &&
            (Object.keys(savedDeidaraTex.slots).length > 0 ||
              (savedDeidaraTex.meshSlotOverrides &&
                Object.keys(savedDeidaraTex.meshSlotOverrides).length > 0) ||
              (savedDeidaraTex.slotFlipY && Object.keys(savedDeidaraTex.slotFlipY).length > 0)))
      );
      if (
        !deidaraAutoSyncStartedRef.current &&
        hasLocalChanges &&
        (needsModelSync || !bundledConfig || localUpdatedAt > bundledUpdatedAt)
      ) {
        deidaraAutoSyncStartedRef.current = true;
        setDeidaraPublishState('publishing');
        void publishDeidaraDefaultsToServer(deidaraOverride, effectiveTextures, true).then(
          (res) => {
            if (cancelled) return;
            if (res.ok && res.config) {
              bundledDeidaraConfigRef.current = res.config;
            }
            if (res.apkSizeBytes) {
              setPublishedApkSizeBytes(res.apkSizeBytes);
            }
            setDeidaraPublishState(res.ok ? 'published' : 'error');
          }
        );
      }

      // Register saved `run` character's running animation so all characters & enemies run like `run`
      const runSaved = items.find((item) => isRunCharacterName(item.nameAr, item.fileName));
      if (runSaved) {
        const runSource = runSaved.fileBlob || runSaved.fileUrl || runSaved.url;
        if (runSource) {
          void engine.setRunAnimationSource(runSource, runSaved.fileName || runSaved.nameAr, true);
        }
      }

      if (startupSeq !== characterSwitchSeqRef.current) return;
      const targetId = activeId || syncSelection;
      if (!targetId || targetId === 'mask_man') return;

      setSwitchingCharacter(true);
      try {
        const presetMatch = CHARACTER_PRESETS.find((p) => p.id === targetId);
        if (presetMatch) {
          try {
            const deidaraSource =
              presetMatch.id === 'deidara'
                ? effectiveModelSource || presetMatch.glbUrl
                : presetMatch.glbUrl;
            const deidaraHint =
              presetMatch.id === 'deidara' && effectiveModelSource ? effectiveModelName : undefined;
            await engine.loadCustomObitoModel(deidaraSource, presetMatch.nameAr, deidaraHint);
            if (!cancelled && startupSeq === characterSwitchSeqRef.current) {
              setSelectedCharacterId(presetMatch.id);
              setCustomModelLoaded(true);
            }
            return;
          } catch {
            // Fall through to bundled Mask Man V2 if remote preset fails
          }
        }

        if (cancelled || startupSeq !== characterSwitchSeqRef.current) return;
        const savedMatch = items.find((item) => item.id === targetId);
        if (savedMatch) {
          const primarySource = savedMatch.fileBlob || savedMatch.fileUrl || savedMatch.url;
          if (primarySource) {
            try {
              await engine.loadCustomObitoModel(
                primarySource,
                savedMatch.nameAr,
                savedMatch.fileName,
                { colorPreset: savedMatch.colorPreset }
              );
              if (!cancelled && startupSeq === characterSwitchSeqRef.current) {
                setSelectedCharacterId(savedMatch.id);
                setCustomModelLoaded(true);
              }
              return;
            } catch {
              if (savedMatch.fileBlob && savedMatch.fileUrl && startupSeq === characterSwitchSeqRef.current) {
                try {
                  await engine.loadCustomObitoModel(
                    savedMatch.fileUrl,
                    savedMatch.nameAr,
                    savedMatch.fileName,
                    { colorPreset: savedMatch.colorPreset }
                  );
                  if (!cancelled && startupSeq === characterSwitchSeqRef.current) {
                    setSelectedCharacterId(savedMatch.id);
                    setCustomModelLoaded(true);
                  }
                  return;
                } catch {
                  // Fall through to default if both local & server fail
                }
              }
            }
          }
        }

        if (cancelled || startupSeq !== characterSwitchSeqRef.current) return;
        const localFallback =
          CHARACTER_PRESETS.find((p) => p.id === 'mask_man_v2') ?? CHARACTER_PRESETS[0];
        await engine
          .loadCustomObitoModel(localFallback.glbUrl, localFallback.nameAr)
          .catch(() => engine.loadCustomObitoModel(DEFAULT_OBITO_GLB_URL, CHARACTER_PRESETS[0].nameAr))
          .catch(() => engine.loadCustomObitoModel(FALLBACK_OBITO_GLB_URL));
        if (!cancelled && startupSeq === characterSwitchSeqRef.current) {
          setSelectedCharacterId(localFallback.id);
          void setActiveCharacterSelection(localFallback.id);
          setCustomModelLoaded(true);
        }
      } finally {
        if (!cancelled && startupSeq === characterSwitchSeqRef.current) {
          setSwitchingCharacter(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const target = rootRef.current || document.documentElement;
      void target.requestFullscreen?.().catch(() => {});
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleChangeShadowQuality = useCallback((shadowQuality: ShadowQuality) => {
    setGraphicsSettings((prev) => {
      const next: GraphicsSettings = { ...prev, shadowQuality };
      try {
        window.localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    engineRef.current?.setShadowQuality(shadowQuality);
  }, []);

  const handleChangeParticleDensity = useCallback((particleDensity: ParticleDensity) => {
    setGraphicsSettings((prev) => {
      const next: GraphicsSettings = { ...prev, particleDensity };
      try {
        window.localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    engineRef.current?.setParticleDensity(particleDensity);
  }, []);

  const handleSelectComCharacter = useCallback((presetId: string) => {
    soundEngine.unlock();
    setSelectedComId(presetId);
    void engineRef.current?.loadComPreviewCharacter(presetId);
  }, []);

  const handleSelectCharacterPreset = useCallback(async (preset: CharacterPreset) => {
    const engine = engineRef.current;
    if (!engine) return;
    soundEngine.unlock();
    const seq = ++characterSwitchSeqRef.current;
    setCharacterError(null);
    setSelectedCharacterId(preset.id);
    void setActiveCharacterSelection(preset.id);

    const localOverride = preset.id === 'deidara' ? deidaraOverrideRef.current : null;
    const bundledDeidara =
      preset.id === 'deidara' ? bundledDeidaraConfigRef.current : null;
    const effectiveSource = localOverride
      ? localOverride.fileBlob
      : bundledDeidara?.hasCustomModel && bundledDeidara.modelUrl
        ? bundledDeidara.modelUrl
        : preset.glbUrl;
    const effectiveHint = localOverride
      ? localOverride.fileName
      : bundledDeidara?.hasCustomModel && bundledDeidara.modelUrl
        ? bundledDeidara.modelFileName || 'deidara.glb'
        : undefined;
    const alreadyCached = engine.isCharacterCached(effectiveSource, preset.nameAr, effectiveHint);
    setSwitchingCharacter(!alreadyCached);

    try {
      await engine.loadCustomObitoModel(effectiveSource, preset.nameAr, effectiveHint);
      if (seq !== characterSwitchSeqRef.current) return;
      setCustomModelLoaded(true);
    } catch (err) {
      if (seq !== characterSwitchSeqRef.current) return;
      if (preset.glbUrl !== FALLBACK_OBITO_GLB_URL) {
        try {
          await engine.loadCustomObitoModel(FALLBACK_OBITO_GLB_URL, preset.nameAr);
          if (seq !== characterSwitchSeqRef.current) return;
          setCustomModelLoaded(true);
          if (err instanceof Error && err.message === 'EMPTY_GLB_FILE') {
            setCharacterError(`ملف الرابط (${preset.nameAr}) فارغ — تم تحميل المجسم البديل.`);
          } else {
            setCharacterError(`تعذر تحميل ملف (${preset.nameAr}) — تم تحميل المجسم البديل.`);
          }
          return;
        } catch {
          // Fall through if fallback also fails
        }
      }
      if (seq === characterSwitchSeqRef.current) {
        setCharacterError(`تعذر تحميل مجسم (${preset.nameAr}). تأكد من اتصال الإنترنت.`);
      }
    } finally {
      if (seq === characterSwitchSeqRef.current) {
        setSwitchingCharacter(false);
      }
    }
  }, []);

  const handleSelectSavedCharacter = useCallback(async (saved: SavedCustomCharacter) => {
    const engine = engineRef.current;
    if (!engine) return;
    soundEngine.unlock();
    const seq = ++characterSwitchSeqRef.current;
    setCharacterError(null);
    setSelectedCharacterId(saved.id);
    void setActiveCharacterSelection(saved.id);

    const source = saved.fileBlob || saved.fileUrl || saved.url;
    const alreadyCached = source
      ? engine.isCharacterCached(source, saved.nameAr, saved.fileName, {
          colorPreset: saved.colorPreset,
        })
      : false;
    setSwitchingCharacter(!alreadyCached);

    try {
      if (!source) {
        throw new Error('MISSING_SAVED_SOURCE');
      }
      await engine.loadCustomObitoModel(source, saved.nameAr, saved.fileName, {
        colorPreset: saved.colorPreset,
      });
      if (seq !== characterSwitchSeqRef.current) return;
      setCustomModelLoaded(true);
    } catch {
      if (seq !== characterSwitchSeqRef.current) return;
      if (saved.fileBlob && saved.fileUrl) {
        try {
          await engine.loadCustomObitoModel(
            saved.fileUrl,
            saved.nameAr,
            saved.fileName,
            { colorPreset: saved.colorPreset }
          );
          if (seq !== characterSwitchSeqRef.current) return;
          setCustomModelLoaded(true);
          return;
        } catch {
          // Fall through to error message
        }
      }
      if (seq === characterSwitchSeqRef.current) {
        setCharacterError(`تعذر تحميل الشخصية المحفوظة (${saved.nameAr}).`);
      }
    } finally {
      if (seq === characterSwitchSeqRef.current) {
        setSwitchingCharacter(false);
      }
    }
  }, []);

  const handleToggleSavedCharacterPalette = useCallback(
    async (saved: SavedCustomCharacter) => {
      const currentlyWarObito = shouldApplyWarObitoPalette(
        saved.nameAr,
        saved.fileName,
        saved.colorPreset
      );
      const nextPreset = currentlyWarObito ? 'original' : 'war_obito';
      const updated: SavedCustomCharacter = { ...saved, colorPreset: nextPreset };

      await setSavedCharacterColorPreset(saved.id, nextPreset);
      setSavedCharacters((prev) =>
        prev.map((item) => (item.id === saved.id ? updated : item))
      );

      await handleSelectSavedCharacter(updated);
    },
    [handleSelectSavedCharacter]
  );

  const handleDeleteSavedCharacter = useCallback(
    async (id: string) => {
      await deleteSavedCharacter(id);
      setSavedCharacters((prev) => prev.filter((item) => item.id !== id));
      if (selectedCharacterId === id) {
        void handleSelectCharacterPreset(CHARACTER_PRESETS[0]);
      }
    },
    [handleSelectCharacterPreset, selectedCharacterId]
  );

  const handleLoadCustomModel = useCallback(async (source: string | File) => {
    const engine = engineRef.current;
    if (!engine) return;
    soundEngine.unlock();
    const seq = ++characterSwitchSeqRef.current;
    setCharacterError(null);
    const hintName = typeof source === 'string' ? source : source.name;
    const alreadyCached = engine.isCharacterCached(source, undefined, hintName);
    setSwitchingCharacter(!alreadyCached);
    try {
      await engine.loadCustomObitoModel(source, undefined, hintName);
      if (seq !== characterSwitchSeqRef.current) return;
      const savedEntry =
        typeof source === 'string'
          ? await saveCharacterUrl(source)
          : await saveCharacterFile(source);

      setSavedCharacters((prev) => [
        savedEntry,
        ...prev.filter((item) => item.id !== savedEntry.id),
      ]);
      if (seq === characterSwitchSeqRef.current) {
        setSelectedCharacterId(savedEntry.id);
        setCustomModelLoaded(true);
      }
    } finally {
      if (seq === characterSwitchSeqRef.current) {
        setSwitchingCharacter(false);
      }
    }
  }, []);

  const handleResetCustomModel = useCallback(() => {
    void handleSelectCharacterPreset(CHARACTER_PRESETS[0]);
  }, [handleSelectCharacterPreset]);

  const handleReplaceDeidaraModel = useCallback(
    async (file: File) => {
      const engine = engineRef.current;
      if (!engine) return;
      soundEngine.unlock();
      setCharacterError(null);
      setSwitchingCharacter(true);
      try {
        const saved = await saveDeidaraOverrideFile(file);
        deidaraOverrideRef.current = saved;
        setHasCustomDeidara(true);
        engine.setPresetModelOverride('deidara', saved.fileBlob, saved.fileName, 'ديدارا');

        if (selectedCharacterId === 'deidara') {
          const seq = ++characterSwitchSeqRef.current;
          await engine.loadCustomObitoModel(saved.fileBlob, 'ديدارا', saved.fileName);
          if (seq === characterSwitchSeqRef.current) {
            setCustomModelLoaded(true);
          }
        }
        if (selectedComId === 'deidara') {
          await engine.loadComPreviewCharacter('deidara');
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'EMPTY_GLB_FILE') {
          setCharacterError('الملف المختار فارغ (0 بايت) — اختر ملف GLB صالح لديدارا.');
        } else if (err instanceof Error && err.message === 'INVALID_MODEL_FORMAT') {
          setCharacterError('صيغة الملف غير مدعومة — استخدم ملف .glb أو .gltf أو .fbx.');
        } else {
          setCharacterError('تعذر تحميل مجسم ديدارا من الجهاز. تأكد من سلامة ملف .glb.');
        }
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [selectedCharacterId, selectedComId]
  );

  const handleResetDeidaraModel = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    soundEngine.unlock();
    setCharacterError(null);
    setSwitchingCharacter(true);
    try {
      await clearDeidaraOverride();
      deidaraOverrideRef.current = null;
      setHasCustomDeidara(false);
      const bundled = bundledDeidaraConfigRef.current;
      if (bundled?.hasCustomModel && bundled.modelUrl) {
        engine.setPresetModelOverride(
          'deidara',
          bundled.modelUrl,
          bundled.modelFileName || 'deidara.glb',
          'ديدارا'
        );
      } else {
        engine.setPresetModelOverride('deidara', null);
      }

      const deidaraPreset = CHARACTER_PRESETS.find((p) => p.id === 'deidara');
      if (deidaraPreset && selectedCharacterId === 'deidara') {
        const fallbackSource =
          bundled?.hasCustomModel && bundled.modelUrl ? bundled.modelUrl : deidaraPreset.glbUrl;
        const fallbackHint =
          bundled?.hasCustomModel && bundled.modelUrl
            ? bundled.modelFileName || 'deidara.glb'
            : undefined;
        await engine.loadCustomObitoModel(fallbackSource, deidaraPreset.nameAr, fallbackHint);
      }
      if (selectedComId === 'deidara') {
        await engine.loadComPreviewCharacter('deidara');
      }
    } finally {
      setSwitchingCharacter(false);
    }
  }, [selectedCharacterId, selectedComId]);

  const reloadActiveDeidaraView = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const deidaraPreset = CHARACTER_PRESETS.find((p) => p.id === 'deidara');
    const override = deidaraOverrideRef.current;
    const bundled = bundledDeidaraConfigRef.current;
    const source = override
      ? override.fileBlob
      : bundled?.hasCustomModel && bundled.modelUrl
        ? bundled.modelUrl
        : deidaraPreset?.glbUrl;
    const hintName = override
      ? override.fileName
      : bundled?.hasCustomModel && bundled.modelUrl
        ? bundled.modelFileName || 'deidara.glb'
        : undefined;
    if (selectedCharacterId === 'deidara' && deidaraPreset && source) {
      const seq = ++characterSwitchSeqRef.current;
      await engine.loadCustomObitoModel(source, deidaraPreset.nameAr, hintName);
      if (seq === characterSwitchSeqRef.current) {
        setCustomModelLoaded(true);
      }
    }
    if (selectedComId === 'deidara') {
      await engine.loadComPreviewCharacter('deidara');
    }
  }, [selectedCharacterId, selectedComId]);

  const applyAndStoreDeidaraTextures = useCallback(
    async (saved: SavedDeidaraTextures | null) => {
      const engine = engineRef.current;
      if (!engine) return;
      const merged = mergeDeidaraTexturesWithBundled(saved, bundledDeidaraConfigRef.current);
      deidaraTexturesRef.current = merged;
      setDeidaraTextures(merged);
      engine.setDeidaraTextureOverrides(
        merged
          ? {
              slots: merged.slots,
              flipY: merged.flipY,
              slotFlipY: merged.slotFlipY,
              meshSlotOverrides: merged.meshSlotOverrides,
            }
          : null
      );
      await reloadActiveDeidaraView();
    },
    [reloadActiveDeidaraView]
  );

  const handleSaveDeidaraTextures = useCallback(
    async (updates: Partial<Record<DeidaraTextureSlot, File>>) => {
      soundEngine.unlock();
      setCharacterError(null);
      setSwitchingCharacter(true);
      try {
        const saved = await saveDeidaraTextures(updates);
        await applyAndStoreDeidaraTextures(saved);
      } catch (err) {
        if (err instanceof Error && err.message === 'EMPTY_TEXTURE_FILE') {
          setCharacterError('ملف الصورة المختار فارغ (0 بايت) — اختر صورة PNG صالحة.');
        } else if (err instanceof Error && err.message === 'INVALID_IMAGE_FORMAT') {
          setCharacterError('صيغة الصورة غير مدعومة — استخدم صور PNG أو JPG أو WebP.');
        } else {
          setCharacterError('تعذر تطبيق صور ألوان ديدارا.');
        }
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [applyAndStoreDeidaraTextures]
  );

  const handleToggleDeidaraFlipY = useCallback(async () => {
    soundEngine.unlock();
    setCharacterError(null);
    setSwitchingCharacter(true);
    try {
      const nextFlipY = !(deidaraTexturesRef.current?.flipY ?? false);
      const updated =
        (await setDeidaraTextureFlipY(nextFlipY)) ??
        (await saveDeidaraTextures({}, nextFlipY));
      await applyAndStoreDeidaraTextures(updated);
    } finally {
      setSwitchingCharacter(false);
    }
  }, [applyAndStoreDeidaraTextures]);

  const handleToggleDeidaraSlotFlipY = useCallback(
    async (slot: DeidaraTextureSlot) => {
      soundEngine.unlock();
      setCharacterError(null);
      setSwitchingCharacter(true);
      try {
        const updated = await toggleDeidaraSlotFlipY(slot);
        await applyAndStoreDeidaraTextures(updated);
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [applyAndStoreDeidaraTextures]
  );

  const handleSetDeidaraMeshSlot = useCallback(
    async (meshKey: string, slot: DeidaraTextureSlot) => {
      soundEngine.unlock();
      setCharacterError(null);
      setSwitchingCharacter(true);
      try {
        const updated = await setDeidaraMeshSlotOverride(meshKey, slot);
        await applyAndStoreDeidaraTextures(updated);
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [applyAndStoreDeidaraTextures]
  );

  const handleClearDeidaraTextures = useCallback(async () => {
    soundEngine.unlock();
    setCharacterError(null);
    setSwitchingCharacter(true);
    try {
      await clearDeidaraTextures();
      await applyAndStoreDeidaraTextures(null);
    } finally {
      setSwitchingCharacter(false);
    }
  }, [applyAndStoreDeidaraTextures]);

  const handleSaveObitoEyes = useCallback(
    async (updates: Partial<Record<ObitoEyeSide, File>>) => {
      soundEngine.unlock();
      setCharacterError(null);
      setSwitchingCharacter(true);
      try {
        const saved = await saveObitoEyes(updates);
        setObitoEyes(saved);
        const engine = engineRef.current;
        if (engine) {
          engine.setObitoEyeOverrides({
            rightEye: saved.rightEye ? { blob: saved.rightEye.blob, fileName: saved.rightEye.fileName } : undefined,
            leftEye: saved.leftEye ? { blob: saved.leftEye.blob, fileName: saved.leftEye.fileName } : undefined,
          });
          const curr = selectedCharacterId;
          const preset = CHARACTER_PRESETS.find((p) => p.id === curr);
          if (preset && /أوبيتو|اوبيتو|obito/i.test(preset.nameAr)) {
            const seq = ++characterSwitchSeqRef.current;
            await engine.loadCustomObitoModel(preset.glbUrl, preset.nameAr);
            if (seq === characterSwitchSeqRef.current) {
              setCustomModelLoaded(true);
            }
          }
        }
      } catch {
        setCharacterError('تعذر حفظ عيون أوبيتو المخصصة.');
      } finally {
        setSwitchingCharacter(false);
      }
    },
    [selectedCharacterId]
  );

  const handleClearObitoEyes = useCallback(async () => {
    soundEngine.unlock();
    setCharacterError(null);
    setSwitchingCharacter(true);
    try {
      await clearObitoEyes();
      setObitoEyes(null);
      const engine = engineRef.current;
      if (engine) {
        engine.setObitoEyeOverrides(null);
        const curr = selectedCharacterId;
        const preset = CHARACTER_PRESETS.find((p) => p.id === curr);
        if (preset && /أوبيتو|اوبيتو|obito/i.test(preset.nameAr)) {
          const seq = ++characterSwitchSeqRef.current;
          await engine.loadCustomObitoModel(preset.glbUrl, preset.nameAr);
          if (seq === characterSwitchSeqRef.current) {
            setCustomModelLoaded(true);
          }
        }
      }
    } finally {
      setSwitchingCharacter(false);
    }
  }, [selectedCharacterId]);

  const handlePublishDeidaraPermanent = useCallback(async () => {
    soundEngine.unlock();
    setCharacterError(null);
    setDeidaraPublishState('publishing');
    try {
      const res = await publishDeidaraDefaultsToServer(
        deidaraOverrideRef.current,
        deidaraTexturesRef.current,
        true
      );
      if (res.ok && res.config) {
        bundledDeidaraConfigRef.current = res.config;
      }
      if (res.apkSizeBytes) {
        setPublishedApkSizeBytes(res.apkSizeBytes);
      }
      setDeidaraPublishState(res.ok && res.apkBuilt !== false ? 'published' : 'error');
    } catch {
      setDeidaraPublishState('error');
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleStart = useCallback(
    (mode: GameMode, comPresetId?: string) => {
      soundEngine.unlock();
      engineRef.current?.startGame(mode, comPresetId || selectedComId);
    },
    [selectedComId]
  );

  const handleTriggerJutsu = useCallback((id: JutsuId) => {
    soundEngine.unlock();
    engineRef.current?.triggerJutsu(id);
  }, []);

  const handleTriggerJump = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.triggerJump();
  }, []);

  const handleTriggerFinisher = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.playUltimateFinisher();
  }, []);

  const handleTriggerObitoGaze = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.playObitoGravityColumns();
  }, []);

  const handleTriggerSubstitution = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.triggerSubstitution();
  }, []);

  const handleTriggerChakraDash = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.triggerChakraDash();
  }, []);

  const handleSetGuarding = useCallback((active: boolean) => {
    soundEngine.unlock();
    engineRef.current?.setGuarding(active);
  }, []);

  const handleSetChargingChakra = useCallback((active: boolean) => {
    soundEngine.unlock();
    engineRef.current?.setChargingChakra(active);
  }, []);

  const handleTriggerAwakening = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.triggerAwakening();
  }, []);

  const handleTogglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const handleRestart = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.startGame(selectedMode, selectedComId);
  }, [selectedMode, selectedComId]);

  const handleReturnTitle = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.returnToTitle();
  }, []);

  const handleResetCamera = useCallback(() => {
    engineRef.current?.resetCamera();
  }, []);

  const handleVirtualMove = useCallback((x: number, y: number) => {
    engineRef.current?.setVirtualMove(x, y);
  }, []);

  const handleSelectStage = useCallback((stage: ArenaStageId, customSource?: string | Blob | null) => {
    soundEngine.unlock();
    setSelectedStage(stage);
    if (customSource !== undefined) {
      setActiveCustomMapSource(customSource);
    } else {
      const match = savedStages.find((s) => s.id === stage);
      if (match) {
        setActiveCustomMapSource(match.fileBlob || match.url || null);
      } else {
        setActiveCustomMapSource(null);
      }
    }
    try {
      window.localStorage.setItem('naruto_obito_arena_stage_v2', stage);
    } catch {
      // Ignore storage quota errors
    }
    engineRef.current?.setArenaStage(stage);
  }, [savedStages]);

  const handleSaveStageFile = useCallback(async (file: File) => {
    try {
      const saved = await saveStageFile(file);
      const updated = await listSavedStages();
      setSavedStages(updated);
      handleSelectStage(saved.id as ArenaStageId, saved.fileBlob);
    } catch {}
  }, [handleSelectStage]);

  const handleSaveStageUrl = useCallback(async (url: string) => {
    try {
      const saved = await saveStageUrl(url);
      const updated = await listSavedStages();
      setSavedStages(updated);
      handleSelectStage(saved.id as ArenaStageId, saved.url);
    } catch {}
  }, [handleSelectStage]);

  const handleDeleteSavedStage = useCallback(async (id: string) => {
    try {
      await deleteSavedStage(id);
      const updated = await listSavedStages();
      setSavedStages(updated);
      if (selectedStage === id) {
        handleSelectStage('amegakure');
      }
    } catch {}
  }, [selectedStage, handleSelectStage]);


  return (
    <main ref={rootRef} className="relative h-[100dvh] w-screen overflow-hidden bg-[#2b8cbe]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} />

      {webglError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090a0f]/95 p-6 text-center">
          <div className="max-w-sm rounded-xl border border-white/15 bg-[#121521] p-6 shadow-2xl">
            <h2 className="text-lg font-black text-white">تعذر تشغيل محرك العرض 3D (WebGL)</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              قام المتصفح بتقييد سياق WebGL مؤقتاً. أعد تحميل الصفحة أو افتح علامة تبويب جديدة لاستعادة العرض ثلاثي الأبعاد.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 cursor-pointer"
            >
              إعادة تحميل اللعبة
            </button>
          </div>
        </div>
      )}

      {hud.phase === 'title' ? (
        <>
          <TitleOverlay
            selectedMode={selectedMode}
            onSelectMode={setSelectedMode}
            selectedStage={selectedStage}
            onSelectStage={handleSelectStage}
            onStart={handleStart}
            onBackToStartScreen={() => setShowStartScreen(true)}
            muted={muted}
            onToggleMute={handleToggleMute}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            customModelLoaded={customModelLoaded}
            selectedCharacterId={selectedCharacterId}
            selectedComId={selectedComId}
            onSelectComCharacter={handleSelectComCharacter}
            savedCharacters={savedCharacters}
            switchingCharacter={switchingCharacter}
            characterError={characterError}
            onSelectCharacterPreset={handleSelectCharacterPreset}
            onSelectSavedCharacter={handleSelectSavedCharacter}
            onToggleSavedCharacterPalette={handleToggleSavedCharacterPalette}
            onDeleteSavedCharacter={handleDeleteSavedCharacter}
            onLoadCustomModel={handleLoadCustomModel}
            onResetCustomModel={handleResetCustomModel}
            hasCustomDeidara={hasCustomDeidara}
            onReplaceDeidaraModel={handleReplaceDeidaraModel}
            onResetDeidaraModel={handleResetDeidaraModel}
            deidaraTextures={deidaraTextures}
            deidaraMeshParts={deidaraMeshParts}
            onSaveDeidaraTextures={handleSaveDeidaraTextures}
            onToggleDeidaraFlipY={handleToggleDeidaraFlipY}
            onToggleDeidaraSlotFlipY={handleToggleDeidaraSlotFlipY}
            onSetDeidaraMeshSlot={handleSetDeidaraMeshSlot}
            onClearDeidaraTextures={handleClearDeidaraTextures}
            deidaraPublishState={deidaraPublishState}
            publishedApkSizeBytes={publishedApkSizeBytes}
            onPublishDeidaraPermanent={handlePublishDeidaraPermanent}
            obitoEyes={obitoEyes}
            onSaveObitoEyes={handleSaveObitoEyes}
            onClearObitoEyes={handleClearObitoEyes}
            savedStages={savedStages}
            onSaveStageFile={handleSaveStageFile}
            onSaveStageUrl={handleSaveStageUrl}
            onDeleteStage={handleDeleteSavedStage}
            runAnimStyle={runAnimStyle}
            onToggleRunAnimStyle={handleToggleRunAnimStyle}
          />
          {showStartScreen && (
            <StartTitleScreen onEnter={() => setShowStartScreen(false)} />
          )}
        </>
      ) : (
        <GameHud
          hud={hud}
          muted={muted}
          isFullscreen={isFullscreen}
          selectedStage={selectedStage}
          onSelectStage={handleSelectStage}
          selectedCharacterId={selectedCharacterId}
          savedCharacters={savedCharacters}
          switchingCharacter={switchingCharacter}
          characterError={characterError}
          shadowQuality={graphicsSettings.shadowQuality}
          particleDensity={graphicsSettings.particleDensity}
          onChangeShadowQuality={handleChangeShadowQuality}
          onChangeParticleDensity={handleChangeParticleDensity}
          onSelectCharacterPreset={handleSelectCharacterPreset}
          onSelectSavedCharacter={handleSelectSavedCharacter}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onTriggerJutsu={handleTriggerJutsu}
          onTriggerJump={handleTriggerJump}
          onTriggerFinisher={handleTriggerFinisher}
          onTriggerObitoGaze={handleTriggerObitoGaze}
          onTriggerSubstitution={handleTriggerSubstitution}
          onTriggerChakraDash={handleTriggerChakraDash}
          onSetGuarding={handleSetGuarding}
          onSetChargingChakra={handleSetChargingChakra}
          onTriggerAwakening={handleTriggerAwakening}
          onTogglePause={handleTogglePause}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
          onResetCamera={handleResetCamera}
          onVirtualMove={handleVirtualMove}
        />
      )}
      <OfflineIndicator />
    </main>
  );
}
