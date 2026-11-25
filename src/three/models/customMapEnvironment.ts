import * as THREE from 'three';
import { ShinobiMaterials } from '../materials';
import { EnvironmentObjects } from './environment';
import { parseRawModelSource } from './gltfObitoLoader';

const CUSTOM_MAP_GLB_URL = 'https://files.catbox.moe/2snmwp.glb';

let activeCustomMapSource: string | Blob | null = null;
let cachedMapScenePromise: Promise<THREE.Group | null> | null = null;
let cachedMapScene: THREE.Group | null = null;

export function setActiveCustomMapSource(source: string | Blob | null): void {
  if (activeCustomMapSource !== source) {
    disposeCustomMapTemplateCache();
  }
  activeCustomMapSource = source;
  cachedMapScene = null;
  cachedMapScenePromise = null;
}


/**
 * Prevents dark baked vertex colors from muddying sRGB baseColor textures
 */
function calibrateMapVertexColors(_geometry: THREE.BufferGeometry): void {
  // Preserve 100% of the arena's original vertex colors and ambient occlusion exactly as exported
}

/**
 * Calibrates raw GLB PBR materials for Vibrant Storm 4 anime colors and crisp contrast:
 * - Enforces SRGBColorSpace + anisotropic filtering on albedo/emissive maps
 * - Removes chalky IBL glare washout on non-metallic stone, wood, earth, and foliage
 * - Boosts color vibrancy gently without blowing out highlights
 */
function calibrateStorm4MapMaterials(root: THREE.Object3D, maxAniso: number): void {
  const aniso = Math.min(8, Math.max(1, maxAniso || 4));
  const tunedMats = new Set<THREE.Material>();
  const hsl = { h: 0, s: 0, l: 0 };

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const hasMapAny = mats.some((m) => Boolean((m as THREE.MeshStandardMaterial | undefined)?.map));
    if (mesh.geometry && hasMapAny) {
      calibrateMapVertexColors(mesh.geometry);
    }

    for (const mat of mats) {
      if (!mat || tunedMats.has(mat)) continue;
      tunedMats.add(mat);

      const std = mat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.anisotropy = aniso;
        std.map.needsUpdate = true;
      }
      if (std.emissiveMap) {
        std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        std.emissiveMap.anisotropy = aniso;
        std.emissiveMap.needsUpdate = true;
      }

      const metalness = typeof std.metalness === 'number' ? std.metalness : 0;
      const roughness = typeof std.roughness === 'number' ? std.roughness : 0.7;
      const isMetallic = metalness >= 0.25;

      // Eliminate broad milky IBL sheen over stone/wood/grass that makes raw GLBs look pale
      if ('envMapIntensity' in std) {
        std.envMapIntensity = isMetallic ? 0.85 : 0.34;
      }
      if ('roughness' in std && !isMetallic) {
        // Preserve glossy water/glass (roughness < 0.32), keep matte terrain/foliage rich & non-chalky
        if (roughness >= 0.32) {
          std.roughness = THREE.MathUtils.clamp(roughness, 0.76, 0.94);
        }
      }

      if (std.emissive && !std.emissive.equals(new THREE.Color(0x000000))) {
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 1, 1.25);
      }

      // Clean foliage / cutout alpha edges without fuzzy transparent sorting glitches
      if (std.transparent && (std.map || std.alphaMap) && (std.opacity ?? 1) >= 0.95) {
        std.alphaTest = Math.max(std.alphaTest || 0, 0.38);
        std.transparent = false;
        std.depthWrite = true;
        std.side = THREE.DoubleSide;
      }

      mat.needsUpdate = true;
    }
  });
}

