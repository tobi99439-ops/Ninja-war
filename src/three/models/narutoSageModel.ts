import * as THREE from 'three';
import { createKonohaPlateTexture } from '../textures';
import type {
  CharacterBones,
  CustomGltfCharacter,
  LoadedCharacterTemplate,
} from './gltfObitoLoader';

let sharedToonGrad: THREE.DataTexture | null = null;

function getToonGradient(): THREE.DataTexture {
  if (!sharedToonGrad) {
    const ramp = new Uint8Array([122, 206, 255]);
    const tex = new THREE.DataTexture(ramp, 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    sharedToonGrad = tex;
  }
  return sharedToonGrad;
}

function createNarutoSageFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm anime skin base
  ctx.fillStyle = '#efc39e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle jaw / neck cel shadow
  ctx.fillStyle = '#d7a37e';
  ctx.fillRect(0, 385, 512, 127);

  // Orange-red Sage Mode eye pigmentation (swept outer wings)
  const drawSagePigment = (cx: number, dir: -1 | 1) => {
    ctx.save();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.ellipse(cx + dir * 6, 246, 48, 25, dir * -0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + dir * 24, 232);
    ctx.quadraticCurveTo(cx + dir * 56, 214, cx + dir * 72, 202);
    ctx.quadraticCurveTo(cx + dir * 66, 236, cx + dir * 44, 258);
    ctx.closePath();
    ctx.fill();

    // Inner deep vermilion accent rim
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.ellipse(cx + dir * 2, 246, 40, 19, dir * -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawSagePigment(174, -1);
  drawSagePigment(338, 1);

  // Toad-Sage Eyes (golden-amber iris + iconic horizontal bar pupil)
  const drawSageEye = (cx: number, tilt: number) => {
    // Upper & lower dark lash border
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.ellipse(cx, 248, 36, 18, tilt, 0, Math.PI * 2);
    ctx.fill();

    // Crisp white sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, 250, 31, 14.5, tilt, 0, Math.PI * 2);
    ctx.fill();

    // Golden-amber Sage iris
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx, 250, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, 250, 12.2, 0, Math.PI * 2);
    ctx.stroke();

    // Iconic horizontal Toad-Sage bar pupil
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.roundRect(cx - 10.5, 247.4, 21, 5.2, 2.4);
    ctx.fill();

    // Specular anime catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 5, 244, 3.2, 0, Math.PI * 2);
    ctx.fill();
  };

  drawSageEye(174, 0.06);
  drawSageEye(338, -0.06);

  // Determined blonde eyebrows
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(136, 216);
  ctx.lineTo(212, 228);
  ctx.moveTo(376, 216);
  ctx.lineTo(300, 228);
  ctx.stroke();

  // Three signature cheek whisker marks on each cheek
  ctx.strokeStyle = '#3f2e26';
  ctx.lineWidth = 4.5;
  for (const side of [-1, 1] as const) {
    const xInner = 256 + side * 66;
    const xOuter = 256 + side * 124;
    for (let w = 0; w < 3; w++) {
      const yBase = 290 + w * 18;
      ctx.beginPath();
      ctx.moveTo(xInner, yBase);
      ctx.quadraticCurveTo((xInner + xOuter) * 0.5, yBase - 4, xOuter, yBase + (w - 1) * 7);
      ctx.stroke();
    }
  }

  // Nose shadow & confident Naruto smirk
  ctx.fillStyle = '#c98e6b';
  ctx.beginPath();
  ctx.moveTo(254, 294);
  ctx.lineTo(260, 304);
  ctx.lineTo(251, 304);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#6b3e26';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(222, 344);
  ctx.quadraticCurveTo(258, 358, 294, 338);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createSageCloakTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich crimson-red Sage Mode haori base
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#dc2626');
  bg.addColorStop(0.65, '#b91c1c');
  bg.addColorStop(1, '#991b1b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical cloth fold shading
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  for (let x = 24; x < 512; x += 64) {
    ctx.fillRect(x, 0, 14, 512);
  }

  // Iconic Black Flame Pattern licking upward from the bottom hem
  ctx.fillStyle = '#11131a';
  ctx.beginPath();
  ctx.moveTo(0, 512);
  const flameCount = 8;
  const step = 512 / flameCount;
  for (let i = 0; i < flameCount; i++) {
    const x0 = i * step;
    const xMid = x0 + step * 0.5;
    const x1 = x0 + step;
    ctx.lineTo(x0, 444);
    ctx.quadraticCurveTo(x0 + step * 0.22, 396, xMid - 5, 318);
    ctx.quadraticCurveTo(xMid + 6, 368, xMid + 10, 396);
    ctx.quadraticCurveTo(x0 + step * 0.82, 412, x1, 444);
  }
  ctx.lineTo(512, 512);
  ctx.closePath();
  ctx.fill();

  // Sharp secondary inner flame tips for storm-4 crispness
  ctx.fillStyle = '#090a0f';
  for (let i = 0; i < flameCount; i++) {
    const xMid = i * step + step * 0.5;
    ctx.beginPath();
    ctx.moveTo(xMid - 14, 512);
    ctx.quadraticCurveTo(xMid - 4, 410, xMid, 355);
    ctx.quadraticCurveTo(xMid + 8, 415, xMid + 16, 512);
    ctx.closePath();
    ctx.fill();
  }

  // Crisp black collar rim trim along top edge
  ctx.fillStyle = '#14161f';
  ctx.fillRect(0, 0, 512, 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createShippudenJumpsuitTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Vibrant Naruto Shippuden orange
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, 256, 256);

  // Upper black shoulder yoke
  ctx.fillStyle = '#181a24';
  ctx.fillRect(0, 0, 256, 62);

  // Front vertical zipper & white trim stripe
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(122, 0, 12, 256);
  ctx.fillStyle = '#111827';
  ctx.fillRect(125, 0, 6, 256);

  // Subtle waist band line
  ctx.fillStyle = '#181a24';
  ctx.fillRect(0, 212, 256, 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createSageScrollTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Cream-parchment scroll body
  ctx.fillStyle = '#f5ead2';
  ctx.fillRect(0, 0, 256, 256);

  // Crimson center wrap & end borders
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, 256, 38);
  ctx.fillRect(0, 218, 256, 38);

  // Gold metallic bands
  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 38, 256, 12);
  ctx.fillRect(0, 206, 256, 12);

  // Dark seal brush kanji bands
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(114, 50, 28, 156);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(121, 68, 14, 120);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildLimbTubeGeometry(
  pStart: THREE.Vector3,
  pEnd: THREE.Vector3,
  rStart: number,
  rEnd: number,
  radialSegments = 14
): THREE.BufferGeometry {
  const dir = pEnd.clone().sub(pStart);
  const len = Math.max(0.03, dir.length());
  const geo = new THREE.CylinderGeometry(rEnd, rStart, len, radialSegments, 2, false);
  const mid = pStart.clone().add(pEnd).multiplyScalar(0.5);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(mat);
  return geo;
}

function makeSolidSkinnedMesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  boneIndex: number,
  skeleton: THREE.Skeleton,
  name: string
): THREE.SkinnedMesh {
  const count = geo.attributes.position.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndices[i * 4] = boneIndex;
    skinWeights[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  const skinned = new THREE.SkinnedMesh(geo, material);
  skinned.name = name;
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  skinned.bind(skeleton);
  return skinned;
}

function makeVerticalWeightedSkinnedMesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  ySplits: Array<{ y: number; boneIdx: number }>,
  skeleton: THREE.Skeleton,
  name: string
): THREE.SkinnedMesh {
  const pos = geo.attributes.position;
  const count = pos.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const vy = pos.getY(i);
    if (vy <= ySplits[0].y) {
      skinIndices[i * 4] = ySplits[0].boneIdx;
      skinWeights[i * 4] = 1;
    } else if (vy >= ySplits[ySplits.length - 1].y) {
      skinIndices[i * 4] = ySplits[ySplits.length - 1].boneIdx;
      skinWeights[i * 4] = 1;
    } else {
      let assigned = false;
      for (let s = 0; s < ySplits.length - 1; s++) {
        const a = ySplits[s];
        const b = ySplits[s + 1];
        if (vy >= a.y && vy <= b.y) {
          const span = Math.max(0.001, b.y - a.y);
          const t = THREE.MathUtils.clamp((vy - a.y) / span, 0, 1);
          skinIndices[i * 4] = a.boneIdx;
          skinIndices[i * 4 + 1] = b.boneIdx;
          skinWeights[i * 4] = 1 - t;
          skinWeights[i * 4 + 1] = t;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        skinIndices[i * 4] = ySplits[0].boneIdx;
        skinWeights[i * 4] = 1;
      }
    }
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  const skinned = new THREE.SkinnedMesh(geo, material);
  skinned.name = name;
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  skinned.bind(skeleton);
  return skinned;
}

function disposeModelHierarchy(rootObj: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();

  rootObj.traverse((obj) => {
    const sm = obj as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton && !skeletons.has(sm.skeleton)) {
      skeletons.add(sm.skeleton);
      sm.skeleton.dispose();
    }
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      if (m.geometry && !geos.has(m.geometry)) {
        geos.add(m.geometry);
        m.geometry.dispose();
      }
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) {
        if (!mat || mats.has(mat)) continue;
        mats.add(mat);
        const toon = mat as THREE.MeshToonMaterial;
        if (toon.map && !texs.has(toon.map)) {
          texs.add(toon.map);
          toon.map.dispose();
        }
        mat.dispose();
      }
    }
  });
}

