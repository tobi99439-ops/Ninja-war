import * as THREE from 'three';
import { ShinobiMaterials } from '../materials';
import { createObitoFaceTexture } from '../textures';

export type BuiltInObitoVariant = 'obito_war' | 'tobi_orange' | 'obito_white';

export interface ObitoRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  cloakBack: THREE.Group;
  handFuma: THREE.Group;
  chakraRodHand: THREE.Mesh;
  gunbaiOrBackRods: THREE.Group;
  kamuiAuraRing: THREE.Mesh;
  tobiMaskGroup: THREE.Group;
  whiteMaskGroup: THREE.Group;
  faceTexture: THREE.CanvasTexture;
}

export function createGiantFumaShuriken(materials: ShinobiMaterials, scale = 1): THREE.Group {
  const shuriken = new THREE.Group();

  // Central ring with grip hole (matches reference image!)
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 0.36, 0, Math.PI * 2, false);
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, 0.19, 0, Math.PI * 2, true);
  ringShape.holes.push(holePath);

  const ringGeo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 24,
  });
  ringGeo.center();
  const ringMesh = new THREE.Mesh(ringGeo, materials.fumaSteel);
  ringMesh.castShadow = true;
  shuriken.add(ringMesh);

  // 4 huge swept Fuma blades with beveled dark crimson edges
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.26, -0.09);
  bladeShape.quadraticCurveTo(0.65, -0.22, 1.05, 0.0);
  bladeShape.quadraticCurveTo(0.62, 0.24, 0.26, 0.14);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.022,
    bevelSegments: 2,
  });
  bladeGeo.translate(0, 0, -0.0125);

  const edgeShape = new THREE.Shape();
  edgeShape.moveTo(0.42, -0.14);
  edgeShape.quadraticCurveTo(0.75, -0.21, 1.08, 0.0);
  edgeShape.quadraticCurveTo(0.72, 0.19, 0.42, 0.13);
  edgeShape.quadraticCurveTo(0.68, 0.02, 0.42, -0.14);

  const edgeGeo = new THREE.ExtrudeGeometry(edgeShape, {
    depth: 0.014,
    bevelEnabled: false,
  });
  edgeGeo.translate(0, 0, -0.007);

  for (let i = 0; i < 4; i++) {
    const bladePivot = new THREE.Group();
    bladePivot.rotation.z = (i * Math.PI) / 2;
    const blade = new THREE.Mesh(bladeGeo, materials.fumaSteel);
    blade.castShadow = true;
    const edge = new THREE.Mesh(edgeGeo, materials.fumaCrimsonEdge);
    bladePivot.add(blade, edge);
    shuriken.add(bladePivot);
  }

  shuriken.scale.setScalar(scale);
  return shuriken;
}

