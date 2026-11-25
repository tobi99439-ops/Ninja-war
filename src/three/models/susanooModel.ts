import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SusanooStage } from '../../types/game';
import { createSoftGlowTexture } from '../textures';
import { registerResilientGltfTextureFallback, sanitizeGlbBuffer } from './glbSanitizer';

export interface SusanooRig {
  stage: SusanooStage;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pilotAnchor: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  auraSprite: THREE.Sprite;
  baseOpacity: number;
  fitToTargetWorldHeight: (targetWorldHeight: number) => void;
  setOpacity: (opacity: number) => void;
  update: (
    dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity?: number,
    stridePhase?: number,
    strideAmount?: number,
    comboStep?: number
  ) => void;
  consumeFootstepImpact?: () => number;
  dispose: () => void;
}

const SUSANOO_EXTERNAL_GLB_URL = 'https://files.catbox.moe/35pza0.glb';
const SUSANOO_DEFAULT_HEIGHT = 6.6;
const SUSANOO_BASE_OPACITY = 0.56;

const _boxA = new THREE.Box3();
const _sizeA = new THREE.Vector3();
const _centerA = new THREE.Vector3();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _eulerA = new THREE.Euler(0, 0, 0, 'YXZ');
const _quatA = new THREE.Quaternion();

interface TrackedNode {
  obj: THREE.Object3D;
  restQuat: THREE.Quaternion;
}

interface SusanooArticulation {
  spines: TrackedNode[];
  rightShoulder: TrackedNode | null;
  rightUpperArm: TrackedNode | null;
  rightForearm: TrackedNode | null;
  rightHand: TrackedNode | null;
  leftShoulder: TrackedNode | null;
  leftUpperArm: TrackedNode | null;
  leftForearm: TrackedNode | null;
  leftHand: TrackedNode | null;
}

let cachedSusanooTemplatePromise: Promise<{
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
} | null> | null = null;
let cachedSusanooTemplate: {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
} | null = null;

function findNamedSusanooNode(root: THREE.Object3D, patterns: RegExp[]): THREE.Object3D | null {
  const candidates: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone || obj.children.length > 0 || (obj as THREE.Mesh).isMesh) {
      if (obj !== root && obj.name) {
        candidates.push(obj);
      }
    }
  });
  for (const pat of patterns) {
    const boneMatch = candidates.find((c) => (c as THREE.Bone).isBone && pat.test(c.name));
    if (boneMatch) return boneMatch;
    const anyMatch = candidates.find((c) => pat.test(c.name));
    if (anyMatch) return anyMatch;
  }
  return null;
}

function collectSusanooArticulation(root: THREE.Object3D): SusanooArticulation {
  const track = (obj: THREE.Object3D | null): TrackedNode | null =>
    obj ? { obj, restQuat: obj.quaternion.clone() } : null;

  const spines: TrackedNode[] = [];
  const spineLower = findNamedSusanooNode(root, [
    /spine_?0?1/i,
    /spine1/i,
    /^spine$/i,
    /abdomen/i,
    /torso/i,
  ]);
  const spineUpper = findNamedSusanooNode(root, [
    /chest/i,
    /upper_?chest/i,
    /spine_?0?2/i,
    /spine2/i,
    /upper_?body/i,
  ]);
  if (spineLower) spines.push({ obj: spineLower, restQuat: spineLower.quaternion.clone() });
  if (spineUpper && spineUpper !== spineLower) {
    spines.push({ obj: spineUpper, restQuat: spineUpper.quaternion.clone() });
  }

  return {
    spines,
    rightShoulder: track(
      findNamedSusanooNode(root, [
        /right.*shoulder/i,
        /shoulder.*r\b/i,
        /r_shoulder/i,
        /right.*clavicle/i,
        /clavicle.*r\b/i,
      ])
    ),
    rightUpperArm: track(
      findNamedSusanooNode(root, [
        /right.*upper.*arm/i,
        /upper.*arm.*r\b/i,
        /right.*arm/i,
        /arm.*r\b/i,
        /r_arm/i,
        /bicep.*r\b/i,
      ])
    ),
    rightForearm: track(
      findNamedSusanooNode(root, [
        /right.*forearm/i,
        /forearm.*r\b/i,
        /r_forearm/i,
        /right.*lower.*arm/i,
        /lower.*arm.*r\b/i,
        /right.*elbow/i,
      ])
    ),
    rightHand: track(
      findNamedSusanooNode(root, [
        /right.*hand/i,
        /hand.*r\b/i,
        /r_hand/i,
        /right.*wrist/i,
        /totsuka/i,
        /sword/i,
        /blade/i,
        /weapon/i,
      ])
    ),
    leftShoulder: track(
      findNamedSusanooNode(root, [
        /left.*shoulder/i,
        /shoulder.*l\b/i,
        /l_shoulder/i,
        /left.*clavicle/i,
        /clavicle.*l\b/i,
      ])
    ),
    leftUpperArm: track(
      findNamedSusanooNode(root, [
        /left.*upper.*arm/i,
        /upper.*arm.*l\b/i,
        /left.*arm/i,
        /arm.*l\b/i,
        /l_arm/i,
        /bicep.*l\b/i,
      ])
    ),
    leftForearm: track(
      findNamedSusanooNode(root, [
        /left.*forearm/i,
        /forearm.*l\b/i,
        /l_forearm/i,
        /left.*lower.*arm/i,
        /lower.*arm.*l\b/i,
        /left.*elbow/i,
      ])
    ),
    leftHand: track(
      findNamedSusanooNode(root, [
        /left.*hand/i,
        /hand.*l\b/i,
        /l_hand/i,
        /left.*wrist/i,
        /shield/i,
      ])
    ),
  };
}

function normalizeSusanooTemplate(template: THREE.Group): void {
  template.updateMatrixWorld(true);

  const leftArm = findNamedSusanooNode(template, [
    /left.*upper.*arm/i,
    /left.*arm/i,
    /arm.*l\b/i,
    /left.*shoulder/i,
    /shoulder.*l\b/i,
  ]);
  const rightArm = findNamedSusanooNode(template, [
    /right.*upper.*arm/i,
    /right.*arm/i,
    /arm.*r\b/i,
    /right.*shoulder/i,
    /shoulder.*r\b/i,
  ]);

  if (leftArm && rightArm) {
    leftArm.getWorldPosition(_vecA);
    rightArm.getWorldPosition(_vecB);
    const dx = _vecA.x - _vecB.x;
    const dz = _vecA.z - _vecB.z;
    if (Math.hypot(dx, dz) > 0.01) {
      const yawCorrection = Math.atan2(dz, dx);
      if (Math.abs(yawCorrection) > 0.35) {
        const snappedYaw = Math.round(yawCorrection / (Math.PI / 2)) * (Math.PI / 2);
        template.rotation.y += snappedYaw;
        template.updateMatrixWorld(true);
      }
    }
  }

  _boxA.setFromObject(template);
  _boxA.getSize(_sizeA);
  const height = _sizeA.y > 0.001 ? _sizeA.y : Math.max(_sizeA.x, _sizeA.z, 1);
  const scaleFactor = SUSANOO_DEFAULT_HEIGHT / height;
  template.scale.multiplyScalar(scaleFactor);
  template.updateMatrixWorld(true);

  _boxA.setFromObject(template);
  _boxA.getCenter(_centerA);
  template.position.x -= _centerA.x;
  template.position.z -= _centerA.z;
  template.position.y -= _boxA.min.y;
  template.updateMatrixWorld(true);
}

export function preloadSusanooModel(): Promise<{
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
} | null> {
  if (cachedSusanooTemplate) {
    return Promise.resolve(cachedSusanooTemplate);
  }
  if (cachedSusanooTemplatePromise) {
    return cachedSusanooTemplatePromise;
  }

  cachedSusanooTemplatePromise = (async () => {
    try {
      const response = await fetch(SUSANOO_EXTERNAL_GLB_URL, { mode: 'cors' });
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

        const template = gltf.scene;
        normalizeSusanooTemplate(template);

        template.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
          }
        });

        const sanitizedClips = (gltf.animations || []).map((clip) => {
          const clone = clip.clone();
          clone.tracks = clone.tracks.filter((tr) => !/\.position$/i.test(tr.name));
          return clone;
        });

        cachedSusanooTemplate = { scene: template, clips: sanitizedClips };
        return cachedSusanooTemplate;
      } finally {
        draco.dispose();
      }
    } catch {
      cachedSusanooTemplatePromise = null;
      return null;
    }
  })();

  return cachedSusanooTemplatePromise;
}

export function disposeSusanooTemplateCache(): void {
  const tpl = cachedSusanooTemplate;
  cachedSusanooTemplate = null;
  cachedSusanooTemplatePromise = null;
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

  tpl.scene.traverse((obj) => {
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
  tpl.scene.clear();
}

export type SusanooColorVariant = 'itachi' | 'madara';

const SUSANOO_PALETTES: Record<
  SusanooColorVariant,
  { color: number; emissive: number; accent: number; aura: number; blade: number; crystal: number }
> = {
  itachi: {
    color: 0xff4500,
    emissive: 0xff2200,
    accent: 0xfb923c,
    aura: 0xff4500,
    blade: 0xff4500,
    crystal: 0xfef08a,
  },
  madara: {
    color: 0x6d28d9,
    emissive: 0x5b21b6,
    accent: 0x4c1d95,
    aura: 0xa855f7,
    blade: 0xc084fc,
    crystal: 0xe9d5ff,
  },
};

function createChakraArmorMaterial(
  srcMat?: THREE.Material | null,
  variant: SusanooColorVariant = 'madara',
  opacity = SUSANOO_BASE_OPACITY,
  roughness = 0.28,
  metalness = 0.22
): THREE.MeshStandardMaterial {
  const srcStd = srcMat as THREE.MeshStandardMaterial | undefined;
  const palette = SUSANOO_PALETTES[variant];
  return new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.emissive,
    emissiveIntensity: 1.35,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    roughness,
    metalness,
    depthWrite: false,
    map: srcStd?.map || null,
    normalMap: srcStd?.normalMap || null,
    alphaMap: srcStd?.alphaMap || null,
  });
}

function createWavyKatanaGeometry(length: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.35, 0);
  shape.lineTo(width * 0.35, 0);
  // Iconic wavy kris/chakra blade profile of Madara's Susanoo katana
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 3.0) * width * 0.22;
    const taper = 1 - Math.pow(t, 2.2) * 0.85;
    shape.lineTo(width * 0.42 * taper + wave, length * t);
  }
  shape.lineTo(0, length * 1.06);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 3.0) * width * 0.14;
    const taper = 1 - Math.pow(t, 2.2) * 0.85;
    shape.lineTo(-width * 0.38 * taper + wave, length * t);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 2,
    depth: width * 0.26,
    bevelEnabled: true,
    bevelThickness: width * 0.08,
    bevelSize: width * 0.07,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function createSamuraiPlateGeometry(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w * 0.5, 0);
  shape.lineTo(w * 0.5, 0);
  shape.lineTo(w * 0.38, -h * 0.82);
  shape.lineTo(0, -h);
  shape.lineTo(-w * 0.38, -h * 0.82);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: w * 0.05,
    bevelSegments: 2,
  });
  geo.computeVertexNormals();
  return geo;
}

function computeComboSlashKinematics(slashProgress: number, comboStep: number) {
  if (slashProgress <= 0 || slashProgress >= 1) {
    return {
      torsoYaw: 0,
      torsoPitch: 0,
      rightArmYaw: 0,
      rightArmPitch: 0,
      rightForearmYaw: 0,
      leftArmYaw: 0,
      leftArmPitch: 0,
      leftForearmYaw: 0,
      swordGlow: 0,
    };
  }

  const wind = slashProgress < 0.24 ? THREE.MathUtils.smoothstep(slashProgress, 0, 0.24) : 1;
  const swing =
    slashProgress >= 0.24 && slashProgress < 0.72
      ? THREE.MathUtils.smoothstep(slashProgress, 0.24, 0.72)
      : slashProgress >= 0.72
        ? 1
        : 0;
  const decay =
    slashProgress >= 0.72 ? Math.pow(1 - THREE.MathUtils.smoothstep(slashProgress, 0.72, 1.0), 2) : 1;

  const stepMod = ((comboStep % 3) + 3) % 3;

  if (stepMod === 0) {
    // Hit 1: Heavy Right Katana diagonal cleave (right -> left)
    const rYaw = THREE.MathUtils.lerp(-0.98 * wind, 1.48, swing) * decay;
    const rPitch = THREE.MathUtils.lerp(-0.48 * wind, 0.68, swing) * decay;
    return {
      torsoYaw: THREE.MathUtils.lerp(-0.42 * wind, 0.88, swing) * decay,
      torsoPitch: Math.sin(swing * Math.PI) * 0.22 * decay,
      rightArmYaw: rYaw,
      rightArmPitch: rPitch,
      rightForearmYaw: THREE.MathUtils.lerp(-0.32 * wind, 0.78, swing) * decay,
      leftArmYaw: -0.22 * wind * decay,
      leftArmPitch: -0.15 * wind * decay,
      leftForearmYaw: 0,
      swordGlow: swing > 0 ? decay : wind * 0.55,
    };
  }

  if (stepMod === 1) {
    // Hit 2: Reverse Left Katana cleave (left -> right)
    const lYaw = THREE.MathUtils.lerp(0.98 * wind, -1.48, swing) * decay;
    const lPitch = THREE.MathUtils.lerp(-0.48 * wind, 0.68, swing) * decay;
    return {
      torsoYaw: THREE.MathUtils.lerp(0.42 * wind, -0.88, swing) * decay,
      torsoPitch: Math.sin(swing * Math.PI) * 0.22 * decay,
      rightArmYaw: 0.22 * wind * decay,
      rightArmPitch: -0.15 * wind * decay,
      rightForearmYaw: 0,
      leftArmYaw: lYaw,
      leftArmPitch: lPitch,
      leftForearmYaw: THREE.MathUtils.lerp(0.32 * wind, -0.78, swing) * decay,
      swordGlow: swing > 0 ? decay : wind * 0.55,
    };
  }

  // Hit 3: Twin Overhead Cross-Blade Slam!
  const dualPitch = THREE.MathUtils.lerp(-1.25 * wind, 1.05, swing) * decay;
  const dualYaw = THREE.MathUtils.lerp(0.45 * wind, -0.35, swing) * decay;
  return {
    torsoYaw: 0,
    torsoPitch: THREE.MathUtils.lerp(-0.22 * wind, 0.36, swing) * decay,
    rightArmYaw: -dualYaw,
    rightArmPitch: dualPitch,
    rightForearmYaw: THREE.MathUtils.lerp(-0.2 * wind, 0.38, swing) * decay,
    leftArmYaw: dualYaw,
    leftArmPitch: dualPitch,
    leftForearmYaw: THREE.MathUtils.lerp(0.2 * wind, -0.38, swing) * decay,
    swordGlow: swing > 0 ? 1.15 * decay : wind * 0.75,
  };
}

function applyAdditiveNodeRotation(
  node: TrackedNode | null,
  rx: number,
  ry: number,
  rz: number
): void {
  if (!node) return;
  _eulerA.set(rx, ry, rz, 'YXZ');
  _quatA.setFromEuler(_eulerA);
  node.obj.quaternion.copy(node.restQuat).multiply(_quatA);
}

/**
 * Instantiates Madara's Susanoo across all three canonical stages:
 * 1) `ribcage` — Protective glowing chakra ribcage + twin skeletal gauntleted arms (Madara stands inside ground center)
 * 2) `armored` — Half-body Armored Tengu Samurai with dual wavy chakra katanas (Madara hovers inside translucent chest core)
 * 3) `perfect` — Colossal full-body Samurai Titan with walking armored legs, back wings, twin katanas & Madara inside the forehead diamond crystal
 */
export async function buildSusanooRig(
  variant: SusanooColorVariant = 'madara',
  stage: SusanooStage = 'armored'
): Promise<SusanooRig> {
  if (stage === 'ribcage') {
    return buildRibcageSusanooRig(variant);
  }
  if (stage === 'armored') {
    return buildPureSkeletalSusanooRig(variant);
  }
  if (stage === 'muscular') {
    return buildMuscularDemonSusanooRig(variant);
  }
  if (stage === 'perfect') {
    return buildPerfectSusanooRig(variant);
  }

  const palette = SUSANOO_PALETTES[variant];
  const templateData = await preloadSusanooModel();
  if (!templateData) {
    return buildPureSkeletalSusanooRig(variant);
  }

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Pilot socket inside the translucent chest chamber
  const pilotAnchor = new THREE.Object3D();
  pilotAnchor.position.set(0, 1.15, 0.08);
  bodyGroup.add(pilotAnchor);

  const modelClone = templateData.scene.clone(true);
  const materials: THREE.MeshStandardMaterial[] = [];

  modelClone.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => {
          const mat = createChakraArmorMaterial(m, variant, SUSANOO_BASE_OPACITY, 0.28, 0.2);
          materials.push(mat);
          return mat;
        });
      } else {
        const mat = createChakraArmorMaterial(mesh.material, variant, SUSANOO_BASE_OPACITY, 0.28, 0.2);
        mesh.material = mat;
        materials.push(mat);
      }
    }
  });

  bodyGroup.add(modelClone);
  const articulation = collectSusanooArticulation(modelClone);

  // Twin Madara wavy chakra katanas attached to right & left arms/hands
  const katanaGeo = createWavyKatanaGeometry(4.1, 0.42);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: palette.blade,
    emissive: palette.emissive,
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const rightBladeMesh = new THREE.Mesh(katanaGeo, bladeMat);
  rightBladeMesh.renderOrder = 21;
  rightBladeMesh.frustumCulled = false;

  const leftBladeMesh = new THREE.Mesh(katanaGeo, bladeMat);
  leftBladeMesh.renderOrder = 21;
  leftBladeMesh.frustumCulled = false;

  const rightSwordPivot = new THREE.Group();
  if (articulation.rightHand) {
    articulation.rightHand.obj.add(rightSwordPivot);
    rightSwordPivot.position.set(0, 0, 0);
    rightBladeMesh.position.set(0, 0.1, 0.2);
  } else if (articulation.rightForearm) {
    articulation.rightForearm.obj.add(rightSwordPivot);
    rightSwordPivot.position.set(0, 0, 0.35);
    rightBladeMesh.position.set(0, 0.08, 0.2);
  } else {
    bodyGroup.add(rightSwordPivot);
    rightSwordPivot.position.set(-1.95, 2.75, 0.45);
    rightBladeMesh.position.set(0, 0, 0.2);
  }
  rightSwordPivot.add(rightBladeMesh);

  const leftSwordPivot = new THREE.Group();
  if (articulation.leftHand) {
    articulation.leftHand.obj.add(leftSwordPivot);
    leftSwordPivot.position.set(0, 0, 0);
    leftBladeMesh.position.set(0, 0.1, 0.2);
  } else if (articulation.leftForearm) {
    articulation.leftForearm.obj.add(leftSwordPivot);
    leftSwordPivot.position.set(0, 0, 0.35);
    leftBladeMesh.position.set(0, 0.08, 0.2);
  } else {
    bodyGroup.add(leftSwordPivot);
    leftSwordPivot.position.set(1.95, 2.75, 0.45);
    leftBladeMesh.position.set(0, 0, 0.2);
  }
  leftSwordPivot.add(leftBladeMesh);

  let mixer: THREE.AnimationMixer | null = null;
  if (templateData.clips.length > 0) {
    mixer = new THREE.AnimationMixer(modelClone);
    const action = mixer.clipAction(templateData.clips[0]);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }

  const interiorLight = new THREE.PointLight(palette.aura, 2.4, 7.2);
  interiorLight.position.set(0, 1.6, 0.15);
  bodyGroup.add(interiorLight);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: palette.aura,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 3.2, 0);
  auraSprite.scale.set(6.0, 6.0, 1);
  auraSprite.renderOrder = 19;
  bodyGroup.add(auraSprite);

  const fitToTargetWorldHeight = (targetWorldHeight: number) => {
    const safeTargetH = Math.max(3.5, targetWorldHeight || SUSANOO_DEFAULT_HEIGHT);
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    bodyGroup.position.set(0, 0, 0);
    bodyGroup.rotation.set(0, 0, 0);
    modelClone.scale.setScalar(1);
    modelClone.position.set(0, 0, 0);
    modelClone.rotation.set(0, 0, 0);
    modelClone.updateMatrixWorld(true);

    _boxA.setFromObject(modelClone);
    _boxA.getSize(_sizeA);
    const currentWorldH = _sizeA.y > 0.05 && Number.isFinite(_sizeA.y) ? _sizeA.y : 1;
    const scaleFactor = safeTargetH / currentWorldH;
    modelClone.scale.setScalar(scaleFactor);
    modelClone.updateMatrixWorld(true);

    _boxA.setFromObject(modelClone);
    _boxA.getCenter(_centerA);
    modelClone.position.x = -_centerA.x;
    modelClone.position.z = -_centerA.z;
    modelClone.position.y = -_boxA.min.y - 0.15;
    modelClone.updateMatrixWorld(true);

    pilotAnchor.position.set(0, safeTargetH * 0.2, 0.08);
    auraSprite.position.set(0, safeTargetH * 0.45, 0);
    const baseAuraSize = safeTargetH * 0.88;
    auraSprite.scale.set(baseAuraSize, baseAuraSize, 1);
  };

  let currentOpacity = SUSANOO_BASE_OPACITY;
  const setOpacity = (opacity: number) => {
    currentOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    for (let i = 0; i < materials.length; i++) {
      materials[i].opacity = currentOpacity;
    }
    const ratio = currentOpacity / SUSANOO_BASE_OPACITY;
    auraMat.opacity = ratio * 0.16;
    bladeMat.opacity = ratio * 0.58;
    interiorLight.intensity = ratio * 2.4;
  };

  const update = (
    dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity = 1,
    _stridePhase = 0,
    _strideAmount = 0,
    comboStep = 0
  ) => {
    if (mixer) {
      mixer.update(dt);
    }
    bodyGroup.position.set(0, Math.sin(elapsed * 2.1) * 0.06 * intensity, 0);

    const idleSwayZ = Math.sin(elapsed * 1.45) * 0.038 * intensity;
    const idleSwayY = Math.sin(elapsed * 1.1) * 0.045 * intensity;
    const idleBreathX = Math.sin(elapsed * 1.85) * 0.026 * intensity;

    const slash = computeComboSlashKinematics(slashProgress, comboStep);

    const leanX = THREE.MathUtils.clamp(forwardLeanRad, -0.1, 0.34);
    bodyGroup.rotation.set(
      leanX + idleBreathX + slash.torsoPitch * 0.42,
      idleSwayY + slash.torsoYaw * 0.55,
      idleSwayZ
    );

    for (let i = 0; i < articulation.spines.length; i++) {
      const weight = i === 0 ? 0.55 : 0.72;
      applyAdditiveNodeRotation(
        articulation.spines[i],
        (slash.torsoPitch + idleBreathX) * weight,
        (slash.torsoYaw + idleSwayY) * weight,
        idleSwayZ * 0.5
      );
    }

    if (articulation.rightShoulder) {
      applyAdditiveNodeRotation(
        articulation.rightShoulder,
        slash.rightArmPitch * 0.25,
        slash.rightArmYaw * 0.35,
        0
      );
    }
    if (articulation.rightUpperArm) {
      applyAdditiveNodeRotation(
        articulation.rightUpperArm,
        slash.rightArmPitch + Math.sin(elapsed * 1.6) * 0.04,
        slash.rightArmYaw,
        0.08 * Math.sin(elapsed * 1.4)
      );
    }
    if (articulation.rightForearm) {
      applyAdditiveNodeRotation(
        articulation.rightForearm,
        slash.rightArmPitch * 0.35,
        slash.rightForearmYaw,
        0
      );
    }
    if (articulation.rightHand) {
      applyAdditiveNodeRotation(articulation.rightHand, 0, slash.rightForearmYaw * 0.45, 0);
    } else if (!articulation.rightUpperArm && !articulation.rightForearm) {
      rightSwordPivot.rotation.set(slash.rightArmPitch, slash.rightArmYaw, 0);
    }

    if (articulation.leftShoulder) {
      applyAdditiveNodeRotation(
        articulation.leftShoulder,
        slash.leftArmPitch * 0.25,
        slash.leftArmYaw * 0.35,
        0
      );
    }
    if (articulation.leftUpperArm) {
      applyAdditiveNodeRotation(
        articulation.leftUpperArm,
        slash.leftArmPitch - Math.sin(elapsed * 1.6) * 0.04,
        slash.leftArmYaw,
        -0.08 * Math.sin(elapsed * 1.4)
      );
    }
    if (articulation.leftForearm) {
      applyAdditiveNodeRotation(
        articulation.leftForearm,
        slash.leftArmPitch * 0.35,
        slash.leftForearmYaw,
        0
      );
    }
    if (articulation.leftHand) {
      applyAdditiveNodeRotation(articulation.leftHand, 0, slash.leftForearmYaw * 0.45, 0);
    } else if (!articulation.leftUpperArm && !articulation.leftForearm) {
      leftSwordPivot.rotation.set(slash.leftArmPitch, slash.leftArmYaw, 0);
    }

    const glowPulse = 1.55 + Math.sin(elapsed * 7.2) * 0.22 * intensity + slash.swordGlow * 0.7;
    for (let i = 0; i < materials.length; i++) {
      materials[i].emissiveIntensity = glowPulse;
    }

    const alphaRatio = currentOpacity / SUSANOO_BASE_OPACITY;
    bladeMat.opacity = Math.min(0.95, (0.48 + slash.swordGlow * 0.5) * alphaRatio);
    bladeMat.emissiveIntensity = 1.95 + slash.swordGlow * 2.2;
    auraMat.opacity = Math.min(
      0.78,
      (0.42 + Math.sin(elapsed * 6.4) * 0.14 + slash.swordGlow * 0.16) * alphaRatio * intensity
    );
  };

  const dispose = () => {
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(modelClone);
    }
    katanaGeo.dispose();
    bladeMat.dispose();
    auraMat.dispose();
    auraTex.dispose();
    for (let i = 0; i < materials.length; i++) {
      materials[i].dispose();
    }
  };

  return {
    stage: 'armored',
    root,
    bodyGroup,
    pilotAnchor,
    materials,
    auraSprite,
    baseOpacity: SUSANOO_BASE_OPACITY,
    fitToTargetWorldHeight,
    setOpacity,
    update,
    dispose,
  };
}

