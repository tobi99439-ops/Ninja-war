import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createGedoStoneTexture, createSoftGlowTexture } from '../textures';
import { registerResilientGltfTextureFallback, sanitizeGlbBuffer } from './glbSanitizer';

export type GedoMazoPhase = 'seal' | 'emerging' | 'active' | 'vanishing';

export interface GedoMazoRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  auraSprite: THREE.Sprite;
  update: (
    dt: number,
    elapsed: number,
    intensity?: number,
    phase?: GedoMazoPhase,
    phaseTimer?: number
  ) => void;
  dispose: () => void;
}

const GEDO_EXTERNAL_GLB_URL = 'https://files.catbox.moe/g39wbk.glb';
const GEDO_TARGET_HEIGHT = 10.6;

let cachedGedoTemplatePromise: Promise<THREE.Group | null> | null = null;
let cachedGedoTemplateScene: THREE.Group | null = null;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Converts the unrigged normalized `g39wbk.glb` meshes into articulated `SkinnedMesh`
 * parts driven by an upper-body & dual-arm procedural skeleton so the exact statue can
 * clutch its head in agony on summon before throwing its arms wide to roar.
 */
function buildArticulatedGedoTemplate(rawNormalized: THREE.Group): THREE.Group {
  rawNormalized.updateMatrixWorld(true);

  const skinnedRoot = new THREE.Group();
  skinnedRoot.name = 'GedoMazoSkinnedRoot';

  // Exact bone hierarchy matching normalized g39wbk.glb coordinates (Y: 0..10.6, +Z front):
  // 0: Hips, 1: Spine, 2: Chest, 3: Head,
  // 4: LeftShoulder, 5: LeftElbow, 6: RightShoulder, 7: RightElbow
  const boneHips = new THREE.Bone();
  boneHips.name = 'GedoHips';
  boneHips.position.set(0, 1.8, 0.7);

  const boneSpine = new THREE.Bone();
  boneSpine.name = 'GedoSpine';
  boneSpine.position.set(0, 2.2, 0.15);
  boneHips.add(boneSpine);

  const boneChest = new THREE.Bone();
  boneChest.name = 'GedoChest';
  boneChest.position.set(0, 2.5, 0.0);
  boneSpine.add(boneChest);

  const boneHead = new THREE.Bone();
  boneHead.name = 'GedoHead';
  boneHead.position.set(0, 1.85, 0.15);
  boneChest.add(boneHead);

  const boneLeftShoulder = new THREE.Bone();
  boneLeftShoulder.name = 'GedoLeftShoulder';
  boneLeftShoulder.position.set(-1.38, 0.15, 0.03);
  boneChest.add(boneLeftShoulder);

  const boneLeftElbow = new THREE.Bone();
  boneLeftElbow.name = 'GedoLeftElbow';
  boneLeftElbow.position.set(-1.17, -0.9, 0.04);
  boneLeftShoulder.add(boneLeftElbow);

  const boneRightShoulder = new THREE.Bone();
  boneRightShoulder.name = 'GedoRightShoulder';
  boneRightShoulder.position.set(1.38, 0.15, 0.03);
  boneChest.add(boneRightShoulder);

  const boneRightElbow = new THREE.Bone();
  boneRightElbow.name = 'GedoRightElbow';
  boneRightElbow.position.set(1.17, -0.9, 0.04);
  boneRightShoulder.add(boneRightElbow);

  const bones = [
    boneHips,
    boneSpine,
    boneChest,
    boneHead,
    boneLeftShoulder,
    boneLeftElbow,
    boneRightShoulder,
    boneRightElbow,
  ];

  skinnedRoot.add(boneHips);
  skinnedRoot.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();

  const meshes: THREE.Mesh[] = [];
  rawNormalized.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
  });

  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();
  const normMatrix = new THREE.Matrix3();

  for (let mIdx = 0; mIdx < meshes.length; mIdx++) {
    const srcMesh = meshes[mIdx];
    const geo = srcMesh.geometry.clone();
    const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (!posAttr) {
      geo.dispose();
      continue;
    }

    const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
    normMatrix.getNormalMatrix(srcMesh.matrixWorld);

    const count = posAttr.count;
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);

    // Check if this sub-mesh sits exclusively inside the head/face volume (Object_2 eyes / Object_3 mouth)
    const meshCenter = new THREE.Box3()
      .setFromObject(srcMesh)
      .getCenter(new THREE.Vector3());
    const isDedicatedHeadFeature =
      meshCenter.y > 7.6 && Math.abs(meshCenter.x) < 0.7 && meshCenter.z > 0.25;

    for (let i = 0; i < count; i++) {
      vPos.fromBufferAttribute(posAttr, i).applyMatrix4(srcMesh.matrixWorld);
      posAttr.setXYZ(i, vPos.x, vPos.y, vPos.z);

      if (normAttr) {
        vNorm.fromBufferAttribute(normAttr, i).applyMatrix3(normMatrix).normalize();
        normAttr.setXYZ(i, vNorm.x, vNorm.y, vNorm.z);
      }

      const x = vPos.x;
      const y = vPos.y;
      const z = vPos.z;
      const absX = Math.abs(x);

      let b0 = 0;
      let w0 = 1;
      let b1 = 0;
      let w1 = 0;
      let b2 = 0;
      let w2 = 0;

      if (isDedicatedHeadFeature) {
        b0 = 3; // Head bone
        w0 = 1;
      } else {
        // 1. Check lateral arm eligibility cleanly separated from chest and back pillars
        const armLat = smoothstep(1.32, 1.84, absX);
        const armYMask =
          smoothstep(4.0, 4.55, y) * (1 - smoothstep(7.05, 7.55, y));
        const armZMask = smoothstep(-0.48, 0.05, z);
        const armWeight = armLat * armYMask * armZMask;

        if (armWeight > 0.005) {
          const isLeft = x < 0;
          const shoulderBone = isLeft ? 4 : 6;
          const elbowBone = isLeft ? 5 : 7;
          const elbowBlend = smoothstep(2.22, 2.78, absX);

          b0 = 2; // Chest anchor
          w0 = 1 - armWeight;
          b1 = shoulderBone;
          w1 = armWeight * (1 - elbowBlend);
          b2 = elbowBone;
          w2 = armWeight * elbowBlend;
        } else {
          // 2. Central body: hips -> spine -> chest -> head (excluding rear horn pillars at z < -0.15)
          const headY = smoothstep(7.55, 8.28, y);
          const headZ = smoothstep(-0.22, 0.3, z);
          const headX = 1 - smoothstep(1.18, 1.56, absX);
          const headWeight = headY * headZ * headX;

          if (headWeight > 0.005) {
            b0 = 2; // Chest
            w0 = 1 - headWeight;
            b1 = 3; // Head
            w1 = headWeight;
          } else if (y < 3.6) {
            const spineW = smoothstep(2.35, 3.6, y);
            b0 = 0; // Hips anchored on ground
            w0 = 1 - spineW;
            b1 = 1; // Spine
            w1 = spineW;
          } else if (y < 6.1) {
            const chestW = smoothstep(4.2, 6.1, y);
            b0 = 1; // Spine
            w0 = 1 - chestW;
            b1 = 2; // Chest
            w1 = chestW;
          } else {
            b0 = 2; // Upper Chest & Back Horn Pillars
            w0 = 1;
          }
        }
      }

      const sum = w0 + w1 + w2 || 1;
      const base = i * 4;
      skinIndices[base] = b0;
      skinIndices[base + 1] = b1;
      skinIndices[base + 2] = b2;
      skinIndices[base + 3] = 0;
      skinWeights[base] = w0 / sum;
      skinWeights[base + 1] = w1 / sum;
      skinWeights[base + 2] = w2 / sum;
      skinWeights[base + 3] = 0;
    }

    posAttr.needsUpdate = true;
    if (normAttr) normAttr.needsUpdate = true;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.computeBoundingSphere();

    const skinnedMesh = new THREE.SkinnedMesh(geo, srcMesh.material);
    skinnedMesh.name = srcMesh.name || `GedoSkinnedMesh_${mIdx}`;
    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.bind(skeleton, new THREE.Matrix4());
    skinnedRoot.add(skinnedMesh);
  }

  return skinnedRoot;
}

