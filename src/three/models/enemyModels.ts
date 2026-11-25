import * as THREE from 'three';
import { CharacterBones } from './gltfObitoLoader';
import {
  createAkatsukiCloakTexture,
  createEnemyFaceTexture,
  createGunbaiTexture,
  createKonohaPlateTexture,
  createMadaraArmorTexture,
  createMinatoCloakTexture,
  createSasukeTopTexture,
} from '../textures';

export type EnemyKind =
  | 'zetsu'
  | 'rogue'
  | 'itachi'
  | 'pain'
  | 'kakashi'
  | 'sasuke'
  | 'minato'
  | 'naruto'
  | 'madara';

export interface EnemyRig {
  root: THREE.Group;
  pivotGroup: THREE.Group;
  bones: CharacterBones;
  baseBoneRotations: Map<THREE.Bone, THREE.Euler>;
  baseBonePositions: Map<THREE.Bone, THREE.Vector3>;
  auraMesh: THREE.Mesh | null;
  handOrbMesh: THREE.Mesh | null;
  setHitFlash: (active: boolean, flashHex?: number) => void;
  dispose: () => void;
}

type SkinRegion =
  | 'torso'
  | 'head'
  | 'leftUpperArm'
  | 'leftForearm'
  | 'rightUpperArm'
  | 'rightForearm'
  | 'leftThigh'
  | 'leftShin'
  | 'leftFoot'
  | 'rightThigh'
  | 'rightShin'
  | 'rightFoot';

interface TaggedGeo {
  geo: THREE.BufferGeometry;
  region: SkinRegion;
  matKey: string;
}

interface LoftRing {
  pos: THREE.Vector3;
  rx: number;
  rz: number;
}

let sharedStormToonGradient: THREE.DataTexture | null = null;

/**
 * Shared 3-band NearestFilter cel-shading ramp matching Tobi v2's Naruto Ultimate Ninja Storm 4 look.
 */
function getStormToonGradient(): THREE.DataTexture {
  if (!sharedStormToonGradient) {
    const ramp = new Uint8Array([124, 206, 255]);
    const tex = new THREE.DataTexture(ramp, 3, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    sharedStormToonGradient = tex;
  }
  return sharedStormToonGradient;
}

function createStormToonMat(params: {
  color?: number;
  map?: THREE.Texture;
  side?: THREE.Side;
}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: params.color ?? 0xffffff,
    map: params.map ?? null,
    gradientMap: getStormToonGradient(),
    side: params.side ?? THREE.FrontSide,
  });
}

function createStormInkOutlineMat(thickness = 0.0085): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x15171e,
    side: THREE.BackSide,
  });
  mat.customProgramCacheKey = () => `storm4_ink_outline_${thickness.toFixed(4)}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n\ttransformed += normalize( normal ) * ${thickness.toFixed(5)};`
    );
  };
  return mat;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Verifies triangle winding against an interior spine/reference point so normals
 * consistently face outward (essential for Storm 4 BackSide ink outlines).
 */
