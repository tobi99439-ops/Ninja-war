import * as THREE from 'three';

export const WAR_OBITO_COLORS = {
  robeIndigo: 0x3b385c,
  liningKhaki: 0xa6967a,
  beltWhite: 0xe2e5ea,
  beltLavender: 0x7b749c,
  beltBuckle: 0xa0a4b2,
  pantsCharcoal: 0x262c34,
  undershirtCharcoal: 0x22262e,
  shinWrapWhite: 0xdde1e6,
  sandalCharcoal: 0x242933,
  skinPeach: 0xe2b296,
  maskWhite: 0xe7e7ea,
  maskLine: 0x363842,
  eyeSharingan: 0x9e1c2e,
  eyeRinnegan: 0x73588f,
  hairBlack: 0x181a20,
  gunbaiFace: 0xe4e5e8,
  gunbaiRim: 0x454549,
  gunbaiHandle: 0x685d53,
  gunbaiGrip: 0xdcd4be,
} as const;

export type CharacterColorPreset = 'original' | 'war_obito';

export interface BoneHintSet {
  hips?: THREE.Bone | null;
  spine?: THREE.Bone | null;
  chest?: THREE.Bone | null;
  head?: THREE.Bone | null;
  leftUpperArm?: THREE.Bone | null;
  leftForearm?: THREE.Bone | null;
  rightUpperArm?: THREE.Bone | null;
  rightForearm?: THREE.Bone | null;
  leftThigh?: THREE.Bone | null;
  rightThigh?: THREE.Bone | null;
  leftShin?: THREE.Bone | null;
  rightShin?: THREE.Bone | null;
  leftFoot?: THREE.Bone | null;
  rightFoot?: THREE.Bone | null;
}

export function isRunCharacterName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^run$/i.test(trimmed)) return true;
    if (/(^|[\s_\-/\\.])run([\s_\-.]|$)/i.test(trimmed)) return true;
  }
  return false;
}

export function isMaskManV2Name(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/mask[\s_\-]*man/i.test(trimmed)) return true;
    if (/tobi/i.test(trimmed)) return true;
    if (/توبي/.test(trimmed)) return true;
    if (/المقن[\u0651\u064b-\u065f]*ع/i.test(trimmed)) return true;
    if (/مقتع/i.test(trimmed)) return true;
    if (/(^|[/\\])tobi\.fbx(\?.*)?$/i.test(trimmed)) return true;
  }
  return false;
}

export function isMadaraName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/madara/i.test(trimmed)) return true;
    if (/مادارا/.test(trimmed)) return true;
    if (/mrjiej\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isObitoUchihaName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/obito/i.test(trimmed)) return true;
    if (/أوبيتو|اوبيتو/.test(trimmed)) return true;
    if (/qnmubz\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isOriginalObitoName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/gxujni\.glb/i.test(trimmed)) return true;
    if (/obito[\s_\-]*final\.glb/i.test(trimmed)) return true;
    if (/اوبيتو\s*اوتشيها\s*ال[أا]صلي/.test(trimmed)) return true;
  }
  return false;
}

export function isKakashiName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/kakashi/i.test(trimmed)) return true;
    if (/كاكاشي/.test(trimmed)) return true;
    if (/3ns6jl\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isItachiName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/itachi/i.test(trimmed)) return true;
    if (/إيتاتشي|ايتاتشي/.test(trimmed)) return true;
    if (/enh5qq\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isDeidaraName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/deidara/i.test(trimmed)) return true;
    if (/ديدارا/.test(trimmed)) return true;
    if (/3l3n26\.glb/i.test(trimmed)) return true;
    if (/u3gnsv\.glb/i.test(trimmed)) return true;
    if (/1hn6zf\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isNarutoSageName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/procedural:\/\/naruto_sage/i.test(trimmed)) return true;
    if (/naruto[\s_\-]*sage/i.test(trimmed)) return true;
    if (/sage[\s_\-]*mode/i.test(trimmed)) return true;
    if (/ناروتو\s*(ساج|سيج|الناسك)/.test(trimmed)) return true;
    if (/(ساج|سيج)\s*مود/.test(trimmed)) return true;
  }
  return false;
}

