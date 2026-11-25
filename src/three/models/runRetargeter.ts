import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CharacterBones,
  LoadedCharacterTemplate,
  mapBonesOnObject,
} from './gltfObitoLoader';

type BoneRole = keyof CharacterBones;

const ORDERED_ROLES: BoneRole[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightForearm',
  'rightHand',
  'leftThigh',
  'leftShin',
  'leftFoot',
  'rightThigh',
  'rightShin',
  'rightFoot',
];

const LIMB_CHILD_HINT: Partial<Record<BoneRole, BoneRole>> = {
  leftUpperArm: 'leftForearm',
  leftForearm: 'leftHand',
  rightUpperArm: 'rightForearm',
  rightForearm: 'rightHand',
  leftThigh: 'leftShin',
  rightThigh: 'rightShin',
  leftShin: 'leftFoot',
  rightShin: 'rightFoot',
};

const ALIGNED_ARM_ROLES = new Set<BoneRole>([
  'leftUpperArm',
  'leftForearm',
  'rightUpperArm',
  'rightForearm',
]);

const RUN_SAMPLE_COUNT = 36;

// Pre-allocated scratch math objects (zero GC per frame)
const _qAnim = new THREE.Quaternion();
const _qParentWorld = new THREE.Quaternion();
const _qDesiredWorld = new THREE.Quaternion();
const _qTargetLocal = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qRest = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vRootPos = new THREE.Vector3();
const _vRootWorld = new THREE.Quaternion();

function computeLimbDirection(
  bone: THREE.Bone | null,
  childHint: THREE.Bone | null,
  rootInvQuat: THREE.Quaternion
): THREE.Vector3 | null {
  if (!bone) return null;
  let childObj: THREE.Object3D | null = childHint;
  if (!childObj) {
    childObj = bone.children.find((c) => (c as THREE.Bone).isBone) || null;
  }
  if (!childObj) return null;

  bone.getWorldPosition(_vA);
  childObj.getWorldPosition(_vB);
  _vB.sub(_vA);
  if (_vB.lengthSq() < 1e-6) return null;
  _vB.normalize().applyQuaternion(rootInvQuat);
  return _vB.clone();
}

export interface TargetRetargetState {
  rootObj: THREE.Object3D;
  bones: CharacterBones;
  alignedBindWorldQuats: Partial<Record<BoneRole, THREE.Quaternion>>;
  restLocalQuats: Partial<Record<BoneRole, THREE.Quaternion>>;
  restHipsPos: THREE.Vector3 | null;
  restMinFootY: number | null;
  hipsParentNode: THREE.Object3D | null;
  restHipsParentQuat: THREE.Quaternion | null;
  restHipsParentPos: THREE.Vector3 | null;
}

export interface SanitizedRunClipResult {
  clip: THREE.AnimationClip;
  pitchTimes: Float32Array;
  pitchAngles: Float32Array;
}

/**
 * Sanitizes Mixamo/FBX run clips (such as `tobi_run`) that animate `CharacterRoot` with
 * iconic forward Naruto-run pitch (~42°–45°) mixed with buggy sideways roll (+1–7°),
 * crooked yaw (+6–13°), and large translation shifts.
 * Preserves the EXACT pure forward Naruto-run pitch angle (X-axis forward lean) while
 * stripping 100% of crooked yaw (Y = 0), sideways roll (Z = 0), and position drift,
 * and keeping the head level looking straight ahead with zero tilt.
 */
