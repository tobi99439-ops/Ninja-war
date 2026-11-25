import * as THREE from 'three';
import { CharacterBones } from './models/gltfObitoLoader';

type LimbKey = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';

const LIMB_KEYS: LimbKey[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
const MAX_NODES = 18;
const VERTS_PER_NODE = 3; // left outer edge, white center spine, right outer edge
const MAX_AGE = 0.22;
const SWING_SPEED_THRESHOLD = 3.2; // m/s relative to character root

// Pre-allocated scratch math helpers (zero GC in render loop)
const _worldPos = new THREE.Vector3();
const _relPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _side = new THREE.Vector3();
const _upFallback = new THREE.Vector3(0, 1, 0);
const _coreColor = new THREE.Color(0xffffff);
const _auraColor = new THREE.Color(0x38bdf8);

interface RibbonNode {
  x: number;
  y: number;
  z: number;
  age: number;
  intensity: number;
  breakAfter: boolean;
}

interface LimbRibbonTrack {
  key: LimbKey;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  nodes: RibbonNode[];
  nodeCount: number;
  hasPrev: boolean;
  prevRel: THREE.Vector3;
  inactiveTime: number;
}

function createWindRibbonTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      // Soft wispy wind streaks along ribbon length
      const streak =
        0.78 +
        0.14 * Math.sin(v * Math.PI * 6.0) +
        0.08 * Math.cos(v * Math.PI * 14.0);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        // Smooth organic cross-section feather: 0 at outer edges, 1 at spine
        const cross = Math.pow(Math.sin(u * Math.PI), 1.65);
        const alpha = Math.max(0, Math.min(1, cross * streak));
        const idx = (y * w + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function resolveLimbBone(bones: CharacterBones, key: LimbKey): THREE.Bone | null {
  if (key === 'leftHand') return bones.leftHand || bones.leftForearm;
  if (key === 'rightHand') return bones.rightHand || bones.rightForearm;
  if (key === 'leftFoot') return bones.leftFoot || bones.leftShin;
  return bones.rightFoot || bones.rightShin;
}

export class SlashRibbonSystem {
  private scene: THREE.Scene;
  private texture: THREE.CanvasTexture;
  private tracks: LimbRibbonTrack[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.texture = createWindRibbonTexture();

    // Shared static triangle indices for all 18-node 3-vertex-wide ribbon strips
    const triCount = (MAX_NODES - 1) * 4;
    const indices = new Uint16Array(triCount * 3);
    let ptr = 0;
    for (let i = 0; i < MAX_NODES - 1; i++) {
      const aL = i * 3;
      const aC = i * 3 + 1;
      const aR = i * 3 + 2;
      const bL = (i + 1) * 3;
      const bC = (i + 1) * 3 + 1;
      const bR = (i + 1) * 3 + 2;

      // Left half quad
      indices[ptr++] = aL;
      indices[ptr++] = aC;
      indices[ptr++] = bL;
      indices[ptr++] = aC;
      indices[ptr++] = bC;
      indices[ptr++] = bL;

      // Right half quad
      indices[ptr++] = aC;
      indices[ptr++] = aR;
      indices[ptr++] = bC;
      indices[ptr++] = aR;
      indices[ptr++] = bR;
      indices[ptr++] = bC;
    }
    const sharedIndex = new THREE.BufferAttribute(indices, 1);

    for (const key of LIMB_KEYS) {
      const vertCount = MAX_NODES * VERTS_PER_NODE;
      const positions = new Float32Array(vertCount * 3);
      const colors = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);

      for (let i = 0; i < MAX_NODES; i++) {
        const v = i / (MAX_NODES - 1);
        const baseUv = i * VERTS_PER_NODE * 2;
        uvs[baseUv] = 0.0;
        uvs[baseUv + 1] = v;
        uvs[baseUv + 2] = 0.5;
        uvs[baseUv + 3] = v;
        uvs[baseUv + 4] = 1.0;
        uvs[baseUv + 5] = v;
      }

      const geometry = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);

      geometry.setAttribute('position', posAttr);
      geometry.setAttribute('color', colAttr);
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(sharedIndex);

      const material = new THREE.MeshBasicMaterial({
        map: this.texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      mesh.visible = false;
      this.scene.add(mesh);

      const nodes: RibbonNode[] = [];
      for (let i = 0; i < MAX_NODES; i++) {
        nodes.push({ x: 0, y: 0, z: 0, age: MAX_AGE, intensity: 0, breakAfter: false });
      }

      this.tracks.push({
        key,
        mesh,
        geometry,
        material,
        posAttr,
        colAttr,
        nodes,
        nodeCount: 0,
        hasPrev: false,
        prevRel: new THREE.Vector3(),
        inactiveTime: 1,
      });
    }
  }

  public update(
    dt: number,
    camera: THREE.Camera,
    rootPos: THREE.Vector3,
    bones: CharacterBones | null,
    emitting: boolean
  ): void {
    const safeDt = Math.max(dt, 0.001);

    for (const track of this.tracks) {
      // 1. Age existing nodes and prune expired tail nodes
      for (let i = 0; i < track.nodeCount; i++) {
        track.nodes[i].age += safeDt;
      }
      while (track.nodeCount > 0 && track.nodes[track.nodeCount - 1].age >= MAX_AGE) {
        track.nodeCount--;
      }

      // 2. Sample current limb world position & check swing velocity relative to character root
      const bone = bones ? resolveLimbBone(bones, track.key) : null;
      if (bone && emitting) {
        bone.updateWorldMatrix(true, false);
        bone.getWorldPosition(_worldPos);
        _relPos.subVectors(_worldPos, rootPos);

        let localSpeed = 0;
        if (track.hasPrev) {
          _vel.subVectors(_relPos, track.prevRel).divideScalar(safeDt);
          localSpeed = _vel.length();
        }
        track.prevRel.copy(_relPos);
        track.hasPrev = true;

        if (localSpeed > SWING_SPEED_THRESHOLD) {
          const intensity = THREE.MathUtils.clamp(
            (localSpeed - SWING_SPEED_THRESHOLD) / 8.5,
            0.3,
            1.0
          );
          const breakGap = track.inactiveTime > 0.055;
          track.inactiveTime = 0;

          if (track.nodeCount > 0 && !breakGap) {
            const head = track.nodes[0];
            const distSq =
              (_worldPos.x - head.x) * (_worldPos.x - head.x) +
              (_worldPos.y - head.y) * (_worldPos.y - head.y) +
              (_worldPos.z - head.z) * (_worldPos.z - head.z);

            if (distSq < 0.0014 && head.age < 0.012) {
              // Smoothly refine head node without wasting slots
              head.x = _worldPos.x;
              head.y = _worldPos.y;
              head.z = _worldPos.z;
              head.intensity = Math.max(head.intensity, intensity);
            } else {
              this.pushHeadNode(track, _worldPos.x, _worldPos.y, _worldPos.z, intensity, false);
            }
          } else {
            this.pushHeadNode(track, _worldPos.x, _worldPos.y, _worldPos.z, intensity, breakGap);
          }
        } else {
          track.inactiveTime += safeDt;
        }
      } else {
        track.hasPrev = false;
        track.inactiveTime += safeDt;
      }

      // 3. Rebuild vertex buffers in-place if at least 2 nodes are alive
      if (track.nodeCount < 2) {
        track.mesh.visible = false;
        continue;
      }

      this.writeGeometry(track, camera);
    }
  }

  private pushHeadNode(
    track: LimbRibbonTrack,
    x: number,
    y: number,
    z: number,
    intensity: number,
    breakAfter: boolean
  ): void {
    const newCount = Math.min(MAX_NODES, track.nodeCount + 1);
    for (let i = newCount - 1; i > 0; i--) {
      const dst = track.nodes[i];
      const src = track.nodes[i - 1];
      dst.x = src.x;
      dst.y = src.y;
      dst.z = src.z;
      dst.age = src.age;
      dst.intensity = src.intensity;
      dst.breakAfter = src.breakAfter;
    }
    const head = track.nodes[0];
    head.x = x;
    head.y = y;
    head.z = z;
    head.age = 0;
    head.intensity = intensity;
    head.breakAfter = breakAfter;
    track.nodeCount = newCount;
  }

  private writeGeometry(track: LimbRibbonTrack, camera: THREE.Camera): void {
    const posArr = track.posAttr.array as Float32Array;
    const colArr = track.colAttr.array as Float32Array;
    const count = track.nodeCount;
    const baseHalfWidth = track.key === 'leftFoot' || track.key === 'rightFoot' ? 0.22 : 0.17;

    let anyVisible = false;

    for (let i = 0; i < MAX_NODES; i++) {
      if (i >= count) {
        // Collapse unused tail vertices cleanly to last valid node with zero color
        const last = track.nodes[count - 1];
        const vBase = i * VERTS_PER_NODE * 3;
        for (let k = 0; k < 3; k++) {
          posArr[vBase + k * 3] = last.x;
          posArr[vBase + k * 3 + 1] = last.y;
          posArr[vBase + k * 3 + 2] = last.z;
          colArr[vBase + k * 3] = 0;
          colArr[vBase + k * 3 + 1] = 0;
          colArr[vBase + k * 3 + 2] = 0;
        }
        continue;
      }

      const node = track.nodes[i];
      const prevNode = i > 0 && !track.nodes[i - 1].breakAfter ? track.nodes[i - 1] : node;
      const nextNode = i < count - 1 && !node.breakAfter ? track.nodes[i + 1] : node;

      _tangent.set(prevNode.x - nextNode.x, prevNode.y - nextNode.y, prevNode.z - nextNode.z);
      if (_tangent.lengthSq() < 1e-6) {
        _tangent.set(0, 1, 0);
      } else {
        _tangent.normalize();
      }

      _toCam.set(
        camera.position.x - node.x,
        camera.position.y - node.y,
        camera.position.z - node.z
      );
      if (_toCam.lengthSq() < 1e-6) {
        _toCam.set(0, 0, 1);
      } else {
        _toCam.normalize();
      }

      _side.crossVectors(_tangent, _toCam);
      if (_side.lengthSq() < 1e-5) {
        _side.crossVectors(_tangent, _upFallback);
      }
      if (_side.lengthSq() < 1e-5) {
        _side.set(1, 0, 0);
      } else {
        _side.normalize();
      }

      const ageNorm = THREE.MathUtils.clamp(node.age / MAX_AGE, 0, 1);
      const lenNorm = i / Math.max(1, count - 1);
      const lifeFade = (1 - ageNorm) * (1 - ageNorm);
      const tailTaper = Math.sin(Math.min(1, lenNorm * 0.88 + 0.12) * Math.PI * 0.5);
      const headRound = i === 0 ? 0.55 : 1.0;

      // Collapse ribbon cleanly across a break seam so disjointed swings never bridge
      const seamFade = node.breakAfter || (i > 0 && track.nodes[i - 1].breakAfter) ? 0 : 1;
      const alpha = lifeFade * (1 - lenNorm * 0.72) * node.intensity * seamFade;
      const halfW = baseHalfWidth * (1 - lenNorm * 0.85) * (1 - ageNorm * 0.55) * tailTaper * headRound * seamFade;

      if (alpha > 0.01) anyVisible = true;

      const vBase = i * VERTS_PER_NODE * 3;
      // Left outer edge (luminous sky-cyan aura)
      posArr[vBase] = node.x - _side.x * halfW;
      posArr[vBase + 1] = node.y - _side.y * halfW;
      posArr[vBase + 2] = node.z - _side.z * halfW;

      // Center spine (pure white inner core)
      posArr[vBase + 3] = node.x;
      posArr[vBase + 4] = node.y;
      posArr[vBase + 5] = node.z;

      // Right outer edge (luminous sky-cyan aura)
      posArr[vBase + 6] = node.x + _side.x * halfW;
      posArr[vBase + 7] = node.y + _side.y * halfW;
      posArr[vBase + 8] = node.z + _side.z * halfW;

      const auraAlpha = alpha * 0.82;
      colArr[vBase] = _auraColor.r * auraAlpha;
      colArr[vBase + 1] = _auraColor.g * auraAlpha;
      colArr[vBase + 2] = _auraColor.b * auraAlpha;

      colArr[vBase + 3] = _coreColor.r * alpha;
      colArr[vBase + 4] = _coreColor.g * alpha;
      colArr[vBase + 5] = _coreColor.b * alpha;

      colArr[vBase + 6] = _auraColor.r * auraAlpha;
      colArr[vBase + 7] = _auraColor.g * auraAlpha;
      colArr[vBase + 8] = _auraColor.b * auraAlpha;
    }

    track.posAttr.needsUpdate = true;
    track.colAttr.needsUpdate = true;
    track.mesh.visible = anyVisible;
  }

  public clear(): void {
    for (const track of this.tracks) {
      track.nodeCount = 0;
      track.hasPrev = false;
      track.inactiveTime = 1;
      track.mesh.visible = false;
    }
  }

  public dispose(): void {
    for (const track of this.tracks) {
      this.scene.remove(track.mesh);
      track.geometry.dispose();
      track.material.dispose();
    }
    this.tracks = [];
    this.texture.dispose();
  }
}