export function createObitoModel(materials: ShinobiMaterials, maxAniso: number): ObitoRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // 1. Legs & Shinobi Sandals (grounded bottom-center at y=0)
  const makeLeg = (xOffset: number) => {
    const leg = new THREE.Group();
    leg.position.set(xOffset, 0.9, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 4, 10), materials.obitoInnerSuit);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    leg.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 4, 10), materials.obitoInnerSuit);
    shin.position.y = -0.58;
    shin.castShadow = true;
    leg.add(shin);

    // Boot / shinobi sandal
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), materials.obitoGlove);
    boot.position.set(0, -0.83, 0.05);
    boot.castShadow = true;
    leg.add(boot);

    return leg;
  };

  const leftLeg = makeLeg(0.16);
  const rightLeg = makeLeg(-0.16);
  bodyPivot.add(leftLeg, rightLeg);

  // 2. Torso & Dark High-Neck Battle Suit
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.68, 12), materials.obitoInnerSuit);
  torso.position.y = 1.24;
  torso.castShadow = true;
  bodyPivot.add(torso);

  // Belt / waist sash
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), materials.obitoCloakOuter);
  sash.position.y = 0.96;
  bodyPivot.add(sash);

  // 3. Tattered War-Arc Cloak & High Cream-Lined Collar (from image!)
  const collarOuterGeo = new THREE.CylinderGeometry(0.32, 0.27, 0.34, 16, 1, true, Math.PI * 0.22, Math.PI * 1.56);
  const collarOuter = new THREE.Mesh(collarOuterGeo, materials.obitoCloakOuter);
  collarOuter.position.set(0, 1.56, -0.02);
  collarOuter.rotation.y = Math.PI;
  collarOuter.castShadow = true;
  bodyPivot.add(collarOuter);

  const collarInnerGeo = new THREE.CylinderGeometry(0.305, 0.255, 0.32, 16, 1, true, Math.PI * 0.24, Math.PI * 1.52);
  const collarInner = new THREE.Mesh(collarInnerGeo, materials.obitoCloakCollar);
  collarInner.position.set(0, 1.56, -0.015);
  collarInner.rotation.y = Math.PI;
  bodyPivot.add(collarInner);

  // Shoulder Mantle
  const mantle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.44, 0.34, 14, 1, true, Math.PI * 0.15, Math.PI * 1.7),
    materials.obitoCloakOuter
  );
  mantle.position.set(0, 1.42, -0.03);
  mantle.rotation.y = Math.PI;
  mantle.castShadow = true;
  bodyPivot.add(mantle);

  // Flowing tattered back cloak panels
  const cloakBack = new THREE.Group();
  cloakBack.position.set(0, 1.48, -0.18);
  const tailGeo = new THREE.BoxGeometry(0.58, 1.05, 0.045);
  tailGeo.translate(0, -0.52, 0);
  const mainTail = new THREE.Mesh(tailGeo, materials.obitoCloakOuter);
  mainTail.rotation.x = 0.14;
  mainTail.castShadow = true;
  cloakBack.add(mainTail);

  // Tattered edge spikes at bottom of cloak
  for (let i = -2; i <= 2; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), materials.obitoCloakOuter);
    spike.position.set(i * 0.12, -1.08, -0.14);
    spike.rotation.x = Math.PI - 0.14;
    cloakBack.add(spike);
  }
  bodyPivot.add(cloakBack);

  // 4. Arms (Left normal/sleeve, Right Hashirama-cell pale forearm + fingerless glove)
  const rightArm = new THREE.Group();
  rightArm.position.set(-0.31, 1.48, 0);
  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), materials.obitoCloakOuter);
  const rUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 8), materials.obitoCloakOuter);
  rUpper.position.y = -0.16;
  // Pale Hashirama cell forearm visible from torn sleeve
  const rForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.23, 4, 8), materials.obitoHashiramaSkin);
  rForearm.position.y = -0.42;
  const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.14), materials.obitoGlove);
  rGlove.position.y = -0.6;
  rUpper.castShadow = true;
  rForearm.castShadow = true;

  // Giant Fuma Shuriken held in right hand (just like the reference image!)
  const handFuma = createGiantFumaShuriken(materials, 0.72);
  handFuma.position.set(-0.08, -0.62, 0.18);
  handFuma.rotation.set(0.3, Math.PI / 2, 0.2);

  rightArm.add(rShoulder, rUpper, rForearm, rGlove, handFuma);
  bodyPivot.add(rightArm);

  const leftArm = new THREE.Group();
  leftArm.position.set(0.31, 1.48, 0);
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), materials.obitoCloakOuter);
  const lUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 8), materials.obitoCloakOuter);
  lUpper.position.y = -0.16;
  const lForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.23, 4, 8), materials.obitoInnerSuit);
  lForearm.position.y = -0.42;
  const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.14), materials.obitoGlove);
  lGlove.position.y = -0.6;
  lUpper.castShadow = true;

  // Black Chakra Receiver Rod held in left hand
  const chakraRodHand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.25, 8), materials.chakraRod);
  chakraRodHand.rotation.x = Math.PI / 2;
  chakraRodHand.position.set(0, -0.6, 0.42);
  chakraRodHand.castShadow = true;

  leftArm.add(lShoulder, lUpper, lForearm, lGlove, chakraRodHand);
  bodyPivot.add(leftArm);

  // Back-mounted Chakra Rods (crossed on back like War Arc Obito)
  const gunbaiOrBackRods = new THREE.Group();
  gunbaiOrBackRods.position.set(0, 1.32, -0.26);
  for (const angle of [-0.45, 0.45]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.1, 8), materials.chakraRod);
    rod.rotation.z = angle;
    gunbaiOrBackRods.add(rod);
  }
  bodyPivot.add(gunbaiOrBackRods);

  // 5. Head with Custom Sharingan + Rinnegan + Scarred Face Texture & Spiky Hair
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.78, 0.02);

  const faceTexture = createObitoFaceTexture(maxAniso);
  const headBaseGeo = new THREE.BoxGeometry(0.36, 0.39, 0.35);
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTexture,
    roughness: 0.55,
    metalness: 0.02,
  });
  const headMats = [
    materials.obitoSkin, // +X
    materials.obitoSkin, // -X
    materials.obitoHair, // +Y
    materials.obitoSkin, // -Y
    faceMat,             // +Z (Front face with Sharingan + Rinnegan + scars)
    materials.obitoHair, // -Z
  ];
  const headMesh = new THREE.Mesh(headBaseGeo, headMats);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Spiky dark blue-black Uchiha hair crown & bangs
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), materials.obitoHair);
  hairBack.position.set(0, 0.07, -0.05);
  hairBack.scale.set(1.05, 1.0, 1.12);
  headGroup.add(hairBack);

  const spikePositions: Array<[number, number, number, number, number, number, number]> = [
    [0, 0.29, -0.02, -0.1, 0, 0, 0.14],
    [-0.14, 0.25, 0.02, 0.1, 0, 0.45, 0.13],
    [0.14, 0.25, 0.02, 0.1, 0, -0.45, 0.13],
    [-0.2, 0.14, -0.02, 0, 0, 0.9, 0.12],
    [0.2, 0.14, -0.02, 0, 0, -0.9, 0.12],
    [-0.08, 0.23, 0.15, 0.65, 0, 0.2, 0.11],
    [0.08, 0.23, 0.15, 0.65, 0, -0.2, 0.11],
    [0, 0.22, -0.18, -0.65, 0, 0, 0.13],
    [-0.14, 0.18, -0.15, -0.5, 0, 0.4, 0.12],
    [0.14, 0.18, -0.15, -0.5, 0, -0.4, 0.12],
  ];

  for (const [px, py, pz, rx, ry, rz, rad] of spikePositions) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.55, rad * 1.9, 5), materials.obitoHair);
    spike.position.set(px, py, pz);
    spike.rotation.set(rx, ry, rz);
    spike.castShadow = true;
    headGroup.add(spike);
  }

  // Iconic Orange Swirl Tobi Mask (hidden by default; shown when 'tobi_orange' variant selected)
  const tobiMaskGroup = new THREE.Group();
  const orangeMaskMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.42,
    metalness: 0.12,
  });
  const blackGrooveMat = new THREE.MeshStandardMaterial({
    color: 0x090a0f,
    roughness: 0.75,
  });
  const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const tobiPlate = new THREE.Mesh(new THREE.BoxGeometry(0.375, 0.395, 0.045), orangeMaskMat);
  tobiPlate.position.set(0, 0, 0.175);
  tobiMaskGroup.add(tobiPlate);
  // Spiral black grooves radiating from right eye hole (-X on +Z face)
  for (let r = 0.07; r <= 0.18; r += 0.045) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 20, Math.PI * 1.45), blackGrooveMat);
    arc.position.set(-0.075, 0.035, 0.198);
    arc.rotation.z = r * 14;
    tobiMaskGroup.add(arc);
  }
  const tobiEyeHole = new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), blackGrooveMat);
  tobiEyeHole.position.set(-0.075, 0.035, 0.201);
  const tobiSharingan = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), eyeGlowMat);
  tobiSharingan.position.set(-0.075, 0.035, 0.203);
  tobiMaskGroup.add(tobiEyeHole, tobiSharingan);
  tobiMaskGroup.visible = false;
  headGroup.add(tobiMaskGroup);

  // Iconic White War-Arc Rinnegan Mask (hidden by default; shown when 'obito_white' variant selected)
  const whiteMaskGroup = new THREE.Group();
  const whiteMaskMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.35,
    metalness: 0.14,
  });
  const purpleRippleMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
  const whitePlate = new THREE.Mesh(new THREE.BoxGeometry(0.375, 0.395, 0.045), whiteMaskMat);
  whitePlate.position.set(0, 0, 0.175);
  whiteMaskGroup.add(whitePlate);
  const rinneganCrest = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 18), purpleRippleMat);
  rinneganCrest.position.set(0, 0.115, 0.201);
  const rightEyeSocket = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), blackGrooveMat);
  rightEyeSocket.position.set(-0.075, 0.035, 0.201);
  const rightSharingan = new THREE.Mesh(new THREE.CircleGeometry(0.019, 12), eyeGlowMat);
  rightSharingan.position.set(-0.075, 0.035, 0.203);
  const leftEyeSocket = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), blackGrooveMat);
  leftEyeSocket.position.set(0.075, 0.035, 0.201);
  const leftRinnegan = new THREE.Mesh(new THREE.CircleGeometry(0.019, 12), purpleRippleMat);
  leftRinnegan.position.set(0.075, 0.035, 0.203);
  whiteMaskGroup.add(rinneganCrest, rightEyeSocket, rightSharingan, leftEyeSocket, leftRinnegan);
  whiteMaskGroup.visible = false;
  headGroup.add(whiteMaskGroup);

  bodyPivot.add(headGroup);

  // Kamui aura indicator ring around Obito (hidden unless Kamui active)
  const kamuiAuraGeo = new THREE.TorusGeometry(0.95, 0.035, 8, 36);
  const kamuiAuraMat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    transparent: true,
    opacity: 0.0,
  });
  const kamuiAuraRing = new THREE.Mesh(kamuiAuraGeo, kamuiAuraMat);
  kamuiAuraRing.rotation.x = Math.PI / 2;
  kamuiAuraRing.position.y = 1.1;
  root.add(kamuiAuraRing);

  return {
    root,
    bodyPivot,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    cloakBack,
    handFuma,
    chakraRodHand,
    gunbaiOrBackRods,
    kamuiAuraRing,
    tobiMaskGroup,
    whiteMaskGroup,
    faceTexture,
  };
}

export function setBuiltInObitoVariant(rig: ObitoRig, variant: BuiltInObitoVariant): void {
  rig.tobiMaskGroup.visible = variant === 'tobi_orange';
  rig.whiteMaskGroup.visible = variant === 'obito_white';
  rig.handFuma.visible = variant !== 'tobi_orange';
  rig.chakraRodHand.visible = variant !== 'tobi_orange';
  rig.gunbaiOrBackRods.visible = variant !== 'tobi_orange';
}