export function sanitizeRunClip(
  templateRoot: THREE.Group,
  srcClip: THREE.AnimationClip
): SanitizedRunClipResult {
  const clip = srcClip.clone();
  let pitchTimes = new Float32Array(0);
  let pitchAngles = new Float32Array(0);

  const wrapper = new THREE.Group();
  const driver = SkeletonUtils.clone(templateRoot) as THREE.Group;
  wrapper.add(driver);
  wrapper.updateMatrixWorld(true);

  const srcBones = mapBonesOnObject(driver);
  const hipsObj = srcBones.hips ?? driver.getObjectByName('Hips') ?? null;
  const charRoot =
    (hipsObj?.parent && hipsObj.parent !== driver && hipsObj.parent !== wrapper
      ? hipsObj.parent
      : driver.getObjectByName('CharacterRoot')) ?? null;

  if (!charRoot || !charRoot.name) {
    wrapper.remove(driver);
    return { clip, pitchTimes, pitchAngles };
  }

  const charQuatTrack = clip.tracks.find((t) => t.name === `${charRoot.name}.quaternion`);
  const charPosTrack = clip.tracks.find((t) => t.name === `${charRoot.name}.position`);
  if (!charQuatTrack && !charPosTrack) {
    wrapper.remove(driver);
    return { clip, pitchTimes, pitchAngles };
  }

  const restCharLocalPos = charRoot.position.clone();
  const charParentWorldQ = new THREE.Quaternion();
  if (charRoot.parent) {
    charRoot.parent.getWorldQuaternion(charParentWorldQ);
  }
  const invCharParentWorldQ = charParentWorldQ.clone().invert();
  const restCharWorldQ = new THREE.Quaternion();
  charRoot.getWorldQuaternion(restCharWorldQ);
  const invRestCharWorldQ = restCharWorldQ.clone().invert();

  const headObj = srcBones.head ?? driver.getObjectByName('Head') ?? null;
  const restHeadWorldQ = new THREE.Quaternion();
  if (headObj) headObj.getWorldQuaternion(restHeadWorldQ);
  const invRestHeadWorldQ = restHeadWorldQ.clone().invert();

  // Save all bone local transforms so we can cleanly restore after sampling
  const savedNodeTransforms = new Map<
    THREE.Object3D,
    { pos: THREE.Vector3; quat: THREE.Quaternion }
  >();
  driver.traverse((obj) => {
    savedNodeTransforms.set(obj, {
      pos: obj.position.clone(),
      quat: obj.quaternion.clone(),
    });
  });

  const mixer = new THREE.AnimationMixer(driver);
  try {
    // 1. Sample desired level world head orientations from the original clip
    const rawHeadDesiredWorld: THREE.Quaternion[] = [];
    const eYXZ = new THREE.Euler(0, 0, 0, 'YXZ');
    const qTmp = new THREE.Quaternion();
    const qD = new THREE.Quaternion();
    if (charQuatTrack && headObj) {
      const rawAct = mixer.clipAction(srcClip);
      rawAct.play();
      const nKeys = charQuatTrack.times.length;
      for (let i = 0; i < nKeys; i++) {
        mixer.setTime(charQuatTrack.times[i]);
        wrapper.updateMatrixWorld(true);
        headObj.getWorldQuaternion(qTmp);
        qD.copy(qTmp).multiply(invRestHeadWorldQ);
        eYXZ.setFromQuaternion(qD, 'YXZ');
        // Keep head straight & level forward (zero yaw twist, zero sideways roll, crisp forward focus)
        const levelDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(THREE.MathUtils.clamp(eYXZ.x * 0.35, -0.05, 0.14), 0, 0, 'YXZ')
        );
        rawHeadDesiredWorld.push(levelDelta.multiply(restHeadWorldQ));
      }
      rawAct.stop();
      mixer.uncacheAction(srcClip);
      for (const [obj, tr] of savedNodeTransforms) {
        obj.position.copy(tr.pos);
        obj.quaternion.copy(tr.quat);
      }
      wrapper.updateMatrixWorld(true);
    }

    // 2. Preserve pure forward Naruto-run pitch on CharacterRoot (strip crooked yaw & sideways roll)
    if (charQuatTrack) {
      const nCharKeys = charQuatTrack.times.length;
      pitchTimes = new Float32Array(charQuatTrack.times);
      pitchAngles = new Float32Array(nCharKeys);

      const rawCharQ = new THREE.Quaternion();
      const rawCharWorldQ = new THREE.Quaternion();
      const rawWorldDelta = new THREE.Quaternion();
      const purePitchDelta = new THREE.Quaternion();
      const cleanCharWorldQ = new THREE.Quaternion();
      const cleanCharLocalQ = new THREE.Quaternion();
      const xAxis = new THREE.Vector3(1, 0, 0);

      for (let i = 0; i < nCharKeys; i++) {
        rawCharQ.set(
          charQuatTrack.values[i * 4],
          charQuatTrack.values[i * 4 + 1],
          charQuatTrack.values[i * 4 + 2],
          charQuatTrack.values[i * 4 + 3]
        );
        rawCharWorldQ.copy(charParentWorldQ).multiply(rawCharQ);
        rawWorldDelta.copy(rawCharWorldQ).multiply(invRestCharWorldQ);

        // Extract pure forward shinobi run pitch around +X; zero out crooked yaw (Y) & sideways roll (Z)
        eYXZ.setFromQuaternion(rawWorldDelta, 'YXZ');
        const cleanPitch = THREE.MathUtils.clamp(eYXZ.x, 0, 0.88);
        pitchAngles[i] = cleanPitch;

        purePitchDelta.setFromAxisAngle(xAxis, cleanPitch);
        cleanCharWorldQ.copy(purePitchDelta).multiply(restCharWorldQ);
        cleanCharLocalQ.copy(invCharParentWorldQ).multiply(cleanCharWorldQ).normalize();

        if (i > 0) {
          const prevDot =
            charQuatTrack.values[(i - 1) * 4] * cleanCharLocalQ.x +
            charQuatTrack.values[(i - 1) * 4 + 1] * cleanCharLocalQ.y +
            charQuatTrack.values[(i - 1) * 4 + 2] * cleanCharLocalQ.z +
            charQuatTrack.values[(i - 1) * 4 + 3] * cleanCharLocalQ.w;
          if (prevDot < 0) {
            cleanCharLocalQ.set(
              -cleanCharLocalQ.x,
              -cleanCharLocalQ.y,
              -cleanCharLocalQ.z,
              -cleanCharLocalQ.w
            );
          }
        }

        charQuatTrack.values[i * 4] = cleanCharLocalQ.x;
        charQuatTrack.values[i * 4 + 1] = cleanCharLocalQ.y;
        charQuatTrack.values[i * 4 + 2] = cleanCharLocalQ.z;
        charQuatTrack.values[i * 4 + 3] = cleanCharLocalQ.w;
      }
    }

    // 3. Lock CharacterRoot.position strictly to rest position (zero sideways drift or vertical plunge)
    if (charPosTrack) {
      const pN = charPosTrack.times.length;
      for (let i = 0; i < pN; i++) {
        charPosTrack.values[i * 3] = restCharLocalPos.x;
        charPosTrack.values[i * 3 + 1] = restCharLocalPos.y;
        charPosTrack.values[i * 3 + 2] = restCharLocalPos.z;
      }
    }

    // 4. Re-level Head.quaternion track against the pure forward-leaning CharacterRoot so gaze stays straight
    if (headObj && headObj.name && headObj.parent && rawHeadDesiredWorld.length > 0) {
      const headTrack = clip.tracks.find((t) => t.name === `${headObj.name}.quaternion`);
      if (headTrack) {
        const passAct = mixer.clipAction(clip);
        passAct.play();
        const hN = headTrack.times.length;
        const parentWorldQ = new THREE.Quaternion();
        const fixedHeadLocalQ = new THREE.Quaternion();
        for (let i = 0; i < hN; i++) {
          mixer.setTime(headTrack.times[i]);
          wrapper.updateMatrixWorld(true);
          headObj.parent.getWorldQuaternion(parentWorldQ);
          const desiredW = rawHeadDesiredWorld[Math.min(rawHeadDesiredWorld.length - 1, i)];
          fixedHeadLocalQ.copy(parentWorldQ).invert().multiply(desiredW).normalize();
          if (i > 0) {
            const prevDot =
              headTrack.values[(i - 1) * 4] * fixedHeadLocalQ.x +
              headTrack.values[(i - 1) * 4 + 1] * fixedHeadLocalQ.y +
              headTrack.values[(i - 1) * 4 + 2] * fixedHeadLocalQ.z +
              headTrack.values[(i - 1) * 4 + 3] * fixedHeadLocalQ.w;
            if (prevDot < 0) {
              fixedHeadLocalQ.set(
                -fixedHeadLocalQ.x,
                -fixedHeadLocalQ.y,
                -fixedHeadLocalQ.z,
                -fixedHeadLocalQ.w
              );
            }
          }
          headTrack.values[i * 4] = fixedHeadLocalQ.x;
          headTrack.values[i * 4 + 1] = fixedHeadLocalQ.y;
          headTrack.values[i * 4 + 2] = fixedHeadLocalQ.z;
          headTrack.values[i * 4 + 3] = fixedHeadLocalQ.w;
        }
        passAct.stop();
        mixer.uncacheAction(clip);
      }
    }
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(driver);
    wrapper.remove(driver);
  }

  return { clip, pitchTimes, pitchAngles };
}

class BakedSkeletalClipBase {
  public readonly duration: number;
  protected readonly sampleCount: number;
  protected readonly frames: Array<Partial<Record<BoneRole, THREE.Quaternion>>> = [];
  protected readonly hipsDeltaY: Float32Array;
  protected readonly footLiftDelta: Float32Array;
  protected readonly srcBindDirs: Partial<Record<BoneRole, THREE.Vector3>> = {};