/**
 * Downloads, parses, and caches the exact Gedo Mazo 3D GLB model (`g39wbk.glb`)
 * once per session while binding an articulated upper-body & dual-arm skeleton
 * that preserves its exact original appearance and textures.
 */
export function preloadGedoMazoModel(): Promise<THREE.Group | null> {
  if (cachedGedoTemplateScene) {
    return Promise.resolve(cachedGedoTemplateScene);
  }
  if (cachedGedoTemplatePromise) {
    return cachedGedoTemplatePromise;
  }

  cachedGedoTemplatePromise = (async () => {
    try {
      const response = await fetch(GEDO_EXTERNAL_GLB_URL);
      if (!response.ok) return null;
      const buf = await response.arrayBuffer();
      if (buf.byteLength < 64) return null;

      const sanitizedBuf = sanitizeGlbBuffer(buf);
      const manager = new THREE.LoadingManager();
      manager.onError = () => {};
      const loader = new GLTFLoader(manager);
      loader.setCrossOrigin('anonymous');
      registerResilientGltfTextureFallback(loader);
      const draco = new DRACOLoader(manager);
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(draco);
      try {
        const gltf = await loader.parseAsync(sanitizedBuf, '');
        if (!gltf.scene) return null;

        const rawTemplate = gltf.scene;
        rawTemplate.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rawTemplate);
        const size = new THREE.Vector3();
        box.getSize(size);
        const height = size.y > 0.001 ? size.y : Math.max(size.x, size.z, 1);
        const scaleFactor = GEDO_TARGET_HEIGHT / height;
        rawTemplate.scale.multiplyScalar(scaleFactor);
        rawTemplate.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(rawTemplate);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);
        rawTemplate.position.x -= center.x;
        rawTemplate.position.z -= center.z;
        rawTemplate.position.y -= scaledBox.min.y;
        rawTemplate.updateMatrixWorld(true);

        const articulatedTemplate = buildArticulatedGedoTemplate(rawTemplate);

        // Dispose raw pre-baked geometries since buildArticulatedGedoTemplate cloned & baked them
        rawTemplate.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry?.dispose();
          }
        });

        cachedGedoTemplateScene = articulatedTemplate;
        return articulatedTemplate;
      } finally {
        draco.dispose();
      }
    } catch {
      cachedGedoTemplatePromise = null;
      return null;
    }
  })();

  return cachedGedoTemplatePromise;
}

