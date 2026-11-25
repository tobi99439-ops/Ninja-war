import * as THREE from 'three';
import { getCharacterTextureMaxAnisotropy } from './characterVisualEnhancer';
import {
  isMaskManV2Name,
  isObitoUchihaName,
  isOriginalObitoName,
} from './warObitoColorizer';

export interface ObitoEyeTextureEntry {
  blob?: Blob;
  url?: string;
  fileName?: string;
}

export interface ObitoEyeOverrideInput {
  rightEye?: ObitoEyeTextureEntry;
  leftEye?: ObitoEyeTextureEntry;
}

let activeObitoEyeOverrides: ObitoEyeOverrideInput | null = null;

export function setActiveObitoEyeOverrides(overrides: ObitoEyeOverrideInput | null): void {
  activeObitoEyeOverrides = overrides;
}

export function getActiveObitoEyeOverrides(): ObitoEyeOverrideInput | null {
  return activeObitoEyeOverrides;
}

export function isCustomizableObitoName(labelAr?: string, fileNameHint?: string): boolean {
  if (
    isObitoUchihaName(labelAr, fileNameHint) ||
    isOriginalObitoName(labelAr, fileNameHint) ||
    isMaskManV2Name(labelAr, fileNameHint)
  ) {
    return true;
  }
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/أوبيتو|اوبيتو|توبي|tobi/i.test(trimmed)) return true;
    if (/47c8x1\.fbx|12s7cu\.glb|tobi/i.test(trimmed)) return true;
  }
  return false;
}

function loadEyeTextureFromEntry(
  entry: ObitoEyeTextureEntry | undefined,
  flipY: boolean
): Promise<THREE.Texture | null> {
  if (!entry) return Promise.resolve(null);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');

  const applyTexConfig = (tex: THREE.Texture): THREE.Texture => {
    tex.flipY = flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = getCharacterTextureMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };

  if (entry.blob) {
    const objectUrl = URL.createObjectURL(entry.blob);
    return new Promise((resolve) => {
      loader.load(
        objectUrl,
        (tex) => {
          URL.revokeObjectURL(objectUrl);
          resolve(applyTexConfig(tex));
        },
        undefined,
        () => {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        }
      );
    });
  }

  if (entry.url) {
    return new Promise((resolve) => {
      loader.load(
        entry.url!,
        (tex) => resolve(applyTexConfig(tex)),
        undefined,
        () => resolve(null)
      );
    });
  }

  return Promise.resolve(null);
}

/**
 * Applies user-uploaded Right Eye and Left Eye textures onto Obito Uchiha models:
 * - If the model already has dedicated `right_eye` / `left_eye` mesh/material slots, updates them directly.
 * - Otherwise (e.g., `obito_uchiha` `qnmubz.glb` single-mesh / War Obito mask), attaches sharp textured
 *   circular eye discs onto the head bone aligned precisely inside the right & left mask eye sockets.
 */
