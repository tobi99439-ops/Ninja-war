import * as THREE from 'three';
import { getCharacterTextureMaxAnisotropy } from './characterVisualEnhancer';
import { createAkatsukiCloakTexture } from '../textures';
import { DeidaraTextureSlot } from '../../utils/characterStorage';

export const DEIDARA_TEXTURE_URLS = {
  body: 'https://files.catbox.moe/ufqi8w.png', // 2ddrbody_0.png (body, face, hair, headband, scope)
  mant: 'https://files.catbox.moe/hq3ouf.png', // 2ddrmant_0.png (Akatsuki cloak / mantle)
  eye: 'https://files.catbox.moe/8o94xh.png', // 2ddreye_0.png (eyes)
  tongue: 'https://files.catbox.moe/ufjosz.png', // 2ddrtongue_0.png (tongue & palm mouths)
} as const;

type DeidaraTextureKind = keyof typeof DEIDARA_TEXTURE_URLS;

export interface DeidaraTextureOverrideInput {
  slots: Partial<Record<DeidaraTextureSlot, { blob?: Blob; url?: string; fileName?: string }>>;
  flipY: boolean;
  slotFlipY?: Partial<Record<DeidaraTextureSlot, boolean>>;
  meshSlotOverrides?: Record<string, DeidaraTextureSlot>;
}

export interface DeidaraMeshDiagnostic {
  meshKey: string;
  mesh: string;
  material: string;
  slot: DeidaraTextureKind;
  overridden: boolean;
  source: string;
  flipY: boolean;
  yMinPct: number;
  yMaxPct: number;
}

interface DeidaraTextureSet {
  body: THREE.Texture | null;
  mant: THREE.Texture | null;
  eye: THREE.Texture | null;
  tongue: THREE.Texture | null;
}

let activeTextureOverrides: DeidaraTextureOverrideInput | null = null;
let lastMeshDiagnostics: DeidaraMeshDiagnostic[] = [];
const diagnosticListeners = new Set<(items: DeidaraMeshDiagnostic[]) => void>();

export function setActiveDeidaraTextureOverrides(
  overrides: DeidaraTextureOverrideInput | null
): void {
  activeTextureOverrides = overrides;
}

export function getActiveDeidaraTextureOverrides(): DeidaraTextureOverrideInput | null {
  return activeTextureOverrides;
}

export function getLastDeidaraMeshDiagnostics(): DeidaraMeshDiagnostic[] {
  return lastMeshDiagnostics;
}

export function subscribeDeidaraMeshDiagnostics(
  listener: (items: DeidaraMeshDiagnostic[]) => void
): () => void {
  diagnosticListeners.add(listener);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

function loadConfiguredTextureFromUrl(
  loader: THREE.TextureLoader,
  url: string,
  flipY: boolean
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.flipY = flipY;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = getCharacterTextureMaxAnisotropy();
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function loadConfiguredTextureFromBlob(
  loader: THREE.TextureLoader,
  blob: Blob,
  flipY: boolean
): Promise<THREE.Texture | null> {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    loader.load(
      objectUrl,
      (texture) => {
        URL.revokeObjectURL(objectUrl);
        texture.flipY = flipY;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = getCharacterTextureMaxAnisotropy();
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      }
    );
  });
}

let cachedRemoteTexturesPromise: Promise<DeidaraTextureSet> | null = null;
let cachedFallbackCloakTex: THREE.Texture | null = null;

function getFallbackCloakTexture(): THREE.Texture {
  if (!cachedFallbackCloakTex) {
    cachedFallbackCloakTex = createAkatsukiCloakTexture(4);
    cachedFallbackCloakTex.flipY = false;
    cachedFallbackCloakTex.colorSpace = THREE.SRGBColorSpace;
    cachedFallbackCloakTex.needsUpdate = true;
  }
  return cachedFallbackCloakTex;
}

function getOrLoadRemoteDeidaraTextureSet(): Promise<DeidaraTextureSet> {
  if (!cachedRemoteTexturesPromise) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    cachedRemoteTexturesPromise = Promise.all([
      loadConfiguredTextureFromUrl(loader, DEIDARA_TEXTURE_URLS.body, false),
      loadConfiguredTextureFromUrl(loader, DEIDARA_TEXTURE_URLS.mant, false),
      loadConfiguredTextureFromUrl(loader, DEIDARA_TEXTURE_URLS.eye, false),
      loadConfiguredTextureFromUrl(loader, DEIDARA_TEXTURE_URLS.tongue, false),
    ]).then(([body, mant, eye, tongue]) => ({
      body,
      mant,
      eye,
      tongue,
    }));
  }
  return cachedRemoteTexturesPromise;
}

