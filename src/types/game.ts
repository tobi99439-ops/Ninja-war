import portraitObitoUchiha from '../assets/images/portrait_obito_uchiha_1794960885211.jpg';
import portraitKakashiHatake from '../assets/images/portrait_kakashi_hatake_1794960886820.jpg';
import portraitMadaraUchiha from '../assets/images/portrait_madara_uchiha_1794960887268.jpg';
import portraitTobiV2 from '../assets/images/portrait_tobi_v2_1794960887324.jpg';
import portraitItachiUchiha from '../assets/images/portrait_itachi_uchiha_1795014271409.jpg';
import portraitDeidara from '../assets/images/portrait_deidara_akatsuki_1795038425812.jpg';
import portraitNarutoKurama from '../assets/images/portrait_naruto_kurama_mode_1795078971779.jpg';
import portraitNarutoSage from '../assets/images/portrait_naruto_sage_mode_1795081454362.jpg';
import portraitMadaraSixPaths from '../assets/images/portrait_madara_six_paths_1795178225494.jpg';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export type GameMode = 'survival' | 'boss_rush';

export type ArenaStageId = 'konoha' | 'kamui' | 'amegakure' | 'custom_map' | (string & {});

export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export type ParticleDensity = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  shadowQuality: ShadowQuality;
  particleDensity: ParticleDensity;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  shadowQuality: 'high',
  particleDensity: 'high',
};

export interface ArenaStagePreset {
  id: ArenaStageId;
  nameAr: string;
  subtitleAr: string;
}

export const ARENA_STAGES: ArenaStagePreset[] = [
  {
    id: 'konoha',
    nameAr: 'قرية كونوها',
    subtitleAr: 'الشارع الرئيسي وجبل الهوكاجي',
  },
  {
    id: 'kamui',
    nameAr: 'بُعد الكاموي',
    subtitleAr: 'منصة المكعبات الحجرية',
  },
  {
    id: 'amegakure',
    nameAr: 'قرية المطر',
    subtitleAr: 'أعلى أبراج أميغاكوري الممطرة',
  },
  {
    id: 'custom_map',
    nameAr: 'الساحة الجديدة',
    subtitleAr: 'خريطة 3D مخصصة (2snmwp)',
  },
];

export type SusanooStage = 'ribcage' | 'armored' | 'muscular' | 'perfect';

export type JutsuId =
  | 'melee'
  | 'fuma'
  | 'kamui'
  | 'katon'
  | 'rinnegan'
  | 'gedo'
  | 'raikiri'
  | 'suiton'
  | 'amaterasu'
  | 'tsukuyomi'
  | 'susanoo'
  | 'susanoo_ribcage'
  | 'susanoo_armored'
  | 'susanoo_muscular'
  | 'susanoo_perfect'
  | 'c1_birds'
  | 'c2_dragon'
  | 'c3_ultimate'
  | 'rasenshuriken'
  | 'bijuu_dama'
  | 'kurama_roar'
  | 'bijuu_barrage'
  | 'sage_odama'
  | 'sage_kata'
  | 'sage_barrage';

export interface JutsuMeta {
  id: JutsuId;
  nameAr: string;
  keyLabel: string;
  chakraCost: number;
  cooldownSec: number;
  accentHex: string;
  descriptionAr: string;
}