export function isNarutoKuramaName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/sage|ساج|سيج|الناسك/i.test(trimmed)) continue;
    if (/kurama/i.test(trimmed)) return true;
    if (/naruto/i.test(trimmed)) return true;
    if (/كوراما|ناروتو/.test(trimmed)) return true;
    if (/zw6rnu\.glb/i.test(trimmed)) return true;
  }
  return false;
}

export function isMadaraRikudoName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/madara[\s_\-]*rikudo/i.test(trimmed)) return true;
    if (/مادارا\s*الريكودو/.test(trimmed)) return true;
    if (/output\.glb/i.test(trimmed)) return true;
    if (/udttgm|9bbweg/i.test(trimmed)) return true;
  }
  return false;
}

export function isRunMovesetCharacterName(labelAr?: string, fileNameHint?: string): boolean {
  return (
    isRunCharacterName(labelAr, fileNameHint) ||
    isMaskManV2Name(labelAr, fileNameHint) ||
    isMadaraRikudoName(labelAr, fileNameHint) ||
    isObitoUchihaName(labelAr, fileNameHint) ||
    isOriginalObitoName(labelAr, fileNameHint) ||
    isKakashiName(labelAr, fileNameHint)
  );
}

export function shouldApplyWarObitoPalette(
  _labelAr?: string,
  _fileNameHint?: string,
  explicitPreset?: CharacterColorPreset
): boolean {
  return explicitPreset === 'war_obito';
}

type BoneRole =
  | 'unknown'
  | 'gunbai'
  | 'head'
  | 'hair'
  | 'neck'
  | 'hand'
  | 'arm'
  | 'foot'
  | 'toe'
  | 'shin'
  | 'thigh'
  | 'torso';

function classifyBoneRole(boneName: string): BoneRole {
  const n = boneName.toLowerCase();
  if (/gunbai|fan|weapon|chain/.test(n)) return 'gunbai';
  if (/hair|ponytail|strap/.test(n)) return 'hair';
  if (/head|face|jaw|skull|mask|eye|brow|ear/.test(n)) return 'head';
  if (/neck/.test(n)) return 'neck';
  if (/toe/.test(n)) return 'toe';
  if (/foot|ankle|heel|ball/.test(n)) return 'foot';
  if (/hand|finger|thumb|index|middle|ring|pinky|palm|wrist/.test(n)) return 'hand';
  if (/arm|shoulder|clavicle|elbow|forearm|sleeve|bicep/.test(n)) return 'arm';
  if (/thigh|upleg|up_leg|upperleg|upper_leg/.test(n)) return 'thigh';
  if (/shin|calf|lowerleg|lower_leg|knee|(?:^|[_\s:])(mixamorig\d*:)?(left|right|l|r)[_\s]?leg$/.test(n)) {
    return 'shin';
  }
  if (/hips|pelvis|waist|spine|chest|torso|skirt|robe|coat/.test(n)) return 'torso';
  return 'unknown';
}

function getBindPoseBonePosition(
  bone: THREE.Bone | null | undefined,
  rootMatrixWorld: THREE.Matrix4,
  skinnedMeshes: THREE.SkinnedMesh[]
): THREE.Vector3 | null {
  if (!bone) return null;
  for (const sm of skinnedMeshes) {
    const idx = sm.skeleton?.bones.indexOf(bone) ?? -1;
    if (idx >= 0 && sm.skeleton.boneInverses[idx]) {
      const mat = new THREE.Matrix4()
        .copy(sm.skeleton.boneInverses[idx])
        .invert()
        .premultiply(rootMatrixWorld);
      return new THREE.Vector3().setFromMatrixPosition(mat);
    }
  }
  const wp = new THREE.Vector3();
  bone.getWorldPosition(wp);
  return wp;
}

function medianOfSorted(arr: number[]): number {
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) * 0.5 : arr[mid];
}

