import * as THREE from 'three';
import { CharacterBones } from './gltfObitoLoader';

interface SpringClothNode {
  bone: THREE.Bone;
  restLocalPos: THREE.Vector3;
  worldOffset: THREE.Vector3;
  worldVel: THREE.Vector3;
  maxDisplacement: number;
  stiffness: number;
  damping: number;
  kind: 'collar_back' | 'collar_side' | 'collar_front' | 'hair_back';
  influenceRadius: number;
}

export interface HeadCollarPhysicsSolver {
  solve: (dt: number) => void;
  reset: () => void;
}

// Pre-allocated scratch math helpers (zero GC inside frame loop)
const _rootWorldQ = new THREE.Quaternion();
const _rootWorldQInv = new THREE.Quaternion();
const _chestWorldQ = new THREE.Quaternion();
const _chestWorldPos = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();
const _headWorldQ = new THREE.Quaternion();
const _neckWorldPos = new THREE.Vector3();
const _parentWorldQ = new THREE.Quaternion();
const _parentWorldQInv = new THREE.Quaternion();
const _desiredWorldQ = new THREE.Quaternion();
const _probeWorld = new THREE.Vector3();
const _probeChest = new THREE.Vector3();
const _headUpWorld = new THREE.Vector3();
const _headRightWorld = new THREE.Vector3();
const _nodeWorldPos = new THREE.Vector3();
const _deltaWorld = new THREE.Vector3();
const _targetLocalPos = new THREE.Vector3();
const _pushWorld = new THREE.Vector3();
const _normalWorld = new THREE.Vector3();
const _corrWorldQ = new THREE.Quaternion();
const _springRestTarget = new THREE.Vector3();
const _springAccel = new THREE.Vector3();
const _headFwdWorld = new THREE.Vector3();
const _parentScale = new THREE.Vector3();

function collectClothNodes(
  rawRoot: THREE.Object3D,
  isOriginalObito: boolean,
  isTobiV2: boolean
): SpringClothNode[] {
  const nodes: SpringClothNode[] = [];
  const pushNode = (
    bone: THREE.Bone,
    kind: SpringClothNode['kind'],
    maxDisplacement: number,
    influenceRadius: number
  ) => {
    nodes.push({
      bone,
      restLocalPos: bone.position.clone(),
      worldOffset: new THREE.Vector3(),
      worldVel: new THREE.Vector3(),
      maxDisplacement,
      stiffness: kind === 'hair_back' ? 220 : 195,
      damping: kind === 'hair_back' ? 24 : 21,
      kind,
      influenceRadius,
    });
  };

  rawRoot.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    const name = bone.name;

    if (isOriginalObito) {
      if (/^collar[\s_]*back/i.test(name)) {
        pushNode(bone, 'collar_back', 0.028, 0.14);
      } else if (/^collar[\s_]*side/i.test(name)) {
        pushNode(bone, 'collar_side', 0.022, 0.135);
      } else if (/^collar[\s_]*front|^shirt[\s_]*neck/i.test(name)) {
        pushNode(bone, 'collar_front', 0.018, 0.125);
      } else if (/^hair[\s_]*back[\s_]*control$/i.test(name)) {
        pushNode(bone, 'hair_back', 0.026, 0.11);
      }
    } else if (isTobiV2) {
      if (/^Neck_[LR]2$/i.test(name)) {
        pushNode(bone, 'collar_back', 0.026, 0.15);
      } else if (/^Neck_C$/i.test(name)) {
        pushNode(bone, 'collar_front', 0.018, 0.13);
      } else if (/^hair_(?:T0[45]|[RL]05|[RL]08)$/i.test(name)) {
        pushNode(bone, 'hair_back', 0.024, 0.11);
      }
    }
  });

  return nodes;
}

/**
 * Glitch-free damped cloth & collar clearance solver for Original Obito (`gxujni.glb`)
 * and Tobi V2 (`Tobi.fbx`).
 *
 * Design guarantees:
 * 1. Zero quaternion accumulation across frames (never permanently mutates neck/head across ticks).
 * 2. Exact collar-ring clearance measurement so neutral idle & normal run postures incur zero false hits.
 * 3. Smoothly flexes `collar_back` / `collar_side` / `hair_back` spring bones first, and only applies
 *    a temporally-damped micro forward head guard (`<= 0.14 rad`) if deep backward collar clipping occurs.
 */
