import * as THREE from 'three';

export type SkillParticleKind =
  | 'kamui_vortex'
  | 'shinra_wave'
  | 'katon_embers'
  | 'chakra_burst'
  | 'water_splash'
  | 'lightning_sparks'
  | 'amaterasu_flames'
  | 'tsukuyomi_wave';

interface ParticleSystemInstance {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  kind: SkillParticleKind;
  originX: number;
  originY: number;
  originZ: number;
  life: number;
  maxLife: number;
  baseSize: number;
  baseOpacity: number;
}

function createParticleSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const PALETTES: Record<SkillParticleKind, number[]> = {
  kamui_vortex: [0xa855f7, 0xc084fc, 0x6366f1, 0xe879f9, 0x3b0764],
  shinra_wave: [0x38bdf8, 0x7dd3fc, 0xe0f2fe, 0x0ea5e9, 0x93c5fd],
  katon_embers: [0xfef08a, 0xfb923c, 0xf97316, 0xef4444, 0xfde047],
  chakra_burst: [0xfacc15, 0xef4444, 0xfde047, 0xf97316],
  water_splash: [0x06b6d4, 0x38bdf8, 0xbae6fd, 0x0284c7, 0xe0f2fe],
  lightning_sparks: [0x38bdf8, 0x7dd3fc, 0xffffff, 0x60a5fa, 0x0ea5e9],
  amaterasu_flames: [0x050507, 0x0a090d, 0x4c1d95, 0x6b21a8, 0x0d0914],
  tsukuyomi_wave: [0xdc2626, 0x991b1b, 0x7e22ce, 0xef4444, 0x09090b],
};