async function resolveDeidaraTextures(): Promise<{
  remoteSet: DeidaraTextureSet;
  localSet: DeidaraTextureSet;
  flipY: boolean;
}> {
  const flipY = Boolean(activeTextureOverrides?.flipY ?? false);
  const localSlots = activeTextureOverrides?.slots;
  const loader = new THREE.TextureLoader();

  const loadSlotEntry = (slot: DeidaraTextureSlot): Promise<THREE.Texture | null> => {
    const entry = localSlots?.[slot];
    if (entry?.blob) {
      return loadConfiguredTextureFromBlob(loader, entry.blob, flipY);
    }
    if (entry?.url) {
      return loadConfiguredTextureFromUrl(loader, entry.url, flipY);
    }
    return Promise.resolve(null);
  };

  const [remoteSet, localBody, localMant, localEye, localTongue] = await Promise.all([
    getOrLoadRemoteDeidaraTextureSet(),
    loadSlotEntry('body'),
    loadSlotEntry('mant'),
    loadSlotEntry('eye'),
    loadSlotEntry('tongue'),
  ]);

  return {
    remoteSet,
    localSet: {
      body: localBody,
      mant: localMant,
      eye: localEye,
      tongue: localTongue,
    },
    flipY,
  };
}

function classifyByName(candidateName: string): DeidaraTextureKind | null {
  if (
    /2ddreye|(?:^|[_\s.\-])eye(?:s|ball|s_?mesh)?(?:$|[_\s.\-\d])|iris|pupil|eyeball|sclera/i.test(
      candidateName
    )
  ) {
    return 'eye';
  }
  if (/2ddrtongue|tongue|mouth_?inner|palate|jaw_?inner|hand_?mouth/i.test(candidateName)) {
    return 'tongue';
  }
  if (
    /2ddrmant|mant(?:le|eau)?|cloak|robe|coat|cape|akatsuki|collar|skirt|hakama|sleeve|cloth(?:es|ing)?|outfit|jacket|tunic|garment|dress|vest|uniform|suit|wear|cloud/i.test(
      candidateName
    )
  ) {
    return 'mant';
  }
  if (
    /2ddrbody|body|head|face|hair|skin|hand|arm|leg|pant|shoe|sandal|boot|headband|pouch|scope|bag|strap|hitai|ring/i.test(
      candidateName
    )
  ) {
    return 'body';
  }
  return null;
}

function computeMaterialGroupWorldBox(
  mesh: THREE.Mesh,
  matIdx: number,
  multiMaterial: boolean
): THREE.Box3 {
  const geo = mesh.geometry;
  if (!multiMaterial || !geo || !geo.groups || geo.groups.length === 0) {
    return new THREE.Box3().setFromObject(mesh);
  }
  const posAttr = geo.attributes?.position as THREE.BufferAttribute | undefined;
  if (!posAttr) {
    return new THREE.Box3().setFromObject(mesh);
  }

  const indexAttr = geo.getIndex();
  const groupBox = new THREE.Box3();
  const v = new THREE.Vector3();
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh
    ? (mesh as THREE.SkinnedMesh)
    : null;
  let hasPoint = false;

  for (const grp of geo.groups) {
    if (grp.materialIndex !== matIdx) continue;
    const end = grp.start + grp.count;
    const step = Math.max(1, Math.floor(grp.count / 900));
    for (let i = grp.start; i < end; i += step) {
      const vertIdx = indexAttr ? indexAttr.getX(i) : i;
      if (vertIdx < 0 || vertIdx >= posAttr.count) continue;
      if (skinned && typeof skinned.getVertexPosition === 'function') {
        skinned.getVertexPosition(vertIdx, v);
        v.applyMatrix4(mesh.matrixWorld);
      } else {
        v.fromBufferAttribute(posAttr, vertIdx).applyMatrix4(mesh.matrixWorld);
      }
      groupBox.expandByPoint(v);
      hasPoint = true;
    }
  }

  return hasPoint ? groupBox : new THREE.Box3().setFromObject(mesh);
}

