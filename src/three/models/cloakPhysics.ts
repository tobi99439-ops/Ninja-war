import * as THREE from 'three';
import { CharacterBones } from './gltfObitoLoader';

type CloakPanelSide = 'front' | 'back' | 'side_left' | 'side_right';

interface CloakBoneNode {
  bone: THREE.Bone;
  parent: THREE.Object3D;
  childBone: THREE.Bone | null;
  restLocalQuat: THREE.Quaternion;
  restDirInParent: THREE.Vector3;
  restBoneLengthLocal: number;
  depthIndex: number;
  chainLength: number;
  panelSide: CloakPanelSide;
  lateralSign: number; // +1 for character Left (+X), -1 for character Right (-X)
  restRootAbsX: number;
  restTipAbsX: number;
  outwardDirChar: THREE.Vector3; // Horizontal outward unit vector in character local space
  phaseSeed: number;
  tipWorldPos: THREE.Vector3;
  tipWorldVel: THREE.Vector3;
  initialized: boolean;
  stiffness: number;
  damping: number;
  maxSwingAngle: number;
  smoothedLocalQuat: THREE.Quaternion;
}

interface CloakChain {
  nodes: CloakBoneNode[];
  panelSide: CloakPanelSide;
  lateralSign: number;
}

interface LegCapsule {
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
}

interface LegSphere {
  center: THREE.Vector3;
  radius: number;
}

interface FallbackClothUniforms {
  uCloakSpeed: { value: number };
  uCloakTime: { value: number };
  uCloakVertVel: { value: number };
  uCloakTurn: { value: number };
  uLegPushL: { value: number };
  uLegPushR: { value: number };
}

export interface CloakPhysicsSolver {
  solve: (
    dt: number,
    elapsed: number,
    worldVelX: number,
    worldVelY: number,
    worldVelZ: number,
    yawRate: number
  ) => void;
  reset: () => void;
  hasBoneChains: boolean;
}

// Pre-allocated module-scope scratch math helpers (zero GC inside animation tick)
const _rootWorldPos = new THREE.Vector3();
const _rootWorldQuat = new THREE.Quaternion();
const _rootWorldQuatInv = new THREE.Quaternion();
const _rootWorldScale = new THREE.Vector3();
const _hipsWorldPos = new THREE.Vector3();
const _charFwd = new THREE.Vector3();
const _charRight = new THREE.Vector3();
const _charUp = new THREE.Vector3(0, 1, 0);
const _worldVelVec = new THREE.Vector3();
const _horizVelDir = new THREE.Vector3();
const _parentWorldQuat = new THREE.Quaternion();
const _parentWorldQuatInv = new THREE.Quaternion();
const _parentWorldScale = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();
const _childWorldPos = new THREE.Vector3();
const _restDirWorld = new THREE.Vector3();
const _restTipWorld = new THREE.Vector3();
const _restTipLocal = new THREE.Vector3();
const _targetTipWorld = new THREE.Vector3();
const _outwardWorld = new THREE.Vector3();
const _springForce = new THREE.Vector3();
const _segVec = new THREE.Vector3();
const _desiredDirWorld = new THREE.Vector3();
const _desiredDirParent = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _axisScratch = new THREE.Vector3();
const _closestPt = new THREE.Vector3();
const _pushVec = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _midPt = new THREE.Vector3();
const _localTip = new THREE.Vector3();
const _thighL = new THREE.Vector3();
const _shinL = new THREE.Vector3();
const _footL = new THREE.Vector3();
const _thighR = new THREE.Vector3();
const _shinR = new THREE.Vector3();
const _footR = new THREE.Vector3();
const _samplePt = new THREE.Vector3();
const _targetLocalQuat = new THREE.Quaternion();
const _kneeApexL = new THREE.Vector3();
const _kneeApexR = new THREE.Vector3();
const _thighDirL = new THREE.Vector3();
const _shinDirL = new THREE.Vector3();
const _thighDirR = new THREE.Vector3();
const _shinDirR = new THREE.Vector3();
const _kneeFwdL = new THREE.Vector3();
const _kneeFwdR = new THREE.Vector3();

const CLOAK_BONE_REGEX =
  /cape|cloak|skirt|coat|robe|cloth|flap|hem|mantle|tasset|sash|haori|hakama|apron|coattail|tail_coat|lower_wear/i;
const EXCLUDED_BONE_REGEX =
  /collar|neck|hair|eye|brow|lip|cheek|jaw|mouth|tongue|teeth|head|hand|finger|thumb|index|middle|ring|pinky|arm|shoulder|sleeve|weapon|knife|gunbai|foot|toe|upleg|legbend|^leftleg$|^rightleg$/i;

function isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D | null): boolean {
  if (!ancestor) return false;
  let cur: THREE.Object3D | null = node.parent;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  out: THREE.Vector3
): THREE.Vector3 {
  _ab.subVectors(b, a);
  const lenSq = _ab.lengthSq();
  if (lenSq < 1e-8) {
    return out.copy(a);
  }
  _ap.subVectors(p, a);
  const t = THREE.MathUtils.clamp(_ap.dot(_ab) / lenSq, 0, 1);
  return out.copy(a).addScaledVector(_ab, t);
}

function pushPointOutOfCapsule(
  point: THREE.Vector3,
  cap: LegCapsule,
  panelSide: CloakPanelSide,
  outwardWorld: THREE.Vector3
): boolean {
  closestPointOnSegment(point, cap.a, cap.b, _closestPt);
  _pushVec.subVectors(point, _closestPt);
  const distSq = _pushVec.lengthSq();
  const r = cap.radius;
  if (distSq >= r * r) return false;

  const dist = Math.sqrt(Math.max(distSq, 1e-8));
  if (dist > 0.002) {
    _pushVec.divideScalar(dist);
    // Allow natural 3D vertical deflection so panels glide cleanly over moving thighs and raised knees
    const dotOut = _pushVec.dot(outwardWorld);
    if (dotOut < 0.35) {
      const biasWeight = panelSide === 'back' ? 0.88 : panelSide === 'front' ? 0.82 : 0.78;
      _pushVec.lerp(outwardWorld, biasWeight).normalize();
    }
  } else {
    _pushVec.copy(outwardWorld);
  }

  const targetDist = r + 0.016;
  point.copy(_closestPt).addScaledVector(_pushVec, targetDist);
  return true;
}