export function createHeadCollarPhysicsSolver(
  pivotGroup: THREE.Object3D,
  bones: CharacterBones,
  isOriginalObito: boolean,
  isTobiV2: boolean
): HeadCollarPhysicsSolver | null {
  if ((!isOriginalObito && !isTobiV2) || !bones.head) {
    return null;
  }

  const chestBone = bones.chest || bones.spine;
  if (!chestBone) return null;

  pivotGroup.updateMatrixWorld(true);
  chestBone.updateWorldMatrix(true, false);
  chestBone.getWorldPosition(_chestWorldPos);
  chestBone.getWorldQuaternion(_chestWorldQ);

  const headBone = bones.head;
  const neckBone = bones.neck ?? null;
  headBone.getWorldPosition(_headWorldPos);

  if (neckBone) {
    neckBone.getWorldPosition(_neckWorldPos);
  } else {
    _neckWorldPos.copy(_headWorldPos).add(new THREE.Vector3(0, -0.06, -0.01));
  }

  pivotGroup.getWorldQuaternion(_rootWorldQ);
  _rootWorldQInv.copy(_rootWorldQ).invert();

  const neckOffsetFromChest = _neckWorldPos.clone().sub(_chestWorldPos).applyQuaternion(_rootWorldQInv);
  const chestToBindCharQ = _rootWorldQInv.clone().multiply(_chestWorldQ);

  const clothNodes = collectClothNodes(pivotGroup, isOriginalObito, isTobiV2);

  let backCollarZSum = 0;
  let backCollarYSum = 0;
  let backCollarCount = 0;
  let sideCollarXMax = 0;

  for (const node of clothNodes) {
    node.bone.getWorldPosition(_nodeWorldPos);
    const rel = _nodeWorldPos.clone().sub(_chestWorldPos).applyQuaternion(_rootWorldQInv);
    if (node.kind === 'collar_back') {
      backCollarZSum += rel.z;
      backCollarYSum += rel.y;
      backCollarCount += 1;
      sideCollarXMax = Math.max(sideCollarXMax, Math.abs(rel.x));
    } else if (node.kind === 'collar_side') {
      sideCollarXMax = Math.max(sideCollarXMax, Math.abs(rel.x));
    }
  }

  // Calibrated physical collar geometry: keeps neutral/rest skull comfortably clear inside the collar
  const collarCenterX = neckOffsetFromChest.x;
  const collarCenterZ = neckOffsetFromChest.z + 0.01;
  const backWallZ =
    backCollarCount > 0 ? backCollarZSum / backCollarCount : neckOffsetFromChest.z - 0.078;
  const backBaseY =
    backCollarCount > 0 ? backCollarYSum / backCollarCount : neckOffsetFromChest.y;
  const collarRimTopY = backBaseY + 0.088;
  const collarSideRadius = Math.max(0.118, sideCollarXMax > 0 ? sideCollarXMax : 0.128);
  const collarBackRadius = Math.max(0.088, collarCenterZ - backWallZ + 0.014);

  // Temporally-damped head guard pitch (rad, 0..0.14) — never accumulates or jumps
  let currentHeadGuardAngle = 0;

  const reset = () => {
    currentHeadGuardAngle = 0;
    for (const node of clothNodes) {
      node.worldOffset.set(0, 0, 0);
      node.worldVel.set(0, 0, 0);
      node.bone.position.copy(node.restLocalPos);
    }
  };

  const _currentChestCharQ = new THREE.Quaternion();
  const _currentChestCharQInv = new THREE.Quaternion();
  const _rootScaleVec = new THREE.Vector3();

  // Back-of-head & nape probes sized to detect real collar intersection without rest-pose false positives
  const _backProbes = [
    { localZ: -0.046, localY: 0.018, radius: 0.042 },
    { localZ: -0.054, localY: 0.062, radius: 0.044 },
    { localZ: -0.046, localY: -0.01, radius: 0.036 },
  ];

  const solve = (dt: number) => {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.04);

    // Clear previous spring displacement before reading animated bone transforms
    for (let i = 0; i < clothNodes.length; i++) {
      clothNodes[i].bone.position.copy(clothNodes[i].restLocalPos);
    }

    pivotGroup.updateMatrixWorld(true);
    pivotGroup.getWorldQuaternion(_rootWorldQ);
    _rootWorldQInv.copy(_rootWorldQ).invert();
    pivotGroup.getWorldScale(_rootScaleVec);
    const charScale = Math.max(0.05, _rootScaleVec.y || 1);
    const invCharScale = 1 / charScale;

    chestBone.getWorldPosition(_chestWorldPos);
    chestBone.getWorldQuaternion(_chestWorldQ);

    _currentChestCharQ.multiplyQuaternions(_chestWorldQ, chestToBindCharQ);
    _currentChestCharQInv.copy(_currentChestCharQ).invert();

    headBone.getWorldPosition(_headWorldPos);
    if (neckBone) {
      neckBone.getWorldPosition(_neckWorldPos);
      _headUpWorld.subVectors(_headWorldPos, _neckWorldPos);
      if (_headUpWorld.lengthSq() > 1e-6) {
        _headUpWorld.normalize();
      } else {
        _headUpWorld.set(0, 1, 0).applyQuaternion(_rootWorldQ);
      }
    } else {
      _headUpWorld.set(0, 1, 0).applyQuaternion(_rootWorldQ);
    }

    // Orthonormal forward direction in character plane perpendicular to _headUpWorld
    _headFwdWorld.set(0, 0, 1).applyQuaternion(_rootWorldQ);
    _normalWorld.copy(_headUpWorld).multiplyScalar(_headFwdWorld.dot(_headUpWorld));
    _headFwdWorld.sub(_normalWorld);
    if (_headFwdWorld.lengthSq() > 1e-6) {
      _headFwdWorld.normalize();
    } else {
      _headFwdWorld.set(0, 0, 1).applyQuaternion(_rootWorldQ);
    }

    let deepestBackPen = 0;
    let bestContactWorldX = _headWorldPos.x;
    let bestContactWorldY = _headWorldPos.y;
    let bestContactWorldZ = _headWorldPos.z;

    const wallInnerLimitBase = collarBackRadius;
    for (let p = 0; p < _backProbes.length; p++) {
      const spec = _backProbes[p];
      _probeWorld
        .copy(_headWorldPos)
        .addScaledVector(_headFwdWorld, spec.localZ * charScale)
        .addScaledVector(_headUpWorld, spec.localY * charScale);

      _probeChest
        .copy(_probeWorld)
        .sub(_chestWorldPos)
        .multiplyScalar(invCharScale)
        .applyQuaternion(_currentChestCharQInv);

      const underRim = collarRimTopY + spec.radius - _probeChest.y;
      const aboveShoulders = _probeChest.y - (backBaseY - 0.04);
      if (underRim > 0 && aboveShoulders > 0) {
        const dx = _probeChest.x - collarCenterX;
        const dz = _probeChest.z - collarCenterZ;
        if (dz < -0.01) {
          const nxEllip = dx / collarSideRadius;
          const nzEllip = dz / wallInnerLimitBase;
          const ellipDist = Math.hypot(nxEllip, nzEllip);
          const wallLimit = Math.max(0.2, 1.0 - spec.radius / wallInnerLimitBase);
          const radialPen = (ellipDist - wallLimit) * wallInnerLimitBase;
          const pen = Math.min(underRim, radialPen);
          if (pen > deepestBackPen) {
            deepestBackPen = pen;
            bestContactWorldX = _probeWorld.x;
            bestContactWorldY = _probeWorld.y;
            bestContactWorldZ = _probeWorld.z;
          }
        }
      }
    }

    // Flex collar cloth back slightly & apply spring acceleration to back hair when needed
    // Single continuous forward-upward push normal (never flips between opposite normals)
    _normalWorld.set(0, 0.35, 0.94).normalize().applyQuaternion(_currentChestCharQ);

    let clothYield = 0;
    if (deepestBackPen > 0.002 && clothNodes.length > 0) {
      const contactPosWorld = _probeWorld.set(bestContactWorldX, bestContactWorldY, bestContactWorldZ);
      for (let i = 0; i < clothNodes.length; i++) {
        const node = clothNodes[i];
        node.bone.getWorldPosition(_nodeWorldPos);
        const distToContact = _nodeWorldPos.distanceTo(contactPosWorld) * invCharScale;
        if (distToContact < node.influenceRadius) {
          const weight = 1 - distToContact / node.influenceRadius;
          if (node.kind === 'hair_back') {
            const hairFlex = Math.min(node.maxDisplacement, deepestBackPen * 0.55 * weight);
            _pushWorld.copy(_normalWorld).multiplyScalar(hairFlex * charScale);
            node.worldVel.addScaledVector(_pushWorld, 24);
          } else {
            const flexMag = Math.min(node.maxDisplacement, deepestBackPen * 0.72 * weight);
            _pushWorld.copy(_normalWorld).multiplyScalar(-flexMag * charScale);
            node.worldVel.addScaledVector(_pushWorld, 26);
            clothYield = Math.max(clothYield, flexMag * 0.65);
          }
        }
      }
    }

    // Temporally-damped micro forward pitch guard ONLY on headBone when residual penetration > 0.008m
    // (Never modifies neckBone, preventing any multi-bone fighting or frame-to-frame glitching.)
    const residualPen = Math.max(0, deepestBackPen - clothYield - 0.008);
    const targetGuardAngle = THREE.MathUtils.clamp(residualPen * 1.15, 0, 0.14);
    currentHeadGuardAngle = THREE.MathUtils.damp(currentHeadGuardAngle, targetGuardAngle, 14, safeDt);

    if (currentHeadGuardAngle > 0.002 && headBone.parent) {
      // Positive rotation around character's right-to-left axis pitches the skull cleanly forward/away from collar
      _headRightWorld.crossVectors(_headUpWorld, _headFwdWorld);
      if (_headRightWorld.lengthSq() > 1e-6) {
        _headRightWorld.normalize();
        headBone.parent.updateWorldMatrix(true, false);
        headBone.parent.getWorldQuaternion(_parentWorldQ);
        _parentWorldQInv.copy(_parentWorldQ).invert();

        _corrWorldQ.setFromAxisAngle(_headRightWorld, currentHeadGuardAngle);
        headBone.getWorldQuaternion(_headWorldQ);
        _desiredWorldQ.multiplyQuaternions(_corrWorldQ, _headWorldQ);
        headBone.quaternion.multiplyQuaternions(_parentWorldQInv, _desiredWorldQ);
        headBone.updateMatrix();
      }
    }

    // Damped spring integration for collar cloth & back hair bones
    for (let i = 0; i < clothNodes.length; i++) {
      const node = clothNodes[i];
      _springRestTarget.copy(node.worldOffset).multiplyScalar(-node.stiffness);
      _springAccel.copy(node.worldVel).multiplyScalar(-node.damping);
      _springRestTarget.add(_springAccel);

      node.worldVel.addScaledVector(_springRestTarget, safeDt);
      node.worldOffset.addScaledVector(node.worldVel, safeDt);

      const maxScaledDisp = node.maxDisplacement * charScale;
      const offLen = node.worldOffset.length();
      if (offLen > maxScaledDisp) {
        node.worldOffset.multiplyScalar(maxScaledDisp / offLen);
      }

      if (offLen > 0.0001 && node.bone.parent) {
        node.bone.parent.updateWorldMatrix(true, false);
        node.bone.parent.getWorldQuaternion(_parentWorldQInv).invert();
        _deltaWorld.copy(node.worldOffset).applyQuaternion(_parentWorldQInv);
        node.bone.parent.getWorldScale(_parentScale);
        if (Math.abs(_parentScale.x) > 1e-4) _deltaWorld.x /= _parentScale.x;
        if (Math.abs(_parentScale.y) > 1e-4) _deltaWorld.y /= _parentScale.y;
        if (Math.abs(_parentScale.z) > 1e-4) _deltaWorld.z /= _parentScale.z;

        _targetLocalPos.copy(node.restLocalPos).add(_deltaWorld);
        node.bone.position.copy(_targetLocalPos);
        node.bone.updateMatrix();
      }
    }
  };

  return { solve, reset };
}
