import * as THREE from 'three';

export const SIX_PATHS_MADARA_COLORS = {
  cloakWhite: 0xe6e8f0,
  cloakShadow: 0xb4bcd0,
  innerCharcoal: 0x0f1118,
  sashDark: 0x11131a,
  skinPeach: 0xdeb89e,
  skinShadow: 0xc49a7a,
  hairWhite: 0xf4f6fc,
  hairShadow: 0xd0d8ec,
  hornIvory: 0xe6e3dc,
  hornShadow: 0xc2beb5,
  teethWhite: 0xf4f1ea,
  tongueRed: 0xb84a56,
  scleraWhite: 0xf0edf5,
  rinneganLavender: 0xb9a8d8,
  rinneganRing: 0x221734,
  rinneSharinganRed: 0xc41e2e,
  rinneSharinganDark: 0x180509,
  gudoBlack: 0x0d0e14,
  sandalBlack: 0x161820,
} as const;

export function isSixPathsMadaraName(labelAr?: string, fileNameHint?: string): boolean {
  const candidates = [labelAr, fileNameHint];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/output\.glb|udttgm|9bbweg|madara_rikudo|مادارا\s*الريكودو/i.test(trimmed)) return false;
    if (/okh0vs|x8t4yy/i.test(trimmed)) return true;
    if (/madara[\s_\-]*(?:six[\s_\-]*paths)/i.test(trimmed)) return true;
    if (/(?:six[\s_\-]*paths)[\s_\-]*madara/i.test(trimmed)) return true;
    if (/مادارا\s*المسارات\s*الستة/.test(trimmed)) return true;
  }
  return false;
}

function makeDedicatedMaterial(
  srcMat: THREE.Material | null | undefined,
  opts: {
    roughness?: number;
    metalness?: number;
    emissiveHex?: number;
    emissiveIntensity?: number;
    side?: THREE.Side;
    vertexColors?: boolean;
  } = {}
): THREE.MeshStandardMaterial {
  const srcName = srcMat?.name || '';
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.68,
    metalness: opts.metalness ?? 0.06,
    emissive: new THREE.Color(opts.emissiveHex ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? true,
    envMapIntensity: 0.72,
  });
  mat.name = srcName || 'six_paths_madara_mat';
  return mat;
}

