import { CharacterColorPreset } from '../three/models/warObitoColorizer';

export interface SavedCustomCharacter {
  id: string;
  nameAr: string;
  subtitleAr: string;
  kind: 'file' | 'url';
  fileBlob?: Blob;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  url?: string;
  colorPreset?: CharacterColorPreset;
  createdAt: number;
}

interface StoredIdbRecord {
  id: string;
  nameAr: string;
  subtitleAr: string;
  kind: 'file' | 'url';
  fileData?: ArrayBuffer;
  fileBlob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  url?: string;
  colorPreset?: CharacterColorPreset;
  createdAt: number;
}

const DB_NAME = 'naruto_shinobi_3d_db';
const DB_VERSION = 2;
const STORE_NAME = 'saved_characters';
const META_STORE = 'meta';
const ACTIVE_CHAR_KEY = 'naruto_active_character_id';
const COLOR_PRESETS_KEY = 'naruto_character_color_presets';
const REVERT_RUN_MIGRATION_KEY = 'naruto_run_palette_reverted_v1';
const DEIDARA_OVERRIDE_ID = 'preset_override_deidara';
const DEIDARA_TEXTURES_ID = 'preset_textures_deidara';
const OBITO_EYES_ID = 'preset_textures_obito_eyes';

export type ObitoEyeSide = 'right' | 'left';

export interface ObitoEyeEntry {
  blob?: Blob;
  fileName: string;
  fileSize: number;
}

export interface SavedObitoEyes {
  rightEye?: ObitoEyeEntry;
  leftEye?: ObitoEyeEntry;
  updatedAt: number;
}