  constructor(
    template: LoadedCharacterTemplate,
    clip: THREE.AnimationClip,
    sampleCount: number,
    cyclic: boolean,
    hipClampMin: number,
    hipClampMax: number
  ) {
    this.duration = Math.max(0.25, clip.duration || 0.8);
    this.sampleCount = Math.max(2, sampleCount);
    this.hipsDeltaY = new Float32Array(this.sampleCount);
    this.footLiftDelta = new Float32Array(this.sampleCount);

    // Clone clean un-animated template into a temporary off-scene driver inside an identity wrapper
    // so templateRoot's normalizeRiggedRawModel rotation (+Z forward) and scale (2m height) are preserved.
    // Note: Do NOT call skeleton.pose() here — FBX-converted GLBs (e.g. ccgq05.glb) store FBX_Root/CharacterRoot
    // axis conversions on scene nodes, whereas skeleton.pose() resets Hips to y≈0 and twists hip/thigh bones.
    const wrapper = new THREE.Group();
    const driver = SkeletonUtils.clone(template.templateRoot) as THREE.Group;
    wrapper.add(driver);
    wrapper.updateMatrixWorld(true);

    const srcBones = mapBonesOnObject(driver);
    const rootInvQuat = new THREE.Quaternion();
    wrapper.getWorldQuaternion(rootInvQuat).invert();

    const srcBindWorldQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};
    let bindHipsY = 1.0;
    const hasSrcFeet = Boolean(srcBones.leftFoot && srcBones.rightFoot);
    let bindMinFootY = 0;

    for (const role of ORDERED_ROLES) {
      const b = srcBones[role];
      if (!b) continue;
      const q = new THREE.Quaternion();
      b.getWorldQuaternion(q);
      srcBindWorldQuats[role] = q;

      const childRole = LIMB_CHILD_HINT[role];
      const dir = computeLimbDirection(b, childRole ? (srcBones[childRole] ?? null) : null, rootInvQuat);
      if (dir) {
        this.srcBindDirs[role] = dir;
      }
    }

    if (srcBones.hips) {
      srcBones.hips.getWorldPosition(_vA);
      bindHipsY = _vA.y;
    }
    if (hasSrcFeet) {
      srcBones.leftFoot!.getWorldPosition(_vA);
      srcBones.rightFoot!.getWorldPosition(_vB);
      bindMinFootY = Math.min(_vA.y, _vB.y);
    }

    const mixer = new THREE.AnimationMixer(driver);
    const action = mixer.clipAction(clip);
    if (!cyclic) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();

    const denom = cyclic ? this.sampleCount : this.sampleCount - 1;
    const maxNonCyclicTime = Math.max(0, this.duration - 0.002);
    for (let f = 0; f < this.sampleCount; f++) {
      const rawT = (f / denom) * this.duration;
      const t = cyclic ? rawT : Math.min(rawT, maxNonCyclicTime);
      mixer.setTime(t);
      wrapper.updateMatrixWorld(true);

      const frameMap: Partial<Record<BoneRole, THREE.Quaternion>> = {};
      for (const role of ORDERED_ROLES) {
        const b = srcBones[role];
        const bindQ = srcBindWorldQuats[role];
        if (!b || !bindQ) continue;
        b.getWorldQuaternion(_qAnim);
        // Delta world rotation: Q_anim * inv(Q_bind)
        frameMap[role] = _qAnim.clone().multiply(bindQ.clone().invert());
      }
      this.frames.push(frameMap);

      if (srcBones.hips) {
        srcBones.hips.getWorldPosition(_vA);
        this.hipsDeltaY[f] = THREE.MathUtils.clamp(_vA.y - bindHipsY, hipClampMin, hipClampMax);
      }
      if (hasSrcFeet) {
        srcBones.leftFoot!.getWorldPosition(_vA);
        srcBones.rightFoot!.getWorldPosition(_vB);
        const frameMinFootY = Math.min(_vA.y, _vB.y);
        // Preserve genuine aerial jumps while ignoring minor ankle tilt noise on planted stances
        this.footLiftDelta[f] = Math.max(0, frameMinFootY - bindMinFootY - 0.035);
      }
    }

