import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ShinobiMaterials } from '../materials';
import {
  createAmegakureFloorBumpTexture,
  createAmegakureFloorTexture,
  createAmegakureSkyTexture,
  createAmegakureStatueTexture,
  createAmegakureWallTexture,
  createCorrugatedRustTexture,
  createKanjiSignTexture,
  createRainRippleTexture,
  createSmokeCloudTexture,
  createSoftGlowTexture,
} from '../textures';
import { EnvironmentObjects } from './environment';

const _tempPos = new THREE.Vector3();
const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _tempMat4 = new THREE.Matrix4();
const _parentMat4 = new THREE.Matrix4();
const _localMat4 = new THREE.Matrix4();

export function buildAmegakureEnvironment(
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

  // =========================================================================
  // 1. SOLID MATTE & CLOUDY ROOFTOP STONE FLOOR (44x44 flush at y = 0)
  // =========================================================================
  const AMEGAKURE_ARENA_RADIUS = 21;
  const FLOOR_SIZE = 44;
  const floorColorTex = trackTex(createAmegakureFloorTexture(maxAniso, 5.5));
  const floorBumpTex = trackTex(createAmegakureFloorBumpTexture(maxAniso, 5.5));
  const wallTex = trackTex(createAmegakureWallTexture(maxAniso));
  const rustCorrugatedTex = trackTex(createCorrugatedRustTexture(maxAniso));
  const statueTex = trackTex(createAmegakureStatueTexture(maxAniso));
  const skyTex = trackTex(createAmegakureSkyTexture());
  const rippleTex = trackTex(createRainRippleTexture());
  const mistTex = trackTex(createSmokeCloudTexture());
  const glowHaloTex = trackTex(createSoftGlowTexture());

  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: floorColorTex,
      bumpMap: floorBumpTex,
      bumpScale: 0.032,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.06,
    })
  );

  // Solid rooftop platform flush at y = 0.0 (BoxGeometry keeps vertex count minimal)
  const platformGeo = trackGeo(new THREE.BoxGeometry(FLOOR_SIZE, 10, FLOOR_SIZE));
  const platformMesh = new THREE.Mesh(platformGeo, floorMat);
  platformMesh.position.set(0, -5.0, 0);
  platformMesh.receiveShadow = true;
  group.add(platformMesh);

  // Deep misty rain abyss below rooftop (unlit MeshBasicMaterial — zero lighting cost)
  const abyssMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x101624,
    })
  );
  const abyssGeo = trackGeo(new THREE.PlaneGeometry(360, 360));
  abyssGeo.rotateX(-Math.PI / 2);
  const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
  abyssMesh.position.y = -32;
  group.add(abyssMesh);

  // =========================================================================
  // 2. ARCHITECTURAL MATERIALS
  // =========================================================================
  const buildingMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x5c687c,
      roughness: 0.78,
      metalness: 0.14,
      envMapIntensity: 0.36,
    })
  );

  const concreteTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4454,
      roughness: 0.82,
      metalness: 0.14,
      envMapIntensity: 0.32,
    })
  );

  const darkTowerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222a3d,
      roughness: 0.72,
      metalness: 0.22,
      envMapIntensity: 0.38,
    })
  );

  const distantTowerMat = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0x3a435e,
    })
  );

  const pipeMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x424e4a,
      roughness: 0.46,
      metalness: 0.54,
      envMapIntensity: 0.52,
    })
  );

  const bandageMat = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0x8e9182,
    })
  );

  const rustyRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: rustCorrugatedTex,
      color: 0x76432b,
      roughness: 0.74,
      metalness: 0.22,
      envMapIntensity: 0.35,
    })
  );

  const railingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x343d4b,
      roughness: 0.45,
      metalness: 0.68,
      envMapIntensity: 0.5,
    })
  );

  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c222e,
      roughness: 0.58,
      metalness: 0.62,
    })
  );

  const cableMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x121620,
    })
  );

  const windowRecessMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0e131e,
    })
  );

  // Batch collector for all steel truss members & pilasters (1 draw call instead of ~95!)
  const darkSteelBoxMatrices: THREE.Matrix4[] = [];
  const pushSteelBox = (
    px: number,
    py: number,
    pz: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
    parentMatrix?: THREE.Matrix4
  ) => {
    _tempObj.position.set(px, py, pz);
    _tempObj.rotation.set(rx, ry, rz);
    _tempObj.scale.set(sx, sy, sz);
    _tempObj.updateMatrix();
    const out = new THREE.Matrix4().copy(_tempObj.matrix);
    if (parentMatrix) {
      out.premultiply(parentMatrix);
    }
    darkSteelBoxMatrices.push(out);
  };

  // Helper: X-braced industrial steel lattice truss column -> batched into single InstancedMesh
  const buildSteelTruss = (
    x: number,
    yBase: number,
    z: number,
    width: number,
    height: number,
    bays: number,
    rotY = 0
  ) => {
    _tempObj.position.set(x, yBase, z);
    _tempObj.rotation.set(0, rotY, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    _parentMat4.copy(_tempObj.matrix);

    pushSteelBox(-width * 0.5, height * 0.5, 0, 0.16, height, 0.16, 0, 0, 0, _parentMat4);
    pushSteelBox(width * 0.5, height * 0.5, 0, 0.16, height, 0.16, 0, 0, 0, _parentMat4);

    const bayH = height / bays;
    const diagLen = Math.hypot(width, bayH);
    const diagAngle = Math.atan2(width, bayH);

    for (let b = 0; b <= bays; b++) {
      pushSteelBox(0, b * bayH, 0, width, 0.12, 0.14, 0, 0, 0, _parentMat4);
      if (b < bays) {
        const cy = (b + 0.5) * bayH;
        pushSteelBox(0, cy, 0, 0.1, diagLen, 0.1, 0, 0, diagAngle, _parentMat4);
        pushSteelBox(0, cy, 0, 0.1, diagLen, 0.1, 0, 0, -diagAngle, _parentMat4);
      }
    }
  };

  // =========================================================================
  // 3. ROOFTOP PERIMETER CURB + IRON GUARDRAIL + TENSION WIRES (INSTANCED)
  // =========================================================================
  const perimeterEdge = 21.75;
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.052, 1.18, 6));
  const railUnitGeo = trackGeo(new THREE.CylinderGeometry(1, 1, perimeterEdge * 2, 6));

  const postsPerSide = 16;
  const postInst = new THREE.InstancedMesh(postGeo, railingMat, postsPerSide * 4);
  // Thin perimeter posts do not need expensive shadow-map rendering
  postInst.castShadow = false;
  let postIdx = 0;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < postsPerSide; i++) {
      const t = -perimeterEdge + (i / (postsPerSide - 1)) * (perimeterEdge * 2);
      const px = side === 0 ? t : side === 1 ? t : side === 2 ? -perimeterEdge : perimeterEdge;
      const pz = side === 0 ? -perimeterEdge : side === 1 ? perimeterEdge : t;
      _tempObj.position.set(px, 0.59, pz);
      _tempObj.rotation.set(0, 0, 0);
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();
      postInst.setMatrixAt(postIdx++, _tempObj.matrix);
    }
  }
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  group.add(postInst);

  const railConfigs: Array<[number, number, number, number, number, boolean]> = [
    [0, 1.15, -perimeterEdge, 0, Math.PI / 2, false],
    [0, 0.64, -perimeterEdge, 0, Math.PI / 2, false],
    [0, 0.30, -perimeterEdge, 0, Math.PI / 2, true],
    [0, 1.15, perimeterEdge, 0, Math.PI / 2, false],
    [0, 0.64, perimeterEdge, 0, Math.PI / 2, false],
    [0, 0.30, perimeterEdge, 0, Math.PI / 2, true],
    [-perimeterEdge, 1.15, 0, Math.PI / 2, 0, false],
    [-perimeterEdge, 0.64, 0, Math.PI / 2, 0, false],
    [-perimeterEdge, 0.30, 0, Math.PI / 2, 0, true],
    [perimeterEdge, 1.15, 0, Math.PI / 2, 0, false],
    [perimeterEdge, 0.64, 0, Math.PI / 2, 0, false],
    [perimeterEdge, 0.30, 0, Math.PI / 2, 0, true],
  ];
  const railInst = new THREE.InstancedMesh(railUnitGeo, railingMat, railConfigs.length);
  for (let i = 0; i < railConfigs.length; i++) {
    const [rx, ry, rz, rotX, rotZ, isWire] = railConfigs[i];
    const r = isWire ? 0.012 : 0.026;
    _tempObj.position.set(rx, ry, rz);
    _tempObj.rotation.set(rotX, 0, rotZ);
    _tempObj.scale.set(r, 1, r);
    _tempObj.updateMatrix();
    railInst.setMatrixAt(i, _tempObj.matrix);
  }
  railInst.instanceMatrix.needsUpdate = true;
  railInst.computeBoundingSphere();
  group.add(railInst);

  // 4 Practical Warm Amber Storm Floodlights mounted at perimeter railing corners
  // Uses glowing emissive bulbs + volumetric rain-mist halo sprites instead of 4 expensive
  // per-pixel PointLights (cuts fragment shader lighting cost by >50% across the entire arena!)
  const floodBulbMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffd08a,
    })
  );
  const floodHaloMat = trackMat(
    new THREE.SpriteMaterial({
      map: glowHaloTex,
      color: 0xff8c24,
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const floodPoleGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.075, 2.35, 6));
  const floodHeadGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.26, 0.28));
  const floodBulbGeo = trackGeo(new THREE.SphereGeometry(0.12, 8, 6));
  const floodCorners: Array<[number, number]> = [
    [-perimeterEdge, -perimeterEdge],
    [perimeterEdge, -perimeterEdge],
    [-perimeterEdge, perimeterEdge],
    [perimeterEdge, perimeterEdge],
  ];
  const floodPoleInst = new THREE.InstancedMesh(floodPoleGeo, darkSteelMat, 4);
  const floodHeadInst = new THREE.InstancedMesh(floodHeadGeo, darkSteelMat, 4);
  const floodBulbInst = new THREE.InstancedMesh(floodBulbGeo, floodBulbMat, 4);
  const cornerHaloSprites: THREE.Sprite[] = [];

  for (let i = 0; i < floodCorners.length; i++) {
    const [cx, cz] = floodCorners[i];
    _tempObj.position.set(cx, 0, cz);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.lookAt(0, 0, 0);
    _tempObj.updateMatrix();
    _parentMat4.copy(_tempObj.matrix);

    _localMat4.makeTranslation(0, 1.18, 0);
    _tempMat4.multiplyMatrices(_parentMat4, _localMat4);
    floodPoleInst.setMatrixAt(i, _tempMat4);

    _tempObj.position.set(0, 2.32, 0.1);
    _tempObj.rotation.set(0.38, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    _tempMat4.multiplyMatrices(_parentMat4, _tempObj.matrix);
    floodHeadInst.setMatrixAt(i, _tempMat4);

    _tempObj.position.set(0, 2.26, 0.22);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    _tempMat4.multiplyMatrices(_parentMat4, _tempObj.matrix);
    floodBulbInst.setMatrixAt(i, _tempMat4);

    _tempPos.set(0, 2.24, 0.28).applyMatrix4(_parentMat4);
    const halo = new THREE.Sprite(floodHaloMat);
    halo.position.copy(_tempPos);
    halo.scale.set(3.4, 3.4, 1);
    group.add(halo);
    cornerHaloSprites.push(halo);
  }
  floodPoleInst.instanceMatrix.needsUpdate = true;
  floodHeadInst.instanceMatrix.needsUpdate = true;
  floodBulbInst.instanceMatrix.needsUpdate = true;
  floodPoleInst.computeBoundingSphere();
  floodHeadInst.computeBoundingSphere();
  floodBulbInst.computeBoundingSphere();
  group.add(floodPoleInst, floodHeadInst, floodBulbInst);

  // Flush wet cast-iron drainage grates near rooftop corners (2 InstancedMeshes instead of 32!)
  const grateFrameGeo = trackGeo(new THREE.BoxGeometry(1.15, 0.02, 0.65));
  const grateBarGeo = trackGeo(new THREE.BoxGeometry(1.02, 0.025, 0.05));
  const grateCoords: Array<[number, number]> = [
    [-19.8, -19.6],
    [19.8, -19.6],
    [-19.8, 19.6],
    [19.8, 19.6],
  ];
  const grateFrameInst = new THREE.InstancedMesh(grateFrameGeo, windowRecessMat, grateCoords.length);
  const grateBarInst = new THREE.InstancedMesh(grateBarGeo, railingMat, grateCoords.length * 7);
  let gBarIdx = 0;
  for (let gi = 0; gi < grateCoords.length; gi++) {
    const [gx, gz] = grateCoords[gi];
    _tempObj.position.set(gx, 0.008, gz);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    grateFrameInst.setMatrixAt(gi, _tempObj.matrix);
    for (let s = -3; s <= 3; s++) {
      _tempObj.position.set(gx, 0.012, gz + s * 0.082);
      _tempObj.updateMatrix();
      grateBarInst.setMatrixAt(gBarIdx++, _tempObj.matrix);
    }
  }
  grateFrameInst.instanceMatrix.needsUpdate = true;
  grateBarInst.instanceMatrix.needsUpdate = true;
  grateFrameInst.computeBoundingSphere();
  grateBarInst.computeBoundingSphere();
  group.add(grateFrameInst, grateBarInst);

  // Protruding left foreground concrete deck / bunker under the statue's arms
  const leftBunkerDeck = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(10.5, 4.2, 8.8)),
    concreteTrimMat
  );
  leftBunkerDeck.position.set(-26.8, 0.2, -12.5);
  leftBunkerDeck.receiveShadow = true;
  group.add(leftBunkerDeck);

  // Dark vertical pilaster ribs underneath the left bunker terrace (batched!)
  for (let p = 0; p < 4; p++) {
    pushSteelBox(-21.6, 0.9, -16.0 + p * 2.3, 0.65, 2.2, 0.55);
  }

  // =========================================================================
  // 4. GIANT LEFT BIOMECHANICAL FACE STATUE (Exact Naruto Storm 3 Landmark)
  // =========================================================================
  const statueGroup = new THREE.Group();
  statueGroup.position.set(-27.0, -1.8, -15.2);
  statueGroup.rotation.y = Math.PI * 0.44;
  group.add(statueGroup);

  const statueSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: statueTex,
      color: 0x4b4056,
      roughness: 0.68,
      metalness: 0.18,
      envMapIntensity: 0.38,
    })
  );
  const statueDarkSkinMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: statueTex,
      color: 0x2c2436,
      roughness: 0.72,
      metalness: 0.18,
      envMapIntensity: 0.34,
    })
  );
  const statueArmorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x353c4d,
      roughness: 0.52,
      metalness: 0.5,
      envMapIntensity: 0.46,
    })
  );
  const teethMat = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0x8f8a88,
    })
  );
  const eyeGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
    })
  );
  const tongueMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6f1920,
      roughness: 0.36,
      metalness: 0.14,
      envMapIntensity: 0.65,
    })
  );

  // Towering robe/shoulder torso column
  const torsoBlock = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(11.4, 21.0, 10.8, 1, 0.45)),
    statueDarkSkinMat
  );
  torsoBlock.position.set(0, 6.2, -1.8);
  statueGroup.add(torsoBlock);

  // Sculpted gaunt anatomical head (optimized vertex count, same dramatic silhouette)
  const craniumGeo = trackGeo(new THREE.SphereGeometry(5.1, 18, 14));
  const cPos = craniumGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    let x = cPos.getX(i);
    let y = cPos.getY(i);
    const z = cPos.getZ(i);
    const lowerRatio = y < 0 ? Math.min(1, -y / 5.1) : 0;
    x *= 0.86 - lowerRatio * 0.22;
    y *= 1.24;
    if (y < 0.5 && z > 0.8 && Math.abs(x) > 1.3) {
      x *= 0.88;
    }
    cPos.setXYZ(i, x, y, z * 1.08);
  }
  craniumGeo.computeVertexNormals();

  const headMesh = new THREE.Mesh(craniumGeo, statueSkinMat);
  headMesh.position.set(0, 17.6, 1.3);
  statueGroup.add(headMesh);

  // Sculpted jutting lower jaw & chin
  const jawMesh = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(4.8, 3.2, 4.6, 1, 0.5)),
    statueSkinMat
  );
  jawMesh.position.set(0, 12.1, 2.7);
  jawMesh.rotation.x = 0.24;
  statueGroup.add(jawMesh);

  // Cylindrical iron crown headband with center forehead clasp, bolt rivets & corrugated top cap
  const helmetBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(5.25, 5.05, 3.8, 16, 1, false)),
    statueArmorMat
  );
  helmetBand.position.set(0, 21.8, 1.15);
  helmetBand.rotation.x = 0.08;
  statueGroup.add(helmetBand);

  const helmetTopCap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.5, 5.15, 2.2, 14)),
    statueDarkSkinMat
  );
  helmetTopCap.position.set(0, 24.4, 0.95);
  helmetTopCap.rotation.x = 0.08;
  statueGroup.add(helmetTopCap);

  // Vertical forehead clasp plate + instanced side rivet bolts on crown headband
  const claspPlate = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.15, 3.9, 1.0)),
    statueArmorMat
  );
  claspPlate.position.set(0, 21.5, 6.1);
  claspPlate.rotation.x = 0.08;
  statueGroup.add(claspPlate);

  const rivetGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 7));
  const rivetInst = new THREE.InstancedMesh(rivetGeo, statueArmorMat, 8);
  let rIdx = 0;
  for (const side of [-1, 1] as const) {
    for (const [bx, by, bz] of [
      [side * 3.1, 16.2, 4.3],
      [side * 3.55, 15.1, 3.6],
      [side * 3.7, 21.8, 4.5],
      [side * 4.5, 21.8, 2.8],
    ]) {
      _tempObj.position.set(bx, by, bz);
      _tempObj.rotation.set(0, 0, Math.PI / 2);
      _tempObj.scale.set(1, 1, 1);
      _tempObj.updateMatrix();
      rivetInst.setMatrixAt(rIdx++, _tempObj.matrix);
    }
  }
  rivetInst.instanceMatrix.needsUpdate = true;
  rivetInst.computeBoundingSphere();
  statueGroup.add(rivetInst);

  // Fierce V-angled furrowed brow ridges
  const browGeo = trackGeo(new THREE.BoxGeometry(3.2, 1.15, 2.0));
  for (const side of [-1, 1] as const) {
    const brow = new THREE.Mesh(browGeo, statueSkinMat);
    brow.position.set(side * 1.65, 19.35, 5.55);
    brow.rotation.z = side * 0.26;
    brow.rotation.y = -side * 0.24;
    statueGroup.add(brow);
  }

  // Aquiline hooked stone nose bridge & nostrils
  const noseBridge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.35, 3.3, 2.2)),
    statueSkinMat
  );
  noseBridge.position.set(0, 17.5, 6.2);
  noseBridge.rotation.x = -0.32;
  statueGroup.add(noseBridge);

  const noseTip = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.95, 2.2, 5)),
    statueSkinMat
  );
  noseTip.position.set(0, 16.4, 7.15);
  noseTip.rotation.x = Math.PI * 0.56;
  statueGroup.add(noseTip);

  // Sunken almond eye sockets + pale metallic pupils
  const eyeSocketGeo = trackGeo(new THREE.SphereGeometry(0.95, 10, 8));
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.32, 8, 6));
  for (const side of [-1, 1] as const) {
    const socket = new THREE.Mesh(eyeSocketGeo, windowRecessMat);
    socket.position.set(side * 1.85, 18.45, 5.45);
    socket.scale.set(1.28, 0.65, 0.72);
    socket.rotation.y = -side * 0.2;
    socket.rotation.z = side * 0.16;
    statueGroup.add(socket);

    const iris = new THREE.Mesh(irisGeo, eyeGlowMat);
    iris.position.set(side * 1.9, 18.42, 5.98);
    statueGroup.add(iris);
  }

  // Wide screaming mouth throat cavity + instanced upper & lower teeth (1 draw call instead of 14!)
  const mouthVoid = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.5, 3.6, 3.1)),
    windowRecessMat
  );
  mouthVoid.position.set(0, 14.3, 4.9);
  statueGroup.add(mouthVoid);

  const toothGeo = trackGeo(new THREE.BoxGeometry(0.58, 0.52, 0.42));
  const teethInst = new THREE.InstancedMesh(toothGeo, teethMat, 14);
  let tIdx = 0;
  for (let t = -3; t <= 3; t++) {
    _tempObj.position.set(t * 0.58, 15.65, 6.15 - Math.abs(t) * 0.25);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    teethInst.setMatrixAt(tIdx++, _tempObj.matrix);

    _tempObj.position.set(t * 0.58, 12.95, 6.0 - Math.abs(t) * 0.25);
    _tempObj.updateMatrix();
    teethInst.setMatrixAt(tIdx++, _tempObj.matrix);
  }
  teethInst.instanceMatrix.needsUpdate = true;
  teethInst.computeBoundingSphere();
  statueGroup.add(teethInst);

  // Long sinuous protruding crimson tongue curving outward & upward at the tip
  const tongueCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 14.1, 4.3),
    new THREE.Vector3(0, 14.35, 7.1),
    new THREE.Vector3(0, 13.55, 9.6),
    new THREE.Vector3(0, 14.2, 11.45),
    new THREE.Vector3(0, 14.75, 12.25),
  ]);
  const tongueMesh = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(tongueCurve, 16, 0.54, 8, false)),
    tongueMat
  );
  tongueMesh.scale.set(1.38, 0.48, 1);
  statueGroup.add(tongueMesh);

  // Hanging glowing red-amber ribbed paper lantern dangling from the tongue tip
  // Uses luminous emissive shell + volumetric additive glow sprite (zero PointLight cost!)
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0, 13.7, 10.65);
  statueGroup.add(lanternPivot);

  const chainCord = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 2.0, 5)),
    cableMat
  );
  chainCord.position.set(0, -1.0, 0);
  lanternPivot.add(chainCord);

  const lanternMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff5436,
    })
  );
  const lanternBody = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 1.58, 10)),
    lanternMat
  );
  lanternBody.position.set(0, -2.35, 0);
  lanternPivot.add(lanternBody);

  const lanternCapGeo = trackGeo(new THREE.CylinderGeometry(0.74, 0.74, 0.22, 10));
  const lanternTop = new THREE.Mesh(lanternCapGeo, cableMat);
  lanternTop.position.set(0, -1.56, 0);
  const lanternBot = new THREE.Mesh(lanternCapGeo, cableMat);
  lanternBot.position.set(0, -3.14, 0);
  lanternPivot.add(lanternTop, lanternBot);

  const lanternHaloMat = trackMat(
    new THREE.SpriteMaterial({
      map: glowHaloTex,
      color: 0xff5a36,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const lanternHalo = new THREE.Sprite(lanternHaloMat);
  lanternHalo.position.set(0, -2.35, 0);
  lanternHalo.scale.set(6.4, 6.4, 1);
  lanternPivot.add(lanternHalo);

  // 7 Thick curved biomechanical cheek/jaw/neck pipes + instanced bandage wraps
  const statueWrapGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 0.95, 8));
  const statueWrapInst = new THREE.InstancedMesh(statueWrapGeo, bandageMat, 7);
  for (let p = 0; p < 7; p++) {
    const yOff = 13.8 + p * 1.18;
    const zFace = p < 3 ? 2.6 - p * 0.45 : 1.4 - (p - 3) * 0.55;
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.9, yOff, zFace),
      new THREE.Vector3(4.5, yOff - 0.35, zFace - 2.6),
      new THREE.Vector3(4.7, yOff - 1.35, zFace - 6.8),
    ]);
    const pipeMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(pipeCurve, 10, 0.36 + (p % 2) * 0.06, 6, false)),
      pipeMetalMat
    );
    statueGroup.add(pipeMesh);

    _tempObj.position.set(4.55, yOff - 0.5, zFace - 3.2);
    _tempObj.rotation.set(Math.PI * 0.48, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    statueWrapInst.setMatrixAt(p, _tempObj.matrix);
  }
  statueWrapInst.instanceMatrix.needsUpdate = true;
  statueWrapInst.computeBoundingSphere();
  statueGroup.add(statueWrapInst);

  // Colossal Sculpted Cradling Forearms, Palms, Bandaged Wrists & Articulated Fingers
  const wristBandageGeo = trackGeo(new THREE.CylinderGeometry(1.36, 1.38, 1.9, 10));
  const palmGeo = trackGeo(new THREE.BoxGeometry(2.4, 1.05, 3.0));
  for (const side of [-1, 1] as const) {
    const forearmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 4.4, 7.2, 0.2),
      new THREE.Vector3(side * 3.6, 6.7, 6.2),
      new THREE.Vector3(side * 1.4, 7.3, 12.2),
      new THREE.Vector3(side * 0.45, 7.6, 15.2),
    ]);
    const forearmMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(forearmCurve, 12, 1.28, 8, false)),
      statueDarkSkinMat
    );
    statueGroup.add(forearmMesh);

    const wristBandage = new THREE.Mesh(wristBandageGeo, bandageMat);
    wristBandage.position.set(side * 1.15, 7.45, 13.0);
    wristBandage.rotation.x = Math.PI * 0.48;
    wristBandage.rotation.z = -side * 0.18;
    statueGroup.add(wristBandage);

    const palmMesh = new THREE.Mesh(palmGeo, statueDarkSkinMat);
    palmMesh.position.set(side * 0.5, 7.75, 15.8);
    palmMesh.rotation.x = -0.14;
    statueGroup.add(palmMesh);

    for (let f = 0; f < 4; f++) {
      const fingerOffset = (f - 1.5) * 0.56;
      const fingerCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.5 + fingerOffset, 7.75, 17.0),
        new THREE.Vector3(side * 0.4 + fingerOffset, 7.95, 18.6),
        new THREE.Vector3(side * 0.3 + fingerOffset, 8.65, 20.1),
      ]);
      const fingerMesh = new THREE.Mesh(
        trackGeo(new THREE.TubeGeometry(fingerCurve, 6, 0.32, 6, false)),
        statueDarkSkinMat
      );
      statueGroup.add(fingerMesh);
    }

    const thumbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 1.55, 7.9, 15.2),
      new THREE.Vector3(side * 1.75, 8.5, 16.4),
      new THREE.Vector3(side * 1.3, 9.0, 17.4),
    ]);
    const thumbMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(thumbCurve, 6, 0.36, 6, false)),
      statueDarkSkinMat
    );
    statueGroup.add(thumbMesh);

    const armPipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 4.1, 6.0, 1.2),
      new THREE.Vector3(side * 3.1, 5.7, 6.8),
      new THREE.Vector3(side * 1.3, 6.4, 12.6),
    ]);
    const armPipe = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(armPipeCurve, 8, 0.34, 6, false)),
      pipeMetalMat
    );
    statueGroup.add(armPipe);
  }

  // =========================================================================
  // 5. INDUSTRIAL BUILDINGS, CORRUGATED AWNINGS, SLIT WINDOWS, PIPES & KANJI
  //    Batched into InstancedMeshes to cut draw calls dramatically
  // =========================================================================
  const slitWindowMatrices: THREE.Matrix4[] = [];
  const awningMatrices: THREE.Matrix4[] = [];
  const headerBandMatrices: THREE.Matrix4[] = [];

  const addCorrugatedAwningAndWindows = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    rotY: number,
    windowCount = 6
  ) => {
    _tempObj.position.set(x, y, z);
    _tempObj.rotation.set(0, rotY, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    _parentMat4.copy(_tempObj.matrix);

    _tempObj.position.set(0, 0, 0);
    _tempObj.rotation.set(0.42, 0, 0);
    _tempObj.scale.set(w, 0.24, d);
    _tempObj.updateMatrix();
    awningMatrices.push(new THREE.Matrix4().multiplyMatrices(_parentMat4, _tempObj.matrix));

    _tempObj.position.set(0, -1.35, -d * 0.28);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(w * 0.9, 1.35, 0.4);
    _tempObj.updateMatrix();
    headerBandMatrices.push(new THREE.Matrix4().multiplyMatrices(_parentMat4, _tempObj.matrix));

    const span = w * 0.72;
    for (let i = 0; i < windowCount; i++) {
      const wx = -span * 0.5 + (i / Math.max(1, windowCount - 1)) * span;
      _tempObj.position.set(wx, -1.35, -d * 0.28 + 0.16);
      _tempObj.rotation.set(0, 0, 0);
      _tempObj.scale.set(0.45, 0.65, 0.22);
      _tempObj.updateMatrix();
      slitWindowMatrices.push(new THREE.Matrix4().multiplyMatrices(_parentMat4, _tempObj.matrix));
    }
  };

  const addKanjiSign = (
    kanji: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY: number,
    variant: 'vertical' | 'horizontal' = 'vertical',
    theme: 'parchment' | 'dark' = 'parchment'
  ) => {
    const tex = trackTex(createKanjiSignTexture(kanji, maxAniso, variant, theme));
    const mat = trackMat(
      new THREE.MeshLambertMaterial({
        map: tex,
      })
    );
    const sign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, 0.26)), mat);
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    group.add(sign);
  };

  interface BlockSpec {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
  }

  const foregroundBuildings: BlockSpec[] = [
    { x: -32.5, y: 12, z: -26, w: 14, h: 44, d: 14 },
    { x: -33.5, y: 10, z: 3, w: 12, h: 38, d: 18 },
    { x: -23.5, y: 9, z: -34.0, w: 13, h: 36, d: 12 },
    { x: 31.0, y: 13, z: -15, w: 13, h: 46, d: 22 },
    { x: 25.5, y: 10, z: -30.5, w: 13, h: 38, d: 12 },
    { x: 33.0, y: 14, z: 18, w: 14, h: 46, d: 16 },
    { x: -20, y: 11, z: 34, w: 14, h: 38, d: 12 },
    { x: 20, y: 10, z: 34, w: 14, h: 36, d: 12 },
  ];

  // Single InstancedMesh for all 8 foreground industrial buildings (1 draw call!)
  const unitBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const fgBuildingInst = new THREE.InstancedMesh(unitBoxGeo, buildingMat, foregroundBuildings.length);
  for (let i = 0; i < foregroundBuildings.length; i++) {
    const b = foregroundBuildings[i];
    _tempObj.position.set(b.x, b.y, b.z);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(b.w, b.h, b.d);
    _tempObj.updateMatrix();
    fgBuildingInst.setMatrixAt(i, _tempObj.matrix);
  }
  fgBuildingInst.instanceMatrix.needsUpdate = true;
  fgBuildingInst.computeBoundingSphere();
  group.add(fgBuildingInst);

  // Far-left vertical steel X-truss tower + roof scaffolds (all batched into 1 draw call!)
  buildSteelTruss(-26.4, 2.0, -23.2, 2.2, 26.0, 9, Math.PI * 0.22);
  buildSteelTruss(-21.0, 26.8, -30.0, 3.0, 9.0, 3, 0);
  buildSteelTruss(25.0, 28.8, -27.0, 3.0, 10.0, 3, -0.2);
  // Protruding iron sign arm bracket holding `世界`
  pushSteelBox(-18.6, 8.8, -28.1, 2.6, 0.22, 0.22);

  // Flush all batched dark-steel boxes in ONE InstancedMesh
  const steelBatchInst = new THREE.InstancedMesh(unitBoxGeo, darkSteelMat, darkSteelBoxMatrices.length);
  for (let i = 0; i < darkSteelBoxMatrices.length; i++) {
    steelBatchInst.setMatrixAt(i, darkSteelBoxMatrices[i]);
  }
  steelBatchInst.instanceMatrix.needsUpdate = true;
  steelBatchInst.computeBoundingSphere();
  group.add(steelBatchInst);

  // Corrugated rusty-brown awnings & small slit windows
  addCorrugatedAwningAndWindows(-22.5, 11.4, -27.8, 8.6, 3.3, 0, 6);
  addCorrugatedAwningAndWindows(-26.5, 9.6, 3.0, 9.0, 3.3, Math.PI / 2, 6);
  addCorrugatedAwningAndWindows(23.5, 12.2, -18.5, 8.8, 3.4, -Math.PI * 0.36, 6);
  addCorrugatedAwningAndWindows(24.5, 11.2, -24.4, 7.6, 3.0, 0, 5);

  const awningInst = new THREE.InstancedMesh(unitBoxGeo, rustyRoofMat, awningMatrices.length);
  awningMatrices.forEach((m, i) => awningInst.setMatrixAt(i, m));
  awningInst.instanceMatrix.needsUpdate = true;
  awningInst.computeBoundingSphere();
  group.add(awningInst);

  const headerBandInst = new THREE.InstancedMesh(unitBoxGeo, concreteTrimMat, headerBandMatrices.length);
  headerBandMatrices.forEach((m, i) => headerBandInst.setMatrixAt(i, m));
  headerBandInst.instanceMatrix.needsUpdate = true;
  headerBandInst.computeBoundingSphere();
  group.add(headerBandInst);

  const slitWinInst = new THREE.InstancedMesh(unitBoxGeo, windowRecessMat, slitWindowMatrices.length);
  slitWindowMatrices.forEach((m, i) => slitWinInst.setMatrixAt(i, m));
  slitWinInst.instanceMatrix.needsUpdate = true;
  slitWinInst.computeBoundingSphere();
  group.add(slitWinInst);

  // Authentic Kanji & Kana Signboards in exact positions & themes
  addKanjiSign('青朱玄白', -24.2, 17.5, -23.0, 2.4, 7.8, Math.PI * 0.22, 'vertical', 'parchment');
  addKanjiSign('天天', -24.6, 23.4, -23.1, 1.75, 3.0, Math.PI * 0.22, 'vertical', 'parchment');
  addKanjiSign('匠', -22.8, 8.2, -28.1, 2.15, 2.45, 0, 'horizontal', 'parchment');
  addKanjiSign('世界', -17.2, 8.0, -28.1, 2.7, 1.65, 0, 'horizontal', 'parchment');
  addKanjiSign('忍', -20.8, 2.9, -28.1, 2.0, 2.3, 0, 'horizontal', 'parchment');
  addKanjiSign('ぬ', -19.0, 21.8, -28.2, 1.4, 1.6, 0, 'horizontal', 'parchment');
  addKanjiSign('ぬハソカチ', 22.5, 7.6, -17.3, 1.65, 5.1, -Math.PI * 0.42, 'vertical', 'dark');
  addKanjiSign('天和', 22.2, 20.6, -24.1, 1.45, 3.0, -Math.PI * 0.1, 'vertical', 'parchment');

  // Batch bandage wraps on left + right pipes into 1 InstancedMesh (1 draw call instead of 18!)
  const pipeWrapMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < 3; i++) {
    const px = -21.8 + i * 1.35;
    const lPipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(px, -3.0, -27.8),
      new THREE.Vector3(px, 6.2, -27.8),
      new THREE.Vector3(px - 0.8, 9.6, -28.5),
    ]);
    const lPipe = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(lPipeCurve, 10, 0.48, 6, false)),
      pipeMetalMat
    );
    group.add(lPipe);

    _tempObj.position.set(px, 4.4 + i * 0.9, -27.8);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(0.6, 1.0, 0.6);
    _tempObj.updateMatrix();
    pipeWrapMatrices.push(new THREE.Matrix4().copy(_tempObj.matrix));
  }

  const rightPipeXs = [23.2, 23.4, 23.6, 23.8, 24.4];
  const rightPipeZs = [-22.5, -19.6, -16.6, -13.4, -9.8];
  for (let i = 0; i < rightPipeXs.length; i++) {
    const px = rightPipeXs[i];
    const pz = rightPipeZs[i];
    const rRadius = 0.7 + (i % 2) * 0.16;
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(px + 2.4, -4.0, pz),
      new THREE.Vector3(px + 0.3, 4.5, pz),
      new THREE.Vector3(px, 13.8, pz),
      new THREE.Vector3(px + 2.0, 18.8 + i * 1.2, pz - 1.1),
      new THREE.Vector3(px + 4.4, 22.8 + i * 1.4, pz - 1.5),
    ]);
    const rPipe = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(pipeCurve, 14, rRadius, 8, false)),
      pipeMetalMat
    );
    group.add(rPipe);

    for (const wy of [4.0, 9.8, 14.8]) {
      _tempObj.position.set(px + (wy < 6 ? 0.35 : 0.08), wy, pz);
      _tempObj.rotation.set(0, 0, 0);
      _tempObj.scale.set(rRadius + 0.14, 1.35, rRadius + 0.14);
      _tempObj.updateMatrix();
      pipeWrapMatrices.push(new THREE.Matrix4().copy(_tempObj.matrix));
    }
  }

  const unitCylGeo = trackGeo(new THREE.CylinderGeometry(1, 1, 1, 8));
  const pipeWrapInst = new THREE.InstancedMesh(unitCylGeo, bandageMat, pipeWrapMatrices.length);
  pipeWrapMatrices.forEach((m, i) => pipeWrapInst.setMatrixAt(i, m));
  pipeWrapInst.instanceMatrix.needsUpdate = true;
  pipeWrapInst.computeBoundingSphere();
  group.add(pipeWrapInst);

  // Tall rooftop vertical pipe chimneys (1 InstancedMesh instead of 12 draw calls!)
  const chimneyGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.52, 14, 7));
  const chimneyInst = new THREE.InstancedMesh(chimneyGeo, pipeMetalMat, 12);
  for (let c = 0; c < 6; c++) {
    _tempObj.position.set(-26 + c * 1.5, 30.0, -28.5 + (c % 2) * 1.6);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    chimneyInst.setMatrixAt(c * 2, _tempObj.matrix);

    _tempObj.position.set(25 + c * 1.4, 31.0, -24.0 + (c % 2) * 2.0);
    _tempObj.updateMatrix();
    chimneyInst.setMatrixAt(c * 2 + 1, _tempObj.matrix);
  }
  chimneyInst.instanceMatrix.needsUpdate = true;
  chimneyInst.computeBoundingSphere();
  group.add(chimneyInst);

  // =========================================================================
  // 6. ICONIC CENTRAL CANYON NEEDLE TOWERS, DOMED TOWER, SKYBRIDGE & CABLES
  // =========================================================================
  const painTowerGroup = new THREE.Group();
  painTowerGroup.position.set(-5.8, -16, -62);
  group.add(painTowerGroup);

  const ptTier1 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.4, 3.8, 28, 10)), darkTowerMat);
  ptTier1.position.y = 14;
  const ptTier2 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.6, 3.1, 12, 10)), darkTowerMat);
  ptTier2.position.y = 33;
  const ptTier3 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.45, 1.9, 9, 8)), darkTowerMat);
  ptTier3.position.y = 42;
  const ptSpire = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.32, 11, 6)), darkTowerMat);
  ptSpire.position.y = 50;
  painTowerGroup.add(ptTier1, ptTier2, ptTier3, ptSpire);

  const ribColGeo = trackGeo(new THREE.BoxGeometry(0.62, 32, 0.62));
  const ribColInst = new THREE.InstancedMesh(ribColGeo, darkTowerMat, 6);
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    _tempObj.position.set(Math.cos(ang) * 3.3, 17, Math.sin(ang) * 3.3);
    _tempObj.rotation.set(0, 0, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    ribColInst.setMatrixAt(a, _tempObj.matrix);
  }
  ribColInst.instanceMatrix.needsUpdate = true;
  ribColInst.computeBoundingSphere();
  painTowerGroup.add(ribColInst);

  const pennant1 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.9, 3.0, 3)), darkSteelMat);
  pennant1.position.set(1.4, 52.5, 0);
  pennant1.rotation.z = -Math.PI * 0.48;
  painTowerGroup.add(pennant1);

  const domeTowerGroup = new THREE.Group();
  domeTowerGroup.position.set(8.6, -16, -55);
  group.add(domeTowerGroup);

  const dtBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(4.5, 4.9, 26, 10)), darkTowerMat);
  dtBase.position.y = 13;
  const dtCone = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(5.1, 3.6, 10)), darkTowerMat);
  dtCone.position.y = 27.6;
  const dtUpper = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.6, 3.0, 9, 10)), darkTowerMat);
  dtUpper.position.y = 33.2;
  const dtTopTurret = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.15, 1.5, 5.5, 8)), darkTowerMat);
  dtTopTurret.position.y = 39.8;
  const dtMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.12, 0.2, 10.5, 6)), darkTowerMat);
  dtMast.position.y = 46.8;
  const dtCrossBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.16, 0.16)), darkTowerMat);
  dtCrossBar.position.y = 49.5;
  domeTowerGroup.add(dtBase, dtCone, dtUpper, dtTopTurret, dtMast, dtCrossBar);

  const portholeRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.85, 0.16, 6, 12)), darkSteelMat);
  portholeRing.position.set(0, 21.5, 4.55);
  domeTowerGroup.add(portholeRing);

  interface SpireSpec {
    x: number;
    z: number;
    r: number;
    h: number;
    topY: number;
    antennaH: number;
  }

  const canyonSpires: SpireSpec[] = [
    { x: -12.8, z: -50, r: 2.5, h: 40, topY: 16.0, antennaH: 8.0 },
    { x: 1.5, z: -76, r: 2.3, h: 52, topY: 23.0, antennaH: 10.5 },
    { x: -1.8, z: -96, r: 3.6, h: 60, topY: 31.0, antennaH: 12.0 },
    { x: 11.5, z: -88, r: 3.2, h: 56, topY: 28.0, antennaH: 11.0 },
    { x: -13.2, z: -84, r: 3.1, h: 54, topY: 26.5, antennaH: 10.0 },
    { x: 15.2, z: -48, r: 3.4, h: 42, topY: 17.5, antennaH: 8.5 },
  ];

  const allSpires: SpireSpec[] = [...canyonSpires];
  let towerSeed = 51729;
  const tRand = () => {
    towerSeed = (towerSeed * 16807) % 2147483647;
    return (towerSeed - 1) / 2147483646;
  };
  for (let i = 0; i < 34; i++) {
    const angle = (i / 34) * Math.PI * 2 + (tRand() - 0.5) * 0.08;
    const dist = 50 + tRand() * 52;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (z < -30 && z > -75 && Math.abs(x) < 16) continue;
    const topY = 12 + tRand() * 25;
    allSpires.push({
      x,
      z,
      r: 2.5 + tRand() * 2.8,
      h: topY + 28,
      topY,
      antennaH: 5 + tRand() * 8.5,
    });
  }

  const spireCylGeo = trackGeo(new THREE.CylinderGeometry(0.84, 1.0, 1.0, 8));
  const spireCapGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.85, 1.0, 8));
  const antennaGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 1.0, 5));

  const spireBodyInst = new THREE.InstancedMesh(spireCylGeo, distantTowerMat, allSpires.length);
  const spireCapInst = new THREE.InstancedMesh(spireCapGeo, distantTowerMat, allSpires.length);
  const spireAntInst = new THREE.InstancedMesh(antennaGeo, distantTowerMat, allSpires.length);

  for (let i = 0; i < allSpires.length; i++) {
    const s = allSpires[i];
    _tempObj.position.set(s.x, s.topY - s.h * 0.5, s.z);
    _tempObj.rotation.set(0, i * 0.4, 0);
    _tempObj.scale.set(s.r, s.h, s.r);
    _tempObj.updateMatrix();
    spireBodyInst.setMatrixAt(i, _tempObj.matrix);

    const capH = 4.2;
    _tempObj.position.set(s.x, s.topY + capH * 0.5, s.z);
    _tempObj.scale.set(s.r * 0.72, capH, s.r * 0.72);
    _tempObj.updateMatrix();
    spireCapInst.setMatrixAt(i, _tempObj.matrix);

    _tempObj.position.set(s.x, s.topY + capH + s.antennaH * 0.5, s.z);
    _tempObj.scale.set(1, s.antennaH, 1);
    _tempObj.updateMatrix();
    spireAntInst.setMatrixAt(i, _tempObj.matrix);
  }
  spireBodyInst.instanceMatrix.needsUpdate = true;
  spireCapInst.instanceMatrix.needsUpdate = true;
  spireAntInst.instanceMatrix.needsUpdate = true;
  spireBodyInst.computeBoundingSphere();
  spireCapInst.computeBoundingSphere();
  spireAntInst.computeBoundingSphere();
  group.add(spireBodyInst, spireCapInst, spireAntInst);

  // Diagonal Canyon Skybridge
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(1.2, 4.4, -52);
  bridgeGroup.rotation.z = -0.14;
  bridgeGroup.rotation.y = -0.16;
  const bridgeDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 1.15, 2.2)), darkTowerMat);
  const bridgeRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26, 0.2, 0.14)), darkSteelMat);
  bridgeRail.position.set(0, 1.15, 1.0);
  bridgeGroup.add(bridgeDeck, bridgeRail);
  group.add(bridgeGroup);

  // Overhead & Lower Catenary Power Cables
  const cableSpecs: Array<{
    p0: [number, number, number];
    p1: [number, number, number];
    sag: number;
    radius: number;
  }> = [
    { p0: [-25, 23.0, -22], p1: [25, 25.0, -19], sag: 3.3, radius: 0.085 },
    { p0: [-26, 20.2, -27], p1: [25, 21.8, -25], sag: 2.8, radius: 0.08 },
    { p0: [-24, 17.5, -34], p1: [24, 19.2, -32], sag: 2.5, radius: 0.065 },
    { p0: [-26, 12.6, -21], p1: [24, 13.4, -21], sag: 3.0, radius: 0.06 },
    { p0: [-16, 8.8, -38], p1: [17, 9.4, -36], sag: 2.2, radius: 0.048 },
  ];
  for (const cs of cableSpecs) {
    const midX = (cs.p0[0] + cs.p1[0]) * 0.5;
    const midY = (cs.p0[1] + cs.p1[1]) * 0.5 - cs.sag;
    const midZ = (cs.p0[2] + cs.p1[2]) * 0.5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(...cs.p0),
      new THREE.Vector3(midX, midY, midZ),
      new THREE.Vector3(...cs.p1),
    ]);
    const cableMesh = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(curve, 14, cs.radius, 5, false)),
      cableMat
    );
    group.add(cableMesh);
  }

  // Lit Skyscraper Windows (single InstancedMesh)
  const litWinGeo = trackGeo(new THREE.PlaneGeometry(0.68, 0.42));
  const litWinMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    })
  );
  const windowSpecs: Array<{ x: number; y: number; z: number; rotY: number; warm: boolean }> = [];
  let winSeed = 9137;
  const wRand = () => {
    winSeed = (winSeed * 16807) % 2147483647;
    return (winSeed - 1) / 2147483646;
  };
  for (const b of foregroundBuildings) {
    const faceZ = b.z > 0 ? b.z - b.d * 0.5 - 0.08 : b.z + b.d * 0.5 + 0.08;
    const rotY = b.z > 0 ? Math.PI : 0;
    for (let row = 0; row < 6; row++) {
      const wy = 2.5 + row * 3.8;
      for (let col = -2; col <= 2; col++) {
        if (wRand() < 0.42) continue;
        windowSpecs.push({
          x: b.x + col * (b.w * 0.16),
          y: wy,
          z: faceZ,
          rotY,
          warm: wRand() > 0.42,
        });
      }
    }
  }
  for (let i = 0; i < Math.min(24, allSpires.length); i++) {
    const s = allSpires[i];
    const dirToArena = Math.atan2(-s.x, -s.z);
    for (let k = 0; k < 3; k++) {
      if (wRand() < 0.35) continue;
      const wy = 4 + wRand() * Math.max(4, s.topY - 6);
      windowSpecs.push({
        x: s.x + Math.sin(dirToArena) * (s.r * 0.94),
        y: wy,
        z: s.z + Math.cos(dirToArena) * (s.r * 0.94),
        rotY: dirToArena,
        warm: wRand() > 0.48,
      });
    }
  }
  const litWinInst = new THREE.InstancedMesh(litWinGeo, litWinMat, Math.max(1, windowSpecs.length));
  for (let i = 0; i < windowSpecs.length; i++) {
    const ws = windowSpecs[i];
    _tempObj.position.set(ws.x, ws.y, ws.z);
    _tempObj.rotation.set(0, ws.rotY, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    litWinInst.setMatrixAt(i, _tempObj.matrix);
    _tempColor.setHex(ws.warm ? 0xfbbf72 : 0x7da4d4);
    litWinInst.setColorAt(i, _tempColor);
  }
  litWinInst.instanceMatrix.needsUpdate = true;
  if (litWinInst.instanceColor) litWinInst.instanceColor.needsUpdate = true;
  litWinInst.computeBoundingSphere();
  group.add(litWinInst);

  // Blinking Red Aviation Beacons
  const beaconMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff3b3b,
      transparent: true,
      opacity: 0.92,
    })
  );
  const beaconGeo = trackGeo(new THREE.SphereGeometry(0.28, 6, 6));
  const beaconPositions: Array<[number, number, number, number]> = [
    [-5.8, 39.6, -62, 0.0],
    [8.6, 36.2, -55, 1.3],
  ];
  for (let i = 0; i < Math.min(10, allSpires.length); i++) {
    const s = allSpires[i];
    beaconPositions.push([s.x, s.topY + 4.2 + s.antennaH, s.z, i * 0.7]);
  }
  const beaconInst = new THREE.InstancedMesh(beaconGeo, beaconMat, beaconPositions.length);
  beaconInst.computeBoundingSphere();
  group.add(beaconInst);

  // Drifting Layered Storm Mist Sheets inside the Deep Amegakure Canyon (4 light planes)
  const mistMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: mistTex,
      color: 0x7c8cb8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const mistPlaneGeo = trackGeo(new THREE.PlaneGeometry(74, 48));
  mistPlaneGeo.rotateX(-Math.PI / 2);
  const mistLayers: Array<{ mesh: THREE.Mesh; baseX: number; baseZ: number; speed: number; phase: number }> = [];
  for (let m = 0; m < 4; m++) {
    const ang = (m / 4) * Math.PI * 2;
    const dist = 32 + (m % 2) * 18;
    const mesh = new THREE.Mesh(mistPlaneGeo, mistMat);
    const bx = Math.cos(ang) * dist;
    const bz = Math.sin(ang) * dist;
    mesh.position.set(bx, -11.5 - (m % 2) * 4.2, bz);
    mesh.rotation.y = m * 0.7;
    group.add(mesh);
    mistLayers.push({ mesh, baseX: bx, baseZ: bz, speed: 0.4 + (m % 2) * 0.2, phase: m * 1.4 });
  }

  // Rising Industrial Pipe Steam Vents (6 lean sprites instead of 12, scales with particle density)
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
    [23.6, 5.2, -16.6],
    [23.4, 11.4, -19.6],
    [-21.2, 6.4, -27.8],
    [24.2, 7.6, -10.0],
  ];
  for (let i = 0; i < 6; i++) {
    const [ox, oy, oz] = steamOrigins[i % steamOrigins.length];
    const mat = trackMat(
      new THREE.SpriteMaterial({
        map: mistTex,
        color: 0xb8c7e0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(ox, oy, oz);
    sprite.scale.set(2.2, 2.2, 1);
    group.add(sprite);
    steamPlumes.push({
      sprite,
      mat,
      ox,
      oy,
      oz,
      age: (i / 6) * 2.2,
      maxAge: 2.0 + (i % 3) * 0.45,
    });
  }

  // =========================================================================
  // 7. MOODY OVERCAST AMEGAKURE SKY DOME + ZERO-LIGHT STORM LIGHTNING FLASH
  // =========================================================================
  const skyGeo = trackGeo(new THREE.SphereGeometry(175, 28, 18));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: skyTex,
      color: 0xffffff,
      side: THREE.BackSide,
      fog: false,
    })
  );
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyDome);

  let nextLightningTime = 5.5;
  let lightningPulse = 0;

  // =========================================================================
  // 8. HIGH-FPS 3D FALLING RAIN STREAKS + FLOOR RIPPLES & SPLASHES
  //    Dynamically scales with Particle Density setting (low / medium / high)
  // =========================================================================
  const maxRainCount = 650;
  let activeRainCount = maxRainCount;
  const rainPositions = new Float32Array(maxRainCount * 6);
  const rainDrops: Array<{ x: number; y: number; z: number; speed: number; len: number }> = [];
  for (let i = 0; i < maxRainCount; i++) {
    const rx = (Math.random() - 0.5) * 44;
    const ry = Math.random() * 24;
    const rz = (Math.random() - 0.5) * 44;
    const speed = 30 + Math.random() * 14;
    const len = 1.25 + Math.random() * 0.95;
    rainDrops.push({ x: rx, y: ry, z: rz, speed, len });

    const base = i * 6;
    rainPositions[base] = rx;
    rainPositions[base + 1] = ry;
    rainPositions[base + 2] = rz;
    rainPositions[base + 3] = rx - 0.065 * len;
    rainPositions[base + 4] = ry + len;
    rainPositions[base + 5] = rz - 0.02 * len;
  }
  const rainGeo = trackGeo(new THREE.BufferGeometry());
  const rainAttr = new THREE.BufferAttribute(rainPositions, 3);
  rainAttr.setUsage(THREE.DynamicDrawUsage);
  rainGeo.setAttribute('position', rainAttr);
  rainGeo.setDrawRange(0, activeRainCount * 2);
  const rainMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xcbdcf8,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    })
  );
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  group.add(rainLines);

  const maxRippleCount = 44;
  let activeRippleCount = maxRippleCount;
  let activeSteamCount = steamPlumes.length;
  const rippleGeo = trackGeo(new THREE.PlaneGeometry(1, 1));
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: rippleTex,
      color: 0xbfdbfe,
      transparent: true,
      opacity: 0.42,
      blending: THREE.NormalBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  const rippleInst = new THREE.InstancedMesh(rippleGeo, rippleMat, maxRippleCount);
  rippleInst.frustumCulled = false;
  group.add(rippleInst);

  const splashGeo = trackGeo(new THREE.ConeGeometry(0.028, 0.2, 4));
  splashGeo.translate(0, 0.1, 0);
  const splashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.36,
      blending: THREE.NormalBlending,
      depthWrite: false,
    })
  );
  const splashInst = new THREE.InstancedMesh(splashGeo, splashMat, maxRippleCount);
  splashInst.frustumCulled = false;
  group.add(splashInst);

  const ripples = Array.from({ length: maxRippleCount }, (_, idx) => ({
    x: (Math.random() - 0.5) * 28,
    z: (Math.random() - 0.5) * 28,
    age: (idx / maxRippleCount) * 0.65,
    maxAge: 0.46 + Math.random() * 0.28,
    maxScale: 0.56 + Math.random() * 0.46,
  }));

  _tempObj.position.set(0, -100, 0);
  _tempObj.scale.set(0.01, 0.01, 0.01);
  _tempObj.updateMatrix();
  _tempColor.setRGB(1, 1, 1);
  for (let i = 0; i < maxRippleCount; i++) {
    rippleInst.setMatrixAt(i, _tempObj.matrix);
    rippleInst.setColorAt(i, _tempColor);
    splashInst.setMatrixAt(i, _tempObj.matrix);
    splashInst.setColorAt(i, _tempColor);
  }
  rippleInst.instanceMatrix.needsUpdate = true;
  if (rippleInst.instanceColor) rippleInst.instanceColor.needsUpdate = true;
  splashInst.instanceMatrix.needsUpdate = true;
  if (splashInst.instanceColor) splashInst.instanceColor.needsUpdate = true;

  let beaconTimer = 0;

  return {
    group,
    arenaRadius: AMEGAKURE_ARENA_RADIUS,
    setParticleDensity: (scale: number) => {
      const clamped = THREE.MathUtils.clamp(scale, 0.2, 1.0);
      activeRainCount = Math.max(140, Math.round(maxRainCount * clamped));
      rainGeo.setDrawRange(0, activeRainCount * 2);

      activeRippleCount = Math.max(10, Math.round(maxRippleCount * clamped));
      rippleInst.count = activeRippleCount;
      splashInst.count = activeRippleCount;

      activeSteamCount = Math.max(2, Math.round(steamPlumes.length * clamped));
      for (let i = 0; i < steamPlumes.length; i++) {
        steamPlumes[i].sprite.visible = i < activeSteamCount;
      }
    },
    update: (dt: number, elapsed: number, playerPos?: THREE.Vector3) => {
      // Sway the giant statue's tongue lantern gently in the storm breeze
      lanternPivot.rotation.z = Math.sin(elapsed * 1.9) * 0.085;
      lanternPivot.rotation.x = Math.cos(elapsed * 1.45) * 0.055;
      const lanternScale = 6.0 + Math.sin(elapsed * 5.2) * 0.55;
      lanternHalo.scale.set(lanternScale, lanternScale, 1);

      // Subtle flicker on perimeter warm storm floodlight halos
      for (let i = 0; i < cornerHaloSprites.length; i++) {
        const hs = 3.25 + Math.sin(elapsed * 7.5 + i * 1.9) * 0.28;
        cornerHaloSprites[i].scale.set(hs, hs, 1);
      }

      // Throttle red spire aviation beacon updates to ~20Hz (imperceptible & saves CPU)
      beaconTimer += dt;
      if (beaconTimer >= 0.05) {
        beaconTimer = 0;
        for (let i = 0; i < beaconPositions.length; i++) {
          const [bx, by, bz, phase] = beaconPositions[i];
          const sVal = Math.max(0, Math.sin(elapsed * 2.1 + phase));
          const pulse = sVal * sVal * sVal * sVal;
          const s = 0.55 + pulse * 0.95;
          _tempObj.position.set(bx, by, bz);
          _tempObj.rotation.set(0, 0, 0);
          _tempObj.scale.setScalar(s);
          _tempObj.updateMatrix();
          beaconInst.setMatrixAt(i, _tempObj.matrix);
          _tempColor.setRGB(0.35 + pulse * 0.95, 0.16 * pulse, 0.16 * pulse);
          beaconInst.setColorAt(i, _tempColor);
        }
        beaconInst.instanceMatrix.needsUpdate = true;
        if (beaconInst.instanceColor) beaconInst.instanceColor.needsUpdate = true;
      }

      // Drift volumetric canyon mist layers & rising industrial pipe steam plumes
      for (let i = 0; i < mistLayers.length; i++) {
        const ml = mistLayers[i];
        ml.mesh.position.x = ml.baseX + Math.sin(elapsed * ml.speed * 0.25 + ml.phase) * 9.0;
        ml.mesh.position.z = ml.baseZ + Math.cos(elapsed * ml.speed * 0.2 + ml.phase) * 6.0;
      }
      for (let i = 0; i < activeSteamCount; i++) {
        const sp = steamPlumes[i];
        sp.age += dt;
        if (sp.age >= sp.maxAge) sp.age = 0;
        const p = sp.age / sp.maxAge;
        sp.sprite.position.set(
          sp.ox + p * 1.6 + Math.sin(elapsed * 1.4 + i) * 0.35,
          sp.oy + p * 4.2,
          sp.oz + Math.cos(elapsed * 1.1 + i) * 0.3
        );
        const sc = 1.4 + p * 3.8;
        sp.sprite.scale.set(sc, sc, 1);
        sp.mat.opacity = Math.sin(p * Math.PI) * 0.22;
      }

      // Subtle distant storm cloud lightning shimmer (zero extra DirectionalLight cost)
      if (elapsed >= nextLightningTime) {
        lightningPulse = 1.0;
        nextLightningTime = elapsed + 8.5 + Math.random() * 8.0;
      }
      if (lightningPulse > 0.005) {
        lightningPulse = Math.max(0, lightningPulse - dt * 4.2);
        const doubleBeat =
          lightningPulse > 0.4
            ? Math.sin(lightningPulse * Math.PI * 3.0) * 0.5 + 0.5
            : lightningPulse;
        const tint = 1.0 + doubleBeat * 0.34;
        skyMat.color.setRGB(tint, tint, tint * 1.05);
        mistMat.opacity = 0.22 + doubleBeat * 0.16;
      } else if (skyMat.color.r !== 1) {
        skyMat.color.setRGB(1, 1, 1);
        mistMat.opacity = 0.22;
      }

      const cx = playerPos ? playerPos.x : 0;
      const cz = playerPos ? playerPos.z : 0;

      for (let i = 0; i < activeRainCount; i++) {
        const drop = rainDrops[i];
        drop.y -= drop.speed * dt;
        drop.x += 1.95 * dt;
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
        rainPositions[base + 3] = drop.x - 0.065 * drop.len;
        rainPositions[base + 4] = drop.y + drop.len;
        rainPositions[base + 5] = drop.z - 0.02 * drop.len;
      }
      rainAttr.needsUpdate = true;

      for (let i = 0; i < activeRippleCount; i++) {
        const rp = ripples[i];
        rp.age += dt;
        if (rp.age >= rp.maxAge) {
          rp.age = 0;
          if (Math.random() < 0.65) {
            rp.x = THREE.MathUtils.clamp(cx + (Math.random() - 0.5) * 24, -20.8, 20.8);
            rp.z = THREE.MathUtils.clamp(cz + (Math.random() - 0.5) * 24, -20.8, 20.8);
          } else {
            rp.x = (Math.random() - 0.5) * 40;
            rp.z = (Math.random() - 0.5) * 40;
          }
          rp.maxAge = 0.44 + Math.random() * 0.28;
          rp.maxScale = 0.54 + Math.random() * 0.46;
        }

        const p = rp.age / rp.maxAge;
        const inv = 1 - p;
        const ringScale = 0.14 + (1 - inv * inv) * rp.maxScale;
        const ringFade = inv * 0.74;

        _tempObj.position.set(rp.x, 0.016, rp.z);
        _tempObj.rotation.set(0, 0, 0);
        _tempObj.scale.set(ringScale, 1, ringScale);
        _tempObj.updateMatrix();
        rippleInst.setMatrixAt(i, _tempObj.matrix);
        _tempColor.setRGB(ringFade * 0.78, ringFade * 0.88, ringFade);
        rippleInst.setColorAt(i, _tempColor);

        if (p < 0.28) {
          const sp = p / 0.28;
          const spScaleY = Math.sin(sp * Math.PI) * 1.1;
          _tempObj.position.set(rp.x, 0.01, rp.z);
          _tempObj.scale.set(1.0, Math.max(0.05, spScaleY), 1.0);
          _tempObj.updateMatrix();
          splashInst.setMatrixAt(i, _tempObj.matrix);
          const sf = (1 - sp) * 0.75;
          _tempColor.setRGB(sf * 0.82, sf * 0.92, sf);
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