export const OBITO_JUTSU_LIST: JutsuMeta[] = [
  {
    id: 'melee',
    nameAr: 'ضربة الشاكرا',
    keyLabel: 'J / نقر',
    chakraCost: 0,
    cooldownSec: 0.35,
    accentHex: '#e2e8f0',
    descriptionAr: 'هجوم قريب بعصا الشاكرا السوداء (3 ضربات متتالية)',
  },
  {
    id: 'fuma',
    nameAr: 'شوريكين فوما',
    keyLabel: '1 / K',
    chakraCost: 18,
    cooldownSec: 2.2,
    accentHex: '#ef4444',
    descriptionAr: 'إطلاق شوريكين فوما العملاقة الدوارة من بعد الكاموي',
  },
  {
    id: 'kamui',
    nameAr: 'كاموي',
    keyLabel: '2 / L',
    chakraCost: 26,
    cooldownSec: 5.5,
    accentHex: '#a855f7',
    descriptionAr: 'اختفاء في البعد الموازي لتفادي الضربات وجذب الأعداء',
  },
  {
    id: 'katon',
    nameAr: 'رقصة اللهب',
    keyLabel: '3 / U',
    chakraCost: 34,
    cooldownSec: 6.5,
    accentHex: '#f97316',
    descriptionAr: 'كاتون: دوامة نيران الكاموي الحارقة حول الميدان',
  },
  {
    id: 'rinnegan',
    nameAr: 'شينرا تينسي',
    keyLabel: '4 / I',
    chakraCost: 45,
    cooldownSec: 9.0,
    accentHex: '#8b5cf6',
    descriptionAr: 'موجة الرينيغان الجاذبية وإمطار قضبان الشاكرا',
  },
  {
    id: 'gedo',
    nameAr: 'استدعاء غيدو مازو',
    keyLabel: 'R / 5',
    chakraCost: 40,
    cooldownSec: 22.0,
    accentHex: '#c084fc',
    descriptionAr: 'تقنية الاستدعاء: تمثال غيدو مازو — صواعق بنفسجية وزرقاء تصعق وتدفع الأعداء (15ث)',
  },
  {
    id: 'raikiri',
    nameAr: 'رايكيري (البرق)',
    keyLabel: '2 / L',
    chakraCost: 26,
    cooldownSec: 4.5,
    accentHex: '#38bdf8',
    descriptionAr: 'تقنية البرق: اندفاع وصاعقة رايكيري تخترق الأعداء بشحنة كهربائية',
  },
  {
    id: 'suiton',
    nameAr: 'تنين الماء (الماء)',
    keyLabel: '4 / I',
    chakraCost: 30,
    cooldownSec: 5.5,
    accentHex: '#06b6d4',
    descriptionAr: 'تقنية الماء: موجة وتنين الماء المندفع نحو الأعداء',
  },
  {
    id: 'amaterasu',
    nameAr: 'أماتيراس',
    keyLabel: '2 / L',
    chakraCost: 30,
    cooldownSec: 6.5,
    accentHex: '#dc2626',
    descriptionAr: 'نار سوداء لا تنطفئ تشتعل على موقع العدو وتُلحق به ضرراً مستمراً',
  },
  {
    id: 'tsukuyomi',
    nameAr: 'تسوكويومي',
    keyLabel: '4 / I',
    chakraCost: 42,
    cooldownSec: 9.0,
    accentHex: '#991b1b',
    descriptionAr: 'موجة وهم الشارينغان الحمراء والسوداء تشل حركة الأعداء لثوانٍ وتُدمّرهم',
  },
  {
    id: 'susanoo',
    nameAr: 'السوسانو المدرع',
    keyLabel: 'R / 5',
    chakraCost: 45,
    cooldownSec: 18.0,
    accentHex: '#7e22ce',
    descriptionAr: 'تفعيل السوسانو المدرع الأسطوري لمادارا (14ث)',
  },
  {
    id: 'susanoo_ribcage',
    nameAr: 'سوسانو الأضلاع',
    keyLabel: 'R / 5',
    chakraCost: 35,
    cooldownSec: 14.0,
    accentHex: '#2563eb',
    descriptionAr: 'المرحلة الأولى: قفص أضلاع الشاكرا الأزرق وأذرع بمخالب قتالية وموجات متتالية (14ث)',
  },
  {
    id: 'susanoo_armored',
    nameAr: 'السوسانو الهيكلي',
    keyLabel: 'T / 6',
    chakraCost: 45,
    cooldownSec: 18.0,
    accentHex: '#2563eb',
    descriptionAr: 'المرحلة الثانية: السوسانو الهيكلي بالأزرق المتوهج مع أضلاع عريضة وأذرع هيكلية خماسية ممتدة بدون عين حمراء (14ث)',
  },
  {
    id: 'susanoo_muscular',
    nameAr: 'السوسانو الشيطاني',
    keyLabel: 'G / 7',
    chakraCost: 55,
    cooldownSec: 22.0,
    accentHex: '#1d4ed8',
    descriptionAr: 'المرحلة الثالثة: السوسانو العضلي الشيطاني بالأزرق الملكي مع شفرة مسننة منحنية ويد خماسية عملاقة (14ث)',
  },
  {
    id: 'susanoo_perfect',
    nameAr: 'السوسانو الكامل',
    keyLabel: 'Y / 8',
    chakraCost: 65,
    cooldownSec: 26.0,
    accentHex: '#3b82f6',
    descriptionAr: 'المرحلة النهائية: السوسانو الكامل الساموراي بالأزرق الملكي مع الأجنحة والكيمونو ومادارا داخل بلورة الجبهة (16ث)',
  },
  {
    id: 'c1_birds',
    nameAr: 'طيور الطين C1',
    keyLabel: '1 / K',
    chakraCost: 20,
    cooldownSec: 2.4,
    accentHex: '#f59e0b',
    descriptionAr: 'رمي طيور طينية بيضاء تنطلق نحو الأعداء وتنفجر بلهب ودخان',
  },
  {
    id: 'c2_dragon',
    nameAr: 'التنين الطيني C2',
    keyLabel: '2 / L',
    chakraCost: 34,
    cooldownSec: 5.8,
    accentHex: '#ef4444',
    descriptionAr: 'نفخ كرة وتنين طيني متفجر كبير يُحدث دماراً واسع النطاق',
  },
  {
    id: 'c3_ultimate',
    nameAr: 'الانفجار الفني C0',
    keyLabel: '3 / R',
    chakraCost: 48,
    cooldownSec: 11.0,
    accentHex: '#fbbf24',
    descriptionAr: 'الفن هو الانفجار! انفجار C3 / C0 ضخم يهز الساحة ويدمّر الأعداء',
  },
  {
    id: 'rasenshuriken',
    nameAr: 'راسين شوريكن',
    keyLabel: '1 / K',
    chakraCost: 24,
    cooldownSec: 3.0,
    accentHex: '#38bdf8',
    descriptionAr: 'فوتون: راسين شوريكن — دوامة رياح حادة تنطلق وتنفجر بقبة رياح مدمرة',
  },
  {
    id: 'bijuu_dama',
    nameAr: 'كرة البيجو',
    keyLabel: '2 / L',
    chakraCost: 36,
    cooldownSec: 6.0,
    accentHex: '#a855f7',
    descriptionAr: 'قنبلة وحش البيجو المشحونة بالتشاكرا السوداء والحمراء تُدمر محيطها بالكامل',
  },
  {
    id: 'kurama_roar',
    nameAr: 'زئير كوراما',
    keyLabel: '3 / U',
    chakraCost: 30,
    cooldownSec: 6.5,
    accentHex: '#f59e0b',
    descriptionAr: 'انفجار تشاكرا كوراما الذهبية وموجة صدمة تُطير الأعداء وتشُلهم',
  },
  {
    id: 'bijuu_barrage',
    nameAr: 'وابل كرات البيجو',
    keyLabel: 'R / 5',
    chakraCost: 48,
    cooldownSec: 11.0,
    accentHex: '#ef4444',
    descriptionAr: 'إطلاق 3 كرات بيجو متتالية تمطر الأعداء بانفجارات تشاكرا هائلة',
  },
  {
    id: 'sage_odama',
    nameAr: 'راسينغان عملاقة',
    keyLabel: '2 / L',
    chakraCost: 28,
    cooldownSec: 4.5,
    accentHex: '#38bdf8',
    descriptionAr: 'أوداما راسينغان: كرة طاقة طبيعية عملاقة مندفعة تنفجر بعنف',
  },
  {
    id: 'sage_kata',
    nameAr: 'كاوازو كوميـتي',
    keyLabel: '3 / U',
    chakraCost: 30,
    cooldownSec: 6.0,
    accentHex: '#f59e0b',
    descriptionAr: 'فنون الضفدع القتالية: موجة طاقة طبيعية ذهبية تشُل وتطير الأعداء المحيطين',
  },
  {
    id: 'sage_barrage',
    nameAr: 'وابل الراسينغان',
    keyLabel: 'R / 5',
    chakraCost: 46,
    cooldownSec: 10.5,
    accentHex: '#fb923c',
    descriptionAr: 'تقنية الناسك: إطلاق وابل 3 راسينغان عملاقة ساج مود تدمر الساحة',
  },
];