    mixer.stopAllAction();
    mixer.uncacheRoot(driver);
  }

  /**
   * Captures the target rig's clean bind-pose orientations and pre-aligns A-pose/T-pose limbs
   * so the baked clip transfers identically onto any 3D character or enemy skeleton.
   */
  public prepareTarget(
    rootObj: THREE.Object3D,
    bones: CharacterBones,
    baseBoneRotations?: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions?: Map<THREE.Bone, THREE.Vector3>
  ): TargetRetargetState {
    // Save current local rotations, CharacterRoot (hips parent), pivot rotation, and hip position
    // so bind-pose orientations are always measured strictly upright regardless of active animations.
    const savedRootRot = rootObj.rotation.clone();
    rootObj.rotation.set(0, 0, 0);

    const hipsParentRaw = bones.hips?.parent;
    const hipsParentNode =
      hipsParentRaw &&
      hipsParentRaw !== bones.hips &&
      hipsParentRaw !== rootObj &&
      baseBoneRotations?.has(hipsParentRaw as THREE.Bone)
        ? hipsParentRaw
        : null;
    const savedHipsParentQuat = hipsParentNode ? hipsParentNode.quaternion.clone() : null;
    const savedHipsParentPos = hipsParentNode ? hipsParentNode.position.clone() : null;
    let restHipsParentQuat: THREE.Quaternion | null = null;
    let restHipsParentPos: THREE.Vector3 | null = null;
    if (hipsParentNode) {
      const parentBaseEuler = baseBoneRotations?.get(hipsParentNode as THREE.Bone);
      const parentBasePos = baseBonePositions?.get(hipsParentNode as THREE.Bone);
      if (parentBaseEuler) {
        hipsParentNode.rotation.copy(parentBaseEuler);
        restHipsParentQuat = new THREE.Quaternion().setFromEuler(parentBaseEuler);
      }
      if (parentBasePos) {
        hipsParentNode.position.copy(parentBasePos);
        restHipsParentPos = parentBasePos.clone();
      }
    }

    const saved = new Map<THREE.Bone, THREE.Quaternion>();
    const savedHipsPos = bones.hips ? bones.hips.position.clone() : null;
    for (const role of ORDERED_ROLES) {
      const b = bones[role];
      if (!b) continue;
      saved.set(b, b.quaternion.clone());
      const baseEuler = baseBoneRotations?.get(b);
      if (baseEuler) {
        b.rotation.copy(baseEuler);
      }
    }
    if (bones.hips) {
      const basePos = baseBonePositions?.get(bones.hips);
      if (basePos) {
        bones.hips.position.copy(basePos);
      }
    }
    rootObj.updateMatrixWorld(true);

    const restHipsPos = bones.hips ? bones.hips.position.clone() : null;
    let restMinFootY: number | null = null;
    if (bones.leftFoot && bones.rightFoot) {
      rootObj.getWorldPosition(_vRootPos);
      _pivotScale.setFromMatrixScale(rootObj.matrixWorld);
      const restScaleY = Math.max(0.01, _pivotScale.y || 1);
      bones.leftFoot.getWorldPosition(_vA);
      bones.rightFoot.getWorldPosition(_vB);
      restMinFootY = (Math.min(_vA.y, _vB.y) - _vRootPos.y) / restScaleY;
    }

    rootObj.getWorldQuaternion(_vRootWorld);
    const rootInvQuat = _vRootWorld.clone().invert();

    const alignedBindWorldQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};
    const restLocalQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};
    const armAlignQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};

    for (const role of ORDERED_ROLES) {
      const b = bones[role];
      if (!b) continue;

      restLocalQuats[role] = b.quaternion.clone();

      const targetBindWorld = new THREE.Quaternion();
      b.getWorldQuaternion(targetBindWorld);
      // Convert to character-root-relative bind orientation (facing +Z, Y-up)
      const relBindWorld = rootInvQuat.clone().multiply(targetBindWorld);

      // Align arm T-pose / A-pose rest differences cleanly
      if (ALIGNED_ARM_ROLES.has(role)) {
        const srcDir = this.srcBindDirs[role];
        const childRole = LIMB_CHILD_HINT[role];
        const targetDir = computeLimbDirection(
          b,
          childRole ? (bones[childRole] ?? null) : null,
          rootInvQuat
        );
        if (srcDir && targetDir) {
          const dot = THREE.MathUtils.clamp(targetDir.dot(srcDir), -1, 1);
          const angle = Math.acos(dot);
          if (angle > 0.04 && angle < 1.55) {
            const alignQ = new THREE.Quaternion().setFromUnitVectors(targetDir, srcDir);
            relBindWorld.premultiply(alignQ);
            armAlignQuats[role] = alignQ;
          }
        } else if (role === 'leftForearm' && armAlignQuats.leftUpperArm) {
          relBindWorld.premultiply(armAlignQuats.leftUpperArm);
        } else if (role === 'rightForearm' && armAlignQuats.rightUpperArm) {
          relBindWorld.premultiply(armAlignQuats.rightUpperArm);
        }
      }

      alignedBindWorldQuats[role] = relBindWorld;
    }

    // Restore prior local rotations, CharacterRoot, pivot rotation & hip position
    rootObj.rotation.copy(savedRootRot);
    if (hipsParentNode) {
      if (savedHipsParentQuat) hipsParentNode.quaternion.copy(savedHipsParentQuat);
      if (savedHipsParentPos) hipsParentNode.position.copy(savedHipsParentPos);
    }
    for (const [b, q] of saved) {
      b.quaternion.copy(q);
    }
    if (bones.hips && savedHipsPos) {
      bones.hips.position.copy(savedHipsPos);
    }
    rootObj.updateMatrixWorld(true);

    return {
      rootObj,
      bones,
      alignedBindWorldQuats,
      restLocalQuats,
      restHipsPos,
      restMinFootY,
      hipsParentNode,
      restHipsParentQuat,
      restHipsParentPos,
    };
  }

  protected applyInterpolatedFrames(
    targetState: TargetRetargetState,
    f0: number,
    f1: number,
    frac: number,
    blendAlpha: number,
    blendFromCurrent: boolean,
    groundFeetToTarget = false
  ): number {
    const frame0 = this.frames[f0];
    const frame1 = this.frames[f1];

    targetState.rootObj.updateWorldMatrix(true, false);
    targetState.rootObj.getWorldQuaternion(_vRootWorld);

    // Keep CharacterRoot (hips parent) cleanly upright at rest so prior run/clip tilts never persist
    if (targetState.hipsParentNode) {
      if (targetState.restHipsParentQuat) {
        if (blendAlpha >= 0.999 || !blendFromCurrent) {
          targetState.hipsParentNode.quaternion.copy(targetState.restHipsParentQuat);
        } else {
          targetState.hipsParentNode.quaternion.slerp(targetState.restHipsParentQuat, blendAlpha);
        }
      }
      if (targetState.restHipsParentPos) {
        if (blendAlpha >= 0.999 || !blendFromCurrent) {
          targetState.hipsParentNode.position.copy(targetState.restHipsParentPos);
        } else {
          targetState.hipsParentNode.position.lerp(targetState.restHipsParentPos, blendAlpha);
        }
      }
    }

    // Restore hips local position cleanly so procedural crouch / runAction hip shifts do not persist
    if (targetState.bones.hips && targetState.restHipsPos) {
      if (blendAlpha >= 0.999 || !blendFromCurrent) {
        targetState.bones.hips.position.copy(targetState.restHipsPos);
      } else {
        targetState.bones.hips.position.lerp(targetState.restHipsPos, blendAlpha);
      }
    }

    for (const role of ORDERED_ROLES) {
      const bone = targetState.bones[role];
      const bindRel = targetState.alignedBindWorldQuats[role];
      const q0 = frame0[role];
      const q1 = frame1[role];
      if (!bone || !bindRel || !q0 || !q1) continue;

      _qDelta.copy(q0).slerp(q1, frac);

      // Desired world orientation = rootWorld * deltaQ * bindRel
      _qDesiredWorld.copy(_vRootWorld).multiply(_qDelta).multiply(bindRel);

      if (bone.parent) {
        bone.parent.updateWorldMatrix(true, false);
        bone.parent.getWorldQuaternion(_qParentWorld);
        _qTargetLocal.copy(_qParentWorld).invert().multiply(_qDesiredWorld);
      } else {
        _qTargetLocal.copy(_qDesiredWorld);
      }

      if (blendAlpha >= 0.999) {
        bone.quaternion.copy(_qTargetLocal);
      } else if (blendFromCurrent) {
        bone.quaternion.slerp(_qTargetLocal, blendAlpha);
      } else {
        const restQ = targetState.restLocalQuats[role];
        if (restQ) {
          _qRest.copy(restQ).slerp(_qTargetLocal, blendAlpha);
          bone.quaternion.copy(_qRest);
        } else {
          bone.quaternion.slerp(_qTargetLocal, blendAlpha);
        }
      }
    }

    if (
      groundFeetToTarget &&
      targetState.restMinFootY !== null &&
      targetState.bones.leftFoot &&
      targetState.bones.rightFoot
    ) {
      targetState.rootObj.updateMatrixWorld(true);
      targetState.rootObj.getWorldPosition(_vRootPos);
      _pivotScale.setFromMatrixScale(targetState.rootObj.matrixWorld);
      const worldScaleY = Math.max(0.01, _pivotScale.y || 1);
      targetState.bones.leftFoot.getWorldPosition(_vA);
      targetState.bones.rightFoot.getWorldPosition(_vB);
      const actualMinFootY = (Math.min(_vA.y, _vB.y) - _vRootPos.y) / worldScaleY;
      const desiredLift = THREE.MathUtils.lerp(this.footLiftDelta[f0], this.footLiftDelta[f1], frac);
      const groundedDy = THREE.MathUtils.clamp(
        targetState.restMinFootY + desiredLift - actualMinFootY,
        -0.55,
        0.25
      );
      return groundedDy * blendAlpha;
    }

    const dy = THREE.MathUtils.lerp(this.hipsDeltaY[f0], this.hipsDeltaY[f1], frac);
    return dy * blendAlpha;
  }
}

export class BakedRunAnimation extends BakedSkeletalClipBase {
  constructor(template: LoadedCharacterTemplate, clipOverride?: THREE.AnimationClip) {
    const sourceClip = clipOverride ?? template.runClip;
    if (!sourceClip) {
      throw new Error('NO_RUN_CLIP');
    }
    super(template, sourceClip, RUN_SAMPLE_COUNT, true, -0.22, 0.22);
  }