function ensureOutwardWindingAgainstRef(
  positions: number[],
  indices: number[],
  refPoint: THREE.Vector3
): void {
  if (indices.length < 3) return;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceNorm = new THREE.Vector3();
  const toFace = new THREE.Vector3();

  let signedSum = 0;
  const sampleStep = Math.max(1, Math.floor(indices.length / 3 / 16)) * 3;
  for (let i = 0; i + 2 < indices.length; i += sampleStep) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    a.set(positions[i0], positions[i0 + 1], positions[i0 + 2]);
    b.set(positions[i1], positions[i1 + 1], positions[i1 + 2]);
    c.set(positions[i2], positions[i2 + 1], positions[i2 + 2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    faceNorm.crossVectors(ab, ac);
    toFace.subVectors(a, refPoint);
    signedSum += faceNorm.dot(toFace);
  }

  if (signedSum < 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
  }
}

/**
 * Builds an organic smooth closed elliptical loft through arbitrary 3D rings.
 */
function createLoftedLimbGeo(rings: LoftRing[], radialSegs = 20, capEnds = true): THREE.BufferGeometry {
  const n = rings.length;
  const cols = radialSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = rings[Math.max(0, i - 1)].pos;
    const next = rings[Math.min(n - 1, i + 1)].pos;
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-8) t.set(0, 1, 0);
    t.normalize();
    tangents.push(t);
  }

  const refFwd = new THREE.Vector3(0, 0, 1);
  const sideAxis = new THREE.Vector3();
  const fwdAxis = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const t = tangents[i];
    if (Math.abs(t.dot(refFwd)) > 0.92) {
      sideAxis.set(1, 0, 0);
      fwdAxis.crossVectors(sideAxis, t).normalize();
      sideAxis.crossVectors(t, fwdAxis).normalize();
    } else {
      sideAxis.crossVectors(t, refFwd).normalize();
      fwdAxis.crossVectors(sideAxis, t).normalize();
    }

    const v = i / Math.max(1, n - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const px = r.pos.x + sideAxis.x * (cosT * r.rx) + fwdAxis.x * (sinT * r.rz);
      const py = r.pos.y + sideAxis.y * (cosT * r.rx) + fwdAxis.y * (sinT * r.rz);
      const pz = r.pos.z + sideAxis.z * (cosT * r.rx) + fwdAxis.z * (sinT * r.rz);

      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = (i + 1) * cols + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  if (capEnds && n >= 2) {
    const startCenterIdx = positions.length / 3;
    positions.push(rings[0].pos.x, rings[0].pos.y, rings[0].pos.z);
    uvs.push(0.5, 0);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(startCenterIdx, j, j + 1);
    }

    const endRingStart = (n - 1) * cols;
    const endCenterIdx = positions.length / 3;
    positions.push(rings[n - 1].pos.x, rings[n - 1].pos.y, rings[n - 1].pos.z);
    uvs.push(0.5, 1);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(endCenterIdx, endRingStart + j + 1, endRingStart + j);
    }
  }

  if (n >= 2) {
    const midRing = rings[Math.floor(n / 2)].pos;
    ensureOutwardWindingAgainstRef(positions, indices, midRing);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a vertical sculpted profile (chest/jacket/cloak/vest/neck/belt).
 * Note: u=0 and u=1 sit on +Z front (`sin(0)=0, cos(0)=+1`), while u=0.5 sits on -Z back.
 */
function createSculptedVerticalGeo(
  profile: Array<{ y: number; rx: number; rz: number; z?: number; x?: number }>,
  radialSegs = 24,
  capEnds = true
): THREE.BufferGeometry {
  const n = profile.length;
  const cols = radialSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const ring = profile[i];
    const v = i / Math.max(1, n - 1);
    const ox = ring.x ?? 0;
    const oz = ring.z ?? 0;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const px = ox + Math.sin(theta) * ring.rx;
      const pz = oz + Math.cos(theta) * ring.rz;
      positions.push(px, ring.y, pz);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = (i + 1) * cols + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  if (capEnds && n >= 2) {
    const first = profile[0];
    const botIdx = positions.length / 3;
    positions.push(first.x ?? 0, first.y, first.z ?? 0);
    uvs.push(0.5, 0);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(botIdx, j + 1, j);
    }

    const last = profile[n - 1];
    const topStart = (n - 1) * cols;
    const topIdx = positions.length / 3;
    positions.push(last.x ?? 0, last.y, last.z ?? 0);
    uvs.push(0.5, 1);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(topIdx, topStart + j, topStart + j + 1);
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
 * Builds a sculpted curved organic anime head centered at `centerY` with tapered jawline,
 * sculpted cheekbones, subtle nose relief, and clean frontal UV projection for the face texture.
 */
function createSculptedAnimeHeadGeo(centerY: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const jawTaper = y < 0 ? 1 - Math.abs(y) * 0.28 : 1 + Math.sin(y * Math.PI) * 0.04;
    x *= 0.128 * jawTaper;
    y *= 0.152;
    z *= 0.132 * (y < 0 ? 0.94 + Math.max(0, 1 + y / 0.15) * 0.06 : 1);

    if (z > 0.05) {
      const noseProx = Math.exp(-Math.pow(x / 0.028, 2) - Math.pow((y + 0.015) / 0.036, 2));
      z += noseProx * 0.016;
      const chinProx = y < -0.04 ? Math.max(0, 1 - Math.abs(x) / 0.08) * (-y - 0.04) * 0.22 : 0;
      z += chinProx;
    }

    if (z > 0.01) {
      const uVal = THREE.MathUtils.clamp(0.5 + x / 0.215, 0.02, 0.98);
      const vVal = THREE.MathUtils.clamp(0.54 + y / 0.255, 0.02, 0.98);
      uv.setXY(i, uVal, vVal);
    } else {
      if (y < -0.008) {
        uv.setXY(i, 0.5, 0.10);
      } else {
        uv.setXY(i, 0.05, 0.88);
      }
    }

    pos.setXYZ(i, x, centerY + y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sleek curved tapered anime hair lock with verified outward triangle winding.
 */
function createCurvedHairLockGeo(
  pts: THREE.Vector3[],
  baseRx: number,
  baseRz: number,
  steps = 9,
  radialSegs = 10
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(steps, false);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = radialSegs + 1;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    const taper = Math.pow(Math.max(0.015, 1 - t), 0.72);
    const rx = baseRx * taper;
    const rz = baseRz * taper;
    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const vx = p.x + N.x * (cosT * rx) + B.x * (sinT * rz);
      const vy = p.y + N.y * (cosT * rx) + B.y * (sinT * rz);
      const vz = p.z + N.z * (cosT * rx) + B.z * (sinT * rz);
      positions.push(vx, vy, vz);
      uvs.push(u, t);
    }
  }

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = (i + 1) * cols + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const rootCenter = positions.length / 3;
  const p0 = curve.getPointAt(0);
  positions.push(p0.x, p0.y, p0.z);
  uvs.push(0.5, 0);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(rootCenter, j + 1, j);
  }

  ensureOutwardWindingAgainstRef(positions, indices, curve.getPointAt(0.35));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a thin curved band / plate shell (headband cloth, forehead metal plate, belt, collar).
 */
function createCurvedArcShellGeo(
  centerY: number,
  rx: number,
  rz: number,
  height: number,
  thickness: number,
  thetaStart: number,
  thetaLength: number,
  arcSegs = 24,
  tiltZ = 0
): THREE.BufferGeometry {
  const innerRx = rx - thickness * 0.5;
  const outerRx = rx + thickness * 0.5;
  const innerRz = rz - thickness * 0.5;
  const outerRz = rz + thickness * 0.5;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = arcSegs + 1;
  const cosTilt = Math.cos(tiltZ);
  const sinTilt = Math.sin(tiltZ);

  const pushArcVertex = (theta: number, yLocal: number, radiusX: number, radiusZ: number, u: number, v: number) => {
    const xRaw = Math.sin(theta) * radiusX;
    const zRaw = Math.cos(theta) * radiusZ;
    const xr = xRaw * cosTilt - yLocal * sinTilt;
    const yr = xRaw * sinTilt + yLocal * cosTilt;
    positions.push(xr, centerY + yr, zRaw);
    uvs.push(u, v);
  };

  const halfH = height * 0.5;
  const specs: Array<[number, number, number, number]> = [
    [-halfH, outerRx, outerRz, 0],
    [halfH, outerRx, outerRz, 1],
    [halfH, innerRx, innerRz, 1],
    [-halfH, innerRx, innerRz, 0],
  ];

  for (let row = 0; row < 4; row++) {
    const [yL, rX, rZ, vVal] = specs[row];
    for (let j = 0; j <= arcSegs; j++) {
      const u = j / arcSegs;
      const theta = thetaStart + u * thetaLength;
      pushArcVertex(theta, yL, rX, rZ, u, vVal);
    }
  }

  for (let row = 0; row < 4; row++) {
    const nextRow = (row + 1) % 4;
    for (let j = 0; j < arcSegs; j++) {
      const a = row * cols + j;
      const b = a + 1;
      const c = nextRow * cols + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  if (thetaLength < Math.PI * 1.99) {
    indices.push(0, 3 * cols, cols);
    indices.push(cols, 3 * cols, 2 * cols);
    const e0 = arcSegs;
    const e1 = cols + arcSegs;
    const e2 = 2 * cols + arcSegs;
    const e3 = 3 * cols + arcSegs;
    indices.push(e0, e1, e3);
    indices.push(e1, e2, e3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an open-toe shinobi sandal contoured cleanly around the foot bone.
 */
function createSculptedSandalGeo(footX: number): THREE.BufferGeometry {
  const rings: LoftRing[] = [
    { pos: new THREE.Vector3(footX, 0.032, -0.068), rx: 0.056, rz: 0.032 },
    { pos: new THREE.Vector3(footX, 0.038, -0.015), rx: 0.059, rz: 0.035 },
    { pos: new THREE.Vector3(footX, 0.036, 0.055), rx: 0.062, rz: 0.032 },
    { pos: new THREE.Vector3(footX, 0.026, 0.125), rx: 0.055, rz: 0.022 },
  ];
  return createLoftedLimbGeo(rings, 14, true);
}

/**
 * Builds a twisted rope waist belt (Sasuke's iconic purple Orochimaru shimenawa rope).
 */
function createRopeBeltGeo(centerY: number, rx: number, rz: number): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(1, 0.034, 10, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    const radialOffset = r - 1;
    const twist = Math.sin(angle * 10 + z * 12) * 0.004;
    const nx = Math.cos(angle) * (rx + radialOffset + twist);
    const nz = Math.sin(angle) * (rz + radialOffset + twist);
    pos.setXYZ(i, nx, centerY + z * 1.15, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Merges tagged geometries sharing a material, computes skinWeights against our 14-bone skeleton,
 * and returns both the Storm 4 cel-shaded SkinnedMesh and its matching BackSide black ink outline SkinnedMesh.
 */
function mergeAndSkinRegionGeos(
  parts: TaggedGeo[],
  skeleton: THREE.Skeleton,
  material: THREE.Material,
  outlineMaterial: THREE.Material
): { mesh: THREE.SkinnedMesh; outline: THREE.SkinnedMesh } {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const p of parts) {
    totalVerts += p.geo.attributes.position.count;
    totalIndices += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const skinIndices = new Uint16Array(totalVerts * 4);
  const skinWeights = new Float32Array(totalVerts * 4);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const p of parts) {
    const posAttr = p.geo.attributes.position;
    const normAttr = p.geo.attributes.normal;
    const uvAttr = p.geo.attributes.uv;
    const count = posAttr.count;

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const vi3 = (vOffset + i) * 3;
      const vi2 = (vOffset + i) * 2;
      const vi4 = (vOffset + i) * 4;

      positions[vi3] = vx;
      positions[vi3 + 1] = vy;
      positions[vi3 + 2] = vz;

      normals[vi3] = normAttr ? normAttr.getX(i) : 0;
      normals[vi3 + 1] = normAttr ? normAttr.getY(i) : 1;
      normals[vi3 + 2] = normAttr ? normAttr.getZ(i) : 0;

      uvs[vi2] = uvAttr ? uvAttr.getX(i) : 0.5;
      uvs[vi2 + 1] = uvAttr ? uvAttr.getY(i) : 0.5;

      let b0 = 0, w0 = 1;
      let b1 = 0, w1 = 0;
      let b2 = 0, w2 = 0;

      switch (p.region) {
        case 'torso': {
          const tSpine = smoothstep(0.96, 1.16, vy);
          const tChest = smoothstep(1.18, 1.38, vy);
          b0 = 0;
          b1 = 1;
          b2 = 2;
          w0 = 1 - tSpine;
          w1 = tSpine * (1 - tChest);
          w2 = tSpine * tChest;
          break;
        }
        case 'head': {
          const tNeck = smoothstep(1.48, 1.59, vy);
          b0 = 2;
          b1 = 3;
          w0 = 1 - tNeck;
          w1 = tNeck;
          break;
        }
        case 'leftUpperArm': {
          const tElbow = smoothstep(0.29, 0.34, vx);
          b0 = 4;
          b1 = 5;
          w0 = 1 - tElbow * 0.25;
          w1 = tElbow * 0.25;
          break;
        }
        case 'leftForearm': {
          const tWrist = smoothstep(0.30, 0.36, vx);
          b0 = 4;
          b1 = 5;
          w0 = 1 - tWrist;
          w1 = tWrist;
          break;
        }
        case 'rightUpperArm': {
          const tElbow = smoothstep(-0.29, -0.34, vx);
          b0 = 6;
          b1 = 7;
          w0 = 1 - tElbow * 0.25;
          w1 = tElbow * 0.25;
          break;
        }
        case 'rightForearm': {
          const tWrist = smoothstep(-0.30, -0.36, vx);
          b0 = 6;
          b1 = 7;
          w0 = 1 - tWrist;
          w1 = tWrist;
          break;
        }
        case 'leftThigh': {
          const tHip = smoothstep(0.96, 0.88, vy);
          const tKnee = smoothstep(0.55, 0.47, vy);
          b0 = 0;
          b1 = 8;
          b2 = 10;
          w0 = 1 - tHip;
          w1 = tHip * (1 - tKnee * 0.4);
          w2 = tHip * tKnee * 0.4;
          break;
        }
        case 'leftShin': {
          const tKnee = smoothstep(0.54, 0.46, vy);
          const tAnkle = smoothstep(0.14, 0.07, vy);
          b0 = 8;
          b1 = 10;
          b2 = 12;
          w0 = 1 - tKnee;
          w1 = tKnee * (1 - tAnkle);
          w2 = tKnee * tAnkle;
          break;
        }
        case 'leftFoot': {
          b0 = 12;
          w0 = 1;
          break;
        }
        case 'rightThigh': {
          const tHip = smoothstep(0.96, 0.88, vy);
          const tKnee = smoothstep(0.55, 0.47, vy);
          b0 = 0;
          b1 = 9;
          b2 = 11;
          w0 = 1 - tHip;
          w1 = tHip * (1 - tKnee * 0.4);
          w2 = tHip * tKnee * 0.4;
          break;
        }
        case 'rightShin': {
          const tKnee = smoothstep(0.54, 0.46, vy);
          const tAnkle = smoothstep(0.14, 0.07, vy);
          b0 = 9;
          b1 = 11;
          b2 = 13;
          w0 = 1 - tKnee;
          w1 = tKnee * (1 - tAnkle);
          w2 = tKnee * tAnkle;
          break;
        }
        case 'rightFoot': {
          b0 = 13;
          w0 = 1;
          break;
        }
      }

      const sum = w0 + w1 + w2 || 1;
      skinIndices[vi4] = b0;
      skinIndices[vi4 + 1] = b1;
      skinIndices[vi4 + 2] = b2;
      skinIndices[vi4 + 3] = 0;

      skinWeights[vi4] = w0 / sum;
      skinWeights[vi4 + 1] = w1 / sum;
      skinWeights[vi4 + 2] = w2 / sum;
      skinWeights[vi4 + 3] = 0;
    }

    if (p.geo.index) {
      const idxArr = p.geo.index.array;
      for (let k = 0; k < idxArr.length; k++) {
        indices[iOffset + k] = idxArr[k] + vOffset;
      }
      iOffset += idxArr.length;
    } else {
      for (let k = 0; k < count; k++) {
        indices[iOffset + k] = vOffset + k;
      }
      iOffset += count;
    }

    vOffset += count;
    p.geo.dispose();
  }

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  mergedGeo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  mergedGeo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
  mergedGeo.setIndex(new THREE.BufferAttribute(indices, 1));
  mergedGeo.computeBoundingSphere();

  const skinned = new THREE.SkinnedMesh(mergedGeo, material);
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  skinned.bind(skeleton);

  const outline = new THREE.SkinnedMesh(mergedGeo, outlineMaterial);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.frustumCulled = false;
  outline.bind(skeleton);

  return { mesh: skinned, outline };
}

/**
 * Builds a complete Naruto Ultimate Ninja Storm 4 cel-shaded & ink-outlined 3D enemy
 * matching Tobi v2's exact anime style on the 14-bone A-pose Skeleton.
 */
export function createEnemyModel(kind: EnemyKind, maxAniso = 8): EnemyRig {
  const root = new THREE.Group();
  const pivotGroup = new THREE.Group();
  root.add(pivotGroup);

  const characterScale =
    kind === 'madara'
      ? 1.05
      : kind === 'naruto'
        ? 1.04
        : kind === 'kakashi' || kind === 'pain' || kind === 'minato'
          ? 1.03
          : kind === 'itachi' || kind === 'sasuke'
            ? 1.01
            : kind === 'zetsu'
              ? 0.95
              : 0.99;
  pivotGroup.scale.setScalar(characterScale);

  // 1. 14-bone anatomical A-pose Skeleton (facing +Z, Y-up)
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.96, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.16, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.19, 0);
  spine.add(chest);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.28, 0);
  chest.add(head);

  const leftUpperArm = new THREE.Bone();
  leftUpperArm.name = 'LeftUpperArm';
  leftUpperArm.position.set(0.185, 0.17, 0);
  chest.add(leftUpperArm);

  const leftForearm = new THREE.Bone();
  leftForearm.name = 'LeftForearm';
  leftForearm.position.set(0.14, -0.22, 0.01);
  leftUpperArm.add(leftForearm);

  const rightUpperArm = new THREE.Bone();
  rightUpperArm.name = 'RightUpperArm';
  rightUpperArm.position.set(-0.185, 0.17, 0);
  chest.add(rightUpperArm);

  const rightForearm = new THREE.Bone();
  rightForearm.name = 'RightForearm';
  rightForearm.position.set(-0.14, -0.22, 0.01);
  rightUpperArm.add(rightForearm);

  const leftThigh = new THREE.Bone();
  leftThigh.name = 'LeftThigh';
  leftThigh.position.set(0.105, -0.02, 0);
  hips.add(leftThigh);

  const rightThigh = new THREE.Bone();
  rightThigh.name = 'RightThigh';
  rightThigh.position.set(-0.105, -0.02, 0);
  hips.add(rightThigh);

  const leftShin = new THREE.Bone();
  leftShin.name = 'LeftShin';
  leftShin.position.set(0, -0.44, 0);
  leftThigh.add(leftShin);

  const rightShin = new THREE.Bone();
  rightShin.name = 'RightShin';
  rightShin.position.set(0, -0.44, 0);
  rightThigh.add(rightShin);

  const leftFoot = new THREE.Bone();
  leftFoot.name = 'LeftFoot';
  leftFoot.position.set(0, -0.42, 0);
  leftShin.add(leftFoot);

  const rightFoot = new THREE.Bone();
  rightFoot.name = 'RightFoot';
  rightFoot.position.set(0, -0.42, 0);
  rightShin.add(rightFoot);

  pivotGroup.add(hips);
  pivotGroup.updateMatrixWorld(true);

  const boneList = [
    hips,
    spine,
    chest,
    head,
    leftUpperArm,
    leftForearm,
    rightUpperArm,
    rightForearm,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftFoot,
    rightFoot,
  ];
  const skeleton = new THREE.Skeleton(boneList);
  skeleton.calculateInverses();

  const bones: CharacterBones = {
    hips,
    spine,
    chest,
    head,
    leftShoulder: null,
    leftUpperArm,
    leftForearm,
    leftHand: null,
    rightShoulder: null,
    rightUpperArm,
    rightForearm,
    rightHand: null,
    leftThigh,
    rightThigh,
    leftShin,
    rightShin,
    leftFoot,
    rightFoot,
  };

  // 2. Storm 4 Cel-Shaded Toon Materials & Ink Outlines
  const faceTex = createEnemyFaceTexture(kind, maxAniso);
  const plateTex = createKonohaPlateTexture(
    maxAniso,
    kind === 'rogue' || kind === 'itachi' || kind === 'pain',
    kind === 'pain' ? 'amegakure' : 'konoha'
  );
  const ownedTextures: THREE.Texture[] = [faceTex, plateTex];

  const isAkatsuki = kind === 'itachi' || kind === 'pain';
  let cloakTex: THREE.CanvasTexture | null = null;
  let minatoCloakTex: THREE.CanvasTexture | null = null;
  let madaraArmorTex: THREE.CanvasTexture | null = null;
  let sasukeTopTex: THREE.CanvasTexture | null = null;
  let gunbaiTex: THREE.CanvasTexture | null = null;

  if (isAkatsuki) {
    cloakTex = createAkatsukiCloakTexture(maxAniso);
    ownedTextures.push(cloakTex);
  }
  if (kind === 'minato') {
    minatoCloakTex = createMinatoCloakTexture(maxAniso);
    ownedTextures.push(minatoCloakTex);
  }
  if (kind === 'madara') {
    madaraArmorTex = createMadaraArmorTexture(maxAniso);
    gunbaiTex = createGunbaiTexture(maxAniso);
    ownedTextures.push(madaraArmorTex, gunbaiTex);
  }
  if (kind === 'sasuke') {
    sasukeTopTex = createSasukeTopTexture(maxAniso);
    ownedTextures.push(sasukeTopTex);
  }

  const skinHex =
    kind === 'zetsu'
      ? 0xe2e8f0
      : kind === 'rogue' || kind === 'madara'
        ? 0xc8cfd9
        : kind === 'naruto' || kind === 'minato'
          ? 0xe8c09c
          : kind === 'sasuke'
            ? 0xecd0b8
            : 0xe5be9e;

  const hairHex =
    kind === 'kakashi'
      ? 0xdbe2ea
      : kind === 'naruto' || kind === 'minato'
        ? 0xfacc15
        : kind === 'pain'
          ? 0xea580c
          : kind === 'zetsu'
            ? 0x166534
            : 0x161820;

  const suitHex =
    kind === 'kakashi'
      ? 0x1e2b3e
      : kind === 'naruto'
        ? 0xf97316
        : kind === 'minato'
          ? 0x1c273b
          : kind === 'madara'
            ? 0x222638
            : kind === 'sasuke'
              ? 0x1f2436
              : kind === 'zetsu'
                ? 0xdbe3eb
                : 0x1c1e26;

  const secondaryHex =
    kind === 'kakashi' || kind === 'minato'
      ? 0x45664c
      : kind === 'naruto'
        ? 0x191b22
        : kind === 'sasuke'
          ? 0x7e22ce // Sasuke's iconic braided purple Orochimaru waist rope!
          : kind === 'madara'
            ? 0x9c242f
            : isAkatsuki
              ? 0x991b1b // Akatsuki crimson inner collar trim
              : kind === 'zetsu'
                ? 0x166534
                : 0x312e47;

  const bandHex =
    kind === 'kakashi' || kind === 'minato'
      ? 0x1e293b
      : kind === 'naruto'
        ? 0x1d4ed8
        : kind === 'sasuke'
          ? 0x363e5c
          : 0x14161e;

  const wrapHex = kind === 'naruto' ? 0xf1f5f9 : kind === 'sasuke' ? 0x1c202c : 0x15171e;

  const mats: Record<string, THREE.MeshToonMaterial> = {
    face: createStormToonMat({ map: faceTex }),
    skin: createStormToonMat({ color: skinHex }),
    hair: createStormToonMat({ color: hairHex }),
    suit: createStormToonMat({ color: suitHex }),
    secondary: createStormToonMat({ color: secondaryHex }),
    wrap: createStormToonMat({ color: wrapHex }),
    band: createStormToonMat({ color: bandHex }),
    plate: createStormToonMat({ map: plateTex }),
    crest: createStormToonMat({
      color: kind === 'madara' ? 0xe2e8f0 : kind === 'kakashi' || kind === 'naruto' ? 0xc81e2b : 0x22c55e,
    }),
  };

  if (cloakTex) {
    mats.cloak = createStormToonMat({ map: cloakTex, side: THREE.DoubleSide });
  }
  if (minatoCloakTex) {
    mats.hokageCloak = createStormToonMat({ map: minatoCloakTex, side: THREE.DoubleSide });
  }
  if (madaraArmorTex) {
    mats.armor = createStormToonMat({ map: madaraArmorTex });
  }
  if (sasukeTopTex) {
    mats.sasukeTop = createStormToonMat({ map: sasukeTopTex });
  }

  const outlineMat = createStormInkOutlineMat(0.0086);

  // 3. Sculpted Organic Parts Assembly
  const parts: TaggedGeo[] = [];
  const pushPart = (region: SkinRegion, matKey: string, geo: THREE.BufferGeometry) => {
    parts.push({ region, matKey, geo });
  };

  // --- Base Torso & Neck ---
  const baseTorsoMatKey =
    kind === 'sasuke' ? 'sasukeTop' : isAkatsuki ? 'cloak' : 'suit';

  pushPart(
    'torso',
    baseTorsoMatKey,
    createSculptedVerticalGeo([
      { y: 0.91, rx: 0.145, rz: 0.105, z: 0 },
      { y: 1.00, rx: 0.142, rz: 0.105, z: 0.004 },
      { y: 1.12, rx: 0.128, rz: 0.095, z: 0.008 },
      { y: 1.24, rx: 0.148, rz: 0.108, z: 0.012 },
      { y: 1.38, rx: 0.172, rz: 0.118, z: 0.014 },
      { y: 1.48, rx: 0.165, rz: 0.108, z: 0.006 },
      { y: 1.52, rx: 0.072, rz: 0.068, z: 0.0 },
    ])
  );

  // Organic Neck
  pushPart(
    'head',
    kind === 'kakashi' ? 'band' : 'skin',
    createSculptedVerticalGeo(
      [
        { y: 1.49, rx: 0.064, rz: 0.064, z: 0.002 },
        { y: 1.55, rx: 0.056, rz: 0.058, z: 0.004 },
        { y: 1.62, rx: 0.054, rz: 0.056, z: 0.006 },
      ],
      16
    )
  );

  // --- Character-Specific Storm 4 Outfits, Cloaks, Armor & Crests ---
  if (isAkatsuki) {
    // Draped flowing Akatsuki lower cloak skirt covering upper thighs (linked to torso hips/spine)
    pushPart(
      'torso',
      'cloak',
      createSculptedVerticalGeo(
        [
          { y: 0.44, rx: 0.255, rz: 0.205, z: -0.006 },
          { y: 0.68, rx: 0.220, rz: 0.170, z: -0.002 },
          { y: 0.92, rx: 0.170, rz: 0.130, z: 0.002 },
          { y: 1.05, rx: 0.155, rz: 0.118, z: 0.006 },
        ],
        26,
        false
      )
    );
    // Iconic Akatsuki towering high collar (black outer + crimson inner lining!)
    pushPart(
      'torso',
      'cloak',
      createCurvedArcShellGeo(1.57, 0.112, 0.108, 0.16, 0.022, Math.PI * 0.16, Math.PI * 1.68, 24)
    );
    pushPart(
      'torso',
      'secondary',
      createCurvedArcShellGeo(1.575, 0.101, 0.097, 0.155, 0.008, Math.PI * 0.16, Math.PI * 1.68, 24)
    );
  } else if (kind === 'minato') {
    // Jonin flak vest underneath Hokage haori
    pushPart(
      'torso',
      'secondary',
      createSculptedVerticalGeo([
        { y: 1.08, rx: 0.146, rz: 0.112, z: 0.008 },
        { y: 1.24, rx: 0.154, rz: 0.118, z: 0.014 },
        { y: 1.44, rx: 0.176, rz: 0.122, z: 0.012 },
      ])
    );
    // Fourth Hokage signature open-front white haori coat with crimson flame hem & 四代目火影 back kanji!
    pushPart(
      'torso',
      'hokageCloak',
      createSculptedVerticalGeo(
        [
          { y: 0.46, rx: 0.268, rz: 0.215, z: -0.012 },
          { y: 0.72, rx: 0.230, rz: 0.178, z: -0.006 },
          { y: 1.00, rx: 0.184, rz: 0.140, z: 0.002 },
          { y: 1.28, rx: 0.186, rz: 0.134, z: 0.006 },
          { y: 1.50, rx: 0.178, rz: 0.122, z: 0.004 },
        ],
        28,
        false
      )
    );
    // Raised crisp Hokage white haori collar
    pushPart(
      'torso',
      'hokageCloak',
      createCurvedArcShellGeo(1.545, 0.105, 0.102, 0.11, 0.022, Math.PI * 0.24, Math.PI * 1.52, 22)
    );
    pushPart(
      'torso',
      'band',
      createCurvedArcShellGeo(1.00, 0.152, 0.115, 0.065, 0.018, 0, Math.PI * 2, 22)
    );
  } else if (kind === 'madara') {
    // Layered crimson Edo Madara samurai torso armor
    pushPart(
      'torso',
      'armor',
      createSculptedVerticalGeo([
        { y: 1.06, rx: 0.152, rz: 0.118, z: 0.008 },
        { y: 1.22, rx: 0.156, rz: 0.124, z: 0.014 },
        { y: 1.38, rx: 0.184, rz: 0.132, z: 0.016 },
        { y: 1.49, rx: 0.178, rz: 0.118, z: 0.008 },
      ])
    );
    // Flared samurai armored waist tassets (kusazuri) over left/right/back hips
    pushPart(
      'torso',
      'armor',
      createCurvedArcShellGeo(0.84, 0.188, 0.152, 0.28, 0.026, Math.PI * 0.18, Math.PI * 1.64, 26)
    );
    // Layered samurai shoulder pauldrons (`sode`) attached cleanly to upper arms
    for (const isL of [true, false]) {
      const s = isL ? 1 : -1;
      const uReg: SkinRegion = isL ? 'leftUpperArm' : 'rightUpperArm';
      pushPart(
        uReg,
        'armor',
        createLoftedLimbGeo(
          [
            { pos: new THREE.Vector3(s * 0.168, 1.51, 0.0), rx: 0.082, rz: 0.095 },
            { pos: new THREE.Vector3(s * 0.248, 1.44, 0.004), rx: 0.078, rz: 0.092 },
            { pos: new THREE.Vector3(s * 0.302, 1.37, 0.006), rx: 0.068, rz: 0.080 },
          ],
          14
        )
      );
    }
    // White-slate obi waist sash
    pushPart(
      'torso',
      'crest',
      createCurvedArcShellGeo(1.01, 0.156, 0.122, 0.085, 0.024, 0, Math.PI * 2, 24)
    );
    // High dark samurai inner collar
    pushPart(
      'torso',
      'suit',
      createCurvedArcShellGeo(1.535, 0.092, 0.090, 0.085, 0.020, Math.PI * 0.22, Math.PI * 1.56, 20)
    );
  } else if (kind === 'sasuke') {
    // High-collar open white Uchiha shirt collar
    pushPart(
      'torso',
      'sasukeTop',
      createCurvedArcShellGeo(1.545, 0.098, 0.095, 0.105, 0.020, Math.PI * 0.20, Math.PI * 1.60, 22)
    );
    // Dark indigo waist cloth (`jinbaori` skirt wrap)
    pushPart(
      'torso',
      'band',
      createSculptedVerticalGeo([
        { y: 0.65, rx: 0.195, rz: 0.155, z: 0.0 },
        { y: 0.85, rx: 0.172, rz: 0.132, z: 0.004 },
        { y: 0.99, rx: 0.155, rz: 0.118, z: 0.006 },
      ])
    );
    // Iconic thick twisted purple Orochimaru waist rope + knotted back bow!
    pushPart('torso', 'secondary', createRopeBeltGeo(0.99, 0.162, 0.126));
    pushPart(
      'torso',
      'secondary',
      createCurvedHairLockGeo(
        [
          new THREE.Vector3(-0.04, 1.00, -0.135),
          new THREE.Vector3(-0.09, 0.96, -0.22),
          new THREE.Vector3(-0.11, 0.86, -0.25),
        ],
        0.048,
        0.042
      )
    );
    pushPart(
      'torso',
      'secondary',
      createCurvedHairLockGeo(
        [
          new THREE.Vector3(0.04, 1.00, -0.135),
          new THREE.Vector3(0.09, 0.96, -0.22),
          new THREE.Vector3(0.11, 0.86, -0.25),
        ],
        0.048,
        0.042
      )
    );
    // Sleek dark scabbard for Sword of Kusanagi angled across back/hip
    pushPart(
      'torso',
      'band',
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(-0.18, 0.78, -0.02), rx: 0.022, rz: 0.016 },
          { pos: new THREE.Vector3(0.02, 0.96, -0.155), rx: 0.022, rz: 0.016 },
          { pos: new THREE.Vector3(0.24, 1.16, -0.24), rx: 0.024, rz: 0.018 },
        ],
        10
      )
    );
  } else if (kind === 'kakashi') {
    pushPart(
      'torso',
      'secondary',
      createSculptedVerticalGeo([
        { y: 1.05, rx: 0.146, rz: 0.112, z: 0.008 },
        { y: 1.18, rx: 0.145, rz: 0.116, z: 0.014 },
        { y: 1.34, rx: 0.174, rz: 0.126, z: 0.018 },
        { y: 1.48, rx: 0.180, rz: 0.118, z: 0.010 },
        { y: 1.525, rx: 0.115, rz: 0.096, z: -0.008 },
      ])
    );
    pushPart(
      'torso',
      'secondary',
      createCurvedArcShellGeo(1.545, 0.095, 0.092, 0.095, 0.024, Math.PI * 0.25, Math.PI * 1.5, 20)
    );
    for (const px of [-0.075, 0.075]) {
      pushPart(
        'torso',
        'secondary',
        createSculptedVerticalGeo(
          [
            { y: 1.23, x: px, rx: 0.042, rz: 0.022, z: 0.128 },
            { y: 1.29, x: px, rx: 0.045, rz: 0.025, z: 0.132 },
            { y: 1.35, x: px, rx: 0.040, rz: 0.020, z: 0.126 },
          ],
          12
        )
      );
    }
    pushPart(
      'torso',
      'crest',
      createCurvedArcShellGeo(1.36, 0.055, 0.124, 0.09, 0.012, Math.PI * 0.85, Math.PI * 0.3, 12)
    );
    pushPart('torso', 'band', createCurvedArcShellGeo(0.99, 0.148, 0.112, 0.065, 0.018, 0, Math.PI * 2, 22));
  } else if (kind === 'naruto') {
    pushPart(
      'torso',
      'secondary',
      createSculptedVerticalGeo([
        { y: 1.31, rx: 0.174, rz: 0.120, z: 0.013 },
        { y: 1.41, rx: 0.182, rz: 0.124, z: 0.014 },
        { y: 1.49, rx: 0.172, rz: 0.112, z: 0.008 },
      ])
    );
    pushPart(
      'torso',
      'suit',
      createCurvedArcShellGeo(1.54, 0.092, 0.090, 0.09, 0.022, Math.PI * 0.22, Math.PI * 1.56, 20)
    );
    pushPart(
      'torso',
      'crest',
      createCurvedArcShellGeo(1.34, 0.06, 0.126, 0.095, 0.012, Math.PI * 0.84, Math.PI * 0.32, 12)
    );
    pushPart('torso', 'band', createCurvedArcShellGeo(0.99, 0.148, 0.112, 0.065, 0.018, 0, Math.PI * 2, 22));
  } else if (kind === 'zetsu') {
    for (const side of [-1, 1]) {
      pushPart(
        'torso',
        'secondary',
        createCurvedHairLockGeo(
          [
            new THREE.Vector3(side * 0.08, 1.46, 0.0),
            new THREE.Vector3(side * 0.18, 1.56, -0.02),
            new THREE.Vector3(side * 0.21, 1.72, -0.01),
            new THREE.Vector3(side * 0.15, 1.86, 0.02),
          ],
          0.075,
          0.022,
          10,
          12
        )
      );
    }
    pushPart('torso', 'secondary', createCurvedArcShellGeo(1.00, 0.148, 0.112, 0.08, 0.02, 0, Math.PI * 2, 22));
  } else {
    // Rogue / Edo armored breastplate + waist sash
    pushPart(
      'torso',
      'secondary',
      createSculptedVerticalGeo([
        { y: 1.14, rx: 0.146, rz: 0.112, z: 0.010 },
        { y: 1.32, rx: 0.174, rz: 0.124, z: 0.016 },
        { y: 1.48, rx: 0.178, rz: 0.116, z: 0.008 },
      ])
    );
    pushPart('torso', 'band', createCurvedArcShellGeo(1.01, 0.148, 0.112, 0.075, 0.022, 0, Math.PI * 2, 22));
  }

  // --- Sculpted Organic Anime Head + Forehead Headband + Storm 4 Hair ---
  const headCenterY = 1.695;
  pushPart('head', 'face', createSculptedAnimeHeadGeo(headCenterY));

  const hasHeadband =
    kind !== 'zetsu' && kind !== 'madara' && kind !== 'sasuke';

  if (hasHeadband) {
    const bandTilt = kind === 'kakashi' ? -0.13 : 0;
    const bandY = kind === 'kakashi' ? 1.73 : 1.765;
    pushPart(
      'head',
      'band',
      createCurvedArcShellGeo(bandY, 0.133, 0.137, 0.056, 0.014, 0, Math.PI * 2, 26, bandTilt)
    );
    pushPart(
      'head',
      'plate',
      createCurvedArcShellGeo(
        bandY,
        0.138,
        0.144,
        0.044,
        0.010,
        -0.46,
        0.92,
        14,
        bandTilt
      )
    );
  }

  if (kind === 'kakashi') {
    const locks: Array<[THREE.Vector3[], number, number]> = [
      [[new THREE.Vector3(0, 1.81, 0.02), new THREE.Vector3(-0.04, 1.93, 0.01), new THREE.Vector3(-0.08, 2.02, -0.02)], 0.058, 0.046],
      [[new THREE.Vector3(0.05, 1.80, 0.04), new THREE.Vector3(0.02, 1.94, 0.06), new THREE.Vector3(-0.02, 2.03, 0.04)], 0.052, 0.040],
      [[new THREE.Vector3(-0.05, 1.80, 0.03), new THREE.Vector3(-0.11, 1.92, 0.02), new THREE.Vector3(-0.16, 1.99, -0.02)], 0.050, 0.038],
      [[new THREE.Vector3(0.08, 1.79, -0.01), new THREE.Vector3(0.11, 1.91, -0.04), new THREE.Vector3(0.09, 1.98, -0.08)], 0.048, 0.038],
      [[new THREE.Vector3(-0.08, 1.79, -0.02), new THREE.Vector3(-0.16, 1.88, -0.05), new THREE.Vector3(-0.20, 1.93, -0.09)], 0.048, 0.038],
      [[new THREE.Vector3(0.04, 1.78, 0.11), new THREE.Vector3(0.09, 1.72, 0.135), new THREE.Vector3(0.11, 1.65, 0.11)], 0.032, 0.022],
      [[new THREE.Vector3(-0.04, 1.78, 0.11), new THREE.Vector3(-0.08, 1.74, 0.135), new THREE.Vector3(-0.11, 1.68, 0.115)], 0.028, 0.020],
      [[new THREE.Vector3(0, 1.79, -0.07), new THREE.Vector3(-0.03, 1.88, -0.16), new THREE.Vector3(-0.06, 1.93, -0.22)], 0.052, 0.040],
      [[new THREE.Vector3(0.07, 1.74, -0.08), new THREE.Vector3(0.12, 1.76, -0.17), new THREE.Vector3(0.14, 1.75, -0.22)], 0.046, 0.036],
      [[new THREE.Vector3(-0.07, 1.74, -0.08), new THREE.Vector3(-0.14, 1.76, -0.17), new THREE.Vector3(-0.17, 1.75, -0.22)], 0.046, 0.036],
      [[new THREE.Vector3(0, 1.69, -0.10), new THREE.Vector3(0, 1.67, -0.17), new THREE.Vector3(0, 1.60, -0.20)], 0.048, 0.034],
      [[new THREE.Vector3(0.11, 1.72, 0.01), new THREE.Vector3(0.14, 1.66, 0.03), new THREE.Vector3(0.13, 1.59, 0.04)], 0.028, 0.022],
      [[new THREE.Vector3(-0.11, 1.72, 0.01), new THREE.Vector3(-0.14, 1.66, 0.03), new THREE.Vector3(-0.13, 1.59, 0.04)], 0.028, 0.022],
    ];
    for (const [pts, rx, rz] of locks) {
      pushPart('head', 'hair', createCurvedHairLockGeo(pts, rx, rz));
    }
  } else if (kind === 'naruto' || kind === 'minato' || kind === 'pain') {
    // Bold spiky anime starburst crown (Naruto, Minato Yellow Flash bangs, Pain Deva spiky orange hair)
    const radialSpikes = kind === 'minato' ? 12 : 10;
    for (let s = 0; s < radialSpikes; s++) {
      const a = (s / radialSpikes) * Math.PI * 2;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const reach = kind === 'minato' ? 0.21 : 0.19;
      pushPart(
        'head',
        'hair',
        createCurvedHairLockGeo(
          [
            new THREE.Vector3(sx * 0.05, 1.80, sz * 0.05),
            new THREE.Vector3(sx * 0.13, 1.87, sz * 0.12),
            new THREE.Vector3(sx * reach, 1.89, sz * (reach - 0.02)),
          ],
          0.042,
          0.032
        )
      );
    }
    pushPart(
      'head',
      'hair',
      createCurvedHairLockGeo(
        [new THREE.Vector3(0, 1.82, 0), new THREE.Vector3(0, 1.92, 0.01), new THREE.Vector3(0, 1.98, 0.03)],
        0.048,
        0.038
      )
    );
    // Front forehead bangs (longer framing bangs for Minato!)
    const bangDepth = kind === 'minato' ? 1.62 : 1.70;
    for (const fx of [-0.08, -0.03, 0.03, 0.08]) {
      pushPart(
        'head',
        'hair',
        createCurvedHairLockGeo(
          [
            new THREE.Vector3(fx, 1.79, 0.105),
            new THREE.Vector3(fx * 1.15, 1.74, 0.145),
            new THREE.Vector3(fx * 1.1, Math.abs(fx) > 0.05 && kind === 'minato' ? bangDepth : 1.69, 0.135),
          ],
          0.025,
          0.018
        )
      );
    }
  } else if (kind === 'madara') {
    // Madara's signature wild waist-length spiky black mane cascading over back & shoulders!
    const crownCap: Array<[THREE.Vector3[], number, number]> = [
      [[new THREE.Vector3(0, 1.82, 0.02), new THREE.Vector3(0, 1.88, -0.06), new THREE.Vector3(0, 1.86, -0.17)], 0.085, 0.065],
      [[new THREE.Vector3(-0.07, 1.78, 0.06), new THREE.Vector3(-0.14, 1.70, 0.09), new THREE.Vector3(-0.12, 1.56, 0.08)], 0.036, 0.026],
      [[new THREE.Vector3(0.07, 1.78, 0.06), new THREE.Vector3(0.14, 1.70, 0.09), new THREE.Vector3(0.12, 1.56, 0.08)], 0.036, 0.026],
      [[new THREE.Vector3(-0.02, 1.81, 0.11), new THREE.Vector3(-0.03, 1.73, 0.145), new THREE.Vector3(-0.02, 1.65, 0.135)], 0.028, 0.020],
      [[new THREE.Vector3(0.03, 1.81, 0.11), new THREE.Vector3(0.05, 1.74, 0.142), new THREE.Vector3(0.04, 1.66, 0.13)], 0.026, 0.018],
    ];
    for (const [pts, rx, rz] of crownCap) {
      pushPart('head', 'hair', createCurvedHairLockGeo(pts, rx, rz));
    }
    // Wild spiky back mane tufts cascading onto upper back (torso region so back hair sways with spine/chest!)
    for (let m = 0; m < 7; m++) {
      const mx = (m - 3) * 0.065;
      const flareX = mx * 1.45;
      pushPart(
        'torso',
        'hair',
        createCurvedHairLockGeo(
          [
            new THREE.Vector3(mx * 0.7, 1.64, -0.09),
            new THREE.Vector3(flareX * 0.9, 1.42, -0.16 - Math.abs(mx) * 0.15),
            new THREE.Vector3(flareX * 1.15, 1.12 - (m % 2) * 0.09, -0.19),
          ],
          0.052,
          0.036
        )
      );
    }
  } else if (kind === 'sasuke') {
    // Sasuke's iconic spiky swept-back "duckbutt" crown + long face-framing bangs
    const sasukeSpikes: Array<[THREE.Vector3[], number, number]> = [
      [[new THREE.Vector3(0, 1.81, -0.01), new THREE.Vector3(0, 1.91, -0.12), new THREE.Vector3(0, 1.93, -0.24)], 0.062, 0.048],
      [[new THREE.Vector3(-0.06, 1.79, -0.02), new THREE.Vector3(-0.14, 1.86, -0.14), new THREE.Vector3(-0.18, 1.87, -0.24)], 0.054, 0.040],
      [[new THREE.Vector3(0.06, 1.79, -0.02), new THREE.Vector3(0.14, 1.86, -0.14), new THREE.Vector3(0.18, 1.87, -0.24)], 0.054, 0.040],
      [[new THREE.Vector3(-0.07, 1.73, -0.06), new THREE.Vector3(-0.16, 1.75, -0.17), new THREE.Vector3(-0.22, 1.74, -0.22)], 0.048, 0.036],
      [[new THREE.Vector3(0.07, 1.73, -0.06), new THREE.Vector3(0.16, 1.75, -0.17), new THREE.Vector3(0.22, 1.74, -0.22)], 0.048, 0.036],
      [[new THREE.Vector3(0, 1.69, -0.09), new THREE.Vector3(0, 1.65, -0.17), new THREE.Vector3(0, 1.56, -0.19)], 0.050, 0.036],
      // Iconic Uchiha framing bangs
      [[new THREE.Vector3(-0.08, 1.79, 0.09), new THREE.Vector3(-0.12, 1.70, 0.13), new THREE.Vector3(-0.10, 1.57, 0.10)], 0.032, 0.024],
      [[new THREE.Vector3(0.08, 1.79, 0.09), new THREE.Vector3(0.12, 1.70, 0.13), new THREE.Vector3(0.10, 1.57, 0.10)], 0.032, 0.024],
      [[new THREE.Vector3(0, 1.80, 0.09), new THREE.Vector3(-0.01, 1.74, 0.142), new THREE.Vector3(0.01, 1.67, 0.132)], 0.026, 0.018],
    ];
    for (const [pts, rx, rz] of sasukeSpikes) {
      pushPart('head', 'hair', createCurvedHairLockGeo(pts, rx, rz));
    }
  } else if (kind === 'itachi') {
    // Sleek raven hair with center parting bangs + iconic low back ponytail
    const itachiHair: Array<[THREE.Vector3[], number, number]> = [
      [[new THREE.Vector3(0, 1.80, 0.02), new THREE.Vector3(0, 1.81, -0.08), new THREE.Vector3(0, 1.72, -0.14)], 0.092, 0.072],
      [[new THREE.Vector3(-0.08, 1.77, 0.08), new THREE.Vector3(-0.125, 1.67, 0.12), new THREE.Vector3(-0.11, 1.54, 0.09)], 0.030, 0.022],
      [[new THREE.Vector3(0.08, 1.77, 0.08), new THREE.Vector3(0.125, 1.67, 0.12), new THREE.Vector3(0.11, 1.54, 0.09)], 0.030, 0.022],
    ];
    for (const [pts, rx, rz] of itachiHair) {
      pushPart('head', 'hair', createCurvedHairLockGeo(pts, rx, rz));
    }
    // Ponytail trailing down upper back
    pushPart(
      'torso',
      'hair',
      createCurvedHairLockGeo(
        [
          new THREE.Vector3(0, 1.64, -0.12),
          new THREE.Vector3(0, 1.52, -0.17),
          new THREE.Vector3(0, 1.35, -0.16),
        ],
        0.042,
        0.032
      )
    );
  } else {
    // Zetsu & Rogue tousled spiky anime hair
    const count = 9;
    for (let s = 0; s < count; s++) {
      const a = (s / count) * Math.PI * 2;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      pushPart(
        'head',
        'hair',
        createCurvedHairLockGeo(
          [
            new THREE.Vector3(sx * 0.05, 1.80, sz * 0.05),
            new THREE.Vector3(sx * 0.11, 1.86, sz * 0.11),
            new THREE.Vector3(sx * 0.14, 1.84, sz * 0.15),
          ],
          0.044,
          0.034
        )
      );
    }
  }

  // --- Arms & Hands in Natural 32° A-Pose ---
  for (const isLeft of [true, false]) {
    const s = isLeft ? 1 : -1;
    const upperReg: SkinRegion = isLeft ? 'leftUpperArm' : 'rightUpperArm';
    const foreReg: SkinRegion = isLeft ? 'leftForearm' : 'rightForearm';

    const sleeveMat = isAkatsuki
      ? 'cloak'
      : kind === 'sasuke'
        ? 'sasukeTop'
        : kind === 'madara'
          ? 'suit'
          : 'suit';

    const forearmMat =
      kind === 'sasuke'
        ? 'wrap' // Sasuke's dark charcoal forearm guards (`tekkou`)
        : isAkatsuki
          ? 'cloak'
          : 'suit';

    pushPart(
      upperReg,
      sleeveMat,
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(s * 0.165, 1.48, 0), rx: 0.064, rz: 0.064 },
          { pos: new THREE.Vector3(s * 0.215, 1.43, 0.002), rx: 0.062, rz: 0.060 },
          { pos: new THREE.Vector3(s * 0.275, 1.34, 0.006), rx: 0.054, rz: 0.052 },
          { pos: new THREE.Vector3(s * 0.325, 1.26, 0.010), rx: isAkatsuki ? 0.056 : 0.046, rz: isAkatsuki ? 0.056 : 0.045 },
        ],
        16
      )
    );

    pushPart(
      foreReg,
      forearmMat,
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(s * 0.322, 1.265, 0.010), rx: isAkatsuki ? 0.060 : 0.046, rz: isAkatsuki ? 0.060 : 0.045 },
          { pos: new THREE.Vector3(s * 0.375, 1.175, 0.024), rx: isAkatsuki ? 0.064 : 0.044, rz: isAkatsuki ? 0.064 : 0.043 },
          { pos: new THREE.Vector3(s * 0.422, 1.095, 0.036), rx: isAkatsuki ? 0.066 : 0.036, rz: isAkatsuki ? 0.066 : 0.035 },
        ],
        16
      )
    );

    pushPart(
      foreReg,
      'band',
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(s * 0.415, 1.105, 0.034), rx: 0.039, rz: 0.038 },
          { pos: new THREE.Vector3(s * 0.445, 1.055, 0.042), rx: 0.038, rz: 0.035 },
        ],
        14
      )
    );

    pushPart(
      foreReg,
      'skin',
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(s * 0.442, 1.055, 0.042), rx: 0.034, rz: 0.028 },
          { pos: new THREE.Vector3(s * 0.468, 1.010, 0.048), rx: 0.040, rz: 0.032 },
          { pos: new THREE.Vector3(s * 0.482, 0.978, 0.046), rx: 0.026, rz: 0.020 },
        ],
        14
      )
    );
  }

  // --- Athletic Legs, Gaiter Wraps & Open-Toe Shinobi Sandals ---
  for (const isLeft of [true, false]) {
    const s = isLeft ? 1 : -1;
    const lx = s * 0.105;
    const thighReg: SkinRegion = isLeft ? 'leftThigh' : 'rightThigh';
    const shinReg: SkinRegion = isLeft ? 'leftShin' : 'rightShin';
    const footReg: SkinRegion = isLeft ? 'leftFoot' : 'rightFoot';

    const legColorKey = kind === 'zetsu' ? 'secondary' : 'suit';

    pushPart(
      thighReg,
      legColorKey,
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(lx, 0.95, 0), rx: 0.086, rz: 0.088 },
          { pos: new THREE.Vector3(lx, 0.78, 0.008), rx: 0.078, rz: 0.082 },
          { pos: new THREE.Vector3(lx, 0.60, 0.004), rx: 0.064, rz: 0.066 },
          { pos: new THREE.Vector3(lx, 0.49, 0.0), rx: 0.058, rz: 0.060 },
        ],
        18
      )
    );

    if (!isLeft && !isAkatsuki) {
      pushPart(
        thighReg,
        'wrap',
        createLoftedLimbGeo(
          [
            { pos: new THREE.Vector3(lx, 0.76, 0.008), rx: 0.083, rz: 0.085 },
            { pos: new THREE.Vector3(lx, 0.69, 0.006), rx: 0.078, rz: 0.080 },
          ],
          16
        )
      );
    }

    pushPart(
      shinReg,
      'wrap',
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(lx, 0.50, 0), rx: 0.056, rz: 0.058 },
          { pos: new THREE.Vector3(lx, 0.36, -0.012), rx: 0.062, rz: 0.068 },
          { pos: new THREE.Vector3(lx, 0.20, -0.004), rx: 0.048, rz: 0.050 },
          { pos: new THREE.Vector3(lx, 0.08, 0.0), rx: 0.044, rz: 0.045 },
        ],
        18
      )
    );

    pushPart(footReg, 'band', createSculptedSandalGeo(lx));
    pushPart(
      footReg,
      'skin',
      createLoftedLimbGeo(
        [
          { pos: new THREE.Vector3(lx, 0.032, 0.078), rx: 0.046, rz: 0.022 },
          { pos: new THREE.Vector3(lx, 0.028, 0.132), rx: 0.042, rz: 0.016 },
        ],
        12
      )
    );
  }

  // 4. Group & Merge parts by material into Cel-Shaded SkinnedMeshes + Ink Outline Meshes
  const buckets = new Map<string, TaggedGeo[]>();
  for (const p of parts) {
    const arr = buckets.get(p.matKey) || [];
    arr.push(p);
    buckets.set(p.matKey, arr);
  }

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  for (const [matKey, list] of buckets.entries()) {
    const mat = mats[matKey];
    const { mesh, outline } = mergeAndSkinRegionGeos(list, skeleton, mat, outlineMat);
    pivotGroup.add(mesh);
    pivotGroup.add(outline);
    skinnedMeshes.push(mesh);
  }

  // 5. Iconic Character Weapons & Storm 4 Aura / Hand Chakra VFX
  let auraMesh: THREE.Mesh | null = null;
  let handOrbMesh: THREE.Mesh | null = null;
  const extraVfxGeos: THREE.BufferGeometry[] = [];
  const extraVfxMats: THREE.Material[] = [];

  // Madara's Gunbai War Fan mounted on back (bound to Chest bone)
  if (kind === 'madara' && gunbaiTex) {
    const gunbaiGroup = new THREE.Group();
    gunbaiGroup.position.set(0.02, 0.08, -0.22);
    gunbaiGroup.rotation.set(0.18, 0, -0.52);

    const discGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.026, 24);
    discGeo.rotateX(Math.PI / 2);
    const fanMat = createStormToonMat({ map: gunbaiTex });
    const fanMesh = new THREE.Mesh(discGeo, fanMat);
    const fanOutline = new THREE.Mesh(discGeo, outlineMat);
    gunbaiGroup.add(fanMesh, fanOutline);

    const handleGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.44, 10);
    const handleMat = createStormToonMat({ color: 0x3f2e24 });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, -0.45, 0);
    const handleOutline = new THREE.Mesh(handleGeo, outlineMat);
    handleOutline.position.copy(handleMesh.position);
    gunbaiGroup.add(handleMesh, handleOutline);

    chest.add(gunbaiGroup);
    extraVfxGeos.push(discGeo, handleGeo);
    extraVfxMats.push(fanMat, handleMat);
  }

  // Minato's iconic 3-pronged Flying Raijin Kunai held in right hand (bound to rightForearm)
  if (kind === 'minato') {
    const kunaiGroup = new THREE.Group();
    // Relative to rightForearm bone at (-0.325, 1.26, 0.01) -> palm at (-0.145, -0.26, 0.04)
    kunaiGroup.position.set(-0.148, -0.265, 0.05);
    kunaiGroup.rotation.set(Math.PI * 0.46, 0.15, 0.25);

    const bladeGeo = new THREE.ConeGeometry(0.036, 0.24, 4);
    bladeGeo.scale(1.0, 1.0, 0.35);
    const bladeMat = createStormToonMat({ color: 0xcbd5e1 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 0.14;
    const bladeOut = new THREE.Mesh(bladeGeo, outlineMat);
    bladeOut.position.copy(blade.position);

    const guardMat = createStormToonMat({ color: 0xfacc15 });
    const wingGeo = new THREE.ConeGeometry(0.024, 0.11, 4);
    const wingL = new THREE.Mesh(wingGeo, bladeMat);
    wingL.position.set(-0.042, 0.06, 0);
    wingL.rotation.z = 0.72;
    const wingR = new THREE.Mesh(wingGeo, bladeMat);
    wingR.position.set(0.042, 0.06, 0);
    wingR.rotation.z = -0.72;

    const gripGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8);
    const grip = new THREE.Mesh(gripGeo, guardMat);
    grip.position.y = -0.02;

    kunaiGroup.add(blade, bladeOut, wingL, wingR, grip);
    rightForearm.add(kunaiGroup);
    extraVfxGeos.push(bladeGeo, wingGeo, gripGeo);
    extraVfxMats.push(bladeMat, guardMat);
  }

  // Signature Ground Aura + Hand Chakra Orb for major Storm 4 opponents
  const bossAuraMap: Partial<Record<EnemyKind, number>> = {
    kakashi: 0x38bdf8,
    naruto: 0xfbbf24,
    itachi: 0xdc2626,
    pain: 0xa855f7,
    sasuke: 0x8b5cf6,
    minato: 0xfde047,
    madara: 0x9333ea,
  };

  const auraHex = bossAuraMap[kind];
  if (auraHex !== undefined) {
    const auraGeo = new THREE.TorusGeometry(kind === 'madara' ? 0.78 : 0.68, 0.035, 10, 32);
    auraGeo.rotateX(Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: auraHex,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.set(0, 0.10, 0);
    root.add(auraMesh);
    extraVfxGeos.push(auraGeo);
    extraVfxMats.push(auraMat);

    // Right-palm elemental chakra orb (Raikiri / Rasengan / Chidori / Amaterasu / Susanoo)
    if (kind !== 'minato') {
      const orbColor =
        kind === 'sasuke'
          ? 0x60a5fa
          : kind === 'itachi'
            ? 0xef4444
            : kind === 'pain'
              ? 0xc084fc
              : auraHex;
      const orbGeo = new THREE.SphereGeometry(kind === 'naruto' ? 0.13 : 0.11, 14, 14);
      const orbMat = new THREE.MeshBasicMaterial({
        color: orbColor,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      handOrbMesh = new THREE.Mesh(orbGeo, orbMat);
      handOrbMesh.position.set(-0.15, -0.26, 0.05);
      rightForearm.add(handOrbMesh);
      extraVfxGeos.push(orbGeo);
      extraVfxMats.push(orbMat);
    }
  }

  // Record base bone transforms
  const baseBoneRotations = new Map<THREE.Bone, THREE.Euler>();
  const baseBonePositions = new Map<THREE.Bone, THREE.Vector3>();
  for (const b of boneList) {
    baseBoneRotations.set(b, b.rotation.clone());
    baseBonePositions.set(b, b.position.clone());
  }

  // Hit-flash handler across all Storm 4 toon materials
  const matEntries = Object.values(mats);
  const hitFlashColor = new THREE.Color(0xff3333);
  let isFlashing = false;
  let lastFlashHex = 0xff3333;
  const setHitFlash = (active: boolean, flashHex = 0xff3333) => {
    if (active === isFlashing && (!active || flashHex === lastFlashHex)) return;
    isFlashing = active;
    lastFlashHex = flashHex;
    hitFlashColor.setHex(flashHex);
    for (const m of matEntries) {
      if (active) {
        m.emissive.copy(hitFlashColor);
        m.emissiveIntensity = flashHex === 0xffffff ? 2.15 : 1.65;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
  };

  return {
    root,
    pivotGroup,
    bones,
    baseBoneRotations,
    baseBonePositions,
    auraMesh,
    handOrbMesh,
    setHitFlash,
    dispose: () => {
      skeleton.dispose();
      for (const sm of skinnedMeshes) {
        sm.geometry.dispose();
      }
      for (const m of matEntries) {
        m.dispose();
      }
      outlineMat.dispose();
      for (const t of ownedTextures) {
        t.dispose();
      }
      for (const g of extraVfxGeos) g.dispose();
      for (const m of extraVfxMats) m.dispose();
    },
  };
}