/**
 * Releases the cached Gedo Mazo GLB template geometries, materials, textures, and skeletons
 * from RAM and GPU VRAM when no Gedo Mazo character is active or on battle cleanup.
 */
export function disposeGedoMazoTemplateCache(): void {
  const tpl = cachedGedoTemplateScene;
  cachedGedoTemplateScene = null;
  cachedGedoTemplatePromise = null;
  if (!tpl) return;

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
    if (!m || disposedMats.has(m)) return;
    disposedMats.add(m);
    const std = m as THREE.MeshStandardMaterial;
    disposeTex(std.map);
    disposeTex(std.normalMap);
    disposeTex(std.emissiveMap);
    disposeTex(std.roughnessMap);
    disposeTex(std.metalnessMap);
    disposeTex(std.aoMap);
    disposeTex(std.alphaMap);
    m.dispose();
  };

  tpl.traverse((obj) => {
    const sk = obj as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh && sk.skeleton && !disposedSkeletons.has(sk.skeleton)) {
      disposedSkeletons.add(sk.skeleton);
      sk.skeleton.dispose();
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
  tpl.clear();
}

/**
 * Instantiates the exact `g39wbk.glb` Gedo Mazo statue with articulated agony animation:
 * clutches its head and shakes violently as if losing its mind on emerge, then flings its
 * arms open to roar and unleash purple lightning.
 */
export async function buildGedoMazoRig(
  maxAniso: number,
  enableShadows = true
): Promise<GedoMazoRig> {
  const template = await preloadGedoMazoModel();
  if (!template) {
    return buildProceduralGedoMazo(maxAniso, enableShadows);
  }

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const modelClone = SkeletonUtils.clone(template) as THREE.Group;
  const clonedMaterials: THREE.Material[] = [];
  const clonedSkeletons = new Set<THREE.Skeleton>();

  let boneSpine: THREE.Bone | null = null;
  let boneChest: THREE.Bone | null = null;
  let boneHead: THREE.Bone | null = null;
  let boneLeftShoulder: THREE.Bone | null = null;
  let boneLeftElbow: THREE.Bone | null = null;
  let boneRightShoulder: THREE.Bone | null = null;
  let boneRightElbow: THREE.Bone | null = null;

  modelClone.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const b = obj as THREE.Bone;
      if (b.name === 'GedoSpine') boneSpine = b;
      else if (b.name === 'GedoChest') boneChest = b;
      else if (b.name === 'GedoHead') boneHead = b;
      else if (b.name === 'GedoLeftShoulder') boneLeftShoulder = b;
      else if (b.name === 'GedoLeftElbow') boneLeftElbow = b;
      else if (b.name === 'GedoRightShoulder') boneRightShoulder = b;
      else if (b.name === 'GedoRightElbow') boneRightElbow = b;
    }

    const sk = obj as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh && sk.skeleton) {
      clonedSkeletons.add(sk.skeleton);
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = enableShadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const tuneGedoMaterial = (m: THREE.Material): THREE.Material => {
        const copy = m.clone();
        const std = copy as THREE.MeshStandardMaterial;
        const configureTex = (tex: THREE.Texture | null | undefined, isSrgb: boolean) => {
          if (!tex) return;
          tex.anisotropy = Math.min(16, Math.max(1, maxAniso));
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          if (isSrgb && tex.colorSpace !== THREE.SRGBColorSpace) {
            tex.colorSpace = THREE.SRGBColorSpace;
          }
          tex.needsUpdate = true;
        };
        configureTex(std.map, true);
        configureTex(std.emissiveMap, true);
        configureTex(std.normalMap, false);
        configureTex(std.roughnessMap, false);
        configureTex(std.bumpMap, false);

        if (std.isMeshStandardMaterial) {
          if (std.roughness < 0.76) std.roughness = 0.82;
          if (std.metalness > 0.12) std.metalness = 0.08;
          std.envMapIntensity = 0.42;
          // Warm pale weathered-stone lift + subtle Kamui magenta/purple undertone
          if (std.color && std.color.r > 0.35) {
            std.color.multiplyScalar(1.06);
          }
          if (std.emissive && std.emissive.r + std.emissive.g + std.emissive.b < 0.15) {
            std.emissive.setHex(0x2a0f3d);
            std.emissiveIntensity = 0.16;
          }
          std.needsUpdate = true;
        }
        clonedMaterials.push(copy);
        return copy;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(tuneGedoMaterial);
      } else if (mesh.material) {
        mesh.material = tuneGedoMaterial(mesh.material);
      }
    }
  });

  // Start immediately in head-clutching agony pose before rising through the summoning smoke
  const applyPoseImmediate = (
    lShX: number,
    lShY: number,
    lShZ: number,
    lElX: number,
    lElY: number,
    lElZ: number,
    spineX: number,
    chestX: number,
    headX: number,
    headY: number,
    headZ: number
  ) => {
    if (boneSpine) boneSpine.rotation.set(spineX, 0, 0);
    if (boneChest) boneChest.rotation.set(chestX, 0, 0);
    if (boneHead) boneHead.rotation.set(headX, headY, headZ);
    if (boneLeftShoulder) boneLeftShoulder.rotation.set(lShX, lShY, lShZ);
    if (boneLeftElbow) boneLeftElbow.rotation.set(lElX, lElY, lElZ);
    if (boneRightShoulder) boneRightShoulder.rotation.set(lShX, -lShY, -lShZ);
    if (boneRightElbow) boneRightElbow.rotation.set(lElX, -lElY, -lElZ);
  };

  applyPoseImmediate(0.18, 0.28, -1.62, -0.22, -0.18, -1.78, 0.14, 0.12, -0.16, 0, 0);

  bodyGroup.add(modelClone);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: 0xb048e8,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 6.4, -0.35);
  auraSprite.scale.set(10.8, 11.4, 1);
  bodyGroup.add(auraSprite);

  const update = (
    dt: number,
    elapsed: number,
    intensity = 1,
    phase: GedoMazoPhase = 'emerging',
    phaseTimer = 0
  ) => {
    // Agony / madness window during emerging + first 2.8s of active phase, then roar & unleash!
    const inAgonyClutch =
      phase === 'seal' ||
      phase === 'emerging' ||
      (phase === 'active' && phaseTimer < 2.8);

    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    const breath = Math.sin(elapsed * 3.1);
    const agonyJitter = inAgonyClutch ? Math.sin(elapsed * 29.0) * 0.055 : Math.sin(elapsed * 14.0) * 0.025;
    const violentShakeY = inAgonyClutch
      ? Math.sin(elapsed * 18.5) * 0.24 + Math.cos(elapsed * 27.0) * 0.09
      : Math.sin(elapsed * 6.5) * 0.09;
    const violentTiltZ = inAgonyClutch
      ? Math.cos(elapsed * 16.0) * 0.18 + Math.sin(elapsed * 23.0) * 0.07
      : Math.cos(elapsed * 5.2) * 0.06;

    // Target bone rotations:
    // Clutching both temples tightly in agony -> Flinging arms wide & tilting head back in roar
    const tgtShX = inAgonyClutch ? 0.18 + agonyJitter * 0.5 : -0.14;
    const tgtShY = inAgonyClutch ? 0.28 : 0.34;
    const tgtShZ = inAgonyClutch ? -1.62 + agonyJitter : 0.28 + Math.sin(elapsed * 5.5) * 0.06;

    const tgtElX = inAgonyClutch ? -0.22 - agonyJitter * 0.4 : 0.1;
    const tgtElY = inAgonyClutch ? -0.18 : 0.08;
    const tgtElZ = inAgonyClutch ? -1.78 - agonyJitter * 0.9 : 0.22;

    const tgtSpineX = inAgonyClutch ? 0.16 + breath * 0.045 : -0.12 + breath * 0.035;
    const tgtChestX = inAgonyClutch ? 0.14 + Math.sin(elapsed * 12.0) * 0.04 : -0.14;
    const tgtHeadX = inAgonyClutch
      ? -0.15 + Math.sin(elapsed * 14.0) * 0.12
      : -0.44 + Math.sin(elapsed * 7.5) * 0.08;

    const dampLambda = inAgonyClutch ? 12.0 : 6.8;

    if (boneSpine) {
      boneSpine.rotation.x = THREE.MathUtils.damp(boneSpine.rotation.x, tgtSpineX, dampLambda, safeDt);
      boneSpine.rotation.z = THREE.MathUtils.damp(boneSpine.rotation.z, violentTiltZ * 0.24, 14, safeDt);
    }
    if (boneChest) {
      boneChest.rotation.x = THREE.MathUtils.damp(boneChest.rotation.x, tgtChestX, dampLambda, safeDt);
      boneChest.rotation.y = THREE.MathUtils.damp(boneChest.rotation.y, violentShakeY * 0.25, 14, safeDt);
    }
    if (boneHead) {
      boneHead.rotation.x = THREE.MathUtils.damp(boneHead.rotation.x, tgtHeadX, dampLambda, safeDt);
      boneHead.rotation.y = THREE.MathUtils.damp(boneHead.rotation.y, violentShakeY, 16, safeDt);
      boneHead.rotation.z = THREE.MathUtils.damp(boneHead.rotation.z, violentTiltZ, 16, safeDt);
    }
    if (boneLeftShoulder && boneRightShoulder) {
      boneLeftShoulder.rotation.x = THREE.MathUtils.damp(boneLeftShoulder.rotation.x, tgtShX, dampLambda, safeDt);
      boneLeftShoulder.rotation.y = THREE.MathUtils.damp(boneLeftShoulder.rotation.y, tgtShY, dampLambda, safeDt);
      boneLeftShoulder.rotation.z = THREE.MathUtils.damp(boneLeftShoulder.rotation.z, tgtShZ, dampLambda, safeDt);

      boneRightShoulder.rotation.x = THREE.MathUtils.damp(boneRightShoulder.rotation.x, tgtShX, dampLambda, safeDt);
      boneRightShoulder.rotation.y = THREE.MathUtils.damp(boneRightShoulder.rotation.y, -tgtShY, dampLambda, safeDt);
      boneRightShoulder.rotation.z = THREE.MathUtils.damp(boneRightShoulder.rotation.z, -tgtShZ, dampLambda, safeDt);
    }
    if (boneLeftElbow && boneRightElbow) {
      boneLeftElbow.rotation.x = THREE.MathUtils.damp(boneLeftElbow.rotation.x, tgtElX, dampLambda, safeDt);
      boneLeftElbow.rotation.y = THREE.MathUtils.damp(boneLeftElbow.rotation.y, tgtElY, dampLambda, safeDt);
      boneLeftElbow.rotation.z = THREE.MathUtils.damp(boneLeftElbow.rotation.z, tgtElZ, dampLambda, safeDt);

      boneRightElbow.rotation.x = THREE.MathUtils.damp(boneRightElbow.rotation.x, tgtElX, dampLambda, safeDt);
      boneRightElbow.rotation.y = THREE.MathUtils.damp(boneRightElbow.rotation.y, -tgtElY, dampLambda, safeDt);
      boneRightElbow.rotation.z = THREE.MathUtils.damp(boneRightElbow.rotation.z, -tgtElZ, dampLambda, safeDt);
    }

    const tremorAmp = (inAgonyClutch ? 0.068 : 0.038) * intensity;
    const tremorX = Math.sin(elapsed * 33.0) * tremorAmp;
    const tremorZ = Math.cos(elapsed * 29.0) * tremorAmp * 0.85;
    bodyGroup.position.set(tremorX, Math.sin(elapsed * 3.1) * 0.06, tremorZ);
    bodyGroup.scale.set(
      1 + breath * 0.018,
      1 + breath * 0.022,
      1 + breath * 0.018
    );

    const pulse =
      (inAgonyClutch ? 0.44 : 0.38) +
      Math.sin(elapsed * (inAgonyClutch ? 12.0 : 8.5)) * 0.14;
    auraMat.opacity = Math.min(0.72, pulse * Math.max(0.3, intensity));
    const sc = (inAgonyClutch ? 9.4 : 10.2) + Math.sin(elapsed * 5.2) * 0.9;
    auraSprite.scale.set(sc, sc, 1);
  };

  const dispose = () => {
    auraMat.dispose();
    auraTex.dispose();
    for (const sk of clonedSkeletons) {
      sk.dispose();
    }
    for (const mat of clonedMaterials) {
      mat.dispose();
    }
  };

  return {
    root,
    bodyGroup,
    auraSprite,
    update,
    dispose,
  };
}