  /**
   * Applies the `run` animation at `timeSec` onto `targetState` with smooth blending.
   * Returns vertical hip bounce offset in meters for `pivotGroup.position.y`.
   */
  public applyPose(
    targetState: TargetRetargetState,
    timeSec: number,
    blendAlpha = 1.0,
    blendFromCurrent = false
  ): number {
    const norm = ((timeSec / this.duration) % 1 + 1) % 1;
    const fFloat = norm * this.sampleCount;
    const f0 = Math.floor(fFloat) % this.sampleCount;
    const f1 = (f0 + 1) % this.sampleCount;
    const frac = fFloat - Math.floor(fFloat);
    return this.applyInterpolatedFrames(
      targetState,
      f0,
      f1,
      frac,
      blendAlpha,
      blendFromCurrent,
      true
    );
  }

  /**
   * Compiles the baked ninja run directly into a native `THREE.AnimationClip` targeted at
   * any character skeleton (including Bip01/custom skeletons whose bone names differ from `tobi_run`).
   */
  public compileClipForTarget(
    targetRoot: THREE.Object3D,
    targetBones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>,
    clipName = 'Retargeted_Shinobi_Run'
  ): THREE.AnimationClip | null {
    if (this.frames.length === 0) return null;

    const savedRootRot = targetRoot.rotation.clone();
    targetRoot.rotation.set(0, 0, 0);

    const savedQuats = new Map<THREE.Bone, THREE.Quaternion>();
    for (const role of ORDERED_ROLES) {
      const b = targetBones[role];
      if (b) savedQuats.set(b, b.quaternion.clone());
    }
    const savedHipsPos = targetBones.hips ? targetBones.hips.position.clone() : null;

    const targetState = this.prepareTarget(
      targetRoot,
      targetBones,
      baseBoneRotations,
      baseBonePositions
    );
    if (targetState.hipsParentNode) {
      if (targetState.restHipsParentQuat) {
        targetState.hipsParentNode.quaternion.copy(targetState.restHipsParentQuat);
      }
      if (targetState.restHipsParentPos) {
        targetState.hipsParentNode.position.copy(targetState.restHipsParentPos);
      }
    }
    for (const role of ORDERED_ROLES) {
      const b = targetBones[role];
      const restQ = targetState.restLocalQuats[role];
      if (b && restQ) b.quaternion.copy(restQ);
    }
    if (targetBones.hips && targetState.restHipsPos) {
      targetBones.hips.position.copy(targetState.restHipsPos);
    }
    targetRoot.updateMatrixWorld(true);

    const hipsRestWorldPos = new THREE.Vector3();
    if (targetBones.hips) {
      targetBones.hips.getWorldPosition(hipsRestWorldPos);
    }
    _pivotScale.setFromMatrixScale(targetRoot.matrixWorld);
    const targetWorldScaleY = Math.max(0.01, _pivotScale.y || 1);

    const activeRoles = ORDERED_ROLES.filter((role) =>
      Boolean(this.frames[0]?.[role] && targetBones[role] && targetState.alignedBindWorldQuats[role])
    );
    if (activeRoles.length < 4) {
      targetRoot.rotation.copy(savedRootRot);
      for (const [b, q] of savedQuats) b.quaternion.copy(q);
      if (targetBones.hips && savedHipsPos) targetBones.hips.position.copy(savedHipsPos);
      targetRoot.updateMatrixWorld(true);
      return null;
    }

    const totalKeys = this.sampleCount + 1;
    const times = new Float32Array(totalKeys);
    const quatValuesMap = new Map<BoneRole, Float32Array>();
    for (const role of activeRoles) {
      quatValuesMap.set(role, new Float32Array(totalKeys * 4));
    }
    const hipsPosValues = targetBones.hips ? new Float32Array(totalKeys * 3) : null;
    const desiredWorldHipsPos = new THREE.Vector3();

    const savedHipsParentQuat = targetState.hipsParentNode
      ? targetState.hipsParentNode.quaternion.clone()
      : null;
    const savedHipsParentPos = targetState.hipsParentNode
      ? targetState.hipsParentNode.position.clone()
      : null;

    for (let f = 0; f < totalKeys; f++) {
      times[f] = (f / this.sampleCount) * this.duration;
      const sampleIdx = f % this.sampleCount;

      const dy = this.applyInterpolatedFrames(
        targetState,
        sampleIdx,
        sampleIdx,
        0,
        1.0,
        false,
        true
      );

      if (targetBones.hips && hipsPosValues) {
        if (targetBones.hips.parent) {
          targetBones.hips.parent.updateMatrixWorld(true);
          desiredWorldHipsPos
            .copy(hipsRestWorldPos)
            .addScaledVector(_worldUp, dy * targetWorldScaleY);
          targetBones.hips.parent.worldToLocal(desiredWorldHipsPos);
        } else {
          desiredWorldHipsPos.copy(targetState.restHipsPos ?? targetBones.hips.position);
          desiredWorldHipsPos.y += dy;
        }
        hipsPosValues[f * 3] = desiredWorldHipsPos.x;
        hipsPosValues[f * 3 + 1] = desiredWorldHipsPos.y;
        hipsPosValues[f * 3 + 2] = desiredWorldHipsPos.z;
      }

      const offset = f * 4;
      for (const role of activeRoles) {
        const bone = targetBones[role]!;
        const buf = quatValuesMap.get(role)!;
        let qx = bone.quaternion.x;
        let qy = bone.quaternion.y;
        let qz = bone.quaternion.z;
        let qw = bone.quaternion.w;
        if (f > 0) {
          const prevOffset = (f - 1) * 4;
          const dot =
            buf[prevOffset] * qx +
            buf[prevOffset + 1] * qy +
            buf[prevOffset + 2] * qz +
            buf[prevOffset + 3] * qw;
          if (dot < 0) {
            qx = -qx;
            qy = -qy;
            qz = -qz;
            qw = -qw;
          }
        }
        buf[offset] = qx;
        buf[offset + 1] = qy;
        buf[offset + 2] = qz;
        buf[offset + 3] = qw;
      }
    }

    targetRoot.rotation.copy(savedRootRot);
    if (targetState.hipsParentNode) {
      if (savedHipsParentQuat) targetState.hipsParentNode.quaternion.copy(savedHipsParentQuat);
      if (savedHipsParentPos) targetState.hipsParentNode.position.copy(savedHipsParentPos);
    }
    for (const [b, q] of savedQuats) {
      b.quaternion.copy(q);
    }
    if (targetBones.hips && savedHipsPos) {
      targetBones.hips.position.copy(savedHipsPos);
    }
    targetRoot.updateMatrixWorld(true);

    const tracks: THREE.KeyframeTrack[] = [];
    if (targetState.hipsParentNode && targetState.hipsParentNode.name) {
      const parentBone = targetState.hipsParentNode as THREE.Bone;
      const parentBaseEuler = baseBoneRotations.get(parentBone);
      const parentBasePos = baseBonePositions.get(parentBone);
      const rootTimes = new Float32Array([0, this.duration]);
      if (parentBaseEuler) {
        const q = new THREE.Quaternion().setFromEuler(parentBaseEuler);
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${parentBone.name}.quaternion`,
            rootTimes,
            new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])
          )
        );
      }
      if (parentBasePos) {
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${parentBone.name}.position`,
            rootTimes,
            new Float32Array([
              parentBasePos.x,
              parentBasePos.y,
              parentBasePos.z,
              parentBasePos.x,
              parentBasePos.y,
              parentBasePos.z,
            ])
          )
        );
      }
    }
    for (const role of activeRoles) {
      const bone = targetBones[role];
      const vals = quatValuesMap.get(role);
      if (!bone || !bone.name || !vals) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, vals));
    }
    if (targetBones.hips && targetBones.hips.name && hipsPosValues) {
      tracks.push(
        new THREE.VectorKeyframeTrack(`${targetBones.hips.name}.position`, times, hipsPosValues)
      );
    }

    return new THREE.AnimationClip(clipName, this.duration, tracks);
  }
}

