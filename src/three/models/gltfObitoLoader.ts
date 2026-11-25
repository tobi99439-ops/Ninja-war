import JSZip from 'jszip';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { applyOriginalObitoTextures } from './originalObitoTexturer';
import { applyDeidaraTextures } from './deidaraTexturer';
import { buildDeidaraFallbackSkinnedMeshes } from './deidaraFallbackModel';
import {
  applySixPathsMadaraColors,
  isSixPathsMadaraName,
} from './sixPathsMadaraColorizer';
import {
  createNarutoSageCharacter,
  createNarutoSageTemplate,
} from './narutoSageModel';
import {
  applyAnimeCelShadingToModel,
  applyCharacterTextureAnisotropy,
  applyCinematicCharacterVisuals,
  resolveEnhancedCharacterRole,
} from './characterVisualEnhancer';
import { registerResilientGltfTextureFallback, sanitizeGlbBuffer } from './glbSanitizer';
import {
  applyWarObitoColorPalette,
  CharacterColorPreset,
  isDeidaraName,
  isItachiName,
  isMaskManV2Name,
  isNarutoKuramaName,
  isNarutoSageName,
  isOriginalObitoName,
  shouldApplyWarObitoPalette,
} from './warObitoColorizer';
import {
  applyCustomObitoEyesToModel,
  isCustomizableObitoName,
} from './obitoEyeCustomizer';

export interface CharacterBones {
  hips: THREE.Bone | null;
  spine: THREE.Bone | null;
  chest: THREE.Bone | null;
  neck?: THREE.Bone | null;
  head: THREE.Bone | null;
  leftShoulder: THREE.Bone | null;
  leftUpperArm: THREE.Bone | null;
  leftForearm: THREE.Bone | null;
  leftHand: THREE.Bone | null;
  rightShoulder: THREE.Bone | null;
  rightUpperArm: THREE.Bone | null;
  rightForearm: THREE.Bone | null;
  rightHand: THREE.Bone | null;
  leftThigh: THREE.Bone | null;
  rightThigh: THREE.Bone | null;
  leftShin: THREE.Bone | null;
  rightShin: THREE.Bone | null;
  leftFoot: THREE.Bone | null;
  rightFoot: THREE.Bone | null;
}

export interface CustomGltfCharacter {
  root: THREE.Group;
  pivotGroup: THREE.Group;
  mixerRoot: THREE.Object3D;
  hasSkeleton: boolean;
  mixer: THREE.AnimationMixer | null;
  idleAction: THREE.AnimationAction | null;
  runAction: THREE.AnimationAction | null;
  attackAction: THREE.AnimationAction | null;
  bones: CharacterBones;
  baseBoneRotations: Map<THREE.Bone, THREE.Euler>;
  baseBonePositions: Map<THREE.Bone, THREE.Vector3>;
  gunbaiPivot?: THREE.Group | null;
  gunbaiRestPos?: THREE.Vector3 | null;
  gunbaiRestRot?: THREE.Euler | null;
  dispose: () => void;
}

export interface LoadedCharacterTemplate {
  templateRoot: THREE.Group;
  hasEmbeddedSkeleton: boolean;
  runClip: THREE.AnimationClip | null;
  idleClip: THREE.AnimationClip | null;
  attackClip: THREE.AnimationClip | null;
  combatClip: THREE.AnimationClip | null;
  dispose: () => void;
}

function isAuxiliaryBone(name: string): boolean {
  return /collider|nub|_end(?:$|_)|\bdummy\b|dummy0|_dummy|_shadow|先$|twist|roll|helper|corrective|ik_|_ik(?:$|_)|pole|target|socket|cloth|skirt|ribbon|cape|hair|ponytail|weapon|sword|gunbai/i.test(
    name
  );
}

function findBone(bones: THREE.Bone[], patterns: RegExp[], exclude?: Set<THREE.Bone>): THREE.Bone | null {
  for (const regex of patterns) {
    const cleanMatch = bones.find(
      (b) => (!exclude || !exclude.has(b)) && !isAuxiliaryBone(b.name) && regex.test(b.name)
    );
    if (cleanMatch) return cleanMatch;
  }
  for (const regex of patterns) {
    const match = bones.find((b) => (!exclude || !exclude.has(b)) && regex.test(b.name));
    if (match) return match;
  }
  return null;
}

function findClip(clips: THREE.AnimationClip[], patterns: RegExp[], exclude?: Set<THREE.AnimationClip>): THREE.AnimationClip | null {
  for (const regex of patterns) {
    const match = clips.find((c) => (!exclude || !exclude.has(c)) && regex.test(c.name));
    if (match) return match;
  }
  return null;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Converts an unrigged static GLTF character hierarchy into SkinnedMeshes
 * driven by a procedural 7-bone humanoid skeleton (Hips, Spine, Head, Left/Right Arms & Thighs).
 */
function buildProceduralSkinnedCharacter(
  rawModel: THREE.Group,
  pivotGroup: THREE.Group,
  targetHeight: number,
  applyWarObito = false
): { bones: CharacterBones; skinnedMeshes: THREE.SkinnedMesh[]; skeleton: THREE.Skeleton } {
  rawModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rawModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scaleFactor = size.y > 0.001 ? targetHeight / size.y : 1;

  // Compute normalized transform into character space (bottom-center at 0, height = targetHeight)
  rawModel.scale.multiplyScalar(scaleFactor);
  rawModel.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(rawModel);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  rawModel.position.x -= scaledCenter.x;
  rawModel.position.z -= scaledCenter.z;
  rawModel.position.y -= scaledBox.min.y;
  rawModel.updateMatrixWorld(true);

  if (applyWarObito) {
    applyWarObitoColorPalette(rawModel);
  }

  // Create 14 articulated humanoid Bones
  // Indices: 0=Hips, 1=Spine, 2=Chest, 3=Head, 4=LeftUpperArm, 5=LeftForearm,
  //          6=RightUpperArm, 7=RightForearm, 8=LeftThigh, 9=RightThigh,
  //          10=LeftShin, 11=RightShin, 12=LeftFoot, 13=RightFoot
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, targetHeight * 0.5, 0); // world Y = 1.00

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, targetHeight * 0.08, 0); // waist at world Y = 1.16
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, targetHeight * 0.11, 0); // ribcage at world Y = 1.38
  spine.add(chest);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, targetHeight * 0.13, 0); // neck/head at world Y = 1.64
  chest.add(head);

  const leftUpperArm = new THREE.Bone();
  leftUpperArm.name = 'LeftUpperArm';
  leftUpperArm.position.set(0.21, targetHeight * 0.085, 0); // shoulder at world Y = 1.55
  leftUpperArm.rotation.z = -0.38; // Spreading arm outward away from torso
  chest.add(leftUpperArm);

  const leftForearm = new THREE.Bone();
  leftForearm.name = 'LeftForearm';
  leftForearm.position.set(0.24, -0.25, 0); // elbow at world (0.45, 1.30, 0)
  leftUpperArm.add(leftForearm);

  const rightUpperArm = new THREE.Bone();
  rightUpperArm.name = 'RightUpperArm';
  rightUpperArm.position.set(-0.21, targetHeight * 0.085, 0); // shoulder at world Y = 1.55
  rightUpperArm.rotation.z = 0.38; // Spreading arm outward away from torso
  chest.add(rightUpperArm);

  const rightForearm = new THREE.Bone();
  rightForearm.name = 'RightForearm';
  rightForearm.position.set(-0.24, -0.25, 0); // elbow at world (-0.45, 1.30, 0)
  rightUpperArm.add(rightForearm);

  const leftThigh = new THREE.Bone();
  leftThigh.name = 'LeftThigh';
  leftThigh.position.set(0.16, -0.02, 0); // hip joint at world Y = 0.98
  hips.add(leftThigh);

  const rightThigh = new THREE.Bone();
  rightThigh.name = 'RightThigh';
  rightThigh.position.set(-0.16, -0.02, 0);
  hips.add(rightThigh);

  const leftShin = new THREE.Bone();
  leftShin.name = 'LeftShin';
  leftShin.position.set(0, -targetHeight * 0.24, 0); // knee at world Y = 0.50
  leftThigh.add(leftShin);

  const rightShin = new THREE.Bone();
  rightShin.name = 'RightShin';
  rightShin.position.set(0, -targetHeight * 0.24, 0);
  rightThigh.add(rightShin);

  const leftFoot = new THREE.Bone();
  leftFoot.name = 'LeftFoot';
  leftFoot.position.set(0, -targetHeight * 0.215, 0); // ankle at world Y = 0.07
  leftShin.add(leftFoot);

  const rightFoot = new THREE.Bone();
  rightFoot.name = 'RightFoot';
  rightFoot.position.set(0, -targetHeight * 0.215, 0);
  rightShin.add(rightFoot);

  // 6 Procedural Spring-Bone Cloak Chains for lower coat / robe / skirt / tassets
  // Front-Left, Front-Right, Side-Left, Side-Right, Back-Left, Back-Right
  const cloakBones: THREE.Bone[] = [];
  const cloakChains = [
    { name: 'L_frontcape', x: 0.14, z: 0.12, dx: 0.03, dz: 0.04 },
    { name: 'R_frontcape', x: -0.14, z: 0.12, dx: -0.03, dz: 0.04 },
    { name: 'L_sidecape', x: 0.22, z: 0.0, dx: 0.05, dz: -0.02 },
    { name: 'R_sidecape', x: -0.22, z: 0.0, dx: -0.05, dz: -0.02 },
    { name: 'L_backcape', x: 0.12, z: -0.14, dx: 0.02, dz: -0.05 },
    { name: 'R_backcape', x: -0.12, z: -0.14, dx: -0.02, dz: -0.05 },
  ];

  const cloakSeg1Len = targetHeight * 0.22;

  for (const c of cloakChains) {
    const b1 = new THREE.Bone();
    b1.name = `${c.name}_bone1`;
    b1.position.set(c.x, -targetHeight * 0.035, c.z);
    hips.add(b1);

    const b2 = new THREE.Bone();
    b2.name = `${c.name}_bone2`;
    b2.position.set(c.dx, -cloakSeg1Len, c.dz);
    b1.add(b2);

    cloakBones.push(b1, b2);
  }

  pivotGroup.add(hips);
  pivotGroup.updateMatrixWorld(true);

  const boneList = [
    hips,
    spine,
    chest,
    head,
    leftUpperArm,
    leftForearm,
    rightUpperArm,
    rightForearm,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftFoot,
    rightFoot,
    ...cloakBones,
  ];
  const skeleton = new THREE.Skeleton(boneList);
  skeleton.calculateInverses();

  const sourceMeshes: THREE.Mesh[] = [];
  rawModel.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && !obj.userData?.skipDuplicate) {
      sourceMeshes.push(obj as THREE.Mesh);
    }
  });

  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  for (const srcMesh of sourceMeshes) {
    if (!srcMesh.geometry?.attributes?.position) continue;
    const isBackOrbMesh = /^(?:sphere|orb)0*\d+$/i.test(srcMesh.name || '');
    const geo = srcMesh.geometry.clone();
    geo.applyMatrix4(srcMesh.matrixWorld);

    const pos = geo.attributes.position;
    const count = pos.count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const yNorm = vy / targetHeight;

      let w0 = 0; // Hips
      let w1 = 0; // Spine
      let w2 = 0; // Chest
      let w3 = 0; // Head
      let w4 = 0; // LeftUpperArm
      let w5 = 0; // LeftForearm
      let w6 = 0; // RightUpperArm
      let w7 = 0; // RightForearm
      let w8 = 0; // LeftThigh
      let w9 = 0; // RightThigh
      let w10 = 0; // LeftShin
      let w11 = 0; // RightShin
      let w12 = 0; // LeftFoot
      let w13 = 0; // RightFoot

      const absX = Math.abs(vx);

      let wCloakB1Idx = -1;
      let wCloakB1Val = 0;
      let wCloakB2Idx = -1;
      let wCloakB2Val = 0;

      if (isBackOrbMesh || (vz < -0.22 && yNorm >= 0.45 && yNorm <= 1.05 && absX > 0.14)) {
        // Bind Six Paths Truth-Seeking Orbs cleanly to Chest so they hover behind shoulders
        w2 = 1.0;
      } else if (yNorm >= 0.80) {
        // Neck & Head region
        const tHead = smoothstep(0.79, 0.86, yNorm);
        w3 = tHead;
        w2 = 1 - tHead;
      } else if (yNorm < 0.51) {
        // Legs, Knees, Ankles & Lower Cloak region (protect wide A-pose hands/forearms)
        const handOverlap = yNorm >= 0.40 ? smoothstep(0.32, 0.42, absX) : 0;
        if (handOverlap > 0.01) {
          const tFore = smoothstep(0.40, 0.49, absX);
          if (vx >= 0) {
            w4 = handOverlap * (1 - tFore);
            w5 = handOverlap * tFore;
          } else {
            w6 = handOverlap * (1 - tFore);
            w7 = handOverlap * tFore;
          }
        }
        const legMask = 1 - handOverlap;
        const tLeg = smoothstep(0.51, 0.43, yNorm);
        const tShin = smoothstep(0.285, 0.215, yNorm);
        const tFoot = smoothstep(0.085, 0.03, yNorm);

        // Distinguish outer robe / cloak shell from inner trousers, boots, and leg core cylinders
        const distL = Math.hypot(vx - 0.155, vz);
        const distR = Math.hypot(vx + 0.155, vz);
        const outsideLegs = distL > 0.128 && distR > 0.128;
        const isPelvisCenter = absX < 0.09 && Math.abs(vz) < 0.09 && yNorm > 0.40;
        const isOuterCloth =
          outsideLegs &&
          !isPelvisCenter &&
          yNorm > 0.16 &&
          (vz < -0.09 || vz > 0.09 || absX > 0.20 || yNorm < 0.40);

        if (isOuterCloth) {
          // Weight to Spring-Bone cloak chains
          const tClothSeg2 = smoothstep(0.44, 0.22, yNorm);
          const tClothHips = smoothstep(0.46, 0.51, yNorm);
          let b1 = 14;
          let b2 = 15;
          if (vz < -0.04) {
            b1 = vx >= 0 ? 22 : 24;
            b2 = vx >= 0 ? 23 : 25;
          } else if (absX > 0.18 && vz >= -0.04 && vz <= 0.06) {
            b1 = vx >= 0 ? 18 : 20;
            b2 = vx >= 0 ? 19 : 21;
          } else {
            b1 = vx >= 0 ? 14 : 16;
            b2 = vx >= 0 ? 15 : 17;
          }
          w0 = tClothHips * 0.25 * legMask;
          wCloakB1Idx = b1;
          wCloakB1Val = (1 - tClothSeg2) * (1 - tClothHips * 0.25) * legMask;
          wCloakB2Idx = b2;
          wCloakB2Val = tClothSeg2 * (1 - tClothHips * 0.25) * legMask;
        } else {
          // Inner legs & feet
          w0 = (1 - tLeg) * legMask;
          const sideBlend = smoothstep(-0.04, 0.04, vx);
          const shinOnly = tShin * (1 - tFoot);
          const footOnly = tShin * tFoot;
          w8 = tLeg * (1 - tShin) * sideBlend * legMask;
          w9 = tLeg * (1 - tShin) * (1 - sideBlend) * legMask;
          w10 = tLeg * shinOnly * sideBlend * legMask;
          w11 = tLeg * shinOnly * (1 - sideBlend) * legMask;
          w12 = tLeg * footOnly * sideBlend * legMask;
          w13 = tLeg * footOnly * (1 - sideBlend) * legMask;
        }
      } else {
        // Upper Torso (Spine -> Chest) & A-Pose Arms (UpperArm -> Forearm)
        const tSpine = smoothstep(0.49, 0.58, yNorm);
        const tChest = smoothstep(0.62, 0.72, yNorm);
        const armThreshold = 0.23 + (0.81 - yNorm) * 0.22;
        const tArm = smoothstep(armThreshold, armThreshold + 0.07, absX);
        const tFore = smoothstep(0.41, 0.50, absX);

        if (vx >= 0) {
          w4 = tArm * (1 - tFore);
          w5 = tArm * tFore;
        } else {
          w6 = tArm * (1 - tFore);
          w7 = tArm * tFore;
        }
        const rem = 1 - tArm;
        w0 = rem * (1 - tSpine);
        w1 = rem * tSpine * (1 - tChest);
        w2 = rem * tSpine * tChest;
      }

      const sum =
        w0 +
        w1 +
        w2 +
        w3 +
        w4 +
        w5 +
        w6 +
        w7 +
        w8 +
        w9 +
        w10 +
        w11 +
        w12 +
        w13 +
        wCloakB1Val +
        wCloakB2Val || 1;
      const weights: Array<[number, number]> = [
        [0, w0 / sum],
        [1, w1 / sum],
        [2, w2 / sum],
        [3, w3 / sum],
        [4, w4 / sum],
        [5, w5 / sum],
        [6, w6 / sum],
        [7, w7 / sum],
        [8, w8 / sum],
        [9, w9 / sum],
        [10, w10 / sum],
        [11, w11 / sum],
        [12, w12 / sum],
        [13, w13 / sum],
      ];
      if (wCloakB1Idx >= 0 && wCloakB1Val > 0) {
        weights.push([wCloakB1Idx, wCloakB1Val / sum]);
      }
      if (wCloakB2Idx >= 0 && wCloakB2Val > 0) {
        weights.push([wCloakB2Idx, wCloakB2Val / sum]);
      }
      weights.sort((a, b) => b[1] - a[1]);

      let topSum = weights[0][1] + weights[1][1] + weights[2][1] + weights[3][1];
      if (topSum <= 0) topSum = 1;

      for (let k = 0; k < 4; k++) {
        skinIndices[i * 4 + k] = weights[k][0];
        skinWeights[i * 4 + k] = weights[k][1] / topSum;
      }
    }

    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const mat = srcMesh.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    if (!applyWarObito) {
      mats.forEach((m) => {
        if (m && 'envMapIntensity' in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity = Math.max(
            (m as THREE.MeshStandardMaterial).envMapIntensity || 0,
            0.78
          );
        }
      });
    }

    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.frustumCulled = false;
    skinned.bind(skeleton);
    pivotGroup.add(skinned);
    skinnedMeshes.push(skinned);
  }

  // Relax arms naturally close to coat & add subtle anatomical elbow bend
  leftUpperArm.rotation.z = -0.52;
  rightUpperArm.rotation.z = 0.52;
  leftForearm.rotation.y = -0.18;
  rightForearm.rotation.y = 0.18;

  return {
    bones: {
      hips,
      spine,
      chest,
      head,
      leftShoulder: null,
      leftUpperArm,
      leftForearm,
      leftHand: null,
      rightShoulder: null,
      rightUpperArm,
      rightForearm,
      rightHand: null,
      leftThigh,
      rightThigh,
      leftShin,
      rightShin,
      leftFoot,
      rightFoot,
    },
    skinnedMeshes,
    skeleton,
  };
}