/**
 * Offline/failure fallback procedural 3D Gedo Mazo if the remote GLB cannot be downloaded.
 */
export function buildProceduralGedoMazo(
  maxAniso: number,
  enableShadows = true
): GedoMazoRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const stoneTex = createGedoStoneTexture(maxAniso);
  disposables.push(stoneTex);

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x877a6e,
      map: stoneTex,
      roughness: 0.88,
      metalness: 0.08,
    })
  );

  const darkSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c5249,
      map: stoneTex,
      roughness: 0.92,
      metalness: 0.06,
    })
  );

  const hornMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x463d37,
      roughness: 0.84,
      metalness: 0.16,
    })
  );

  const clothMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3530,
      roughness: 0.94,
      metalness: 0.04,
    })
  );

  const blindfoldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9c9284,
      roughness: 0.9,
      metalness: 0.05,
    })
  );

  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262932,
      roughness: 0.48,
      metalness: 0.82,
    })
  );

  const mouthVoidMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0b0514,
    })
  );

  const toothMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2b9a9,
      roughness: 0.65,
      metalness: 0.05,
    })
  );

  const eyeGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf3e8ff,
      emissive: new THREE.Color(0xb84dff),
      emissiveIntensity: 3.4,
      roughness: 0.15,
      metalness: 0.1,
    })
  );

  const auraTex = createSoftGlowTexture();
  disposables.push(auraTex);
  const auraMat = trackMat(
    new THREE.SpriteMaterial({
      map: auraTex,
      color: 0xa855f7,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 6.2, 1.6);
  auraSprite.scale.set(9.0, 9.0, 1);
  bodyGroup.add(auraSprite);

  const legGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.82, 3.6, 12));
  const leftLeg = new THREE.Mesh(legGeo, darkSkinMat);
  leftLeg.position.set(-1.12, 1.7, -0.05);
  leftLeg.rotation.z = -0.07;
  leftLeg.castShadow = enableShadows;
  leftLeg.receiveShadow = true;

  const rightLeg = new THREE.Mesh(legGeo, darkSkinMat);
  rightLeg.position.set(1.12, 1.7, -0.05);
  rightLeg.rotation.z = 0.07;
  rightLeg.castShadow = true;
  rightLeg.receiveShadow = true;
  bodyGroup.add(leftLeg, rightLeg);

  const waistGeo = trackGeo(new THREE.CylinderGeometry(1.58, 1.82, 1.75, 14));
  const waistMesh = new THREE.Mesh(waistGeo, clothMat);
  waistMesh.position.set(0, 3.35, 0);
  waistMesh.scale.set(1.12, 1, 0.78);
  waistMesh.castShadow = true;
  bodyGroup.add(waistMesh);

  const beltGeo = trackGeo(new THREE.TorusGeometry(1.56, 0.18, 8, 22));
  const beltMesh = new THREE.Mesh(beltGeo, ironMat);
  beltMesh.rotation.x = Math.PI / 2;
  beltMesh.position.set(0, 4.08, 0);
  beltMesh.scale.set(1.06, 0.76, 1);
  bodyGroup.add(beltMesh);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 4.0, 0);
  bodyGroup.add(torsoPivot);

  const abdomenGeo = trackGeo(new THREE.CylinderGeometry(1.36, 1.42, 1.7, 14));
  const abdomen = new THREE.Mesh(abdomenGeo, darkSkinMat);
  abdomen.position.set(0, 0.75, 0.05);
  abdomen.scale.set(1.1, 1, 0.78);
  abdomen.castShadow = true;
  torsoPivot.add(abdomen);

  const ribGeo = trackGeo(new THREE.TorusGeometry(1.22, 0.11, 7, 18, Math.PI * 1.18));
  for (let r = 0; r < 4; r++) {
    const rib = new THREE.Mesh(ribGeo, skinMat);
    rib.position.set(0, 0.38 + r * 0.34, 0.16);
    rib.rotation.x = Math.PI / 2 + 0.12;
    rib.rotation.z = -Math.PI * 0.09;
    rib.scale.set(1.08, 0.74, 1);
    torsoPivot.add(rib);
  }

  const chestGeo = trackGeo(new THREE.SphereGeometry(2.15, 18, 16));
  const chest = new THREE.Mesh(chestGeo, skinMat);
  chest.position.set(0, 2.38, 0.18);
  chest.scale.set(1.24, 0.88, 0.76);
  chest.castShadow = true;
  chest.receiveShadow = true;
  torsoPivot.add(chest);

  const shoulderGeo = trackGeo(new THREE.SphereGeometry(1.05, 14, 12));
  const leftShoulderMass = new THREE.Mesh(shoulderGeo, skinMat);
  leftShoulderMass.position.set(-2.38, 2.9, 0.12);
  leftShoulderMass.scale.set(1.15, 1.0, 0.92);
  leftShoulderMass.castShadow = true;

  const rightShoulderMass = new THREE.Mesh(shoulderGeo, skinMat);
  rightShoulderMass.position.set(2.38, 2.9, 0.12);
  rightShoulderMass.scale.set(1.15, 1.0, 0.92);
  rightShoulderMass.castShadow = true;
  torsoPivot.add(leftShoulderMass, rightShoulderMass);

  const hornGeo = trackGeo(new THREE.ConeGeometry(0.32, 3.1, 9));
  hornGeo.translate(0, 1.45, 0);
  const backHornSpecs: Array<[number, number, number, number, number, number, number]> = [
    [-2.05, 2.9, -0.78, -0.45, 0, 0.56, 1.05],
    [2.05, 2.9, -0.78, -0.45, 0, -0.56, 1.05],
    [-1.42, 3.18, -1.05, -0.62, 0, 0.36, 1.24],
    [1.42, 3.18, -1.05, -0.62, 0, -0.36, 1.24],
    [-0.74, 3.3, -1.2, -0.72, 0, 0.18, 1.32],
    [0.74, 3.3, -1.2, -0.72, 0, -0.18, 1.32],
    [-1.12, 1.95, -1.02, -0.82, 0, 0.42, 0.88],
    [1.12, 1.95, -1.02, -0.82, 0, -0.42, 0.88],
  ];
  for (const [hx, hy, hz, rx, ry, rz, sc] of backHornSpecs) {
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(hx, hy, hz);
    horn.rotation.set(rx, ry, rz);
    horn.scale.setScalar(sc);
    horn.castShadow = true;
    torsoPivot.add(horn);
  }

  const neckGeo = trackGeo(new THREE.CylinderGeometry(0.62, 0.82, 1.15, 12));
  const neck = new THREE.Mesh(neckGeo, darkSkinMat);
  neck.position.set(0, 3.42, 0.45);
  neck.rotation.x = 0.25;
  torsoPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 4.18, 0.68);
  torsoPivot.add(headPivot);

  const craniumGeo = trackGeo(new THREE.SphereGeometry(1.12, 18, 16));
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.position.set(0, 0.56, 0.05);
  cranium.scale.set(0.94, 1.16, 1.02);
  cranium.castShadow = true;
  headPivot.add(cranium);

  const browGeo = trackGeo(new THREE.BoxGeometry(1.72, 0.34, 0.65));
  const browRidge = new THREE.Mesh(browGeo, darkSkinMat);
  browRidge.position.set(0, 0.78, 0.72);
  headPivot.add(browRidge);

  const blindfoldGeo = trackGeo(new THREE.CylinderGeometry(1.14, 1.14, 0.42, 18));
  const blindfold = new THREE.Mesh(blindfoldGeo, blindfoldMat);
  blindfold.position.set(0, 0.95, 0.06);
  blindfold.scale.set(0.95, 1, 1.02);
  headPivot.add(blindfold);

  const mainEyeGeo = trackGeo(new THREE.SphereGeometry(0.16, 10, 10));
  const subEyeGeo = trackGeo(new THREE.SphereGeometry(0.105, 8, 8));
  const eyePositions: Array<[number, number, number, boolean]> = [
    [-0.44, 0.54, 1.02, true],
    [0.44, 0.54, 1.02, true],
    [-0.56, 0.86, 1.03, false],
    [-0.22, 0.92, 1.07, false],
    [0.22, 0.92, 1.07, false],
    [0.56, 0.86, 1.03, false],
    [-0.36, 1.12, 0.96, false],
    [0.0, 1.16, 0.98, false],
    [0.36, 1.12, 0.96, false],
  ];
  for (const [ex, ey, ez, isMain] of eyePositions) {
    const eye = new THREE.Mesh(isMain ? mainEyeGeo : subEyeGeo, eyeGlowMat);
    eye.position.set(ex, ey, ez);
    eye.scale.set(1.25, 0.72, 0.6);
    headPivot.add(eye);
  }

  const earGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.85, 7));
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-1.12, 0.56, 0.0);
  leftEar.rotation.z = 1.25;
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(1.12, 0.56, 0.0);
  rightEar.rotation.z = -1.25;
  headPivot.add(leftEar, rightEar);

  const mouthVoidGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.36, 0.72, 12));
  const mouthVoid = new THREE.Mesh(mouthVoidGeo, mouthVoidMat);
  mouthVoid.position.set(0, -0.02, 0.76);
  mouthVoid.rotation.x = Math.PI / 2;
  headPivot.add(mouthVoid);

  const toothGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.16, 0.12));
  for (let t = -3; t <= 3; t++) {
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(t * 0.13, 0.2, 1.04 - Math.abs(t) * 0.03);
    headPivot.add(tooth);
  }

  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, 0.04, 0.46);
  headPivot.add(jawPivot);

  const lowerJawGeo = trackGeo(new THREE.BoxGeometry(1.12, 0.42, 0.96));
  const lowerJaw = new THREE.Mesh(lowerJawGeo, darkSkinMat);
  lowerJaw.position.set(0, -0.34, 0.34);
  lowerJaw.castShadow = true;
  jawPivot.add(lowerJaw);

  for (let t = -3; t <= 3; t++) {
    const bTooth = new THREE.Mesh(toothGeo, toothMat);
    bTooth.position.set(t * 0.13, -0.14, 0.74 - Math.abs(t) * 0.03);
    jawPivot.add(bTooth);
  }

  const upperArmGeo = trackGeo(new THREE.CylinderGeometry(0.5, 0.42, 2.7, 10));
  upperArmGeo.translate(0, 1.35, 0);
  const forearmGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.36, 2.55, 10));
  forearmGeo.translate(0, 1.25, 0);
  const palmGeo = trackGeo(new THREE.BoxGeometry(0.74, 0.85, 0.42));
  const fingerGeo = trackGeo(new THREE.ConeGeometry(0.1, 0.65, 6));
  const shackleGeo = trackGeo(new THREE.TorusGeometry(0.46, 0.11, 8, 16));
  const chainLinkGeo = trackGeo(new THREE.TorusGeometry(0.16, 0.048, 6, 12));

  const buildClutchingArm = (side: -1 | 1) => {
    const upperPivot = new THREE.Group();
    upperPivot.position.set(side * 2.52, 2.86, 0.12);
    upperPivot.rotation.set(0.32, side * 0.18, side * -0.58);
    torsoPivot.add(upperPivot);

    const upperMesh = new THREE.Mesh(upperArmGeo, skinMat);
    upperMesh.castShadow = true;
    upperPivot.add(upperMesh);

    const elbowJoint = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.46, 10, 10)),
      darkSkinMat
    );
    elbowJoint.position.set(0, 2.66, 0);
    upperPivot.add(elbowJoint);

    const forePivot = new THREE.Group();
    forePivot.position.set(0, 2.66, 0);
    forePivot.rotation.set(0.44, side * -0.22, side * 1.48);
    upperPivot.add(forePivot);

    const foreMesh = new THREE.Mesh(forearmGeo, skinMat);
    foreMesh.castShadow = true;
    forePivot.add(foreMesh);

    const shackle = new THREE.Mesh(shackleGeo, ironMat);
    shackle.position.set(0, 2.25, 0);
    shackle.rotation.x = Math.PI / 2;
    forePivot.add(shackle);

    const chainAnchor = new THREE.Group();
    chainAnchor.position.set(side * 0.34, 2.15, 0.18);
    forePivot.add(chainAnchor);
    for (let k = 0; k < 4; k++) {
      const link = new THREE.Mesh(chainLinkGeo, ironMat);
      link.position.set(0, -k * 0.24 - 0.12, 0);
      link.rotation.y = k % 2 === 0 ? 0 : Math.PI / 2;
      chainAnchor.add(link);
    }

    const handGroup = new THREE.Group();
    handGroup.position.set(0, 2.58, 0.08);
    handGroup.rotation.set(-0.22, side * 0.25, side * 0.34);
    forePivot.add(handGroup);

    const palm = new THREE.Mesh(palmGeo, darkSkinMat);
    palm.castShadow = true;
    handGroup.add(palm);

    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.position.set((f - 1.5) * 0.17, 0.56, 0.12);
      finger.rotation.x = 0.65;
      handGroup.add(finger);
    }

    return { upperPivot, forePivot, chainAnchor };
  };

  const leftArm = buildClutchingArm(-1);
  const rightArm = buildClutchingArm(1);

  const update = (
    dt: number,
    elapsed: number,
    intensity = 1,
    phase: GedoMazoPhase = 'emerging',
    phaseTimer = 0
  ) => {
    const inAgony =
      phase === 'seal' ||
      phase === 'emerging' ||
      (phase === 'active' && phaseTimer < 2.8);
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    const breathe = Math.sin(elapsed * 2.8);
    const tremorX = Math.sin(elapsed * 32.0) * (inAgony ? 0.055 : 0.032) * intensity;
    const tremorZ = Math.cos(elapsed * 28.0) * (inAgony ? 0.048 : 0.028) * intensity;

    bodyGroup.position.set(tremorX, Math.sin(elapsed * 2.8) * 0.09, tremorZ);
    torsoPivot.scale.set(1 + breathe * 0.025, 1 + breathe * 0.03, 1 + breathe * 0.025);
    torsoPivot.rotation.x = THREE.MathUtils.damp(
      torsoPivot.rotation.x,
      inAgony ? 0.18 + breathe * 0.04 : -0.14 + breathe * 0.03,
      9,
      safeDt
    );

    headPivot.rotation.x = THREE.MathUtils.damp(
      headPivot.rotation.x,
      inAgony
        ? -0.16 + Math.sin(elapsed * 13.5) * 0.11 * intensity
        : -0.48 + Math.sin(elapsed * 7.2) * 0.08 * intensity,
      10,
      safeDt
    );
    headPivot.rotation.y = THREE.MathUtils.damp(
      headPivot.rotation.y,
      inAgony
        ? Math.sin(elapsed * 17.5) * 0.22 * intensity
        : Math.sin(elapsed * 5.0) * 0.09 * intensity,
      14,
      safeDt
    );
    headPivot.rotation.z = THREE.MathUtils.damp(
      headPivot.rotation.z,
      inAgony
        ? Math.cos(elapsed * 15.0) * 0.14 * intensity
        : Math.cos(elapsed * 4.5) * 0.05 * intensity,
      14,
      safeDt
    );

    jawPivot.rotation.x = 0.42 + Math.abs(Math.sin(elapsed * 12.0)) * 0.2 * intensity;

    const armShake = Math.sin(elapsed * 20.0) * 0.055 * intensity;
    const tgtUpperZ = inAgony ? 0.58 + armShake : -0.42;
    const tgtForeX = inAgony ? 0.44 + Math.cos(elapsed * 16.0) * 0.04 * intensity : -0.15;
    const tgtForeZ = inAgony ? -1.48 : 0.35;

    leftArm.upperPivot.rotation.z = THREE.MathUtils.damp(leftArm.upperPivot.rotation.z, tgtUpperZ, 10, safeDt);
    rightArm.upperPivot.rotation.z = THREE.MathUtils.damp(rightArm.upperPivot.rotation.z, -tgtUpperZ, 10, safeDt);
    leftArm.forePivot.rotation.x = THREE.MathUtils.damp(leftArm.forePivot.rotation.x, tgtForeX, 10, safeDt);
    rightArm.forePivot.rotation.x = THREE.MathUtils.damp(rightArm.forePivot.rotation.x, tgtForeX, 10, safeDt);
    leftArm.forePivot.rotation.z = THREE.MathUtils.damp(leftArm.forePivot.rotation.z, tgtForeZ, 10, safeDt);
    rightArm.forePivot.rotation.z = THREE.MathUtils.damp(rightArm.forePivot.rotation.z, -tgtForeZ, 10, safeDt);

    leftArm.chainAnchor.rotation.z = -0.75 + Math.sin(elapsed * 5.2) * 0.14;
    rightArm.chainAnchor.rotation.z = 0.75 - Math.sin(elapsed * 5.2) * 0.14;

    eyeGlowMat.emissiveIntensity = 3.0 + Math.sin(elapsed * 9.0) * 1.1;
    auraMat.opacity = Math.min(0.68, (0.38 + Math.sin(elapsed * 8.0) * 0.12) * Math.max(0.25, intensity));
  };

  const dispose = () => {
    for (const item of disposables) {
      item.dispose();
    }
  };

  return {
    root,
    bodyGroup,
    auraSprite,
    update,
    dispose,
  };
}