interface StoredObitoEyeSlotData {
  data: ArrayBuffer;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface StoredObitoEyesRecord {
  id: string;
  rightEye?: StoredObitoEyeSlotData;
  leftEye?: StoredObitoEyeSlotData;
  updatedAt: number;
}

export type DeidaraTextureSlot = 'body' | 'mant' | 'eye' | 'tongue';

export interface DeidaraTextureSlotEntry {
  blob?: Blob;
  url?: string;
  fileName: string;
  fileSize: number;
}

export interface SavedDeidaraTextures {
  slots: Partial<Record<DeidaraTextureSlot, DeidaraTextureSlotEntry>>;
  flipY: boolean;
  slotFlipY?: Partial<Record<DeidaraTextureSlot, boolean>>;
  meshSlotOverrides?: Record<string, DeidaraTextureSlot>;
  updatedAt: number;
}

interface StoredDeidaraTextureSlotData {
  data: ArrayBuffer;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface StoredDeidaraTexturesRecord {
  id: string;
  slots: Partial<Record<DeidaraTextureSlot, StoredDeidaraTextureSlotData>>;
  flipY: boolean;
  slotFlipY?: Partial<Record<DeidaraTextureSlot, boolean>>;
  meshSlotOverrides?: Record<string, DeidaraTextureSlot>;
  updatedAt: number;
}

export interface SavedDeidaraOverride {
  fileBlob: Blob;
  fileName: string;
  fileSize: number;
  updatedAt: number;
}

function getStoredColorPresetMap(): Record<string, CharacterColorPreset> {
  try {
    const raw = window.localStorage.getItem(COLOR_PRESETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CharacterColorPreset>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredColorPreset(id: string, preset: CharacterColorPreset): void {
  try {
    const map = getStoredColorPresetMap();
    map[id] = preset;
    window.localStorage.setItem(COLOR_PRESETS_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage errors
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_OPEN_FAILED'));
  });
}

function getExtensionLabel(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (
    ext === 'fbx' ||
    ext === 'glb' ||
    ext === 'gltf' ||
    ext === 'vrm' ||
    ext === 'obj' ||
    ext === 'dae' ||
    ext === 'stl' ||
    ext === 'ply' ||
    ext === 'zip'
  ) {
    return `.${ext}`;
  }
  return '3D';
}

function deriveNameFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'شخصية مخصصة';
}

function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastSeg = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    const clean = decodeURIComponent(lastSeg)
      .replace(/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i, '')
      .trim();
    return clean || 'شخصية من رابط';
  } catch {
    return 'شخصية من رابط';
  }
}

function recordToSaved(record: StoredIdbRecord): SavedCustomCharacter {
  let blob: Blob | undefined;
  if (record.fileData instanceof ArrayBuffer) {
    blob = new Blob([record.fileData], {
      type: record.fileType || 'application/octet-stream',
    });
  } else if (record.fileBlob instanceof Blob) {
    blob = record.fileBlob;
  }

  const presetMap = getStoredColorPresetMap();
  const resolvedPreset: CharacterColorPreset | undefined =
    record.colorPreset ?? presetMap[record.id];

  return {
    id: record.id,
    nameAr: record.nameAr,
    subtitleAr: record.subtitleAr,
    kind: record.kind,
    fileBlob: blob,
    fileUrl: record.fileUrl,
    fileName: record.fileName,
    fileType: record.fileType,
    fileSize: record.fileSize ?? blob?.size,
    url: record.url,
    colorPreset: resolvedPreset,
    createdAt: record.createdAt,
  };
}

async function listIdbCharacters(): Promise<SavedCustomCharacter[]> {
  try {
    const db = await openDb();
    return await new Promise<SavedCustomCharacter[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = ((req.result as StoredIdbRecord[]) || []).filter(
          (r) =>
            r.id !== DEIDARA_OVERRIDE_ID &&
            r.id !== DEIDARA_TEXTURES_ID &&
            r.id !== OBITO_EYES_ID
        );
        const items = records.map(recordToSaved);
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function putIdbRecord(record: StoredIdbRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB errors if blocked; server/memory still preserves current session
  }
}

async function getIdbActiveSelection(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(ACTIVE_CHAR_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setIdbActiveSelection(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(id, ACTIVE_CHAR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB meta write failures
  }
}

interface ServerCharactersResponse {
  activeId: string | null;
  items: Array<{
    id: string;
    nameAr: string;
    subtitleAr: string;
    kind: 'file' | 'url';
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    fileUrl?: string;
    url?: string;
    createdAt: number;
  }>;
}

async function runOneTimePaletteRevertMigration(): Promise<void> {
  try {
    if (window.localStorage.getItem(REVERT_RUN_MIGRATION_KEY) === '1') {
      return;
    }

    const map = getStoredColorPresetMap();
    let mapChanged = false;
    for (const [id, preset] of Object.entries(map)) {
      if (preset === 'war_obito') {
        map[id] = 'original';
        mapChanged = true;
      }
    }
    if (mapChanged) {
      window.localStorage.setItem(COLOR_PRESETS_KEY, JSON.stringify(map));
    }

    try {
      const db = await openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const recs = (req.result as StoredIdbRecord[]) || [];
          for (const rec of recs) {
            if (rec.colorPreset === 'war_obito') {
              rec.colorPreset = 'original';
              store.put(rec);
            }
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore IDB migration issues
    }

    window.localStorage.setItem(REVERT_RUN_MIGRATION_KEY, '1');
  } catch {
    // Ignore localStorage errors
  }
}

export async function loadSavedCharactersAndSelection(): Promise<{
  items: SavedCustomCharacter[];
  activeId: string | null;
}> {
  await runOneTimePaletteRevertMigration();

  const [idbItems, idbActive] = await Promise.all([
    listIdbCharacters(),
    getIdbActiveSelection(),
  ]);
  const localActive = getActiveCharacterSelection();

  let serverData: ServerCharactersResponse | null = null;
  try {
    const res = await fetch('/api/characters', { cache: 'no-store' });
    if (res.ok) {
      serverData = (await res.json()) as ServerCharactersResponse;
    }
  } catch {
    // Offline or standalone static mode
  }

  const mergedMap = new Map<string, SavedCustomCharacter>();
  for (const item of idbItems) {
    mergedMap.set(item.id, item);
  }

  const presetMap = getStoredColorPresetMap();
  if (serverData?.items) {
    for (const sItem of serverData.items) {
      const existing = mergedMap.get(sItem.id);
      if (existing) {
        if (!existing.fileUrl && sItem.fileUrl) {
          existing.fileUrl = sItem.fileUrl;
        }
      } else {
        const savedPreset = presetMap[sItem.id];
        mergedMap.set(sItem.id, {
          id: sItem.id,
          nameAr: sItem.nameAr,
          subtitleAr: sItem.subtitleAr,
          kind: sItem.kind,
          fileUrl: sItem.fileUrl,
          fileName: sItem.fileName,
          fileType: sItem.mimeType,
          fileSize: sItem.fileSize,
          url: sItem.url,
          colorPreset: savedPreset,
          createdAt: sItem.createdAt,
        });
      }
    }
  }

  const items = Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  const resolvedActive = localActive || idbActive || serverData?.activeId || null;
  return { items, activeId: resolvedActive };
}

export async function listSavedCharacters(): Promise<SavedCustomCharacter[]> {
  const { items } = await loadSavedCharactersAndSelection();
  return items;
}

export async function saveCharacterFile(file: File): Promise<SavedCustomCharacter> {
  // Always read raw bytes into memory immediately so temporary OS file handles never expire after reload
  const fileData = await file.arrayBuffer();
  const fileType = file.type || 'application/octet-stream';
  const existing = await listIdbCharacters();
  const duplicate = existing.find(
    (item) =>
      item.kind === 'file' &&
      item.fileName === file.name &&
      (item.fileSize === fileData.byteLength || item.fileBlob?.size === fileData.byteLength)
  );

  const id =
    duplicate?.id ||
    `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = getExtensionLabel(file.name);
  const nameAr = duplicate?.nameAr || deriveNameFromFileName(file.name);
  const subtitleAr = duplicate?.subtitleAr || `ملف محفوظ (${ext})`;
  const createdAt = duplicate?.createdAt || Date.now();

  let serverFileUrl: string | undefined = duplicate?.fileUrl;
  try {
    const res = await fetch('/api/characters/file', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-character-id': id,
        'x-file-name': encodeURIComponent(file.name),
        'x-file-type': fileType,
      },
      body: fileData,
    });
    if (res.ok) {
      const json = (await res.json()) as { entry?: { fileUrl?: string } };
      if (json.entry?.fileUrl) {
        serverFileUrl = json.entry.fileUrl;
      }
    }
  } catch {
    // Offline fallback relies on IndexedDB ArrayBuffer
  }

  const colorPreset: CharacterColorPreset | undefined = duplicate?.colorPreset;
  if (colorPreset) {
    saveStoredColorPreset(id, colorPreset);
  }

  const record: StoredIdbRecord = {
    id,
    nameAr,
    subtitleAr,
    kind: 'file',
    fileData,
    fileName: file.name,
    fileType,
    fileSize: fileData.byteLength,
    fileUrl: serverFileUrl,
    colorPreset,
    createdAt,
  };

  await putIdbRecord(record);
  await setActiveCharacterSelection(id);

  return recordToSaved(record);
}

export async function saveCharacterUrl(url: string): Promise<SavedCustomCharacter> {
  const existing = await listIdbCharacters();
  const duplicate = existing.find((item) => item.kind === 'url' && item.url === url);

  const id =
    duplicate?.id ||
    `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = getExtensionLabel(url);
  const nameAr = duplicate?.nameAr || deriveNameFromUrl(url);
  const subtitleAr = duplicate?.subtitleAr || `رابط محفوظ (${ext})`;
  const createdAt = duplicate?.createdAt || Date.now();

  try {
    await fetch('/api/characters/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, url }),
    });
  } catch {
    // Offline fallback relies on IndexedDB
  }

  const colorPreset: CharacterColorPreset | undefined = duplicate?.colorPreset;
  if (colorPreset) {
    saveStoredColorPreset(id, colorPreset);
  }

  const record: StoredIdbRecord = {
    id,
    nameAr,
    subtitleAr,
    kind: 'url',
    url,
    colorPreset,
    createdAt,
  };

  await putIdbRecord(record);
  await setActiveCharacterSelection(id);

  return recordToSaved(record);
}

export async function setSavedCharacterColorPreset(
  id: string,
  colorPreset: CharacterColorPreset
): Promise<void> {
  saveStoredColorPreset(id, colorPreset);
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result as StoredIdbRecord | undefined;
        if (rec) {
          rec.colorPreset = colorPreset;
          store.put(rec);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB update errors; localStorage still retains colorPreset
  }
}

export async function deleteSavedCharacter(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB delete errors
  }

  try {
    await fetch(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Ignore offline errors
  }
}

export function getActiveCharacterSelection(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CHAR_KEY);
  } catch {
    return null;
  }
}

export async function setActiveCharacterSelection(id: string): Promise<void> {
  try {
    window.localStorage.setItem(ACTIVE_CHAR_KEY, id);
  } catch {
    // Ignore localStorage errors
  }
  await setIdbActiveSelection(id);
  try {
    void fetch('/api/characters/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeId: id }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore offline errors
  }
}

export async function saveDeidaraOverrideFile(file: File): Promise<SavedDeidaraOverride> {
  if (!/\.(glb|gltf|vrm|fbx|obj|dae|stl|ply|zip)$/i.test(file.name)) {
    throw new Error('INVALID_MODEL_FORMAT');
  }
  const fileData = await file.arrayBuffer();
  if (fileData.byteLength < 12) {
    throw new Error('EMPTY_GLB_FILE');
  }

  const fileType = file.type || 'model/gltf-binary';
  const now = Date.now();
  const record: StoredIdbRecord = {
    id: DEIDARA_OVERRIDE_ID,
    nameAr: 'ديدارا',
    subtitleAr: `مجسم مخصص (${file.name})`,
    kind: 'file',
    fileData,
    fileName: file.name,
    fileType,
    fileSize: fileData.byteLength,
    createdAt: now,
  };

  await putIdbRecord(record);

  return {
    fileBlob: new Blob([fileData], { type: fileType }),
    fileName: file.name,
    fileSize: fileData.byteLength,
    updatedAt: now,
  };
}

export async function loadDeidaraOverride(): Promise<SavedDeidaraOverride | null> {
  try {
    const db = await openDb();
    return await new Promise<SavedDeidaraOverride | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DEIDARA_OVERRIDE_ID);
      req.onsuccess = () => {
        const rec = req.result as StoredIdbRecord | undefined;
        if (!rec) {
          resolve(null);
          return;
        }
        let blob: Blob | undefined;
        if (rec.fileData instanceof ArrayBuffer && rec.fileData.byteLength >= 12) {
          blob = new Blob([rec.fileData], { type: rec.fileType || 'model/gltf-binary' });
        } else if (rec.fileBlob instanceof Blob && rec.fileBlob.size >= 12) {
          blob = rec.fileBlob;
        }
        if (!blob) {
          resolve(null);
          return;
        }
        resolve({
          fileBlob: blob,
          fileName: rec.fileName || 'deidara.glb',
          fileSize: rec.fileSize ?? blob.size,
          updatedAt: rec.createdAt || Date.now(),
        });
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearDeidaraOverride(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DEIDARA_OVERRIDE_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB delete failures
  }
}

export function classifyDeidaraTextureFilename(fileName: string): DeidaraTextureSlot | null {
  const lower = fileName.toLowerCase();
  if (/2ddreye|(?:^|[_\s.\-])eye(?:s)?(?:$|[_\s.\-\d])|iris|pupil|eyeball/.test(lower)) {
    return 'eye';
  }
  if (/2ddrtongue|tongue|mouth|palate/.test(lower)) {
    return 'tongue';
  }
  if (/2ddrmant|mant|cloak|robe|cape|akatsuki|coat/.test(lower)) {
    return 'mant';
  }
  if (/2ddrbody|body|face|hair|skin|head/.test(lower)) {
    return 'body';
  }
  return null;
}

function storedTexturesRecordToSaved(rec: StoredDeidaraTexturesRecord): SavedDeidaraTextures {
  const slots: Partial<Record<DeidaraTextureSlot, DeidaraTextureSlotEntry>> = {};
  for (const key of ['body', 'mant', 'eye', 'tongue'] as DeidaraTextureSlot[]) {
    const item = rec.slots?.[key];
    if (item && item.data instanceof ArrayBuffer && item.data.byteLength >= 32) {
      slots[key] = {
        blob: new Blob([item.data], { type: item.fileType || 'image/png' }),
        fileName: item.fileName || `${key}.png`,
        fileSize: item.fileSize || item.data.byteLength,
      };
    }
  }
  return {
    slots,
    flipY: Boolean(rec.flipY),
    slotFlipY: rec.slotFlipY ? { ...rec.slotFlipY } : undefined,
    meshSlotOverrides: rec.meshSlotOverrides ? { ...rec.meshSlotOverrides } : undefined,
    updatedAt: rec.updatedAt || Date.now(),
  };
}

async function readStoredDeidaraTexturesRecord(): Promise<StoredDeidaraTexturesRecord | null> {
  try {
    const db = await openDb();
    return await new Promise<StoredDeidaraTexturesRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DEIDARA_TEXTURES_ID);
      req.onsuccess = () => {
        const rec = req.result as StoredDeidaraTexturesRecord | undefined;
        resolve(rec && rec.id === DEIDARA_TEXTURES_ID ? rec : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeStoredDeidaraTexturesRecord(
  record: StoredDeidaraTexturesRecord
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB failures if blocked
  }
}

export async function loadDeidaraTextures(): Promise<SavedDeidaraTextures | null> {
  const rec = await readStoredDeidaraTexturesRecord();
  if (!rec) return null;
  const saved = storedTexturesRecordToSaved(rec);
  const hasAnySlots = Object.keys(saved.slots).length > 0;
  const hasMeshOverrides = Boolean(
    saved.meshSlotOverrides && Object.keys(saved.meshSlotOverrides).length > 0
  );
  const hasSlotFlip = Boolean(saved.slotFlipY && Object.keys(saved.slotFlipY).length > 0);
  return hasAnySlots || hasMeshOverrides || hasSlotFlip ? saved : null;
}

export async function saveDeidaraTextures(
  updates: Partial<Record<DeidaraTextureSlot, File>>,
  flipY?: boolean
): Promise<SavedDeidaraTextures> {
  const existing = await readStoredDeidaraTexturesRecord();
  const nextSlots: Partial<Record<DeidaraTextureSlot, StoredDeidaraTextureSlotData>> = {
    ...(existing?.slots ?? {}),
  };

  for (const key of ['body', 'mant', 'eye', 'tongue'] as DeidaraTextureSlot[]) {
    const file = updates[key];
    if (!file) continue;
    const isImageType = file.type.startsWith('image/');
    const isImageExt = /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
    if (!isImageType && !isImageExt) {
      throw new Error('INVALID_IMAGE_FORMAT');
    }
    const data = await file.arrayBuffer();
    if (data.byteLength < 32) {
      throw new Error('EMPTY_TEXTURE_FILE');
    }
    nextSlots[key] = {
      data,
      fileName: file.name,
      fileType: file.type || 'image/png',
      fileSize: data.byteLength,
    };
  }

  const record: StoredDeidaraTexturesRecord = {
    id: DEIDARA_TEXTURES_ID,
    slots: nextSlots,
    flipY: flipY !== undefined ? flipY : Boolean(existing?.flipY ?? false),
    slotFlipY: existing?.slotFlipY,
    meshSlotOverrides: existing?.meshSlotOverrides,
    updatedAt: Date.now(),
  };

  await writeStoredDeidaraTexturesRecord(record);

  return storedTexturesRecordToSaved(record);
}

export async function setDeidaraTextureFlipY(flipY: boolean): Promise<SavedDeidaraTextures | null> {
  const existing = await readStoredDeidaraTexturesRecord();
  if (!existing) return null;
  const updated: StoredDeidaraTexturesRecord = {
    ...existing,
    flipY,
    updatedAt: Date.now(),
  };
  await writeStoredDeidaraTexturesRecord(updated);
  return storedTexturesRecordToSaved(updated);
}

export async function setDeidaraMeshSlotOverride(
  meshKey: string,
  slot: DeidaraTextureSlot | null
): Promise<SavedDeidaraTextures> {
  const existing = await readStoredDeidaraTexturesRecord();
  const nextOverrides: Record<string, DeidaraTextureSlot> = {
    ...(existing?.meshSlotOverrides ?? {}),
  };
  if (slot) {
    nextOverrides[meshKey] = slot;
  } else {
    delete nextOverrides[meshKey];
  }
  const updated: StoredDeidaraTexturesRecord = {
    id: DEIDARA_TEXTURES_ID,
    slots: existing?.slots ?? {},
    flipY: Boolean(existing?.flipY ?? false),
    slotFlipY: existing?.slotFlipY,
    meshSlotOverrides: nextOverrides,
    updatedAt: Date.now(),
  };
  await writeStoredDeidaraTexturesRecord(updated);
  return storedTexturesRecordToSaved(updated);
}

export async function toggleDeidaraSlotFlipY(
  slot: DeidaraTextureSlot
): Promise<SavedDeidaraTextures> {
  const existing = await readStoredDeidaraTexturesRecord();
  const baseFlipY = Boolean(existing?.flipY ?? false);
  const currentEffective = existing?.slotFlipY?.[slot] ?? baseFlipY;
  const nextSlotFlipY: Partial<Record<DeidaraTextureSlot, boolean>> = {
    ...(existing?.slotFlipY ?? {}),
    [slot]: !currentEffective,
  };
  const updated: StoredDeidaraTexturesRecord = {
    id: DEIDARA_TEXTURES_ID,
    slots: existing?.slots ?? {},
    flipY: baseFlipY,
    slotFlipY: nextSlotFlipY,
    meshSlotOverrides: existing?.meshSlotOverrides,
    updatedAt: Date.now(),
  };
  await writeStoredDeidaraTexturesRecord(updated);
  return storedTexturesRecordToSaved(updated);
}

export async function clearDeidaraTextures(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DEIDARA_TEXTURES_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB delete failures
  }
}

export interface BundledDeidaraConfig {
  hasCustomModel?: boolean;
  modelUrl?: string;
  modelFileName?: string;
  slots?: Partial<Record<DeidaraTextureSlot, { url: string; fileName: string }>>;
  flipY?: boolean;
  slotFlipY?: Partial<Record<DeidaraTextureSlot, boolean>>;
  meshSlotOverrides?: Record<string, DeidaraTextureSlot>;
  updatedAt?: number;
}

export async function loadBundledDeidaraConfig(): Promise<BundledDeidaraConfig | null> {
  try {
    const res = await fetch('/assets/characters/deidara/config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as BundledDeidaraConfig;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function publishDeidaraDefaultsToServer(
  override: SavedDeidaraOverride | null,
  textures: SavedDeidaraTextures | null,
  rebuildApk = true
): Promise<{
  ok: boolean;
  apkBuilt?: boolean;
  apkSizeBytes?: number;
  config?: BundledDeidaraConfig;
}> {
  try {
    const glb =
      override?.fileBlob && override.fileBlob.size >= 12
        ? {
            dataBase64: await blobToBase64(override.fileBlob),
            fileName: override.fileName || 'deidara.glb',
          }
        : undefined;

    const slots: Partial<
      Record<DeidaraTextureSlot, { dataBase64: string; fileName: string }>
    > = {};
    if (textures?.slots) {
      for (const slot of ['body', 'mant', 'eye', 'tongue'] as DeidaraTextureSlot[]) {
        const entry = textures.slots[slot];
        if (entry?.blob && entry.blob.size >= 32) {
          slots[slot] = {
            dataBase64: await blobToBase64(entry.blob),
            fileName: entry.fileName || `${slot}.png`,
          };
        }
      }
    }

    const updatedAt = Math.max(override?.updatedAt || 0, textures?.updatedAt || 0, Date.now());
    const res = await fetch('/api/deidara/publish-defaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        glb,
        slots,
        flipY: Boolean(textures?.flipY ?? false),
        slotFlipY: textures?.slotFlipY,
        meshSlotOverrides: textures?.meshSlotOverrides,
        updatedAt,
        rebuildApk,
      }),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as {
      ok: boolean;
      apkBuilt?: boolean;
      apkSizeBytes?: number;
      config?: BundledDeidaraConfig;
    };
  } catch {
    return { ok: false };
  }
}

function storedObitoEyesToSaved(rec: StoredObitoEyesRecord): SavedObitoEyes {
  const toEntry = (item?: StoredObitoEyeSlotData): ObitoEyeEntry | undefined => {
    if (!item || !(item.data instanceof ArrayBuffer) || item.data.byteLength < 32) {
      return undefined;
    }
    return {
      blob: new Blob([item.data], { type: item.fileType || 'image/png' }),
      fileName: item.fileName || 'eye.png',
      fileSize: item.fileSize || item.data.byteLength,
    };
  };
  return {
    rightEye: toEntry(rec.rightEye),
    leftEye: toEntry(rec.leftEye),
    updatedAt: rec.updatedAt || Date.now(),
  };
}

async function readStoredObitoEyesRecord(): Promise<StoredObitoEyesRecord | null> {
  try {
    const db = await openDb();
    return await new Promise<StoredObitoEyesRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(OBITO_EYES_ID);
      req.onsuccess = () => {
        const rec = req.result as StoredObitoEyesRecord | undefined;
        resolve(rec && rec.id === OBITO_EYES_ID ? rec : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeStoredObitoEyesRecord(record: StoredObitoEyesRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB failures if blocked
  }
}

export async function loadObitoEyes(): Promise<SavedObitoEyes | null> {
  const rec = await readStoredObitoEyesRecord();
  if (!rec) return null;
  const saved = storedObitoEyesToSaved(rec);
  return saved.rightEye || saved.leftEye ? saved : null;
}

export async function saveObitoEyes(
  updates: Partial<Record<ObitoEyeSide, File>>
): Promise<SavedObitoEyes> {
  const existing = await readStoredObitoEyesRecord();
  let rightEye = existing?.rightEye;
  let leftEye = existing?.leftEye;

  const parseEyeFile = async (file: File): Promise<StoredObitoEyeSlotData> => {
    const isImageType = file.type.startsWith('image/');
    const isImageExt = /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
    if (!isImageType && !isImageExt) {
      throw new Error('INVALID_IMAGE_FORMAT');
    }
    const data = await file.arrayBuffer();
    if (data.byteLength < 32) {
      throw new Error('EMPTY_TEXTURE_FILE');
    }
    return {
      data,
      fileName: file.name,
      fileType: file.type || 'image/png',
      fileSize: data.byteLength,
    };
  };

  if (updates.right) {
    rightEye = await parseEyeFile(updates.right);
  }
  if (updates.left) {
    leftEye = await parseEyeFile(updates.left);
  }

  const record: StoredObitoEyesRecord = {
    id: OBITO_EYES_ID,
    rightEye,
    leftEye,
    updatedAt: Date.now(),
  };

  await writeStoredObitoEyesRecord(record);
  return storedObitoEyesToSaved(record);
}

export async function clearObitoEyes(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(OBITO_EYES_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB delete failures
  }
}

export interface SavedCustomStage {
  id: string;
  nameAr: string;
  subtitleAr: string;
  kind: 'file' | 'url';
  fileBlob?: Blob;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  url?: string;
  createdAt: number;
}

interface StoredStageRecord {
  id: string;
  nameAr: string;
  subtitleAr: string;
  kind: 'file' | 'url';
  fileData?: ArrayBuffer;
  fileBlob?: Blob;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string;
  url?: string;
  createdAt: number;
}

const STAGES_STORE_PREFIX = 'saved_stage_';

export async function listSavedStages(): Promise<SavedCustomStage[]> {
  try {
    const db = await openDb();
    return await new Promise<SavedCustomStage[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = ((req.result as StoredIdbRecord[]) || []).filter(
          (r) => r.id && r.id.startsWith(STAGES_STORE_PREFIX)
        ) as unknown as StoredStageRecord[];
        const items: SavedCustomStage[] = records.map((rec) => {
          let blob: Blob | undefined;
          if (rec.fileData instanceof ArrayBuffer) {
            blob = new Blob([rec.fileData], {
              type: rec.fileType || 'application/octet-stream',
            });
          } else if (rec.fileBlob instanceof Blob) {
            blob = rec.fileBlob;
          }
          return {
            id: rec.id,
            nameAr: rec.nameAr,
            subtitleAr: rec.subtitleAr,
            kind: rec.kind,
            fileBlob: blob,
            fileUrl: rec.fileUrl,
            fileName: rec.fileName,
            fileType: rec.fileType,
            fileSize: rec.fileSize ?? blob?.size,
            url: rec.url,
            createdAt: rec.createdAt,
          };
        });
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveStageFile(file: File): Promise<SavedCustomStage> {
  const fileData = await file.arrayBuffer();
  const fileType = file.type || 'application/octet-stream';
  const id = `${STAGES_STORE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = getExtensionLabel(file.name);
  const nameAr = deriveNameFromFileName(file.name);
  const subtitleAr = `ساحة مخصصة (${ext})`;
  const createdAt = Date.now();

  const record: StoredStageRecord = {
    id,
    nameAr,
    subtitleAr,
    kind: 'file',
    fileData,
    fileName: file.name,
    fileType,
    fileSize: fileData.byteLength,
    createdAt,
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB errors
  }

  const blob = new Blob([fileData], { type: fileType });
  return {
    id,
    nameAr,
    subtitleAr,
    kind: 'file',
    fileBlob: blob,
    fileName: file.name,
    fileType,
    fileSize: fileData.byteLength,
    createdAt,
  };
}

export async function saveStageUrl(url: string): Promise<SavedCustomStage> {
  const id = `${STAGES_STORE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = getExtensionLabel(url);
  const nameAr = deriveNameFromUrl(url);
  const subtitleAr = `ساحة من رابط (${ext})`;
  const createdAt = Date.now();

  const record: StoredStageRecord = {
    id,
    nameAr,
    subtitleAr,
    kind: 'url',
    url,
    createdAt,
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB errors
  }

  return {
    id,
    nameAr,
    subtitleAr,
    kind: 'url',
    url,
    createdAt,
  };
}

export async function deleteSavedStage(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB delete errors
  }
}




