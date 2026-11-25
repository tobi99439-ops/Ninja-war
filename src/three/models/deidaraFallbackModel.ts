import * as THREE from 'three';
import { CharacterBones } from './gltfObitoLoader';
import { createAkatsukiCloakTexture, createKonohaPlateTexture } from '../textures';

let sharedToonGrad: THREE.DataTexture | null = null;

function getToonGradient(): THREE.DataTexture {
  if (!sharedToonGrad) {
    const ramp = new Uint8Array([124, 206, 255]);
    const tex = new THREE.DataTexture(ramp, 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    sharedToonGrad = tex;
  }
  return sharedToonGrad;
}

function createDeidaraFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8c1a0';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle cheek blush/shading
  ctx.fillStyle = '#d4a684';
  ctx.fillRect(0, 180, 256, 76);

  // Right eye (blue-cyan iris, confident look)
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.ellipse(84, 124, 20, 10, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(84, 125, 16, 7.5, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(85, 125, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(85, 125, 2.7, 0, Math.PI * 2);
  ctx.fill();

  // Left eye (partially covered by hair/scope — sharp blue eye with Sharingan-counter lens mark)
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.ellipse(172, 124, 20, 10, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(172, 125, 16, 7.5, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(171, 125, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(171, 125, 2.7, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows (blonde)
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 108);
  ctx.lineTo(106, 113);
  ctx.moveTo(192, 108);
  ctx.lineTo(150, 113);
  ctx.stroke();

  // Confident smirk
  ctx.strokeStyle = '#6b3e26';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(110, 174);
  ctx.quadraticCurveTo(132, 182, 150, 169);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function getWorldPosInSpace(obj: THREE.Object3D | null | undefined, invRoot: THREE.Matrix4, fallback: THREE.Vector3): THREE.Vector3 {
  if (!obj) return fallback.clone();
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  v.applyMatrix4(invRoot);
  return v;
}

function buildLimbTubeGeometry(
  pStart: THREE.Vector3,
  pEnd: THREE.Vector3,
  rStart: number,
  rEnd: number,
  radialSegments = 12
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

/**
 * Constructs a Storm 4 cel-shaded 3D Akatsuki Deidara character bound directly to an
 * animation/armature-only skeleton (such as `3l3n26.glb` which contains bones + animations
 * with 0 embedded meshes), so Deidara renders at full detail and animates cleanly.
 */
export function buildDeidaraFallbackSkinnedMeshes(
  rawModel: THREE.Group,
  bones: CharacterBones
): void {
  rawModel.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(rawModel.matrixWorld).invert();

  const boneList: THREE.Bone[] = [];
  const registerBone = (b: THREE.Bone | null | undefined, fallbackIdx = 0): number => {
    if (!b) return fallbackIdx;
    const existing = boneList.indexOf(b);
    if (existing >= 0) return existing;
    boneList.push(b);
    return boneList.length - 1;
  };

  const hipsIdx = registerBone(bones.hips, 0);
  const spineIdx = registerBone(bones.spine, hipsIdx);
  const chestIdx = registerBone(bones.chest, spineIdx);
  const neckIdx = registerBone(bones.neck, chestIdx);
  const headIdx = registerBone(bones.head, neckIdx);
  const lUpperArmIdx = registerBone(bones.leftUpperArm, chestIdx);
  const lForearmIdx = registerBone(bones.leftForearm, lUpperArmIdx);
  const lHandIdx = registerBone(bones.leftHand, lForearmIdx);
  const rUpperArmIdx = registerBone(bones.rightUpperArm, chestIdx);
  const rForearmIdx = registerBone(bones.rightForearm, rUpperArmIdx);
  const rHandIdx = registerBone(bones.rightHand, rForearmIdx);
  const lThighIdx = registerBone(bones.leftThigh, hipsIdx);
  const lShinIdx = registerBone(bones.leftShin, lThighIdx);
  const lFootIdx = registerBone(bones.leftFoot, lShinIdx);
  const rThighIdx = registerBone(bones.rightThigh, hipsIdx);
  const rShinIdx = registerBone(bones.rightShin, rThighIdx);
  const rFootIdx = registerBone(bones.rightFoot, rShinIdx);

  if (boneList.length === 0) return;

  const skeleton = new THREE.Skeleton(boneList);
  skeleton.calculateInverses();

  const pHips = getWorldPosInSpace(bones.hips, invRoot, new THREE.Vector3(0, 1.0, 0));
  const pSpine = getWorldPosInSpace(bones.spine, invRoot, new THREE.Vector3(0, 1.15, 0));
  const pChest = getWorldPosInSpace(bones.chest, invRoot, new THREE.Vector3(0, 1.38, 0));
  const pNeck = getWorldPosInSpace(bones.neck, invRoot, new THREE.Vector3(0, 1.56, 0));
  const pHead = getWorldPosInSpace(bones.head, invRoot, new THREE.Vector3(0, 1.68, 0));

  const pLUpper = getWorldPosInSpace(bones.leftUpperArm, invRoot, new THREE.Vector3(0.2, 1.48, 0));
  const pLFore = getWorldPosInSpace(bones.leftForearm, invRoot, new THREE.Vector3(0.32, 1.24, 0));
  const pLHand = getWorldPosInSpace(bones.leftHand, invRoot, new THREE.Vector3(0.42, 1.02, 0.02));

  const pRUpper = getWorldPosInSpace(bones.rightUpperArm, invRoot, new THREE.Vector3(-0.2, 1.48, 0));
  const pRFore = getWorldPosInSpace(bones.rightForearm, invRoot, new THREE.Vector3(-0.32, 1.24, 0));
  const pRHand = getWorldPosInSpace(bones.rightHand, invRoot, new THREE.Vector3(-0.42, 1.02, 0.02));

  const pLThigh = getWorldPosInSpace(bones.leftThigh, invRoot, new THREE.Vector3(0.11, 0.96, 0));
  const pLShin = getWorldPosInSpace(bones.leftShin, invRoot, new THREE.Vector3(0.11, 0.52, 0));
  const pLFoot = getWorldPosInSpace(bones.leftFoot, invRoot, new THREE.Vector3(0.11, 0.08, 0));

  const pRThigh = getWorldPosInSpace(bones.rightThigh, invRoot, new THREE.Vector3(-0.11, 0.96, 0));
  const pRShin = getWorldPosInSpace(bones.rightShin, invRoot, new THREE.Vector3(-0.11, 0.52, 0));
  const pRFoot = getWorldPosInSpace(bones.rightFoot, invRoot, new THREE.Vector3(-0.11, 0.08, 0));

  const cloakTex = createAkatsukiCloakTexture(4);
  const plateTex = createKonohaPlateTexture(4, true, 'iwagakure');
  const faceTex = createDeidaraFaceTexture();
  const grad = getToonGradient();

  const cloakMat = new THREE.MeshToonMaterial({
    map: cloakTex,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const collarInnerMat = new THREE.MeshToonMaterial({
    color: 0x991b1b,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const darkPantsMat = new THREE.MeshToonMaterial({
    color: 0x1a1d26,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const skinMat = new THREE.MeshToonMaterial({
    color: 0xe8c1a0,
    gradientMap: grad,
  });
  const faceMat = new THREE.MeshToonMaterial({
    map: faceTex,
    gradientMap: grad,
  });
  const hairMat = new THREE.MeshToonMaterial({
    color: 0xfacc15,
    gradientMap: grad,
    side: THREE.DoubleSide,
  });
  const scopeMat = new THREE.MeshToonMaterial({
    color: 0x64748b,
    gradientMap: grad,
  });
  const scopeLensMat = new THREE.MeshToonMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    gradientMap: grad,
  });
  const pouchMat = new THREE.MeshToonMaterial({
    color: 0xd6cfc2,
    gradientMap: grad,
  });
  const plateMat = new THREE.MeshToonMaterial({
    map: plateTex,
    gradientMap: grad,
  });

  // 1. Torso & Lower Akatsuki Cloak Skirt
  const torsoSkirtGeo = new THREE.CylinderGeometry(0.165, 0.255, Math.max(0.95, pNeck.y - (pHips.y - 0.50)), 20, 12, false);
  const skirtBottomY = Math.max(0.38, pHips.y - 0.50);
  const torsoTopY = pNeck.y + 0.02;
  torsoSkirtGeo.translate(0, (skirtBottomY + torsoTopY) * 0.5, 0);
  rawModel.add(
    makeVerticalWeightedSkinnedMesh(
      torsoSkirtGeo,
      cloakMat,
      [
        { y: pHips.y, boneIdx: hipsIdx },
        { y: pSpine.y, boneIdx: spineIdx },
        { y: pChest.y, boneIdx: chestIdx },
      ],
      skeleton,
      'DeidaraCloakTorso'
    )
  );

  // High Akatsuki Popped Collar (outer black + inner crimson)
  const collarOuterGeo = new THREE.CylinderGeometry(0.128, 0.118, 0.16, 18, 1, true, Math.PI * 0.2, Math.PI * 1.6);
  collarOuterGeo.translate(pNeck.x, pNeck.y + 0.07, pNeck.z - 0.01);
  rawModel.add(makeSolidSkinnedMesh(collarOuterGeo, cloakMat, chestIdx, skeleton, 'DeidaraCollarOuter'));

  const collarInnerGeo = new THREE.CylinderGeometry(0.121, 0.111, 0.155, 18, 1, true, Math.PI * 0.2, Math.PI * 1.6);
  collarInnerGeo.translate(pNeck.x, pNeck.y + 0.07, pNeck.z - 0.01);
  rawModel.add(makeSolidSkinnedMesh(collarInnerGeo, collarInnerMat, chestIdx, skeleton, 'DeidaraCollarInner'));

  // Dual Clay Pouches on hips
  for (const side of [-1, 1]) {
    const pouchGeo = new THREE.BoxGeometry(0.085, 0.11, 0.105);
    pouchGeo.translate(pHips.x + side * 0.21, pHips.y + 0.02, pHips.z + 0.04);
    rawModel.add(makeSolidSkinnedMesh(pouchGeo, pouchMat, hipsIdx, skeleton, `DeidaraClayPouch_${side}`));
  }

  // 2. Neck & Head + Face
  const neckGeo = buildLimbTubeGeometry(pChest, pHead, 0.06, 0.055, 12);
  rawModel.add(makeSolidSkinnedMesh(neckGeo, skinMat, neckIdx, skeleton, 'DeidaraNeck'));

  const headCenterY = pHead.y + 0.12;
  const headGeo = new THREE.SphereGeometry(0.125, 20, 16);
  headGeo.rotateY(-Math.PI / 2);
  headGeo.translate(pHead.x, headCenterY, pHead.z);
  rawModel.add(makeSolidSkinnedMesh(headGeo, faceMat, headIdx, skeleton, 'DeidaraHead'));

  // Slashed Iwagakure/Akatsuki Headband
  const bandGeo = new THREE.CylinderGeometry(0.129, 0.129, 0.044, 20, 1, true);
  bandGeo.translate(pHead.x, headCenterY + 0.065, pHead.z);
  rawModel.add(makeSolidSkinnedMesh(bandGeo, darkPantsMat, headIdx, skeleton, 'DeidaraHeadband'));

  const plateGeo = new THREE.BoxGeometry(0.105, 0.04, 0.022);
  plateGeo.translate(pHead.x, headCenterY + 0.065, pHead.z + 0.125);
  rawModel.add(makeSolidSkinnedMesh(plateGeo, plateMat, headIdx, skeleton, 'DeidaraPlate'));

  // Left-eye Sharingan-counter Scope (Deidara's signature eyepiece on viewer's right = character left +X)
  const scopeBodyGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.04, 12);
  scopeBodyGeo.rotateX(Math.PI / 2);
  scopeBodyGeo.translate(pHead.x + 0.048, headCenterY + 0.008, pHead.z + 0.122);
  rawModel.add(makeSolidSkinnedMesh(scopeBodyGeo, scopeMat, headIdx, skeleton, 'DeidaraScope'));

  const lensGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.008, 12);
  lensGeo.rotateX(Math.PI / 2);
  lensGeo.translate(pHead.x + 0.048, headCenterY + 0.008, pHead.z + 0.143);
  rawModel.add(makeSolidSkinnedMesh(lensGeo, scopeLensMat, headIdx, skeleton, 'DeidaraScopeLens'));

  // Blonde Hair Crown + Iconic High Ponytail + Long Left Bang over left eye
  const hairCapGeo = new THREE.SphereGeometry(0.136, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairCapGeo.translate(pHead.x, headCenterY + 0.018, pHead.z - 0.012);
  rawModel.add(makeSolidSkinnedMesh(hairCapGeo, hairMat, headIdx, skeleton, 'DeidaraHairCap'));

  // Top spiky tufts
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spike = new THREE.ConeGeometry(0.042, 0.135, 6);
    spike.rotateZ(Math.sin(angle) * 0.45);
    spike.rotateX(Math.cos(angle) * 0.45);
    spike.translate(
      pHead.x + Math.sin(angle) * 0.06,
      headCenterY + 0.14,
      pHead.z + Math.cos(angle) * 0.06 - 0.015
    );
    rawModel.add(makeSolidSkinnedMesh(spike, hairMat, headIdx, skeleton, `DeidaraHairSpike_${i}`));
  }

  // High sweeping ponytail
  const ponyGeo = new THREE.ConeGeometry(0.065, 0.34, 8);
  ponyGeo.rotateX(-1.05);
  ponyGeo.translate(pHead.x, headCenterY + 0.12, pHead.z - 0.18);
  rawModel.add(makeSolidSkinnedMesh(ponyGeo, hairMat, headIdx, skeleton, 'DeidaraPonytail'));

  // Long diagonal blonde front bang draping over left eye (+X)
  const bangGeo = new THREE.ConeGeometry(0.045, 0.22, 6);
  bangGeo.rotateX(Math.PI - 0.18);
  bangGeo.rotateZ(-0.22);
  bangGeo.translate(pHead.x + 0.048, headCenterY - 0.02, pHead.z + 0.125);
  rawModel.add(makeSolidSkinnedMesh(bangGeo, hairMat, headIdx, skeleton, 'DeidaraFrontBang'));

  // 3. Arms (Wide Akatsuki Sleeves) & Skin Hands
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pLUpper, pLFore, 0.062, 0.078), cloakMat, lUpperArmIdx, skeleton, 'DeidaraLUpperArm'));
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pLFore, pLHand, 0.082, 0.098), cloakMat, lForearmIdx, skeleton, 'DeidaraLForearm'));
  const lHandGeo = new THREE.SphereGeometry(0.046, 10, 10);
  lHandGeo.translate(pLHand.x, pLHand.y, pLHand.z);
  rawModel.add(makeSolidSkinnedMesh(lHandGeo, skinMat, lHandIdx, skeleton, 'DeidaraLHand'));

  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pRUpper, pRFore, 0.062, 0.078), cloakMat, rUpperArmIdx, skeleton, 'DeidaraRUpperArm'));
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pRFore, pRHand, 0.082, 0.098), cloakMat, rForearmIdx, skeleton, 'DeidaraRForearm'));
  const rHandGeo = new THREE.SphereGeometry(0.046, 10, 10);
  rHandGeo.translate(pRHand.x, pRHand.y, pRHand.z);
  rawModel.add(makeSolidSkinnedMesh(rHandGeo, skinMat, rHandIdx, skeleton, 'DeidaraRHand'));

  // 4. Legs (Dark Shinobi Pants) & Sandals
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pLThigh, pLShin, 0.074, 0.058), darkPantsMat, lThighIdx, skeleton, 'DeidaraLThigh'));
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pLShin, pLFoot, 0.056, 0.042), darkPantsMat, lShinIdx, skeleton, 'DeidaraLShin'));
  const lFootGeo = new THREE.BoxGeometry(0.085, 0.065, 0.19);
  lFootGeo.translate(pLFoot.x, Math.max(0.033, pLFoot.y - 0.03), pLFoot.z + 0.04);
  rawModel.add(makeSolidSkinnedMesh(lFootGeo, darkPantsMat, lFootIdx, skeleton, 'DeidaraLFoot'));

  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pRThigh, pRShin, 0.074, 0.058), darkPantsMat, rThighIdx, skeleton, 'DeidaraRThigh'));
  rawModel.add(makeSolidSkinnedMesh(buildLimbTubeGeometry(pRShin, pRFoot, 0.056, 0.042), darkPantsMat, rShinIdx, skeleton, 'DeidaraRShin'));
  const rFootGeo = new THREE.BoxGeometry(0.085, 0.065, 0.19);
  rFootGeo.translate(pRFoot.x, Math.max(0.033, pRFoot.y - 0.03), pRFoot.z + 0.04);
  rawModel.add(makeSolidSkinnedMesh(rFootGeo, darkPantsMat, rFootIdx, skeleton, 'DeidaraRFoot'));

  rawModel.updateMatrixWorld(true);
}