export class SkillParticleManager {
  private scene: THREE.Scene;
  private spriteTex: THREE.CanvasTexture;
  private systems: ParticleSystemInstance[] = [];
  private tempColor = new THREE.Color();
  private densityScale = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.spriteTex = createParticleSpriteTexture();
  }

  public setDensityScale(scale: number): void {
    this.densityScale = THREE.MathUtils.clamp(scale, 0.2, 1.0);
    const maxSystems = Math.max(6, Math.round(16 * this.densityScale));
    while (this.systems.length > maxSystems) {
      const oldest = this.systems.shift();
      if (oldest) this.removeSystem(oldest);
    }
  }

  public spawn(
    kind: SkillParticleKind,
    x: number,
    y: number,
    z: number,
    count = 180,
    scale = 1.0
  ): void {
    const maxSystems = Math.max(6, Math.round(16 * this.densityScale));
    // Cap concurrent GPU particle systems for smooth 60fps on mobile
    while (this.systems.length >= maxSystems) {
      const oldest = this.systems.shift();
      if (oldest) this.removeSystem(oldest);
    }

    const effectiveCount = Math.max(12, Math.round(count * this.densityScale));
    count = effectiveCount;

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = PALETTES[kind];

    let maxLife = 0.85;
    let baseSize = 0.42 * scale;
    let baseOpacity = 0.95;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.tempColor.setHex(palette[i % palette.length]);
      colors[i3] = this.tempColor.r;
      colors[i3 + 1] = this.tempColor.g;
      colors[i3 + 2] = this.tempColor.b;

      if (kind === 'kamui_vortex') {
        maxLife = 1.05;
        baseSize = 0.46 * scale;
        const angle = Math.random() * Math.PI * 2;
        const radius = (0.7 + Math.random() * 4.2) * scale;
        const heightOffset = (Math.random() - 0.35) * 2.1 * scale;
        positions[i3] = x + Math.cos(angle) * radius;
        positions[i3 + 1] = Math.max(0.15, y + heightOffset);
        positions[i3 + 2] = z + Math.sin(angle) * radius;

        // Tangent swirl velocity + inward pull stored directly
        const tangentSpeed = (5.5 + Math.random() * 6.0) * scale;
        velocities[i3] = -Math.sin(angle) * tangentSpeed;
        velocities[i3 + 1] = (Math.random() - 0.45) * 1.8;
        velocities[i3 + 2] = Math.cos(angle) * tangentSpeed;
      } else if (kind === 'shinra_wave') {
        maxLife = 0.78;
        baseSize = 0.48 * scale;
        const theta = Math.random() * Math.PI * 2;
        const isRing = i < count * 0.68;
        const phi = isRing ? (Math.random() - 0.5) * 0.28 : Math.random() * Math.PI * 0.48;
        const speed = (isRing ? 15 + Math.random() * 14 : 9 + Math.random() * 12) * scale;
        const rStart = 0.35 + Math.random() * 0.55;

        positions[i3] = x + Math.cos(theta) * Math.cos(phi) * rStart;
        positions[i3 + 1] = Math.max(0.12, y + Math.sin(phi) * rStart);
        positions[i3 + 2] = z + Math.sin(theta) * Math.cos(phi) * rStart;

        velocities[i3] = Math.cos(theta) * Math.cos(phi) * speed;
        velocities[i3 + 1] = Math.sin(phi) * speed + (isRing ? 0.9 + Math.random() * 2.2 : 2.5);
        velocities[i3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
      } else if (kind === 'katon_embers') {
        maxLife = 1.05;
        baseSize = 0.44 * scale;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.25) * Math.PI * 0.65;
        const speed = (4.5 + Math.random() * 11.5) * scale;

        positions[i3] = x + (Math.random() - 0.5) * 0.8 * scale;
        positions[i3 + 1] = Math.max(0.15, y + (Math.random() - 0.5) * 0.6 * scale);
        positions[i3 + 2] = z + (Math.random() - 0.5) * 0.8 * scale;

        velocities[i3] = Math.cos(theta) * Math.cos(phi) * speed;
        velocities[i3 + 1] = Math.abs(Math.sin(phi)) * speed + 2.8 + Math.random() * 4.5;
        velocities[i3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
      } else if (kind === 'water_splash') {
        maxLife = 0.85;
        baseSize = 0.42 * scale;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.15) * Math.PI * 0.55;
        const speed = (5.0 + Math.random() * 11.0) * scale;

        positions[i3] = x + (Math.random() - 0.5) * 0.8 * scale;
        positions[i3 + 1] = Math.max(0.12, y + (Math.random() - 0.3) * 0.55 * scale);
        positions[i3 + 2] = z + (Math.random() - 0.5) * 0.8 * scale;

        velocities[i3] = Math.cos(theta) * Math.cos(phi) * speed;
        velocities[i3 + 1] = Math.abs(Math.sin(phi)) * speed * 0.75 + 2.4 + Math.random() * 4.2;
        velocities[i3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
      } else if (kind === 'lightning_sparks') {
        maxLife = 0.52;
        baseSize = 0.34 * scale;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = (8.0 + Math.random() * 13.0) * scale;

        positions[i3] = x + (Math.random() - 0.5) * 0.45 * scale;
        positions[i3 + 1] = Math.max(0.12, y + (Math.random() - 0.5) * 0.45 * scale);
        positions[i3 + 2] = z + (Math.random() - 0.5) * 0.45 * scale;

        velocities[i3] = Math.cos(theta) * Math.cos(phi) * speed;
        velocities[i3 + 1] = Math.sin(phi) * speed + 1.4;
        velocities[i3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
      } else if (kind === 'amaterasu_flames') {
        maxLife = 0.92;
        baseSize = 0.56 * scale;
        baseOpacity = 0.96;
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.15 * scale;
        positions[i3] = x + Math.cos(theta) * r;
        positions[i3 + 1] = Math.max(0.08, y + Math.random() * 0.45 * scale);
        positions[i3 + 2] = z + Math.sin(theta) * r;

        velocities[i3] = (Math.random() - 0.5) * 1.8 * scale;
        velocities[i3 + 1] = (2.8 + Math.random() * 4.4) * scale;
        velocities[i3 + 2] = (Math.random() - 0.5) * 1.8 * scale;
      } else if (kind === 'tsukuyomi_wave') {
        maxLife = 0.88;
        baseSize = 0.46 * scale;
        const theta = Math.random() * Math.PI * 2;
        const isRing = i < count * 0.65;
        const phi = isRing ? (Math.random() - 0.5) * 0.25 : Math.random() * Math.PI * 0.55;
        const speed = (isRing ? 14 + Math.random() * 12 : 8 + Math.random() * 10) * scale;
        const rStart = 0.3 + Math.random() * 0.5;

        positions[i3] = x + Math.cos(theta) * Math.cos(phi) * rStart;
        positions[i3 + 1] = Math.max(0.12, y + Math.sin(phi) * rStart);
        positions[i3 + 2] = z + Math.sin(theta) * Math.cos(phi) * rStart;

        velocities[i3] = Math.cos(theta) * Math.cos(phi) * speed;
        velocities[i3 + 1] = Math.sin(phi) * speed + (isRing ? 0.8 + Math.random() * 1.8 : 2.2);
        velocities[i3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
      } else {
        maxLife = 0.55;
        baseSize = 0.36 * scale;
        const theta = Math.random() * Math.PI * 2;
        const speed = (5.0 + Math.random() * 8.5) * scale;
        positions[i3] = x + (Math.random() - 0.5) * 0.4;
        positions[i3 + 1] = y + (Math.random() - 0.5) * 0.4;
        positions[i3 + 2] = z + (Math.random() - 0.5) * 0.4;

        velocities[i3] = Math.cos(theta) * speed;
        velocities[i3 + 1] = 1.5 + Math.random() * 5.0;
        velocities[i3 + 2] = Math.sin(theta) * speed;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: baseSize,
      map: this.spriteTex,
      vertexColors: true,
      transparent: true,
      opacity: baseOpacity,
      blending: kind === 'amaterasu_flames' ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = kind === 'amaterasu_flames' ? 6 : 5;
    this.scene.add(points);

    this.systems.push({
      points,
      geometry,
      material,
      positions,
      velocities,
      kind,
      originX: x,
      originY: y,
      originZ: z,
      life: 0,
      maxLife,
      baseSize,
      baseOpacity,
    });
  }

  public update(dt: number): void {
    for (let s = this.systems.length - 1; s >= 0; s--) {
      const sys = this.systems[s];
      sys.life += dt;
      const p = sys.life / sys.maxLife;
      const pos = sys.positions;
      const vel = sys.velocities;
      const count = pos.length / 3;

      if (sys.kind === 'kamui_vortex') {
        const pull = 3.2 * dt;
        const spin = 5.4 * dt;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const dx = sys.originX - pos[i3];
          const dy = sys.originY - pos[i3 + 1];
          const dz = sys.originZ - pos[i3 + 2];

          // Spiral inward around Y axis toward Kamui eye center
          vel[i3] += (dx * pull - dz * spin);
          vel[i3 + 1] += dy * pull * 0.6;
          vel[i3 + 2] += (dz * pull + dx * spin);

          vel[i3] *= 0.96;
          vel[i3 + 1] *= 0.95;
          vel[i3 + 2] *= 0.96;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 - p * 0.45);
      } else if (sys.kind === 'shinra_wave') {
        const drag = Math.exp(-3.4 * dt);
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          vel[i3] *= drag;
          vel[i3 + 1] = vel[i3 + 1] * drag - 3.2 * dt;
          vel[i3 + 2] *= drag;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 + p * 0.35);
      } else if (sys.kind === 'katon_embers') {
        const drag = Math.exp(-1.9 * dt);
        const phase = sys.life * 7.2;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const rx = pos[i3] - sys.originX;
          const rz = pos[i3 + 2] - sys.originZ;
          const swirlSign = (i & 1) === 0 ? 1 : -1;
          // Helical thermal vortex + turbulent flicker around the blast column
          vel[i3] = vel[i3] * drag + (-rz * swirlSign * 2.8 + Math.sin(phase + i * 1.7) * 5.2) * dt;
          vel[i3 + 1] += (4.6 + (i % 5) * 0.65) * dt;
          vel[i3 + 2] = vel[i3 + 2] * drag + (rx * swirlSign * 2.8 + Math.cos(phase * 1.1 + i * 2.1) * 5.2) * dt;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 - p * 0.35 + Math.sin(sys.life * 28) * 0.08);
      } else if (sys.kind === 'water_splash') {
        const drag = Math.exp(-2.8 * dt);
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          vel[i3] *= drag;
          vel[i3 + 1] = vel[i3 + 1] * drag - 10.5 * dt;
          vel[i3 + 2] *= drag;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 + p * 0.25);
      } else if (sys.kind === 'lightning_sparks') {
        const drag = Math.exp(-4.2 * dt);
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          vel[i3] *= drag;
          vel[i3 + 1] *= drag;
          vel[i3 + 2] *= drag;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 - p * 0.4);
      } else if (sys.kind === 'amaterasu_flames') {
        const drag = Math.exp(-2.2 * dt);
        const phase = sys.life * 8.5;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          vel[i3] = vel[i3] * drag + Math.sin(phase + i * 1.9) * 3.2 * dt;
          vel[i3 + 1] += (3.8 + (i % 4) * 0.7) * dt;
          vel[i3 + 2] = vel[i3 + 2] * drag + Math.cos(phase * 1.15 + i * 2.3) * 3.2 * dt;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.06, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1.05 - p * 0.42);
      } else if (sys.kind === 'tsukuyomi_wave') {
        const drag = Math.exp(-3.1 * dt);
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const dx = pos[i3] - sys.originX;
          const dz = pos[i3 + 2] - sys.originZ;
          vel[i3] = vel[i3] * drag - dz * 1.8 * dt;
          vel[i3 + 1] = vel[i3 + 1] * drag - 1.6 * dt;
          vel[i3 + 2] = vel[i3 + 2] * drag + dx * 1.8 * dt;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
        sys.material.size = sys.baseSize * (1 + p * 0.3);
      } else {
        const drag = Math.exp(-3.8 * dt);
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          vel[i3] *= drag;
          vel[i3 + 1] -= 9.5 * dt;
          vel[i3 + 2] *= drag;

          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] = Math.max(0.08, pos[i3 + 1] + vel[i3 + 1] * dt);
          pos[i3 + 2] += vel[i3 + 2] * dt;
        }
      }

      sys.geometry.attributes.position.needsUpdate = true;
      sys.material.opacity = Math.max(0, sys.baseOpacity * (1 - p * p));

      if (sys.life >= sys.maxLife) {
        this.removeSystem(sys);
        this.systems.splice(s, 1);
      }
    }
  }

  private removeSystem(sys: ParticleSystemInstance): void {
    this.scene.remove(sys.points);
    sys.geometry.dispose();
    sys.material.dispose();
  }

  public clear(): void {
    for (const sys of this.systems) {
      this.removeSystem(sys);
    }
    this.systems = [];
  }

  public dispose(): void {
    this.clear();
    this.spriteTex.dispose();
  }
}