function buildVertexMaterialMap(mesh: THREE.Mesh, vertexCount: number): Int16Array | null {
  const geo = mesh.geometry;
  if (!geo.groups || geo.groups.length === 0) return null;
  const matMap = new Int16Array(vertexCount).fill(-1);
  const index = geo.index;
  for (const grp of geo.groups) {
    const end = Math.min(grp.start + grp.count, index ? index.count : vertexCount);
    const matIdx = grp.materialIndex ?? 0;
    for (let i = grp.start; i < end; i++) {
      const vi = index ? index.getX(i) : i;
      if (vi >= 0 && vi < vertexCount && matMap[vi] === -1) {
        matMap[vi] = matIdx;
      }
    }
  }
  return matMap;
}

function colorBySemanticName(
  name: string,
  dx: number,
  dz: number,
  yBody: number,
  beltMid: number,
  headEyeY: number
): number | null {
  const s = name.toLowerCase();
  if (/\bsharingan\b/i.test(s)) return WAR_OBITO_COLORS.eyeSharingan;
  if (/\brinnegan\b/i.test(s)) return WAR_OBITO_COLORS.eyeRinnegan;
  if (/\b(eye|iris|pupil)\b/i.test(s)) {
    return dx < 0 ? WAR_OBITO_COLORS.eyeSharingan : WAR_OBITO_COLORS.eyeRinnegan;
  }
  if (/\bchain\b/i.test(s)) return WAR_OBITO_COLORS.hairBlack;
  if (/\b(gunbai|warfan|fan)\b/i.test(s)) {
    if (yBody > 0.87) return WAR_OBITO_COLORS.gunbaiGrip;
    if (Math.abs(dx) < 0.045 && yBody > 0.68) return WAR_OBITO_COLORS.gunbaiHandle;
    return WAR_OBITO_COLORS.gunbaiFace;
  }
  if (/\b(buckle|clasp)\b/i.test(s)) return WAR_OBITO_COLORS.beltBuckle;
  if (/\b(obi|belt|sash)\b/i.test(s)) {
    if (dz > 0.045 && Math.abs(dx) < 0.044 && Math.abs(yBody - beltMid) <= 0.023) {
      return WAR_OBITO_COLORS.beltBuckle;
    }
    if (Math.abs(yBody - beltMid) <= 0.015) return WAR_OBITO_COLORS.beltLavender;
    return WAR_OBITO_COLORS.beltWhite;
  }
  if (/\b(hair|strap|straps)\b/i.test(s)) return WAR_OBITO_COLORS.hairBlack;
  if (/\bmask\b/i.test(s)) {
    if (dz > 0.05 && Math.abs(yBody - headEyeY) < 0.025) {
      if (Math.hypot((dx + 0.036) * 1.15, (yBody - headEyeY) * 1.9) < 0.017) {
        return WAR_OBITO_COLORS.eyeSharingan;
      }
      if (Math.hypot((dx - 0.036) * 1.15, (yBody - headEyeY) * 1.9) < 0.017) {
        return WAR_OBITO_COLORS.eyeRinnegan;
      }
    }
    return WAR_OBITO_COLORS.maskWhite;
  }
  if (/\b(sandal|sandals|shoe|shoes)\b/i.test(s)) {
    return dz > 0.058 && yBody < 0.035 ? WAR_OBITO_COLORS.skinPeach : WAR_OBITO_COLORS.sandalCharcoal;
  }
  if (/\b(wrap|wraps|gaiter|gaiters|bandage)\b/i.test(s)) return WAR_OBITO_COLORS.shinWrapWhite;
  if (/\b(lining|trim|khaki)\b/i.test(s)) return WAR_OBITO_COLORS.liningKhaki;
  if (/\b(skin|finger|fingers|toe|toes)\b/i.test(s)) return WAR_OBITO_COLORS.skinPeach;
  return null;
}

/**
 * Applies the exact War Arc White-Mask Obito color palette onto a normalized
 * character model (y in [0..2.0], centered on X/Z, facing +Z).
 * Works across multi-mesh/multi-material FBX/GLB models AND single merged meshes
 * (such as Mixamo `run.fbx`).
 */
