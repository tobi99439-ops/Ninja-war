import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ShinobiMaterials } from '../materials';
import { createKanjiSignTexture } from '../textures';
import { EnvironmentObjects } from './environment';

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();

function createKonohaStreetTextures(maxAniso: number): {
  colorTex: THREE.CanvasTexture;
  bumpTex: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#8b7355';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#555555';
  bCtx.fillRect(0, 0, size, size);

  let seed = 4091;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const rows = 12;
  const cols = 8;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset + 2.5;
      const y = r * rowH + 2.5;
      const w = colW - 5;
      const h = rowH - 5;

      const v = Math.floor((rand() - 0.5) * 26);
      const R = Math.min(255, Math.max(0, 152 + v));
      const G = Math.min(255, Math.max(0, 129 + Math.floor(v * 0.85)));
      const B = Math.min(255, Math.max(0, 100 + Math.floor(v * 0.7)));
      ctx.fillStyle = `rgb(${R},${G},${B})`;
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = 'rgba(255, 240, 210, 0.16)';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = 'rgba(40, 28, 16, 0.2)';
      ctx.fillRect(x, y + h - 3, w, 3);

      const bv = Math.min(245, Math.max(90, 172 + v * 2));
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, w, h);
    }
  }

  for (let i = 0; i < 1600; i++) {
    const px = rand() * size;
    const py = rand() * size;
    const rad = 0.8 + rand() * 2.1;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(224, 200, 165, 0.16)' : 'rgba(65, 50, 35, 0.18)';
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = THREE.RepeatWrapping;
  colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.repeat.set(7, 7);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = Math.min(8, maxAniso);

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.repeat.set(7, 7);
  bumpTex.anisotropy = Math.min(8, maxAniso);

  return { colorTex, bumpTex };
}

function createKonohaSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1e6ec8');
  grad.addColorStop(0.28, '#4e9be6');
  grad.addColorStop(0.49, '#9cd0f8');
  grad.addColorStop(0.58, '#d9eefc');
  grad.addColorStop(0.68, '#a4b792');
  grad.addColorStop(1.0, '#4f623d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createShojiWindowTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f3ebd8';
  ctx.fillRect(0, 0, 256, 256);

  const warmGlow = ctx.createLinearGradient(0, 0, 0, 256);
  warmGlow.addColorStop(0, '#fff7e0');
  warmGlow.addColorStop(1, '#d9c6a3');
  ctx.fillStyle = warmGlow;
  ctx.fillRect(8, 8, 240, 240);

  ctx.strokeStyle = '#3b291a';
  ctx.lineWidth = 10;
  ctx.strokeRect(4, 4, 248, 248);

  ctx.lineWidth = 5;
  for (let i = 1; i <= 3; i++) {
    const x = (256 / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let j = 1; j <= 3; j++) {
    const y = (256 / 4) * j;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

function createRamenLanternTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#c82323');
  grad.addColorStop(0.5, '#ef4444');
  grad.addColorStop(1, '#991b1b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Horizontal bamboo rib lines
  ctx.strokeStyle = 'rgba(30, 12, 12, 0.55)';
  ctx.lineWidth = 4;
  for (let y = 24; y < 256; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ラ', 128, 66);
  ctx.fillText('ー', 128, 114);
  ctx.fillText('メ', 128, 162);
  ctx.fillText('ン', 128, 210);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso);
  return tex;
}

export function buildKonohaEnvironment(
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
  // 1. SOLID SUNLIT KONOHA COBBLESTONE ARENA (flush at y = 0) & TOWN TERRAIN
  // =========================================================================
  const { colorTex: streetTex, bumpTex: streetBump } = createKonohaStreetTextures(maxAniso);
  const skyDomeTex = trackTex(createKonohaSkyGradientTexture());
  const shojiTex = trackTex(createShojiWindowTexture(maxAniso));
  const lanternTex = trackTex(createRamenLanternTexture(maxAniso));
  textures.push(streetTex, streetBump);

  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: streetTex,
      bumpMap: streetBump,
      bumpScale: 0.052,
      roughness: 0.86,
      metalness: 0.04,
      envMapIntensity: 0.38,
    })
  );

  const platformGeo = trackGeo(new RoundedBoxGeometry(32, 10, 32, 2, 0.12));
  const platformMesh = new THREE.Mesh(platformGeo, floorMat);
  platformMesh.position.set(0, -5.0, 0);
  platformMesh.receiveShadow = true;
  group.add(platformMesh);

  // Extended sunlit Konoha town avenue & lush surrounding valley floor
  const outerRoadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: streetTex,
      color: 0xc2ab8b,
      roughness: 0.92,
      metalness: 0.02,
      envMapIntensity: 0.32,
    })
  );
  const avenueRoad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(24, 0.4, 125)), outerRoadMat);
  avenueRoad.position.set(0, -0.24, -18);
  avenueRoad.receiveShadow = true;
  group.add(avenueRoad);

  const valleyGrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c8b43,
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  const outerValleyGeo = trackGeo(new THREE.RingGeometry(15.2, 165, 64));
  outerValleyGeo.rotateX(-Math.PI / 2);
  const outerValley = new THREE.Mesh(outerValleyGeo, valleyGrassMat);
  outerValley.position.y = -0.32;
  outerValley.receiveShadow = true;
  group.add(outerValley);

  // Wooden avenue boundary posts around the 15.4m battle street
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d432c,
      roughness: 0.88,
      metalness: 0.04,
    })
  );
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 0.88, 8));
  const postCount = 20;
  const postInst = new THREE.InstancedMesh(postGeo, woodMat, postCount);
  postInst.castShadow = true;
  postInst.receiveShadow = true;
  for (let i = 0; i < postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    _tempObj.position.set(Math.cos(a) * 15.4, 0.44, Math.sin(a) * 15.4);
    _tempObj.rotation.set(0, -a, 0);
    _tempObj.scale.set(1, 1, 1);
    _tempObj.updateMatrix();
    postInst.setMatrixAt(i, _tempObj.matrix);
  }
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  group.add(postInst);

  // =========================================================================
  // 2. SUNLIT KONOHA SKY DOME & DRIFTING 3D VOLUMETRIC CLOUDS
  // =========================================================================
  const skyGeo = trackGeo(new THREE.SphereGeometry(185, 48, 32));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: skyDomeTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  group.add(new THREE.Mesh(skyGeo, skyMat));

  const cloudMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      emissive: new THREE.Color(0xdbeafe),
      emissiveIntensity: 0.32,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  const cloudPuffGeo = trackGeo(new THREE.SphereGeometry(1, 12, 10));
  const cloudClusters: Array<{ group: THREE.Group; baseZ: number; speed: number; offset: number }> = [];
  for (let c = 0; c < 12; c++) {
    const cg = new THREE.Group();
    const angle = (c / 12) * Math.PI * 2;
    const dist = 92 + (c % 3) * 18;
    cg.position.set(Math.cos(angle) * dist, 38 + (c % 4) * 5.5, Math.sin(angle) * dist);
    cg.rotation.y = -angle;
    for (let p = 0; p < 5; p++) {
      const puff = new THREE.Mesh(cloudPuffGeo, cloudMat);
      puff.position.set((p - 2) * 3.2, (p === 2 ? 1.5 : 0.3) + (p % 2) * 0.7, (p % 2 - 0.5) * 1.8);
      const s = p === 2 ? 4.4 : 2.9 + (p % 2) * 0.8;
      puff.scale.set(s * 1.45, s * 0.82, s * 1.05);
      cg.add(puff);
    }
    group.add(cg);
    cloudClusters.push({ group: cg, baseZ: cg.position.z, speed: 0.7 + (c % 3) * 0.25, offset: c * 5.1 });
  }

  // =========================================================================
  // 3. GIANT 3D HOKAGE ROCK MOUNTAIN + 5 CARVED STONE HOKAGE MONUMENT FACES
  // =========================================================================
  const rockLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa2b4,
      roughness: 0.92,
      metalness: 0.05,
    })
  );
  const rockMidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7e879c,
      roughness: 0.94,
      metalness: 0.05,
    })
  );
  const rockShadowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x565f73,
      roughness: 0.95,
      metalness: 0.04,
    })
  );
  const mountainCanopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b7a38,
      roughness: 0.88,
      metalness: 0.02,
    })
  );

  const mountainGroup = new THREE.Group();
  mountainGroup.position.set(0, 0, -84);
  group.add(mountainGroup);

  // Main jagged stratified mountain massif
  const mountainCore = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(126, 42, 34, 3, 2.2)),
    rockMidMat
  );
  mountainCore.position.set(0, 19, -4);
  mountainCore.receiveShadow = true;
  mountainGroup.add(mountainCore);

  // Flanking crag shoulders & distant flanking peaks
  const cragSpecs: Array<[number, number, number, number, number, number, number]> = [
    [-58, 15, 3, 28, 34, 26, 0.22],
    [58, 16, 4, 30, 36, 26, -0.24],
    [-82, 11, 14, 32, 26, 28, 0.42],
    [82, 12, 14, 32, 28, 28, -0.4],
    [-38, 21, 9, 18, 42, 14, 0.05],
    [38, 21, 9, 18, 42, 14, -0.05],
  ];
  for (const [cx, cy, cz, w, h, d, ry] of cragSpecs) {
    const crag = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(w, h, d, 2, 1.4)),
      rockLightMat
    );
    crag.position.set(cx, cy, cz);
    crag.rotation.y = ry;
    mountainGroup.add(crag);
  }

  // Lush forest crown along the summit plateau of Hokage Rock
  const summitCrownGeo = trackGeo(new THREE.SphereGeometry(1.0, 12, 10));
  for (let i = 0; i < 26; i++) {
    const tx = -62 + (i / 25) * 124;
    const ty = 39.2 + Math.sin(i * 1.7) * 1.4;
    const tz = 1.5 + (i % 3) * 2.2;
    const crown = new THREE.Mesh(summitCrownGeo, mountainCanopyMat);
    crown.position.set(tx, ty, tz);
    crown.scale.set(4.8 + (i % 3) * 1.2, 2.8 + (i % 2) * 0.9, 4.5);
    mountainGroup.add(crown);
  }

  // 5 Sculpted 3D Stone Hokage Relief Faces (Hashirama, Tobirama, Hiruzen, Minato, Tsunade)
  const hokageSpecs: Array<{
    x: number;
    y: number;
    hasSpikyHair: boolean;
    hasHelmetFrame: boolean;
    hasPonytail: boolean;
  }> = [
    { x: -34, y: 24.5, hasSpikyHair: false, hasHelmetFrame: true, hasPonytail: false }, // 1st Hashirama
    { x: -17, y: 25.0, hasSpikyHair: true, hasHelmetFrame: true, hasPonytail: false },  // 2nd Tobirama
    { x: 0, y: 25.6, hasSpikyHair: false, hasHelmetFrame: true, hasPonytail: false },   // 3rd Hiruzen
    { x: 17, y: 25.2, hasSpikyHair: true, hasHelmetFrame: false, hasPonytail: false },  // 4th Minato
    { x: 34, y: 24.4, hasSpikyHair: false, hasHelmetFrame: false, hasPonytail: true },  // 5th Tsunade
  ];

  for (const hk of hokageSpecs) {
    const faceGrp = new THREE.Group();
    faceGrp.position.set(hk.x, hk.y, 13.8);

    // Sculpted cliff backing tablet
    const headBase = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(9.6, 12.2, 5.2, 2, 1.1)),
      rockLightMat
    );
    faceGrp.add(headBase);

    // Sculpted brow ridge + headband rim
    const brow = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(8.6, 2.1, 2.2, 2, 0.4)), rockMidMat);
    brow.position.set(0, 2.1, 2.1);
    faceGrp.add(brow);

    // Recessed stone eyes
    for (const ex of [-2.0, 2.0]) {
      const eye = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.85, 0.9)), rockShadowMat);
      eye.position.set(ex, 0.85, 2.4);
      faceGrp.add(eye);
    }

    // Prominent sculpted nose bridge
    const nose = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.45, 3.3, 2.0, 2, 0.35)), rockLightMat);
    nose.position.set(0, -0.5, 2.65);
    faceGrp.add(nose);

    // Carved mouth shadow crease & chin relief
    const mouth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.0, 0.52, 0.7)), rockShadowMat);
    mouth.position.set(0, -3.1, 2.45);
    faceGrp.add(mouth);

    if (hk.hasHelmetFrame) {
      for (const sx of [-4.5, 4.5]) {
        const cheekGuard = new THREE.Mesh(
          trackGeo(new RoundedBoxGeometry(1.8, 7.6, 3.0, 2, 0.35)),
          rockMidMat
        );
        cheekGuard.position.set(sx, 0.2, 1.4);
        faceGrp.add(cheekGuard);
      }
      const topCrest = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(9.8, 2.4, 4.2, 2, 0.5)), rockMidMat);
      topCrest.position.set(0, 5.4, 0.8);
      faceGrp.add(topCrest);
    }

    if (hk.hasSpikyHair) {
      for (let s = -2; s <= 2; s++) {
        const spike = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.9, 5.4, 5)), rockLightMat);
        spike.position.set(s * 2.1, 6.9 - Math.abs(s) * 0.4, 1.1);
        spike.rotation.z = -s * 0.28;
        faceGrp.add(spike);
      }
    }

    if (hk.hasPonytail) {
      for (const sx of [-4.4, 4.4]) {
        const lock = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.1, 9.2, 2.6, 2, 0.45)), rockLightMat);
        lock.position.set(sx, -0.6, 1.6);
        faceGrp.add(lock);
      }
    }

    mountainGroup.add(faceGrp);
  }

  // =========================================================================
  // 4. HOKAGE MANSION RESIDENCE (Center Avenue Horizon Landmark)
  // =========================================================================
  const mansionGroup = new THREE.Group();
  mansionGroup.position.set(0, 0, -45);
  group.add(mansionGroup);

  const plasterMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe6dac5, roughness: 0.85, envMapIntensity: 0.34 }));
  const crimsonDomeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xc0322c, roughness: 0.58, metalness: 0.08, envMapIntensity: 0.38 }));
  const darkRoofMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2d3a4d, roughness: 0.72, metalness: 0.16, envMapIntensity: 0.36 }));
  const shojiMat = trackMat(new THREE.MeshStandardMaterial({ map: shojiTex, roughness: 0.75, envMapIntensity: 0.34 }));

  const mansionWingL = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(11, 10.5, 9, 2, 0.14)), plasterMat);
  mansionWingL.position.set(-10, 5.2, 0);
  const mansionWingR = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(11, 10.5, 9, 2, 0.14)), plasterMat);
  mansionWingR.position.set(10, 5.2, 0);
  const mansionDrum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(7.2, 7.6, 13.5, 24)), plasterMat);
  mansionDrum.position.set(0, 6.7, 1.5);
  const mansionDome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(7.45, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52)),
    crimsonDomeMat
  );
  mansionDome.position.set(0, 13.3, 1.5);
  const mansionTrim = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(7.7, 7.7, 0.9, 24)), darkRoofMat);
  mansionTrim.position.set(0, 13.2, 1.5);
  mansionGroup.add(mansionWingL, mansionWingR, mansionDrum, mansionDome, mansionTrim);

  // Iconic "火" (Fire) kanji plaque mounted cleanly on the Hokage Mansion facade
  const fireKanjiTex = trackTex(createKanjiSignTexture('火', maxAniso, 'horizontal', 'parchment'));
  const fireKanjiMat = trackMat(new THREE.MeshStandardMaterial({ map: fireKanjiTex, roughness: 0.78 }));
  const firePlaque = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 3.4, 0.4)), fireKanjiMat);
  firePlaque.position.set(0, 11.2, 8.9);
  mansionGroup.add(firePlaque);

  // =========================================================================
  // 5. ICHIRAKU RAMEN SHOP (Hero Left Street Landmark) & KONOHA BUILDINGS
  // =========================================================================
  const buildKonohaBuilding = (cfg: {
    x: number;
    z: number;
    w: number;
    h: number;
    d: number;
    wallColor: number;
    roofColor: number;
    rotY: number;
    kanji?: string;
    awningColor?: number;
  }) => {
    const bGrp = new THREE.Group();
    bGrp.position.set(cfg.x, 0, cfg.z);
    bGrp.rotation.y = cfg.rotY;

    const wallMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: cfg.wallColor,
        roughness: 0.84,
        metalness: 0.04,
      })
    );
    const roofMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: cfg.roofColor,
        roughness: 0.72,
        metalness: 0.14,
      })
    );

    const body = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(cfg.w, cfg.h, cfg.d, 2, 0.12)),
      wallMat
    );
    body.position.y = cfg.h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    bGrp.add(body);

    // Timber corner pillars & mid-story horizontal fascia
    const beamH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(cfg.w + 0.3, 0.35, cfg.d + 0.3)), woodMat);
    beamH.position.y = cfg.h * 0.52;
    bGrp.add(beamH);

    // Traditional overhanging slanted Kawara roof eaves + ridge beam
    const roof = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(cfg.w + 1.8, 0.75, cfg.d + 1.8, 2, 0.15)),
      roofMat
    );
    roof.position.y = cfg.h + 0.32;
    roof.castShadow = true;
    bGrp.add(roof);

    const upperGable = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(Math.max(cfg.w, cfg.d) * 0.58, 2.8, 4)),
      roofMat
    );
    upperGable.position.y = cfg.h + 1.95;
    upperGable.rotation.y = Math.PI * 0.25;
    bGrp.add(upperGable);

    // Shoji lattice windows along front facade (+Z in local coords)
    const winCount = Math.max(2, Math.floor(cfg.w / 3.2));
    const winGeo = trackGeo(new THREE.BoxGeometry(1.45, 1.7, 0.2));
    for (let i = 0; i < winCount; i++) {
      const wx = -cfg.w * 0.32 + (winCount > 1 ? (i / (winCount - 1)) * (cfg.w * 0.64) : 0);
      const wMesh = new THREE.Mesh(winGeo, shojiMat);
      wMesh.position.set(wx, cfg.h * 0.68, cfg.d * 0.5 + 0.04);
      bGrp.add(wMesh);
    }

    if (cfg.awningColor !== undefined) {
      const awningMat = trackMat(
        new THREE.MeshStandardMaterial({ color: cfg.awningColor, roughness: 0.78 })
      );
      const awning = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(cfg.w * 0.88, 0.22, 2.6)),
        awningMat
      );
      awning.position.set(0, 3.3, cfg.d * 0.5 + 1.15);
      awning.rotation.x = 0.36;
      awning.castShadow = true;
      bGrp.add(awning);
    }

    if (cfg.kanji) {
      const kTex = trackTex(createKanjiSignTexture(cfg.kanji, maxAniso, 'vertical', 'parchment'));
      const kMat = trackMat(new THREE.MeshStandardMaterial({ map: kTex, roughness: 0.8 }));
      const sign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 3.2, 0.22)), kMat);
      sign.position.set(cfg.w * 0.36, 2.5, cfg.d * 0.5 + 1.3);
      bGrp.add(sign);
    }

    group.add(bGrp);
    return bGrp;
  };

  // Left-street hero: Ichiraku Ramen + Konoha Tea & Ninja Tool Shops
  const ichiraku = buildKonohaBuilding({
    x: -22.2,
    z: -6.0,
    w: 10.5,
    h: 7.4,
    d: 8.8,
    wallColor: 0xd9cbb0,
    roofColor: 0x35445c,
    rotY: Math.PI * 0.5,
    kanji: '一楽',
    awningColor: 0x2968b3,
  });

  // Wooden ramen counter stools + swaying hanging red Ramen lantern on Ichiraku!
  const counterMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 1.05, 1.05)), woodMat);
  counterMesh.position.set(-0.4, 0.52, 5.2);
  ichiraku.add(counterMesh);
  const stoolGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.34, 0.65, 10));
  for (let s = -2; s <= 2; s++) {
    const stool = new THREE.Mesh(stoolGeo, woodMat);
    stool.position.set(s * 1.4 - 0.4, 0.32, 6.2);
    ichiraku.add(stool);
  }

  const ichirakuLanternPivot = new THREE.Group();
  ichirakuLanternPivot.position.set(-3.9, 3.1, 6.45);
  ichiraku.add(ichirakuLanternPivot);

  const lanternCord = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6)), woodMat);
  lanternCord.position.y = -0.32;
  const lanternGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: lanternTex,
      emissive: new THREE.Color(0xef4444),
      emissiveMap: lanternTex,
      emissiveIntensity: 0.95,
      roughness: 0.55,
    })
  );
  const lanternBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 1.25, 14)), lanternGlowMat);
  lanternBody.position.y = -1.1;
  const lanternPointLight = new THREE.PointLight(0xff6b4a, 3.2, 14, 1.6);
  lanternPointLight.position.set(0, -1.1, 0);
  ichirakuLanternPivot.add(lanternCord, lanternBody, lanternPointLight);

  // Additional vibrant 3D Konoha street buildings wrapping all sides
  const townSpecs = [
    // Left avenue (-X)
    { x: -22.5, z: -19.5, w: 10.0, h: 8.6, d: 9.0, wallColor: 0x455f78, roofColor: 0x2d3748, rotY: Math.PI * 0.48, kanji: '忍具', awningColor: 0x7c5338 },
    { x: -21.5, z: -32.5, w: 10.5, h: 9.6, d: 9.5, wallColor: 0xc24943, roofColor: 0x334155, rotY: Math.PI * 0.44, kanji: '木ノ葉' },
    { x: -22.5, z: 7.5, w: 10.5, h: 8.0, d: 9.0, wallColor: 0xd8b47c, roofColor: 0x3b4859, rotY: Math.PI * 0.5, kanji: '茶屋', awningColor: 0x4b7f52 },
    { x: -22.5, z: 20.0, w: 10.5, h: 8.8, d: 9.5, wallColor: 0x5c7c68, roofColor: 0x2b3646, rotY: Math.PI * 0.5 },
    // Right avenue (+X)
    { x: 22.5, z: -18.5, w: 10.5, h: 9.0, d: 9.5, wallColor: 0x628b69, roofColor: 0x313e4f, rotY: -Math.PI * 0.48, kanji: '団子', awningColor: 0xa16244 },
    { x: 21.5, z: -32.0, w: 10.0, h: 8.5, d: 9.0, wallColor: 0xc9965b, roofColor: 0x334155, rotY: -Math.PI * 0.44, kanji: '火' },
    { x: 22.5, z: -4.0, w: 11.0, h: 9.2, d: 9.8, wallColor: 0x879976, roofColor: 0x2d3748, rotY: -Math.PI * 0.5, awningColor: 0x4a5568 },
    { x: 22.5, z: 10.5, w: 10.5, h: 8.2, d: 9.0, wallColor: 0xd9c7a8, roofColor: 0x364354, rotY: -Math.PI * 0.5 },
    { x: 22.5, z: 23.0, w: 10.0, h: 8.6, d: 9.0, wallColor: 0x4e6782, roofColor: 0x2b3646, rotY: -Math.PI * 0.55 },
    // Rear village houses (+Z)
    { x: -12.5, z: 24.5, w: 11.0, h: 8.4, d: 9.0, wallColor: 0xcfb997, roofColor: 0x334155, rotY: Math.PI, kanji: '忍' },
    { x: 12.5, z: 24.5, w: 11.0, h: 8.8, d: 9.0, wallColor: 0x5d7a64, roofColor: 0x2d3748, rotY: Math.PI, awningColor: 0x8b453a },
    { x: 0, z: 26.0, w: 11.5, h: 9.4, d: 9.2, wallColor: 0xb6594c, roofColor: 0x313e4f, rotY: Math.PI },
  ];
  for (const spec of townSpecs) {
    buildKonohaBuilding(spec);
  }

  // =========================================================================
  // 6. OVERHEAD UTILITY WIRES & FESTIVE STREET PENNANT BANNERS
  // =========================================================================
  const cableMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.7 }));
  const cableSpans: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-17.5, 11.2, -13), new THREE.Vector3(17.5, 11.5, -11)],
    [new THREE.Vector3(-17.5, 10.6, -24), new THREE.Vector3(17.5, 11.0, -22)],
    [new THREE.Vector3(-17.5, 11.2, 7), new THREE.Vector3(17.5, 11.4, 9)],
  ];
  const flagGeo = trackGeo(new THREE.ConeGeometry(0.42, 0.95, 3));
  const flagColors = [0xfef3c7, 0xdbeafe, 0xfecaca, 0xd1fae5];
  const flagInstMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  const flagInst = new THREE.InstancedMesh(flagGeo, flagInstMat, 24);
  let flagIdx = 0;

  for (let s = 0; s < cableSpans.length; s++) {
    const [p0, p1] = cableSpans[s];
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    mid.y -= 1.65;
    const curve = new THREE.CatmullRomCurve3([p0, mid, p1]);
    group.add(new THREE.Mesh(trackGeo(new THREE.TubeGeometry(curve, 20, 0.045, 6, false)), cableMat));

    if (s < 2) {
      for (let f = 0; f < 12; f++) {
        const t = 0.08 + (f / 11) * 0.84;
        const pt = curve.getPointAt(t);
        _tempObj.position.set(pt.x, pt.y - 0.42, pt.z);
        _tempObj.rotation.set(Math.PI, (s + f) * 0.25, 0);
        _tempObj.scale.set(1, 1, 1);
        _tempObj.updateMatrix();
        flagInst.setMatrixAt(flagIdx, _tempObj.matrix);
        _tempColor.setHex(flagColors[(f + s) % flagColors.length]);
        flagInst.setColorAt(flagIdx, _tempColor);
        flagIdx++;
      }
    }
  }
  flagInst.instanceMatrix.needsUpdate = true;
  if (flagInst.instanceColor) flagInst.instanceColor.needsUpdate = true;
  flagInst.computeBoundingSphere();
  group.add(flagInst);

  // =========================================================================
  // 7. LUSH 3D KONOHA TREES & FOLIAGE (Instanced Trunks + Leaf Canopies)
  // =========================================================================
  const treeCoords: Array<[number, number, number]> = [];
  let tSeed = 9187;
  const tRand = () => {
    tSeed = (tSeed * 16807) % 2147483647;
    return (tSeed - 1) / 2147483646;
  };
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2 + (tRand() - 0.5) * 0.09;
    const dist = 28 + tRand() * 34;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    if (tz < -14 && Math.abs(tx) < 15) continue; // Keep clear sightline to Hokage Mansion & Rock
    treeCoords.push([tx, tz, 0.85 + tRand() * 0.55]);
  }
  // Framing street-side trees near rooftops
  treeCoords.push(
    [-17.2, -13.5, 1.02],
    [-17.2, 1.0, 1.05],
    [17.2, -11.0, 1.05],
    [17.2, 4.0, 0.98],
    [-16.5, -33.0, 1.2],
    [16.5, -33.0, 1.2]
  );

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.52, 4.4, 8));
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c422c, roughness: 0.92 }));
  const canopyGeo = trackGeo(new THREE.IcosahedronGeometry(2.3, 1));
  const canopyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 }));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
  trunkInst.castShadow = true;
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCoords.length * 3);
  canopyInst.castShadow = true;
  canopyInst.receiveShadow = true;

  const leafTints = [0x4c9a3d, 0x3b8434, 0x62af47, 0x2f722d];
  let cIdx = 0;
  for (let i = 0; i < treeCoords.length; i++) {
    const [tx, tz, sc] = treeCoords[i];
    _tempObj.position.set(tx, 2.1 * sc, tz);
    _tempObj.rotation.set(0, i * 0.7, 0);
    _tempObj.scale.set(sc, sc, sc);
    _tempObj.updateMatrix();
    trunkInst.setMatrixAt(i, _tempObj.matrix);

    const offsets: Array<[number, number, number, number]> = [
      [0, 5.2, 0, 1.12],
      [-1.1, 4.4, 0.8, 0.85],
      [1.15, 4.6, -0.75, 0.88],
    ];
    for (let k = 0; k < 3; k++) {
      const [ox, oy, oz, cs] = offsets[k];
      _tempObj.position.set(tx + ox * sc, oy * sc, tz + oz * sc);
      _tempObj.rotation.set(k * 0.4, i + k, 0);
      _tempObj.scale.set(sc * cs, sc * cs * 0.85, sc * cs);
      _tempObj.updateMatrix();
      canopyInst.setMatrixAt(cIdx, _tempObj.matrix);
      _tempColor.setHex(leafTints[(i + k) % leafTints.length]);
      canopyInst.setColorAt(cIdx, _tempColor);
      cIdx++;
    }
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInst.instanceMatrix.needsUpdate = true;
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  group.add(trunkInst, canopyInst);

  // =========================================================================
  // 8. FLOATING SUNLIT KONOHA LEAVES DRIFTING IN THE BREEZE
  // =========================================================================
  const leafCount = 44;
  const leafGeo = trackGeo(new THREE.PlaneGeometry(0.24, 0.14));
  const leafMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x7bc950,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    })
  );
  const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  leafInst.frustumCulled = false;
  const leaves = Array.from({ length: leafCount }, () => ({
    x: (Math.random() - 0.5) * 32,
    y: 0.5 + Math.random() * 14,
    z: (Math.random() - 0.5) * 32,
    speedY: 0.65 + Math.random() * 0.7,
    phase: Math.random() * Math.PI * 2,
  }));
  group.add(leafInst);

  let activeLeafCount = leafCount;

  return {
    group,
    setParticleDensity: (scale: number) => {
      const clamped = THREE.MathUtils.clamp(scale, 0.15, 1.0);
      activeLeafCount = Math.max(8, Math.round(leafCount * clamped));
      leafInst.count = activeLeafCount;
    },
    update: (dt: number, elapsed: number) => {
      ichirakuLanternPivot.rotation.z = Math.sin(elapsed * 2.1) * 0.08;
      ichirakuLanternPivot.rotation.x = Math.cos(elapsed * 1.5) * 0.05;
      lanternPointLight.intensity = 3.0 + Math.sin(elapsed * 5.0) * 0.45;

      for (const cl of cloudClusters) {
        cl.group.position.x += Math.sin(elapsed * 0.06 + cl.offset) * cl.speed * dt;
      }

      for (let i = 0; i < activeLeafCount; i++) {
        const lf = leaves[i];
        lf.y -= lf.speedY * dt;
        lf.x += Math.sin(elapsed * 1.6 + lf.phase) * 0.85 * dt;
        lf.z += Math.cos(elapsed * 1.2 + lf.phase) * 0.6 * dt;
        if (lf.y < 0.12) {
          lf.y = 13 + Math.random() * 4;
          lf.x = (Math.random() - 0.5) * 30;
          lf.z = (Math.random() - 0.5) * 30;
        }
        _tempObj.position.set(lf.x, lf.y, lf.z);
        _tempObj.rotation.set(elapsed * 1.8 + lf.phase, elapsed * 2.3, Math.sin(elapsed + lf.phase));
        _tempObj.scale.set(1, 1, 1);
        _tempObj.updateMatrix();
        leafInst.setMatrixAt(i, _tempObj.matrix);
      }
      leafInst.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const t of textures) t.dispose();
      for (const m of localMaterials) m.dispose();
    },
  };
}