function paintUniformWithOptionalAo(
  mesh: THREE.Mesh,
  baseHex: number,
  shadowHex: number,
  aoWeight = 0.22
): void {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return;
  const count = pos.count;
  const existingColor = geo.attributes.color as THREE.BufferAttribute | undefined;
  const colors = new Float32Array(count * 3);
  const cBase = new THREE.Color(baseHex);
  const cShadow = new THREE.Color(shadowHex);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const aoRaw = existingColor ? existingColor.getX(i) : 1.0;
    const t = aoRaw < 0.5 ? aoWeight : 0.0;
    tmp.copy(cBase).lerp(cShadow, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function paintRinneganEyeSphere(mesh: THREE.Mesh): void {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const cSclera = new THREE.Color(SIX_PATHS_MADARA_COLORS.scleraWhite);
  const cIris = new THREE.Color(SIX_PATHS_MADARA_COLORS.rinneganLavender);
  const cRing = new THREE.Color(SIX_PATHS_MADARA_COLORS.rinneganRing);
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length() || 1;
    const nx = v.x / len;
    const ny = v.y / len;
    const nz = v.z / len;

    let col = cSclera;
    if (nz > 0.35) {
      const r = Math.hypot(nx, ny);
      if (r < 0.065) {
        col = cRing;
      } else if (r <= 0.44) {
        if (
          Math.abs(r - 0.145) < 0.018 ||
          Math.abs(r - 0.245) < 0.018 ||
          Math.abs(r - 0.345) < 0.018 ||
          Math.abs(r - 0.43) < 0.022
        ) {
          col = cRing;
        } else {
          col = cIris;
        }
      }
    }
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function paintRinneSharinganEyeSphere(mesh: THREE.Mesh): void {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  if (!pos) return;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const cSclera = new THREE.Color(SIX_PATHS_MADARA_COLORS.scleraWhite);
  const cRed = new THREE.Color(SIX_PATHS_MADARA_COLORS.rinneSharinganRed);
  const cDark = new THREE.Color(SIX_PATHS_MADARA_COLORS.rinneSharinganDark);
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length() || 1;
    const nx = v.x / len;
    const ny = v.y / len;
    const nz = v.z / len;

    let col = cSclera;
    if (nz > 0.25) {
      const r = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      if (r < 0.095) {
        col = cDark;
      } else if (r <= 0.62) {
        // 3 concentric rings + 9 curved tomoe dots across the two outer rings
        const onRing =
          Math.abs(r - 0.22) < 0.024 ||
          Math.abs(r - 0.40) < 0.024 ||
          Math.abs(r - 0.59) < 0.028;

        let onTomoe = false;
        if (!onRing && r > 0.16 && r < 0.50) {
          for (let k = 0; k < 3; k++) {
            const a1 = (k / 3) * Math.PI * 2 + 0.3;
            const d1 = Math.hypot(nx - Math.cos(a1) * 0.22, ny - Math.sin(a1) * 0.22);
            if (d1 < 0.048) {
              onTomoe = true;
              break;
            }
          }
          if (!onTomoe) {
            for (let k = 0; k < 6; k++) {
              const a2 = (k / 6) * Math.PI * 2 + 0.15;
              const d2 = Math.hypot(nx - Math.cos(a2) * 0.40, ny - Math.sin(a2) * 0.40);
              if (d2 < 0.046) {
                onTomoe = true;
                break;
              }
            }
          }
        }
        void angle;
        col = onRing || onTomoe ? cDark : cRed;
      }
    }
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function paintBodyMesh(mesh: THREE.Mesh): void {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!pos) return;

  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    box.expandByPoint(v);
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const footY = box.min.y;
  const bodyH = Math.max(0.5, size.y);
  const maxHalfX = Math.max(0.2, size.x * 0.5);

  const n = new THREE.Vector3();
  const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const col = new THREE.Color();

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const dx = v.x - center.x;
    const dz = v.z - center.z;
    const absX = Math.abs(dx);
    const yNorm = (v.y - footY) / bodyH;

    let dotOut = 0;
    if (norm) {
      n.fromBufferAttribute(norm, i).applyMatrix3(normalMat).normalize();
      const rad = Math.hypot(dx, dz);
      if (rad > 0.005) {
        dotOut = (n.x * dx + n.z * dz) / rad;
      }
    }

    let hex: number = SIX_PATHS_MADARA_COLORS.cloakWhite;

    // 1. Feet & Sandals + exposed skin toes
    if (yNorm < 0.068) {
      const isToeTip = dz > 0.055 && yNorm < 0.036;
      hex = isToeTip ? SIX_PATHS_MADARA_COLORS.skinPeach : SIX_PATHS_MADARA_COLORS.sandalBlack;
    }
    // 2. Extended hands / forearms / black shinobi gloves
    else if (yNorm > 0.36 && yNorm < 0.88 && absX > maxHalfX * 0.72) {
      if (absX > maxHalfX * 0.86) {
        hex = SIX_PATHS_MADARA_COLORS.innerCharcoal; // black fingerless gloves
      } else if (absX > maxHalfX * 0.77) {
        hex = SIX_PATHS_MADARA_COLORS.skinPeach; // bare wrists / lower arm gap
      } else {
        hex = SIX_PATHS_MADARA_COLORS.cloakWhite; // wide Six Paths sleeves
      }
    }
    // 3. Lower pants & sandals wrap (front center slit below waist shows dark shinobi trousers & calf wraps)
    else if (yNorm < 0.24) {
      const isWhiteFlaredHem =
        yNorm > 0.14 &&
        (dz < -0.025 || absX > 0.13) &&
        dotOut >= -0.15;
      hex = isWhiteFlaredHem ? SIX_PATHS_MADARA_COLORS.cloakWhite : SIX_PATHS_MADARA_COLORS.innerCharcoal;
    }
    // 4. Lower coat skirt with front V-opening exposing dark pants
    else if (yNorm < 0.48) {
      const tDown = THREE.MathUtils.clamp((0.48 - yNorm) / 0.24, 0, 1);
      const slitHalf = 0.022 + tDown * 0.105;
      if (dz > -0.005 && absX < slitHalf) {
        hex = SIX_PATHS_MADARA_COLORS.innerCharcoal;
      } else if (dotOut < -0.25) {
        hex = SIX_PATHS_MADARA_COLORS.cloakShadow;
      } else {
        hex = SIX_PATHS_MADARA_COLORS.cloakWhite;
      }
    }
    // 5. Waist sash / dark obi belt
    else if (yNorm >= 0.48 && yNorm <= 0.555) {
      hex = SIX_PATHS_MADARA_COLORS.sashDark;
    }
    // 6. Neck / Collar & Six Paths Magatama markings
    else if (yNorm >= 0.77) {
      const radialXZ = Math.hypot(dx, dz);
      // Inner neck & throat area
      if (radialXZ < 0.072 && yNorm >= 0.84) {
        hex = SIX_PATHS_MADARA_COLORS.skinPeach;
      } else if (radialXZ < 0.088 && yNorm >= 0.80 && dz > 0.01) {
        hex = SIX_PATHS_MADARA_COLORS.innerCharcoal;
      } else if (dz > 0.03 && yNorm >= 0.785 && yNorm <= 0.835 && absX < 0.145) {
        // 6 black magatama comma pattern across upper chest collar
        const magX = [-0.095, -0.062, -0.028, 0.028, 0.062, 0.095];
        const nearMag = magX.some((mx) => Math.hypot(dx - mx, (yNorm - 0.808) * 1.1) < 0.016);
        hex = nearMag ? SIX_PATHS_MADARA_COLORS.sashDark : SIX_PATHS_MADARA_COLORS.cloakWhite;
      } else if (yNorm >= 0.945 || (dotOut < -0.22 && yNorm >= 0.86)) {
        // Subtle collar rim shadow
        hex = SIX_PATHS_MADARA_COLORS.cloakShadow;
      } else {
        hex = SIX_PATHS_MADARA_COLORS.cloakWhite;
      }
    }
    // 7. Mid/Upper Torso Coat + Front Inner Suit + Back Six Paths Rinnegan Crest & 6 Magatama
    else {
      // Exposed front dark inner V-tunic
      const frontSlit = dz > 0.035 && absX < 0.055 + (yNorm - 0.555) * 0.09;
      if (frontSlit) {
        hex = SIX_PATHS_MADARA_COLORS.innerCharcoal;
      } else if (dz < -0.055 && absX < 0.145 && yNorm >= 0.59 && yNorm <= 0.76) {
        // Six Paths Rikudou back crest: dark Rinnegan circle + 6 magatama dots around/above it
        const cy = 0.675;
        const crestR = Math.hypot(dx, (yNorm - cy) * 1.15);
        const onOuterRing = Math.abs(crestR - 0.068) < 0.011;
        const onInnerRing = Math.abs(crestR - 0.036) < 0.009;
        let onBackMag = false;
        for (let k = 0; k < 6; k++) {
          const a = ((k - 2.5) / 3.0) * 0.92 + Math.PI * 0.5;
          const mx = Math.cos(a) * 0.088;
          const my = cy + Math.sin(a) * 0.072;
          if (Math.hypot(dx - mx, (yNorm - my) * 1.15) < 0.016) {
            onBackMag = true;
            break;
          }
        }
        hex = onOuterRing || onInnerRing || onBackMag
          ? SIX_PATHS_MADARA_COLORS.sashDark
          : SIX_PATHS_MADARA_COLORS.cloakWhite;
      } else if (dotOut < -0.3) {
        hex = SIX_PATHS_MADARA_COLORS.cloakShadow;
      } else {
        hex = SIX_PATHS_MADARA_COLORS.cloakWhite;
      }
    }

    col.setHex(hex);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Restores authentic Six Paths Madara (okh0vs) colors & materials onto his GLB hierarchy,
 * hides the duplicate `body2` mesh cleanly, and paints crisp Rinnegan / Rinne-Sharingan eyes
 * and Truth-Seeking Orbs directly onto the geometry.
 */
export function applySixPathsMadaraColors(rootObj: THREE.Object3D): void {
  rootObj.updateMatrixWorld(true);

  rootObj.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const name = (mesh.name || '').toLowerCase();

    // `body2` in okh0vs is an exact duplicate mesh overlapping `body1` (causes Z-fighting)
    if (name === 'body2') {
      mesh.visible = false;
      mesh.userData.skipDuplicate = true;
      return;
    }

    const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

    if (name === 'eyel' || name === 'eyer') {
      paintRinneganEyeSphere(mesh);
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.25,
        metalness: 0.05,
        emissiveHex: 0x3b2c54,
        emissiveIntensity: 0.22,
      });
    } else if (name === '3rdeye2') {
      paintRinneSharinganEyeSphere(mesh);
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.22,
        metalness: 0.05,
        emissiveHex: 0x7f1d1d,
        emissiveIntensity: 0.32,
      });
    } else if (/^sphere\d+$/i.test(name)) {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.gudoBlack,
        SIX_PATHS_MADARA_COLORS.gudoBlack,
        0.0
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.26,
        metalness: 0.35,
        emissiveHex: 0x31105c,
        emissiveIntensity: 0.28,
      });
    } else if (name === 'kamia' || name === 'kamib') {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.hairWhite,
        SIX_PATHS_MADARA_COLORS.hairShadow,
        0.2
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.62,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });
    } else if (name === 'horna' || name === 'hornb') {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.hornIvory,
        SIX_PATHS_MADARA_COLORS.hornShadow,
        0.18
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.52,
        metalness: 0.05,
      });
    } else if (name === 'kao1' || name === 'kao2' || name === '3rdeye1') {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.skinPeach,
        SIX_PATHS_MADARA_COLORS.skinShadow,
        0.16
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.64,
        metalness: 0.02,
      });
    } else if (name === 'upper_teeth' || name === 'lower_teeth') {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.teethWhite,
        SIX_PATHS_MADARA_COLORS.teethWhite,
        0.0
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.42,
        metalness: 0.02,
      });
    } else if (name === 'tongue') {
      paintUniformWithOptionalAo(
        mesh,
        SIX_PATHS_MADARA_COLORS.tongueRed,
        SIX_PATHS_MADARA_COLORS.tongueRed,
        0.0
      );
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.55,
        metalness: 0.02,
      });
    } else {
      // `body1` (full Rikudou haori cloak, inner suit, sash, gloves, sandals)
      paintBodyMesh(mesh);
      mesh.material = makeDedicatedMaterial(srcMat, {
        roughness: 0.72,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
    }
  });
}