/**
 * Stage 1: Royal Blue Ribcage Susanoo — 4-tier chamfered rib bands, rear shoulder struts,
 * ball-and-socket joints, dual-bone forearms, broad faceted palms, and 5 articulated clawed fingers.
 */
function buildRibcageSusanooRig(variant: SusanooColorVariant = 'madara'): SusanooRig {
  const isItachi = variant === 'itachi';
  const primaryColor = isItachi ? 0xea580c : 0x1d4ed8;
  const emissiveBase = isItachi ? 0x7c2d12 : 0x172554;
  const accentColor = isItachi ? 0xf97316 : 0x2563eb;
  const glowEmissive = isItachi ? 0xc2410c : 0x1e40af;
  const auraColor = isItachi ? 0xff4500 : 0x3b82f6;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Pilot stands centered inside the open front window of the ribcage on ground level
  const pilotAnchor = new THREE.Object3D();
  pilotAnchor.position.set(0, 0, 0);
  bodyGroup.add(pilotAnchor);

  const rigMeshGroup = new THREE.Group();
  bodyGroup.add(rigMeshGroup);

  const ribsGroup = new THREE.Group();
  rigMeshGroup.add(ribsGroup);

  const disposables: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const boneMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: emissiveBase,
    emissiveIntensity: 1.05,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    roughness: 0.28,
    metalness: 0.22,
    depthWrite: true,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: glowEmissive,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    roughness: 0.22,
    metalness: 0.28,
    depthWrite: true,
  });
  materials.push(boneMat, glowMat);

  const createCurvedRibPlateGeometry = (
    rx: number,
    rz: number,
    radialThickness: number,
    height: number
  ): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    const aStart = 0.26;
    const aEnd = Math.PI - 0.24;
    const segs = 16;

    for (let i = 0; i <= segs; i++) {
      const a = THREE.MathUtils.lerp(aStart, aEnd, i / segs);
      const px = Math.sin(a) * rx;
      const pz = Math.cos(a) * rz;
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    const inRx = Math.max(0.2, rx - radialThickness);
    const inRz = Math.max(0.2, rz - radialThickness);
    for (let i = segs; i >= 0; i--) {
      const a = THREE.MathUtils.lerp(aStart, aEnd, i / segs);
      const px = Math.sin(a) * inRx;
      const pz = Math.cos(a) * inRz;
      shape.lineTo(px, pz);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: height,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.032,
      bevelSegments: 2,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, height * 0.5, 0);
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  const createFacetedPalmGeometry = (): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    // Broad trapezoidal dorsal palm widening cleanly from wrist to knuckles
    shape.moveTo(-0.18, 0);
    shape.lineTo(0.18, 0);
    shape.lineTo(0.46, 0.72);
    shape.lineTo(0.42, 0.92);
    shape.lineTo(-0.42, 0.92);
    shape.lineTo(-0.46, 0.72);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.048,
      bevelSegments: 1,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.11, 0);
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  const UP_VEC = new THREE.Vector3(0, 1, 0);
  const attachStrutBetween = (
    parent: THREE.Object3D,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    r1: number,
    r2: number,
    mat: THREE.Material,
    radialSegs = 10
  ) => {
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const len = diff.length();
    if (len < 0.001) return null;
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r2, r1, len, radialSegs)),
      mat
    );
    mesh.position.copy(p1).addScaledVector(diff, 0.5);
    mesh.quaternion.setFromUnitVectors(UP_VEC, diff.normalize());
    parent.add(mesh);
    return mesh;
  };

  // 4 stacked pairs of beveled flat rib bands wrapping around Madara (open front & back)
  const ribSpecs = [
    { y: 0.68, rx: 1.24, rz: 1.06, thick: 0.19, height: 0.22, tilt: 0.06 },
    { y: 1.22, rx: 1.32, rz: 1.12, thick: 0.20, height: 0.23, tilt: 0.05 },
    { y: 1.76, rx: 1.26, rz: 1.06, thick: 0.19, height: 0.22, tilt: 0.04 },
    { y: 2.28, rx: 1.12, rz: 0.94, thick: 0.18, height: 0.20, tilt: 0.02 },
  ];
  for (let i = 0; i < ribSpecs.length; i++) {
    const spec = ribSpecs[i];
    const ribGeo = createCurvedRibPlateGeometry(spec.rx, spec.rz, spec.thick, spec.height);
    for (const side of [-1, 1] as const) {
      const rib = new THREE.Mesh(ribGeo, boneMat);
      rib.position.set(0, spec.y, 0);
      rib.rotation.x = spec.tilt;
      rib.scale.x = side;
      ribsGroup.add(rib);
    }
  }

  // Rear cylindrical spinal sockets & horizontal shoulder linkage struts (exact match to Blender sculpt)
  const rearSocketGeo = trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 12));
  const rearCapGeo = trackGeo(new THREE.SphereGeometry(0.17, 12, 10));
  const jointSphereGeo = trackGeo(new THREE.SphereGeometry(0.185, 14, 12));
  const jointRingGeo = trackGeo(new THREE.TorusGeometry(0.19, 0.032, 8, 18));
  const elbowSphereGeo = trackGeo(new THREE.SphereGeometry(0.16, 14, 12));
  const wristSphereGeo = trackGeo(new THREE.SphereGeometry(0.145, 12, 10));
  const palmGeo = createFacetedPalmGeometry();
  const knuckleGeo = trackGeo(new THREE.SphereGeometry(0.078, 10, 8));
  const phalanxProxGeo = trackGeo(new THREE.CylinderGeometry(0.058, 0.068, 0.38, 7));
  const phalanxMidGeo = trackGeo(new THREE.CylinderGeometry(0.046, 0.056, 0.30, 7));
  const clawTipGeo = trackGeo(new THREE.ConeGeometry(0.062, 0.34, 5));

  for (const side of [-1, 1] as const) {
    const rearPos = new THREE.Vector3(side * 0.62, 2.28, -0.86);
    const shoulderMountPos = new THREE.Vector3(side * 1.38, 2.24, 0.24);

    const rearSocket = new THREE.Mesh(rearSocketGeo, glowMat);
    rearSocket.position.set(rearPos.x, rearPos.y + 0.06, rearPos.z);
    ribsGroup.add(rearSocket);

    const rearBall = new THREE.Mesh(rearCapGeo, glowMat);
    rearBall.position.copy(rearPos);
    ribsGroup.add(rearBall);

    attachStrutBetween(ribsGroup, rearPos, shoulderMountPos, 0.088, 0.088, glowMat, 10);
  }

  // Articulated Skeletal Arms: Upper Arm -> Elbow -> Dual Parallel Forearm Bones -> Faceted Palm -> 5 Clawed Fingers
  const buildSkeletalClawArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 1.38, 2.24, 0.24);
    rigMeshGroup.add(shoulderPivot);

    const shoulderBall = new THREE.Mesh(jointSphereGeo, glowMat);
    shoulderPivot.add(shoulderBall);

    const shoulderCollar = new THREE.Mesh(jointRingGeo, boneMat);
    shoulderCollar.rotation.y = Math.PI * 0.5;
    shoulderPivot.add(shoulderCollar);

    const upperStart = new THREE.Vector3(0, 0, 0);
    const elbowPos = new THREE.Vector3(side * 0.58, -0.22, 1.48);
    attachStrutBetween(shoulderPivot, upperStart, elbowPos, 0.085, 0.075, boneMat, 10);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.copy(elbowPos);
    shoulderPivot.add(forearmPivot);

    const elbowBall = new THREE.Mesh(elbowSphereGeo, glowMat);
    forearmPivot.add(elbowBall);

    const elbowRing = new THREE.Mesh(jointRingGeo, boneMat);
    elbowRing.scale.setScalar(0.86);
    elbowRing.rotation.x = Math.PI * 0.45;
    forearmPivot.add(elbowRing);

    const wristPos = new THREE.Vector3(side * -0.14, 0.14, 1.56);

    // Dual parallel Radius & Ulna forearm bones (exact signature detail from the reference model)
    const offsetA = new THREE.Vector3(side * 0.065, 0.042, 0);
    const offsetB = new THREE.Vector3(-side * 0.065, -0.042, 0);
    attachStrutBetween(
      forearmPivot,
      new THREE.Vector3().copy(offsetA).multiplyScalar(0.7),
      new THREE.Vector3().copy(wristPos).add(offsetA),
      0.056,
      0.048,
      boneMat,
      8
    );
    attachStrutBetween(
      forearmPivot,
      new THREE.Vector3().copy(offsetB).multiplyScalar(0.7),
      new THREE.Vector3().copy(wristPos).add(offsetB),
      0.056,
      0.048,
      boneMat,
      8
    );

    const handPivot = new THREE.Group();
    handPivot.position.copy(wristPos);
    // Natural menacing claw roll matching the reference silhouette
    handPivot.rotation.set(-0.08, side * -0.18, side * -0.44);
    forearmPivot.add(handPivot);

    const wristBall = new THREE.Mesh(wristSphereGeo, glowMat);
    handPivot.add(wristBall);

    const palmMesh = new THREE.Mesh(palmGeo, boneMat);
    handPivot.add(palmMesh);

    const fingerCurlPivots: Array<{ prox: THREE.Group; mid: THREE.Group; baseAngle: number }> = [];

    // 4 Articulated Fingers along the broad knuckle edge
    const fingerOffsets = [
      { x: -0.32, z: 0.90, scale: 0.92, splay: -0.18, curl: 0.24 },
      { x: -0.11, z: 0.94, scale: 1.04, splay: -0.05, curl: 0.28 },
      { x: 0.11, z: 0.94, scale: 1.0, splay: 0.06, curl: 0.32 },
      { x: 0.32, z: 0.89, scale: 0.88, splay: 0.18, curl: 0.38 },
    ];
    for (let f = 0; f < fingerOffsets.length; f++) {
      const fSpec = fingerOffsets[f];
      const knuckle = new THREE.Mesh(knuckleGeo, glowMat);
      knuckle.position.set(fSpec.x, 0.02, fSpec.z);
      handPivot.add(knuckle);

      const proxPivot = new THREE.Group();
      proxPivot.position.set(fSpec.x, 0.02, fSpec.z);
      proxPivot.rotation.set(fSpec.curl, fSpec.splay, 0);
      proxPivot.scale.setScalar(fSpec.scale);
      handPivot.add(proxPivot);

      const proxMesh = new THREE.Mesh(phalanxProxGeo, boneMat);
      proxMesh.rotation.x = Math.PI * 0.5;
      proxMesh.position.set(0, 0, 0.19);
      proxPivot.add(proxMesh);

      const midJoint = new THREE.Mesh(knuckleGeo, glowMat);
      midJoint.scale.setScalar(0.76);
      midJoint.position.set(0, 0, 0.38);
      proxPivot.add(midJoint);

      const midPivot = new THREE.Group();
      midPivot.position.set(0, 0, 0.38);
      midPivot.rotation.x = 0.52;
      proxPivot.add(midPivot);

      const midMesh = new THREE.Mesh(phalanxMidGeo, boneMat);
      midMesh.rotation.x = Math.PI * 0.5;
      midMesh.position.set(0, 0, 0.15);
      midPivot.add(midMesh);

      const distJoint = new THREE.Mesh(knuckleGeo, glowMat);
      distJoint.scale.setScalar(0.62);
      distJoint.position.set(0, 0, 0.30);
      midPivot.add(distJoint);

      const claw = new THREE.Mesh(clawTipGeo, glowMat);
      claw.rotation.x = Math.PI * 0.5 + 0.42;
      claw.position.set(0, -0.05, 0.44);
      midPivot.add(claw);

      fingerCurlPivots.push({ prox: proxPivot, mid: midPivot, baseAngle: fSpec.curl });
    }

    // Opposable Thumb on the inner side of the palm
    const thumbSide = -side;
    const thumbBase = new THREE.Vector3(thumbSide * 0.36, -0.04, 0.36);
    const thumbKnuckle = new THREE.Mesh(knuckleGeo, glowMat);
    thumbKnuckle.position.copy(thumbBase);
    handPivot.add(thumbKnuckle);

    const thumbProxPivot = new THREE.Group();
    thumbProxPivot.position.copy(thumbBase);
    thumbProxPivot.rotation.set(0.32, thumbSide * 0.65, 0);
    handPivot.add(thumbProxPivot);

    const thumbProxMesh = new THREE.Mesh(phalanxProxGeo, boneMat);
    thumbProxMesh.scale.set(1.05, 0.85, 1.05);
    thumbProxMesh.rotation.x = Math.PI * 0.5;
    thumbProxMesh.position.set(0, 0, 0.16);
    thumbProxPivot.add(thumbProxMesh);

    const thumbMidPivot = new THREE.Group();
    thumbMidPivot.position.set(0, 0, 0.33);
    thumbMidPivot.rotation.x = 0.46;
    thumbProxPivot.add(thumbMidPivot);

    const thumbClaw = new THREE.Mesh(clawTipGeo, glowMat);
    thumbClaw.rotation.x = Math.PI * 0.5 + 0.32;
    thumbClaw.position.set(0, -0.03, 0.16);
    thumbMidPivot.add(thumbClaw);

    fingerCurlPivots.push({ prox: thumbProxPivot, mid: thumbMidPivot, baseAngle: 0.32 });

    return { shoulderPivot, forearmPivot, handPivot, fingerCurlPivots };
  };

  const rightArm = buildSkeletalClawArm(-1);
  const leftArm = buildSkeletalClawArm(1);

  // Subtle asymmetric idle poise matching the screenshot's dynamic claw readiness
  rightArm.shoulderPivot.rotation.set(0.12, -0.08, 0.08);
  leftArm.shoulderPivot.rotation.set(-0.22, 0.12, -0.08);

  rigMeshGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.frustumCulled = false;
      obj.renderOrder = 20;
    }
  });

  const interiorLight = new THREE.PointLight(auraColor, 2.5, 7.5);
  interiorLight.position.set(0, 1.65, 0.35);
  bodyGroup.add(interiorLight);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: auraColor,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 1.85, 0);
  auraSprite.scale.set(5.2, 5.2, 1);
  auraSprite.renderOrder = 19;
  bodyGroup.add(auraSprite);

  const fitToTargetWorldHeight = (targetWorldHeight: number) => {
    // Scale strictly from the ribcage height so the 4 rib bands frame Madara cleanly regardless of raised hands
    const safeRibsTargetH = Math.max(2.1, (targetWorldHeight || 3.85) * 0.66);
    rigMeshGroup.scale.setScalar(1);
    rigMeshGroup.position.set(0, 0, 0);
    rigMeshGroup.updateMatrixWorld(true);
    _boxA.setFromObject(ribsGroup);
    _boxA.getSize(_sizeA);
    const scaleFactor = safeRibsTargetH / Math.max(0.5, _sizeA.y);
    rigMeshGroup.scale.setScalar(scaleFactor);
    rigMeshGroup.position.y = Math.max(0.12, 0.68 - _boxA.min.y * scaleFactor);
    pilotAnchor.position.set(0, 0, 0);
    auraSprite.position.set(0, safeRibsTargetH * 0.72, 0.3);
    auraSprite.scale.set(safeRibsTargetH * 1.9, safeRibsTargetH * 1.9, 1);
  };

  let currentOpacity = 0.88;
  const setOpacity = (opacity: number) => {
    currentOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    boneMat.opacity = currentOpacity;
    glowMat.opacity = Math.min(0.96, currentOpacity * 1.05);
    const ratio = currentOpacity / 0.88;
    auraMat.opacity = ratio * 0.26;
    interiorLight.intensity = ratio * 2.5;
  };

  const update = (
    _dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity = 1,
    _stridePhase = 0,
    _strideAmount = 0,
    comboStep = 0
  ) => {
    const slash = computeComboSlashKinematics(slashProgress, comboStep);
    const pulse = 1 + Math.sin(elapsed * 4.8) * 0.022 * intensity;
    rigMeshGroup.scale.x = rigMeshGroup.scale.y * pulse;

    bodyGroup.rotation.set(
      THREE.MathUtils.clamp(forwardLeanRad, -0.08, 0.28) + slash.torsoPitch * 0.55,
      Math.sin(elapsed * 1.3) * 0.035 + slash.torsoYaw * 0.65,
      Math.sin(elapsed * 1.6) * 0.025
    );

    // Idle asymmetrical claw poise layered smoothly with Armored-parity 3-hit slash kinematics
    rightArm.shoulderPivot.rotation.set(
      0.10 + slash.rightArmPitch + Math.sin(elapsed * 2.2) * 0.055,
      -0.08 + slash.rightArmYaw,
      0.08
    );
    rightArm.forearmPivot.rotation.set(slash.rightArmPitch * 0.35, slash.rightForearmYaw, 0);

    leftArm.shoulderPivot.rotation.set(
      -0.18 + slash.leftArmPitch - Math.sin(elapsed * 2.2) * 0.055,
      0.10 + slash.leftArmYaw,
      -0.08
    );
    leftArm.forearmPivot.rotation.set(slash.leftArmPitch * 0.35, slash.leftForearmYaw, 0);

    // Subtle breathing flex & combat clench on all 5 clawed fingers
    const clawClench = slash.swordGlow * 0.42 + Math.sin(elapsed * 3.1) * 0.06;
    for (let i = 0; i < rightArm.fingerCurlPivots.length; i++) {
      const f = rightArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clawClench;
      f.mid.rotation.x = 0.50 + clawClench * 0.85;
    }
    for (let i = 0; i < leftArm.fingerCurlPivots.length; i++) {
      const f = leftArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clawClench;
      f.mid.rotation.x = 0.50 + clawClench * 0.85;
    }

    boneMat.emissiveIntensity = 1.0 + Math.sin(elapsed * 6.0) * 0.16 + slash.swordGlow * 0.65;
    glowMat.emissiveIntensity = 1.35 + Math.sin(elapsed * 7.5) * 0.24 + slash.swordGlow * 1.15;
    const alphaRatio = currentOpacity / 0.88;
    auraMat.opacity = Math.min(0.75, (0.30 + slash.swordGlow * 0.24) * alphaRatio * intensity);
  };

  const dispose = () => {
    auraMat.dispose();
    auraTex.dispose();
    boneMat.dispose();
    glowMat.dispose();
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    stage: 'ribcage',
    root,
    bodyGroup,
    pilotAnchor,
    materials,
    auraSprite,
    baseOpacity: 0.88,
    fitToTargetWorldHeight,
    setOpacity,
    update,
    dispose,
  };
}

