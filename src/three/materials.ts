import * as THREE from 'three';

export interface ShinobiMaterials {
  obitoCloakOuter: THREE.MeshStandardMaterial;
  obitoCloakCollar: THREE.MeshStandardMaterial;
  obitoInnerSuit: THREE.MeshStandardMaterial;
  obitoHashiramaSkin: THREE.MeshStandardMaterial;
  obitoSkin: THREE.MeshStandardMaterial;
  obitoHair: THREE.MeshStandardMaterial;
  obitoGlove: THREE.MeshStandardMaterial;
  fumaSteel: THREE.MeshPhysicalMaterial;
  fumaCrimsonEdge: THREE.MeshStandardMaterial;
  chakraRod: THREE.MeshPhysicalMaterial;
  rockBasalt: THREE.MeshStandardMaterial;
  rockMoss: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createShinobiMaterials(): ShinobiMaterials {
  const obitoCloakOuter = new THREE.MeshStandardMaterial({
    color: 0x26293b, // Deep indigo-slate War Arc tattered cloak
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  const obitoCloakCollar = new THREE.MeshStandardMaterial({
    color: 0xd6cab8, // Cream-beige inner collar lining seen in reference image
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const obitoInnerSuit = new THREE.MeshStandardMaterial({
    color: 0x11131a,
    roughness: 0.72,
    metalness: 0.08,
  });

  const obitoHashiramaSkin = new THREE.MeshStandardMaterial({
    color: 0xe5dfd5, // Pale white-ivory Hashirama cell right arm
    roughness: 0.65,
    metalness: 0.02,
  });

  const obitoSkin = new THREE.MeshStandardMaterial({
    color: 0xe7c1a5,
    roughness: 0.62,
    metalness: 0.02,
  });

  const obitoHair = new THREE.MeshStandardMaterial({
    color: 0x161925, // Dark blue-black spiky Uchiha hair
    roughness: 0.58,
    metalness: 0.14,
  });

  const obitoGlove = new THREE.MeshStandardMaterial({
    color: 0x1e222e,
    roughness: 0.42,
    metalness: 0.25,
  });

  const fumaSteel = new THREE.MeshPhysicalMaterial({
    color: 0x3b3f4c,
    roughness: 0.2,
    metalness: 0.92,
    anisotropy: 0.8,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
  });

  const fumaCrimsonEdge = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0x450a0a,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.75,
  });

  const chakraRod = new THREE.MeshPhysicalMaterial({
    color: 0x0f0f14,
    emissive: 0x3b0764,
    emissiveIntensity: 0.35,
    roughness: 0.18,
    metalness: 0.9,
    clearcoat: 0.8,
  });

  const rockBasalt = new THREE.MeshStandardMaterial({
    color: 0x252833,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: true,
  });

  const rockMoss = new THREE.MeshStandardMaterial({
    color: 0x1f2b29,
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
  });

  const all = [
    obitoCloakOuter,
    obitoCloakCollar,
    obitoInnerSuit,
    obitoHashiramaSkin,
    obitoSkin,
    obitoHair,
    obitoGlove,
    fumaSteel,
    fumaCrimsonEdge,
    chakraRod,
    rockBasalt,
    rockMoss,
  ];

  return {
    obitoCloakOuter,
    obitoCloakCollar,
    obitoInnerSuit,
    obitoHashiramaSkin,
    obitoSkin,
    obitoHair,
    obitoGlove,
    fumaSteel,
    fumaCrimsonEdge,
    chakraRod,
    rockBasalt,
    rockMoss,
    dispose: () => {
      all.forEach((m) => m.dispose());
    },
  };
}