interface FallbackCanvas extends HTMLCanvasElement {
  __isFallbackTexture?: boolean;
}

function createFallbackCanvas(): FallbackCanvas {
  const canvas = document.createElement('canvas') as FallbackCanvas;
  canvas.width = 1;
  canvas.height = 1;
  canvas.__isFallbackTexture = true;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
  }
  return canvas;
}

function createFallbackTexture(): THREE.Texture<HTMLImageElement> {
  const canvas = createFallbackCanvas();
  const tex = new THREE.CanvasTexture(canvas) as unknown as THREE.Texture<HTMLImageElement>;
  tex.needsUpdate = true;
  return tex;
}

function isFallbackTexture(tex: THREE.Texture | null | undefined): boolean {
  return Boolean(
    tex &&
      tex.image &&
      (tex.image as FallbackCanvas).__isFallbackTexture
  );
}

function extractTextureBasename(rawUrl: string): string {
  const withoutQuery = rawUrl.split('?')[0].split('#')[0];
  const segments = withoutQuery.split(/[\\/]/);
  const last = segments[segments.length - 1] || withoutQuery;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function normalizeAssetPath(rawUrl: string): string {
  const withoutQuery = rawUrl.split('?')[0].split('#')[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  return decoded.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
}

function stripFileExtension(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
}

async function decodeTgaBufferToPngBlob(buf: ArrayBuffer): Promise<Blob | null> {
  try {
    const tgaLoader = new TGALoader();
    const parsed = tgaLoader.parse(buf);
    const width = parsed?.width ?? 0;
    const height = parsed?.height ?? 0;
    if (!parsed?.data || width <= 0 || height <= 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const clamped = new Uint8ClampedArray(width * height * 4);
    clamped.set(parsed.data);
    ctx.putImageData(new ImageData(clamped, width, height), 0, 0);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch {
    return null;
  }
}

interface ResilientTextureOptions {
  skipExternalRelative: boolean;
  zipTextureMap: Map<string, string>;
  zipTextureNoExtMap: Map<string, string>;
  hasLocalAssetBase: boolean;
  createdBlobUrls: string[];
}

class ResilientTextureLoader extends THREE.TextureLoader {
  private skipExternalRelative: boolean;
  private zipTextureMap: Map<string, string>;
  private zipTextureNoExtMap: Map<string, string>;
  private hasLocalAssetBase: boolean;
  private createdBlobUrls: string[];
  private pending: Array<Promise<void>> = [];

  constructor(manager: THREE.LoadingManager, options: ResilientTextureOptions) {
    super(manager);
    this.skipExternalRelative = options.skipExternalRelative;
    this.zipTextureMap = options.zipTextureMap;
    this.zipTextureNoExtMap = options.zipTextureNoExtMap;
    this.hasLocalAssetBase = options.hasLocalAssetBase;
    this.createdBlobUrls = options.createdBlobUrls;
    this.setCrossOrigin('anonymous');
  }

  public async waitForAll(timeoutMs = 3000): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = [...this.pending];
    await Promise.race([
      Promise.allSettled(batch),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private resolveZipUrl(rawUrl: string): string | null {
    const cleanFull = normalizeAssetPath(rawUrl);
    const basenameLower = extractTextureBasename(rawUrl).toLowerCase();
    const noExt = stripFileExtension(basenameLower);
    return (
      this.zipTextureMap.get(cleanFull) ||
      this.zipTextureMap.get(basenameLower) ||
      this.zipTextureNoExtMap.get(noExt) ||
      null
    );
  }

  override load(
    url: string,
    onLoad?: (data: THREE.Texture<HTMLImageElement>) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (err: unknown) => void
  ): THREE.Texture<HTMLImageElement> {
    const texture = new THREE.Texture() as unknown as THREE.Texture<HTMLImageElement>;
    texture.colorSpace = THREE.SRGBColorSpace;

    const isInline = url.startsWith('data:') || url.startsWith('blob:');
    let resolvedUrl = url;

    if (!isInline) {
      const basename = extractTextureBasename(url);
      if (this.zipTextureMap.size > 0) {
        const zipBlobUrl = this.resolveZipUrl(url);
        if (zipBlobUrl) {
          resolvedUrl = zipBlobUrl;
        } else {
          const fallback = createFallbackTexture();
          queueMicrotask(() => {
            onLoad?.(fallback);
          });
          return fallback;
        }
      } else if (this.skipExternalRelative) {
        const fallback = createFallbackTexture();
        queueMicrotask(() => {
          onLoad?.(fallback);
        });
        return fallback;
      } else if (this.hasLocalAssetBase) {
        resolvedUrl = `${this.path}${encodeURIComponent(basename)}`;
      }
    }

    const isRemoteTga = !resolvedUrl.startsWith('blob:') && /\.tga(\?.*)?$/i.test(resolvedUrl);

    const loadTask = new Promise<void>((resolve) => {
      const finishWithFallback = () => {
        const canvas = createFallbackCanvas();
        texture.image = canvas as unknown as HTMLImageElement;
        texture.needsUpdate = true;
        onLoad?.(texture);
        resolve();
      };

      const attachImageUrl = (imgUrl: string) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          texture.image = image;
          texture.needsUpdate = true;
          onLoad?.(texture);
          resolve();
        };
        image.onerror = finishWithFallback;
        image.src = imgUrl;
      };

      if (isRemoteTga) {
        fetch(resolvedUrl)
          .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('TGA_FETCH'))))
          .then((buf) => decodeTgaBufferToPngBlob(buf))
          .then((pngBlob) => {
            if (!pngBlob) {
              finishWithFallback();
              return;
            }
            const pngUrl = URL.createObjectURL(pngBlob);
            this.createdBlobUrls.push(pngUrl);
            attachImageUrl(pngUrl);
          })
          .catch(finishWithFallback);
      } else {
        attachImageUrl(resolvedUrl);
      }
    });

    this.pending.push(loadTask);
    return texture;
  }
}

function sanitizeMissingTextures(rootObj: THREE.Object3D): void {
  rootObj.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      if (!mat) continue;
      const std = mat as THREE.MeshStandardMaterial;

      if (isFallbackTexture(std.map)) {
        std.map?.dispose();
        std.map = null;
      }
      if (isFallbackTexture(std.normalMap)) {
        std.normalMap?.dispose();
        std.normalMap = null;
      }
      if (isFallbackTexture(std.emissiveMap)) {
        std.emissiveMap?.dispose();
        std.emissiveMap = null;
      }
      if (isFallbackTexture(std.roughnessMap)) {
        std.roughnessMap?.dispose();
        std.roughnessMap = null;
      }
      if (isFallbackTexture(std.metalnessMap)) {
        std.metalnessMap?.dispose();
        std.metalnessMap = null;
      }
      if (isFallbackTexture(std.aoMap)) {
        std.aoMap?.dispose();
        std.aoMap = null;
      }
      if (isFallbackTexture(std.alphaMap)) {
        std.alphaMap?.dispose();
        std.alphaMap = null;
      }

      if (std.color && std.color.r + std.color.g + std.color.b < 0.08) {
        std.color.setHex(std.map ? 0xffffff : 0xd8dee9);
      }
      if ('roughness' in std && (std.roughness === undefined || std.roughness > 0.98)) {
        std.roughness = 0.65;
      }
      if ('metalness' in std && (std.metalness === undefined || std.metalness > 0.95)) {
        std.metalness = 0.08;
      }
      if ('envMapIntensity' in std) {
        std.envMapIntensity = Math.max(std.envMapIntensity || 0, 0.85);
      }

      mat.needsUpdate = true;
    }
  });
}