async function loadRawCustomMapScene(maxAniso: number): Promise<THREE.Group | null> {
  if (cachedMapScene) return cachedMapScene;
  if (cachedMapScenePromise) return cachedMapScenePromise;

  cachedMapScenePromise = (async () => {
    try {
      const source = activeCustomMapSource || CUSTOM_MAP_GLB_URL;
      const hint = typeof source === 'string' ? source : 'arena.glb';
      const { rawModel } = await parseRawModelSource(source, hint);
      if (!rawModel) return null;

      const root = rawModel;
      root.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Normalize extreme unit mismatches (e.g. mm/cm exports or tiny dioramas)
      const maxSpan = Math.max(size.x, size.z, 1);
      let unitScale = 1;
      if (maxSpan < 18) {
        unitScale = 44 / maxSpan;
      } else if (maxSpan > 260) {
        unitScale = 85 / maxSpan;
      }
      if (unitScale !== 1) {
        root.scale.multiplyScalar(unitScale);
        root.updateMatrixWorld(true);
      }

      // Center horizontally around arena origin (0, 0)
      const scaledBox = new THREE.Box3().setFromObject(root);
      scaledBox.getCenter(center);
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.updateMatrixWorld(true);

      // Find exact playable floor height near origin via downward raycast so characters stand flush on y = 0
      const raycaster = new THREE.Raycaster();
      const downDir = new THREE.Vector3(0, -1, 0);
      const sampleY = scaledBox.max.y + 10;
      const hitYs: number[] = [];
      const sampleOffsets = [
        [0, 0],
        [2.5, 0],
        [-2.5, 0],
        [0, 2.5],
        [0, -2.5],
        [5, 5],
        [-5, -5],
      ];
      for (const [sx, sz] of sampleOffsets) {
        raycaster.set(new THREE.Vector3(sx, sampleY, sz), downDir);
        const hits = raycaster.intersectObject(root, true);
        if (hits.length > 0) {
          const chosen =
            hits.find((h) => h.point.y <= scaledBox.min.y + (scaledBox.max.y - scaledBox.min.y) * 0.55) ||
            hits[hits.length - 1];
          hitYs.push(chosen.point.y);
        }
      }

      if (hitYs.length > 0) {
        hitYs.sort((a, b) => a - b);
        const floorY = hitYs[Math.floor(hitYs.length / 2)];
        root.position.y -= floorY;
      } else {
        root.position.y -= scaledBox.min.y;
      }
      root.updateMatrixWorld(true);

      calibrateStorm4MapMaterials(root, maxAniso);

      cachedMapScene = root;
      return root;
    } catch {
      cachedMapScenePromise = null;
      return null;
    }
  })();

  return cachedMapScenePromise;
}

export function disposeCustomMapTemplateCache(): void {
  const tpl = cachedMapScene;
  cachedMapScene = null;
  cachedMapScenePromise = null;
  if (!tpl) return;

  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTexs = new Set<THREE.Texture>();

  const disposeTex = (t: THREE.Texture | null | undefined) => {
    if (!t || disposedTexs.has(t)) return;
    disposedTexs.add(t);
    t.dispose();
  };

  const disposeMat = (m: THREE.Material | null | undefined) => {
    if (!m || disposedMats.has(m)) return;
    disposedMats.add(m);
    const std = m as THREE.MeshStandardMaterial;
    disposeTex(std.map);
    disposeTex(std.normalMap);
    disposeTex(std.bumpMap);
    disposeTex(std.roughnessMap);
    disposeTex(std.metalnessMap);
    disposeTex(std.emissiveMap);
    disposeTex(std.aoMap);
    disposeTex(std.alphaMap);
    m.dispose();
  };

  tpl.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
        disposedGeos.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(disposeMat);
      } else {
        disposeMat(mesh.material);
      }
    }
  });
  tpl.clear();
}

/**
 * Loads and mounts `https://files.catbox.moe/2snmwp.glb` lazily on demand,
 * calibrating its materials for Vibrant Storm 4 anime colors and crisp contrast.
 */
export function buildCustomMapEnvironment(
  _materials: ShinobiMaterials,
  maxAniso: number
): EnvironmentObjects {
  const group = new THREE.Group();
  let disposed = false;
  let loadedClone: THREE.Group | null = null;

  // Lightweight fallback shadow-catcher disc shown only while the remote GLB finishes streaming
  const placeholderGeo = new THREE.CircleGeometry(28, 48);
  placeholderGeo.rotateX(-Math.PI / 2);
  const placeholderMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const placeholderFloor = new THREE.Mesh(placeholderGeo, placeholderMat);
  placeholderFloor.position.y = -0.01;
  placeholderFloor.receiveShadow = true;
  group.add(placeholderFloor);

  const envObj: EnvironmentObjects = {
    group,
    arenaRadius: 24,
    update: () => {
      // Static calibrated GLB arena map
    },
    dispose: () => {
      disposed = true;
      if (loadedClone) {
        group.remove(loadedClone);
        loadedClone.clear();
        loadedClone = null;
      }
      group.remove(placeholderFloor);
      placeholderGeo.dispose();
      placeholderMat.dispose();
    },
  };

  void loadRawCustomMapScene(maxAniso).then((template) => {
    if (disposed || !template) return;

    const clone = template.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const playableRadius = THREE.MathUtils.clamp(
      Math.min(size.x, size.z) * 0.42,
      16,
      36
    );
    envObj.arenaRadius = playableRadius;

    loadedClone = clone;
    placeholderFloor.visible = false;
    group.add(clone);
  });

  return envObj;
}