function pushPointOutOfSphere(
  point: THREE.Vector3,
  sphere: LegSphere,
  panelSide: CloakPanelSide,
  outwardWorld: THREE.Vector3
): boolean {
  _pushVec.subVectors(point, sphere.center);
  const distSq = _pushVec.lengthSq();
  const r = sphere.radius;
  if (distSq >= r * r) return false;

  const dist = Math.sqrt(Math.max(distSq, 1e-8));
  if (dist > 0.002) {
    _pushVec.divideScalar(dist);
    const dotOut = _pushVec.dot(outwardWorld);
    if (dotOut < 0.35) {
      const biasWeight = panelSide === 'back' ? 0.88 : panelSide === 'front' ? 0.82 : 0.78;
      _pushVec.lerp(outwardWorld, biasWeight).normalize();
    }
  } else {
    _pushVec.copy(outwardWorld);
  }

  const targetDist = r + 0.018;
  point.copy(sphere.center).addScaledVector(_pushVec, targetDist);
  return true;
}

/**
 * Lightweight GPU vertex billow & outward skirt flare fallback for characters whose
 * lower cloak/coat mesh has no dedicated skeletal skirt bones.
 */
function installFallbackVertexCloakShader(
  pivotGroup: THREE.Object3D,
  bones: CharacterBones
): FallbackClothUniforms | null {
  pivotGroup.updateMatrixWorld(true);
  pivotGroup.getWorldPosition(_rootWorldPos);
  pivotGroup.getWorldScale(_rootWorldScale);
  const charScale = Math.max(0.05, _rootWorldScale.y || 1);

  let hipsLocalY = 0.9;
  if (bones.hips) {
    bones.hips.getWorldPosition(_hipsWorldPos);
    hipsLocalY = (_hipsWorldPos.y - _rootWorldPos.y) / charScale;
  }

  const uniforms: FallbackClothUniforms = {
    uCloakSpeed: { value: 0 },
    uCloakTime: { value: 0 },
    uCloakVertVel: { value: 0 },
    uCloakTurn: { value: 0 },
    uLegPushL: { value: 0 },
    uLegPushR: { value: 0 },
  };

  let patchedAny = false;
  const processedMats = new Set<THREE.Material>();

  pivotGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const lowerName = (mesh.name || '').toLowerCase();
    // Skip obvious non-cloth parts like weapons, eyes, hair, mask, face
    if (/weapon|gunbai|mask|eye|hair|teeth|tongue|face|head|hand/i.test(lowerName)) return;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (processedMats.has(mat)) continue;
      if (
        !(mat instanceof THREE.MeshStandardMaterial) &&
        !(mat instanceof THREE.MeshPhysicalMaterial)
      ) {
        continue;
      }
      if (mat.userData.__cloakVertexFallbackInstalled) continue;
      processedMats.add(mat);
      mat.userData.__cloakVertexFallbackInstalled = true;

      const prevOnBeforeCompile = mat.onBeforeCompile;
      const minY = Math.max(0.08, hipsLocalY * 0.14);
      const maxY = Math.max(minY + 0.25, hipsLocalY * 0.96);

      mat.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) {
          prevOnBeforeCompile(shader, renderer);
        }
        shader.uniforms.uCloakSpeed = uniforms.uCloakSpeed;
        shader.uniforms.uCloakTime = uniforms.uCloakTime;
        shader.uniforms.uCloakVertVel = uniforms.uCloakVertVel;
        shader.uniforms.uCloakTurn = uniforms.uCloakTurn;
        shader.uniforms.uLegPushL = uniforms.uLegPushL;
        shader.uniforms.uLegPushR = uniforms.uLegPushR;

        shader.vertexShader =
          `uniform float uCloakSpeed;\n` +
          `uniform float uCloakTime;\n` +
          `uniform float uCloakVertVel;\n` +
          `uniform float uCloakTurn;\n` +
          `uniform float uLegPushL;\n` +
          `uniform float uLegPushR;\n` +
          shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            // Directional lower-hem outward flare, back-only wind trail & thigh clearance push
            float cloakZone = (1.0 - smoothstep(${minY.toFixed(3)}, ${maxY.toFixed(3)}, transformed.y))
              * smoothstep(0.05, ${(minY + 0.08).toFixed(3)}, transformed.y);
            float radialDist = length(transformed.xz);
            float outerShell = smoothstep(0.115, 0.23, radialDist);
            float hemMask = cloakZone * outerShell;
            if (hemMask > 0.001) {
              vec2 outXZ = radialDist > 0.0001 ? normalize(transformed.xz) : vec2(0.0, -1.0);
              float rearMask = smoothstep(0.06, -0.09, transformed.z);
              float frontMask = smoothstep(-0.04, 0.09, transformed.z);
              float legLift = transformed.x >= 0.0 ? uLegPushL : uLegPushR;
              float wave = sin(uCloakTime * (8.5 + uCloakSpeed * 6.5) + transformed.x * 7.5 + transformed.y * 5.0);
              float flareAmt = hemMask * (0.022 + uCloakSpeed * 0.072 + abs(uCloakTurn) * 0.012 + frontMask * legLift * 0.11);
              float backAmt = hemMask * rearMask * (uCloakSpeed * 0.095 + max(0.0, -uCloakVertVel) * 0.014);
              transformed.xz += outXZ * flareAmt;
              transformed.z -= backAmt;
              transformed.z += hemMask * frontMask * legLift * 0.075;
              transformed.x += (wave * (0.006 + uCloakSpeed * 0.026) + uCloakTurn * 0.042) * hemMask;
              transformed.y += max(0.0, -uCloakVertVel) * 0.018 * hemMask;
            }
          }`
        );
      };
      mat.customProgramCacheKey = () => `shinobi_cloak_fallback_v3_${minY.toFixed(2)}_${maxY.toFixed(2)}`;
      mat.needsUpdate = true;
      patchedAny = true;
    }
  });

  return patchedAny ? uniforms : null;
}

/**
 * Universal real-time Spring-Bone Cloak / Robe Physics & Leg-Capsule Collision Solver.
 *
 * Solves connected robe chains in cohesive order (back -> side -> front) so:
 * - L/R rear halves stay symmetric across the spine seam without twisting or crossing X=0
 * - Rear cloak keeps its natural lateral width and never pushes sideways through side flaps
 * - Side flaps stay outside the rear edges and ahead of the back hem in Z
 * - Front flaps part cleanly around legs while staying ahead of side flaps
 */
export function createCloakPhysicsSolver(
  pivotGroup: THREE.Object3D,
  bones: CharacterBones,
  baseBoneRotations?: Map<THREE.Bone, THREE.Euler>
): CloakPhysicsSolver | null {
  if (!bones.hips) return null;

  // Save current transforms and restore clean rest bind pose while measuring chain rest axes
  const savedQuats = new Map<THREE.Bone, THREE.Quaternion>();
  pivotGroup.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      const b = o as THREE.Bone;
      savedQuats.set(b, b.quaternion.clone());
      const restEuler = baseBoneRotations?.get(b);
      if (restEuler) {
        b.rotation.copy(restEuler);
      }
    }
  });
  const savedPivotRot = pivotGroup.rotation.clone();
  pivotGroup.rotation.set(0, 0, 0);
  pivotGroup.updateMatrixWorld(true);

  pivotGroup.getWorldQuaternion(_rootWorldQuat);
  _rootWorldQuatInv.copy(_rootWorldQuat).invert();
  pivotGroup.getWorldScale(_rootWorldScale);
  const bindCharScale = Math.max(0.05, _rootWorldScale.y || 1);
  bones.hips.getWorldPosition(_hipsWorldPos);

  // Discover all candidate lower cloak/skirt/coat bones under the character skeleton
  const matchedBones = new Set<THREE.Bone>();
  pivotGroup.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const bone = o as THREE.Bone;
    if (EXCLUDED_BONE_REGEX.test(bone.name)) return;
    if (!CLOAK_BONE_REGEX.test(bone.name)) return;
    // Only include bones rooted at or below Hips / Spine (ignore head/neck accessories)
    if (
      bone === bones.hips ||
      (!isDescendantOf(bone, bones.hips) && !isDescendantOf(bone, bones.spine))
    ) {
      return;
    }
    matchedBones.add(bone);
  });

  // Identify chain root bones (matched bones whose parent is NOT a matched cloak bone)
  const rootBones: THREE.Bone[] = [];
  for (const bone of matchedBones) {
    if (!bone.parent || !matchedBones.has(bone.parent as THREE.Bone)) {
      rootBones.push(bone);
    }
  }
  rootBones.sort((a, b) => a.name.localeCompare(b.name));

  const chains: CloakChain[] = [];
  let chainSeedIndex = 0;

  for (const rootBone of rootBones) {
    // Walk down primary bone chain (root -> child -> grandchild)
    const chainBones: THREE.Bone[] = [];
    let cur: THREE.Bone | null = rootBone;
    let guard = 0;
    while (cur && guard < 8) {
      chainBones.push(cur);
      const boneChildren = cur.children.filter((c) => (c as THREE.Bone).isBone) as THREE.Bone[];
      const nextCloak = boneChildren.find((c) => matchedBones.has(c)) ?? boneChildren[0] ?? null;
      cur = nextCloak;
      guard++;
    }

    if (chainBones.length === 0) continue;

    // Classify panel position in character-local space relative to Hips
    rootBone.getWorldPosition(_headWorldPos);
    const relRoot = _headWorldPos
      .clone()
      .sub(_hipsWorldPos)
      .divideScalar(bindCharScale)
      .applyQuaternion(_rootWorldQuatInv);

    const lowerName = rootBone.name.toLowerCase();
    let panelSide: CloakPanelSide;
    if (/front/i.test(lowerName)) {
      panelSide = 'front';
    } else if (/back|rear/i.test(lowerName)) {
      panelSide = 'back';
    } else if (/side/i.test(lowerName)) {
      panelSide = relRoot.x >= 0 ? 'side_left' : 'side_right';
    } else if (relRoot.z > 0.05) {
      panelSide = 'front';
    } else if (relRoot.z < -0.05) {
      panelSide = 'back';
    } else {
      panelSide = relRoot.x >= 0 ? 'side_left' : 'side_right';
    }

    const lateralSign =
      /^l_/i.test(lowerName) || /_l(?:_|$)|left/i.test(lowerName)
        ? 1
        : /^r_/i.test(lowerName) || /_r(?:_|$)|right/i.test(lowerName)
          ? -1
          : relRoot.x >= 0
            ? 1
            : -1;
    const restRootAbsX = Math.abs(relRoot.x);

    // Outward push normals aligned strictly along radial skirt normals so stitched seams never shear
    const outwardDirChar = new THREE.Vector3();
    if (panelSide === 'back') {
      // Back halves push straight backward (-Z) with almost zero X drift so they stay inside side flaps & symmetric at X=0
      outwardDirChar.set(lateralSign * 0.06, 0, -0.998).normalize();
    } else if (panelSide === 'front') {
      // Front halves part gently forward-outward around thighs without colliding backward into side flaps
      outwardDirChar.set(lateralSign * 0.45, 0, 0.89).normalize();
    } else {
      // Side flaps flare primarily outward (+/-X) with a very mild rear trail to stay aligned with the back seam
      outwardDirChar.set(lateralSign * 0.94, 0, -0.34).normalize();
    }

    const nodes: CloakBoneNode[] = [];
    const totalLen = chainBones.length;
    const isOrphanSingleSkirtBone = totalLen === 1 && /__skirt__/i.test(rootBone.name);

    for (let i = 0; i < totalLen; i++) {
      const bone = chainBones[i];
      const parent = bone.parent;
      if (!parent) continue;
      const childBone = i + 1 < totalLen ? chainBones[i + 1] : null;

      bone.getWorldPosition(_headWorldPos);
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(_parentWorldQuat);
      _parentWorldQuatInv.copy(_parentWorldQuat).invert();
      parent.getWorldScale(_parentWorldScale);
      const parentScaleAvg = Math.max(
        1e-4,
        (Math.abs(_parentWorldScale.x) +
          Math.abs(_parentWorldScale.y) +
          Math.abs(_parentWorldScale.z)) /
          3
      );

      let restDirWorld = new THREE.Vector3();
      let segLenWorld = 0.22 * bindCharScale;

      if (childBone) {
        childBone.getWorldPosition(_childWorldPos);
        restDirWorld.subVectors(_childWorldPos, _headWorldPos);
        const len = restDirWorld.length();
        if (len > 1e-4) {
          segLenWorld = len;
          restDirWorld.divideScalar(len);
        } else {
          restDirWorld.set(0, -1, 0);
        }
      } else if (i > 0) {
        // Leaf cape tip bone: extend smoothly along previous segment direction
        const prevBone = chainBones[i - 1];
        prevBone.getWorldPosition(_childWorldPos);
        restDirWorld.subVectors(_headWorldPos, _childWorldPos);
        const len = restDirWorld.length();
        if (len > 1e-4) {
          segLenWorld = Math.max(0.14 * bindCharScale, len * 0.72);
          restDirWorld.divideScalar(len);
        } else {
          restDirWorld.set(0, -1, 0);
        }
      } else {
        // Single-bone skirt helper: keep tightly anchored to bind pose
        restDirWorld
          .set(outwardDirChar.x * 0.08, -0.996, outwardDirChar.z * 0.08)
          .applyQuaternion(_rootWorldQuat)
          .normalize();
      }

      const restDirInParent = restDirWorld.clone().applyQuaternion(_parentWorldQuatInv).normalize();
      const restBoneLengthLocal = segLenWorld / parentScaleAvg;
      const restEuler = baseBoneRotations?.get(bone);
      const restLocalQuat = restEuler
        ? new THREE.Quaternion().setFromEuler(restEuler)
        : bone.quaternion.clone();

      const restTipChar = _headWorldPos
        .clone()
        .addScaledVector(restDirWorld, segLenWorld)
        .sub(_hipsWorldPos)
        .divideScalar(bindCharScale)
        .applyQuaternion(_rootWorldQuatInv);
      const restTipAbsX = Math.abs(restTipChar.x);

      // Synchronize phase across left/right back halves so the rear seam billows as one sheet
      const syncedSeed =
        panelSide === 'back'
          ? i * 0.65
          : panelSide === 'side_left' || panelSide === 'side_right'
            ? 0.9 + i * 0.65
            : chainSeedIndex * 0.85 + i * 0.55;
      const depthRatio = totalLen > 1 ? i / (totalLen - 1) : 1;

      const chainScaleLimit = totalLen >= 4 ? 0.78 : totalLen === 3 ? 0.88 : 1.0;
      const baseMaxSwing = isOrphanSingleSkirtBone
        ? 0.14
        : i === 0
          ? 0.56 * chainScaleLimit
          : THREE.MathUtils.lerp(0.42, 0.58, depthRatio) * chainScaleLimit;

      nodes.push({
        bone,
        parent,
        childBone,
        restLocalQuat,
        restDirInParent,
        restBoneLengthLocal,
        depthIndex: i,
        chainLength: totalLen,
        panelSide,
        lateralSign,
        restRootAbsX,
        restTipAbsX,
        outwardDirChar: outwardDirChar.clone(),
        phaseSeed: syncedSeed,
        tipWorldPos: _headWorldPos.clone().addScaledVector(restDirWorld, segLenWorld),
        tipWorldVel: new THREE.Vector3(),
        initialized: false,
        stiffness: isOrphanSingleSkirtBone ? 260 : THREE.MathUtils.lerp(132, 92, depthRatio),
        damping: isOrphanSingleSkirtBone ? 28 : THREE.MathUtils.lerp(19.5, 14.5, depthRatio),
        maxSwingAngle: baseMaxSwing,
        smoothedLocalQuat: restLocalQuat.clone(),
      });
    }

    if (nodes.length > 0) {
      chains.push({ nodes, panelSide, lateralSign });
      chainSeedIndex++;
    }
  }

  // Solve back -> side -> front so outer/forward flaps maintain clean geometric separation from rear flaps
  const panelOrder = (side: CloakPanelSide) =>
    side === 'back' ? 0 : side === 'side_left' || side === 'side_right' ? 1 : 2;
  chains.sort((a, b) => panelOrder(a.panelSide) - panelOrder(b.panelSide));

  // Restore original rig transforms after bind measurement
  pivotGroup.rotation.copy(savedPivotRot);
  for (const [b, q] of savedQuats) {
    b.quaternion.copy(q);
  }
  pivotGroup.updateMatrixWorld(true);

  const hasBoneChains = chains.length > 0;
  const fallbackUniforms = !hasBoneChains ? installFallbackVertexCloakShader(pivotGroup, bones) : null;

  if (!hasBoneChains && !fallbackUniforms) {
    return null;
  }

  // Pre-allocated leg capsules and knee spheres (zero GC per frame; generous thigh/knee/shin clearance)
  const legCapsules: LegCapsule[] = [
    { a: _thighL, b: _shinL, radius: 0.165 },
    { a: _shinL, b: _footL, radius: 0.140 },
    { a: _thighR, b: _shinR, radius: 0.165 },
    { a: _shinR, b: _footR, radius: 0.140 },
  ];
  const legSpheres: LegSphere[] = [
    { center: _kneeApexL, radius: 0.165 },
    { center: _kneeApexR, radius: 0.165 },
  ];

  let smoothedSpeedRatio = 0;
  let smoothedVertVel = 0;
  let smoothedYawRate = 0;

  const reset = () => {
    smoothedSpeedRatio = 0;
    smoothedVertVel = 0;
    smoothedYawRate = 0;
    for (let c = 0; c < chains.length; c++) {
      const nodes = chains[c].nodes;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.bone.quaternion.copy(node.restLocalQuat);
        node.smoothedLocalQuat.copy(node.restLocalQuat);
        node.tipWorldVel.set(0, 0, 0);
        node.initialized = false;
      }
    }
    if (fallbackUniforms) {
      fallbackUniforms.uCloakSpeed.value = 0;
      fallbackUniforms.uCloakVertVel.value = 0;
      fallbackUniforms.uCloakTurn.value = 0;
      fallbackUniforms.uLegPushL.value = 0;
      fallbackUniforms.uLegPushR.value = 0;
    }
  };

  const solve = (
    dt: number,
    elapsed: number,
    worldVelX: number,
    worldVelY: number,
    worldVelZ: number,
    yawRate: number
  ) => {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.036);
    const horizSpeed = Math.hypot(worldVelX, worldVelZ);
    const rawSpeedRatio = THREE.MathUtils.clamp(horizSpeed / 11.0, 0, 1.3);

    smoothedSpeedRatio = THREE.MathUtils.damp(smoothedSpeedRatio, rawSpeedRatio, 10, safeDt);
    smoothedVertVel = THREE.MathUtils.damp(
      smoothedVertVel,
      THREE.MathUtils.clamp(worldVelY, -14, 14),
      10,
      safeDt
    );
    smoothedYawRate = THREE.MathUtils.damp(
      smoothedYawRate,
      THREE.MathUtils.clamp(yawRate, -8, 8),
      10,
      safeDt
    );

    if (fallbackUniforms) {
      fallbackUniforms.uCloakSpeed.value = smoothedSpeedRatio;
      fallbackUniforms.uCloakTime.value = elapsed;
      fallbackUniforms.uCloakVertVel.value = smoothedVertVel;
      fallbackUniforms.uCloakTurn.value = smoothedYawRate;
      if (bones.leftThigh && bones.leftShin && bones.rightThigh && bones.rightShin) {
        pivotGroup.getWorldQuaternion(_rootWorldQuat);
        _charFwd.set(0, 0, 1).applyQuaternion(_rootWorldQuat);
        _charFwd.y = 0;
        if (_charFwd.lengthSq() > 1e-6) _charFwd.normalize();
        else _charFwd.set(0, 0, 1);

        bones.leftThigh.getWorldPosition(_thighL);
        bones.leftShin.getWorldPosition(_shinL);
        _thighDirL.subVectors(_shinL, _thighL).normalize();
        const pushL = THREE.MathUtils.clamp(_thighDirL.dot(_charFwd) * 1.4, 0, 1);
        fallbackUniforms.uLegPushL.value = THREE.MathUtils.damp(fallbackUniforms.uLegPushL.value, pushL, 18, safeDt);

        bones.rightThigh.getWorldPosition(_thighR);
        bones.rightShin.getWorldPosition(_shinR);
        _thighDirR.subVectors(_shinR, _thighR).normalize();
        const pushR = THREE.MathUtils.clamp(_thighDirR.dot(_charFwd) * 1.4, 0, 1);
        fallbackUniforms.uLegPushR.value = THREE.MathUtils.damp(fallbackUniforms.uLegPushR.value, pushR, 18, safeDt);
      }
      if (!hasBoneChains) return;
    }

    // 1. Reset cloak chains to clean rest orientation
    for (let c = 0; c < chains.length; c++) {
      const nodes = chains[c].nodes;
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].bone.quaternion.copy(nodes[i].restLocalQuat);
      }
    }

    pivotGroup.updateMatrixWorld(true);
    pivotGroup.getWorldQuaternion(_rootWorldQuat);
    _rootWorldQuatInv.copy(_rootWorldQuat).invert();
    pivotGroup.getWorldScale(_rootWorldScale);
    const charScale = Math.max(0.05, _rootWorldScale.y || 1);

    _charFwd.set(0, 0, 1).applyQuaternion(_rootWorldQuat);
    _charFwd.y = 0;
    if (_charFwd.lengthSq() > 1e-6) {
      _charFwd.normalize();
    } else {
      _charFwd.set(0, 0, 1);
    }
    _charRight.crossVectors(_charUp, _charFwd).normalize(); // Character local +X (left side)

    _worldVelVec.set(worldVelX, 0, worldVelZ);
    if (horizSpeed > 0.25) {
      _horizVelDir.copy(_worldVelVec).divideScalar(horizSpeed);
    } else {
      _horizVelDir.copy(_charFwd);
    }

    if (bones.hips) {
      bones.hips.getWorldPosition(_hipsWorldPos);
    } else {
      pivotGroup.getWorldPosition(_hipsWorldPos);
    }

    // 2. Build live dual-leg capsules and knee spheres in world space
    let hasLeftLeg = false;
    let hasLeftShin = false;
    let hasRightLeg = false;
    let hasRightShin = false;

    if (bones.leftThigh && bones.leftShin) {
      bones.leftThigh.getWorldPosition(_thighL);
      bones.leftShin.getWorldPosition(_shinL);
      hasLeftLeg = true;
      if (bones.leftFoot) {
        bones.leftFoot.getWorldPosition(_footL);
        hasLeftShin = true;
      } else {
        _footL.subVectors(_shinL, _thighL).add(_shinL);
        hasLeftShin = true;
      }
      _thighDirL.subVectors(_shinL, _thighL).normalize();
      _shinDirL.subVectors(_footL, _shinL).normalize();
      _kneeFwdL.addVectors(_thighDirL, _shinDirL).negate();
      if (_kneeFwdL.lengthSq() > 1e-4) {
        _kneeFwdL.normalize();
      } else {
        _kneeFwdL.copy(_charFwd);
      }
      _kneeApexL.copy(_shinL).addScaledVector(_kneeFwdL, 0.038 * charScale);

      legCapsules[0].radius = 0.165 * charScale;
      legCapsules[1].radius = 0.140 * charScale;
      legSpheres[0].radius = 0.165 * charScale;
    }

    if (bones.rightThigh && bones.rightShin) {
      bones.rightThigh.getWorldPosition(_thighR);
      bones.rightShin.getWorldPosition(_shinR);
      hasRightLeg = true;
      if (bones.rightFoot) {
        bones.rightFoot.getWorldPosition(_footR);
        hasRightShin = true;
      } else {
        _footR.subVectors(_shinR, _thighR).add(_shinR);
        hasRightShin = true;
      }
      _thighDirR.subVectors(_shinR, _thighR).normalize();
      _shinDirR.subVectors(_footR, _shinR).normalize();
      _kneeFwdR.addVectors(_thighDirR, _shinDirR).negate();
      if (_kneeFwdR.lengthSq() > 1e-4) {
        _kneeFwdR.normalize();
      } else {
        _kneeFwdR.copy(_charFwd);
      }
      _kneeApexR.copy(_shinR).addScaledVector(_kneeFwdR, 0.038 * charScale);

      legCapsules[2].radius = 0.165 * charScale;
      legCapsules[3].radius = 0.140 * charScale;
      legSpheres[1].radius = 0.165 * charScale;
    }

    // Track per-side back/side hem Z & Y per frame so stitched panels maintain cohesive ordering
    let leftBackTipZ = -0.35 * charScale;
    let rightBackTipZ = -0.35 * charScale;
    let leftBackTipY = -0.35 * charScale;
    let rightBackTipY = -0.35 * charScale;
    let leftSideTipZ = -0.15 * charScale;
    let rightSideTipZ = -0.15 * charScale;
    let hasLeftBack = false;
    let hasRightBack = false;
    let hasLeftSide = false;
    let hasRightSide = false;

    // 3. Solve each cloak chain from waist hinge down to hem tip (ordered: back -> side -> front)
    for (let c = 0; c < chains.length; c++) {
      const chain = chains[c];
      const nodes = chain.nodes;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.parent.updateWorldMatrix(true, false);
        node.parent.getWorldQuaternion(_parentWorldQuat);
        _parentWorldQuatInv.copy(_parentWorldQuat).invert();
        node.parent.getWorldScale(_parentWorldScale);
        const parentScaleAvg = Math.max(
          1e-4,
          (Math.abs(_parentWorldScale.x) +
            Math.abs(_parentWorldScale.y) +
            Math.abs(_parentWorldScale.z)) /
            3
        );
        const worldLen = Math.max(0.04, node.restBoneLengthLocal * parentScaleAvg);

        node.bone.updateWorldMatrix(true, false);
        node.bone.getWorldPosition(_headWorldPos);

        // Current-pose rest direction & tip (naturally follows torso lean in idle OR Naruto run)
        _restDirWorld.copy(node.restDirInParent).applyQuaternion(_parentWorldQuat).normalize();
        _restTipWorld.copy(_headWorldPos).addScaledVector(_restDirWorld, worldLen);
        _restTipLocal.copy(_restTipWorld).sub(_hipsWorldPos).applyQuaternion(_rootWorldQuatInv);

        // Panel outward clearance axis in world space
        _outwardWorld.copy(node.outwardDirChar).applyQuaternion(_rootWorldQuat);
        _outwardWorld.y = 0;
        if (_outwardWorld.lengthSq() > 1e-6) {
          _outwardWorld.normalize();
        } else {
          _outwardWorld.copy(_charFwd).negate();
        }

        const speedMag = smoothedSpeedRatio;
        // Scale down wind push slightly when torso leans forward in Naruto run, while preserving visible hem billow
        const alreadyTrailing = THREE.MathUtils.clamp(-_restDirWorld.dot(_horizVelDir), 0, 1);
        const sweepBudget = Math.max(0.24, 1.0 - alreadyTrailing * 0.78);
        // Progressive wave travel down child segments so robe hems ripple organically instead of locking stiffly
        const segShare =
          i === 0
            ? 1.0
            : THREE.MathUtils.lerp(0.86, 0.54, i / Math.max(1, nodes.length - 1));
        const turnMag = Math.min(1.0, Math.abs(smoothedYawRate) / 5.5);

        let backSweep = 0;
        let outwardFlare = 0;
        let liftAmt = 0;

        if (node.panelSide === 'back') {
          backSweep = (0.025 + speedMag * 0.24) * sweepBudget * segShare * worldLen;
          outwardFlare = (0.018 + speedMag * 0.068 + turnMag * 0.036) * segShare * worldLen;
          liftAmt = (speedMag * 0.048 + turnMag * 0.024) * sweepBudget * segShare * worldLen;
        } else if (node.panelSide === 'front') {
          backSweep = speedMag * 0.022 * sweepBudget * segShare * worldLen;
          outwardFlare = (0.048 + speedMag * 0.22 + turnMag * 0.055) * segShare * worldLen;
          liftAmt = (speedMag * 0.065 + turnMag * 0.035) * sweepBudget * segShare * worldLen;
        } else {
          backSweep = (0.02 + speedMag * 0.18) * sweepBudget * segShare * worldLen;
          outwardFlare = (0.034 + speedMag * 0.165 + turnMag * 0.052) * segShare * worldLen;
          liftAmt = (speedMag * 0.042 + turnMag * 0.022) * sweepBudget * segShare * worldLen;
        }

        _targetTipWorld.copy(_restTipWorld);
        _targetTipWorld.addScaledVector(_horizVelDir, -backSweep);
        _targetTipWorld.addScaledVector(_outwardWorld, outwardFlare);
        _targetTipWorld.y += liftAmt;

        // Jump / Fall vertical air drag
        if (smoothedVertVel < -0.5) {
          const fallFactor = Math.min(1.0, (-smoothedVertVel - 0.5) / 10.0);
          _targetTipWorld.y += fallFactor * 0.14 * segShare * worldLen;
          _targetTipWorld.addScaledVector(_outwardWorld, fallFactor * 0.12 * segShare * worldLen);
        } else if (smoothedVertVel > 0.7) {
          const riseFactor = Math.min(1.0, (smoothedVertVel - 0.7) / 10.0);
          _targetTipWorld.y -= riseFactor * 0.09 * segShare * worldLen;
        }

        // Centrifugal whip & lateral turn sway during rapid turns
        if (Math.abs(smoothedYawRate) > 0.06) {
          const turnScale = node.panelSide === 'back' ? 0.026 : 0.052;
          const turnPush =
            -smoothedYawRate * (turnScale + speedMag * 0.024) * segShare * worldLen;
          _targetTipWorld.addScaledVector(_charRight, turnPush);
        }

        // Traveling wind ripple (propagates smoothly from waist down to hem)
        const waveFreq = 5.4 + speedMag * 7.8;
        const waveAmp = (0.011 + speedMag * 0.042) * segShare * worldLen;
        const wavePhase = elapsed * waveFreq + node.phaseSeed - i * 0.45;
        const waveA = Math.sin(wavePhase);
        _targetTipWorld.addScaledVector(_outwardWorld, waveA * waveAmp);
        if (node.panelSide !== 'back') {
          const waveB = Math.cos(wavePhase * 0.72 + node.phaseSeed * 1.15);
          _targetTipWorld.addScaledVector(_charRight, waveB * waveAmp * 0.34);
        }

        // Keep tips below near-horizontal so coat never flips upward over the back
        const maxTipY = _headWorldPos.y - (i === 0 ? 0.30 : 0.20) * worldLen;
        if (_targetTipWorld.y > maxTipY) {
          _targetTipWorld.y = maxTipY;
        }

        // Constrain target to bone sphere
        _segVec.subVectors(_targetTipWorld, _headWorldPos);
        const targetDist = _segVec.length();
        if (targetDist > 1e-5) {
          _targetTipWorld.copy(_headWorldPos).addScaledVector(_segVec, worldLen / targetDist);
        }

        // Sub-stepped 2nd-order Spring-Damper toward target tip (zero overshoot/snap)
        if (!node.initialized) {
          node.tipWorldPos.copy(_targetTipWorld);
          node.tipWorldVel.set(0, 0, 0);
          node.initialized = true;
        } else {
          if (node.tipWorldPos.distanceToSquared(_targetTipWorld) > 4.5) {
            node.tipWorldPos.copy(_targetTipWorld);
            node.tipWorldVel.set(0, 0, 0);
          } else {
            const subSteps = safeDt > 0.017 ? 2 : 1;
            const subDt = safeDt / subSteps;
            const maxVel = 7.5 * charScale;
            for (let s = 0; s < subSteps; s++) {
              _springForce
                .subVectors(_targetTipWorld, node.tipWorldPos)
                .multiplyScalar(node.stiffness)
                .addScaledVector(node.tipWorldVel, -node.damping);
              node.tipWorldVel.addScaledVector(_springForce, subDt);
              if (node.tipWorldVel.lengthSq() > maxVel * maxVel) {
                node.tipWorldVel.setLength(maxVel);
              }
              node.tipWorldPos.addScaledVector(node.tipWorldVel, subDt);
            }
          }
        }

        // Enforce bone length before collision pass
        _segVec.subVectors(node.tipWorldPos, _headWorldPos);
        const curLen = _segVec.length();
        if (curLen > 1e-5) {
          node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / curLen);
        } else {
          node.tipWorldPos.copy(_targetTipWorld);
        }

        const runLegCollisionPass = () => {
          for (let pass = 0; pass < 2; pass++) {
            let hit = false;

            // 1. Tip point collision with leg capsules and knee spheres
            if (hasLeftLeg && pushPointOutOfCapsule(node.tipWorldPos, legCapsules[0], node.panelSide, _outwardWorld)) hit = true;
            if (hasLeftShin && pushPointOutOfCapsule(node.tipWorldPos, legCapsules[1], node.panelSide, _outwardWorld)) hit = true;
            if (hasLeftLeg && pushPointOutOfSphere(node.tipWorldPos, legSpheres[0], node.panelSide, _outwardWorld)) hit = true;

            if (hasRightLeg && pushPointOutOfCapsule(node.tipWorldPos, legCapsules[2], node.panelSide, _outwardWorld)) hit = true;
            if (hasRightShin && pushPointOutOfCapsule(node.tipWorldPos, legCapsules[3], node.panelSide, _outwardWorld)) hit = true;
            if (hasRightLeg && pushPointOutOfSphere(node.tipWorldPos, legSpheres[1], node.panelSide, _outwardWorld)) hit = true;

            // 2. Intermediate points along segment (t = 0.22, 0.45, 0.70, 0.90) so thighs/knees never pierce mid-bone
            const tSamples = [0.22, 0.45, 0.70, 0.90];
            for (let sIdx = 0; sIdx < tSamples.length; sIdx++) {
              _samplePt.copy(_headWorldPos).lerp(node.tipWorldPos, tSamples[sIdx]);
              let sampleHit = false;
              if (hasLeftLeg && pushPointOutOfCapsule(_samplePt, legCapsules[0], node.panelSide, _outwardWorld)) sampleHit = true;
              if (hasLeftShin && pushPointOutOfCapsule(_samplePt, legCapsules[1], node.panelSide, _outwardWorld)) sampleHit = true;
              if (hasLeftLeg && pushPointOutOfSphere(_samplePt, legSpheres[0], node.panelSide, _outwardWorld)) sampleHit = true;

              if (hasRightLeg && pushPointOutOfCapsule(_samplePt, legCapsules[2], node.panelSide, _outwardWorld)) sampleHit = true;
              if (hasRightShin && pushPointOutOfCapsule(_samplePt, legCapsules[3], node.panelSide, _outwardWorld)) sampleHit = true;
              if (hasRightLeg && pushPointOutOfSphere(_samplePt, legSpheres[1], node.panelSide, _outwardWorld)) sampleHit = true;

              if (sampleHit) {
                _segVec.subVectors(_samplePt, _headWorldPos);
                const sLen = _segVec.length();
                if (sLen > 1e-5) {
                  node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / sLen);
                  hit = true;
                }
              }
            }

            if (!hit) break;

            _segVec.subVectors(node.tipWorldPos, _headWorldPos);
            const afterLen = _segVec.length();
            if (afterLen > 1e-5) {
              node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / afterLen);
            }
            node.tipWorldVel.multiplyScalar(0.72);
          }
        };

        // Pre-sector Dual-Leg Capsule Collision Push-Out
        runLegCollisionPass();

        // Cohesive Sector & Non-Overlap Guard relative to Hips & current pose rest tip:
        // Preserves stitched coat seams while stopping L/R center crossing and back/side/front overlap.
        _localTip.copy(node.tipWorldPos).sub(_hipsWorldPos).applyQuaternion(_rootWorldQuatInv);
        let sectorAdjusted = false;
        const absRestX = Math.abs(_restTipLocal.x);

        if (node.panelSide === 'back') {
          // Keep L/R back halves cleanly separated at spine seam X=0 while allowing lively outward flare on turns
          const minBackX = Math.max(0.085 * charScale, absRestX * 0.90);
          const maxBackX = Math.max(minBackX + 0.04 * charScale, absRestX + 0.07 * charScale);
          const signedX = _localTip.x * node.lateralSign;
          if (signedX < minBackX) {
            _localTip.x = node.lateralSign * minBackX;
            sectorAdjusted = true;
          } else if (signedX > maxBackX) {
            _localTip.x = node.lateralSign * maxBackX;
            sectorAdjusted = true;
          }
          // Back panel stays cleanly behind its pose rest Z (or slightly trailing)
          const maxBackZ = Math.min(-0.10 * charScale, _restTipLocal.z + 0.03 * charScale);
          if (_localTip.z > maxBackZ) {
            _localTip.z = maxBackZ;
            sectorAdjusted = true;
          }
        } else if (node.panelSide === 'side_left' || node.panelSide === 'side_right') {
          // Side panel stays strictly outside back panel's outer edge
          const minSideX = Math.max(0.20 * charScale, absRestX * 0.95);
          if (_localTip.x * node.lateralSign < minSideX) {
            _localTip.x = node.lateralSign * minSideX;
            sectorAdjusted = true;
          }
          // Keep side panel ahead of back panel tip on the same side so rear-side corner never folds over back
          const refBackZ = node.lateralSign > 0 ? (hasLeftBack ? leftBackTipZ : _restTipLocal.z) : (hasRightBack ? rightBackTipZ : _restTipLocal.z);
          const minSideZ = Math.max(_restTipLocal.z - 0.14 * charScale, refBackZ + 0.055 * charScale);
          if (_localTip.z < minSideZ) {
            _localTip.z = minSideZ;
            sectorAdjusted = true;
          }
          // Keep side panel elevation harmonized with back panel to eliminate diagonal seam creasing
          const hasRefBack = node.lateralSign > 0 ? hasLeftBack : hasRightBack;
          if (hasRefBack && i === nodes.length - 1) {
            const refBackY = node.lateralSign > 0 ? leftBackTipY : rightBackTipY;
            const maxDropBelowBack = refBackY - 0.16 * charScale;
            if (_localTip.y < maxDropBelowBack) {
              _localTip.y = THREE.MathUtils.lerp(_localTip.y, maxDropBelowBack, 0.55);
              sectorAdjusted = true;
            }
          }
        } else {
          // Front panel stays on own lateral side and ahead of same-side side panel
          const minFrontX = Math.max(0.05 * charScale, absRestX * 0.85);
          if (_localTip.x * node.lateralSign < minFrontX) {
            _localTip.x = node.lateralSign * minFrontX;
            sectorAdjusted = true;
          }
          const hasRefSide = node.lateralSign > 0 ? hasLeftSide : hasRightSide;
          const refSideZ = node.lateralSign > 0 ? leftSideTipZ : rightSideTipZ;
          const minFrontZ = hasRefSide
            ? Math.max(_restTipLocal.z - 0.10 * charScale, refSideZ + 0.045 * charScale)
            : _restTipLocal.z - 0.10 * charScale;
          if (_localTip.z < minFrontZ) {
            _localTip.z = minFrontZ;
            sectorAdjusted = true;
          }
        }

        if (sectorAdjusted) {
          node.tipWorldPos.copy(_localTip).applyQuaternion(_rootWorldQuat).add(_hipsWorldPos);
          _segVec.subVectors(node.tipWorldPos, _headWorldPos);
          const sLen = _segVec.length();
          if (sLen > 1e-5) {
            node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / sLen);
          }
          // Post-sector leg-capsule guard so seam clamping never pushes cloth back inside raised thighs
          runLegCollisionPass();
          if (node.panelSide === 'back') {
            _localTip.copy(node.tipWorldPos).sub(_hipsWorldPos).applyQuaternion(_rootWorldQuatInv);
            const minBackX = Math.max(0.085 * charScale, absRestX * 0.90);
            if (_localTip.x * node.lateralSign < minBackX) {
              _localTip.x = node.lateralSign * minBackX;
              node.tipWorldPos.copy(_localTip).applyQuaternion(_rootWorldQuat).add(_hipsWorldPos);
            }
          }
        }

        // Final vertical bounds: prevent upward curl over back and prevent floor clipping
        const finalMaxY = _headWorldPos.y - (i === 0 ? 0.30 : 0.20) * worldLen;
        if (node.tipWorldPos.y > finalMaxY) {
          node.tipWorldPos.y = finalMaxY;
          _segVec.subVectors(node.tipWorldPos, _headWorldPos);
          const l = _segVec.length();
          if (l > 1e-5) {
            node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / l);
          }
        }
        const minFloorY = _hipsWorldPos.y - 0.86 * charScale;
        if (node.tipWorldPos.y < minFloorY) {
          node.tipWorldPos.y = minFloorY;
          _segVec.subVectors(node.tipWorldPos, _headWorldPos);
          const l = _segVec.length();
          if (l > 1e-5) {
            node.tipWorldPos.copy(_headWorldPos).addScaledVector(_segVec, worldLen / l);
          }
        }

        // Record solved local hem coordinates for downstream side/front ordering
        _localTip.copy(node.tipWorldPos).sub(_hipsWorldPos).applyQuaternion(_rootWorldQuatInv);
        if (node.panelSide === 'back' && i === nodes.length - 1) {
          if (node.lateralSign > 0) {
            leftBackTipZ = _localTip.z;
            leftBackTipY = _localTip.y;
            hasLeftBack = true;
          } else {
            rightBackTipZ = _localTip.z;
            rightBackTipY = _localTip.y;
            hasRightBack = true;
          }
        } else if ((node.panelSide === 'side_left' || node.panelSide === 'side_right') && i === nodes.length - 1) {
          if (node.lateralSign > 0) {
            leftSideTipZ = _localTip.z;
            hasLeftSide = true;
          } else {
            rightSideTipZ = _localTip.z;
            hasRightSide = true;
          }
        }

        // Convert solved tip direction into clamped parent-local rotation delta with smooth quaternion slerp
        _desiredDirWorld.subVectors(node.tipWorldPos, _headWorldPos);
        if (_desiredDirWorld.lengthSq() > 1e-8) {
          _desiredDirWorld.normalize();
          _desiredDirParent.copy(_desiredDirWorld).applyQuaternion(_parentWorldQuatInv).normalize();

          const dot = THREE.MathUtils.clamp(node.restDirInParent.dot(_desiredDirParent), -1, 1);
          const angle = Math.acos(dot);
          if (angle > 0.001) {
            const clampedAngle = Math.min(angle, node.maxSwingAngle);
            _axisScratch.crossVectors(node.restDirInParent, _desiredDirParent);
            if (_axisScratch.lengthSq() > 1e-8) {
              _axisScratch.normalize();
              _deltaQuat.setFromAxisAngle(_axisScratch, clampedAngle);
              _targetLocalQuat.copy(_deltaQuat).multiply(node.restLocalQuat);
            } else {
              _targetLocalQuat.copy(node.restLocalQuat);
            }
          } else {
            _targetLocalQuat.copy(node.restLocalQuat);
          }

          const slerpAlpha = 1 - Math.exp(-26 * safeDt);
          node.smoothedLocalQuat.slerp(_targetLocalQuat, slerpAlpha);
          node.bone.quaternion.copy(node.smoothedLocalQuat);
          node.bone.updateMatrix();
          node.bone.updateMatrixWorld(true);
        }
      }
    }
  };

  return { solve, reset, hasBoneChains };
}
