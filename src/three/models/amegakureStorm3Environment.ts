import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ShinobiMaterials } from '../materials';
import {
  createAmegakureFloorBumpTexture,
  createAmegakureFloorRoughnessTexture,
  createAmegakureStatueTexture,
  createAmegakureWallTexture,
  createRainRippleTexture,
  createSmokeCloudTexture,
  createSoftGlowTexture,
  createStorm3RooftopTexture,
  createStorm3SkyscraperTexture,
  createStorm3SkyTexture,
} from '../textures';
import { EnvironmentObjects } from './environment';

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _tempMat4 = new THREE.Matrix4();
const _parentMat4 = new THREE.Matrix4();

export function buildAmegakureStorm3Environment(
  _materials: ShinobiMaterials,
  maxAniso: number
): EnvironmentObjects {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];
  const localMaterials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const ARENA_RADIUS = 21;
  const DECK_SIZE = 44;

  // =========================================================================
  // 1. REALISTIC WET ROOFTOP SPIRE DECK (PBR Clearcoat + Roughness Puddle Map)
  // =========================================================================
  const rooftopAlbedo = trackTex(createStorm3RooftopTexture(maxAniso, 6));
  const rooftopBump = trackTex(createAmegakureFloorBumpTexture(maxAniso, 6));
  const rooftopRough = trackTex(createAmegakureFloorRoughnessTexture(maxAniso, 6));
  const wallTex = trackTex(createAmegakureWallTexture(maxAniso));
  const statueTex = trackTex(createAmegakureStatueTexture(maxAniso));
  const skyTex = trackTex(createStorm3SkyTexture());
  const skyscraperTex = createStorm3SkyscraperTexture(maxAniso);
  trackTex(skyscraperTex.map);
  trackTex(skyscraperTex.emissiveMap);
  const rippleTex = trackTex(createRainRippleTexture());
  const mistTex = trackTex(createSmokeCloudTexture());
  const glowTex = trackTex(createSoftGlowTexture());

  const wetDeckMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: rooftopAlbedo,
      bumpMap: rooftopBump,
      bumpScale: 0.045,
      roughnessMap: rooftopRough,
      roughness: 0.62,
      metalness: 0.08,
      clearcoat: 0.82,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.15,
    })
  );

  // Flush rooftop slab deck (top surface strictly at y = 0)
  const deckGeo = trackGeo(new THREE.BoxGeometry(DECK_SIZE, 10, DECK_SIZE));
  const deckMesh = new THREE.Mesh(deckGeo, wetDeckMat);
  deckMesh.position.set(0, -5.0, 0);
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // Deep misty cityscape floor far below Pain's spire
  const abyssGeo = trackGeo(new THREE.PlaneGeometry(420, 420));
  abyssGeo.rotateX(-Math.PI / 2);
  const abyssMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x070a12 }));
  const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
  abyssMesh.position.y = -42;
  group.add(abyssMesh);

  // =========================================================================
  // 2. ARCHITECTURAL MATERIALS
  // =========================================================================
  const darkConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x4b5568,
      roughness: 0.64,
      metalness: 0.24,
      envMapIntensity: 1.0,
    })
  );

  const wetSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262e3c,
      roughness: 0.34,
      metalness: 0.78,
      envMapIntensity: 1.35,
    })
  );

  const pipeCopperSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4856,
      roughness: 0.38,
      metalness: 0.72,
      envMapIntensity: 1.25,
    })
  );

  const skyscraperMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: skyscraperTex.map,
      emissiveMap: skyscraperTex.emissiveMap,
      emissive: new THREE.Color(0xffb347),
      emissiveIntensity: 1.25,
      color: 0x627086,
      roughness: 0.56,
      metalness: 0.3,
      envMapIntensity: 0.9,
    })
  );

  const painFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: statueTex,
      color: 0x3f4759,
      roughness: 0.48,
      metalness: 0.54,
      envMapIntensity: 1.2,
    })
  );

  const painTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.35,
      metalness: 0.82,
      envMapIntensity: 1.3,
    })
  );

  const amberSlitMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
    })
  );

  const cyanHalogenMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
    })
  );

  const voidDarkMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x05070c,
    })
  );

  // Center Rain Village stone parapet emblem ring & flush drainage channels
  const drainRingGeo = trackGeo(new THREE.RingGeometry(5.6, 5.95, 32));
  drainRingGeo.rotateX(-Math.PI / 2);
  const drainRingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181e29,
      roughness: 0.42,
      metalness: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  const drainRing = new THREE.Mesh(drainRingGeo, drainRingMat);
  drainRing.position.y = 0.012;
  drainRing.receiveShadow = true;
  group.add(drainRing);

  // Subtle wet chamfered outer rooftop coping stones around perimeter (4 low curbs)
  const curbGeo = trackGeo(new THREE.BoxGeometry(1, 0.24, 0.72));
  const curbInst = new THREE.InstancedMesh(curbGeo, darkConcreteMat, 4);
  const curbSpecs: Array<[number, number, number, number]> = [
    [0, -22.15, DECK_SIZE + 0.8, 0],
    [0, 22.15, DECK_SIZE + 0.8, 0],
    [-22.15, 0, DECK_SIZE + 0.8, Math.PI / 2],
    [22.15, 0, DECK_SIZE + 0.8, Math.PI / 2],
  ];
  curbSpecs.forEach(([cx, cz, len, ry], i) => {
    _tempObj.position.set(cx, 0.08, cz);
    _tempObj.rotation.set(0, ry, 0);
    _tempObj.scale.set(len, 1, 1);
    _tempObj.updateMatrix();
    curbInst.setMatrixAt(i, _tempObj.matrix);
  });
  curbInst.instanceMatrix.needsUpdate = true;
  curbInst.computeBoundingSphere();
  curbInst.receiveShadow = true;
  group.add(curbInst);

  // =========================================================================
  // 3. HEAVY INDUSTRIAL GUARDRAILS, STEEL TRUSSES & HALOGEN CORNER TOWERS
  // =========================================================================
  const perimeterEdge = 21.85;
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.068, 1.28, 7));
  const postsPerSide = 16;
  const postInst = new THREE.InstancedMesh(postGeo, wetSteelMat, postsPerSide * 4);
  let pIdx = 0;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < postsPerSide; i++) {
      const t = -perimeterEdge + (i / (postsPerSide - 1)) * (perimeterEdge * 2);
      const px = side < 2 ? t : side === 2 ? -perimeterEdge : perimeterEdge;
      const pz = side === 0 ? -perimeterEdge : side === 1 ? perimeterEdge : t;
      _tempObj.position.set(px, 0.64, pz);
      _tempObj.rotation.set(0, 0, 0);
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();
      postInst.setMatrixAt(pIdx++, _tempObj.matrix);
    }
  }
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  group.add(postInst);

  const railGeo = trackGeo(new THREE.CylinderGeometry(1, 1, perimeterEdge * 2, 6));
  const railConfigs: Array<[number, number, number, number, number, number]> = [
    [0, 1.22, -perimeterEdge, 0, Math.PI / 2, 0.032],
    [0, 0.72, -perimeterEdge, 0, Math.PI / 2, 0.024],
    [0, 1.22, perimeterEdge, 0, Math.PI / 2, 0.032],
    [0, 0.72, perimeterEdge, 0, Math.PI / 2, 0.024],
    [-perimeterEdge, 1.22, 0, Math.PI / 2, 0, 0.032],
    [-perimeterEdge, 0.72, 0, Math.PI / 2, 0, 0.024],
    [perimeterEdge, 1.22, 0, Math.PI / 2, 0, 0.032],
    [perimeterEdge, 0.72, 0, Math.PI / 2, 0, 0.024],
  ];
  const railInst = new THREE.InstancedMesh(railGeo, wetSteelMat, railConfigs.length);
  railConfigs.forEach(([x, y, z, rx, rz, rad], idx) => {
    _tempObj.position.set(x, y, z);
    _tempObj.rotation.set(rx, 0, rz);
    _tempObj.scale.set(rad, 1, rad);
    _tempObj.updateMatrix();
    railInst.setMatrixAt(idx, _tempObj.matrix);
  });
  railInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();
  group.add(railInst);

  // 4 Tall Floodlight Mast Stanchions with cool wet cyan-white spotlight haloes
  const cornerHaloSprites: THREE.Sprite[] = [];
  const mastHaloMat = trackMat(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.54,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const mastGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.14, 4.2, 8));
  const lampHeadGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.34, 0.42));
  const lampBulbGeo = trackGeo(new THREE.BoxGeometry(0.52, 0.22, 0.08));
  const cornerCoords: Array<[number, number]> = [
    [-22.2, -22.2],
    [22.2, -22.2],
    [-22.2, 22.2],
    [22.2, 22.2],
  ];
  const mastInst = new THREE.InstancedMesh(mastGeo, wetSteelMat, 4);
  const headInst = new THREE.InstancedMesh(lampHeadGeo, painTrimMat, 4);
  const bulbInst = new THREE.InstancedMesh(lampBulbGeo, cyanHalogenMat, 4);

  cornerCoords.forEach(([cx, cz], i) => {
    _tempObj.position.set(cx, 0, cz);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.lookAt(0, 0, 0);
    _tempObj.updateMatrix();
    _parentMat4.copy(_tempObj.matrix);

    _tempObj.position.set(0, 2.0, 0);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.updateMatrix();
    _tempMat4.multiplyMatrices(_parentMat4, _tempObj.matrix);
    mastInst.setMatrixAt(i, _tempMat4);

    _tempObj.position.set(0, 4.1, 0.18);
    _tempObj.rotation.set(0.42, 0, 0);
    _tempObj.updateMatrix();
    _tempMat4.multiplyMatrices(_parentMat4, _tempObj.matrix);
    headInst.setMatrixAt(i, _tempMat4);

    _tempObj.position.set(0, 4.02, 0.36);
    _tempObj.rotation.set(0.42, 0, 0);
    _tempObj.updateMatrix();
    _tempMat4.multiplyMatrices(_parentMat4, _tempObj.matrix);
    bulbInst.setMatrixAt(i, _tempMat4);

    const haloPos = new THREE.Vector3(0, 3.98, 0.48).applyMatrix4(_parentMat4);
    const halo = new THREE.Sprite(mastHaloMat);
    halo.position.copy(haloPos);
    halo.scale.set(4.5, 4.5, 1);
    group.add(halo);
    cornerHaloSprites.push(halo);
  });
  mastInst.instanceMatrix.needsUpdate = true;
  headInst.instanceMatrix.needsUpdate = true;
  bulbInst.instanceMatrix.needsUpdate = true;
  mastInst.computeBoundingSphere();
  headInst.computeBoundingSphere();
  bulbInst.computeBoundingSphere();
  group.add(mastInst, headInst, bulbInst);

  // Underneath Structural Skyscraper Columns Supporting the Combat Rooftop
  const underDeckMat = darkConcreteMat;
  const underDeckBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(40, 36, 40)),
    underDeckMat
  );
  underDeckBody.position.set(0, -28, 0);
  group.add(underDeckBody);

  // Heavy angled structural steel buttresses supporting the rooftop rim
  const strutGeo = trackGeo(new THREE.BoxGeometry(1.1, 14, 1.3));
  const strutInst = new THREE.InstancedMesh(strutGeo, wetSteelMat, 12);
  let sIdx = 0;
  for (let side = 0; side < 4; side++) {
    for (const off of [-14, 0, 14]) {
      const rx = side === 2 ? -21.2 : side === 3 ? 21.2 : off;
      const rz = side === 0 ? -21.2 : side === 1 ? 21.2 : off;
      _tempObj.position.set(rx, -6.2, rz);
      _tempObj.rotation.set(
        side === 0 ? -0.26 : side === 1 ? 0.26 : 0,
        0,
        side === 2 ? 0.26 : side === 3 ? -0.26 : 0
      );
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();
      strutInst.setMatrixAt(sIdx++, _tempObj.matrix);
    }
  }
  strutInst.instanceMatrix.needsUpdate = true;
  strutInst.computeBoundingSphere();
  group.add(strutInst);

  // =========================================================================
  // 4. PAIN'S ICONIC TOWERING SPIRE MONOLITH (North Rim Landmark, Storm 3!)
  // =========================================================================
  const painSpireGroup = new THREE.Group();
  painSpireGroup.position.set(0, -18, -45);
  group.add(painSpireGroup);

  // Massive stepped brutalist tower shaft rising 88m skyward
  const baseShaft = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(21, 46, 17, 1, 0.35)),
    darkConcreteMat
  );
  baseShaft.position.set(0, 23, 0);
  painSpireGroup.add(baseShaft);

  const midTier = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(16, 22, 13.5, 1, 0.3)),
    painFaceMat
  );
  midTier.position.set(0, 52, 0);
  painSpireGroup.add(midTier);

  const upperCrown = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.2, 7.6, 16, 8)),
    painTrimMat
  );
  upperCrown.position.set(0, 69, 0);
  painSpireGroup.add(upperCrown);

  const pinnacleNeedle = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 1.4, 22, 8)),
    wetSteelMat
  );
  pinnacleNeedle.position.set(0, 86, 0);
  painSpireGroup.add(pinnacleNeedle);

  // Vertical industrial buttress fins & bolted conduits framing Pain's Tower
  const finGeo = trackGeo(new THREE.BoxGeometry(1.4, 58, 2.2));
  const finInst = new THREE.InstancedMesh(finGeo, painTrimMat, 6);
  [-8.8, -5.2, -2.0, 2.0, 5.2, 8.8].forEach((fx, i) => {
    _tempObj.position.set(fx, 29, 8.2);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    finInst.setMatrixAt(i, _tempObj.matrix);
  });
  finInst.instanceMatrix.needsUpdate = true;
  finInst.computeBoundingSphere();
  painSpireGroup.add(finInst);

  // Sculpted Biomechanical Angel / Demon Face integrated into Pain's Tower Front
  const crestArch = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.6, 6.2, 4.4, 12)),
    painTrimMat
  );
  crestArch.position.set(0, 55.2, 6.6);
  painSpireGroup.add(crestArch);

  const faceBasin = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(5.2, 16, 14)),
    painFaceMat
  );
  faceBasin.scale.set(0.86, 1.32, 0.72);
  faceBasin.position.set(0, 48.2, 6.4);
  painSpireGroup.add(faceBasin);

  // Piercing stern V-brow + glowing amber slit eyes overlooking the rooftop duel
  const browGeo = trackGeo(new THREE.BoxGeometry(3.4, 1.0, 1.8));
  for (const side of [-1, 1] as const) {
    const brow = new THREE.Mesh(browGeo, painTrimMat);
    brow.position.set(side * 1.65, 50.8, 9.8);
    brow.rotation.z = side * 0.22;
    brow.rotation.y = -side * 0.18;
    painSpireGroup.add(brow);

    const eyeSocket = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.85, 0.78, 0.85)),
      voidDarkMat
    );
    eyeSocket.position.set(side * 1.75, 49.6, 9.75);
    eyeSocket.rotation.z = side * 0.14;
    painSpireGroup.add(eyeSocket);

    const eyeSlit = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.35, 0.24, 0.2)),
      amberSlitMat
    );
    eyeSlit.position.set(side * 1.75, 49.6, 10.15);
    eyeSlit.rotation.z = side * 0.14;
    painSpireGroup.add(eyeSlit);
  }

  // Sculpted aquiline metal nose bridge & jutting gargoyle tongue perch (Pain's Storm 3 lookout!)
  const spireNose = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.25, 3.6, 2.2)),
    painFaceMat
  );
  spireNose.position.set(0, 48.0, 10.2);
  spireNose.rotation.x = -0.22;
  painSpireGroup.add(spireNose);

  const mouthCavity = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.2, 2.8, 2.4)),
    voidDarkMat
  );
  mouthCavity.position.set(0, 44.2, 9.2);
  painSpireGroup.add(mouthCavity);

  // Extended metal tongue beam jutting toward the battlefield with warm signal beacon
  const perchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 43.8, 8.6),
    new THREE.Vector3(0, 43.2, 13.5),
    new THREE.Vector3(0, 43.6, 18.2),
  ]);
  const perchTongue = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(perchCurve, 12, 0.85, 8, false)),
    painTrimMat
  );
  perchTongue.scale.set(1.5, 0.45, 1.0);
  painSpireGroup.add(perchTongue);

  // Horizontal illuminated command bay windows along lower half of Pain's tower
  const towerStripMat = amberSlitMat;
  for (let row = 0; row < 4; row++) {
    const wy = 24 + row * 4.4;
    const strip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(13.2, 0.42, 0.28)),
      towerStripMat
    );
    strip.position.set(0, wy, 8.55);
    painSpireGroup.add(strip);
  }

  // Thick sweeping industrial steel conduits connecting Pain's Spire to the rooftop base
  for (const side of [-1, 1] as const) {
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 9.5, 22, 6.2),
      new THREE.Vector3(side * 12.2, 15, 12.5),
      new THREE.Vector3(side * 15.8, 12.5, 22.5),
    ]);
    const conduit = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(cableCurve, 14, 0.48, 8, false)),
      pipeCopperSteelMat
    );
    painSpireGroup.add(conduit);

    const catenaryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 8.2, 54, 4.0),
      new THREE.Vector3(side * 15.5, 41, 14.0),
      new THREE.Vector3(side * 22.0, 21, 22.5),
    ]);
    const catenary = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(catenaryCurve, 12, 0.14, 6, false)),
      wetSteelMat
    );
    painSpireGroup.add(catenary);
  }

  // =========================================================================
  // 5. DENSE GLOWING AMEGAKURE STORM 3 CITY SKYLINE (InstancedMesh)
  // =========================================================================
  interface TowerSpec {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    rotY: number;
    hasAntenna: boolean;
  }

  const towers: TowerSpec[] = [];
  let citySeed = 201303;
  const randCity = () => {
    citySeed = (citySeed * 16807) % 2147483647;
    return (citySeed - 1) / 2147483646;
  };

  // Ring 1 & 2 skyscrapers enveloping 360° around Pain's rooftop platform
  for (let i = 0; i < 44; i++) {
    const angle = (i / 44) * Math.PI * 2 + (randCity() - 0.5) * 0.09;
    const dist = i % 2 === 0 ? 50 + randCity() * 24 : 78 + randCity() * 48;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    // Keep narrow corridor right in front of Pain's central spire open so the giant face reads clearly
    if (z < -26 && z > -66 && Math.abs(x) < 16) continue;

    const w = 9 + randCity() * 11;
    const d = 9 + randCity() * 11;
    const h = 42 + randCity() * 68;
    towers.push({
      x,
      z,
      w,
      h,
      d,
      rotY: (randCity() - 0.5) * 0.45,
      hasAntenna: randCity() > 0.35,
    });
  }

  const unitBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const towerBodyInst = new THREE.InstancedMesh(unitBoxGeo, skyscraperMat, towers.length);
  const towerCrownInst = new THREE.InstancedMesh(unitBoxGeo, painTrimMat, towers.length);
  const antennaCylGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.22, 1.0, 6));
  const antennaTowers = towers.filter((t) => t.hasAntenna);
  const towerAntInst = new THREE.InstancedMesh(
    antennaCylGeo,
    wetSteelMat,
    Math.max(1, antennaTowers.length)
  );

  const beaconPositions: Array<[number, number, number, number]> = [
    [0, 97.5 - 18, -45, 0.0], // Pain Spire summit beacon
  ];

  towers.forEach((t, i) => {
    const baseY = -36;
    const centerY = baseY + t.h * 0.5;
    _tempObj.position.set(t.x, centerY, t.z);
    _tempObj.rotation.set(0, t.rotY, 0);
    _tempObj.scale.set(t.w, t.h, t.d);
    _tempObj.updateMatrix();
    towerBodyInst.setMatrixAt(i, _tempObj.matrix);

    const topY = baseY + t.h;
    _tempObj.position.set(t.x, topY + 2.2, t.z);
    _tempObj.scale.set(t.w * 0.72, 4.4, t.d * 0.72);
    _tempObj.updateMatrix();
    towerCrownInst.setMatrixAt(i, _tempObj.matrix);
  });
  towerBodyInst.instanceMatrix.needsUpdate = true;
  towerCrownInst.instanceMatrix.needsUpdate = true;
  towerBodyInst.computeBoundingSphere();
  towerCrownInst.computeBoundingSphere();
  group.add(towerBodyInst, towerCrownInst);

  antennaTowers.forEach((t, i) => {
    const topY = -36 + t.h + 4.4;
    const antH = 7 + (i % 5) * 2.4;
    _tempObj.position.set(t.x, topY + antH * 0.5, t.z);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, antH, 1);
    _tempObj.updateMatrix();
    towerAntInst.setMatrixAt(i, _tempObj.matrix);
    beaconPositions.push([t.x, topY + antH + 0.2, t.z, i * 0.9]);
  });
  towerAntInst.instanceMatrix.needsUpdate = true;
  towerAntInst.computeBoundingSphere();
  group.add(towerAntInst);

  // Pulsing Red Aviation Warning Beacons across all skyscraper spires
  const beaconGeo = trackGeo(new THREE.SphereGeometry(0.42, 8, 6));
  const beaconMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const beaconInst = new THREE.InstancedMesh(beaconGeo, beaconMat, beaconPositions.length);
  beaconInst.frustumCulled = false;
  group.add(beaconInst);

  // Elevated Steel Girders & Industrial Conduit Pipes Crossing the Horizon Void
  const girderGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 42, 8));
  const pipeBridgeSpecs: Array<[number, number, number, number, number, number]> = [
    [-28, -4, -36, 0.08, 0.42, Math.PI / 2],
    [29, -2, -32, -0.06, -0.44, Math.PI / 2],
    [-34, 6, 12, 0.12, 0.2, Math.PI / 2],
    [35, 4, 16, -0.1, -0.22, Math.PI / 2],
  ];
  const pipeBridgeInst = new THREE.InstancedMesh(
    girderGeo,
    pipeCopperSteelMat,
    pipeBridgeSpecs.length
  );
  pipeBridgeSpecs.forEach(([x, y, z, rx, ry, rz], i) => {
    _tempObj.position.set(x, y, z);
    _tempObj.rotation.set(rx, ry, rz);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    pipeBridgeInst.setMatrixAt(i, _tempObj.matrix);
  });
  pipeBridgeInst.instanceMatrix.needsUpdate = true;
  pipeBridgeInst.computeBoundingSphere();
  group.add(pipeBridgeInst);

  // =========================================================================
  // 6. STORM SKY DOME, VOLUMETRIC MIST, RAINFALL & PUDDLE SPLASHES
  // =========================================================================
  const skyGeo = trackGeo(new THREE.SphereGeometry(185, 32, 20));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.y = 14;
  group.add(skyDome);

  // Low drifting rain mist sheets blanketing the lower city canyon
  const mistMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: mistTex,
      color: 0x647aa0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const mistGeo = trackGeo(new THREE.PlaneGeometry(58, 58));
  mistGeo.rotateX(-Math.PI / 2);
  const mistLayers: Array<{ mesh: THREE.Mesh; baseX: number; baseZ: number; speed: number; phase: number }> = [];
  for (let m = 0; m < 8; m++) {
    const a = (m / 8) * Math.PI * 2;
    const dist = 34 + (m % 2) * 18;
    const bx = Math.cos(a) * dist;
    const bz = Math.sin(a) * dist;
    const mMesh = new THREE.Mesh(mistGeo, mistMat);
    mMesh.position.set(bx, -12 + (m % 3) * 4, bz);
    group.add(mMesh);
    mistLayers.push({ mesh: mMesh, baseX: bx, baseZ: bz, speed: 0.45 + (m % 3) * 0.2, phase: m * 1.1 });
  }

  // Rising steam plumes from side rooftop grates
  const steamPlumes: Array<{
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    ox: number;
    oy: number;
    oz: number;
    age: number;
    maxAge: number;
  }> = [];
  const steamOrigins: Array<[number, number, number]> = [
    [-21.2, 0.3, -12],
    [21.2, 0.3, -10],
    [-21.2, 0.3, 14],
    [21.2, 0.3, 12],
    [-10, 0.2, -21.2],
    [10, 0.2, -21.2],
  ];
  steamOrigins.forEach(([ox, oy, oz], idx) => {
    const sMat = trackMat(
      new THREE.SpriteMaterial({
        map: mistTex,
        color: 0xb8cbe6,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(sMat);
    sprite.position.set(ox, oy, oz);
    sprite.scale.set(2.2, 2.2, 1);
    group.add(sprite);
    steamPlumes.push({
      sprite,
      mat: sMat,
      ox,
      oy,
      oz,
      age: (idx / steamOrigins.length) * 2.4,
      maxAge: 2.2 + (idx % 3) * 0.45,
    });
  });

  // High-Density Slanted 3D Rain Streaks (follows player camera zone cleanly)
  const maxRainCount = 520;
  let activeRainCount = maxRainCount;
  const rainPositions = new Float32Array(maxRainCount * 6);
  const rainDrops = Array.from({ length: maxRainCount }, () => ({
    x: (Math.random() - 0.5) * 46,
    y: Math.random() * 24,
    z: (Math.random() - 0.5) * 46,
    speed: 24 + Math.random() * 10,
    len: 1.15 + Math.random() * 0.85,
  }));
  for (let i = 0; i < maxRainCount; i++) {
    const d = rainDrops[i];
    const base = i * 6;
    rainPositions[base] = d.x;
    rainPositions[base + 1] = d.y;
    rainPositions[base + 2] = d.z;
    rainPositions[base + 3] = d.x - 0.08 * d.len;
    rainPositions[base + 4] = d.y + d.len;
    rainPositions[base + 5] = d.z - 0.025 * d.len;
  }
  const rainGeo = trackGeo(new THREE.BufferGeometry());
  const rainAttr = new THREE.BufferAttribute(rainPositions, 3);
  rainAttr.setUsage(THREE.DynamicDrawUsage);
  rainGeo.setAttribute('position', rainAttr);
  rainGeo.setDrawRange(0, activeRainCount * 2);
  const rainMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xd6e6ff,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  group.add(rainLines);

  // Expanding Rainwater Puddle Ripples + Micro Splash Crowns across wet stone slabs
  const maxRippleCount = 48;
  let activeRippleCount = maxRippleCount;
  let activeSteamCount = steamPlumes.length;
  const rippleGeo = trackGeo(new THREE.PlaneGeometry(1, 1));
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: rippleTex,
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const rippleInst = new THREE.InstancedMesh(rippleGeo, rippleMat, maxRippleCount);
  rippleInst.frustumCulled = false;
  group.add(rippleInst);

  const splashGeo = trackGeo(new THREE.ConeGeometry(0.032, 0.25, 4));
  splashGeo.translate(0, 0.125, 0);
  const splashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const splashInst = new THREE.InstancedMesh(splashGeo, splashMat, maxRippleCount);
  splashInst.frustumCulled = false;
  group.add(splashInst);

  const ripples = Array.from({ length: maxRippleCount }, (_, idx) => ({
    x: (Math.random() - 0.5) * 34,
    z: (Math.random() - 0.5) * 34,
    age: (idx / maxRippleCount) * 0.6,
    maxAge: 0.42 + Math.random() * 0.28,
    maxScale: 0.55 + Math.random() * 0.48,
  }));

  let beaconTimer = 0;
  let lightningPulse = 0;
  let nextLightningTime = 4.2;

  return {
    group,
    arenaRadius: ARENA_RADIUS,
    setParticleDensity: (scale: number) => {
      const clamped = THREE.MathUtils.clamp(scale, 0.2, 1.0);
      activeRainCount = Math.max(140, Math.round(maxRainCount * clamped));
      rainGeo.setDrawRange(0, activeRainCount * 2);

      activeRippleCount = Math.max(12, Math.round(maxRippleCount * clamped));
      rippleInst.count = activeRippleCount;
      splashInst.count = activeRippleCount;

      activeSteamCount = Math.max(2, Math.round(steamPlumes.length * clamped));
      for (let i = 0; i < steamPlumes.length; i++) {
        steamPlumes[i].sprite.visible = i < activeSteamCount;
      }
    },
    update: (dt: number, elapsed: number, playerPos?: THREE.Vector3) => {
      for (let i = 0; i < cornerHaloSprites.length; i++) {
        const hs = 4.2 + Math.sin(elapsed * 8.0 + i * 1.7) * 0.35;
        cornerHaloSprites[i].scale.set(hs, hs, 1);
      }

      beaconTimer += dt;
      if (beaconTimer >= 0.05) {
        beaconTimer = 0;
        for (let i = 0; i < beaconPositions.length; i++) {
          const [bx, by, bz, phase] = beaconPositions[i];
          const sVal = Math.max(0, Math.sin(elapsed * 2.4 + phase));
          const pulse = sVal * sVal * sVal * sVal;
          const sc = 0.65 + pulse * 1.1;
          _tempObj.position.set(bx, by, bz);
          _tempObj.rotation.set(0, 0, 0);
          _tempObj.scale.setScalar(sc);
          _tempObj.updateMatrix();
          beaconInst.setMatrixAt(i, _tempObj.matrix);
          _tempColor.setRGB(0.45 + pulse * 1.1, 0.14 * pulse, 0.14 * pulse);
          beaconInst.setColorAt(i, _tempColor);
        }
        beaconInst.instanceMatrix.needsUpdate = true;
        if (beaconInst.instanceColor) beaconInst.instanceColor.needsUpdate = true;
      }

      for (let i = 0; i < mistLayers.length; i++) {
        const ml = mistLayers[i];
        ml.mesh.position.x = ml.baseX + Math.sin(elapsed * ml.speed * 0.28 + ml.phase) * 9.5;
        ml.mesh.position.z = ml.baseZ + Math.cos(elapsed * ml.speed * 0.22 + ml.phase) * 6.5;
      }

      for (let i = 0; i < activeSteamCount; i++) {
        const sp = steamPlumes[i];
        sp.age += dt;
        if (sp.age >= sp.maxAge) sp.age = 0;
        const p = sp.age / sp.maxAge;
        sp.sprite.position.set(
          sp.ox + p * 1.8 + Math.sin(elapsed * 1.5 + i) * 0.32,
          sp.oy + p * 4.4,
          sp.oz + Math.cos(elapsed * 1.2 + i) * 0.28
        );
        const sc = 1.5 + p * 4.0;
        sp.sprite.scale.set(sc, sc, 1);
        sp.mat.opacity = Math.sin(p * Math.PI) * 0.2;
      }

      // Dramatic distant thunderhead lightning flashes lighting up the rainy Storm 3 skyline
      if (elapsed >= nextLightningTime) {
        lightningPulse = 1.0;
        nextLightningTime = elapsed + 6.5 + Math.random() * 7.5;
      }
      if (lightningPulse > 0.005) {
        lightningPulse = Math.max(0, lightningPulse - dt * 3.8);
        const doubleBeat =
          lightningPulse > 0.45
            ? Math.sin(lightningPulse * Math.PI * 3.2) * 0.55 + 0.55
            : lightningPulse;
        const flashTint = 1.0 + doubleBeat * 0.52;
        skyMat.color.setRGB(flashTint, flashTint * 1.03, flashTint * 1.12);
        mistMat.opacity = 0.2 + doubleBeat * 0.2;
      } else if (skyMat.color.r !== 1) {
        skyMat.color.setRGB(1, 1, 1);
        mistMat.opacity = 0.2;
      }

      const cx = playerPos ? playerPos.x : 0;
      const cz = playerPos ? playerPos.z : 0;

      for (let i = 0; i < activeRainCount; i++) {
        const drop = rainDrops[i];
        drop.y -= drop.speed * dt;
        drop.x += 2.2 * dt;
        if (drop.y < 0.0) {
          drop.y += 24;
          drop.x = cx + (Math.random() - 0.5) * 46;
          drop.z = cz + (Math.random() - 0.5) * 46;
        }
        if (drop.x - cx > 23) drop.x -= 46;
        else if (drop.x - cx < -23) drop.x += 46;
        if (drop.z - cz > 23) drop.z -= 46;
        else if (drop.z - cz < -23) drop.z += 46;

        const base = i * 6;
        rainPositions[base] = drop.x;
        rainPositions[base + 1] = drop.y;
        rainPositions[base + 2] = drop.z;
        rainPositions[base + 3] = drop.x - 0.08 * drop.len;
        rainPositions[base + 4] = drop.y + drop.len;
        rainPositions[base + 5] = drop.z - 0.025 * drop.len;
      }
      rainAttr.needsUpdate = true;

      for (let i = 0; i < activeRippleCount; i++) {
        const rp = ripples[i];
        rp.age += dt;
        if (rp.age >= rp.maxAge) {
          rp.age = 0;
          if (Math.random() < 0.65) {
            rp.x = THREE.MathUtils.clamp(cx + (Math.random() - 0.5) * 26, -20.8, 20.8);
            rp.z = THREE.MathUtils.clamp(cz + (Math.random() - 0.5) * 26, -20.8, 20.8);
          } else {
            rp.x = (Math.random() - 0.5) * 40;
            rp.z = (Math.random() - 0.5) * 40;
          }
          rp.maxAge = 0.42 + Math.random() * 0.28;
          rp.maxScale = 0.54 + Math.random() * 0.48;
        }

        const p = rp.age / rp.maxAge;
        const inv = 1 - p;
        const ringScale = 0.14 + (1 - inv * inv) * rp.maxScale;
        const ringFade = inv * 0.78;

        _tempObj.position.set(rp.x, 0.016, rp.z);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.scale.set(ringScale, 1, ringScale);
        _tempObj.updateMatrix();
        rippleInst.setMatrixAt(i, _tempObj.matrix);
        _tempColor.setRGB(ringFade * 0.72, ringFade * 0.88, ringFade);
        rippleInst.setColorAt(i, _tempColor);

        if (p < 0.28) {
          const sp = p / 0.28;
          const spScaleY = Math.sin(sp * Math.PI) * 1.15;
          _tempObj.position.set(rp.x, 0.01, rp.z);
          _tempObj.scale.set(1.0, Math.max(0.05, spScaleY), 1.0);
          _tempObj.updateMatrix();
          splashInst.setMatrixAt(i, _tempObj.matrix);
          const sf = (1 - sp) * 0.78;
          _tempColor.setRGB(sf * 0.8, sf * 0.92, sf);
          splashInst.setColorAt(i, _tempColor);
        } else {
          _tempObj.position.set(0, -100, 0);
          _tempObj.scale.set(0.01, 0.01, 0.01);
          _tempObj.updateMatrix();
          splashInst.setMatrixAt(i, _tempObj.matrix);
        }
      }
      rippleInst.instanceMatrix.needsUpdate = true;
      if (rippleInst.instanceColor) rippleInst.instanceColor.needsUpdate = true;
      splashInst.instanceMatrix.needsUpdate = true;
      if (splashInst.instanceColor) splashInst.instanceColor.needsUpdate = true;
    },
    dispose: () => {
      textures.forEach((t) => t.dispose());
      localMaterials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    },
  };
}