function buildNarutoSageRiggedHierarchy(): {
  modelGroup: THREE.Group;
  bones: CharacterBones;
  baseBoneRotations: Map<THREE.Bone, THREE.Euler>;
  baseBonePositions: Map<THREE.Bone, THREE.Vector3>;
} {
  const modelGroup = new THREE.Group();
  modelGroup.name = 'NarutoSageModelRoot';

  // Standard Mixamo-compatible humanoid bone hierarchy (Height = 2.0m, Y-up, facing +Z, Left = +X)
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.98, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.16, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.22, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.20, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.11, 0);
  neck.add(head);

  const leftShoulder = new THREE.Bone();
  leftShoulder.name = 'LeftShoulder';
  leftShoulder.position.set(0.08, 0.16, 0);
  chest.add(leftShoulder);

  const leftUpperArm = new THREE.Bone();
  leftUpperArm.name = 'LeftUpperArm';
  leftUpperArm.position.set(0.12, -0.02, 0);
  leftShoulder.add(leftUpperArm);

  const leftForearm = new THREE.Bone();
  leftForearm.name = 'LeftForearm';
  leftForearm.position.set(0.14, -0.22, 0);
  leftUpperArm.add(leftForearm);

  const leftHand = new THREE.Bone();
  leftHand.name = 'LeftHand';
  leftHand.position.set(0.12, -0.20, 0.02);
  leftForearm.add(leftHand);

  const rightShoulder = new THREE.Bone();
  rightShoulder.name = 'RightShoulder';
  rightShoulder.position.set(-0.08, 0.16, 0);
  chest.add(rightShoulder);

  const rightUpperArm = new THREE.Bone();
  rightUpperArm.name = 'RightUpperArm';
  rightUpperArm.position.set(-0.12, -0.02, 0);
  rightShoulder.add(rightUpperArm);

  const rightForearm = new THREE.Bone();
  rightForearm.name = 'RightForearm';
  rightForearm.position.set(-0.14, -0.22, 0);
  rightUpperArm.add(rightForearm);

  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  rightHand.position.set(-0.12, -0.20, 0.02);
  rightForearm.add(rightHand);

  const leftThigh = new THREE.Bone();
  leftThigh.name = 'LeftThigh';
  leftThigh.position.set(0.11, -0.02, 0);
  hips.add(leftThigh);

  const leftShin = new THREE.Bone();
  leftShin.name = 'LeftShin';
  leftShin.position.set(0, -0.44, 0);
  leftThigh.add(leftShin);

  const leftFoot = new THREE.Bone();
  leftFoot.name = 'LeftFoot';
  leftFoot.position.set(0, -0.44, 0);
  leftShin.add(leftFoot);

  const rightThigh = new THREE.Bone();
  rightThigh.name = 'RightThigh';
  rightThigh.position.set(-0.11, -0.02, 0);
  hips.add(rightThigh);

  const rightShin = new THREE.Bone();
  rightShin.name = 'RightShin';
  rightShin.position.set(0, -0.44, 0);
  rightThigh.add(rightShin);

  const rightFoot = new THREE.Bone();
  rightFoot.name = 'RightFoot';
  rightFoot.position.set(0, -0.44, 0);
  rightShin.add(rightFoot);

  // 6 Procedural Spring-Bone Cloak Chains for the Sage Mode Flame Cloak
  const cloakBones: THREE.Bone[] = [];
  const sageCloakChains = [
    { name: 'L_frontcape', x: 0.14, z: 0.12, dx: 0.03, dz: 0.04 },
    { name: 'R_frontcape', x: -0.14, z: 0.12, dx: -0.03, dz: 0.04 },
    { name: 'L_sidecape', x: 0.22, z: -0.01, dx: 0.05, dz: -0.02 },
    { name: 'R_sidecape', x: -0.22, z: -0.01, dx: -0.05, dz: -0.02 },
    { name: 'L_backcape', x: 0.12, z: -0.16, dx: 0.02, dz: -0.05 },
    { name: 'R_backcape', x: -0.12, z: -0.16, dx: -0.02, dz: -0.05 },
  ];
  for (const c of sageCloakChains) {
    const b1 = new THREE.Bone();
    b1.name = `${c.name}_bone1`;
    b1.position.set(c.x, -0.04, c.z);
    hips.add(b1);

    const b2 = new THREE.Bone();
    b2.name = `${c.name}_bone2`;
    b2.position.set(c.dx, -0.26, c.dz);
    b1.add(b2);

    cloakBones.push(b1, b2);
  }

  modelGroup.add(hips);
  modelGroup.updateMatrixWorld(true);

  const boneList: THREE.Bone[] = [
    hips,          // 0
    spine,         // 1
    chest,         // 2
    neck,          // 3
    head,          // 4
    leftShoulder,  // 5
    leftUpperArm,  // 6
    leftForearm,   // 7
    leftHand,      // 8
    rightShoulder, // 9
    rightUpperArm, // 10
    rightForearm,  // 11
    rightHand,     // 12
    leftThigh,     // 13
    leftShin,      // 14
    leftFoot,      // 15
    rightThigh,    // 16
    rightShin,     // 17
    rightFoot,     // 18
    ...cloakBones, // 19..30
  ];

  const skeleton = new THREE.Skeleton(boneList);
  skeleton.calculateInverses();

  const wp = (b: THREE.Bone) => {
    const v = new THREE.Vector3();
    b.getWorldPosition(v);
    return v;
  };

  const pHips = wp(hips);
  const pSpine = wp(spine);
  const pChest = wp(chest);
  const pNeck = wp(neck);
  const pHead = wp(head);
  const pLUpper = wp(leftUpperArm);
  const pLFore = wp(leftForearm);
  const pLHand = wp(leftHand);
  const pRUpper = wp(rightUpperArm);
  const pRFore = wp(rightForearm);
  const pRHand = wp(rightHand);
  const pLThigh = wp(leftThigh);
  const pLShin = wp(leftShin);
  const pLFoot = wp(leftFoot);
  const pRThigh = wp(rightThigh);
  const pRShin = wp(rightShin);
  const pRFoot = wp(rightFoot);

  const grad = getToonGradient();
  const faceTex = createNarutoSageFaceTexture();
  const cloakTex = createSageCloakTexture();
  const jumpsuitTex = createShippudenJumpsuitTexture();
  const scrollTex = createSageScrollTexture();
  const plateTex = createKonohaPlateTexture(4, false, 'konoha');

  const faceMat = new THREE.MeshToonMaterial({ map: faceTex, gradientMap: grad });
  const skinMat = new THREE.MeshToonMaterial({ color: 0xefc39e, gradientMap: grad });
  const cloakMat = new THREE.MeshToonMaterial({
    map: cloakTex,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const cloakSleeveMat = new THREE.MeshToonMaterial({
    color: 0xb91c1c,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const jumpsuitMat = new THREE.MeshToonMaterial({
    map: jumpsuitTex,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const orangeMat = new THREE.MeshToonMaterial({ color: 0xf97316, gradientMap: grad });
  const darkFabricMat = new THREE.MeshToonMaterial({
    color: 0x181a24,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const headbandClothMat = new THREE.MeshToonMaterial({ color: 0x1e293b, gradientMap: grad });
  const plateMat = new THREE.MeshToonMaterial({ map: plateTex, gradientMap: grad });
  const hairMat = new THREE.MeshToonMaterial({
    color: 0xfacc15,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const scrollMat = new THREE.MeshToonMaterial({ map: scrollTex, gradientMap: grad });
  const bandageMat = new THREE.MeshToonMaterial({ color: 0xf1f5f9, gradientMap: grad });

  // 1. Inner Orange & Black Shippuden Jumpsuit Torso
  const innerTorsoGeo = new THREE.CylinderGeometry(0.155, 0.148, 0.62, 18, 8, false);
  innerTorsoGeo.translate(0, (pHips.y + pNeck.y) * 0.5, 0);
  modelGroup.add(
    makeVerticalWeightedSkinnedMesh(
      innerTorsoGeo,
      jumpsuitMat,
      [
        { y: pHips.y, boneIdx: 0 },
        { y: pSpine.y, boneIdx: 1 },
        { y: pChest.y, boneIdx: 2 },
      ],
      skeleton,
      'NarutoSageInnerTorso'
    )
  );

  // High Dark Zipped Shippuden Collar around Neck
  const collarGeo = new THREE.CylinderGeometry(0.115, 0.125, 0.14, 16, 1, true, Math.PI * 0.22, Math.PI * 1.56);
  collarGeo.translate(pNeck.x, pNeck.y + 0.04, pNeck.z);
  modelGroup.add(makeSolidSkinnedMesh(collarGeo, darkFabricMat, 2, skeleton, 'NarutoSageInnerCollar'));

  // 2. Iconic Open Red & Black Flame Sage Mode Cloak (leaves front chest +Z slit open to reveal jumpsuit)
  const cloakBottomY = 0.44;
  const cloakTopY = pNeck.y + 0.01;
  const cloakGeo = new THREE.CylinderGeometry(
    0.185,
    0.29,
    cloakTopY - cloakBottomY,
    24,
    12,
    true,
    0.34,
    Math.PI * 2 - 0.68
  );
  cloakGeo.translate(0, (cloakBottomY + cloakTopY) * 0.5, -0.012);
  {
    const cPos = cloakGeo.attributes.position;
    const cCount = cPos.count;
    const cSkinIdx = new Uint16Array(cCount * 4);
    const cSkinWgt = new Float32Array(cCount * 4);
    const waistJoinY = pHips.y + 0.04;
    for (let i = 0; i < cCount; i++) {
      const vx = cPos.getX(i);
      const vy = cPos.getY(i);
      const vz = cPos.getZ(i);
      if (vy >= waistJoinY) {
        if (vy >= pChest.y) {
          cSkinIdx[i * 4] = 2;
          cSkinWgt[i * 4] = 1;
        } else if (vy >= pSpine.y) {
          const t = THREE.MathUtils.clamp((vy - pSpine.y) / Math.max(0.001, pChest.y - pSpine.y), 0, 1);
          cSkinIdx[i * 4] = 1;
          cSkinIdx[i * 4 + 1] = 2;
          cSkinWgt[i * 4] = 1 - t;
          cSkinWgt[i * 4 + 1] = t;
        } else {
          const t = THREE.MathUtils.clamp((vy - waistJoinY) / Math.max(0.001, pSpine.y - waistJoinY), 0, 1);
          cSkinIdx[i * 4] = 0;
          cSkinIdx[i * 4 + 1] = 1;
          cSkinWgt[i * 4] = 1 - t;
          cSkinWgt[i * 4 + 1] = t;
        }
      } else {
        // Below waist: blend from hips (0) down into Spring-Bone cloak chains (19..30)
        // Chain offsets from 19: 0=L_front(19,20), 2=R_front(21,22), 4=L_side(23,24), 6=R_side(25,26), 8=L_back(27,28), 10=R_back(29,30)
        const isLeft = vx >= 0;
        let b1 = isLeft ? 19 : 21;
        let b2 = isLeft ? 20 : 22;
        if (vz < -0.05) {
          b1 = isLeft ? 27 : 29;
          b2 = isLeft ? 28 : 30;
        } else if (Math.abs(vx) > 0.16 && vz >= -0.05 && vz <= 0.06) {
          b1 = isLeft ? 23 : 25;
          b2 = isLeft ? 24 : 26;
        }
        const tDrop = THREE.MathUtils.clamp((waistJoinY - vy) / Math.max(0.001, waistJoinY - cloakBottomY), 0, 1);
        const wHips = THREE.MathUtils.clamp(1 - tDrop * 2.2, 0, 1);
        const rem = 1 - wHips;
        const tTip = THREE.MathUtils.smoothstep(tDrop, 0.25, 0.85);
        cSkinIdx[i * 4] = 0;
        cSkinIdx[i * 4 + 1] = b1;
        cSkinIdx[i * 4 + 2] = b2;
        cSkinWgt[i * 4] = wHips;
        cSkinWgt[i * 4 + 1] = rem * (1 - tTip);
        cSkinWgt[i * 4 + 2] = rem * tTip;
      }
    }
    cloakGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cSkinIdx, 4));
    cloakGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(cSkinWgt, 4));
    const cloakSkinned = new THREE.SkinnedMesh(cloakGeo, cloakMat);
    cloakSkinned.name = 'NarutoSageFlameCloak';
    cloakSkinned.castShadow = true;
    cloakSkinned.receiveShadow = true;
    cloakSkinned.frustumCulled = false;
    cloakSkinned.bind(skeleton);
    modelGroup.add(cloakSkinned);
  }

  // Red Cloak Shoulder Mantle Cap
  const mantleGeo = new THREE.CylinderGeometry(0.145, 0.205, 0.16, 20, 2, true, 0.36, Math.PI * 2 - 0.72);
  mantleGeo.translate(0, pNeck.y - 0.03, -0.01);
  modelGroup.add(makeSolidSkinnedMesh(mantleGeo, cloakSleeveMat, 2, skeleton, 'NarutoSageMantle'));

  // 3. Large Kuchiyose Summoning Scroll diagonally strapped across the back
  const scrollGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.72, 16);
  scrollGeo.rotateZ(-0.68);
  scrollGeo.translate(-0.02, pChest.y - 0.02, -0.22);
  modelGroup.add(makeSolidSkinnedMesh(scrollGeo, scrollMat, 2, skeleton, 'NarutoSageScroll'));

  // Black diagonal scroll harness strap across chest & shoulder
  const strapGeo = new THREE.TorusGeometry(0.185, 0.017, 6, 20);
  strapGeo.rotateX(Math.PI / 2);
  strapGeo.rotateY(0.58);
  strapGeo.scale(1.02, 1.42, 0.92);
  strapGeo.translate(0, pChest.y + 0.01, -0.01);
  modelGroup.add(makeSolidSkinnedMesh(strapGeo, darkFabricMat, 2, skeleton, 'NarutoSageStrap'));

  // 4. Neck, Head & Sage Mode Face
  const neckGeo = buildLimbTubeGeometry(pChest, pHead, 0.058, 0.052, 12);
  modelGroup.add(makeSolidSkinnedMesh(neckGeo, skinMat, 3, skeleton, 'NarutoSageNeck'));

  const headCenterY = pHead.y + 0.115;
  const headGeo = new THREE.SphereGeometry(0.125, 22, 18);
  headGeo.rotateY(-Math.PI / 2);
  headGeo.translate(pHead.x, headCenterY, pHead.z);
  modelGroup.add(makeSolidSkinnedMesh(headGeo, faceMat, 4, skeleton, 'NarutoSageHead'));

  // Konoha Forehead Protector (navy cloth band + non-slashed Konoha plate)
  const bandGeo = new THREE.CylinderGeometry(0.129, 0.129, 0.044, 22, 1, true);
  bandGeo.translate(pHead.x, headCenterY + 0.058, pHead.z);
  modelGroup.add(makeSolidSkinnedMesh(bandGeo, headbandClothMat, 4, skeleton, 'NarutoSageHeadband'));

  const plateGeo = new THREE.BoxGeometry(0.106, 0.04, 0.024);
  plateGeo.translate(pHead.x, headCenterY + 0.058, pHead.z + 0.125);
  modelGroup.add(makeSolidSkinnedMesh(plateGeo, plateMat, 4, skeleton, 'NarutoSagePlate'));

  // Iconic Spiky Golden-Blonde Hair Crown + Front/Side Tufts
  const hairCapGeo = new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
  hairCapGeo.translate(pHead.x, headCenterY + 0.02, pHead.z - 0.012);
  modelGroup.add(makeSolidSkinnedMesh(hairCapGeo, hairMat, 4, skeleton, 'NarutoSageHairCap'));

  const spikeConfigs: Array<[number, number, number, number, number, number, number]> = [
    // [tx, tyOffset, tz, rotX, rotZ, radius, height]
    [0.0, 0.155, 0.02, 0.25, 0.0, 0.045, 0.145],
    [-0.068, 0.142, 0.035, 0.22, 0.48, 0.042, 0.135],
    [0.068, 0.142, 0.035, 0.22, -0.48, 0.042, 0.135],
    [-0.095, 0.105, -0.02, -0.25, 0.72, 0.042, 0.135],
    [0.095, 0.105, -0.02, -0.25, -0.72, 0.042, 0.135],
    [-0.055, 0.125, -0.095, -0.78, 0.35, 0.046, 0.155],
    [0.055, 0.125, -0.095, -0.78, -0.35, 0.046, 0.155],
    [0.0, 0.105, -0.12, -1.02, 0.0, 0.048, 0.165],
    // Back nape tufts
    [0.0, 0.02, -0.135, -1.75, 0.0, 0.044, 0.13],
    // Temple / cheek spikes framing headband
    [-0.108, 0.03, 0.088, 2.35, 0.25, 0.03, 0.105],
    [0.108, 0.03, 0.088, 2.35, -0.25, 0.03, 0.105],
  ];
  spikeConfigs.forEach(([tx, tyOff, tz, rx, rz, rad, h], idx) => {
    const spike = new THREE.ConeGeometry(rad, h, 6);
    spike.rotateX(rx);
    spike.rotateZ(rz);
    spike.translate(pHead.x + tx, headCenterY + tyOff, pHead.z + tz);
    modelGroup.add(makeSolidSkinnedMesh(spike, hairMat, 4, skeleton, `NarutoSageHairSpike_${idx}`));
  });

  // 5. Arms (Wide Red Cloak Sleeves -> Orange Inner Sleeve Cuffs -> Skin Hands)
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pLUpper, pLFore, 0.064, 0.078),
      cloakSleeveMat,
      6,
      skeleton,
      'NarutoSageLUpperArm'
    )
  );
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pLFore, pLHand, 0.08, 0.095),
      cloakSleeveMat,
      7,
      skeleton,
      'NarutoSageLForearm'
    )
  );
  const lCuffEnd = pLFore.clone().lerp(pLHand, 0.88);
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(lCuffEnd, pLHand, 0.052, 0.048),
      orangeMat,
      7,
      skeleton,
      'NarutoSageLCuff'
    )
  );
  const lHandGeo = new THREE.SphereGeometry(0.046, 10, 10);
  lHandGeo.translate(pLHand.x, pLHand.y, pLHand.z);
  modelGroup.add(makeSolidSkinnedMesh(lHandGeo, skinMat, 8, skeleton, 'NarutoSageLHand'));

  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pRUpper, pRFore, 0.064, 0.078),
      cloakSleeveMat,
      10,
      skeleton,
      'NarutoSageRUpperArm'
    )
  );
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pRFore, pRHand, 0.08, 0.095),
      cloakSleeveMat,
      11,
      skeleton,
      'NarutoSageRForearm'
    )
  );
  const rCuffEnd = pRFore.clone().lerp(pRHand, 0.88);
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(rCuffEnd, pRHand, 0.052, 0.048),
      orangeMat,
      11,
      skeleton,
      'NarutoSageRCuff'
    )
  );
  const rHandGeo = new THREE.SphereGeometry(0.046, 10, 10);
  rHandGeo.translate(pRHand.x, pRHand.y, pRHand.z);
  modelGroup.add(makeSolidSkinnedMesh(rHandGeo, skinMat, 12, skeleton, 'NarutoSageRHand'));

  // 6. Legs (Dark Shinobi Pants + Right-Thigh White Bandage & Kunai Holster + Sandals with exposed toes)
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pLThigh, pLShin, 0.076, 0.06),
      darkFabricMat,
      13,
      skeleton,
      'NarutoSageLThigh'
    )
  );
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pLShin, pLFoot, 0.058, 0.044),
      orangeMat,
      14,
      skeleton,
      'NarutoSageLShin'
    )
  );
  const lFootGeo = new THREE.BoxGeometry(0.086, 0.064, 0.175);
  lFootGeo.translate(pLFoot.x, Math.max(0.032, pLFoot.y - 0.035), pLFoot.z + 0.032);
  modelGroup.add(makeSolidSkinnedMesh(lFootGeo, darkFabricMat, 15, skeleton, 'NarutoSageLFoot'));
  const lToeGeo = new THREE.BoxGeometry(0.074, 0.034, 0.055);
  lToeGeo.translate(pLFoot.x, Math.max(0.017, pLFoot.y - 0.05), pLFoot.z + 0.118);
  modelGroup.add(makeSolidSkinnedMesh(lToeGeo, skinMat, 15, skeleton, 'NarutoSageLToes'));

  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pRThigh, pRShin, 0.076, 0.06),
      darkFabricMat,
      16,
      skeleton,
      'NarutoSageRThigh'
    )
  );
  // Crisp white thigh bandage wrap & kunai holster on right leg (-X)
  const rWrapStart = pRThigh.clone().lerp(pRShin, 0.24);
  const rWrapEnd = pRThigh.clone().lerp(pRShin, 0.56);
  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(rWrapStart, rWrapEnd, 0.075, 0.07),
      bandageMat,
      16,
      skeleton,
      'NarutoSageRThighWrap'
    )
  );
  const holsterGeo = new THREE.BoxGeometry(0.045, 0.095, 0.065);
  holsterGeo.translate(pRThigh.x - 0.076, (rWrapStart.y + rWrapEnd.y) * 0.5, pRThigh.z);
  modelGroup.add(makeSolidSkinnedMesh(holsterGeo, darkFabricMat, 16, skeleton, 'NarutoSageHolster'));

  modelGroup.add(
    makeSolidSkinnedMesh(
      buildLimbTubeGeometry(pRShin, pRFoot, 0.058, 0.044),
      orangeMat,
      17,
      skeleton,
      'NarutoSageRShin'
    )
  );
  const rFootGeo = new THREE.BoxGeometry(0.086, 0.064, 0.175);
  rFootGeo.translate(pRFoot.x, Math.max(0.032, pRFoot.y - 0.035), pRFoot.z + 0.032);
  modelGroup.add(makeSolidSkinnedMesh(rFootGeo, darkFabricMat, 18, skeleton, 'NarutoSageRFoot'));
  const rToeGeo = new THREE.BoxGeometry(0.074, 0.034, 0.055);
  rToeGeo.translate(pRFoot.x, Math.max(0.017, pRFoot.y - 0.05), pRFoot.z + 0.118);
  modelGroup.add(makeSolidSkinnedMesh(rToeGeo, skinMat, 18, skeleton, 'NarutoSageRToes'));

  modelGroup.updateMatrixWorld(true);

  const bones: CharacterBones = {
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

  const baseBoneRotations = new Map<THREE.Bone, THREE.Euler>();
  const baseBonePositions = new Map<THREE.Bone, THREE.Vector3>();
  for (const b of boneList) {
    baseBoneRotations.set(b, b.rotation.clone());
    baseBonePositions.set(b, b.position.clone());
  }

  return {
    modelGroup,
    bones,
    baseBoneRotations,
    baseBonePositions,
  };
}

export function createNarutoSageCharacter(): CustomGltfCharacter {
  const root = new THREE.Group();
  const pivotGroup = new THREE.Group();
  root.add(pivotGroup);

  const { modelGroup, bones, baseBoneRotations, baseBonePositions } =
    buildNarutoSageRiggedHierarchy();
  pivotGroup.add(modelGroup);

  return {
    root,
    pivotGroup,
    mixerRoot: modelGroup,
    hasSkeleton: true,
    mixer: null,
    idleAction: null,
    runAction: null,
    attackAction: null,
    bones,
    baseBoneRotations,
    baseBonePositions,
    gunbaiPivot: null,
    gunbaiRestPos: null,
    gunbaiRestRot: null,
    dispose: () => {
      disposeModelHierarchy(modelGroup);
    },
  };
}

export function createNarutoSageTemplate(): LoadedCharacterTemplate {
  const { modelGroup } = buildNarutoSageRiggedHierarchy();

  return {
    templateRoot: modelGroup,
    hasEmbeddedSkeleton: true,
    runClip: null,
    idleClip: null,
    attackClip: null,
    combatClip: null,
    dispose: () => {
      disposeModelHierarchy(modelGroup);
    },
  };
}