export function applyWarObitoColorPalette(
  rootObj: THREE.Object3D,
  bones?: BoneHintSet
): void {
  rootObj.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  rootObj.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      if (m.geometry?.attributes?.position) {
        meshes.push(m);
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
          skinnedMeshes.push(m as THREE.SkinnedMesh);
        }
      }
    }
  });

  if (meshes.length === 0) return;

  // Gather world-space bounding & torso reference
  let minY = Infinity;
  let maxY = -Infinity;
  const _v = new THREE.Vector3();

  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (_v.y < minY) minY = _v.y;
      if (_v.y > maxY) maxY = _v.y;
    }
  }

  const totalH = Math.max(0.1, maxY - minY);
  const footY = minY;

  const hipsPos = getBindPoseBonePosition(bones?.hips, rootObj.matrixWorld, skinnedMeshes);
  const headPos = getBindPoseBonePosition(bones?.head, rootObj.matrixWorld, skinnedMeshes);
  const leftShoulderPos = getBindPoseBonePosition(bones?.leftUpperArm, rootObj.matrixWorld, skinnedMeshes);
  const rightShoulderPos = getBindPoseBonePosition(bones?.rightUpperArm, rootObj.matrixWorld, skinnedMeshes);
  const leftShinPos = getBindPoseBonePosition(bones?.leftShin, rootObj.matrixWorld, skinnedMeshes);
  const rightShinPos = getBindPoseBonePosition(bones?.rightShin, rootObj.matrixWorld, skinnedMeshes);
  const leftFootPos = getBindPoseBonePosition(bones?.leftFoot, rootObj.matrixWorld, skinnedMeshes);
  const rightFootPos = getBindPoseBonePosition(bones?.rightFoot, rootObj.matrixWorld, skinnedMeshes);

  let spineX = 0;
  let spineZ = 0;

  if (hipsPos && headPos) {
    spineX = (hipsPos.x + headPos.x) * 0.5;
    spineZ = (hipsPos.z + headPos.z) * 0.5;
  } else {
    const midXs: number[] = [];
    const midZs: number[] = [];
    const lowBand = footY + totalH * 0.36;
    const highBand = footY + totalH * 0.66;
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1200));
      for (let i = 0; i < pos.count; i += step) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (_v.y >= lowBand && _v.y <= highBand) {
          midXs.push(_v.x);
          midZs.push(_v.z);
        }
      }
    }
    spineX = medianOfSorted(midXs);
    spineZ = medianOfSorted(midZs);
  }

  // Locate true head crown (ignoring tall back props such as a Gunbai handle sticking above the head)
  let headTopY = -Infinity;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const dx = _v.x - spineX;
      const dz = _v.z - spineZ;
      if (Math.hypot(dx, dz) < 0.22 && dz > -0.14 && _v.y > footY + totalH * 0.55) {
        if (_v.y > headTopY) headTopY = _v.y;
      }
    }
  }
  if (!Number.isFinite(headTopY) || headTopY <= footY + totalH * 0.55) {
    headTopY = maxY;
  }

  const bodyH = Math.max(0.45, headTopY - footY);

  const waistYNorm = hipsPos
    ? THREE.MathUtils.clamp((hipsPos.y - footY) / bodyH, 0.45, 0.56)
    : 0.505;
  const neckYNorm = headPos
    ? THREE.MathUtils.clamp((headPos.y - footY) / bodyH, 0.77, 0.87)
    : 0.825;
  const kneeAvgY =
    leftShinPos && rightShinPos
      ? (leftShinPos.y + rightShinPos.y) * 0.5
      : leftShinPos?.y ?? rightShinPos?.y ?? null;
  const kneeYNorm =
    kneeAvgY !== null ? THREE.MathUtils.clamp((kneeAvgY - footY) / bodyH, 0.20, 0.30) : 0.25;
  const ankleAvgY =
    leftFootPos && rightFootPos
      ? (leftFootPos.y + rightFootPos.y) * 0.5
      : leftFootPos?.y ?? rightFootPos?.y ?? null;
  const ankleYNorm =
    ankleAvgY !== null ? THREE.MathUtils.clamp((ankleAvgY - footY) / bodyH, 0.045, 0.095) : 0.068;

  const beltLow = Math.max(0.455, waistYNorm - 0.025);
  const beltHigh = beltLow + 0.088;
  const beltMid = (beltLow + beltHigh) * 0.5;
  const headEyeY = neckYNorm + (1.0 - neckYNorm) * 0.48;

  const torsoHalfX =
    leftShoulderPos && rightShoulderPos
      ? THREE.MathUtils.clamp(Math.abs(leftShoulderPos.x - rightShoulderPos.x) * 0.55, 0.16, 0.24)
      : 0.195;

  // Estimate maximum wrist/sleeve reach for arm-cuff trim when unrigged or without hand bones
  let maxArmAbsX = 0.35;
  let headVertCount = 0;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2500));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const yBody = (_v.y - footY) / bodyH;
      const absX = Math.abs(_v.x - spineX);
      if (yBody > 0.38 && yBody < 0.85 && absX > maxArmAbsX && absX < 1.1) {
        maxArmAbsX = absX;
      }
      if (yBody >= neckYNorm + 0.02 && absX < 0.15) {
        headVertCount++;
      }
    }
  }
  const hasDenseFaceVerts = headVertCount >= 180;

  const _color = new THREE.Color();
  const _lineColor = new THREE.Color(WAR_OBITO_COLORS.maskLine);
  const _n = new THREE.Vector3();
  const _normalMat = new THREE.Matrix3();

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const count = pos.count;
    const colors = new Float32Array(count * 3);

    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const skeletonBones = isSkinned ? (mesh as THREE.SkinnedMesh).skeleton?.bones : null;
    const skinIdx = isSkinned ? geo.attributes.skinIndex : null;
    const skinWgt = isSkinned ? geo.attributes.skinWeight : null;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const vertMatIdx = mats.length > 1 ? buildVertexMaterialMap(mesh, count) : null;
    _normalMat.getNormalMatrix(mesh.matrixWorld);

    for (let i = 0; i < count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const dx = _v.x - spineX;
      const dz = _v.z - spineZ;
      const absX = Math.abs(dx);
      const radialXZ = Math.hypot(dx, dz);
      const yBody = (_v.y - footY) / bodyH;

      let dotOutward = 0;
      if (norm) {
        _n.fromBufferAttribute(norm, i).applyMatrix3(_normalMat).normalize();
        if (radialXZ > 0.005) {
          dotOutward = (_n.x * dx + _n.z * dz) / radialXZ;
        }
      }

      // 1. Dominant bone role (if rigged)
      let boneRole: BoneRole = 'unknown';
      if (skeletonBones && skinIdx && skinWgt) {
        let bestIdx = skinIdx.getX(i);
        let bestW = skinWgt.getX(i);
        const wy = skinWgt.getY(i);
        if (wy > bestW) {
          bestW = wy;
          bestIdx = skinIdx.getY(i);
        }
        const wz = skinWgt.getZ(i);
        if (wz > bestW) {
          bestW = wz;
          bestIdx = skinIdx.getZ(i);
        }
        const ww = skinWgt.getW(i);
        if (ww > bestW) {
          bestIdx = skinIdx.getW(i);
        }
        const bone = skeletonBones[bestIdx];
        if (bone) {
          boneRole = classifyBoneRole(bone.name);
        }
      }

      // 2. Semantic material/mesh name check (only when split into multiple meshes or material slots)
      const matIdx = vertMatIdx ? Math.max(0, vertMatIdx[i]) : 0;
      const matName = mats[matIdx]?.name || '';
      const semanticHex =
        (meshes.length > 1
          ? colorBySemanticName(mesh.name, dx, dz, yBody, beltMid, headEyeY)
          : null) ??
        (mats.length > 1
          ? colorBySemanticName(matName, dx, dz, yBody, beltMid, headEyeY)
          : null);

      let hex: number = WAR_OBITO_COLORS.robeIndigo;
      let maskSpiralFactor = 0;

      if (semanticHex !== null) {
        hex = semanticHex;
      } else if (
        boneRole === 'gunbai' ||
        (boneRole !== 'arm' &&
          boneRole !== 'hand' &&
          boneRole !== 'foot' &&
          boneRole !== 'toe' &&
          boneRole !== 'shin' &&
          ((dz < -0.24 && yBody > 0.14) || (yBody > 1.04 && dz <= 0.03)))
      ) {
        // Back Gunbai & Chain
        const isChainLike = dx < -0.26 && yBody > 0.35 && yBody < 0.99 && dz > -0.15;
        if (isChainLike) {
          hex = WAR_OBITO_COLORS.hairBlack;
        } else if (yBody > 0.90) {
          hex = WAR_OBITO_COLORS.gunbaiGrip;
        } else if (yBody > 0.72 && Math.abs(dx + 0.04) < 0.045) {
          hex = WAR_OBITO_COLORS.gunbaiHandle;
        } else if (
          Math.abs(dz + 0.19) > 0.065 ||
          Math.abs(dx) > 0.27 ||
          yBody < 0.24
        ) {
          hex = WAR_OBITO_COLORS.gunbaiRim;
        } else {
          hex = WAR_OBITO_COLORS.gunbaiFace;
        }
      } else if (boneRole === 'hair') {
        hex = WAR_OBITO_COLORS.hairBlack;
      } else if (boneRole === 'head' || yBody >= neckYNorm + 0.022) {
        // Head: White Rinnegan Mask on front, charcoal hair & trailing straps on back/top/sides
        const isFrontMask = dz > 0.018 && absX <= 0.115 && yBody <= 0.968;
        const isUnderChinNeck = yBody < neckYNorm + 0.042 && radialXZ < 0.082 && dz < 0.075;
        if (isUnderChinNeck) {
          hex = WAR_OBITO_COLORS.undershirtCharcoal;
        } else if (!isFrontMask) {
          hex = WAR_OBITO_COLORS.hairBlack;
        } else {
          hex = WAR_OBITO_COLORS.maskWhite;
          // Eye sockets: viewer's left (dx < 0) = Sharingan crimson; viewer's right (dx > 0) = Rinnegan violet
          if (dz > 0.052) {
            const leftEyeDist = Math.hypot((dx + 0.035) * 1.15, (yBody - headEyeY) * 1.9);
            const rightEyeDist = Math.hypot((dx - 0.035) * 1.15, (yBody - headEyeY) * 1.9);
            const eyeRadius = hasDenseFaceVerts ? 0.018 : 0.024;
            if (leftEyeDist < eyeRadius) {
              hex = WAR_OBITO_COLORS.eyeSharingan;
            } else if (rightEyeDist < eyeRadius) {
              hex = WAR_OBITO_COLORS.eyeRinnegan;
            } else if (hasDenseFaceVerts) {
              // Subtle concentric spiral lines on the mask
              const bridgeDist = Math.hypot(dx, (yBody - (headEyeY - 0.008)) * 1.45);
              if (
                Math.abs(bridgeDist - 0.011) < 0.0028 ||
                Math.abs(bridgeDist - 0.047) < 0.0028
              ) {
                maskSpiralFactor = 0.55;
              }
            }
          }
        }
      } else if (boneRole === 'toe' || boneRole === 'foot' || yBody < ankleYNorm) {
        // Shinobi sandals + exposed warm peach toes on front tip
        const isToeTip = dz > 0.054 && yBody < Math.max(0.036, ankleYNorm * 0.56);
        hex = isToeTip ? WAR_OBITO_COLORS.skinPeach : WAR_OBITO_COLORS.sandalCharcoal;
      } else if (boneRole === 'hand') {
        // Warm peach hands (with subtle dark wrist strap right at forearm boundary)
        hex = WAR_OBITO_COLORS.skinPeach;
      } else if (boneRole === 'arm' || (yBody > 0.40 && yBody < neckYNorm + 0.02 && absX > torsoHalfX)) {
        // Wide sleeves in deep navy-indigo + khaki inner cuff trim near wrist
        const cuffThreshold = Math.max(0.28, maxArmAbsX - 0.075);
        const isCuffRim = absX >= cuffThreshold && (dotOutward < -0.15 || (_n.y < -0.35 && absX >= cuffThreshold + 0.02));
        hex = isCuffRim ? WAR_OBITO_COLORS.liningKhaki : WAR_OBITO_COLORS.robeIndigo;
      } else if (
        boneRole === 'shin' ||
        ((boneRole === 'unknown' || boneRole === 'thigh') && yBody >= ankleYNorm && yBody < kneeYNorm - 0.022)
      ) {
        // Off-white shin wraps / gaiters below knee, dark charcoal pants at upper knee
        if (yBody >= kneeYNorm - 0.032) {
          hex = WAR_OBITO_COLORS.pantsCharcoal;
        } else {
          hex = WAR_OBITO_COLORS.shinWrapWhite;
        }
      } else if (boneRole === 'neck' || yBody >= neckYNorm - 0.055) {
        // High collar (navy-indigo exterior, khaki inner lining/rim) + dark charcoal undershirt throat
        const isInnerThroat = radialXZ < 0.078 && yBody >= neckYNorm - 0.015;
        const isCollarLining =
          !isInnerThroat &&
          yBody >= neckYNorm - 0.032 &&
          (yBody >= neckYNorm - 0.002 || dotOutward < -0.2);
        if (isInnerThroat) {
          hex = WAR_OBITO_COLORS.undershirtCharcoal;
        } else if (isCollarLining) {
          hex = WAR_OBITO_COLORS.liningKhaki;
        } else {
          hex = WAR_OBITO_COLORS.robeIndigo;
        }
      } else if (yBody >= beltLow && yBody <= beltHigh) {
        // Waist sash (Obi): pale off-white, muted lavender center band, cool silver-grey buckle
        if (dz > 0.045 && absX < 0.044 && Math.abs(yBody - beltMid) <= 0.023) {
          hex = WAR_OBITO_COLORS.beltBuckle;
        } else if (Math.abs(yBody - beltMid) <= 0.014) {
          hex = WAR_OBITO_COLORS.beltLavender;
        } else {
          hex = WAR_OBITO_COLORS.beltWhite;
        }
      } else if (yBody < beltLow) {
        // Lower flared coat skirt & front-slit charcoal pants + khaki lining/hem trim
        const skirtSpan = Math.max(0.14, beltLow - kneeYNorm);
        const tDown = THREE.MathUtils.clamp((beltLow - yBody) / skirtSpan, 0, 1);
        const slitHalfWidth = 0.018 + tDown * 0.125;

        if (dz > -0.01 && absX < slitHalfWidth) {
          hex = WAR_OBITO_COLORS.pantsCharcoal;
        } else if (
          (dz > -0.01 && Math.abs(absX - slitHalfWidth) < 0.021) ||
          (yBody <= kneeYNorm + 0.014 && yBody >= kneeYNorm - 0.02)
        ) {
          hex = WAR_OBITO_COLORS.liningKhaki;
        } else if (dotOutward < -0.28) {
          hex = WAR_OBITO_COLORS.liningKhaki;
        } else {
          hex = WAR_OBITO_COLORS.robeIndigo;
        }
      } else {
        // Upper torso outer robe
        hex = WAR_OBITO_COLORS.robeIndigo;
      }

      _color.setHex(hex);
      if (maskSpiralFactor > 0) {
        _color.lerp(_lineColor, maskSpiralFactor);
      }

      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    for (const mat of mats) {
      if (!mat) continue;
      mat.vertexColors = true;

      if ('color' in mat && (mat as THREE.MeshStandardMaterial).color) {
        (mat as THREE.MeshStandardMaterial).color.setHex(0xffffff);
      }
      if ('map' in mat) {
        (mat as THREE.MeshStandardMaterial).map = null;
      }
      if ('emissive' in mat && (mat as THREE.MeshStandardMaterial).emissive) {
        (mat as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
      if ('roughness' in mat) {
        (mat as THREE.MeshStandardMaterial).roughness = 0.76;
      }
      if ('metalness' in mat) {
        (mat as THREE.MeshStandardMaterial).metalness = 0.04;
      }
      if ('envMapIntensity' in mat) {
        (mat as THREE.MeshStandardMaterial).envMapIntensity = 0.45;
      }
      if ('shininess' in mat) {
        (mat as THREE.MeshPhongMaterial).shininess = 12;
      }
      if ('specular' in mat && (mat as THREE.MeshPhongMaterial).specular) {
        (mat as THREE.MeshPhongMaterial).specular.setHex(0x1b1e2b);
      }

      mat.needsUpdate = true;
    }
  }
}