function createChakraMuscleTexture(variant: SusanooColorVariant = 'madara'): THREE.CanvasTexture {
  const isItachi = variant === 'itachi';
  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isItachi ? '#6b1908' : '#0f2266';
    ctx.fillRect(0, 0, width, height);

    // Striated longitudinal chakra muscle fibers
    const strandCount = 34;
    for (let i = 0; i < strandCount; i++) {
      const baseX = (i / strandCount) * width;
      const isHighlight = i % 3 === 0;
      const isDeepGroove = i % 3 === 1;
      ctx.strokeStyle = isItachi
        ? isHighlight
          ? 'rgba(253, 186, 116, 0.78)'
          : isDeepGroove
            ? 'rgba(67, 14, 5, 0.88)'
            : 'rgba(234, 88, 12, 0.82)'
        : isHighlight
          ? 'rgba(147, 197, 253, 0.72)'
          : isDeepGroove
            ? 'rgba(6, 15, 56, 0.88)'
            : 'rgba(37, 99, 235, 0.78)';
      ctx.lineWidth = isHighlight ? 2.4 : isDeepGroove ? 3.2 : 4.2;
      ctx.beginPath();
      for (let y = 0; y <= height; y += 8) {
        const wave = Math.sin((y / height) * Math.PI * 2 + i * 0.55) * 4.5;
        const px = baseX + wave;
        if (y === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }

    // Cross-tendon micro sheen bands
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (isItachi) {
      grad.addColorStop(0, 'rgba(254, 215, 170, 0.36)');
      grad.addColorStop(0.18, 'rgba(154, 52, 18, 0.06)');
      grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.16)');
      grad.addColorStop(0.82, 'rgba(154, 52, 18, 0.06)');
      grad.addColorStop(1, 'rgba(254, 215, 170, 0.36)');
    } else {
      grad.addColorStop(0, 'rgba(191, 219, 254, 0.34)');
      grad.addColorStop(0.18, 'rgba(30, 58, 138, 0.05)');
      grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.14)');
      grad.addColorStop(0.82, 'rgba(30, 58, 138, 0.05)');
      grad.addColorStop(1, 'rgba(191, 219, 254, 0.34)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1.5);
  tex.needsUpdate = true;
  return tex;
}

function createFresnelBlueMaterial(options: {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  rimColor: number;
  rimPower: number;
  rimIntensity: number;
  opacity: number;
  roughness?: number;
  metalness?: number;
  depthWrite?: boolean;
  map?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
}): { mat: THREE.MeshStandardMaterial; uniforms: { uRimIntensity: { value: number } } } {
  const uniforms = {
    uRimColor: { value: new THREE.Color(options.rimColor) },
    uRimPower: { value: options.rimPower },
    uRimIntensity: { value: options.rimIntensity },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: options.color,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    map: options.map ?? null,
    emissiveMap: options.emissiveMap ?? null,
    transparent: true,
    opacity: options.opacity,
    side: THREE.DoubleSide,
    roughness: options.roughness ?? 0.2,
    metalness: options.metalness ?? 0.16,
    depthWrite: options.depthWrite ?? true,
  });
  mat.customProgramCacheKey = () => 'skeletal-muscular-susanoo-fresnel-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimPower = uniforms.uRimPower;
    shader.uniforms.uRimIntensity = uniforms.uRimIntensity;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 viewDirF = normalize(vViewPosition);
float ndotvF = clamp(abs(dot(normalize(normal), viewDirF)), 0.0, 1.0);
float fresnelF = pow(1.0 - ndotvF, uRimPower);
totalEmissiveRadiance += uRimColor * fresnelF * uRimIntensity;
diffuseColor.a = clamp(diffuseColor.a + fresnelF * 0.42, 0.0, 0.98);
`
      );
  };
  return { mat, uniforms };
}

/**
 * Stage 2: Pure Royal Blue Skeletal Susanoo (Faithful to download (1).jpeg) —
 * Giant horned skull with empty hollow eye sockets (NO red eye), central 3-plate square sternum,
 * S-curved collarbones with curled shoulder loops, 6-tier glowing ribcage framing Madara at ground center,
 * and twin reaching giant 5-fingered skeletal hands.
 */
function buildPureSkeletalSusanooRig(variant: SusanooColorVariant = 'madara'): SusanooRig {
  const isItachi = variant === 'itachi';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Pilot stands planted at ground level inside the center of the glowing ribcage
  const pilotAnchor = new THREE.Object3D();
  pilotAnchor.position.set(0, 0, 0);
  root.add(pilotAnchor);

  const rigMeshGroup = new THREE.Group();
  bodyGroup.add(rigMeshGroup);

  const disposables: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const mainShell = createFresnelBlueMaterial({
    color: isItachi ? 0xea580c : 0x1d4ed8,
    emissive: isItachi ? 0x7c2d12 : 0x172554,
    emissiveIntensity: 0.76,
    rimColor: isItachi ? 0xfdba74 : 0x60a5fa,
    rimPower: 1.95,
    rimIntensity: 2.65,
    opacity: 0.86,
    roughness: 0.16,
    metalness: 0.14,
    depthWrite: true,
  });
  const trimShell = createFresnelBlueMaterial({
    color: isItachi ? 0xf97316 : 0x3b82f6,
    emissive: isItachi ? 0xea580c : 0x2563eb,
    emissiveIntensity: 1.35,
    rimColor: isItachi ? 0xfef08a : 0xe0f2fe,
    rimPower: 1.5,
    rimIntensity: 2.95,
    opacity: 0.92,
    roughness: 0.14,
    metalness: 0.2,
    depthWrite: true,
  });
  const cavityShell = createFresnelBlueMaterial({
    color: isItachi ? 0x140502 : 0x030712,
    emissive: isItachi ? 0x1c0703 : 0x050b24,
    emissiveIntensity: 0.15,
    rimColor: isItachi ? 0xf97316 : 0x38bdf8,
    rimPower: 3.0,
    rimIntensity: 0.45,
    opacity: 0.94,
    roughness: 0.65,
    metalness: 0.05,
    depthWrite: true,
  });

  const bodyMat = mainShell.mat;
  const rimMat = trimShell.mat;
  const cavityMat = cavityShell.mat;
  materials.push(bodyMat, rimMat, cavityMat);

  const torsoPivot = new THREE.Group();
  rigMeshGroup.add(torsoPivot);

  // 1. Rear vertical spine anchoring the 6-tier ribcage
  const rearSpineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.36, -1.06),
    new THREE.Vector3(0, 1.25, -1.12),
    new THREE.Vector3(0, 2.25, -1.02),
    new THREE.Vector3(0, 3.02, -0.45),
    new THREE.Vector3(0, 3.35, 0.05),
  ]);
  torsoPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(rearSpineCurve, 22, 0.16, 10, false)), bodyMat)
  );

  // 2. 6-Tier Glowing Royal Blue Ribcage wrapping around Madara
  const ribHeights = [0.44, 0.80, 1.16, 1.52, 1.88, 2.24];
  const ribWidths = [0.94, 1.02, 1.06, 1.04, 0.98, 0.88];
  const ribCapGeo = trackGeo(new THREE.SphereGeometry(0.108, 10, 8));

  for (let i = 0; i < ribHeights.length; i++) {
    const ry = ribHeights[i];
    const rw = ribWidths[i];
    const frontGapX = i < 4 ? 0.34 : 0.24;
    for (const side of [-1, 1] as const) {
      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.14, ry + 0.09, -1.02),
        new THREE.Vector3(side * (0.98 * rw), ry + 0.04, -0.78),
        new THREE.Vector3(side * (1.42 * rw), ry, 0.04),
        new THREE.Vector3(side * (1.08 * rw), ry - 0.03, 0.86),
        new THREE.Vector3(side * frontGapX, ry - 0.05, 1.06),
      ]);
      const ribMesh = new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(ribCurve, 20, 0.096, 10, false)),
        bodyMat
      );
      torsoPivot.add(ribMesh);

      const frontCap = new THREE.Mesh(ribCapGeo, rimMat);
      frontCap.position.set(side * frontGapX, ry - 0.05, 1.06);
      torsoPivot.add(frontCap);
    }
  }

  // 3. Central Front Sternum Column with 3 Dark-Centered Square Plates
  const sternumBar = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11, 0.10, 1.16, 10)),
    bodyMat
  );
  sternumBar.position.set(0, 2.16, 1.04);
  torsoPivot.add(sternumBar);

  const plateFrameGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.28, 0.08));
  const plateInnerGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.16, 0.095));
  const plateDotGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.055, 0.105));
  for (const py of [1.74, 2.10, 2.46]) {
    const frame = new THREE.Mesh(plateFrameGeo, rimMat);
    frame.position.set(0, py, 1.08);
    torsoPivot.add(frame);

    const inner = new THREE.Mesh(plateInnerGeo, cavityMat);
    inner.position.set(0, py, 1.084);
    torsoPivot.add(inner);

    const dot = new THREE.Mesh(plateDotGeo, rimMat);
    dot.position.set(0, py, 1.088);
    torsoPivot.add(dot);
  }

  // 4. Twin S-Curved Collarbones (Clavicles) & Curled Shoulder Loops
  const loopGeo = trackGeo(new THREE.TorusGeometry(0.22, 0.075, 10, 20, Math.PI * 1.48));
  for (const side of [-1, 1] as const) {
    const clavicleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.14, 2.66, 1.02),
      new THREE.Vector3(side * 0.68, 2.74, 0.92),
      new THREE.Vector3(side * 1.24, 2.80, 0.64),
      new THREE.Vector3(side * 1.68, 2.64, 0.28),
    ]);
    torsoPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(clavicleCurve, 18, 0.115, 10, false)), bodyMat)
    );

    const shoulderLoop = new THREE.Mesh(loopGeo, rimMat);
    shoulderLoop.position.set(side * 1.18, 2.86, 0.56);
    shoulderLoop.rotation.set(0.25, side * -0.45, side * 0.65);
    torsoPivot.add(shoulderLoop);
  }

  // 5. Cervical Neck & Towering Horned Skull (Both Eyes Empty / Hollow — No Red Eye)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 3.04, 0.22);
  headPivot.rotation.set(0.14, 0, 0);
  torsoPivot.add(headPivot);

  const neckColumn = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 0.68, 12)),
    bodyMat
  );
  neckColumn.position.set(0, 0.02, -0.14);
  headPivot.add(neckColumn);

  const cranium = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.86, 26, 20)), bodyMat);
  cranium.scale.set(0.92, 1.22, 1.04);
  cranium.position.set(0, 1.26, -0.02);
  headPivot.add(cranium);

  const browCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 1.06, 0.62),
    new THREE.Vector3(-0.32, 1.14, 0.78),
    new THREE.Vector3(0, 1.02, 0.84),
    new THREE.Vector3(0.32, 1.14, 0.78),
    new THREE.Vector3(0.62, 1.06, 0.62),
  ]);
  headPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(browCurve, 20, 0.095, 10, false)), rimMat)
  );

  // Both Eye Sockets — Deep Hollow Empty Cavities with Glowing Cyan/Blue Orbital Rims (NO red eye)
  const socketHoleGeo = trackGeo(new THREE.SphereGeometry(0.23, 16, 14));
  const socketRimGeo = trackGeo(new THREE.TorusGeometry(0.235, 0.048, 10, 24));
  const cheekFlareGeo = trackGeo(new THREE.SphereGeometry(0.24, 14, 12));
  for (const side of [-1, 1] as const) {
    const eyeSocket = new THREE.Mesh(socketHoleGeo, cavityMat);
    eyeSocket.scale.set(1.12, 0.88, 0.62);
    eyeSocket.position.set(side * 0.35, 0.88, 0.73);
    eyeSocket.rotation.y = side * 0.18;
    headPivot.add(eyeSocket);

    const eyeRim = new THREE.Mesh(socketRimGeo, rimMat);
    eyeRim.scale.set(1.14, 0.90, 1.0);
    eyeRim.position.set(side * 0.35, 0.88, 0.78);
    eyeRim.rotation.y = side * 0.20;
    eyeRim.rotation.z = side * -0.10;
    headPivot.add(eyeRim);

    const cheekbone = new THREE.Mesh(cheekFlareGeo, bodyMat);
    cheekbone.scale.set(1.15, 0.72, 1.05);
    cheekbone.position.set(side * 0.50, 0.62, 0.56);
    headPivot.add(cheekbone);
  }

  // Hollow Triangular Nasal Cavity
  const nasalHole = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.11, 0.28, 3)), cavityMat);
  nasalHole.position.set(0, 0.64, 0.81);
  nasalHole.rotation.x = -0.18;
  headPivot.add(nasalHole);

  const nasalBridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.24, 0.10)), rimMat);
  nasalBridge.position.set(0, 0.78, 0.82);
  headPivot.add(nasalBridge);

  // Upper Maxilla & Lower Mandible Jawbone + Rows of Glowing Skeletal Teeth
  const upperJaw = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.46, 0.42, 0.22, 12, 1, false, -Math.PI * 0.55, Math.PI * 1.1)),
    bodyMat
  );
  upperJaw.position.set(0, 0.42, 0.46);
  headPivot.add(upperJaw);

  const jawCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.56, 0.44, 0.16),
    new THREE.Vector3(-0.38, 0.14, 0.66),
    new THREE.Vector3(0, 0.08, 0.84),
    new THREE.Vector3(0.38, 0.14, 0.66),
    new THREE.Vector3(0.56, 0.44, 0.16),
  ]);
  headPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(jawCurve, 22, 0.125, 10, false)), bodyMat)
  );

  const toothGeo = trackGeo(new THREE.CapsuleGeometry(0.032, 0.055, 4, 8));
  for (let t = 0; t < 8; t++) {
    const frac = (t / 7) * 2 - 1;
    const angle = frac * 0.78;
    const tx = Math.sin(angle) * 0.40;
    const tz = 0.44 + Math.cos(angle) * 0.40;

    const upperTooth = new THREE.Mesh(toothGeo, rimMat);
    upperTooth.position.set(tx, 0.30, tz);
    headPivot.add(upperTooth);

    const lowerTooth = new THREE.Mesh(toothGeo, rimMat);
    lowerTooth.position.set(tx, 0.19, tz);
    headPivot.add(lowerTooth);
  }

  // Twin Sweeping Curved Horns
  const hornTipGeo = trackGeo(new THREE.SphereGeometry(0.105, 10, 8));
  for (const side of [-1, 1] as const) {
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.66, 1.38, 0.06),
      new THREE.Vector3(side * 1.18, 1.54, -0.06),
      new THREE.Vector3(side * 1.44, 2.08, 0.02),
      new THREE.Vector3(side * 1.32, 2.58, 0.14),
    ]);
    headPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(hornCurve, 22, 0.125, 12, false)), bodyMat)
    );

    const hornTip = new THREE.Mesh(hornTipGeo, rimMat);
    hornTip.position.set(side * 1.32, 2.58, 0.14);
    headPivot.add(hornTip);
  }

  // 6. Articulated Skeletal Arms & Twin Giant 5-Fingered Hands
  const createBroadHandPalmGeometry = (): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(0.22, 0);
    shape.lineTo(0.56, 0.68);
    shape.lineTo(0.50, 0.94);
    shape.lineTo(-0.50, 0.94);
    shape.lineTo(-0.56, 0.68);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.065,
      bevelSize: 0.055,
      bevelSegments: 2,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.12, 0);
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  const UP_VEC = new THREE.Vector3(0, 1, 0);
  const attachBoneBetween = (
    parent: THREE.Object3D,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    r1: number,
    r2: number,
    mat: THREE.Material
  ) => {
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const len = diff.length();
    if (len < 0.001) return null;
    const mesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(r2, r1, len, 12)), mat);
    mesh.position.copy(p1).addScaledVector(diff, 0.5);
    mesh.quaternion.setFromUnitVectors(UP_VEC, diff.normalize());
    parent.add(mesh);
    return mesh;
  };

  const shoulderSphereGeo = trackGeo(new THREE.SphereGeometry(0.28, 16, 12));
  const elbowSphereGeo = trackGeo(new THREE.SphereGeometry(0.23, 14, 12));
  const wristSphereGeo = trackGeo(new THREE.SphereGeometry(0.20, 14, 10));
  const palmGeo = createBroadHandPalmGeometry();
  const knuckleSphereGeo = trackGeo(new THREE.SphereGeometry(0.115, 12, 10));
  const proxFingerGeo = trackGeo(new THREE.CylinderGeometry(0.088, 0.098, 0.44, 10));
  const midJointSphereGeo = trackGeo(new THREE.SphereGeometry(0.092, 10, 8));
  const distFingerGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.34, 6, 10));

  const buildSkeletalGiantArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 1.72, 2.60, 0.26);
    torsoPivot.add(shoulderPivot);

    const shoulderBall = new THREE.Mesh(shoulderSphereGeo, rimMat);
    shoulderPivot.add(shoulderBall);

    const elbowPos = new THREE.Vector3(side * 0.72, -0.72, 0.62);
    attachBoneBetween(shoulderPivot, new THREE.Vector3(0, 0, 0), elbowPos, 0.145, 0.125, bodyMat);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.copy(elbowPos);
    shoulderPivot.add(forearmPivot);

    const elbowBall = new THREE.Mesh(elbowSphereGeo, rimMat);
    forearmPivot.add(elbowBall);

    const wristPos = new THREE.Vector3(side * -0.14, 0.10, 1.38);
    attachBoneBetween(forearmPivot, new THREE.Vector3(0, 0, 0), wristPos, 0.135, 0.155, bodyMat);

    const handPivot = new THREE.Group();
    handPivot.position.copy(wristPos);
    handPivot.scale.setScalar(1.22);
    forearmPivot.add(handPivot);

    const wristBall = new THREE.Mesh(wristSphereGeo, rimMat);
    handPivot.add(wristBall);

    const palmMesh = new THREE.Mesh(palmGeo, bodyMat);
    handPivot.add(palmMesh);

    const fingerCurlPivots: Array<{ prox: THREE.Group; mid: THREE.Group; baseAngle: number }> = [];

    const fingerSpecs = [
      { x: -0.39, z: 0.90, scale: 0.94, splay: -0.24, curl: 0.18 },
      { x: -0.14, z: 0.95, scale: 1.06, splay: -0.07, curl: 0.14 },
      { x: 0.14, z: 0.95, scale: 1.03, splay: 0.08, curl: 0.18 },
      { x: 0.39, z: 0.89, scale: 0.90, splay: 0.24, curl: 0.24 },
    ];

    for (let f = 0; f < fingerSpecs.length; f++) {
      const fs = fingerSpecs[f];
      const knuckle = new THREE.Mesh(knuckleSphereGeo, rimMat);
      knuckle.position.set(fs.x, 0.02, fs.z);
      handPivot.add(knuckle);

      const proxPivot = new THREE.Group();
      proxPivot.position.set(fs.x, 0.02, fs.z);
      proxPivot.rotation.set(fs.curl, fs.splay, 0);
      proxPivot.scale.setScalar(fs.scale);
      handPivot.add(proxPivot);

      const proxBone = new THREE.Mesh(proxFingerGeo, bodyMat);
      proxBone.rotation.x = Math.PI * 0.5;
      proxBone.position.set(0, 0, 0.22);
      proxPivot.add(proxBone);

      const midJoint = new THREE.Mesh(midJointSphereGeo, rimMat);
      midJoint.position.set(0, 0, 0.44);
      proxPivot.add(midJoint);

      const midPivot = new THREE.Group();
      midPivot.position.set(0, 0, 0.44);
      midPivot.rotation.x = 0.28;
      proxPivot.add(midPivot);

      const distBone = new THREE.Mesh(distFingerGeo, rimMat);
      distBone.rotation.x = Math.PI * 0.5;
      distBone.position.set(0, 0, 0.22);
      midPivot.add(distBone);

      fingerCurlPivots.push({ prox: proxPivot, mid: midPivot, baseAngle: fs.curl });
    }

    const thumbSide = -side;
    const thumbBase = new THREE.Vector3(thumbSide * 0.42, -0.02, 0.36);
    const thumbKnuckle = new THREE.Mesh(knuckleSphereGeo, rimMat);
    thumbKnuckle.position.copy(thumbBase);
    handPivot.add(thumbKnuckle);

    const thumbProxPivot = new THREE.Group();
    thumbProxPivot.position.copy(thumbBase);
    thumbProxPivot.rotation.set(0.22, thumbSide * 0.68, 0);
    handPivot.add(thumbProxPivot);

    const thumbProxBone = new THREE.Mesh(proxFingerGeo, bodyMat);
    thumbProxBone.scale.set(1.08, 0.85, 1.08);
    thumbProxBone.rotation.x = Math.PI * 0.5;
    thumbProxBone.position.set(0, 0, 0.19);
    thumbProxPivot.add(thumbProxBone);

    const thumbMidJoint = new THREE.Mesh(midJointSphereGeo, rimMat);
    thumbMidJoint.position.set(0, 0, 0.38);
    thumbProxPivot.add(thumbMidJoint);

    const thumbMidPivot = new THREE.Group();
    thumbMidPivot.position.set(0, 0, 0.38);
    thumbMidPivot.rotation.x = 0.34;
    thumbProxPivot.add(thumbMidPivot);

    const thumbDistBone = new THREE.Mesh(distFingerGeo, rimMat);
    thumbDistBone.scale.set(1.05, 0.82, 1.05);
    thumbDistBone.rotation.x = Math.PI * 0.5;
    thumbDistBone.position.set(0, 0, 0.18);
    thumbMidPivot.add(thumbDistBone);

    fingerCurlPivots.push({ prox: thumbProxPivot, mid: thumbMidPivot, baseAngle: 0.22 });

    return { shoulderPivot, forearmPivot, handPivot, fingerCurlPivots };
  };

  const rightArm = buildSkeletalGiantArm(-1);
  const leftArm = buildSkeletalGiantArm(1);

  rigMeshGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.frustumCulled = false;
      obj.renderOrder = 20;
    }
  });

  const interiorLight = new THREE.PointLight(isItachi ? 0xff4500 : 0x38bdf8, 3.0, 10.5);
  interiorLight.position.set(0, 2.8, 0.6);
  bodyGroup.add(interiorLight);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: isItachi ? 0xf97316 : 0x3b82f6,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 3.1, 0);
  auraSprite.scale.set(8.2, 8.2, 1);
  auraSprite.renderOrder = 19;
  bodyGroup.add(auraSprite);

  const fitToTargetWorldHeight = (targetWorldHeight: number) => {
    const safeTargetH = Math.max(4.5, targetWorldHeight || 6.4);
    rigMeshGroup.scale.setScalar(1);
    rigMeshGroup.position.set(0, 0, 0);
    rigMeshGroup.updateMatrixWorld(true);
    _boxA.setFromObject(rigMeshGroup);
    _boxA.getSize(_sizeA);
    const scaleFactor = safeTargetH / Math.max(1.0, _sizeA.y);
    rigMeshGroup.scale.setScalar(scaleFactor);
    rigMeshGroup.position.y = Math.max(0.18, 0.32 - _boxA.min.y * scaleFactor);
    rigMeshGroup.updateMatrixWorld(true);

    pilotAnchor.position.set(0, 0, 0);
    auraSprite.position.set(0, safeTargetH * 0.48, 0.2);
    auraSprite.scale.set(safeTargetH * 1.15, safeTargetH * 1.15, 1);
  };

  let currentOpacity = 0.86;
  const setOpacity = (opacity: number) => {
    currentOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    bodyMat.opacity = currentOpacity * 0.96;
    rimMat.opacity = Math.min(0.96, currentOpacity * 1.08);
    cavityMat.opacity = Math.min(0.96, currentOpacity * 1.08);
    const ratio = currentOpacity / 0.86;
    mainShell.uniforms.uRimIntensity.value = 2.55 * ratio;
    trimShell.uniforms.uRimIntensity.value = 2.85 * ratio;
    cavityShell.uniforms.uRimIntensity.value = 0.45 * ratio;
    auraMat.opacity = ratio * 0.28;
    interiorLight.intensity = ratio * 3.0;
  };

  const update = (
    _dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity = 1,
    _stridePhase = 0,
    _strideAmount = 0,
    comboStep = 0
  ) => {
    const slash = computeComboSlashKinematics(slashProgress, comboStep);
    const breathY = Math.sin(elapsed * 2.1) * 0.05 * intensity;
    bodyGroup.position.set(0, breathY, 0);

    bodyGroup.rotation.set(
      THREE.MathUtils.clamp(forwardLeanRad, -0.08, 0.28) + slash.torsoPitch * 0.55,
      Math.sin(elapsed * 1.2) * 0.04 + slash.torsoYaw * 0.65,
      Math.sin(elapsed * 1.55) * 0.025
    );

    headPivot.rotation.set(
      0.14 + Math.sin(elapsed * 1.9) * 0.045 + slash.torsoPitch * 0.35,
      slash.torsoYaw * 0.25,
      Math.sin(elapsed * 1.35) * 0.03
    );

    rightArm.shoulderPivot.rotation.set(
      -0.22 + slash.rightArmPitch + Math.sin(elapsed * 2.0) * 0.055,
      -0.26 + slash.rightArmYaw,
      -0.12
    );
    rightArm.forearmPivot.rotation.set(-0.24 + slash.rightArmPitch * 0.32, 0.12 + slash.rightForearmYaw, 0);
    rightArm.handPivot.rotation.set(-0.46 + slash.rightArmPitch * 0.15, 0.14, -0.22);

    leftArm.shoulderPivot.rotation.set(
      0.08 + slash.leftArmPitch - Math.sin(elapsed * 2.0) * 0.055,
      0.22 + slash.leftArmYaw,
      0.14
    );
    leftArm.forearmPivot.rotation.set(-0.18 + slash.leftArmPitch * 0.32, -0.10 + slash.leftForearmYaw, 0);
    leftArm.handPivot.rotation.set(-0.36 + slash.leftArmPitch * 0.15, -0.14, 0.24);

    const clench = slash.swordGlow * 0.48 + Math.sin(elapsed * 3.0) * 0.06;
    for (let i = 0; i < rightArm.fingerCurlPivots.length; i++) {
      const f = rightArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clench;
      f.mid.rotation.x = 0.28 + clench * 0.9;
    }
    for (let i = 0; i < leftArm.fingerCurlPivots.length; i++) {
      const f = leftArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clench;
      f.mid.rotation.x = 0.28 + clench * 0.9;
    }

    const alphaRatio = currentOpacity / 0.86;
    const pulse = 1 + Math.sin(elapsed * 6.5) * 0.12 + slash.swordGlow * 0.45;
    mainShell.uniforms.uRimIntensity.value = 2.55 * alphaRatio * pulse;
    trimShell.uniforms.uRimIntensity.value = 2.85 * alphaRatio * pulse;
    bodyMat.emissiveIntensity = 0.72 + slash.swordGlow * 0.65;
    rimMat.emissiveIntensity = 1.35 + slash.swordGlow * 0.95;
    auraMat.opacity = Math.min(0.75, (0.32 + slash.swordGlow * 0.22) * alphaRatio * intensity);
  };

  const dispose = () => {
    auraMat.dispose();
    auraTex.dispose();
    bodyMat.dispose();
    rimMat.dispose();
    cavityMat.dispose();
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    stage: 'armored',
    root,
    bodyGroup,
    pilotAnchor,
    materials,
    auraSprite,
    baseOpacity: 0.86,
    fitToTargetWorldHeight,
    setOpacity,
    update,
    dispose,
  };
}

/**
 * Stage 3: Deep Royal Blue Muscular-Skeletal Demon Susanoo (Faithful to images_d00be440.jpeg) —
 * - Sculpted fierce gaunt demon skull with sunken temples, sharp V-swept horns,
 *   downward-scowling brow ridges, glowing white-ice oval eyes, dark triangular nasal slit,
 *   and wide menacing horizontal teeth grin line
 * - Striated chakra muscle fibers on neck, trapezius spikes, pectorals & arms
 * - Knobby Y-shaped collarbones, segmented central sternum spine & 7-tier ribcage around Madara
 * - Asymmetric weapons: Right forearm with jagged serrated dorsal spikes & glowing curved crescent
 *   arm-blade; Left striated arm ending in a giant splayed 5-fingered skeletal hand
 */
function buildMuscularDemonSusanooRig(variant: SusanooColorVariant = 'madara'): SusanooRig {
  const isItachi = variant === 'itachi';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Pilot stands planted on the ground inside the bottom-center of the 7-tier ribcage
  const pilotAnchor = new THREE.Object3D();
  pilotAnchor.position.set(0, 0, 0);
  root.add(pilotAnchor);

  const rigMeshGroup = new THREE.Group();
  bodyGroup.add(rigMeshGroup);

  const disposables: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const muscleTex = createChakraMuscleTexture(variant);

  // Skeletal bone shell (Royal Blue for Madara, Fiery Crimson-Orange for Itachi)
  const boneShell = createFresnelBlueMaterial({
    color: isItachi ? 0xea580c : 0x1d4ed8,
    emissive: isItachi ? 0x9a3412 : 0x1e3a8a,
    emissiveIntensity: 0.85,
    rimColor: isItachi ? 0xfdba74 : 0x60a5fa,
    rimPower: 1.85,
    rimIntensity: 2.65,
    opacity: 0.88,
    roughness: 0.18,
    metalness: 0.16,
    depthWrite: true,
  });

  // Striated chakra muscle tissue
  const muscleShell = createFresnelBlueMaterial({
    color: isItachi ? 0xc2410c : 0x1e40af,
    emissive: isItachi ? 0x7c2d12 : 0x172554,
    emissiveIntensity: 0.72,
    rimColor: isItachi ? 0xf97316 : 0x3b82f6,
    rimPower: 2.1,
    rimIntensity: 2.15,
    opacity: 0.86,
    roughness: 0.28,
    metalness: 0.12,
    depthWrite: true,
    map: muscleTex,
    emissiveMap: muscleTex,
  });

  // High-energy rim / crescent blade edge / spikes / teeth
  const trimShell = createFresnelBlueMaterial({
    color: isItachi ? 0xf97316 : 0x3b82f6,
    emissive: isItachi ? 0xea580c : 0x2563eb,
    emissiveIntensity: 1.45,
    rimColor: isItachi ? 0xfef08a : 0xbfdbfe,
    rimPower: 1.4,
    rimIntensity: 3.1,
    opacity: 0.94,
    roughness: 0.12,
    metalness: 0.22,
    depthWrite: true,
  });

  // Deep shadow for hollow nasal slit, mouth gap & deep skull hollows
  const cavityShell = createFresnelBlueMaterial({
    color: isItachi ? 0x140502 : 0x030712,
    emissive: isItachi ? 0x1c0703 : 0x050b24,
    emissiveIntensity: 0.12,
    rimColor: isItachi ? 0x9a3412 : 0x1e3a8a,
    rimPower: 3.4,
    rimIntensity: 0.28,
    opacity: 0.96,
    roughness: 0.82,
    metalness: 0.02,
    depthWrite: true,
  });

  const eyeGlowMat = new THREE.MeshBasicMaterial({
    color: isItachi ? 0xfef08a : 0xe0f2fe,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  });

  const boneMat = boneShell.mat;
  const muscleMat = muscleShell.mat;
  const rimMat = trimShell.mat;
  const cavityMat = cavityShell.mat;
  materials.push(boneMat, muscleMat, rimMat, cavityMat);

  const torsoPivot = new THREE.Group();
  rigMeshGroup.add(torsoPivot);

  // ============================================================================
  // 1. REAR SPINE, SEGMENTED FRONT STERNUM SPINE & 7-TIER WRAPPING RIBCAGE
  // ============================================================================
  const rearSpineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.28, -1.04),
    new THREE.Vector3(0, 1.15, -1.10),
    new THREE.Vector3(0, 2.15, -0.98),
    new THREE.Vector3(0, 2.95, -0.44),
    new THREE.Vector3(0, 3.30, 0.04),
  ]);
  torsoPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(rearSpineCurve, 22, 0.165, 10, false)), boneMat)
  );

  // Central Front Segmented Sternum Column (matching the vertical rib-junction plates)
  const sternumSpineCore = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.11, 1.55, 10)),
    muscleMat
  );
  sternumSpineCore.position.set(0, 1.88, 1.02);
  torsoPivot.add(sternumSpineCore);

  const sternumPlateGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.17, 0.13));
  const sternumRidgeGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.06, 0.16));
  const sternumYs = [1.26, 1.52, 1.78, 2.04, 2.30, 2.54];
  for (let i = 0; i < sternumYs.length; i++) {
    const sy = sternumYs[i];
    const plate = new THREE.Mesh(sternumPlateGeo, boneMat);
    plate.scale.set(1 - i * 0.02, 1, 1);
    plate.position.set(0, sy, 1.05);
    torsoPivot.add(plate);

    const ridge = new THREE.Mesh(sternumRidgeGeo, rimMat);
    ridge.position.set(0, sy, 1.07);
    torsoPivot.add(ridge);
  }

  // 7-Tier Royal Blue Ribcage wrapping snugly around Madara (who stands at ground x=0, z=0)
  const ribHeights = [0.34, 0.66, 0.98, 1.30, 1.62, 1.94, 2.26];
  const ribWidths = [0.90, 0.99, 1.05, 1.07, 1.04, 0.97, 0.87];
  const ribTipGeo = trackGeo(new THREE.SphereGeometry(0.098, 10, 8));

  for (let i = 0; i < ribHeights.length; i++) {
    const ry = ribHeights[i];
    const rw = ribWidths[i];
    // Bottom 3 ribs open wide around Madara's legs/body; upper 4 lock into the central sternum plates
    const frontX = i < 3 ? 0.38 : 0.18;
    for (const side of [-1, 1] as const) {
      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.14, ry + 0.10, -1.00),
        new THREE.Vector3(side * (0.96 * rw), ry + 0.05, -0.76),
        new THREE.Vector3(side * (1.38 * rw), ry, 0.04),
        new THREE.Vector3(side * (1.06 * rw), ry - 0.04, 0.84),
        new THREE.Vector3(side * frontX, ry - 0.06, 1.04),
      ]);
      const ribMesh = new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(ribCurve, 20, 0.088, 10, false)),
        boneMat
      );
      torsoPivot.add(ribMesh);

      const ribTip = new THREE.Mesh(ribTipGeo, rimMat);
      ribTip.position.set(side * frontX, ry - 0.06, 1.04);
      torsoPivot.add(ribTip);
    }
  }

  // Inner striated intercostal/pectoral torso wall behind the ribs
  const chestCoreMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.92, 0.78, 1.68, 18, 1, true, -Math.PI * 0.88, Math.PI * 1.76)),
    muscleMat
  );
  chestCoreMesh.position.set(0, 1.56, -0.02);
  torsoPivot.add(chestCoreMesh);

  // ============================================================================
  // 2. STRIATED PECTORALS, KNOBBY Y-COLLARBONES & TRAPEZIUS CHAKRA SPIKES
  // ============================================================================
  const pecGeo = trackGeo(new THREE.SphereGeometry(0.56, 18, 14));
  const clavicleKnobGeo = trackGeo(new THREE.SphereGeometry(0.145, 12, 10));
  const trapSpikeGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.56, 5));

  for (const side of [-1, 1] as const) {
    // Striated upper pectoral pad fanning from sternum to shoulder
    const pec = new THREE.Mesh(pecGeo, muscleMat);
    pec.scale.set(1.22, 0.62, 0.62);
    pec.position.set(side * 0.66, 2.34, 0.76);
    pec.rotation.set(0.12, side * -0.26, side * 0.16);
    torsoPivot.add(pec);

    // Striated trapezius muscle band rising from shoulder toward neck
    const trapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.30, 3.08, -0.10),
      new THREE.Vector3(side * 0.86, 2.94, 0.08),
      new THREE.Vector3(side * 1.46, 2.74, 0.22),
    ]);
    torsoPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(trapCurve, 14, 0.21, 10, false)), muscleMat)
    );

    // 4 jagged chakra spikes cresting along the trapezius/shoulder silhouette
    const spikeSpecs = [
      { x: 0.64, y: 3.16, z: 0.02, s: 0.78, rz: -0.34 },
      { x: 0.96, y: 3.06, z: 0.08, s: 0.96, rz: -0.46 },
      { x: 1.28, y: 2.95, z: 0.14, s: 1.08, rz: -0.58 },
      { x: 1.56, y: 2.82, z: 0.20, s: 0.86, rz: -0.76 },
    ];
    for (const sp of spikeSpecs) {
      const spike = new THREE.Mesh(trapSpikeGeo, rimMat);
      spike.position.set(side * sp.x, sp.y, sp.z);
      spike.scale.set(sp.s, sp.s, sp.s);
      spike.rotation.z = side * sp.rz;
      spike.rotation.x = -0.10;
      torsoPivot.add(spike);
    }

    // Knobby Y-shaped Clavicle (Collarbone) rising sharply toward the shoulder spur
    const clavicleKnob = new THREE.Mesh(clavicleKnobGeo, rimMat);
    clavicleKnob.position.set(side * 0.16, 2.66, 1.02);
    torsoPivot.add(clavicleKnob);

    const clavicleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.16, 2.66, 1.02),
      new THREE.Vector3(side * 0.72, 2.74, 0.92),
      new THREE.Vector3(side * 1.28, 2.86, 0.62),
      new THREE.Vector3(side * 1.66, 2.66, 0.30),
    ]);
    torsoPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(clavicleCurve, 18, 0.118, 10, false)), boneMat)
    );

    // Prominent raised shoulder acromion bone knob / upright loop
    const acromionSpur = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.11, 0.24, 6, 10)),
      rimMat
    );
    acromionSpur.position.set(side * 1.44, 2.92, 0.42);
    acromionSpur.rotation.z = side * -0.22;
    torsoPivot.add(acromionSpur);
  }

  // ============================================================================
  // 3. SCULPTED DEMON SKULL FACE (PRIMARY VISUAL FOCUS — Faithful to images_d00be440.jpeg)
  // ============================================================================
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 3.06, 0.16);
  headPivot.scale.setScalar(1.14);
  headPivot.rotation.set(0.14, 0, 0);
  torsoPivot.add(headPivot);

  // Muscular Cervical Neck + Sternocleidomastoid Tendon Ropes
  const neckCore = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.30, 0.40, 0.72, 14)),
    muscleMat
  );
  neckCore.position.set(0, -0.02, -0.10);
  headPivot.add(neckCore);

  for (const side of [-1, 1] as const) {
    const scmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.32, 0.34, -0.08),
      new THREE.Vector3(side * 0.26, 0.06, 0.26),
      new THREE.Vector3(side * 0.10, -0.24, 0.56),
    ]);
    headPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(scmCurve, 12, 0.09, 8, false)), muscleMat)
    );
  }

  // Upper Cranium Dome (tall slightly narrow demon skull profile)
  const cranium = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.76, 26, 22)), boneMat);
  cranium.scale.set(0.84, 1.18, 0.98);
  cranium.position.set(0, 1.24, -0.02);
  headPivot.add(cranium);

  // Mid-cranium vertical chakra ridge seam dividing the skull brow like the artwork
  const skullCrestCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.08, -0.12),
    new THREE.Vector3(0, 1.88, 0.54),
    new THREE.Vector3(0, 1.38, 0.74),
    new THREE.Vector3(0, 1.02, 0.78),
  ]);
  headPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(skullCrestCurve, 14, 0.038, 8, false)), rimMat)
  );

  // Sharp V-Swept Pointed Demon Horns (no rounded balls — razor pointed tips)
  for (const side of [-1, 1] as const) {
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.54, 1.44, 0.04),
      new THREE.Vector3(side * 0.94, 1.66, -0.04),
      new THREE.Vector3(side * 1.28, 2.08, -0.02),
      new THREE.Vector3(side * 1.54, 2.48, 0.04),
    ]);
    headPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(hornCurve, 20, 0.115, 10, false)), boneMat)
    );

    const hornPoint = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.115, 0.42, 8)), rimMat);
    hornPoint.position.set(side * 1.62, 2.61, 0.06);
    hornPoint.rotation.z = side * -0.56;
    hornPoint.rotation.x = 0.08;
    headPivot.add(hornPoint);

    // Sunken temple hollow behind the lateral brow ridge
    const templeHollow = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.22, 12, 10)),
      cavityMat
    );
    templeHollow.scale.set(0.55, 1.12, 0.95);
    templeHollow.position.set(side * 0.54, 1.12, 0.24);
    headPivot.add(templeHollow);
  }

  // Fierce Downward-Angled V-Scowling Brow Ridges (iconic intense demon glare)
  for (const side of [-1, 1] as const) {
    const browBarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.06, 0.96, 0.78),
      new THREE.Vector3(side * 0.30, 1.07, 0.75),
      new THREE.Vector3(side * 0.56, 1.14, 0.56),
    ]);
    headPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(browBarCurve, 12, 0.088, 9, false)), rimMat)
    );
  }

  // Glowing White-Ice-Blue Oval Eyes inside Deep Angled Eye Sockets
  const socketHoleGeo = trackGeo(new THREE.SphereGeometry(0.20, 14, 12));
  const glowingEyeGeo = trackGeo(new THREE.SphereGeometry(0.155, 14, 12));
  const socketRimGeo = trackGeo(new THREE.TorusGeometry(0.205, 0.042, 8, 22));
  const cheekBoneGeo = trackGeo(new THREE.BoxGeometry(0.26, 0.20, 0.34));
  const cheekHollowGeo = trackGeo(new THREE.SphereGeometry(0.18, 12, 10));

  for (const side of [-1, 1] as const) {
    // Deep recessed socket framing the glowing eye
    const eyeSocket = new THREE.Mesh(socketHoleGeo, cavityMat);
    eyeSocket.scale.set(1.18, 0.84, 0.54);
    eyeSocket.position.set(side * 0.29, 0.88, 0.67);
    eyeSocket.rotation.set(0, side * 0.22, side * -0.14);
    headPivot.add(eyeSocket);

    // Bright Glowing White-Ice-Blue Oval Eye (matches the luminous eyes in images_d00be440.jpeg)
    const glowingEye = new THREE.Mesh(glowingEyeGeo, eyeGlowMat);
    glowingEye.scale.set(1.16, 0.78, 0.45);
    glowingEye.position.set(side * 0.29, 0.88, 0.735);
    glowingEye.rotation.set(0, side * 0.22, side * -0.16);
    headPivot.add(glowingEye);

    const eyeRim = new THREE.Mesh(socketRimGeo, rimMat);
    eyeRim.scale.set(1.18, 0.84, 0.85);
    eyeRim.position.set(side * 0.29, 0.88, 0.72);
    eyeRim.rotation.set(0, side * 0.22, side * -0.14);
    headPivot.add(eyeRim);

    // Sharp sculpted Zygomatic Cheekbone flaring beneath each eye
    const cheekbone = new THREE.Mesh(cheekBoneGeo, boneMat);
    cheekbone.position.set(side * 0.42, 0.68, 0.56);
    cheekbone.rotation.set(0.12, side * 0.38, side * -0.22);
    headPivot.add(cheekbone);

    // Hollow cheek indentation below the cheekbone emphasizing the gaunt demon jaw
    const cheekHollow = new THREE.Mesh(cheekHollowGeo, cavityMat);
    cheekHollow.scale.set(0.65, 1.05, 0.88);
    cheekHollow.position.set(side * 0.40, 0.44, 0.44);
    headPivot.add(cheekHollow);
  }

  // Sharp Nasal Bridge & Deep Dark Inverted-Triangle Nasal Slit
  const nasalBridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.28, 0.14)), boneMat);
  nasalBridge.position.set(0, 0.80, 0.74);
  nasalBridge.rotation.x = -0.14;
  headPivot.add(nasalBridge);

  const nasalSlit = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.098, 0.23, 3)), cavityMat);
  nasalSlit.position.set(0, 0.62, 0.745);
  nasalSlit.rotation.set(-0.18, Math.PI, 0);
  headPivot.add(nasalSlit);

  // Gaunt Tapered Upper Maxilla, Narrow Chin & Wide Menacing Horizontal Teeth Line
  const upperMaxilla = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.36, 0.31, 0.22, 12, 1, false, -Math.PI * 0.55, Math.PI * 1.1)),
    boneMat
  );
  upperMaxilla.position.set(0, 0.42, 0.42);
  headPivot.add(upperMaxilla);

  const jawCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.46, 0.54, 0.18),
    new THREE.Vector3(-0.34, 0.22, 0.56),
    new THREE.Vector3(-0.14, 0.08, 0.72),
    new THREE.Vector3(0, 0.05, 0.76),
    new THREE.Vector3(0.14, 0.08, 0.72),
    new THREE.Vector3(0.34, 0.22, 0.56),
    new THREE.Vector3(0.46, 0.54, 0.18),
  ]);
  headPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(jawCurve, 22, 0.105, 10, false)), boneMat)
  );

  // Chin plate
  const chinPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.16, 0.16)), rimMat);
  chinPlate.position.set(0, 0.11, 0.70);
  headPivot.add(chinPlate);

  // Dark horizontal mouth slit + crisp vertical skeletal teeth grid (exact grin line from image)
  const mouthSlitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.36, 0.35, 0.49),
    new THREE.Vector3(-0.18, 0.30, 0.67),
    new THREE.Vector3(0, 0.28, 0.73),
    new THREE.Vector3(0.18, 0.30, 0.67),
    new THREE.Vector3(0.36, 0.35, 0.49),
  ]);
  headPivot.add(
    new THREE.Mesh(trackGeo(new THREE.TubeGeometry(mouthSlitCurve, 18, 0.048, 8, false)), cavityMat)
  );

  const toothBarGeo = trackGeo(new THREE.BoxGeometry(0.032, 0.105, 0.045));
  for (let t = 0; t < 10; t++) {
    const frac = (t / 9) * 2 - 1;
    const angle = frac * 0.76;
    const tx = Math.sin(angle) * 0.34;
    const tz = 0.42 + Math.cos(angle) * 0.33;
    const ty = 0.285 + Math.abs(frac) * 0.045;
    const tooth = new THREE.Mesh(toothBarGeo, rimMat);
    tooth.position.set(tx, ty, tz);
    tooth.rotation.y = angle;
    headPivot.add(tooth);
  }

  // ============================================================================
  // 4. SYMMETRIC 5-FINGERED MUSCULAR-SKELETAL ARMS:
  //    - BOTH ARMS (-1 & +1): Striated humerus & twin forearm muscle/bone bundles +
  //      giant splayed 5-fingered articulated hand
  // ============================================================================
  const UP_VEC = new THREE.Vector3(0, 1, 0);
  const attachLimbBetween = (
    parent: THREE.Object3D,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    r1: number,
    r2: number,
    mat: THREE.Material,
    radialSegs = 12
  ) => {
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const len = diff.length();
    if (len < 0.001) return null;
    const mesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(r2, r1, len, radialSegs)), mat);
    mesh.position.copy(p1).addScaledVector(diff, 0.5);
    mesh.quaternion.setFromUnitVectors(UP_VEC, diff.normalize());
    parent.add(mesh);
    return mesh;
  };

  const createBroadHandPalmGeometry = (): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(0.22, 0);
    shape.lineTo(0.56, 0.68);
    shape.lineTo(0.50, 0.94);
    shape.lineTo(-0.50, 0.94);
    shape.lineTo(-0.56, 0.68);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.065,
      bevelSize: 0.055,
      bevelSegments: 2,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.12, 0);
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  const shoulderSphereGeo = trackGeo(new THREE.SphereGeometry(0.29, 16, 12));
  const deltoidCapGeo = trackGeo(new THREE.SphereGeometry(0.38, 16, 12));
  const elbowSphereGeo = trackGeo(new THREE.SphereGeometry(0.24, 14, 12));
  const wristSphereGeo = trackGeo(new THREE.SphereGeometry(0.19, 14, 10));
  const palmGeo = createBroadHandPalmGeometry();
  const knuckleSphereGeo = trackGeo(new THREE.SphereGeometry(0.115, 12, 10));
  const proxFingerGeo = trackGeo(new THREE.CylinderGeometry(0.088, 0.098, 0.44, 10));
  const midJointSphereGeo = trackGeo(new THREE.SphereGeometry(0.092, 10, 8));
  const distFingerGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.34, 6, 10));

  // Mirrored Muscular-Skeletal 5-Fingered Arm (-1 = Right, +1 = Left)
  const buildFiveFingerDemonArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 1.70, 2.60, 0.26);
    torsoPivot.add(shoulderPivot);

    shoulderPivot.add(new THREE.Mesh(shoulderSphereGeo, rimMat));

    const deltoid = new THREE.Mesh(deltoidCapGeo, muscleMat);
    deltoid.scale.set(1.15, 0.90, 0.96);
    deltoid.position.set(side * 0.14, -0.06, 0.06);
    shoulderPivot.add(deltoid);

    const elbowPos = new THREE.Vector3(side * 0.92, -0.78, 0.36);
    // Humerus bone & accompanying muscle bundle
    attachLimbBetween(shoulderPivot, new THREE.Vector3(0, 0, 0), elbowPos, 0.16, 0.14, boneMat, 12);
    attachLimbBetween(
      shoulderPivot,
      new THREE.Vector3(side * -0.08, -0.06, 0.08),
      new THREE.Vector3(elbowPos.x - side * 0.08, elbowPos.y, elbowPos.z + 0.08),
      0.17,
      0.13,
      muscleMat,
      12
    );

    const forearmPivot = new THREE.Group();
    forearmPivot.position.copy(elbowPos);
    shoulderPivot.add(forearmPivot);

    forearmPivot.add(new THREE.Mesh(elbowSphereGeo, rimMat));

    // Twin radius/ulna skeletal rods + thick striated flexor muscle bundles along the forearm
    const wristPos = new THREE.Vector3(-side * 0.22, -0.18, 1.38);
    attachLimbBetween(forearmPivot, new THREE.Vector3(0, 0.04, 0), wristPos, 0.14, 0.15, boneMat, 12);
    attachLimbBetween(
      forearmPivot,
      new THREE.Vector3(-side * 0.08, -0.06, 0.04),
      new THREE.Vector3(wristPos.x - side * 0.06, wristPos.y - 0.06, wristPos.z),
      0.18,
      0.14,
      muscleMat,
      12
    );
    attachLimbBetween(
      forearmPivot,
      new THREE.Vector3(side * 0.08, -0.04, 0.04),
      new THREE.Vector3(wristPos.x + side * 0.06, wristPos.y - 0.04, wristPos.z),
      0.16,
      0.13,
      muscleMat,
      12
    );

    const handPivot = new THREE.Group();
    handPivot.position.copy(wristPos);
    handPivot.scale.setScalar(1.24);
    forearmPivot.add(handPivot);

    handPivot.add(new THREE.Mesh(wristSphereGeo, rimMat));
    handPivot.add(new THREE.Mesh(palmGeo, boneMat));

    const fingerCurlPivots: Array<{ prox: THREE.Group; mid: THREE.Group; baseAngle: number }> = [];
    const fingerSpecs = [
      { x: -0.39, z: 0.90, scale: 0.94, splay: -0.24, curl: 0.20 },
      { x: -0.14, z: 0.95, scale: 1.07, splay: -0.07, curl: 0.16 },
      { x: 0.14, z: 0.95, scale: 1.04, splay: 0.08, curl: 0.20 },
      { x: 0.39, z: 0.89, scale: 0.90, splay: 0.24, curl: 0.26 },
    ];

    for (let f = 0; f < fingerSpecs.length; f++) {
      const fs = fingerSpecs[f];
      const fx = side * fs.x;
      const fSplay = side * fs.splay;

      const knuckle = new THREE.Mesh(knuckleSphereGeo, rimMat);
      knuckle.position.set(fx, 0.02, fs.z);
      handPivot.add(knuckle);

      const proxPivot = new THREE.Group();
      proxPivot.position.set(fx, 0.02, fs.z);
      proxPivot.rotation.set(fs.curl, fSplay, 0);
      proxPivot.scale.setScalar(fs.scale);
      handPivot.add(proxPivot);

      const proxBone = new THREE.Mesh(proxFingerGeo, boneMat);
      proxBone.rotation.x = Math.PI * 0.5;
      proxBone.position.set(0, 0, 0.22);
      proxPivot.add(proxBone);

      const midJoint = new THREE.Mesh(midJointSphereGeo, rimMat);
      midJoint.position.set(0, 0, 0.44);
      proxPivot.add(midJoint);

      const midPivot = new THREE.Group();
      midPivot.position.set(0, 0, 0.44);
      midPivot.rotation.x = 0.28;
      proxPivot.add(midPivot);

      const distBone = new THREE.Mesh(distFingerGeo, rimMat);
      distBone.rotation.x = Math.PI * 0.5;
      distBone.position.set(0, 0, 0.22);
      midPivot.add(distBone);

      fingerCurlPivots.push({ prox: proxPivot, mid: midPivot, baseAngle: fs.curl });
    }

    // 5th Finger: Thick Opposable Thumb on the inner palm side
    const thumbSide = -side;
    const thumbBase = new THREE.Vector3(thumbSide * 0.42, -0.02, 0.36);
    const thumbKnuckle = new THREE.Mesh(knuckleSphereGeo, rimMat);
    thumbKnuckle.position.copy(thumbBase);
    handPivot.add(thumbKnuckle);

    const thumbProxPivot = new THREE.Group();
    thumbProxPivot.position.copy(thumbBase);
    thumbProxPivot.rotation.set(0.22, thumbSide * 0.68, 0);
    handPivot.add(thumbProxPivot);

    const thumbProxBone = new THREE.Mesh(proxFingerGeo, boneMat);
    thumbProxBone.scale.set(1.08, 0.85, 1.08);
    thumbProxBone.rotation.x = Math.PI * 0.5;
    thumbProxBone.position.set(0, 0, 0.19);
    thumbProxPivot.add(thumbProxBone);

    const thumbMidJoint = new THREE.Mesh(midJointSphereGeo, rimMat);
    thumbMidJoint.position.set(0, 0, 0.38);
    thumbProxPivot.add(thumbMidJoint);

    const thumbMidPivot = new THREE.Group();
    thumbMidPivot.position.set(0, 0, 0.38);
    thumbMidPivot.rotation.x = 0.34;
    thumbProxPivot.add(thumbMidPivot);

    const thumbDistBone = new THREE.Mesh(distFingerGeo, rimMat);
    thumbDistBone.scale.set(1.05, 0.82, 1.05);
    thumbDistBone.rotation.x = Math.PI * 0.5;
    thumbDistBone.position.set(0, 0, 0.18);
    thumbMidPivot.add(thumbDistBone);

    fingerCurlPivots.push({ prox: thumbProxPivot, mid: thumbMidPivot, baseAngle: 0.22 });

    return { shoulderPivot, forearmPivot, handPivot, fingerCurlPivots };
  };

  const rightArm = buildFiveFingerDemonArm(-1);
  const leftArm = buildFiveFingerDemonArm(1);

  rigMeshGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.frustumCulled = false;
      obj.renderOrder = 20;
    }
  });

  const interiorLight = new THREE.PointLight(isItachi ? 0xff4500 : 0x3b82f6, 3.2, 11.0);
  interiorLight.position.set(0, 2.8, 0.65);
  bodyGroup.add(interiorLight);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: isItachi ? 0xea580c : 0x2563eb,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 3.1, 0);
  auraSprite.scale.set(8.4, 8.4, 1);
  auraSprite.renderOrder = 19;
  bodyGroup.add(auraSprite);

  const fitToTargetWorldHeight = (targetWorldHeight: number) => {
    const safeTargetH = Math.max(4.5, targetWorldHeight || 6.4);
    rigMeshGroup.scale.setScalar(1);
    rigMeshGroup.position.set(0, 0, 0);
    rigMeshGroup.updateMatrixWorld(true);
    _boxA.setFromObject(rigMeshGroup);
    _boxA.getSize(_sizeA);
    const scaleFactor = safeTargetH / Math.max(1.0, _sizeA.y);
    rigMeshGroup.scale.setScalar(scaleFactor);
    // Keep lowest rib framing Madara cleanly near ground level (0.28m)
    rigMeshGroup.position.y = Math.max(0.16, 0.28 - _boxA.min.y * scaleFactor);
    rigMeshGroup.updateMatrixWorld(true);

    pilotAnchor.position.set(0, 0, 0);
    auraSprite.position.set(0, safeTargetH * 0.48, 0.2);
    auraSprite.scale.set(safeTargetH * 1.18, safeTargetH * 1.18, 1);
  };

  let currentOpacity = 0.88;
  const setOpacity = (opacity: number) => {
    currentOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    boneMat.opacity = currentOpacity * 0.98;
    muscleMat.opacity = currentOpacity * 0.96;
    rimMat.opacity = Math.min(0.98, currentOpacity * 1.08);
    cavityMat.opacity = Math.min(0.98, currentOpacity * 1.08);
    eyeGlowMat.opacity = Math.min(0.99, currentOpacity * 1.12);
    const ratio = currentOpacity / 0.88;
    boneShell.uniforms.uRimIntensity.value = 2.65 * ratio;
    muscleShell.uniforms.uRimIntensity.value = 2.15 * ratio;
    trimShell.uniforms.uRimIntensity.value = 3.1 * ratio;
    cavityShell.uniforms.uRimIntensity.value = 0.28 * ratio;
    auraMat.opacity = ratio * 0.32;
    interiorLight.intensity = ratio * 3.2;
  };

  const update = (
    _dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity = 1,
    _stridePhase = 0,
    _strideAmount = 0,
    comboStep = 0
  ) => {
    const slash = computeComboSlashKinematics(slashProgress, comboStep);
    const breathY = Math.sin(elapsed * 2.1) * 0.05 * intensity;
    bodyGroup.position.set(0, breathY, 0);

    bodyGroup.rotation.set(
      THREE.MathUtils.clamp(forwardLeanRad, -0.08, 0.28) + slash.torsoPitch * 0.55,
      Math.sin(elapsed * 1.2) * 0.04 + slash.torsoYaw * 0.65,
      Math.sin(elapsed * 1.55) * 0.025
    );

    headPivot.rotation.set(
      0.14 + Math.sin(elapsed * 1.9) * 0.045 + slash.torsoPitch * 0.35,
      slash.torsoYaw * 0.22,
      Math.sin(elapsed * 1.35) * 0.028
    );

    // Both Giant 5-Fingered Arms: poised outward/down with splayed skeletal hands at idle,
    // slamming forward with clenching fingers across the 3-step combo
    rightArm.shoulderPivot.rotation.set(
      0.08 + slash.rightArmPitch + Math.sin(elapsed * 2.0) * 0.045,
      -0.18 + slash.rightArmYaw,
      -0.10
    );
    rightArm.forearmPivot.rotation.set(
      -0.14 + slash.rightArmPitch * 0.32,
      0.08 + slash.rightForearmYaw,
      0
    );
    rightArm.handPivot.rotation.set(-0.34 + slash.rightArmPitch * 0.15, 0.14, -0.22);

    leftArm.shoulderPivot.rotation.set(
      0.08 + slash.leftArmPitch - Math.sin(elapsed * 2.0) * 0.045,
      0.18 + slash.leftArmYaw,
      0.10
    );
    leftArm.forearmPivot.rotation.set(
      -0.14 + slash.leftArmPitch * 0.32,
      -0.08 + slash.leftForearmYaw,
      0
    );
    leftArm.handPivot.rotation.set(-0.34 + slash.leftArmPitch * 0.15, -0.14, 0.22);

    const clench = slash.swordGlow * 0.52 + Math.sin(elapsed * 3.0) * 0.06;
    for (let i = 0; i < rightArm.fingerCurlPivots.length; i++) {
      const f = rightArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clench;
      f.mid.rotation.x = 0.28 + clench * 0.92;
    }
    for (let i = 0; i < leftArm.fingerCurlPivots.length; i++) {
      const f = leftArm.fingerCurlPivots[i];
      f.prox.rotation.x = f.baseAngle + clench;
      f.mid.rotation.x = 0.28 + clench * 0.92;
    }

    const alphaRatio = currentOpacity / 0.88;
    const pulse = 1 + Math.sin(elapsed * 6.5) * 0.12 + slash.swordGlow * 0.48;
    boneShell.uniforms.uRimIntensity.value = 2.65 * alphaRatio * pulse;
    muscleShell.uniforms.uRimIntensity.value = 2.15 * alphaRatio * pulse;
    trimShell.uniforms.uRimIntensity.value = 3.1 * alphaRatio * (1 + slash.swordGlow * 0.72);
    boneMat.emissiveIntensity = 0.85 + slash.swordGlow * 0.65;
    muscleMat.emissiveIntensity = 0.72 + slash.swordGlow * 0.52;
    rimMat.emissiveIntensity = 1.45 + slash.swordGlow * 1.15;
    auraMat.opacity = Math.min(0.78, (0.34 + slash.swordGlow * 0.24) * alphaRatio * intensity);
  };

  const dispose = () => {
    auraMat.dispose();
    auraTex.dispose();
    muscleTex.dispose();
    eyeGlowMat.dispose();
    boneMat.dispose();
    muscleMat.dispose();
    rimMat.dispose();
    cavityMat.dispose();
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    stage: 'muscular',
    root,
    bodyGroup,
    pilotAnchor,
    materials,
    auraSprite,
    baseOpacity: 0.88,
    fitToTargetWorldHeight,
    setOpacity,
    update,
    dispose,
  };
}

function createPerfectArmorPlateTexture(variant: SusanooColorVariant = 'madara'): THREE.CanvasTexture {
  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const isItachi = variant === 'itachi';
    const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (isItachi) {
      baseGrad.addColorStop(0, '#c2410c');
      baseGrad.addColorStop(0.5, '#9a3412');
      baseGrad.addColorStop(1, '#7c2d12');
    } else {
      baseGrad.addColorStop(0, '#3b82f6');
      baseGrad.addColorStop(0.45, '#1d4ed8');
      baseGrad.addColorStop(1, '#1e3a8a');
    }
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    // Lamellar samurai plate rows & columns with ink crevices and subtle highlight edges
    const rows = 4;
    const cols = 3;
    const cellW = width / cols;
    const cellH = height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW;
        const y = r * cellH;
        const cellGrad = ctx.createLinearGradient(x, y, x, y + cellH);
        if (isItachi) {
          cellGrad.addColorStop(0, 'rgba(253, 186, 116, 0.22)');
          cellGrad.addColorStop(0.35, 'rgba(234, 88, 12, 0.05)');
          cellGrad.addColorStop(1, 'rgba(67, 20, 7, 0.45)');
        } else {
          cellGrad.addColorStop(0, 'rgba(147, 197, 253, 0.28)');
          cellGrad.addColorStop(0.38, 'rgba(37, 99, 235, 0.04)');
          cellGrad.addColorStop(1, 'rgba(10, 22, 68, 0.56)');
        }
        ctx.fillStyle = cellGrad;
        ctx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);

        // Dark anime ink seam separating plates
        ctx.strokeStyle = isItachi ? 'rgba(42, 10, 4, 0.85)' : 'rgba(6, 14, 46, 0.88)';
        ctx.lineWidth = 5;
        ctx.strokeRect(x + 1.5, y + 1.5, cellW - 3, cellH - 3);

        // Subtle luminous edge along top rim of each plate
        ctx.strokeStyle = isItachi ? 'rgba(254, 215, 170, 0.42)' : 'rgba(191, 219, 254, 0.46)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5);
        ctx.lineTo(x + cellW - 5, y + 5);
        ctx.stroke();
      }
    }

    // Subtle organic brush-hatch shading lines
    ctx.strokeStyle = isItachi ? 'rgba(67, 20, 7, 0.2)' : 'rgba(7, 16, 52, 0.24)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 42; i++) {
      const y = (i / 42) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.33, y + 8, width * 0.66, y - 8, width, y + 2);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createKimonoClothTexture(variant: SusanooColorVariant = 'madara'): THREE.CanvasTexture {
  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const isItachi = variant === 'itachi';
    ctx.fillStyle = isItachi ? '#9a3412' : '#1d4ed8';
    ctx.fillRect(0, 0, width, height);

    const foldCount = 16;
    for (let i = 0; i < foldCount; i++) {
      const x = (i / foldCount) * width;
      const g = ctx.createLinearGradient(x, 0, x + width / foldCount, 0);
      if (isItachi) {
        g.addColorStop(0, 'rgba(67, 20, 7, 0.48)');
        g.addColorStop(0.5, 'rgba(251, 146, 60, 0.22)');
        g.addColorStop(1, 'rgba(67, 20, 7, 0.44)');
      } else {
        g.addColorStop(0, 'rgba(8, 20, 68, 0.52)');
        g.addColorStop(0.5, 'rgba(96, 165, 250, 0.22)');
        g.addColorStop(1, 'rgba(8, 20, 68, 0.48)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, width / foldCount + 1, height);
    }

    // Crisp manga cloth crease lines
    ctx.strokeStyle = isItachi ? 'rgba(42, 10, 4, 0.35)' : 'rgba(6, 14, 48, 0.38)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + Math.sin(i) * 7, height * 0.5, x + Math.cos(i) * 5, height);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an organically tapering & contoured tube along a 3D spline with capped ends
 * so horns, flame hair locks, long Tengu nose, waist sash folds, and limbs never look faceted.
 */
function createTaperedOrganicTube(
  curve: THREE.CatmullRomCurve3,
  radiusAt: (t: number) => number,
  tubularSegs = 22,
  radialSegs = 12,
  scaleXAt: (t: number) => number = () => 1,
  scaleZAt: (t: number) => number = () => 1
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = Math.max(0.004, radiusAt(t));
    const sx = scaleXAt(t);
    const sz = scaleZAt(t);

    for (let j = 0; j <= radialSegs; j++) {
      const v = (j / radialSegs) * Math.PI * 2;
      const cosV = Math.cos(v) * sx;
      const sinV = Math.sin(v) * sz;
      vertex.copy(pt).addScaledVector(N, r * cosV).addScaledVector(B, r * sinV);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(j / radialSegs, t);
    }
  }

  const ringStride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  // Cap start and end cleanly
  const startCenterIdx = positions.length / 3;
  const pStart = curve.getPointAt(0);
  positions.push(pStart.x, pStart.y, pStart.z);
  uvs.push(0.5, 0);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(startCenterIdx, j + 1, j);
  }

  const endCenterIdx = positions.length / 3;
  const pEnd = curve.getPointAt(1);
  positions.push(pEnd.x, pEnd.y, pEnd.z);
  uvs.push(0.5, 1);
  const lastRingOffset = tubularSegs * ringStride;
  for (let j = 0; j < radialSegs; j++) {
    indices.push(endCenterIdx, lastRingOffset + j, lastRingOffset + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a curved lamellar samurai armor plate (Sode shoulder shield / Kusazuri hip plate)
 * bending smoothly along a circular arc with sculpted flame peaks along its upper rim.
 */
function createCurvedLamellarShield(
  width: number,
  height: number,
  arcAngle: number,
  thickness: number,
  flameTop = true
): THREE.BufferGeometry {
  const segsU = 18;
  const segsV = 12;
  const radius = width / Math.max(0.18, arcAngle);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addLayer = (radialOffset: number) => {
    const startIdx = positions.length / 3;
    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV; // 0 = bottom, 1 = top
      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU; // 0..1 across width
        const theta = (u - 0.5) * arcAngle;

        // Slight taper toward bottom & organic upward flame spikes on top rim
        const widthTaper = 0.92 + 0.08 * Math.sin(v * Math.PI * 0.5);
        const r = radius + radialOffset - (1 - v) * 0.06;
        const x = Math.sin(theta) * r * widthTaper;
        const z = (Math.cos(theta) - 1) * r + radialOffset;

        let y = (v - 0.5) * height;
        if (flameTop && v > 0.72) {
          const topBlend = (v - 0.72) / 0.28;
          const flameWave =
            Math.max(0, Math.sin(u * Math.PI * 3.0 - 0.35)) * 0.28 +
            Math.max(0, Math.sin(u * Math.PI * 5.0 + 0.6)) * 0.14;
          y += flameWave * topBlend * topBlend;
        }
        // Subtle gentle bottom edge sweep
        if (v < 0.14) {
          y -= (0.14 - v) * 0.35 * Math.cos((u - 0.5) * Math.PI);
        }

        positions.push(x, y, z);
        uvs.push(u, 1 - v);
      }
    }
    return startIdx;
  };

  const frontOffset = addLayer(thickness * 0.5);
  const backOffset = addLayer(-thickness * 0.5);
  const stride = segsU + 1;

  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const fa = frontOffset + iv * stride + iu;
      const fb = fa + 1;
      const fc = fa + stride + 1;
      const fd = fa + stride;
      indices.push(fa, fb, fc, fa, fc, fd);

      const ba = backOffset + iv * stride + iu;
      const bb = ba + 1;
      const bc = ba + stride + 1;
      const bd = ba + stride;
      indices.push(ba, bc, bb, ba, bd, bc);
    }
  }

  // Stitch outer border edges cleanly
  for (let iu = 0; iu < segsU; iu++) {
    // bottom edge (iv = 0)
    const f0 = frontOffset + iu;
    const f1 = f0 + 1;
    const b0 = backOffset + iu;
    const b1 = b0 + 1;
    indices.push(f0, b0, b1, f0, b1, f1);

    // top edge (iv = segsV)
    const ft0 = frontOffset + segsV * stride + iu;
    const ft1 = ft0 + 1;
    const bt0 = backOffset + segsV * stride + iu;
    const bt1 = bt0 + 1;
    indices.push(ft0, ft1, bt1, ft0, bt1, bt0);
  }
  for (let iv = 0; iv < segsV; iv++) {
    const fl0 = frontOffset + iv * stride;
    const fl1 = fl0 + stride;
    const bl0 = backOffset + iv * stride;
    const bl1 = bl0 + stride;
    indices.push(fl0, fl1, bl1, fl0, bl1, bl0);

    const fr0 = frontOffset + iv * stride + segsU;
    const fr1 = fr0 + stride;
    const br0 = backOffset + iv * stride + segsU;
    const br1 = br0 + stride;
    indices.push(fr0, br0, br1, fr0, br1, fr1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an organic pleated samurai Hakama skirt with natural fabric folds flaring smoothly.
 */
function createPleatedHakamaGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  pleats = 14
): THREE.BufferGeometry {
  const segsU = pleats * 4;
  const segsV = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = bottom hem, 1 = waist
    const y = (v - 1) * height;
    const baseR = THREE.MathUtils.lerp(bottomRadius, topRadius, Math.pow(v, 0.82));
    const pleatDepth = (1 - v * 0.72) * 0.14;

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const theta = u * Math.PI * 2;
      // Front/back subtle oval flattening + crisp hakama fabric pleats
      const ovalScaleX = 1.08;
      const ovalScaleZ = 0.84;
      const pleat = Math.sin(theta * pleats) * pleatDepth + Math.cos(theta * 2) * 0.04;
      const r = baseR + pleat;
      const hemWave = (1 - v) * Math.sin(theta * 2) * 0.08;
      positions.push(Math.sin(theta) * r * ovalScaleX, y + hemWave, Math.cos(theta) * r * ovalScaleZ);
      uvs.push(u, 1 - v);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an organic sculpted feathered wing-armor plate matching the artwork's layered wings.
 */
function createFeatheredWingPlateGeometry(length: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.28, 0);
  shape.quadraticCurveTo(-width * 0.56, length * 0.35, -width * 0.44, length * 0.78);
  shape.quadraticCurveTo(-width * 0.18, length * 0.96, 0.08 * width, length);
  shape.quadraticCurveTo(width * 0.42, length * 0.72, width * 0.46, length * 0.32);
  shape.quadraticCurveTo(width * 0.40, length * 0.08, width * 0.28, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 2,
    depth: width * 0.16,
    bevelEnabled: true,
    bevelThickness: width * 0.055,
    bevelSize: width * 0.045,
    bevelSegments: 2,
  });

  // Gentle organic camber curve along the wing feather
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const t = THREE.MathUtils.clamp(py / Math.max(0.01, length), 0, 1);
    const pz = pos.getZ(i);
    pos.setZ(i, pz - Math.sin(t * Math.PI) * width * 0.24);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a curved samurai katana blade with gentle sori curvature, tapered kissaki tip, and bevel.
 */
function createSculptedSamuraiKatanaGeometry(length: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.36, 0);
  const segs = 12;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const curveBack = Math.pow(t, 1.55) * width * 0.95;
    const taper = t > 0.78 ? 1 - ((t - 0.78) / 0.22) * 0.85 : 1 - t * 0.18;
    shape.lineTo(-width * 0.36 * taper + curveBack, length * t);
  }
  shape.lineTo(width * 0.88, length * 1.05);
  for (let i = segs; i >= 1; i--) {
    const t = i / segs;
    const curveBack = Math.pow(t, 1.55) * width * 0.95;
    const taper = t > 0.78 ? 1 - ((t - 0.78) / 0.22) * 0.85 : 1 - t * 0.18;
    shape.lineTo(width * 0.42 * taper + curveBack, length * t);
  }
  shape.lineTo(width * 0.42, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 2,
    depth: width * 0.18,
    bevelEnabled: true,
    bevelThickness: width * 0.06,
    bevelSize: width * 0.045,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an anatomically sculpted wide Samurai thigh/hakama-cuff wrap
 * with strong quadriceps fullness and a flared martial cuff above the knee.
 */
function createAnatomicalThighGeometry(length: number, side: -1 | 1): THREE.BufferGeometry {
  const segsU = 24;
  const segsV = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = hip top, 1 = knee cuff
    const y = -v * length;
    const baseR = THREE.MathUtils.lerp(0.98, 0.72, Math.pow(v, 0.78));
    const quadBulge = Math.sin(Math.pow(v, 0.75) * Math.PI) * 0.21;
    const cuffFlare = v > 0.78 ? ((v - 0.78) / 0.22) * 0.14 : 0;

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const frontMask = Math.max(0, cosT);
      const backMask = Math.max(0, -cosT);
      const outerMask = Math.max(0, sinT * side);
      const pleat = Math.sin(theta * 10) * 0.025 * (0.4 + v * 0.6);

      const rx =
        baseR * 0.98 +
        cuffFlare +
        pleat +
        outerMask * Math.sin(v * Math.PI) * 0.14;
      const rz =
        baseR * 1.05 +
        cuffFlare * 0.85 +
        pleat +
        frontMask * quadBulge +
        backMask * Math.sin(v * Math.PI * 0.85) * 0.12;

      const centerX = -side * v * 0.07;
      positions.push(centerX + sinT * rx, y, cosT * rz);
      uvs.push(u, v);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, d, c, a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates wide flared Samurai shin-hakama greaves (narrow at knee, flaring outward toward ankle
 * with pleated vertical folds and jagged lower cuff peaks) matching the reference artwork.
 */
function createAnatomicalShinGeometry(length: number, side: -1 | 1): THREE.BufferGeometry {
  const segsU = 28;
  const segsV = 18;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = knee, 1 = lower cuff above ankle
    const y = -v * length;
    // Wide flared Samurai bell-bottom shin cuff with pleated folds & calf curve
    const topBand = THREE.MathUtils.lerp(0.66, 0.98, Math.pow(v, 0.72));
    const calfFlare = Math.exp(-Math.pow((v - 0.36) / 0.24, 2)) * 0.16;
    const cuffPeakY = v > 0.88 ? Math.sin(((v - 0.88) / 0.12) * Math.PI * 0.5) : 0;

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const backMask = Math.max(0, -cosT);
      const outerMask = Math.max(0, sinT * side);
      const pleat = Math.sin(theta * 12) * (0.025 + v * 0.045);

      const rx = topBand * 0.96 + calfFlare * 0.35 + outerMask * calfFlare * 0.22 + pleat;
      const rz = topBand * 0.94 + backMask * calfFlare * 0.85 + pleat;
      const hemZigzag = cuffPeakY * Math.sin(theta * 6) * 0.14;

      positions.push(sinT * rx, y + hemZigzag, cosT * rz - backMask * calfFlare * 0.16);
      uvs.push(u, v);
    }
  }

  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, d, c, a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a wide bell-shaped double-faced Samurai Hakama skirt flaring cleanly outward
 * around the hips with an inner dark-navy lining shell and glowing hem trim.
 */
function createWideBellHakamaSkirt(
  topR: number,
  bottomR: number,
  height: number,
  radialSegs = 40,
  verticalSegs = 14
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iv = 0; iv <= verticalSegs; iv++) {
    const v = iv / verticalSegs; // 0 = wide bottom hem, 1 = waist
    const y = (v - 1) * height;
    const bellT = Math.pow(1 - v, 0.72);
    const r = THREE.MathUtils.lerp(topR, bottomR, bellT);

    for (let iu = 0; iu <= radialSegs; iu++) {
      const u = iu / radialSegs;
      const theta = u * Math.PI * 2;
      const fold = Math.sin(theta * 8) * 0.055 * bellT;
      // Front-side gentle upward curve revealing the thighs like the reference pose
      const frontLift = Math.max(0, Math.cos(theta)) * 0.24 * bellT;
      const px = Math.sin(theta) * (r + fold) * 1.12;
      const pz = Math.cos(theta) * (r + fold) * 0.88;
      positions.push(px, y + frontLift, pz);
      uvs.push(u, 1 - v);
    }
  }

  const stride = radialSegs + 1;
  for (let iv = 0; iv < verticalSegs; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Stage 4: Complete / Perfect Susanoo — Faithful to reference artwork (images__1___2__4e794912.jpeg):
 * - High-contrast Icy-Blue outer armor + Deep Midnight-Navy skirt lining, wings & boot uppers
 * - Wide bell-shaped Samurai Hakama skirt with glowing rim & deep navy underside
 * - Spiky layered flame-armored forearms wielding twin glowing Cyan/Turquoise Samurai Katanas + hip scabbards
 * - Square O-Yoroi lamellar Sode shoulder shields with dark recessed 3x3 square grid plates
 * - Tall Deep-Navy sharp-pointed back wings framing the flame hair crown & Madara forehead crystal
 * - Wide flared thigh/shin Samurai cuffs, upward-spiked knee shields & two-tone curved boots
 * - Stride-triggered subtle heavy leg + camera tremor & dynamic heel/toe floor collision clamping
 */
function buildPerfectSusanooRig(variant: SusanooColorVariant = 'madara'): SusanooRig {
  const isItachi = variant === 'itachi';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const titanGroup = new THREE.Group();
  bodyGroup.add(titanGroup);

  const disposables: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const armorTex = createPerfectArmorPlateTexture(variant);
  const kimonoTex = createKimonoClothTexture(variant);

  // Outer Icy-Blue Samurai Plates & Flared Leg Wraps (matches bright pale-blue silhouette)
  const armorShell = createFresnelBlueMaterial({
    color: isItachi ? 0xf97316 : 0x93c5fd,
    emissive: isItachi ? 0xc2410c : 0x2563eb,
    emissiveIntensity: 0.78,
    rimColor: isItachi ? 0xfef08a : 0xe0f2fe,
    rimPower: 1.65,
    rimIntensity: 2.45,
    opacity: 0.92,
    roughness: 0.24,
    metalness: 0.18,
    depthWrite: true,
    map: armorTex,
    emissiveMap: armorTex,
  });

  // Light Kimono / Outer Skirt Fabric
  const kimonoShell = createFresnelBlueMaterial({
    color: isItachi ? 0xea580c : 0x60a5fa,
    emissive: isItachi ? 0x9a3412 : 0x1d4ed8,
    emissiveIntensity: 0.76,
    rimColor: isItachi ? 0xfdba74 : 0xbfdbfe,
    rimPower: 1.85,
    rimIntensity: 2.35,
    opacity: 0.91,
    roughness: 0.30,
    metalness: 0.12,
    depthWrite: true,
    map: kimonoTex,
    emissiveMap: kimonoTex,
  });

  // Deep Midnight-Navy Under-Suit, Skirt Lining, Sode Squares, Tall Back Wings & Boot Uppers
  const navyShell = createFresnelBlueMaterial({
    color: isItachi ? 0x7c2d12 : 0x0f256e,
    emissive: isItachi ? 0x450a0a : 0x091645,
    emissiveIntensity: 0.52,
    rimColor: isItachi ? 0xfb923c : 0x3b82f6,
    rimPower: 2.15,
    rimIntensity: 1.85,
    opacity: 0.95,
    roughness: 0.36,
    metalness: 0.14,
    depthWrite: true,
  });

  // Bright Ice-Cyan Trim, Spikes, Boots Rim & Chest Details
  const trimShell = createFresnelBlueMaterial({
    color: isItachi ? 0xfdba74 : 0x7dd3fc,
    emissive: isItachi ? 0xf97316 : 0x3b82f6,
    emissiveIntensity: 1.28,
    rimColor: isItachi ? 0xfef9c3 : 0xf0f9ff,
    rimPower: 1.4,
    rimIntensity: 2.95,
    opacity: 0.95,
    roughness: 0.16,
    metalness: 0.22,
    depthWrite: true,
  });

  // Glowing Turquoise-Cyan Chakra Katanas (exact match to image blade glow)
  const cyanKatanaShell = createFresnelBlueMaterial({
    color: isItachi ? 0xfef08a : 0x67e8f9,
    emissive: isItachi ? 0xf97316 : 0x06b6d4,
    emissiveIntensity: 1.75,
    rimColor: isItachi ? 0xffffff : 0xecfeff,
    rimPower: 1.25,
    rimIntensity: 3.35,
    opacity: 0.96,
    roughness: 0.10,
    metalness: 0.18,
    depthWrite: true,
  });

  const cavityShell = createFresnelBlueMaterial({
    color: 0x030712,
    emissive: 0x050b24,
    emissiveIntensity: 0.14,
    rimColor: isItachi ? 0x7c2d12 : 0x1e3a8a,
    rimPower: 3.4,
    rimIntensity: 0.28,
    opacity: 0.97,
    roughness: 0.85,
    metalness: 0.02,
    depthWrite: true,
  });

  const smokeShell = createFresnelBlueMaterial({
    color: isItachi ? 0xfb923c : 0x60a5fa,
    emissive: isItachi ? 0x7c2d12 : 0x1d4ed8,
    emissiveIntensity: 0.65,
    rimColor: isItachi ? 0xfed7aa : 0xbae6fd,
    rimPower: 1.5,
    rimIntensity: 1.65,
    opacity: 0.44,
    roughness: 0.78,
    metalness: 0.0,
    depthWrite: false,
  });

  const crystalMat = new THREE.MeshStandardMaterial({
    color: isItachi ? 0xfef08a : 0xbae6fd,
    emissive: isItachi ? 0xff4500 : 0x38bdf8,
    emissiveIntensity: 1.55,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.08,
    metalness: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const eyeMat = new THREE.MeshBasicMaterial({
    color: isItachi ? 0xfef08a : 0xe0f2fe,
    transparent: true,
    opacity: 0.98,
  });

  const armorMat = armorShell.mat;
  const kimonoMat = kimonoShell.mat;
  const navyMat = navyShell.mat;
  const trimMat = trimShell.mat;
  const cyanKatanaMat = cyanKatanaShell.mat;
  const cavityMat = cavityShell.mat;
  const smokeMat = smokeShell.mat;
  materials.push(armorMat, kimonoMat, navyMat, trimMat, cyanKatanaMat, cavityMat, smokeMat, crystalMat);

  // ============================================================================
  // 1. PELVIS, TIED WAIST OBI SASH & WIDE BELL SAMURAI HAKAMA SKIRT (DARK LINED)
  // ============================================================================
  const pelvisPivot = new THREE.Group();
  pelvisPivot.position.set(0, 8.52, 0);
  titanGroup.add(pelvisPivot);

  const pelvisLathePts = [
    new THREE.Vector2(0.01, -0.70),
    new THREE.Vector2(1.42, -0.60),
    new THREE.Vector2(1.38, -0.15),
    new THREE.Vector2(1.26, 0.34),
    new THREE.Vector2(1.30, 0.64),
    new THREE.Vector2(0.01, 0.68),
  ];
  const pelvisCoreGeo = trackGeo(new THREE.LatheGeometry(pelvisLathePts, 28));
  pelvisCoreGeo.scale(1.12, 1, 0.82);
  pelvisCoreGeo.computeVertexNormals();
  pelvisPivot.add(new THREE.Mesh(pelvisCoreGeo, navyMat));

  // Twisted Samurai Cloth Obi Waist Sash
  for (let w = 0; w < 3; w++) {
    const wy = 0.44 - w * 0.22;
    const tilt = (w - 1) * 0.08;
    const obiPts: THREE.Vector3[] = [];
    const wrapSteps = 20;
    for (let s = 0; s <= wrapSteps; s++) {
      const ang = (s / wrapSteps) * Math.PI * 2;
      const rx = 1.50 + Math.sin(ang * 2) * 0.04;
      const rz = 1.16 + Math.cos(ang * 3) * 0.03;
      obiPts.push(new THREE.Vector3(Math.sin(ang) * rx, wy + Math.sin(ang) * tilt, Math.cos(ang) * rz));
    }
    const obiCurve = new THREE.CatmullRomCurve3(obiPts, true);
    pelvisPivot.add(
      new THREE.Mesh(
        trackGeo(
          createTaperedOrganicTube(
            obiCurve,
            (t) => 0.15 + Math.sin(t * Math.PI * 4) * 0.028,
            34,
            10,
            () => 0.85,
            () => 1.32
          )
        ),
        w === 1 ? trimMat : armorMat
      )
    );
  }

  // Wide Bell-Shaped Samurai Hakama Skirt extending down to just above the knees
  const outerSkirtGeo = trackGeo(createWideBellHakamaSkirt(1.46, 3.54, 4.04, 42, 18));
  const outerSkirt = new THREE.Mesh(outerSkirtGeo, kimonoMat);
  outerSkirt.position.set(0, 0.34, 0);
  pelvisPivot.add(outerSkirt);

  // Dark Midnight-Navy Inner Skirt Lining (clearly visible beneath the flared skirt!)
  const innerSkirtGeo = trackGeo(createWideBellHakamaSkirt(1.40, 3.46, 4.01, 38, 16));
  const innerSkirt = new THREE.Mesh(innerSkirtGeo, navyMat);
  innerSkirt.position.set(0, 0.32, 0);
  pelvisPivot.add(innerSkirt);

  // Glowing Horizontal & Vertical Rim Seams on the Wide Skirt
  for (const ringSpec of [
    { y: -3.70, rx: 3.96, rz: 3.12, tube: 0.074, liftScale: 1.0, mat: trimMat },
    { y: -3.05, rx: 3.68, rz: 2.90, tube: 0.052, liftScale: 0.88, mat: navyMat },
  ]) {
    const hemPts: THREE.Vector3[] = [];
    for (let s = 0; s <= 36; s++) {
      const ang = (s / 36) * Math.PI * 2;
      const frontLift = Math.max(0, Math.cos(ang)) * 0.24 * ringSpec.liftScale;
      hemPts.push(new THREE.Vector3(Math.sin(ang) * ringSpec.rx, ringSpec.y + frontLift, Math.cos(ang) * ringSpec.rz));
    }
    const hemCurve = new THREE.CatmullRomCurve3(hemPts, true);
    pelvisPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(hemCurve, 44, ringSpec.tube, 8, true)), ringSpec.mat)
    );
  }

  // Front crisp vertical seam lines sweeping down the wide skirt to the knee-level hem
  for (const ang of [-0.52, 0.0, 0.52]) {
    const cosA = Math.max(0, Math.cos(ang));
    const seamCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(ang) * 1.86, 0.18 + cosA * 0.02, Math.cos(ang) * 1.46),
      new THREE.Vector3(Math.sin(ang) * 3.05, -1.68 + cosA * 0.145, Math.cos(ang) * 2.39),
      new THREE.Vector3(Math.sin(ang) * 3.93, -3.62 + cosA * 0.236, Math.cos(ang) * 3.09),
    ]);
    pelvisPivot.add(
      new THREE.Mesh(trackGeo(new THREE.TubeGeometry(seamCurve, 16, 0.044, 6, false)), trimMat)
    );
  }

  // ============================================================================
  // 2. WIDE FLARED SAMURAI LEGS, SPIKED KNEE GUARDS, BELL SHIN CUFFS & 2-TONE BOOTS
  // ============================================================================
  const kneeRingGeo = trackGeo(new THREE.TorusGeometry(0.62, 0.075, 10, 22));
  const kneeShieldGeo = trackGeo(createCurvedLamellarShield(0.96, 1.05, 1.15, 0.14, true));
  const kneeSpikeGeo = trackGeo(new THREE.ConeGeometry(0.14, 0.64, 5));
  const ankleCuffGeo = trackGeo(new THREE.CylinderGeometry(0.50, 0.44, 0.52, 16));

  // Two-Tone Samurai Boot: Bright Icy-Blue Upturned Curved Boat Sole + Dark Navy Upper Instep
  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.46, -0.34);
  soleShape.lineTo(0.28, -0.34);
  soleShape.quadraticCurveTo(0.74, -0.34, 1.18, -0.20);
  soleShape.quadraticCurveTo(1.52, -0.02, 1.44, 0.32); // Curved upturned toe tip!
  soleShape.quadraticCurveTo(1.24, 0.34, 0.96, 0.14);
  soleShape.quadraticCurveTo(0.44, 0.04, -0.34, 0.06);
  soleShape.quadraticCurveTo(-0.52, -0.10, -0.46, -0.34);
  const bootSoleGeo = trackGeo(
    new THREE.ExtrudeGeometry(soleShape, {
      steps: 2,
      depth: 0.74,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.09,
      bevelSegments: 2,
    })
  );
  bootSoleGeo.translate(0, 0, -0.37);
  bootSoleGeo.rotateY(-Math.PI * 0.5);
  bootSoleGeo.computeVertexNormals();

  // Dark Midnight-Navy Upper Instep Boot Body
  const upperBootShape = new THREE.Shape();
  upperBootShape.moveTo(-0.34, -0.02);
  upperBootShape.lineTo(0.98, 0.02);
  upperBootShape.quadraticCurveTo(1.16, 0.16, 0.88, 0.24);
  upperBootShape.quadraticCurveTo(0.48, 0.28, 0.24, 0.48);
  upperBootShape.quadraticCurveTo(-0.18, 0.52, -0.36, 0.34);
  upperBootShape.closePath();
  const upperBootGeo = trackGeo(
    new THREE.ExtrudeGeometry(upperBootShape, {
      steps: 2,
      depth: 0.62,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.07,
      bevelSegments: 2,
    })
  );
  upperBootGeo.translate(0, 0, -0.31);
  upperBootGeo.rotateY(-Math.PI * 0.5);
  upperBootGeo.computeVertexNormals();

  interface LegRigNodes {
    hipPivot: THREE.Group;
    kneePivot: THREE.Group;
    anklePivot: THREE.Group;
    heelAnchor: THREE.Object3D;
    toeAnchor: THREE.Object3D;
  }

  const buildSamuraiLeg = (side: -1 | 1): LegRigNodes => {
    const hipPivot = new THREE.Group();
    // Wide authoritative heroic samurai stance matching reference image
    hipPivot.position.set(side * 1.18, -0.28, 0);
    hipPivot.rotation.set(0, side * 0.14, side * 0.10);
    pelvisPivot.add(hipPivot);

    const thighGeo = trackGeo(createAnatomicalThighGeometry(4.15, side));
    const thigh = new THREE.Mesh(thighGeo, armorMat);
    hipPivot.add(thigh);

    // Subtle dark thigh seam accents
    const thighSeam = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.76, 0.054, 8, 22)), trimMat);
    thighSeam.rotation.x = Math.PI * 0.5;
    thighSeam.position.set(-side * 0.06, -4.02, 0);
    hipPivot.add(thighSeam);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(-side * 0.08, -4.10, 0.05);
    hipPivot.add(kneePivot);

    // Dark joint crease band around knee
    const kneeCrease = new THREE.Mesh(kneeRingGeo, navyMat);
    kneeCrease.rotation.x = Math.PI * 0.5;
    kneePivot.add(kneeCrease);

    // Armored Samurai Poleyn Knee Shield with upward jagged dorsal spikes
    const kneeGuard = new THREE.Mesh(kneeShieldGeo, armorMat);
    kneeGuard.position.set(0, 0.14, 0.56);
    kneePivot.add(kneeGuard);

    for (const spX of [-0.24, 0.16]) {
      const kSpike = new THREE.Mesh(kneeSpikeGeo, trimMat);
      kSpike.position.set(side * spX, 0.72, 0.52);
      kSpike.rotation.z = side * (spX < 0 ? 0.22 : -0.14);
      kSpike.rotation.x = 0.12;
      kneePivot.add(kSpike);
    }

    // Wide Flared Bell-Bottom Samurai Shin Wrap
    const shinGeo = trackGeo(createAnatomicalShinGeometry(4.05, side));
    const shin = new THREE.Mesh(shinGeo, armorMat);
    kneePivot.add(shin);

    // Articulated Ankle Joint & Two-Tone Samurai Boot (Dark Navy Upper + Bright Blue Curved Sole)
    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -3.98, 0.02);
    kneePivot.add(anklePivot);

    const ankleCollar = new THREE.Mesh(ankleCuffGeo, navyMat);
    ankleCollar.position.set(0, -0.02, 0.02);
    anklePivot.add(ankleCollar);

    const upperBoot = new THREE.Mesh(upperBootGeo, navyMat);
    upperBoot.position.set(0, -0.18, 0.22);
    anklePivot.add(upperBoot);

    const bootSole = new THREE.Mesh(bootSoleGeo, armorMat);
    bootSole.position.set(0, -0.14, 0.24);
    anklePivot.add(bootSole);

    // Ground-collision contact anchors at lowest heel & toe sole points
    const heelAnchor = new THREE.Object3D();
    heelAnchor.position.set(0, -0.58, -0.26);
    anklePivot.add(heelAnchor);

    const toeAnchor = new THREE.Object3D();
    toeAnchor.position.set(0, -0.58, 1.18);
    anklePivot.add(toeAnchor);

    return { hipPivot, kneePivot, anklePivot, heelAnchor, toeAnchor };
  };

  const rightLeg = buildSamuraiLeg(-1);
  const leftLeg = buildSamuraiLeg(1);

  // ============================================================================
  // 3. KIMONO HAORI CHEST (LIGHT OUTER + DARK NAVY UNDERPLATE) & MAGATAMA COLLAR
  // ============================================================================
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.44, 0);
  pelvisPivot.add(torsoPivot);

  const torsoLathePts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(1.22, 0.07),
    new THREE.Vector2(1.38, 0.87),
    new THREE.Vector2(1.82, 2.04),
    new THREE.Vector2(2.12, 3.20),
    new THREE.Vector2(1.86, 3.90),
    new THREE.Vector2(0.86, 4.23),
    new THREE.Vector2(0.01, 4.30),
  ];
  const torsoCoreGeo = trackGeo(new THREE.LatheGeometry(torsoLathePts, 28));
  torsoCoreGeo.scale(1.16, 1.0, 0.78);
  torsoCoreGeo.computeVertexNormals();
  torsoPivot.add(new THREE.Mesh(torsoCoreGeo, armorMat));

  // Dark Navy Upper Breastplate / Yoke framing the chest triangle (exact visual match)
  const chestYokeGeo = trackGeo(createCurvedLamellarShield(2.35, 1.50, 1.55, 0.16, false));
  const chestYoke = new THREE.Mesh(chestYokeGeo, navyMat);
  chestYoke.position.set(0, 3.30, 1.58);
  chestYoke.rotation.x = 0.22;
  torsoPivot.add(chestYoke);

  // Dark Triangular Chest Emblem on sternum
  const chestTriGeo = trackGeo(new THREE.ConeGeometry(0.30, 0.44, 3));
  const chestTri = new THREE.Mesh(chestTriGeo, navyMat);
  chestTri.position.set(0, 2.15, 1.66);
  chestTri.rotation.z = Math.PI;
  chestTri.scale.set(1.15, 0.95, 0.4);
  torsoPivot.add(chestTri);

  // Crossed Diagonal Kimono Haori Lapels
  const leftLapelCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 3.98, 0.66),
    new THREE.Vector3(-0.34, 3.20, 1.44),
    new THREE.Vector3(0.24, 1.99, 1.60),
    new THREE.Vector3(0.76, 0.63, 1.36),
    new THREE.Vector3(0.92, -0.04, 1.24),
  ]);
  torsoPivot.add(
    new THREE.Mesh(
      trackGeo(
        createTaperedOrganicTube(
          leftLapelCurve,
          (t) => 0.24 + Math.sin(t * Math.PI) * 0.09,
          24,
          12,
          () => 1.35,
          () => 0.46
        )
      ),
      trimMat
    )
  );

  const rightLapelCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.62, 3.98, 0.66),
    new THREE.Vector3(0.32, 3.18, 1.40),
    new THREE.Vector3(-0.26, 1.90, 1.56),
    new THREE.Vector3(-0.74, 0.60, 1.32),
  ]);
  torsoPivot.add(
    new THREE.Mesh(
      trackGeo(
        createTaperedOrganicTube(
          rightLapelCurve,
          (t) => 0.22 + Math.sin(t * Math.PI) * 0.08,
          22,
          12,
          () => 1.30,
          () => 0.44
        )
      ),
      navyMat
    )
  );

  // Upturned High Samurai Collar
  const collarShieldGeo = trackGeo(createCurvedLamellarShield(2.32, 1.24, 2.24, 0.14, true));
  const highCollar = new THREE.Mesh(collarShieldGeo, armorMat);
  highCollar.position.set(0, 4.12, -0.20);
  highCollar.rotation.y = Math.PI;
  highCollar.rotation.x = 0.24;
  torsoPivot.add(highCollar);

  // ============================================================================
  // 4. SQUARE O-YOROI SODE SHOULDER GRIDS & TALL DEEP-NAVY SPIKED BACK WINGS
  // ============================================================================
  const sodeFrameGeo = trackGeo(createCurvedLamellarShield(2.22, 2.38, 0.72, 0.16, true));
  const sodeDarkTileGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.44, 0.12));
  const mainWingFeatherGeo = trackGeo(createFeatheredWingPlateGeometry(6.5, 1.28));
  const subWingFeatherGeo = trackGeo(createFeatheredWingPlateGeometry(4.7, 1.04));

  const wingGroups: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    // Square Lamellar O-Yoroi Sode Shield with dark 3x3 recessed grid tiles (matches reference!)
    const sodeGroup = new THREE.Group();
    sodeGroup.position.set(side * 2.40, 3.08, 0.14);
    sodeGroup.rotation.y = side * Math.PI * 0.42;
    sodeGroup.rotation.x = -0.18;
    sodeGroup.rotation.z = side * -0.12;
    torsoPivot.add(sodeGroup);

    sodeGroup.add(new THREE.Mesh(sodeFrameGeo, armorMat));

    // 3x3 Dark Midnight-Navy Square Slots mounted across the outer Sode plate
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const tile = new THREE.Mesh(sodeDarkTileGeo, navyMat);
        tile.position.set(col * 0.56, row * 0.54 - 0.08, 0.08);
        tile.rotation.y = col * 0.16;
        sodeGroup.add(tile);
      }
    }

    // Tall Deep Midnight-Navy Spiked Back Wings framing the shoulders & head
    const wingRoot = new THREE.Group();
    wingRoot.position.set(side * 0.96, 3.48, -0.92);
    torsoPivot.add(wingRoot);
    wingGroups.push(wingRoot);

    const wingSparCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 1.12, 1.48, -0.44),
      new THREE.Vector3(side * 2.28, 3.45, -0.86),
    ]);
    wingRoot.add(
      new THREE.Mesh(
        trackGeo(createTaperedOrganicTube(wingSparCurve, (t) => 0.30 * (1 - t * 0.68), 16, 10)),
        navyMat
      )
    );

    const featherSpecs = [
      { x: 0.42, y: 0.45, z: -0.08, rx: -0.16, rz: -0.24, sy: 1.06, isMain: true },
      { x: 0.94, y: 0.24, z: -0.20, rx: -0.20, rz: -0.50, sy: 0.96, isMain: true },
      { x: 1.38, y: -0.32, z: -0.30, rx: -0.22, rz: -0.84, sy: 0.88, isMain: false },
      { x: 1.54, y: -1.18, z: -0.32, rx: -0.20, rz: -1.26, sy: 0.80, isMain: false },
      { x: 1.32, y: -2.06, z: -0.28, rx: -0.16, rz: -1.72, sy: 0.72, isMain: false },
    ];
    for (let f = 0; f < featherSpecs.length; f++) {
      const sp = featherSpecs[f];
      const feather = new THREE.Mesh(
        sp.isMain ? mainWingFeatherGeo : subWingFeatherGeo,
        navyMat
      );
      feather.position.set(side * sp.x, sp.y, sp.z);
      feather.scale.set(1, sp.sy, 1);
      feather.rotation.set(sp.rx, side * 0.22, side * sp.rz);
      wingRoot.add(feather);
    }
  }

  // ============================================================================
  // 5. SCULPTED TENGU SAMURAI HEAD, FLAME HAIR, CURVED HORNS & MADARA FOREHEAD SEAL
  // ============================================================================
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 4.44, 0.16);
  torsoPivot.add(headPivot);

  const neckLathePts = [
    new THREE.Vector2(0.01, -0.35),
    new THREE.Vector2(0.68, -0.30),
    new THREE.Vector2(0.54, 0.15),
    new THREE.Vector2(0.50, 0.45),
    new THREE.Vector2(0.01, 0.50),
  ];
  headPivot.add(new THREE.Mesh(trackGeo(new THREE.LatheGeometry(neckLathePts, 20)), navyMat));

  const craniumGeo = trackGeo(new THREE.SphereGeometry(0.95, 28, 22));
  const cPos = craniumGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    let x = cPos.getX(i);
    let y = cPos.getY(i);
    let z = cPos.getZ(i);
    y *= 1.18;
    x *= 0.92;
    z *= 1.02;
    if (y < 0) {
      const chinT = Math.min(1, -y / 1.1);
      x *= 1 - chinT * 0.42;
      z += chinT * 0.14 * (z > 0 ? 1 : -0.4);
    }
    if (y > 0.1 && z > 0.2) {
      x *= 1.06;
    }
    cPos.setXYZ(i, x, y, z);
  }
  cPos.needsUpdate = true;
  craniumGeo.computeVertexNormals();
  const cranium = new THREE.Mesh(craniumGeo, armorMat);
  cranium.position.set(0, 0.82, 0.02);
  headPivot.add(cranium);

  const mouthHollow = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.56, 18, 14)), cavityMat);
  mouthHollow.scale.set(1.06, 0.64, 0.72);
  mouthHollow.position.set(0, 0.36, 0.56);
  headPivot.add(mouthHollow);

  const jawCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.64, 0.54, 0.18),
    new THREE.Vector3(-0.42, 0.22, 0.76),
    new THREE.Vector3(0, 0.14, 0.92),
    new THREE.Vector3(0.42, 0.22, 0.76),
    new THREE.Vector3(0.64, 0.54, 0.18),
  ]);
  headPivot.add(
    new THREE.Mesh(
      trackGeo(createTaperedOrganicTube(jawCurve, (t) => 0.13 - Math.abs(t - 0.5) * 0.04, 22, 10)),
      armorMat
    )
  );

  // Long Smooth Tapered Tengu Nose
  const noseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.78, 0.88),
    new THREE.Vector3(0, 0.62, 1.32),
    new THREE.Vector3(0, 0.36, 1.88),
  ]);
  headPivot.add(
    new THREE.Mesh(
      trackGeo(
        createTaperedOrganicTube(
          noseCurve,
          (t) => THREE.MathUtils.lerp(0.165, 0.058, Math.pow(t, 0.75)),
          18,
          14
        )
      ),
      trimMat
    )
  );

  const almondEyeShape = new THREE.Shape();
  almondEyeShape.moveTo(-0.22, 0);
  almondEyeShape.quadraticCurveTo(0, 0.11, 0.22, 0.03);
  almondEyeShape.quadraticCurveTo(0.02, -0.08, -0.22, 0);
  const almondEyeGeo = trackGeo(
    new THREE.ExtrudeGeometry(almondEyeShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 2,
    })
  );

  for (const side of [-1, 1] as const) {
    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.10, 0.80, 0.94),
      new THREE.Vector3(side * 0.38, 0.92, 0.90),
      new THREE.Vector3(side * 0.68, 1.04, 0.66),
    ]);
    headPivot.add(
      new THREE.Mesh(
        trackGeo(createTaperedOrganicTube(browCurve, (t) => 0.115 * (1 - t * 0.25), 14, 10)),
        navyMat
      )
    );

    const eye = new THREE.Mesh(almondEyeGeo, eyeMat);
    eye.position.set(side * 0.34, 0.76, 0.88);
    eye.rotation.y = side * 0.22;
    eye.rotation.z = side * -0.24;
    headPivot.add(eye);

    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.62, 1.24, 0.44),
      new THREE.Vector3(side * 1.18, 1.48, 0.32),
      new THREE.Vector3(side * 1.54, 1.88, 0.16),
      new THREE.Vector3(side * 1.66, 2.34, 0.06),
    ]);
    headPivot.add(
      new THREE.Mesh(
        trackGeo(
          createTaperedOrganicTube(
            hornCurve,
            (t) => THREE.MathUtils.lerp(0.20, 0.032, Math.pow(t, 1.1)),
            20,
            12,
            () => 1.15,
            () => 0.75
          )
        ),
        trimMat
      )
    );

    const sideLockCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.78, 1.06, 0.28),
      new THREE.Vector3(side * 0.92, 0.64, 0.32),
      new THREE.Vector3(side * 0.88, 0.14, 0.28),
      new THREE.Vector3(side * 0.76, -0.28, 0.22),
    ]);
    headPivot.add(
      new THREE.Mesh(
        trackGeo(
          createTaperedOrganicTube(
            sideLockCurve,
            (t) => 0.17 * Math.sin(t * Math.PI * 0.85 + 0.35),
            16,
            10,
            () => 1.25,
            () => 0.75
          )
        ),
        navyMat
      )
    );
    const hairTieRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.18, 0.052, 8, 16)),
      trimMat
    );
    hairTieRing.position.set(side * 0.91, 0.56, 0.31);
    hairTieRing.rotation.x = Math.PI * 0.5;
    headPivot.add(hairTieRing);
  }

  // Deep-Navy & Icy-Blue Spiky Flame Hair Crown
  const hairLockCount = 9;
  for (let h = 0; h < hairLockCount; h++) {
    const frac = (h / (hairLockCount - 1)) * 2 - 1;
    const baseAngle = frac * 1.15;
    const lockHeight = 1.65 + (1 - Math.abs(frac)) * 0.75 + (h % 2) * 0.22;
    const lockCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(baseAngle) * 0.68, 1.32, Math.cos(baseAngle) * 0.42 - 0.15),
      new THREE.Vector3(Math.sin(baseAngle) * 0.96, 1.32 + lockHeight * 0.45, -0.18 - Math.abs(frac) * 0.22),
      new THREE.Vector3(
        Math.sin(baseAngle) * 1.18 + Math.sin(h * 1.7) * 0.16,
        1.32 + lockHeight * 0.82,
        -0.46 - Math.abs(frac) * 0.18
      ),
      new THREE.Vector3(Math.sin(baseAngle) * 1.06, 1.32 + lockHeight * 1.06, -0.22),
    ]);
    headPivot.add(
      new THREE.Mesh(
        trackGeo(
          createTaperedOrganicTube(
            lockCurve,
            (t) => THREE.MathUtils.lerp(0.24, 0.025, Math.pow(t, 0.95)),
            18,
            10,
            () => 1.55,
            () => 0.48
          )
        ),
        h % 2 === 0 ? navyMat : armorMat
      )
    );
  }

  // Glowing Forehead Seal Crystal Housing Madara!
  const shrineShape = new THREE.Shape();
  shrineShape.moveTo(0, 0.98);
  shrineShape.lineTo(0.76, 0.36);
  shrineShape.lineTo(0.58, -0.78);
  shrineShape.lineTo(-0.58, -0.78);
  shrineShape.lineTo(-0.76, 0.36);
  shrineShape.closePath();

  const shrineFrameShape = shrineShape.clone();
  const holePath = new THREE.Path();
  holePath.moveTo(0, 0.78);
  holePath.lineTo(0.58, 0.26);
  holePath.lineTo(0.42, -0.62);
  holePath.lineTo(-0.42, -0.62);
  holePath.lineTo(-0.58, 0.26);
  holePath.closePath();
  shrineFrameShape.holes.push(holePath);

  const shrineFrameGeo = trackGeo(
    new THREE.ExtrudeGeometry(shrineFrameShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    })
  );
  const shrineFrame = new THREE.Mesh(shrineFrameGeo, trimMat);
  shrineFrame.position.set(0, 1.38, 0.62);
  headPivot.add(shrineFrame);

  const foreheadCrystalGeo = trackGeo(
    new THREE.ExtrudeGeometry(shrineShape, {
      depth: 0.56,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 3,
    })
  );
  const foreheadCrystal = new THREE.Mesh(foreheadCrystalGeo, crystalMat);
  foreheadCrystal.position.set(0, 1.38, 0.52);
  headPivot.add(foreheadCrystal);

  const pilotAnchor = new THREE.Object3D();
  pilotAnchor.position.set(0, 0.62, 0.78);
  headPivot.add(pilotAnchor);

  // ============================================================================
  // 6. SPIKY LAYERED FOREARM GAUNTLETS, DUAL CYAN KATANAS & DUAL HIP SCABBARDS
  // ============================================================================
  const kimonoSleeveGeo = trackGeo(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.01, -2.02),
        new THREE.Vector2(0.76, -1.96),
        new THREE.Vector2(0.66, -1.25),
        new THREE.Vector2(0.52, -0.45),
        new THREE.Vector2(0.58, 0.02),
        new THREE.Vector2(0.01, 0.08),
      ],
      20
    )
  );
  const koteForearmGeo = trackGeo(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.01, 0.0),
        new THREE.Vector2(0.52, 0.16),
        new THREE.Vector2(0.64, 0.86),
        new THREE.Vector2(0.48, 1.56),
        new THREE.Vector2(0.36, 1.98),
        new THREE.Vector2(0.01, 2.04),
      ],
      18
    )
  );
  koteForearmGeo.rotateX(Math.PI * 0.5);
  koteForearmGeo.computeVertexNormals();

  // Sharp Flame-Like Spiky Armor Scales covering the forearms (matches jagged arms in reference!)
  const forearmSpikeGeo = trackGeo(new THREE.ConeGeometry(0.24, 0.92, 5));
  const colossalKatanaGeo = trackGeo(createSculptedSamuraiKatanaGeometry(7.2, 0.54));
  const hiltWrapGeo = trackGeo(new THREE.CylinderGeometry(0.115, 0.13, 1.42, 14));
  const tsubaGuardGeo = trackGeo(new THREE.TorusGeometry(0.25, 0.055, 8, 18));
  const palmGeo = trackGeo(new THREE.SphereGeometry(0.32, 14, 12));
  const fingerGeo = trackGeo(new THREE.CapsuleGeometry(0.068, 0.34, 6, 8));

  const buildSamuraiArm = (side: -1 | 1) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 2.34, 3.32, 0.10);
    torsoPivot.add(shoulderPivot);

    const upperSleeve = new THREE.Mesh(kimonoSleeveGeo, navyMat);
    upperSleeve.position.set(side * 0.14, -0.05, 0.14);
    upperSleeve.rotation.z = side * 0.16;
    shoulderPivot.add(upperSleeve);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(side * 0.36, -1.96, 0.28);
    shoulderPivot.add(forearmPivot);

    forearmPivot.add(new THREE.Mesh(koteForearmGeo, armorMat));

    // 14 Spiraled Jagged Flame-Armored Spikes along the forearm silhouette
    for (let k = 0; k < 14; k++) {
      const zFrac = 0.18 + (k / 13) * 1.62;
      const ringAngle = k * 1.15 + (side > 0 ? 0 : Math.PI * 0.5);
      const rOffset = 0.44 + Math.sin((k / 13) * Math.PI) * 0.16;
      const spike = new THREE.Mesh(forearmSpikeGeo, k % 3 === 0 ? trimMat : armorMat);
      spike.position.set(Math.cos(ringAngle) * rOffset, Math.sin(ringAngle) * rOffset, zFrac);
      spike.rotation.z = ringAngle - Math.PI * 0.5;
      spike.rotation.x = -0.72;
      spike.scale.set(0.88, 0.92 + (k % 3) * 0.18, 0.88);
      forearmPivot.add(spike);
    }

    const cuffRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.36, 0.065, 8, 18)), trimMat);
    cuffRing.position.set(0, 0, 1.92);
    forearmPivot.add(cuffRing);

    const handPivot = new THREE.Group();
    handPivot.position.set(0, 0, 2.06);
    forearmPivot.add(handPivot);

    const palm = new THREE.Mesh(palmGeo, armorMat);
    palm.scale.set(0.95, 0.72, 1.25);
    handPivot.add(palm);

    for (let f = 0; f < 4; f++) {
      const fMesh = new THREE.Mesh(fingerGeo, trimMat);
      fMesh.position.set(side * -0.18, -0.16, -0.12 + f * 0.14);
      fMesh.rotation.z = side * 0.85;
      fMesh.rotation.x = 0.22;
      handPivot.add(fMesh);
    }
    const thumb = new THREE.Mesh(fingerGeo, trimMat);
    thumb.position.set(side * -0.14, 0.18, 0.10);
    thumb.rotation.z = side * -0.45;
    handPivot.add(thumb);

    const bladePivot = new THREE.Group();
    bladePivot.position.set(0, -0.08, 0.16);
    handPivot.add(bladePivot);

    const hilt = new THREE.Mesh(hiltWrapGeo, navyMat);
    hilt.position.set(0, -0.12, 0);
    bladePivot.add(hilt);

    const tsuba = new THREE.Mesh(tsubaGuardGeo, trimMat);
    tsuba.position.set(0, 0.58, 0);
    tsuba.rotation.x = Math.PI * 0.5;
    bladePivot.add(tsuba);

    // Glowing Cyan-Turquoise Katana Blade (exact bright turquoise glow from reference!)
    const katana = new THREE.Mesh(colossalKatanaGeo, cyanKatanaMat);
    katana.position.set(0, 0.60, 0);
    katana.rotation.x = -Math.PI * 0.5 - 0.16;
    katana.rotation.y = side * -0.12;
    bladePivot.add(katana);

    return { shoulderPivot, forearmPivot, bladePivot };
  };

  const rightArm = buildSamuraiArm(-1);
  const leftArm = buildSamuraiArm(1);

  // Dual Diagonal Katana Scabbards (Saya) & Hilts strapped at BOTH hips (matches reference silhouette!)
  for (const side of [-1, 1] as const) {
    const sayaGroup = new THREE.Group();
    sayaGroup.position.set(side * 1.48, 0.22, 0.18);
    sayaGroup.rotation.set(0.42, side * 0.28, side * -0.22);
    pelvisPivot.add(sayaGroup);

    const sayaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.34, 0.86),
      new THREE.Vector3(0, -0.12, -0.78),
      new THREE.Vector3(0, -0.62, -2.42),
      new THREE.Vector3(0, -1.04, -3.95),
    ]);
    sayaGroup.add(
      new THREE.Mesh(
        trackGeo(createTaperedOrganicTube(sayaCurve, (t) => THREE.MathUtils.lerp(0.16, 0.11, t), 20, 10, () => 0.72, () => 1.15)),
        navyMat
      )
    );
    const sayaTsuba = new THREE.Mesh(tsubaGuardGeo, trimMat);
    sayaTsuba.position.set(0, 0.36, 0.88);
    sayaGroup.add(sayaTsuba);
    const sayaHilt = new THREE.Mesh(hiltWrapGeo, trimMat);
    sayaHilt.rotation.x = Math.PI * 0.42;
    sayaHilt.position.set(0, 0.64, 1.52);
    sayaGroup.add(sayaHilt);
  }

  // Soft low ground chakra aura puffs below ankle height
  const mistGroup = new THREE.Group();
  mistGroup.position.set(0, 0.18, 0.15);
  titanGroup.add(mistGroup);
  const smokePuffGeo = trackGeo(new THREE.SphereGeometry(0.62, 14, 10));
  const smokeNodes: Array<{ mesh: THREE.Mesh; baseAngle: number; baseR: number; baseY: number; s: number }> = [];
  const puffCount = 14;
  for (let i = 0; i < puffCount; i++) {
    const ang = (i / puffCount) * Math.PI * 2;
    const radius = 2.75 + (i % 3) * 0.40;
    const puffScale = 0.78 + ((i * 37) % 10) * 0.05;
    const puff = new THREE.Mesh(smokePuffGeo, smokeMat);
    const py = ((i % 3) - 1.0) * 0.08;
    puff.position.set(Math.sin(ang) * radius, py, Math.cos(ang) * radius);
    puff.scale.set(puffScale * 1.32, puffScale * 0.36, puffScale * 1.24);
    mistGroup.add(puff);
    smokeNodes.push({ mesh: puff, baseAngle: ang, baseR: radius, baseY: py, s: puffScale });
  }

  titanGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.frustumCulled = false;
      obj.renderOrder = 20;
    }
  });
  foreheadCrystal.renderOrder = 22;

  const interiorLight = new THREE.PointLight(isItachi ? 0xff4500 : 0x38bdf8, 3.4, 16.5);
  interiorLight.position.set(0, 11.4, 1.5);
  bodyGroup.add(interiorLight);

  const auraTex = createSoftGlowTexture();
  const auraMat = new THREE.SpriteMaterial({
    map: auraTex,
    color: isItachi ? 0xff4500 : 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 5.2, 0);
  auraSprite.scale.set(9.5, 9.5, 1);
  auraSprite.renderOrder = 19;
  bodyGroup.add(auraSprite);

  let baseTitanOffsetY = 0;
  const fitToTargetWorldHeight = (targetWorldHeight: number) => {
    const safeTargetH = Math.max(6.5, targetWorldHeight || 10.6);
    titanGroup.scale.setScalar(1);
    titanGroup.position.set(0, 0, 0);
    titanGroup.updateMatrixWorld(true);
    _boxA.setFromObject(titanGroup);
    _boxA.getSize(_sizeA);
    const scaleFactor = safeTargetH / Math.max(1, _sizeA.y);
    titanGroup.scale.setScalar(scaleFactor);
    baseTitanOffsetY = -_boxA.min.y * scaleFactor;
    titanGroup.position.y = baseTitanOffsetY;
    titanGroup.updateMatrixWorld(true);

    auraSprite.position.set(0, safeTargetH * 0.5, 0);
    auraSprite.scale.set(safeTargetH * 0.94, safeTargetH * 0.94, 1);
  };

  let currentOpacity = 0.88;
  const setOpacity = (opacity: number) => {
    currentOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    const ratio = currentOpacity / 0.88;
    armorMat.opacity = currentOpacity * 0.96;
    kimonoMat.opacity = currentOpacity * 0.95;
    navyMat.opacity = Math.min(0.98, currentOpacity * 1.04);
    trimMat.opacity = Math.min(0.98, currentOpacity * 1.06);
    cyanKatanaMat.opacity = Math.min(0.98, currentOpacity * 1.08);
    cavityMat.opacity = Math.min(0.98, currentOpacity * 1.08);
    smokeMat.opacity = ratio * 0.44;
    crystalMat.opacity = ratio * 0.36;
    eyeMat.opacity = Math.min(1, ratio * 0.98);
    armorShell.uniforms.uRimIntensity.value = 2.45 * ratio;
    kimonoShell.uniforms.uRimIntensity.value = 2.35 * ratio;
    navyShell.uniforms.uRimIntensity.value = 1.85 * ratio;
    trimShell.uniforms.uRimIntensity.value = 2.95 * ratio;
    cyanKatanaShell.uniforms.uRimIntensity.value = 3.35 * ratio;
    smokeShell.uniforms.uRimIntensity.value = 1.65 * ratio;
    auraMat.opacity = ratio * 0.28;
    interiorLight.intensity = ratio * 3.4;
  };

  // Footstep tremor & floor-collision tracking state
  let prevCosPhase = 1;
  let stepTremorTimer = 0;
  let plantedFootSide: -1 | 1 = 1;
  let pendingFootstepImpact = 0;

  const consumeFootstepImpact = () => {
    const val = pendingFootstepImpact;
    pendingFootstepImpact = 0;
    return val;
  };

  const update = (
    dt: number,
    elapsed: number,
    forwardLeanRad: number,
    slashProgress: number,
    intensity = 1,
    stridePhase = 0,
    strideAmount = 0,
    comboStep = 0
  ) => {
    const slash = computeComboSlashKinematics(slashProgress, comboStep);
    const walkAmp = THREE.MathUtils.clamp(strideAmount, 0, 1);

    // Detect heavy footstrike when the swinging leg crosses down onto the planted phase
    const cosP = Math.cos(stridePhase);
    if (walkAmp > 0.14) {
      if ((prevCosPhase >= 0 && cosP < 0) || (prevCosPhase <= 0 && cosP > 0)) {
        plantedFootSide = cosP < 0 ? -1 : 1;
        stepTremorTimer = 0.22;
        pendingFootstepImpact = Math.max(pendingFootstepImpact, 0.55 + walkAmp * 0.45);
      }
    } else {
      stepTremorTimer = Math.max(0, stepTremorTimer - dt);
    }
    prevCosPhase = cosP;

    if (stepTremorTimer > 0) {
      stepTremorTimer = Math.max(0, stepTremorTimer - dt);
    }
    const tremorDecay = stepTremorTimer / 0.22;
    const legTremor = Math.sin(elapsed * 62.0) * tremorDecay * 0.042 * Math.max(0.35, walkAmp);

    // Stride Kinematics: swinging leg bends knee high (+X) so foot clears floor; planted leg extends
    const legSwing = Math.sin(stridePhase) * 0.36 * walkAmp;
    const rightKneeBend = Math.max(0, Math.sin(stridePhase)) * 0.62 * walkAmp;
    const leftKneeBend = Math.max(0, -Math.sin(stridePhase)) * 0.62 * walkAmp;
    const rightAnkleFlex = -Math.sin(stridePhase) * 0.18 * walkAmp - rightKneeBend * 0.32;
    const leftAnkleFlex = Math.sin(stridePhase) * 0.18 * walkAmp - leftKneeBend * 0.32;

    const rTremor = plantedFootSide === -1 ? legTremor : legTremor * 0.35;
    const lTremor = plantedFootSide === 1 ? legTremor : legTremor * 0.35;

    rightLeg.hipPivot.rotation.set(-legSwing, -0.14, -0.10 + rTremor * 0.45);
    rightLeg.kneePivot.rotation.set(rightKneeBend + rTremor, 0, 0);
    rightLeg.anklePivot.rotation.set(rightAnkleFlex + legSwing * 0.55 - rTremor * 0.6, 0, 0);

    leftLeg.hipPivot.rotation.set(legSwing, 0.14, 0.10 - lTremor * 0.45);
    leftLeg.kneePivot.rotation.set(leftKneeBend + lTremor, 0, 0);
    leftLeg.anklePivot.rotation.set(leftAnkleFlex - legSwing * 0.55 - lTremor * 0.6, 0, 0);

    const walkBob = Math.abs(Math.sin(stridePhase)) * 0.17 * walkAmp;
    const tremorBob = Math.abs(legTremor) * 0.72;
    pelvisPivot.position.y = 8.52 - walkBob - tremorBob;
    pelvisPivot.rotation.y = Math.cos(stridePhase) * 0.08 * walkAmp;

    torsoPivot.rotation.set(
      THREE.MathUtils.clamp(forwardLeanRad * 0.58, -0.06, 0.18) + slash.torsoPitch * 0.65,
      slash.torsoYaw * 0.6 + Math.sin(elapsed * 1.1) * 0.03,
      Math.sin(stridePhase) * 0.032 * walkAmp + legTremor * 0.32
    );

    headPivot.rotation.set(
      0.08 - slash.torsoPitch * 0.22 + Math.sin(elapsed * 1.8) * 0.022,
      -slash.torsoYaw * 0.22,
      0
    );

    const wingFlare = Math.sin(elapsed * 2.2) * 0.045 + slash.swordGlow * 0.14 + Math.abs(legTremor) * 0.45;
    wingGroups[0].rotation.set(0.06, -0.14 - wingFlare, 0.06 * wingFlare);
    wingGroups[1].rotation.set(0.06, 0.14 + wingFlare, -0.06 * wingFlare);

    // Reference Samurai Stance Pose: Right katana angled across front, Left arm braced near chest
    rightArm.shoulderPivot.rotation.set(
      -0.28 + slash.rightArmPitch + Math.sin(elapsed * 1.5) * 0.045 - legSwing * 0.28,
      -0.36 + slash.rightArmYaw,
      -0.14
    );
    rightArm.forearmPivot.rotation.set(-0.34 + slash.rightArmPitch * 0.3, 0.42 + slash.rightForearmYaw, 0);

    leftArm.shoulderPivot.rotation.set(
      -0.46 + slash.leftArmPitch - Math.sin(elapsed * 1.5) * 0.045 + legSwing * 0.28,
      0.34 + slash.leftArmYaw,
      0.16
    );
    leftArm.forearmPivot.rotation.set(-0.56 + slash.leftArmPitch * 0.3, -0.46 + slash.leftForearmYaw, 0);

    // Dynamic Floor Collision Clamping:
    // Measure all 4 sole contact anchors (left/right heel & toe) in world Y relative to root.position.y,
    // then shift titanGroup.position.y so the lowest foot sole stays flush on the arena floor (no clipping!).
    titanGroup.position.y = baseTitanOffsetY;
    root.updateMatrixWorld(true);
    const rootY = root.position.y;
    rightLeg.heelAnchor.getWorldPosition(_vecA);
    let minRelY = _vecA.y - rootY;
    rightLeg.toeAnchor.getWorldPosition(_vecA);
    minRelY = Math.min(minRelY, _vecA.y - rootY);
    leftLeg.heelAnchor.getWorldPosition(_vecA);
    minRelY = Math.min(minRelY, _vecA.y - rootY);
    leftLeg.toeAnchor.getWorldPosition(_vecA);
    minRelY = Math.min(minRelY, _vecA.y - rootY);

    if (minRelY < 0.015) {
      titanGroup.position.y += 0.015 - minRelY;
    } else if (minRelY > 0.03) {
      titanGroup.position.y -= Math.min(0.45, minRelY - 0.02);
    }

    // Dynamic low ground chakra mist swirl
    for (let i = 0; i < smokeNodes.length; i++) {
      const sn = smokeNodes[i];
      const ang = sn.baseAngle + elapsed * 0.35 * (i % 2 === 0 ? 1 : -0.6);
      const bob = Math.sin(elapsed * 2.6 + i * 0.9) * 0.05;
      sn.mesh.position.set(Math.sin(ang) * sn.baseR, sn.baseY + bob, Math.cos(ang) * sn.baseR);
      const pulseS = sn.s * (1 + Math.sin(elapsed * 2.2 + i) * 0.07);
      sn.mesh.scale.set(pulseS * 1.32, pulseS * 0.36, pulseS * 1.24);
    }

    const alphaRatio = currentOpacity / 0.88;
    const pulse = 1 + Math.sin(elapsed * 6.0) * 0.12 * intensity + slash.swordGlow * 0.45;
    armorShell.uniforms.uRimIntensity.value = 2.45 * alphaRatio * pulse;
    kimonoShell.uniforms.uRimIntensity.value = 2.35 * alphaRatio * pulse;
    navyShell.uniforms.uRimIntensity.value = 1.85 * alphaRatio * pulse;
    trimShell.uniforms.uRimIntensity.value = 2.95 * alphaRatio * (1 + slash.swordGlow * 0.72);
    cyanKatanaShell.uniforms.uRimIntensity.value = 3.35 * alphaRatio * (1 + slash.swordGlow * 0.85);
    armorMat.emissiveIntensity = 0.78 + slash.swordGlow * 0.55;
    kimonoMat.emissiveIntensity = 0.76 + slash.swordGlow * 0.45;
    navyMat.emissiveIntensity = 0.52 + slash.swordGlow * 0.35;
    trimMat.emissiveIntensity = 1.28 + slash.swordGlow * 1.05;
    cyanKatanaMat.emissiveIntensity = 1.75 + slash.swordGlow * 1.35;
    crystalMat.emissiveIntensity = 1.55 + Math.sin(elapsed * 5.0) * 0.25;
    auraMat.opacity = Math.min(
      0.75,
      (0.28 + Math.sin(elapsed * 5.5) * 0.08 + slash.swordGlow * 0.18) * alphaRatio * intensity
    );
  };

  const dispose = () => {
    auraMat.dispose();
    auraTex.dispose();
    armorTex.dispose();
    kimonoTex.dispose();
    armorMat.dispose();
    kimonoMat.dispose();
    navyMat.dispose();
    trimMat.dispose();
    cyanKatanaMat.dispose();
    cavityMat.dispose();
    smokeMat.dispose();
    crystalMat.dispose();
    eyeMat.dispose();
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    stage: 'perfect',
    root,
    bodyGroup,
    pilotAnchor,
    materials,
    auraSprite,
    baseOpacity: 0.88,
    fitToTargetWorldHeight,
    setOpacity,
    update,
    consumeFootstepImpact,
    dispose,
  };
}