export interface ActiveEnemyHud {
  id: string;
  nameAr: string;
  titleAr: string;
  hp: number;
  maxHp: number;
  isBoss: boolean;
}

export interface HudSnapshot {
  phase: GamePhase;
  mode: GameMode;
  hp: number;
  maxHp: number;
  chakra: number;
  maxChakra: number;
  kamuiActive: boolean;
  kamuiRemaining: number;
  hasKamui: boolean;
  kamuiIntangible: boolean;
  hasGedoMazo: boolean;
  gedoMazoActive: boolean;
  gedoMazoRemaining: number;
  susanooActive: boolean;
  susanooStage: SusanooStage | null;
  susanooRemaining: number;
  substitutionLogs: number;
  maxSubstitutionLogs: number;
  substitutionRechargePct: number;
  guardGauge: number;
  maxGuardGauge: number;
  isGuarding: boolean;
  guardBroken: boolean;
  isChargingChakra: boolean;
  chakraDashCooldown: number;
  awakeningGauge: number;
  awakeningActive: boolean;
  awakeningRemaining: number;
  isKakashi: boolean;
  isItachi: boolean;
  isMadara: boolean;
  isDeidara: boolean;
  isNarutoKurama: boolean;
  isNarutoSage: boolean;
  combo: number;
  score: number;
  wave: number;
  maxWaves: number;
  enemiesRemaining: number;
  activeTarget: ActiveEnemyHud | null;
  cooldowns: Record<JutsuId, number>;
  announcementAr: string | null;
  finisherActive: boolean;
  finisherOverlay: 'none' | 'ko' | 'victory';
  finisherFlashOpacity: number;
  finisherCooldown: number;
  finisherReady: boolean;
  isObitoOrTobi: boolean;
  obitoGazeActive: boolean;
  obitoGazeCooldown: number;
}