function classifyByPartBounds(
  partBox: THREE.Box3,
  modelBox: THREE.Box3
): { kind: DeidaraTextureKind; yMinNorm: number; yMaxNorm: number } {
  const modelSize = new THREE.Vector3();
  modelBox.getSize(modelSize);
  const totalH = Math.max(0.001, modelSize.y);

  if (partBox.isEmpty()) {
    return { kind: 'body', yMinNorm: 0, yMaxNorm: 1 };
  }

  const partSize = new THREE.Vector3();
  const partCenter = new THREE.Vector3();
  partBox.getSize(partSize);
  partBox.getCenter(partCenter);

  const yMinNorm = (partBox.min.y - modelBox.min.y) / totalH;
  const yMaxNorm = (partBox.max.y - modelBox.min.y) / totalH;
  const yCenterNorm = (partCenter.y - modelBox.min.y) / totalH;
  const hNorm = partSize.y / totalH;
  const wNorm = partSize.x / totalH;

  // Small eye pair high on face
  if (yCenterNorm >= 0.74 && yCenterNorm <= 0.95 && hNorm < 0.09 && wNorm < 0.18) {
    return { kind: 'eye', yMinNorm, yMaxNorm };
  }
  // Tiny tongue / palm mouth piece
  if (hNorm < 0.08 && wNorm < 0.15) {
    return { kind: 'tongue', yMinNorm, yMaxNorm };
  }
  // Akatsuki cloak / collar / coat skirt sits strictly between knees/ankles (>= 14%) and below hair crest (<= 91.5%)
  if (
    yMinNorm >= 0.14 &&
    yMaxNorm <= 0.915 &&
    (hNorm >= 0.12 || wNorm >= 0.16)
  ) {
    return { kind: 'mant', yMinNorm, yMaxNorm };
  }
  // Full-torso cloak wrapper when slightly taller/lower
  if (yMinNorm <= 0.54 && yMaxNorm >= 0.58 && yMaxNorm <= 0.92 && wNorm >= 0.18) {
    return { kind: 'mant', yMinNorm, yMaxNorm };
  }

  return { kind: 'body', yMinNorm, yMaxNorm };
}

/**
 * Loads the 4 Deidara PNG textures (`2ddrbody_0`, `2ddrmant_0`, `2ddreye_0`, `2ddrtongue_0`)
 * from local device uploads (preferred) or remote fallback URLs with `SRGBColorSpace` and
 * configurable `flipY` (default `false` for GLB), mapping each mesh/material slot cleanly.
 */
