import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import {
  ActiveEnemyHud,
  ArenaStageId,
  CHARACTER_PRESETS,
  CharacterPreset,
  DEFAULT_OBITO_GLB_URL,
  FALLBACK_OBITO_GLB_URL,
  GameMode,
  GamePhase,
  HudSnapshot,
  JutsuId,
  OBITO_JUTSU_LIST,
  ParticleDensity,
  ShadowQuality,
  SusanooStage,
} from '../types/game';
import { haptics } from '../utils/haptics';
import { createShinobiMaterials, ShinobiMaterials } from './materials';
import { buildAmegakureEnvironment } from './models/amegakureEnvironment';

import {
  buildCustomMapEnvironment,
  disposeCustomMapTemplateCache,
} from './models/customMapEnvironment';
import { createEnemyModel, EnemyKind, EnemyRig } from './models/enemyModels';
import { ARENA_RADIUS, buildShinobiEnvironment, EnvironmentObjects } from './models/environment';
import { buildKonohaEnvironment } from './models/konohaEnvironment';
import { createGiantFumaShuriken } from './models/obitoModel';
import {
  CharacterBones,
  CustomGltfCharacter,
  LoadedCharacterTemplate,
  loadCharacterTemplate,
  loadExternalDeathAnimationTemplate,
  loadFbxIdleAnimationClipOnly,
  loadObitoGltfModel,
  loadUalAnimationLibrary,
  mapBonesOnObject,
} from './models/gltfObitoLoader';
import {
  applyAnimeCelShadingToMaterial,
  enhanceCharacterMaterialVisuals,
  resolveEnhancedCharacterRole,
  setCharacterTextureMaxAnisotropy,
} from './models/characterVisualEnhancer';
import {
  BakedCombatAnimation,
  BakedDeathAnimation,
  BakedIdleAnimation,
  BakedRunAnimation,
  TargetRetargetState,
  UalRetargetDriver,
} from './models/runRetargeter';
import {
  CharacterColorPreset,
  isDeidaraName,
  isItachiName,
  isKakashiName,
  isMadaraName,
  isMadaraRikudoName,
  isMaskManV2Name,
  isNarutoKuramaName,
  isNarutoSageName,
  isObitoUchihaName,
  isOriginalObitoName,
  isRunCharacterName,
} from './models/warObitoColorizer';
import {
  DeidaraTextureOverrideInput,
  setActiveDeidaraTextureOverrides,
} from './models/deidaraTexturer';
import {
  applyCustomObitoEyesToModel,
  ObitoEyeOverrideInput,
  setActiveObitoEyeOverrides,
} from './models/obitoEyeCustomizer';
import {
  buildGedoMazoRig,
  disposeGedoMazoTemplateCache,
  GedoMazoRig,
  preloadGedoMazoModel,
} from './models/gedoMazoModel';
import {
  buildSusanooRig,
  disposeSusanooTemplateCache,
  preloadSusanooModel,
  SusanooRig,
} from './models/susanooModel';
import {
  createHeadCollarPhysicsSolver,
  type HeadCollarPhysicsSolver,
} from './models/headCollarPhysics';
import {
  createCloakPhysicsSolver,
  type CloakPhysicsSolver,
} from './models/cloakPhysics';
import { SkillParticleManager } from './particleEffects';
import { SlashRibbonSystem } from './slashRibbonSystem';
import {
  createContactShadowTexture,
  createDamageNumberTexture,
  createGroundCrackTexture,
  createKamuiVortexTexture,
  createRealisticFireTexture,
  createScorchEmberTexture,
  createScorchImpactTexture,
  createSmokeCloudTexture,
  createSoftGlowTexture,
  createSummoningSealTexture,
} from './textures';

import {
  createFireBlastDomeMaterial,
  createFireTrailConeMaterial,
  createVolumetricFireCoreMaterial,
  createVolumetricFireMantleMaterial,
  createVolumetricFireShellMaterial,
} from './fireShader';

// Pre-allocated math helpers (zero GC inside animation loop)
const _moveDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _tempVecA = new THREE.Vector3();
const _tempVecB = new THREE.Vector3();
const _tempQuatA = new THREE.Quaternion();
const _forwardZ = new THREE.Vector3(0, 0, 1);
const _measureBoxA = new THREE.Box3();
const _measureSizeA = new THREE.Vector3();
const _finisherVecA = new THREE.Vector3();
const _finisherVecB = new THREE.Vector3();
const _finisherColorA = new THREE.Color();
const _finisherColorB = new THREE.Color(0x020208);
const _finisherRimColor = new THREE.Color(0xf97316);

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

type PlayerAnimState = 'idle' | 'run' | 'attack';

const CHARACTER_WORLD_SCALE = 1.35;
const RUN_DEFAULT_CLIP_URL = '/assets/aistudio/tobi_run_8aa50fca.txt';
const RUN_RUN_CLIP_NEW_URL = 'https://files.catbox.moe/7j2k57.glb';
const RUN_IDLE_CLIP_NEW_URL = 'https://files.catbox.moe/7j2k57.glb';
const RUN_IDLE_CLIP_OLD_URL = 'https://files.catbox.moe/p620ou.fbx';
let activeRunClipUrl = RUN_IDLE_CLIP_NEW_URL;

const RUN_COMBO_CLIP_URL = 'https://files.catbox.moe/ccgq05.glb';
const DEATH_ANIM_URL = 'https://files.catbox.moe/tinbc4.fbx';
const UAL_ANIM_LIBRARY_URL = 'https://files.catbox.moe/sejee4.glb';
const RUN_COMBO_SPEED = 1.5;
const RUN_COMBO_WINDOWS: ReadonlyArray<{
  start: number;
  end: number;
  hitTime: number;
  damage: number;
  knockback: number;
  heavy: boolean;
}> = [
  { start: 0.45, end: 1.63, hitTime: 0.78, damage: 24, knockback: 7.0, heavy: false },
  { start: 1.63, end: 2.97, hitTime: 2.04, damage: 28, knockback: 8.5, heavy: false },
  { start: 2.97, end: 4.35, hitTime: 3.48, damage: 42, knockback: 14.5, heavy: true },
];

const ENEMY_CHARACTER_PRESETS: CharacterPreset[] = CHARACTER_PRESETS.filter(
  (preset) =>
    preset.id === 'kakashi' ||
    preset.id === 'madara' ||
    preset.id === 'itachi' ||
    preset.id === 'deidara' ||
    preset.id === 'obito_uchiha' ||
    preset.id === 'mask_man_v2' ||
    preset.id === 'naruto_kurama' ||
    preset.id === 'naruto_sage'
);

interface CachedPlayerRigEntry {
  cacheKey: string;
  obito: CustomGltfCharacter;
  physicsSolver: HeadCollarPhysicsSolver | null;
  cloakSolver: CloakPhysicsSolver | null;
  soleClearance: number;
  isActualRunSource: boolean;
  isTobiV2: boolean;
  isObitoUchiha: boolean;
  isOriginalObito: boolean;
  isMadara: boolean;
  isKakashi: boolean;
  isItachi: boolean;
  isDeidara: boolean;
  isNarutoKurama: boolean;
  isNarutoSage: boolean;
  hasNativeLocomotion: boolean;
  hasKamui: boolean;
  hasGedoMazo: boolean;
  hasTobiV2Moveset: boolean;
  isIntangibleKamuiUser: boolean;
  runTargetState: TargetRetargetState | null;
  runTargetAnimRef: BakedRunAnimation | null;
  combatTargetState: TargetRetargetState | null;
  combatTargetAnimRef: BakedCombatAnimation | null;
  deathTargetState: TargetRetargetState | null;
  deathTargetAnimRef: BakedDeathAnimation | null;
  idleTargetState: TargetRetargetState | null;
  idleTargetAnimRef: BakedIdleAnimation | null;
  boundRunClipRef: THREE.AnimationClip | null;
  boundIdleClipRef: THREE.AnimationClip | null;
  ualActions?: UalPlayerActionBundle | null;
  lastUsedMs: number;
}

interface UalPlayerActionBundle {
  idle: THREE.AnimationAction;
  run: THREE.AnimationAction | null;
  usesPreviousRun: boolean;
  jumpStart: THREE.AnimationAction | null;
  jumpLoop: THREE.AnimationAction | null;
  jumpLand: THREE.AnimationAction | null;
  combo: THREE.AnimationAction[];
  jutsu: THREE.AnimationAction | null;
  activeAction: THREE.AnimationAction | null;
}

interface UalEnemyActionBundle {
  idle: THREE.AnimationAction;
  run: THREE.AnimationAction | null;
  usesPreviousRun: boolean;
  combo: THREE.AnimationAction[];
  jutsu: THREE.AnimationAction | null;
  activeAction: THREE.AnimationAction | null;
}

interface EnemyEntity {
  id: string;
  presetId: string;
  kind: EnemyKind;
  nameAr: string;
  titleAr: string;
  isBoss: boolean;
  rig: EnemyRig;
  shadow: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  attackWindup: number;
  hitFlashTimer: number;
  walkPhase: number;
  stunTimer: number;
  stunSparkTimer: number;
  runTargetState: TargetRetargetState | null;
  idleTargetState: TargetRetargetState | null;
  combatTargetState: TargetRetargetState | null;
  deathTargetState: TargetRetargetState | null;
  runBlend: number;
  idleBlend: number;
  runPhaseOffset: number;
  soleClearance: number;
  combatActive: boolean;
  combatStep: number;
  combatClipTime: number;
  combatEndTime: number;
  combatHitTime: number;
  combatHitPending: boolean;
  combatBlend: number;
  animState: PlayerAnimState;
  jutsuCooldown: number;
  jutsuCycle: number;
  jutsuCastTimer: number;
  slashRibbons: SlashRibbonSystem | null;
  mixer: THREE.AnimationMixer | null;
  idleAction: THREE.AnimationAction | null;
  runAction: THREE.AnimationAction | null;
  ualActions?: UalEnemyActionBundle | null;
  isCustomTemplateRig: boolean;
  cloakPhysicsSolver: CloakPhysicsSolver | null;
  isDying: boolean;
  deathTimer: number;
  deathDuration: number;
  deathBlend: number;
  raikiriTimer: number;
  raikiriHitDone: boolean;
}

type FinisherPhase = 'jump_ascend' | 'slow_zoom' | 'dark_dive' | 'ko_showcase';

interface FinisherState {
  phase: FinisherPhase;
  elapsed: number;
  phaseElapsed: number;
  targetId: string;
  isAutoFinalKill: boolean;
  susanooWasVisible: boolean;
  startPlayerPos: THREE.Vector3;
  peakPlayerPos: THREE.Vector3;
  impactPlayerPos: THREE.Vector3;
  startCamPos: THREE.Vector3;
  savedFov: number;
  timeScale: number;
  shakeFramesRemaining: number;
  overlay: 'none' | 'ko' | 'victory';
  attackStarted: boolean;
  impactTriggered: boolean;
  attackUsesRunCombat: boolean;
  attackUsesUalCombo: boolean;
  attackUsesClip: boolean;
  attackAction: THREE.AnimationAction | null;
  flyActive: boolean;
  flyVelX: number;
  flyVelY: number;
  flyVelZ: number;
  flyRotX: number;
  flySpinVel: number;
  savedLighting: {
    bgHex: number;
    fogHex: number;
    fogDensity: number;
    envIntensity: number;
    hemiSkyHex: number;
    hemiGroundHex: number;
    hemiIntensity: number;
    keyHex: number;
    keyIntensity: number;
    rimHex: number;
    rimIntensity: number;
    exposure: number;
  };
}

interface ElementalProjectile {
  element: 'lightning' | 'fire' | 'water';
  owner: 'player' | 'enemy';
  group: THREE.Group;
  spinGroup?: THREE.Group;
  coreMat: THREE.Material;
  outerMat: THREE.Material;
  haloMat: THREE.SpriteMaterial;
  fireShaderMaterials: THREE.ShaderMaterial[];
  sprites: Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    spinSpeed: number;
    baseScale: number;
  }>;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  trailTimer: number;
  baseScale: number;
  damage: number;
  blastRadius: number;
  kamuiBypassed: boolean;
}

interface ThrownFuma {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  elapsed: number;
  returning: boolean;
  hitIds: Set<string>;
}

interface FireballEntity {
  group: THREE.Group;
  spinGroup: THREE.Group;
  coreMat: THREE.ShaderMaterial;
  mantleMat: THREE.ShaderMaterial;
  outerMat: THREE.ShaderMaterial;
  trailMat: THREE.ShaderMaterial;
  haloMat: THREE.SpriteMaterial;
  fireShaderMaterials: THREE.ShaderMaterial[];
  flameSprites: Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    spinSpeed: number;
    baseScale: number;
  }>;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  trailTimer: number;
  baseScale: number;
  damage: number;
  blastRadius: number;
  isMassive: boolean;
}

interface ShockRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
  baseOpacity: number;
}

interface SphereShock {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
  baseOpacity: number;
  shaderMat?: THREE.ShaderMaterial;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  rotVel: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  baseOpacity: number;
}

interface FallingRod {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  velY: number;
  life: number;
  landed: boolean;
}

interface HitSpark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

interface GroundMark {
  group: THREE.Group;
  baseMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial | null;
  life: number;
  maxLife: number;
  glowDuration: number;
  baseOpacity: number;
  glowOpacity: number;
  targetScale: number;
}

interface GroundDebris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  baseScale: THREE.Vector3;
  life: number;
  maxLife: number;
  bounced: boolean;
}

interface SlashArc {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startRoll: number;
  spinSpeed: number;
  baseOpacity: number;
}

interface DarkVortex {
  group: THREE.Group;
  rings: THREE.Mesh[];
  life: number;
  maxLife: number;
  maxScale: number;
}

interface ChakraChainWhip {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ActiveGedoMazo {
  rig: GedoMazoRig;
  pos: THREE.Vector3;
  yaw: number;
  phase: 'seal' | 'emerging' | 'active' | 'vanishing';
  phaseTimer: number;
  sealDuration: number;
  emergeDuration: number;
  activeDuration: number;
  vanishDuration: number;
  dotTimer: number;
  lightningTimer: number;
  smokeTimer: number;
  roared?: boolean;
  sealMesh?: THREE.Mesh;
  sealMat?: THREE.MeshBasicMaterial;
}

interface ActiveSusanooState {
  stage: SusanooStage;
  rig: SusanooRig;
  phase: 'surging' | 'active' | 'vanishing';
  phaseTimer: number;
  surgeDuration: number;
  activeDuration: number;
  vanishDuration: number;
  surgeDirX: number;
  surgeDirZ: number;
  surgeSpeed: number;
  surgeStrikeDone: boolean;
  currentLean: number;
  slashSweepTimer: number;
  slashSweepDuration: number;
  comboStep: number;
  stridePhase: number;
  pilotWorldPos: THREE.Vector3;
  emberTimer: number;
  groundRingMesh: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
}

interface SusanooSlashWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  damage: number;
  accentColor: number;
  hitIds: Set<string>;
}

interface LightningBoltVfx {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

interface DamageNumberPopup {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  velY: number;
  life: number;
  maxLife: number;
}

interface AmaterasuZone {
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  auraMesh: THREE.Mesh;
  auraMat: THREE.MeshBasicMaterial;
  flameSprites: Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    baseScale: number;
    offsetX: number;
    offsetZ: number;
    phase: number;
  }>;
  pos: THREE.Vector3;
  targetEnemyId: string | null;
  life: number;
  maxLife: number;
  dotTimer: number;
  particleTimer: number;
  radius: number;
  dotDamage: number;
}

type ClayExplosiveKind = 'c1_bird' | 'c2_dragon' | 'c3_bomb';

interface ClayExplosiveEntity {
  kind: ClayExplosiveKind;
  group: THREE.Group;
  leftWing: THREE.Object3D | null;
  rightWing: THREE.Object3D | null;
  materials: THREE.Material[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  speed: number;
  life: number;
  maxLife: number;
  trailTimer: number;
  blastRadius: number;
  damage: number;
  knockback: number;
  homingRange: number;
  detonateOnImpact: boolean;
  targetEnemyId: string | null;
}

type KuramaProjectileKind = 'rasenshuriken' | 'bijuu_dama' | 'sage_odama';

interface KuramaProjectileEntity {
  kind: KuramaProjectileKind;
  group: THREE.Group;
  spinGroup: THREE.Group;
  materials: THREE.Material[];
  haloMat: THREE.SpriteMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  speed: number;
  life: number;
  maxLife: number;
  trailTimer: number;
  baseScale: number;
  blastRadius: number;
  damage: number;
  knockback: number;
  targetEnemyId: string | null;
}

interface SubstitutionLogEntity {
  group: THREE.Group;
  velY: number;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
}


export class NarutoGameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onModelLoaded?: (loaded: boolean) => void;
  private modelLoadVersion = 0;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private readonly isMobileDevice: boolean;
  private mobileDprCap = 2.0;
  private performanceTier = 0; // 0 = Ultra High (100%), 1..3 = automatic anti-stutter guard tiers
  private governorParticleMult = 1.0;
  private governorShadowCap = 2048;
  private slowFrameAccum = 0;
  private fastFrameAccum = 0;
  private pageHidden = false;
  private contextLost = false;
  private frameId = 0;
  private clock = new THREE.Clock();
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private orientationResizeTimeout: number | null = null;

  private materials: ShinobiMaterials;
  private environment: EnvironmentObjects;
  private arenaStage: ArenaStageId = 'konoha';
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private customObito: CustomGltfCharacter | null = null;
  private maxAniso = 8;
  private bakedRunAnim: BakedRunAnimation | null = null;
  private loadedRunClip: THREE.AnimationClip | null = null;
  private bakedCombatAnim: BakedCombatAnimation | null = null;
  private bakedRunIdleAnim: BakedIdleAnimation | null = null;
  private loadedRunIdleClip: THREE.AnimationClip | null = null;
  private combatPreloadStarted = false;
  private idlePreloadStarted = false;
  private playerRunTargetState: TargetRetargetState | null = null;
  private playerCombatTargetState: TargetRetargetState | null = null;
  private playerIdleTargetState: TargetRetargetState | null = null;
  private playerBakedRunBlend = 0;
  private playerRunTime = 0;
  private playerBakedIdleBlend = 0;
  private playerIdleTime = 0;
  private playerAnimState: PlayerAnimState = 'idle';
  private playerSoleClearance = 0.095;
  private customObitoIsRunSource = true;
  private customObitoIsActualRunFile = false;
  private hasExplicitRunSource = false;
  private runAnimSourceVersion = 0;
  private gunbaiSwayRotY = 0;
  private gunbaiSwayVelY = 0;
  private gunbaiSwayRotZ = 0;
  private gunbaiSwayVelZ = 0;
  private gunbaiSwayBobX = 0;
  private gunbaiSwayVelBobX = 0;
  private runCombatActive = false;
  private runCombatStep = 0;
  private runCombatClipTime = 0;
  private runCombatEndTime = 0;
  private runCombatBlend = 0;
  private runCombatComboResetTimer = 0;
  private runCombatPendingHit: {
    hitClipTime: number;
    damage: number;
    knockback: number;
    heavy: boolean;
  } | null = null;
  private skillParticles: SkillParticleManager;
  private slashRibbons: SlashRibbonSystem;
  private obitoShadow: THREE.Mesh;
  private comShadow: THREE.Mesh;
  private shadowQuality: ShadowQuality = 'high';
  private particleDensity: ParticleDensity = 'high';
  private particleDensityScale = 1.0;
  private selectedComPresetId = 'kakashi';
  private comPreviewRig: CustomGltfCharacter | null = null;
  private comPreviewPhysicsSolver: HeadCollarPhysicsSolver | null = null;
  private comPreviewCloakSolver: CloakPhysicsSolver | null = null;
  private comPreviewSoleClearance = 0.095;
  private comPreviewIdleAction: THREE.AnimationAction | null = null;
  private comPreviewPresetId: string | null = null;
  private comPreviewLoadVersion = 0;
  private storm4SelectActive = false;
  private kamuiPortalMesh: THREE.Mesh;
  private kamuiOuterRingMesh: THREE.Mesh;
  private contactShadowTex: THREE.CanvasTexture;
  private kamuiTex: THREE.CanvasTexture;
  private fireGlowTex: THREE.CanvasTexture;
  private fireFlameTex: THREE.CanvasTexture;
  private smokeCloudTex: THREE.CanvasTexture;
  private scorchTex: THREE.CanvasTexture;
  private scorchEmberTex: THREE.CanvasTexture;
  private groundCrackTex: THREE.CanvasTexture;
  private summoningSealTex: THREE.CanvasTexture;
  private damageNumberTextures = new Map<number, THREE.CanvasTexture>();
  private hasGedoMazo = false;
  private hasTobiV2Moveset = false;
  private isMadara = false;
  private isKakashi = false;
  private isItachi = false;
  private isDeidara = false;
  private isNarutoKurama = false;
  private isNarutoSage = false;
  private hasKamui = true;
  private isIntangibleKamuiUser = false;
  private isObitoOrTobi = false;
  private obitoGazeActive = false;
  private obitoGazeCooldown = 0;
  private obitoGravityState: {
    active: boolean;
    timer: number;
    stage: 'gaze' | 'dropping' | 'impact';
    targetEnemy: EnemyEntity;
    reticleMesh: THREE.Mesh;
    columns: Array<{ mesh: THREE.Mesh; startPos: THREE.Vector3; targetPos: THREE.Vector3 }>;
    savedCamPos: THREE.Vector3;
    savedCamLook: THREE.Vector3;
  } | null = null;
  private customObitoPhysicsSolver: HeadCollarPhysicsSolver | null = null;
  private customObitoCloakSolver: CloakPhysicsSolver | null = null;
  private activePlayerRigCacheKey: string | null = null;
  private playerRigCache = new Map<string, CachedPlayerRigEntry>();
  private playerRigInflight = new Map<string, Promise<CachedPlayerRigEntry>>();
  private blobCacheIds = new WeakMap<Blob, string>();
  private nextBlobCacheId = 1;
  private enemyPresetTemplates = new Map<string, LoadedCharacterTemplate>();
  private enemyPresetLoads = new Map<string, Promise<LoadedCharacterTemplate | null>>();
  private enemyPresetVersions = new Map<string, number>();
  private startGameSeq = 0;
  private presetModelOverrides = new Map<
    string,
    { source: string | Blob; fileName?: string; labelAr?: string }
  >();
  private deidaraTextureRevision = 0;
  private bakedDeathAnim: BakedDeathAnimation | null = null;
  private deathPreloadStarted = false;
  private playerDeathTargetState: TargetRetargetState | null = null;
  private ualRetargetDriver: UalRetargetDriver | null = null;
  private ualPreloadStarted = false;
  private enemyUalClipsByPreset = new Map<
    string,
    {
      idle: THREE.AnimationClip;
      run: THREE.AnimationClip | null;
      usesPreviousRun: boolean;
      combo: THREE.AnimationClip[];
      jutsu: THREE.AnimationClip | null;
    }
  >();
  private madaraJumpPhase: 'none' | 'start' | 'loop' | 'land' = 'none';
  private madaraJumpPhaseTimer = 0;
  private madaraAttackStep = 0;
  private madaraActiveAttackAction: THREE.AnimationAction | null = null;
  private playerDying = false;
  private playerDeathTimer = 0;
  private playerDeathDuration = 3.0;
  private playerDeathBlend = 0;
  private playerRaikiriState: {
    phase: 'charging' | 'strike';
    elapsed: number;
    strikeElapsed: number;
    targetId: string | null;
    impactApplied: boolean;
    sparkEmitTimer: number;
    boltTimer: number;
  } | null = null;
  private playerRaikiriVfx: {
    group: THREE.Group;
    coreMat: THREE.MeshBasicMaterial;
    outerMat: THREE.MeshBasicMaterial;
    haloMat: THREE.SpriteMaterial;
    haloSprite: THREE.Sprite;
  } | null = null;
  private playerOriginalMaterials = new Map<
    THREE.Material,
    {
      transparent: boolean;
      opacity: number;
      depthWrite: boolean;
      emissiveHex: number | null;
      emissiveIntensity: number;
    }
  >();
  private playerIntangibleVisualActive = false;
  private gedoSummonVersion = 0;
  private susanooSummonVersion = 0;
  private impactLight: THREE.PointLight;

  // Shared VFX geometries/materials (mobile-tuned subdivision set in constructor)
  private sparkGeo = new THREE.OctahedronGeometry(0.075, 0);
  private fireballCoreGeo = new THREE.SphereGeometry(0.46, 14, 12);
  private fireballOuterGeo = new THREE.SphereGeometry(0.86, 14, 12);
  private fireVolumeGeo: THREE.BufferGeometry;
  private fireTrailConeGeo: THREE.BufferGeometry;
  private sphereShockGeo: THREE.BufferGeometry;
  private ringGeo = new THREE.RingGeometry(0.62, 1.0, 28);
  private rodGeo = new THREE.CylinderGeometry(0.035, 0.015, 2.4, 8);
  private groundDecalGeo = new THREE.PlaneGeometry(1, 1);
  private stoneDebrisGeo = new THREE.DodecahedronGeometry(0.16, 0);
  private stoneDebrisMat = new THREE.MeshStandardMaterial({
    color: 0x455c7d,
    roughness: 0.86,
    metalness: 0.08,
  });
  private slashArcGeo = new THREE.RingGeometry(0.95, 1.95, 22, 1, 0, Math.PI * 1.15);
  private vortexRingGeo = new THREE.TorusGeometry(1.15, 0.09, 6, 24);
  private chainGeo = new THREE.CylinderGeometry(0.055, 0.018, 5.2, 8);

  // Game state
  private phase: GamePhase = 'title';
  private mode: GameMode = 'survival';
  private wave = 1;
  private maxWaves = 5;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private announcementAr: string | null = null;
  private announcementTimer = 0;
  private waveTransitionTimer = 0;

  // Player state
  private playerPos = new THREE.Vector3(0, 0, 2);
  private playerVel = new THREE.Vector3(0, 0, 0);
  private playerYaw = 0;
  private playerOnGround = true;
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerChakra = 100;
  private playerMaxChakra = 100;
  private walkPhase = 0;
  private moveVelX = 0;
  private moveVelZ = 0;
  private currentMoveSpeed = 0;
  private turnLean = 0;
  private airTime = 0;
  private landingTimer = 0;
  private meleeStep = 0;
  private meleeAnimTimer = 0;
  private meleeAnimDuration = 0.30;
  private meleeComboResetTimer = 0;
  private comboSpinYaw = 0;
  private jutsuAnimTimer = 0;
  private jutsuAnimDuration = 0.45;
  private activeJutsuAnim: JutsuId = 'melee';
  private kamuiTimer = 0;
  private hitInvulnTimer = 0;
  private cameraShake = 0;
  private prevPlayerOnGround = true;
  private prevWasAttackingOrJutsu = false;
  private lastHudPush = 0;

  // Naruto Storm 4 Battle Systems (Substitution Logs, Guard, Chakra Charge, Chakra Dash, Awakening)
  private substitutionLogs = 4;
  private readonly maxSubstitutionLogs = 4;
  private substitutionRechargeTimer = 0;
  private readonly substitutionRechargeDuration = 7.5;
  private guardGauge = 100;
  private readonly maxGuardGauge = 100;
  private isGuarding = false;
  private guardBroken = false;
  private guardBreakTimer = 0;
  private isChargingChakra = false;
  private chakraChargeEmitTimer = 0;
  private chakraDashCooldown = 0;
  private chakraDashTimer = 0;
  private awakeningGauge = 0;
  private awakeningActive = false;
  private awakeningTimer = 0;
  private readonly awakeningDuration = 14.0;
  private awakeningSparkTimer = 0;
  private substitutionLogEntities: SubstitutionLogEntity[] = [];
  private subLogGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.78, 12);
  private subLogCapGeo = new THREE.CircleGeometry(0.175, 12);
  private subLogBarkMat!: THREE.MeshStandardMaterial;
  private subLogCutMat!: THREE.MeshStandardMaterial;
  private guardShieldMesh!: THREE.Mesh;
  private chakraChargeRingMesh!: THREE.Mesh;
  private awakeningAuraMesh!: THREE.Mesh;
  private awakeningRingMesh!: THREE.Mesh;

  // Ultimate Cinematic Finisher State
  private finisherState: FinisherState | null = null;
  private finisherCooldown = 0;
  private finisherOverlay: 'none' | 'ko' | 'victory' = 'none';
  private finisherFlashOpacity = 0;

  private cooldowns: Record<JutsuId, number> = {
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
  };

  // Camera orbit state
  private camYaw = 0.08;
  private camPitch = 0.28;
  private camDist = 8.4;
  private susanooCamDistOffset = 0;
  private susanooCamLookYOffset = 0;
  private camBasePos = new THREE.Vector3(0, 3.2, 10.4);
  private isDraggingCamera = false;
  private activeCamPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerMovedDist = 0;
  private manualCameraHoldTimer = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private virtualMove = new THREE.Vector2(0, 0);

  // Active Entities & VFX
  private enemies: EnemyEntity[] = [];
  private thrownFumas: ThrownFuma[] = [];
  private fireballs: FireballEntity[] = [];
  private elementalProjectiles: ElementalProjectile[] = [];
  private shockRings: ShockRing[] = [];
  private shockRingPool: ShockRing[] = [];
  private sphereShocks: SphereShock[] = [];
  private smokePuffs: SmokePuff[] = [];
  private smokePuffPool: SmokePuff[] = [];
  private fallingRods: FallingRod[] = [];
  private sparks: HitSpark[] = [];
  private sparkPool: HitSpark[] = [];
  private fireballGroundLights: THREE.PointLight[] = [];
  private groundMarks: GroundMark[] = [];
  private groundDebris: GroundDebris[] = [];
  private slashArcs: SlashArc[] = [];
  private susanooSlashWaves: SusanooSlashWave[] = [];
  private darkVortices: DarkVortex[] = [];
  private chakraChains: ChakraChainWhip[] = [];
  private activeGedo: ActiveGedoMazo | null = null;
  private activeSusanoo: ActiveSusanooState | null = null;
  private lightningBolts: LightningBoltVfx[] = [];
  private damagePopups: DamageNumberPopup[] = [];
  private amaterasuZones: AmaterasuZone[] = [];
  private clayExplosives: ClayExplosiveEntity[] = [];
  private clayGeoCache: {
    birdBody: THREE.BufferGeometry;
    birdHead: THREE.BufferGeometry;
    birdBeak: THREE.BufferGeometry;
    birdWing: THREE.BufferGeometry;
    birdTail: THREE.BufferGeometry;
    dragonTorso: THREE.BufferGeometry;
    dragonNeck: THREE.BufferGeometry;
    dragonHead: THREE.BufferGeometry;
    dragonJaw: THREE.BufferGeometry;
    dragonHorn: THREE.BufferGeometry;
    dragonWing: THREE.BufferGeometry;
    dragonOrb: THREE.BufferGeometry;
    c3Body: THREE.BufferGeometry;
    c3Dome: THREE.BufferGeometry;
    c3Wing: THREE.BufferGeometry;
    eyeGeo: THREE.BufferGeometry;
  } | null = null;
  private kuramaProjectiles: KuramaProjectileEntity[] = [];
  private kuramaGeoCache: {
    core: THREE.BufferGeometry;
    blade: THREE.BufferGeometry;
    haloRing: THREE.BufferGeometry;
    bijuuRing: THREE.BufferGeometry;
  } | null = null;
  private groundMarkLayerIndex = 0;
  private kamuiParticleTimer = 0;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onModelLoaded?: (loaded: boolean) => void,
    autoLoadDefault = true,
    initialStage: ArenaStageId = 'konoha'
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onModelLoaded = onModelLoaded;
    this.arenaStage = initialStage;

    this.isMobileDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        window.innerWidth < 768);

    // Full high-fidelity VFX geometry across all devices (shaders pre-warmed at startup for zero hitching)
    this.fireVolumeGeo = new THREE.IcosahedronGeometry(0.68, 3);
    const trailCone = new THREE.ConeGeometry(0.84, 2.55, 18, 9, true);
    trailCone.rotateX(-Math.PI / 2);
    trailCone.translate(0, 0, -1.05);
    this.fireTrailConeGeo = trailCone;
    this.sphereShockGeo = new THREE.SphereGeometry(1, 22, 16);

    const initW = container.clientWidth || window.innerWidth;
    const initH = container.clientHeight || window.innerHeight;

    // 1. Create single WebGLRenderer with full hardware MSAA on GPU devices for crisp silhouette fidelity
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'default',
      });
    }

    this.isSoftwareGl = (() => {
      try {
        const gl = this.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const initDpr = this.computeRenderPixelRatio(initW, initH);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(initDpr);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(initW, initH);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.userSelect = 'none';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Midnight Abyss Fog & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020714);
    this.scene.fog = new THREE.FogExp2(0x020714, 0.0135);

    const aspect = initW / Math.max(1, initH);
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.2, 240);

    // 3. Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 4. Cool Overhead Dimension 3-Point Lighting Rig + Full 2048px High-Resolution Soft Shadows
    this.hemiLight = new THREE.HemisphereLight(0x7ca2d6, 0x091122, 1.0);
    this.scene.add(this.hemiLight);

    const maxTex = this.renderer.capabilities.maxTextureSize || 2048;
    const shadowRes = this.isSoftwareGl ? 512 : Math.min(2048, maxTex);

    this.keyLight = new THREE.DirectionalLight(0xc7e0ff, 2.45);
    this.keyLight.position.set(14, 34, 16);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 85;
    this.keyLight.shadow.camera.left = -20;
    this.keyLight.shadow.camera.right = 20;
    this.keyLight.shadow.camera.top = 20;
    this.keyLight.shadow.camera.bottom = -20;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.015;
    this.scene.add(this.keyLight);

    // Cool indigo-blue dimensional rim backlight
    this.rimLight = new THREE.DirectionalLight(0x4f7df3, 1.25);
    this.rimLight.position.set(-18, 14, -22);
    this.scene.add(this.rimLight);

    // Dynamic reusable point light for Fireball / Shinra Tensei environmental flash
    this.impactLight = new THREE.PointLight(0xf97316, 0, 28, 1.5);
    this.impactLight.position.set(0, 3, 0);
    this.scene.add(this.impactLight);

    for (let li = 0; li < 2; li++) {
      const fbLight = new THREE.PointLight(0xf97316, 0, 22, 1.35);
      fbLight.position.set(0, 1.6, 0);
      this.scene.add(fbLight);
      this.fireballGroundLights.push(fbLight);
    }

    // 5. Build Materials, Battlefield, and Obito Uchiha with full texture sharpness
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    setCharacterTextureMaxAnisotropy(this.maxAniso);
    const maxAniso = this.maxAniso;
    this.materials = createShinobiMaterials();
    this.environment =
      this.arenaStage === 'amegakure'
        ? buildAmegakureEnvironment(this.materials, maxAniso)
        : this.arenaStage === 'konoha'
          ? buildKonohaEnvironment(this.materials, maxAniso)
          : this.arenaStage === 'kamui'
            ? buildShinobiEnvironment(this.materials, maxAniso)
            : buildCustomMapEnvironment(this.materials, maxAniso);

    this.scene.add(this.environment.group);
    this.applyArenaAtmosphere(this.arenaStage);

    this.groundDecalGeo.rotateX(-Math.PI / 2);
    this.chainGeo.rotateX(Math.PI / 2);
    this.chainGeo.translate(0, 0, 2.6);

    this.contactShadowTex = createContactShadowTexture();
    this.kamuiTex = createKamuiVortexTexture();
    this.fireGlowTex = createSoftGlowTexture();
    this.fireFlameTex = createRealisticFireTexture();
    this.smokeCloudTex = createSmokeCloudTexture();
    this.scorchTex = createScorchImpactTexture(maxAniso);
    this.scorchEmberTex = createScorchEmberTexture(maxAniso);
    this.groundCrackTex = createGroundCrackTexture(maxAniso);
    this.summoningSealTex = createSummoningSealTexture(maxAniso);

    this.skillParticles = new SkillParticleManager(this.scene);
    this.slashRibbons = new SlashRibbonSystem(this.scene);

    this.obitoShadow = this.createContactShadow(1.3 * CHARACTER_WORLD_SCALE);
    this.scene.add(this.obitoShadow);

    this.comShadow = this.createContactShadow(1.3 * CHARACTER_WORLD_SCALE);
    this.comShadow.visible = false;
    this.scene.add(this.comShadow);

    // Kamui black-and-violet spiral vortex anchored in front of Obito's right eye
    this.kamuiPortalMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 2.15),
      new THREE.MeshBasicMaterial({
        map: this.kamuiTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.kamuiPortalMesh.position.set(0, 1.72, 0.45);
    this.kamuiPortalMesh.renderOrder = 3;
    this.kamuiPortalMesh.visible = false;
    this.scene.add(this.kamuiPortalMesh);

    this.kamuiOuterRingMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.75, 2.75),
      new THREE.MeshBasicMaterial({
        map: this.kamuiTex,
        color: 0xa855f7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.kamuiOuterRingMesh.position.set(0, 1.72, 0.45);
    this.kamuiOuterRingMesh.renderOrder = 4;
    this.kamuiOuterRingMesh.visible = false;
    this.scene.add(this.kamuiOuterRingMesh);

    // Storm 4 VFX Meshes (Substitution Wood Log materials, Guard Shield, Chakra Charge Ring, Awakening Aura)
    this.subLogBarkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.9,
      metalness: 0.05,
    });
    this.subLogCutMat = new THREE.MeshStandardMaterial({
      color: 0xdcb98a,
      roughness: 0.8,
      metalness: 0.02,
    });

    this.guardShieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.42 * CHARACTER_WORLD_SCALE, 1),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        wireframe: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.guardShieldMesh.visible = false;
    this.guardShieldMesh.renderOrder = 5;
    this.scene.add(this.guardShieldMesh);

    this.chakraChargeRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.52, 32),
      new THREE.MeshBasicMaterial({
        map: this.kamuiTex,
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.chakraChargeRingMesh.rotation.x = -Math.PI / 2;
    this.chakraChargeRingMesh.visible = false;
    this.chakraChargeRingMesh.renderOrder = 4;
    this.scene.add(this.chakraChargeRingMesh);

    this.awakeningAuraMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35 * CHARACTER_WORLD_SCALE, 1),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.awakeningAuraMesh.visible = false;
    this.awakeningAuraMesh.renderOrder = 5;
    this.scene.add(this.awakeningAuraMesh);

    this.awakeningRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.85, 36),
      new THREE.MeshBasicMaterial({
        map: this.kamuiTex,
        color: 0xf59e0b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    this.awakeningRingMesh.rotation.x = -Math.PI / 2;
    this.awakeningRingMesh.visible = false;
    this.awakeningRingMesh.renderOrder = 4;
    this.scene.add(this.awakeningRingMesh);

    if (!this.isSoftwareGl) {
      this.prewarmSkillShaders();
      this.renderer.compile(this.scene, this.camera);
    }

    soundEngine.setMusicTheme('silent');
    this.bindEvents();
    this.pushHud(true);
    this.tick();

    // Preload `run` moveset (Run + Combat + Idle), essential UAL clips (immediately freeing GLB), death animation & enemy templates
    const initialRunStyle = (() => {
      try {
        return (window.localStorage.getItem('naruto_obito_run_style_v1') as 'new' | 'old') || 'new';
      } catch {
        return 'new';
      }
    })();
    const initialRunUrl = initialRunStyle === 'old' ? RUN_DEFAULT_CLIP_URL : RUN_RUN_CLIP_NEW_URL;
    const initialRunName = initialRunStyle === 'old' ? 'tobi_run.glb' : '7j2k57.glb';
    void this.setRunAnimationSource(initialRunUrl, initialRunName, false);

    void this.preloadRunCombatAnimation();
    void this.preloadRunIdleAnimation();
    void this.preloadDeathAnimation();
    void this.preloadUalAnimationLibrary();
    void this.preloadInitialEnemyTemplates();

    // Enter Storm 4 1P vs COM dual-showcase backdrop for initial Character Select
    this.applyStorm4SelectBackdrop(true);
    void this.loadComPreviewCharacter(this.selectedComPresetId);

    // Load original 3D character model when not overridden by saved selection
    if (autoLoadDefault) {
      void this.loadCustomObitoModel(DEFAULT_OBITO_GLB_URL)
        .catch(() => this.loadCustomObitoModel(FALLBACK_OBITO_GLB_URL))
        .then(() => {
          this.onModelLoaded?.(true);
        })
        .catch(() => {
          this.onModelLoaded?.(false);
        });
    }
  }

  /**
   * Compiles custom GLSL fire/blast shaders and common VFX material programs ONCE at startup
   * so pressing Katon / Kamui / Rinnegan / Suiton / Raikiri / Gedo for the first time never hitches!
   */
  private prewarmSkillShaders(): void {
    const warmupGroup = new THREE.Group();
    warmupGroup.position.set(0, -500, 0);
    const mats: THREE.Material[] = [];

    const mCore = createVolumetricFireCoreMaterial(0);
    const mShell = createVolumetricFireShellMaterial(1);
    const mTrail = createFireTrailConeMaterial(2);
    const mDome = createFireBlastDomeMaterial(3);
    const mSprite = new THREE.SpriteMaterial({
      map: this.fireFlameTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mPoints = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mLine = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    mats.push(mCore, mShell, mTrail, mDome, mSprite, mPoints, mLine);

    const dummyPtsGeo = new THREE.BufferGeometry();
    dummyPtsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    dummyPtsGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
    const dummyLineGeo = new THREE.BufferGeometry();
    dummyLineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0]), 3)
    );

    warmupGroup.add(
      new THREE.Mesh(this.fireVolumeGeo, mCore),
      new THREE.Mesh(this.fireVolumeGeo, mShell),
      new THREE.Mesh(this.fireTrailConeGeo, mTrail),
      new THREE.Mesh(this.fireVolumeGeo, mDome),
      new THREE.Sprite(mSprite),
      new THREE.Points(dummyPtsGeo, mPoints),
      new THREE.Line(dummyLineGeo, mLine)
    );
    warmupGroup.traverse((o) => {
      o.frustumCulled = false;
    });

    this.scene.add(warmupGroup);
    try {
      this.renderer.compile(this.scene, this.camera);
    } finally {
      this.scene.remove(warmupGroup);
      dummyPtsGeo.dispose();
      dummyLineGeo.dispose();
      for (const m of mats) m.dispose();
    }
  }

  private computeRenderPixelRatio(w: number, h: number): number {
    if (this.isSoftwareGl) return 1;
    const rawDpr = window.devicePixelRatio || 1;
    if (this.isMobileDevice) {
      return Math.max(1.0, Math.min(rawDpr, this.mobileDprCap));
    }
    const baseDpr = Math.max(rawDpr, 1.25);
    const max4kRatio = Math.min(3840 / Math.max(1, w), 2160 / Math.max(1, h));
    return Math.max(1, Math.min(baseDpr, max4kRatio, 2.0));
  }

  private createContactShadow(radius: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: this.contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.03;
    return mesh;
  }

  private handleVisibilityChange = () => {
    if (this.disposed) return;
    const hidden = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
    if (hidden) {
      this.pageHidden = true;
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    } else if (this.pageHidden) {
      this.pageHidden = false;
      this.clock.getDelta();
      if (!this.frameId) {
        this.tick();
      }
    }
  };

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleOrientationResize = () => {
    this.handleResize();
    if (this.orientationResizeTimeout !== null) {
      window.clearTimeout(this.orientationResizeTimeout);
    }
    this.orientationResizeTimeout = window.setTimeout(() => {
      this.orientationResizeTimeout = null;
      this.handleResize();
    }, 140);
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = this.computeRenderPixelRatio(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
  };

  private handleContextRestored = () => {
    this.contextLost = false;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    soundEngine.unlock();
    this.keys[e.code] = true;

    if (this.phase !== 'playing') return;

    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.togglePause();
      return;
    }
    if (this.playerDying || this.finisherState) return;

    if (e.code === 'KeyV' || e.code === 'Digit0') {
      this.playUltimateFinisher();
      return;
    }

    if (e.code === 'KeyB' || e.code === 'Digit9') {
      this.playObitoGravityColumns();
      return;
    }

    if (e.code === 'Space' && this.playerOnGround) {
      this.playerVel.y = 9.4;
      this.playerOnGround = false;
      this.madaraJumpPhase = 'start';
      this.madaraJumpPhaseTimer = 0;
      soundEngine.playJump();
    } else if (e.code === 'KeyJ') {
      this.triggerJutsu('melee');
    } else if (e.code === 'Digit1' || e.code === 'KeyK') {
      this.triggerJutsu(
        this.isDeidara
          ? 'c1_birds'
          : this.isNarutoKurama || this.isNarutoSage
            ? 'rasenshuriken'
            : 'fuma'
      );
    } else if (e.code === 'Digit2' || e.code === 'KeyL') {
      this.triggerJutsu(
        this.isDeidara
          ? 'c2_dragon'
          : this.isNarutoSage
            ? 'sage_odama'
            : this.isNarutoKurama
              ? 'bijuu_dama'
              : this.isKakashi
                ? 'raikiri'
                : this.isItachi
                  ? 'amaterasu'
                  : this.isMadara
                    ? 'katon'
                    : 'kamui'
      );
    } else if (e.code === 'Digit3' || e.code === 'KeyU') {
      this.triggerJutsu(
        this.isDeidara
          ? 'c3_ultimate'
          : this.isNarutoSage
            ? 'sage_kata'
            : this.isNarutoKurama
              ? 'kurama_roar'
              : this.isMadara
                ? 'rinnegan'
                : 'katon'
      );
    } else if (e.code === 'Digit4' || e.code === 'KeyI') {
      this.triggerJutsu(
        this.isDeidara
          ? 'c3_ultimate'
          : this.isNarutoSage
            ? 'sage_barrage'
            : this.isNarutoKurama
              ? 'bijuu_barrage'
              : this.isKakashi
                ? 'suiton'
                : this.isItachi
                  ? 'tsukuyomi'
                  : this.isMadara
                    ? 'susanoo_ribcage'
                    : 'rinnegan'
      );
    } else if (e.code === 'KeyE') {
      this.triggerSubstitution();
    } else if (e.code === 'KeyQ') {
      this.triggerChakraDash();
    } else if (e.code === 'KeyF') {
      this.setGuarding(true);
    } else if (e.code === 'KeyC') {
      this.setChargingChakra(true);
    } else if (e.code === 'KeyX') {
      this.triggerAwakening();
    } else if (e.code === 'KeyR' || e.code === 'Digit5') {
      this.triggerJutsu(
        this.isDeidara
          ? 'c3_ultimate'
          : this.isNarutoSage
            ? 'sage_barrage'
            : this.isNarutoKurama
              ? 'bijuu_barrage'
              : this.isMadara || this.isItachi
                ? 'susanoo_ribcage'
                : 'gedo'
      );
    } else if (e.code === 'KeyT' || e.code === 'Digit6') {
      if (this.isMadara || this.isItachi) this.triggerJutsu('susanoo_armored');
    } else if (e.code === 'KeyG' || e.code === 'Digit7') {
      if (this.isMadara || this.isItachi) this.triggerJutsu('susanoo_muscular');
    } else if (e.code === 'KeyY' || e.code === 'Digit8') {
      if (this.isMadara) this.triggerJutsu('susanoo_perfect');
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
    if (e.code === 'KeyF') {
      this.setGuarding(false);
    } else if (e.code === 'KeyC') {
      this.setChargingChakra(false);
    }
  };

  private handlePointerDown = (e: PointerEvent) => {
    soundEngine.unlock();
    if (this.activeCamPointerId !== null) return;
    this.activeCamPointerId = e.pointerId;
    this.isDraggingCamera = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.pointerMovedDist = 0;
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.finisherState) return;
    if (!this.isDraggingCamera || e.pointerId !== this.activeCamPointerId) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.pointerMovedDist += Math.hypot(dx, dy);

    const yawSens = e.pointerType === 'touch' ? 0.0095 : 0.0065;
    const pitchSens = e.pointerType === 'touch' ? 0.0065 : 0.0045;
    this.camYaw -= dx * yawSens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * pitchSens, -0.24, 1.18);
    if (dx !== 0 || dy !== 0) {
      this.manualCameraHoldTimer = 5.0;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.isDraggingCamera || e.pointerId !== this.activeCamPointerId) return;
    this.isDraggingCamera = false;
    this.activeCamPointerId = null;
    try {
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    if (
      this.phase === 'playing' &&
      !this.finisherState &&
      e.pointerType !== 'touch' &&
      e.button === 0 &&
      this.pointerMovedDist < 6
    ) {
      this.triggerJutsu('melee');
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.finisherState) return;
    this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.005, 5.5, 13.5);
  };

  public setVirtualMove(x: number, y: number) {
    this.virtualMove.set(x, y);
  }

  public triggerJump() {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState || !this.playerOnGround) return;
    this.playerVel.y = 9.4;
    this.playerOnGround = false;
    this.madaraJumpPhase = 'start';
    this.madaraJumpPhaseTimer = 0;
    soundEngine.playJump();
  }

  public async startGame(mode: GameMode, comPresetId?: string) {
    const myStartSeq = ++this.startGameSeq;
    this.cancelFinisher(true);
    this.finisherCooldown = 0;
    this.finisherOverlay = 'none';
    this.finisherFlashOpacity = 0;
    if (comPresetId) {
      this.selectedComPresetId = comPresetId;
    }
    this.applyStorm4SelectBackdrop(false);
    this.applyArenaAtmosphere(this.arenaStage);
    this.mode = mode;
    this.maxWaves = mode === 'survival' ? 5 : 4;
    this.wave = 1;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.playerHp = this.playerMaxHp;
    this.playerChakra = this.playerMaxChakra;
    this.playerPos.set(0, 0, 5.0);
    this.playerVel.set(0, 0, 0);
    this.moveVelX = 0;
    this.moveVelZ = 0;
    this.currentMoveSpeed = 0;
    this.turnLean = 0;
    this.airTime = 0;
    this.landingTimer = 0;
    this.playerYaw = Math.PI;
    this.camYaw = this.playerYaw + Math.PI;
    this.camPitch = 0.28;
    this.camDist = 8.4;
    this.manualCameraHoldTimer = 0;
    this.kamuiTimer = 0;
    this.restorePlayerIntangibilityMaterials();
    this.meleeStep = 0;
    this.meleeAnimTimer = 0;
    this.meleeComboResetTimer = 0;
    this.comboSpinYaw = 0;
    this.jutsuAnimTimer = 0;
    this.hitInvulnTimer = 0;
    this.waveTransitionTimer = 0;
    this.substitutionLogs = this.maxSubstitutionLogs;
    this.substitutionRechargeTimer = 0;
    this.guardGauge = this.maxGuardGauge;
    this.isGuarding = false;
    this.guardBroken = false;
    this.guardBreakTimer = 0;
    this.isChargingChakra = false;
    this.chakraChargeEmitTimer = 0;
    this.chakraDashCooldown = 0;
    this.chakraDashTimer = 0;
    this.awakeningGauge = 0;
    this.awakeningActive = false;
    this.awakeningTimer = 0;
    this.awakeningSparkTimer = 0;
    this.guardShieldMesh.visible = false;
    this.chakraChargeRingMesh.visible = false;
    this.awakeningAuraMesh.visible = false;
    this.awakeningRingMesh.visible = false;
    this.cooldowns = {
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
    };
    this.playerDying = false;
    this.playerDeathTimer = 0;
    this.playerDeathBlend = 0;
    this.playerRaikiriState = null;
    this.hidePlayerRaikiriVfx();
    this.resetRunCombatState();
    this.madaraJumpPhase = 'none';
    this.madaraJumpPhaseTimer = 0;
    this.madaraAttackStep = 0;
    this.madaraActiveAttackAction = null;
    this.resetGunbaiSpring();
    this.playerAnimState = 'idle';
    this.playerIdleTime = 0;
    this.playerBakedRunBlend = 0;
    this.playerBakedIdleBlend = 1;
    this.prevPlayerOnGround = true;
    this.prevWasAttackingOrJutsu = false;
    this.cameraShake = 0;
    this.resetPlayerPitchAndRoll(true);
    if (this.customObito) {
      this.customObito.root.visible = true;
    }
    this.obitoShadow.visible = true;
    if (this.customObito?.mixer) {
      const playerUal = this.getActivePlayerUalActions();
      if (playerUal) {
        this.customObito.mixer.stopAllAction();
        playerUal.activeAction = null;
        playerUal.idle.enabled = true;
        playerUal.idle.paused = false;
        playerUal.idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        playerUal.activeAction = playerUal.idle;
      } else {
        this.customObito.runAction?.stop();
        this.customObito.attackAction?.stop();
        if (this.customObito.idleAction) {
          this.customObito.idleAction.enabled = true;
          this.customObito.idleAction.paused = false;
          this.customObito.idleAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        }
      }
    }

    this.cleanupBattleMemory(true);
    this.phase = 'playing';
    soundEngine.unlock();
    if (soundEngine.getMusicTheme() !== 'battle') {
      soundEngine.resetBattleTrack();
    }
    soundEngine.setMusicTheme('battle');

    // Ensure opponent character template (especially custom/textured Deidara) is loaded before wave 1 spawns
    const comId = this.selectedComPresetId || 'kakashi';
    if (!this.enemyPresetTemplates.has(comId)) {
      await Promise.race([
        this.preloadEnemyPresetTemplate(comId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);
      if (this.disposed || myStartSeq !== this.startGameSeq || this.phase !== 'playing') {
        return;
      }
    }

    this.spawnWave(this.wave);
    this.snapChaseCamera();
    this.pushHud(true);
  }

  public togglePause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      soundEngine.setMusicTheme('silent');
      this.pushHud(true);
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      soundEngine.unlock();
      soundEngine.setMusicTheme('battle');
      this.clock.getDelta();
      this.pushHud(true);
    }
  }

  public returnToTitle() {
    this.cancelFinisher(true);
    this.finisherCooldown = 0;
    this.finisherOverlay = 'none';
    this.finisherFlashOpacity = 0;
    this.cleanupBattleMemory(false);
    this.phase = 'title';
    soundEngine.unlock();
    soundEngine.setMusicTheme('silent');
    this.playerPos.set(0, 0, 2);
    this.playerYaw = 0;
    this.moveVelX = 0;
    this.moveVelZ = 0;
    this.currentMoveSpeed = 0;
    this.turnLean = 0;
    this.kamuiTimer = 0;
    this.restorePlayerIntangibilityMaterials();
    this.meleeStep = 0;
    this.meleeAnimTimer = 0;
    this.meleeComboResetTimer = 0;
    this.comboSpinYaw = 0;
    this.playerDying = false;
    this.playerDeathTimer = 0;
    this.playerDeathBlend = 0;
    this.playerRaikiriState = null;
    this.hidePlayerRaikiriVfx();
    this.resetRunCombatState();
    this.madaraJumpPhase = 'none';
    this.madaraJumpPhaseTimer = 0;
    this.madaraAttackStep = 0;
    this.madaraActiveAttackAction = null;
    this.resetGunbaiSpring();
    this.playerAnimState = 'idle';
    this.playerIdleTime = 0;
    this.playerBakedRunBlend = 0;
    this.playerBakedIdleBlend = 1;
    this.prevPlayerOnGround = true;
    this.prevWasAttackingOrJutsu = false;
    this.cameraShake = 0;
    this.resetPlayerPitchAndRoll(true);
    this.obitoShadow.visible = true;
    if (this.customObito) {
      this.customObito.root.visible = true;
      const playerUal = this.getActivePlayerUalActions();
      if (playerUal && this.customObito.mixer) {
        this.customObito.mixer.stopAllAction();
        playerUal.activeAction = null;
        playerUal.idle.enabled = true;
        playerUal.idle.paused = false;
        playerUal.idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        playerUal.activeAction = playerUal.idle;
      } else {
        this.customObito.runAction?.stop();
        this.customObito.attackAction?.stop();
        if (this.customObito.idleAction) {
          this.customObito.idleAction.enabled = true;
          this.customObito.idleAction.paused = false;
          this.customObito.idleAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        }
      }
      this.customObito.root.position.copy(this.playerPos);
      this.customObito.root.rotation.set(0, this.playerYaw, 0);
      this.customObito.pivotGroup.rotation.set(0, 0, 0);
    }
    this.applyStorm4SelectBackdrop(true);
    void this.loadComPreviewCharacter(this.selectedComPresetId);
    this.pushHud(true);
  }

  public resetCamera() {
    this.camYaw = this.playerYaw + Math.PI;
    this.camPitch = 0.28;
    this.camDist = 8.4;
    this.manualCameraHoldTimer = 0;
  }

  public getArenaStage(): ArenaStageId {
    return this.arenaStage;
  }

  public setArenaStage(stage: ArenaStageId) {
    if (this.disposed || this.arenaStage === stage) return;
    this.arenaStage = stage;
    this.scene.remove(this.environment.group);
    this.environment.dispose();

    this.environment =
      stage === 'amegakure'
        ? buildAmegakureEnvironment(this.materials, this.maxAniso)
        : stage === 'konoha'
          ? buildKonohaEnvironment(this.materials, this.maxAniso)
          : stage === 'kamui'
            ? buildShinobiEnvironment(this.materials, this.maxAniso)
            : buildCustomMapEnvironment(this.materials, this.maxAniso);
    this.applyEffectiveParticleScale();
    this.scene.add(this.environment.group);
    if (this.storm4SelectActive) {
      this.environment.group.visible = false;
    } else {
      this.applyArenaAtmosphere(stage);
    }
  }

  public async setRunAnimationStyle(style: 'new' | 'old'): Promise<void> {
    const url = style === 'old' ? RUN_DEFAULT_CLIP_URL : RUN_RUN_CLIP_NEW_URL;
    const name = style === 'old' ? 'tobi_run.glb' : '7j2k57.glb';
    await this.setRunAnimationSource(url, name, true);
    this.upgradeCharacterUalRunActionsToPreviousRun(true);
  }


  private applyEffectiveShadowConfig(): void {
    if (this.disposed) return;
    const quality = this.shadowQuality;
    if (this.isSoftwareGl || quality === 'off') {
      this.keyLight.castShadow = false;
      this.renderer.shadowMap.enabled = false;
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        this.keyLight.shadow.map = null;
      }
      for (const fbLight of this.fireballGroundLights) {
        fbLight.castShadow = false;
        if (fbLight.shadow.map) {
          fbLight.shadow.map.dispose();
          fbLight.shadow.map = null;
        }
      }
      this.impactLight.castShadow = false;
      if (this.impactLight.shadow.map) {
        this.impactLight.shadow.map.dispose();
        this.impactLight.shadow.map = null;
      }
      this.renderer.shadowMap.needsUpdate = true;
      return;
    }

    const maxTex = this.renderer.capabilities.maxTextureSize || 2048;
    const requestedRes =
      quality === 'low' ? 512 : quality === 'medium' ? 1024 : Math.min(2048, maxTex);
    const targetRes = Math.min(requestedRes, this.governorShadowCap, maxTex);

    const targetShadowType =
      quality === 'low'
        ? THREE.PCFShadowMap
        : quality === 'high' && targetRes >= 2048
          ? THREE.PCFSoftShadowMap
          : THREE.PCFShadowMap;

    if (this.renderer.shadowMap.type !== targetShadowType) {
      this.renderer.shadowMap.type = targetShadowType;
    }

    if (
      this.keyLight.shadow.mapSize.width !== targetRes ||
      this.keyLight.shadow.mapSize.height !== targetRes
    ) {
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        this.keyLight.shadow.map = null;
      }
      this.keyLight.shadow.mapSize.set(targetRes, targetRes);
    }

    this.keyLight.castShadow = true;

    // Enable dynamic fireball & impact light shadows across all arenas when shadow quality is medium or high
    const allowPointShadows = !this.isSoftwareGl && quality !== 'low';
    for (const fbLight of this.fireballGroundLights) {
      fbLight.castShadow = allowPointShadows;
      if (allowPointShadows) {
        fbLight.shadow.mapSize.set(512, 512);
        fbLight.shadow.bias = -0.0018;
        fbLight.shadow.camera.near = 0.35;
        fbLight.shadow.camera.far = 32;
      } else if (fbLight.shadow.map) {
        fbLight.shadow.map.dispose();
        fbLight.shadow.map = null;
      }
    }

    this.impactLight.castShadow = allowPointShadows;
    if (allowPointShadows) {
      this.impactLight.shadow.mapSize.set(512, 512);
      this.impactLight.shadow.bias = -0.0018;
      this.impactLight.shadow.camera.near = 0.35;
      this.impactLight.shadow.camera.far = 36;
    } else if (this.impactLight.shadow.map) {
      this.impactLight.shadow.map.dispose();
      this.impactLight.shadow.map = null;
    }

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.keyLight.shadow.needsUpdate = true;
  }

  private applyEffectiveParticleScale(): void {
    const effective = THREE.MathUtils.clamp(
      this.particleDensityScale * this.governorParticleMult,
      0.28,
      1.0
    );
    this.skillParticles.setDensityScale(effective);
    this.environment.setParticleDensity?.(effective);
  }

  private applyGovernorPerformanceTier(tier: number): void {
    const clamped = THREE.MathUtils.clamp(Math.round(tier), 0, 3);
    if (clamped === this.performanceTier) return;
    this.performanceTier = clamped;

    // Tier 0 = 100% Highest Graphics; Tiers 1..3 activate silently only under sustained low FPS
    if (clamped === 0) {
      this.mobileDprCap = 2.0;
      this.governorParticleMult = 1.0;
      this.governorShadowCap = 2048;
    } else if (clamped === 1) {
      this.mobileDprCap = 1.72;
      this.governorParticleMult = 1.0;
      this.governorShadowCap = 2048;
    } else if (clamped === 2) {
      this.mobileDprCap = 1.48;
      this.governorParticleMult = 0.82;
      this.governorShadowCap = 2048;
    } else {
      this.mobileDprCap = 1.28;
      this.governorParticleMult = 0.65;
      this.governorShadowCap = 1024;
    }

    this.renderer.setPixelRatio(
      this.computeRenderPixelRatio(
        this.container.clientWidth || window.innerWidth,
        this.container.clientHeight || window.innerHeight
      )
    );
    this.applyEffectiveParticleScale();
    this.applyEffectiveShadowConfig();
  }

  public setShadowQuality(quality: ShadowQuality): void {
    if (this.disposed) return;
    this.shadowQuality = quality;
    this.governorShadowCap = 2048;
    this.applyEffectiveShadowConfig();
  }

  public setParticleDensity(density: ParticleDensity): void {
    if (this.disposed) return;
    this.particleDensity = density;
    this.particleDensityScale =
      density === 'low' ? 0.32 : density === 'medium' ? 0.65 : 1.0;
    this.governorParticleMult = 1.0;
    this.applyEffectiveParticleScale();
  }

  private disposeComPreviewRig(): void {
    if (this.comPreviewRig) {
      this.comPreviewRig.mixer?.stopAllAction();
      this.scene.remove(this.comPreviewRig.root);
      this.comPreviewRig.dispose();
      this.comPreviewRig = null;
    }
    this.comPreviewPhysicsSolver = null;
    this.comPreviewCloakSolver = null;
    this.comPreviewIdleAction = null;
    this.comPreviewPresetId = null;
    this.comShadow.visible = false;
  }

  private bindUalIdleToComPreview(): void {
    if (!this.comPreviewRig || !this.comPreviewRig.hasSkeleton) return;
    const driver = this.ualRetargetDriver;
    if (!driver || !driver.hasClip('Idle_Loop')) return;

    const loaded = this.comPreviewRig;
    loaded.pivotGroup.rotation.set(0, 0, 0);
    const idleClip = driver.compileClipForTarget(
      'Idle_Loop',
      loaded.pivotGroup,
      loaded.bones,
      loaded.baseBoneRotations,
      loaded.baseBonePositions,
      { name: 'UAL_ComPreview_Idle', cyclic: true, fps: 24, hipClampMin: -0.1, hipClampMax: 0.08 }
    );
    if (!idleClip) return;
    if (!loaded.mixer) {
      loaded.mixer = new THREE.AnimationMixer(loaded.mixerRoot);
    }
    loaded.mixer.stopAllAction();
    const action = loaded.mixer.clipAction(idleClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    this.comPreviewIdleAction = action;
  }

  public setPresetModelOverride(
    presetId: string,
    source: string | Blob | null,
    fileName?: string,
    labelAr?: string
  ): void {
    if (this.disposed) return;
    if (source) {
      this.presetModelOverrides.set(presetId, { source, fileName, labelAr });
    } else {
      this.presetModelOverrides.delete(presetId);
    }

    this.enemyPresetVersions.set(presetId, (this.enemyPresetVersions.get(presetId) ?? 0) + 1);
    const cachedEnemyTpl = this.enemyPresetTemplates.get(presetId);
    if (cachedEnemyTpl) {
      this.enemyPresetTemplates.delete(presetId);
      cachedEnemyTpl.dispose();
    }
    this.enemyPresetLoads.delete(presetId);

    for (const [k, entry] of Array.from(this.playerRigCache.entries())) {
      if (k === this.activePlayerRigCacheKey) continue;
      if (
        (presetId === 'deidara' && entry.isDeidara) ||
        k.includes(presetId)
      ) {
        this.playerRigCache.delete(k);
        if (entry.obito.root.parent === this.scene) {
          this.scene.remove(entry.obito.root);
        }
        entry.ualActions = null;
        entry.obito.dispose();
      }
    }

    if (presetId === 'deidara' && source) {
      void this.preloadEnemyPresetTemplate('deidara');
    }

    if (this.comPreviewPresetId === presetId) {
      this.disposeComPreviewRig();
      if (this.storm4SelectActive) {
        void this.loadComPreviewCharacter(presetId);
      }
    }
  }

  public setDeidaraTextureOverrides(overrides: DeidaraTextureOverrideInput | null): void {
    setActiveDeidaraTextureOverrides(overrides);
    if (this.disposed) return;
    this.deidaraTextureRevision++;
    this.enemyPresetVersions.set('deidara', (this.enemyPresetVersions.get('deidara') ?? 0) + 1);

    const cachedEnemyTpl = this.enemyPresetTemplates.get('deidara');
    if (cachedEnemyTpl) {
      this.enemyPresetTemplates.delete('deidara');
      cachedEnemyTpl.dispose();
    }
    this.enemyPresetLoads.delete('deidara');

    for (const [k, entry] of Array.from(this.playerRigCache.entries())) {
      if (k === this.activePlayerRigCacheKey) continue;
      if (entry.isDeidara || k.includes('deidara')) {
        this.playerRigCache.delete(k);
        if (entry.obito.root.parent === this.scene) {
          this.scene.remove(entry.obito.root);
        }
        entry.ualActions = null;
        entry.obito.dispose();
      }
    }

    if (this.presetModelOverrides.has('deidara')) {
      void this.preloadEnemyPresetTemplate('deidara');
    }

    if (this.comPreviewPresetId === 'deidara') {
      this.disposeComPreviewRig();
      if (this.storm4SelectActive) {
        void this.loadComPreviewCharacter('deidara');
      }
    }
  }

  private obitoEyeRevision = 0;

  public setObitoEyeOverrides(overrides: ObitoEyeOverrideInput | null): void {
    setActiveObitoEyeOverrides(overrides);
    if (this.disposed) return;
    this.obitoEyeRevision++;
    for (const [k, entry] of Array.from(this.playerRigCache.entries())) {
      if (/obito|mask_man|original_obito/i.test(k)) {
        this.playerRigCache.delete(k);
        if (entry.obito.root !== this.customObito?.root) {
          if (entry.obito.root.parent === this.scene) {
            this.scene.remove(entry.obito.root);
          }
          entry.ualActions = null;
          entry.obito.dispose();
        }
      }
    }
    if (this.customObito && this.customObito.root) {
      void applyCustomObitoEyesToModel(this.customObito.root, this.customObito.bones.head, this.customObito.root);
    }
  }

  public async loadComPreviewCharacter(presetId: string): Promise<void> {
    if (this.disposed) return;
    const preset =
      CHARACTER_PRESETS.find((p) => p.id === presetId) ??
      CHARACTER_PRESETS.find((p) => p.id === 'kakashi') ??
      CHARACTER_PRESETS[0];
    if (!preset) return;

    this.selectedComPresetId = preset.id;
    void this.preloadEnemyPresetTemplate(preset.id);

    if (!this.storm4SelectActive) return;
    if (this.comPreviewRig && this.comPreviewPresetId === preset.id) {
      this.comPreviewRig.root.visible = true;
      this.comShadow.visible = true;
      return;
    }

    const version = ++this.comPreviewLoadVersion;
    const override = this.presetModelOverrides.get(preset.id);
    const effectiveSource = override?.source ?? preset.glbUrl;
    const effectiveHint = override?.fileName ?? preset.glbUrl;
    const effectiveLabel = override?.labelAr ?? preset.nameAr;

    try {
      const loaded = await loadObitoGltfModel(effectiveSource, effectiveHint, {
        labelAr: effectiveLabel,
      });
      if (this.disposed || version !== this.comPreviewLoadVersion || !this.storm4SelectActive) {
        loaded.dispose();
        return;
      }

      this.disposeComPreviewRig();
      this.comPreviewRig = loaded;
      this.comPreviewPresetId = preset.id;
      this.comPreviewSoleClearance = this.measureRigSoleClearance(loaded.root, loaded.bones);
      const isOrigCom = isOriginalObitoName(effectiveLabel, effectiveHint);
      const isTobiV2Com = isMaskManV2Name(effectiveLabel, effectiveHint);
      this.comPreviewPhysicsSolver = loaded.hasSkeleton
        ? createHeadCollarPhysicsSolver(loaded.pivotGroup, loaded.bones, isOrigCom, isTobiV2Com)
        : null;
      this.comPreviewCloakSolver = loaded.hasSkeleton
        ? createCloakPhysicsSolver(loaded.pivotGroup, loaded.bones, loaded.baseBoneRotations)
        : null;

      loaded.root.scale.setScalar(CHARACTER_WORLD_SCALE);
      loaded.root.visible = true;
      this.scene.add(loaded.root);
      this.comShadow.visible = true;

      if (!isDeidaraName(effectiveLabel, effectiveHint) || !loaded.idleAction) {
        this.bindUalIdleToComPreview();
      }
      if (!this.comPreviewIdleAction && loaded.idleAction) {
        loaded.idleAction.enabled = true;
        loaded.idleAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      }
    } catch {
      // Non-fatal: keep existing COM preview if network fetch fails
    }
  }

  private applyStorm4SelectBackdrop(active: boolean): void {
    this.storm4SelectActive = active;
    if (active) {
      this.environment.group.visible = false;
      this.scene.background = new THREE.Color(0x2b8cbe);
      this.scene.fog = null;
      this.hemiLight.color.setHex(0xe8f6ff);
      this.hemiLight.groundColor.setHex(0x1f5f87);
      this.hemiLight.intensity = 1.45;
      this.keyLight.color.setHex(0xfffaf0);
      this.keyLight.intensity = 2.15;
      this.rimLight.color.setHex(0x8fd6ff);
      this.rimLight.intensity = 1.15;
      this.renderer.toneMappingExposure = 1.08;
      this.scene.environmentIntensity = 0.78;
      if (this.comPreviewRig) {
        this.comPreviewRig.root.visible = true;
        this.comShadow.visible = true;
      }
    } else {
      this.disposeComPreviewRig();
      this.environment.group.visible = true;
      this.applyArenaAtmosphere(this.arenaStage);
    }
  }

  private getActiveArenaRadius(): number {
    return this.environment?.arenaRadius ?? ARENA_RADIUS;
  }

  private applyArenaAtmosphere(stage: ArenaStageId) {
    const isCustom = stage === 'custom_map' || (stage !== 'konoha' && stage !== 'kamui' && stage !== 'amegakure');
    const shadowHalf =
      stage === 'kamui'
        ? 30
        : stage === 'amegakure' || isCustom
          ? 28
          : 20;
    if (this.keyLight.shadow.camera.right !== shadowHalf) {
      this.keyLight.shadow.camera.left = -shadowHalf;
      this.keyLight.shadow.camera.right = shadowHalf;
      this.keyLight.shadow.camera.top = shadowHalf;
      this.keyLight.shadow.camera.bottom = -shadowHalf;
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.keyLight.shadow.needsUpdate = true;
    }

    if (stage === 'konoha') {
      this.scene.background = new THREE.Color(0x5b9ee5);
      this.scene.fog = new THREE.FogExp2(0x9bc8f0, 0.0020);
      this.scene.environmentIntensity = 0.58;
      this.hemiLight.color.setHex(0xd6ecff);
      this.hemiLight.groundColor.setHex(0x4d3b29);
      this.hemiLight.intensity = 0.78;
      this.keyLight.color.setHex(0xfff1d6);
      this.keyLight.intensity = 2.45;
      this.rimLight.color.setHex(0x7cb8ff);
      this.rimLight.intensity = 0.92;
      this.renderer.toneMappingExposure = 1.04;
    } else if (isCustom) {
      // Natural clean sunlight with pure neutral white lighting and 1.0 exposure to preserve 100% exact arena and character colors
      this.scene.background = new THREE.Color(0x4aa3f0);
      this.scene.fog = new THREE.FogExp2(0x82bbee, 0.0012);
      this.scene.environmentIntensity = 0.65;
      this.hemiLight.color.setHex(0xffffff);
      this.hemiLight.groundColor.setHex(0x555555);
      this.hemiLight.intensity = 0.85;
      this.keyLight.color.setHex(0xffffff);
      this.keyLight.intensity = 2.45;
      this.rimLight.color.setHex(0xd8ecff);
      this.rimLight.intensity = 0.85;
      this.renderer.toneMappingExposure = 1.0;
    } else if (stage === 'amegakure') {

      this.scene.background = new THREE.Color(0x28314b);
      this.scene.fog = new THREE.FogExp2(0x3a4366, 0.0092);
      this.scene.environmentIntensity = 0.42;
      this.hemiLight.color.setHex(0x6e85b8);
      this.hemiLight.groundColor.setHex(0x111726);
      this.hemiLight.intensity = 0.62;
      this.keyLight.color.setHex(0xd4e2ff);
      this.keyLight.intensity = 2.15;
      this.rimLight.color.setHex(0x5b7de8);
      this.rimLight.intensity = 1.12;
      this.renderer.toneMappingExposure = 1.04;
    } else {
      this.scene.background = new THREE.Color(0x01040d);
      this.scene.fog = new THREE.FogExp2(0x02081a, 0.0082);
      this.scene.environmentIntensity = 0.34;
      this.hemiLight.color.setHex(0x4c78c8);
      this.hemiLight.groundColor.setHex(0x050a18);
      this.hemiLight.intensity = 0.56;
      this.keyLight.color.setHex(0xbcdbff);
      this.keyLight.intensity = 2.65;
      this.rimLight.color.setHex(0x3b6cf5);
      this.rimLight.intensity = 1.32;
      this.renderer.toneMappingExposure = 1.08;
    }
  }

  public async setRunAnimationSource(
    source: string | Blob,
    fileNameHint?: string,
    isExplicitRun = true
  ): Promise<void> {
    if (!isExplicitRun && (this.hasExplicitRunSource || this.bakedRunAnim)) {
      return;
    }
    if (isExplicitRun) {
      this.hasExplicitRunSource = true;
    }
    const version = ++this.runAnimSourceVersion;
    try {
      const template = await loadCharacterTemplate(source, fileNameHint);
      try {
        if (this.disposed || version !== this.runAnimSourceVersion || !template.runClip) {
          return;
        }
        const rawRunClip = template.runClip;
        const baked = new BakedRunAnimation(template, rawRunClip);
        this.bakedRunAnim = baked;
        this.loadedRunClip = rawRunClip.clone();

        if (this.customObito) {
          if (!this.getActivePlayerUalActions() && this.customObitoIsRunSource) {
            this.bindSharedRunClipToCustomObito(this.customObito, !this.customObitoIsActualRunFile);
          }
          const activeTargetState = baked.prepareTarget(
            this.customObito.pivotGroup,
            this.customObito.bones,
            this.customObito.baseBoneRotations,
            this.customObito.baseBonePositions
          );
          this.playerRunTargetState = activeTargetState;
          if (this.activePlayerRigCacheKey) {
            const activeEntry = this.playerRigCache.get(this.activePlayerRigCacheKey);
            if (activeEntry && !activeEntry.hasNativeLocomotion) {
              activeEntry.runTargetState = activeTargetState;
              activeEntry.runTargetAnimRef = baked;
            }
          }
        }

        for (const e of this.enemies) {
          e.runTargetState = baked.prepareTarget(
            e.rig.pivotGroup,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          );
          if (e.isCustomTemplateRig && e.mixer && !e.runAction && !e.ualActions) {
            this.bindRunActionToEnemy(e);
          }
        }

        // Ensure all character & enemy UAL bundles use the previous Naruto ninja run (`tobi_run`)
        this.upgradeCharacterUalRunActionsToPreviousRun();
      } finally {
        template.dispose();
      }
    } catch {
      // Retain existing run animation or procedural Storm 4 fallback if load fails
    }
  }

  private getCharacterCacheKey(
    source: string | Blob,
    labelAr?: string,
    fileNameHint?: string,
    options?: { colorPreset?: CharacterColorPreset }
  ): string {
    const presetTag = options?.colorPreset ?? 'auto';
    const isDeidaraTarget = isDeidaraName(
      labelAr,
      fileNameHint || (typeof source === 'string' ? source : undefined)
    );
    const deidaraTexTag = isDeidaraTarget ? `::dtex_${this.deidaraTextureRevision}` : '';
    const isObitoTarget = /obito|mask_man|original_obito/i.test(labelAr || fileNameHint || (typeof source === 'string' ? source : ''));
    const obitoEyeTag = isObitoTarget ? `::oeye_${this.obitoEyeRevision}` : '';
    if (typeof source === 'string') {
      return `url:${source}::${presetTag}${deidaraTexTag}${obitoEyeTag}`;
    }
    let blobId = this.blobCacheIds.get(source);
    if (!blobId) {
      blobId = `blob_${this.nextBlobCacheId++}`;
      this.blobCacheIds.set(source, blobId);
    }
    return `blob:${blobId}:${fileNameHint || labelAr || ''}::${presetTag}${deidaraTexTag}${obitoEyeTag}`;
  }

  public isCharacterCached(
    source: string | Blob,
    labelAr?: string,
    fileNameHint?: string,
    options?: { colorPreset?: CharacterColorPreset }
  ): boolean {
    const key = this.getCharacterCacheKey(source, labelAr, fileNameHint, options);
    return this.playerRigCache.has(key);
  }

  private pruneInactivePlayerRigCache(): void {
    for (const [k, entry] of Array.from(this.playerRigCache.entries())) {
      if (k === this.activePlayerRigCacheKey) continue;
      this.playerRigCache.delete(k);
      if (entry.obito.root.parent === this.scene) {
        this.scene.remove(entry.obito.root);
      }
      entry.ualActions = null;
      entry.obito.dispose();
    }
  }

  private evictOldestCachedPlayerRigIfNeeded(): void {
    const MAX_CACHED_PLAYER_RIGS = 3;
    while (this.playerRigCache.size > MAX_CACHED_PLAYER_RIGS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, entry] of this.playerRigCache.entries()) {
        if (k === this.activePlayerRigCacheKey) continue;
        if (entry.lastUsedMs < oldestTime) {
          oldestTime = entry.lastUsedMs;
          oldestKey = k;
        }
      }
      if (!oldestKey) break;
      const evicted = this.playerRigCache.get(oldestKey);
      this.playerRigCache.delete(oldestKey);
      if (evicted) {
        if (evicted.obito.root.parent === this.scene) {
          this.scene.remove(evicted.obito.root);
        }
        evicted.ualActions = null;
        evicted.obito.dispose();
      }
    }
  }

  private syncEntryAnimationTargets(entry: CachedPlayerRigEntry): void {
    const loaded = entry.obito;
    if (entry.hasNativeLocomotion) {
      return;
    }
    this.ensureCharacterUalPlayerActions(entry);
    const hasUalActions = Boolean(entry.ualActions);

    if (!hasUalActions) {
      if (!entry.isActualRunSource && this.bakedCombatAnim && loaded.attackAction) {
        loaded.attackAction.stop();
        loaded.attackAction = null;
      }

      if (this.loadedRunClip && entry.boundRunClipRef !== this.loadedRunClip) {
        this.bindSharedRunClipToCustomObito(loaded, !entry.isActualRunSource);
        entry.boundRunClipRef = this.loadedRunClip;
      }

      if (this.loadedRunIdleClip && entry.boundIdleClipRef !== this.loadedRunIdleClip) {
        this.bindRunIdleToCustomObito(loaded, true);
        entry.boundIdleClipRef = this.loadedRunIdleClip;
        entry.idleTargetState = this.playerIdleTargetState;
        entry.idleTargetAnimRef = this.bakedRunIdleAnim;
      } else if (this.bakedRunIdleAnim && entry.idleTargetAnimRef !== this.bakedRunIdleAnim && !loaded.idleAction) {
        entry.idleTargetState = this.bakedRunIdleAnim.prepareTarget(
          loaded.pivotGroup,
          loaded.bones,
          loaded.baseBoneRotations,
          loaded.baseBonePositions
        );
        entry.idleTargetAnimRef = this.bakedRunIdleAnim;
      }
    }

    if (this.bakedRunAnim && entry.runTargetAnimRef !== this.bakedRunAnim) {
      entry.runTargetState = this.bakedRunAnim.prepareTarget(
        loaded.pivotGroup,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      );
      entry.runTargetAnimRef = this.bakedRunAnim;
    }

    if (this.bakedCombatAnim && entry.combatTargetAnimRef !== this.bakedCombatAnim) {
      entry.combatTargetState = this.bakedCombatAnim.prepareTarget(
        loaded.pivotGroup,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      );
      entry.combatTargetAnimRef = this.bakedCombatAnim;
    }

    if (this.bakedDeathAnim && entry.deathTargetAnimRef !== this.bakedDeathAnim) {
      entry.deathTargetState = this.bakedDeathAnim.prepareTarget(
        loaded.pivotGroup,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      );
      entry.deathTargetAnimRef = this.bakedDeathAnim;
    }
  }

  private async prepareAndCachePlayerRigEntry(
    cacheKey: string,
    source: string | Blob,
    labelAr?: string,
    fileNameHint?: string,
    options?: { colorPreset?: CharacterColorPreset }
  ): Promise<CachedPlayerRigEntry> {
    const cached = this.playerRigCache.get(cacheKey);
    if (cached) return cached;

    const inflight = this.playerRigInflight.get(cacheKey);
    if (inflight) return inflight;

    const task = (async (): Promise<CachedPlayerRigEntry> => {
      const loaded = await loadObitoGltfModel(source, fileNameHint, {
        labelAr,
        colorPreset: options?.colorPreset,
      });
      if (this.disposed) {
        loaded.dispose();
        throw new Error('ENGINE_DISPOSED');
      }

      const effectiveHint = fileNameHint || (typeof source === 'string' ? source : undefined);
      const isActualRunSource = isRunCharacterName(labelAr, effectiveHint);
      const isMadaraRikudo = isMadaraRikudoName(labelAr, effectiveHint);
      const isTobiV2 = isMaskManV2Name(labelAr, effectiveHint) || isMadaraRikudo;
      const isObitoUchiha = isObitoUchihaName(labelAr, effectiveHint);
      const isOriginalObito = isOriginalObitoName(labelAr, effectiveHint);
      const isMadara = !isMadaraRikudo && isMadaraName(labelAr, effectiveHint);
      const isKakashi = isKakashiName(labelAr, effectiveHint);
      const isItachi = isItachiName(labelAr, effectiveHint);
      const isDeidara = isDeidaraName(labelAr, effectiveHint);
      const isNarutoKurama = isNarutoKuramaName(labelAr, effectiveHint);
      const isNarutoSage = isNarutoSageName(labelAr, effectiveHint);
      const isCustomGenericChar =
        !isMadara && !isKakashi && !isItachi && !isDeidara && !isNarutoKurama && !isNarutoSage;
      if (isCustomGenericChar && !isActualRunSource) {
        loaded.idleAction?.stop();
        loaded.runAction?.stop();
        loaded.attackAction?.stop();
        loaded.idleAction = null;
        loaded.runAction = null;
        loaded.attackAction = null;
      }
      const hasNativeLocomotion = isDeidara && Boolean(loaded.idleAction && loaded.runAction);
      const hasKamui = isCustomGenericChar;
      const hasGedoMazo = isTobiV2 || isObitoUchiha || isOriginalObito || isCustomGenericChar;
      const hasTobiV2Moveset =
        hasGedoMazo || isMadara || isKakashi || isItachi || isNarutoKurama || isNarutoSage;
      const soleClearance = this.measureRigSoleClearance(loaded.root, loaded.bones);
      const physicsSolver = createHeadCollarPhysicsSolver(
        loaded.pivotGroup,
        loaded.bones,
        isOriginalObito,
        isTobiV2
      );
      const cloakSolver = loaded.hasSkeleton
        ? createCloakPhysicsSolver(loaded.pivotGroup, loaded.bones, loaded.baseBoneRotations)
        : null;

      const entry: CachedPlayerRigEntry = {
        cacheKey,
        obito: loaded,
        physicsSolver,
        cloakSolver,
        soleClearance,
        isActualRunSource,
        isTobiV2,
        isObitoUchiha,
        isOriginalObito,
        isMadara,
        isKakashi,
        isItachi,
        isDeidara,
        isNarutoKurama,
        isNarutoSage,
        hasNativeLocomotion,
        hasKamui,
        hasGedoMazo,
        hasTobiV2Moveset,
        isIntangibleKamuiUser: isObitoUchiha,
        runTargetState:
          !hasNativeLocomotion && this.bakedRunAnim
            ? this.bakedRunAnim.prepareTarget(
                loaded.pivotGroup,
                loaded.bones,
                loaded.baseBoneRotations,
                loaded.baseBonePositions
              )
            : null,
        runTargetAnimRef: hasNativeLocomotion ? null : this.bakedRunAnim,
        combatTargetState:
          !hasNativeLocomotion && this.bakedCombatAnim
            ? this.bakedCombatAnim.prepareTarget(
                loaded.pivotGroup,
                loaded.bones,
                loaded.baseBoneRotations,
                loaded.baseBonePositions
              )
            : null,
        combatTargetAnimRef: hasNativeLocomotion ? null : this.bakedCombatAnim,
        deathTargetState: this.bakedDeathAnim
          ? this.bakedDeathAnim.prepareTarget(
              loaded.pivotGroup,
              loaded.bones,
              loaded.baseBoneRotations,
              loaded.baseBonePositions
            )
          : null,
        deathTargetAnimRef: this.bakedDeathAnim,
        idleTargetState: null,
        idleTargetAnimRef: null,
        boundRunClipRef: null,
        boundIdleClipRef: null,
        lastUsedMs: performance.now(),
      };

      this.playerRigCache.set(cacheKey, entry);
      this.evictOldestCachedPlayerRigIfNeeded();
      return entry;
    })().finally(() => {
      this.playerRigInflight.delete(cacheKey);
    });

    this.playerRigInflight.set(cacheKey, task);
    return task;
  }

  private activatePlayerRigEntry(
    entry: CachedPlayerRigEntry,
    source: string | Blob,
    labelAr?: string,
    fileNameHint?: string
  ): void {
    entry.lastUsedMs = performance.now();

    if (this.customObito && this.customObito !== entry.obito) {
      if (this.activeSusanoo) {
        this.susanooSummonVersion++;
        this.disposeActiveSusanoo();
      }
      this.restorePlayerIntangibilityMaterials();
      this.playerOriginalMaterials.clear();
      this.customObito.mixer?.stopAllAction();
      this.scene.remove(this.customObito.root);
      if (!this.activePlayerRigCacheKey || !this.playerRigCache.has(this.activePlayerRigCacheKey)) {
        this.customObito.dispose();
      }
    }

    const loaded = entry.obito;
    this.activePlayerRigCacheKey = entry.cacheKey;
    this.customObito = loaded;
    this.customObitoPhysicsSolver = entry.physicsSolver;
    this.customObitoPhysicsSolver?.reset();
    this.customObitoCloakSolver = entry.cloakSolver;
    this.customObitoCloakSolver?.reset();

    this.playerOriginalMaterials.clear();
    this.cachePlayerMaterials(loaded.root);

    loaded.root.visible = true;
    loaded.root.scale.setScalar(CHARACTER_WORLD_SCALE);
    loaded.root.position.copy(this.playerPos);
    loaded.root.rotation.set(0, this.playerYaw, 0);
    loaded.pivotGroup.position.set(0, 0, 0);
    loaded.pivotGroup.rotation.set(0, 0, 0);
    if (loaded.hasSkeleton) {
      this.anchorRigHipsParentToRest(loaded.bones, loaded.baseBoneRotations, loaded.baseBonePositions);
      loaded.baseBoneRotations.forEach((euler, bone) => {
        bone.rotation.copy(euler);
      });
      loaded.baseBonePositions.forEach((pos, bone) => {
        bone.position.copy(pos);
      });
    }
    if (loaded.root.parent !== this.scene) {
      this.scene.add(loaded.root);
    }

    this.playerSoleClearance = entry.soleClearance;
    this.onModelLoaded?.(true);

    this.isMadara = entry.isMadara;
    this.isKakashi = entry.isKakashi;
    this.isItachi = entry.isItachi;
    this.isDeidara = entry.isDeidara;
    this.isNarutoKurama = entry.isNarutoKurama;
    this.isNarutoSage = entry.isNarutoSage;
    this.hasKamui = entry.hasKamui;
    this.hasGedoMazo = entry.hasGedoMazo;
    this.hasTobiV2Moveset = entry.hasTobiV2Moveset;
    this.isIntangibleKamuiUser = entry.isIntangibleKamuiUser;
    this.isObitoOrTobi = entry.isTobiV2 || entry.isObitoUchiha || entry.isOriginalObito;
    if (
      (this.isMadara ||
        this.isKakashi ||
        this.isItachi ||
        this.isDeidara ||
        this.isNarutoKurama ||
        this.isNarutoSage) &&
      this.kamuiTimer > 0
    ) {
      this.kamuiTimer = 0;
    }
    if (this.hasGedoMazo) {
      soundEngine.preloadGedoVoice();
      soundEngine.preloadKatonVoice();
      void preloadGedoMazoModel();
    }
    if (this.isItachi) {
      soundEngine.preloadKatonVoice();
    }
    if (this.isMadara) {
      soundEngine.preloadMadaraKatonVoice();
      void preloadSusanooModel();
    } else if (this.activeSusanoo) {
      this.susanooSummonVersion++;
      this.disposeActiveSusanoo();
    }

    this.customObitoIsRunSource = !entry.hasNativeLocomotion;
    this.customObitoIsActualRunFile = entry.isActualRunSource;
    this.playerDying = false;
    this.playerDeathTimer = 0;
    this.playerDeathBlend = 0;
    this.playerRaikiriState = null;
    this.hidePlayerRaikiriVfx();
    this.obitoShadow.visible = true;
    this.resetGunbaiSpring();
    this.resetRunCombatState();
    this.madaraJumpPhase = 'none';
    this.madaraJumpPhaseTimer = 0;
    this.madaraAttackStep = 0;
    this.madaraActiveAttackAction = null;

    this.syncEntryAnimationTargets(entry);
    if (!entry.hasNativeLocomotion && !this.ualRetargetDriver) {
      void this.preloadUalAnimationLibrary();
    }
    this.playerRunTargetState = entry.hasNativeLocomotion ? null : entry.runTargetState;
    this.playerCombatTargetState = entry.hasNativeLocomotion ? null : entry.combatTargetState;
    this.playerDeathTargetState = entry.deathTargetState;
    this.playerIdleTargetState =
      entry.hasNativeLocomotion || loaded.idleAction ? null : entry.idleTargetState;

    const effectiveHint = fileNameHint || (typeof source === 'string' ? source : undefined);
    if (!entry.hasNativeLocomotion) {
      if (entry.isActualRunSource) {
        void this.setRunAnimationSource(source, effectiveHint || labelAr, true);
      } else if (!this.hasExplicitRunSource && !this.bakedRunAnim) {
        void this.setRunAnimationSource(RUN_DEFAULT_CLIP_URL, 'tobi_run.glb', false);
      }
      if (!this.bakedCombatAnim) {
        void this.preloadRunCombatAnimation();
      }
      if (!this.loadedRunIdleClip || !this.bakedRunIdleAnim) {
        void this.preloadRunIdleAnimation(loaded.mixerRoot);
      }
    }
    if (!this.bakedDeathAnim) {
      void this.preloadDeathAnimation();
    }

    if (loaded.mixer) {
      if (entry.ualActions) {
        loaded.mixer.stopAllAction();
        entry.ualActions.activeAction = null;
        const startAction =
          this.playerAnimState === 'run' && entry.ualActions.run
            ? entry.ualActions.run
            : entry.ualActions.idle;
        startAction.enabled = true;
        startAction.paused = false;
        startAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        entry.ualActions.activeAction = startAction;
      } else if (this.playerAnimState === 'run' && loaded.runAction) {
        loaded.idleAction?.stop();
        loaded.runAction.enabled = true;
        loaded.runAction.paused = false;
        loaded.runAction.reset().setEffectiveWeight(1).play();
      } else if (loaded.idleAction) {
        loaded.runAction?.stop();
        loaded.idleAction.enabled = true;
        loaded.idleAction.paused = false;
        loaded.idleAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      }
    }

    this.setAnnouncement(
      labelAr ? `تم اختيار شخصية: ${labelAr}` : 'تم تحميل المجسم ثلاثي الأبعاد بنجاح!',
      2.0
    );
    this.pushHud(true);
  }

  public async loadCustomObitoModel(
    source: string | Blob,
    labelAr?: string,
    fileNameHint?: string,
    options?: { colorPreset?: CharacterColorPreset }
  ): Promise<void> {
    const version = ++this.modelLoadVersion;
    const cacheKey = this.getCharacterCacheKey(source, labelAr, fileNameHint, options);

    // Synchronous instant swap when already cached (zero network/parse/GPU lag!)
    const cached = this.playerRigCache.get(cacheKey);
    if (cached) {
      if (this.disposed || version !== this.modelLoadVersion) return;
      this.activatePlayerRigEntry(cached, source, labelAr, fileNameHint);
      return;
    }

    const entry = await this.prepareAndCachePlayerRigEntry(
      cacheKey,
      source,
      labelAr,
      fileNameHint,
      options
    );
    if (this.disposed || version !== this.modelLoadVersion) {
      return;
    }
    this.activatePlayerRigEntry(entry, source, labelAr, fileNameHint);
  }

  private countClipMatchedNodes(clip: THREE.AnimationClip, targetRoot: THREE.Object3D): number {
    const targetNodeNames = new Set<string>();
    targetRoot.traverse((obj) => {
      if (obj.name) targetNodeNames.add(obj.name);
    });

    let matched = 0;
    const seen = new Set<string>();
    for (const track of clip.tracks) {
      const dotIdx = track.name.indexOf('.');
      if (dotIdx <= 0) continue;
      const nodeName = track.name.slice(0, dotIdx);
      if (targetNodeNames.has(nodeName) && !seen.has(nodeName)) {
        seen.add(nodeName);
        matched++;
      }
    }
    return matched;
  }

  private bindSharedRunClipToCustomObito(
    loaded: CustomGltfCharacter,
    forceReplace = false
  ): void {
    if (!this.loadedRunClip) return;
    if (loaded.runAction && !forceReplace) return;

    const matched = this.countClipMatchedNodes(this.loadedRunClip, loaded.mixerRoot);
    if (matched < 6) {
      // Skeleton bone names differ from `run`: clear model-native runAction so BakedRunAnimation drives it
      if (forceReplace && loaded.runAction) {
        loaded.runAction.stop();
        loaded.runAction = null;
      }
      return;
    }

    if (loaded.runAction) {
      loaded.runAction.stop();
      loaded.runAction = null;
    }
    if (!loaded.mixer) {
      loaded.mixer = new THREE.AnimationMixer(loaded.mixerRoot);
    }
    const cleanRunClip =
      this.buildPreviousRunClip(
        loaded.pivotGroup,
        loaded.mixerRoot,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      ) ?? this.loadedRunClip;
    const action = loaded.mixer.clipAction(cleanRunClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    if (this.playerAnimState === 'run') {
      loaded.idleAction?.stop();
      action.reset().setEffectiveWeight(1).play();
    } else {
      action.stop();
    }
    loaded.runAction = action;
  }

  private bindRunIdleToCustomObito(
    loaded: CustomGltfCharacter,
    forceReplace = false
  ): void {
    if (this.loadedRunIdleClip) {
      const matched = this.countClipMatchedNodes(this.loadedRunIdleClip, loaded.mixerRoot);
      if (matched >= 6) {
        if (loaded.idleAction) {
          if (!forceReplace) {
            this.playerIdleTargetState = null;
            return;
          }
          loaded.idleAction.stop();
          loaded.idleAction = null;
        }
        if (!loaded.mixer) {
          loaded.mixer = new THREE.AnimationMixer(loaded.mixerRoot);
        }
        const cleanIdleClip = this.buildCleanIdleClip(
          this.loadedRunIdleClip,
          loaded.bones,
          loaded.baseBoneRotations,
          loaded.baseBonePositions
        );
        const action = loaded.mixer.clipAction(cleanIdleClip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.enabled = true;
        loaded.idleAction = action;
        if (this.playerAnimState === 'idle') {
          loaded.runAction?.stop();
          action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        } else {
          action.stop();
        }
        // Clear any prior CharacterRoot or Hips offsets so standing idle is always strictly upright
        this.anchorRigHipsParentToRest(loaded.bones, loaded.baseBoneRotations, loaded.baseBonePositions);
        if (loaded.bones.hips) {
          const baseHipsRot = loaded.baseBoneRotations.get(loaded.bones.hips);
          const baseHipsPos = loaded.baseBonePositions.get(loaded.bones.hips);
          if (baseHipsRot) loaded.bones.hips.rotation.copy(baseHipsRot);
          if (baseHipsPos) loaded.bones.hips.position.copy(baseHipsPos);
        }
        this.playerIdleTargetState = null;
        return;
      }
    }

    if (this.bakedRunIdleAnim) {
      if (forceReplace && loaded.idleAction) {
        loaded.idleAction.stop();
        loaded.idleAction = null;
      }
      this.playerIdleTargetState = this.bakedRunIdleAnim.prepareTarget(
        loaded.pivotGroup,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      );
    }
  }

  private async preloadRunIdleAnimation(targetRoot?: THREE.Object3D): Promise<void> {
    if (this.idlePreloadStarted || (this.loadedRunIdleClip && this.bakedRunIdleAnim) || this.disposed) {
      return;
    }
    this.idlePreloadStarted = true;
    try {
      const refRoot = targetRoot || this.customObito?.mixerRoot;
      const extracted = await loadFbxIdleAnimationClipOnly(activeRunClipUrl, refRoot, true);
      if (!extracted || this.disposed) {
        extracted?.templateForRetarget?.dispose();
        this.idlePreloadStarted = false;
        return;
      }

      this.loadedRunIdleClip = extracted.clip;
      if (extracted.templateForRetarget) {
        try {
          this.bakedRunIdleAnim = new BakedIdleAnimation(extracted.templateForRetarget);
        } finally {
          extracted.templateForRetarget.dispose();
        }
      }

      if (this.customObito && !this.getActivePlayerUalActions() && this.customObitoIsRunSource) {
        this.bindRunIdleToCustomObito(this.customObito, true);
      }

      if (this.bakedRunIdleAnim) {
        for (const e of this.enemies) {
          e.idleTargetState = this.bakedRunIdleAnim.prepareTarget(
            e.rig.pivotGroup,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          );
          if (e.isCustomTemplateRig && e.mixer && !e.idleAction && !e.ualActions) {
            this.bindIdleActionToEnemy(e);
          }
        }
      }
    } catch {
      this.idlePreloadStarted = false;
    }
  }

  private async preloadRunCombatAnimation(): Promise<void> {
    if (this.combatPreloadStarted || this.bakedCombatAnim || this.disposed) return;
    this.combatPreloadStarted = true;
    try {
      const template = await loadCharacterTemplate(RUN_COMBO_CLIP_URL, 'ccgq05.glb');
      try {
        if (this.disposed) return;
        const baked = new BakedCombatAnimation(template);
        this.bakedCombatAnim = baked;
        if (this.customObito) {
          if (!this.customObitoIsActualRunFile && this.customObito.attackAction) {
            this.customObito.attackAction.stop();
            this.customObito.attackAction = null;
          }
          this.playerCombatTargetState = baked.prepareTarget(
            this.customObito.pivotGroup,
            this.customObito.bones,
            this.customObito.baseBoneRotations,
            this.customObito.baseBonePositions
          );
        }
        for (const e of this.enemies) {
          e.combatTargetState = baked.prepareTarget(
            e.rig.pivotGroup,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          );
        }
      } finally {
        template.dispose();
      }
    } catch {
      this.combatPreloadStarted = false;
    }
  }

  private async preloadDeathAnimation(): Promise<void> {
    if (this.deathPreloadStarted || this.bakedDeathAnim || this.disposed) return;
    this.deathPreloadStarted = true;
    try {
      const template = await loadExternalDeathAnimationTemplate(DEATH_ANIM_URL);
      if (!template) {
        this.deathPreloadStarted = false;
        return;
      }
      try {
        if (this.disposed) return;
        const baked = new BakedDeathAnimation(template);
        this.bakedDeathAnim = baked;
        if (this.customObito) {
          this.playerDeathTargetState = baked.prepareTarget(
            this.customObito.pivotGroup,
            this.customObito.bones,
            this.customObito.baseBoneRotations,
            this.customObito.baseBonePositions
          );
          if (this.playerDying) {
            this.playerDeathDuration = Math.max(this.playerDeathTimer + 0.6, Math.max(2.6, baked.duration - 0.04));
          }
        }
        for (const e of this.enemies) {
          e.deathTargetState = baked.prepareTarget(
            e.rig.pivotGroup,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          );
          if (e.isDying) {
            e.deathDuration = Math.max(e.deathTimer + 0.5, Math.max(2.5, baked.duration - 0.04));
          }
        }
      } finally {
        template.dispose();
      }
    } catch {
      this.deathPreloadStarted = false;
    }
  }

  private getActivePlayerUalActions(): UalPlayerActionBundle | null {
    if (!this.activePlayerRigCacheKey) return null;
    return this.playerRigCache.get(this.activePlayerRigCacheKey)?.ualActions ?? null;
  }

  private stopFadedActionIfInactive(
    action: THREE.AnimationAction | null,
    active: THREE.AnimationAction | null
  ): void {
    if (action && action !== active && action.isRunning() && action.getEffectiveWeight() <= 0.02) {
      action.stop();
    }
  }

  private stopFadedUalPlayerActions(bundle: UalPlayerActionBundle): void {
    const active = bundle.activeAction;
    this.stopFadedActionIfInactive(bundle.idle, active);
    this.stopFadedActionIfInactive(bundle.run, active);
    this.stopFadedActionIfInactive(bundle.jumpStart, active);
    this.stopFadedActionIfInactive(bundle.jumpLoop, active);
    this.stopFadedActionIfInactive(bundle.jumpLand, active);
    this.stopFadedActionIfInactive(bundle.jutsu, active);
    for (let i = 0; i < bundle.combo.length; i++) {
      this.stopFadedActionIfInactive(bundle.combo[i], active);
    }
  }

  private fadeOutOtherUalPlayerActions(
    bundle: UalPlayerActionBundle,
    keepA: THREE.AnimationAction | null,
    keepB: THREE.AnimationAction | null,
    fadeDuration: number
  ): void {
    const fadeOne = (a: THREE.AnimationAction | null) => {
      if (a && a !== keepA && a !== keepB && a.isRunning()) {
        if (fadeDuration <= 0.01) a.stop();
        else a.fadeOut(fadeDuration);
      }
    };
    fadeOne(bundle.idle);
    fadeOne(bundle.run);
    fadeOne(bundle.jumpStart);
    fadeOne(bundle.jumpLoop);
    fadeOne(bundle.jumpLand);
    fadeOne(bundle.jutsu);
    for (let i = 0; i < bundle.combo.length; i++) {
      fadeOne(bundle.combo[i]);
    }
  }

  private crossFadeUalPlayerAction(
    bundle: UalPlayerActionBundle,
    next: THREE.AnimationAction,
    fadeDuration: number,
    reset = true,
    timeScale = 1
  ): void {
    const prev = bundle.activeAction;
    if (prev === next) {
      next.enabled = true;
      next.paused = false;
      next.setEffectiveTimeScale(timeScale);
      if (reset) {
        next.reset().setEffectiveWeight(1).play();
      } else if (!next.isRunning()) {
        next.setEffectiveWeight(1).play();
      }
      return;
    }

    this.fadeOutOtherUalPlayerActions(bundle, prev, next, Math.min(fadeDuration, 0.08));

    next.enabled = true;
    next.paused = false;
    if (reset) {
      next.reset();
    }
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.play();

    if (prev && prev.isRunning() && fadeDuration > 0.01) {
      prev.crossFadeTo(next, fadeDuration, false);
    } else {
      prev?.stop();
    }
    bundle.activeAction = next;
  }

  private stopFadedUalEnemyActions(bundle: UalEnemyActionBundle): void {
    const active = bundle.activeAction;
    this.stopFadedActionIfInactive(bundle.idle, active);
    this.stopFadedActionIfInactive(bundle.run, active);
    this.stopFadedActionIfInactive(bundle.jutsu, active);
    for (let i = 0; i < bundle.combo.length; i++) {
      this.stopFadedActionIfInactive(bundle.combo[i], active);
    }
  }

  private fadeOutOtherUalEnemyActions(
    bundle: UalEnemyActionBundle,
    keepA: THREE.AnimationAction | null,
    keepB: THREE.AnimationAction | null,
    fadeDuration: number
  ): void {
    const fadeOne = (a: THREE.AnimationAction | null) => {
      if (a && a !== keepA && a !== keepB && a.isRunning()) {
        if (fadeDuration <= 0.01) a.stop();
        else a.fadeOut(fadeDuration);
      }
    };
    fadeOne(bundle.idle);
    fadeOne(bundle.run);
    fadeOne(bundle.jutsu);
    for (let i = 0; i < bundle.combo.length; i++) {
      fadeOne(bundle.combo[i]);
    }
  }

  private crossFadeUalEnemyAction(
    bundle: UalEnemyActionBundle,
    next: THREE.AnimationAction,
    fadeDuration: number,
    reset = true,
    timeScale = 1
  ): void {
    const prev = bundle.activeAction;
    if (prev === next) {
      next.enabled = true;
      next.paused = false;
      next.setEffectiveTimeScale(timeScale);
      if (reset) {
        next.reset().setEffectiveWeight(1).play();
      } else if (!next.isRunning()) {
        next.setEffectiveWeight(1).play();
      }
      return;
    }

    this.fadeOutOtherUalEnemyActions(bundle, prev, next, Math.min(fadeDuration, 0.08));

    next.enabled = true;
    next.paused = false;
    if (reset) {
      next.reset();
    }
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.play();

    if (prev && prev.isRunning() && fadeDuration > 0.01) {
      prev.crossFadeTo(next, fadeDuration, false);
    } else {
      prev?.stop();
    }
    bundle.activeAction = next;
  }

  private getRigHipsParent(
    bones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>
  ): THREE.Bone | null {
    const parentRaw = bones.hips?.parent;
    if (
      parentRaw &&
      parentRaw !== bones.hips &&
      baseBoneRotations.has(parentRaw as THREE.Bone)
    ) {
      return parentRaw as THREE.Bone;
    }
    return null;
  }

  private anchorRigHipsParentToRest(
    bones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>
  ): void {
    const hipsParent = this.getRigHipsParent(bones, baseBoneRotations);
    if (!hipsParent) return;
    const baseRot = baseBoneRotations.get(hipsParent);
    const basePos = baseBonePositions.get(hipsParent);
    if (baseRot) hipsParent.rotation.copy(baseRot);
    if (basePos) hipsParent.position.copy(basePos);
  }

  private buildCleanIdleClip(
    sourceClip: THREE.AnimationClip,
    bones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>
  ): THREE.AnimationClip {
    const clip = sourceClip.clone();
    const duration = Math.max(0.2, clip.duration || 2.0);
    const times = new Float32Array([0, duration]);
    const trackNames = new Set(clip.tracks.map((t) => t.name));

    const hipsParent = this.getRigHipsParent(bones, baseBoneRotations);
    if (hipsParent && hipsParent.name) {
      const qName = `${hipsParent.name}.quaternion`;
      const pName = `${hipsParent.name}.position`;
      const baseRot = baseBoneRotations.get(hipsParent);
      const basePos = baseBonePositions.get(hipsParent);
      if (baseRot && !trackNames.has(qName)) {
        const q = new THREE.Quaternion().setFromEuler(baseRot);
        clip.tracks.push(
          new THREE.QuaternionKeyframeTrack(qName, times, new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]))
        );
      }
      if (basePos && !trackNames.has(pName)) {
        clip.tracks.push(
          new THREE.VectorKeyframeTrack(
            pName,
            times,
            new Float32Array([basePos.x, basePos.y, basePos.z, basePos.x, basePos.y, basePos.z])
          )
        );
      }
    }

    if (bones.hips && bones.hips.name) {
      const qName = `${bones.hips.name}.quaternion`;
      const pName = `${bones.hips.name}.position`;
      const baseRot = baseBoneRotations.get(bones.hips);
      const basePos = baseBonePositions.get(bones.hips);
      if (baseRot && !trackNames.has(qName)) {
        const q = new THREE.Quaternion().setFromEuler(baseRot);
        clip.tracks.push(
          new THREE.QuaternionKeyframeTrack(qName, times, new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]))
        );
      }
      if (basePos && !trackNames.has(pName)) {
        clip.tracks.push(
          new THREE.VectorKeyframeTrack(
            pName,
            times,
            new Float32Array([basePos.x, basePos.y, basePos.z, basePos.x, basePos.y, basePos.z])
          )
        );
      }
    }

    return clip;
  }

  private buildPreviousRunClip(
    _pivotGroup: THREE.Object3D,
    mixerRoot: THREE.Object3D,
    bones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>
  ): THREE.AnimationClip | null {
    if (!this.loadedRunClip) return null;
    if (this.countClipMatchedNodes(this.loadedRunClip, mixerRoot) < 6) return null;

    // Preserve the exact original `tobi_run` clip untouched (including CharacterRoot height & lean)
    // so feet plant solidly on the ground on every stride exactly like the original run.
    const clip = this.loadedRunClip.clone();
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
    clip.name = 'PreviousRun_Shinobi';
    const duration = Math.max(0.2, clip.duration || 0.63);
    const times = new Float32Array([0, duration]);
    const trackNames = new Set(clip.tracks.map((t) => t.name));

    // Append clean rest-pose tracks for Hips/Hands so crossFadeTo between UAL poses (Idle/Jump/Combo/Jutsu)
    // and `tobi_run` blends smoothly with zero pop or residual tilt.
    const appendRestQuatTrack = (bone: THREE.Bone | null) => {
      if (!bone || !bone.name) return;
      const trackName = `${bone.name}.quaternion`;
      if (trackNames.has(trackName)) return;
      const baseEuler = baseBoneRotations.get(bone);
      if (!baseEuler) return;
      const q = new THREE.Quaternion().setFromEuler(baseEuler);
      clip.tracks.push(
        new THREE.QuaternionKeyframeTrack(
          trackName,
          times,
          new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])
        )
      );
      trackNames.add(trackName);
    };

    if (bones.hips && bones.hips.name) {
      appendRestQuatTrack(bones.hips);
      const posTrackName = `${bones.hips.name}.position`;
      if (!trackNames.has(posTrackName)) {
        const basePos = baseBonePositions.get(bones.hips);
        if (basePos) {
          clip.tracks.push(
            new THREE.VectorKeyframeTrack(
              posTrackName,
              times,
              new Float32Array([
                basePos.x,
                basePos.y,
                basePos.z,
                basePos.x,
                basePos.y,
                basePos.z,
              ])
            )
          );
          trackNames.add(posTrackName);
        }
      }
    }
    appendRestQuatTrack(bones.leftHand);
    appendRestQuatTrack(bones.rightHand);

    return clip;
  }

  private upgradeCharacterUalRunActionsToPreviousRun(force = false): void {
    if (!this.loadedRunClip && !this.bakedRunAnim) return;

    for (const entry of this.playerRigCache.values()) {
      if (!entry.ualActions || entry.hasNativeLocomotion) continue;
      if (!force && entry.ualActions.usesPreviousRun) continue;
      const loaded = entry.obito;
      if (!loaded.mixer) continue;
      const savedRotX = loaded.pivotGroup.rotation.x;
      const savedRotY = loaded.pivotGroup.rotation.y;
      const savedRotZ = loaded.pivotGroup.rotation.z;
      loaded.pivotGroup.rotation.set(0, 0, 0);
      const prevRunClip =
        this.buildPreviousRunClip(
          loaded.pivotGroup,
          loaded.mixerRoot,
          loaded.bones,
          loaded.baseBoneRotations,
          loaded.baseBonePositions
        ) ??
        (this.bakedRunAnim
          ? this.bakedRunAnim.compileClipForTarget(
              loaded.pivotGroup,
              loaded.bones,
              loaded.baseBoneRotations,
              loaded.baseBonePositions,
              'Retargeted_Shinobi_Run'
            )
          : null);
      loaded.pivotGroup.rotation.set(savedRotX, savedRotY, savedRotZ);
      loaded.pivotGroup.updateMatrixWorld(true);
      if (!prevRunClip) continue;

      const bundle = entry.ualActions;
      const oldRun = bundle.run;
      const wasActive = Boolean(oldRun && bundle.activeAction === oldRun);
      const newRun = loaded.mixer.clipAction(prevRunClip);
      newRun.setLoop(THREE.LoopRepeat, Infinity);
      newRun.clampWhenFinished = false;
      newRun.enabled = true;
      newRun.stop();

      oldRun?.stop();
      bundle.run = newRun;
      bundle.usesPreviousRun = true;
      if (wasActive || (this.playerAnimState === 'run' && bundle.activeAction === bundle.idle)) {
        bundle.activeAction?.fadeOut(0.10);
        newRun.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        bundle.activeAction = newRun;
      }
    }

    for (const [presetId, clipSet] of this.enemyUalClipsByPreset.entries()) {
      if (!force && clipSet.usesPreviousRun) continue;
      let upgradedClip: THREE.AnimationClip | null = null;
      for (const e of this.enemies) {
        if (e.presetId !== presetId || !e.isCustomTemplateRig || !e.mixer || !e.ualActions) continue;
        const mixerRoot = e.rig.pivotGroup.children[0];
        if (!mixerRoot) continue;
        if (!upgradedClip) {
          upgradedClip = this.buildPreviousRunClip(
            e.rig.pivotGroup,
            mixerRoot,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          );
          if (!upgradedClip && this.bakedRunAnim) {
            upgradedClip = this.bakedRunAnim.compileClipForTarget(
              e.rig.pivotGroup,
              e.rig.bones,
              e.rig.baseBoneRotations,
              e.rig.baseBonePositions,
              'Retargeted_Shinobi_Run'
            );
          }
          if (!upgradedClip) break;
          clipSet.run = upgradedClip;
          clipSet.usesPreviousRun = true;
        }
        const bundle = e.ualActions;
        const oldRun = bundle.run;
        const wasActive = Boolean(oldRun && bundle.activeAction === oldRun);
        const newRun = e.mixer.clipAction(upgradedClip);
        newRun.setLoop(THREE.LoopRepeat, Infinity);
        newRun.clampWhenFinished = false;
        newRun.enabled = true;
        newRun.stop();

        oldRun?.stop();
        bundle.run = newRun;
        bundle.usesPreviousRun = true;
        if (wasActive) {
          newRun.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
          bundle.activeAction = newRun;
        }
      }
    }
  }


  private ensureCharacterUalPlayerActions(entry: CachedPlayerRigEntry): UalPlayerActionBundle | null {
    if (entry.hasNativeLocomotion) return null;
    if (entry.ualActions) return entry.ualActions;
    const driver = this.ualRetargetDriver;
    if (!driver || !driver.hasClip('Idle_Loop')) return null;

    const loaded = entry.obito;
    if (!loaded.hasSkeleton) return null;

    const savedPivotRotX = loaded.pivotGroup.rotation.x;
    const savedPivotRotY = loaded.pivotGroup.rotation.y;
    const savedPivotRotZ = loaded.pivotGroup.rotation.z;
    loaded.pivotGroup.rotation.set(0, 0, 0);

    const compile = (
      clipName: string,
      name: string,
      cyclic: boolean,
      fps: number,
      hipClampMin: number,
      hipClampMax: number
    ) =>
      driver.compileClipForTarget(
        clipName,
        loaded.pivotGroup,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions,
        { name, cyclic, fps, hipClampMin, hipClampMax }
      );

    const idleClip = compile('Idle_Loop', 'UAL_Char_Idle', true, 24, -0.10, 0.08);
    if (!idleClip) {
      loaded.pivotGroup.rotation.set(savedPivotRotX, savedPivotRotY, savedPivotRotZ);
      loaded.pivotGroup.updateMatrixWorld(true);
      return null;
    }

    const previousRunClip =
      this.buildPreviousRunClip(
        loaded.pivotGroup,
        loaded.mixerRoot,
        loaded.bones,
        loaded.baseBoneRotations,
        loaded.baseBonePositions
      ) ??
      (this.bakedRunAnim
        ? this.bakedRunAnim.compileClipForTarget(
            loaded.pivotGroup,
            loaded.bones,
            loaded.baseBoneRotations,
            loaded.baseBonePositions,
            'Retargeted_Shinobi_Run'
          )
        : null);
    const usesPreviousRun = Boolean(previousRunClip);
    const runClipForBundle =
      previousRunClip ??
      (driver.hasClip('Sprint_Loop')
        ? compile('Sprint_Loop', 'UAL_Char_Run_Fallback', true, 30, -0.16, 0.14)
        : null);

    const jutsuClipName = driver.hasClip('Spell_Simple_Shoot')
      ? 'Spell_Simple_Shoot'
      : driver.hasClip('Spell_Simple_Enter')
        ? 'Spell_Simple_Enter'
        : null;

    const jumpStartClip = driver.hasClip('Jump_Start')
      ? compile('Jump_Start', 'UAL_Char_JumpStart', false, 30, -0.22, 0.24)
      : null;
    const jumpLoopClip = driver.hasClip('Jump_Loop')
      ? compile('Jump_Loop', 'UAL_Char_JumpLoop', true, 24, -0.16, 0.16)
      : null;
    const jumpLandClip = driver.hasClip('Jump_Land')
      ? compile('Jump_Land', 'UAL_Char_JumpLand', false, 30, -0.26, 0.10)
      : null;
    const jutsuClip = jutsuClipName
      ? compile(jutsuClipName, 'UAL_Char_Jutsu', false, 30, -0.14, 0.10)
      : null;

    // Preserve each character's own melee attack: only Madara uses UAL melee combo clips;
    // all other characters keep their existing `ccgq05.glb` 3-hit martial combo.
    const comboClips: THREE.AnimationClip[] = [];
    if (entry.isMadara) {
      const comboClipNames = ['Punch_Jab', 'Punch_Cross', 'Sword_Attack'] as const;
      for (let i = 0; i < comboClipNames.length; i++) {
        const clipName = comboClipNames[i];
        if (driver.hasClip(clipName)) {
          const compiled = compile(clipName, `UAL_Madara_Combo_${i}`, false, 30, -0.22, 0.14);
          if (compiled) comboClips.push(compiled);
        }
      }
    }

    loaded.pivotGroup.rotation.set(savedPivotRotX, savedPivotRotY, savedPivotRotZ);
    loaded.pivotGroup.updateMatrixWorld(true);

    if (!loaded.mixer) {
      loaded.mixer = new THREE.AnimationMixer(loaded.mixerRoot);
    }
    loaded.idleAction?.stop();
    loaded.runAction?.stop();
    loaded.attackAction?.stop();
    loaded.idleAction = null;
    loaded.runAction = null;
    loaded.attackAction = null;
    loaded.mixer.stopAllAction();

    const makeAction = (clip: THREE.AnimationClip, cyclic: boolean): THREE.AnimationAction => {
      const act = loaded.mixer!.clipAction(clip);
      if (cyclic) {
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.clampWhenFinished = false;
      } else {
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
      }
      act.enabled = true;
      act.stop();
      return act;
    };

    const bundle: UalPlayerActionBundle = {
      idle: makeAction(idleClip, true),
      run: runClipForBundle ? makeAction(runClipForBundle, true) : null,
      usesPreviousRun,
      jumpStart: jumpStartClip ? makeAction(jumpStartClip, false) : null,
      jumpLoop: jumpLoopClip ? makeAction(jumpLoopClip, true) : null,
      jumpLand: jumpLandClip ? makeAction(jumpLandClip, false) : null,
      combo: comboClips.map((c) => makeAction(c, false)),
      jutsu: jutsuClip ? makeAction(jutsuClip, false) : null,
      activeAction: null,
    };

    entry.ualActions = bundle;
    return bundle;
  }

  private ensureEnemyUalClips(sampleEnemy: EnemyEntity): void {
    const presetKey = sampleEnemy.presetId;
    const driver = this.ualRetargetDriver;
    if (this.enemyUalClipsByPreset.has(presetKey) || !driver || !driver.hasClip('Idle_Loop')) {
      return;
    }

    const savedRotX = sampleEnemy.rig.pivotGroup.rotation.x;
    const savedRotY = sampleEnemy.rig.pivotGroup.rotation.y;
    const savedRotZ = sampleEnemy.rig.pivotGroup.rotation.z;
    sampleEnemy.rig.pivotGroup.rotation.set(0, 0, 0);

    const compile = (
      clipName: string,
      name: string,
      cyclic: boolean,
      fps: number,
      hipClampMin: number,
      hipClampMax: number
    ) =>
      driver.compileClipForTarget(
        clipName,
        sampleEnemy.rig.pivotGroup,
        sampleEnemy.rig.bones,
        sampleEnemy.rig.baseBoneRotations,
        sampleEnemy.rig.baseBonePositions,
        { name, cyclic, fps, hipClampMin, hipClampMax }
      );

    const idle = compile('Idle_Loop', `UAL_Enemy_${presetKey}_Idle`, true, 24, -0.10, 0.08);
    if (!idle) {
      sampleEnemy.rig.pivotGroup.rotation.set(savedRotX, savedRotY, savedRotZ);
      sampleEnemy.rig.pivotGroup.updateMatrixWorld(true);
      return;
    }

    const enemyMixerRoot = sampleEnemy.rig.pivotGroup.children[0];
    const previousRunClip = enemyMixerRoot
      ? this.buildPreviousRunClip(
          sampleEnemy.rig.pivotGroup,
          enemyMixerRoot,
          sampleEnemy.rig.bones,
          sampleEnemy.rig.baseBoneRotations,
          sampleEnemy.rig.baseBonePositions
        )
      : null;
    const usesPreviousRun = Boolean(previousRunClip);
    const jutsuClipName = driver.hasClip('Spell_Simple_Shoot')
      ? 'Spell_Simple_Shoot'
      : driver.hasClip('Spell_Simple_Enter')
        ? 'Spell_Simple_Enter'
        : null;
    const jutsu = jutsuClipName
      ? compile(jutsuClipName, `UAL_Enemy_${presetKey}_Jutsu`, false, 30, -0.14, 0.10)
      : null;

    // Only Madara enemy uses UAL combo clips; Kakashi enemy preserves his `ccgq05.glb` melee combo.
    const combo: THREE.AnimationClip[] = [];
    if (sampleEnemy.kind === 'madara') {
      const comboNames = ['Punch_Jab', 'Punch_Cross', 'Sword_Attack'] as const;
      for (let i = 0; i < comboNames.length; i++) {
        const clipName = comboNames[i];
        if (driver.hasClip(clipName)) {
          const compiled = compile(clipName, `UAL_EnemyMadara_Combo_${i}`, false, 30, -0.22, 0.14);
          if (compiled) combo.push(compiled);
        }
      }
    }

    sampleEnemy.rig.pivotGroup.rotation.set(savedRotX, savedRotY, savedRotZ);
    sampleEnemy.rig.pivotGroup.updateMatrixWorld(true);

    this.enemyUalClipsByPreset.set(presetKey, {
      idle,
      run: previousRunClip,
      usesPreviousRun,
      combo,
      jutsu,
    });
  }

  private bindUalActionsToEnemy(e: EnemyEntity): boolean {
    if (!e.isCustomTemplateRig || !e.mixer) return false;
    if (!this.ualRetargetDriver) return false;

    this.ensureEnemyUalClips(e);
    const clipSet = this.enemyUalClipsByPreset.get(e.presetId);
    if (!clipSet) return false;
    if (!clipSet.usesPreviousRun && this.loadedRunClip) {
      const enemyMixerRoot = e.rig.pivotGroup.children[0];
      const upgraded = enemyMixerRoot
        ? this.buildPreviousRunClip(
            e.rig.pivotGroup,
            enemyMixerRoot,
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions
          )
        : null;
      if (upgraded) {
        clipSet.run = upgraded;
        clipSet.usesPreviousRun = true;
      }
    }

    e.idleAction?.stop();
    e.runAction?.stop();
    e.idleAction = null;
    e.runAction = null;
    e.mixer.stopAllAction();

    const makeAction = (clip: THREE.AnimationClip, cyclic: boolean): THREE.AnimationAction => {
      const act = e.mixer!.clipAction(clip);
      if (cyclic) {
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.clampWhenFinished = false;
      } else {
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
      }
      act.enabled = true;
      act.stop();
      return act;
    };

    const bundle: UalEnemyActionBundle = {
      idle: makeAction(clipSet.idle, true),
      run: clipSet.run ? makeAction(clipSet.run, true) : null,
      usesPreviousRun: clipSet.usesPreviousRun,
      combo: clipSet.combo.map((c) => makeAction(c, false)),
      jutsu: clipSet.jutsu ? makeAction(clipSet.jutsu, false) : null,
      activeAction: null,
    };

    const initial = e.animState === 'run' && bundle.run ? bundle.run : bundle.idle;
    initial.enabled = true;
    initial.paused = false;
    initial.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    bundle.activeAction = initial;

    e.ualActions = bundle;
    return true;
  }

  private async preloadUalAnimationLibrary(): Promise<void> {
    if (this.ualPreloadStarted || this.ualRetargetDriver || this.disposed) return;
    this.ualPreloadStarted = true;
    try {
      const lib = await loadUalAnimationLibrary(UAL_ANIM_LIBRARY_URL);
      if (!lib) {
        this.ualPreloadStarted = false;
        return;
      }

      try {
        if (this.disposed) return;
        // Pre-bake ONLY the essential animations (Idle, Sprint, Jump, Punch/Sword, Jutsu) into compact Float32Arrays
        this.ualRetargetDriver = new UalRetargetDriver(lib.templateRoot, lib.clips);
      } finally {
        // Immediately purge the entire UAL1_Standard.glb 3D scene, meshes, textures, skeletons & unused clips from memory
        lib.dispose();
      }

      if (this.disposed) return;

      // Immediately upgrade the currently active player rig; other cached rigs compile lazily on activation
      if (this.activePlayerRigCacheKey) {
        const activeEntry = this.playerRigCache.get(this.activePlayerRigCacheKey);
        if (activeEntry) {
          const bundle = this.ensureCharacterUalPlayerActions(activeEntry);
          if (bundle && !this.playerDying) {
            if (activeEntry.isMadara) {
              this.resetRunCombatState();
            }
            const startAction =
              this.playerAnimState === 'run' && bundle.run ? bundle.run : bundle.idle;
            this.crossFadeUalPlayerAction(bundle, startAction, 0.14, true, 1);
          }
        }
      }

      // Upgrade active COM preview rig on Character Select screen
      if (this.comPreviewRig && !this.comPreviewIdleAction) {
        this.bindUalIdleToComPreview();
      }

      // Upgrade any active custom-template enemies on the battlefield
      for (const e of this.enemies) {
        if (e.isCustomTemplateRig && !e.isDying && e.hp > 0 && !e.ualActions) {
          this.bindUalActionsToEnemy(e);
        }
      }
    } catch {
      this.ualPreloadStarted = false;
    }
  }

  private preloadInitialEnemyTemplates(): void {
    // Only Madara and Kakashi appear as enemies across all waves
    for (const id of ['kakashi', 'madara']) {
      void this.preloadEnemyPresetTemplate(id);
    }
  }

  private async preloadEnemyPresetTemplate(presetId: string): Promise<LoadedCharacterTemplate | null> {
    if (this.disposed) return null;
    const existing = this.enemyPresetTemplates.get(presetId);
    if (existing) return existing;

    const inflight = this.enemyPresetLoads.get(presetId);
    if (inflight) return inflight;

    const preset = ENEMY_CHARACTER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return null;

    const override = this.presetModelOverrides.get(presetId);
    const effectiveSource = override?.source ?? preset.glbUrl;
    const effectiveHint = override?.fileName ?? preset.glbUrl;
    const effectiveLabel = override?.labelAr ?? preset.nameAr;
    const loadVer = this.enemyPresetVersions.get(presetId) ?? 0;

    let loadPromise: Promise<LoadedCharacterTemplate | null>;
    loadPromise = (async (): Promise<LoadedCharacterTemplate | null> => {
      try {
        const template = await loadCharacterTemplate(
          effectiveSource,
          effectiveHint,
          effectiveLabel
        );
        if (this.disposed || (this.enemyPresetVersions.get(presetId) ?? 0) !== loadVer) {
          template.dispose();
          return null;
        }
        this.enemyPresetTemplates.set(presetId, template);
        for (const e of this.enemies) {
          if (e.presetId === presetId && !e.isDying && e.hp > 0) {
            this.upgradeEnemyToPresetTemplate(e, presetId);
          }
        }
        return template;
      } catch {
        return null;
      } finally {
        if ((this.enemyPresetVersions.get(presetId) ?? 0) === loadVer) {
          this.enemyPresetLoads.delete(presetId);
        }
      }
    })();

    this.enemyPresetLoads.set(presetId, loadPromise);
    return loadPromise;
  }

  private buildEnemyPresetRigInstance(presetId: string): {
    rig: EnemyRig;
    mixer: THREE.AnimationMixer;
    idleAction: THREE.AnimationAction | null;
    runAction: THREE.AnimationAction | null;
  } | null {
    const template = this.enemyPresetTemplates.get(presetId);
    if (!template) return null;

    const root = new THREE.Group();
    const pivotGroup = new THREE.Group();
    root.add(pivotGroup);

    const clonedModel = SkeletonUtils.clone(template.templateRoot) as THREE.Group;
    pivotGroup.add(clonedModel);

    const bones = mapBonesOnObject(clonedModel);
    const baseBoneRotations = new Map<THREE.Bone, THREE.Euler>();
    const baseBonePositions = new Map<THREE.Bone, THREE.Vector3>();
    Object.values(bones).forEach((b) => {
      if (b) {
        baseBoneRotations.set(b, b.rotation.clone());
        baseBonePositions.set(b, b.position.clone());
      }
    });
    const hipsParent = bones.hips?.parent;
    if (
      hipsParent &&
      hipsParent !== root &&
      hipsParent !== pivotGroup &&
      ((hipsParent as THREE.Bone).isBone || /characterroot|fbx_root|armature|rootnode|hips/i.test(hipsParent.name)) &&
      !baseBoneRotations.has(hipsParent as THREE.Bone)
    ) {
      const parentBone = hipsParent as THREE.Bone;
      baseBoneRotations.set(parentBone, parentBone.rotation.clone());
      baseBonePositions.set(parentBone, parentBone.position.clone());
    }

    const enhancedRole = resolveEnhancedCharacterRole(undefined, presetId);
    const clonedMaterials: Array<{
      mat: THREE.Material;
      emissiveHex: number | null;
      emissiveIntensity: number;
    }> = [];
    clonedModel.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.userData?.__isAnimeOutline) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const cloneOne = (m: THREE.Material): THREE.Material => {
        if (m.userData?.__sharedAnimeOutline) return m;
        const c = m.clone();
        c.userData = { ...(m.userData || {}) };
        delete c.userData.__appliedUnifiedCacheKey;
        if (enhancedRole) {
          enhanceCharacterMaterialVisuals(c, enhancedRole);
        } else {
          applyAnimeCelShadingToMaterial(c);
        }
        const std = c as THREE.MeshStandardMaterial;
        clonedMaterials.push({
          mat: c,
          emissiveHex: std.emissive ? std.emissive.getHex() : null,
          emissiveIntensity: typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 1,
        });
        return c;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (m ? cloneOne(m) : m));
      } else if (mesh.material) {
        mesh.material = cloneOne(mesh.material);
      }
    });

    const hitFlashColor = new THREE.Color(0xff2222);
    let isFlashing = false;
    let lastFlashHex = 0xff2222;
    const setHitFlash = (active: boolean, flashHex = 0xff2222) => {
      if (active === isFlashing && (!active || flashHex === lastFlashHex)) return;
      isFlashing = active;
      lastFlashHex = flashHex;
      hitFlashColor.setHex(flashHex);
      for (const entry of clonedMaterials) {
        const std = entry.mat as THREE.MeshStandardMaterial;
        if (!std.emissive) continue;
        if (active) {
          std.emissive.copy(hitFlashColor);
          std.emissiveIntensity = flashHex === 0xffffff ? 2.2 : 1.7;
        } else if (entry.emissiveHex !== null) {
          std.emissive.setHex(entry.emissiveHex);
          std.emissiveIntensity = entry.emissiveIntensity;
        }
      }
    };

    const mixer = new THREE.AnimationMixer(clonedModel);
    const rig: EnemyRig = {
      root,
      pivotGroup,
      bones,
      baseBoneRotations,
      baseBonePositions,
      auraMesh: null,
      handOrbMesh: null,
      setHitFlash,
      dispose: () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(clonedModel);
        const disposedSkeletons = new Set<THREE.Skeleton>();
        clonedModel.traverse((obj) => {
          const sk = obj as THREE.SkinnedMesh;
          if (sk.isSkinnedMesh && sk.skeleton && !disposedSkeletons.has(sk.skeleton)) {
            disposedSkeletons.add(sk.skeleton);
            sk.skeleton.dispose();
          }
        });
        for (const entry of clonedMaterials) {
          entry.mat.dispose();
        }
      },
    };

    return {
      rig,
      mixer,
      idleAction: null,
      runAction: null,
    };
  }

  private bindRunActionToEnemy(e: EnemyEntity) {
    if (!e.mixer || !this.loadedRunClip) return;
    const mixerRoot = e.rig.pivotGroup.children[0];
    if (!mixerRoot) return;
    if (this.countClipMatchedNodes(this.loadedRunClip, mixerRoot) < 6) return;
    if (e.runAction) {
      e.runAction.stop();
      e.runAction = null;
    }
    const cleanRunClip =
      this.buildPreviousRunClip(
        e.rig.pivotGroup,
        mixerRoot,
        e.rig.bones,
        e.rig.baseBoneRotations,
        e.rig.baseBonePositions
      ) ?? this.loadedRunClip;
    const action = e.mixer.clipAction(cleanRunClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.stop();
    e.runAction = action;
  }

  private bindIdleActionToEnemy(e: EnemyEntity) {
    if (!e.mixer || !this.loadedRunIdleClip) return;
    const mixerRoot = e.rig.pivotGroup.children[0];
    if (!mixerRoot) return;
    if (this.countClipMatchedNodes(this.loadedRunIdleClip, mixerRoot) < 6) return;
    if (e.idleAction) {
      e.idleAction.stop();
      e.idleAction = null;
    }
    const cleanIdleClip = this.buildCleanIdleClip(
      this.loadedRunIdleClip,
      e.rig.bones,
      e.rig.baseBoneRotations,
      e.rig.baseBonePositions
    );
    const action = e.mixer.clipAction(cleanIdleClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    if (e.animState === 'idle') {
      action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    } else {
      action.stop();
    }
    e.idleAction = action;
  }

  private upgradeEnemyToPresetTemplate(e: EnemyEntity, presetId: string) {
    const built = this.buildEnemyPresetRigInstance(presetId);
    if (!built) return;
    this.scene.remove(e.rig.root);
    e.rig.dispose();

    e.rig = built.rig;
    e.mixer = built.mixer;
    e.idleAction = built.idleAction;
    e.runAction = built.runAction;
    e.ualActions = null;
    e.isCustomTemplateRig = true;
    e.rig.root.scale.setScalar(CHARACTER_WORLD_SCALE);
    e.rig.root.position.copy(e.pos);
    e.rig.root.rotation.y = e.yaw;
    this.scene.add(e.rig.root);

    const boundUal = this.bindUalActionsToEnemy(e);
    if (!boundUal) {
      this.bindRunActionToEnemy(e);
      this.bindIdleActionToEnemy(e);
    }
    e.runTargetState = this.bakedRunAnim
      ? this.bakedRunAnim.prepareTarget(
          e.rig.pivotGroup,
          e.rig.bones,
          e.rig.baseBoneRotations,
          e.rig.baseBonePositions
        )
      : null;
    e.idleTargetState = this.bakedRunIdleAnim
      ? this.bakedRunIdleAnim.prepareTarget(
          e.rig.pivotGroup,
          e.rig.bones,
          e.rig.baseBoneRotations,
          e.rig.baseBonePositions
        )
      : null;
    e.combatTargetState = this.bakedCombatAnim
      ? this.bakedCombatAnim.prepareTarget(
          e.rig.pivotGroup,
          e.rig.bones,
          e.rig.baseBoneRotations,
          e.rig.baseBonePositions
        )
      : null;
    e.deathTargetState = this.bakedDeathAnim
      ? this.bakedDeathAnim.prepareTarget(
          e.rig.pivotGroup,
          e.rig.bones,
          e.rig.baseBoneRotations,
          e.rig.baseBonePositions
        )
      : null;
    e.soleClearance = this.measureRigSoleClearance(e.rig.root, e.rig.bones);
  }

  private resetGunbaiSpring() {
    this.gunbaiSwayRotY = 0;
    this.gunbaiSwayVelY = 0;
    this.gunbaiSwayRotZ = 0;
    this.gunbaiSwayVelZ = 0;
    this.gunbaiSwayBobX = 0;
    this.gunbaiSwayVelBobX = 0;
  }

  private updateGunbaiSpring(dt: number, elapsed: number, speedRatio: number, isShowcase: boolean) {
    const obito = this.customObito;
    if (!obito?.gunbaiPivot || !obito.gunbaiRestPos || !obito.gunbaiRestRot) return;

    const subDt = Math.min(dt, 0.05);
    const breathWave = Math.sin(elapsed * 2.1);

    let targetBobX = breathWave * 0.42;
    let targetRotY = Math.sin(elapsed * 1.35) * 0.014;
    let targetRotZ = breathWave * 0.008;

    if (!isShowcase) {
      if (speedRatio > 0.04 && this.playerOnGround) {
        targetBobX += Math.sin(this.walkPhase * 2) * (1.85 * speedRatio);
        targetRotY += Math.sin(this.walkPhase) * (0.068 * speedRatio) - this.turnLean * 0.22;
        targetRotZ += -0.075 * speedRatio - Math.abs(Math.sin(this.walkPhase)) * (0.036 * speedRatio);
      }

      if (!this.playerOnGround) {
        // Rising lags weapon slightly downward; falling lifts & tilts away from cloak
        if (this.playerVel.y >= 0) {
          targetBobX -= THREE.MathUtils.clamp(this.playerVel.y * 0.28, 0, 2.6);
          targetRotZ -= 0.06;
        } else {
          targetBobX += THREE.MathUtils.clamp(-this.playerVel.y * 0.34, 0, 3.4);
          targetRotZ -= 0.12;
        }
        targetRotY += -this.turnLean * 0.16;
      }

      if (this.runCombatActive) {
        targetRotY += Math.sin(this.runCombatClipTime * 7.5) * 0.055;
        targetRotZ -= 0.05;
      }
    }

    const stiffness = 115;
    const damping = 13.5;

    this.gunbaiSwayVelBobX += ((targetBobX - this.gunbaiSwayBobX) * stiffness - this.gunbaiSwayVelBobX * damping) * subDt;
    this.gunbaiSwayBobX += this.gunbaiSwayVelBobX * subDt;

    this.gunbaiSwayVelY += ((targetRotY - this.gunbaiSwayRotY) * stiffness - this.gunbaiSwayVelY * damping) * subDt;
    this.gunbaiSwayRotY += this.gunbaiSwayVelY * subDt;

    this.gunbaiSwayVelZ += ((targetRotZ - this.gunbaiSwayRotZ) * stiffness - this.gunbaiSwayVelZ * damping) * subDt;
    this.gunbaiSwayRotZ += this.gunbaiSwayVelZ * subDt;

    const restPos = obito.gunbaiRestPos;
    const restRot = obito.gunbaiRestRot;
    obito.gunbaiPivot.position.set(
      restPos.x + THREE.MathUtils.clamp(this.gunbaiSwayBobX, -3.5, 4.0),
      restPos.y,
      restPos.z
    );
    obito.gunbaiPivot.rotation.set(
      restRot.x,
      restRot.y + THREE.MathUtils.clamp(this.gunbaiSwayRotY, -0.22, 0.22),
      restRot.z + THREE.MathUtils.clamp(this.gunbaiSwayRotZ, -0.22, 0.03)
    );
  }

  private resetRunCombatState() {
    this.runCombatActive = false;
    this.runCombatStep = 0;
    this.runCombatClipTime = 0;
    this.runCombatEndTime = 0;
    this.runCombatBlend = 0;
    this.runCombatComboResetTimer = 0;
    this.runCombatPendingHit = null;
    this.slashRibbons?.clear();
  }

  public resetProceduralObitoModel() {
    void this.loadCustomObitoModel(DEFAULT_OBITO_GLB_URL).catch(() =>
      this.loadCustomObitoModel(FALLBACK_OBITO_GLB_URL)
    );
  }

  private disposeFumaMesh(mesh: THREE.Group): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const geo = (obj as THREE.Mesh).geometry;
        if (geo && !disposedGeos.has(geo)) {
          disposedGeos.add(geo);
          geo.dispose();
        }
      }
    });
  }

  private disposeFireballResources(fb: FireballEntity): void {
    this.scene.remove(fb.group);
    const disposedMats = new Set<THREE.Material>();
    const disposeOnce = (m: THREE.Material) => {
      if (disposedMats.has(m)) return;
      disposedMats.add(m);
      m.dispose();
    };
    disposeOnce(fb.coreMat);
    disposeOnce(fb.mantleMat);
    disposeOnce(fb.outerMat);
    disposeOnce(fb.trailMat);
    disposeOnce(fb.haloMat);
    for (const sm of fb.fireShaderMaterials) {
      disposeOnce(sm);
    }
    for (const fl of fb.flameSprites) {
      disposeOnce(fl.mat);
    }
  }

  private clearCombatEntities() {
    for (const e of this.enemies) {
      this.scene.remove(e.rig.root, e.shadow);
      e.slashRibbons?.dispose();
      e.rig.dispose();
      (e.shadow.material as THREE.Material).dispose();
      e.shadow.geometry.dispose();
    }
    this.enemies = [];

    for (const f of this.thrownFumas) {
      this.scene.remove(f.mesh);
      this.disposeFumaMesh(f.mesh);
    }
    this.thrownFumas = [];
    for (const fb of this.fireballs) {
      this.disposeFireballResources(fb);
    }
    this.fireballs = [];
    for (const ep of this.elementalProjectiles) {
      this.scene.remove(ep.group);
      const disposedMats = new Set<THREE.Material>();
      const disposeOnce = (m: THREE.Material) => {
        if (disposedMats.has(m)) return;
        disposedMats.add(m);
        m.dispose();
      };
      disposeOnce(ep.coreMat);
      disposeOnce(ep.outerMat);
      for (const sm of ep.fireShaderMaterials) {
        disposeOnce(sm);
      }
      disposeOnce(ep.haloMat);
      for (const sp of ep.sprites) {
        disposeOnce(sp.mat);
      }
    }
    this.elementalProjectiles = [];
    for (const r of this.shockRings) {
      this.releaseShockRing(r);
    }
    this.shockRings = [];
    for (const ss of this.sphereShocks) {
      this.scene.remove(ss.mesh);
      (ss.mesh.material as THREE.Material).dispose();
    }
    this.sphereShocks = [];
    for (const sm of this.smokePuffs) {
      this.releaseSmokePuff(sm);
    }
    this.smokePuffs = [];
    for (const rod of this.fallingRods) this.scene.remove(rod.mesh);
    this.fallingRods = [];
    for (const sp of this.sparks) {
      this.releaseSpark(sp);
    }
    this.sparks = [];
    for (const gm of this.groundMarks) {
      this.scene.remove(gm.group);
      gm.baseMat.dispose();
      gm.glowMat?.dispose();
    }
    this.groundMarks = [];
    for (const gd of this.groundDebris) {
      this.scene.remove(gd.mesh);
    }
    this.groundDebris = [];
    for (const sa of this.slashArcs) {
      this.scene.remove(sa.mesh);
      (sa.mesh.material as THREE.Material).dispose();
    }
    this.slashArcs = [];
    for (const dv of this.darkVortices) {
      this.scene.remove(dv.group);
      dv.rings.forEach((r) => (r.material as THREE.Material).dispose());
    }
    this.darkVortices = [];
    for (const cc of this.chakraChains) {
      this.scene.remove(cc.group);
      cc.coreMat.dispose();
      cc.haloMat.dispose();
    }
    this.chakraChains = [];
    this.gedoSummonVersion++;
    this.disposeActiveGedo();
    this.susanooSummonVersion++;
    this.disposeActiveSusanoo();
    for (const sw of this.susanooSlashWaves) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.mat.dispose();
    }
    this.susanooSlashWaves = [];
    this.susanooCamDistOffset = 0;
    this.susanooCamLookYOffset = 0;
    if (this.customObito) {
      this.customObito.pivotGroup.scale.setScalar(1.0);
    }
    for (const lb of this.lightningBolts) {
      this.scene.remove(lb.line);
      lb.line.geometry.dispose();
      lb.mat.dispose();
    }
    this.lightningBolts = [];
    for (const dp of this.damagePopups) {
      this.scene.remove(dp.sprite);
      dp.mat.dispose();
    }
    this.damagePopups = [];
    for (const az of this.amaterasuZones) {
      this.scene.remove(az.group);
      az.ringMat.dispose();
      az.auraMat.dispose();
      for (const fl of az.flameSprites) {
        fl.mat.dispose();
      }
    }
    this.amaterasuZones = [];
    for (const ce of this.clayExplosives) {
      this.scene.remove(ce.group);
      for (const mat of ce.materials) {
        mat.dispose();
      }
    }
    this.clayExplosives = [];
    for (const kp of this.kuramaProjectiles) {
      this.scene.remove(kp.group);
      for (const mat of kp.materials) {
        mat.dispose();
      }
      kp.haloMat.dispose();
    }
    this.kuramaProjectiles = [];
    this.skillParticles.clear();
    this.slashRibbons.clear();
    for (const sl of this.substitutionLogEntities) {
      this.scene.remove(sl.group);
    }
    this.substitutionLogEntities = [];
    this.guardShieldMesh.visible = false;
    this.chakraChargeRingMesh.visible = false;
    this.awakeningAuraMesh.visible = false;
    this.awakeningRingMesh.visible = false;
    this.playerRaikiriState = null;
    this.hidePlayerRaikiriVfx();
    this.impactLight.intensity = 0;
    for (const fbLight of this.fireballGroundLights) {
      fbLight.intensity = 0;
    }
  }

  /**
   * Automatic full GPU/RAM memory cleanup invoked on battle restart and return to title
   * to prevent browser/WebGL memory accumulation without reducing visual fidelity or shadows.
   */
  private cleanupBattleMemory(pruneInactiveRigs: boolean): void {
    this.clearCombatEntities();

    // Dispose cached floating damage-number canvas textures so they never grow unbounded across matches
    for (const tex of this.damageNumberTextures.values()) {
      tex.dispose();
    }
    this.damageNumberTextures.clear();

    // Dispose temporary Raikiri VFX materials (lazily recreated only when Kakashi casts Raikiri)
    if (this.playerRaikiriVfx) {
      this.scene.remove(this.playerRaikiriVfx.group);
      this.playerRaikiriVfx.coreMat.dispose();
      this.playerRaikiriVfx.outerMat.dispose();
      this.playerRaikiriVfx.haloMat.dispose();
      this.playerRaikiriVfx = null;
    }

    // Reclaim VRAM from any inactive previewed character GLBs when launching/restarting a battle
    if (pruneInactiveRigs) {
      this.pruneInactivePlayerRigCache();
    }

    // Free cached Gedo Mazo & Susanoo GLB templates if inactive
    if (!this.hasGedoMazo && !this.activeGedo) {
      disposeGedoMazoTemplateCache();
    }
    if (!this.isMadara && !this.isItachi && !this.activeSusanoo) {
      disposeSusanooTemplateCache();
    }

    // Flush Three.js internal render lists so disposed geometries/materials are released immediately
    this.renderer.renderLists.dispose();
  }

  private setAnnouncement(_textAr: string, _duration = 2.6) {
    // Center-screen character spawn & technique text announcements disabled per user preference
    this.announcementAr = null;
    this.announcementTimer = 0;
  }

  private spawnWave(waveNum: number) {
    const configs: Array<{
      presetId: string;
      kind: EnemyKind;
      nameAr: string;
      titleAr: string;
      hp: number;
      dmg: number;
      speed: number;
      boss: boolean;
    }> = [];

    const presetName = (id: string, fallback: string) =>
      ENEMY_CHARACTER_PRESETS.find((p) => p.id === id)?.nameAr ?? fallback;

    const comId = this.selectedComPresetId || 'kakashi';
    const comKind: EnemyKind =
      comId === 'kakashi' ? 'kakashi' : comId === 'itachi' ? 'itachi' : 'madara';
    const comTitle =
      comId === 'kakashi'
        ? 'ناسخ الشارينغان'
        : comId === 'madara'
          ? 'أسطورة الأوتشيها'
          : comId === 'itachi'
            ? 'عبقري الأكاتسوكي'
            : comId === 'deidara'
              ? 'فنان المتفجرات - الأكاتسوكي'
              : comId === 'mask_man_v2'
                ? 'المقنّع الغامض V2'
                : comId === 'naruto_sage'
                  ? 'ناسك جبل ميوبوكو'
                  : comId === 'naruto_kurama'
                    ? 'جينشوريكي الكيوبي'
                    : 'شبح الأوتشيها';
    const comName = presetName(
      comId,
      comId === 'deidara'
        ? 'ديدارا'
        : comId === 'naruto_sage'
          ? 'ناروتو ساج مود'
          : comId === 'naruto_kurama'
            ? 'ناروتو كوراما مود'
            : comKind === 'kakashi'
              ? 'كاكاشي هاتاكي'
              : comKind === 'itachi'
                ? 'إيتاتشي أوتشيها'
                : 'أوبيتو أوتشيها'
    );

    if (this.mode === 'boss_rush') {
      if (waveNum === 1) {
        configs.push({ presetId: comId, kind: comKind, nameAr: comName, titleAr: comTitle, hp: 230, dmg: 13, speed: 5.4, boss: true });
      } else if (waveNum === 2) {
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'أسطورة الأوتشيها', hp: 310, dmg: 16, speed: 5.6, boss: true });
      } else if (waveNum === 3) {
        configs.push({ presetId: 'kakashi', kind: 'kakashi', nameAr: presetName('kakashi', 'كاكاشي هاتاكي'), titleAr: 'قائد الفرقة الثالثة', hp: 260, dmg: 14, speed: 5.7, boss: true });
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'رينيغان الأوتشيها', hp: 330, dmg: 17, speed: 5.6, boss: true });
      } else {
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'زعيم الأوتشيها الأسطوري', hp: 460, dmg: 20, speed: 5.9, boss: true });
        configs.push({ presetId: 'kakashi', kind: 'kakashi', nameAr: presetName('kakashi', 'كاكاشي هاتاكي'), titleAr: 'ناسخ الشارينغان', hp: 320, dmg: 16, speed: 5.9, boss: true });
      }
    } else {
      if (waveNum === 1) {
        configs.push({ presetId: comId, kind: comKind, nameAr: comName, titleAr: comTitle, hp: 145, dmg: 9, speed: 4.8, boss: true });
      } else if (waveNum === 2) {
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'محارب الأوتشيها', hp: 185, dmg: 11, speed: 5.0, boss: true });
      } else if (waveNum === 3) {
        configs.push({ presetId: 'kakashi', kind: 'kakashi', nameAr: presetName('kakashi', 'كاكاشي هاتاكي'), titleAr: 'قائد الفرقة الثالثة', hp: 215, dmg: 12, speed: 5.3, boss: true });
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'رينيغان الأوتشيها', hp: 245, dmg: 14, speed: 5.3, boss: true });
      } else if (waveNum === 4) {
        configs.push({ presetId: 'kakashi', kind: 'kakashi', nameAr: presetName('kakashi', 'كاكاشي هاتاكي'), titleAr: 'صاعقة الرايكيري', hp: 255, dmg: 14, speed: 5.6, boss: true });
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'حرب النينجا العظمى', hp: 295, dmg: 16, speed: 5.6, boss: true });
      } else {
        configs.push({ presetId: 'madara', kind: 'madara', nameAr: presetName('madara', 'مادارا أوتشيها'), titleAr: 'زعيم الأوتشيها الأسطوري', hp: 380, dmg: 18, speed: 5.8, boss: true });
        configs.push({ presetId: 'kakashi', kind: 'kakashi', nameAr: presetName('kakashi', 'كاكاشي هاتاكي'), titleAr: 'ناسخ الشارينغان', hp: 300, dmg: 15, speed: 5.9, boss: true });
      }
    }

    // Load any uncached enemy character templates for this wave
    const wavePresetIds = new Set(configs.map((c) => c.presetId));
    for (const pid of wavePresetIds) {
      void this.preloadEnemyPresetTemplate(pid);
    }

    const maxSpawnR = this.getActiveArenaRadius() - 2.2;
    let oppX = -this.playerPos.x;
    let oppZ = -this.playerPos.z;
    const oppLen = Math.hypot(oppX, oppZ);
    if (oppLen > 0.35) {
      oppX /= oppLen;
      oppZ /= oppLen;
    } else {
      oppX = Math.sin(this.playerYaw);
      oppZ = Math.cos(this.playerYaw);
    }
    const baseAngle = Math.atan2(oppZ, oppX);
    const spreadStep = configs.length <= 2 ? 0.52 : 0.44;

    configs.forEach((cfg, idx) => {
      const offsetIdx = idx - (configs.length - 1) * 0.5;
      const angle = baseAngle + offsetIdx * spreadStep;
      const dist = Math.min(maxSpawnR, 5.2 + Math.abs(offsetIdx) * 1.15);
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      const facePlayerYaw = Math.atan2(this.playerPos.x - pos.x, this.playerPos.z - pos.z);
      const presetBuilt = this.buildEnemyPresetRigInstance(cfg.presetId);
      const rig = presetBuilt ? presetBuilt.rig : createEnemyModel(cfg.kind, this.maxAniso);
      rig.root.scale.setScalar(CHARACTER_WORLD_SCALE);
      rig.root.position.copy(pos);
      rig.root.rotation.y = facePlayerYaw;
      this.scene.add(rig.root);

      const shadow = this.createContactShadow((cfg.boss ? 1.45 : 1.1) * CHARACTER_WORLD_SCALE);
      shadow.position.set(pos.x, 0.03, pos.z);
      this.scene.add(shadow);

      const runTargetState = this.bakedRunAnim
        ? this.bakedRunAnim.prepareTarget(
            rig.pivotGroup,
            rig.bones,
            rig.baseBoneRotations,
            rig.baseBonePositions
          )
        : null;
      const idleTargetState = this.bakedRunIdleAnim
        ? this.bakedRunIdleAnim.prepareTarget(
            rig.pivotGroup,
            rig.bones,
            rig.baseBoneRotations,
            rig.baseBonePositions
          )
        : null;
      const combatTargetState = this.bakedCombatAnim
        ? this.bakedCombatAnim.prepareTarget(
            rig.pivotGroup,
            rig.bones,
            rig.baseBoneRotations,
            rig.baseBonePositions
          )
        : null;
      const deathTargetState = this.bakedDeathAnim
        ? this.bakedDeathAnim.prepareTarget(
            rig.pivotGroup,
            rig.bones,
            rig.baseBoneRotations,
            rig.baseBonePositions
          )
        : null;

      const entity: EnemyEntity = {
        id: `enemy_${waveNum}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        presetId: cfg.presetId,
        kind: cfg.kind,
        nameAr: cfg.nameAr,
        titleAr: cfg.titleAr,
        isBoss: cfg.boss,
        rig,
        shadow,
        pos,
        vel: new THREE.Vector3(),
        yaw: facePlayerYaw,
        hp: cfg.hp,
        maxHp: cfg.hp,
        speed: cfg.speed,
        damage: cfg.dmg,
        attackCooldown: 1.0 + idx * 0.35,
        attackWindup: 0,
        hitFlashTimer: 0,
        walkPhase: idx * 1.1,
        stunTimer: 0,
        stunSparkTimer: 0,
        runTargetState,
        idleTargetState,
        combatTargetState,
        deathTargetState,
        runBlend: 0,
        idleBlend: 0,
        runPhaseOffset: idx * 0.31,
        soleClearance: this.measureRigSoleClearance(rig.root, rig.bones),
        combatActive: false,
        combatStep: 0,
        combatClipTime: 0,
        combatEndTime: 0,
        combatHitTime: 0,
        combatHitPending: false,
        combatBlend: 0,
        animState: 'idle',
        jutsuCooldown: 2.2 + idx * 0.5,
        jutsuCycle: 0,
        jutsuCastTimer: 0,
        slashRibbons: cfg.kind === 'kakashi' ? new SlashRibbonSystem(this.scene) : null,
        mixer: presetBuilt ? presetBuilt.mixer : null,
        idleAction: presetBuilt ? presetBuilt.idleAction : null,
        runAction: presetBuilt ? presetBuilt.runAction : null,
        ualActions: null,
        isCustomTemplateRig: Boolean(presetBuilt),
        cloakPhysicsSolver: presetBuilt
          ? createCloakPhysicsSolver(rig.pivotGroup, rig.bones, rig.baseBoneRotations)
          : null,
        isDying: false,
        deathTimer: 0,
        deathDuration: 3.0,
        deathBlend: 0,
        raikiriTimer: 0,
        raikiriHitDone: false,
      };

      if (entity.isCustomTemplateRig) {
        const boundUal = this.bindUalActionsToEnemy(entity);
        if (!boundUal) {
          this.bindRunActionToEnemy(entity);
          this.bindIdleActionToEnemy(entity);
        }
      }

      this.enemies.push(entity);
    });

    const bossInWave = configs.find((c) => c.boss);
    if (bossInWave) {
      this.setAnnouncement(`الموجة ${waveNum}: ظهور ${bossInWave.nameAr}!`, 3.0);
    } else {
      this.setAnnouncement(`بدأت الموجة ${waveNum}`, 2.2);
    }
  }

  public setGuarding(active: boolean) {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) {
      this.isGuarding = false;
      return;
    }
    if (active && this.guardBroken) {
      this.isGuarding = false;
      return;
    }
    this.isGuarding = active;
    if (active) {
      this.isChargingChakra = false;
      this.meleeAnimTimer = 0;
      this.jutsuAnimTimer = 0;
      this.runCombatActive = false;
      if ((this.isMadara || this.isItachi) && !this.activeSusanoo && this.playerChakra >= 20) {
        this.playerChakra -= 20;
        this.triggerJutsu('susanoo_ribcage');
      }
    }
  }

  public setChargingChakra(active: boolean) {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) {
      this.isChargingChakra = false;
      return;
    }
    this.isChargingChakra = active;
    if (active) {
      this.isGuarding = false;
    }
  }

  public triggerSubstitution() {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) return;
    if (this.substitutionLogs <= 0) {
      this.setAnnouncement('لا توجد بدائل متاحة!', 1.0);
      return;
    }

    this.substitutionLogs -= 1;
    this.isGuarding = false;
    this.isChargingChakra = false;
    this.hitInvulnTimer = Math.max(this.hitInvulnTimer, 0.7);
    this.meleeAnimTimer = 0;
    this.jutsuAnimTimer = 0;

    // Spawn 3D Wooden Log + Kawarimi smoke puff at the player's old position
    const oldX = this.playerPos.x;
    const oldY = this.playerPos.y;
    const oldZ = this.playerPos.z;
    const logGroup = new THREE.Group();
    const barkMesh = new THREE.Mesh(this.subLogGeo, this.subLogBarkMat);
    barkMesh.castShadow = !this.isSoftwareGl;
    const capTop = new THREE.Mesh(this.subLogCapGeo, this.subLogCutMat);
    capTop.rotation.x = -Math.PI / 2;
    capTop.position.y = 0.395;
    const capBottom = new THREE.Mesh(this.subLogCapGeo, this.subLogCutMat);
    capBottom.rotation.x = Math.PI / 2;
    capBottom.position.y = -0.395;
    logGroup.add(barkMesh, capTop, capBottom);
    logGroup.position.set(oldX, Math.max(0.45, oldY + 0.9), oldZ);
    logGroup.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI, (Math.random() - 0.5) * 0.8);
    this.scene.add(logGroup);
    this.substitutionLogEntities.push({
      group: logGroup,
      velY: 3.6,
      rotVel: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 6),
      life: 0,
      maxLife: 2.8,
    });

    for (let i = 0; i < 6; i++) {
      this.spawnSmokePuff(
        oldX + (Math.random() - 0.5) * 1.0,
        oldY + 0.65 + Math.random() * 0.9,
        oldZ + (Math.random() - 0.5) * 1.0,
        0xe2e8f0,
        0.75,
        2.3 + Math.random() * 0.8,
        0.55,
        0.78
      );
    }
    this.spawnShockRing(oldX, oldY + 0.85, oldZ, 0xfbbf24, 2.8, 0.28, 0.85);

    // Teleport behind the nearest enemy (or dash backwards safely inside the arena)
    const target = this.findNearestEnemy(38);
    const arenaLimit = this.getActiveArenaRadius() - 2.0;
    let nextX = oldX - Math.sin(this.playerYaw) * 4.4;
    let nextZ = oldZ - Math.cos(this.playerYaw) * 4.4;
    if (target) {
      const toPlayerX = oldX - target.pos.x;
      const toPlayerZ = oldZ - target.pos.z;
      const len = Math.hypot(toPlayerX, toPlayerZ);
      const dirX = len > 0.05 ? -toPlayerX / len : Math.sin(this.playerYaw);
      const dirZ = len > 0.05 ? -toPlayerZ / len : Math.cos(this.playerYaw);
      nextX = target.pos.x + dirX * 3.1;
      nextZ = target.pos.z + dirZ * 3.1;
      const rDist = Math.hypot(nextX, nextZ);
      if (rDist > arenaLimit) {
        nextX = (nextX / rDist) * arenaLimit;
        nextZ = (nextZ / rDist) * arenaLimit;
      }
      this.playerYaw = Math.atan2(target.pos.x - nextX, target.pos.z - nextZ);
    } else {
      const rDist = Math.hypot(nextX, nextZ);
      if (rDist > arenaLimit) {
        nextX = (nextX / rDist) * arenaLimit;
        nextZ = (nextZ / rDist) * arenaLimit;
      }
    }

    this.playerPos.set(nextX, 0, nextZ);
    this.playerVel.set(0, 0, 0);
    this.spawnSmokePuff(nextX, 0.85, nextZ, 0xf8fafc, 0.85, 2.4, 0.45, 0.72);
    this.spawnShockRing(nextX, 0.85, nextZ, 0xf59e0b, 2.6, 0.26, 0.85);
    soundEngine.playJump();
    haptics.melee(1);
    this.pushHud(true);
  }

  public triggerChakraDash() {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) return;
    if (this.chakraDashCooldown > 0) return;
    if (this.playerChakra < 14) {
      this.setAnnouncement('الشاكرا غير كافية للاندفاع!', 1.0);
      return;
    }

    this.meleeAnimTimer = 0;
    this.jutsuAnimTimer = 0;
    this.runCombatActive = false;
    this.isGuarding = false;
    this.isChargingChakra = false;
    this.playerChakra = Math.max(0, this.playerChakra - 14);
    this.chakraDashCooldown = 0.9;
    this.chakraDashTimer = 0.35;

    const target = this.findNearestEnemy(30);
    if (target) {
      const dx = target.pos.x - this.playerPos.x;
      const dz = target.pos.z - this.playerPos.z;
      if (dx * dx + dz * dz > 0.01) {
        this.playerYaw = Math.atan2(dx, dz);
      }
    }
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    this.playerVel.x = fx * 28.0;
    this.playerVel.z = fz * 28.0;
    this.spawnShockRing(this.playerPos.x, this.playerPos.y + 0.95, this.playerPos.z, 0x38bdf8, 3.4, 0.28, 0.9);
    this.spawnSparks(this.playerPos, 0x38bdf8, 12, 10, 8);
    soundEngine.playMeleeSwing(2);
    haptics.melee(1);
    this.pushHud(true);
  }

  public triggerAwakening() {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) return;
    if (this.awakeningActive) return;
    if (this.awakeningGauge < 100) {
      this.setAnnouncement('مقياس الصحوة غير مكتمل!', 1.1);
      return;
    }

    this.awakeningGauge = 0;
    this.awakeningActive = true;
    this.awakeningTimer = this.awakeningDuration;
    this.hitInvulnTimer = Math.max(this.hitInvulnTimer, 1.0);
    this.cameraShake = Math.max(this.cameraShake, 0.42);
    this.playerChakra = this.playerMaxChakra;
    this.setAnnouncement('تفعيل الصحوة! قوة العاصفة القصوى!', 2.4);
    this.spawnShockRing(this.playerPos.x, 0.35, this.playerPos.z, 0xf97316, 7.2, 0.45, 0.95);
    this.spawnShockRing(this.playerPos.x, 1.25, this.playerPos.z, 0xfacc15, 5.4, 0.38, 0.9);
    this.spawnSparks(this.playerPos, 0xfacc15, 22, 16, 10);
    this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'crack', 4.6, 5.5, 0.72);
    this.flashImpactLight(this.playerPos.x, 1.6, this.playerPos.z, 0xf97316, 26);
    soundEngine.playHitImpact(true);
    haptics.melee(2);
    this.pushHud(true);
  }

  private applyDamageToPlayer(rawDamage: number, sparkHex = 0xff7a1a, playSound = true) {
    if (this.playerDying || this.hitInvulnTimer > 0) return;
    if (this.kamuiTimer > 0) {
      return;
    }

    if (this.isGuarding && !this.guardBroken) {
      const guardDrain = Math.max(16, rawDamage * 1.1);
      this.guardGauge = Math.max(0, this.guardGauge - guardDrain);
      this.spawnShockRing(this.playerPos.x, 1.15, this.playerPos.z, 0x38bdf8, 2.8, 0.25, 0.9);
      this.spawnSparks(this.playerPos, 0x38bdf8, 8, 9, 10);
      if (this.guardGauge <= 0) {
        this.guardBroken = true;
        this.guardBreakTimer = 1.2;
        this.isGuarding = false;
        this.hitInvulnTimer = 0.55;
        this.cameraShake = 0.34;
        const crushDmg = Math.max(4, Math.round(this.getSusanooMitigatedDamage(rawDamage) * 0.55));
        this.playerHp = Math.max(0, this.playerHp - crushDmg);
        this.spawnShockRing(this.playerPos.x, 1.15, this.playerPos.z, 0xef4444, 3.8, 0.34, 0.95);
        this.setAnnouncement('كسر الدفاع!', 1.2);
        soundEngine.playHitImpact(true);
        haptics.playerHit();
      } else {
        this.hitInvulnTimer = 0.22;
        const chipDmg = rawDamage >= 22 ? Math.max(1, Math.round(rawDamage * 0.12)) : 0;
        if (chipDmg > 0) {
          this.playerHp = Math.max(0, this.playerHp - chipDmg);
        }
        soundEngine.playMeleeSwing(0);
      }
      return;
    }

    const mitigated = this.getSusanooMitigatedDamage(rawDamage);
    this.playerHp = Math.max(0, this.playerHp - mitigated);
    if (!this.awakeningActive) {
      this.awakeningGauge = Math.min(100, this.awakeningGauge + Math.min(18, mitigated * 0.7));
    }
    this.hitInvulnTimer = 0.45;
    this.cameraShake = 0.28;
    if (playSound) {
      soundEngine.playHitImpact(false);
    }
    haptics.playerHit();
    this.spawnSparks(this.playerPos, sparkHex, 6);
  }

  public triggerJutsu(id: JutsuId) {
    if (this.phase !== 'playing' || this.playerDying || this.finisherState) return;
    this.meleeAnimTimer = 0;
    this.jutsuAnimTimer = 0;
    this.runCombatActive = false;
    if (id === 'kamui' && !this.hasKamui) return;
    if ((id === 'raikiri' || id === 'suiton') && !this.isKakashi) return;
    if (this.isKakashi && (id === 'kamui' || id === 'rinnegan' || id === 'gedo')) return;
    if ((id === 'amaterasu' || id === 'tsukuyomi') && !this.isItachi) return;
    if ((id === 'susanoo' || id === 'susanoo_perfect') && !this.isMadara) {
      return;
    }
    if (
      (id === 'susanoo_ribcage' || id === 'susanoo_armored' || id === 'susanoo_muscular') &&
      !this.isMadara &&
      !this.isItachi
    ) {
      return;
    }
    if (this.isItachi && (id === 'kamui' || id === 'rinnegan' || id === 'gedo')) return;
    if ((id === 'c1_birds' || id === 'c2_dragon' || id === 'c3_ultimate') && !this.isDeidara) {
      return;
    }
    if (
      this.isDeidara &&
      id !== 'melee' &&
      id !== 'c1_birds' &&
      id !== 'c2_dragon' &&
      id !== 'c3_ultimate'
    ) {
      return;
    }
    if (id === 'rasenshuriken' && !this.isNarutoKurama && !this.isNarutoSage) {
      return;
    }
    if (
      (id === 'bijuu_dama' || id === 'kurama_roar' || id === 'bijuu_barrage') &&
      !this.isNarutoKurama
    ) {
      return;
    }
    if (
      (id === 'sage_odama' || id === 'sage_kata' || id === 'sage_barrage') &&
      !this.isNarutoSage
    ) {
      return;
    }
    if (
      this.isNarutoKurama &&
      id !== 'melee' &&
      id !== 'rasenshuriken' &&
      id !== 'bijuu_dama' &&
      id !== 'kurama_roar' &&
      id !== 'bijuu_barrage'
    ) {
      return;
    }
    if (
      this.isNarutoSage &&
      id !== 'melee' &&
      id !== 'rasenshuriken' &&
      id !== 'sage_odama' &&
      id !== 'sage_kata' &&
      id !== 'sage_barrage'
    ) {
      return;
    }
    if (id === 'gedo') {
      if (!this.hasGedoMazo) return;
      if (this.activeGedo) {
        this.setAnnouncement('غيدو مازو مستدعى بالفعل!', 1.1);
        return;
      }
    }
    const requestedSusanooStage: SusanooStage | null =
      id === 'susanoo_ribcage'
        ? 'ribcage'
        : id === 'susanoo_armored'
          ? 'armored'
          : id === 'susanoo_muscular'
            ? 'muscular'
            : id === 'susanoo_perfect'
              ? 'perfect'
              : id === 'susanoo'
                ? 'armored'
                : null;
    if (requestedSusanooStage && this.activeSusanoo?.stage === requestedSusanooStage) {
      this.setAnnouncement('هذه المرحلة من السوسانو مفعّلة بالفعل!', 1.1);
      return;
    }
    const meta = OBITO_JUTSU_LIST.find((j) => j.id === id);
    if (!meta) return;

    if (this.cooldowns[id] > 0) return;
    if (this.playerChakra < meta.chakraCost) {
      this.setAnnouncement('الشاكرا غير كافية!', 1.2);
      return;
    }

    this.isGuarding = false;
    this.isChargingChakra = false;
    this.playerChakra = Math.max(0, this.playerChakra - meta.chakraCost);
    this.cooldowns[id] = meta.cooldownSec;

    // Smart Combat Snap: snap to face nearest enemy only at the moment Attack or Jutsu is pressed
    const aimTarget = this.findNearestEnemy(id === 'raikiri' ? 44 : 24);
    if (aimTarget) {
      const dx = aimTarget.pos.x - this.playerPos.x;
      const dz = aimTarget.pos.z - this.playerPos.z;
      if (dx * dx + dz * dz > 0.0025) {
        this.playerYaw = Math.atan2(dx, dz);
      }
    }

    if (id === 'melee') {
      // Do not corrupt Kakashi's Raikiri auto-rush mid-charge
      if (this.playerRaikiriState?.phase === 'charging') {
        return;
      }
      // Cleanly clear any active jutsu animation so melee combo never gets swallowed/glitched
      this.jutsuAnimTimer = 0;
      this.performMelee();
    } else {
      // Cleanly terminate any active melee combo, spin yaw, or jump land before casting a technique
      // so `bakedCombatAnim` and `playerUal.jutsu` never fight over the same skeleton bones!
      this.runCombatActive = false;
      this.runCombatPendingHit = null;
      this.runCombatBlend = 0;
      this.meleeAnimTimer = 0;
      this.madaraActiveAttackAction = null;
      this.comboSpinYaw = 0;
      this.madaraJumpPhase = 'none';
      this.madaraJumpPhaseTimer = 0;
      this.playerVel.x *= 0.25;
      this.playerVel.z *= 0.25;

      if (id !== 'raikiri' && this.playerRaikiriState) {
        this.playerRaikiriState = null;
        this.hidePlayerRaikiriVfx();
      }

      if (id === 'fuma') {
        this.activeJutsuAnim = 'fuma';
        this.jutsuAnimDuration = 0.42;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performFumaShuriken();
      } else if (id === 'kamui') {
        this.activeJutsuAnim = 'kamui';
        this.jutsuAnimDuration = 0.52;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performKamui();
      } else if (id === 'katon') {
        this.activeJutsuAnim = 'katon';
        this.jutsuAnimDuration = 0.50;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performKatonFire();
      } else if (id === 'rinnegan') {
        this.activeJutsuAnim = 'rinnegan';
        this.jutsuAnimDuration = 0.55;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performRinneganPush();
      } else if (id === 'gedo') {
        this.activeJutsuAnim = 'gedo';
        this.jutsuAnimDuration = 0.55;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        void this.performGedoMazo();
      } else if (id === 'raikiri') {
        this.jutsuAnimTimer = 0;
        this.performPlayerRaikiri();
      } else if (id === 'suiton') {
        this.activeJutsuAnim = 'suiton';
        this.jutsuAnimDuration = 0.52;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performPlayerSuiton();
      } else if (id === 'amaterasu') {
        this.activeJutsuAnim = 'amaterasu';
        this.jutsuAnimDuration = 0.48;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performAmaterasu();
      } else if (id === 'tsukuyomi') {
        this.activeJutsuAnim = 'tsukuyomi';
        this.jutsuAnimDuration = 0.56;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performTsukuyomi();
      } else if (
        id === 'susanoo' ||
        id === 'susanoo_ribcage' ||
        id === 'susanoo_armored' ||
        id === 'susanoo_muscular' ||
        id === 'susanoo_perfect'
      ) {
        this.activeJutsuAnim = 'susanoo';
        this.jutsuAnimDuration = 0.42;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        const stage: SusanooStage =
          id === 'susanoo_ribcage'
            ? 'ribcage'
            : id === 'susanoo_muscular'
              ? 'muscular'
              : id === 'susanoo_perfect'
                ? 'perfect'
                : 'armored';
        void this.performMadaraSusanoo(stage);
      } else if (id === 'c1_birds') {
        this.activeJutsuAnim = 'c1_birds';
        this.jutsuAnimDuration = 0.42;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performDeidaraC1Birds();
      } else if (id === 'c2_dragon') {
        this.activeJutsuAnim = 'c2_dragon';
        this.jutsuAnimDuration = 0.54;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performDeidaraC2Dragon();
      } else if (id === 'c3_ultimate') {
        this.activeJutsuAnim = 'c3_ultimate';
        this.jutsuAnimDuration = 0.62;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performDeidaraC3Ultimate();
      } else if (id === 'rasenshuriken') {
        this.activeJutsuAnim = 'rasenshuriken';
        this.jutsuAnimDuration = 0.48;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performNarutoRasenshuriken();
      } else if (id === 'bijuu_dama') {
        this.activeJutsuAnim = 'bijuu_dama';
        this.jutsuAnimDuration = 0.54;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performNarutoBijuuDama(0, 1.0, 86, true);
      } else if (id === 'kurama_roar') {
        this.activeJutsuAnim = 'kurama_roar';
        this.jutsuAnimDuration = 0.52;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performNarutoKuramaRoar();
      } else if (id === 'bijuu_barrage') {
        this.activeJutsuAnim = 'bijuu_barrage';
        this.jutsuAnimDuration = 0.60;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performNarutoBijuuBarrage();
      } else if (id === 'sage_odama') {
        this.activeJutsuAnim = 'sage_odama';
        this.jutsuAnimDuration = 0.50;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performSageOdamaRasengan(0, 1.0, 80, true);
      } else if (id === 'sage_kata') {
        this.activeJutsuAnim = 'sage_kata';
        this.jutsuAnimDuration = 0.50;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performSageFrogKata();
      } else if (id === 'sage_barrage') {
        this.activeJutsuAnim = 'sage_barrage';
        this.jutsuAnimDuration = 0.58;
        this.jutsuAnimTimer = this.jutsuAnimDuration;
        this.performSageRasenganBarrage();
      }

      if (id !== 'raikiri') {
        const playerUal = this.getActivePlayerUalActions();
        if (playerUal?.jutsu) {
          this.crossFadeUalPlayerAction(playerUal, playerUal.jutsu, 0.07, true, 1.15);
        } else if (this.isDeidara && this.customObito?.attackAction) {
          this.customObito.attackAction.reset().setEffectiveWeight(1).fadeIn(0.06).play();
        }
      }
    }

    this.pushHud(true);
  }

  private performMadaraUalMelee(playerUal: UalPlayerActionBundle) {
    if (this.meleeComboResetTimer <= 0) {
      this.madaraAttackStep = 0;
    } else {
      this.madaraAttackStep = (this.madaraAttackStep + 1) % playerUal.combo.length;
    }

    const step = this.madaraAttackStep;
    const clipAction = playerUal.combo[step];
    const isFinisher = step === playerUal.combo.length - 1 && playerUal.combo.length >= 3;
    const speed = step === 0 ? 1.65 : step === 1 ? 1.6 : 1.55;
    const clipDuration = Math.max(0.28, clipAction.getClip().duration / speed);

    this.meleeStep = 0;
    this.comboSpinYaw = 0;
    this.madaraJumpPhase = 'none';
    this.madaraJumpPhaseTimer = 0;
    this.meleeAnimDuration = Math.min(clipDuration * 0.92, isFinisher ? 0.88 : 0.54);
    this.meleeAnimTimer = this.meleeAnimDuration;
    this.meleeComboResetTimer = 1.25;
    this.madaraActiveAttackAction = clipAction;
    if (!(this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing')) {
      this.crossFadeUalPlayerAction(playerUal, clipAction, 0.07, true, speed);
    }

    soundEngine.playMeleeSwing(step % 3);
    haptics.melee(step);

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const nearest = this.findNearestEnemy(7.5);
    const lungeBoost = nearest ? (isFinisher ? 11.2 : 9.6) : isFinisher ? 7.6 : 6.4;
    this.playerVel.x += fx * lungeBoost;
    this.playerVel.z += fz * lungeBoost;

    const susanooStats = this.triggerSusanooComboStrike(fx, fz);
    const damage = (step === 0 ? 24 : step === 1 ? 30 : 46) + susanooStats.damageBonus;
    const knockback = (step === 0 ? 7.2 : step === 1 ? 8.8 : 15.0) + susanooStats.kbBonus;
    const reach = (step === 0 ? 4.2 : step === 1 ? 4.4 : 5.2) + susanooStats.reachBonus;
    let landedHit = false;

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      const dist = _tempVecA.length();
      if (dist <= reach) {
        _tempVecA.normalize();
        if (
          _tempVecA.x * fx + _tempVecA.z * fz > (susanooStats.active ? -0.35 : isFinisher ? -0.1 : 0.05) ||
          dist < (susanooStats.active ? 4.0 : 2.4)
        ) {
          this.damageEnemy(
            enemy,
            damage,
            fx * knockback,
            fz * knockback,
            isFinisher || susanooStats.active,
            false
          );
          landedHit = true;
        }
      }
    }

    if (isFinisher) {
      this.cameraShake = Math.max(this.cameraShake, 0.24);
      this.spawnShockRing(
        this.playerPos.x + fx * 1.5 * CHARACTER_WORLD_SCALE,
        0.25,
        this.playerPos.z + fz * 1.5 * CHARACTER_WORLD_SCALE,
        0xef4444,
        4.6,
        0.32,
        0.82
      );
      if (this.playerOnGround) {
        this.spawnGroundMark(
          this.playerPos.x + fx * 1.8,
          this.playerPos.z + fz * 1.8,
          'crack',
          4.2,
          6.0,
          0.68
        );
      }
    }

    if (landedHit) {
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + 7);
    }
  }

  private performMelee() {
    // Dedicated UAL 3-hit martial combo (Punch_Jab -> Punch_Cross -> Sword_Attack) for Madara
    if (this.isMadara) {
      const playerUal = this.getActivePlayerUalActions();
      if (playerUal && playerUal.combo.length > 0) {
        this.performMadaraUalMelee(playerUal);
        return;
      }
    }

    // Exclusive `ccgq05.glb` 3-hit martial combo & wind ribbon trails for `run`-rig characters
    if (this.customObitoIsRunSource && this.bakedCombatAnim && this.playerCombatTargetState) {
      this.performRunCombatMelee();
      return;
    }

    if (this.meleeComboResetTimer <= 0) {
      this.meleeStep = 0;
    } else {
      this.meleeStep = (this.meleeStep + 1) % 4;
    }

    const step = this.meleeStep;
    this.meleeAnimDuration = step === 2 ? 0.42 : step === 3 ? 0.46 : 0.30;
    this.meleeAnimTimer = this.meleeAnimDuration;
    this.meleeComboResetTimer = 1.05;
    this.comboSpinYaw = 0;
    if (!this.isKakashi) {
      soundEngine.playMeleeSwing(step % 3);
    }
    haptics.melee(step);

    if (this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing') {
      this.activeSusanoo.slashSweepTimer = this.activeSusanoo.slashSweepDuration;
    }

    if (this.customObito?.attackAction) {
      this.customObito.attackAction.reset().setEffectiveWeight(1).fadeIn(0.06).play();
    }

    // Storm 4 target snap-lunge toward nearest front enemy
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const nearest = this.findNearestEnemy(6.8);
    const lungeBoost = nearest ? 9.2 : 6.2;
    this.playerVel.x += fx * lungeBoost;
    this.playerVel.z += fz * lungeBoost;

    const susanooStats = this.triggerSusanooComboStrike(fx, fz);
    const susanooActive = susanooStats.active;
    const susanooReachBonus = susanooStats.reachBonus;
    const susanooDmgBonus = susanooStats.damageBonus;
    const susanooKbBonus = susanooStats.kbBonus;

    let landedHit = false;

    if (step === 0) {
      // Hit 1: Deep Shinobi Lunge Thrust + Crescent Slash
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        _tempVecA.subVectors(enemy.pos, this.playerPos);
        const dist = _tempVecA.length();
        if (dist <= 4.1 + susanooReachBonus) {
          _tempVecA.normalize();
          if (_tempVecA.x * fx + _tempVecA.z * fz > (susanooActive ? -0.35 : 0.1) || dist < 2.4) {
            this.damageEnemy(
              enemy,
              20 + susanooDmgBonus,
              fx * (6.5 + susanooKbBonus),
              fz * (6.5 + susanooKbBonus),
              susanooActive,
              this.isKakashi
            );
            landedHit = true;
          }
        }
      }
      this.spawnSlashArc(
        this.playerPos.x + fx * 1.15 * CHARACTER_WORLD_SCALE,
        this.playerPos.y + 1.15 * CHARACTER_WORLD_SCALE,
        this.playerPos.z + fz * 1.15 * CHARACTER_WORLD_SCALE,
        this.playerYaw,
        0.22,
        this.isNarutoKurama ? 0xfbbf24 : 0xfacc15,
        1.25 * CHARACTER_WORLD_SCALE
      );
      this.spawnShockRing(
        this.playerPos.x + fx * 1.3 * CHARACTER_WORLD_SCALE,
        this.playerPos.y + 1.0 * CHARACTER_WORLD_SCALE,
        this.playerPos.z + fz * 1.3 * CHARACTER_WORLD_SCALE,
        0xfde047,
        2.3,
        0.22,
        0.75
      );
    } else if (step === 1) {
      // Hit 2: Fast Cross-Body Diagonal Double Slash
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        _tempVecA.subVectors(enemy.pos, this.playerPos);
        const dist = _tempVecA.length();
        if (dist <= 4.2 + susanooReachBonus) {
          _tempVecA.normalize();
          if (_tempVecA.x * fx + _tempVecA.z * fz > (susanooActive ? -0.35 : 0.05) || dist < 2.5) {
            this.damageEnemy(
              enemy,
              24 + susanooDmgBonus,
              fx * (7.5 + susanooKbBonus),
              fz * (7.5 + susanooKbBonus),
              susanooActive,
              this.isKakashi
            );
            landedHit = true;
          }
        }
      }
      this.spawnSlashArc(
        this.playerPos.x + fx * 1.2 * CHARACTER_WORLD_SCALE,
        this.playerPos.y + 1.25 * CHARACTER_WORLD_SCALE,
        this.playerPos.z + fz * 1.2 * CHARACTER_WORLD_SCALE,
        this.playerYaw + 0.35,
        -0.55,
        0xf59e0b,
        1.4 * CHARACTER_WORLD_SCALE
      );
      this.spawnSlashArc(
        this.playerPos.x + fx * 1.1 * CHARACTER_WORLD_SCALE,
        this.playerPos.y + 1.05 * CHARACTER_WORLD_SCALE,
        this.playerPos.z + fz * 1.1 * CHARACTER_WORLD_SCALE,
        this.playerYaw - 0.25,
        0.48,
        this.isNarutoKurama ? 0xfef08a : 0x1e293b,
        1.35 * CHARACTER_WORLD_SCALE
      );
    } else if (step === 2) {
      // Hit 3: 360° Swirling Vortex Spin
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        const dist = Math.hypot(enemy.pos.x - this.playerPos.x, enemy.pos.z - this.playerPos.z);
        if (dist <= 4.9 + susanooReachBonus) {
          _tempVecA.subVectors(enemy.pos, this.playerPos);
          _tempVecA.y = 0;
          if (_tempVecA.lengthSq() < 0.01) _tempVecA.set(fx, 0, fz);
          _tempVecA.normalize();
          this.damageEnemy(
            enemy,
            30 + susanooDmgBonus,
            _tempVecA.x * (8.5 + susanooKbBonus),
            _tempVecA.z * (8.5 + susanooKbBonus),
            true,
            this.isKakashi
          );
          landedHit = true;
        }
      }
      this.spawnDarkVortex(this.playerPos.x, this.playerPos.y + 1.05 * CHARACTER_WORLD_SCALE, this.playerPos.z, 3.8, 0.44);
      this.spawnShockRing(
        this.playerPos.x,
        0.25,
        this.playerPos.z,
        this.isNarutoKurama ? 0xf59e0b : 0x64748b,
        5.2,
        0.34,
        0.78
      );
      if (this.playerOnGround) {
        this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'crack', 4.0, 5.5, 0.55);
      }
    } else {
      // Hit 4: Finisher
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        _tempVecA.subVectors(enemy.pos, this.playerPos);
        const dist = _tempVecA.length();
        if (dist <= 6.0 + susanooReachBonus) {
          _tempVecA.normalize();
          if (_tempVecA.x * fx + _tempVecA.z * fz > -0.05 || dist < 2.6) {
            this.damageEnemy(
              enemy,
              42 + susanooDmgBonus,
              fx * (15.5 + susanooKbBonus),
              fz * (15.5 + susanooKbBonus),
              true,
              this.isKakashi
            );
            landedHit = true;
          }
        }
      }
      this.cameraShake = Math.max(this.cameraShake, 0.28);
      this.spawnChakraChain(
        this.playerPos.x + fx * 0.45,
        this.playerPos.y + 1.15,
        this.playerPos.z + fz * 0.45,
        this.playerYaw
      );
      this.spawnDarkVortex(
        this.playerPos.x + fx * 2.8,
        this.playerPos.y + 1.35,
        this.playerPos.z + fz * 2.8,
        4.4,
        0.52
      );
      this.spawnSparks(
        _tempVecB.set(this.playerPos.x + fx * 2.5, this.playerPos.y + 0.3, this.playerPos.z + fz * 2.5),
        0xfacc15,
        12,
        11,
        10
      );
      this.skillParticles.spawn(
        'chakra_burst',
        this.playerPos.x + fx * 2.4,
        this.playerPos.y + 1.0,
        this.playerPos.z + fz * 2.4,
        105,
        1.05
      );
      if (this.playerOnGround) {
        this.spawnGroundMark(this.playerPos.x + fx * 2.2, this.playerPos.z + fz * 2.2, 'crack', 4.6, 7.0, 0.75);
        this.spawnStoneDebris(this.playerPos.x + fx * 2.2, this.playerPos.z + fz * 2.2, 7, 7.5, 5.8);
      }
    }

    if (landedHit) {
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + 7);
    }
  }

  private performRunCombatMelee() {
    if (!this.bakedCombatAnim) return;

    // Flush any pending strike impact if chaining rapidly so no tap is ever dropped
    if (this.runCombatPendingHit) {
      const pending = this.runCombatPendingHit;
      this.runCombatPendingHit = null;
      this.resolveRunCombatHit(pending);
    }

    this.runCombatStep =
      this.runCombatComboResetTimer <= 0
        ? 0
        : (this.runCombatStep + 1) % RUN_COMBO_WINDOWS.length;

    const win = RUN_COMBO_WINDOWS[this.runCombatStep];
    const maxDur = this.bakedCombatAnim.duration;
    const start = Math.min(win.start, Math.max(0, maxDur - 0.35));
    const end = Math.min(win.end, maxDur);
    const hitClipTime = THREE.MathUtils.clamp(win.hitTime, start + 0.04, Math.max(start + 0.05, end - 0.04));

    this.runCombatActive = true;
    this.runCombatClipTime = start;
    this.runCombatEndTime = end;
    this.runCombatComboResetTimer = 1.35;
    this.runCombatPendingHit = {
      hitClipTime,
      damage: win.damage,
      knockback: win.knockback,
      heavy: win.heavy,
    };

    // Bypass procedural melee poses and RingGeometry/CylinderGeometry slash solids
    this.meleeAnimTimer = 0;
    this.comboSpinYaw = 0;
    if (!this.isKakashi) {
      soundEngine.playMeleeSwing(this.runCombatStep);
    }
    haptics.melee(this.runCombatStep);

    if (this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing') {
      this.activeSusanoo.slashSweepTimer = this.activeSusanoo.slashSweepDuration;
    }

    // Controlled forward dash impulse toward the nearest target
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const nearest = this.findNearestEnemy(7.5);
    const lungeBoost = nearest ? 9.8 : 6.4;
    this.playerVel.x += fx * lungeBoost;
    this.playerVel.z += fz * lungeBoost;
  }

  private resolveRunCombatHit(hit: {
    damage: number;
    knockback: number;
    heavy: boolean;
  }) {
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const susanooStats = this.triggerSusanooComboStrike(fx, fz);
    const susanooActive = susanooStats.active;
    const sageKataActive = this.isNarutoSage;
    const reach =
      (hit.heavy ? 4.9 : 4.3) + (susanooActive ? susanooStats.reachBonus : sageKataActive ? 1.65 : 0);
    const bonusDmg = susanooActive ? susanooStats.damageBonus : sageKataActive ? 6 : 0;
    const bonusKb = susanooActive ? susanooStats.kbBonus : sageKataActive ? 3.5 : 0;
    let landedHit = false;

    if (sageKataActive) {
      const kataX = this.playerPos.x + fx * 1.9;
      const kataZ = this.playerPos.z + fz * 1.9;
      this.spawnShockRing(
        kataX,
        this.playerPos.y + 1.15 * CHARACTER_WORLD_SCALE,
        kataZ,
        hit.heavy ? 0xf59e0b : 0xfbbf24,
        hit.heavy ? 5.0 : 3.2,
        0.24,
        0.78
      );
    }

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      const dist = _tempVecA.length();
      if (dist <= reach) {
        _tempVecA.normalize();
        if (_tempVecA.x * fx + _tempVecA.z * fz > (susanooActive ? -0.35 : -0.15) || dist < (susanooActive ? 3.8 : 2.5)) {
          this.damageEnemy(
            enemy,
            hit.damage + bonusDmg,
            fx * (hit.knockback + bonusKb),
            fz * (hit.knockback + bonusKb),
            hit.heavy || susanooActive,
            this.isKakashi
          );
          landedHit = true;
        }
      }
    }

    if (landedHit) {
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + 7);
    }
  }

  private performFumaShuriken() {
    soundEngine.playFumaShuriken();
    haptics.fuma();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);

    const mesh = createGiantFumaShuriken(this.materials, 1.35);
    mesh.rotation.x = Math.PI / 2;
    const pos = new THREE.Vector3(
      this.playerPos.x + fx * 1.1 * CHARACTER_WORLD_SCALE,
      this.playerPos.y + 1.25 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + fz * 1.1 * CHARACTER_WORLD_SCALE
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.skillParticles.spawn('chakra_burst', pos.x, pos.y, pos.z, 75, 0.85);

    this.thrownFumas.push({
      mesh,
      pos,
      dir: new THREE.Vector3(fx, 0, fz).normalize(),
      elapsed: 0,
      returning: false,
      hitIds: new Set(),
    });
  }

  private cachePlayerMaterials(root: THREE.Object3D) {
    this.playerOriginalMaterials.clear();
    this.playerIntangibleVisualActive = false;
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat || this.playerOriginalMaterials.has(mat)) continue;
        const std = mat as THREE.MeshStandardMaterial;
        this.playerOriginalMaterials.set(mat, {
          transparent: Boolean(mat.transparent),
          opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
          depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
          emissiveHex: std.emissive ? std.emissive.getHex() : null,
          emissiveIntensity: typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 1,
        });
      }
    });
  }

  private restorePlayerIntangibilityMaterials() {
    if (!this.playerIntangibleVisualActive) return;
    for (const [mat, orig] of this.playerOriginalMaterials.entries()) {
      mat.transparent = orig.transparent;
      mat.opacity = orig.opacity;
      mat.depthWrite = orig.depthWrite;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.emissive && orig.emissiveHex !== null) {
        std.emissive.setHex(orig.emissiveHex);
        std.emissiveIntensity = orig.emissiveIntensity;
      }
      mat.needsUpdate = true;
    }
    this.playerIntangibleVisualActive = false;
  }

  private updatePlayerIntangibilityVisual(elapsed: number) {
    if (!this.customObito || !this.isIntangibleKamuiUser || this.kamuiTimer <= 0) {
      if (this.playerIntangibleVisualActive) {
        this.restorePlayerIntangibilityMaterials();
      }
      return;
    }

    const fadeBack = this.kamuiTimer < 0.45 ? 1 - this.kamuiTimer / 0.45 : 0;
    const ghostOpacity = THREE.MathUtils.lerp(
      0.36 + Math.sin(elapsed * 11) * 0.05,
      1.0,
      fadeBack
    );
    const isEntering = !this.playerIntangibleVisualActive;

    for (const [mat, orig] of this.playerOriginalMaterials.entries()) {
      const transparentChanged = !mat.transparent;
      mat.transparent = true;
      mat.opacity = Math.min(orig.opacity, ghostOpacity);
      mat.depthWrite = true;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.emissive) {
        if (isEntering) {
          std.emissive.setHex(0x6d28d9);
        }
        std.emissiveIntensity = 0.42 * (1 - fadeBack);
      }
      // CRITICAL: ONLY trigger shader recompile ONCE when `transparent` state actually changes —
      // NEVER per-frame (which previously recompiled WebGL shaders 60x/sec for 10s on Kamui!).
      if (transparentChanged) {
        mat.needsUpdate = true;
      }
    }
    this.playerIntangibleVisualActive = true;
  }

  private performKamui() {
    if (this.hasGedoMazo) {
      soundEngine.playKamuiVoice();
    }
    soundEngine.playKamuiWarp();
    haptics.kamui();
    this.kamuiTimer = this.isIntangibleKamuiUser ? 10.0 : 3.0;
    this.kamuiParticleTimer = 0;
    this.setAnnouncement(
      this.isIntangibleKamuiUser
        ? 'كاموي! غير ملموس لمدة 10 ثوانٍ'
        : 'كاموي! اختراق الأجسام',
      this.isIntangibleKamuiUser ? 2.4 : 1.8
    );
  }

  private spawnFireballProjectile(
    startPos: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    maxLife: number,
    baseScale: number,
    damage: number,
    blastRadius: number,
    isMassive: boolean
  ) {
    const group = new THREE.Group();
    group.position.copy(startPos);
    group.scale.setScalar(baseScale * 2.2);
    _tempVecA.copy(dir).normalize();
    group.quaternion.setFromUnitVectors(_forwardZ, _tempVecA);

    const seed = Math.random() * 100;
    const coreMat = createVolumetricFireCoreMaterial(seed);
    const coreMesh = new THREE.Mesh(this.fireVolumeGeo, coreMat);
    coreMesh.scale.setScalar(0.84);
    coreMesh.castShadow = true;

    const mantleMat = createVolumetricFireMantleMaterial(seed + 0.85);
    const mantleMesh = new THREE.Mesh(this.fireVolumeGeo, mantleMat);
    mantleMesh.scale.setScalar(1.08);
    mantleMesh.castShadow = true;

    const outerMat = createVolumetricFireShellMaterial(seed + 1.7);
    const outerMesh = new THREE.Mesh(this.fireVolumeGeo, outerMat);
    outerMesh.scale.setScalar(1.36);
    outerMesh.castShadow = true;

    const trailMat = createFireTrailConeMaterial(seed + 3.4);
    const trailMesh = new THREE.Mesh(this.fireTrailConeGeo, trailMat);

    const spinGroup = new THREE.Group();
    spinGroup.add(outerMesh, mantleMesh, coreMesh);

    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: 0xff7b1a,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(5.5, 5.5, 1);

    // Overlapping counter-rotating turbulent flame sprites along local -Z wake
    const flameConfigs = [
      { color: 0xfff3b0, scale: 2.35, spin: 7.5, opacity: 0.88, offsetZ: -0.05 },
      { color: 0xfb923c, scale: 3.1, spin: -6.2, opacity: 0.78, offsetZ: -0.55 },
      { color: 0xef4444, scale: 3.65, spin: 4.8, opacity: 0.62, offsetZ: -1.1 },
    ];
    const flameSprites: FireballEntity['flameSprites'] = [];
    group.add(trailMesh, spinGroup, haloSprite);

    for (const cfg of flameConfigs) {
      const mat = new THREE.SpriteMaterial({
        map: this.fireFlameTex,
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(cfg.scale, cfg.scale, 1);
      sprite.position.set(0, 0.06, cfg.offsetZ);
      group.add(sprite);
      flameSprites.push({
        sprite,
        mat,
        spinSpeed: cfg.spin,
        baseScale: cfg.scale,
      });
    }

    this.scene.add(group);

    this.fireballs.push({
      group,
      spinGroup,
      coreMat,
      mantleMat,
      outerMat,
      trailMat,
      haloMat,
      fireShaderMaterials: [coreMat, mantleMat, outerMat, trailMat],
      flameSprites,
      pos: startPos,
      vel: dir.clone().multiplyScalar(speed),
      life: 0,
      maxLife,
      trailTimer: 0,
      baseScale,
      damage,
      blastRadius,
      isMassive,
    });

    // Instantly illuminate battlefield and cast live fire shadows from point of launch across all arenas
    if (this.fireballGroundLights.length > 0) {
      const fbLight = this.fireballGroundLights[0];
      fbLight.position.set(startPos.x, Math.max(0.65, startPos.y - 0.2), startPos.z);
      fbLight.color.setHex(0xf97316);
      fbLight.intensity = isMassive ? 52 : 36;
      fbLight.visible = true;
    }
  }

  private performKatonFire() {
    if (this.isMadara) {
      soundEngine.playMadaraKatonVoice();
    } else if (this.hasGedoMazo) {
      soundEngine.playKatonVoice();
    }
    soundEngine.playKatonFire();
    haptics.katonLaunch();

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const startY = this.playerPos.y + 1.48 * CHARACTER_WORLD_SCALE;

    // Aim slightly toward nearest forward enemy if within range (including vertical aim when airborne)
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(24);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      const horizDist = _tempVecA.length();
      if (horizDist > 0.5) {
        _tempVecA.divideScalar(horizDist);
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.2) {
          const targetAimY = THREE.MathUtils.clamp(
            (target.pos.y + 1.15 * CHARACTER_WORLD_SCALE - startY) / Math.max(2.0, horizDist),
            -0.38,
            0.12
          );
          dir.set(_tempVecA.x, targetAimY, _tempVecA.z).normalize();
        }
      }
    }

    const baseStartPos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.15 * CHARACTER_WORLD_SCALE,
      startY,
      this.playerPos.z + dir.z * 1.15 * CHARACTER_WORLD_SCALE
    );

    if (this.isMadara) {
      // Madara Exclusive: Katon — Gouka Mekkyaku (Massive wide sea of colossal fireballs!)
      this.cameraShake = Math.max(this.cameraShake, 0.42);
      this.setAnnouncement('كاتون مادارا: إبادة اللهب الهائلة!', 2.2);

      const fanOffsets = [-0.42, -0.21, 0, 0.21, 0.42];
      const upAxis = new THREE.Vector3(0, 1, 0);

      for (const yawOffset of fanOffsets) {
        const isCenter = yawOffset === 0;
        const shotDir = dir.clone().applyAxisAngle(upAxis, yawOffset).normalize();
        const spawnOffset = new THREE.Vector3(
          this.playerPos.x + shotDir.x * 1.5,
          startY + (isCenter ? 0.35 : 0.15),
          this.playerPos.z + shotDir.z * 1.5
        );
        this.spawnFireballProjectile(
          spawnOffset,
          shotDir,
          isCenter ? 23.0 : 21.5,
          isCenter ? 1.48 : 1.38,
          isCenter ? 2.55 : 1.9,
          isCenter ? 68 : 46,
          isCenter ? 8.8 : 7.0,
          true
        );
      }

      // Colossal forward fire torrent & billowing ash smoke
      for (let m = 0; m < 18; m++) {
        const angleSpread = (Math.random() - 0.5) * 1.05;
        const plumeDir = dir.clone().applyAxisAngle(upAxis, angleSpread).normalize();
        const jetSpeed = 7.5 + Math.random() * 11.5;
        const isFlame = m < 12;
        this.spawnSmokePuff(
          baseStartPos.x + plumeDir.x * (0.4 + Math.random() * 0.9),
          baseStartPos.y + (Math.random() - 0.3) * 0.9,
          baseStartPos.z + plumeDir.z * (0.4 + Math.random() * 0.9),
          isFlame ? (m % 3 === 0 ? 0xfef08a : m % 3 === 1 ? 0xf97316 : 0xef4444) : 0x3b2921,
          1.4 + Math.random() * 0.9,
          4.4 + Math.random() * 1.8,
          0.46 + Math.random() * 0.32,
          isFlame ? 0.92 : 0.52,
          isFlame,
          new THREE.Vector3(
            plumeDir.x * jetSpeed,
            0.8 + Math.random() * 2.6,
            plumeDir.z * jetSpeed
          )
        );
      }

      this.flashImpactLight(baseStartPos.x, baseStartPos.y + 0.6, baseStartPos.z, 0xf97316, 34);
      this.spawnShockRing(baseStartPos.x, baseStartPos.y - 0.25, baseStartPos.z, 0xf97316, 9.2, 0.46, 0.9);
      this.spawnShockRing(baseStartPos.x, baseStartPos.y + 0.2, baseStartPos.z, 0xfef08a, 6.8, 0.38, 0.92);
      this.spawnSparks(baseStartPos, 0xfbbf24, 22, 14, 10);
      this.skillParticles.spawn('katon_embers', baseStartPos.x, baseStartPos.y, baseStartPos.z, 300, 1.95);
      return;
    }

    if (this.isItachi) {
      // Itachi Exclusive: Katon — Goukakyuu no Jutsu (Massive Forward Great Fireball!)
      this.cameraShake = Math.max(this.cameraShake, 0.36);
      this.setAnnouncement('كاتون إيتاتشي: كرة النار العظيمة!', 2.0);
      this.spawnFireballProjectile(baseStartPos, dir, 22.0, 1.42, 2.25, 76, 7.6, true);

      const upAxis = new THREE.Vector3(0, 1, 0);
      for (let m = 0; m < 12; m++) {
        const angleSpread = (Math.random() - 0.5) * 0.65;
        const plumeDir = dir.clone().applyAxisAngle(upAxis, angleSpread).normalize();
        const jetSpeed = 6.5 + Math.random() * 9.5;
        const isFlame = m < 8;
        this.spawnSmokePuff(
          baseStartPos.x + plumeDir.x * 0.55,
          baseStartPos.y + (Math.random() - 0.35) * 0.65,
          baseStartPos.z + plumeDir.z * 0.55,
          isFlame ? (m % 3 === 0 ? 0xfef08a : m % 3 === 1 ? 0xf97316 : 0xef4444) : 0x3b2921,
          1.05 + Math.random() * 0.6,
          3.4 + Math.random() * 1.4,
          0.42 + Math.random() * 0.24,
          isFlame ? 0.9 : 0.48,
          isFlame,
          new THREE.Vector3(
            plumeDir.x * jetSpeed,
            0.7 + Math.random() * 2.1,
            plumeDir.z * jetSpeed
          )
        );
      }

      this.flashImpactLight(baseStartPos.x, baseStartPos.y + 0.45, baseStartPos.z, 0xf97316, 28);
      this.spawnShockRing(baseStartPos.x, baseStartPos.y - 0.25, baseStartPos.z, 0xf97316, 6.8, 0.42, 0.9);
      this.spawnShockRing(baseStartPos.x, baseStartPos.y + 0.15, baseStartPos.z, 0xef4444, 5.2, 0.34, 0.9);
      this.spawnSparks(baseStartPos, 0xfbbf24, 16, 12, 10);
      this.skillParticles.spawn('katon_embers', baseStartPos.x, baseStartPos.y, baseStartPos.z, 210, 1.45);
      return;
    }

    // Standard Katon Fireball for other characters
    this.cameraShake = 0.24;
    this.setAnnouncement('كاتون: كرة اللهب العملاقة!', 1.8);
    this.spawnFireballProjectile(baseStartPos, dir, 21.0, 1.25, 1.0, 56, 5.8, false);

    // Realistic forward muzzle flame jet + ash smoke plume on launch
    for (let m = 0; m < 7; m++) {
      const spread = 0.5 + Math.random() * 0.9;
      const jetSpeed = 5.5 + Math.random() * 7.5;
      this.spawnSmokePuff(
        baseStartPos.x + (Math.random() - 0.5) * 0.45,
        baseStartPos.y + (Math.random() - 0.5) * 0.35,
        baseStartPos.z + (Math.random() - 0.5) * 0.45,
        m < 4 ? (m % 2 === 0 ? 0xfef08a : 0xf97316) : 0x3f2e26,
        0.55 + Math.random() * 0.35,
        2.1 + spread,
        0.34 + Math.random() * 0.24,
        m < 4 ? 0.85 : 0.45,
        m < 4,
        new THREE.Vector3(
          dir.x * jetSpeed + (Math.random() - 0.5) * 3.2,
          0.6 + Math.random() * 1.8,
          dir.z * jetSpeed + (Math.random() - 0.5) * 3.2
        )
      );
    }

    this.flashImpactLight(baseStartPos.x, baseStartPos.y + 0.3, baseStartPos.z, 0xf97316, 18);
    this.spawnShockRing(baseStartPos.x, baseStartPos.y - 0.3, baseStartPos.z, 0xf97316, 4.4, 0.36, 0.85);
    this.spawnSparks(baseStartPos, 0xfbbf24, 12);
    this.skillParticles.spawn('katon_embers', baseStartPos.x, baseStartPos.y, baseStartPos.z, 120, 0.95);
  }

  private performAmaterasu() {
    soundEngine.playKatonFire();
    haptics.katonLaunch();
    this.cameraShake = Math.max(this.cameraShake, 0.28);
    this.setAnnouncement('إيتاتشي: المانغيكيو — أماتيراس!', 1.9);

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const target = this.findNearestEnemy(26);

    let zoneX = this.playerPos.x + fx * 5.2;
    let zoneZ = this.playerPos.z + fz * 5.2;
    if (target) {
      zoneX = target.pos.x;
      zoneZ = target.pos.z;
    } else {
      const distFromCenter = Math.hypot(zoneX, zoneZ);
      const maxR = this.getActiveArenaRadius() - 1.5;
      if (distFromCenter > maxR) {
        const s = maxR / distFromCenter;
        zoneX *= s;
        zoneZ *= s;
      }
    }

    const group = new THREE.Group();
    group.position.set(zoneX, 0.05, zoneZ);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x09090b,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.scale.setScalar(2.65);
    group.add(ringMesh);

    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x7e22ce,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const auraMesh = new THREE.Mesh(this.ringGeo, auraMat);
    auraMesh.rotation.x = -Math.PI / 2;
    auraMesh.position.y = 0.02;
    auraMesh.scale.setScalar(3.55);
    group.add(auraMesh);

    const flameSprites: AmaterasuZone['flameSprites'] = [];
    const offsets = [
      [0, 0, 2.85, true],
      [0.72, 0.45, 2.35, true],
      [-0.72, 0.48, 2.3, true],
      [0.5, -0.72, 2.2, true],
      [-0.52, -0.68, 2.2, true],
      [0.85, -0.1, 2.0, true],
      [-0.85, 0.05, 2.0, true],
      [0, 0, 2.65, false],
      [0.45, 0.25, 2.15, false],
      [-0.45, -0.25, 2.15, false],
    ] as const;

    for (let i = 0; i < offsets.length; i++) {
      const [ox, oz, baseScale, isBlack] = offsets[i];
      const mat = new THREE.SpriteMaterial({
        map: this.fireFlameTex,
        color: isBlack ? 0x030305 : i % 2 === 0 ? 0x7e22ce : 0x581c87,
        transparent: true,
        opacity: isBlack ? 0.96 : 0.84,
        blending: isBlack ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(baseScale, baseScale * 1.55, 1);
      sprite.position.set(ox, isBlack ? 1.25 : 1.05, oz);
      sprite.renderOrder = isBlack ? 6 : 5;
      group.add(sprite);
      flameSprites.push({
        sprite,
        mat,
        baseScale,
        offsetX: ox,
        offsetZ: oz,
        phase: i * 1.15,
      });
    }

    this.scene.add(group);
    this.amaterasuZones.push({
      group,
      ringMesh,
      ringMat,
      auraMesh,
      auraMat,
      flameSprites,
      pos: new THREE.Vector3(zoneX, 0, zoneZ),
      targetEnemyId: target ? target.id : null,
      life: 0,
      maxLife: 4.5,
      dotTimer: 0.02,
      particleTimer: 0,
      radius: 3.6,
      dotDamage: 13,
    });

    this.spawnGroundMark(zoneX, zoneZ, 'scorch', 5.2, 7.5, 0.94, 4.0);
    this.spawnShockRing(zoneX, 0.28, zoneZ, 0x09090b, 5.8, 0.44, 0.94);
    this.spawnShockRing(zoneX, 0.46, zoneZ, 0x7e22ce, 5.4, 0.42, 0.94);
    this.spawnSparks(new THREE.Vector3(zoneX, 0.1, zoneZ), 0x09090b, 8, 6.5, -4);
    this.spawnSparks(new THREE.Vector3(zoneX, 0.1, zoneZ), 0x9333ea, 8, 6.5, -4);
    this.skillParticles.spawn('amaterasu_flames', zoneX, 0.35, zoneZ, 230, 1.35);
    this.flashImpactLight(zoneX, 1.5, zoneZ, 0x7e22ce, 26);
  }

  private performTsukuyomi() {
    soundEngine.playKamuiWarp();
    soundEngine.playRinneganPush();
    haptics.shinraTensei();
    this.cameraShake = 0.46;
    this.setAnnouncement('إيتاتشي: تسوكويومي — عالم الوهم!', 2.1);

    const px = this.playerPos.x;
    const py = this.playerPos.y;
    const pz = this.playerPos.z;

    this.spawnShockRing(px, 0.28, pz, 0xdc2626, 15.0, 0.56, 0.94);
    this.spawnShockRing(px, 0.72, pz, 0x9333ea, 13.6, 0.50, 0.9);
    this.spawnShockRing(px, 1.15, pz, 0x09090b, 12.0, 0.46, 0.9);
    this.spawnSphereShock(px, py + 1.15, pz, 0xdc2626, 12.2, 0.46, 0.46);
    this.spawnDarkVortex(px, py + 1.25, pz, 4.6, 0.52);
    this.skillParticles.spawn('tsukuyomi_wave', px, py + 0.9, pz, 240, 1.35);
    this.spawnGroundMark(px, pz, 'kamui', 10.5, 9.0, 0.88, 3.0);
    this.flashImpactLight(px, py + 2.2, pz, 0xdc2626, 30);

    const waveRadius = 12.2;
    let hitAny = false;
    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= waveRadius) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        this.damageEnemy(enemy, 46, _tempVecA.x * 11, _tempVecA.z * 11, true);
        enemy.stunTimer = Math.max(enemy.stunTimer, 4.0);
        this.spawnDamagePopup(
          enemy.pos,
          46,
          (enemy.isBoss ? 2.6 : 2.25) * CHARACTER_WORLD_SCALE
        );
        this.spawnSparks(enemy.pos, 0xdc2626, 8, 9, 10);
        hitAny = true;
      }
    }
    if (hitAny) {
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + 8);
    }
  }

  private detonateFireball(pos: THREE.Vector3, fb: FireballEntity) {
    soundEngine.playHitImpact(true);
    haptics.katonImpact();
    const s = fb.baseScale;
    this.cameraShake = Math.max(this.cameraShake, fb.isMassive ? 0.62 : 0.45);

    const blastY = Math.max(0.65, pos.y);

    // Expanding glowing fire shock rings + FBM volumetric fireball blast dome
    this.spawnShockRing(pos.x, 0.25, pos.z, 0xf97316, fb.isMassive ? 15.5 : 11.2, 0.54, 0.9);
    this.spawnShockRing(pos.x, 1.1, pos.z, 0xfef08a, fb.isMassive ? 10.8 : 7.8, 0.4, 0.95);
    this.spawnFireBlastDomeShock(pos.x, Math.max(0.85, pos.y), pos.z, fb.isMassive ? 6.6 : 4.6, 0.52);

    // Rising turbulent roaring fireball flames (additive) + dense billowing dark smoke clouds
    this.spawnSparks(pos, 0xfef08a, fb.isMassive ? 16 : 20, 14, 11);
    this.skillParticles.spawn(
      'katon_embers',
      pos.x,
      Math.max(0.4, pos.y),
      pos.z,
      fb.isMassive ? 190 : 260,
      fb.isMassive ? 1.85 : 1.45
    );

    const flamePuffCount = fb.isMassive ? 7 : 8;
    for (let i = 0; i < flamePuffCount; i++) {
      const angle = (i / flamePuffCount) * Math.PI * 2 + Math.random() * 0.4;
      const radialSpeed = (1.6 + Math.random() * 3.8) * Math.min(1.5, s);
      this.spawnSmokePuff(
        pos.x + Math.cos(angle) * 0.65 * s,
        blastY + Math.random() * 0.5 * s,
        pos.z + Math.sin(angle) * 0.65 * s,
        i % 3 === 0 ? 0xfef08a : i % 3 === 1 ? 0xf97316 : 0xea580c,
        (1.45 + Math.random() * 0.6) * Math.min(1.65, s),
        (4.6 + Math.random() * 1.4) * Math.min(1.65, s),
        0.48 + Math.random() * 0.24,
        0.92,
        true,
        new THREE.Vector3(Math.cos(angle) * radialSpeed, 2.8 + Math.random() * 3.4, Math.sin(angle) * radialSpeed)
      );
    }

    const smokePuffCount = fb.isMassive ? 7 : 9;
    for (let i = 0; i < smokePuffCount; i++) {
      const angle = (i / smokePuffCount) * Math.PI * 2 + Math.random() * 0.5;
      const radialSpeed = (1.4 + Math.random() * 3.2) * Math.min(1.5, s);
      this.spawnSmokePuff(
        pos.x + Math.cos(angle) * 0.85 * s,
        blastY + 0.3 + Math.random() * 0.7 * s,
        pos.z + Math.sin(angle) * 0.85 * s,
        i % 2 === 0 ? 0x2a1d17 : 0x453126,
        (1.5 + Math.random() * 0.7) * Math.min(1.65, s),
        (5.0 + Math.random() * 1.6) * Math.min(1.65, s),
        0.9 + Math.random() * 0.45,
        0.68,
        false,
        new THREE.Vector3(Math.cos(angle) * radialSpeed, 2.2 + Math.random() * 2.5, Math.sin(angle) * radialSpeed)
      );
    }

    // Interactive Arena Floor Reaction: Scorched crater + cooling magma cracks + shattered stone debris + blast light flash
    const markScale = fb.isMassive ? 9.8 : 6.8;
    this.spawnGroundMark(pos.x, pos.z, 'crack', markScale, 10.5, 0.85);
    this.spawnGroundMark(pos.x, pos.z, 'scorch', markScale * 0.92, 11.5, 0.94, 4.2);
    this.spawnStoneDebris(pos.x, pos.z, fb.isMassive ? 8 : 10, 8.5, 6.8);
    this.flashImpactLight(pos.x, Math.max(1.6, pos.y), pos.z, 0xf97316, fb.isMassive ? 36 : 30);

    // AoE explosion damage + knockback
    const radius = fb.blastRadius;
    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, pos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= radius) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        const falloff = 1 - (dist / radius) * 0.35;
        this.damageEnemy(enemy, Math.round(fb.damage * falloff), _tempVecA.x * 12.5, _tempVecA.z * 12.5, true);
      }
    }
  }

  private performRinneganPush() {
    soundEngine.playRinneganPush();
    haptics.shinraTensei();
    this.cameraShake = 0.44;
    this.setAnnouncement('رينيغان: شينرا تينسي!', 2.0);

    // Fast-expanding translucent purple & sky-blue circular & spherical Rinnegan shockwaves
    this.spawnShockRing(this.playerPos.x, 0.28, this.playerPos.z, 0x9333ea, 15.4, 0.54, 0.94);
    this.spawnShockRing(this.playerPos.x, 1.05, this.playerPos.z, 0x38bdf8, 12.6, 0.42, 0.88);
    this.spawnSphereShock(this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, 0x9333ea, 12.5, 0.46, 0.42);
    this.spawnSparks(this.playerPos, 0x7dd3fc, 14, 14, 7);
    this.skillParticles.spawn('shinra_wave', this.playerPos.x, this.playerPos.y + 0.8, this.playerPos.z, 250, 1.3);

    // Interactive Arena Floor Shatter: Huge radial fracture crater + cyan chakra glow + dislodged stone chunks
    this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'rinnegan_crack', 11.4, 12.0, 0.92, 2.8);
    this.spawnStoneDebris(this.playerPos.x, this.playerPos.z, 16, 11.5, 7.6);
    this.flashImpactLight(this.playerPos.x, this.playerPos.y + 2.2, this.playerPos.z, 0x38bdf8, 28);

    // Immediate radial gravitational push & damage
    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      const dist = _tempVecA.length();
      if (dist <= 12.2) {
        _tempVecA.y = 0;
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        this.damageEnemy(enemy, 52, _tempVecA.x * 19, _tempVecA.z * 19, true);
      }
    }

    // Rain down Black Chakra Receiver Rods around the outer perimeter (clamped inside solid rooftop)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const r = 4.2 + Math.random() * 4.8;
      let rx = this.playerPos.x + Math.cos(a) * r;
      let rz = this.playerPos.z + Math.sin(a) * r;
      const rodDist = Math.hypot(rx, rz);
      const arenaR = this.getActiveArenaRadius();
      if (rodDist > arenaR - 0.9) {
        const s = (arenaR - 0.9) / rodDist;
        rx *= s;
        rz *= s;
      }

      const rod = new THREE.Mesh(this.rodGeo, this.materials.chakraRod);
      rod.position.set(rx, 11 + Math.random() * 4, rz);
      rod.rotation.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
      this.scene.add(rod);

      this.fallingRods.push({
        mesh: rod,
        pos: rod.position,
        velY: -28,
        life: 0,
        landed: false,
      });
    }
  }

  private spawnElementalProjectile(
    element: 'lightning' | 'fire' | 'water',
    owner: 'player' | 'enemy',
    startPos: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    maxLife: number,
    baseScale: number,
    damage: number,
    blastRadius: number
  ) {
    const group = new THREE.Group();
    group.position.copy(startPos);
    group.scale.setScalar(baseScale);

    const palette =
      element === 'lightning'
        ? { core: 0xf0f9ff, outer: 0x38bdf8, halo: 0x0ea5e9, s1: 0xffffff, s2: 0x7dd3fc, s3: 0x0284c7 }
        : element === 'water'
          ? { core: 0xe0f2fe, outer: 0x06b6d4, halo: 0x0284c7, s1: 0xbae6fd, s2: 0x38bdf8, s3: 0x0369a1 }
          : { core: 0xfffbeb, outer: 0xf97316, halo: 0xff6b1a, s1: 0xfff3b0, s2: 0xfb923c, s3: 0xef4444 };

    const fireShaderMaterials: THREE.ShaderMaterial[] = [];
    let coreMat: THREE.Material;
    let outerMat: THREE.Material;
    let spinGroup: THREE.Group | undefined;

    if (element === 'fire') {
      _tempVecA.copy(dir).normalize();
      group.quaternion.setFromUnitVectors(_forwardZ, _tempVecA);
      const seed = Math.random() * 100;
      const fireCoreMat = createVolumetricFireCoreMaterial(seed);
      const fireOuterMat = createVolumetricFireShellMaterial(seed + 1.9);
      const fireTrailMat = createFireTrailConeMaterial(seed + 3.7);
      coreMat = fireCoreMat;
      outerMat = fireOuterMat;
      fireShaderMaterials.push(fireCoreMat, fireOuterMat, fireTrailMat);

      const coreMesh = new THREE.Mesh(this.fireVolumeGeo, fireCoreMat);
      coreMesh.scale.setScalar(0.82);
      const outerMesh = new THREE.Mesh(this.fireVolumeGeo, fireOuterMat);
      outerMesh.scale.setScalar(1.32);
      const trailMesh = new THREE.Mesh(this.fireTrailConeGeo, fireTrailMat);

      spinGroup = new THREE.Group();
      spinGroup.add(outerMesh, coreMesh);
      group.add(trailMesh, spinGroup);
    } else {
      coreMat = new THREE.MeshBasicMaterial({
        color: palette.core,
        transparent: true,
        opacity: 0.96,
      });
      const coreMesh = new THREE.Mesh(this.fireballCoreGeo, coreMat);

      outerMat = new THREE.MeshBasicMaterial({
        color: palette.outer,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerMesh = new THREE.Mesh(this.fireballOuterGeo, outerMat);
      group.add(outerMesh, coreMesh);
    }

    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: palette.halo,
      transparent: true,
      opacity: element === 'fire' ? 0.72 : 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(4.6, 4.6, 1);

    const spriteConfigs =
      element === 'fire'
        ? [
            { color: palette.s1, scale: 2.05, spin: 8.5, opacity: 0.76, offset: [0, 0, -0.05] },
            { color: palette.s2, scale: 2.75, spin: -6.8, opacity: 0.66, offset: [0, 0.05, -0.5] },
            { color: palette.s3, scale: 3.15, spin: 5.2, opacity: 0.52, offset: [0, 0.1, -0.95] },
          ]
        : [
            { color: palette.s1, scale: 2.2, spin: 8.5, opacity: 0.92, offset: [0, 0, 0] },
            { color: palette.s2, scale: 3.0, spin: -6.8, opacity: 0.82, offset: [-dir.x * 0.28, 0.06, -dir.z * 0.28] },
            { color: palette.s3, scale: 3.45, spin: 5.2, opacity: 0.65, offset: [-dir.x * 0.55, 0.12, -dir.z * 0.55] },
          ];
    const sprites: ElementalProjectile['sprites'] = [];
    group.add(haloSprite);

    for (const cfg of spriteConfigs) {
      const mat = new THREE.SpriteMaterial({
        map: this.fireFlameTex,
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(cfg.scale, cfg.scale, 1);
      sprite.position.set(cfg.offset[0], cfg.offset[1], cfg.offset[2]);
      group.add(sprite);
      sprites.push({
        sprite,
        mat,
        spinSpeed: cfg.spin,
        baseScale: cfg.scale,
      });
    }

    this.scene.add(group);
    this.elementalProjectiles.push({
      element,
      owner,
      group,
      spinGroup,
      coreMat,
      outerMat,
      haloMat,
      fireShaderMaterials,
      sprites,
      pos: startPos.clone(),
      vel: dir.clone().multiplyScalar(speed),
      life: 0,
      maxLife,
      trailTimer: 0,
      baseScale,
      damage,
      blastRadius,
      kamuiBypassed: false,
    });
  }

  private detonateElementalProjectile(pos: THREE.Vector3, proj: ElementalProjectile) {
    const s = proj.baseScale;
    this.cameraShake = Math.max(this.cameraShake, 0.34);

    if (proj.element === 'lightning') {
      this.spawnShockRing(pos.x, 0.25, pos.z, 0x38bdf8, 10.4, 0.42, 0.94);
      this.spawnShockRing(pos.x, 0.95, pos.z, 0xffffff, 7.6, 0.30, 0.96);
      this.spawnShockRing(pos.x, 1.45, pos.z, 0x7dd3fc, 5.2, 0.26, 0.9);
      this.spawnSphereShock(pos.x, Math.max(0.8, pos.y), pos.z, 0x38bdf8, 5.2, 0.34, 0.52);
      this.spawnSparks(pos, 0xe0f2fe, 26, 17, 11);
      this.skillParticles.spawn('lightning_sparks', pos.x, Math.max(0.5, pos.y), pos.z, 230, 1.45);
      for (let b = 0; b < 8; b++) {
        const a = (b / 8) * Math.PI * 2 + Math.random() * 0.4;
        const arcEnd = new THREE.Vector3(pos.x + Math.cos(a) * 3.8, 0.12 + Math.random() * 1.9, pos.z + Math.sin(a) * 3.8);
        this.spawnLightningBolt(pos, arcEnd, false);
      }
      this.flashImpactLight(pos.x, Math.max(1.5, pos.y), pos.z, 0x7dd3fc, 34);
    } else if (proj.element === 'water') {
      this.spawnShockRing(pos.x, 0.16, pos.z, 0x0284c7, 11.4, 0.54, 0.94);
      this.spawnShockRing(pos.x, 0.36, pos.z, 0x06b6d4, 9.2, 0.46, 0.9);
      this.spawnShockRing(pos.x, 0.72, pos.z, 0xe0f2fe, 7.4, 0.38, 0.9);
      this.spawnSphereShock(pos.x, Math.max(0.85, pos.y), pos.z, 0x38bdf8, 5.4, 0.38, 0.48);
      this.spawnSparks(pos, 0xe0f2fe, 22, 14, 12);
      this.skillParticles.spawn('water_splash', pos.x, Math.max(0.5, pos.y), pos.z, 260, 1.55 * s);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.32;
        const radialSpeed = 3.2 + Math.random() * 3.4;
        this.spawnSmokePuff(
          pos.x + Math.cos(a) * 0.8 * s,
          Math.max(0.35, pos.y),
          pos.z + Math.sin(a) * 0.8 * s,
          i % 3 === 0 ? 0xe0f2fe : i % 2 === 0 ? 0x7dd3fc : 0x0ea5e9,
          1.15 * s,
          4.1 * s,
          0.62,
          0.78,
          true,
          new THREE.Vector3(Math.cos(a) * radialSpeed, 2.8 + Math.random() * 3.4, Math.sin(a) * radialSpeed)
        );
      }
      this.flashImpactLight(pos.x, Math.max(1.5, pos.y), pos.z, 0x38bdf8, 28);
    } else {
      this.spawnShockRing(pos.x, 0.25, pos.z, 0xf97316, 9.4, 0.48, 0.9);
      this.spawnShockRing(pos.x, 0.95, pos.z, 0xfef08a, 6.8, 0.36, 0.92);
      this.spawnFireBlastDomeShock(pos.x, Math.max(0.85, pos.y), pos.z, 4.1 * s, 0.46);
      this.spawnSparks(pos, 0xfef08a, 16, 13, 10);
      this.skillParticles.spawn('katon_embers', pos.x, Math.max(0.4, pos.y), pos.z, 180, 1.3 * s);
      this.spawnGroundMark(pos.x, pos.z, 'scorch', 5.2, 8.5, 0.85, 3.0);
      this.flashImpactLight(pos.x, Math.max(1.5, pos.y), pos.z, 0xf97316, 26);
    }

    if (proj.owner === 'enemy') {
      const pDist = Math.hypot(this.playerPos.x - pos.x, this.playerPos.z - pos.z);
      if (pDist <= proj.blastRadius && Math.abs(this.playerPos.y + 1.0 - pos.y) < 3.2) {
        this.applyDamageToPlayer(proj.damage, 0xf97316, false);
      }
    } else {
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        _tempVecA.subVectors(enemy.pos, pos);
        _tempVecA.y = 0;
        const dist = _tempVecA.length();
        if (dist <= proj.blastRadius) {
          if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
          _tempVecA.normalize();
          const falloff = 1 - (dist / proj.blastRadius) * 0.35;
          this.damageEnemy(
            enemy,
            Math.round(proj.damage * falloff),
            _tempVecA.x * 12.0,
            _tempVecA.z * 12.0,
            true,
            this.isKakashi
          );
          if (proj.element === 'lightning') {
            enemy.stunTimer = Math.max(enemy.stunTimer, 1.15);
          }
        }
      }
    }
  }

  private ensurePlayerRaikiriVfx() {
    if (this.playerRaikiriVfx) return this.playerRaikiriVfx;
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.98,
    });
    const coreMesh = new THREE.Mesh(this.fireballCoreGeo, coreMat);
    coreMesh.scale.setScalar(0.42);

    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerMesh = new THREE.Mesh(this.fireballOuterGeo, outerMat);
    outerMesh.scale.setScalar(0.48);

    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(2.35, 2.35, 1);

    group.add(outerMesh, coreMesh, haloSprite);
    group.visible = false;
    this.scene.add(group);
    this.playerRaikiriVfx = {
      group,
      coreMat,
      outerMat,
      haloMat,
      haloSprite,
    };
    return this.playerRaikiriVfx;
  }

  private hidePlayerRaikiriVfx() {
    if (this.playerRaikiriVfx) {
      this.playerRaikiriVfx.group.visible = false;
    }
  }

  private getPlayerRightHandWorldPos(out: THREE.Vector3): THREE.Vector3 {
    if (this.customObito) {
      this.customObito.root.updateMatrixWorld(true);
      if (this.customObito.bones.rightHand) {
        this.customObito.bones.rightHand.getWorldPosition(out);
        return out;
      }
    }
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const rx = -Math.cos(this.playerYaw);
    const rz = Math.sin(this.playerYaw);
    out.set(
      this.playerPos.x + (fx * 0.55 - rx * 0.25) * CHARACTER_WORLD_SCALE,
      this.playerPos.y + 1.25 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + (fz * 0.55 - rz * 0.25) * CHARACTER_WORLD_SCALE
    );
    return out;
  }

  private performPlayerRaikiri() {
    soundEngine.playRaikiriLightning();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.28);
    this.setAnnouncement('كاكاشي: تقنية البرق — رايكيري!', 1.9);

    // Interrupt active combo if any and lock onto nearest alive opponent across the arena
    this.runCombatActive = false;
    this.runCombatPendingHit = null;
    this.meleeAnimTimer = 0;

    const target = this.findNearestEnemy(44);
    if (target) {
      const dx = target.pos.x - this.playerPos.x;
      const dz = target.pos.z - this.playerPos.z;
      if (dx * dx + dz * dz > 0.01) {
        this.playerYaw = Math.atan2(dx, dz);
      }
    }

    this.playerRaikiriState = {
      phase: 'charging',
      elapsed: 0,
      strikeElapsed: 0,
      targetId: target ? target.id : null,
      impactApplied: false,
      sparkEmitTimer: 0,
      boltTimer: 0,
    };

    const handPos = this.getPlayerRightHandWorldPos(_tempVecA).clone();
    const vfx = this.ensurePlayerRaikiriVfx();
    vfx.group.position.copy(handPos);
    vfx.group.visible = true;

    this.spawnShockRing(this.playerPos.x, 0.25, this.playerPos.z, 0x38bdf8, 5.4, 0.34, 0.92);
    this.spawnShockRing(this.playerPos.x, 0.85, this.playerPos.z, 0xe0f2fe, 3.6, 0.26, 0.9);
    this.skillParticles.spawn('lightning_sparks', handPos.x, handPos.y, handPos.z, 160, 1.15);
    this.flashImpactLight(handPos.x, handPos.y + 0.25, handPos.z, 0x7dd3fc, 28);
    for (let b = 0; b < 6; b++) {
      this.spawnLightningBolt(
        handPos,
        new THREE.Vector3(
          handPos.x + (Math.random() - 0.5) * 1.9,
          Math.max(0.2, handPos.y + (Math.random() - 0.5) * 1.4),
          handPos.z + (Math.random() - 0.5) * 1.9
        ),
        false
      );
    }
  }

  private triggerPlayerRaikiriImpact(handPos: THREE.Vector3) {
    this.cameraShake = Math.max(this.cameraShake, 0.55);
    haptics.shinraTensei();
    this.spawnShockRing(handPos.x, 0.25, handPos.z, 0x38bdf8, 10.8, 0.44, 0.95);
    this.spawnShockRing(handPos.x, handPos.y, handPos.z, 0xffffff, 7.6, 0.32, 0.98);
    this.spawnShockRing(handPos.x, handPos.y * 0.65, handPos.z, 0x60a5fa, 8.8, 0.38, 0.9);
    this.spawnSphereShock(handPos.x, handPos.y, handPos.z, 0x38bdf8, 5.8, 0.34, 0.55);
    this.spawnSparks(handPos, 0xe0f2fe, 28, 18, 12);
    this.skillParticles.spawn('lightning_sparks', handPos.x, handPos.y, handPos.z, 280, 1.6);
    this.flashImpactLight(handPos.x, handPos.y + 0.35, handPos.z, 0x7dd3fc, 40);

    for (let b = 0; b < 10; b++) {
      const a = (b / 10) * Math.PI * 2 + Math.random() * 0.35;
      this.spawnLightningBolt(
        handPos,
        new THREE.Vector3(
          handPos.x + Math.cos(a) * 3.8,
          0.15 + Math.random() * 2.1,
          handPos.z + Math.sin(a) * 3.8
        ),
        false
      );
    }

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const hitCenterX = this.playerPos.x + fx * 1.25;
    const hitCenterZ = this.playerPos.z + fz * 1.25;
    let hitAny = false;
    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      const dHand = Math.hypot(enemy.pos.x - hitCenterX, enemy.pos.z - hitCenterZ);
      const dBody = Math.hypot(enemy.pos.x - this.playerPos.x, enemy.pos.z - this.playerPos.z);
      if (dHand <= 4.1 || dBody <= 3.9) {
        _tempVecA.subVectors(enemy.pos, this.playerPos);
        _tempVecA.y = 0;
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(fx, 0, fz);
        _tempVecA.normalize();
        this.damageEnemy(enemy, 68, _tempVecA.x * 14.5, _tempVecA.z * 14.5, true, true);
        enemy.stunTimer = Math.max(enemy.stunTimer, 1.45);
        hitAny = true;
      }
    }
    if (hitAny) {
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + 10);
    }
  }

  private performPlayerSuiton() {
    soundEngine.playSuitonWater();
    haptics.katonLaunch();
    this.cameraShake = Math.max(this.cameraShake, 0.32);
    this.setAnnouncement('كاكاشي: تقنية الماء — تنين الماء!', 1.9);

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(24);
    const launchY = this.playerPos.y + 1.4 * CHARACTER_WORLD_SCALE;
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      const hd = _tempVecA.length();
      if (hd > 0.5) {
        _tempVecA.divideScalar(hd);
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.2) {
          const aimY = THREE.MathUtils.clamp((target.pos.y + 1.1 * CHARACTER_WORLD_SCALE - launchY) / Math.max(2, hd), -0.35, 0.12);
          dir.set(_tempVecA.x, aimY, _tempVecA.z).normalize();
        }
      }
    }

    const startPos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.15 * CHARACTER_WORLD_SCALE,
      launchY,
      this.playerPos.z + dir.z * 1.15 * CHARACTER_WORLD_SCALE
    );
    this.spawnShockRing(startPos.x, 0.18, startPos.z, 0x0284c7, 6.8, 0.46, 0.92);
    this.spawnShockRing(startPos.x, 0.55, startPos.z, 0xe0f2fe, 4.6, 0.36, 0.88);
    this.skillParticles.spawn('water_splash', startPos.x, startPos.y, startPos.z, 210, 1.45);
    this.flashImpactLight(startPos.x, startPos.y + 0.3, startPos.z, 0x38bdf8, 24);
    this.spawnElementalProjectile('water', 'player', startPos, dir, 21.5, 1.3, 1.45, 56, 5.8);
  }

  private ensureClayGeometryTemplates() {
    if (this.clayGeoCache) return this.clayGeoCache;

    const birdBody = new THREE.SphereGeometry(0.24, 10, 8);
    birdBody.scale(0.85, 0.68, 1.55);
    const birdHead = new THREE.SphereGeometry(0.15, 10, 8);
    const birdBeak = new THREE.ConeGeometry(0.06, 0.22, 6);
    birdBeak.rotateX(Math.PI / 2);
    const birdWing = new THREE.BoxGeometry(0.62, 0.045, 0.28);
    const birdTail = new THREE.ConeGeometry(0.14, 0.28, 4);
    birdTail.rotateX(-Math.PI / 2);

    const dragonTorso = new THREE.SphereGeometry(0.56, 12, 10);
    dragonTorso.scale(0.88, 0.72, 1.9);
    const dragonNeck = new THREE.CylinderGeometry(0.22, 0.32, 0.95, 10);
    dragonNeck.rotateX(Math.PI / 2.6);
    const dragonHead = new THREE.BoxGeometry(0.48, 0.36, 0.72);
    const dragonJaw = new THREE.BoxGeometry(0.38, 0.14, 0.56);
    const dragonHorn = new THREE.ConeGeometry(0.08, 0.42, 6);
    const dragonWing = new THREE.BoxGeometry(1.45, 0.07, 0.65);
    const dragonOrb = new THREE.SphereGeometry(0.46, 12, 10);

    const c3Body = new THREE.CylinderGeometry(0.68, 0.88, 1.85, 12);
    const c3Dome = new THREE.SphereGeometry(0.72, 12, 10);
    const c3Wing = new THREE.BoxGeometry(1.25, 0.52, 0.16);
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);

    this.clayGeoCache = {
      birdBody,
      birdHead,
      birdBeak,
      birdWing,
      birdTail,
      dragonTorso,
      dragonNeck,
      dragonHead,
      dragonJaw,
      dragonHorn,
      dragonWing,
      dragonOrb,
      c3Body,
      c3Dome,
      c3Wing,
      eyeGeo,
    };
    return this.clayGeoCache;
  }

  private performDeidaraC1Birds() {
    soundEngine.playFumaShuriken();
    haptics.fuma();
    this.cameraShake = Math.max(this.cameraShake, 0.24);
    this.setAnnouncement('ديدارا: طيور الطين المتفجرة C1 — كاتسو!', 1.8);

    const geos = this.ensureClayGeometryTemplates();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const baseDir = new THREE.Vector3(fx, 0, fz).normalize();
    const target = this.findNearestEnemy(26);
    const upAxis = new THREE.Vector3(0, 1, 0);
    const fanOffsets = [-0.32, 0, 0.32];

    for (let i = 0; i < fanOffsets.length; i++) {
      const dir = baseDir.clone().applyAxisAngle(upAxis, fanOffsets[i]).normalize();
      const pos = new THREE.Vector3(
        this.playerPos.x + dir.x * 1.15,
        this.playerPos.y + 1.38 * CHARACTER_WORLD_SCALE,
        this.playerPos.z + dir.z * 1.15
      );

      const clayMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0x334155,
        emissiveIntensity: 0.12,
        roughness: 0.72,
        metalness: 0.04,
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

      const group = new THREE.Group();
      group.position.copy(pos);
      group.quaternion.setFromUnitVectors(_forwardZ, dir);

      const body = new THREE.Mesh(geos.birdBody, clayMat);
      const head = new THREE.Mesh(geos.birdHead, clayMat);
      head.position.set(0, 0.14, 0.34);
      const beak = new THREE.Mesh(geos.birdBeak, clayMat);
      beak.position.set(0, 0.12, 0.52);
      const tail = new THREE.Mesh(geos.birdTail, clayMat);
      tail.position.set(0, 0.05, -0.42);
      const eyeL = new THREE.Mesh(geos.eyeGeo, eyeMat);
      eyeL.position.set(0.08, 0.17, 0.42);
      const eyeR = new THREE.Mesh(geos.eyeGeo, eyeMat);
      eyeR.position.set(-0.08, 0.17, 0.42);

      const leftWingPivot = new THREE.Group();
      leftWingPivot.position.set(0.14, 0.05, 0.04);
      const wingL = new THREE.Mesh(geos.birdWing, clayMat);
      wingL.position.set(0.3, 0, 0);
      leftWingPivot.add(wingL);

      const rightWingPivot = new THREE.Group();
      rightWingPivot.position.set(-0.14, 0.05, 0.04);
      const wingR = new THREE.Mesh(geos.birdWing, clayMat);
      wingR.position.set(-0.3, 0, 0);
      rightWingPivot.add(wingR);

      group.add(body, head, beak, tail, eyeL, eyeR, leftWingPivot, rightWingPivot);
      this.scene.add(group);

      this.clayExplosives.push({
        kind: 'c1_bird',
        group,
        leftWing: leftWingPivot,
        rightWing: rightWingPivot,
        materials: [clayMat, eyeMat],
        pos,
        vel: dir.multiplyScalar(20.5),
        speed: 20.5,
        life: 0,
        maxLife: 1.55,
        trailTimer: 0,
        blastRadius: 4.8,
        damage: 42,
        knockback: 11.5,
        homingRange: 18,
        detonateOnImpact: true,
        targetEnemyId: target ? target.id : null,
      });
    }
    this.spawnShockRing(this.playerPos.x + fx * 1.1, 1.35, this.playerPos.z + fz * 1.1, 0xf8fafc, 3.8, 0.3, 0.85);
  }

  private performDeidaraC2Dragon() {
    soundEngine.playKatonFire();
    haptics.katonLaunch();
    this.cameraShake = Math.max(this.cameraShake, 0.36);
    this.setAnnouncement('ديدارا: التنين الطيني المتفجر C2!', 2.0);

    const geos = this.ensureClayGeometryTemplates();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(26);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      if (_tempVecA.lengthSq() > 0.25) {
        _tempVecA.normalize();
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.15) {
          dir.set(_tempVecA.x, -0.02, _tempVecA.z).normalize();
        }
      }
    }

    const pos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.4,
      this.playerPos.y + 1.55 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + dir.z * 1.4
    );

    const clayMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x475569,
      emissiveIntensity: 0.14,
      roughness: 0.68,
      metalness: 0.05,
    });
    const bombCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.78,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(_forwardZ, dir);

    const torso = new THREE.Mesh(geos.dragonTorso, clayMat);
    const neck = new THREE.Mesh(geos.dragonNeck, clayMat);
    neck.position.set(0, 0.34, 0.96);
    const head = new THREE.Mesh(geos.dragonHead, clayMat);
    head.position.set(0, 0.56, 1.42);
    const jaw = new THREE.Mesh(geos.dragonJaw, clayMat);
    jaw.position.set(0, 0.34, 1.44);
    const hornL = new THREE.Mesh(geos.dragonHorn, clayMat);
    hornL.position.set(0.18, 0.84, 1.24);
    hornL.rotation.x = -0.5;
    const hornR = new THREE.Mesh(geos.dragonHorn, clayMat);
    hornR.position.set(-0.18, 0.84, 1.24);
    hornR.rotation.x = -0.5;
    const eyeL = new THREE.Mesh(geos.eyeGeo, eyeMat);
    eyeL.position.set(0.22, 0.62, 1.58);
    const eyeR = new THREE.Mesh(geos.eyeGeo, eyeMat);
    eyeR.position.set(-0.22, 0.62, 1.58);
    const orb = new THREE.Mesh(geos.dragonOrb, bombCoreMat);
    orb.position.set(0, 0.04, 0.05);

    const leftWingPivot = new THREE.Group();
    leftWingPivot.position.set(0.42, 0.18, 0.05);
    const wingL = new THREE.Mesh(geos.dragonWing, clayMat);
    wingL.position.set(0.72, 0, 0);
    leftWingPivot.add(wingL);

    const rightWingPivot = new THREE.Group();
    rightWingPivot.position.set(-0.42, 0.18, 0.05);
    const wingR = new THREE.Mesh(geos.dragonWing, clayMat);
    wingR.position.set(-0.72, 0, 0);
    rightWingPivot.add(wingR);

    group.add(
      torso,
      neck,
      head,
      jaw,
      hornL,
      hornR,
      eyeL,
      eyeR,
      orb,
      leftWingPivot,
      rightWingPivot
    );
    this.scene.add(group);

    this.clayExplosives.push({
      kind: 'c2_dragon',
      group,
      leftWing: leftWingPivot,
      rightWing: rightWingPivot,
      materials: [clayMat, bombCoreMat, eyeMat],
      pos,
      vel: dir.multiplyScalar(19.5),
      speed: 19.5,
      life: 0,
      maxLife: 1.5,
      trailTimer: 0,
      blastRadius: 8.2,
      damage: 78,
      knockback: 16.5,
      homingRange: 17,
      detonateOnImpact: true,
      targetEnemyId: target ? target.id : null,
    });
    this.spawnShockRing(pos.x, 1.25, pos.z, 0xf97316, 5.2, 0.36, 0.88);
    this.flashImpactLight(pos.x, pos.y + 0.5, pos.z, 0xf97316, 22);
  }

  private performDeidaraC3Ultimate() {
    soundEngine.playRinneganPush();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.45);
    this.setAnnouncement('ديدارا: الفن هو الانفجار! C0 / C3!', 2.5);

    const geos = this.ensureClayGeometryTemplates();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const dir = new THREE.Vector3(fx, -0.08, fz).normalize();
    const target = this.findNearestEnemy(28);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      if (_tempVecA.lengthSq() > 0.25) {
        _tempVecA.normalize();
        dir.set(_tempVecA.x, -0.08, _tempVecA.z).normalize();
      }
    }

    const pos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.8,
      this.playerPos.y + 3.4,
      this.playerPos.z + dir.z * 1.8
    );

    const clayMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
      roughness: 0.62,
      metalness: 0.08,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.88,
    });

    const group = new THREE.Group();
    group.position.copy(pos);
    const body = new THREE.Mesh(geos.c3Body, clayMat);
    const dome = new THREE.Mesh(geos.c3Dome, clayMat);
    dome.position.set(0, 1.02, 0);
    const wingL = new THREE.Mesh(geos.c3Wing, clayMat);
    wingL.position.set(0.95, 0.25, 0);
    wingL.rotation.z = 0.28;
    const wingR = new THREE.Mesh(geos.c3Wing, clayMat);
    wingR.position.set(-0.95, 0.25, 0);
    wingR.rotation.z = -0.28;
    const coreGlow = new THREE.Mesh(geos.dragonOrb, glowMat);
    coreGlow.position.set(0, 0.1, 0);
    group.add(body, dome, wingL, wingR, coreGlow);
    this.scene.add(group);

    this.clayExplosives.push({
      kind: 'c3_bomb',
      group,
      leftWing: null,
      rightWing: null,
      materials: [clayMat, glowMat],
      pos,
      vel: dir.multiplyScalar(15.5),
      speed: 15.5,
      life: 0,
      maxLife: 0.72,
      trailTimer: 0,
      blastRadius: 13.8,
      damage: 118,
      knockback: 23.0,
      homingRange: 20,
      detonateOnImpact: true,
      targetEnemyId: target ? target.id : null,
    });
    this.spawnShockRing(pos.x, 1.4, pos.z, 0xfbbf24, 6.2, 0.4, 0.9);
  }

  private detonateClayExplosive(pos: THREE.Vector3, ce: ClayExplosiveEntity) {
    soundEngine.playHitImpact(true);
    soundEngine.playKatonFire();
    haptics.katonImpact();

    const isC3 = ce.kind === 'c3_bomb';
    const isC2 = ce.kind === 'c2_dragon';
    const blastY = Math.max(0.65, pos.y);

    this.cameraShake = Math.max(this.cameraShake, isC3 ? 0.96 : isC2 ? 0.65 : 0.38);
    this.flashImpactLight(pos.x, Math.max(1.8, blastY), pos.z, isC3 ? 0xfef08a : 0xf97316, isC3 ? 44 : isC2 ? 32 : 22);

    this.spawnShockRing(pos.x, 0.25, pos.z, 0xf97316, isC3 ? 18.5 : isC2 ? 12.2 : 6.8, isC3 ? 0.68 : 0.46, 0.95);
    this.spawnShockRing(pos.x, 1.15, pos.z, 0xfef08a, isC3 ? 13.5 : isC2 ? 8.8 : 4.8, isC3 ? 0.54 : 0.36, 0.95);
    this.spawnFireBlastDomeShock(pos.x, Math.max(0.95, blastY), pos.z, isC3 ? 8.8 : isC2 ? 5.6 : 3.2, isC3 ? 0.62 : 0.44);
    this.spawnSparks(pos, 0xfef08a, isC3 ? 28 : isC2 ? 18 : 10, 15, 11);
    this.skillParticles.spawn('katon_embers', pos.x, Math.max(0.4, blastY), pos.z, isC3 ? 280 : isC2 ? 180 : 95, isC3 ? 2.1 : isC2 ? 1.45 : 0.95);

    const puffCount = isC3 ? 10 : isC2 ? 7 : 4;
    for (let i = 0; i < puffCount; i++) {
      const a = (i / puffCount) * Math.PI * 2 + Math.random() * 0.4;
      const spd = (1.5 + Math.random() * 3.5) * (isC3 ? 1.65 : 1.1);
      this.spawnSmokePuff(
        pos.x + Math.cos(a) * 0.65,
        blastY + Math.random() * 0.6,
        pos.z + Math.sin(a) * 0.65,
        i % 2 === 0 ? 0xfef08a : 0xf97316,
        isC3 ? 2.1 : 1.2,
        isC3 ? 6.2 : 3.8,
        0.55 + Math.random() * 0.25,
        0.9,
        true,
        new THREE.Vector3(Math.cos(a) * spd, 2.8 + Math.random() * 3.5, Math.sin(a) * spd)
      );
      this.spawnSmokePuff(
        pos.x + Math.cos(a) * 0.85,
        blastY + 0.4 + Math.random() * 0.8,
        pos.z + Math.sin(a) * 0.85,
        i % 2 === 0 ? 0xe2e8f0 : 0x334155,
        isC3 ? 2.2 : 1.3,
        isC3 ? 6.8 : 4.2,
        0.95 + Math.random() * 0.45,
        0.66,
        false,
        new THREE.Vector3(Math.cos(a) * spd * 0.8, 2.4 + Math.random() * 2.6, Math.sin(a) * spd * 0.8)
      );
    }

    if (isC3 || isC2) {
      const markScale = isC3 ? 12.2 : 7.6;
      this.spawnGroundMark(pos.x, pos.z, 'crack', markScale, 12.0, 0.88);
      this.spawnGroundMark(pos.x, pos.z, 'scorch', markScale * 0.92, 12.0, 0.94, 4.2);
      this.spawnStoneDebris(pos.x, pos.z, isC3 ? 14 : 8, 10.0, 7.6);
    }

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, pos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= ce.blastRadius) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        const falloff = 1 - (dist / ce.blastRadius) * 0.35;
        const dmg = Math.round(ce.damage * falloff);
        this.damageEnemy(
          enemy,
          dmg,
          _tempVecA.x * ce.knockback,
          _tempVecA.z * ce.knockback,
          true
        );
        if (isC3 || isC2) {
          enemy.stunTimer = Math.max(enemy.stunTimer, isC3 ? 1.5 : 0.9);
        }
      }
    }
  }

  private ensureKuramaGeometryCache() {
    if (this.kuramaGeoCache) return this.kuramaGeoCache;
    const core = new THREE.SphereGeometry(0.42, 14, 12);
    const blade = new THREE.BoxGeometry(2.65, 0.04, 0.56);
    const haloRing = new THREE.TorusGeometry(0.92, 0.06, 8, 28);
    haloRing.rotateX(Math.PI / 2);
    const bijuuRing = new THREE.TorusGeometry(0.78, 0.055, 8, 24);
    this.kuramaGeoCache = { core, blade, haloRing, bijuuRing };
    return this.kuramaGeoCache;
  }

  private performNarutoRasenshuriken() {
    soundEngine.playFumaShuriken();
    soundEngine.playRaikiriLightning();
    haptics.fuma();
    this.cameraShake = Math.max(this.cameraShake, 0.32);
    this.setAnnouncement('ناروتو كوراما: فوتون — راسين شوريكن!', 2.0);

    const geos = this.ensureKuramaGeometryCache();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(28);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      if (_tempVecA.lengthSq() > 0.25) {
        _tempVecA.normalize();
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.15) {
          dir.set(_tempVecA.x, -0.02, _tempVecA.z).normalize();
        }
      }
    }

    const pos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.4,
      this.playerPos.y + 1.42 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + dir.z * 1.4
    );

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xf0f9ff });
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const goldRimMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const group = new THREE.Group();
    group.position.copy(pos);

    const spinGroup = new THREE.Group();
    const coreMesh = new THREE.Mesh(geos.core, coreMat);
    const shellMesh = new THREE.Mesh(geos.core, shellMat);
    shellMesh.scale.setScalar(1.45);
    const blade1 = new THREE.Mesh(geos.blade, bladeMat);
    const blade2 = new THREE.Mesh(geos.blade, bladeMat);
    blade2.rotation.y = Math.PI / 2;
    const windHalo = new THREE.Mesh(geos.haloRing, goldRimMat);
    spinGroup.add(shellMesh, coreMesh, blade1, blade2, windHalo);

    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(4.6, 4.6, 1);
    group.add(spinGroup, haloSprite);
    this.scene.add(group);

    this.kuramaProjectiles.push({
      kind: 'rasenshuriken',
      group,
      spinGroup,
      materials: [coreMat, shellMat, bladeMat, goldRimMat],
      haloMat,
      pos,
      vel: dir.multiplyScalar(24.5),
      speed: 24.5,
      life: 0,
      maxLife: 1.45,
      trailTimer: 0,
      baseScale: 1.05,
      blastRadius: 7.4,
      damage: 74,
      knockback: 16.0,
      targetEnemyId: target ? target.id : null,
    });
    this.spawnShockRing(pos.x, 1.35, pos.z, 0x38bdf8, 4.8, 0.34, 0.9);
    this.skillParticles.spawn('shinra_wave', pos.x, pos.y, pos.z, 90, 0.9);
    this.flashImpactLight(pos.x, pos.y + 0.3, pos.z, 0x38bdf8, 24);
  }

  private performNarutoBijuuDama(
    yawOffset = 0,
    scale = 1.0,
    damage = 86,
    announce = true
  ) {
    if (announce) {
      soundEngine.playKatonFire();
      haptics.shinraTensei();
      this.cameraShake = Math.max(this.cameraShake, 0.4);
      this.setAnnouncement('ناروتو كوراما: كرة البيجو (بيجو داما)!', 2.0);
    }

    const geos = this.ensureKuramaGeometryCache();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const upAxis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(28);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      if (_tempVecA.lengthSq() > 0.25) {
        _tempVecA.normalize();
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.15) {
          dir.set(_tempVecA.x, -0.02, _tempVecA.z).normalize();
        }
      }
    }
    if (yawOffset !== 0) {
      dir.applyAxisAngle(upAxis, yawOffset).normalize();
    }

    const pos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.45,
      this.playerPos.y + 1.45 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + dir.z * 1.45
    );

    const coreMat = new THREE.MeshBasicMaterial({ color: 0x16072b });
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const crimsonRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: 0xa855f7,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const group = new THREE.Group();
    group.position.copy(pos);
    group.scale.setScalar(scale);

    const spinGroup = new THREE.Group();
    const coreMesh = new THREE.Mesh(geos.core, coreMat);
    coreMesh.scale.setScalar(1.38);
    const shellMesh = new THREE.Mesh(geos.core, rimMat);
    shellMesh.scale.setScalar(1.78);
    const orbit1 = new THREE.Mesh(geos.bijuuRing, crimsonRingMat);
    const orbit2 = new THREE.Mesh(geos.bijuuRing, crimsonRingMat);
    orbit2.rotation.x = Math.PI / 2;
    orbit2.rotation.y = Math.PI / 4;
    spinGroup.add(shellMesh, coreMesh, orbit1, orbit2);

    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(5.2, 5.2, 1);
    group.add(spinGroup, haloSprite);
    this.scene.add(group);

    this.kuramaProjectiles.push({
      kind: 'bijuu_dama',
      group,
      spinGroup,
      materials: [coreMat, rimMat, crimsonRingMat],
      haloMat,
      pos,
      vel: dir.multiplyScalar(23.0),
      speed: 23.0,
      life: 0,
      maxLife: 1.5,
      trailTimer: 0,
      baseScale: scale,
      blastRadius: 8.8 * Math.min(1.25, scale),
      damage,
      knockback: 19.5,
      targetEnemyId: yawOffset === 0 && target ? target.id : null,
    });

    if (announce) {
      this.spawnShockRing(pos.x, 1.35, pos.z, 0x9333ea, 5.4, 0.38, 0.9);
      this.skillParticles.spawn('kamui_vortex', pos.x, pos.y, pos.z, 110, 1.0);
      this.flashImpactLight(pos.x, pos.y + 0.4, pos.z, 0xa855f7, 26);
    }
  }

  private performNarutoKuramaRoar() {
    soundEngine.playRinneganPush();
    soundEngine.playKatonFire();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.58);
    this.setAnnouncement('ناروتو كوراما: زئير تشاكرا الكيوبي!', 2.0);

    this.spawnShockRing(this.playerPos.x, 0.28, this.playerPos.z, 0xf59e0b, 15.8, 0.56, 0.94);
    this.spawnShockRing(this.playerPos.x, 1.1, this.playerPos.z, 0xfef08a, 12.6, 0.44, 0.92);
    this.spawnSphereShock(this.playerPos.x, this.playerPos.y + 1.15, this.playerPos.z, 0xfbbf24, 12.5, 0.46, 0.48);
    this.spawnSparks(this.playerPos, 0xfef08a, 22, 16, 10);
    this.skillParticles.spawn('katon_embers', this.playerPos.x, this.playerPos.y + 0.9, this.playerPos.z, 260, 1.55);
    this.skillParticles.spawn('chakra_burst', this.playerPos.x, this.playerPos.y + 1.1, this.playerPos.z, 180, 1.35);
    this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'crack', 11.2, 11.5, 0.9);
    this.spawnStoneDebris(this.playerPos.x, this.playerPos.z, 14, 11.0, 7.6);
    this.flashImpactLight(this.playerPos.x, this.playerPos.y + 2.4, this.playerPos.z, 0xf59e0b, 34);

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= 12.5) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        this.damageEnemy(enemy, 64, _tempVecA.x * 20.0, _tempVecA.z * 20.0, true);
        enemy.stunTimer = Math.max(enemy.stunTimer, 1.6);
      }
    }
  }

  private performNarutoBijuuBarrage() {
    soundEngine.playKatonFire();
    soundEngine.playRinneganPush();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.65);
    this.setAnnouncement('ناروتو كوراما: وابل كرات البيجو!', 2.2);

    const offsets = [-0.26, 0, 0.26];
    for (let i = 0; i < offsets.length; i++) {
      this.performNarutoBijuuDama(offsets[i], 1.12, 68, i === 1);
    }
  }

  private performSageOdamaRasengan(
    yawOffset = 0,
    scale = 1.0,
    damage = 80,
    announce = true
  ) {
    if (announce) {
      soundEngine.playRaikiriLightning();
      soundEngine.playFumaShuriken();
      haptics.shinraTensei();
      this.cameraShake = Math.max(this.cameraShake, 0.38);
      this.setAnnouncement('ناروتو ساج مود: أوداما راسينغان!', 2.0);
    }

    const geos = this.ensureKuramaGeometryCache();
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const upAxis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(fx, -0.02, fz).normalize();
    const target = this.findNearestEnemy(28);
    if (target) {
      _tempVecA.subVectors(target.pos, this.playerPos);
      _tempVecA.y = 0;
      if (_tempVecA.lengthSq() > 0.25) {
        _tempVecA.normalize();
        if (_tempVecA.x * fx + _tempVecA.z * fz > 0.15) {
          dir.set(_tempVecA.x, -0.02, _tempVecA.z).normalize();
        }
      }
    }
    if (yawOffset !== 0) {
      dir.applyAxisAngle(upAxis, yawOffset).normalize();
    }

    const pos = new THREE.Vector3(
      this.playerPos.x + dir.x * 1.45,
      this.playerPos.y + 1.42 * CHARACTER_WORLD_SCALE,
      this.playerPos.z + dir.z * 1.45
    );

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sageGoldMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: this.fireGlowTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const group = new THREE.Group();
    group.position.copy(pos);
    group.scale.setScalar(scale * 1.12);

    const spinGroup = new THREE.Group();
    const coreMesh = new THREE.Mesh(geos.core, coreMat);
    coreMesh.scale.setScalar(1.42);
    const shellMesh = new THREE.Mesh(geos.core, shellMat);
    shellMesh.scale.setScalar(1.92);
    const ring1 = new THREE.Mesh(geos.bijuuRing, sageGoldMat);
    const ring2 = new THREE.Mesh(geos.bijuuRing, shellMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.rotation.y = Math.PI / 4;
    spinGroup.add(shellMesh, coreMesh, ring1, ring2);

    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(5.4, 5.4, 1);
    group.add(spinGroup, haloSprite);
    this.scene.add(group);

    this.kuramaProjectiles.push({
      kind: 'sage_odama',
      group,
      spinGroup,
      materials: [coreMat, shellMat, sageGoldMat],
      haloMat,
      pos,
      vel: dir.multiplyScalar(24.0),
      speed: 24.0,
      life: 0,
      maxLife: 1.45,
      trailTimer: 0,
      baseScale: scale * 1.12,
      blastRadius: 8.2 * Math.min(1.25, scale),
      damage,
      knockback: 18.0,
      targetEnemyId: yawOffset === 0 && target ? target.id : null,
    });

    if (announce) {
      this.spawnShockRing(pos.x, 1.35, pos.z, 0x38bdf8, 5.2, 0.36, 0.9);
      this.skillParticles.spawn('shinra_wave', pos.x, pos.y, pos.z, 100, 0.95);
      this.flashImpactLight(pos.x, pos.y + 0.35, pos.z, 0x38bdf8, 26);
    }
  }

  private performSageFrogKata() {
    soundEngine.playRinneganPush();
    soundEngine.playHitImpact(true);
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.52);
    this.setAnnouncement('ناروتو ساج مود: كاوازو كوميـتي (فنون الضفدع)!', 2.0);

    this.spawnShockRing(this.playerPos.x, 0.28, this.playerPos.z, 0xf59e0b, 14.2, 0.52, 0.94);
    this.spawnShockRing(this.playerPos.x, 1.15, this.playerPos.z, 0x38bdf8, 11.4, 0.42, 0.92);
    this.spawnSphereShock(this.playerPos.x, this.playerPos.y + 1.15, this.playerPos.z, 0xfbbf24, 11.0, 0.44, 0.45);
    this.spawnSparks(this.playerPos, 0xfef08a, 20, 15, 9);
    this.skillParticles.spawn('chakra_burst', this.playerPos.x, this.playerPos.y + 1.0, this.playerPos.z, 220, 1.45);
    this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'crack', 10.2, 10.5, 0.88);
    this.spawnStoneDebris(this.playerPos.x, this.playerPos.z, 12, 10.0, 7.0);
    this.flashImpactLight(this.playerPos.x, this.playerPos.y + 2.2, this.playerPos.z, 0xf59e0b, 30);

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= 11.5) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        this.damageEnemy(enemy, 62, _tempVecA.x * 19.0, _tempVecA.z * 19.0, true);
        enemy.stunTimer = Math.max(enemy.stunTimer, 1.65);
      }
    }
  }

  private performSageRasenganBarrage() {
    soundEngine.playRaikiriLightning();
    soundEngine.playRinneganPush();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.62);
    this.setAnnouncement('ناروتو ساج مود: وابل الراسينغان العملاقة!', 2.2);

    const offsets = [-0.26, 0, 0.26];
    for (let i = 0; i < offsets.length; i++) {
      this.performSageOdamaRasengan(offsets[i], 1.1, 66, i === 1);
    }
  }

  private detonateKuramaProjectile(pos: THREE.Vector3, kp: KuramaProjectileEntity) {
    soundEngine.playHitImpact(true);
    haptics.katonImpact();
    const blastY = Math.max(0.65, pos.y);
    const isBijuu = kp.kind === 'bijuu_dama';
    const isSageOdama = kp.kind === 'sage_odama';

    this.cameraShake = Math.max(this.cameraShake, isBijuu ? 0.78 : isSageOdama ? 0.68 : 0.62);

    if (isBijuu) {
      soundEngine.playKatonFire();
      this.flashImpactLight(pos.x, Math.max(1.8, blastY), pos.z, 0xc084fc, 40);
      this.spawnShockRing(pos.x, 0.25, pos.z, 0x9333ea, 15.8, 0.6, 0.95);
      this.spawnShockRing(pos.x, 1.15, pos.z, 0xef4444, 11.8, 0.48, 0.94);
      this.spawnSphereShock(pos.x, blastY, pos.z, 0x7e22ce, 8.8, 0.52, 0.56);
      this.spawnFireBlastDomeShock(pos.x, Math.max(0.9, blastY), pos.z, 6.2, 0.52);
      this.skillParticles.spawn('kamui_vortex', pos.x, blastY, pos.z, 240, 1.85);
      this.spawnSparks(pos, 0xfef08a, 18, 15, 11);
      this.spawnGroundMark(pos.x, pos.z, 'crack', 9.6, 11.0, 0.88);
      this.spawnGroundMark(pos.x, pos.z, 'scorch', 8.8, 11.5, 0.94, 4.2);
      this.spawnStoneDebris(pos.x, pos.z, 12, 10.0, 7.5);
    } else if (isSageOdama) {
      soundEngine.playRaikiriLightning();
      this.flashImpactLight(pos.x, Math.max(1.8, blastY), pos.z, 0x38bdf8, 38);
      this.spawnShockRing(pos.x, 0.25, pos.z, 0x0ea5e9, 14.6, 0.56, 0.95);
      this.spawnShockRing(pos.x, 1.15, pos.z, 0xf59e0b, 10.6, 0.46, 0.92);
      this.spawnSphereShock(pos.x, blastY, pos.z, 0x38bdf8, 8.6, 0.52, 0.54);
      this.skillParticles.spawn('shinra_wave', pos.x, blastY, pos.z, 230, 1.8);
      this.spawnSparks(pos, 0xfef08a, 20, 15, 10);
      this.spawnGroundMark(pos.x, pos.z, 'rinnegan_crack', 9.0, 10.5, 0.88, 3.0);
      this.spawnStoneDebris(pos.x, pos.z, 10, 9.5, 7.0);
    } else {
      soundEngine.playRaikiriLightning();
      this.flashImpactLight(pos.x, Math.max(1.8, blastY), pos.z, 0x38bdf8, 34);
      this.spawnShockRing(pos.x, 0.25, pos.z, 0x38bdf8, 13.6, 0.56, 0.95);
      this.spawnShockRing(pos.x, 1.1, pos.z, 0xfef08a, 9.8, 0.44, 0.92);
      this.spawnSphereShock(pos.x, blastY, pos.z, 0x38bdf8, 8.2, 0.52, 0.52);
      this.spawnSlashArc(pos.x, blastY + 0.5, pos.z, 0, 0.2, 0x38bdf8, 4.8);
      this.spawnSlashArc(pos.x, blastY + 0.8, pos.z, Math.PI * 0.5, -0.25, 0xfbbf24, 4.4);
      this.skillParticles.spawn('shinra_wave', pos.x, blastY, pos.z, 230, 1.75);
      this.spawnSparks(pos, 0x7dd3fc, 22, 16, 10);
      this.spawnGroundMark(pos.x, pos.z, 'rinnegan_crack', 8.4, 10.0, 0.86, 2.8);
      this.spawnStoneDebris(pos.x, pos.z, 9, 9.0, 6.8);
    }

    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, pos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= kp.blastRadius) {
        if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
        _tempVecA.normalize();
        const falloff = 1 - (dist / kp.blastRadius) * 0.35;
        this.damageEnemy(
          enemy,
          Math.round(kp.damage * falloff),
          _tempVecA.x * kp.knockback,
          _tempVecA.z * kp.knockback,
          true,
          !isBijuu
        );
        enemy.stunTimer = Math.max(enemy.stunTimer, isBijuu ? 1.2 : 1.5);
      }
    }
  }

  private performEnemyKakashiJutsu(e: EnemyEntity, kind: 'lightning' | 'fire' | 'water') {
    const eHandY = e.pos.y + 1.35 * CHARACTER_WORLD_SCALE;
    const dir = new THREE.Vector3(
      this.playerPos.x - e.pos.x,
      this.playerPos.y + 1.0 * CHARACTER_WORLD_SCALE - eHandY,
      this.playerPos.z - e.pos.z
    );
    if (dir.lengthSq() < 0.01) {
      dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    } else {
      dir.normalize();
    }

    const handOrigin = new THREE.Vector3(
      e.pos.x + dir.x * 1.05 * CHARACTER_WORLD_SCALE,
      eHandY,
      e.pos.z + dir.z * 1.05 * CHARACTER_WORLD_SCALE
    );

    if (kind === 'lightning') {
      soundEngine.playRaikiriLightning();
      this.setAnnouncement('كاكاشي: تقنية البرق — رايكيري!', 1.5);
      e.vel.x += dir.x * 6.5;
      e.vel.z += dir.z * 6.5;
      this.spawnShockRing(e.pos.x, 0.25, e.pos.z, 0x38bdf8, 4.4, 0.34, 0.88);
      this.skillParticles.spawn('lightning_sparks', handOrigin.x, handOrigin.y, handOrigin.z, 100, 1.0);
      for (let b = 0; b < 3; b++) {
        this.spawnLightningBolt(
          handOrigin,
          new THREE.Vector3(
            handOrigin.x + dir.x * 2.6 + (Math.random() - 0.5) * 1.2,
            0.5 + Math.random() * 1.4,
            handOrigin.z + dir.z * 2.6 + (Math.random() - 0.5) * 1.2
          ),
          false
        );
      }
      this.flashImpactLight(handOrigin.x, handOrigin.y + 0.3, handOrigin.z, 0x38bdf8, 22);
      this.spawnElementalProjectile('lightning', 'enemy', handOrigin, dir, 22.0, 1.15, 1.0, 16, 3.2);
    } else if (kind === 'fire') {
      soundEngine.playKatonFire();
      this.setAnnouncement('كاكاشي: تقنية النار — كاتون!', 1.5);
      this.spawnShockRing(handOrigin.x, 0.25, handOrigin.z, 0xf97316, 4.2, 0.34, 0.85);
      this.skillParticles.spawn('katon_embers', handOrigin.x, handOrigin.y, handOrigin.z, 105, 0.95);
      this.flashImpactLight(handOrigin.x, handOrigin.y + 0.3, handOrigin.z, 0xf97316, 20);
      this.spawnElementalProjectile('fire', 'enemy', handOrigin, dir, 18.5, 1.35, 1.05, 16, 3.8);
    } else {
      soundEngine.playSuitonWater();
      this.setAnnouncement('كاكاشي: تقنية الماء — تنين الماء!', 1.5);
      this.spawnShockRing(handOrigin.x, 0.25, handOrigin.z, 0x06b6d4, 4.6, 0.38, 0.88);
      this.skillParticles.spawn('water_splash', handOrigin.x, handOrigin.y, handOrigin.z, 125, 1.15);
      this.flashImpactLight(handOrigin.x, handOrigin.y + 0.3, handOrigin.z, 0x06b6d4, 20);
      this.spawnElementalProjectile('water', 'enemy', handOrigin, dir, 19.0, 1.35, 1.2, 15, 4.0);
    }
  }

  private async performGedoMazo() {
    const summonVer = ++this.gedoSummonVersion;
    this.disposeActiveGedo();

    // Play Obito's real "Kuchiyose no Jutsu!" voice at max clarity (Volume = 1.0) immediately with the ground seal
    soundEngine.playGedoVoice();
    const invokeTimestamp = performance.now();
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, 0.72);
    this.setAnnouncement('تقنية الاستدعاء: تمثال غيدو مازو!', 3.2);

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const summonYaw = this.playerYaw;
    const summonPos = new THREE.Vector3(
      this.playerPos.x + fx * 5.8,
      0,
      this.playerPos.z + fz * 5.8
    );

    const radialDist = Math.hypot(summonPos.x, summonPos.z);
    const maxSummonRadius = this.getActiveArenaRadius() - 4.2;
    if (radialDist > maxSummonRadius) {
      const clampScale = maxSummonRadius / radialDist;
      summonPos.x *= clampScale;
      summonPos.z *= clampScale;
    }

    // Step 1 (t = 0s): Kuchiyose summoning invocation without ground decals
    this.spawnShockRing(summonPos.x, 0.5, summonPos.z, 0xc084fc, 13.5, 0.58, 0.85);
    this.spawnStoneDebris(summonPos.x, summonPos.z, 14, 9.5, 8.2);
    this.flashImpactLight(summonPos.x, 4.5, summonPos.z, 0xa855f7, 30);

    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const r = 0.8 + Math.random() * 4.4;
      this.spawnSmokePuff(
        summonPos.x + Math.cos(a) * r,
        0.5 + Math.random() * 1.4,
        summonPos.z + Math.sin(a) * r,
        i % 3 === 0 ? 0xe2e8f0 : 0xf8fafc,
        1.8 + Math.random() * 0.9,
        5.2 + Math.random() * 1.6,
        1.25 + Math.random() * 0.45,
        0.82
      );
    }

    // Step 2: Load exact Gedo Mazo GLB statue (`g39wbk.glb`) while ensuring 2.0s exact delay before rising
    const enableGedoShadows = !this.isSoftwareGl && this.shadowQuality === 'high';
    const rig = await buildGedoMazoRig(this.maxAniso, enableGedoShadows);
    if (
      this.disposed ||
      summonVer !== this.gedoSummonVersion ||
      this.phase === 'title' ||
      this.phase === 'victory' ||
      this.phase === 'defeat'
    ) {
      rig.dispose();
      return;
    }

    const elapsedWaitSec = (performance.now() - invokeTimestamp) / 1000;
    const sealDelay = Math.max(0, 2.0 - elapsedWaitSec);

    rig.root.position.set(summonPos.x, -11.4, summonPos.z);
    rig.root.rotation.y = summonYaw;
    rig.root.visible = sealDelay <= 0.02;
    this.scene.add(rig.root);

    if (sealDelay <= 0.02) {
      soundEngine.playGedoSummon();
      this.cameraShake = Math.max(this.cameraShake, 0.65);
    }

    this.activeGedo = {
      rig,
      pos: summonPos,
      yaw: summonYaw,
      phase: sealDelay > 0.02 ? 'seal' : 'emerging',
      phaseTimer: 0,
      sealDuration: sealDelay,
      emergeDuration: 1.75,
      activeDuration: 15.0,
      vanishDuration: 1.4,
      dotTimer: 0.45,
      lightningTimer: 0,
      smokeTimer: 0,
    };
  }

  private disposeActiveGedo() {
    if (!this.activeGedo) return;
    this.scene.remove(this.activeGedo.rig.root);
    this.activeGedo.rig.dispose();
    if (this.activeGedo.sealMesh) {
      this.scene.remove(this.activeGedo.sealMesh);
      this.activeGedo.sealMesh.geometry.dispose();
    }
    if (this.activeGedo.sealMat) {
      this.activeGedo.sealMat.dispose();
    }
    this.activeGedo = null;
  }

  private isSusanooGroundedMode(): boolean {
    return Boolean(this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing');
  }

  private getSusanooMitigatedDamage(rawDamage: number): number {
    if (this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing') {
      const mult =
        this.activeSusanoo.stage === 'perfect'
          ? 0.25
          : this.activeSusanoo.stage === 'muscular'
            ? 0.30
            : this.activeSusanoo.stage === 'armored'
              ? 0.35
              : 0.45;
      return Math.max(1, Math.round(rawDamage * mult));
    }
    return rawDamage;
  }

  private async performMadaraSusanoo(stage: SusanooStage = 'armored') {
    if (this.isItachi && stage === 'perfect') return;
    const summonVer = ++this.susanooSummonVersion;
    this.disposeActiveSusanoo();

    soundEngine.playRinneganPush();
    haptics.shinraTensei();

    const isItachi = this.isItachi;
    const isPerfect = stage === 'perfect';
    const isRibcage = stage === 'ribcage';
    const isMuscular = stage === 'muscular';
    const stageScale = isPerfect ? 1.65 : isRibcage ? 0.96 : isMuscular ? 1.05 : 1.0;

    const isBlueStage = !isItachi && (isRibcage || stage === 'armored' || isMuscular || isPerfect);
    const ownerLabel = isItachi ? 'إيتاتشي' : 'مادارا';
    this.cameraShake = Math.max(this.cameraShake, isPerfect ? 0.78 : isMuscular ? 0.65 : 0.58);
    this.setAnnouncement(
      isPerfect
        ? `${ownerLabel}: السوسانو الكامل الأسطوري!`
        : isMuscular
          ? `${ownerLabel}: السوسانو الشيطاني!`
          : isRibcage
            ? `${ownerLabel}: سوسانو الأضلاع!`
            : `${ownerLabel}: السوسانو الهيكلي!`,
      2.2
    );

    const cDark = isItachi ? 0x9a3412 : isBlueStage ? 0x1e3a8a : 0x6d28d9;
    const cMid = isItachi ? 0xea580c : isBlueStage ? 0x1d4ed8 : 0xa855f7;
    const cBright = isItachi ? 0xfdba74 : isBlueStage ? 0x60a5fa : 0xe9d5ff;
    const cSpark = isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xc084fc;

    // Initial chakra eruption & expanding rings around pilot
    this.spawnShockRing(this.playerPos.x, 0.25, this.playerPos.z, cDark, 10.2 * stageScale, 0.48, 0.94);
    this.spawnShockRing(this.playerPos.x, 0.95, this.playerPos.z, cMid, 7.8 * stageScale, 0.44, 0.9);
    this.spawnShockRing(this.playerPos.x, 1.75, this.playerPos.z, cBright, 5.6 * stageScale, 0.36, 0.84);
    this.skillParticles.spawn('tsukuyomi_wave', this.playerPos.x, 1.1, this.playerPos.z, isPerfect ? 220 : 165, 1.25 * stageScale);
    this.spawnSparks(this.playerPos, cSpark, isPerfect ? 22 : 16, 13, 10);
    this.flashImpactLight(this.playerPos.x, 3.2 * stageScale, this.playerPos.z, cMid, isPerfect ? 38 : 28);

    const rig = await buildSusanooRig(isItachi ? 'itachi' : 'madara', stage);
    if (
      this.disposed ||
      summonVer !== this.susanooSummonVersion ||
      (!this.isMadara && !this.isItachi) ||
      this.phase === 'title' ||
      this.phase === 'victory' ||
      this.phase === 'defeat'
    ) {
      rig.dispose();
      return;
    }

    const target = this.findNearestEnemy(32);
    let surgeDirX = Math.sin(this.playerYaw);
    let surgeDirZ = Math.cos(this.playerYaw);
    if (target) {
      const dx = target.pos.x - this.playerPos.x;
      const dz = target.pos.z - this.playerPos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        surgeDirX = dx / len;
        surgeDirZ = dz / len;
        this.playerYaw = Math.atan2(surgeDirX, surgeDirZ);
      }
    }

    const targetHeight = isPerfect ? 16.5 : isRibcage ? 3.95 : isMuscular ? 6.5 : 6.3;
    const activeDuration = isPerfect ? 16.0 : 14.0;
    rig.fitToTargetWorldHeight(targetHeight);
    rig.root.position.copy(this.playerPos);
    rig.root.rotation.set(0, this.playerYaw, 0);
    rig.root.updateMatrixWorld(true);
    this.scene.add(rig.root);

    const pilotWorldPos = new THREE.Vector3();
    rig.pilotAnchor.getWorldPosition(pilotWorldPos);

    const groundRingMat = new THREE.MeshBasicMaterial({
      color: isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xa855f7,
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const innerR = isPerfect ? 3.85 : isRibcage ? 1.85 : 2.05;
    const outerR = isPerfect ? 5.35 : isRibcage ? 2.65 : 2.95;
    const groundRingGeo = new THREE.RingGeometry(innerR, outerR, 36);
    const groundRingMesh = new THREE.Mesh(groundRingGeo, groundRingMat);
    groundRingMesh.rotation.x = -Math.PI / 2;
    groundRingMesh.position.set(this.playerPos.x, 0.04, this.playerPos.z);
    this.scene.add(groundRingMesh);

    this.activeSusanoo = {
      stage,
      rig,
      phase: 'active',
      phaseTimer: 0,
      surgeDuration: 0,
      activeDuration,
      vanishDuration: 0.6,
      surgeDirX,
      surgeDirZ,
      surgeSpeed: 0,
      surgeStrikeDone: false,
      currentLean: 0.1,
      slashSweepTimer: 0.44,
      slashSweepDuration: 0.44,
      comboStep: 2,
      stridePhase: 0,
      pilotWorldPos,
      emberTimer: 0,
      groundRingMesh,
      groundRingMat,
    };

    // Immediate Susanoo shockwave and initial cleave on activation
    this.triggerSusanooStageBurst(this.activeSusanoo);
  }

  private triggerSusanooStageBurst(susanoo: ActiveSusanooState) {
    if (susanoo.surgeStrikeDone) return;
    susanoo.surgeStrikeDone = true;
    susanoo.slashSweepTimer = susanoo.slashSweepDuration;

    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const isItachi = this.isItachi;
    const isPerfect = susanoo.stage === 'perfect';
    const isRibcage = susanoo.stage === 'ribcage';
    const isBlueStage = !isItachi && (isRibcage || susanoo.stage === 'armored' || susanoo.stage === 'muscular' || isPerfect);
    const stageScale = isPerfect ? 1.48 : 1.02;
    const strikeX = this.playerPos.x + fx * (2.6 * stageScale);
    const strikeZ = this.playerPos.z + fz * (2.6 * stageScale);
    const arcY = isPerfect ? 4.2 : isRibcage ? 1.95 : 2.3;

    const cDark = isItachi ? 0x9a3412 : isBlueStage ? 0x1e3a8a : 0x7e22ce;
    const cMid = isItachi ? 0xea580c : isBlueStage ? 0x1d4ed8 : 0xa855f7;
    const cBright = isItachi ? 0xfdba74 : isBlueStage ? 0x60a5fa : 0xe9d5ff;
    const cSpark = isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xc084fc;

    soundEngine.playRinneganPush();
    soundEngine.playHitImpact(true);
    haptics.shinraTensei();
    this.cameraShake = Math.max(this.cameraShake, isPerfect ? 1.05 : 0.88);
    this.flashImpactLight(strikeX, arcY + 0.6, strikeZ, cMid, isPerfect ? 48 : 36);

    // Wide Susanoo burst cleave arcs
    this.spawnSlashArc(strikeX, arcY, strikeZ, this.playerYaw, 0.08, cDark, 4.4 * stageScale);
    this.spawnSlashArc(strikeX, arcY + 0.15, strikeZ, this.playerYaw + 0.42, -0.08, cMid, 4.0 * stageScale);
    this.spawnSlashArc(strikeX, arcY - 0.12, strikeZ, this.playerYaw - 0.35, 0.14, cBright, 3.5 * stageScale);

    // Huge ground shockwave & chakra dome
    this.spawnShockRing(strikeX, 0.25, strikeZ, cDark, 13.8 * stageScale, 0.58, 0.95);
    this.spawnShockRing(strikeX, 0.45, strikeZ, cMid, 11.0 * stageScale, 0.48, 0.92);
    this.spawnShockRing(strikeX, 0.85, strikeZ, cBright, 8.4 * stageScale, 0.36, 0.92);
    this.spawnSphereShock(strikeX, 1.35 * stageScale, strikeZ, cMid, 6.2 * stageScale, 0.44, 0.48);
    this.skillParticles.spawn('tsukuyomi_wave', strikeX, 0.8, strikeZ, isPerfect ? 280 : 210, 1.5 * stageScale);
    this.spawnGroundMark(strikeX, strikeZ, 'rinnegan_crack', 6.4 * stageScale, 10.0 * stageScale, 0.92, 4.2);
    this.spawnGroundMark(strikeX, strikeZ, 'crack', 6.0 * stageScale, 9.4 * stageScale, 0.85, 4.0);
    this.spawnStoneDebris(strikeX, strikeZ, isPerfect ? 16 : 10, 10.5 * stageScale, 8.2);

    this.spawnSusanooSlashWave(strikeX, Math.max(1.25, arcY * 0.65), strikeZ, fx, fz, susanoo.stage, 2);

    const sweepRadius = isPerfect ? 12.8 : 9.6;
    const baseDamage = isPerfect ? 115 : 90;
    for (const enemy of this.enemies) {
      if (enemy.isDying || enemy.hp <= 0) continue;
      _tempVecA.subVectors(enemy.pos, this.playerPos);
      _tempVecA.y = 0;
      const dist = _tempVecA.length();
      if (dist <= sweepRadius && Math.abs(enemy.pos.y) < 5.5) {
        if (_tempVecA.lengthSq() < 0.001) {
          _tempVecA.set(fx, 0, fz);
        }
        _tempVecA.normalize();
        const dotFwd = _tempVecA.x * fx + _tempVecA.z * fz;
        if (dotFwd > -0.45 || dist < 4.6 * stageScale) {
          const knockSpeed = isPerfect ? 26.0 : 22.0;
          this.damageEnemy(
            enemy,
            baseDamage,
            _tempVecA.x * knockSpeed,
            _tempVecA.z * knockSpeed,
            true,
            false
          );
          enemy.stunTimer = Math.max(enemy.stunTimer, isPerfect ? 1.2 : 0.95);
          this.spawnDamagePopup(
            enemy.pos,
            baseDamage,
            (enemy.isBoss ? 2.6 : 2.25) * CHARACTER_WORLD_SCALE
          );
          this.spawnSparks(enemy.pos, cSpark, 10, 12, 11);
        }
      }
    }
  }

  private spawnSusanooSlashWave(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirZ: number,
    stage: SusanooStage,
    comboStep: number
  ) {
    const isItachi = this.isItachi;
    const isPerfect = stage === 'perfect';
    const isBlueStage = !isItachi && (stage === 'ribcage' || stage === 'armored' || stage === 'muscular' || isPerfect);
    const scale = isPerfect ? 1.85 : 1.15;
    const geo = new THREE.RingGeometry(0.95 * scale, 1.82 * scale, 28, 1, -Math.PI * 0.44, Math.PI * 0.88);
    const waveColor = isItachi
      ? comboStep === 2
        ? 0xfdba74
        : 0xf97316
      : isBlueStage
        ? comboStep === 2
          ? 0x93c5fd
          : 0x2563eb
        : comboStep === 2
          ? 0xe9d5ff
          : 0xa855f7;
    const mat = new THREE.MeshBasicMaterial({
      color: waveColor,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const yaw = Math.atan2(dirX, dirZ);
    mesh.position.set(originX, originY, originZ);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = yaw;
    mesh.rotation.x = Math.PI * 0.5;
    mesh.rotation.z = comboStep === 0 ? -0.45 : comboStep === 1 ? 0.45 : 0;
    mesh.renderOrder = 25;
    this.scene.add(mesh);

    const speed = isPerfect ? 34 : 26;
    this.susanooSlashWaves.push({
      mesh,
      mat,
      pos: new THREE.Vector3(originX, originY, originZ),
      vel: new THREE.Vector3(dirX * speed, 0, dirZ * speed),
      life: 0,
      maxLife: isPerfect ? 0.92 : 0.72,
      damage: isPerfect ? 54 : 36,
      accentColor: isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xa855f7,
      hitIds: new Set<string>(),
    });
  }

  private triggerSusanooComboStrike(
    fx: number,
    fz: number
  ): { active: boolean; reachBonus: number; damageBonus: number; kbBonus: number } {
    const susanoo = this.activeSusanoo;
    if (!susanoo || susanoo.phase === 'vanishing') {
      return { active: false, reachBonus: 0, damageBonus: 0, kbBonus: 0 };
    }

    susanoo.comboStep = (susanoo.comboStep + 1) % 3;
    const step = susanoo.comboStep;
    susanoo.slashSweepDuration = susanoo.stage === 'perfect' ? 0.46 : 0.42;
    susanoo.slashSweepTimer = susanoo.slashSweepDuration;

    const isItachi = this.isItachi;
    const isPerfect = susanoo.stage === 'perfect';
    const isRibcage = susanoo.stage === 'ribcage';
    const isBlueStage = !isItachi && (isRibcage || susanoo.stage === 'armored' || susanoo.stage === 'muscular' || isPerfect);
    const scale = isPerfect ? 1.55 : 1.05;
    const forwardDist = isPerfect ? 4.4 : 2.9;
    const arcX = this.playerPos.x + fx * forwardDist;
    const arcZ = this.playerPos.z + fz * forwardDist;
    const arcY = isPerfect ? 3.8 : isRibcage ? 1.85 : 2.15;

    const cDark = isItachi ? 0x9a3412 : isBlueStage ? 0x1e3a8a : 0x7e22ce;
    const cMid = isItachi ? 0xea580c : isBlueStage ? 0x1d4ed8 : 0xa855f7;
    const cBright = isItachi ? 0xfdba74 : isBlueStage ? 0x60a5fa : 0xe9d5ff;
    const cSpark = isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xc084fc;

    const rollAngle = step === 0 ? -0.48 : step === 1 ? 0.48 : 0.04;
    this.spawnSlashArc(arcX, arcY, arcZ, this.playerYaw, rollAngle, cDark, 2.75 * scale);
    this.spawnSlashArc(arcX, arcY + 0.14, arcZ, this.playerYaw + (step === 1 ? -0.25 : 0.25), -rollAngle * 0.65, cMid, 2.35 * scale);
    if (step === 2) {
      this.spawnSlashArc(arcX, arcY + 0.22, arcZ, this.playerYaw, -0.52, cBright, 2.55 * scale);
      this.spawnShockRing(arcX, 0.24, arcZ, cMid, 7.6 * scale, 0.38, 0.88);
      this.cameraShake = Math.max(this.cameraShake, isPerfect ? 0.56 : 0.34);
    } else {
      this.spawnShockRing(arcX, 0.22, arcZ, cDark, 5.4 * scale, 0.3, 0.78);
      this.cameraShake = Math.max(this.cameraShake, isPerfect ? 0.38 : 0.24);
    }

    this.spawnSparks(_tempVecB.set(arcX, arcY * 0.65, arcZ), cSpark, isPerfect ? 12 : 8, 12, 10);
    this.flashImpactLight(arcX, arcY, arcZ, cMid, isPerfect ? 28 : 18);

    // Fire advancing crescent chakra waves across all Susanoo stages
    this.spawnSusanooSlashWave(arcX, Math.max(1.2, arcY * 0.55), arcZ, fx, fz, susanoo.stage, step);
    if (step === 2 && isPerfect) {
      // Crossed twin crescent wave finisher for Perfect Susanoo Hit 3
      const spreadYaw = this.playerYaw + 0.14;
      const spreadYaw2 = this.playerYaw - 0.14;
      this.spawnSusanooSlashWave(arcX, Math.max(1.3, arcY * 0.65), arcZ, Math.sin(spreadYaw), Math.cos(spreadYaw), susanoo.stage, 0);
      this.spawnSusanooSlashWave(arcX, Math.max(1.3, arcY * 0.65), arcZ, Math.sin(spreadYaw2), Math.cos(spreadYaw2), susanoo.stage, 1);
    }

    if (isPerfect) {
      return { active: true, reachBonus: 5.4, damageBonus: 42 + (step === 2 ? 18 : 0), kbBonus: 9.5 };
    }
    return { active: true, reachBonus: 3.4, damageBonus: 26 + (step === 2 ? 12 : 0), kbBonus: 6.5 };
  }

  private disposeActiveSusanoo() {
    if (!this.activeSusanoo) return;
    this.activeSusanoo.rig.root.parent?.remove(this.activeSusanoo.rig.root);
    this.activeSusanoo.rig.dispose();
    this.scene.remove(this.activeSusanoo.groundRingMesh);
    this.activeSusanoo.groundRingMesh.geometry.dispose();
    this.activeSusanoo.groundRingMat.dispose();
    this.activeSusanoo = null;
  }

  private updateSusanoo(dt: number, elapsed: number) {
    const susanoo = this.activeSusanoo;
    if (!susanoo) return;

    const isItachi = this.isItachi;
    const isBlueStage = !isItachi && (susanoo.stage === 'ribcage' || susanoo.stage === 'armored' || susanoo.stage === 'muscular' || susanoo.stage === 'perfect');
    const cSpark = isItachi ? 0xf97316 : isBlueStage ? 0x2563eb : 0xc084fc;
    const cRing = isItachi ? 0x9a3412 : isBlueStage ? 0x1e3a8a : 0x7e22ce;

    susanoo.phaseTimer += dt;
    susanoo.emberTimer += dt;

    if (susanoo.slashSweepTimer > 0) {
      susanoo.slashSweepTimer = Math.max(0, susanoo.slashSweepTimer - dt);
    }

    const arenaMaxR = this.getActiveArenaRadius() - 1.3;

    if (susanoo.phase === 'surging') {
      const stepDist = susanoo.surgeSpeed * dt;
      this.playerPos.x += susanoo.surgeDirX * stepDist;
      this.playerPos.z += susanoo.surgeDirZ * stepDist;

      const rDist = Math.hypot(this.playerPos.x, this.playerPos.z);
      if (rDist > arenaMaxR) {
        const s = arenaMaxR / rDist;
        this.playerPos.x *= s;
        this.playerPos.z *= s;
      }

      if (susanoo.emberTimer >= 0.045) {
        susanoo.emberTimer = 0;
        this.spawnSparks(this.playerPos, cSpark, 8, 9, 8);
      }

      const nearest = this.findNearestEnemy(5.2);
      if (nearest || susanoo.phaseTimer >= susanoo.surgeDuration) {
        this.triggerSusanooStageBurst(susanoo);
        susanoo.phase = 'active';
        susanoo.phaseTimer = 0;
      }
    } else if (susanoo.phase === 'active') {
      if (susanoo.emberTimer >= 0.14) {
        susanoo.emberTimer = 0;
        this.spawnSparks(this.playerPos, cSpark, 6, 8, 7);
        if (Math.random() < 0.48) {
          this.spawnShockRing(
            this.playerPos.x,
            0.22,
            this.playerPos.z,
            cRing,
            susanoo.stage === 'perfect' ? 8.2 : 5.4,
            0.52,
            0.56
          );
        }
      }
      if (susanoo.phaseTimer >= susanoo.activeDuration) {
        susanoo.phase = 'vanishing';
        susanoo.phaseTimer = 0;
        soundEngine.playRinneganPush();
        this.skillParticles.spawn('tsukuyomi_wave', this.playerPos.x, 1.4, this.playerPos.z, 110, 1.25);
      }
    } else {
      const p = THREE.MathUtils.clamp(susanoo.phaseTimer / susanoo.vanishDuration, 0, 1);
      susanoo.rig.setOpacity(susanoo.rig.baseOpacity * (1 - p));
      susanoo.groundRingMat.opacity = 0.72 * (1 - p);
      if (susanoo.phaseTimer >= susanoo.vanishDuration) {
        this.disposeActiveSusanoo();
        return;
      }
    }

    // Susanoo smoothly envelops/carries Madara at (playerPos, playerYaw)
    susanoo.rig.root.position.copy(this.playerPos);
    susanoo.rig.root.rotation.set(0, this.playerYaw, 0);

    susanoo.groundRingMesh.position.set(this.playerPos.x, 0.04, this.playerPos.z);
    const ringScale = 1.0 + Math.sin(elapsed * 6.5) * 0.06;
    susanoo.groundRingMesh.scale.setScalar(ringScale);
    if (susanoo.phase !== 'vanishing') {
      susanoo.groundRingMat.opacity = 0.62 + Math.sin(elapsed * 8.0) * 0.12;
    }

    const horizSpeed =
      susanoo.phase === 'surging'
        ? susanoo.surgeSpeed
        : Math.hypot(this.moveVelX + this.playerVel.x, this.moveVelZ + this.playerVel.z);
    const speedRatio = THREE.MathUtils.clamp(horizSpeed / 15.6, 0, 1);
    const targetLean = susanoo.phase === 'surging' ? 0.25 : speedRatio * 0.145;
    susanoo.currentLean = THREE.MathUtils.damp(susanoo.currentLean, targetLean, 12, dt);

    if (speedRatio > 0.03) {
      susanoo.stridePhase += dt * (4.2 + speedRatio * 7.5);
    }

    let slashProgress = 0;
    if (susanoo.slashSweepTimer > 0) {
      slashProgress = THREE.MathUtils.clamp(
        1 - susanoo.slashSweepTimer / susanoo.slashSweepDuration,
        0,
        1
      );
    }

    const intensity =
      susanoo.phase === 'surging' ? 1.3 : susanoo.phase === 'vanishing' ? 0.55 : 1.0;
    susanoo.rig.update(
      dt,
      elapsed,
      susanoo.currentLean,
      slashProgress,
      intensity,
      susanoo.stridePhase,
      speedRatio,
      susanoo.comboStep
    );

    const footImpact = susanoo.rig.consumeFootstepImpact?.() ?? 0;
    if (footImpact > 0 && susanoo.phase === 'active') {
      this.cameraShake = Math.max(this.cameraShake, 0.085 * footImpact);
      this.spawnShockRing(this.playerPos.x, 0.08, this.playerPos.z, cRing, 3.8, 0.32, 0.38);
    }

    // Sync Madara's world pilot anchor (chest core in Stages 1–2, forehead crystal in Stage 3)
    susanoo.rig.root.updateMatrixWorld(true);
    susanoo.rig.pilotAnchor.getWorldPosition(susanoo.pilotWorldPos);

    // Smoothly pull the chase camera back according to Susanoo scale so full body & legs stay framed
    const targetCamDistOffset =
      susanoo.phase === 'vanishing'
        ? 0
        : susanoo.stage === 'perfect'
          ? 15.4
          : susanoo.stage === 'armored'
            ? 4.8
            : 4.2;
    const targetCamLookYOffset =
      susanoo.phase === 'vanishing'
        ? 0
        : susanoo.stage === 'perfect'
          ? 4.6
          : susanoo.stage === 'armored'
            ? 2.15
            : 1.25;
    this.susanooCamDistOffset = THREE.MathUtils.damp(this.susanooCamDistOffset, targetCamDistOffset, 5.5, dt);
    this.susanooCamLookYOffset = THREE.MathUtils.damp(this.susanooCamLookYOffset, targetCamLookYOffset, 5.5, dt);
  }

  private spawnLightningBolt(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    isPurple: boolean,
    allowBranch = true
  ) {
    const maxBolts = this.performanceTier >= 2 ? 26 : 42;
    while (this.lightningBolts.length >= maxBolts) {
      const oldest = this.lightningBolts.shift();
      if (oldest) {
        this.scene.remove(oldest.line);
        oldest.line.geometry.dispose();
        oldest.mat.dispose();
      }
    }
    const segments = this.performanceTier >= 3 ? 9 : 13;
    const positions = new Float32Array((segments + 1) * 3);
    const arcLen = startPos.distanceTo(endPos);
    const amp = THREE.MathUtils.clamp(arcLen * 0.24, 0.45, 1.55);

    let branchOrigin: THREE.Vector3 | null = null;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const envelope = i === 0 || i === segments ? 0 : Math.sin(t * Math.PI);
      const px = THREE.MathUtils.lerp(startPos.x, endPos.x, t) + (Math.random() - 0.5) * amp * envelope * 2.0;
      const py = THREE.MathUtils.lerp(startPos.y, endPos.y, t) + (Math.random() - 0.5) * amp * envelope * 0.95;
      const pz = THREE.MathUtils.lerp(startPos.z, endPos.z, t) + (Math.random() - 0.5) * amp * envelope * 2.0;
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      if (allowBranch && i === Math.floor(segments * 0.45)) {
        branchOrigin = new THREE.Vector3(px, py, pz);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colorHex = isPurple
      ? Math.random() > 0.45
        ? 0xe9d5ff
        : 0xa855f7
      : Math.random() > 0.55
        ? 0xe0f2fe
        : Math.random() > 0.35
          ? 0x38bdf8
          : 0x0ea5e9;

    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.lightningBolts.push({
      line,
      mat,
      life: 0,
      maxLife: 0.14 + Math.random() * 0.08,
    });

    if (allowBranch && branchOrigin && arcLen > 0.8 && Math.random() < 0.72) {
      const forkEnd = new THREE.Vector3(
        branchOrigin.x + (Math.random() - 0.5) * arcLen * 0.85,
        Math.max(0.12, branchOrigin.y + (Math.random() - 0.55) * arcLen * 0.55),
        branchOrigin.z + (Math.random() - 0.5) * arcLen * 0.85
      );
      this.spawnLightningBolt(branchOrigin, forkEnd, isPurple, false);
    }
  }

  private spawnGedoLightningVolley(center: THREE.Vector3, count: number, aoeRadius: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.6 + Math.random() * (aoeRadius - 1.6);
      const gx = center.x + Math.cos(angle) * dist;
      const gz = center.z + Math.sin(angle) * dist;

      // Alternate between sky/statue shoulder origin and dramatic zigzag strikes into the ground
      const fromStatue = i % 2 === 0;
      const origin = fromStatue
        ? new THREE.Vector3(
            center.x + (Math.random() - 0.5) * 3.8,
            6.2 + Math.random() * 2.8,
            center.z + (Math.random() - 0.5) * 2.2
          )
        : new THREE.Vector3(gx + (Math.random() - 0.5) * 2.4, 12.5 + Math.random() * 4.5, gz + (Math.random() - 0.5) * 2.4);

      const impact = new THREE.Vector3(gx, 0.08, gz);
      const isPurple = i % 2 === 0;
      this.spawnLightningBolt(origin, impact, isPurple);

      if (i % 3 === 0) {
        this.spawnShockRing(gx, 0.14, gz, isPurple ? 0xc084fc : 0x38bdf8, 2.3, 0.24, 0.72);
      }
    }
  }

  private spawnDamagePopup(pos: THREE.Vector3, amount: number, yOffset = 2.25 * CHARACTER_WORLD_SCALE) {
    const rounded = Math.max(1, Math.round(amount));
    let tex = this.damageNumberTextures.get(rounded);
    if (!tex) {
      tex = createDamageNumberTexture(rounded);
      this.damageNumberTextures.set(rounded, tex);
    }

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      pos.x + (Math.random() - 0.5) * 0.45,
      pos.y + yOffset,
      pos.z + (Math.random() - 0.5) * 0.45
    );
    sprite.scale.set(1.55, 0.78, 1);
    sprite.renderOrder = 25;
    this.scene.add(sprite);

    this.damagePopups.push({
      sprite,
      mat,
      velY: 1.85,
      life: 0,
      maxLife: 0.85,
    });
  }

  private updateGedoMazo(dt: number, elapsed: number) {
    const gedo = this.activeGedo;
    if (!gedo) return;

    gedo.phaseTimer += dt;
    gedo.smokeTimer += dt;

    if (gedo.phase === 'seal') {
      gedo.rig.root.visible = false;
      if (gedo.sealMesh) gedo.sealMesh.rotation.z += dt * 0.45;
      if (gedo.smokeTimer >= 0.14) {
        gedo.smokeTimer = 0;
        const a = Math.random() * Math.PI * 2;
        const r = 1.6 + Math.random() * 4.0;
        this.spawnSmokePuff(
          gedo.pos.x + Math.cos(a) * r,
          0.35 + Math.random() * 0.85,
          gedo.pos.z + Math.sin(a) * r,
          0xf8fafc,
          1.35,
          4.0,
          0.95,
          0.66
        );
      }
      if (gedo.phaseTimer >= gedo.sealDuration) {
        gedo.phase = 'emerging';
        gedo.phaseTimer = 0;
        gedo.smokeTimer = 0;
        gedo.lightningTimer = 0;
        gedo.rig.root.visible = true;
        this.cameraShake = Math.max(this.cameraShake, 0.9);
        soundEngine.playGedoSummon();
        soundEngine.playGedoLightning();
        this.flashImpactLight(gedo.pos.x, 4.8, gedo.pos.z, 0xc084fc, 30);
        this.spawnGedoLightningVolley(gedo.pos, 10, 11.5);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const r = 1.0 + Math.random() * 3.8;
          this.spawnSmokePuff(
            gedo.pos.x + Math.cos(a) * r,
            0.4 + Math.random() * 1.4,
            gedo.pos.z + Math.sin(a) * r,
            0xf8fafc,
            1.6,
            4.6,
            1.2,
            0.8
          );
        }
      }
    } else if (gedo.phase === 'emerging') {
      const p = THREE.MathUtils.clamp(gedo.phaseTimer / gedo.emergeDuration, 0, 1);
      const eased = p * p * (3 - 2 * p);
      gedo.rig.root.position.y = THREE.MathUtils.lerp(-11.4, 0, eased);
      if (gedo.sealMesh) gedo.sealMesh.rotation.z += dt * 0.35;
      this.cameraShake = Math.max(this.cameraShake, 0.36);
      gedo.rig.update(dt, elapsed, 0.9, 'emerging', gedo.phaseTimer);

      if (gedo.smokeTimer >= 0.09) {
        gedo.smokeTimer = 0;
        const a = Math.random() * Math.PI * 2;
        const r = 1.2 + Math.random() * 3.8;
        this.spawnSmokePuff(
          gedo.pos.x + Math.cos(a) * r,
          0.35 + Math.random() * 1.1,
          gedo.pos.z + Math.sin(a) * r,
          0xf1f5f9,
          1.4,
          4.2,
          1.1,
          0.74
        );
      }
      gedo.lightningTimer -= dt;
      if (gedo.lightningTimer <= 0) {
        gedo.lightningTimer = 0.16;
        this.spawnGedoLightningVolley(gedo.pos, 3, 11.5);
      }

      if (gedo.phaseTimer >= gedo.emergeDuration) {
        gedo.phase = 'active';
        gedo.phaseTimer = 0;
        gedo.dotTimer = 0.05;
        gedo.lightningTimer = 0;
        gedo.roared = false;
        gedo.rig.root.position.y = 0;
        this.cameraShake = Math.max(this.cameraShake, 0.8);
        soundEngine.playGedoLightning();
        this.flashImpactLight(gedo.pos.x, 5.5, gedo.pos.z, 0xc084fc, 34);
        this.spawnShockRing(gedo.pos.x, 0.25, gedo.pos.z, 0xa855f7, 13.5, 0.6, 0.9);
        this.spawnShockRing(gedo.pos.x, 0.35, gedo.pos.z, 0x38bdf8, 13.0, 0.52, 0.85);
        this.spawnGedoLightningVolley(gedo.pos, 16, 12.5);
      }
    } else if (gedo.phase === 'active') {
      gedo.rig.root.position.y = 0;
      gedo.rig.update(dt, elapsed, 1.15, 'active', gedo.phaseTimer);
      if (gedo.sealMesh) gedo.sealMesh.rotation.z += dt * 0.22;

      if (gedo.phaseTimer >= 2.8 && !gedo.roared) {
        gedo.roared = true;
        soundEngine.playGedoSummon();
        soundEngine.playGedoLightning();
        this.cameraShake = Math.max(this.cameraShake, 0.95);
        this.flashImpactLight(gedo.pos.x, 7.2, gedo.pos.z, 0xd8b4fe, 38);
        this.spawnShockRing(gedo.pos.x, 0.35, gedo.pos.z, 0xc084fc, 15.0, 0.65, 0.95);
        this.spawnShockRing(gedo.pos.x, 0.45, gedo.pos.z, 0x38bdf8, 13.5, 0.55, 0.85);
        this.spawnGedoLightningVolley(gedo.pos, 14, 12.5);
      }

      // Dense continuous purple & electric-blue lightning strikes inside the wide AOE
      gedo.lightningTimer -= dt;
      if (gedo.lightningTimer <= 0) {
        gedo.lightningTimer = 0.075;
        this.spawnGedoLightningVolley(gedo.pos, 3, 12.5);
      }

      // Deal Damage Over Time (DOT) every 0.5 seconds + Purple Damage Numbers + Stun + Knockback (ZERO self-damage!)
      gedo.dotTimer -= dt;
      if (gedo.dotTimer <= 0) {
        gedo.dotTimer += 0.5;
        const aoeRadius = 12.5;
        const dotDamage = 18;
        let struckAny = false;

        for (const enemy of this.enemies) {
          if (enemy.isDying || enemy.hp <= 0) continue;
          _tempVecA.subVectors(enemy.pos, gedo.pos);
          _tempVecA.y = 0;
          const dist = _tempVecA.length();
          if (dist <= aoeRadius) {
            struckAny = true;
            if (_tempVecA.lengthSq() < 0.001) _tempVecA.set(1, 0, 0);
            _tempVecA.normalize();

            // Direct lightning bolt hitting each enemy inside AOE
            this.spawnLightningBolt(
              new THREE.Vector3(gedo.pos.x, 6.8, gedo.pos.z),
              new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.15, enemy.pos.z),
              Math.random() > 0.45
            );

            // Purple damage popup above enemy head + stun + outward knockback away from Gedo Mazo
            this.damageEnemy(enemy, dotDamage, _tempVecA.x * 9.5, _tempVecA.z * 9.5, false);
            enemy.stunTimer = Math.max(enemy.stunTimer, 0.56);
            this.spawnDamagePopup(
              enemy.pos,
              dotDamage,
              (enemy.isBoss ? 2.6 : 2.25) * CHARACTER_WORLD_SCALE
            );
            this.spawnSparks(enemy.pos, Math.random() > 0.45 ? 0xc084fc : 0x38bdf8, 6, 8, 9);
          }
        }

        if (struckAny) {
          soundEngine.playGedoLightning();
          this.cameraShake = Math.max(this.cameraShake, 0.34);
          this.flashImpactLight(gedo.pos.x, 5.2, gedo.pos.z, 0x38bdf8, 18);
        } else if (Math.random() < 0.45) {
          soundEngine.playGedoLightning();
        }
      }

      if (gedo.phaseTimer >= gedo.activeDuration) {
        gedo.phase = 'vanishing';
        gedo.phaseTimer = 0;
        gedo.smokeTimer = 0;
        soundEngine.playGedoSummon();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = 1.0 + Math.random() * 3.8;
          this.spawnSmokePuff(
            gedo.pos.x + Math.cos(a) * r,
            0.6 + Math.random() * 1.5,
            gedo.pos.z + Math.sin(a) * r,
            0xf8fafc,
            1.6,
            4.6,
            1.25,
            0.82
          );
        }
      }
    } else {
      // Vanishing phase: sink back underground in white smoke and fade out summoning seal
      const p = THREE.MathUtils.clamp(gedo.phaseTimer / gedo.vanishDuration, 0, 1);
      const eased = p * p;
      gedo.rig.root.position.y = THREE.MathUtils.lerp(0, -12.0, eased);
      if (gedo.sealMat) gedo.sealMat.opacity = Math.max(0, 0.96 * (1 - p));
      gedo.rig.update(dt, elapsed, Math.max(0.15, 1 - p), 'vanishing', gedo.phaseTimer);

      if (gedo.smokeTimer >= 0.08) {
        gedo.smokeTimer = 0;
        const a = Math.random() * Math.PI * 2;
        const r = 0.8 + Math.random() * 3.5;
        this.spawnSmokePuff(
          gedo.pos.x + Math.cos(a) * r,
          0.35 + Math.random() * 1.2,
          gedo.pos.z + Math.sin(a) * r,
          0xe2e8f0,
          1.4,
          4.1,
          1.05,
          0.72
        );
      }

      if (gedo.phaseTimer >= gedo.vanishDuration) {
        this.disposeActiveGedo();
      }
    }
  }

  private releaseShockRing(r: ShockRing) {
    r.mesh.visible = false;
    if (this.shockRingPool.length < 48) {
      this.shockRingPool.push(r);
    } else {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
  }

  private releaseSmokePuff(sm: SmokePuff) {
    sm.sprite.visible = false;
    if (this.smokePuffPool.length < 56) {
      this.smokePuffPool.push(sm);
    } else {
      this.scene.remove(sm.sprite);
      sm.mat.dispose();
    }
  }

  private releaseSpark(sp: HitSpark) {
    sp.mesh.visible = false;
    if (this.sparkPool.length < 80) {
      this.sparkPool.push(sp);
    } else {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
  }

  private spawnShockRing(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    maxScale: number,
    maxLife: number,
    baseOpacity = 0.85
  ) {
    const pooled = this.shockRingPool.pop();
    if (pooled) {
      const mat = pooled.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(colorHex);
      mat.opacity = baseOpacity;
      pooled.mesh.position.set(x, y, z);
      pooled.mesh.scale.setScalar(0.5);
      pooled.mesh.visible = true;
      pooled.life = 0;
      pooled.maxLife = maxLife;
      pooled.maxScale = maxScale;
      pooled.baseOpacity = baseOpacity;
      this.shockRings.push(pooled);
      return;
    }

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.shockRings.push({ mesh, life: 0, maxLife, maxScale, baseOpacity });
  }

  private spawnSlashArc(
    x: number,
    y: number,
    z: number,
    yaw: number,
    tiltZ: number,
    colorHex: number,
    scale = 1.3
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.slashArcGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI * 0.42, yaw - 0.85, tiltZ);
    mesh.scale.setScalar(scale);
    this.scene.add(mesh);
    this.slashArcs.push({
      mesh,
      life: 0,
      maxLife: 0.24,
      startRoll: mesh.rotation.y,
      spinSpeed: 8.5,
      baseOpacity: 0.92,
    });
  }

  private spawnDarkVortex(x: number, y: number, z: number, maxScale: number, maxLife: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const rings: THREE.Mesh[] = [];
    const configs = [
      { color: 0x090b12, opacity: 0.88, rx: 0.35, ry: 0.1, scale: 0.9, additive: false },
      { color: 0x334155, opacity: 0.72, rx: -0.45, ry: 0.75, scale: 1.05, additive: false },
      { color: 0x6366f1, opacity: 0.65, rx: 0.85, ry: -0.5, scale: 0.82, additive: true },
    ];
    for (const c of configs) {
      const mat = new THREE.MeshBasicMaterial({
        color: c.color,
        transparent: true,
        opacity: c.opacity,
        depthWrite: false,
        blending: c.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const r = new THREE.Mesh(this.vortexRingGeo, mat);
      r.rotation.set(c.rx, c.ry, 0);
      r.scale.setScalar(c.scale);
      group.add(r);
      rings.push(r);
    }
    this.scene.add(group);
    this.darkVortices.push({ group, rings, life: 0, maxLife, maxScale });
  }

  private spawnChakraChain(x: number, y: number, z: number, yaw: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.98,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const c1 = new THREE.Mesh(this.chainGeo, coreMat);
    c1.rotation.set(-0.08, 0.08, 0);
    const c2 = new THREE.Mesh(this.chainGeo, haloMat);
    c2.rotation.set(0.06, -0.09, 0);
    c2.scale.set(2.2, 2.2, 1.04);

    group.add(c1, c2);
    this.scene.add(group);
    this.chakraChains.push({ group, coreMat, haloMat, life: 0, maxLife: 0.30 });
  }

  private spawnSphereShock(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    maxScale: number,
    maxLife: number,
    baseOpacity = 0.45
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.sphereShockGeo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.sphereShocks.push({ mesh, life: 0, maxLife, maxScale, baseOpacity });
  }

  private spawnFireBlastDomeShock(
    x: number,
    y: number,
    z: number,
    maxScale: number,
    maxLife: number
  ) {
    const shaderMat = createFireBlastDomeMaterial(Math.random() * 100);
    const mesh = new THREE.Mesh(this.fireVolumeGeo, shaderMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.sphereShocks.push({
      mesh,
      life: 0,
      maxLife,
      maxScale,
      baseOpacity: 1.0,
      shaderMat,
    });
  }

  private spawnSmokePuff(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    startScale: number,
    endScale: number,
    maxLife: number,
    baseOpacity = 0.55,
    additive = false,
    customVel?: THREE.Vector3
  ) {
    const effectiveParticleScale = this.particleDensityScale * this.governorParticleMult;
    if (effectiveParticleScale < 0.99 && Math.random() > effectiveParticleScale) {
      return;
    }
    const maxPuffs = Math.max(14, Math.round(42 * effectiveParticleScale));
    if (this.smokePuffs.length >= maxPuffs) {
      const oldest = this.smokePuffs.shift();
      if (oldest) {
        this.releaseSmokePuff(oldest);
      }
    }

    const velX = customVel ? customVel.x : (Math.random() - 0.5) * 2.2;
    const velY = customVel ? customVel.y : 1.3 + Math.random() * 1.4;
    const velZ = customVel ? customVel.z : (Math.random() - 0.5) * 2.2;

    const pooled = this.smokePuffPool.pop();
    if (pooled) {
      pooled.mat.map = additive ? this.fireFlameTex : this.smokeCloudTex;
      pooled.mat.color.setHex(colorHex);
      pooled.mat.opacity = baseOpacity;
      pooled.mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      pooled.mat.rotation = Math.random() * Math.PI * 2;
      pooled.mat.needsUpdate = true;
      pooled.sprite.position.set(x, y, z);
      pooled.sprite.scale.set(startScale, startScale, 1);
      pooled.sprite.visible = true;
      pooled.vel.set(velX, velY, velZ);
      pooled.rotVel = (Math.random() - 0.5) * (additive ? 4.5 : 1.8);
      pooled.life = 0;
      pooled.maxLife = maxLife;
      pooled.startScale = startScale;
      pooled.endScale = endScale;
      pooled.baseOpacity = baseOpacity;
      this.smokePuffs.push(pooled);
      return;
    }

    const mat = new THREE.SpriteMaterial({
      map: additive ? this.fireFlameTex : this.smokeCloudTex,
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation: Math.random() * Math.PI * 2,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(startScale, startScale, 1);
    this.scene.add(sprite);
    this.smokePuffs.push({
      sprite,
      mat,
      vel: new THREE.Vector3(velX, velY, velZ),
      rotVel: (Math.random() - 0.5) * (additive ? 4.5 : 1.8),
      life: 0,
      maxLife,
      startScale,
      endScale,
      baseOpacity,
    });
  }

  private spawnSingleSpark(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife = 0.45,
    gravity = 14
  ) {
    const pooled = this.sparkPool.pop();
    if (pooled) {
      const mat = pooled.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(colorHex);
      mat.opacity = 1;
      mat.blending = colorHex === 0x09090b ? THREE.NormalBlending : THREE.AdditiveBlending;
      pooled.mesh.position.set(x, y, z);
      pooled.mesh.scale.setScalar(1.2);
      pooled.mesh.visible = true;
      pooled.vel.set(vx, vy, vz);
      pooled.life = 0;
      pooled.maxLife = maxLife;
      pooled.gravity = gravity;
      this.sparks.push(pooled);
      return;
    }

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: colorHex === 0x09090b ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.sparkGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(1.2);
    this.scene.add(mesh);
    this.sparks.push({
      mesh,
      vel: new THREE.Vector3(vx, vy, vz),
      life: 0,
      maxLife,
      gravity,
    });
  }

  private spawnSparks(pos: THREE.Vector3, colorHex: number, count: number, spread = 9, gravity = 14) {
    const effectiveScale = this.particleDensityScale * this.governorParticleMult;
    const scaledCount = Math.max(1, Math.round(count * effectiveScale));
    const maxSparks = Math.max(30, Math.round(72 * effectiveScale));
    while (this.sparks.length + scaledCount > maxSparks && this.sparks.length > 0) {
      const oldest = this.sparks.shift();
      if (oldest) {
        this.releaseSpark(oldest);
      }
    }
    for (let i = 0; i < scaledCount; i++) {
      this.spawnSingleSpark(
        pos.x,
        pos.y + 1.1,
        pos.z,
        colorHex,
        (Math.random() - 0.5) * spread,
        2.8 + Math.random() * 5.2,
        (Math.random() - 0.5) * spread,
        0.44 + Math.random() * 0.24,
        gravity
      );
    }
  }

  private flashImpactLight(x: number, y: number, z: number, colorHex: number, intensity: number) {
    this.impactLight.position.set(x, y, z);
    this.impactLight.color.setHex(colorHex);
    this.impactLight.intensity = intensity;
    this.impactLight.visible = intensity > 0.04;
  }

  private spawnGroundMark(
    x: number,
    z: number,
    kind: 'scorch' | 'crack' | 'rinnegan_crack' | 'kamui',
    diameter: number,
    maxLife: number,
    baseOpacity = 0.88,
    glowDuration = 0
  ) {
    const arenaR = this.getActiveArenaRadius();
    if (Math.abs(x) > arenaR - 0.2 || Math.abs(z) > arenaR - 0.2) return;

    const maxMarks = this.performanceTier >= 2 ? 18 : 26;
    while (this.groundMarks.length >= maxMarks) {
      const oldest = this.groundMarks.shift();
      if (oldest) {
        this.scene.remove(oldest.group);
        oldest.baseMat.dispose();
        oldest.glowMat?.dispose();
      }
    }

    this.groundMarkLayerIndex = (this.groundMarkLayerIndex + 1) % 16;
    const layerY = 0.014 + this.groundMarkLayerIndex * 0.0018;

    const group = new THREE.Group();
    group.position.set(x, layerY, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    group.scale.setScalar(diameter * 0.65);

    const baseMap = kind === 'scorch' ? this.scorchTex : kind === 'kamui' ? this.kamuiTex : this.groundCrackTex;
    const baseMat = new THREE.MeshBasicMaterial({
      map: baseMap,
      color: kind === 'kamui' ? 0x6b21a8 : 0xffffff,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const baseMesh = new THREE.Mesh(this.groundDecalGeo, baseMat);
    group.add(baseMesh);

    let glowMat: THREE.MeshBasicMaterial | null = null;
    let glowOpacity = 0;
    if (glowDuration > 0) {
      glowOpacity = kind === 'scorch' ? 0.94 : kind === 'kamui' ? 0.65 : 0.72;
      glowMat = new THREE.MeshBasicMaterial({
        map: kind === 'scorch' ? this.scorchEmberTex : kind === 'kamui' ? this.kamuiTex : this.groundCrackTex,
        color: kind === 'scorch' ? 0xffffff : kind === 'kamui' ? 0xc084fc : 0x38bdf8,
        transparent: true,
        opacity: glowOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const glowMesh = new THREE.Mesh(this.groundDecalGeo, glowMat);
      glowMesh.position.y = 0.002;
      group.add(glowMesh);
    }

    this.scene.add(group);
    this.groundMarks.push({
      group,
      baseMat,
      glowMat,
      life: 0,
      maxLife,
      glowDuration,
      baseOpacity,
      glowOpacity,
      targetScale: diameter,
    });
  }

  private spawnStoneDebris(x: number, z: number, count: number, horizSpeed: number, upSpeed: number) {
    const arenaR = this.getActiveArenaRadius();
    if (Math.abs(x) > arenaR + 0.5 || Math.abs(z) > arenaR + 0.5) return;
    const scaledCount = Math.max(2, Math.round(count * this.particleDensityScale));
    const maxDebris = Math.max(16, Math.round(48 * this.particleDensityScale));

    while (this.groundDebris.length + scaledCount > maxDebris && this.groundDebris.length > 0) {
      const oldest = this.groundDebris.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }

    for (let i = 0; i < scaledCount; i++) {
      const mesh = new THREE.Mesh(this.stoneDebrisGeo, this.stoneDebrisMat);
      mesh.castShadow = !this.isSoftwareGl && this.shadowQuality === 'high';
      const angle = (i / scaledCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.65;
      const rOffset = 0.25 + Math.random() * 0.9;
      mesh.position.set(x + Math.cos(angle) * rOffset, 0.14, z + Math.sin(angle) * rOffset);

      const sx = 0.55 + Math.random() * 0.95;
      const sy = 0.38 + Math.random() * 0.5;
      const sz = 0.55 + Math.random() * 0.95;
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      this.scene.add(mesh);
      const speed = horizSpeed * (0.45 + Math.random() * 0.7);
      this.groundDebris.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * speed, upSpeed * (0.65 + Math.random() * 0.55), Math.sin(angle) * speed),
        rotVel: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        baseScale: new THREE.Vector3(sx, sy, sz),
        life: 0,
        maxLife: 3.4 + Math.random() * 1.4,
        bounced: false,
      });
    }
  }

  private damageEnemy(
    enemy: EnemyEntity,
    amount: number,
    pushX: number,
    pushZ: number,
    heavy: boolean,
    silent = false
  ) {
    if (enemy.isDying || enemy.hp <= 0) return;
    const finalDamage = this.awakeningActive ? Math.round(amount * 1.35) : amount;

    // Auto-trigger Ultimate Cinematic Finisher on the killing blow of the final enemy!
    const otherAlive = this.enemies.some((e) => e !== enemy && !e.isDying && e.hp > 0);
    if (
      !this.finisherState &&
      !this.playerDying &&
      this.phase === 'playing' &&
      this.wave >= this.maxWaves &&
      !otherAlive &&
      enemy.hp - finalDamage <= 0
    ) {
      enemy.hp = Math.max(1, Math.min(enemy.hp, 1));
      enemy.hitFlashTimer = 0.14;
      this.combo += 1;
      this.comboTimer = 3.2;
      this.score += Math.round(finalDamage * (1 + Math.min(this.combo, 15) * 0.1));
      this.spawnSparks(enemy.pos, 0xfef08a, 10, 11, 14);
      this.playUltimateFinisher(enemy, true);
      return;
    }

    enemy.hp = Math.max(0, enemy.hp - finalDamage);
    enemy.vel.x += pushX;
    enemy.vel.z += pushZ;
    enemy.hitFlashTimer = 0.1;

    this.combo += 1;
    this.comboTimer = 3.2;
    this.score += Math.round(finalDamage * (1 + Math.min(this.combo, 15) * 0.1));
    if (!this.awakeningActive) {
      this.awakeningGauge = Math.min(100, this.awakeningGauge + (heavy ? 6.5 : 3.5));
    }

    if (!silent) {
      soundEngine.playHitImpact(heavy);
    }
    this.spawnSparks(enemy.pos, heavy ? 0xff4422 : 0xfef08a, heavy ? 15 : 10, heavy ? 13 : 10, 14);
    this.spawnShockRing(
      enemy.pos.x,
      enemy.pos.y + 1.1,
      enemy.pos.z,
      heavy ? 0xff4500 : 0xfbbf24,
      heavy ? 2.6 : 1.7,
      0.22,
      heavy ? 0.85 : 0.65
    );
    if (heavy) this.cameraShake = Math.max(this.cameraShake, 0.2);
  }

  public playObitoGravityColumns(): boolean {
    if (this.disposed || this.phase !== 'playing' || this.playerDying || this.finisherState || this.obitoGazeActive) {
      return false;
    }
    if (this.obitoGazeCooldown > 0 || !this.isObitoOrTobi) {
      return false;
    }

    const target =
      this.findNearestEnemy(120) ||
      this.enemies.find((e) => !e.isDying && e.hp > 0) ||
      null;
    if (!target) return false;

    this.obitoGazeActive = true;
    this.obitoGazeCooldown = 6.0;

    this.moveVelX = 0;
    this.moveVelZ = 0;
    this.currentMoveSpeed = 0;
    this.playerVel.set(0, 0, 0);
    this.isGuarding = false;
    this.isChargingChakra = false;
    this.guardShieldMesh.visible = false;
    this.chakraChargeRingMesh.visible = false;

    target.vel.set(0, 0, 0);
    target.combatActive = false;
    target.attackWindup = 0;

    const dx = target.pos.x - this.playerPos.x;
    const dz = target.pos.z - this.playerPos.z;
    const distXZ = Math.hypot(dx, dz);
    if (distXZ > 0.02) {
      this.playerYaw = Math.atan2(dx, dz);
      target.yaw = Math.atan2(-dx, -dz);
    }

    const savedCamPos = this.camera.position.clone();
    const savedCamLook = new THREE.Vector3();
    this.camera.getWorldDirection(savedCamLook);
    savedCamLook.add(this.camera.position);

    const reticleGeo = new THREE.RingGeometry(0.9, 1.2, 32);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
    reticleMesh.position.set(target.pos.x, 0.05, target.pos.z);
    this.scene.add(reticleMesh);

    const columns: Array<{ mesh: THREE.Mesh; startPos: THREE.Vector3; targetPos: THREE.Vector3 }> = [];
    const colGeo = new THREE.BoxGeometry(1.8, 7.5, 1.8);
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.85,
      metalness: 0.15,
    });

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const offX = Math.cos(angle) * 1.5;
      const offZ = Math.sin(angle) * 1.5;
      const targetPos = new THREE.Vector3(
        target.pos.x + offX,
        target.pos.y,
        target.pos.z + offZ
      );
      const startPos = new THREE.Vector3(
        targetPos.x,
        targetPos.y + 14 + i * 2.5,
        targetPos.z
      );

      const colMesh = new THREE.Mesh(colGeo, colMat);
      colMesh.position.copy(startPos);
      colMesh.castShadow = true;
      colMesh.receiveShadow = true;
      this.scene.add(colMesh);
      columns.push({ mesh: colMesh, startPos, targetPos });
    }

    this.obitoGravityState = {
      active: true,
      timer: 0,
      stage: 'gaze',
      targetEnemy: target,
      reticleMesh,
      columns,
      savedCamPos,
      savedCamLook,
    };

    soundEngine.playKamuiWarp();
    this.spawnSparks(this.playerPos, 0xa855f7, 18, 12, 16);
    return true;
  }

  private updateObitoGaze(dt: number): void {
    if (!this.obitoGravityState || !this.obitoGravityState.active) return;
    const st = this.obitoGravityState;
    st.timer += dt;

    const target = st.targetEnemy;
    const headPos = new THREE.Vector3(
      this.playerPos.x,
      this.playerPos.y + 1.62,
      this.playerPos.z
    );

    if (st.stage === 'gaze') {
      const targetHead = new THREE.Vector3(
        target.pos.x,
        target.pos.y + 1.1,
        target.pos.z
      );
      this.camera.position.lerp(headPos, dt * 12);
      this.camera.lookAt(targetHead);

      const s = 1 + Math.sin(st.timer * 12) * 0.2;
      st.reticleMesh.scale.set(s, s, s);

      if (st.timer >= 1.0) {
        st.stage = 'dropping';
        st.timer = 0;
        soundEngine.playRinneganPush();
      }
    } else if (st.stage === 'dropping') {
      const dropProg = Math.min(1.0, st.timer / 0.55);
      const easeProg = dropProg * dropProg;

      for (const col of st.columns) {
        col.mesh.position.lerpVectors(col.startPos, col.targetPos, easeProg);
      }

      const targetHead = new THREE.Vector3(
        target.pos.x,
        target.pos.y + 0.8,
        target.pos.z
      );
      this.camera.position.lerp(headPos, dt * 14);
      this.camera.lookAt(targetHead);

      if (dropProg >= 1.0) {
        st.stage = 'impact';
        st.timer = 0;

        const dmg = 160;
        target.hp = Math.max(0, target.hp - dmg);
        target.vel.y = 9.5;
        target.vel.z += 5.2;
        target.hitFlashTimer = 0.25;

        this.cameraShake = Math.max(this.cameraShake, 0.85);
        this.spawnSparks(target.pos, 0x64748b, 45, 20, 24);
        this.spawnSparks(target.pos, 0xa855f7, 35, 16, 20);
        this.spawnShockRing(target.pos.x, target.pos.y + 0.2, target.pos.z, 0xa855f7, 4.4, 0.35, 1.4);
        this.spawnShockRing(target.pos.x, target.pos.y + 0.25, target.pos.z, 0x38bdf8, 3.0, 0.25, 1.1);

        const flashLight = new THREE.PointLight(0xa855f7, 6.0, 16);
        flashLight.position.set(target.pos.x, target.pos.y + 1.2, target.pos.z);
        this.scene.add(flashLight);
        setTimeout(() => {
          this.scene.remove(flashLight);
          flashLight.dispose();
        }, 350);

        soundEngine.playHitImpact(true);
      }
    } else if (st.stage === 'impact') {
      const targetHead = new THREE.Vector3(
        target.pos.x,
        target.pos.y + 0.5,
        target.pos.z
      );
      this.camera.position.lerp(headPos, dt * 10);
      this.camera.lookAt(targetHead);

      if (st.timer >= 0.7) {
        this.scene.remove(st.reticleMesh);
        st.reticleMesh.geometry.dispose();
        (st.reticleMesh.material as THREE.Material).dispose();

        for (const col of st.columns) {
          this.scene.remove(col.mesh);
        }

        this.obitoGravityState = null;
        this.obitoGazeActive = false;
      }
    }
  }

  public playUltimateFinisher(targetEnemy?: EnemyEntity, isAutoFinalKill = false): boolean {
    if (this.disposed || this.phase !== 'playing' || this.playerDying || this.finisherState) {
      return false;
    }
    if (!isAutoFinalKill && this.finisherCooldown > 0) {
      return false;
    }

    const target =
      (targetEnemy && !targetEnemy.isDying && targetEnemy.hp > 0 ? targetEnemy : null) ||
      this.findNearestEnemy(120) ||
      this.enemies.find((e) => !e.isDying && e.hp > 0) ||
      null;
    if (!target) return false;

    // 1. Freeze gameplay & clear active combat/movement states cleanly
    this.moveVelX = 0;
    this.moveVelZ = 0;
    this.currentMoveSpeed = 0;
    this.playerVel.set(0, 0, 0);
    this.isGuarding = false;
    this.isChargingChakra = false;
    this.guardShieldMesh.visible = false;
    this.chakraChargeRingMesh.visible = false;
    this.playerRaikiriState = null;
    this.hidePlayerRaikiriVfx();
    this.kamuiTimer = 0;
    this.restorePlayerIntangibilityMaterials();
    this.resetRunCombatState();
    this.meleeAnimTimer = 0;
    this.jutsuAnimTimer = 0;
    this.comboSpinYaw = 0;
    this.madaraActiveAttackAction = null;

    target.vel.set(0, 0, 0);
    target.combatActive = false;
    target.combatHitPending = false;
    target.attackWindup = 0;
    target.jutsuCastTimer = 0;
    target.stunTimer = 0;

    let susanooWasVisible = false;
    if (this.activeSusanoo && this.activeSusanoo.rig.root.visible) {
      susanooWasVisible = true;
      this.activeSusanoo.rig.root.visible = false;
      this.activeSusanoo.groundRingMesh.visible = false;
    }
    this.susanooCamDistOffset = 0;
    this.susanooCamLookYOffset = 0;

    // Face the target enemy
    const dx = target.pos.x - this.playerPos.x;
    const dz = target.pos.z - this.playerPos.z;
    const distXZ = Math.hypot(dx, dz);
    if (distXZ > 0.02) {
      this.playerYaw = Math.atan2(dx, dz);
      target.yaw = Math.atan2(-dx, -dz);
    }

    const dirX = distXZ > 0.02 ? dx / distXZ : Math.sin(this.playerYaw);
    const dirZ = distXZ > 0.02 ? dz / distXZ : Math.cos(this.playerYaw);

    const maxPlayRadius = this.getActiveArenaRadius() - 1.5;
    const impactPos = new THREE.Vector3(
      target.pos.x - dirX * 1.45,
      0,
      target.pos.z - dirZ * 1.45
    );
    const impR = Math.hypot(impactPos.x, impactPos.z);
    if (impR > maxPlayRadius) {
      impactPos.x *= maxPlayRadius / impR;
      impactPos.z *= maxPlayRadius / impR;
    }

    const startPlayerPos = this.playerPos.clone();
    startPlayerPos.y = Math.max(0, startPlayerPos.y);

    // Elevate high in Y while nudging toward a clean aerial vantage above the duel
    const peakLerp = distXZ > 7.5 ? 0.52 : 0.28;
    const peakPlayerPos = new THREE.Vector3(
      THREE.MathUtils.lerp(startPlayerPos.x, impactPos.x, peakLerp),
      4.65,
      THREE.MathUtils.lerp(startPlayerPos.z, impactPos.z, peakLerp)
    );

    const bgColor =
      this.scene.background instanceof THREE.Color
        ? this.scene.background.getHex()
        : 0x020714;
    const fogExp = this.scene.fog instanceof THREE.FogExp2 ? this.scene.fog : null;

    const savedLighting = {
      bgHex: bgColor,
      fogHex: fogExp ? fogExp.color.getHex() : bgColor,
      fogDensity: fogExp ? fogExp.density : 0.008,
      envIntensity: this.scene.environmentIntensity ?? 0.5,
      hemiSkyHex: this.hemiLight.color.getHex(),
      hemiGroundHex: this.hemiLight.groundColor.getHex(),
      hemiIntensity: this.hemiLight.intensity,
      keyHex: this.keyLight.color.getHex(),
      keyIntensity: this.keyLight.intensity,
      rimHex: this.rimLight.color.getHex(),
      rimIntensity: this.rimLight.intensity,
      exposure: this.renderer.toneMappingExposure,
    };

    // 2. Trigger Jump animation + launch VFX
    this.playerOnGround = false;
    this.madaraJumpPhase = 'start';
    this.madaraJumpPhaseTimer = 0;
    const playerUal = this.getActivePlayerUalActions();
    if (playerUal) {
      if (playerUal.jumpStart) {
        this.crossFadeUalPlayerAction(playerUal, playerUal.jumpStart, 0.06, true, 1.5);
      } else if (playerUal.jumpLoop) {
        this.crossFadeUalPlayerAction(playerUal, playerUal.jumpLoop, 0.08, true, 1.0);
      }
    } else {
      this.customObito?.idleAction?.fadeOut(0.08);
      this.customObito?.runAction?.fadeOut(0.08);
      this.customObito?.attackAction?.stop();
    }

    soundEngine.playJump();
    this.spawnShockRing(startPlayerPos.x, 0.14, startPlayerPos.z, 0x38bdf8, 3.6, 0.34, 0.9);
    this.spawnSparks(startPlayerPos, 0x7dd3fc, 14, 10, 8);

    this.finisherOverlay = 'none';
    this.finisherFlashOpacity = 0;
    this.finisherState = {
      phase: 'jump_ascend',
      elapsed: 0,
      phaseElapsed: 0,
      targetId: target.id,
      isAutoFinalKill,
      susanooWasVisible,
      startPlayerPos,
      peakPlayerPos,
      impactPlayerPos: impactPos,
      startCamPos: this.camera.position.clone(),
      savedFov: this.camera.fov,
      timeScale: 1.0,
      shakeFramesRemaining: 0,
      overlay: 'none',
      attackStarted: false,
      impactTriggered: false,
      attackUsesRunCombat: false,
      attackUsesUalCombo: false,
      attackUsesClip: false,
      attackAction: null,
      flyActive: false,
      flyVelX: 0,
      flyVelY: 0,
      flyVelZ: 0,
      flyRotX: 0,
      flySpinVel: 0,
      savedLighting,
    };

    this.pushHud(true);
    return true;
  }

  private cancelFinisher(restoreVisuals = true) {
    const fs = this.finisherState;
    if (!fs) return;
    if (restoreVisuals) {
      this.applyFinisherLighting(0, fs);
      if (Math.abs(this.camera.fov - fs.savedFov) > 0.05) {
        this.camera.fov = fs.savedFov;
        this.camera.updateProjectionMatrix();
      }
      if (fs.susanooWasVisible && this.activeSusanoo) {
        this.activeSusanoo.rig.root.visible = true;
        this.activeSusanoo.groundRingMesh.visible = true;
      }
    }
    this.finisherState = null;
    this.finisherOverlay = 'none';
    this.finisherFlashOpacity = 0;
  }

  private applyFinisherLighting(darkBlend: number, fs: FinisherState) {
    const s = fs.savedLighting;
    const t = THREE.MathUtils.clamp(darkBlend, 0, 1);

    _finisherColorA.setHex(s.bgHex).lerp(_finisherColorB, t);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(_finisherColorA);
    } else {
      this.scene.background = _finisherColorA.clone();
    }

    if (this.scene.fog instanceof THREE.FogExp2) {
      _finisherColorA.setHex(s.fogHex).lerp(_finisherColorB, t);
      this.scene.fog.color.copy(_finisherColorA);
      this.scene.fog.density = THREE.MathUtils.lerp(s.fogDensity, 0.026, t);
    }

    this.scene.environmentIntensity = THREE.MathUtils.lerp(s.envIntensity, 0.12, t);
    this.hemiLight.color.setHex(s.hemiSkyHex);
    this.hemiLight.groundColor.setHex(s.hemiGroundHex);
    this.hemiLight.intensity = THREE.MathUtils.lerp(s.hemiIntensity, 0.12, t);

    this.keyLight.color.setHex(s.keyHex);
    this.keyLight.intensity = THREE.MathUtils.lerp(s.keyIntensity, 0.24, t);

    _finisherColorA.setHex(s.rimHex).lerp(_finisherRimColor, t);
    this.rimLight.color.copy(_finisherColorA);
    this.rimLight.intensity = THREE.MathUtils.lerp(s.rimIntensity, 2.55, t);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(s.exposure, 0.86, t);
  }

  private findNearestEnemy(maxRange: number): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestDist = maxRange;
    for (const e of this.enemies) {
      if (e.isDying || e.hp <= 0) continue;
      const d = e.pos.distanceTo(this.playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private tick = () => {
    if (this.disposed || this.pageHidden) {
      this.frameId = 0;
      return;
    }

    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    const elapsed = this.clock.elapsedTime;

    // Smart Auto-Performance Governor: starts at 100% Ultra High Graphics and only steps down gently
    // if sustained FPS dips below 38 FPS during active combat, then automatically restores back to Ultra!
    if (!this.isSoftwareGl && this.phase === 'playing') {
      const slowThreshold = this.performanceTier >= 2 ? 0.032 : 0.029;
      if (rawDelta > slowThreshold && rawDelta < 0.25) {
        this.slowFrameAccum += rawDelta;
        this.fastFrameAccum = 0;
        if (this.slowFrameAccum >= 2.2 && this.performanceTier < 3) {
          this.slowFrameAccum = 0;
          this.applyGovernorPerformanceTier(this.performanceTier + 1);
        }
      } else if (rawDelta < 0.021) {
        this.fastFrameAccum += rawDelta;
        this.slowFrameAccum = Math.max(0, this.slowFrameAccum - rawDelta * 0.5);
        if (this.fastFrameAccum >= 3.2 && this.performanceTier > 0) {
          this.fastFrameAccum = 0;
          this.applyGovernorPerformanceTier(this.performanceTier - 1);
        }
      }
    }

    if (this.phase === 'title') {
      this.updateTitleShowcase(dt, elapsed);
      if (this.environment.group.visible) {
        this.environment.update(dt, elapsed, this.playerPos);
      }
    } else if (this.phase === 'playing') {
      this.updateGameplay(dt, elapsed);
      this.environment.update(dt, elapsed, this.playerPos);
    } else {
      this.environment.update(dt, elapsed, this.playerPos);
    }

    if (!this.contextLost) {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateTitleShowcase(dt: number, elapsed: number) {
    // Naruto Storm 4 Dual 1P (Left) vs COM (Right) 3D Showcase over #2b8cbe sky-blue stage
    // Calibrated for both portrait mobile (upper 52% showcase above scrollable roster) and widescreen desktop
    const aspect = this.camera.aspect || 1.6;
    const viewH = this.container.clientHeight || window.innerHeight || 720;
    const isPortraitMobile = aspect < 0.85;
    const isCompactLandscape = !isPortraitMobile && aspect > 1.45 && viewH <= 580;
    const xSpread = isPortraitMobile
      ? THREE.MathUtils.clamp(aspect * 1.48, 0.74, 1.18)
      : isCompactLandscape
        ? THREE.MathUtils.clamp(aspect * 1.32, 1.45, 2.55)
        : THREE.MathUtils.clamp(aspect * 1.38, 1.05, 2.38);
    const camZ = isPortraitMobile
      ? THREE.MathUtils.clamp(7.5 + (0.75 - aspect) * 2.8, 7.1, 9.2)
      : isCompactLandscape
        ? THREE.MathUtils.clamp(6.65 + Math.max(0, 1.6 - aspect) * 1.6, 6.65, 7.45)
        : THREE.MathUtils.clamp(6.15 + Math.max(0, 1.35 - aspect) * 2.35, 6.15, 8.15);
    const lookY = isPortraitMobile ? 0.05 : isCompactLandscape ? 0.8 : 0.72;

    this.obitoShadow.position.set(-xSpread, 0.03, 0);
    this.comShadow.position.set(xSpread, 0.03, 0);

    if (this.customObito) {
      this.customObito.root.position.set(-xSpread, 0, 0);
      this.customObito.pivotGroup.position.set(0, 0, 0);
      this.customObito.root.rotation.set(0, 0.34 + Math.sin(elapsed * 0.42) * 0.08, 0);
      this.customObito.pivotGroup.rotation.set(0, 0, 0);
      const showcaseUal = this.getActivePlayerUalActions();
      if (showcaseUal && this.customObito.mixer) {
        if (showcaseUal.activeAction !== showcaseUal.idle || !showcaseUal.idle.isRunning()) {
          this.crossFadeUalPlayerAction(showcaseUal, showcaseUal.idle, 0.14, false, 1);
        }
        this.stopFadedUalPlayerActions(showcaseUal);
        this.customObito.mixer.update(dt);
      } else {
        if (this.customObito.mixer) {
          if (this.customObito.runAction && this.customObito.runAction.isRunning()) {
            this.customObito.runAction.stop();
          }
          if (this.customObito.attackAction && this.customObito.attackAction.isRunning()) {
            this.customObito.attackAction.stop();
          }
          if (this.customObito.idleAction) {
            this.customObito.idleAction.enabled = true;
            this.customObito.idleAction.paused = false;
            this.customObito.idleAction.setEffectiveTimeScale(1);
            this.customObito.idleAction.setEffectiveWeight(1);
            if (!this.customObito.idleAction.isRunning()) {
              this.customObito.idleAction.play();
            }
            if (this.customObito.bones.hips && !this.isDeidara) {
              const baseHipsRot = this.customObito.baseBoneRotations.get(this.customObito.bones.hips);
              const baseHipsPos = this.customObito.baseBonePositions.get(this.customObito.bones.hips);
              if (baseHipsRot) this.customObito.bones.hips.rotation.copy(baseHipsRot);
              if (baseHipsPos) this.customObito.bones.hips.position.copy(baseHipsPos);
            }
          }
          this.customObito.mixer.update(dt);
        }
        const useShowcaseBakedIdle = Boolean(
          this.customObitoIsRunSource &&
            !this.customObito.idleAction &&
            this.bakedRunIdleAnim &&
            this.playerIdleTargetState
        );
        if (useShowcaseBakedIdle && this.bakedRunIdleAnim && this.playerIdleTargetState) {
          this.playerIdleTime += dt;
          const dy = this.bakedRunIdleAnim.applyPose(
            this.playerIdleTargetState,
            this.playerIdleTime,
            1.0,
            false
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.25);
        } else if (this.customObito.hasSkeleton && !this.customObito.idleAction) {
          const { bones, baseBoneRotations, baseBonePositions } = this.customObito;
          const bx = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.x ?? 0 : 0);
          const by = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.y ?? 0 : 0);
          const bz = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.z ?? 0 : 0);

          const breath = Math.sin(elapsed * 2.0) * 0.72 + Math.sin(elapsed * 0.92) * 0.28;

          if (bones.hips) {
            const basePos = baseBonePositions.get(bones.hips);
            bones.hips.position.y = (basePos?.y ?? 1.0) - 0.03 + breath * 0.01;
            bones.hips.position.x = basePos?.x ?? 0;
            bones.hips.rotation.y = by(bones.hips);
            bones.hips.rotation.z = bz(bones.hips);
          }
          if (bones.spine) {
            bones.spine.rotation.x = bx(bones.spine) + 0.02 + breath * 0.015;
            bones.spine.rotation.y = by(bones.spine);
            bones.spine.rotation.z = bz(bones.spine);
          }
          if (bones.chest) {
            bones.chest.rotation.x = bx(bones.chest) + 0.02 + breath * 0.02;
            bones.chest.rotation.y = by(bones.chest);
            bones.chest.rotation.z = bz(bones.chest);
          }
          if (bones.head) {
            bones.head.rotation.x = bx(bones.head) - 0.03 - breath * 0.01;
            bones.head.rotation.y = by(bones.head) + Math.sin(elapsed * 0.65) * 0.05;
            bones.head.rotation.z = bz(bones.head);
          }
          if (bones.leftUpperArm) {
            bones.leftUpperArm.rotation.x = bx(bones.leftUpperArm) - 0.34 + breath * 0.025;
            bones.leftUpperArm.rotation.z = bz(bones.leftUpperArm) - 0.06 - breath * 0.02;
          }
          if (bones.leftForearm) {
            bones.leftForearm.rotation.y = by(bones.leftForearm) - 0.42 + breath * 0.03;
            bones.leftForearm.rotation.x = bx(bones.leftForearm);
          }
          if (bones.rightUpperArm) {
            bones.rightUpperArm.rotation.x = bx(bones.rightUpperArm) + 0.28 + breath * 0.03;
            bones.rightUpperArm.rotation.z = bz(bones.rightUpperArm) + 0.06 + breath * 0.02;
          }
          if (bones.rightForearm) {
            bones.rightForearm.rotation.y = by(bones.rightForearm) + 0.16;
            bones.rightForearm.rotation.x = bx(bones.rightForearm);
          }
          if (bones.leftThigh) bones.leftThigh.rotation.x = bx(bones.leftThigh) - 0.14;
          if (bones.rightThigh) bones.rightThigh.rotation.x = bx(bones.rightThigh) + 0.14;
          if (bones.leftShin) bones.leftShin.rotation.x = bx(bones.leftShin) + 0.24;
          if (bones.rightShin) bones.rightShin.rotation.x = bx(bones.rightShin) + 0.22;
          if (bones.leftFoot) bones.leftFoot.rotation.x = bx(bones.leftFoot) - 0.08;
          if (bones.rightFoot) bones.rightFoot.rotation.x = bx(bones.rightFoot) - 0.08;
        }
      }
      if (this.customObito.hasSkeleton) {
        this.anchorRigHipsParentToRest(
          this.customObito.bones,
          this.customObito.baseBoneRotations,
          this.customObito.baseBonePositions
        );
      }
      if (this.customObitoPhysicsSolver && this.customObito.hasSkeleton) {
        this.customObitoPhysicsSolver.solve(dt);
      }
      if (this.customObitoCloakSolver && this.customObito.hasSkeleton) {
        this.customObitoCloakSolver.solve(dt, elapsed, 0, 0, 0, 0);
      }
      this.updateGunbaiSpring(dt, elapsed, 0, true);
      this.enforceSolidGroundContact(
        this.customObito.root,
        this.customObito.pivotGroup,
        this.customObito.bones,
        0,
        this.playerSoleClearance
      );
    }

    // Update COM opponent 3D model on right side facing 1P
    if (this.comPreviewRig) {
      this.comPreviewRig.root.position.set(xSpread, 0, 0);
      this.comPreviewRig.pivotGroup.position.set(0, 0, 0);
      this.comPreviewRig.root.rotation.set(0, -0.34 - Math.sin(elapsed * 0.42 + 1.2) * 0.08, 0);
      this.comPreviewRig.pivotGroup.rotation.set(0, 0, 0);

      if (this.comPreviewRig.mixer && (this.comPreviewIdleAction || this.comPreviewRig.idleAction)) {
        this.comPreviewRig.mixer.update(dt);
      } else if (this.comPreviewRig.hasSkeleton) {
        const { bones, baseBoneRotations, baseBonePositions } = this.comPreviewRig;
        const bx = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.x ?? 0 : 0);
        const by = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.y ?? 0 : 0);
        const bz = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.z ?? 0 : 0);
        const breath = Math.sin(elapsed * 2.0 + 1.1) * 0.72 + Math.sin(elapsed * 0.92) * 0.28;
        if (bones.hips) {
          const basePos = baseBonePositions.get(bones.hips);
          bones.hips.position.y = (basePos?.y ?? 1.0) - 0.03 + breath * 0.01;
          bones.hips.rotation.y = by(bones.hips);
          bones.hips.rotation.z = bz(bones.hips);
        }
        if (bones.spine) {
          bones.spine.rotation.x = bx(bones.spine) + 0.02 + breath * 0.015;
          bones.spine.rotation.z = bz(bones.spine);
        }
        if (bones.chest) {
          bones.chest.rotation.x = bx(bones.chest) + 0.02 + breath * 0.02;
          bones.chest.rotation.z = bz(bones.chest);
        }
      }

      if (this.comPreviewRig.hasSkeleton) {
        this.anchorRigHipsParentToRest(
          this.comPreviewRig.bones,
          this.comPreviewRig.baseBoneRotations,
          this.comPreviewRig.baseBonePositions
        );
      }
      if (this.comPreviewPhysicsSolver && this.comPreviewRig.hasSkeleton) {
        this.comPreviewPhysicsSolver.solve(dt);
      }
      if (this.comPreviewCloakSolver && this.comPreviewRig.hasSkeleton) {
        this.comPreviewCloakSolver.solve(dt, elapsed, 0, 0, 0, 0);
      }
      this.enforceSolidGroundContact(
        this.comPreviewRig.root,
        this.comPreviewRig.pivotGroup,
        this.comPreviewRig.bones,
        0,
        this.comPreviewSoleClearance
      );
    }

    // Crisp symmetrical Storm 4 front studio camera framing both 1P and COM above the bottom 4-row grid
    _desiredCamPos.set(
      Math.sin(elapsed * 0.28) * 0.14,
      1.55 + Math.sin(elapsed * 0.45) * 0.04,
      camZ
    );
    this.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-8 * dt));
    _lookTarget.set(0, lookY, 0);
    this.camera.lookAt(_lookTarget);
  }

  private updateGameplay(dt: number, elapsed: number) {
    if (this.finisherCooldown > 0 && !this.finisherState) {
      this.finisherCooldown = Math.max(0, this.finisherCooldown - dt);
    }
    if (this.obitoGazeCooldown > 0 && !this.obitoGazeActive) {
      this.obitoGazeCooldown = Math.max(0, this.obitoGazeCooldown - dt);
    }

    if (this.obitoGravityState && this.obitoGravityState.active) {
      this.updateObitoGaze(dt);
      return;
    }

    if (this.finisherState) {
      this.updateFinisher(dt, elapsed);
      return;
    }

    // Immediate collapse trigger when player HP hits 0
    if (this.playerHp <= 0 && !this.playerDying) {
      this.playerDying = true;
      this.playerDeathTimer = 0;
      this.playerDeathBlend = 0;
      this.playerDeathDuration = this.bakedDeathAnim
        ? Math.max(2.6, this.bakedDeathAnim.duration - 0.04)
        : 1.15;
      this.playerRaikiriState = null;
      this.hidePlayerRaikiriVfx();
      this.runCombatActive = false;
      this.runCombatPendingHit = null;
      this.runCombatBlend = 0;
      this.meleeAnimTimer = 0;
      this.jutsuAnimTimer = 0;
      this.kamuiTimer = 0;
      this.restorePlayerIntangibilityMaterials();
      this.moveVelX = 0;
      this.moveVelZ = 0;
      this.currentMoveSpeed = 0;
      this.playerVel.x = 0;
      this.playerVel.z = 0;
      if (this.bakedDeathAnim && !this.playerDeathTargetState && this.customObito) {
        this.playerDeathTargetState = this.bakedDeathAnim.prepareTarget(
          this.customObito.pivotGroup,
          this.customObito.bones,
          this.customObito.baseBoneRotations,
          this.customObito.baseBonePositions
        );
      }
      this.madaraJumpPhase = 'none';
      this.madaraJumpPhaseTimer = 0;
      this.madaraActiveAttackAction = null;
      this.getActivePlayerUalActions()?.activeAction?.fadeOut(0.16);
      this.customObito?.idleAction?.fadeOut(0.16);
      this.customObito?.runAction?.fadeOut(0.16);
      this.customObito?.attackAction?.fadeOut(0.12);
      this.spawnSparks(this.playerPos, 0xef4444, 6);
      this.pushHud(true);
    }

    // 1. Cooldowns & timers
    (Object.keys(this.cooldowns) as JutsuId[]).forEach((k) => {
      if (this.cooldowns[k] > 0) {
        this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
      }
    });

    if (!this.playerDying) {
      const passiveRegen = this.awakeningActive ? 11.5 : 5.8;
      const chargeRate = this.isChargingChakra ? 40.0 : passiveRegen;
      this.playerChakra = Math.min(this.playerMaxChakra, this.playerChakra + dt * chargeRate);

      // Storm 4 Substitution log recharge
      if (this.substitutionLogs < this.maxSubstitutionLogs) {
        this.substitutionRechargeTimer += dt;
        if (this.substitutionRechargeTimer >= this.substitutionRechargeDuration) {
          this.substitutionRechargeTimer -= this.substitutionRechargeDuration;
          this.substitutionLogs = Math.min(this.maxSubstitutionLogs, this.substitutionLogs + 1);
        }
      } else {
        this.substitutionRechargeTimer = 0;
      }

      // Guard gauge regeneration / break recovery
      if (this.guardBroken) {
        this.guardBreakTimer = Math.max(0, this.guardBreakTimer - dt);
        if (this.guardBreakTimer <= 0) {
          this.guardBroken = false;
          this.guardGauge = 45;
        }
      } else if (!this.isGuarding && this.guardGauge < this.maxGuardGauge) {
        this.guardGauge = Math.min(this.maxGuardGauge, this.guardGauge + dt * 22);
      }

      // Awakening timer countdown
      if (this.awakeningActive) {
        this.awakeningTimer = Math.max(0, this.awakeningTimer - dt);
        this.awakeningSparkTimer -= dt;
        if (this.awakeningSparkTimer <= 0) {
          this.awakeningSparkTimer = 0.14;
          this.spawnSparks(this.playerPos, Math.random() > 0.4 ? 0xf97316 : 0xfacc15, 4, 5.5, 4);
        }
        if (this.awakeningTimer <= 0) {
          this.awakeningActive = false;
        }
      }

      // Chakra Charge visual aura burst
      if (this.isChargingChakra) {
        this.chakraChargeEmitTimer -= dt;
        if (this.chakraChargeEmitTimer <= 0) {
          this.chakraChargeEmitTimer = 0.09;
          this.spawnSparks(this.playerPos, 0x38bdf8, 5, 4.5, -6);
        }
      }
    } else {
      this.isGuarding = false;
      this.isChargingChakra = false;
    }
    if (this.chakraDashCooldown > 0) this.chakraDashCooldown = Math.max(0, this.chakraDashCooldown - dt);
    if (this.chakraDashTimer > 0) {
      this.chakraDashTimer = Math.max(0, this.chakraDashTimer - dt);
      if (Math.random() < 0.65) {
        this.spawnSparks(this.playerPos, 0x38bdf8, 3, 4.5, 2);
      }
    }
    if (this.kamuiTimer > 0) this.kamuiTimer = Math.max(0, this.kamuiTimer - dt);
    if (this.hitInvulnTimer > 0) this.hitInvulnTimer = Math.max(0, this.hitInvulnTimer - dt);
    if (this.meleeAnimTimer > 0) this.meleeAnimTimer = Math.max(0, this.meleeAnimTimer - dt);
    if (this.meleeComboResetTimer > 0) this.meleeComboResetTimer = Math.max(0, this.meleeComboResetTimer - dt);
    if (this.runCombatComboResetTimer > 0) {
      this.runCombatComboResetTimer = Math.max(0, this.runCombatComboResetTimer - dt);
    }
    if (this.jutsuAnimTimer > 0) this.jutsuAnimTimer = Math.max(0, this.jutsuAnimTimer - dt);
    if (this.landingTimer > 0) this.landingTimer = Math.max(0, this.landingTimer - dt);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 1.45);
    if (this.manualCameraHoldTimer > 0 && !this.isDraggingCamera) {
      this.manualCameraHoldTimer = Math.max(0, this.manualCameraHoldTimer - dt);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.announcementTimer > 0) {
      this.announcementTimer -= dt;
      if (this.announcementTimer <= 0) this.announcementAr = null;
    }

    // BracketLeft / BracketRight keyboard camera yaw rotation
    if (this.keys['BracketLeft']) {
      this.camYaw += dt * 2.1;
      this.manualCameraHoldTimer = 4.0;
    }
    if (this.keys['BracketRight']) {
      this.camYaw -= dt * 2.1;
      this.manualCameraHoldTimer = 4.0;
    }

    // Kakashi hand-held Raikiri auto-rush & direct strike
    if (this.playerRaikiriState && !this.playerDying) {
      const rk = this.playerRaikiriState;
      let target = rk.targetId
        ? this.enemies.find((e) => e.id === rk.targetId && !e.isDying && e.hp > 0) ?? null
        : null;
      if (!target) {
        target = this.findNearestEnemy(44);
        rk.targetId = target ? target.id : null;
      }

      if (rk.phase === 'charging') {
        rk.elapsed += dt;
        let dirX = Math.sin(this.playerYaw);
        let dirZ = Math.cos(this.playerYaw);
        let distToTarget = Infinity;
        if (target) {
          const dx = target.pos.x - this.playerPos.x;
          const dz = target.pos.z - this.playerPos.z;
          distToTarget = Math.hypot(dx, dz);
          if (distToTarget > 0.05) {
            dirX = dx / distToTarget;
            dirZ = dz / distToTarget;
            const desiredYaw = Math.atan2(dirX, dirZ);
            let yDiff = desiredYaw - this.playerYaw;
            while (yDiff > Math.PI) yDiff -= Math.PI * 2;
            while (yDiff < -Math.PI) yDiff += Math.PI * 2;
            this.playerYaw += yDiff * (1 - Math.exp(-20 * dt));
          }
        }

        const rushSpeed = target ? 22.5 : 17.5;
        this.moveVelX = dirX * rushSpeed;
        this.moveVelZ = dirZ * rushSpeed;
        this.currentMoveSpeed = Math.hypot(this.moveVelX, this.moveVelZ);

        const reachedEnemy = target !== null && distToTarget <= 2.9 && rk.elapsed >= 0.08;
        const timedOutNoTarget = target === null && rk.elapsed >= 0.42;
        const timedOutMax = rk.elapsed >= 0.78;

        if (reachedEnemy || timedOutNoTarget || timedOutMax) {
          rk.phase = 'strike';
          rk.strikeElapsed = 0;
          if (target) {
            const dx = target.pos.x - this.playerPos.x;
            const dz = target.pos.z - this.playerPos.z;
            if (dx * dx + dz * dz > 0.01) {
              this.playerYaw = Math.atan2(dx, dz);
            }
          }
          const fx = Math.sin(this.playerYaw);
          const fz = Math.cos(this.playerYaw);
          this.moveVelX = fx * 7.5;
          this.moveVelZ = fz * 7.5;
          this.currentMoveSpeed = Math.hypot(this.moveVelX, this.moveVelZ);

          if (this.customObitoIsRunSource && this.bakedCombatAnim && this.playerCombatTargetState) {
            const win = RUN_COMBO_WINDOWS[0];
            const maxDur = this.bakedCombatAnim.duration;
            const start = Math.min(win.start, Math.max(0, maxDur - 0.35));
            const end = Math.min(win.end, maxDur);
            this.runCombatActive = true;
            this.runCombatStep = 0;
            this.runCombatClipTime = start;
            this.runCombatEndTime = end;
            this.runCombatPendingHit = null;
          }
        }
      } else {
        rk.strikeElapsed += dt;
        this.moveVelX = THREE.MathUtils.damp(this.moveVelX, 0, 12, dt);
        this.moveVelZ = THREE.MathUtils.damp(this.moveVelZ, 0, 12, dt);
        this.currentMoveSpeed = Math.hypot(this.moveVelX, this.moveVelZ);

        if (!rk.impactApplied && rk.strikeElapsed >= 0.13) {
          rk.impactApplied = true;
          const handPos = this.getPlayerRightHandWorldPos(_tempVecA).clone();
          this.triggerPlayerRaikiriImpact(handPos);
        }

        if (rk.strikeElapsed >= 0.42) {
          this.playerRaikiriState = null;
          this.hidePlayerRaikiriVfx();
        }
      }
    }

    // Advance `run`-exclusive `ccgq05.glb` combat state machine at 1.5x shonen speed
    const canDriveRunCombat = Boolean(
      !this.playerDying &&
        this.customObitoIsRunSource &&
        this.bakedCombatAnim &&
        this.playerCombatTargetState &&
        (this.jutsuAnimTimer <= 0 || this.playerRaikiriState?.phase === 'strike')
    );
    if (this.runCombatActive && canDriveRunCombat && this.bakedCombatAnim) {
      this.runCombatClipTime += dt * RUN_COMBO_SPEED;
      this.runCombatBlend = Math.min(1, this.runCombatBlend + dt / 0.08);
      if (
        this.runCombatPendingHit &&
        this.runCombatClipTime >= this.runCombatPendingHit.hitClipTime
      ) {
        const pending = this.runCombatPendingHit;
        this.runCombatPendingHit = null;
        this.resolveRunCombatHit(pending);
      }
      if (this.runCombatClipTime >= this.runCombatEndTime) {
        if (this.runCombatPendingHit) {
          const pending = this.runCombatPendingHit;
          this.runCombatPendingHit = null;
          this.resolveRunCombatHit(pending);
        }
        this.runCombatClipTime = this.runCombatEndTime;
        this.runCombatActive = false;
      }
    } else {
      if (this.runCombatActive && this.jutsuAnimTimer > 0) {
        this.runCombatActive = false;
        this.runCombatPendingHit = null;
      }
      if (this.runCombatBlend > 0) {
        this.runCombatBlend = Math.max(0, this.runCombatBlend - dt / 0.18);
      }
    }

    // 2. Natural Human Movement with Momentum, Acceleration, Turn Banking & Gait Blending
    let inputX = this.playerDying
      ? 0
      : (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    let inputZ = this.playerDying
      ? 0
      : (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) - (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0);

    if (!this.playerDying) {
      inputX += this.virtualMove.x;
      inputZ += this.virtualMove.y;
    }

    _camForward.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)).negate().normalize();
    _camRight.set(-_camForward.z, 0, _camForward.x).normalize();

    _moveDir.set(0, 0, 0);
    _moveDir.addScaledVector(_camForward, -inputZ);
    _moveDir.addScaledVector(_camRight, inputX);

    const stickMag = Math.min(1, this.virtualMove.length());
    const hasStick = !this.playerDying && stickMag > 0.08;
    const hasKeyMove =
      !this.playerDying &&
      Boolean(this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD'] ||
              this.keys['ArrowUp'] || this.keys['ArrowLeft'] || this.keys['ArrowDown'] || this.keys['ArrowRight']);
    const shiftHeld = !this.playerDying && Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    const susanooGrounded = this.isSusanooGroundedMode();
    const maxSpeed = susanooGrounded ? 15.6 : 11.4;
    let targetSpeed = 0;
    if (!this.playerDying && !this.playerRaikiriState) {
      if (_moveDir.lengthSq() > 0.01) {
        _moveDir.normalize();
        if (hasStick && !hasKeyMove) {
          // Smooth analog stick speed from slow human walk (~3 m/s) up to full sprint / Susanoo glide
          targetSpeed = 2.6 + stickMag * (maxSpeed - 2.6);
        } else {
          targetSpeed = shiftHeld || susanooGrounded ? maxSpeed : 7.8;
        }
      }
      if (this.runCombatActive) {
        targetSpeed *= 0.22;
      } else if (this.isChargingChakra) {
        targetSpeed *= 0.18;
      } else if (this.isGuarding) {
        targetSpeed *= 0.38;
      } else if (this.awakeningActive) {
        targetSpeed *= 1.16;
      }

      const targetVx = _moveDir.x * targetSpeed;
      const targetVz = _moveDir.z * targetSpeed;
      const accelRate = targetSpeed > 0.1 ? (susanooGrounded ? 14.0 : 12.0) : 15.0;
      this.moveVelX = THREE.MathUtils.damp(this.moveVelX, targetVx, accelRate, dt);
      this.moveVelZ = THREE.MathUtils.damp(this.moveVelZ, targetVz, accelRate, dt);
      this.currentMoveSpeed = Math.hypot(this.moveVelX, this.moveVelZ);
    } else if (this.playerDying) {
      this.moveVelX = 0;
      this.moveVelZ = 0;
      this.currentMoveSpeed = 0;
    }

    const speedRatio = THREE.MathUtils.clamp(this.currentMoveSpeed / maxSpeed, 0, 1);

    this.playerPos.x += this.moveVelX * dt;
    this.playerPos.z += this.moveVelZ * dt;

    const isStriking =
      this.runCombatActive ||
      this.meleeAnimTimer > 0 ||
      this.jutsuAnimTimer > 0 ||
      Boolean(this.playerRaikiriState);
    let yawDiff = 0;
    if (!this.playerDying && !isStriking && this.currentMoveSpeed > 0.35) {
      const targetYaw = Math.atan2(this.moveVelX, this.moveVelZ);
      yawDiff = targetYaw - this.playerYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.playerYaw += yawDiff * (1 - Math.exp(-13.5 * dt));
    }

    // Keep turnLean strictly zero so turning never tilts/banks any character sideways
    this.turnLean = 0;

    // Advance stride phase continuously proportional to actual ground speed (never rewind legs backward!)
    if (!this.playerDying && speedRatio > 0.03 && this.playerOnGround) {
      this.walkPhase += dt * (4.8 + speedRatio * 12.8);
    }

    // Apply impulse velocities & gravity (strict ground lock when Susanoo is active — zero jump/bounce)
    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.z += this.playerVel.z * dt;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 8, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 8, dt);

    if (susanooGrounded) {
      this.playerPos.y = 0;
      this.playerVel.y = 0;
      this.playerOnGround = true;
      this.airTime = 0;
      this.landingTimer = 0;
    } else if (!this.playerOnGround) {
      this.airTime += dt;
      this.playerVel.y -= 24 * dt;
      this.playerPos.y += this.playerVel.y * dt;
      if (this.playerPos.y <= 0) {
        this.playerPos.y = 0;
        this.playerVel.y = 0;
        this.playerOnGround = true;
        if (this.airTime > 0.12) {
          this.landingTimer = 0.24;
        }
        if (this.airTime > 0.42) {
          this.spawnGroundMark(this.playerPos.x, this.playerPos.z, 'crack', 2.2, 4.0, 0.45);
        }
        this.airTime = 0;
      }
    } else {
      this.playerPos.y = 0;
      if (this.playerVel.y < 0) this.playerVel.y = 0;
    }
    this.playerPos.y = Math.max(0, this.playerPos.y);

    // Solid capsule separation against alive enemies (unless jumping cleanly overhead, dying, or Kamui intangible)
    if (this.kamuiTimer <= 0 && !this.playerDying) {
      for (const e of this.enemies) {
        if (e.isDying || e.hp <= 0) continue;
        if (Math.abs(this.playerPos.y - e.pos.y) >= 2.2) continue;
        const minSep = e.isBoss ? 1.6 : 1.3;
        const dx = this.playerPos.x - e.pos.x;
        const dz = this.playerPos.z - e.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep) {
          const dist = Math.sqrt(distSq);
          const nx = dist > 0.001 ? dx / dist : Math.sin(this.playerYaw);
          const nz = dist > 0.001 ? dz / dist : Math.cos(this.playerYaw);
          const overlap = minSep - dist;
          this.playerPos.x += nx * overlap * 0.55;
          this.playerPos.z += nz * overlap * 0.55;
          e.pos.x -= nx * overlap * 0.45;
          e.pos.z -= nz * overlap * 0.45;
        }
      }
    }

    // Solid collision against active summoned Gedo Mazo Statue torso
    if (
      this.activeGedo &&
      (this.activeGedo.phase === 'emerging' || this.activeGedo.phase === 'active') &&
      this.playerPos.y < 6.5
    ) {
      const statueMinR = 2.35;
      const dx = this.playerPos.x - this.activeGedo.pos.x;
      const dz = this.playerPos.z - this.activeGedo.pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < statueMinR * statueMinR) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 0.001 ? dx / dist : 0;
        const nz = dist > 0.001 ? dz / dist : 1;
        this.playerPos.x = this.activeGedo.pos.x + nx * statueMinR;
        this.playerPos.z = this.activeGedo.pos.z + nz * statueMinR;
      }
    }

    // Keep within playable stone ring & cancel outward radial velocity so sliding along edge stays crisp
    const maxPlayRadius = this.getActiveArenaRadius() - 1.2;
    const distFromCenter = Math.hypot(this.playerPos.x, this.playerPos.z);
    if (distFromCenter > maxPlayRadius) {
      const nx = this.playerPos.x / distFromCenter;
      const nz = this.playerPos.z / distFromCenter;
      this.playerPos.x = nx * maxPlayRadius;
      this.playerPos.z = nz * maxPlayRadius;
      const outVel = this.playerVel.x * nx + this.playerVel.z * nz;
      if (outVel > 0) {
        this.playerVel.x -= nx * outVel;
        this.playerVel.z -= nz * outVel;
      }
      const outMove = this.moveVelX * nx + this.moveVelZ * nz;
      if (outMove > 0) {
        this.moveVelX -= nx * outMove;
        this.moveVelZ -= nz * outMove;
      }
    }

    // 3. Position Shadow & Compute Gait Parameters for Loaded 3D Character
    this.obitoShadow.position.set(this.playerPos.x, 0.03, this.playerPos.z);
    const susanooShadowMul =
      this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing'
        ? this.activeSusanoo.stage === 'perfect'
          ? 3.6
          : this.activeSusanoo.stage === 'armored'
            ? 2.5
            : 1.7
        : 1.0;
    const shadowScale = Math.max(0.45, 1 - this.playerPos.y * 0.1) * susanooShadowMul;
    this.obitoShadow.scale.setScalar(shadowScale);

    const hasMoveIntent =
      !this.playerDying && !this.playerRaikiriState && _moveDir.lengthSq() > 0.01;
    const moving =
      this.playerOnGround &&
      (hasMoveIntent ? this.currentMoveSpeed > 0.35 : this.currentMoveSpeed > 1.65);
    const moveAmp = this.playerOnGround ? smoothstep01(0.03, 0.20, speedRatio) : 0;
    const stalkBlend = moveAmp * (1 - smoothstep01(0.22, 0.50, speedRatio));
    const sprintBlend = moveAmp * smoothstep01(0.22, 0.52, speedRatio);

    const phaseL = Math.sin(this.walkPhase);
    const phaseR = -phaseL;
    const strideAmp = THREE.MathUtils.lerp(0.54, 0.94, sprintBlend) * moveAmp;
    const legSwing = phaseL * strideAmp;

    // Spin yaw on Storm 4 Hit 3 (360° swirling vortex attack)
    let targetSpinYaw = 0;
    if (this.meleeAnimTimer > 0 && this.meleeStep === 2 && !this.madaraActiveAttackAction) {
      const pSpin = 1 - this.meleeAnimTimer / this.meleeAnimDuration;
      targetSpinYaw = pSpin * Math.PI * 2;
      this.comboSpinYaw = targetSpinYaw;
    } else if (this.hasTobiV2Moveset) {
      this.comboSpinYaw = 0;
    } else {
      this.comboSpinYaw = THREE.MathUtils.damp(this.comboSpinYaw, 0, 18, dt);
    }

    const isAttackingOrJutsu =
      this.meleeAnimTimer > 0 || this.jutsuAnimTimer > 0 || this.runCombatActive;
    const justLanded = !this.prevPlayerOnGround && this.playerOnGround;
    const justFinishedAction = this.prevWasAttackingOrJutsu && !isAttackingOrJutsu;
    this.prevPlayerOnGround = this.playerOnGround;
    this.prevWasAttackingOrJutsu = isAttackingOrJutsu;

    // Animate Loaded Custom Model (Immediate tinbc4.fbx Death Collapse or Strict 3-State Machine)
    if (this.customObito && this.playerDying) {
      this.playerDeathTimer += dt;
      this.playerDeathBlend = Math.min(1, this.playerDeathBlend + dt / 0.16);

      this.customObito.root.position.copy(this.playerPos);
      this.customObito.root.rotation.set(0, this.playerYaw, 0);
      this.customObito.pivotGroup.scale.setScalar(1.0);
      this.customObito.pivotGroup.rotation.set(0, 0, 0);

      const idleAction = this.customObito.idleAction;
      const runAction = this.customObito.runAction;
      const attackAction = this.customObito.attackAction;
      const dyingUal = this.getActivePlayerUalActions();
      if (this.customObito.mixer) {
        if (dyingUal) {
          const activeUal = dyingUal.activeAction;
          if (activeUal && activeUal.isRunning() && activeUal.getEffectiveWeight() <= 0.02) {
            activeUal.stop();
          }
          this.stopFadedUalPlayerActions(dyingUal);
        }
        if (idleAction && idleAction.isRunning() && idleAction.getEffectiveWeight() <= 0.02) idleAction.stop();
        if (runAction && runAction.isRunning() && runAction.getEffectiveWeight() <= 0.02) runAction.stop();
        if (attackAction && attackAction.isRunning() && attackAction.getEffectiveWeight() <= 0.02) attackAction.stop();
        this.customObito.mixer.update(dt);
      }

      const hasDeathUnderlay = Boolean(
        (idleAction && idleAction.isRunning()) ||
          (runAction && runAction.isRunning()) ||
          (dyingUal?.activeAction && dyingUal.activeAction.isRunning())
      );
      if (this.bakedDeathAnim && this.playerDeathTargetState) {
        const deathDy = this.bakedDeathAnim.applyPoseAtTime(
          this.playerDeathTargetState,
          this.playerDeathTimer,
          this.playerDeathBlend,
          hasDeathUnderlay
        );
        this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(deathDy, -0.95, 0.25);
      } else {
        const p = Math.min(1, this.playerDeathTimer / Math.max(0.2, this.playerDeathDuration));
        this.customObito.pivotGroup.rotation.x = p * 1.42;
      }

      this.enforceSolidGroundContact(
        this.customObito.root,
        this.customObito.pivotGroup,
        this.customObito.bones,
        this.playerPos.y,
        this.playerSoleClearance
      );

      const fadeShadowP = THREE.MathUtils.clamp(
        (this.playerDeathTimer - (this.playerDeathDuration - 0.35)) / 0.35,
        0,
        1
      );
      this.obitoShadow.scale.setScalar(Math.max(0.12, 1 - fadeShadowP * 0.72));
    } else if (this.customObito) {
      const susanooPilotActive = Boolean(
        this.activeSusanoo && this.activeSusanoo.phase !== 'vanishing'
      );
      if (susanooPilotActive && this.activeSusanoo) {
        this.customObito.root.position.copy(this.activeSusanoo.pilotWorldPos);
        this.customObito.pivotGroup.scale.setScalar(
          this.activeSusanoo.stage === 'perfect' ? 0.76 : 1.0
        );
        this.customObito.pivotGroup.rotation.y = 0;
      } else {
        this.customObito.root.position.copy(this.playerPos);
        this.customObito.pivotGroup.scale.setScalar(1.0);
        this.customObito.pivotGroup.rotation.y = this.comboSpinYaw;
      }
      // Lock Pitch & Roll on root so character only rotates around Y
      this.customObito.root.rotation.set(0, this.playerYaw, 0);
      this.customObito.pivotGroup.rotation.x = 0;
      this.customObito.pivotGroup.rotation.z = 0;

      const playerUal = this.getActivePlayerUalActions();
      let playerNativeRunDriving = false;
      if (playerUal && this.customObito.mixer) {
        if (this.meleeAnimTimer <= 0) {
          this.madaraActiveAttackAction = null;
        }

        const isRaikiriCharging = this.playerRaikiriState?.phase === 'charging';
        const isNonMadaraMeleeActive =
          !this.isMadara &&
          (this.runCombatActive || this.playerRaikiriState?.phase === 'strike');
        const runCombatDriving = Boolean(
          !this.isMadara &&
            canDriveRunCombat &&
            this.runCombatBlend > 0.002 &&
            this.bakedCombatAnim &&
            this.playerCombatTargetState
        );
        const useBakedRunFallback = Boolean(
          !playerUal.run && this.bakedRunAnim && this.playerRunTargetState
        );

        // Advance aerial jump & landing phase machine for all characters
        if (!this.playerOnGround) {
          if (this.madaraJumpPhase === 'none' || this.madaraJumpPhase === 'land') {
            this.madaraJumpPhase = this.playerVel.y > 1.5 ? 'start' : 'loop';
            this.madaraJumpPhaseTimer = 0;
          } else if (this.madaraJumpPhase === 'start') {
            this.madaraJumpPhaseTimer += dt;
            if (this.madaraJumpPhaseTimer >= 0.28 || this.playerVel.y < 1.2) {
              this.madaraJumpPhase = 'loop';
              this.madaraJumpPhaseTimer = 0;
            }
          }
        } else if (justLanded) {
          if (
            hasMoveIntent ||
            moving ||
            this.meleeAnimTimer > 0 ||
            isNonMadaraMeleeActive ||
            this.jutsuAnimTimer > 0 ||
            isRaikiriCharging
          ) {
            this.madaraJumpPhase = 'none';
            this.madaraJumpPhaseTimer = 0;
          } else {
            this.madaraJumpPhase = 'land';
            this.madaraJumpPhaseTimer = 0;
          }
        } else if (this.madaraJumpPhase === 'land') {
          this.madaraJumpPhaseTimer += dt;
          if (
            hasMoveIntent ||
            moving ||
            this.meleeAnimTimer > 0 ||
            isNonMadaraMeleeActive ||
            this.jutsuAnimTimer > 0 ||
            isRaikiriCharging ||
            this.madaraJumpPhaseTimer >= 0.28
          ) {
            this.madaraJumpPhase = 'none';
            this.madaraJumpPhaseTimer = 0;
          }
        } else if (this.madaraJumpPhase !== 'none') {
          this.madaraJumpPhase = 'none';
          this.madaraJumpPhaseTimer = 0;
        }

        // Strict Priority: Susanoo Pilot Idle > Raikiri Charge > Jutsu > Character Melee > Aerial Jump > Jump Land > Naruto Run > UAL Idle
        if (susanooPilotActive) {
          this.playerAnimState = 'idle';
          this.madaraJumpPhase = 'none';
          this.madaraJumpPhaseTimer = 0;
          this.madaraActiveAttackAction = null;
          if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.12, false, 1.0);
          } else {
            playerUal.idle.enabled = true;
            playerUal.idle.paused = false;
            playerUal.idle.setEffectiveTimeScale(1);
            if (!playerUal.idle.isRunning()) playerUal.idle.play();
          }
        } else if (isRaikiriCharging) {
          this.playerAnimState = 'run';
          const runRate = 1.44;
          if (playerUal.run) {
            if (playerUal.activeAction !== playerUal.run) {
              this.crossFadeUalPlayerAction(playerUal, playerUal.run, 0.10, false, runRate);
            } else {
              playerUal.run.enabled = true;
              playerUal.run.paused = false;
              playerUal.run.timeScale = runRate;
              if (!playerUal.run.isRunning()) playerUal.run.play();
            }
          } else if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.10, false, 1.0);
          }
        } else if (this.jutsuAnimTimer > 0 && playerUal.jutsu) {
          this.playerAnimState = 'attack';
          if (playerUal.activeAction !== playerUal.jutsu) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.jutsu, 0.08, true, 1.1);
          }
        } else if (this.isMadara && this.meleeAnimTimer > 0 && this.madaraActiveAttackAction) {
          this.playerAnimState = 'attack';
          if (playerUal.activeAction !== this.madaraActiveAttackAction) {
            this.crossFadeUalPlayerAction(playerUal, this.madaraActiveAttackAction, 0.07, true, 1.6);
          }
        } else if (isNonMadaraMeleeActive) {
          // Keep CharacterRoot upright on UAL Idle while each character's own `ccgq05.glb` melee overlays smoothly
          this.playerAnimState = 'attack';
          this.madaraJumpPhase = 'none';
          if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.08, false, 1.0);
          }
        } else if (!this.playerOnGround) {
          this.playerAnimState = 'idle';
          if (this.madaraJumpPhase === 'start' && playerUal.jumpStart) {
            if (playerUal.activeAction !== playerUal.jumpStart) {
              this.crossFadeUalPlayerAction(playerUal, playerUal.jumpStart, 0.08, true, 1.8);
            }
          } else if (playerUal.jumpLoop) {
            if (playerUal.activeAction !== playerUal.jumpLoop) {
              this.crossFadeUalPlayerAction(playerUal, playerUal.jumpLoop, 0.14, true, 1.0);
            }
          } else if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.14, false, 1.0);
          }
        } else if (this.madaraJumpPhase === 'land' && playerUal.jumpLand) {
          this.playerAnimState = 'idle';
          if (playerUal.activeAction !== playerUal.jumpLand) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.jumpLand, 0.07, true, 2.0);
          }
        } else if (moving || (hasMoveIntent && speedRatio > 0.05)) {
          this.playerAnimState = 'run';
          const runRate = 0.72 + speedRatio * 0.72;
          if (playerUal.run) {
            if (playerUal.activeAction !== playerUal.run) {
              this.crossFadeUalPlayerAction(playerUal, playerUal.run, 0.14, false, runRate);
            } else {
              playerUal.run.enabled = true;
              playerUal.run.paused = false;
              playerUal.run.timeScale = runRate;
              if (!playerUal.run.isRunning()) playerUal.run.play();
            }
          } else if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.14, false, 1.0);
          }
        } else {
          this.playerAnimState = 'idle';
          if (playerUal.activeAction !== playerUal.idle) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.14, false, 1.0);
          } else {
            playerUal.idle.enabled = true;
            playerUal.idle.paused = false;
            playerUal.idle.setEffectiveTimeScale(1);
            if (!playerUal.idle.isRunning()) playerUal.idle.play();
          }
        }

        this.stopFadedUalPlayerActions(playerUal);
        this.customObito.mixer.update(dt);
        const playerUalRunActiveOrFading = Boolean(
          !susanooPilotActive &&
            playerUal.run &&
            (playerUal.activeAction === playerUal.run ||
              (playerUal.run.isRunning() && playerUal.run.getEffectiveWeight() > 0.01))
        );
        playerNativeRunDriving = playerUalRunActiveOrFading;
        if (this.customObito.hasSkeleton && !playerUalRunActiveOrFading) {
          this.anchorRigHipsParentToRest(
            this.customObito.bones,
            this.customObito.baseBoneRotations,
            this.customObito.baseBonePositions
          );
        }

        this.playerBakedRunBlend = THREE.MathUtils.damp(
          this.playerBakedRunBlend,
          !susanooPilotActive && useBakedRunFallback && this.playerAnimState === 'run' ? 1 : 0,
          this.playerAnimState === 'run' ? 16 : 26,
          dt
        );

        if (runCombatDriving && this.bakedCombatAnim && this.playerCombatTargetState) {
          const combatHipsDy = this.bakedCombatAnim.applyPoseAtTime(
            this.playerCombatTargetState,
            this.runCombatClipTime,
            this.runCombatBlend,
            true
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(combatHipsDy, -0.45, 0.25);
        } else if (
          useBakedRunFallback &&
          this.playerBakedRunBlend > 0.02 &&
          this.bakedRunAnim &&
          this.playerRunTargetState
        ) {
          this.playerRunTime += dt * (isRaikiriCharging ? 1.44 : 0.72 + speedRatio * 0.72);
          const hipsDy = this.bakedRunAnim.applyPose(
            this.playerRunTargetState,
            this.playerRunTime,
            this.playerBakedRunBlend,
            true
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(hipsDy, -0.45, 0.22);
        } else {
          this.customObito.pivotGroup.position.y = THREE.MathUtils.damp(
            this.customObito.pivotGroup.position.y,
            0,
            18,
            dt
          );
        }
      } else {
      const isAttackClipPlaying = Boolean(
        this.customObito.attackAction && this.customObito.attackAction.isRunning()
      );
      const runCombatDriving = Boolean(
        canDriveRunCombat &&
          this.runCombatBlend > 0.002 &&
          this.bakedCombatAnim &&
          this.playerCombatTargetState
      );

      // Strict Priority: 1) Attack  2) Run  3) Idle — never two states active at once.
      // Let `idleAction`/`runAction` resume the instant `runCombatActive` ends so the 0.18s
      // `runCombatBlend` fade-out crossfades cleanly onto a live upright pose instead of frozen run pitch.
      const isRaikiriCharging = this.playerRaikiriState?.phase === 'charging';
      const wantsAttackState = !isRaikiriCharging && (
        this.customObitoIsRunSource
          ? isAttackClipPlaying || this.runCombatActive || this.meleeAnimTimer > 0 || this.playerRaikiriState?.phase === 'strike'
          : isAttackingOrJutsu || isAttackClipPlaying
      );
      const wantsRunState =
        isRaikiriCharging ||
        (!wantsAttackState &&
          this.playerOnGround &&
          (moving || (hasMoveIntent && speedRatio > 0.05)));
      const nextAnimState: PlayerAnimState = susanooPilotActive
        ? 'idle'
        : wantsAttackState
          ? 'attack'
          : wantsRunState
            ? 'run'
            : 'idle';

      const useRetargetedRun = Boolean(
        this.bakedRunAnim && this.playerRunTargetState && !this.customObito.runAction
      );
      const useBakedIdle = Boolean(
        this.customObitoIsRunSource &&
          !this.customObito.idleAction &&
          this.bakedRunIdleAnim &&
          this.playerIdleTargetState
      );

      const idleAction = this.customObito.idleAction;
      const runAction = this.customObito.runAction;
      const attackAction = this.customObito.attackAction;

      if (justLanded || justFinishedAction) {
        const clipDrivingBody = Boolean(
          this.customObitoIsRunSource && ((idleAction && idleAction.isRunning()) || (runAction && runAction.isRunning()))
        );
        this.resetPlayerPitchAndRoll(!clipDrivingBody);
      }

      // Discrete State Machine transitions via crossFadeTo (mutual exclusion, warp = false so 0.63s run vs 5.1s idle never skews speed)
      if (nextAnimState !== this.playerAnimState) {
        const prevState = this.playerAnimState;
        this.playerAnimState = nextAnimState;

        if (nextAnimState === 'attack') {
          // Attack takes 100% priority: fade out both Idle and Run immediately
          idleAction?.fadeOut(0.08);
          runAction?.fadeOut(0.08);
        } else if (nextAnimState === 'run') {
          if (attackAction?.isRunning()) attackAction.fadeOut(0.12);
          if (runAction && !useRetargetedRun) {
            runAction.enabled = true;
            runAction.paused = false;
            runAction.reset().setEffectiveTimeScale(0.72 + speedRatio * 0.72).setEffectiveWeight(1).play();
            if (prevState === 'idle' && idleAction && idleAction.isRunning()) {
              idleAction.crossFadeTo(runAction, 0.14, false);
            } else {
              idleAction?.stop();
            }
          } else {
            idleAction?.fadeOut(0.12);
          }
        } else {
          // nextAnimState === 'idle'
          if (attackAction?.isRunning()) attackAction.fadeOut(0.10);
          if (idleAction) {
            idleAction.enabled = true;
            idleAction.paused = false;
            idleAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
            if (prevState === 'run' && runAction && runAction.isRunning()) {
              runAction.crossFadeTo(idleAction, 0.10, false);
            } else {
              runAction?.stop();
            }
          } else {
            runAction?.fadeOut(0.10);
          }
        }
      }

      // Per-frame speed sync & cleanup once crossFade completes so inactive actions truly stop
      if (this.customObito.mixer) {
        if (this.playerAnimState === 'run') {
          if (runAction && !useRetargetedRun) {
            runAction.enabled = true;
            runAction.paused = false;
            runAction.timeScale = 0.72 + speedRatio * 0.72;
            if (!runAction.isRunning()) {
              runAction.play();
            }
            if (!idleAction || !idleAction.isRunning()) {
              runAction.setEffectiveWeight(1);
            }
          }
          if (idleAction && idleAction.isRunning() && idleAction.getEffectiveWeight() <= 0.02) {
            idleAction.stop();
          }
        } else if (this.playerAnimState === 'idle') {
          if (runAction && runAction.isRunning() && runAction.getEffectiveWeight() <= 0.02) {
            runAction.stop();
          }
          if (idleAction) {
            idleAction.enabled = true;
            idleAction.paused = false;
            idleAction.setEffectiveTimeScale(1);
            if (!idleAction.isRunning()) {
              idleAction.play();
            }
            if (!runAction || !runAction.isRunning()) {
              idleAction.setEffectiveWeight(1);
            }
          }
        } else if (this.playerAnimState === 'attack') {
          if (idleAction && idleAction.isRunning() && idleAction.getEffectiveWeight() <= 0.02) {
            idleAction.stop();
          }
          if (runAction && runAction.isRunning() && runAction.getEffectiveWeight() <= 0.02) {
            runAction.stop();
          }
        }
        this.customObito.mixer.update(dt);
        const nativeRunActiveOrFading = Boolean(
          runAction &&
            (this.playerAnimState === 'run' ||
              (runAction.isRunning() && runAction.getEffectiveWeight() > 0.01))
        );
        playerNativeRunDriving = nativeRunActiveOrFading;
        if (this.customObito.hasSkeleton && !nativeRunActiveOrFading) {
          this.anchorRigHipsParentToRest(
            this.customObito.bones,
            this.customObito.baseBoneRotations,
            this.customObito.baseBonePositions
          );
        }
      }

      const activeRunWeight =
        runAction && runAction.isRunning() ? runAction.getEffectiveWeight() : 0;
      const activeIdleWeight =
        idleAction && idleAction.isRunning() ? idleAction.getEffectiveWeight() : 0;

      this.playerBakedRunBlend = THREE.MathUtils.damp(
        this.playerBakedRunBlend,
        useRetargetedRun && this.playerAnimState === 'run' ? 1 : 0,
        this.playerAnimState === 'run' ? 16 : 26,
        dt
      );
      const bakedRunActive = useRetargetedRun && this.playerBakedRunBlend > 0.02;

      this.playerBakedIdleBlend = THREE.MathUtils.damp(
        this.playerBakedIdleBlend,
        useBakedIdle && this.playerAnimState === 'idle' ? 1 : 0,
        this.playerAnimState === 'idle' ? 22 : 20,
        dt
      );
      const bakedIdleActive = useBakedIdle && this.playerBakedIdleBlend > 0.02;

      // tobi_run animates CharacterRoot without a Hips.quaternion track; keep Hips anchored
      // to bind pose during run/combat fade-out, while letting p620ou.fbx idleAction drive Hips when idle.
      if (
        this.customObitoIsRunSource &&
        this.customObito.hasSkeleton &&
        this.customObito.bones.hips &&
        !this.runCombatActive &&
        !isAttackClipPlaying &&
        this.meleeAnimTimer <= 0 &&
        this.playerAnimState === 'run' &&
        runAction &&
        runAction.isRunning()
      ) {
        const hips = this.customObito.bones.hips;
        const baseHipsRot = this.customObito.baseBoneRotations.get(hips);
        const baseHipsPos = this.customObito.baseBonePositions.get(hips);
        if (runCombatDriving) {
          if (baseHipsRot) hips.rotation.copy(baseHipsRot);
          if (baseHipsPos) hips.position.copy(baseHipsPos);
        } else {
          if (baseHipsRot) {
            _tempQuatA.setFromEuler(baseHipsRot);
            hips.quaternion.slerp(_tempQuatA, 1 - Math.exp(-20 * dt));
          }
          if (baseHipsPos) {
            hips.position.lerp(baseHipsPos, 1 - Math.exp(-20 * dt));
          }
        }
      }

      if (runCombatDriving && this.bakedCombatAnim && this.playerCombatTargetState) {
        const hasUnderlayPose = activeRunWeight > 0.02 || activeIdleWeight > 0.02;
        const combatHipsDy = this.bakedCombatAnim.applyPoseAtTime(
          this.playerCombatTargetState,
          this.runCombatClipTime,
          this.runCombatBlend,
          hasUnderlayPose
        );
        this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(combatHipsDy, -0.45, 0.25);
      } else if (bakedRunActive && this.bakedRunAnim && this.playerRunTargetState) {
        this.playerRunTime += dt * (0.72 + speedRatio * 0.72);
        if (bakedIdleActive && this.bakedRunIdleAnim && this.playerIdleTargetState && this.playerBakedRunBlend < 0.999) {
          // Crossfade smoothly between live idle pose and run pose with zero A-pose pop
          this.playerIdleTime += dt;
          const idleDy = this.bakedRunIdleAnim.applyPose(
            this.playerIdleTargetState,
            this.playerIdleTime,
            1.0,
            false
          );
          const hipsDy = this.bakedRunAnim.applyPose(
            this.playerRunTargetState,
            this.playerRunTime,
            this.playerBakedRunBlend,
            true
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.lerp(
            THREE.MathUtils.clamp(idleDy, -0.45, 0.25),
            THREE.MathUtils.clamp(hipsDy, -0.45, 0.22),
            this.playerBakedRunBlend
          );
        } else {
          const hipsDy = this.bakedRunAnim.applyPose(
            this.playerRunTargetState,
            this.playerRunTime,
            this.playerBakedRunBlend,
            false
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(hipsDy, -0.45, 0.22);
        }
      } else if (bakedIdleActive && this.bakedRunIdleAnim && this.playerIdleTargetState) {
        this.playerIdleTime += dt;
        const idleDy = this.bakedRunIdleAnim.applyPose(
          this.playerIdleTargetState,
          this.playerIdleTime,
          this.playerBakedIdleBlend,
          activeRunWeight > 0.02 || this.playerBakedIdleBlend < 0.99
        );
        this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(idleDy, -0.45, 0.25);
      } else {
        this.customObito.pivotGroup.position.y = THREE.MathUtils.damp(
          this.customObito.pivotGroup.position.y,
          0,
          14,
          dt
        );
      }

      const bakedRunDominant = bakedRunActive && this.playerBakedRunBlend > 0.16;
      const runClipDominant = bakedRunDominant || activeRunWeight > 0.18;
      const idleClipDominant = Boolean(
        (idleAction && activeIdleWeight > 0.2 && !bakedRunDominant) ||
          (bakedIdleActive && this.playerBakedIdleBlend > 0.2)
      );
      // Keep `run` / `Mask Man V2` strictly anchored to its native Standing_Idle / tobi_run clips
      // so casting jutsus or crossfading never applies raw FBX bind-pose Euler overrides (`بيطوف`).
      const hasActiveIdleOrRunClip = Boolean(
        (this.customObitoIsRunSource || (this.isDeidara && !isAttackingOrJutsu)) &&
          ((idleAction && idleAction.isRunning()) ||
            (runAction && runAction.isRunning()) ||
            bakedIdleActive ||
            bakedRunActive)
      );
      this.customObito.pivotGroup.rotation.x = 0;
      this.customObito.pivotGroup.rotation.z = 0;

      if (this.customObito.hasSkeleton) {
        const { bones, baseBoneRotations, baseBonePositions } = this.customObito;
        const bx = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.x ?? 0 : 0);
        const by = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.y ?? 0 : 0);
        const bz = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.z ?? 0 : 0);

        const breath = Math.sin(elapsed * 2.1) * 0.72 + Math.sin(elapsed * 0.92) * 0.28;
        const idleWeight = 1 - moveAmp;
        const idleShift = Math.sin(elapsed * 0.68) * idleWeight;
        const landCurve = this.landingTimer > 0 ? Math.sin((this.landingTimer / 0.24) * Math.PI) : 0;

        // 1. Legs, Knees, Ankles & Pelvis (yields cleanly when embedded or baked Run/Idle/Attack clips drive the skeleton)
        if (
          !runClipDominant &&
          !idleClipDominant &&
          !hasActiveIdleOrRunClip &&
          !isAttackClipPlaying &&
          !runCombatDriving
        ) {
          let targetLeftThighX = bx(bones.leftThigh) - 0.18 * idleWeight;
          let targetRightThighX = bx(bones.rightThigh) + 0.20 * idleWeight;
          let targetLeftShinX = bx(bones.leftShin) + 0.34 * idleWeight;
          let targetRightShinX = bx(bones.rightShin) + 0.28 * idleWeight;
          let targetLeftFootX = bx(bones.leftFoot) - 0.10 * idleWeight;
          let targetRightFootX = bx(bones.rightFoot) - 0.12 * idleWeight;

          if (this.meleeAnimTimer > 0) {
            const p = 1 - this.meleeAnimTimer / this.meleeAnimDuration;
            const lunge = Math.sin(p * Math.PI);
            if (this.meleeStep === 0 || this.meleeStep === 1) {
              // Deep Storm 4 forward lunge (Video 00:08)
              targetLeftThighX -= 0.56 * lunge;
              targetRightThighX += 0.52 * lunge;
              targetLeftShinX += 0.68 * lunge;
              targetRightShinX += 0.18 * lunge;
            } else if (this.meleeStep === 2) {
              // Crouched spinning whirlwind legs (Video 00:03)
              targetLeftThighX -= 0.38 * lunge;
              targetRightThighX -= 0.32 * lunge;
              targetLeftShinX += 0.72 * lunge;
              targetRightShinX += 0.68 * lunge;
            } else {
              // Wide braced chain-lash stance (Video 00:05)
              targetLeftThighX -= 0.44 * lunge;
              targetRightThighX += 0.48 * lunge;
              targetLeftShinX += 0.62 * lunge;
              targetRightShinX += 0.42 * lunge;
            }
          } else if (!this.playerOnGround) {
            const airBias = THREE.MathUtils.clamp(-this.playerVel.y * 0.04, -0.2, 0.25);
            targetLeftThighX -= 0.44 + airBias * 0.4;
            targetRightThighX += 0.22 - airBias * 0.3;
            targetLeftShinX += 0.74;
            targetRightShinX += 0.45;
            targetLeftFootX += 0.32;
            targetRightFootX += 0.24;
          } else if (moveAmp > 0.01) {
            targetLeftThighX -= legSwing;
            targetRightThighX += legSwing;
            const kneeBase = 0.20 + 0.12 * sprintBlend;
            const kneePush = 0.38 + 0.26 * sprintBlend;
            const kneeDrive = 0.22 + 0.18 * sprintBlend;
            targetLeftShinX += (kneeBase + kneePush * Math.max(0, -phaseL) + kneeDrive * Math.max(0, phaseL)) * moveAmp;
            targetRightShinX += (kneeBase + kneePush * Math.max(0, -phaseR) + kneeDrive * Math.max(0, phaseR)) * moveAmp;

            targetLeftFootX += Math.cos(this.walkPhase) * 0.26 * moveAmp;
            targetRightFootX -= Math.cos(this.walkPhase) * 0.26 * moveAmp;
          }

          if (landCurve > 0) {
            targetLeftThighX -= 0.30 * landCurve;
            targetRightThighX -= 0.26 * landCurve;
            targetLeftShinX += 0.60 * landCurve;
            targetRightShinX += 0.56 * landCurve;
            targetLeftFootX -= 0.22 * landCurve;
            targetRightFootX -= 0.20 * landCurve;
          }

          if (bones.leftThigh) bones.leftThigh.rotation.x = THREE.MathUtils.damp(bones.leftThigh.rotation.x, targetLeftThighX, 17, dt);
          if (bones.rightThigh) bones.rightThigh.rotation.x = THREE.MathUtils.damp(bones.rightThigh.rotation.x, targetRightThighX, 17, dt);
          if (bones.leftShin) bones.leftShin.rotation.x = THREE.MathUtils.damp(bones.leftShin.rotation.x, targetLeftShinX, 17, dt);
          if (bones.rightShin) bones.rightShin.rotation.x = THREE.MathUtils.damp(bones.rightShin.rotation.x, targetRightShinX, 17, dt);
          if (bones.leftFoot) bones.leftFoot.rotation.x = THREE.MathUtils.damp(bones.leftFoot.rotation.x, targetLeftFootX, 17, dt);
          if (bones.rightFoot) bones.rightFoot.rotation.x = THREE.MathUtils.damp(bones.rightFoot.rotation.x, targetRightFootX, 17, dt);

          if (bones.hips) {
            const basePos = baseBonePositions.get(bones.hips);
            const crouchDrop =
              -0.055 * idleWeight +
              (-0.04 * stalkBlend - 0.08 * sprintBlend) * moveAmp -
              0.14 * landCurve -
              (this.meleeAnimTimer > 0 ? 0.14 * Math.sin((this.meleeAnimTimer / this.meleeAnimDuration) * Math.PI) : 0);
            const strideBob =
              Math.abs(Math.sin(this.walkPhase)) * (0.03 * stalkBlend + 0.055 * sprintBlend) * moveAmp +
              breath * 0.01 * idleWeight;
            const swayX = Math.sin(this.walkPhase) * 0.025 * moveAmp + idleShift * 0.02;
            const punchLungeZ =
              this.meleeAnimTimer > 0 ? Math.sin((this.meleeAnimTimer / this.meleeAnimDuration) * Math.PI) * 0.14 : 0;

            bones.hips.position.y = THREE.MathUtils.damp(bones.hips.position.y, (basePos?.y ?? 1.0) + crouchDrop + strideBob, 16, dt);
            bones.hips.position.x = THREE.MathUtils.damp(bones.hips.position.x, (basePos?.x ?? 0) + swayX, 13, dt);
            bones.hips.position.z = THREE.MathUtils.damp(bones.hips.position.z, (basePos?.z ?? 0) + punchLungeZ, 16, dt);
          }
        }

        // 2. Arms, Elbows, Spine, Chest & Head (yields to embedded or baked Run/Idle/Attack clips)
        if (
          !runClipDominant &&
          !isAttackClipPlaying &&
          !runCombatDriving &&
          !hasActiveIdleOrRunClip &&
          (!idleClipDominant || isAttackingOrJutsu)
        ) {
          let targetLeftArmX = bx(bones.leftUpperArm);
          let targetRightArmX = bx(bones.rightUpperArm);
          let targetLeftArmZ = bz(bones.leftUpperArm);
          let targetRightArmZ = bz(bones.rightUpperArm);
          let targetLeftForeX = bx(bones.leftForearm);
          let targetLeftForeY = by(bones.leftForearm);
          let targetRightForeX = bx(bones.rightForearm);
          let targetRightForeY = by(bones.rightForearm);

          let targetHipsY = by(bones.hips);
          let targetHipsZ = bz(bones.hips);
          let targetSpineX = bx(bones.spine);
          let targetSpineY = by(bones.spine);
          let targetSpineZ = bz(bones.spine);
          let targetChestX = bx(bones.chest);
          let targetChestY = by(bones.chest);
          let targetChestZ = bz(bones.chest);
          let targetHeadX = bx(bones.head);
          let targetHeadY = by(bones.head);
          let targetHeadZ = bz(bones.head);

          if (this.meleeAnimTimer > 0) {
            const p = 1 - this.meleeAnimTimer / this.meleeAnimDuration;

            if (this.meleeStep === 0) {
              // Hit 1 (Video 00:08): Deep Lunge Straight Right Palm/Strike
              const snap = p < 0.2 ? -0.3 * (p / 0.2) : Math.sin(Math.min(1, (p - 0.2) / 0.8) * Math.PI);
              targetRightArmX -= 1.72 * snap;
              targetRightArmZ += 0.22 * Math.max(0, snap);
              targetRightForeY += p < 0.2 ? 0.6 : 0.05;
              targetLeftArmX += 0.55 * snap;
              targetLeftArmZ -= 0.1;
              targetLeftForeY -= 0.45;
              targetHipsY += 0.34 * snap;
              targetSpineY += 0.28 * snap;
              targetChestY += 0.32 * snap;
              targetSpineX += 0.24 * Math.max(0, snap);
              targetChestX += 0.2 * Math.max(0, snap);
              targetHeadX -= 0.3 * Math.max(0, snap);
              targetHeadY -= 0.55 * snap;
            } else if (this.meleeStep === 1) {
              // Hit 2 (Video 00:02/00:09): Cross-Body Diagonal Slash Sweep
              const sweep = Math.sin(p * Math.PI);
              targetLeftArmX -= 1.68 * sweep;
              targetLeftArmZ += 0.35 * sweep;
              targetLeftForeY -= 0.18 * sweep;
              targetRightArmX -= 0.95 * sweep;
              targetRightArmZ -= 0.25 * sweep;
              targetRightForeY += 0.32;
              targetHipsY -= 0.38 * sweep;
              targetSpineY -= 0.32 * sweep;
              targetChestY -= 0.34 * sweep;
              targetSpineX += 0.22 * sweep;
              targetChestX += 0.18 * sweep;
              targetHeadX -= 0.26 * sweep;
              targetHeadY += 0.52 * sweep;
            } else if (this.meleeStep === 2) {
              // Hit 3 (Video 00:03): Low Crouched 360° Swirling Black Kamui Vortex Spin
              const spread = Math.sin(p * Math.PI);
              targetLeftArmX -= 0.35 * spread;
              targetLeftArmZ += 0.48 * spread;
              targetRightArmX -= 0.35 * spread;
              targetRightArmZ -= 0.48 * spread;
              targetLeftForeY -= 0.35 * spread;
              targetRightForeY += 0.35 * spread;
              targetSpineX += 0.28 * spread;
              targetChestX += 0.22 * spread;
              targetHeadX -= 0.32 * spread;
            } else {
              // Hit 4 (Video 00:05): Wide Martial Recoil + Double Chakra Chain Lash!
              const lash = p < 0.28 ? -0.35 * (p / 0.28) : Math.sin(((p - 0.28) / 0.72) * Math.PI);
              targetRightArmX -= 1.55 * lash;
              targetLeftArmX -= 1.42 * lash;
              targetRightArmZ -= 0.28 * Math.max(0, lash);
              targetLeftArmZ += 0.28 * Math.max(0, lash);
              targetRightForeY += p < 0.28 ? 0.55 : 0.08;
              targetLeftForeY -= p < 0.28 ? 0.55 : 0.08;
              targetSpineX -= 0.14 * lash;
              targetChestX -= 0.12 * lash;
              targetHeadX += 0.12 * lash;
            }
          } else if (this.jutsuAnimTimer > 0) {
            const jSwing = Math.sin((this.jutsuAnimTimer / this.jutsuAnimDuration) * Math.PI);
            if (this.activeJutsuAnim === 'katon') {
              targetRightArmX -= 1.56 * jSwing;
              targetLeftArmX -= 1.44 * jSwing;
              targetRightArmZ += 0.24 * jSwing;
              targetLeftArmZ -= 0.24 * jSwing;
              targetRightForeY += 0.15 * jSwing;
              targetLeftForeY -= 0.15 * jSwing;
              targetSpineX += 0.14 * jSwing;
              targetChestX += 0.12 * jSwing;
              targetHeadX -= 0.14 * jSwing;
            } else if (this.activeJutsuAnim === 'rinnegan' || this.activeJutsuAnim === 'gedo' || this.activeJutsuAnim === 'tsukuyomi') {
              targetRightArmX -= 1.78 * jSwing;
              targetLeftArmX -= 1.78 * jSwing;
              targetRightArmZ -= 0.18 * jSwing;
              targetLeftArmZ += 0.18 * jSwing;
              targetSpineX -= 0.1 * jSwing;
              targetChestX -= 0.12 * jSwing;
              targetHeadX += 0.1 * jSwing;
            } else if (this.activeJutsuAnim === 'kamui' || this.activeJutsuAnim === 'amaterasu') {
              targetRightArmX -= 1.55 * jSwing;
              targetRightArmZ += 0.34 * jSwing;
              targetRightForeY += 0.65 * jSwing;
              targetLeftArmX += 0.28 * jSwing;
              targetLeftForeY -= 0.35;
              targetHipsY += 0.18 * jSwing;
              targetChestY += 0.22 * jSwing;
              targetHeadY -= 0.24 * jSwing;
            } else {
              targetRightArmX -= 1.82 * jSwing;
              targetRightArmZ += 0.22 * jSwing;
              targetLeftArmX += 0.48 * jSwing;
              targetLeftForeY -= 0.42;
              targetHipsY += 0.24 * jSwing;
              targetSpineY += 0.2 * jSwing;
              targetChestY += 0.22 * jSwing;
              targetHeadY -= 0.35 * jSwing;
              targetSpineX += 0.16 * jSwing;
            }
          } else if (!this.playerOnGround) {
            targetLeftArmX += 0.72;
            targetRightArmX += 0.72;
            targetLeftArmZ -= 0.08;
            targetRightArmZ += 0.08;
            targetLeftForeY -= 0.24;
            targetRightForeY += 0.24;
            targetSpineX += 0.16;
            targetChestX += 0.14;
            targetHeadX -= 0.20;
          } else if (moveAmp > 0.01 && !runClipDominant) {
            // Storm 4 Ninja Glide -> Swept-Back Naruto Run (ZERO robotic back-and-forth arm swinging!)
            const windFlutter = Math.sin(this.walkPhase * 2) * 0.04 * sprintBlend;

            targetLeftArmX += -0.26 * stalkBlend + 1.26 * sprintBlend + windFlutter;
            targetRightArmX += 0.32 * stalkBlend + 1.26 * sprintBlend - windFlutter;
            // Negative Z lowers left arm beside coat; positive Z lowers right arm beside coat
            targetLeftArmZ -= 0.08 * stalkBlend + 0.12 * sprintBlend;
            targetRightArmZ += 0.08 * stalkBlend + 0.12 * sprintBlend;

            targetLeftForeY -= 0.36 * stalkBlend + 0.14 * sprintBlend;
            targetRightForeY += 0.18 * stalkBlend + 0.14 * sprintBlend;

            // Pelvic drop + subtle martial twist with chest counter-balance
            targetHipsY -= Math.cos(this.walkPhase) * 0.08 * moveAmp;
            targetHipsZ += Math.sin(this.walkPhase) * 0.045 * moveAmp;
            targetSpineY += Math.cos(this.walkPhase) * 0.05 * moveAmp;
            targetChestY += Math.cos(this.walkPhase) * 0.08 * moveAmp;
            targetChestZ -= Math.sin(this.walkPhase) * 0.025 * moveAmp;

            // Aerodynamic forward lean with strictly zero sideways roll/banking
            targetSpineX += 0.12 * stalkBlend + 0.24 * sprintBlend + 0.10 * landCurve;
            targetChestX += 0.08 * stalkBlend + 0.20 * sprintBlend + 0.08 * landCurve;

            targetHeadX -= 0.14 * stalkBlend + 0.36 * sprintBlend;
            targetHeadY -= Math.cos(this.walkPhase) * 0.04 * moveAmp;
          } else {
            // Upright balanced shinobi combat idle stance (zero sideways lean or crooked hip twist)
            targetSpineX += 0.02 + breath * 0.015 + 0.10 * landCurve;
            targetChestX += 0.02 + breath * 0.02 + 0.08 * landCurve;
            targetHeadX -= 0.03 + breath * 0.01;
            targetHeadY += Math.sin(elapsed * 0.72) * 0.05;

            // Left arm forward-low guard; right arm relaxed down-back by waist/cloak
            targetLeftArmX -= 0.34 - breath * 0.025;
            targetLeftArmZ -= 0.06 + breath * 0.02 + 0.08 * landCurve;
            targetLeftForeY -= 0.42 - breath * 0.03;

            targetRightArmX += 0.28 + breath * 0.03;
            targetRightArmZ += 0.06 + breath * 0.02 + 0.08 * landCurve;
            targetRightForeY += 0.16 + breath * 0.02;
          }

          const armRate = this.meleeAnimTimer > 0 || this.jutsuAnimTimer > 0 ? 24 : 13;
          const torsoRate = this.meleeAnimTimer > 0 ? 22 : 12;

          if (bones.hips) {
            bones.hips.rotation.y = THREE.MathUtils.damp(bones.hips.rotation.y, targetHipsY, torsoRate, dt);
            bones.hips.rotation.z = THREE.MathUtils.damp(bones.hips.rotation.z, targetHipsZ, torsoRate, dt);
          }
          if (bones.leftUpperArm) {
            bones.leftUpperArm.rotation.x = THREE.MathUtils.damp(bones.leftUpperArm.rotation.x, targetLeftArmX, armRate, dt);
            bones.leftUpperArm.rotation.z = THREE.MathUtils.damp(bones.leftUpperArm.rotation.z, targetLeftArmZ, armRate, dt);
          }
          if (bones.leftForearm) {
            bones.leftForearm.rotation.x = THREE.MathUtils.damp(bones.leftForearm.rotation.x, targetLeftForeX, armRate, dt);
            bones.leftForearm.rotation.y = THREE.MathUtils.damp(bones.leftForearm.rotation.y, targetLeftForeY, armRate, dt);
          }
          if (bones.rightUpperArm) {
            bones.rightUpperArm.rotation.x = THREE.MathUtils.damp(bones.rightUpperArm.rotation.x, targetRightArmX, armRate, dt);
            bones.rightUpperArm.rotation.z = THREE.MathUtils.damp(bones.rightUpperArm.rotation.z, targetRightArmZ, armRate, dt);
          }
          if (bones.rightForearm) {
            bones.rightForearm.rotation.x = THREE.MathUtils.damp(bones.rightForearm.rotation.x, targetRightForeX, armRate, dt);
            bones.rightForearm.rotation.y = THREE.MathUtils.damp(bones.rightForearm.rotation.y, targetRightForeY, armRate, dt);
          }
          if (bones.spine) {
            bones.spine.rotation.x = THREE.MathUtils.damp(bones.spine.rotation.x, targetSpineX, torsoRate, dt);
            bones.spine.rotation.y = THREE.MathUtils.damp(bones.spine.rotation.y, targetSpineY, torsoRate, dt);
            bones.spine.rotation.z = THREE.MathUtils.damp(bones.spine.rotation.z, targetSpineZ, torsoRate, dt);
          }
          if (bones.chest) {
            bones.chest.rotation.x = THREE.MathUtils.damp(bones.chest.rotation.x, targetChestX, torsoRate, dt);
            bones.chest.rotation.y = THREE.MathUtils.damp(bones.chest.rotation.y, targetChestY, torsoRate, dt);
            bones.chest.rotation.z = THREE.MathUtils.damp(bones.chest.rotation.z, targetChestZ, torsoRate, dt);
          }
          if (bones.head) {
            bones.head.rotation.x = THREE.MathUtils.damp(bones.head.rotation.x, targetHeadX, 12, dt);
            bones.head.rotation.y = THREE.MathUtils.damp(bones.head.rotation.y, targetHeadY, 12, dt);
            bones.head.rotation.z = THREE.MathUtils.damp(bones.head.rotation.z, targetHeadZ, 12, dt);
          }
        }
      }
      }
      if (this.customObito.hasSkeleton && !playerNativeRunDriving) {
        this.anchorRigHipsParentToRest(
          this.customObito.bones,
          this.customObito.baseBoneRotations,
          this.customObito.baseBonePositions
        );
      }
      if (this.customObitoPhysicsSolver && this.customObito.hasSkeleton) {
        this.customObitoPhysicsSolver.solve(dt);
      }
      if (this.customObitoCloakSolver && this.customObito.hasSkeleton) {
        const cloakYawRate = yawDiff / Math.max(dt, 0.008);
        this.customObitoCloakSolver.solve(
          dt,
          elapsed,
          this.moveVelX + this.playerVel.x,
          this.playerVel.y,
          this.moveVelZ + this.playerVel.z,
          cloakYawRate
        );
      }
      this.updateGunbaiSpring(dt, elapsed, speedRatio, false);
      this.customObito.root.rotation.x = 0;
      this.customObito.root.rotation.z = 0;
      this.customObito.pivotGroup.rotation.x = 0;
      this.customObito.pivotGroup.rotation.z = 0;
      const pilotGroundY =
        susanooPilotActive && this.activeSusanoo ? this.activeSusanoo.pilotWorldPos.y : this.playerPos.y;
      this.enforceSolidGroundContact(
        this.customObito.root,
        this.customObito.pivotGroup,
        this.customObito.bones,
        pilotGroundY,
        this.playerSoleClearance
      );
    }

    // Update organic white-and-cyan air slash ribbons attached to combat limbs (`run` & Madara UAL combo)
    this.slashRibbons.update(
      dt,
      this.camera,
      this.playerPos,
      this.customObito?.bones ?? null,
      Boolean(
        !this.playerDying &&
          ((this.customObitoIsRunSource && this.runCombatActive) ||
            (this.isMadara && this.meleeAnimTimer > 0 && this.madaraActiveAttackAction !== null))
      )
    );

    // Keep Kakashi's glowing Raikiri directly attached to his right hand during dash & strike
    if (this.playerRaikiriState && !this.playerDying) {
      const rk = this.playerRaikiriState;
      const handPos = this.getPlayerRightHandWorldPos(_tempVecA);
      const vfx = this.ensurePlayerRaikiriVfx();
      vfx.group.visible = true;
      vfx.group.position.copy(handPos);
      const pulse = 0.86 + Math.sin(elapsed * 42) * 0.22;
      vfx.group.scale.setScalar(rk.phase === 'strike' ? pulse * 1.32 : pulse);
      vfx.haloSprite.material.rotation = elapsed * 11;

      rk.sparkEmitTimer -= dt;
      if (rk.sparkEmitTimer <= 0) {
        rk.sparkEmitTimer = 0.04;
        this.skillParticles.spawn('lightning_sparks', handPos.x, handPos.y, handPos.z, 36, 0.84);
      }
      rk.boltTimer -= dt;
      if (rk.boltTimer <= 0) {
        rk.boltTimer = 0.045;
        this.spawnLightningBolt(
          handPos,
          new THREE.Vector3(
            handPos.x + (Math.random() - 0.5) * 1.55,
            Math.max(0.18, handPos.y + (Math.random() - 0.5) * 1.25),
            handPos.z + (Math.random() - 0.5) * 1.55
          ),
          false
        );
      }
      this.flashImpactLight(handPos.x, handPos.y + 0.15, handPos.z, 0x38bdf8, 22);
    } else {
      this.hidePlayerRaikiriVfx();
    }

    // Gently follow behind the player when moving forward/sideways (never swings violently on enemy movement)
    if (
      !isStriking &&
      moving &&
      !this.isDraggingCamera &&
      this.manualCameraHoldTimer <= 0 &&
      !this.keys['KeyQ'] &&
      !this.keys['KeyE'] &&
      inputZ <= 0.15
    ) {
      const behindYaw = this.playerYaw + Math.PI;
      let yawDiff = behindYaw - this.camYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.camYaw += yawDiff * (1 - Math.exp(-2.1 * dt));
    }

    // Update Obito Uchiha ghostly intangibility visual during 10-second Kamui
    this.updatePlayerIntangibilityVisual(elapsed);

    // Keep Kamui purple vortex completely hidden while preserving intangibility & pull mechanics
    this.kamuiPortalMesh.visible = false;
    this.kamuiOuterRingMesh.visible = false;
    const portalMat = this.kamuiPortalMesh.material as THREE.MeshBasicMaterial;
    const outerPortalMat = this.kamuiOuterRingMesh.material as THREE.MeshBasicMaterial;
    portalMat.opacity = 0;
    outerPortalMat.opacity = 0;
    if (this.kamuiTimer > 0) {
      const fx = Math.sin(this.playerYaw);
      const fz = Math.cos(this.playerYaw);
      const rx = -Math.cos(this.playerYaw);
      const rz = Math.sin(this.playerYaw);
      const forwardEyeOffset = (moving ? 0.68 : 0.44) * CHARACTER_WORLD_SCALE;
      const eyeY = this.playerPos.y + (moving ? 1.56 : 1.72) * CHARACTER_WORLD_SCALE;
      const portalX = this.playerPos.x + fx * forwardEyeOffset + rx * 0.085 * CHARACTER_WORLD_SCALE;
      const portalZ = this.playerPos.z + fz * forwardEyeOffset + rz * 0.085 * CHARACTER_WORLD_SCALE;

      const isPureIntangiblePhase = this.isIntangibleKamuiUser && this.kamuiTimer < 8.4;

      // Pull nearby enemies cleanly during initial burst without any purple vortex rings or swirls
      if (!isPureIntangiblePhase) {
        for (const e of this.enemies) {
          if (e.isDying || e.hp <= 0) continue;
          _tempVecA.set(portalX - e.pos.x, 0, portalZ - e.pos.z);
          const d = _tempVecA.length();
          if (d > 1.7 && d < 12.0) {
            _tempVecA.normalize();
            const pullStrength = 4.6 + (1 - d / 12.0) * 3.2;
            e.pos.x += _tempVecA.x * pullStrength * dt;
            e.pos.z += _tempVecA.z * pullStrength * dt;
          }
        }
      }
    }

    // Storm 4 Active Visuals: Guard Shield, Chakra Charge Ring, Awakening Aura
    const shieldMat = this.guardShieldMesh.material as THREE.MeshBasicMaterial;
    if (this.isGuarding && !this.guardBroken && !this.playerDying) {
      this.guardShieldMesh.visible = true;
      this.guardShieldMesh.position.set(this.playerPos.x, this.playerPos.y + 1.15 * CHARACTER_WORLD_SCALE, this.playerPos.z);
      this.guardShieldMesh.rotation.y += dt * 1.6;
      const gPct = Math.max(0.25, this.guardGauge / this.maxGuardGauge);
      shieldMat.color.setHex(gPct > 0.35 ? 0x38bdf8 : 0xf97316);
      shieldMat.opacity = 0.24 + Math.sin(elapsed * 12) * 0.06;
    } else {
      this.guardShieldMesh.visible = false;
    }

    const chargeMat = this.chakraChargeRingMesh.material as THREE.MeshBasicMaterial;
    if (this.isChargingChakra && !this.playerDying) {
      this.chakraChargeRingMesh.visible = true;
      this.chakraChargeRingMesh.position.set(this.playerPos.x, this.playerPos.y + 0.08, this.playerPos.z);
      this.chakraChargeRingMesh.rotation.z += dt * 6.5;
      const pulse = 0.92 + Math.sin(elapsed * 16) * 0.14;
      this.chakraChargeRingMesh.scale.setScalar(pulse);
      chargeMat.opacity = 0.72;
    } else {
      this.chakraChargeRingMesh.visible = false;
    }

    const awkMat = this.awakeningAuraMesh.material as THREE.MeshBasicMaterial;
    const awkRingMat = this.awakeningRingMesh.material as THREE.MeshBasicMaterial;
    if (this.awakeningActive && !this.playerDying) {
      this.awakeningAuraMesh.visible = true;
      this.awakeningAuraMesh.position.set(this.playerPos.x, this.playerPos.y + 1.1 * CHARACTER_WORLD_SCALE, this.playerPos.z);
      this.awakeningAuraMesh.rotation.y -= dt * 2.4;
      const auraPulse = 1.0 + Math.sin(elapsed * 14) * 0.08;
      this.awakeningAuraMesh.scale.setScalar(auraPulse);
      awkMat.opacity = 0.2 + Math.sin(elapsed * 14) * 0.06;

      this.awakeningRingMesh.visible = true;
      this.awakeningRingMesh.position.set(this.playerPos.x, this.playerPos.y + 0.07, this.playerPos.z);
      this.awakeningRingMesh.rotation.z -= dt * 4.5;
      awkRingMat.opacity = 0.65;
    } else {
      this.awakeningAuraMesh.visible = false;
      this.awakeningRingMesh.visible = false;
    }

    // 4. Update Thrown Giant Fuma Shurikens
    for (let i = this.thrownFumas.length - 1; i >= 0; i--) {
      const fuma = this.thrownFumas[i];
      fuma.elapsed += dt;
      fuma.mesh.rotation.z += dt * 22;

      if (!fuma.returning && fuma.elapsed > 0.65) {
        fuma.returning = true;
        fuma.hitIds.clear();
      }

      if (fuma.returning) {
        _tempVecA.set(
          this.playerPos.x - fuma.pos.x,
          this.playerPos.y + 1.25 * CHARACTER_WORLD_SCALE - fuma.pos.y,
          this.playerPos.z - fuma.pos.z
        );
        const distBack = _tempVecA.length();
        if (distBack < 1.5 || fuma.elapsed > 2.2) {
          this.scene.remove(fuma.mesh);
          this.disposeFumaMesh(fuma.mesh);
          this.thrownFumas.splice(i, 1);
          continue;
        }
        _tempVecA.normalize();
        fuma.pos.addScaledVector(_tempVecA, 21 * dt);
      } else {
        fuma.pos.x += fuma.dir.x * 23 * dt;
        fuma.pos.z += fuma.dir.z * 23 * dt;
      }

      fuma.pos.y = Math.max(0.45, fuma.pos.y);
      fuma.mesh.position.copy(fuma.pos);

      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0 || fuma.hitIds.has(enemy.id)) continue;
        if (
          Math.hypot(enemy.pos.x - fuma.pos.x, enemy.pos.z - fuma.pos.z) < 2.1 &&
          Math.abs(fuma.pos.y - (enemy.pos.y + 1.1 * CHARACTER_WORLD_SCALE)) < 2.0
        ) {
          fuma.hitIds.add(enemy.id);
          this.damageEnemy(enemy, 38, fuma.dir.x * 6, fuma.dir.z * 6, true);
        }
      }
    }

    // 5. Update Giant Glowing Fireball (Katon) + Trail + Impact Explosion
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.life += dt;
      fb.trailTimer += dt;
      fb.pos.addScaledVector(fb.vel, dt);
      fb.group.position.copy(fb.pos);
      fb.spinGroup.rotation.z += dt * 5.2;
      fb.spinGroup.rotation.y += dt * 3.4;

      for (let m = 0; m < fb.fireShaderMaterials.length; m++) {
        fb.fireShaderMaterials[m].uniforms.uTime.value = fb.life;
      }

      const grow = 1.0 + Math.sin(fb.life * 32) * 0.07 + fb.life * 0.38;
      fb.group.scale.setScalar(fb.baseScale * grow);

      for (let f = 0; f < fb.flameSprites.length; f++) {
        const fl = fb.flameSprites[f];
        fl.mat.rotation += fl.spinSpeed * dt;
        const flicker = 1 + Math.sin(fb.life * (24 + f * 7) + f) * 0.14;
        fl.sprite.scale.set(fl.baseScale * flicker, fl.baseScale * (2 - flicker * 0.95), 1);
      }

      // Dynamic ground illumination following up to 2 active fireballs via pooled PointLights
      const fbLightSlot = this.fireballs.length - 1 - i;
      if (fbLightSlot >= 0 && fbLightSlot < this.fireballGroundLights.length) {
        const fbLight = this.fireballGroundLights[fbLightSlot];
        fbLight.visible = true;
        fbLight.position.set(fb.pos.x, Math.max(0.65, fb.pos.y - 0.2), fb.pos.z);
        fbLight.color.setHex(0xf97316);
        fbLight.intensity = (fb.isMassive ? 50 : 34) + Math.sin(fb.life * 40) * 3.5;
      }

      // Leave turbulent flame-lick trail, dark billowing smoke clouds & scorching ground wisps
      const trailInterval =
        (fb.isMassive ? 0.055 : 0.032) * (this.performanceTier >= 2 ? 1.4 : 1.0);
      if (fb.trailTimer >= trailInterval) {
        fb.trailTimer = 0;
        const puffScale = Math.min(1.85, fb.baseScale);
        this.spawnSmokePuff(
          fb.pos.x + (Math.random() - 0.5) * 0.45 * puffScale,
          fb.pos.y + (Math.random() - 0.5) * 0.35 * puffScale,
          fb.pos.z + (Math.random() - 0.5) * 0.45 * puffScale,
          Math.random() > 0.42 ? 0xf97316 : 0xfef08a,
          0.95 * puffScale,
          2.25 * puffScale,
          0.26,
          0.78,
          true
        );
        this.spawnSmokePuff(
          fb.pos.x + (Math.random() - 0.5) * 0.6 * puffScale,
          fb.pos.y + 0.1 + (Math.random() - 0.5) * 0.4 * puffScale,
          fb.pos.z + (Math.random() - 0.5) * 0.6 * puffScale,
          0x31241e,
          0.75 * puffScale,
          2.5 * puffScale,
          0.56,
          0.46,
          false
        );
        if (fb.pos.y < 2.8 && Math.random() < 0.45) {
          this.spawnGroundMark(fb.pos.x, fb.pos.z, 'scorch', 2.2 * puffScale, 4.5, 0.48, 1.4);
        }
        this.spawnSingleSpark(
          fb.pos.x,
          fb.pos.y,
          fb.pos.z,
          Math.random() > 0.35 ? 0xfef08a : 0xf97316,
          (Math.random() - 0.5) * 5.5,
          1.5 + Math.random() * 2.8,
          (Math.random() - 0.5) * 5.5,
          0.38,
          5
        );
      }

      let impacted = false;
      const hitRadiusXZ = 2.2 * Math.max(1, fb.baseScale * 0.72);
      const hitRadiusY = 1.95 * Math.max(1, fb.baseScale * 0.72);
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        if (
          Math.hypot(enemy.pos.x - fb.pos.x, enemy.pos.z - fb.pos.z) < hitRadiusXZ &&
          Math.abs(fb.pos.y - (enemy.pos.y + 1.15)) < hitRadiusY
        ) {
          impacted = true;
          break;
        }
      }

      if (impacted || fb.life >= fb.maxLife || fb.pos.y <= 0.4) {
        this.detonateFireball(fb.pos, fb);
        this.disposeFireballResources(fb);
        this.fireballs.splice(i, 1);
      }
    }

    // 5b. Update Elemental Projectiles (Kakashi Lightning / Fire / Water)
    for (let i = this.elementalProjectiles.length - 1; i >= 0; i--) {
      const ep = this.elementalProjectiles[i];
      ep.life += dt;
      ep.trailTimer += dt;
      ep.pos.addScaledVector(ep.vel, dt);
      ep.group.position.copy(ep.pos);
      if (ep.spinGroup) {
        ep.spinGroup.rotation.z += dt * 5.8;
        ep.spinGroup.rotation.y += dt * 3.8;
      } else {
        ep.group.rotation.y += dt * 8.5;
      }

      for (let m = 0; m < ep.fireShaderMaterials.length; m++) {
        ep.fireShaderMaterials[m].uniforms.uTime.value = ep.life;
      }

      const pulse = 1.0 + Math.sin(ep.life * 28) * 0.08 + ep.life * 0.22;
      ep.group.scale.setScalar(ep.baseScale * pulse);

      for (let f = 0; f < ep.sprites.length; f++) {
        const sp = ep.sprites[f];
        sp.mat.rotation += sp.spinSpeed * dt;
        const flicker = 1 + Math.sin(ep.life * (22 + f * 6) + f) * 0.14;
        sp.sprite.scale.set(sp.baseScale * flicker, sp.baseScale * (2 - flicker * 0.95), 1);
      }

      if (ep.trailTimer >= 0.036) {
        ep.trailTimer = 0;
        if (ep.element === 'lightning') {
          const tailPos = ep.pos.clone().addScaledVector(ep.vel, -0.06);
          tailPos.x += (Math.random() - 0.5) * 1.15;
          tailPos.y += (Math.random() - 0.5) * 0.9;
          tailPos.z += (Math.random() - 0.5) * 1.15;
          this.spawnLightningBolt(ep.pos, tailPos, false);
        } else if (ep.element === 'water') {
          this.spawnSmokePuff(
            ep.pos.x + (Math.random() - 0.5) * 0.55,
            ep.pos.y + (Math.random() - 0.5) * 0.4,
            ep.pos.z + (Math.random() - 0.5) * 0.55,
            Math.random() > 0.4 ? 0x38bdf8 : 0xe0f2fe,
            0.95 * ep.baseScale,
            2.4 * ep.baseScale,
            0.34,
            0.76,
            true
          );
          if (Math.random() < 0.45) {
            this.spawnShockRing(ep.pos.x, Math.max(0.16, ep.pos.y - 0.45), ep.pos.z, 0x38bdf8, 2.6 * ep.baseScale, 0.22, 0.72);
          }
        } else {
          this.spawnSmokePuff(
            ep.pos.x + (Math.random() - 0.5) * 0.45,
            ep.pos.y + (Math.random() - 0.5) * 0.35,
            ep.pos.z + (Math.random() - 0.5) * 0.45,
            Math.random() > 0.4 ? 0xf97316 : 0xfef08a,
            0.85 * ep.baseScale,
            2.15 * ep.baseScale,
            0.28,
            0.74,
            true
          );
        }
      }

      let impacted = false;
      if (ep.owner === 'enemy') {
        if (!this.playerDying) {
          const pDist = Math.hypot(this.playerPos.x - ep.pos.x, this.playerPos.z - ep.pos.z);
          if (pDist < 1.85 && Math.abs(ep.pos.y - (this.playerPos.y + 1.05)) < 1.85) {
            if (this.kamuiTimer > 0) {
              if (!ep.kamuiBypassed) {
                ep.kamuiBypassed = true;
              }
            } else {
              impacted = true;
            }
          }
        }
      } else {
        for (const enemy of this.enemies) {
          if (enemy.isDying || enemy.hp <= 0) continue;
          if (
            Math.hypot(enemy.pos.x - ep.pos.x, enemy.pos.z - ep.pos.z) < 2.25 &&
            Math.abs(ep.pos.y - (enemy.pos.y + 1.15)) < 2.0
          ) {
            impacted = true;
            break;
          }
        }
      }

      if (impacted || ep.life >= ep.maxLife || ep.pos.y <= 0.35) {
        this.detonateElementalProjectile(ep.pos, ep);
        this.scene.remove(ep.group);
        ep.coreMat.dispose();
        ep.outerMat.dispose();
        for (const sm of ep.fireShaderMaterials) {
          sm.dispose();
        }
        ep.haloMat.dispose();
        for (const sp of ep.sprites) {
          sp.mat.dispose();
        }
        this.elementalProjectiles.splice(i, 1);
      }
    }

    // 5c. Update Amaterasu Black Flame Burn Zones (Itachi)
    for (let i = this.amaterasuZones.length - 1; i >= 0; i--) {
      const az = this.amaterasuZones[i];
      az.life += dt;
      az.particleTimer -= dt;
      az.dotTimer -= dt;

      if (az.targetEnemyId) {
        const target = this.enemies.find(
          (en) => en.id === az.targetEnemyId && !en.isDying && en.hp > 0
        );
        if (target) {
          az.pos.lerp(target.pos, 1 - Math.exp(-10 * dt));
        } else {
          az.targetEnemyId = null;
        }
      }
      az.group.position.set(az.pos.x, 0.05, az.pos.z);

      const fade =
        az.life > az.maxLife - 0.65
          ? Math.max(0, (az.maxLife - az.life) / 0.65)
          : Math.min(1, az.life / 0.18);

      az.ringMesh.rotation.z += dt * 1.8;
      az.ringMesh.scale.setScalar(2.65 + Math.sin(elapsed * 8) * 0.15);
      az.ringMat.opacity = 0.88 * fade;

      az.auraMesh.rotation.z -= dt * 2.2;
      az.auraMesh.scale.setScalar(3.35 + Math.cos(elapsed * 7) * 0.22);
      az.auraMat.opacity = (0.68 + Math.sin(elapsed * 10) * 0.14) * fade;

      for (let f = 0; f < az.flameSprites.length; f++) {
        const fl = az.flameSprites[f];
        const flicker = 0.92 + Math.sin(elapsed * 18 + fl.phase) * 0.16;
        const heightFlicker = 1.38 + Math.cos(elapsed * 15 + fl.phase * 1.3) * 0.24;
        fl.sprite.scale.set(
          fl.baseScale * flicker * fade,
          fl.baseScale * heightFlicker * fade,
          1
        );
        fl.sprite.position.set(
          fl.offsetX + Math.sin(elapsed * 7 + fl.phase) * 0.12,
          (fl.mat.blending === THREE.NormalBlending ? 1.15 : 0.95) + Math.abs(Math.sin(elapsed * 11 + fl.phase)) * 0.28,
          fl.offsetZ + Math.cos(elapsed * 7 + fl.phase) * 0.12
        );
        fl.mat.rotation += (f % 2 === 0 ? 1 : -1) * dt * 2.4;
        fl.mat.opacity = (fl.mat.blending === THREE.NormalBlending ? 0.92 : 0.68) * fade;
      }

      if (az.particleTimer <= 0) {
        az.particleTimer = 0.14;
        this.skillParticles.spawn('amaterasu_flames', az.pos.x, 0.35, az.pos.z, 46, 1.05);
        this.spawnSingleSpark(
          az.pos.x + (Math.random() - 0.5) * 2.0,
          0.15,
          az.pos.z + (Math.random() - 0.5) * 2.0,
          Math.random() > 0.45 ? 0x09090b : 0x9333ea,
          (Math.random() - 0.5) * 1.6,
          3.6 + Math.random() * 2.8,
          (Math.random() - 0.5) * 1.6,
          0.58,
          -2
        );
      }

      if (az.dotTimer <= 0) {
        az.dotTimer += 0.45;
        let burnedAny = false;
        for (const enemy of this.enemies) {
          if (enemy.isDying || enemy.hp <= 0) continue;
          const d = Math.hypot(enemy.pos.x - az.pos.x, enemy.pos.z - az.pos.z);
          if (d <= az.radius) {
            burnedAny = true;
            this.damageEnemy(enemy, az.dotDamage, 0, 0, false);
            this.spawnDamagePopup(
              enemy.pos,
              az.dotDamage,
              (enemy.isBoss ? 2.5 : 2.15) * CHARACTER_WORLD_SCALE
            );
            this.spawnSparks(enemy.pos, 0x6b21a8, 3, 6, 8);
          }
        }
        if (burnedAny) {
          this.flashImpactLight(az.pos.x, 1.3, az.pos.z, 0x6b21a8, 16);
        }
      }

      if (az.life >= az.maxLife) {
        this.scene.remove(az.group);
        az.ringMat.dispose();
        az.auraMat.dispose();
        for (const fl of az.flameSprites) {
          fl.mat.dispose();
        }
        this.amaterasuZones.splice(i, 1);
      }
    }

    // 5d. Update Deidara Clay Explosives (C1 Birds, C2 Dragon, C3 Bomb)
    for (let i = this.clayExplosives.length - 1; i >= 0; i--) {
      const ce = this.clayExplosives[i];
      ce.life += dt;
      ce.trailTimer += dt;

      if (ce.targetEnemyId) {
        const target = this.enemies.find(
          (en) => en.id === ce.targetEnemyId && !en.isDying && en.hp > 0
        );
        if (target) {
          _tempVecA.set(
            target.pos.x - ce.pos.x,
            target.pos.y + 1.15 * CHARACTER_WORLD_SCALE - ce.pos.y,
            target.pos.z - ce.pos.z
          );
          if (_tempVecA.lengthSq() > 0.04 && _tempVecA.lengthSq() <= ce.homingRange * ce.homingRange) {
            _tempVecA.normalize().multiplyScalar(ce.speed);
            ce.vel.lerp(_tempVecA, 1 - Math.exp(-5.5 * dt));
          }
        }
      }

      ce.pos.addScaledVector(ce.vel, dt);
      ce.group.position.copy(ce.pos);
      if (ce.kind !== 'c3_bomb' && ce.vel.lengthSq() > 0.01) {
        _tempVecA.copy(ce.vel).normalize();
        ce.group.quaternion.setFromUnitVectors(_forwardZ, _tempVecA);
      } else {
        ce.group.rotation.y += dt * 4.5;
      }

      const flap = Math.sin(elapsed * 20 + i) * 0.58;
      if (ce.leftWing) ce.leftWing.rotation.z = flap;
      if (ce.rightWing) ce.rightWing.rotation.z = -flap;

      if (ce.trailTimer >= 0.055) {
        ce.trailTimer = 0;
        this.spawnSmokePuff(
          ce.pos.x,
          ce.pos.y,
          ce.pos.z,
          0xf8fafc,
          0.42,
          1.35,
          0.34,
          0.55,
          false
        );
      }

      let impacted = false;
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        if (
          Math.hypot(enemy.pos.x - ce.pos.x, enemy.pos.z - ce.pos.z) < 2.25 &&
          Math.abs(ce.pos.y - (enemy.pos.y + 1.1)) < 2.25
        ) {
          impacted = true;
          break;
        }
      }

      if (impacted || ce.life >= ce.maxLife || ce.pos.y <= 0.35) {
        this.detonateClayExplosive(ce.pos, ce);
        this.scene.remove(ce.group);
        for (const mat of ce.materials) {
          mat.dispose();
        }
        this.clayExplosives.splice(i, 1);
      }
    }

    // 5e. Update Naruto Kurama Mode Projectiles (Rasenshuriken & Bijuu Dama)
    for (let i = this.kuramaProjectiles.length - 1; i >= 0; i--) {
      const kp = this.kuramaProjectiles[i];
      kp.life += dt;
      kp.trailTimer += dt;

      if (kp.targetEnemyId) {
        const target = this.enemies.find(
          (en) => en.id === kp.targetEnemyId && !en.isDying && en.hp > 0
        );
        if (target) {
          _tempVecA.set(
            target.pos.x - kp.pos.x,
            target.pos.y + 1.15 * CHARACTER_WORLD_SCALE - kp.pos.y,
            target.pos.z - kp.pos.z
          );
          if (_tempVecA.lengthSq() > 0.04) {
            _tempVecA.normalize().multiplyScalar(kp.speed);
            kp.vel.lerp(_tempVecA, 1 - Math.exp(-4.2 * dt));
          }
        }
      }

      kp.pos.addScaledVector(kp.vel, dt);
      kp.group.position.copy(kp.pos);
      if (kp.kind === 'rasenshuriken') {
        kp.spinGroup.rotation.y += dt * 28.0;
        kp.spinGroup.rotation.z = Math.sin(kp.life * 10) * 0.12;
      } else if (kp.kind === 'sage_odama') {
        kp.spinGroup.rotation.x += dt * 16.0;
        kp.spinGroup.rotation.y += dt * 22.0;
      } else {
        kp.spinGroup.rotation.x += dt * 12.0;
        kp.spinGroup.rotation.y += dt * 15.0;
      }
      const pulse = kp.baseScale * (1 + Math.sin(kp.life * 26) * 0.08 + kp.life * 0.18);
      kp.group.scale.setScalar(pulse);

      if (kp.trailTimer >= 0.04) {
        kp.trailTimer = 0;
        this.spawnSmokePuff(
          kp.pos.x,
          kp.pos.y,
          kp.pos.z,
          kp.kind === 'rasenshuriken' || kp.kind === 'sage_odama' ? 0x7dd3fc : 0xa855f7,
          0.75 * kp.baseScale,
          2.0 * kp.baseScale,
          0.26,
          0.7,
          true
        );
      }

      let impacted = false;
      for (const enemy of this.enemies) {
        if (enemy.isDying || enemy.hp <= 0) continue;
        if (
          Math.hypot(enemy.pos.x - kp.pos.x, enemy.pos.z - kp.pos.z) < 2.4 &&
          Math.abs(kp.pos.y - (enemy.pos.y + 1.15)) < 2.2
        ) {
          impacted = true;
          break;
        }
      }

      if (impacted || kp.life >= kp.maxLife || kp.pos.y <= 0.35) {
        this.detonateKuramaProjectile(kp.pos, kp);
        this.scene.remove(kp.group);
        for (const mat of kp.materials) {
          mat.dispose();
        }
        kp.haloMat.dispose();
        this.kuramaProjectiles.splice(i, 1);
      }
    }

    // 6. Update Falling Rinnegan Chakra Rods
    for (let i = this.fallingRods.length - 1; i >= 0; i--) {
      const rod = this.fallingRods[i];
      rod.life += dt;
      if (!rod.landed) {
        rod.pos.y += rod.velY * dt;
        if (rod.pos.y <= 0.9) {
          rod.pos.y = 0.9;
          rod.landed = true;
          this.spawnShockRing(rod.pos.x, 0.08, rod.pos.z, 0x38bdf8, 2.4, 0.35, 0.8);
          this.spawnGroundMark(rod.pos.x, rod.pos.z, 'crack', 2.2, 7.5, 0.72);
          this.spawnStoneDebris(rod.pos.x, rod.pos.z, 2, 4.5, 4.2);
          for (const enemy of this.enemies) {
            if (enemy.isDying || enemy.hp <= 0) continue;
            if (Math.hypot(enemy.pos.x - rod.pos.x, enemy.pos.z - rod.pos.z) < 2.2) {
              this.damageEnemy(enemy, 24, 0, 0, false);
            }
          }
        }
      }
      if (rod.life > 2.2) {
        this.scene.remove(rod.mesh);
        this.fallingRods.splice(i, 1);
      }
    }

    // 7. Update Shock Rings, Sphere Shocks, Smoke Puffs, Sparks & Transient VFX
    this.updateTransientVfx(dt, elapsed);

    if (this.finisherState) {
      this.updateFinisher(0.001, elapsed);
      return;
    }

    // Update Kawarimi Substitution Wooden Logs
    for (let i = this.substitutionLogEntities.length - 1; i >= 0; i--) {
      const sl = this.substitutionLogEntities[i];
      sl.life += dt;
      if (sl.group.position.y > 0.22 || sl.velY > 0) {
        sl.velY -= 19 * dt;
        sl.group.position.y += sl.velY * dt;
        sl.group.rotation.x += sl.rotVel.x * dt;
        sl.group.rotation.y += sl.rotVel.y * dt;
        sl.group.rotation.z += sl.rotVel.z * dt;
        if (sl.group.position.y <= 0.22) {
          sl.group.position.y = 0.22;
          if (Math.abs(sl.velY) > 1.8) {
            sl.velY = Math.abs(sl.velY) * 0.3;
            sl.rotVel.multiplyScalar(0.35);
          } else {
            sl.velY = 0;
            sl.rotVel.set(0, 0, 0);
          }
        }
      }
      if (sl.life > sl.maxLife - 0.35) {
        const s = Math.max(0.01, (sl.maxLife - sl.life) / 0.35);
        sl.group.scale.setScalar(s);
      }
      if (sl.life >= sl.maxLife) {
        this.scene.remove(sl.group);
        this.substitutionLogEntities.splice(i, 1);
      }
    }

    // 8. Update Enemies AI, Death Collapse Animation & Cleanup defeated
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) {
        if (!e.isDying) {
          e.isDying = true;
          e.deathTimer = 0;
          e.deathBlend = 0;
          e.deathDuration = this.bakedDeathAnim
            ? Math.max(2.5, this.bakedDeathAnim.duration - 0.04)
            : 1.05;
          e.stunTimer = 0;
          e.attackWindup = 0;
          e.hitFlashTimer = 0;
          e.combatActive = false;
          e.combatHitPending = false;
          e.combatBlend = 0;
          e.jutsuCastTimer = 0;
          e.raikiriTimer = 0;
          e.raikiriHitDone = true;
          e.rig.setHitFlash(false);
          e.idleAction?.fadeOut(0.16);
          e.runAction?.fadeOut(0.16);
          e.ualActions?.activeAction?.fadeOut(0.16);
          if (this.bakedDeathAnim && !e.deathTargetState) {
            e.deathTargetState = this.bakedDeathAnim.prepareTarget(
              e.rig.pivotGroup,
              e.rig.bones,
              e.rig.baseBoneRotations,
              e.rig.baseBonePositions
            );
          }
          this.score += e.isBoss ? 500 : 150;
          this.spawnSparks(e.pos, 0xef4444, 6);
        }

        e.deathTimer += dt;
        e.deathBlend = Math.min(1, e.deathBlend + dt / 0.16);

        e.pos.x += e.vel.x * dt;
        e.pos.z += e.vel.z * dt;
        e.vel.x = THREE.MathUtils.damp(e.vel.x, 0, 10, dt);
        e.vel.z = THREE.MathUtils.damp(e.vel.z, 0, 10, dt);
        const eDistDying = Math.hypot(e.pos.x, e.pos.z);
        const maxEnemyR = this.getActiveArenaRadius() - 1.2;
        if (eDistDying > maxEnemyR) {
          const nx = e.pos.x / eDistDying;
          const nz = e.pos.z / eDistDying;
          e.pos.x = nx * maxEnemyR;
          e.pos.z = nz * maxEnemyR;
        }
        e.pos.y = Math.max(0, e.pos.y);

        if (e.mixer) {
          if (e.ualActions) {
            const activeEnemyUal = e.ualActions.activeAction;
            if (activeEnemyUal && activeEnemyUal.isRunning() && activeEnemyUal.getEffectiveWeight() <= 0.02) {
              activeEnemyUal.stop();
            }
            this.stopFadedUalEnemyActions(e.ualActions);
          }
          if (e.idleAction && e.idleAction.isRunning() && e.idleAction.getEffectiveWeight() <= 0.02) {
            e.idleAction.stop();
          }
          if (e.runAction && e.runAction.isRunning() && e.runAction.getEffectiveWeight() <= 0.02) {
            e.runAction.stop();
          }
          e.mixer.update(dt);
        }

        const hasDeathUnderlay = Boolean(
          (e.idleAction && e.idleAction.isRunning()) ||
            (e.runAction && e.runAction.isRunning()) ||
            (e.ualActions?.activeAction && e.ualActions.activeAction.isRunning())
        );
        if (this.bakedDeathAnim && e.deathTargetState) {
          const dy = this.bakedDeathAnim.applyPoseAtTime(
            e.deathTargetState,
            e.deathTimer,
            e.deathBlend,
            hasDeathUnderlay
          );
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.95, 0.25);
        } else {
          const p = Math.min(1, e.deathTimer / Math.max(0.2, e.deathDuration));
          e.rig.pivotGroup.rotation.x = p * 1.42;
        }
        e.rig.pivotGroup.rotation.z = 0;
        e.rig.pivotGroup.position.z = 0;
        e.rig.root.position.copy(e.pos);
        e.rig.root.rotation.y = e.yaw;
        this.enforceSolidGroundContact(
          e.rig.root,
          e.rig.pivotGroup,
          e.rig.bones,
          e.pos.y,
          e.soleClearance
        );
        e.slashRibbons?.update(dt, this.camera, e.pos, e.rig.bones, false);
        e.shadow.position.set(e.pos.x, 0.03, e.pos.z);
        const fadeOutP = THREE.MathUtils.clamp(
          (e.deathTimer - (e.deathDuration - 0.35)) / 0.35,
          0,
          1
        );
        e.shadow.scale.setScalar(
          Math.max(0.15, (e.isBoss ? 1.45 : 1.0) * (1 - fadeOutP * 0.7))
        );

        if (e.deathTimer >= e.deathDuration) {
          this.spawnSparks(e.pos, 0xef4444, 12);
          this.spawnShockRing(e.pos.x, 0.2, e.pos.z, 0xdc2626, 3.0, 0.4);
          this.spawnSmokePuff(e.pos.x, e.pos.y + 0.75, e.pos.z, 0xe2e8f0, 0.85, 2.5, 0.65, 0.72);
          this.scene.remove(e.rig.root, e.shadow);
          e.slashRibbons?.dispose();
          e.rig.dispose();
          (e.shadow.material as THREE.Material).dispose();
          e.shadow.geometry.dispose();
          this.enemies.splice(i, 1);
        }
        continue;
      }

      _tempVecB.subVectors(this.playerPos, e.pos);
      _tempVecB.y = 0;
      const dist = _tempVecB.length();

      if (dist > 0.01) {
        _tempVecB.normalize();
        const targetYaw = Math.atan2(_tempVecB.x, _tempVecB.z);
        let diff = targetYaw - e.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        e.yaw += diff * (1 - Math.exp(-8 * dt));
      }

      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.jutsuCooldown = Math.max(0, e.jutsuCooldown - dt);
      if (e.jutsuCastTimer > 0) e.jutsuCastTimer = Math.max(0, e.jutsuCastTimer - dt);

      const isStunned = e.stunTimer > 0;
      if (isStunned) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.attackWindup = 0;
        e.combatActive = false;
        e.combatHitPending = false;
        e.jutsuCastTimer = 0;
        e.stunSparkTimer -= dt;
        if (e.stunSparkTimer <= 0) {
          e.stunSparkTimer = 0.16;
          this.spawnSparks(e.pos, Math.random() > 0.5 ? 0xc084fc : 0x38bdf8, 2, 5, 8);
        }
      }

      const isKakashiEnemy = e.kind === 'kakashi';

      // Advance Kakashi's `ccgq05.glb` 3-hit martial combat state machine at 1.5x Tobi V2 speed
      if (isKakashiEnemy) {
        if (e.combatActive && this.bakedCombatAnim && e.combatTargetState) {
          e.combatClipTime += dt * RUN_COMBO_SPEED;
          e.combatBlend = Math.min(1, e.combatBlend + dt / 0.08);

          if (e.combatHitPending && e.combatClipTime >= e.combatHitTime) {
            e.combatHitPending = false;
            if (!isStunned && dist <= 3.4) {
              if (this.playerPos.y < 1.9) {
                this.applyDamageToPlayer(e.damage, 0x38bdf8, false);
              }
            }
          }

          if (e.combatClipTime >= e.combatEndTime) {
            e.combatClipTime = e.combatEndTime;
            e.combatActive = false;
            e.combatHitPending = false;
          }
        } else if (e.combatBlend > 0) {
          e.combatBlend = Math.max(0, e.combatBlend - dt / 0.18);
        }
      }

      const isMadaraUalEnemy = Boolean(
        e.kind === 'madara' && e.ualActions && e.ualActions.combo.length > 0
      );
      const isMoving =
        !this.playerDying &&
        !isStunned &&
        !e.combatActive &&
        !(isMadaraUalEnemy && e.attackWindup > 0) &&
        e.jutsuCastTimer <= 0 &&
        dist > (isKakashiEnemy ? 2.85 : isMadaraUalEnemy ? 2.8 : 2.6);

      if (isMoving) {
        e.pos.x += _tempVecB.x * e.speed * dt;
        e.pos.z += _tempVecB.z * e.speed * dt;
        const speedNorm = THREE.MathUtils.clamp(e.speed / 6.0, 0.4, 1.0);
        e.walkPhase += dt * (4.8 + speedNorm * 10.5);
      }

      if (isKakashiEnemy && !isStunned && !this.playerDying) {
        if (!e.combatActive && e.jutsuCastTimer <= 0 && dist <= 3.15 && e.attackCooldown <= 0 && this.bakedCombatAnim && e.combatTargetState) {
          const win = RUN_COMBO_WINDOWS[e.combatStep % RUN_COMBO_WINDOWS.length];
          const maxDur = this.bakedCombatAnim.duration;
          const start = Math.min(win.start, Math.max(0, maxDur - 0.35));
          const end = Math.min(win.end, maxDur);
          const hitTime = THREE.MathUtils.clamp(win.hitTime, start + 0.04, Math.max(start + 0.05, end - 0.04));

          e.combatStep = (e.combatStep + 1) % RUN_COMBO_WINDOWS.length;
          e.combatActive = true;
          e.combatClipTime = start;
          e.combatEndTime = end;
          e.combatHitTime = hitTime;
          e.combatHitPending = true;
          e.attackCooldown = 1.15;
          e.vel.x += _tempVecB.x * 5.2;
          e.vel.z += _tempVecB.z * 5.2;
        } else if (!e.combatActive && e.jutsuCastTimer <= 0 && e.jutsuCooldown <= 0 && dist <= 20) {
          const cycle = e.jutsuCycle % 3;
          e.jutsuCycle += 1;
          e.jutsuCooldown = 3.5 + Math.random() * 1.1;
          e.jutsuCastTimer = 0.38;
          e.attackCooldown = Math.max(e.attackCooldown, 0.65);
          const jKind: 'lightning' | 'fire' | 'water' =
            cycle === 0 ? 'lightning' : cycle === 1 ? 'fire' : 'water';
          this.performEnemyKakashiJutsu(e, jKind);
        }
      } else if (
        !isMoving &&
        !isStunned &&
        !this.playerDying &&
        e.attackCooldown <= 0 &&
        e.attackWindup <= 0
      ) {
        if (isMadaraUalEnemy && e.ualActions && dist <= 3.15) {
          const combo = e.ualActions.combo;
          const step = e.combatStep % combo.length;
          e.combatStep = (e.combatStep + 1) % combo.length;
          const strikeAction = combo[step];
          const strikeSpeed = 1.45;
          const strikeDur = THREE.MathUtils.clamp(
            strikeAction.getClip().duration / strikeSpeed,
            0.42,
            0.72
          );
          e.attackWindup = strikeDur;
          e.combatHitTime = strikeDur * 0.52;
          e.combatHitPending = true;
          e.attackCooldown = e.isBoss ? 1.35 : 1.75;
          e.vel.x += _tempVecB.x * 5.0;
          e.vel.z += _tempVecB.z * 5.0;
          this.crossFadeUalEnemyAction(e.ualActions, strikeAction, 0.08, true, strikeSpeed);
        } else if (!isMadaraUalEnemy) {
          e.attackWindup = 0.28;
          e.attackCooldown = e.isBoss ? 1.25 : 1.75;

          // Deal damage unless Obito is phasing with Kamui or blocking with Guard!
          if (this.playerPos.y < 1.6) {
            this.applyDamageToPlayer(e.damage, 0xf87171, !isKakashiEnemy);
          }
        }
      }

      if (e.attackWindup > 0) {
        e.attackWindup = Math.max(0, e.attackWindup - dt);
        if (isMadaraUalEnemy && e.combatHitPending && e.attackWindup <= e.combatHitTime) {
          e.combatHitPending = false;
          if (!isStunned && !this.playerDying && dist <= 3.4 && this.playerPos.y < 1.8) {
            this.applyDamageToPlayer(e.damage, 0xf87171, true);
          }
        }
      }

      let enemyNativeRunDriving = false;
      if (e.isCustomTemplateRig) {
        if (e.ualActions && e.mixer) {
          const enemyUal = e.ualActions;
          const wantsJutsu = isKakashiEnemy && e.jutsuCastTimer > 0 && Boolean(enemyUal.jutsu);
          const wantsKakashiCombat = isKakashiEnemy && e.combatActive;
          const wantsMadaraAttack = !isKakashiEnemy && e.attackWindup > 0;
          const wantsAttack = wantsKakashiCombat || wantsJutsu || wantsMadaraAttack;
          const wantsRun = !wantsAttack && isMoving;
          const nextEnemyAnimState: PlayerAnimState = wantsAttack ? 'attack' : wantsRun ? 'run' : 'idle';
          const enemyCombatDriving = Boolean(
            isKakashiEnemy && this.bakedCombatAnim && e.combatTargetState && e.combatBlend > 0.002
          );
          const useEnemyBakedRunFallback = Boolean(
            !enemyUal.run && this.bakedRunAnim && e.runTargetState
          );
          e.animState = nextEnemyAnimState;

          if (wantsKakashiCombat) {
            if (enemyUal.activeAction !== enemyUal.idle) {
              this.crossFadeUalEnemyAction(enemyUal, enemyUal.idle, 0.08, false, 1.0);
            }
          } else if (wantsJutsu && enemyUal.jutsu) {
            if (enemyUal.activeAction !== enemyUal.jutsu) {
              this.crossFadeUalEnemyAction(enemyUal, enemyUal.jutsu, 0.08, true, 1.1);
            }
          } else if (wantsMadaraAttack) {
            if (enemyUal.activeAction && !enemyUal.activeAction.isRunning()) {
              enemyUal.activeAction.play();
            }
          } else if (nextEnemyAnimState === 'run') {
            const rate = THREE.MathUtils.clamp(e.speed / 5.2, 0.9, 1.35);
            if (enemyUal.run) {
              if (enemyUal.activeAction !== enemyUal.run) {
                this.crossFadeUalEnemyAction(enemyUal, enemyUal.run, 0.14, false, rate);
              } else {
                enemyUal.run.enabled = true;
                enemyUal.run.paused = false;
                enemyUal.run.timeScale = rate;
                if (!enemyUal.run.isRunning()) enemyUal.run.play();
              }
            } else if (enemyUal.activeAction !== enemyUal.idle) {
              this.crossFadeUalEnemyAction(enemyUal, enemyUal.idle, 0.14, false, 1.0);
            }
          } else {
            if (enemyUal.activeAction !== enemyUal.idle) {
              this.crossFadeUalEnemyAction(enemyUal, enemyUal.idle, 0.14, false, 1.0);
            } else {
              enemyUal.idle.enabled = true;
              enemyUal.idle.paused = false;
              enemyUal.idle.setEffectiveTimeScale(1);
              if (!enemyUal.idle.isRunning()) enemyUal.idle.play();
            }
          }

          this.stopFadedUalEnemyActions(enemyUal);
          e.mixer.update(dt);
          const enemyUalRunActiveOrFading = Boolean(
            enemyUal.run &&
              enemyUal.usesPreviousRun &&
              (enemyUal.activeAction === enemyUal.run ||
                (enemyUal.run.isRunning() && enemyUal.run.getEffectiveWeight() > 0.01))
          );
          enemyNativeRunDriving = enemyUalRunActiveOrFading;
          if (!enemyUalRunActiveOrFading) {
            this.anchorRigHipsParentToRest(
              e.rig.bones,
              e.rig.baseBoneRotations,
              e.rig.baseBonePositions
            );
          }

          e.runBlend = THREE.MathUtils.damp(
            e.runBlend,
            useEnemyBakedRunFallback && e.animState === 'run' ? 1 : 0,
            e.animState === 'run' ? 16 : 26,
            dt
          );

          if (enemyCombatDriving && this.bakedCombatAnim && e.combatTargetState) {
            const dy = this.bakedCombatAnim.applyPoseAtTime(
              e.combatTargetState,
              e.combatClipTime,
              e.combatBlend,
              true
            );
            e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.25);
          } else if (
            useEnemyBakedRunFallback &&
            e.runBlend > 0.02 &&
            this.bakedRunAnim &&
            e.runTargetState
          ) {
            const dy = this.bakedRunAnim.applyPose(
              e.runTargetState,
              elapsed * 1.1 + e.runPhaseOffset,
              e.runBlend,
              true
            );
            e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.22);
          } else {
            e.rig.pivotGroup.position.y = THREE.MathUtils.damp(e.rig.pivotGroup.position.y, 0, 16, dt);
          }
          e.rig.pivotGroup.rotation.x = THREE.MathUtils.damp(e.rig.pivotGroup.rotation.x, 0, 16, dt);
          e.rig.pivotGroup.position.z = THREE.MathUtils.damp(e.rig.pivotGroup.position.z, 0, 18, dt);
          e.slashRibbons?.update(dt, this.camera, e.pos, e.rig.bones, e.combatActive);
        } else {
        // Animate custom 3D enemy character using Standing_Idle / tobi_run crossFadeTo + combat
        const wantsAttack = isKakashiEnemy ? e.combatActive : e.attackWindup > 0;
        const wantsRun = !wantsAttack && isMoving;
        const nextEnemyAnimState: PlayerAnimState = wantsAttack ? 'attack' : wantsRun ? 'run' : 'idle';
        const enemyCombatDriving = Boolean(
          isKakashiEnemy && this.bakedCombatAnim && e.combatTargetState && e.combatBlend > 0.002
        );

        const idleAct = e.idleAction;
        const runAct = e.runAction;
        if (nextEnemyAnimState !== e.animState) {
          const prevEnemyState = e.animState;
          e.animState = nextEnemyAnimState;
          if (nextEnemyAnimState === 'attack') {
            idleAct?.fadeOut(0.08);
            runAct?.fadeOut(0.08);
          } else if (nextEnemyAnimState === 'run') {
            if (runAct) {
              const rate = THREE.MathUtils.clamp(e.speed / 5.2, 0.9, 1.35);
              runAct.enabled = true;
              runAct.paused = false;
              runAct.reset().setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
              if (prevEnemyState === 'idle' && idleAct && idleAct.isRunning()) {
                idleAct.crossFadeTo(runAct, 0.14, false);
              } else {
                idleAct?.stop();
              }
            } else {
              idleAct?.fadeOut(0.12);
            }
          } else {
            if (idleAct) {
              idleAct.enabled = true;
              idleAct.paused = false;
              idleAct.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
              if (prevEnemyState === 'run' && runAct && runAct.isRunning()) {
                runAct.crossFadeTo(idleAct, 0.10, false);
              } else {
                runAct?.stop();
              }
            } else {
              runAct?.fadeOut(0.10);
            }
          }
        }

        if (e.mixer) {
          if (e.animState === 'run') {
            if (runAct) {
              runAct.enabled = true;
              runAct.paused = false;
              runAct.timeScale = THREE.MathUtils.clamp(e.speed / 5.2, 0.9, 1.35);
              if (!runAct.isRunning()) runAct.play();
              if (!idleAct || !idleAct.isRunning()) runAct.setEffectiveWeight(1);
            }
            if (idleAct && idleAct.isRunning() && idleAct.getEffectiveWeight() <= 0.02) idleAct.stop();
          } else if (e.animState === 'idle') {
            if (runAct && runAct.isRunning() && runAct.getEffectiveWeight() <= 0.02) runAct.stop();
            if (idleAct) {
              idleAct.enabled = true;
              idleAct.paused = false;
              idleAct.setEffectiveTimeScale(1);
              if (!idleAct.isRunning()) idleAct.play();
              if (!runAct || !runAct.isRunning()) idleAct.setEffectiveWeight(1);
            }
          } else {
            if (idleAct && idleAct.isRunning() && idleAct.getEffectiveWeight() <= 0.02) idleAct.stop();
            if (runAct && runAct.isRunning() && runAct.getEffectiveWeight() <= 0.02) runAct.stop();
          }
          e.mixer.update(dt);
          const enemyNativeRunActiveOrFading = Boolean(
            runAct &&
              (e.animState === 'run' ||
                (runAct.isRunning() && runAct.getEffectiveWeight() > 0.01))
          );
          enemyNativeRunDriving = enemyNativeRunActiveOrFading;
          if (!enemyNativeRunActiveOrFading) {
            this.anchorRigHipsParentToRest(
              e.rig.bones,
              e.rig.baseBoneRotations,
              e.rig.baseBonePositions
            );
          }
        }

        const activeRunW = runAct && runAct.isRunning() ? runAct.getEffectiveWeight() : 0;
        const activeIdleW = idleAct && idleAct.isRunning() ? idleAct.getEffectiveWeight() : 0;

        if (
          e.rig.bones.hips &&
          !e.combatActive &&
          e.animState === 'run' &&
          runAct &&
          runAct.isRunning()
        ) {
          const hips = e.rig.bones.hips;
          const baseHipsRot = e.rig.baseBoneRotations.get(hips);
          const baseHipsPos = e.rig.baseBonePositions.get(hips);
          if (enemyCombatDriving) {
            if (baseHipsRot) hips.rotation.copy(baseHipsRot);
            if (baseHipsPos) hips.position.copy(baseHipsPos);
          } else {
            if (baseHipsRot) {
              _tempQuatA.setFromEuler(baseHipsRot);
              hips.quaternion.slerp(_tempQuatA, 1 - Math.exp(-20 * dt));
            }
            if (baseHipsPos) {
              hips.position.lerp(baseHipsPos, 1 - Math.exp(-20 * dt));
            }
          }
        }

        const useFallbackRun = Boolean(this.bakedRunAnim && e.runTargetState && !runAct);
        const useFallbackIdle = Boolean(this.bakedRunIdleAnim && e.idleTargetState && !idleAct);
        e.runBlend = THREE.MathUtils.damp(e.runBlend, useFallbackRun && e.animState === 'run' ? 1 : 0, e.animState === 'run' ? 16 : 26, dt);
        e.idleBlend = THREE.MathUtils.damp(e.idleBlend, useFallbackIdle && e.animState === 'idle' ? 1 : 0, 22, dt);

        if (enemyCombatDriving && this.bakedCombatAnim && e.combatTargetState) {
          const hasUnderlay = activeRunW > 0.02 || activeIdleW > 0.02;
          const dy = this.bakedCombatAnim.applyPoseAtTime(
            e.combatTargetState,
            e.combatClipTime,
            e.combatBlend,
            hasUnderlay
          );
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.25);
        } else if (useFallbackRun && e.runBlend > 0.02 && this.bakedRunAnim && e.runTargetState) {
          const dy = this.bakedRunAnim.applyPose(e.runTargetState, elapsed * 1.1 + e.runPhaseOffset, e.runBlend);
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.22);
        } else if (useFallbackIdle && e.idleBlend > 0.02 && this.bakedRunIdleAnim && e.idleTargetState) {
          const dy = this.bakedRunIdleAnim.applyPose(e.idleTargetState, elapsed + e.runPhaseOffset, e.idleBlend, false);
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.25);
        } else {
          e.rig.pivotGroup.position.y = THREE.MathUtils.damp(e.rig.pivotGroup.position.y, 0, 14, dt);
        }

        e.rig.pivotGroup.rotation.x = 0;
        e.rig.pivotGroup.rotation.z = 0;
        e.rig.pivotGroup.position.z = THREE.MathUtils.damp(
          e.rig.pivotGroup.position.z,
          !isKakashiEnemy && e.attackWindup > 0 ? Math.sin((e.attackWindup / 0.28) * Math.PI) * 0.22 : 0,
          18,
          dt
        );
        e.slashRibbons?.update(dt, this.camera, e.pos, e.rig.bones, e.combatActive);
        }
      } else {
        // Animate sculpted 3D enemy character using `run`'s exact running & idle animations,
        // blending seamlessly into strike kinematics at melee range.
        const windupCurve = e.attackWindup > 0 ? Math.sin((e.attackWindup / 0.28) * Math.PI) : 0;
        const enemyCombatDriving = Boolean(
          isKakashiEnemy && this.bakedCombatAnim && e.combatTargetState && e.combatBlend > 0.002
        );
        const wantsRunPose = Boolean(
          this.bakedRunAnim && e.runTargetState && isMoving && e.attackWindup <= 0 && !e.combatActive
        );
        const wantsIdlePose = Boolean(
          !wantsRunPose && this.bakedRunIdleAnim && e.idleTargetState && !isMoving && e.attackWindup <= 0 && !e.combatActive
        );
        e.runBlend = THREE.MathUtils.damp(e.runBlend, wantsRunPose ? 1 : 0, wantsRunPose ? 16 : 28, dt);
        e.idleBlend = THREE.MathUtils.damp(e.idleBlend, wantsIdlePose ? 1 : 0, wantsIdlePose ? 22 : 24, dt);

        const bakedEnemyRunActive = Boolean(
          this.bakedRunAnim && e.runTargetState && e.runBlend > 0.05 && (!wantsIdlePose || e.runBlend > e.idleBlend)
        );
        const bakedEnemyIdleActive = Boolean(
          !bakedEnemyRunActive && this.bakedRunIdleAnim && e.idleTargetState && e.idleBlend > 0.05
        );
        if (enemyCombatDriving && this.bakedCombatAnim && e.combatTargetState) {
          const dy = this.bakedCombatAnim.applyPoseAtTime(
            e.combatTargetState,
            e.combatClipTime,
            e.combatBlend,
            false
          );
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(dy, -0.45, 0.25);
        } else if (bakedEnemyRunActive && this.bakedRunAnim && e.runTargetState) {
          const rate = THREE.MathUtils.clamp(e.speed / 5.2, 0.85, 1.35);
          const hipsDy = this.bakedRunAnim.applyPose(
            e.runTargetState,
            elapsed * rate + e.runPhaseOffset,
            e.runBlend
          );
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(hipsDy, -0.45, 0.22);
        } else if (bakedEnemyIdleActive && this.bakedRunIdleAnim && e.idleTargetState) {
          const idleDy = this.bakedRunIdleAnim.applyPose(
            e.idleTargetState,
            elapsed + e.runPhaseOffset,
            e.idleBlend,
            false
          );
          e.rig.pivotGroup.position.y = THREE.MathUtils.clamp(idleDy, -0.45, 0.25);
        } else {
          e.rig.pivotGroup.position.y = THREE.MathUtils.damp(e.rig.pivotGroup.position.y, 0, 14, dt);
          this.animateSkeletalRunAndCombat(
            e.rig.bones,
            e.rig.baseBoneRotations,
            e.rig.baseBonePositions,
            e.walkPhase,
            elapsed,
            isMoving,
            e.attackWindup > 0 ? windupCurve : 0,
            dt
          );
        }

        e.rig.pivotGroup.rotation.x = 0;
        e.rig.pivotGroup.rotation.z = 0;
        e.rig.pivotGroup.position.z = THREE.MathUtils.damp(
          e.rig.pivotGroup.position.z,
          isKakashiEnemy ? 0 : windupCurve * 0.28,
          18,
          dt
        );
        e.slashRibbons?.update(dt, this.camera, e.pos, e.rig.bones, e.combatActive);
      }

      // Apply knockback velocity & solid separation from other enemies, Gedo Mazo, and player
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;
      e.vel.x = THREE.MathUtils.damp(e.vel.x, 0, 8, dt);
      e.vel.z = THREE.MathUtils.damp(e.vel.z, 0, 8, dt);

      for (let j = i - 1; j >= 0; j--) {
        const other = this.enemies[j];
        if (other.isDying || other.hp <= 0) continue;
        const minEnemySep = e.isBoss || other.isBoss ? 1.85 : 1.45;
        const dx = e.pos.x - other.pos.x;
        const dz = e.pos.z - other.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minEnemySep * minEnemySep) {
          const d = Math.sqrt(dSq);
          const nx = d > 0.001 ? dx / d : Math.cos(i * 1.7 + j);
          const nz = d > 0.001 ? dz / d : Math.sin(i * 1.7 + j);
          const push = (minEnemySep - d) * 0.5;
          e.pos.x += nx * push;
          e.pos.z += nz * push;
          other.pos.x -= nx * push;
          other.pos.z -= nz * push;
        }
      }

      if (
        this.activeGedo &&
        (this.activeGedo.phase === 'emerging' || this.activeGedo.phase === 'active')
      ) {
        const statueMinR = e.isBoss ? 2.6 : 2.35;
        const dx = e.pos.x - this.activeGedo.pos.x;
        const dz = e.pos.z - this.activeGedo.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < statueMinR * statueMinR) {
          const d = Math.sqrt(dSq);
          const nx = d > 0.001 ? dx / d : 0;
          const nz = d > 0.001 ? dz / d : 1;
          e.pos.x = this.activeGedo.pos.x + nx * statueMinR;
          e.pos.z = this.activeGedo.pos.z + nz * statueMinR;
        }
      }

      if (this.kamuiTimer <= 0 && Math.abs(this.playerPos.y - e.pos.y) < 2.2) {
        const minPlayerSep = e.isBoss ? 1.6 : 1.3;
        const dx = e.pos.x - this.playerPos.x;
        const dz = e.pos.z - this.playerPos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minPlayerSep * minPlayerSep) {
          const d = Math.sqrt(dSq);
          const nx = d > 0.001 ? dx / d : -Math.sin(e.yaw);
          const nz = d > 0.001 ? dz / d : -Math.cos(e.yaw);
          e.pos.x = this.playerPos.x + nx * minPlayerSep;
          e.pos.z = this.playerPos.z + nz * minPlayerSep;
        }
      }

      const eDist = Math.hypot(e.pos.x, e.pos.z);
      const maxEnemyR = this.getActiveArenaRadius() - 1.2;
      if (eDist > maxEnemyR) {
        const nx = e.pos.x / eDist;
        const nz = e.pos.z / eDist;
        e.pos.x = nx * maxEnemyR;
        e.pos.z = nz * maxEnemyR;
        const outVel = e.vel.x * nx + e.vel.z * nz;
        if (outVel > 0) {
          e.vel.x -= nx * outVel;
          e.vel.z -= nz * outVel;
        }
      }

      e.pos.y = Math.max(0, e.pos.y);
      if (e.hitFlashTimer > 0 || isStunned) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        const flashActive = e.hitFlashTimer > 0 || Math.floor(elapsed * 22) % 2 === 0;
        const flashHex = e.hitFlashTimer > 0.05 ? 0xffffff : 0xff2222;
        e.rig.setHitFlash(flashActive, flashHex);
        e.rig.root.position.set(
          e.pos.x + (Math.random() - 0.5) * 0.14,
          e.pos.y,
          e.pos.z + (Math.random() - 0.5) * 0.14
        );
      } else {
        e.rig.setHitFlash(false);
        e.rig.root.position.copy(e.pos);
      }
      e.rig.root.rotation.set(0, e.yaw, 0);
      e.rig.pivotGroup.rotation.x = 0;
      e.rig.pivotGroup.rotation.z = 0;
      if (!enemyNativeRunDriving) {
        this.anchorRigHipsParentToRest(
          e.rig.bones,
          e.rig.baseBoneRotations,
          e.rig.baseBonePositions
        );
      }
      if (e.cloakPhysicsSolver && e.isCustomTemplateRig) {
        const enemyMoveSpeed = e.animState === 'run' ? e.speed : 0;
        const enemyVx = e.vel.x + Math.sin(e.yaw) * enemyMoveSpeed;
        const enemyVz = e.vel.z + Math.cos(e.yaw) * enemyMoveSpeed;
        e.cloakPhysicsSolver.solve(dt, elapsed, enemyVx, e.vel.y, enemyVz, 0);
      }
      this.enforceSolidGroundContact(
        e.rig.root,
        e.rig.pivotGroup,
        e.rig.bones,
        e.pos.y,
        e.soleClearance
      );
      e.shadow.position.set(e.pos.x, 0.03, e.pos.z);

      if (e.rig.auraMesh) {
        e.rig.auraMesh.rotation.y += dt * 4.5;
        const pulse = 0.92 + Math.sin(elapsed * 6 + i) * 0.12;
        e.rig.auraMesh.scale.setScalar(pulse);
      }
      if (e.rig.handOrbMesh) {
        e.rig.handOrbMesh.rotation.y += dt * 10;
        const orbPulse = 0.85 + Math.sin(elapsed * 16 + i) * 0.22;
        e.rig.handOrbMesh.scale.setScalar(orbPulse);
      }
    }

    // 9. Check Player Defeat (after tinbc4.fbx death collapse) or Wave Clear
    if (this.playerDying) {
      if (this.playerDeathTimer >= this.playerDeathDuration) {
        this.spawnSparks(this.playerPos, 0xef4444, 14);
        this.spawnShockRing(this.playerPos.x, 0.2, this.playerPos.z, 0xdc2626, 3.2, 0.42);
        this.spawnSmokePuff(
          this.playerPos.x,
          this.playerPos.y + 0.85,
          this.playerPos.z,
          0xe2e8f0,
          0.95,
          2.6,
          0.65,
          0.74
        );
        if (this.customObito) {
          this.customObito.root.visible = false;
        }
        this.obitoShadow.visible = false;
        this.phase = 'defeat';
        soundEngine.setMusicTheme('silent');
        this.pushHud(true);
        return;
      }
    } else if (this.enemies.length === 0) {
      if (this.wave >= this.maxWaves) {
        soundEngine.playWaveClear();
        soundEngine.setMusicTheme('silent');
        this.phase = 'victory';
        this.pushHud(true);
        return;
      } else {
        if (this.waveTransitionTimer <= 0) {
          this.waveTransitionTimer = 1.8;
          soundEngine.playWaveClear();
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 22);
          this.setAnnouncement(`تم تطهير الموجة ${this.wave}! استعد للموجة التالية`, 1.7);
        } else {
          this.waveTransitionTimer -= dt;
          if (this.waveTransitionTimer <= 0) {
            this.wave += 1;
            this.spawnWave(this.wave);
          }
        }
      }
    }

    // 10. Smooth Damped Third-Person Chase Camera
    this.updateChaseCamera(dt, elapsed);

    // Throttled HUD updates (~15fps for React bars without overhead)
    if (elapsed - this.lastHudPush > 0.065) {
      this.pushHud(false);
    }
  }

  private updateTransientVfx(dt: number, elapsed: number) {
    for (let i = this.shockRings.length - 1; i >= 0; i--) {
      const r = this.shockRings[i];
      r.life += dt;
      const p = r.life / r.maxLife;
      r.mesh.scale.setScalar(0.5 + p * r.maxScale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, r.baseOpacity * (1 - p));
      if (r.life >= r.maxLife) {
        this.releaseShockRing(r);
        this.shockRings.splice(i, 1);
      }
    }

    for (let i = this.sphereShocks.length - 1; i >= 0; i--) {
      const ss = this.sphereShocks[i];
      ss.life += dt;
      const p = THREE.MathUtils.clamp(ss.life / ss.maxLife, 0, 1);
      const easeOut = 1 - Math.pow(1 - p, 2);
      ss.mesh.scale.setScalar(0.8 + easeOut * ss.maxScale);
      if (ss.shaderMat) {
        ss.shaderMat.uniforms.uTime.value = ss.life;
        ss.shaderMat.uniforms.uProgress.value = p;
      } else {
        (ss.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, ss.baseOpacity * (1 - p));
      }
      if (ss.life >= ss.maxLife) {
        this.scene.remove(ss.mesh);
        (ss.mesh.material as THREE.Material).dispose();
        this.sphereShocks.splice(i, 1);
      }
    }

    for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
      const sm = this.smokePuffs[i];
      sm.life += dt;
      const p = sm.life / sm.maxLife;
      sm.sprite.position.addScaledVector(sm.vel, dt);
      const sc = THREE.MathUtils.lerp(sm.startScale, sm.endScale, p);
      sm.sprite.scale.set(sc, sc, 1);
      sm.mat.rotation += sm.rotVel * dt;
      sm.mat.opacity = Math.max(0, sm.baseOpacity * (1 - p));
      if (sm.life >= sm.maxLife) {
        this.releaseSmokePuff(sm);
        this.smokePuffs.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      s.vel.y -= s.gravity * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.04) {
        s.mesh.position.y = 0.04;
        if (s.vel.y < 0) {
          s.vel.y = -s.vel.y * 0.35;
          s.vel.x *= 0.65;
          s.vel.z *= 0.65;
        }
      }
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - s.life / s.maxLife);
      if (s.life >= s.maxLife) {
        this.releaseSpark(s);
        this.sparks.splice(i, 1);
      }
    }

    for (let i = this.slashArcs.length - 1; i >= 0; i--) {
      const sa = this.slashArcs[i];
      sa.life += dt;
      const p = sa.life / sa.maxLife;
      sa.mesh.rotation.y = sa.startRoll + p * sa.spinSpeed * sa.maxLife;
      sa.mesh.scale.multiplyScalar(1 + dt * 1.8);
      (sa.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, sa.baseOpacity * (1 - p * p));
      if (sa.life >= sa.maxLife) {
        this.scene.remove(sa.mesh);
        (sa.mesh.material as THREE.Material).dispose();
        this.slashArcs.splice(i, 1);
      }
    }

    for (let i = this.darkVortices.length - 1; i >= 0; i--) {
      const dv = this.darkVortices[i];
      dv.life += dt;
      const p = dv.life / dv.maxLife;
      const ease = 1 - Math.pow(1 - p, 2);
      dv.group.scale.setScalar(0.35 + ease * (dv.maxScale * 0.42));
      dv.group.rotation.y += dt * 14;
      dv.rings.forEach((r, idx) => {
        r.rotation.z += dt * (idx % 2 === 0 ? 18 : -15);
        (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (idx === 0 ? 0.88 : 0.7) * (1 - p));
      });
      if (dv.life >= dv.maxLife) {
        this.scene.remove(dv.group);
        dv.rings.forEach((r) => (r.material as THREE.Material).dispose());
        this.darkVortices.splice(i, 1);
      }
    }

    for (let i = this.chakraChains.length - 1; i >= 0; i--) {
      const cc = this.chakraChains[i];
      cc.life += dt;
      const p = cc.life / cc.maxLife;
      const extend = Math.min(1, p / 0.25);
      cc.group.scale.set(1 - p * 0.5, 1 - p * 0.5, 0.2 + extend * 0.88);
      cc.coreMat.opacity = Math.max(0, 0.98 * (1 - p));
      cc.haloMat.opacity = Math.max(0, 0.72 * (1 - p));
      if (cc.life >= cc.maxLife) {
        this.scene.remove(cc.group);
        cc.coreMat.dispose();
        cc.haloMat.dispose();
        this.chakraChains.splice(i, 1);
      }
    }

    if (!this.finisherState) {
      this.updateGedoMazo(dt, elapsed);
      this.updateSusanoo(dt, elapsed);
      if (!this.activeSusanoo) {
        this.susanooCamDistOffset = THREE.MathUtils.damp(this.susanooCamDistOffset, 0, 5.5, dt);
        this.susanooCamLookYOffset = THREE.MathUtils.damp(this.susanooCamLookYOffset, 0, 5.5, dt);
      }
    }

    for (let i = this.susanooSlashWaves.length - 1; i >= 0; i--) {
      const sw = this.susanooSlashWaves[i];
      sw.life += dt;
      sw.pos.addScaledVector(sw.vel, dt);
      sw.mesh.position.copy(sw.pos);
      const p = sw.life / sw.maxLife;
      sw.mesh.scale.setScalar(1 + p * 0.72);
      sw.mat.opacity = Math.max(0, 0.94 * (1 - p * p));

      if (!this.finisherState) {
        for (const enemy of this.enemies) {
          if (enemy.isDying || enemy.hp <= 0 || sw.hitIds.has(enemy.id)) continue;
          const distXZ = Math.hypot(enemy.pos.x - sw.pos.x, enemy.pos.z - sw.pos.z);
          if (distXZ <= 2.95) {
            sw.hitIds.add(enemy.id);
            const vLen = Math.hypot(sw.vel.x, sw.vel.z) || 1;
            const kb = 11.5;
            this.damageEnemy(
              enemy,
              sw.damage,
              (sw.vel.x / vLen) * kb,
              (sw.vel.z / vLen) * kb,
              true,
              false
            );
            this.spawnSparks(enemy.pos, sw.accentColor, 8, 11, 9);
            this.spawnShockRing(enemy.pos.x, 0.28, enemy.pos.z, sw.accentColor, 3.8, 0.28, 0.72);
          }
        }
      }

      if (sw.life >= sw.maxLife) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        this.susanooSlashWaves.splice(i, 1);
      }
    }

    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const lb = this.lightningBolts[i];
      lb.life += dt;
      const p = lb.life / lb.maxLife;
      lb.mat.opacity = Math.max(0, 0.98 * (1 - p * p));
      if (lb.life >= lb.maxLife) {
        this.scene.remove(lb.line);
        lb.line.geometry.dispose();
        lb.mat.dispose();
        this.lightningBolts.splice(i, 1);
      }
    }

    for (let i = this.damagePopups.length - 1; i >= 0; i--) {
      const dp = this.damagePopups[i];
      dp.life += dt;
      const p = dp.life / dp.maxLife;
      dp.sprite.position.y += dp.velY * dt;
      dp.velY = THREE.MathUtils.damp(dp.velY, 0.3, 4.5, dt);
      const popScale = p < 0.16 ? THREE.MathUtils.lerp(0.65, 1.15, p / 0.16) : 1.0;
      dp.sprite.scale.set(1.55 * popScale, 0.78 * popScale, 1);
      dp.mat.opacity = p < 0.65 ? 1 : Math.max(0, (1 - p) / 0.35);
      if (dp.life >= dp.maxLife) {
        this.scene.remove(dp.sprite);
        dp.mat.dispose();
        this.damagePopups.splice(i, 1);
      }
    }

    this.skillParticles.update(dt);

    if (this.impactLight.intensity > 0.02) {
      this.impactLight.intensity = THREE.MathUtils.damp(this.impactLight.intensity, 0, 9.5, dt);
      this.impactLight.visible = this.impactLight.intensity > 0.04;
    } else {
      this.impactLight.intensity = 0;
      this.impactLight.visible = false;
    }

    for (let li = this.fireballs.length; li < this.fireballGroundLights.length; li++) {
      const fbLight = this.fireballGroundLights[li];
      if (fbLight.intensity > 0.02) {
        fbLight.intensity = THREE.MathUtils.damp(fbLight.intensity, 0, 10, dt);
        fbLight.visible = fbLight.intensity > 0.04;
      } else {
        fbLight.intensity = 0;
        fbLight.visible = false;
      }
    }

    for (let i = this.groundMarks.length - 1; i >= 0; i--) {
      const gm = this.groundMarks[i];
      gm.life += dt;
      const popP = Math.min(1, gm.life / 0.14);
      const easePop = 1 - Math.pow(1 - popP, 2);
      gm.group.scale.setScalar(gm.targetScale * THREE.MathUtils.lerp(0.68, 1.0, easePop));

      if (gm.glowMat && gm.glowDuration > 0) {
        const coolP = Math.min(1, gm.life / gm.glowDuration);
        gm.glowMat.opacity = Math.max(0, gm.glowOpacity * (1 - coolP * coolP));
      }

      const fadeStart = gm.maxLife * 0.65;
      if (gm.life > fadeStart) {
        const fadeP = Math.min(1, (gm.life - fadeStart) / (gm.maxLife - fadeStart));
        gm.baseMat.opacity = Math.max(0, gm.baseOpacity * (1 - fadeP));
      }

      if (gm.life >= gm.maxLife) {
        this.scene.remove(gm.group);
        gm.baseMat.dispose();
        gm.glowMat?.dispose();
        this.groundMarks.splice(i, 1);
      }
    }

    for (let i = this.groundDebris.length - 1; i >= 0; i--) {
      const gd = this.groundDebris[i];
      gd.life += dt;
      if (gd.mesh.position.y > 0.075 || gd.vel.y > 0) {
        gd.vel.y -= 24 * dt;
        gd.mesh.position.addScaledVector(gd.vel, dt);
        gd.mesh.rotation.x += gd.rotVel.x * dt;
        gd.mesh.rotation.y += gd.rotVel.y * dt;
        gd.mesh.rotation.z += gd.rotVel.z * dt;
        if (gd.mesh.position.y <= 0.075) {
          gd.mesh.position.y = 0.075;
          if (!gd.bounced && Math.abs(gd.vel.y) > 2.2) {
            gd.bounced = true;
            gd.vel.y = Math.abs(gd.vel.y) * 0.28;
            gd.vel.x *= 0.42;
            gd.vel.z *= 0.42;
            gd.rotVel.multiplyScalar(0.35);
          } else {
            gd.vel.set(0, 0, 0);
            gd.rotVel.set(0, 0, 0);
          }
        }
        const gdDist = Math.hypot(gd.mesh.position.x, gd.mesh.position.z);
        const arenaR = this.getActiveArenaRadius();
        if (gdDist > arenaR - 0.5) {
          const s = (arenaR - 0.5) / gdDist;
          gd.mesh.position.x *= s;
          gd.mesh.position.z *= s;
          gd.vel.x *= -0.3;
          gd.vel.z *= -0.3;
        }
      }

      const shrinkStart = gd.maxLife * 0.72;
      if (gd.life > shrinkStart) {
        const s = Math.max(0.01, 1 - (gd.life - shrinkStart) / (gd.maxLife - shrinkStart));
        gd.mesh.scale.copy(gd.baseScale).multiplyScalar(s);
      }

      if (gd.life >= gd.maxLife) {
        this.scene.remove(gd.mesh);
        this.groundDebris.splice(i, 1);
      }
    }
  }

  private updateFinisher(rawDt: number, elapsed: number) {
    const fs = this.finisherState;
    if (!fs) return;

    fs.elapsed += rawDt;
    fs.phaseElapsed += rawDt;

    if (this.finisherFlashOpacity > 0) {
      this.finisherFlashOpacity = Math.max(0, this.finisherFlashOpacity - rawDt * 2.65);
    }

    const target = this.enemies.find((e) => e.id === fs.targetId) ?? null;

    // 1. Phase state machine
    if (fs.phase === 'jump_ascend') {
      const dur = 0.34;
      const t = Math.min(1, fs.phaseElapsed / dur);
      const ease = 1 - Math.pow(1 - t, 2);
      this.playerPos.lerpVectors(fs.startPlayerPos, fs.peakPlayerPos, ease);
      this.playerOnGround = false;
      this.madaraJumpPhase = t < 0.55 ? 'start' : 'loop';

      if (t >= 1) {
        fs.phase = 'slow_zoom';
        fs.phaseElapsed = 0;
        fs.timeScale = 0.16;
      }
    } else if (fs.phase === 'slow_zoom') {
      // Exact 1.0 real second of slow motion with ultra-fast low-angle face close-up zoom
      const dur = 1.0;
      const t = Math.min(1, fs.phaseElapsed / dur);
      fs.timeScale = 0.16;
      this.playerPos.copy(fs.peakPlayerPos);
      this.playerPos.y = fs.peakPlayerPos.y + 0.36 * t;
      this.playerOnGround = false;
      this.madaraJumpPhase = 'loop';

      if (t >= 1) {
        fs.phase = 'dark_dive';
        fs.phaseElapsed = 0;
        fs.timeScale = 1.0;
        this.startFinisherAttackAnim(fs);
      }
    } else if (fs.phase === 'dark_dive') {
      const dur = 0.28;
      const t = Math.min(1, fs.phaseElapsed / dur);
      const ease = t * t;
      fs.timeScale = 1.0;

      // Darken background & scene lighting dramatically
      const darkT = Math.min(1, fs.phaseElapsed / 0.14);
      this.applyFinisherLighting(darkT, fs);

      _finisherVecA.set(fs.peakPlayerPos.x, fs.peakPlayerPos.y + 0.36, fs.peakPlayerPos.z);
      this.playerPos.lerpVectors(_finisherVecA, fs.impactPlayerPos, ease);
      this.playerOnGround = false;

      // Dramatic close spotlight glow around diving character
      this.flashImpactLight(
        this.playerPos.x,
        this.playerPos.y + 1.35,
        this.playerPos.z,
        0xf97316,
        18
      );
      if (Math.random() < 0.78) {
        this.spawnSparks(this.playerPos, 0xfbbf24, 3, 7, 4);
      }

      if (t >= 1 && !fs.impactTriggered) {
        fs.impactTriggered = true;
        this.playerPos.copy(fs.impactPlayerPos);
        this.playerPos.y = 0;
        this.playerOnGround = true;

        // 5. Screen Shake for exact 10 frames + White Flash Effect
        fs.shakeFramesRemaining = 10;
        this.finisherFlashOpacity = 1.0;
        this.flashImpactLight(
          target ? target.pos.x : this.playerPos.x,
          1.75,
          target ? target.pos.z : this.playerPos.z,
          0xffffff,
          58
        );

        const hitX = target ? target.pos.x : this.playerPos.x + Math.sin(this.playerYaw) * 1.4;
        const hitZ = target ? target.pos.z : this.playerPos.z + Math.cos(this.playerYaw) * 1.4;
        this.spawnShockRing(hitX, 0.25, hitZ, 0xffffff, 7.8, 0.42, 0.96);
        this.spawnShockRing(hitX, 1.15, hitZ, 0xf97316, 5.6, 0.35, 0.92);
        this.spawnSphereShock(hitX, 1.15, hitZ, 0xffffff, 5.2, 0.36, 0.72);
        this.spawnGroundMark(hitX, hitZ, 'crack', 5.2, 6.5, 0.82);
        this.spawnStoneDebris(hitX, hitZ, 8, 9.5, 8.2);
        this.spawnSparks(_finisherVecB.set(hitX, 1.1, hitZ), 0xffffff, 28, 16, 12);
        soundEngine.playHitImpact(true);
        haptics.melee(2);

        // 6. Launch Enemy Backward & Upward + Show K.O!
        if (target) {
          let awayX = target.pos.x - this.playerPos.x;
          let awayZ = target.pos.z - this.playerPos.z;
          const awayLen = Math.hypot(awayX, awayZ);
          if (awayLen > 0.01) {
            awayX /= awayLen;
            awayZ /= awayLen;
          } else {
            awayX = Math.sin(this.playerYaw);
            awayZ = Math.cos(this.playerYaw);
          }

          fs.flyActive = true;
          fs.flyVelX = awayX * 22.5;
          fs.flyVelZ = awayZ * 22.5;
          fs.flyVelY = 15.8;
          fs.flyRotX = 0;
          fs.flySpinVel = -7.2;
          target.hitFlashTimer = 0.35;

          const finisherDamage = 175;
          if (fs.isAutoFinalKill) {
            target.hp = 0;
            this.score += target.isBoss ? 500 : 250;
          } else {
            const dealt = this.awakeningActive ? Math.round(finisherDamage * 1.35) : finisherDamage;
            target.hp = Math.max(0, target.hp - dealt);
            this.combo += 1;
            this.comboTimer = 4.0;
            this.score += dealt + (target.hp <= 0 ? (target.isBoss ? 500 : 250) : 100);
          }
        }

        this.finisherOverlay = 'ko';
        fs.overlay = 'ko';
        fs.phase = 'ko_showcase';
        fs.phaseElapsed = 0;
        this.pushHud(true);
      }
    } else if (fs.phase === 'ko_showcase') {
      const recoverT = 1 - Math.min(1, fs.phaseElapsed / 0.72);
      this.applyFinisherLighting(recoverT, fs);

      if (fs.phaseElapsed >= 1.65) {
        // Finalize defeated target cleanly before transitioning
        if (target && target.hp <= 0) {
          const tIdx = this.enemies.indexOf(target);
          this.spawnSparks(target.pos, 0xef4444, 14);
          this.spawnShockRing(target.pos.x, 0.2, target.pos.z, 0xdc2626, 3.2, 0.4);
          this.spawnSmokePuff(target.pos.x, target.pos.y + 0.75, target.pos.z, 0xe2e8f0, 0.9, 2.6, 0.65, 0.72);
          this.scene.remove(target.rig.root, target.shadow);
          target.slashRibbons?.dispose();
          target.rig.dispose();
          (target.shadow.material as THREE.Material).dispose();
          target.shadow.geometry.dispose();
          if (tIdx >= 0) {
            this.enemies.splice(tIdx, 1);
          }
        } else if (target) {
          target.pos.y = 0;
          target.vel.set(0, 0, 0);
          target.rig.pivotGroup.rotation.set(0, 0, 0);
          this.enforceSolidGroundContact(
            target.rig.root,
            target.rig.pivotGroup,
            target.rig.bones,
            target.pos.y,
            target.soleClearance
          );
        }

        const anyAlive = this.enemies.some((e) => !e.isDying && e.hp > 0);
        const isBattleWon = !anyAlive && this.wave >= this.maxWaves;

        this.applyFinisherLighting(0, fs);
        this.camera.fov = fs.savedFov;
        this.camera.updateProjectionMatrix();
        this.finisherFlashOpacity = 0;
        this.finisherState = null;

        if (isBattleWon) {
          this.finisherOverlay = 'victory';
          soundEngine.playWaveClear();
          soundEngine.setMusicTheme('silent');
          this.phase = 'victory';
          this.pushHud(true);
          return;
        }

        this.finisherOverlay = 'none';
        this.finisherCooldown = 12.0;
        if (fs.susanooWasVisible && this.activeSusanoo) {
          this.activeSusanoo.rig.root.visible = true;
          this.activeSusanoo.groundRingMesh.visible = true;
        }
        this.runCombatActive = false;
        this.runCombatBlend = 0;
        this.meleeAnimTimer = 0;
        this.madaraActiveAttackAction = null;
        this.madaraJumpPhase = 'none';
        this.resetPlayerPitchAndRoll(true);
        this.snapChaseCamera();
        this.pushHud(true);
        return;
      }
    }

    const simDt = rawDt * fs.timeScale;

    // 2. Update Player Rig & Animations with simDt (Jump during ascend/slow_zoom, Attack during dark_dive)
    this.updateFinisherPlayerRig(simDt, elapsed, fs);

    // 3. Freeze non-target enemies & fly knocked-back target backward/upward
    this.updateFinisherEnemies(simDt, elapsed, fs, target);

    // 4. Update transient VFX (shock rings, sparks, smoke, particles, impact light)
    this.updateTransientVfx(simDt, elapsed);

    // 5. Update Cinematic Camera (using real-time rawDt for ultra-fast Zoom In & 10-frame Screen Shake)
    this.updateFinisherCamera(rawDt, fs, target);

    if (elapsed - this.lastHudPush > 0.05) {
      this.pushHud(false);
    }
  }

  private startFinisherAttackAnim(fs: FinisherState) {
    const playerUal = this.getActivePlayerUalActions();
    this.madaraJumpPhase = 'none';
    this.madaraJumpPhaseTimer = 0;

    if (this.isMadara && playerUal && playerUal.combo.length > 0) {
      const action = playerUal.combo[playerUal.combo.length - 1];
      fs.attackUsesUalCombo = true;
      fs.attackAction = action;
      this.madaraActiveAttackAction = action;
      this.crossFadeUalPlayerAction(playerUal, action, 0.05, true, 1.75);
    } else if (this.customObitoIsRunSource && this.bakedCombatAnim && this.playerCombatTargetState) {
      const win = RUN_COMBO_WINDOWS[Math.min(2, RUN_COMBO_WINDOWS.length - 1)];
      const maxDur = this.bakedCombatAnim.duration;
      const start = Math.min(win.start, Math.max(0, maxDur - 0.35));
      const end = Math.min(win.end, maxDur);
      this.runCombatActive = true;
      this.runCombatStep = 2;
      this.runCombatClipTime = start;
      this.runCombatEndTime = end;
      this.runCombatBlend = 1.0;
      this.runCombatPendingHit = null;
      fs.attackUsesRunCombat = true;
      if (playerUal && playerUal.idle && playerUal.activeAction !== playerUal.idle) {
        this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.06, false, 1.0);
      }
    } else if (this.customObito?.attackAction) {
      fs.attackUsesClip = true;
      fs.attackAction = this.customObito.attackAction;
      this.customObito.idleAction?.fadeOut(0.05);
      this.customObito.runAction?.fadeOut(0.05);
      this.customObito.attackAction.reset().setEffectiveTimeScale(1.4).setEffectiveWeight(1).fadeIn(0.05).play();
    } else if (playerUal?.jutsu) {
      fs.attackUsesUalCombo = true;
      fs.attackAction = playerUal.jutsu;
      this.crossFadeUalPlayerAction(playerUal, playerUal.jutsu, 0.05, true, 1.55);
    } else {
      this.meleeStep = 0;
      this.meleeAnimDuration = 0.45;
      this.meleeAnimTimer = 0.45;
    }

    soundEngine.playMeleeSwing(2);
  }

  private updateFinisherPlayerRig(simDt: number, elapsed: number, fs: FinisherState) {
    if (!this.customObito) return;

    this.customObito.root.position.copy(this.playerPos);
    this.customObito.root.rotation.set(0, this.playerYaw, 0);
    this.customObito.pivotGroup.scale.setScalar(1.0);
    this.customObito.pivotGroup.rotation.set(0, 0, 0);

    this.obitoShadow.position.set(this.playerPos.x, 0.03, this.playerPos.z);
    this.obitoShadow.scale.setScalar(Math.max(0.35, 1 - this.playerPos.y * 0.1));

    const playerUal = this.getActivePlayerUalActions();
    if (playerUal && this.customObito.mixer) {
      if (fs.phase === 'jump_ascend') {
        if (this.madaraJumpPhase === 'start' && playerUal.jumpStart) {
          if (playerUal.activeAction !== playerUal.jumpStart) {
            this.crossFadeUalPlayerAction(playerUal, playerUal.jumpStart, 0.06, true, 1.6);
          }
        } else if (playerUal.jumpLoop && playerUal.activeAction !== playerUal.jumpLoop) {
          this.crossFadeUalPlayerAction(playerUal, playerUal.jumpLoop, 0.1, true, 1.0);
        }
      } else if (fs.phase === 'slow_zoom') {
        if (playerUal.jumpLoop && playerUal.activeAction !== playerUal.jumpLoop) {
          this.crossFadeUalPlayerAction(playerUal, playerUal.jumpLoop, 0.12, true, 1.0);
        }
      } else if (fs.phase === 'ko_showcase' && fs.phaseElapsed > 0.38) {
        if (playerUal.activeAction !== playerUal.idle) {
          this.crossFadeUalPlayerAction(playerUal, playerUal.idle, 0.16, false, 1.0);
        }
      }

      this.stopFadedUalPlayerActions(playerUal);
      this.customObito.mixer.update(simDt);
      if (this.customObito.hasSkeleton) {
        this.anchorRigHipsParentToRest(
          this.customObito.bones,
          this.customObito.baseBoneRotations,
          this.customObito.baseBonePositions
        );
      }

      if (fs.attackUsesRunCombat && this.bakedCombatAnim && this.playerCombatTargetState) {
        if (fs.phase === 'dark_dive') {
          this.runCombatClipTime = Math.min(
            this.runCombatEndTime,
            this.runCombatClipTime + simDt * RUN_COMBO_SPEED
          );
          this.runCombatBlend = 1.0;
        } else {
          this.runCombatBlend = Math.max(0, this.runCombatBlend - simDt / 0.25);
        }
        if (this.runCombatBlend > 0.01) {
          const combatDy = this.bakedCombatAnim.applyPoseAtTime(
            this.playerCombatTargetState,
            this.runCombatClipTime,
            this.runCombatBlend,
            true
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(combatDy, -0.45, 0.25);
        } else {
          this.customObito.pivotGroup.position.y = THREE.MathUtils.damp(
            this.customObito.pivotGroup.position.y,
            0,
            14,
            simDt
          );
        }
      }
    } else {
      if (this.customObito.mixer) {
        this.customObito.mixer.update(simDt);
      }

      if (fs.attackUsesRunCombat && this.bakedCombatAnim && this.playerCombatTargetState) {
        if (fs.phase === 'dark_dive') {
          this.runCombatClipTime = Math.min(
            this.runCombatEndTime,
            this.runCombatClipTime + simDt * RUN_COMBO_SPEED
          );
          this.runCombatBlend = 1.0;
        } else {
          this.runCombatBlend = Math.max(0, this.runCombatBlend - simDt / 0.25);
        }
        if (this.runCombatBlend > 0.01) {
          const combatDy = this.bakedCombatAnim.applyPoseAtTime(
            this.playerCombatTargetState,
            this.runCombatClipTime,
            this.runCombatBlend,
            false
          );
          this.customObito.pivotGroup.position.y = THREE.MathUtils.clamp(combatDy, -0.45, 0.25);
        }
      } else if (this.customObito.hasSkeleton && !fs.attackUsesClip) {
        // Clean procedural Jump & Dive-Attack pose for non-UAL rigs
        const { bones, baseBoneRotations } = this.customObito;
        const bx = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.x ?? 0 : 0);
        const bz = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.z ?? 0 : 0);
        const rate = Math.max(simDt, 0.002);

        if (fs.phase === 'jump_ascend' || fs.phase === 'slow_zoom') {
          if (bones.leftThigh) bones.leftThigh.rotation.x = THREE.MathUtils.damp(bones.leftThigh.rotation.x, bx(bones.leftThigh) - 0.56, 16, rate);
          if (bones.rightThigh) bones.rightThigh.rotation.x = THREE.MathUtils.damp(bones.rightThigh.rotation.x, bx(bones.rightThigh) + 0.24, 16, rate);
          if (bones.leftShin) bones.leftShin.rotation.x = THREE.MathUtils.damp(bones.leftShin.rotation.x, bx(bones.leftShin) + 0.84, 16, rate);
          if (bones.rightShin) bones.rightShin.rotation.x = THREE.MathUtils.damp(bones.rightShin.rotation.x, bx(bones.rightShin) + 0.42, 16, rate);
          if (bones.leftUpperArm) {
            bones.leftUpperArm.rotation.x = THREE.MathUtils.damp(bones.leftUpperArm.rotation.x, bx(bones.leftUpperArm) - 0.48, 14, rate);
            bones.leftUpperArm.rotation.z = THREE.MathUtils.damp(bones.leftUpperArm.rotation.z, bz(bones.leftUpperArm) + 0.45, 14, rate);
          }
          if (bones.rightUpperArm) {
            bones.rightUpperArm.rotation.x = THREE.MathUtils.damp(bones.rightUpperArm.rotation.x, bx(bones.rightUpperArm) - 0.65, 14, rate);
            bones.rightUpperArm.rotation.z = THREE.MathUtils.damp(bones.rightUpperArm.rotation.z, bz(bones.rightUpperArm) - 0.45, 14, rate);
          }
        } else if (fs.phase === 'dark_dive') {
          if (bones.rightUpperArm) {
            bones.rightUpperArm.rotation.x = THREE.MathUtils.damp(bones.rightUpperArm.rotation.x, bx(bones.rightUpperArm) - 1.85, 22, rate);
          }
          if (bones.leftUpperArm) {
            bones.leftUpperArm.rotation.x = THREE.MathUtils.damp(bones.leftUpperArm.rotation.x, bx(bones.leftUpperArm) + 0.55, 22, rate);
          }
          if (bones.spine) {
            bones.spine.rotation.x = THREE.MathUtils.damp(bones.spine.rotation.x, bx(bones.spine) + 0.34, 20, rate);
          }
        } else {
          if (bones.leftThigh) bones.leftThigh.rotation.x = THREE.MathUtils.damp(bones.leftThigh.rotation.x, bx(bones.leftThigh), 12, rate);
          if (bones.rightThigh) bones.rightThigh.rotation.x = THREE.MathUtils.damp(bones.rightThigh.rotation.x, bx(bones.rightThigh), 12, rate);
          if (bones.leftShin) bones.leftShin.rotation.x = THREE.MathUtils.damp(bones.leftShin.rotation.x, bx(bones.leftShin), 12, rate);
          if (bones.rightShin) bones.rightShin.rotation.x = THREE.MathUtils.damp(bones.rightShin.rotation.x, bx(bones.rightShin), 12, rate);
          if (bones.leftUpperArm) bones.leftUpperArm.rotation.x = THREE.MathUtils.damp(bones.leftUpperArm.rotation.x, bx(bones.leftUpperArm), 12, rate);
          if (bones.rightUpperArm) bones.rightUpperArm.rotation.x = THREE.MathUtils.damp(bones.rightUpperArm.rotation.x, bx(bones.rightUpperArm), 12, rate);
          if (bones.spine) bones.spine.rotation.x = THREE.MathUtils.damp(bones.spine.rotation.x, bx(bones.spine), 12, rate);
        }
      }
    }

    if (this.customObitoPhysicsSolver && this.customObito.hasSkeleton) {
      this.customObitoPhysicsSolver.solve(simDt);
    }
    if (this.customObitoCloakSolver && this.customObito.hasSkeleton) {
      this.customObitoCloakSolver.solve(
        simDt,
        elapsed,
        0,
        fs.phase === 'jump_ascend' ? 9 : fs.phase === 'dark_dive' ? -14 : 0,
        0,
        0
      );
    }
    this.enforceSolidGroundContact(
      this.customObito.root,
      this.customObito.pivotGroup,
      this.customObito.bones,
      this.playerPos.y,
      this.playerSoleClearance
    );
    this.slashRibbons.update(
      simDt,
      this.camera,
      this.playerPos,
      this.customObito.bones,
      fs.phase === 'dark_dive'
    );
  }

  private updateFinisherEnemies(
    simDt: number,
    elapsed: number,
    fs: FinisherState,
    target: EnemyEntity | null
  ) {
    const maxR = this.getActiveArenaRadius() - 0.9;
    for (const e of this.enemies) {
      if (e === target && fs.flyActive) {
        // Knockback flight backward and upward
        e.pos.x += fs.flyVelX * simDt;
        e.pos.z += fs.flyVelZ * simDt;
        fs.flyVelY -= 24.5 * simDt;
        e.pos.y += fs.flyVelY * simDt;
        fs.flyRotX += fs.flySpinVel * simDt;

        const rDist = Math.hypot(e.pos.x, e.pos.z);
        if (rDist > maxR) {
          const nx = e.pos.x / rDist;
          const nz = e.pos.z / rDist;
          e.pos.x = nx * maxR;
          e.pos.z = nz * maxR;
          fs.flyVelX *= -0.35;
          fs.flyVelZ *= -0.35;
        }

        if (e.pos.y <= 0 && fs.flyVelY < 0) {
          e.pos.y = 0;
          if (Math.abs(fs.flyVelY) > 4.2) {
            fs.flyVelY = Math.abs(fs.flyVelY) * 0.34;
            fs.flyVelX *= 0.56;
            fs.flyVelZ *= 0.56;
            fs.flySpinVel *= 0.45;
            this.spawnShockRing(e.pos.x, 0.14, e.pos.z, 0xfbbf24, 3.2, 0.28, 0.8);
            this.spawnSmokePuff(e.pos.x, 0.4, e.pos.z, 0xe2e8f0, 0.8, 2.2, 0.45, 0.72);
          } else {
            fs.flyVelY = 0;
            fs.flyVelX *= Math.exp(-9 * simDt);
            fs.flyVelZ *= Math.exp(-9 * simDt);
            fs.flySpinVel = 0;
          }
        }

        if (e.pos.y > 0.35 && Math.random() < 0.72) {
          this.spawnSparks(e.pos, 0xfbbf24, 2, 7, 5);
        }

        if (e.hitFlashTimer > 0) {
          e.hitFlashTimer = Math.max(0, e.hitFlashTimer - simDt);
          e.rig.setHitFlash(e.hitFlashTimer > 0, 0xffffff);
        } else {
          e.rig.setHitFlash(false);
        }

        e.rig.root.position.set(
          e.pos.x,
          e.pos.y + (e.pos.y <= 0.05 && Math.abs(fs.flyVelY) <= 0.2 ? 0.35 : 0),
          e.pos.z
        );
        e.rig.root.rotation.set(0, e.yaw, 0);
        e.rig.pivotGroup.rotation.set(fs.flyRotX, 0, 0);
        e.shadow.position.set(e.pos.x, 0.03, e.pos.z);
        e.shadow.scale.setScalar(
          Math.max(0.28, (e.isBoss ? 1.45 : 1.0) * (1 - Math.min(0.68, e.pos.y * 0.08)))
        );
        if (e.cloakPhysicsSolver && e.isCustomTemplateRig) {
          e.cloakPhysicsSolver.solve(simDt, elapsed, fs.flyVelX, fs.flyVelY, fs.flyVelZ, 0);
        }
      } else {
        // Frozen gameplay enemy
        e.rig.setHitFlash(false);
        e.rig.root.position.copy(e.pos);
        e.rig.root.rotation.set(0, e.yaw, 0);
        e.rig.pivotGroup.rotation.set(0, 0, 0);
        this.enforceSolidGroundContact(
          e.rig.root,
          e.rig.pivotGroup,
          e.rig.bones,
          e.pos.y,
          e.soleClearance
        );
        e.shadow.position.set(e.pos.x, 0.03, e.pos.z);
      }
    }
  }

  private updateFinisherCamera(rawDt: number, fs: FinisherState, target: EnemyEntity | null) {
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const rx = Math.cos(this.playerYaw);
    const rz = -Math.sin(this.playerYaw);

    if (fs.phase === 'jump_ascend') {
      // Dynamic low orbit sweep as character leaps up
      _desiredCamPos.set(
        this.playerPos.x + fx * 3.8 + rx * 2.1,
        Math.max(0.75, this.playerPos.y - 0.55),
        this.playerPos.z + fz * 3.8 + rz * 2.1
      );
      _lookTarget.set(this.playerPos.x, this.playerPos.y + 1.45 * CHARACTER_WORLD_SCALE, this.playerPos.z);
      this.camBasePos.lerp(_desiredCamPos, 1 - Math.exp(-12 * rawDt));
    } else if (fs.phase === 'slow_zoom') {
      // Very fast Zoom In to a dramatic low-angle close-up near the player's face!
      this.customObito?.root.updateMatrixWorld(true);
      if (this.customObito?.bones.head) {
        this.customObito.bones.head.getWorldPosition(_finisherVecA);
        _finisherVecA.y += 0.1;
      } else {
        _finisherVecA.set(
          this.playerPos.x,
          this.playerPos.y + 1.56 * CHARACTER_WORLD_SCALE,
          this.playerPos.z
        );
      }

      _desiredCamPos.set(
        _finisherVecA.x + fx * 1.48 + rx * 0.44,
        Math.max(0.55, _finisherVecA.y - 0.36),
        _finisherVecA.z + fz * 1.48 + rz * 0.44
      );
      _lookTarget.set(_finisherVecA.x, _finisherVecA.y + 0.04, _finisherVecA.z);

      this.camBasePos.lerp(_desiredCamPos, 1 - Math.exp(-22 * rawDt));
      const nextFov = THREE.MathUtils.lerp(this.camera.fov, 38, 1 - Math.exp(-18 * rawDt));
      if (Math.abs(nextFov - this.camera.fov) > 0.04) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }
    } else if (fs.phase === 'dark_dive') {
      // Pull wide along the strike corridor to capture the diving impact
      const tgtX = target ? target.pos.x : this.impactPlayerPosFallbackX(fx);
      const tgtZ = target ? target.pos.z : this.impactPlayerPosFallbackZ(fz);
      const midX = (this.playerPos.x + tgtX) * 0.5;
      const midZ = (this.playerPos.z + tgtZ) * 0.5;

      _desiredCamPos.set(
        midX + rx * 4.8 - fx * 2.2,
        1.75 + this.playerPos.y * 0.25,
        midZ + rz * 4.8 - fz * 2.2
      );
      _lookTarget.set(midX, Math.max(0.95, this.playerPos.y * 0.45 + 0.7), midZ);
      this.camBasePos.lerp(_desiredCamPos, 1 - Math.exp(-18 * rawDt));
      const nextFov = THREE.MathUtils.lerp(this.camera.fov, 56, 1 - Math.exp(-16 * rawDt));
      if (Math.abs(nextFov - this.camera.fov) > 0.04) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }
    } else {
      // K.O! showcase: frame player & flying enemy
      const flyX = target ? target.pos.x : this.playerPos.x + fx * 6;
      const flyY = target ? target.pos.y + 1.1 : 1.8;
      const flyZ = target ? target.pos.z : this.playerPos.z + fz * 6;

      _desiredCamPos.set(
        this.playerPos.x - fx * 3.8 + rx * 3.2,
        2.1,
        this.playerPos.z - fz * 3.8 + rz * 3.2
      );
      _lookTarget.set(
        THREE.MathUtils.lerp(this.playerPos.x, flyX, 0.58),
        THREE.MathUtils.lerp(1.2, flyY, 0.65),
        THREE.MathUtils.lerp(this.playerPos.z, flyZ, 0.58)
      );
      this.camBasePos.lerp(_desiredCamPos, 1 - Math.exp(-7 * rawDt));
      const nextFov = THREE.MathUtils.lerp(this.camera.fov, fs.savedFov, 1 - Math.exp(-8 * rawDt));
      if (Math.abs(nextFov - this.camera.fov) > 0.04) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }
    }

    // Exact 10-frame Screen Shake on impact!
    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;
    if (fs.shakeFramesRemaining > 0) {
      const mag = 0.64 * (fs.shakeFramesRemaining / 10);
      shakeX = (Math.random() * 2 - 1) * mag;
      shakeY = (Math.random() * 2 - 1) * mag;
      shakeZ = (Math.random() * 2 - 1) * mag * 0.72;
      fs.shakeFramesRemaining -= 1;
    }

    this.camera.position.set(
      this.camBasePos.x + shakeX,
      Math.max(0.45, this.camBasePos.y + shakeY),
      this.camBasePos.z + shakeZ
    );
    _lookTarget.x += shakeX * 0.4;
    _lookTarget.y += shakeY * 0.4;
    _lookTarget.z += shakeZ * 0.4;
    this.camera.lookAt(_lookTarget);
  }

  private impactPlayerPosFallbackX(fx: number): number {
    return this.playerPos.x + fx * 3.0;
  }

  private impactPlayerPosFallbackZ(fz: number): number {
    return this.playerPos.z + fz * 3.0;
  }

  private resetPlayerPitchAndRoll(resetSpineBones = false) {
    this.turnLean = 0;
    if (!this.customObito) return;
    this.customObito.root.rotation.x = 0;
    this.customObito.root.rotation.z = 0;
    this.customObito.pivotGroup.rotation.x = 0;
    this.customObito.pivotGroup.rotation.z = 0;
    if (this.meleeAnimTimer <= 0 && !this.runCombatActive) {
      this.comboSpinYaw = 0;
      this.customObito.pivotGroup.rotation.y = 0;
    }

    if (this.customObito.hasSkeleton) {
      const { bones, baseBoneRotations, baseBonePositions } = this.customObito;
      this.anchorRigHipsParentToRest(bones, baseBoneRotations, baseBonePositions);
      if (bones.hips) {
        const baseHipsRot = baseBoneRotations.get(bones.hips);
        const baseHipsPos = baseBonePositions.get(bones.hips);
        if (baseHipsRot && (resetSpineBones || this.customObitoIsRunSource)) {
          bones.hips.rotation.copy(baseHipsRot);
        }
        if (baseHipsPos && (resetSpineBones || this.customObitoIsRunSource)) {
          bones.hips.position.copy(baseHipsPos);
        }
      }
      if (resetSpineBones) {
        const restore = (bone: THREE.Bone | null) => {
          if (!bone) return;
          const base = baseBoneRotations.get(bone);
          if (base) {
            bone.rotation.copy(base);
          }
        };
        restore(bones.spine);
        restore(bones.chest);
        restore(bones.head);
      }
    }
  }

  private computeChaseCameraTarget(outCamPos: THREE.Vector3, outLookTarget: THREE.Vector3) {
    const effectiveDist = this.camDist + this.susanooCamDistOffset;
    const horizDist = Math.cos(this.camPitch) * effectiveDist;
    const vertDist = Math.max(0.55, Math.sin(this.camPitch) * effectiveDist + 1.3 * CHARACTER_WORLD_SCALE);
    const aspectScale = THREE.MathUtils.clamp(this.camera.aspect / 1.45, 0.52, 1.05);
    const shoulderOffset = 0.92 * aspectScale;
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);

    outCamPos.set(
      this.playerPos.x + Math.sin(this.camYaw) * horizDist - rightX * shoulderOffset,
      Math.max(0.65, this.playerPos.y + vertDist),
      this.playerPos.z + Math.cos(this.camYaw) * horizDist - rightZ * shoulderOffset
    );

    const upTiltBonus = Math.max(0, 0.08 - this.camPitch) * 7.5;
    outLookTarget.set(
      this.playerPos.x - rightX * (shoulderOffset * 1.15),
      this.playerPos.y + 1.45 * CHARACTER_WORLD_SCALE + upTiltBonus + this.susanooCamLookYOffset,
      this.playerPos.z - rightZ * (shoulderOffset * 1.15)
    );
  }

  private snapChaseCamera() {
    this.computeChaseCameraTarget(_desiredCamPos, _lookTarget);
    this.camBasePos.copy(_desiredCamPos);
    this.camera.position.copy(this.camBasePos);
    this.camera.lookAt(_lookTarget);
  }

  private updateChaseCamera(dt: number, elapsed = 0) {
    let shakeX = 0;
    let shakeY = 0;
    let shakeZ = 0;
    if (this.cameraShake > 0.002) {
      const mag = this.cameraShake;
      shakeX = (Math.sin(elapsed * 54) * 0.45 + (Math.random() - 0.5) * 0.9) * mag;
      shakeY = (Math.cos(elapsed * 63) * 0.45 + (Math.random() - 0.5) * 0.9) * mag;
      shakeZ = (Math.sin(elapsed * 47 + 1.4) * 0.35 + (Math.random() - 0.5) * 0.7) * mag;
    }

    this.computeChaseCameraTarget(_desiredCamPos, _lookTarget);
    this.camBasePos.lerp(_desiredCamPos, 1 - Math.exp(-10 * dt));
    this.camBasePos.y = Math.max(0.65, this.camBasePos.y);

    this.camera.position.set(
      this.camBasePos.x + shakeX,
      Math.max(0.65, this.camBasePos.y + shakeY),
      this.camBasePos.z + shakeZ
    );
    _lookTarget.x += shakeX * 0.4;
    _lookTarget.y += shakeY * 0.4;
    _lookTarget.z += shakeZ * 0.4;
    this.camera.lookAt(_lookTarget);
  }

  private pushHud(force: boolean) {
    if (force) {
      this.lastHudPush = this.clock.elapsedTime;
    } else {
      this.lastHudPush = this.clock.elapsedTime;
    }

    const aliveEnemies = this.enemies.filter((e) => !e.isDying && e.hp > 0);
    let activeTarget: ActiveEnemyHud | null = null;
    if (aliveEnemies.length > 0) {
      const boss = aliveEnemies.find((e) => e.isBoss);
      const chosen = boss || this.findNearestEnemy(100) || aliveEnemies[0];
      activeTarget = {
        id: chosen.id,
        nameAr: chosen.nameAr,
        titleAr: chosen.titleAr,
        hp: Math.ceil(chosen.hp),
        maxHp: chosen.maxHp,
        isBoss: chosen.isBoss,
      };
    }

    const gedoRemaining = this.activeGedo
      ? this.activeGedo.phase === 'seal' || this.activeGedo.phase === 'emerging'
        ? this.activeGedo.activeDuration
        : this.activeGedo.phase === 'active'
          ? Math.max(0, this.activeGedo.activeDuration - this.activeGedo.phaseTimer)
          : 0
      : 0;

    const susanooRemaining = this.activeSusanoo
      ? this.activeSusanoo.phase === 'surging'
        ? this.activeSusanoo.activeDuration
        : this.activeSusanoo.phase === 'active'
          ? Math.max(0, this.activeSusanoo.activeDuration - this.activeSusanoo.phaseTimer)
          : 0
      : 0;

    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      hp: Math.ceil(this.playerHp),
      maxHp: this.playerMaxHp,
      chakra: Math.floor(this.playerChakra),
      maxChakra: this.playerMaxChakra,
      kamuiActive: this.kamuiTimer > 0,
      kamuiRemaining: Number(this.kamuiTimer.toFixed(1)),
      hasKamui: this.hasKamui,
      kamuiIntangible: this.isIntangibleKamuiUser && this.kamuiTimer > 0,
      hasGedoMazo: this.hasGedoMazo,
      gedoMazoActive: Boolean(this.activeGedo),
      gedoMazoRemaining: Number(gedoRemaining.toFixed(1)),
      susanooActive: Boolean(this.activeSusanoo),
      susanooStage: this.activeSusanoo ? this.activeSusanoo.stage : null,
      susanooRemaining: Number(susanooRemaining.toFixed(1)),
      substitutionLogs: this.substitutionLogs,
      maxSubstitutionLogs: this.maxSubstitutionLogs,
      substitutionRechargePct:
        this.substitutionLogs < this.maxSubstitutionLogs
          ? Math.round((this.substitutionRechargeTimer / this.substitutionRechargeDuration) * 100)
          : 100,
      guardGauge: Math.round(this.guardGauge),
      maxGuardGauge: this.maxGuardGauge,
      isGuarding: this.isGuarding,
      guardBroken: this.guardBroken,
      isChargingChakra: this.isChargingChakra,
      chakraDashCooldown: Number(this.chakraDashCooldown.toFixed(1)),
      awakeningGauge: Math.round(this.awakeningGauge),
      awakeningActive: this.awakeningActive,
      awakeningRemaining: Number(this.awakeningTimer.toFixed(1)),
      isKakashi: this.isKakashi,
      isItachi: this.isItachi,
      isMadara: this.isMadara,
      isDeidara: this.isDeidara,
      isNarutoKurama: this.isNarutoKurama,
      isNarutoSage: this.isNarutoSage,
      combo: this.combo,
      score: this.score,
      wave: this.wave,
      maxWaves: this.maxWaves,
      enemiesRemaining: aliveEnemies.length,
      activeTarget,
      cooldowns: { ...this.cooldowns },
      announcementAr: this.announcementAr,
      finisherActive: Boolean(this.finisherState),
      finisherOverlay: this.finisherOverlay,
      finisherFlashOpacity: Number(this.finisherFlashOpacity.toFixed(3)),
      finisherCooldown: Number(this.finisherCooldown.toFixed(1)),
      finisherReady: Boolean(
        this.phase === 'playing' &&
          !this.playerDying &&
          !this.finisherState &&
          this.finisherCooldown <= 0 &&
          aliveEnemies.length > 0
      ),
      isObitoOrTobi: this.isObitoOrTobi,
      obitoGazeActive: this.obitoGazeActive,
      obitoGazeCooldown: Number(this.obitoGazeCooldown.toFixed(1)),
    });
  }

  private measureRigSoleClearance(root: THREE.Object3D, bones: CharacterBones): number {
    root.updateMatrixWorld(true);
    root.getWorldPosition(_tempVecA);
    const rootY = _tempVecA.y;
    let ankleY = Infinity;

    if (bones.leftFoot) {
      bones.leftFoot.getWorldPosition(_tempVecB);
      ankleY = Math.min(ankleY, _tempVecB.y - rootY);
    }
    if (bones.rightFoot) {
      bones.rightFoot.getWorldPosition(_tempVecB);
      ankleY = Math.min(ankleY, _tempVecB.y - rootY);
    }
    const s = root.scale.y || 1;
    if (!Number.isFinite(ankleY)) {
      return 0.095 * s;
    }
    return THREE.MathUtils.clamp(ankleY + 0.015 * s, 0.085 * s, 0.16 * s);
  }

  /**
   * Keeps every character's feet, toes, knees, hands, and torso firmly above the solid y = 0 floor
   * regardless of animation hip offsets, crouches, lunges, or knockbacks.
   */
  private enforceSolidGroundContact(
    root: THREE.Object3D,
    pivotGroup: THREE.Group,
    bones: CharacterBones,
    groundY: number,
    ankleSoleClearance: number
  ) {
    const safeGroundY = Math.max(0, groundY);
    if (root.position.y < safeGroundY) {
      root.position.y = safeGroundY;
    }
    root.updateMatrixWorld(true);

    const rootScaleY = root.scale.y || 1;
    let minContactWorldY = Infinity;

    const feet = [bones.leftFoot, bones.rightFoot];
    for (let f = 0; f < feet.length; f++) {
      const foot = feet[f];
      if (!foot) continue;
      foot.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - ankleSoleClearance);

      for (let c = 0; c < foot.children.length; c++) {
        const child = foot.children[c];
        if ((child as THREE.Bone).isBone) {
          child.getWorldPosition(_tempVecB);
          minContactWorldY = Math.min(minContactWorldY, _tempVecB.y - 0.045 * rootScaleY);
          for (let s = 0; s < child.children.length; s++) {
            const sub = child.children[s];
            if ((sub as THREE.Bone).isBone) {
              sub.getWorldPosition(_tempVecB);
              minContactWorldY = Math.min(minContactWorldY, _tempVecB.y - 0.028 * rootScaleY);
            }
          }
        }
      }
    }

    if (bones.leftShin) {
      bones.leftShin.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.11 * rootScaleY);
    }
    if (bones.rightShin) {
      bones.rightShin.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.11 * rootScaleY);
    }
    if (bones.leftHand) {
      bones.leftHand.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.065 * rootScaleY);
    }
    if (bones.rightHand) {
      bones.rightHand.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.065 * rootScaleY);
    }
    if (bones.hips) {
      bones.hips.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.16 * rootScaleY);
    }
    if (bones.head) {
      bones.head.getWorldPosition(_tempVecA);
      minContactWorldY = Math.min(minContactWorldY, _tempVecA.y - 0.15 * rootScaleY);
    }

    const solidFloorTarget = safeGroundY + 0.012;
    if (Number.isFinite(minContactWorldY)) {
      if (minContactWorldY < solidFloorTarget) {
        const deltaY = (solidFloorTarget - minContactWorldY) / rootScaleY;
        if (deltaY > 0.0005) {
          pivotGroup.position.y += deltaY;
          root.updateMatrixWorld(true);
        }
      }
    } else if (pivotGroup.position.y < 0.012) {
      pivotGroup.position.y = 0.012;
      root.updateMatrixWorld(true);
    }
  }

  private animateSkeletalRunAndCombat(
    bones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>,
    walkPhase: number,
    elapsed: number,
    isMoving: boolean,
    strikeCurve: number,
    dt: number
  ) {
    const bx = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.x ?? 0 : 0);
    const by = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.y ?? 0 : 0);
    const bz = (b: THREE.Bone | null) => (b ? baseBoneRotations.get(b)?.z ?? 0 : 0);

    const phaseL = Math.sin(walkPhase);
    const phaseR = -phaseL;
    const breath = Math.sin(elapsed * 2.1) * 0.7 + Math.sin(elapsed * 0.9) * 0.3;

    let targetLeftThighX = bx(bones.leftThigh);
    let targetRightThighX = bx(bones.rightThigh);
    let targetLeftShinX = bx(bones.leftShin);
    let targetRightShinX = bx(bones.rightShin);
    let targetLeftFootX = bx(bones.leftFoot);
    let targetRightFootX = bx(bones.rightFoot);

    let targetHipsY = by(bones.hips);
    let targetSpineX = bx(bones.spine);
    let targetSpineY = by(bones.spine);
    let targetChestX = bx(bones.chest);
    let targetChestY = by(bones.chest);
    let targetHeadX = bx(bones.head);
    let targetHeadY = by(bones.head);

    let targetLeftArmX = bx(bones.leftUpperArm);
    let targetLeftArmZ = bz(bones.leftUpperArm);
    let targetLeftForeY = by(bones.leftForearm);
    let targetRightArmX = bx(bones.rightUpperArm);
    let targetRightArmZ = bz(bones.rightUpperArm);
    let targetRightForeY = by(bones.rightForearm);

    if (strikeCurve > 0.01) {
      targetLeftThighX -= 0.42 * strikeCurve;
      targetRightThighX += 0.44 * strikeCurve;
      targetLeftShinX += 0.54 * strikeCurve;
      targetRightShinX += 0.22 * strikeCurve;

      targetRightArmX -= 1.68 * strikeCurve;
      targetRightArmZ += 0.2 * strikeCurve;
      targetRightForeY += 0.1;
      targetLeftArmX += 0.48 * strikeCurve;
      targetHipsY += 0.3 * strikeCurve;
      targetSpineY += 0.24 * strikeCurve;
      targetChestY += 0.28 * strikeCurve;
      targetSpineX += 0.22 * strikeCurve;
      targetChestX += 0.18 * strikeCurve;
      targetHeadX -= 0.25 * strikeCurve;
      targetHeadY -= 0.45 * strikeCurve;
    } else if (isMoving) {
      // Exact Storm 4 Naruto Run kinematics (aerodynamic lean + swept-back arms + knee drive)
      const strideAmp = 0.9;
      targetLeftThighX -= phaseL * strideAmp;
      targetRightThighX += phaseL * strideAmp;
      targetLeftShinX += 0.30 + 0.60 * Math.max(0, -phaseL) + 0.35 * Math.max(0, phaseL);
      targetRightShinX += 0.30 + 0.60 * Math.max(0, -phaseR) + 0.35 * Math.max(0, phaseR);
      targetLeftFootX += Math.cos(walkPhase) * 0.24;
      targetRightFootX -= Math.cos(walkPhase) * 0.24;

      const windFlutter = Math.sin(walkPhase * 2) * 0.04;
      targetLeftArmX += 1.24 + windFlutter;
      targetRightArmX += 1.24 - windFlutter;
      targetLeftArmZ -= 0.16;
      targetRightArmZ += 0.16;
      targetLeftForeY -= 0.14;
      targetRightForeY += 0.14;

      targetHipsY -= Math.cos(walkPhase) * 0.07;
      targetSpineY += Math.cos(walkPhase) * 0.05;
      targetChestY += Math.cos(walkPhase) * 0.07;
      targetSpineX += 0.25;
      targetChestX += 0.24;
      targetHeadX -= 0.38;
      targetHeadY -= Math.cos(walkPhase) * 0.04;
    } else {
      // Combat Idle Ready Guard
      targetLeftThighX -= 0.18;
      targetRightThighX += 0.20;
      targetLeftShinX += 0.34;
      targetRightShinX += 0.28;
      targetLeftFootX -= 0.10;
      targetRightFootX -= 0.12;

      targetHipsY -= 0.22;
      targetSpineX += 0.06 + breath * 0.02;
      targetSpineY += 0.08;
      targetChestX += 0.05 + breath * 0.03;
      targetChestY += 0.10;
      targetHeadX -= 0.08;
      targetLeftArmX -= 0.34;
      targetLeftForeY -= 0.4;
      targetRightArmX += 0.26;
    }

    if (bones.hips) {
      const basePos = baseBonePositions.get(bones.hips);
      const drop = strikeCurve > 0.01 ? -0.1 * strikeCurve : isMoving ? -0.07 + Math.abs(Math.sin(walkPhase)) * 0.05 : -0.05 + breath * 0.01;
      bones.hips.position.y = THREE.MathUtils.damp(bones.hips.position.y, (basePos?.y ?? 1.0) + drop, 15, dt);
      bones.hips.rotation.y = THREE.MathUtils.damp(bones.hips.rotation.y, targetHipsY, 13, dt);
    }

    const rate = strikeCurve > 0.01 ? 22 : 14;
    if (bones.leftThigh) bones.leftThigh.rotation.x = THREE.MathUtils.damp(bones.leftThigh.rotation.x, targetLeftThighX, 16, dt);
    if (bones.rightThigh) bones.rightThigh.rotation.x = THREE.MathUtils.damp(bones.rightThigh.rotation.x, targetRightThighX, 16, dt);
    if (bones.leftShin) bones.leftShin.rotation.x = THREE.MathUtils.damp(bones.leftShin.rotation.x, targetLeftShinX, 16, dt);
    if (bones.rightShin) bones.rightShin.rotation.x = THREE.MathUtils.damp(bones.rightShin.rotation.x, targetRightShinX, 16, dt);
    if (bones.leftFoot) bones.leftFoot.rotation.x = THREE.MathUtils.damp(bones.leftFoot.rotation.x, targetLeftFootX, 16, dt);
    if (bones.rightFoot) bones.rightFoot.rotation.x = THREE.MathUtils.damp(bones.rightFoot.rotation.x, targetRightFootX, 16, dt);

    if (bones.leftUpperArm) {
      bones.leftUpperArm.rotation.x = THREE.MathUtils.damp(bones.leftUpperArm.rotation.x, targetLeftArmX, rate, dt);
      bones.leftUpperArm.rotation.z = THREE.MathUtils.damp(bones.leftUpperArm.rotation.z, targetLeftArmZ, rate, dt);
    }
    if (bones.leftForearm) bones.leftForearm.rotation.y = THREE.MathUtils.damp(bones.leftForearm.rotation.y, targetLeftForeY, rate, dt);
    if (bones.rightUpperArm) {
      bones.rightUpperArm.rotation.x = THREE.MathUtils.damp(bones.rightUpperArm.rotation.x, targetRightArmX, rate, dt);
      bones.rightUpperArm.rotation.z = THREE.MathUtils.damp(bones.rightUpperArm.rotation.z, targetRightArmZ, rate, dt);
    }
    if (bones.rightForearm) bones.rightForearm.rotation.y = THREE.MathUtils.damp(bones.rightForearm.rotation.y, targetRightForeY, rate, dt);
    if (bones.spine) {
      bones.spine.rotation.x = THREE.MathUtils.damp(bones.spine.rotation.x, targetSpineX, rate, dt);
      bones.spine.rotation.y = THREE.MathUtils.damp(bones.spine.rotation.y, targetSpineY, rate, dt);
    }
    if (bones.chest) {
      bones.chest.rotation.x = THREE.MathUtils.damp(bones.chest.rotation.x, targetChestX, rate, dt);
      bones.chest.rotation.y = THREE.MathUtils.damp(bones.chest.rotation.y, targetChestY, rate, dt);
    }
    if (bones.head) {
      bones.head.rotation.x = THREE.MathUtils.damp(bones.head.rotation.x, targetHeadX, 12, dt);
      bones.head.rotation.y = THREE.MathUtils.damp(bones.head.rotation.y, targetHeadY, 12, dt);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.orientationResizeTimeout !== null) {
      window.clearTimeout(this.orientationResizeTimeout);
      this.orientationResizeTimeout = null;
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    soundEngine.setMusicTheme('silent');
    this.clearCombatEntities();
    for (const r of this.shockRingPool) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.shockRingPool = [];
    for (const sm of this.smokePuffPool) {
      this.scene.remove(sm.sprite);
      sm.mat.dispose();
    }
    this.smokePuffPool = [];
    for (const sp of this.sparkPool) {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
    this.sparkPool = [];
    for (const fbLight of this.fireballGroundLights) {
      this.scene.remove(fbLight);
      fbLight.dispose();
    }
    this.fireballGroundLights = [];
    this.skillParticles.dispose();
    this.slashRibbons.dispose();
    if (this.playerRaikiriVfx) {
      this.scene.remove(this.playerRaikiriVfx.group);
      this.playerRaikiriVfx.coreMat.dispose();
      this.playerRaikiriVfx.outerMat.dispose();
      this.playerRaikiriVfx.haloMat.dispose();
      this.playerRaikiriVfx = null;
    }
    this.disposeComPreviewRig();
    this.comShadow.geometry.dispose();
    (this.comShadow.material as THREE.Material).dispose();
    const disposedSet = new Set<CustomGltfCharacter>();
    if (this.customObito) {
      this.restorePlayerIntangibilityMaterials();
      this.playerOriginalMaterials.clear();
      this.scene.remove(this.customObito.root);
      this.customObito.dispose();
      disposedSet.add(this.customObito);
      this.customObito = null;
    }
    this.customObitoPhysicsSolver = null;
    this.customObitoCloakSolver = null;
    this.comPreviewCloakSolver = null;
    this.activePlayerRigCacheKey = null;
    for (const entry of this.playerRigCache.values()) {
      if (!disposedSet.has(entry.obito)) {
        this.scene.remove(entry.obito.root);
        entry.obito.dispose();
        disposedSet.add(entry.obito);
      }
    }
    this.playerRigCache.clear();
    this.playerRigInflight.clear();
    for (const template of this.enemyPresetTemplates.values()) {
      template.dispose();
    }
    this.enemyPresetTemplates.clear();
    this.enemyPresetLoads.clear();
    disposeGedoMazoTemplateCache();
    disposeSusanooTemplateCache();
    disposeCustomMapTemplateCache();
    if (this.clayGeoCache) {
      Object.values(this.clayGeoCache).forEach((g) => g.dispose());
      this.clayGeoCache = null;
    }
    if (this.kuramaGeoCache) {
      Object.values(this.kuramaGeoCache).forEach((g) => g.dispose());
      this.kuramaGeoCache = null;
    }
    this.bakedRunAnim = null;
    this.bakedCombatAnim = null;
    this.bakedRunIdleAnim = null;
    this.bakedDeathAnim = null;
    this.loadedRunClip = null;
    this.loadedRunIdleClip = null;
    this.playerRunTargetState = null;
    this.playerCombatTargetState = null;
    this.playerIdleTargetState = null;
    this.playerDeathTargetState = null;
    this.ualRetargetDriver?.dispose();
    this.ualRetargetDriver = null;
    this.enemyUalClipsByPreset.clear();
    this.madaraActiveAttackAction = null;

    this.environment.dispose();
    this.materials.dispose();
    this.contactShadowTex.dispose();
    this.kamuiTex.dispose();
    this.fireGlowTex.dispose();
    this.fireFlameTex.dispose();
    this.smokeCloudTex.dispose();
    this.scorchTex.dispose();
    this.scorchEmberTex.dispose();
    this.groundCrackTex.dispose();
    this.summoningSealTex.dispose();
    for (const tex of this.damageNumberTextures.values()) {
      tex.dispose();
    }
    this.damageNumberTextures.clear();
    this.kamuiPortalMesh.geometry.dispose();
    (this.kamuiPortalMesh.material as THREE.Material).dispose();
    this.kamuiOuterRingMesh.geometry.dispose();
    (this.kamuiOuterRingMesh.material as THREE.Material).dispose();
    this.sparkGeo.dispose();
    this.fireballCoreGeo.dispose();
    this.fireballOuterGeo.dispose();
    this.fireVolumeGeo.dispose();
    this.fireTrailConeGeo.dispose();
    this.sphereShockGeo.dispose();
    this.ringGeo.dispose();
    this.rodGeo.dispose();
    this.groundDecalGeo.dispose();
    this.stoneDebrisGeo.dispose();
    this.stoneDebrisMat.dispose();
    this.slashArcGeo.dispose();
    this.vortexRingGeo.dispose();
    this.chainGeo.dispose();
    this.subLogGeo.dispose();
    this.subLogCapGeo.dispose();
    this.subLogBarkMat.dispose();
    this.subLogCutMat.dispose();
    this.scene.remove(this.guardShieldMesh);
    this.guardShieldMesh.geometry.dispose();
    (this.guardShieldMesh.material as THREE.Material).dispose();
    this.scene.remove(this.chakraChargeRingMesh);
    this.chakraChargeRingMesh.geometry.dispose();
    (this.chakraChargeRingMesh.material as THREE.Material).dispose();
    this.scene.remove(this.awakeningAuraMesh);
    this.awakeningAuraMesh.geometry.dispose();
    (this.awakeningAuraMesh.material as THREE.Material).dispose();
    this.scene.remove(this.awakeningRingMesh);
    this.awakeningRingMesh.geometry.dispose();
    (this.awakeningRingMesh.material as THREE.Material).dispose();

    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
