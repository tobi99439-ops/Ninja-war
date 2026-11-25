import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ShinobiMaterials } from '../materials';
import {
  createKamuiAbyssSkyTexture,
  createKamuiStoneBumpTexture,
  createKamuiStoneRoughnessTexture,
  createKamuiStoneTexture,
} from '../textures';

export interface EnvironmentObjects {
  group: THREE.Group;
  arenaRadius?: number;
  update: (dt: number, elapsed: number, playerPos?: THREE.Vector3) => void;
  setParticleDensity?: (scale: number) => void;
  dispose: () => void;
}

export const ARENA_RADIUS = 15;
export const KAMUI_ARENA_RADIUS = 25;

export function groundHeightAt(x: number, z: number): number {
  if (Math.abs(x) <= 27 && Math.abs(z) <= 27) {
    return 0;
  }
  return -18;
}

export function buildShinobiEnvironment(_materials: ShinobiMaterials, maxAniso: number): EnvironmentObjects {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];
  const localMaterials: THREE.Material[] = [];

  // 1. Weathered Cool Slate-Blue Stone Textures (Albedo + Linear Bump Map + Roughness Map)
  const arenaTex = createKamuiStoneTexture(maxAniso, 10);
  const arenaBump = createKamuiStoneBumpTexture(maxAniso, 10);
  const arenaRough = createKamuiStoneRoughnessTexture(maxAniso, 10);
  const blockTex = createKamuiStoneTexture(maxAniso, 1);
  const blockBump = createKamuiStoneBumpTexture(maxAniso, 1);
  const blockRough = createKamuiStoneRoughnessTexture(maxAniso, 1);
  textures.push(arenaTex, arenaBump, arenaRough, blockTex, blockBump, blockRough);

  const arenaMat = new THREE.MeshStandardMaterial({
    map: arenaTex,
    bumpMap: arenaBump,
    bumpScale: 0.062,
    roughnessMap: arenaRough,
    roughness: 0.86,
    metalness: 0.1,
    envMapIntensity: 0.32,
  });

  const blockMat = new THREE.MeshStandardMaterial({
    map: blockTex,
    bumpMap: blockBump,
    bumpScale: 0.052,
    roughnessMap: blockRough,
    roughness: 0.84,
    metalness: 0.12,
    envMapIntensity: 0.30,
  });

  const abyssMat = new THREE.MeshStandardMaterial({
    color: 0x030814,
    roughness: 0.96,
    metalness: 0.02,
  });
  localMaterials.push(arenaMat, blockMat, abyssMat);

  // 2. Expanded Main Kamui Combat Platform (54x54 beveled stone slab, top surface flush at y = 0)
  const platformGeo = new RoundedBoxGeometry(54, 10, 54, 2, 0.24);
  geometries.push(platformGeo);
  const platformMesh = new THREE.Mesh(platformGeo, arenaMat);
  platformMesh.position.set(0, -5.0, 0);
  platformMesh.receiveShadow = true;
  group.add(platformMesh);

  // Deep abyss floor far below the pillars
  const abyssGeo = new THREE.PlaneGeometry(360, 360);
  abyssGeo.rotateX(-Math.PI / 2);
  geometries.push(abyssGeo);
  const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
  abyssMesh.position.y = -18;
  group.add(abyssMesh);

  // 3. Kamui Pocket Dimension Stepped Slabs & Towering Stone Monoliths (InstancedMesh)
  const cubeGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.028);
  geometries.push(cubeGeo);

  interface BlockSpec {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    topY: number;
    rotY: number;
    shade: number;
  }

  const blocks: BlockSpec[] = [];
  let seed = 88421;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const heroBlocks: BlockSpec[] = [
    { x: -19, z: -32.0, w: 11, h: 12, d: 9.5, topY: -0.35, rotY: 0.03, shade: 1.05 },
    { x: -4.5, z: -32.8, w: 12, h: 12, d: 10, topY: 0.15, rotY: -0.02, shade: 1.1 },
    { x: 11.5, z: -31.8, w: 9.5, h: 12, d: 9, topY: -0.5, rotY: 0.04, shade: 0.96 },
    { x: 25.5, z: -32.5, w: 12, h: 12, d: 10, topY: 0.45, rotY: -0.03, shade: 1.04 },
    { x: -12.0, z: -43.5, w: 12, h: 16, d: 10.5, topY: 2.8, rotY: 0.01, shade: 0.94 },
    { x: 6.5, z: -45.5, w: 12.5, h: 18, d: 11, topY: 4.5, rotY: -0.02, shade: 0.98 },
    { x: -29.0, z: -42.0, w: 13.5, h: 20, d: 12, topY: 6.8, rotY: 0.05, shade: 0.92 },
    { x: 28.0, z: -43.0, w: 13.5, h: 22, d: 12, topY: 7.6, rotY: -0.04, shade: 0.95 },
    { x: -39.0, z: -32.5, w: 13, h: 28, d: 14, topY: 12.0, rotY: 0.06, shade: 0.9 },
    { x: 40.0, z: -31.5, w: 14, h: 30, d: 14, topY: 13.5, rotY: -0.05, shade: 0.92 },
  ];
  blocks.push(...heroBlocks);

  const ringConfigs = [
    { count: 32, minR: 33, maxR: 44, minSize: 7.0, maxSize: 12.0, minTop: -1.4, maxTop: 3.0 },
    { count: 48, minR: 45, maxR: 68, minSize: 8.5, maxSize: 15.0, minTop: 2.5, maxTop: 12.5 },
    { count: 68, minR: 69, maxR: 116, minSize: 10.5, maxSize: 19.0, minTop: 8.5, maxTop: 30.0 },
  ];

  for (const ring of ringConfigs) {
    for (let i = 0; i < ring.count; i++) {
      const baseAngle = (i / ring.count) * Math.PI * 2 + (rand() - 0.5) * 0.14;
      const radius = ring.minR + rand() * (ring.maxR - ring.minR);
      const x = Math.cos(baseAngle) * radius;
      const z = Math.sin(baseAngle) * radius;
      if (Math.abs(x) < 31.0 && Math.abs(z) < 31.0) continue;

      const w = ring.minSize + rand() * (ring.maxSize - ring.minSize);
      const d = ring.minSize + rand() * (ring.maxSize - ring.minSize);
      const topY = ring.minTop + rand() * (ring.maxTop - ring.minTop);
      const h = topY + 18;
      const quarterTurn = Math.floor(rand() * 4) * (Math.PI / 2);
      const rotY = quarterTurn + (rand() - 0.5) * 0.22;
      const shade = 0.72 + rand() * 0.36;

      blocks.push({ x, z, w, h, d, topY, rotY, shade });
    }
  }

  const blockInstances = new THREE.InstancedMesh(cubeGeo, blockMat, blocks.length);
  blockInstances.castShadow = true;
  blockInstances.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const centerY = b.topY - b.h * 0.5;
    dummy.position.set(b.x, centerY, b.z);
    dummy.rotation.set(0, b.rotY, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    blockInstances.setMatrixAt(i, dummy.matrix);

    tint.setRGB(b.shade * 0.78, b.shade * 0.88, b.shade * 1.12);
    blockInstances.setColorAt(i, tint);
  }

  blockInstances.instanceMatrix.needsUpdate = true;
  if (blockInstances.instanceColor) blockInstances.instanceColor.needsUpdate = true;
  blockInstances.computeBoundingSphere();
  group.add(blockInstances);

  // 4. Deep Midnight Kamui Void Sky Dome
  const skyTex = createKamuiAbyssSkyTexture();
  textures.push(skyTex);
  const skyGeo = new THREE.SphereGeometry(195, 64, 40);
  geometries.push(skyGeo);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
  });
  localMaterials.push(skyMat);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyDome);

  // 5. Cool Dimensional Kamui Dust Motes Drifting Across the Expanded Void
  const emberCount = 190;
  const emberPositions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    emberPositions[i * 3] = (Math.random() - 0.5) * 58;
    emberPositions[i * 3 + 1] = 0.4 + Math.random() * 15;
    emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 58;
  }
  const emberGeo = new THREE.BufferGeometry();
  const emberAttr = new THREE.BufferAttribute(emberPositions, 3);
  emberGeo.setAttribute('position', emberAttr);
  geometries.push(emberGeo);

  const emberMat = new THREE.PointsMaterial({
    color: 0x7dd3fc,
    size: 0.11,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  localMaterials.push(emberMat);
  const emberPoints = new THREE.Points(emberGeo, emberMat);
  emberPoints.frustumCulled = false;
  group.add(emberPoints);

  let activeEmberCount = emberCount;

  return {
    group,
    arenaRadius: KAMUI_ARENA_RADIUS,
    setParticleDensity: (scale: number) => {
      const clamped = THREE.MathUtils.clamp(scale, 0.2, 1.0);
      activeEmberCount = Math.max(24, Math.round(emberCount * clamped));
      emberGeo.setDrawRange(0, activeEmberCount);
    },
    update: (dt: number, elapsed: number) => {
      for (let i = 0; i < activeEmberCount * 3; i += 3) {
        emberPositions[i + 1] += dt * 0.75;
        emberPositions[i] += Math.sin(elapsed + i) * dt * 0.25;
        if (emberPositions[i + 1] > 15) {
          emberPositions[i + 1] = 0.4;
        }
      }
      emberAttr.needsUpdate = true;
    },
    dispose: () => {
      textures.forEach((t) => t.dispose());
      localMaterials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    },
  };
}