function bindUnmatchedZipTexturesFallback(
  rootObj: THREE.Object3D,
  zipTextureMap: Map<string, string>
): void {
  if (zipTextureMap.size === 0) return;

  let boundMapCount = 0;
  const targetMaterials: Array<{ meshName: string; mat: THREE.MeshStandardMaterial }> = [];
  rootObj.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      if (std.map) {
        boundMapCount++;
      } else {
        targetMaterials.push({ meshName: mesh.name || '', mat: std });
      }
    }
  });

  if (boundMapCount > 0 || targetMaterials.length === 0) return;

  // Deduplicate by blobUrl and exclude obvious normal/roughness/metalness/specular/ao/alpha maps
  const colorEntries: Array<{ key: string; url: string }> = [];
  const seenUrls = new Set<string>();
  for (const [key, url] of zipTextureMap.entries()) {
    if (seenUrls.has(url)) continue;
    if (/(?:^|[_\-.])(nrm|norm|normal|rough|rgh|metal|met|spec|spc|ao|occ|mask|alpha|bump|disp|height|emm|emis)/i.test(key)) {
      continue;
    }
    seenUrls.add(url);
    colorEntries.push({ key: stripFileExtension(extractTextureBasename(key).toLowerCase()), url });
  }
  if (colorEntries.length === 0) return;

  const texLoader = new THREE.TextureLoader();
  const loadedTexByUrl = new Map<string, THREE.Texture>();
  const getOrLoadTex = (url: string) => {
    let tex = loadedTexByUrl.get(url);
    if (!tex) {
      tex = texLoader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      loadedTexByUrl.set(url, tex);
    }
    return tex;
  };

  for (const { meshName, mat } of targetMaterials) {
    const labelTokens = `${mat.name || ''} ${meshName}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !/^(mat|material|mesh|node|default|object|standard|phong)$/i.test(t));

    let chosenUrl: string | null = null;
    if (colorEntries.length === 1) {
      chosenUrl = colorEntries[0].url;
    } else if (labelTokens.length > 0) {
      let bestScore = 0;
      for (const entry of colorEntries) {
        let score = 0;
        for (const tok of labelTokens) {
          if (entry.key.includes(tok)) score += tok.length;
        }
        if (score > bestScore) {
          bestScore = score;
          chosenUrl = entry.url;
        }
      }
    }

    if (!chosenUrl) {
      const preferredMain = colorEntries.find((e) =>
        /(?:diffuse|albedo|base|color|col|body|main|skin|d$)/i.test(e.key)
      );
      chosenUrl = preferredMain?.url || colorEntries[0].url;
    }

    if (chosenUrl) {
      mat.map = getOrLoadTex(chosenUrl);
      if (mat.color) mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    }
  }
}

/**
 * Strips black, zero-alpha, or excessively dark baked vertex colors (`COLOR_0`)
 * that turn imported models solid black in Three.js (`diffuseColor *= vColor`).
 */
function sanitizeZeroVertexColors(
  rootObj: THREE.Object3D,
  forceStrip = false,
  stripDarkOnCustom = false
): void {
  rootObj.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry;
    const colorAttr = geo?.attributes?.color as THREE.BufferAttribute | undefined;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of mats) {
      if (!mat) continue;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.needsUpdate = true;
        if (std.color && std.color.r + std.color.g + std.color.b < 0.25) {
          std.color.setHex(0xffffff);
        }
      }
    }

    if (!colorAttr) return;
    const hasDiffuseMap = mats.some((m) => Boolean(m && (m as THREE.MeshStandardMaterial).map));

    let shouldStrip = forceStrip;
    if (!shouldStrip && colorAttr.count > 0) {
      const sampleCount = Math.min(colorAttr.count, 512);
      const step = Math.max(1, Math.floor(colorAttr.count / sampleCount));
      let checked = 0;
      let maxRgb = 0;
      let sumRgb = 0;
      let zeroRgbCount = 0;
      let zeroAlphaCount = 0;
      const isRgba = colorAttr.itemSize >= 4;

      for (let i = 0; i < colorAttr.count; i += step) {
        const r = colorAttr.getX(i);
        const g = colorAttr.getY(i);
        const b = colorAttr.getZ(i);
        const rgbMax = Math.max(r, g, b);
        if (rgbMax > maxRgb) maxRgb = rgbMax;
        sumRgb += (r + g + b) / 3;
        if (rgbMax < 0.04) zeroRgbCount++;
        if (isRgba && colorAttr.getW(i) < 0.05) zeroAlphaCount++;
        checked++;
      }

      const avgRgb = sumRgb / Math.max(1, checked);
      if (
        maxRgb < 0.12 ||
        avgRgb < 0.08 ||
        (isRgba && zeroAlphaCount / Math.max(1, checked) > 0.2) ||
        zeroRgbCount / Math.max(1, checked) > 0.18 ||
        (stripDarkOnCustom && hasDiffuseMap && avgRgb < 0.55)
      ) {
        shouldStrip = true;
      }
    }

    if (shouldStrip) {
      geo.deleteAttribute('color');
      for (const mat of mats) {
        if (!mat) continue;
        mat.vertexColors = false;
        mat.needsUpdate = true;
      }
    }
  });
}

function sanitizeAndNormalizeCustomMaterials(
  rootObj: THREE.Object3D,
  isCustomGeneric: boolean
): void {
  const convertedMats = new Map<THREE.Material, THREE.Material>();

  rootObj.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry;
    if (geo) {
      const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
      let needsNormals = !normAttr || normAttr.count === 0;
      if (normAttr && !needsNormals) {
        const checkLimit = Math.min(normAttr.count, 32);
        let zeroNorms = 0;
        for (let i = 0; i < checkLimit; i++) {
          const nx = normAttr.getX(i);
          const ny = normAttr.getY(i);
          const nz = normAttr.getZ(i);
          if (!Number.isFinite(nx + ny + nz) || nx * nx + ny * ny + nz * nz < 0.0001) {
            zeroNorms++;
          }
        }
        if (zeroNorms >= Math.ceil(checkLimit * 0.5)) {
          needsNormals = true;
        }
      }
      if (needsNormals && geo.attributes.position) {
        geo.computeVertexNormals();
      }
    }

    const fixSingleMaterial = (mat: THREE.Material): THREE.Material => {
      if (!mat) return mat;
      const existing = convertedMats.get(mat);
      if (existing) return existing;

      let targetMat: THREE.Material = mat;

      if (
        isCustomGeneric &&
        ((mat as THREE.MeshPhongMaterial).isMeshPhongMaterial ||
          (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial)
      ) {
        const legacy = mat as THREE.MeshPhongMaterial;
        const map = legacy.map || null;
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace;
          map.needsUpdate = true;
        }
        const baseColor = legacy.color ? legacy.color.clone() : new THREE.Color(0xffffff);
        if (map && baseColor.r + baseColor.g + baseColor.b < 0.25) {
          baseColor.setHex(0xffffff);
        } else if (!map && !mat.vertexColors && baseColor.r + baseColor.g + baseColor.b < 0.05) {
          baseColor.setHex(0xd8dee9);
        }
        const emissiveColor = legacy.emissive ? legacy.emissive.clone() : new THREE.Color(0x000000);
        if (legacy.emissiveMap) {
          legacy.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          legacy.emissiveMap.needsUpdate = true;
        }
        const nextStd = new THREE.MeshStandardMaterial({
          name: mat.name,
          map,
          normalMap: legacy.normalMap || null,
          bumpMap: legacy.bumpMap || null,
          aoMap: legacy.aoMap || null,
          alphaMap: legacy.alphaMap || null,
          emissiveMap: legacy.emissiveMap || null,
          emissive: emissiveColor,
          emissiveIntensity: legacy.emissiveIntensity ?? 1,
          color: baseColor,
          roughness: 0.72,
          metalness: 0.08,
          envMapIntensity: 0.85,
          side: THREE.DoubleSide,
          vertexColors: Boolean(mat.vertexColors && geo?.attributes?.color),
          transparent: mat.transparent,
          opacity: mat.opacity !== undefined && mat.opacity <= 0.01 ? 1 : mat.opacity,
          alphaTest: mat.alphaTest,
        });
        convertedMats.set(mat, nextStd);
        mat.dispose();
        return nextStd;
      }

      const std = targetMat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.needsUpdate = true;
        if (std.color && std.color.r + std.color.g + std.color.b < 0.25) {
          std.color.setHex(0xffffff);
        }
      } else if (
        isCustomGeneric &&
        !std.vertexColors &&
        std.color &&
        std.color.r + std.color.g + std.color.b < 0.05
      ) {
        std.color.setHex(0xd8dee9);
      }

      if (std.emissiveMap) {
        std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        std.emissiveMap.needsUpdate = true;
      }

      if (isCustomGeneric) {
        if ('metalness' in std && !std.metalnessMap && typeof std.metalness === 'number' && std.metalness > 0.45) {
          std.metalness = 0.12;
        }
        if ('roughness' in std && typeof std.roughness === 'number') {
          std.roughness = THREE.MathUtils.clamp(std.roughness, 0.32, 0.92);
        }
        if (std.aoMap && geo && !geo.attributes.uv && !geo.attributes.uv1) {
          std.aoMap = null;
        }
        if (std.opacity !== undefined && std.opacity <= 0.01) {
          std.opacity = 1;
          std.transparent = false;
        }
        if (!geo?.attributes?.color) {
          std.vertexColors = false;
        }
        std.side = THREE.DoubleSide;
        if ('envMapIntensity' in std) {
          std.envMapIntensity = Math.max(std.envMapIntensity || 0, 0.85);
        }
      }

      targetMat.needsUpdate = true;
      convertedMats.set(mat, targetMat);
      return targetMat;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(fixSingleMaterial);
    } else if (mesh.material) {
      mesh.material = fixSingleMaterial(mesh.material);
    }
  });
}

type DetectedModelFormat = 'zip' | 'glb' | 'gltf' | 'fbx' | 'obj' | 'dae' | 'stl' | 'ply';

function detectModelFormat(buffer: ArrayBuffer, nameHint: string): DetectedModelFormat {
  if (buffer.byteLength >= 4) {
    const view = new DataView(buffer);
    // ZIP / PK archive
    if (view.getUint32(0, false) === 0x504b0304) {
      return 'zip';
    }
    // Binary glTF / VRM ('glTF')
    if (view.getUint32(0, true) === 0x46546c67) {
      return 'glb';
    }
  }

  const headLen = Math.min(buffer.byteLength, 2048);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, headLen));
  const trimmed = head.trimStart();

  if (head.startsWith('Kaydara FBX Binary') || head.includes('; FBX ')) {
    return 'fbx';
  }
  if (trimmed.startsWith('{') && /"(?:asset|scenes|nodes|meshes|buffers)"/.test(trimmed)) {
    return 'gltf';
  }
  if (/^<\?xml|<COLLADA\b/i.test(trimmed)) {
    return 'dae';
  }
  if (/^ply[\r\n]/i.test(trimmed)) {
    return 'ply';
  }
  if (/^solid\b/i.test(trimmed) && /facet\s+normal/i.test(trimmed)) {
    return 'stl';
  }
  // Binary STL exact size check: 80-byte header + uint32 triCount + 50 bytes/tri
  if (buffer.byteLength >= 84) {
    const triCount = new DataView(buffer).getUint32(80, true);
    if (triCount > 0 && 84 + triCount * 50 === buffer.byteLength) {
      return 'stl';
    }
  }
  if (/(?:^|\r?\n)\s*(?:v|vt|vn|mtllib|usemtl)\s+/m.test(head)) {
    return 'obj';
  }

  const cleanName = nameHint.split('?')[0].split('#')[0].toLowerCase();
  if (cleanName.endsWith('.zip')) return 'zip';
  if (cleanName.endsWith('.fbx')) return 'fbx';
  if (cleanName.endsWith('.gltf')) return 'gltf';
  if (cleanName.endsWith('.vrm') || cleanName.endsWith('.glb')) return 'glb';
  if (cleanName.endsWith('.obj')) return 'obj';
  if (cleanName.endsWith('.dae')) return 'dae';
  if (cleanName.endsWith('.stl')) return 'stl';
  if (cleanName.endsWith('.ply')) return 'ply';
  return 'glb';
}

function isFbxPayload(buffer: ArrayBuffer, nameHint: string): boolean {
  return detectModelFormat(buffer, nameHint) === 'fbx';
}

function wrapGeometryAsGroup(geometry: THREE.BufferGeometry): THREE.Group {
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  const hasVertexColors = Boolean(geometry.attributes.color);
  const material = new THREE.MeshStandardMaterial({
    color: hasVertexColors ? 0xffffff : 0xd8dce4,
    roughness: 0.65,
    metalness: 0.08,
    vertexColors: hasVertexColors,
    side: THREE.DoubleSide,
    envMapIntensity: 0.42,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ImportedMesh';
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

export interface LoadObitoModelOptions {
  labelAr?: string;
  colorPreset?: CharacterColorPreset;
  warObitoPalette?: boolean;
}

export function mapBonesOnObject(rootObj: THREE.Object3D): CharacterBones {
  const existingBones: THREE.Bone[] = [];
  rootObj.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      existingBones.push(obj as THREE.Bone);
    }
  });

  const usedBones = new Set<THREE.Bone>();
  const pickBone = (patterns: RegExp[]): THREE.Bone | null => {
    const b = findBone(existingBones, patterns, usedBones);
    if (b) usedBones.add(b);
    return b;
  };

  const hips = pickBone([/^下半身$/, /^センター$/, /hips/i, /pelvis/i, /bip0*1[\s_]*$/i, /j_bip_c_hips/i, /^root$/i]);
  const spine = pickBone([
    /^上半身$/,
    /^mixamorig.*spine$/i,
    /^spine$/i,
    /spine_?01/i,
    /spine\.?0*1?$/i,
    /bip0*1[\s_]*spine$/i,
    /j_bip_c_spine/i,
    /spine$/i,
    /waist/i,
    /bone_spine_/i,
    /(?:^|[_\s])spine(?![\d_]*[1-9])(?:$|[_\s])/i,
    /spine1/i,
    /spine/i,
  ]);
  const chest = pickBone([
    /^上半身2$/,
    /spine2/i,
    /spine_?03/i,
    /spine_?02/i,
    /bip0*1[\s_]*spine[12]/i,
    /j_bip_c_upperchest/i,
    /j_bip_c_chest/i,
    /upper.*chest/i,
    /chest/i,
    /torso/i,
    /spine1/i,
    /spine_?01/i,
    /^spine_?upper$/i,
  ]);
  const head = pickBone([
    /^頭$/,
    /^mixamorig.*head$/i,
    /^head$/i,
    /bip0*1[\s_]*head$/i,
    /j_bip_c_head/i,
    /^head[\s_]*neck[\s_]*upper$/i,
    /head$/i,
    /bone_head_/i,
    /^head(?![\s_]*(?:lip|jaw|tongue|eyebrow|eyelid|eyeball|cheek|mouth))/i,
    /head/i,
    /neck/i,
  ]);
  const neck = pickBone([
    /^首$/,
    /^mixamorig.*neck$/i,
    /^neck$/i,
    /neck_?01/i,
    /bip0*1[\s_]*neck/i,
    /j_bip_c_neck/i,
    /^head[\s_]*neck[\s_]*lower$/i,
    /neck[\s_]*(?:upper|lower)$/i,
    /bone_neck_/i,
    /^(?!.*(?:collar|shirt|neck_[rlc]\d*)).*neck/i,
  ]);
  const leftUpperArm = pickBone([
    /^左腕$/,
    /left.*upper.*arm/i,
    /(?:^|[_\s.])upperarm[_\s.]*l(?:$|[_\s.])/i,
    /upperarm_l/i,
    /l_upperarm/i,
    /bip0*1[\s_]*l[\s_]*upperarm/i,
    /j_bip_l_upperarm/i,
    /mixamorig.*leftarm$/i,
    /^arm_left_shoulder_2$/i,
    /^left_?arm$/i,
    /left.*arm$/i,
    /arm_?l/i,
    /left.*arm/i,
  ]);
  const leftForearm = pickBone([
    /^左ひじ$/,
    /left.*fore.*arm$/i,
    /left.*fore.*arm/i,
    /forearm_l/i,
    /l_forearm/i,
    /(?:^|[_\s.])lowerarm[_\s.]*l(?:$|[_\s.])/i,
    /lowerarm_l/i,
    /bip0*1[\s_]*l[\s_]*forearm/i,
    /j_bip_l_lowerarm/i,
    /left.*lower.*arm/i,
    /^arm_left_elbow$/i,
    /elbow_l/i,
    /forearm[\s_.]*l/i,
  ]);
  const rightUpperArm = pickBone([
    /^右腕$/,
    /right.*upper.*arm/i,
    /(?:^|[_\s.])upperarm[_\s.]*r(?:$|[_\s.])/i,
    /upperarm_r/i,
    /r_upperarm/i,
    /bip0*1[\s_]*r[\s_]*upperarm/i,
    /j_bip_r_upperarm/i,
    /mixamorig.*rightarm$/i,
    /^arm_right_shoulder_2$/i,
    /^right_?arm$/i,
    /right.*arm$/i,
    /arm_?r/i,
    /right.*arm/i,
  ]);
  const rightForearm = pickBone([
    /^右ひじ$/,
    /right.*fore.*arm$/i,
    /right.*fore.*arm/i,
    /forearm_r/i,
    /r_forearm/i,
    /(?:^|[_\s.])lowerarm[_\s.]*r(?:$|[_\s.])/i,
    /lowerarm_r/i,
    /bip0*1[\s_]*r[\s_]*forearm/i,
    /j_bip_r_lowerarm/i,
    /right.*lower.*arm/i,
    /^arm_right_elbow$/i,
    /elbow_r/i,
    /forearm[\s_.]*r/i,
  ]);
  const leftShoulder = pickBone([
    /^左肩$/,
    /^arm_left_shoulder_1$/i,
    /left.*shoulder$/i,
    /left.*shoulder/i,
    /shoulder[\s_.]*l/i,
    /l_shoulder/i,
    /left.*clav/i,
    /clavicle[\s_.]*l/i,
    /l_clavicle/i,
    /bip0*1[\s_]*l[\s_]*clavicle/i,
    /j_bip_l_shoulder/i,
  ]);
  const rightShoulder = pickBone([
    /^右肩$/,
    /^arm_right_shoulder_1$/i,
    /right.*shoulder$/i,
    /right.*shoulder/i,
    /shoulder[\s_.]*r/i,
    /r_shoulder/i,
    /right.*clav/i,
    /clavicle[\s_.]*r/i,
    /r_clavicle/i,
    /bip0*1[\s_]*r[\s_]*clavicle/i,
    /j_bip_r_shoulder/i,
  ]);
  const leftHand = pickBone([
    /^左手首$/,
    /^mixamorig.*left_?hand$/i,
    /^left_?hand$/i,
    /^l_hand$/i,
    /hand[\s_.]*l$/i,
    /bip0*1[\s_]*l[\s_]*hand/i,
    /j_bip_l_hand/i,
    /left.*hand$/i,
    /left.*hand/i,
    /hand_l/i,
    /l_hand/i,
    /left.*wrist/i,
    /wrist_l/i,
  ]);
  const rightHand = pickBone([
    /^右手首$/,
    /^mixamorig.*right_?hand$/i,
    /^right_?hand$/i,
    /^r_hand$/i,
    /hand[\s_.]*r$/i,
    /bip0*1[\s_]*r[\s_]*hand/i,
    /j_bip_r_hand/i,
    /right.*hand$/i,
    /right.*hand/i,
    /hand_r/i,
    /r_hand/i,
    /right.*wrist/i,
    /wrist_r/i,
  ]);
  const leftThigh = pickBone([
    /^左足$/,
    /^左足D$/,
    /left.*up.*leg$/i,
    /left.*up.*leg/i,
    /left.*leg.*upper/i,
    /(?:^|[_\s.])thigh[_\s.]*l(?:$|[_\s.])/i,
    /thigh_l/i,
    /l_thigh/i,
    /bip0*1[\s_]*l[\s_]*thigh/i,
    /j_bip_l_upperleg/i,
    /left.*thigh/i,
    /upperleg[\s_.]*l/i,
  ]);
  const rightThigh = pickBone([
    /^右足$/,
    /^右足D$/,
    /right.*up.*leg$/i,
    /right.*up.*leg/i,
    /right.*leg.*upper/i,
    /(?:^|[_\s.])thigh[_\s.]*r(?:$|[_\s.])/i,
    /thigh_r/i,
    /r_thigh/i,
    /bip0*1[\s_]*r[\s_]*thigh/i,
    /j_bip_r_upperleg/i,
    /right.*thigh/i,
    /upperleg[\s_.]*r/i,
  ]);
  const leftShin = pickBone([
    /^左ひざ$/,
    /^左ひざD$/,
    /left.*shin/i,
    /shin[\s_.]*l/i,
    /l_shin/i,
    /(?:^|[_\s.])calf[_\s.]*l(?:$|[_\s.])/i,
    /calf_l/i,
    /l_calf/i,
    /bip0*1[\s_]*l[\s_]*calf/i,
    /j_bip_l_lowerleg/i,
    /left.*calf/i,
    /left.*lower.*leg/i,
    /lowerleg[\s_.]*l/i,
    /left.*knee/i,
    /mixamorig.*leftleg$/i,
    /left_?leg$/i,
    /^bone_leftleg_/i,
    /left_?leg(?!.*upper)/i,
  ]);
  const rightShin = pickBone([
    /^右ひざ$/,
    /^右ひざD$/,
    /right.*shin/i,
    /shin[\s_.]*r/i,
    /r_shin/i,
    /(?:^|[_\s.])calf[_\s.]*r(?:$|[_\s.])/i,
    /calf_r/i,
    /r_calf/i,
    /bip0*1[\s_]*r[\s_]*calf/i,
    /j_bip_r_lowerleg/i,
    /right.*calf/i,
    /right.*lower.*leg/i,
    /lowerleg[\s_.]*r/i,
    /right.*knee/i,
    /mixamorig.*rightleg$/i,
    /right_?leg$/i,
    /^bone_rightleg_/i,
    /right_?leg(?!.*upper)/i,
  ]);
  const leftFoot = pickBone([
    /^左足首$/,
    /^左足首D$/,
    /^mixamorig.*left_?foot$/i,
    /^left_?foot$/i,
    /^l_foot$/i,
    /foot[\s_.]*l$/i,
    /bip0*1[\s_]*l[\s_]*foot/i,
    /j_bip_l_foot/i,
    /left.*foot$/i,
    /left.*foot/i,
    /foot_l/i,
    /l_foot/i,
    /^leg_left_ankle$/i,
    /left.*ankle/i,
    /ankle_l/i,
  ]);
  const rightFoot = pickBone([
    /^右足首$/,
    /^右足首D$/,
    /^mixamorig.*right_?foot$/i,
    /^right_?foot$/i,
    /^r_foot$/i,
    /foot[\s_.]*r$/i,
    /bip0*1[\s_]*r[\s_]*foot/i,
    /j_bip_r_foot/i,
    /right.*foot$/i,
    /right.*foot/i,
    /foot_r/i,
    /r_foot/i,
    /^leg_right_ankle$/i,
    /right.*ankle/i,
    /ankle_r/i,
  ]);

  return {
    hips,
    spine,
    chest,
    neck,
    head,
    leftShoulder,
    leftUpperArm,
    leftForearm,
    leftHand,
    rightShoulder,
    rightUpperArm,
    rightForearm,
    rightHand,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftFoot,
    rightFoot,
  };
}

function selectAnimationClips(loadedAnimations: THREE.AnimationClip[]): {
  runClip: THREE.AnimationClip | null;
  idleClip: THREE.AnimationClip | null;
  attackClip: THREE.AnimationClip | null;
} {
  if (loadedAnimations.length === 0) {
    return { runClip: null, idleClip: null, attackClip: null };
  }

  const stripScaleTracks = (clip: THREE.AnimationClip | null): THREE.AnimationClip | null => {
    if (!clip) return null;
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
    return clip;
  };

  const nonLocomotionRegex = /idle|stand|breath|wait|win|victory|pose|taunt|emote|celebrate|intro|outro|attack|punch|slash|hit|strike|kick|death|die|(?:^|[_\s])atk(?:$|[_\s\d])|\bcmb\b/i;

  if (loadedAnimations.length === 1) {
    const onlyClip = stripScaleTracks(loadedAnimations[0]);
    if (onlyClip && /idle|stand|breath|wait|win|victory|pose|taunt|emote|celebrate|intro|outro/i.test(onlyClip.name)) {
      return { runClip: null, idleClip: onlyClip, attackClip: null };
    }
    return { runClip: onlyClip, idleClip: null, attackClip: null };
  }

  const usedClips = new Set<THREE.AnimationClip>();
  const runClip =
    findClip(loadedAnimations, [/run/i, /sprint/i, /jog/i, /dash/i, /walk/i, /move/i], usedClips) ||
    loadedAnimations.find((c) => !nonLocomotionRegex.test(c.name)) ||
    null;
  if (runClip) usedClips.add(runClip);

  const idleClip =
    findClip(loadedAnimations, [/idle/i, /stand/i, /breath/i, /wait/i], usedClips) ||
    loadedAnimations.find(
      (c) =>
        !usedClips.has(c) &&
        !/attack|punch|slash|hit|strike|kick|death|die|(?:^|[_\s])atk(?:$|[_\s\d])|\bcmb\b/i.test(
          c.name
        )
    ) ||
    null;
  if (idleClip) usedClips.add(idleClip);

  const attackClip = findClip(
    loadedAnimations,
    [
      /attack/i,
      /(?:^|[_\s])atk(?:$|[_\s\d])/i,
      /\bcmb\b/i,
      /punch/i,
      /slash/i,
      /hit/i,
      /strike/i,
      /kick/i,
      /combo/i,
    ],
    usedClips
  );

  return {
    runClip: stripScaleTracks(runClip),
    idleClip: stripScaleTracks(idleClip),
    attackClip: stripScaleTracks(attackClip),
  };
}

function computeObjectOrBoneBounds(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (!box.isEmpty()) return box;
  const wp = new THREE.Vector3();
  obj.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      child.getWorldPosition(wp);
      box.expandByPoint(wp);
    }
  });
  return box;
}

/**
 * Normalizes vertex skin weights and protects against out-of-bound bone indices
 * to prevent mesh distortion and vertex stretching on uploaded characters.
 * Also applies automatic arm clearance so arms never stick to the torso.
 */
export function normalizeMeshSkinningAndArmSpread(
  rawModel: THREE.Group,
  bones: CharacterBones
): void {
  // 1. Sanitize all SkinnedMesh geometries and normalize weights
  rawModel.traverse((obj) => {
    if (!(obj as THREE.SkinnedMesh).isSkinnedMesh) return;
    const sm = obj as THREE.SkinnedMesh;
    const geo = sm.geometry;
    const skeleton = sm.skeleton;
    if (!geo || !skeleton || skeleton.bones.length === 0) return;

    const numBones = skeleton.bones.length;
    const skinIndexAttr = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const skinWeightAttr = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;

    if (skinIndexAttr && skinWeightAttr) {
      let modified = false;
      const vertexCount = skinIndexAttr.count;
      for (let i = 0; i < vertexCount; i++) {
        let w0 = skinWeightAttr.getX(i);
        let w1 = skinWeightAttr.getY(i);
        let w2 = skinWeightAttr.getZ(i);
        let w3 = skinWeightAttr.getW(i);

        let i0 = Math.floor(skinIndexAttr.getX(i));
        let i1 = Math.floor(skinIndexAttr.getY(i));
        let i2 = Math.floor(skinIndexAttr.getZ(i));
        let i3 = Math.floor(skinIndexAttr.getW(i));

        // Clamp invalid indices
        if (i0 < 0 || i0 >= numBones) { i0 = 0; w0 = 0; modified = true; }
        if (i1 < 0 || i1 >= numBones) { i1 = 0; w1 = 0; modified = true; }
        if (i2 < 0 || i2 >= numBones) { i2 = 0; w2 = 0; modified = true; }
        if (i3 < 0 || i3 >= numBones) { i3 = 0; w3 = 0; modified = true; }

        const sum = w0 + w1 + w2 + w3;
        if (sum > 0.0001) {
          const invSum = 1.0 / sum;
          skinWeightAttr.setXYZW(i, w0 * invSum, w1 * invSum, w2 * invSum, w3 * invSum);
        } else {
          // If unweighted vertex, bind securely to root bone
          skinWeightAttr.setXYZW(i, 1, 0, 0, 0);
          skinIndexAttr.setXYZW(i, 0, 0, 0, 0);
          modified = true;
        }

        if (modified) {
          skinIndexAttr.setXYZW(i, i0, i1, i2, i3);
        }
      }
      skinWeightAttr.needsUpdate = true;
      if (modified) skinIndexAttr.needsUpdate = true;
    }
  });

  // 2. Automatic arm clearance: ensure upper arms have natural clearance from the torso
  if (bones.leftUpperArm && bones.rightUpperArm && bones.hips) {
    const hipPos = new THREE.Vector3();
    const lArmPos = new THREE.Vector3();
    const rArmPos = new THREE.Vector3();
    bones.hips.getWorldPosition(hipPos);
    bones.leftUpperArm.getWorldPosition(lArmPos);
    bones.rightUpperArm.getWorldPosition(rArmPos);

    const lFore = bones.leftForearm || bones.leftHand;
    const rFore = bones.rightForearm || bones.rightHand;
    if (lFore && rFore) {
      const lForePos = new THREE.Vector3();
      const rForePos = new THREE.Vector3();
      lFore.getWorldPosition(lForePos);
      rFore.getWorldPosition(rForePos);

      const lDistX = Math.abs(lForePos.x - hipPos.x);
      const rDistX = Math.abs(rForePos.x - hipPos.x);
      const shoulderSpan = Math.abs(lArmPos.x - rArmPos.x);

      // If arms are pressed tightly against the torso, rotate outward slightly to give clearance
      if (shoulderSpan > 0.1 && (lDistX < shoulderSpan * 0.32 || rDistX < shoulderSpan * 0.32)) {
        bones.leftUpperArm.rotation.z += 0.24;
        bones.rightUpperArm.rotation.z -= 0.24;
        rawModel.updateMatrixWorld(true);
      }
    }
  }
}

function normalizeRiggedRawModel(rawModel: THREE.Group, targetHeight: number, bones: CharacterBones): void {
  rawModel.updateMatrixWorld(true);
  rawModel.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      (obj as THREE.SkinnedMesh).skeleton?.update();
    }
  });

  normalizeMeshSkinningAndArmSpread(rawModel, bones);


  // Auto-detect character facing direction via Left vs Right limb world positions (+X Left, -X Right when facing +Z)
  const leftRef = bones.leftUpperArm || bones.leftThigh || bones.leftFoot;
  const rightRef = bones.rightUpperArm || bones.rightThigh || bones.rightFoot;
  if (leftRef && rightRef) {
    const lp = new THREE.Vector3();
    const rp = new THREE.Vector3();
    leftRef.getWorldPosition(lp);
    rightRef.getWorldPosition(rp);
    const dx = lp.x - rp.x;
    const dz = lp.z - rp.z;
    if (Math.hypot(dx, dz) > 0.01) {
      const yawCorrection = Math.atan2(dz, dx);
      if (Math.abs(yawCorrection) > 0.35) {
        const snappedYaw = Math.round(yawCorrection / (Math.PI / 2)) * (Math.PI / 2);
        rawModel.rotation.y += snappedYaw;
        rawModel.updateMatrixWorld(true);
      }
    }
  }

  const box = computeObjectOrBoneBounds(rawModel);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const heightMeasure = size.y > 0.001 && Number.isFinite(size.y) ? size.y : Math.max(size.x, size.z, 1);
  let rawScale = targetHeight / heightMeasure;

  // Normalize by anatomical Head-to-Ground span when a valid humanoid Head bone exists,
  // so tall spiky hair or back weapons (e.g. Tobi's Gunbai) never shrink/inflate character size.
  if (bones.head && size.y > 0.001 && Number.isFinite(size.y)) {
    const headPos = new THREE.Vector3();
    bones.head.getWorldPosition(headPos);
    const anatSpan = headPos.y - box.min.y;
    if (Number.isFinite(anatSpan) && anatSpan > size.y * 0.48 && anatSpan < size.y * 0.96) {
      const targetHeadHeight = targetHeight * 0.825;
      const anatScale = targetHeadHeight / anatSpan;
      if (anatScale > rawScale * 0.75 && anatScale < rawScale * 1.35) {
        rawScale = anatScale;
      }
    }
  }

  const scaleFactor = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  rawModel.scale.multiplyScalar(scaleFactor);
  rawModel.updateMatrixWorld(true);

  const scaledBox = computeObjectOrBoneBounds(rawModel);
  if (scaledBox.isEmpty()) return;
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  rawModel.position.x -= scaledCenter.x;
  rawModel.position.z -= scaledCenter.z;
  rawModel.position.y -= scaledBox.min.y;
  rawModel.updateMatrixWorld(true);
}

class KHRMaterialsPbrSpecularGlossinessPlugin {
  public readonly name = 'KHR_materials_pbrSpecularGlossiness';
  private readonly parser: {
    json: { materials?: Array<{ extensions?: Record<string, unknown> }> };
    assignTexture: (
      params: Record<string, unknown>,
      mapName: string,
      mapDef: unknown,
      colorSpace?: THREE.ColorSpace
    ) => Promise<void>;
  };

  constructor(parser: unknown) {
    this.parser = parser as KHRMaterialsPbrSpecularGlossinessPlugin['parser'];
  }

  public getMaterialType(materialIndex: number): typeof THREE.MeshStandardMaterial | null {
    const materialDef = this.parser.json.materials?.[materialIndex];
    if (!materialDef?.extensions?.[this.name]) return null;
    return THREE.MeshStandardMaterial;
  }

  public extendMaterialParams(
    materialIndex: number,
    materialParams: Record<string, unknown>
  ): Promise<void> {
    const materialDef = this.parser.json.materials?.[materialIndex];
    const ext = materialDef?.extensions?.[this.name] as
      | {
          diffuseFactor?: number[];
          diffuseTexture?: unknown;
          glossinessFactor?: number;
        }
      | undefined;
    if (!ext) return Promise.resolve();

    const color = new THREE.Color(1, 1, 1);
    let opacity = 1.0;
    if (Array.isArray(ext.diffuseFactor)) {
      color.setRGB(
        ext.diffuseFactor[0] ?? 1,
        ext.diffuseFactor[1] ?? 1,
        ext.diffuseFactor[2] ?? 1,
        THREE.LinearSRGBColorSpace
      );
      opacity = ext.diffuseFactor[3] ?? 1.0;
    }
    materialParams.color = color;
    materialParams.opacity = opacity;
    materialParams.metalness = 0.0;
    const glossiness = ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1.0;
    materialParams.roughness = THREE.MathUtils.clamp(1.0 - glossiness, 0.08, 0.96);

    const pending: Array<Promise<void>> = [];
    if (ext.diffuseTexture !== undefined) {
      pending.push(
        this.parser.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace)
      );
    }
    return Promise.all(pending).then(() => undefined);
  }
}

function createConfiguredGltfLoader(manager: THREE.LoadingManager): {
  gltfLoader: GLTFLoader;
  draco: DRACOLoader;
} {
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setCrossOrigin('anonymous');
  gltfLoader.register((parser) => new KHRMaterialsPbrSpecularGlossinessPlugin(parser));
  registerResilientGltfTextureFallback(gltfLoader);
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  gltfLoader.setDRACOLoader(draco);
  return { gltfLoader, draco };
}

const rawModelBufferCache = new Map<string, Promise<ArrayBuffer>>();

function fetchCachedModelBuffer(url: string): Promise<ArrayBuffer> {
  const existing = rawModelBufferCache.get(url);
  if (existing) return existing;

  const isRemote = /^https?:\/\//i.test(url);
  const pending = fetch(url, isRemote ? { mode: 'cors', credentials: 'omit' } : undefined)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const buf = await response.arrayBuffer();
      if (buf.byteLength < 12) {
        throw new Error('EMPTY_GLB_FILE');
      }
      return buf;
    })
    .catch((err) => {
      rawModelBufferCache.delete(url);
      throw err;
    });

  rawModelBufferCache.set(url, pending);
  return pending;
}

const DEIDARA_FALLBACK_GLB_URL = 'https://files.catbox.moe/3l3n26.glb';

export async function parseRawModelSource(
  source: string | Blob,
  fileNameHint?: string
): Promise<{
  rawModel: THREE.Group;
  loadedAnimations: THREE.AnimationClip[];
  createdBlobUrls: string[];
}> {
  const manager = new THREE.LoadingManager();
  manager.onError = () => {
    // Missing relative textures are cleanly replaced by ResilientTextureLoader
  };

  let rawBuffer: ArrayBuffer;
  let basePath = '';
  let nameHint =
    fileNameHint || (typeof source === 'string' ? source : source instanceof File ? source.name : 'model.glb');

  if (typeof source === 'string') {
    try {
      rawBuffer = await fetchCachedModelBuffer(source);
    } catch (err) {
      if (isDeidaraName(undefined, source) && source !== DEIDARA_FALLBACK_GLB_URL) {
        console.warn(
          `[Deidara Loader] Primary URL (${source}) failed or empty (${err instanceof Error ? err.message : String(err)}); falling back to ${DEIDARA_FALLBACK_GLB_URL}`
        );
        rawBuffer = await fetchCachedModelBuffer(DEIDARA_FALLBACK_GLB_URL);
        nameHint = DEIDARA_FALLBACK_GLB_URL;
      } else {
        throw err;
      }
    }
    const slashIdx = source.lastIndexOf('/');
    basePath = slashIdx >= 0 ? source.slice(0, slashIdx + 1) : '';
  } else {
    rawBuffer = await source.arrayBuffer();
  }

  if (rawBuffer.byteLength < 12) {
    throw new Error('EMPTY_GLB_FILE');
  }

  const zipFileMap = new Map<string, string>();
  const zipTextureMap = new Map<string, string>();
  const zipTextureNoExtMap = new Map<string, string>();
  const createdBlobUrls: string[] = [];
  let modelBuffer = rawBuffer;
  let mtlText: string | null = null;

  if (detectModelFormat(rawBuffer, nameHint) === 'zip') {
    const zip = await JSZip.loadAsync(rawBuffer);
    const entries = Object.values(zip.files).filter(
      (entry) => !entry.dir && !entry.name.startsWith('__MACOSX/')
    );

    const modelEntry =
      entries.find((e) => /\.glb$/i.test(e.name)) ||
      entries.find((e) => /\.vrm$/i.test(e.name)) ||
      entries.find((e) => /\.gltf$/i.test(e.name)) ||
      entries.find((e) => /\.fbx$/i.test(e.name)) ||
      entries.find((e) => /\.obj$/i.test(e.name)) ||
      entries.find((e) => /\.dae$/i.test(e.name)) ||
      entries.find((e) => /\.stl$/i.test(e.name)) ||
      entries.find((e) => /\.ply$/i.test(e.name));

    if (!modelEntry) {
      throw new Error('NO_MODEL_IN_ZIP');
    }

    nameHint = modelEntry.name;
    modelBuffer = await modelEntry.async('arraybuffer');
    basePath = '';

    const mtlEntry = entries.find((e) => /\.mtl$/i.test(e.name));
    if (mtlEntry) {
      mtlText = await mtlEntry.async('string');
    }

    for (const entry of entries) {
      if (entry === modelEntry) continue;
      const isTga = /\.tga$/i.test(entry.name);
      const isStdImage = /\.(png|jpe?g|webp|bmp|gif)$/i.test(entry.name);
      const isSupportAsset = /\.(bin|mtl)$/i.test(entry.name);
      if (!isTga && !isStdImage && !isSupportAsset) continue;

      let assetBlob: Blob | null = null;
      if (isTga) {
        const tgaBuf = await entry.async('arraybuffer');
        assetBlob = await decodeTgaBufferToPngBlob(tgaBuf);
      } else {
        assetBlob = await entry.async('blob');
      }
      if (!assetBlob) continue;

      const blobUrl = URL.createObjectURL(assetBlob);
      createdBlobUrls.push(blobUrl);

      const fullLower = normalizeAssetPath(entry.name);
      const baseLower = extractTextureBasename(entry.name).toLowerCase();
      zipFileMap.set(fullLower, blobUrl);
      if (!zipFileMap.has(baseLower)) {
        zipFileMap.set(baseLower, blobUrl);
      }

      if (isTga || isStdImage) {
        zipTextureMap.set(fullLower, blobUrl);
        if (!zipTextureMap.has(baseLower)) {
          zipTextureMap.set(baseLower, blobUrl);
        }
        const noExt = stripFileExtension(baseLower);
        if (!zipTextureNoExtMap.has(noExt)) {
          zipTextureNoExtMap.set(noExt, blobUrl);
        }
      }
    }
  }

  if (zipFileMap.size > 0) {
    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        return url;
      }
      const cleanFull = normalizeAssetPath(url);
      const baseLower = extractTextureBasename(url).toLowerCase();
      const noExt = stripFileExtension(baseLower);
      return (
        zipFileMap.get(cleanFull) ||
        zipFileMap.get(baseLower) ||
        zipTextureNoExtMap.get(noExt) ||
        url
      );
    });
  }

  const isSingleCatboxOrStandaloneFile =
    zipTextureMap.size === 0 &&
    (typeof source !== 'string' ||
      /^https?:\/\/files\.catbox\.moe\//i.test(source) ||
      source.startsWith('blob:'));

  const hasLocalAssetBase =
    zipTextureMap.size === 0 &&
    typeof source === 'string' &&
    basePath.length > 0 &&
    !isSingleCatboxOrStandaloneFile;

  const resilientTextures = new ResilientTextureLoader(manager, {
    skipExternalRelative: isSingleCatboxOrStandaloneFile,
    zipTextureMap,
    zipTextureNoExtMap,
    hasLocalAssetBase,
    createdBlobUrls,
  });
  resilientTextures.setCrossOrigin('anonymous');
  manager.addHandler(/\.(png|jpe?g|webp|tga|bmp|gif|psd|tiff?|dds)(\?.*)?$/i, resilientTextures);

  const { gltfLoader, draco } = createConfiguredGltfLoader(manager);

  let rawModel: THREE.Group;
  let loadedAnimations: THREE.AnimationClip[] = [];
  const detectedFormat = detectModelFormat(modelBuffer, nameHint);

  try {
    if (detectedFormat === 'fbx') {
      const fbxLoader = new FBXLoader(manager);
      const fbxGroup = fbxLoader.parse(modelBuffer, basePath);
      rawModel = fbxGroup;
      loadedAnimations = fbxGroup.animations || [];
    } else if (detectedFormat === 'obj') {
      const objText = new TextDecoder('utf-8', { fatal: false }).decode(modelBuffer);
      const objLoader = new OBJLoader(manager);
      if (mtlText) {
        const mtlLoader = new MTLLoader(manager);
        const materials = mtlLoader.parse(mtlText, basePath);
        materials.preload();
        objLoader.setMaterials(materials);
      }
      rawModel = objLoader.parse(objText);
    } else if (detectedFormat === 'dae') {
      const daeText = new TextDecoder('utf-8', { fatal: false }).decode(modelBuffer);
      const colladaLoader = new ColladaLoader(manager);
      const collada = colladaLoader.parse(daeText, basePath);
      if (!collada || !collada.scene) {
        throw new Error('Failed to parse Collada (.dae) model scene.');
      }
      rawModel = new THREE.Group();
      rawModel.add(collada.scene);
      const maybeAnims = (collada as unknown as { animations?: THREE.AnimationClip[] }).animations;
      if (Array.isArray(maybeAnims)) {
        loadedAnimations = maybeAnims;
      }
    } else if (detectedFormat === 'stl') {
      const stlLoader = new STLLoader(manager);
      const stlGeo = stlLoader.parse(modelBuffer);
      rawModel = wrapGeometryAsGroup(stlGeo);
    } else if (detectedFormat === 'ply') {
      const plyLoader = new PLYLoader(manager);
      const plyGeo = plyLoader.parse(modelBuffer);
      rawModel = wrapGeometryAsGroup(plyGeo);
    } else {
      const safeBuffer = detectedFormat === 'glb' ? sanitizeGlbBuffer(modelBuffer) : modelBuffer;
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        gltfLoader.parse(safeBuffer, basePath, resolve, reject);
      });
      rawModel = gltf.scene;
      loadedAnimations = gltf.animations || [];
    }
  } finally {
    draco.dispose();
  }

  await resilientTextures.waitForAll(3000);
  sanitizeMissingTextures(rawModel);
  if (zipTextureMap.size > 0) {
    bindUnmatchedZipTexturesFallback(rawModel, zipTextureMap);
  }
  return { rawModel, loadedAnimations, createdBlobUrls };
}

function disposeMeshResources(rootObj: THREE.Object3D): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTexs = new Set<THREE.Texture>();
  const disposedSkeletons = new Set<THREE.Skeleton>();

  const disposeTex = (t: THREE.Texture | null | undefined) => {
    if (!t || disposedTexs.has(t)) return;
    disposedTexs.add(t);
    t.dispose();
  };

  const disposeMat = (m: THREE.Material | null | undefined) => {
    if (!m || m.userData?.__sharedAnimeOutline || disposedMats.has(m)) return;
    disposedMats.add(m);
    const std = m as THREE.MeshStandardMaterial & {
      bumpMap?: THREE.Texture | null;
      displacementMap?: THREE.Texture | null;
      lightMap?: THREE.Texture | null;
      specularMap?: THREE.Texture | null;
    };
    disposeTex(std.map);
    disposeTex(std.normalMap);
    disposeTex(std.emissiveMap);
    disposeTex(std.roughnessMap);
    disposeTex(std.metalnessMap);
    disposeTex(std.aoMap);
    disposeTex(std.alphaMap);
    disposeTex(std.bumpMap);
    disposeTex(std.displacementMap);
    disposeTex(std.lightMap);
    disposeTex(std.specularMap);
    m.dispose();
  };

  rootObj.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton && !disposedSkeletons.has(skinned.skeleton)) {
      disposedSkeletons.add(skinned.skeleton);
      skinned.skeleton.dispose();
    }
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
        disposedGeos.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(disposeMat);
      } else {
        disposeMat(mesh.material);
      }
    }
  });
}

/**
 * Loads a clean, un-animated 3D rigged template suitable for cloning via SkeletonUtils.clone
 * across multiple enemies without mutating shared animations or geometries.
 */
export async function loadCharacterTemplate(
  source: string | Blob,
  fileNameHint?: string,
  labelAr?: string
): Promise<LoadedCharacterTemplate> {
  const effectiveTemplateHint =
    fileNameHint || (typeof source === 'string' ? source : source instanceof File ? source.name : undefined);
  if (source === 'procedural://naruto_sage' || isNarutoSageName(labelAr, effectiveTemplateHint)) {
    return createNarutoSageTemplate();
  }

  const { rawModel, loadedAnimations, createdBlobUrls } = await parseRawModelSource(
    source,
    fileNameHint
  );

  const isDeidaraTpl = isDeidaraName(labelAr, effectiveTemplateHint);
  const isSixPathsMadaraTpl = isSixPathsMadaraName(labelAr, effectiveTemplateHint);
  const isCustomGenericTpl =
    !isOriginalObitoName(labelAr, effectiveTemplateHint) &&
    !isDeidaraTpl &&
    !isSixPathsMadaraTpl &&
    !isMaskManV2Name(labelAr, effectiveTemplateHint) &&
    !isItachiName(labelAr, effectiveTemplateHint) &&
    !isNarutoKuramaName(labelAr, effectiveTemplateHint) &&
    !isNarutoSageName(labelAr, effectiveTemplateHint);
  if (isOriginalObitoName(labelAr, effectiveTemplateHint)) {
    await applyOriginalObitoTextures(rawModel);
  } else if (isDeidaraTpl) {
    await applyDeidaraTextures(rawModel);
  }
  if (isSixPathsMadaraTpl) {
    applySixPathsMadaraColors(rawModel);
  } else {
    sanitizeZeroVertexColors(
      rawModel,
      isNarutoKuramaName(labelAr, effectiveTemplateHint) || isDeidaraTpl,
      isCustomGenericTpl
    );
    sanitizeAndNormalizeCustomMaterials(rawModel, isCustomGenericTpl);
  }

  const targetHeight = 2.0;
  let hasSkeleton = false;
  rawModel.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      hasSkeleton = true;
    }
  });

  let templateRoot: THREE.Group;
  let runClip: THREE.AnimationClip | null = null;
  let idleClip: THREE.AnimationClip | null = null;
  let attackClip: THREE.AnimationClip | null = null;

  const isMaskManV2Tpl = isMaskManV2Name(labelAr, effectiveTemplateHint);
  const templateDoubleSided =
    isMaskManV2Tpl ||
    isItachiName(labelAr, effectiveTemplateHint) ||
    isDeidaraTpl ||
    isNarutoKuramaName(labelAr, effectiveTemplateHint) ||
    isCustomGenericTpl;
  const templateEnhancedRole = isSixPathsMadaraTpl
    ? null
    : resolveEnhancedCharacterRole(labelAr, effectiveTemplateHint);

  if (hasSkeleton) {
    const bones = mapBonesOnObject(rawModel);
    normalizeRiggedRawModel(rawModel, targetHeight, bones);
    let meshCount = 0;
    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++;
    });
    if (meshCount === 0 && isDeidaraTpl) {
      buildDeidaraFallbackSkinnedMeshes(rawModel, bones);
    }
    applyDoubleSidedRobeMaterials(rawModel, templateDoubleSided);
    if (!isNarutoKuramaName(labelAr, effectiveTemplateHint)) {
      applyInnerLegShrink(bones);
    }
    if (isMaskManV2Tpl) {
      upgradeTobiV2Materials(rawModel);
    }
    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (!templateEnhancedRole) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m && 'envMapIntensity' in m) {
              (m as THREE.MeshStandardMaterial).envMapIntensity = Math.max(
                (m as THREE.MeshStandardMaterial).envMapIntensity || 0,
                0.78
              );
            }
          });
        }
      }
    });
    if (templateEnhancedRole) {
      applyCinematicCharacterVisuals(rawModel, labelAr, effectiveTemplateHint);
    }
    applyAnimeCelShadingToModel(rawModel);
    applyCharacterTextureAnisotropy(rawModel);
    templateRoot = rawModel;
    const clips = selectAnimationClips(loadedAnimations);
    runClip = clips.runClip;
    idleClip = clips.idleClip;
    attackClip = clips.attackClip;
  } else {
    const skinnedContainer = new THREE.Group();
    const rigged = buildProceduralSkinnedCharacter(rawModel, skinnedContainer, targetHeight, false);
    applyDoubleSidedRobeMaterials(skinnedContainer, templateDoubleSided);
    applyInnerLegShrink(rigged.bones);
    if (isMaskManV2Tpl) {
      upgradeTobiV2Materials(skinnedContainer);
    }
    if (templateEnhancedRole) {
      applyCinematicCharacterVisuals(skinnedContainer, labelAr, effectiveTemplateHint);
    }
    applyAnimeCelShadingToModel(skinnedContainer);
    applyCharacterTextureAnisotropy(skinnedContainer);
    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry?.dispose();
      }
    });
    templateRoot = skinnedContainer;
  }

  const combatClip = attackClip || runClip || idleClip || loadedAnimations[0] || null;

  return {
    templateRoot,
    hasEmbeddedSkeleton: hasSkeleton,
    runClip,
    idleClip,
    attackClip,
    combatClip,
    dispose: () => {
      createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
      disposeMeshResources(templateRoot);
    },
  };
}

export interface ExtractedFbxIdleResult {
  clip: THREE.AnimationClip;
  matchedBoneCount: number;
  templateForRetarget: LoadedCharacterTemplate | null;
}

/**
 * Loads an external `.fbx` or `.glb`/`.gltf` animation asset strictly to extract
 * its animation clip without adding its mesh or skin to the scene.
 */
export async function loadFbxIdleAnimationClipOnly(
  url: string,
  targetRoot?: THREE.Object3D,
  alwaysReturnRetargetTemplate = false
): Promise<ExtractedFbxIdleResult | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const rawBuffer = await response.arrayBuffer();
  if (rawBuffer.byteLength < 64) {
    // Empty/0-byte upload on CDN — safely fall back without crashing
    return null;
  }

  const manager = new THREE.LoadingManager();
  manager.onError = () => {};
  const resilientTextures = new ResilientTextureLoader(manager, {
    skipExternalRelative: true,
    zipTextureMap: new Map(),
    zipTextureNoExtMap: new Map(),
    hasLocalAssetBase: false,
    createdBlobUrls: [],
  });
  manager.addHandler(/\.(png|jpe?g|webp|tga|bmp|gif)(\?.*)?$/i, resilientTextures);

  let parsedGroup: THREE.Group;
  let rawAnimations: THREE.AnimationClip[] = [];

  if (isFbxPayload(rawBuffer, url)) {
    const fbxLoader = new FBXLoader(manager);
    const fbxGroup = fbxLoader.parse(rawBuffer, '');
    parsedGroup = fbxGroup;
    rawAnimations = fbxGroup.animations || [];
  } else {
  const { gltfLoader, draco } = createConfiguredGltfLoader(manager);
    try {
      const safeBuffer = sanitizeGlbBuffer(rawBuffer);
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        gltfLoader.parse(safeBuffer, '', resolve, reject);
      });
      parsedGroup = gltf.scene;
      rawAnimations = gltf.animations || [];
    } finally {
      draco.dispose();
    }
  }

  const clips = rawAnimations.filter(
    (c) => c.tracks && c.tracks.length > 0 && c.duration > 0.05
  );
  if (clips.length === 0) {
    disposeMeshResources(parsedGroup);
    return null;
  }

  const chosenRaw =
    findClip(clips, [/idle/i, /stand/i, /breath/i, /wait/i, /mixamo/i]) || clips[0];
  const clip = chosenRaw.clone();
  clip.name = 'run_idle_custom';

  const targetNodeNames = new Set<string>();
  if (targetRoot) {
    targetRoot.traverse((obj) => {
      if (obj.name) targetNodeNames.add(obj.name);
    });
  }

  let matchedBoneCount = 0;
  const matchedBones = new Set<string>();
  const cleanedTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    let nodeName = track.name.slice(0, dotIdx);
    const propPath = track.name.slice(dotIdx);

    // Drop scale tracks; keep only root/hip position tracks so floor grounding stays exact
    if (propPath === '.scale') continue;
    if (propPath === '.position' && !/(?:hips|pelvis|characterroot)/i.test(nodeName)) continue;

    if (targetNodeNames.size > 0 && !targetNodeNames.has(nodeName)) {
      const stripped = nodeName.replace(/^mixamorig:?/i, '');
      if (targetNodeNames.has(stripped)) {
        nodeName = stripped;
      } else if (targetNodeNames.has(`mixamorig${stripped}`)) {
        nodeName = `mixamorig${stripped}`;
      }
    }

    if (targetNodeNames.has(nodeName)) {
      matchedBones.add(nodeName);
    }

    const clonedTrack = track.clone();
    clonedTrack.name = `${nodeName}${propPath}`;
    cleanedTracks.push(clonedTrack);
  }
  matchedBoneCount = matchedBones.size;
  if (cleanedTracks.length > 0) {
    clip.tracks = cleanedTracks;
  }

  let templateForRetarget: LoadedCharacterTemplate | null = null;
  if (matchedBoneCount < 6 || alwaysReturnRetargetTemplate) {
    const srcBones = mapBonesOnObject(parsedGroup);
    normalizeRiggedRawModel(parsedGroup, 2.0, srcBones);
    const retargetClip = chosenRaw.clone();
    templateForRetarget = {
      templateRoot: parsedGroup,
      hasEmbeddedSkeleton: true,
      runClip: null,
      idleClip: retargetClip,
      attackClip: null,
      combatClip: retargetClip,
      dispose: () => {
        disposeMeshResources(parsedGroup);
      },
    };
  } else {
    disposeMeshResources(parsedGroup);
  }

  return {
    clip,
    matchedBoneCount,
    templateForRetarget,
  };
}

/**
 * Loads an external death animation asset (e.g. `.fbx` / `.glb`) and returns
 * a normalized retargeting template without spawning any mesh into the scene.
 */
export async function loadExternalDeathAnimationTemplate(
  url: string
): Promise<LoadedCharacterTemplate | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const rawBuffer = await response.arrayBuffer();
  if (rawBuffer.byteLength < 64) return null;

  const manager = new THREE.LoadingManager();
  manager.onError = () => {};
  const resilientTextures = new ResilientTextureLoader(manager, {
    skipExternalRelative: true,
    zipTextureMap: new Map(),
    zipTextureNoExtMap: new Map(),
    hasLocalAssetBase: false,
    createdBlobUrls: [],
  });
  manager.addHandler(/\.(png|jpe?g|webp|tga|bmp|gif)(\?.*)?$/i, resilientTextures);

  let parsedGroup: THREE.Group;
  let rawAnimations: THREE.AnimationClip[] = [];

  if (isFbxPayload(rawBuffer, url)) {
    const fbxLoader = new FBXLoader(manager);
    const fbxGroup = fbxLoader.parse(rawBuffer, '');
    parsedGroup = fbxGroup;
    rawAnimations = fbxGroup.animations || [];
  } else {
    const { gltfLoader, draco } = createConfiguredGltfLoader(manager);
    try {
      const safeBuffer = sanitizeGlbBuffer(rawBuffer);
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        gltfLoader.parse(safeBuffer, '', resolve, reject);
      });
      parsedGroup = gltf.scene;
      rawAnimations = gltf.animations || [];
    } finally {
      draco.dispose();
    }
  }

  const clips = rawAnimations.filter(
    (c) => c.tracks && c.tracks.length > 0 && c.duration > 0.05
  );
  if (clips.length === 0) {
    disposeMeshResources(parsedGroup);
    return null;
  }

  const chosenRaw =
    findClip(clips, [/death/i, /die/i, /dying/i, /fall/i, /mixamo/i]) || clips[0];
  const srcBones = mapBonesOnObject(parsedGroup);
  normalizeRiggedRawModel(parsedGroup, 2.0, srcBones);
  const deathClip = chosenRaw.clone();
  deathClip.name = 'death_custom';

  return {
    templateRoot: parsedGroup,
    hasEmbeddedSkeleton: true,
    runClip: null,
    idleClip: deathClip,
    attackClip: null,
    combatClip: deathClip,
    dispose: () => {
      disposeMeshResources(parsedGroup);
    },
  };
}

function detachAndConfigureMaskManV2Gunbai(rawModel: THREE.Group): {
  gunbaiPivot: THREE.Group;
  gunbaiRestPos: THREE.Vector3;
  gunbaiRestRot: THREE.Euler;
} | null {
  let tobiMesh: THREE.SkinnedMesh | null = null;
  rawModel.traverse((obj) => {
    if (!tobiMesh && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      tobiMesh = obj as THREE.SkinnedMesh;
    }
  });
  if (!tobiMesh) return null;

  const skinned = tobiMesh as THREE.SkinnedMesh;
  const geo = skinned.geometry;
  if (!geo || geo.index !== null || !geo.groups || geo.groups.length === 0) return null;

  const mats = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
  const gunbaiMatIdx = mats.findIndex((m) => m && m.name === 'Material.063');
  if (gunbaiMatIdx < 0) return null;

  const gunbaiGroup = geo.groups.find((g) => g.materialIndex === gunbaiMatIdx);
  if (!gunbaiGroup || gunbaiGroup.count <= 0) return null;

  const skeletonBones = skinned.skeleton?.bones || [];
  const spine1Idx = skeletonBones.findIndex((b) => b && b.name === 'Spine1');
  if (spine1Idx < 0) return null;
  const spine1 = skeletonBones[spine1Idx];

  // Re-bind upper shoulder chain rings (mat ntxr000.028/029) from hair bones to Spine1 so they stay anchored to torso
  const skinIndexAttr = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const skinWeightAttr = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
  if (skinIndexAttr && skinWeightAttr) {
    for (const grp of geo.groups) {
      if (grp.materialIndex === undefined) continue;
      const mName = mats[grp.materialIndex]?.name || '';
      if (/ntxr000\.02[89]/i.test(mName)) {
        for (let v = grp.start; v < grp.start + grp.count; v++) {
          skinIndexAttr.setXYZW(v, spine1Idx, 0, 0, 0);
          skinWeightAttr.setXYZW(v, 1, 0, 0, 0);
        }
      }
    }
    skinIndexAttr.needsUpdate = true;
    skinWeightAttr.needsUpdate = true;
  }

  rawModel.updateMatrixWorld(true);
  const toSpine1 = new THREE.Matrix4()
    .copy(spine1.matrixWorld)
    .invert()
    .multiply(skinned.matrixWorld);
  const normalMat = new THREE.Matrix3().getNormalMatrix(toSpine1);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;

  const gStart = gunbaiGroup.start;
  const gCount = gunbaiGroup.count;

  const localBox = new THREE.Box3();
  const tempPt = new THREE.Vector3();
  for (let i = 0; i < gCount; i++) {
    tempPt.fromBufferAttribute(posAttr, gStart + i).applyMatrix4(toSpine1);
    localBox.expandByPoint(tempPt);
  }
  const boxCenter = new THREE.Vector3();
  localBox.getCenter(boxCenter);

  const gPosArray = new Float32Array(gCount * 3);
  const gNormArray = normAttr ? new Float32Array(gCount * 3) : null;
  const gUvArray = uvAttr ? new Float32Array(gCount * 2) : null;

  for (let i = 0; i < gCount; i++) {
    const srcIdx = gStart + i;
    tempPt.fromBufferAttribute(posAttr, srcIdx).applyMatrix4(toSpine1).sub(boxCenter);
    gPosArray[i * 3] = tempPt.x;
    gPosArray[i * 3 + 1] = tempPt.y;
    gPosArray[i * 3 + 2] = tempPt.z;

    if (normAttr && gNormArray) {
      tempPt.fromBufferAttribute(normAttr, srcIdx).applyMatrix3(normalMat).normalize();
      gNormArray[i * 3] = tempPt.x;
      gNormArray[i * 3 + 1] = tempPt.y;
      gNormArray[i * 3 + 2] = tempPt.z;
    }

    if (uvAttr && gUvArray) {
      gUvArray[i * 2] = uvAttr.getX(srcIdx);
      gUvArray[i * 2 + 1] = uvAttr.getY(srcIdx);
    }
  }

  const gunbaiGeo = new THREE.BufferGeometry();
  gunbaiGeo.setAttribute('position', new THREE.BufferAttribute(gPosArray, 3));
  if (gNormArray) {
    gunbaiGeo.setAttribute('normal', new THREE.BufferAttribute(gNormArray, 3));
  } else {
    gunbaiGeo.computeVertexNormals();
  }
  if (gUvArray) {
    gunbaiGeo.setAttribute('uv', new THREE.BufferAttribute(gUvArray, 2));
  }

  const oldGunbaiMat = mats[gunbaiMatIdx];
  let gunbaiMat: THREE.Material | undefined = oldGunbaiMat;
  if (oldGunbaiMat) {
    const oldPhong = oldGunbaiMat as THREE.MeshPhongMaterial;
    const gunbaiMap = oldPhong.map || null;
    if (gunbaiMap) {
      gunbaiMap.colorSpace = THREE.SRGBColorSpace;
      gunbaiMap.wrapS = THREE.RepeatWrapping;
      gunbaiMap.wrapT = THREE.RepeatWrapping;
      gunbaiMap.needsUpdate = true;
    }
    gunbaiMat = new THREE.MeshStandardMaterial({
      name: oldGunbaiMat.name || 'Material.063',
      map: gunbaiMap,
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.04,
      envMapIntensity: 0.64,
      side: THREE.DoubleSide,
      vertexColors: false,
      transparent: oldGunbaiMat.transparent,
      opacity: oldGunbaiMat.opacity,
      alphaTest: oldGunbaiMat.alphaTest,
    });
    mats[gunbaiMatIdx] = gunbaiMat;
    if (Array.isArray(skinned.material)) {
      skinned.material[gunbaiMatIdx] = gunbaiMat;
    } else {
      skinned.material = gunbaiMat;
    }
    oldGunbaiMat.dispose();
  }

  const gunbaiMesh = new THREE.Mesh(gunbaiGeo, gunbaiMat);
  gunbaiMesh.name = 'GunbaiWarFan';
  gunbaiMesh.castShadow = true;
  gunbaiMesh.receiveShadow = true;
  gunbaiMesh.frustumCulled = false;

  // Spine1 local axes in Tobi.fbx: +X = UP, -Y = BACKWARD (World -Z), -Z = RIGHT, +Z = LEFT
  const gunbaiPivot = new THREE.Group();
  gunbaiPivot.name = 'GunbaiBackPivot';
  gunbaiPivot.position.set(18, -32, 3);
  gunbaiPivot.rotation.set(0, 0.36, -0.05);
  gunbaiPivot.add(gunbaiMesh);
  spine1.add(gunbaiPivot);

  // Rebuild Tobiout BufferGeometry without the detached Gunbai triangles
  const totalVerts = posAttr.count;
  const keepVerts = totalVerts - gCount;
  const trimmedGeo = new THREE.BufferGeometry();

  for (const [attrName, attr] of Object.entries(geo.attributes)) {
    const srcAttr = attr as THREE.BufferAttribute;
    const itemSize = srcAttr.itemSize;
    const SrcTypedArray = srcAttr.array.constructor as new (len: number) => THREE.TypedArray;
    const dst = new SrcTypedArray(keepVerts * itemSize);
    const srcArr = srcAttr.array as ArrayLike<number> & { subarray: (s: number, e: number) => ArrayLike<number> };
    const setTarget = dst as unknown as { set: (src: ArrayLike<number>, offset: number) => void };

    const beforeLen = gStart * itemSize;
    const afterStart = (gStart + gCount) * itemSize;
    if (beforeLen > 0) {
      setTarget.set(srcArr.subarray(0, beforeLen), 0);
    }
    if (afterStart < srcArr.length) {
      setTarget.set(srcArr.subarray(afterStart, srcArr.length), beforeLen);
    }
    trimmedGeo.setAttribute(attrName, new THREE.BufferAttribute(dst, itemSize, srcAttr.normalized));
  }

  for (const grp of geo.groups) {
    if (grp.materialIndex === gunbaiMatIdx) continue;
    const shiftedStart = grp.start > gStart ? grp.start - gCount : grp.start;
    trimmedGeo.addGroup(shiftedStart, grp.count, grp.materialIndex);
  }

  trimmedGeo.computeBoundingBox();
  trimmedGeo.computeBoundingSphere();
  skinned.geometry = trimmedGeo;
  geo.dispose();

  return {
    gunbaiPivot,
    gunbaiRestPos: gunbaiPivot.position.clone(),
    gunbaiRestRot: gunbaiPivot.rotation.clone(),
  };
}

const ROBE_MATERIAL_NAME_REGEX =
  /robe|cloak|coat|cape|skirt|cloth|akatsuki|haori|hakama|mantle|collar|robe_out|inner_cloth|lower/i;

/**
 * Enforces THREE.DoubleSide on robe/cloak materials (and all materials on robed characters
 * such as Tobi V2 and Itachi) so cloth never appears transparent or culled from inside.
 */
function applyDoubleSidedRobeMaterials(rawModel: THREE.Group, forceAllMeshes: boolean): void {
  rawModel.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const meshMatchesRobe = ROBE_MATERIAL_NAME_REGEX.test(mesh.name || '');
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      if (forceAllMeshes || meshMatchesRobe || ROBE_MATERIAL_NAME_REGEX.test(m.name || '')) {
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    }
  });
}

function upgradeTobiV2Materials(rawModel: THREE.Group): void {
  const convertedMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  rawModel.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry;
    if (geo?.attributes?.color) {
      geo.deleteAttribute('color');
    }

    const convertMat = (mat: THREE.Material): THREE.Material => {
      if (!mat) return mat;
      const cached = convertedMap.get(mat);
      if (cached) return cached;

      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = mat as THREE.MeshStandardMaterial;
        std.color.setHex(0xffffff);
        std.vertexColors = false;
        std.envMapIntensity = 0.64;
        if (std.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          std.map.wrapS = THREE.RepeatWrapping;
          std.map.wrapT = THREE.RepeatWrapping;
          std.map.needsUpdate = true;
        }
        std.needsUpdate = true;
        return std;
      }

      const phong = mat as THREE.MeshPhongMaterial;
      const map = phong.map || null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.needsUpdate = true;
      }
      const nextStd = new THREE.MeshStandardMaterial({
        name: mat.name,
        map,
        color: 0xffffff,
        roughness: mat.name === 'Material.063' ? 0.7 : 0.78,
        metalness: 0.04,
        envMapIntensity: 0.64,
        side: mat.side,
        vertexColors: false,
        transparent: mat.transparent,
        opacity: mat.opacity,
        alphaTest: mat.alphaTest,
      });
      convertedMap.set(mat, nextStd);
      mat.dispose();
      return nextStd;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(convertMat);
    } else if (mesh.material) {
      mesh.material = convertMat(mesh.material);
    }
  });
}

/**
 * Slightly slims thigh/upper-leg width & depth (0.85, 1, 0.85) so upper legs & hidden
 * inner trousers stay cleanly inside outer robes/cloaks during high-knee runs and kicks.
 */
function applyInnerLegShrink(bones: CharacterBones): void {
  const applyScale = (thigh: THREE.Bone | null) => {
    if (!thigh) return;
    thigh.scale.set(0.85, 1, 0.85);
    thigh.updateMatrix();
  };
  applyScale(bones.leftThigh);
  applyScale(bones.rightThigh);
}

export async function loadObitoGltfModel(
  source: string | Blob,
  fileNameHint?: string,
  options?: LoadObitoModelOptions
): Promise<CustomGltfCharacter> {
  const applyWarObito =
    options?.warObitoPalette ??
    shouldApplyWarObitoPalette(options?.labelAr, fileNameHint, options?.colorPreset);

  const effectiveHint =
    fileNameHint || (typeof source === 'string' ? source : source instanceof File ? source.name : undefined);
  if (
    !applyWarObito &&
    (source === 'procedural://naruto_sage' || isNarutoSageName(options?.labelAr, effectiveHint))
  ) {
    return createNarutoSageCharacter();
  }

  const applyOriginalObito = !applyWarObito && isOriginalObitoName(options?.labelAr, effectiveHint);
  const applySixPathsMadara =
    !applyWarObito && isSixPathsMadaraName(options?.labelAr, effectiveHint);
  const applyTobiV2 = isMaskManV2Name(options?.labelAr, effectiveHint);
  const applyItachi = isItachiName(options?.labelAr, effectiveHint);
  const applyDeidara = isDeidaraName(options?.labelAr, effectiveHint);
  const applyKurama = isNarutoKuramaName(options?.labelAr, effectiveHint);

  const { rawModel, loadedAnimations, createdBlobUrls } = await parseRawModelSource(
    source,
    fileNameHint
  );

  if (applyDeidara) {
    console.log(
      '[Deidara Animations]',
      loadedAnimations.map((c) => c.name)
    );
    await applyDeidaraTextures(rawModel);
  }

  if (applyOriginalObito) {
    await applyOriginalObitoTextures(rawModel);
  }
  const isCustomGenericChar =
    !applyWarObito &&
    !applyOriginalObito &&
    !applySixPathsMadara &&
    !applyTobiV2 &&
    !applyItachi &&
    !applyDeidara &&
    !applyKurama &&
    !resolveEnhancedCharacterRole(options?.labelAr, effectiveHint);

  if (applySixPathsMadara) {
    applySixPathsMadaraColors(rawModel);
  } else if (!applyWarObito) {
    sanitizeZeroVertexColors(rawModel, applyKurama || applyDeidara, isCustomGenericChar);
    sanitizeAndNormalizeCustomMaterials(rawModel, isCustomGenericChar);
  }

  const root = new THREE.Group();
  const pivotGroup = new THREE.Group();
  root.add(pivotGroup);

  const targetHeight = 2.0;
  let hasSkeleton = false;
  rawModel.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      hasSkeleton = true;
    }
  });

  let bones: CharacterBones;
  let mixer: THREE.AnimationMixer | null = null;
  let idleAction: THREE.AnimationAction | null = null;
  let runAction: THREE.AnimationAction | null = null;
  let attackAction: THREE.AnimationAction | null = null;
  let autoSkinnedMeshes: THREE.SkinnedMesh[] = [];
  let gunbaiPivot: THREE.Group | null = null;
  let gunbaiRestPos: THREE.Vector3 | null = null;
  let gunbaiRestRot: THREE.Euler | null = null;

  if (hasSkeleton) {
    const detachedGunbai = detachAndConfigureMaskManV2Gunbai(rawModel);
    if (detachedGunbai) {
      gunbaiPivot = detachedGunbai.gunbaiPivot;
      gunbaiRestPos = detachedGunbai.gunbaiRestPos;
      gunbaiRestRot = detachedGunbai.gunbaiRestRot;
    }
    bones = mapBonesOnObject(rawModel);
    normalizeRiggedRawModel(rawModel, targetHeight, bones);
    let meshCount = 0;
    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++;
    });
    if (meshCount === 0 && applyDeidara) {
      buildDeidaraFallbackSkinnedMeshes(rawModel, bones);
    }
    applyDoubleSidedRobeMaterials(
      rawModel,
      applyTobiV2 || applyItachi || applyDeidara || applyKurama || isCustomGenericChar
    );
    if (!applyKurama) {
      applyInnerLegShrink(bones);
    }

    if (applyTobiV2) {
      upgradeTobiV2Materials(rawModel);
    }

    if (applyWarObito) {
      applyWarObitoColorPalette(rawModel, bones);
    }

    const enhancedRole = applySixPathsMadara
      ? null
      : resolveEnhancedCharacterRole(options?.labelAr, effectiveHint);
    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (!applyWarObito && !applyOriginalObito && !applySixPathsMadara && !enhancedRole) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            if (m && 'envMapIntensity' in m) {
              (m as THREE.MeshStandardMaterial).envMapIntensity = Math.max(
                (m as THREE.MeshStandardMaterial).envMapIntensity || 0,
                0.78
              );
            }
          });
        }
      }
    });
    if (enhancedRole && !applyWarObito && !applyOriginalObito && !applySixPathsMadara) {
      applyCinematicCharacterVisuals(rawModel, options?.labelAr, effectiveHint);
    }

    if (isCustomizableObitoName(options?.labelAr, effectiveHint)) {
      await applyCustomObitoEyesToModel(rawModel, bones.head, rawModel);
    }

    applyAnimeCelShadingToModel(rawModel);
    applyCharacterTextureAnisotropy(rawModel);
    pivotGroup.add(rawModel);

    if (loadedAnimations.length > 0) {
      mixer = new THREE.AnimationMixer(rawModel);
      const { runClip, idleClip, attackClip } = selectAnimationClips(loadedAnimations);

      if (idleClip) {
        idleAction = mixer.clipAction(idleClip);
        idleAction.play();
      }
      if (runClip) {
        runAction = mixer.clipAction(runClip);
        runAction.play();
        runAction.setEffectiveWeight(0);
      }
      if (attackClip) {
        attackAction = mixer.clipAction(attackClip);
        attackAction.setLoop(THREE.LoopOnce, 1);
        attackAction.clampWhenFinished = false;
      }
    }
  } else {
    // Static GLB/OBJ/DAE/STL/PLY: auto-rig into a real SkinnedMesh + 14-Bone Skeleton
    const rigged = buildProceduralSkinnedCharacter(rawModel, pivotGroup, targetHeight, applyWarObito);
    bones = rigged.bones;
    autoSkinnedMeshes = rigged.skinnedMeshes;
    applyDoubleSidedRobeMaterials(pivotGroup, applyTobiV2 || applyItachi || applyDeidara || applyKurama);
    applyInnerLegShrink(bones);
    if (applyTobiV2) {
      upgradeTobiV2Materials(pivotGroup);
    }
    if (!applyWarObito && !applyOriginalObito && !applySixPathsMadara) {
      applyCinematicCharacterVisuals(pivotGroup, options?.labelAr, effectiveHint);
    }
    if (isCustomizableObitoName(options?.labelAr, effectiveHint)) {
      await applyCustomObitoEyesToModel(pivotGroup, bones.head, pivotGroup);
    }

    applyAnimeCelShadingToModel(pivotGroup);
    applyCharacterTextureAnisotropy(pivotGroup);

    rawModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry?.dispose();
      }
    });
  }

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

  return {
    root,
    pivotGroup,
    mixerRoot: hasSkeleton ? rawModel : pivotGroup,
    hasSkeleton: true,
    mixer,
    idleAction,
    runAction,
    attackAction,
    bones,
    baseBoneRotations,
    baseBonePositions,
    gunbaiPivot,
    gunbaiRestPos,
    gunbaiRestRot,
    dispose: () => {
      createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(hasSkeleton ? rawModel : pivotGroup);
      }
      for (const sm of autoSkinnedMeshes) {
        disposeMeshResources(sm);
      }
      disposeMeshResources(rawModel);
    },
  };
}

/**
 * Whitelist of ONLY the essential combat & locomotion clips extracted from `UAL1_Standard.glb`
 * (Idle, Sprint, Jump, Melee Punch/Sword Combo, and Jutsu Cast). All ~35+ unused library
 * animations are discarded immediately and the entire GLB scene is disposed right after baking.
 */
export const ESSENTIAL_UAL_CLIP_NAMES = [
  'Idle_Loop',
  'Sprint_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Punch_Jab',
  'Punch_Cross',
  'Sword_Attack',
  'Spell_Simple_Shoot',
  'Spell_Simple_Enter',
] as const;

export type EssentialUalClipName = (typeof ESSENTIAL_UAL_CLIP_NAMES)[number];

const ESSENTIAL_UAL_CLIP_CANONICAL_MAP = new Map<string, EssentialUalClipName>(
  ESSENTIAL_UAL_CLIP_NAMES.map((name) => [name.toLowerCase(), name])
);

export interface UalAnimationLibrary {
  templateRoot: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
  dispose: () => void;
}

/**
 * Loads `UAL1_Standard.glb` strictly off-scene, extracts ONLY the essential clips
 * (Idle, Sprint, Jump, Punch/Sword, Jutsu), discards all other animations immediately,
 * and exposes `dispose()` to purge the entire GLB scene & GPU buffers right after baking.
 */
export async function loadUalAnimationLibrary(
  url: string
): Promise<UalAnimationLibrary | null> {
  const { rawModel, loadedAnimations, createdBlobUrls } = await parseRawModelSource(
    url,
    'UAL1_Standard.glb'
  );
  createdBlobUrls.forEach((u) => URL.revokeObjectURL(u));

  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of loadedAnimations) {
    if (!clip.name || !clip.tracks || clip.tracks.length === 0 || clip.duration <= 0.05) {
      continue;
    }
    const canonicalName = ESSENTIAL_UAL_CLIP_CANONICAL_MAP.get(clip.name.trim().toLowerCase());
    if (canonicalName && !clips.has(canonicalName)) {
      clips.set(canonicalName, clip);
    }
  }

  // Drop reference to all unused animations immediately
  loadedAnimations.length = 0;

  if (clips.size === 0) {
    disposeMeshResources(rawModel);
    rawModel.clear();
    return null;
  }

  const srcBones = mapBonesOnObject(rawModel);
  normalizeRiggedRawModel(rawModel, 2.0, srcBones);

  return {
    templateRoot: rawModel,
    clips,
    dispose: () => {
      disposeMeshResources(rawModel);
      rawModel.clear();
      clips.clear();
    },
  };
}