export class BakedCombatAnimation extends BakedSkeletalClipBase {
  constructor(template: LoadedCharacterTemplate) {
    const clip = template.combatClip || template.attackClip || template.runClip || template.idleClip;
    if (!clip) {
      throw new Error('NO_COMBAT_CLIP');
    }
    const frames = Math.max(120, Math.round(Math.max(0.25, clip.duration) * 30) + 1);
    super(template, clip, frames, false, -0.36, 0.48);
  }

  /**
   * Applies a clamped non-cyclic combat clip pose at `clipTimeSec` onto `targetState`.
   * When `blendFromCurrent` is true, slerps smoothly from the skeleton's current pose
   * (e.g., native `runAction` or `idleAction`) for a clean CrossFade transition.
   */
  public applyPoseAtTime(
    targetState: TargetRetargetState,
    clipTimeSec: number,
    blendAlpha = 1.0,
    blendFromCurrent = false
  ): number {
    const clamped = THREE.MathUtils.clamp(clipTimeSec, 0, this.duration);
    const fFloat = (clamped / this.duration) * (this.sampleCount - 1);
    const f0 = Math.min(this.sampleCount - 1, Math.floor(fFloat));
    const f1 = Math.min(this.sampleCount - 1, f0 + 1);
    const frac = fFloat - f0;
    return this.applyInterpolatedFrames(
      targetState,
      f0,
      f1,
      frac,
      blendAlpha,
      blendFromCurrent,
      true
    );
  }
}

export class BakedIdleAnimation extends BakedSkeletalClipBase {
  constructor(template: LoadedCharacterTemplate) {
    const clip = template.idleClip || template.runClip || template.combatClip || template.attackClip;
    if (!clip) {
      throw new Error('NO_IDLE_CLIP');
    }
    const frames = Math.max(36, Math.round(Math.max(0.25, clip.duration) * 24));
    super(template, clip, frames, true, -0.25, 0.25);
  }

  public applyPose(
    targetState: TargetRetargetState,
    timeSec: number,
    blendAlpha = 1.0,
    blendFromCurrent = false
  ): number {
    const norm = ((timeSec / this.duration) % 1 + 1) % 1;
    const fFloat = norm * this.sampleCount;
    const f0 = Math.floor(fFloat) % this.sampleCount;
    const f1 = (f0 + 1) % this.sampleCount;
    const frac = fFloat - Math.floor(fFloat);
    return this.applyInterpolatedFrames(
      targetState,
      f0,
      f1,
      frac,
      blendAlpha,
      blendFromCurrent,
      true
    );
  }
}

export class BakedDeathAnimation extends BakedSkeletalClipBase {
  constructor(template: LoadedCharacterTemplate) {
    const clip = template.combatClip || template.idleClip || template.attackClip || template.runClip;
    if (!clip) {
      throw new Error('NO_DEATH_CLIP');
    }
    const frames = Math.max(72, Math.round(Math.max(0.4, clip.duration) * 30) + 1);
    super(template, clip, frames, false, -1.25, 0.25);
  }

  public applyPoseAtTime(
    targetState: TargetRetargetState,
    clipTimeSec: number,
    blendAlpha = 1.0,
    blendFromCurrent = false
  ): number {
    const clamped = THREE.MathUtils.clamp(clipTimeSec, 0, this.duration);
    const fFloat = (clamped / this.duration) * (this.sampleCount - 1);
    const f0 = Math.min(this.sampleCount - 1, Math.floor(fFloat));
    const f1 = Math.min(this.sampleCount - 1, f0 + 1);
    const frac = fFloat - f0;
    return this.applyInterpolatedFrames(
      targetState,
      f0,
      f1,
      frac,
      blendAlpha,
      blendFromCurrent,
      false
    );
  }
}

export interface CompileRetargetedClipOptions {
  name: string;
  cyclic: boolean;
  fps?: number;
  hipClampMin?: number;
  hipClampMax?: number;
}

const _worldUp = new THREE.Vector3(0, 1, 0);
const _pivotScale = new THREE.Vector3(1, 1, 1);

interface BakedUalSourceClip {
  name: string;
  duration: number;
  stepCount: number;
  cyclic: boolean;
  hipsDeltaY: Float32Array;
  deltaQuats: Partial<Record<BoneRole, Float32Array>>;
}

const UAL_CLIP_BAKE_SPEC: Record<string, { cyclic: boolean; fps: number }> = {
  Idle_Loop: { cyclic: true, fps: 24 },
  Sprint_Loop: { cyclic: true, fps: 30 },
  Jump_Start: { cyclic: false, fps: 30 },
  Jump_Loop: { cyclic: true, fps: 24 },
  Jump_Land: { cyclic: false, fps: 30 },
  Punch_Jab: { cyclic: false, fps: 30 },
  Punch_Cross: { cyclic: false, fps: 30 },
  Sword_Attack: { cyclic: false, fps: 30 },
  Spell_Simple_Shoot: { cyclic: false, fps: 30 },
  Spell_Simple_Enter: { cyclic: false, fps: 30 },
};

/**
 * Lightweight pre-baked retargeting driver for essential `UAL1_Standard.glb` clips.
 * Samples ONLY the essential clips (Idle, Sprint, Jump, Punch/Sword, Jutsu) once into
 * compact Float32Array bone-delta buffers during construction, then immediately releases
 * the temporary AnimationMixer and holds ZERO references to the GLB scene, meshes,
 * textures, skeletons, or raw AnimationClips so the GLB is freed from RAM/GPU immediately.
 */
export class UalRetargetDriver {
  private readonly srcBindDirs: Partial<Record<BoneRole, THREE.Vector3>> = {};
  private readonly bakedClips = new Map<string, BakedUalSourceClip>();

