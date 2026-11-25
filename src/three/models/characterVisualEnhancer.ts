import * as THREE from 'three';
import {
  isItachiName,
  isKakashiName,
  isMadaraName,
  isMaskManV2Name,
} from './warObitoColorizer';

export type EnhancedCharacterRole = 'itachi' | 'madara' | 'kakashi' | 'tobi_v2';

let _characterMaxAnisotropy = 8;

export function setCharacterTextureMaxAnisotropy(maxAniso: number): void {
  if (Number.isFinite(maxAniso) && maxAniso >= 1) {
    _characterMaxAnisotropy = Math.min(16, Math.max(1, Math.round(maxAniso)));
  }
}

export function getCharacterTextureMaxAnisotropy(): number {
  return _characterMaxAnisotropy;
}

function sharpenTexture(
  tex: THREE.Texture | null | undefined,
  isSrgb: boolean,
  aniso: number
): void {
  if (!tex) return;
  let changed = false;
  if (tex.anisotropy !== aniso) {
    tex.anisotropy = aniso;
    changed = true;
  }
  if (tex.minFilter !== THREE.LinearMipmapLinearFilter) {
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    changed = true;
  }
  if (tex.magFilter !== THREE.LinearFilter) {
    tex.magFilter = THREE.LinearFilter;
    changed = true;
  }
  if (isSrgb && tex.colorSpace !== THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
    changed = true;
  }
  if (changed) {
    tex.needsUpdate = true;
  }
}

export function sharpenMaterialTextures(
  material: THREE.Material,
  aniso = _characterMaxAnisotropy
): void {
  if (!material || material.userData?.__sharedAnimeOutline) return;
  const std = material as THREE.MeshStandardMaterial;
  sharpenTexture(std.map, true, aniso);
  sharpenTexture(std.emissiveMap, true, aniso);
  sharpenTexture(std.normalMap, false, aniso);
  sharpenTexture(std.roughnessMap, false, aniso);
  sharpenTexture(std.bumpMap, false, aniso);
  sharpenTexture(std.metalnessMap, false, aniso);
}

export function applyCharacterTextureAnisotropy(
  root: THREE.Object3D,
  aniso = _characterMaxAnisotropy
): void {
  const processed = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || processed.has(m)) continue;
      processed.add(m);
      sharpenMaterialTextures(m, aniso);
    }
  });
}

export function resolveEnhancedCharacterRole(
  labelAr?: string,
  fileNameHint?: string
): EnhancedCharacterRole | null {
  if (isItachiName(labelAr, fileNameHint)) return 'itachi';
  if (isMadaraName(labelAr, fileNameHint)) return 'madara';
  if (isKakashiName(labelAr, fileNameHint)) return 'kakashi';
  if (isMaskManV2Name(labelAr, fileNameHint)) return 'tobi_v2';
  return null;
}

export function enhanceCharacterMaterialVisuals(
  material: THREE.Material,
  role: EnhancedCharacterRole
): void {
  if (!material || material.userData?.__sharedAnimeOutline) return;
  sharpenMaterialTextures(material);

  const std = material as THREE.MeshStandardMaterial;
  if (
    !std ||
    (!std.isMeshStandardMaterial &&
      !(material as unknown as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)
  ) {
    return;
  }

  // Keep Tobi V2 well-lit (preserving bright Gunbai & dark-blue robe readability),
  // while reducing studio white RoomEnvironment washout on other characters for rich anime shadow depth.
  std.envMapIntensity = role === 'tobi_v2' ? 0.64 : 0.38;
  if (typeof std.roughness === 'number' && std.roughness < 0.68) {
    std.roughness = 0.72;
  }
  if (typeof std.metalness === 'number' && std.metalness > 0.18 && role !== 'madara') {
    std.metalness = 0.14;
  }
  std.needsUpdate = true;
}

export function applyCinematicCharacterVisuals(
  root: THREE.Object3D,
  labelAr?: string,
  fileNameHint?: string
): EnhancedCharacterRole | null {
  const role = resolveEnhancedCharacterRole(labelAr, fileNameHint);
  if (!role) return null;

  const processed = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || processed.has(m)) continue;
      processed.add(m);
      enhanceCharacterMaterialVisuals(m, role);
    }
  });

  return role;
}

export function applyAnimeCelShadingToMaterial(material: THREE.Material): void {
  if (!material || material.userData?.__sharedAnimeOutline) return;
  sharpenMaterialTextures(material);

  const std = material as THREE.MeshStandardMaterial;
  if (
    !std ||
    (!std.isMeshStandardMaterial &&
      !(material as unknown as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)
  ) {
    return;
  }

  if (std.envMapIntensity > 1.2) {
    std.envMapIntensity = 0.85;
    std.needsUpdate = true;
  }
}

export function addAnimeInkOutlinesToModel(_root: THREE.Object3D, _worldThickness = 0.0095): void {
  // Intentionally disabled on double-sided low-poly cloaks/robes to preserve crisp MSAA anime silhouettes
}

export function applyAnimeCelShadingToModel(root: THREE.Object3D): void {
  const processed = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || processed.has(m)) continue;
      processed.add(m);
      applyAnimeCelShadingToMaterial(m);
    }
  });
}