export type CharacterPresetId =
  | 'mask_man'
  | 'mask_man_v2'
  | 'obito_uchiha'
  | 'obito_original'
  | 'kakashi'
  | 'madara'
  | 'madara_six_paths'
  | 'madara_rikudo'
  | 'itachi'
  | 'naruto_kurama'
  | 'naruto_sage'
  | 'deidara'
  | 'obito_47c8x1'
  | 'obito_1'
  | 'character_2'
  | 'tobi'
  | string;

export interface CharacterPreset {
  id: string;
  nameAr: string;
  subtitleAr: string;
  glbUrl: string;
  displayNameEn?: string;
  teamNameEn?: string;
  teamNameAr?: string;
  ultimateJutsuEn?: string;
  ultimateJutsuAr?: string;
  portraitUrl?: string;
}

export const OBITO_PORTRAIT_URL = portraitObitoUchiha;
export const DEFAULT_OBITO_GLB_URL = '/assets/characters/mask_man/Tobi%20Mask.fbx';
export const FALLBACK_OBITO_GLB_URL = 'https://files.catbox.moe/12s7cu.glb';

export const STORM4_FEATURED_IDS = [
  'obito_uchiha',
  'kakashi',
  'madara',
  'madara_six_paths',
  'madara_rikudo',
  'madara_rikudo_custom',
  'itachi',
  'naruto_kurama',
  'naruto_sage',
  'deidara',
  'mask_man_v2',
  'mask_man',
  'obito_original',
  'obito_47c8x1',
] as const;

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'mask_man',
    nameAr: 'توبي المقنّع',
    subtitleAr: 'مجسم Mask Man ثلاثي الأبعاد',
    glbUrl: '/assets/characters/mask_man/Tobi%20Mask.fbx',
    displayNameEn: 'TOBI (MASKED)',
    teamNameEn: 'AKATSUKI SHADOW',
    teamNameAr: 'ظلال الأكاتسوكي',
    ultimateJutsuEn: 'KAMUI: SHINRA TENSEI',
    ultimateJutsuAr: 'شينرا تينسي الكاموي',
    portraitUrl: portraitTobiV2,
  },
  {
    id: 'mask_man_v2',
    nameAr: 'توبي V2',
    subtitleAr: 'مجسم Mask Man V2 ثلاثي الأبعاد',
    glbUrl: '/assets/characters/mask_man_v2/Tobi.fbx',
    displayNameEn: 'TOBI V2',
    teamNameEn: 'MASKED AKATSUKI',
    teamNameAr: 'الأكاتسوكي المقنّع',
    ultimateJutsuEn: 'SUMMONING: GEDO MAZO',
    ultimateJutsuAr: 'استدعاء تمثال غيدو مازو',
    portraitUrl: portraitTobiV2,
  },
  {
    id: 'madara_rikudo',
    nameAr: 'مادارا الريكودو',
    subtitleAr: 'مجسم ثلاثي الأبعاد جديد بحركات وأنيميشن توبي V2 الكاملة',
    glbUrl: '/assets/characters/madara_rikudo/output.glb',
    displayNameEn: 'MADARA RIKUDO',
    teamNameEn: 'SIX PATHS SAGE',
    teamNameAr: 'حكيم المسارات الستة',
    ultimateJutsuEn: 'SUMMONING: GEDO MAZO',
    ultimateJutsuAr: 'استدعاء تمثال غيدو مازو',
    portraitUrl: portraitMadaraSixPaths,
  },
  {
    id: 'new_character_9bbweg',
    nameAr: 'شينوبي جديد (9bbweg)',
    subtitleAr: 'المجسم الجديد بحركات توبي V2 الكاملة والخامات الأصلية',
    glbUrl: '/assets/characters/new_character/output.glb',
    displayNameEn: 'NEW SHINOBI 9BBWEG',
    teamNameEn: 'LEGENDARY WARRIOR',
    teamNameAr: 'المقاتل الأسطوري',
    ultimateJutsuEn: 'SUMMONING: GEDO MAZO',
    ultimateJutsuAr: 'استدعاء تمثال غيدو مازو',
    portraitUrl: portraitMadaraSixPaths,
  },
  {
    id: 'obito_uchiha',
    nameAr: 'أوبيتو أوتشيها',
    subtitleAr: 'قدرات توبي V2 + كاموي غير ملموس (10ث)',
    glbUrl: 'https://files.catbox.moe/qnmubz.glb',
    displayNameEn: 'OBITO UCHIHA',
    teamNameEn: 'UCHIHA WAR FRONT',
    teamNameAr: 'جبهة حرب الأوتشيها',
    ultimateJutsuEn: 'KAMUI PHANTOM: GEDO MAZO',
    ultimateJutsuAr: 'كاموي الشبح: غيدو مازو',
    portraitUrl: portraitObitoUchiha,
  },
  {
    id: 'obito_original',
    nameAr: 'اوبيتو اوتشيها الاصلي',
    subtitleAr: 'حركات وقدرات توبي V2 كاملة',
    glbUrl: 'https://files.catbox.moe/gxujni.glb',
    displayNameEn: 'OBITO (WAR)',
    teamNameEn: 'UCHIHA LEGACY',
    teamNameAr: 'إرث الأوتشيها',
    ultimateJutsuEn: 'KATON: BLAST WAVE DANCE',
    ultimateJutsuAr: 'رقصة موجة اللهب',
    portraitUrl: portraitObitoUchiha,
  },
  {
    id: 'kakashi',
    nameAr: 'كاكاشي هاتاكي',
    subtitleAr: 'حركات توبي V2 + البرق والنار والماء',
    glbUrl: 'https://files.catbox.moe/3ns6jl.glb',
    displayNameEn: 'KAKASHI HATAKE',
    teamNameEn: 'TEAM 7 COPY NINJA',
    teamNameAr: 'الفريق السابع - النينجا الناسخ',
    ultimateJutsuEn: 'LIGHTNING BLADE: RAIKIRI',
    ultimateJutsuAr: 'سيف البرق: رايكيري',
    portraitUrl: portraitKakashiHatake,
  },
  {
    id: 'madara',
    nameAr: 'مادارا أوتشيها',
    subtitleAr: 'مجسم مادارا ثلاثي الأبعاد',
    glbUrl: 'https://files.catbox.moe/mrjiej.glb',
    displayNameEn: 'MADARA UCHIHA',
    teamNameEn: 'LEGENDARY UCHIHA',
    teamNameAr: 'أسطورة عشيرة الأوتشيها',
    ultimateJutsuEn: 'KATON: GREAT FIRE ANNIHILATION',
    ultimateJutsuAr: 'النار العظمى: إبادة اللهب',
    portraitUrl: portraitMadaraUchiha,
  },
  {
    id: 'madara_six_paths',
    nameAr: 'مادارا المسارات الستة',
    subtitleAr: 'طور حكيم المسارات الستة وكرات الحقيقة التسع (okh0vs)',
    glbUrl: '/assets/characters/madara_six_paths/madara_six_paths.glb',
    displayNameEn: 'MADARA (SIX PATHS)',
    teamNameEn: 'TEN TAILS JINCHURIKI',
    teamNameAr: 'جينشوريكي الجيوبي',
    ultimateJutsuEn: 'LIMBO: BORDER JAIL',
    ultimateJutsuAr: 'ليمبو: سجن الحدود',
    portraitUrl: portraitMadaraSixPaths,
  },
  {
    id: 'madara_rikudo_custom',
    nameAr: 'مادارا الريكودو المخصص',
    subtitleAr: 'تقنيات مادارا الريكودو الكاملة والألوان الأصلية (المجسم الداخلي)',
    glbUrl: '/assets/characters/madara_six_paths/madara_six_paths.glb',
    displayNameEn: 'MADARA RIKUDO CUSTOM',
    teamNameEn: 'SIX PATHS ANCESTOR',
    teamNameAr: 'سلف المسارات الستة',
    ultimateJutsuEn: 'LIMBO HENGOKU & SUSANOO',
    ultimateJutsuAr: 'ليمبو هينغوكو والسوسانو الأسطوري',
    portraitUrl: portraitMadaraSixPaths,
  },
  {
    id: 'itachi',
    nameAr: 'إيتاتشي أوتشيها',
    subtitleAr: 'نار أماتيراس السوداء ووهم تسوكويومي والسوسانو الناري',
    glbUrl: 'https://files.catbox.moe/enh5qq.glb',
    displayNameEn: 'ITACHI UCHIHA',
    teamNameEn: 'AKATSUKI GENIUS',
    teamNameAr: 'عبقري الأكاتسوكي',
    ultimateJutsuEn: 'SUSANOO · AMATERASU · TSUKUYOMI',
    ultimateJutsuAr: 'السوسانو الناري وأماتيراس وتسوكويومي',
    portraitUrl: portraitItachiUchiha,
  },
  {
    id: 'naruto_kurama',
    nameAr: 'ناروتو كوراما مود',
    subtitleAr: 'راسين شوريكن وكرات البيجو وزئير كوراما الذهبي',
    glbUrl: 'https://files.catbox.moe/zw6rnu.glb',
    displayNameEn: 'NARUTO (KURAMA)',
    teamNameEn: 'NINE-TAILS JINCHURIKI',
    teamNameAr: 'جينشوريكي الذيول التسعة',
    ultimateJutsuEn: 'RASENSHURIKEN & BIJUU DAMA',
    ultimateJutsuAr: 'راسين شوريكن وكرات البيجو',
    portraitUrl: portraitNarutoKurama,
  },
  {
    id: 'naruto_sage',
    nameAr: 'ناروتو ساج مود',
    subtitleAr: 'فنون الناسك: راسين شوريكن وأوداما راسينغان وكاوازو كوميتي',
    glbUrl: 'procedural://naruto_sage',
    displayNameEn: 'NARUTO (SAGE)',
    teamNameEn: 'MOUNT MYOBOKU SAGE',
    teamNameAr: 'ناسك جبل ميوبوكو',
    ultimateJutsuEn: 'SAGE ART: MASSIVE RASENGAN BARRAGE',
    ultimateJutsuAr: 'تقنية الناسك: وابل الراسينغان العملاقة',
    portraitUrl: portraitNarutoSage,
  },
  {
    id: 'deidara',
    nameAr: 'ديدارا',
    subtitleAr: 'طيور الطين C1 وتنين C2 والانفجار الأعظم C0',
    glbUrl: 'https://files.catbox.moe/1hn6zf.glb',
    displayNameEn: 'DEIDARA',
    teamNameEn: 'AKATSUKI ARTISTS',
    teamNameAr: 'فنانو الأكاتسوكي',
    ultimateJutsuEn: 'C3 / C0: ART IS AN EXPLOSION',
    ultimateJutsuAr: 'الانفجار الفني الأعظم C0',
    portraitUrl: portraitDeidara,
  },
  {
    id: 'obito_47c8x1',
    nameAr: 'أوبيتو (الأصلي)',
    subtitleAr: 'مجسم 47c8x1 ثلاثي الأبعاد',
    glbUrl: 'https://files.catbox.moe/47c8x1.fbx',
    displayNameEn: 'OBITO CLASSIC',
    teamNameEn: 'UCHIHA CLAN',
    teamNameAr: 'عشيرة الأوتشيها',
    ultimateJutsuEn: 'KAMUI VORTEX',
    ultimateJutsuAr: 'دوامة الكاموي',
    portraitUrl: portraitObitoUchiha,
  },
  {
    id: 'obito_1',
    nameAr: 'أوبيتو (الأول)',
    subtitleAr: 'مجسم 12s7cu ثلاثي الأبعاد',
    glbUrl: 'https://files.catbox.moe/12s7cu.glb',
    displayNameEn: 'OBITO WAR V1',
    teamNameEn: 'UCHIHA CLAN',
    teamNameAr: 'عشيرة الأوتشيها',
    ultimateJutsuEn: 'SHINRA TENSEI',
    ultimateJutsuAr: 'شينرا تينسي',
    portraitUrl: portraitObitoUchiha,
  },
  {
    id: 'character_2',
    nameAr: 'الشخصية 2',
    subtitleAr: 'مجسم ddusc6 ثلاثي الأبعاد',
    glbUrl: 'https://files.catbox.moe/ddusc6.glb',
    displayNameEn: 'SHINOBI II',
    teamNameEn: 'HIDDEN LEAF',
    teamNameAr: 'قرية الورق المخفية',
    ultimateJutsuEn: 'CHAKRA OVERDRIVE',
    ultimateJutsuAr: 'انفجار الشاكرا',
    portraitUrl: portraitObitoUchiha,
  },
  {
    id: 'tobi',
    nameAr: 'توبي',
    subtitleAr: 'مجسم qwkco0 ثلاثي الأبعاد',
    glbUrl: 'https://files.catbox.moe/qwkco0.glb',
    displayNameEn: 'TOBI',
    teamNameEn: 'AKATSUKI DUO',
    teamNameAr: 'ثنائي الأكاتسوكي',
    ultimateJutsuEn: 'KAMUI TELEPORT',
    ultimateJutsuAr: 'انتقال الكاموي',
    portraitUrl: portraitTobiV2,
  },
];

export function getCharacterPortrait(id: CharacterPresetId): string {
  const preset = CHARACTER_PRESETS.find((c) => c.id === id);
  return preset?.portraitUrl || portraitObitoUchiha;
}