  constructor(templateRoot: THREE.Group, essentialClips: Map<string, THREE.AnimationClip>) {
    const wrapper = new THREE.Group();
    wrapper.add(templateRoot);
    wrapper.updateMatrixWorld(true);

    const srcBones = mapBonesOnObject(templateRoot);
    const rootInvQuat = new THREE.Quaternion();
    wrapper.getWorldQuaternion(rootInvQuat).invert();

    const invSrcBindQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};
    const srcActiveRoles: BoneRole[] = [];

    for (const role of ORDERED_ROLES) {
      const b = srcBones[role];
      if (!b) continue;
      const q = new THREE.Quaternion();
      b.getWorldQuaternion(q);
      invSrcBindQuats[role] = q.invert();
      srcActiveRoles.push(role);

      const childRole = LIMB_CHILD_HINT[role];
      const dir = computeLimbDirection(
        b,
        childRole ? (srcBones[childRole] ?? null) : null,
        rootInvQuat
      );
      if (dir) {
        this.srcBindDirs[role] = dir;
      }
    }

    let bindHipsY = 1.0;
    if (srcBones.hips) {
      srcBones.hips.getWorldPosition(_vA);
      bindHipsY = _vA.y;
    }

    const mixer = new THREE.AnimationMixer(templateRoot);

