import * as THREE from 'three';

export const ORIGINAL_OBITO_TEXTURE_URLS = {
  main: 'https://files.catbox.moe/ik8hp2.png',
  main2: 'https://files.catbox.moe/1gn7fw.png',
  main3: 'https://files.catbox.moe/hg2oge.png',
  leftEye: 'https://files.catbox.moe/9j47o4.png',
  rightEye: 'https://files.catbox.moe/5wfn2a.png',
  faceCracks: 'https://files.catbox.moe/24emnk.png',
} as const;

interface OriginalObitoTextureSet {
  main: THREE.Texture | null;
  main2: THREE.Texture | null;
  main3: THREE.Texture | null;
  leftEye: THREE.Texture | null;
  rightEye: THREE.Texture | null;
  faceCracks: THREE.Texture | null;
}

function loadConfiguredTexture(
  loader: THREE.TextureLoader,
  url: string
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function selectTextureForPartName(
  partName: string,
  textures: OriginalObitoTextureSet
): { texture: THREE.Texture | null; isFaceCracks: boolean } {
  // 1. Left Eye
  if (/left[\s_]*eye/i.test(partName)) {
    return { texture: textures.leftEye ?? textures.main, isFaceCracks: false };
  }
  // 2. Right Eye
  if (/right[\s_]*eye/i.test(partName)) {
    return { texture: textures.rightEye ?? textures.main, isFaceCracks: false };
  }
  // 3. Face Cracks (transparent overlay)
  if (/face[\s_]*cracks?/i.test(partName)) {
    return { texture: textures.faceCracks, isFaceCracks: true };
  }
  // 4. Lower Clothing (main 2.png for Robe_Lower / Lower_Body, main 3.png for extra lower details)
  if (
    /(?:robe[\s_]*lower|lower[\s_]*body)[\s_]*(?:extra|detail|trim|add|addon|secondary|2|3)/i.test(
      partName
    ) ||
    /lower[\s_]*(?:extra|detail|trim|add|addon|cloth)/i.test(partName)
  ) {
    return { texture: textures.main3 ?? textures.main2 ?? textures.main, isFaceCracks: false };
  }
  if (/robe[\s_]*lower|lower[\s_]*body/i.test(partName)) {
    return { texture: textures.main2 ?? textures.main, isFaceCracks: false };
  }
  // 5. Default: Body, face, hair, upper outfit, neck, arms, teeth, tongue
  return { texture: textures.main, isFaceCracks: false };
}

let cachedTextureSetPromise: Promise<OriginalObitoTextureSet> | null = null;

function getOrLoadOriginalObitoTextureSet(): Promise<OriginalObitoTextureSet> {
  if (!cachedTextureSetPromise) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    cachedTextureSetPromise = Promise.all([
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.main),
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.main2),
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.main3),
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.leftEye),
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.rightEye),
      loadConfiguredTexture(loader, ORIGINAL_OBITO_TEXTURE_URLS.faceCracks),
    ]).then(([main, main2, main3, leftEye, rightEye, faceCracks]) => ({
      main,
      main2,
      main3,
      leftEye,
      rightEye,
      faceCracks,
    }));
  }
  return cachedTextureSetPromise;
}

/**
 * Loads and applies the 6 original textures onto the Original Obito (`gxujni.glb` / `obito_final.glb`)
 * model using `THREE.TextureLoader` with `crossOrigin = 'anonymous'`, `flipY = false`, and
 * `THREE.SRGBColorSpace`.
 */
export async function applyOriginalObitoTextures(model: THREE.Object3D): Promise<void> {
  const textureSet = await getOrLoadOriginalObitoTextureSet();

  const clonedPerSource = new Map<THREE.Texture, THREE.Texture>();
  const oldMaterialsToDispose = new Set<THREE.Material>();

  const getClonedTexture = (srcTex: THREE.Texture | null): THREE.Texture | null => {
    if (!srcTex) return null;
    let c = clonedPerSource.get(srcTex);
    if (!c) {
      c = srcTex.clone();
      c.needsUpdate = true;
      clonedPerSource.set(srcTex, c);
    }
    return c;
  };

  model.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const originalMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    const updatedMats = originalMats.map((origMat) => {
      const mat = origMat
        ? origMat.clone()
        : new THREE.MeshStandardMaterial({ color: 0xffffff });
      if (origMat && origMat !== mat) {
        oldMaterialsToDispose.add(origMat);
      }

      const candidateName = `${mesh.name || ''} ${mat.name || ''}`.trim();
      const { texture, isFaceCracks } = selectTextureForPartName(candidateName, textureSet);

      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) {
        std.color.setHex(0xffffff);
      }
      mat.vertexColors = false;

      const matTex = getClonedTexture(texture);
      if (matTex) {
        std.map = matTex;
      }

      if (isFaceCracks) {
        mat.transparent = true;
        mat.opacity = 1;
        mat.depthWrite = false;
        mat.alphaTest = 0.02;
        mat.side = THREE.DoubleSide;
      } else {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
      }

      if ('roughness' in std) {
        std.roughness = 0.78;
      }
      if ('metalness' in std) {
        std.metalness = 0.04;
      }
      if ('envMapIntensity' in std) {
        std.envMapIntensity = 0.42;
      }

      mat.needsUpdate = true;
      return mat;
    });

    mesh.material = Array.isArray(mesh.material) ? updatedMats : updatedMats[0];
  });

  oldMaterialsToDispose.forEach((m) => m.dispose());
}