export async function applyDeidaraTextures(model: THREE.Object3D): Promise<void> {
  const { remoteSet, localSet, flipY } = await resolveDeidaraTextures();
  const hasAnyLocalOverride = Boolean(
    localSet.body || localSet.mant || localSet.eye || localSet.tongue
  );

  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      (obj as THREE.SkinnedMesh).skeleton?.update();
    }
  });
  const modelBox = new THREE.Box3().setFromObject(model);

  const clonedPerSource = new Map<string, THREE.Texture>();
  const oldMaterialsToDispose = new Set<THREE.Material>();
  const meshDiagnostics: DeidaraMeshDiagnostic[] = [];

  const getClonedTexture = (
    srcTex: THREE.Texture | null,
    targetFlipY: boolean
  ): THREE.Texture | null => {
    if (!srcTex) return null;
    const cacheKey = `${srcTex.uuid}:${targetFlipY ? '1' : '0'}`;
    let c = clonedPerSource.get(cacheKey);
    if (!c) {
      c = srcTex.clone();
      c.flipY = targetFlipY;
      c.colorSpace = THREE.SRGBColorSpace;
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.anisotropy = getCharacterTextureMaxAnisotropy();
      c.needsUpdate = true;
      clonedPerSource.set(cacheKey, c);
    }
    return c;
  };

  let meshCounter = 0;

  model.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const currentMeshIdx = meshCounter++;

    const originalMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const multiMat = Array.isArray(mesh.material) && originalMats.length > 1;
    const hasEmbeddedTextureOrColor = originalMats.some((m) => {
      const s = m as THREE.MeshStandardMaterial | undefined;
      if (!s) return false;
      if (s.map) return true;
      if (s.color && (s.color.r < 0.94 || s.color.g < 0.94 || s.color.b < 0.94)) return true;
      return false;
    });

    // When custom PNGs are supplied or mesh has blank vertex colors, strip zero/grey vertex tint so PNG colors stay pure
    if (mesh.geometry?.attributes?.color && (hasAnyLocalOverride || !hasEmbeddedTextureOrColor)) {
      mesh.geometry.deleteAttribute('color');
    }

    const updatedMats = originalMats.map((origMat, matIdx) => {
      const stdOrig = origMat as THREE.MeshStandardMaterial | undefined;
      const candidateName = [
        mesh.name || '',
        mesh.parent?.name || '',
        origMat?.name || '',
        stdOrig?.map?.name || '',
      ]
        .join(' ')
        .trim();

      const partBox = computeMaterialGroupWorldBox(mesh, matIdx, multiMat);
      const boundsResult = classifyByPartBounds(partBox, modelBox);
      const autoKind = classifyByName(candidateName) ?? boundsResult.kind;

      const meshKey = `m${currentMeshIdx}_mat${matIdx}`;
      const manualSlot = activeTextureOverrides?.meshSlotOverrides?.[meshKey];
      const kind: DeidaraTextureKind = manualSlot ?? autoKind;

      const effectiveFlipY = activeTextureOverrides?.slotFlipY?.[kind] ?? flipY;
      const uploadedTex = localSet[kind] ?? null;
      const remoteTex = remoteSet[kind] ?? remoteSet.body;

      const mat = origMat
        ? origMat.clone()
        : new THREE.MeshStandardMaterial({ color: 0xffffff });
      if (origMat && origMat !== mat) {
        oldMaterialsToDispose.add(origMat);
      }

      const std = mat as THREE.MeshStandardMaterial;
      const hadEmbeddedMap = Boolean(std.map);
      const hasDistinctSolidColor = Boolean(
        std.color && (std.color.r < 0.94 || std.color.g < 0.94 || std.color.b < 0.94)
      );
      const hasVertexColorAttr = Boolean(mesh.geometry?.attributes?.color);

      let sourceTag = 'embedded';

      if (uploadedTex) {
        // Explicit user-uploaded PNG for this slot always takes highest priority
        mat.vertexColors = false;
        std.map = getClonedTexture(uploadedTex, effectiveFlipY);
        if (std.color) std.color.setHex(0xffffff);
        mat.side = THREE.DoubleSide;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.alphaTest = kind === 'eye' || kind === 'tongue' ? 0.04 : 0;
        if ('aoMap' in std && std.aoMap) {
          std.aoMap = null;
        }
        sourceTag = `device:${activeTextureOverrides?.slots[kind]?.fileName || kind}`;
      } else if (hadEmbeddedMap) {
        std.map!.colorSpace = THREE.SRGBColorSpace;
        std.map!.needsUpdate = true;
        if (std.color) std.color.setHex(0xffffff);
        mat.vertexColors = hasVertexColorAttr;
        sourceTag = 'embedded_map';
      } else if (remoteTex) {
        mat.vertexColors = false;
        std.map = getClonedTexture(remoteTex, false);
        if (std.color) std.color.setHex(0xffffff);
        sourceTag = 'remote_png';
      } else if (hasDistinctSolidColor || hasVertexColorAttr) {
        mat.vertexColors = hasVertexColorAttr;
        sourceTag = 'native_color';
      } else if (kind === 'mant') {
        mat.vertexColors = false;
        std.map = getClonedTexture(getFallbackCloakTexture(), false);
        if (std.color) std.color.setHex(0xffffff);
        sourceTag = 'procedural_akatsuki_cloak';
      } else if (std.color) {
        mat.vertexColors = false;
        if (kind === 'tongue') {
          std.color.setHex(0xc95b6b);
        } else if (kind === 'eye') {
          std.color.setHex(0x2563eb);
        } else if (/hair|bang|pony/i.test(candidateName)) {
          std.color.setHex(0xfacc15);
        } else if (/face|head|skin|hand/i.test(candidateName)) {
          std.color.setHex(0xe8c1a0);
        } else {
          std.color.setHex(0x22252d);
        }
        sourceTag = `fallback_${kind}`;
      }

      if (!uploadedTex && !hadEmbeddedMap && !hasDistinctSolidColor) {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.alphaTest = kind === 'eye' || kind === 'tongue' ? 0.04 : 0;
        mat.side = THREE.DoubleSide;
      }

      if ('roughness' in std) {
        std.roughness = Math.max(typeof std.roughness === 'number' ? std.roughness : 0.75, 0.70);
      }
      if ('metalness' in std) {
        std.metalness = Math.min(typeof std.metalness === 'number' ? std.metalness : 0.04, 0.15);
      }
      if ('envMapIntensity' in std) {
        std.envMapIntensity = 0.42;
      }

      meshDiagnostics.push({
        meshKey,
        mesh: mesh.name || mesh.parent?.name || `Mesh_${currentMeshIdx + 1}`,
        material: origMat?.name || `Mat_${matIdx + 1}`,
        slot: kind,
        overridden: Boolean(manualSlot),
        source: sourceTag,
        flipY: effectiveFlipY,
        yMinPct: Math.round(boundsResult.yMinNorm * 100),
        yMaxPct: Math.round(boundsResult.yMaxNorm * 100),
      });

      mat.needsUpdate = true;
      return mat;
    });

    mesh.material = Array.isArray(mesh.material) ? updatedMats : updatedMats[0];
  });

  lastMeshDiagnostics = meshDiagnostics;
  diagnosticListeners.forEach((cb) => cb(meshDiagnostics));

  if (meshDiagnostics.length > 0) {
    console.info('[Deidara Mesh Map]', meshDiagnostics);
  }

  // Dispose temporary parent source textures (cloned textures are owned & disposed by the character rig)
  for (const src of Object.values(localSet)) {
    src?.dispose();
  }
  oldMaterialsToDispose.forEach((m) => m.dispose());
}