    try {
      for (const [clipName, srcClip] of essentialClips.entries()) {
        const spec = UAL_CLIP_BAKE_SPEC[clipName] ?? {
          cyclic: clipName.endsWith('_Loop'),
          fps: 24,
        };
        const duration = Math.max(0.2, srcClip.duration || 0.8);
        const stepCount = Math.max(14, Math.round(duration * spec.fps));
        const totalKeys = stepCount + 1;

        const hipsDeltaY = new Float32Array(totalKeys);
        const deltaQuats: Partial<Record<BoneRole, Float32Array>> = {};
        for (const role of srcActiveRoles) {
          deltaQuats[role] = new Float32Array(totalKeys * 4);
        }

        const action = mixer.clipAction(srcClip);
        action.reset();
        if (!spec.cyclic) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        action.play();

        const maxSampleTime = Math.max(0, duration - 0.002);

        for (let f = 0; f < totalKeys; f++) {
          const normT = f / stepCount;
          const tKey = normT * duration;
          const sampleT = spec.cyclic && f === stepCount ? 0 : Math.min(tKey, maxSampleTime);
          mixer.setTime(sampleT);
          wrapper.updateMatrixWorld(true);

          if (srcBones.hips) {
            srcBones.hips.getWorldPosition(_vA);
            hipsDeltaY[f] = _vA.y - bindHipsY;
          }

          const offset = f * 4;
          for (const role of srcActiveRoles) {
            const srcBone = srcBones[role]!;
            const invSrcBind = invSrcBindQuats[role]!;
            srcBone.getWorldQuaternion(_qAnim);
            _qDelta.copy(_qAnim).multiply(invSrcBind);

            const buf = deltaQuats[role]!;
            buf[offset] = _qDelta.x;
            buf[offset + 1] = _qDelta.y;
            buf[offset + 2] = _qDelta.z;
            buf[offset + 3] = _qDelta.w;
          }
        }

        action.stop();
        mixer.uncacheAction(srcClip);

        this.bakedClips.set(clipName, {
          name: clipName,
          duration,
          stepCount,
          cyclic: spec.cyclic,
          hipsDeltaY,
          deltaQuats,
        });
      }
    } finally {
      mixer.stopAllAction();
      mixer.uncacheRoot(templateRoot);
      wrapper.remove(templateRoot);
    }
  }

  public hasClip(clipName: string): boolean {
    return this.bakedClips.has(clipName);
  }

  public compileClipForTarget(
    clipName: string,
    targetRoot: THREE.Object3D,
    targetBones: CharacterBones,
    baseBoneRotations: Map<THREE.Bone, THREE.Euler>,
    baseBonePositions: Map<THREE.Bone, THREE.Vector3>,
    options: CompileRetargetedClipOptions
  ): THREE.AnimationClip | null {
    const baked = this.bakedClips.get(clipName);
    if (!baked) return null;

    const duration = baked.duration;
    const stepCount = baked.stepCount;
    const totalKeys = stepCount + 1;
    const hipClampMin = options.hipClampMin ?? -0.22;
    const hipClampMax = options.hipClampMax ?? 0.14;

    // Save current target pose before resetting to clean rest bind pose
    const savedTargetQuats = new Map<THREE.Bone, THREE.Quaternion>();
    const savedHipsPos = targetBones.hips ? targetBones.hips.position.clone() : null;
    const hipsParentRaw = targetBones.hips?.parent;
    const hipsParentBone =
      hipsParentRaw &&
      hipsParentRaw !== targetBones.hips &&
      hipsParentRaw !== targetRoot &&
      baseBoneRotations.has(hipsParentRaw as THREE.Bone)
        ? (hipsParentRaw as THREE.Bone)
        : null;
    const savedHipsParentQuat = hipsParentBone ? hipsParentBone.quaternion.clone() : null;
    const savedHipsParentPos = hipsParentBone ? hipsParentBone.position.clone() : null;
    if (hipsParentBone) {
      const parentBaseEuler = baseBoneRotations.get(hipsParentBone);
      const parentBasePos = baseBonePositions.get(hipsParentBone);
      if (parentBaseEuler) hipsParentBone.rotation.copy(parentBaseEuler);
      if (parentBasePos) hipsParentBone.position.copy(parentBasePos);
    }
    for (const role of ORDERED_ROLES) {
      const b = targetBones[role];
      if (!b) continue;
      savedTargetQuats.set(b, b.quaternion.clone());
      const baseEuler = baseBoneRotations.get(b);
      if (baseEuler) {
        b.rotation.copy(baseEuler);
      }
    }
    if (targetBones.hips) {
      const basePos = baseBonePositions.get(targetBones.hips);
      if (basePos) {
        targetBones.hips.position.copy(basePos);
      }
    }
    targetRoot.updateMatrixWorld(true);

    targetRoot.getWorldQuaternion(_vRootWorld);
    const targetRootInvQuat = _vRootWorld.clone().invert();
    _pivotScale.setFromMatrixScale(targetRoot.matrixWorld);
    const targetWorldScaleY = Math.max(0.01, _pivotScale.y || 1);

    const alignedBindWorldQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};
    const armAlignQuats: Partial<Record<BoneRole, THREE.Quaternion>> = {};

    for (const role of ORDERED_ROLES) {
      const b = targetBones[role];
      if (!b) continue;
      const targetBindWorld = new THREE.Quaternion();
      b.getWorldQuaternion(targetBindWorld);
      const relBindWorld = targetRootInvQuat.clone().multiply(targetBindWorld);

      if (ALIGNED_ARM_ROLES.has(role)) {
        const srcDir = this.srcBindDirs[role];
        const childRole = LIMB_CHILD_HINT[role];
        const targetDir = computeLimbDirection(
          b,
          childRole ? (targetBones[childRole] ?? null) : null,
          targetRootInvQuat
        );
        if (srcDir && targetDir) {
          const dot = THREE.MathUtils.clamp(targetDir.dot(srcDir), -1, 1);
          const angle = Math.acos(dot);
          if (angle > 0.04 && angle < 1.55) {
            const alignQ = new THREE.Quaternion().setFromUnitVectors(targetDir, srcDir);
            relBindWorld.premultiply(alignQ);
            armAlignQuats[role] = alignQ;
          }
        } else if (role === 'leftForearm' && armAlignQuats.leftUpperArm) {
          relBindWorld.premultiply(armAlignQuats.leftUpperArm);
        } else if (role === 'rightForearm' && armAlignQuats.rightUpperArm) {
          relBindWorld.premultiply(armAlignQuats.rightUpperArm);
        }
      } else if (role === 'leftHand') {
        const handAlign = armAlignQuats.leftForearm ?? armAlignQuats.leftUpperArm;
        if (handAlign) relBindWorld.premultiply(handAlign);
      } else if (role === 'rightHand') {
        const handAlign = armAlignQuats.rightForearm ?? armAlignQuats.rightUpperArm;
        if (handAlign) relBindWorld.premultiply(handAlign);
      }

      alignedBindWorldQuats[role] = relBindWorld;
    }

    const hipsRestWorldPos = new THREE.Vector3();
    if (targetBones.hips) {
      targetBones.hips.getWorldPosition(hipsRestWorldPos);
    }

    // Prepare keyframe buffers for mapped bones that exist on both baked source and target
    const activeRoles = ORDERED_ROLES.filter(
      (role) => Boolean(baked.deltaQuats[role] && targetBones[role])
    );

    const times = new Float32Array(totalKeys);
    const quatValuesMap = new Map<BoneRole, Float32Array>();
    for (const role of activeRoles) {
      quatValuesMap.set(role, new Float32Array(totalKeys * 4));
    }
    const hipsPosValues = targetBones.hips ? new Float32Array(totalKeys * 3) : null;
    const desiredWorldHipsPos = new THREE.Vector3();

    for (let f = 0; f < totalKeys; f++) {
      times[f] = (f / stepCount) * duration;

      const hipsDeltaY = THREE.MathUtils.clamp(baked.hipsDeltaY[f], hipClampMin, hipClampMax);

      if (targetBones.hips && hipsPosValues) {
        if (targetBones.hips.parent) {
          targetBones.hips.parent.updateMatrixWorld(true);
          desiredWorldHipsPos
            .copy(hipsRestWorldPos)
            .addScaledVector(_worldUp, hipsDeltaY * targetWorldScaleY);
          targetBones.hips.parent.worldToLocal(desiredWorldHipsPos);
        } else {
          desiredWorldHipsPos.copy(targetBones.hips.position);
          desiredWorldHipsPos.y += hipsDeltaY;
        }
        hipsPosValues[f * 3] = desiredWorldHipsPos.x;
        hipsPosValues[f * 3 + 1] = desiredWorldHipsPos.y;
        hipsPosValues[f * 3 + 2] = desiredWorldHipsPos.z;
      }

      const offset = f * 4;
      // Compute local quaternions in strict parent-to-child order so parent world matrices reflect current frame
      for (const role of activeRoles) {
        const deltaBuf = baked.deltaQuats[role]!;
        const targetBone = targetBones[role]!;
        const bindRel = alignedBindWorldQuats[role]!;

        _qDelta.set(
          deltaBuf[offset],
          deltaBuf[offset + 1],
          deltaBuf[offset + 2],
          deltaBuf[offset + 3]
        );
        _qDesiredWorld.copy(_vRootWorld).multiply(_qDelta).multiply(bindRel);

        if (targetBone.parent) {
          targetBone.parent.updateMatrixWorld(true);
          targetBone.parent.getWorldQuaternion(_qParentWorld);
          _qTargetLocal.copy(_qParentWorld).invert().multiply(_qDesiredWorld);
        } else {
          _qTargetLocal.copy(_qDesiredWorld);
        }

        // Write into targetBone temporarily so child bones inherit exact current-frame parent orientation
        targetBone.quaternion.copy(_qTargetLocal);

        const buf = quatValuesMap.get(role)!;
        let qx = _qTargetLocal.x;
        let qy = _qTargetLocal.y;
        let qz = _qTargetLocal.z;
        let qw = _qTargetLocal.w;

        // Shortest-hemisphere continuity check prevents 350-degree quaternion flip during SLERP
        if (f > 0) {
          const prevOffset = (f - 1) * 4;
          const dot =
            buf[prevOffset] * qx +
            buf[prevOffset + 1] * qy +
            buf[prevOffset + 2] * qz +
            buf[prevOffset + 3] * qw;
          if (dot < 0) {
            qx = -qx;
            qy = -qy;
            qz = -qz;
            qw = -qw;
          }
        }

        buf[offset] = qx;
        buf[offset + 1] = qy;
        buf[offset + 2] = qz;
        buf[offset + 3] = qw;
      }
    }

    // Restore target rig's prior bone rotations & hips position
    if (hipsParentBone) {
      if (savedHipsParentQuat) hipsParentBone.quaternion.copy(savedHipsParentQuat);
      if (savedHipsParentPos) hipsParentBone.position.copy(savedHipsParentPos);
    }
    for (const [b, q] of savedTargetQuats) {
      b.quaternion.copy(q);
    }
    if (targetBones.hips && savedHipsPos) {
      targetBones.hips.position.copy(savedHipsPos);
    }
    targetRoot.updateMatrixWorld(true);

    const tracks: THREE.KeyframeTrack[] = [];
    // Keep CharacterRoot (hips parent bone) anchored cleanly to its rest bind pose during UAL clips
    // so AnimationMixer.crossFadeTo smoothly un-tilts from tobi_run back into upright UAL poses.
    if (hipsParentBone && hipsParentBone.name) {
      const parentBaseEuler = baseBoneRotations.get(hipsParentBone);
      const parentBasePos = baseBonePositions.get(hipsParentBone);
      const rootTimes = new Float32Array([0, duration]);
      if (parentBaseEuler) {
        const q = new THREE.Quaternion().setFromEuler(parentBaseEuler);
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${hipsParentBone.name}.quaternion`,
            rootTimes,
            new Float32Array([q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])
          )
        );
      }
      if (parentBasePos) {
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${hipsParentBone.name}.position`,
            rootTimes,
            new Float32Array([
              parentBasePos.x,
              parentBasePos.y,
              parentBasePos.z,
              parentBasePos.x,
              parentBasePos.y,
              parentBasePos.z,
            ])
          )
        );
      }
    }
    for (const role of activeRoles) {
      const bone = targetBones[role];
      const vals = quatValuesMap.get(role);
      if (!bone || !bone.name || !vals) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, vals));
    }
    if (targetBones.hips && targetBones.hips.name && hipsPosValues) {
      tracks.push(new THREE.VectorKeyframeTrack(`${targetBones.hips.name}.position`, times, hipsPosValues));
    }

    return new THREE.AnimationClip(options.name, duration, tracks);
  }

  public dispose(): void {
    this.bakedClips.clear();
  }
}