export async function applyCustomObitoEyesToModel(
  modelRoot: THREE.Object3D,
  headBone: THREE.Bone | null,
  fallbackParent: THREE.Object3D
): Promise<void> {
  const overrides = activeObitoEyeOverrides;
  if (!overrides || (!overrides.rightEye && !overrides.leftEye)) return;

  let appliedDedicatedRight = false;
  let appliedDedicatedLeft = false;

  // 1. Check for dedicated left_eye / right_eye sub-meshes or material slots
  const rightMatTargets: THREE.MeshStandardMaterial[] = [];
  const leftMatTargets: THREE.MeshStandardMaterial[] = [];

  modelRoot.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      const combined = `${mesh.name || ''} ${mat.name || ''}`;
      if (/right[\s_]*eye/i.test(combined)) {
        rightMatTargets.push(mat as THREE.MeshStandardMaterial);
      } else if (/left[\s_]*eye/i.test(combined)) {
        leftMatTargets.push(mat as THREE.MeshStandardMaterial);
      }
    }
  });

  if (rightMatTargets.length > 0 && overrides.rightEye) {
    const tex = await loadEyeTextureFromEntry(overrides.rightEye, false);
    if (tex) {
      for (const mat of rightMatTargets) {
        const clone = tex.clone();
        clone.needsUpdate = true;
        if (mat.color) mat.color.setHex(0xffffff);
        mat.vertexColors = false;
        mat.map = clone;
        mat.needsUpdate = true;
      }
      tex.dispose();
      appliedDedicatedRight = true;
    }
  }

  if (leftMatTargets.length > 0 && overrides.leftEye) {
    const tex = await loadEyeTextureFromEntry(overrides.leftEye, false);
    if (tex) {
      for (const mat of leftMatTargets) {
        const clone = tex.clone();
        clone.needsUpdate = true;
        if (mat.color) mat.color.setHex(0xffffff);
        mat.vertexColors = false;
        mat.map = clone;
        mat.needsUpdate = true;
      }
      tex.dispose();
      appliedDedicatedLeft = true;
    }
  }

  const needOverlayRight = Boolean(overrides.rightEye) && !appliedDedicatedRight;
  const needOverlayLeft = Boolean(overrides.leftEye) && !appliedDedicatedLeft;
  if (!needOverlayRight && !needOverlayLeft) return;

  // 2. Measure head & eye-socket world coordinates in normalized (+Z facing, Y in [0..2.0]) space
  modelRoot.updateMatrixWorld(true);
  const attachParent: THREE.Object3D = headBone ?? fallbackParent;
  attachParent.updateMatrixWorld(true);

  const headWorldPos = new THREE.Vector3();
  if (headBone) {
    headBone.getWorldPosition(headWorldPos);
  } else {
    headWorldPos.set(0, 1.64, 0);
  }

  // Locate front face surface bounds on normalized model
  let frontZRight = 0.088;
  let frontZLeft = 0.088;
  let eyeY = headWorldPos.y + 0.115;
  let eyeHalfSpread = 0.036;

  const v = new THREE.Vector3();
  let headMinY = Infinity;
  let headMaxY = -Infinity;
  const rightSamples: THREE.Vector3[] = [];
  const leftSamples: THREE.Vector3[] = [];

  modelRoot.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
    const mesh = obj as THREE.Mesh;
    const pos = mesh.geometry?.attributes?.position;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 3500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y >= headWorldPos.y - 0.02 && Math.hypot(v.x, v.z) < 0.17) {
        if (v.y < headMinY) headMinY = v.y;
        if (v.y > headMaxY) headMaxY = v.y;
      }
    }
  });

  if (Number.isFinite(headMinY) && Number.isFinite(headMaxY) && headMaxY > headMinY + 0.08) {
    const measuredEyeY = headMinY + (headMaxY - headMinY) * 0.46;
    eyeY = measuredEyeY;
    modelRoot.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh || obj.userData?.__isAnimeOutline) return;
      const mesh = obj as THREE.Mesh;
      const pos = mesh.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (v.z > 0.04 && Math.abs(v.y - measuredEyeY) < 0.024) {
          if (v.x >= -0.068 && v.x <= -0.016) {
            rightSamples.push(v.clone());
          } else if (v.x >= 0.016 && v.x <= 0.068) {
            leftSamples.push(v.clone());
          }
        }
      }
    });
  }

  let rightWorldCenter = new THREE.Vector3(-eyeHalfSpread, eyeY, frontZRight);
  if (rightSamples.length > 0) {
    rightSamples.sort((a, b) => b.z - a.z);
    const topCount = Math.max(1, Math.ceil(rightSamples.length * 0.35));
    const avg = new THREE.Vector3();
    for (let i = 0; i < topCount; i++) avg.add(rightSamples[i]);
    avg.divideScalar(topCount);
    rightWorldCenter.set(avg.x, avg.y, avg.z + 0.008);
  }

  let leftWorldCenter = new THREE.Vector3(eyeHalfSpread, eyeY, frontZLeft);
  if (leftSamples.length > 0) {
    leftSamples.sort((a, b) => b.z - a.z);
    const topCount = Math.max(1, Math.ceil(leftSamples.length * 0.35));
    const avg = new THREE.Vector3();
    for (let i = 0; i < topCount; i++) avg.add(leftSamples[i]);
    avg.divideScalar(topCount);
    leftWorldCenter.set(avg.x, avg.y, avg.z + 0.008);
  }

  // Symmetrize X/Y slightly if both sides found so eyes stay naturally balanced
  if (rightSamples.length > 0 && leftSamples.length > 0) {
    const avgAbsX = THREE.MathUtils.clamp(
      (Math.abs(rightWorldCenter.x) + Math.abs(leftWorldCenter.x)) * 0.5,
      0.028,
      0.048
    );
    const avgY = (rightWorldCenter.y + leftWorldCenter.y) * 0.5;
    const avgZ = Math.max(rightWorldCenter.z, leftWorldCenter.z);
    rightWorldCenter.set(-avgAbsX, avgY, avgZ);
    leftWorldCenter.set(avgAbsX, avgY, avgZ);
  }

  // Convert desired world position & +Z facing orientation into attachParent's local transform
  const parentWorldQuat = new THREE.Quaternion();
  attachParent.getWorldQuaternion(parentWorldQuat);
  const invParentQuat = parentWorldQuat.clone().invert();
  const desiredWorldQuat = new THREE.Quaternion(); // identity = facing +Z

  const attachEyeDisc = async (
    side: 'right' | 'left',
    entry: ObitoEyeTextureEntry | undefined,
    worldPos: THREE.Vector3
  ) => {
    if (!entry) return;
    const tex = await loadEyeTextureFromEntry(entry, true);
    if (!tex) return;

    const geo = new THREE.CircleGeometry(0.0195, 28);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.0,
      envMapIntensity: 0.28,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tex,
      emissiveIntensity: 0.24,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const eyeMesh = new THREE.Mesh(geo, mat);
    eyeMesh.name = side === 'right' ? 'CustomObitoRightEye' : 'CustomObitoLeftEye';
    eyeMesh.userData.__isObitoCustomEye = true;
    eyeMesh.castShadow = false;
    eyeMesh.receiveShadow = false;
    eyeMesh.renderOrder = 3;

    const localPos = attachParent.worldToLocal(worldPos.clone());
    eyeMesh.position.copy(localPos);
    // Slight subtle outward tilt matching rounded face contour
    const yawTilt = side === 'right' ? -0.14 : 0.14;
    const worldEyeQuat = desiredWorldQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawTilt, 0)));
    eyeMesh.quaternion.copy(invParentQuat).multiply(worldEyeQuat);

    attachParent.add(eyeMesh);
  };

  await Promise.all([
    needOverlayRight ? attachEyeDisc('right', overrides.rightEye, rightWorldCenter) : Promise.resolve(),
    needOverlayLeft ? attachEyeDisc('left', overrides.leftEye, leftWorldCenter) : Promise.resolve(),
  ]);
}
