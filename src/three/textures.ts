import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D canvas context');
  return [canvas, ctx];
}

function finalizeColorTexture(canvas: HTMLCanvasElement, maxAniso: number, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  if (repeat !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.needsUpdate = true;
  return tex;
}

export function createObitoFaceTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);

  // Base warm anime skin tone
  ctx.fillStyle = '#e7c1a5';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle cheek/jaw shading
  const grad = ctx.createLinearGradient(0, 140, 0, 512);
  grad.addColorStop(0, 'rgba(180, 120, 90, 0.08)');
  grad.addColorStop(1, 'rgba(130, 80, 60, 0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Character's right cheek (left side of front UV face): Hashirama cell scarred lines
  ctx.strokeStyle = 'rgba(110, 68, 52, 0.72)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const scarCurves = [
    [130, 235, 175, 255, 225, 260],
    [122, 262, 172, 282, 222, 286],
    [128, 290, 176, 308, 218, 312],
    [138, 318, 180, 336, 214, 340],
    [155, 346, 188, 368, 210, 382],
    [195, 232, 212, 265, 206, 312],
  ];
  for (const [x1, y1, cx, cy, x2, y2] of scarCurves) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  }

  // Right eye (viewer left, x ~ 196): Sharingan (crimson red + black Kamui Mangekyou pattern)
  const rx = 196;
  const ry = 232;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(rx, ry, 28, 15, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Crimson Sharingan Iris
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(rx, ry, 13.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Mangekyou windmill blades + pupil
  ctx.fillStyle = '#09090b';
  ctx.beginPath();
  ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - 0.3;
    ctx.beginPath();
    ctx.moveTo(rx + Math.cos(a) * 4, ry + Math.sin(a) * 4);
    ctx.quadraticCurveTo(
      rx + Math.cos(a + 0.55) * 12,
      ry + Math.sin(a + 0.55) * 12,
      rx + Math.cos(a + 0.95) * 11,
      ry + Math.sin(a + 0.95) * 11
    );
    ctx.lineTo(rx + Math.cos(a + 0.3) * 6, ry + Math.sin(a + 0.3) * 6);
    ctx.fill();
  }

  // Left eye (viewer right, x ~ 316): Rinnegan (lavender-purple with concentric ripples)
  const lx = 316;
  const ly = 232;
  ctx.fillStyle = '#c4b5fd';
  ctx.beginPath();
  ctx.ellipse(lx, ly, 28, 15, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Rinnegan rings
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 1.8;
  for (const r of [13, 9.5, 6]) {
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fill();

  // Sharp fierce eyebrows
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(155, 206);
  ctx.lineTo(232, 220);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(357, 206);
  ctx.lineTo(280, 220);
  ctx.stroke();

  // Nose shadow
  ctx.strokeStyle = 'rgba(110, 65, 45, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(256, 240);
  ctx.lineTo(251, 294);
  ctx.lineTo(263, 299);
  ctx.stroke();

  // Confident War-Arc smirk
  ctx.strokeStyle = '#4a281d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(224, 336);
  ctx.quadraticCurveTo(258, 344, 294, 328);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(234, 336);
  ctx.quadraticCurveTo(258, 343, 286, 331);
  ctx.quadraticCurveTo(258, 335, 234, 336);
  ctx.fill();

  return finalizeColorTexture(canvas, maxAniso);
}

export type EnemyTextureKind =
  | 'zetsu'
  | 'rogue'
  | 'itachi'
  | 'pain'
  | 'kakashi'
  | 'sasuke'
  | 'minato'
  | 'naruto'
  | 'madara';

export function createEnemyFaceTexture(
  kind: EnemyTextureKind,
  maxAniso: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.scale(2, 2);

  const drawAnimeEye = (
    cx: number,
    cy: number,
    irisColor: string,
    pupilColor = '#09090b',
    style: 'normal' | 'sharingan' | 'rinnegan' | 'mangekyou' | 'sage' = 'normal',
    tilt = 0
  ) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Crisp sclera
    ctx.fillStyle = style === 'rinnegan' ? '#c8b8f0' : style === 'sage' ? '#fef3c7' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 9.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bold Storm 4 upper/lower ink lash line
    ctx.strokeStyle = '#15161c';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-18, -1);
    ctx.quadraticCurveTo(0, -11, 18, 0);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.quadraticCurveTo(0, 9.5, 15, 2);
    ctx.stroke();

    if (style === 'rinnegan') {
      ctx.strokeStyle = '#31155c';
      ctx.lineWidth = 1.6;
      for (const r of [12.5, 9.0, 5.8]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#1e103d';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (kind === 'sasuke') {
        // 6-tomoe Rinnegan accents
        ctx.fillStyle = '#180c2e';
        for (let t = 0; t < 6; t++) {
          const a = (t / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = irisColor;
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#15161c';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      if (style === 'sage') {
        ctx.fillStyle = pupilColor;
        ctx.fillRect(-1.5, -5.8, 3, 11.6);
      } else if (style === 'mangekyou') {
        // Itachi 3-blade pinwheel
        ctx.fillStyle = '#09090b';
        for (let b = 0; b < 3; b++) {
          const a = (b * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(Math.cos(a + 0.5) * 6.5, Math.sin(a + 0.5) * 6.5, Math.cos(a) * 6.8, Math.sin(a) * 6.8);
          ctx.fill();
        }
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (style === 'sharingan') {
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        for (let t = 0; t < 3; t++) {
          const a = (t * Math.PI * 2) / 3 - 0.3;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 4.8, Math.sin(a) * 4.8, 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = pupilColor;
        ctx.beginPath();
        ctx.arc(0, 0, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2.2, -2.2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  const drawStormNoseAndMouth = (skinShadow: string, smirk = false) => {
    // Crisp cel nose bridge & nostril ink shadow
    ctx.strokeStyle = skinShadow;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 118);
    ctx.lineTo(125, 145);
    ctx.lineTo(132, 148);
    ctx.stroke();

    // Firm Storm 4 mouth ink stroke
    ctx.strokeStyle = '#331c15';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    if (smirk) {
      ctx.moveTo(106, 178);
      ctx.quadraticCurveTo(130, 183, 152, 173);
    } else {
      ctx.moveTo(106, 178);
      ctx.quadraticCurveTo(128, 173, 150, 178);
    }
    ctx.stroke();
  };

  if (kind === 'zetsu') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 172, 256, 84);
    for (const x of [92, 164]) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(x, 118, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#15161c';
      ctx.lineWidth = 2.8;
      ctx.stroke();
    }
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(96, 178);
    ctx.lineTo(160, 178);
    ctx.stroke();
  } else if (kind === 'kakashi') {
    ctx.fillStyle = '#e5be9e';
    ctx.fillRect(0, 0, 256, 256);
    // Sharp stepped Storm 4 brow shadow band
    ctx.fillStyle = 'rgba(130, 80, 58, 0.22)';
    ctx.fillRect(0, 74, 256, 24);

    // Dark navy shinobi mask covering lower face with crisp Storm 4 seam ink
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(0, 134);
    ctx.quadraticCurveTo(128, 122, 256, 134);
    ctx.lineTo(256, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    drawAnimeEye(96, 110, '#1e293b', '#09090b', 'normal', -0.07);
    // Left eye Sharingan + iconic vertical scar
    ctx.strokeStyle = '#881313';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(162, 80);
    ctx.lineTo(162, 138);
    ctx.stroke();
    drawAnimeEye(162, 110, '#dc2626', '#09090b', 'sharingan', 0.07);

    // Silver eyebrows
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(76, 94);
    ctx.lineTo(116, 99);
    ctx.moveTo(182, 94);
    ctx.lineTo(142, 99);
    ctx.stroke();
  } else if (kind === 'naruto') {
    ctx.fillStyle = '#e8c09c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(145, 88, 56, 0.22)';
    ctx.fillRect(0, 184, 256, 72);

    // Fox whisker marks with crisp ink edge
    ctx.strokeStyle = '#6b240c';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 136 + i * 11;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(84, y + 3);
      ctx.moveTo(206, y);
      ctx.lineTo(172, y + 3);
      ctx.stroke();
    }
    drawAnimeEye(96, 112, '#f59e0b', '#09090b', 'sage', -0.06);
    drawAnimeEye(160, 112, '#f59e0b', '#09090b', 'sage', 0.06);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(76, 95);
    ctx.lineTo(116, 102);
    ctx.moveTo(180, 95);
    ctx.lineTo(140, 102);
    ctx.stroke();
    drawStormNoseAndMouth('#7a432b', true);
  } else if (kind === 'madara') {
    // Edo Tensei cracked pale-slate skin + dual Rinnegan
    ctx.fillStyle = '#c8cfd9';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(71, 85, 105, 0.24)';
    ctx.fillRect(0, 186, 256, 70);

    // Iconic Edo Tensei facial fissures
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const cracks = [
      [68, 86, 82, 134, 72, 178],
      [186, 94, 172, 140, 182, 184],
      [84, 148, 98, 158, 104, 172],
    ];
    for (const [x1, y1, x2, y2, x3, y3] of cracks) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.stroke();
    }

    drawAnimeEye(96, 112, '#c8b8f0', '#1e103d', 'rinnegan', -0.1);
    drawAnimeEye(160, 112, '#c8b8f0', '#1e103d', 'rinnegan', 0.1);

    // Sharp black eyebrows
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(74, 93);
    ctx.lineTo(118, 102);
    ctx.moveTo(182, 93);
    ctx.lineTo(138, 102);
    ctx.stroke();
    drawStormNoseAndMouth('#475569', true);
  } else if (kind === 'sasuke') {
    ctx.fillStyle = '#ecd0b8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(130, 85, 70, 0.2)';
    ctx.fillRect(0, 188, 256, 68);

    // Right eye: Sharingan | Left eye: 6-Tomoe Rinnegan (War Arc Storm 4!)
    drawAnimeEye(96, 112, '#dc2626', '#09090b', 'sharingan', -0.09);
    drawAnimeEye(160, 112, '#c8b8f0', '#1e103d', 'rinnegan', 0.09);

    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(75, 95);
    ctx.lineTo(116, 103);
    ctx.moveTo(181, 95);
    ctx.lineTo(140, 103);
    ctx.stroke();
    drawStormNoseAndMouth('#7c5242', false);
  } else if (kind === 'itachi') {
    ctx.fillStyle = '#e7c5aa';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(128, 82, 66, 0.22)';
    ctx.fillRect(0, 186, 256, 70);

    // Iconic Itachi tear-trough creases sweeping down from inner eye corners
    ctx.strokeStyle = '#472a24';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(110, 120);
    ctx.quadraticCurveTo(99, 134, 94, 148);
    ctx.moveTo(146, 120);
    ctx.quadraticCurveTo(157, 134, 162, 148);
    ctx.stroke();

    drawAnimeEye(96, 112, '#dc2626', '#09090b', 'mangekyou', -0.06);
    drawAnimeEye(160, 112, '#dc2626', '#09090b', 'mangekyou', 0.06);

    ctx.strokeStyle = '#14151b';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(76, 96);
    ctx.lineTo(116, 103);
    ctx.moveTo(180, 96);
    ctx.lineTo(140, 103);
    ctx.stroke();
    drawStormNoseAndMouth('#75483a', false);
  } else if (kind === 'pain') {
    ctx.fillStyle = '#e4c2a8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(110, 72, 62, 0.22)';
    ctx.fillRect(0, 186, 256, 70);

    drawAnimeEye(96, 112, '#c8b8f0', '#1e103d', 'rinnegan', -0.07);
    drawAnimeEye(160, 112, '#c8b8f0', '#1e103d', 'rinnegan', 0.07);

    // Pain's iconic dark steel chakra receiver piercings: nose bridge bar + ear/cheek/lower lip studs!
    ctx.fillStyle = '#181920';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.2;
    // Nose bridge bar
    ctx.fillRect(114, 114, 28, 4.5);
    // 3 diagonal cheek studs on each side + 2 chin/lip studs
    for (const sx of [-1, 1]) {
      for (let p = 0; p < 3; p++) {
        ctx.beginPath();
        ctx.arc(128 + sx * (38 + p * 8), 146 + p * 6, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const px of [118, 138]) {
      ctx.beginPath();
      ctx.arc(px, 190, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(76, 95);
    ctx.lineTo(116, 102);
    ctx.moveTo(180, 95);
    ctx.lineTo(140, 102);
    ctx.stroke();
    drawStormNoseAndMouth('#734638', false);
  } else if (kind === 'minato') {
    ctx.fillStyle = '#ebc5a4';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(138, 86, 60, 0.2)';
    ctx.fillRect(0, 186, 256, 70);

    // Bright cobalt-blue eyes matching Fourth Hokage Storm 4
    drawAnimeEye(96, 112, '#2563eb', '#09090b', 'normal', -0.06);
    drawAnimeEye(160, 112, '#2563eb', '#09090b', 'normal', 0.06);

    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(76, 95);
    ctx.lineTo(116, 101);
    ctx.moveTo(180, 95);
    ctx.lineTo(140, 101);
    ctx.stroke();
    drawStormNoseAndMouth('#7b4832', true);
  } else {
    // Edo Tensei cracked shinobi face
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(72, 95);
    ctx.lineTo(86, 145);
    ctx.lineTo(76, 185);
    ctx.moveTo(182, 110);
    ctx.lineTo(168, 150);
    ctx.stroke();
    for (const x of [96, 160]) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.ellipse(x, 116, 15, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(x, 116, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawStormNoseAndMouth('#475569', false);
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createKonohaPlateTexture(
  maxAniso: number,
  scratched = false,
  village: 'konoha' | 'amegakure' | 'iwagakure' = 'konoha'
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#d8e0eb');
  grad.addColorStop(0.5, '#a2b0c2');
  grad.addColorStop(1, '#758396');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  // Storm 4 bold plate border ink outline
  ctx.strokeStyle = '#161820';
  ctx.lineWidth = 7;
  ctx.strokeRect(3, 3, 250, 122);

  // Corner rivets
  ctx.fillStyle = '#334155';
  for (const x of [18, 32, 224, 238]) {
    ctx.beginPath();
    ctx.arc(x, 64, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#161820';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  if (village === 'amegakure') {
    // 4 crisp vertical rain bars of Hidden Rain Village
    for (let i = 0; i < 4; i++) {
      const bx = 94 + i * 22;
      ctx.beginPath();
      ctx.moveTo(bx, 34);
      ctx.lineTo(bx, 94);
      ctx.stroke();
    }
  } else if (village === 'iwagakure') {
    // Stacked overlapping stones emblem of Hidden Stone Village
    ctx.beginPath();
    ctx.moveTo(100, 92);
    ctx.lineTo(118, 42);
    ctx.lineTo(146, 54);
    ctx.lineTo(126, 92);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(126, 92);
    ctx.lineTo(142, 60);
    ctx.lineTo(160, 74);
    ctx.lineTo(154, 92);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Konoha leaf swirl emblem
    ctx.beginPath();
    ctx.arc(128, 66, 22, 0.2, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 66, 11, 0.5, Math.PI * 2.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(148, 58);
    ctx.lineTo(168, 52);
    ctx.lineTo(150, 68);
    ctx.stroke();
  }

  if (scratched) {
    ctx.strokeStyle = '#0f1219';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(64, 62);
    ctx.lineTo(192, 68);
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createGroundTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#181a22';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle volcanic stone noise & fracture lines
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = 1 + Math.random() * 3;
    const shade = 20 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 8})`;
    ctx.fillRect(x, y, size, size);
  }

  // Subtle carved basalt slab joints
  ctx.strokeStyle = 'rgba(8, 10, 15, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso, 16);
}

export function createUchihaCrestTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);

  // Stone arena ring border
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.25)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(256, 256, 232, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(248, 250, 252, 0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 212, 0, Math.PI * 2);
  ctx.stroke();

  // Uchiha Fan (Uchiwa) etched lightly into center stone
  ctx.fillStyle = 'rgba(185, 28, 28, 0.24)';
  ctx.beginPath();
  ctx.arc(256, 224, 96, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.16)';
  ctx.beginPath();
  ctx.arc(256, 224, 96, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(244, 316, 24, 72);

  return finalizeColorTexture(canvas, maxAniso);
}

export function createSkyDomeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, '#070812');
  skyGrad.addColorStop(0.45, '#13162b');
  skyGrad.addColorStop(0.75, '#2b1929');
  skyGrad.addColorStop(1.0, '#12131c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle stars
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 260;
    const alpha = 0.2 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Crimson War-Arc Tsukuyomi Moon
  const mx = 740;
  const my = 150;
  const halo = ctx.createRadialGradient(mx, my, 24, mx, my, 120);
  halo.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
  halo.addColorStop(0.32, 'rgba(185, 28, 28, 0.42)');
  halo.addColorStop(1, 'rgba(185, 28, 28, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.arc(mx, my, 34, 0, Math.PI * 2);
  ctx.fill();

  // Concentric Rinne-Sharingan subtle rings on moon
  ctx.strokeStyle = 'rgba(127, 29, 29, 0.5)';
  ctx.lineWidth = 2;
  for (const r of [14, 22, 29]) {
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createKamuiVortexTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);
  ctx.translate(256, 256);

  // Outer dark-violet warp aura
  const outerGlow = ctx.createRadialGradient(0, 0, 18, 0, 0, 248);
  outerGlow.addColorStop(0, 'rgba(6, 2, 16, 0.98)');
  outerGlow.addColorStop(0.24, 'rgba(88, 28, 135, 0.85)');
  outerGlow.addColorStop(0.55, 'rgba(147, 51, 234, 0.42)');
  outerGlow.addColorStop(0.85, 'rgba(59, 7, 100, 0.14)');
  outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, 248, 0, Math.PI * 2);
  ctx.fill();

  // Sharp swirling black & violet space-time spiral arms
  for (let arm = 0; arm < 6; arm++) {
    ctx.save();
    ctx.rotate((arm * Math.PI) / 3);
    const isDarkArm = arm % 2 === 0;
    ctx.strokeStyle = isDarkArm ? 'rgba(8, 3, 18, 0.96)' : 'rgba(192, 132, 252, 0.92)';
    ctx.lineWidth = isDarkArm ? 16 : 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let t = 0; t < 48; t++) {
      const angle = t * 0.145;
      const r = 10 + t * 4.7;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!isDarkArm) {
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Deep black Kamui singularity eye core with crisp violet rim
  ctx.fillStyle = '#030108';
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)';
  ctx.lineWidth = 4;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSoftGlowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 215, 130, 0.85)');
  grad.addColorStop(0.6, 'rgba(249, 115, 22, 0.35)');
  grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createKamuiStoneTexture(maxAniso: number, repeat = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);

  // Cool slate-blue weathered stone base matching Kamui Pocket Dimension
  ctx.fillStyle = '#3b506e';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);

  // Deterministic pseudo-random helper so cracks & grain tile seamlessly
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Mottled mineral stone patches (wrap-around)
  for (let i = 0; i < 140; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 18 + rand() * 54;
    const light = rand() > 0.45;
    const alpha = 0.06 + rand() * 0.1;
    const color = light ? `rgba(116, 148, 188, ${alpha})` : `rgba(22, 34, 54, ${alpha})`;

    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 2, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Fine stone grit & pitted concrete speckles
  for (let i = 0; i < 3600; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const s = 1 + rand() * 2.4;
    const v = 42 + Math.floor(rand() * 58);
    ctx.fillStyle = `rgba(${v}, ${v + 18}, ${v + 42}, 0.45)`;
    ctx.fillRect(x, y, s, s);
  }

  // Sharp branching stone fractures & hairline cracks (matching foreground slab in photo)
  ctx.lineCap = 'round';
  for (let c = 0; c < 18; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    let angle = rand() * Math.PI * 2;
    const steps = 6 + Math.floor(rand() * 8);
    const pts: Array<[number, number]> = [[cx, cy]];
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.85;
      cx += Math.cos(angle) * (10 + rand() * 18);
      cy += Math.sin(angle) * (10 + rand() * 18);
      pts.push([cx, cy]);
    }

    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        // Pale bevel highlight beside crack
        ctx.strokeStyle = 'rgba(130, 162, 200, 0.22)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px + ox + 1, py + oy + 1) : ctx.lineTo(px + ox + 1, py + oy + 1)));
        ctx.stroke();

        // Dark fissure line
        ctx.strokeStyle = 'rgba(13, 21, 36, 0.72)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px + ox, py + oy) : ctx.lineTo(px + ox, py + oy)));
        ctx.stroke();
      }
    }
  }

  return finalizeColorTexture(canvas, maxAniso, repeat);
}

export function createKamuiStoneBumpTexture(maxAniso: number, repeat = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 140; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 18 + rand() * 54;
    const light = rand() > 0.45;
    const alpha = 0.08 + rand() * 0.1;
    const shade = light ? `rgba(210, 210, 210, ${alpha})` : `rgba(45, 45, 45, ${alpha})`;
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 2, x + ox, y + oy, r);
        g.addColorStop(0, shade);
        g.addColorStop(1, 'rgba(128,128,128,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (let i = 0; i < 3600; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const s = 1 + rand() * 2.4;
    const v = 90 + Math.floor(rand() * 75);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.5)`;
    ctx.fillRect(x, y, s, s);
  }

  ctx.lineCap = 'round';
  for (let c = 0; c < 18; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    let angle = rand() * Math.PI * 2;
    const steps = 6 + Math.floor(rand() * 8);
    const pts: Array<[number, number]> = [[cx, cy]];
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.85;
      cx += Math.cos(angle) * (10 + rand() * 18);
      cy += Math.sin(angle) * (10 + rand() * 18);
      pts.push([cx, cy]);
    }

    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.88)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px + ox, py + oy) : ctx.lineTo(px + ox, py + oy)));
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  if (repeat !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.needsUpdate = true;
  return tex;
}

export function createKamuiStoneRoughnessTexture(maxAniso: number, repeat = 1): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.fillStyle = '#d4d4d4';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Mineral facet gloss variations (darker = smoother specular stone glint, brighter = matte grit)
  for (let i = 0; i < 140; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 18 + rand() * 54;
    const smoothPatch = rand() > 0.45;
    const alpha = 0.1 + rand() * 0.12;
    const shade = smoothPatch ? `rgba(148, 148, 148, ${alpha})` : `rgba(238, 238, 238, ${alpha})`;
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 2, x + ox, y + oy, r);
        g.addColorStop(0, shade);
        g.addColorStop(1, 'rgba(212,212,212,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Deep cracks are fully matte (white = roughness 1.0)
  ctx.lineCap = 'round';
  for (let c = 0; c < 18; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    let angle = rand() * Math.PI * 2;
    const steps = 6 + Math.floor(rand() * 8);
    const pts: Array<[number, number]> = [[cx, cy]];
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.85;
      cx += Math.cos(angle) * (10 + rand() * 18);
      cy += Math.sin(angle) * (10 + rand() * 18);
      pts.push([cx, cy]);
    }
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px + ox, py + oy) : ctx.lineTo(px + ox, py + oy)));
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = maxAniso;
  if (repeat !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.needsUpdate = true;
  return tex;
}

export function createKamuiAbyssSkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(2048, 1024);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  skyGrad.addColorStop(0.0, '#000105');
  skyGrad.addColorStop(0.45, '#010511');
  skyGrad.addColorStop(0.68, '#030b1e');
  skyGrad.addColorStop(0.84, '#07142b');
  skyGrad.addColorStop(1.0, '#020612');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Subtle high-resolution abyss mist bands & distant stars
  let seed = 10913;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 420; i++) {
    const x = rand() * 2048;
    const y = rand() * 640;
    const sz = 0.8 + rand() * 1.4;
    const alpha = 0.12 + rand() * 0.42;
    ctx.fillStyle = `rgba(191, 219, 254, ${alpha})`;
    ctx.fillRect(x, y, sz, sz);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createScorchImpactTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);
  ctx.translate(256, 256);

  // Soft charred blast soot & ash halo
  const sootGrad = ctx.createRadialGradient(0, 0, 14, 0, 0, 236);
  sootGrad.addColorStop(0.0, 'rgba(8, 7, 10, 0.94)');
  sootGrad.addColorStop(0.32, 'rgba(16, 13, 16, 0.82)');
  sootGrad.addColorStop(0.64, 'rgba(24, 24, 34, 0.42)');
  sootGrad.addColorStop(0.88, 'rgba(15, 23, 42, 0.14)');
  sootGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sootGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 236, 0, Math.PI * 2);
  ctx.fill();

  // Irregular scorch streaks & carbon splatter
  let seed = 7331;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 42; i++) {
    const a = rand() * Math.PI * 2;
    const len = 85 + rand() * 145;
    const w = 10 + rand() * 24;
    ctx.save();
    ctx.rotate(a);
    const streak = ctx.createLinearGradient(10, 0, len, 0);
    streak.addColorStop(0, 'rgba(10, 8, 12, 0.55)');
    streak.addColorStop(0.65, 'rgba(20, 18, 25, 0.25)');
    streak.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = streak;
    ctx.beginPath();
    ctx.ellipse(len * 0.5, 0, len * 0.5, w * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Radial dark impact cracks inside scorch crater
  ctx.lineCap = 'round';
  for (let c = 0; c < 18; c++) {
    let angle = (c / 18) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    let r = 8 + rand() * 14;
    let px = Math.cos(angle) * r;
    let py = Math.sin(angle) * r;
    ctx.strokeStyle = 'rgba(4, 4, 8, 0.9)';
    ctx.lineWidth = 3.2 - rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const segs = 4 + Math.floor(rand() * 4);
    for (let s = 0; s < segs; s++) {
      angle += (rand() - 0.5) * 0.55;
      r += 22 + rand() * 24;
      px = Math.cos(angle) * r;
      py = Math.sin(angle) * r;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createScorchEmberTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);
  ctx.translate(256, 256);

  // Hot glowing magma center pool
  const heatGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 175);
  heatGrad.addColorStop(0.0, 'rgba(255, 240, 170, 0.95)');
  heatGrad.addColorStop(0.25, 'rgba(249, 115, 22, 0.72)');
  heatGrad.addColorStop(0.6, 'rgba(220, 38, 38, 0.28)');
  heatGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = heatGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 175, 0, Math.PI * 2);
  ctx.fill();

  // Glowing molten fissure veins
  let seed = 9187;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  ctx.lineCap = 'round';
  for (let c = 0; c < 14; c++) {
    let angle = (c / 14) * Math.PI * 2 + (rand() - 0.5) * 0.28;
    let r = 6;
    const pts: Array<[number, number]> = [[Math.cos(angle) * r, Math.sin(angle) * r]];
    const segs = 4 + Math.floor(rand() * 3);
    for (let s = 0; s < segs; s++) {
      angle += (rand() - 0.5) * 0.5;
      r += 20 + rand() * 22;
      pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }

    ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createGroundCrackTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.scale(2, 2);
  ctx.translate(256, 256);

  // Subtle pulverized stone dust shadow in crater core
  const centerDust = ctx.createRadialGradient(0, 0, 8, 0, 0, 232);
  centerDust.addColorStop(0.0, 'rgba(6, 12, 24, 0.72)');
  centerDust.addColorStop(0.42, 'rgba(11, 20, 38, 0.36)');
  centerDust.addColorStop(0.78, 'rgba(16, 28, 52, 0.14)');
  centerDust.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerDust;
  ctx.beginPath();
  ctx.arc(0, 0, 232, 0, Math.PI * 2);
  ctx.fill();

  let seed = 5507;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Primary jagged radial fractures with light chipped stone bevels
  for (let c = 0; c < 16; c++) {
    let angle = (c / 16) * Math.PI * 2 + (rand() - 0.5) * 0.24;
    let r = 10 + rand() * 10;
    const pts: Array<[number, number]> = [[Math.cos(angle) * r, Math.sin(angle) * r]];
    const segs = 5 + Math.floor(rand() * 4);

    for (let s = 0; s < segs; s++) {
      angle += (rand() - 0.5) * 0.45;
      r += 24 + rand() * 24;
      if (r > 238) break;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      pts.push([x, y]);

      // Secondary branching hairline fracture
      if (s >= 1 && s <= 3 && rand() > 0.38) {
        const bAngle = angle + (rand() > 0.5 ? 0.65 : -0.65) + (rand() - 0.5) * 0.3;
        const bLen = 24 + rand() * 40;
        const bx = x + Math.cos(bAngle) * bLen;
        const by = y + Math.sin(bAngle) * bLen;

        ctx.strokeStyle = 'rgba(148, 184, 224, 0.32)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x + 1.2, y + 1.2);
        ctx.lineTo(bx + 1.2, by + 1.2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(4, 8, 18, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // Chipped stone highlight rim
    ctx.strokeStyle = 'rgba(162, 198, 236, 0.38)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x + 1.5, y + 1.5) : ctx.lineTo(x + 1.5, y + 1.5)));
    ctx.stroke();

    // Deep fracture fissure
    ctx.strokeStyle = 'rgba(3, 7, 16, 0.94)';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    pts.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  // Concentric shatter ring cracks near the impact center
  for (const ringR of [44, 88, 134]) {
    ctx.strokeStyle = 'rgba(5, 10, 22, 0.65)';
    ctx.lineWidth = 2.0;
    for (let arc = 0; arc < 6; arc++) {
      const a0 = (arc / 6) * Math.PI * 2 + rand() * 0.3;
      const a1 = a0 + 0.35 + rand() * 0.38;
      ctx.beginPath();
      ctx.arc(0, 0, ringR + (rand() - 0.5) * 10, a0, a1);
      ctx.stroke();
    }
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createSummoningSealTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.save();
  ctx.translate(512, 512);

  // Outer shadow ring & dark ink halo
  const halo = ctx.createRadialGradient(0, 0, 160, 0, 0, 495);
  halo.addColorStop(0.0, 'rgba(88, 28, 135, 0.28)');
  halo.addColorStop(0.68, 'rgba(9, 9, 14, 0.42)');
  halo.addColorStop(0.9, 'rgba(9, 9, 14, 0.16)');
  halo.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 495, 0, Math.PI * 2);
  ctx.fill();

  // Concentric bold black Kuchiyose rings
  ctx.strokeStyle = 'rgba(10, 10, 14, 0.96)';
  ctx.lineCap = 'round';
  const rings: Array<[number, number]> = [
    [458, 15],
    [426, 5],
    [352, 12],
    [324, 4.5],
    [214, 10],
    [136, 6],
  ];
  for (const [r, w] of rings) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Geometric 8-point summoning star / inner seal chords
  ctx.lineWidth = 6;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    const rot = pass * (Math.PI / 4);
    for (let i = 0; i <= 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      const x = Math.cos(a) * 324;
      const y = Math.sin(a) * 324;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Inner hexagram lines + cardinal radial seal spokes
  ctx.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 136, Math.sin(a) * 136);
    ctx.lineTo(Math.cos(a) * 458, Math.sin(a) * 458);
    ctx.stroke();
  }

  // Stylized brush-ink Kuchiyose jutsu script blocks around perimeter ring (r = 390)
  ctx.strokeStyle = 'rgba(10, 10, 14, 0.95)';
  ctx.lineWidth = 6;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -390);
    ctx.beginPath();
    ctx.moveTo(-16, -12);
    ctx.lineTo(16, -12);
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 16);
    ctx.moveTo(-12, 4);
    ctx.lineTo(14, 4);
    if (i % 2 === 0) {
      ctx.moveTo(-10, -4);
      ctx.lineTo(10, 14);
    } else {
      ctx.moveTo(-12, 14);
      ctx.lineTo(12, -2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Inner ring calligraphy marks (r = 270)
  ctx.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.12;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -270);
    ctx.beginPath();
    ctx.moveTo(-12, -9);
    ctx.lineTo(12, -9);
    ctx.moveTo(-6, -14);
    ctx.lineTo(-6, 12);
    ctx.moveTo(6, -4);
    ctx.lineTo(10, 12);
    ctx.stroke();
    ctx.restore();
  }

  // Center summoning nucleus crest
  ctx.fillStyle = 'rgba(10, 10, 14, 0.95)';
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.72)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();

  // Jagged ink splatter streaks along outer edge
  let seed = 8841;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  ctx.fillStyle = 'rgba(10, 10, 14, 0.88)';
  for (let i = 0; i < 42; i++) {
    const a = rand() * Math.PI * 2;
    const r = 456 + rand() * 34;
    const sz = 4 + rand() * 9;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, sz * 1.4, sz * 0.65, a, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return finalizeColorTexture(canvas, maxAniso);
}

export function createGedoStoneTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#7c7066';
  ctx.fillRect(0, 0, 512, 512);

  let seed = 3191;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Mottled dried-husk / stone patches
  for (let i = 0; i < 120; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 16 + rand() * 48;
    const warm = rand() > 0.45;
    const alpha = 0.09 + rand() * 0.14;
    const color = warm ? `rgba(148, 132, 118, ${alpha})` : `rgba(58, 50, 44, ${alpha})`;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine bark-like vertical wooden-stone striations
  for (let i = 0; i < 650; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const len = 12 + rand() * 40;
    const dark = rand() > 0.4;
    ctx.strokeStyle = dark ? 'rgba(42, 36, 32, 0.25)' : 'rgba(176, 160, 146, 0.18)';
    ctx.lineWidth = 1 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 6, y + len);
    ctx.stroke();
  }

  // Deep ancient statue cracks
  ctx.strokeStyle = 'rgba(28, 22, 20, 0.65)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (let c = 0; c < 14; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    let ang = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const steps = 4 + Math.floor(rand() * 5);
    for (let s = 0; s < steps; s++) {
      ang += (rand() - 0.5) * 0.9;
      cx += Math.cos(ang) * (10 + rand() * 16);
      cy += Math.sin(ang) * (10 + rand() * 16);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso, 2);
}

export function createDamageNumberTexture(amount: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 128);
  ctx.clearRect(0, 0, 256, 128);

  const label = `-${Math.round(amount)}`;
  ctx.font = '900 72px "Chakra Petch", "Cairo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Vivid purple glow aura
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 11;
  ctx.strokeStyle = '#1e0536';
  ctx.strokeText(label, 128, 66);

  // Crisp light-lavender-to-purple gradient fill
  const textGrad = ctx.createLinearGradient(0, 24, 0, 104);
  textGrad.addColorStop(0, '#f3e8ff');
  textGrad.addColorStop(0.45, '#d8b4fe');
  textGrad.addColorStop(1, '#9333ea');
  ctx.fillStyle = textGrad;
  ctx.fillText(label, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createRealisticFireTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  // Subtle smoky ember outer glow so fire has deep fiery crimson edges
  const outer = ctx.createRadialGradient(128, 138, 6, 128, 132, 122);
  outer.addColorStop(0.0, 'rgba(255, 253, 232, 1.0)');
  outer.addColorStop(0.18, 'rgba(254, 232, 148, 0.96)');
  outer.addColorStop(0.42, 'rgba(251, 146, 60, 0.78)');
  outer.addColorStop(0.68, 'rgba(220, 38, 38, 0.36)');
  outer.addColorStop(0.9, 'rgba(69, 10, 10, 0.10)');
  outer.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(128, 132, 122, 0, Math.PI * 2);
  ctx.fill();

  let seed = 6143;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Turbulent radial teardrop flame tongues & jagged hot plasma filaments
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + (rand() - 0.5) * 0.28;
    const dist = 16 + rand() * 52;
    const cx = 128 + Math.cos(a) * dist;
    const cy = 132 + Math.sin(a) * dist * 1.05;
    const rx = 20 + rand() * 34;
    const ry = 8 + rand() * 13;
    const isHot = i % 3 === 0;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
    g.addColorStop(
      0,
      isHot ? 'rgba(255, 249, 200, 0.85)' : rand() > 0.4 ? 'rgba(251, 146, 60, 0.72)' : 'rgba(239, 68, 68, 0.56)'
    );
    g.addColorStop(0.5, 'rgba(234, 88, 12, 0.30)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + (rand() - 0.5) * 0.35);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Crisp bright filament sparks inside the flame silhouette
  for (let s = 0; s < 16; s++) {
    const a = rand() * Math.PI * 2;
    const r = 34 + rand() * 72;
    const sx = 128 + Math.cos(a) * r;
    const sy = 128 + Math.sin(a) * r;
    const sr = 2.5 + rand() * 4.5;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255, 251, 214, 0.92)');
    sg.addColorStop(0.5, 'rgba(251, 191, 36, 0.5)');
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSmokeCloudTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  let seed = 2971;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 46;
    const cx = 128 + Math.cos(a) * d;
    const cy = 128 + Math.sin(a) * d;
    const r = 42 + rand() * 46;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    const alpha = 0.22 + rand() * 0.22;
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    g.addColorStop(0.55, `rgba(226, 232, 240, ${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureFloorTexture(maxAniso = 8, repeat = 4): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);

  // Dark wet mortar bed underneath all rooftop stone slabs
  ctx.fillStyle = '#181c20';
  ctx.fillRect(0, 0, size, size);

  let seed = 41923;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Authentic varied muted stone/concrete slab tones from the Amegakure rooftop reference
  const slabPalettes: Array<[number, number, number]> = [
    [68, 72, 66], // weathered grey-olive
    [54, 59, 62], // damp slate
    [79, 80, 71], // faded sandstone grey
    [45, 50, 54], // wet charcoal slate
    [86, 84, 74], // worn pale cement block
    [58, 63, 56], // moss-tinted grey
    [62, 58, 56], // warm brownish concrete
  ];

  // 6 horizontal rows with staggered varied-width slabs (matches photo's perspective pavers)
  const rows = 6;
  const rowH = size / rows;
  const rowSpecs: Array<Array<{ x: number; w: number }>> = [];

  for (let r = 0; r < rows; r++) {
    const numCols = r % 2 === 0 ? 5 : 4;
    const rawWeights: number[] = [];
    let weightSum = 0;
    for (let c = 0; c < numCols; c++) {
      const wt = 0.72 + rand() * 0.65;
      rawWeights.push(wt);
      weightSum += wt;
    }
    const blocks: Array<{ x: number; w: number }> = [];
    let curX = 0;
    for (let c = 0; c < numCols; c++) {
      const w = c === numCols - 1 ? size - curX : Math.round((rawWeights[c] / weightSum) * size);
      blocks.push({ x: curX, w });
      curX += w;
    }
    rowSpecs.push(blocks);
  }

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const blocks = rowSpecs[r];
    for (let c = 0; c < blocks.length; c++) {
      const { x, w } = blocks[c];
      const [br, bg, bb] = slabPalettes[Math.floor(rand() * slabPalettes.length)];
      const shift = Math.round((rand() - 0.5) * 14);
      const sx = x + 3;
      const sy = y + 3;
      const sw = Math.max(4, w - 6);
      const sh = Math.max(4, rowH - 6);

      ctx.fillStyle = `rgb(${br + shift}, ${bg + shift}, ${bb + shift})`;
      ctx.fillRect(sx, sy, sw, sh);

      // Soft matte cloudy overcast gradient across each stone block (zero wet specular sheen)
      const blockGrad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      blockGrad.addColorStop(0, 'rgba(130, 140, 155, 0.06)');
      blockGrad.addColorStop(0.55, 'rgba(92, 102, 118, 0.03)');
      blockGrad.addColorStop(1, 'rgba(18, 22, 30, 0.18)');
      ctx.fillStyle = blockGrad;
      ctx.fillRect(sx, sy, sw, sh);

      // Pitted matte stone mottling
      for (let g = 0; g < 14; g++) {
        const gx = sx + 6 + rand() * Math.max(4, sw - 12);
        const gy = sy + 6 + rand() * Math.max(4, sh - 12);
        const rad = 14 + rand() * 38;
        const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, rad);
        const dark = rand() > 0.42;
        grad.addColorStop(0, dark ? 'rgba(22, 26, 34, 0.22)' : 'rgba(122, 132, 148, 0.14)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Fine weathered concrete fractures
      if (rand() > 0.35) {
        ctx.strokeStyle = 'rgba(14, 17, 22, 0.56)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let cx = sx + 10 + rand() * Math.max(4, sw - 20);
        let cy = sy + 4;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) {
          cx += (rand() - 0.5) * 32;
          cy += sh * 0.24;
          ctx.lineTo(cx, Math.min(sy + sh - 4, cy));
        }
        ctx.stroke();
      }

      // Muted matte bevel along top/left slab rim (no glossy glare)
      ctx.strokeStyle = 'rgba(138, 148, 166, 0.10)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx + 1, sy + sh - 1);
      ctx.lineTo(sx + 1, sy + 1);
      ctx.lineTo(sx + sw - 1, sy + 1);
      ctx.stroke();

      // Shadowed bottom/right slab rim
      ctx.strokeStyle = 'rgba(10, 12, 18, 0.46)';
      ctx.beginPath();
      ctx.moveTo(sx + sw - 1, sy + 1);
      ctx.lineTo(sx + sw - 1, sy + sh - 1);
      ctx.lineTo(sx + 1, sy + sh - 1);
      ctx.stroke();
    }
  }

  // Soft cloudy mist & diffused weathering across rooftop stone joints (no shiny puddle spots)
  for (let m = 0; m < 28; m++) {
    const mx = rand() * size;
    const my = rand() * size;
    const mr = 36 + rand() * 78;
    const cloud = ctx.createRadialGradient(mx, my, 4, mx, my, mr);
    if (m % 2 === 0) {
      cloud.addColorStop(0, 'rgba(128, 140, 162, 0.16)');
      cloud.addColorStop(0.65, 'rgba(105, 118, 140, 0.08)');
      cloud.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      cloud.addColorStop(0, 'rgba(26, 32, 44, 0.24)');
      cloud.addColorStop(0.65, 'rgba(32, 38, 52, 0.12)');
      cloud.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Broad soft cloudy veil across tiles to match the misty matte Amegakure rooftop look
  for (let p = 0; p < 16; p++) {
    const px = rand() * size;
    const py = rand() * size;
    const rx = 68 + rand() * 115;
    const ry = 48 + rand() * 84;
    const haze = ctx.createRadialGradient(px, py, 6, px, py, rx);
    haze.addColorStop(0, 'rgba(116, 128, 152, 0.14)');
    haze.addColorStop(0.6, 'rgba(84, 96, 120, 0.07)');
    haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureFloorBumpTexture(maxAniso = 8, repeat = 4): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#929292';
  ctx.fillRect(0, 0, size, size);

  let seed = 41923;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const rows = 6;
  const rowH = size / rows;
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 7;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();

    const numCols = r % 2 === 0 ? 5 : 4;
    const rawWeights: number[] = [];
    let weightSum = 0;
    for (let c = 0; c < numCols; c++) {
      const wt = 0.72 + rand() * 0.65;
      rawWeights.push(wt);
      weightSum += wt;
    }
    let curX = 0;
    for (let c = 0; c < numCols; c++) {
      const w = c === numCols - 1 ? size - curX : Math.round((rawWeights[c] / weightSum) * size);
      // Advance rand stream similarly for deterministic grit
      for (let skip = 0; skip < 19; skip++) rand();
      ctx.beginPath();
      ctx.moveTo(curX, y);
      ctx.lineTo(curX, y + rowH);
      ctx.stroke();
      curX += w;
    }
  }

  for (let i = 0; i < 1200; i++) {
    const shade = 112 + Math.floor(rand() * 58);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.24)`;
    ctx.fillRect(rand() * size, rand() * size, 3 + rand() * 9, 3 + rand() * 9);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureFloorRoughnessTexture(maxAniso = 8, repeat = 4): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  // Damp porous stone baseline (~0.58 roughness)
  ctx.fillStyle = '#949494';
  ctx.fillRect(0, 0, size, size);

  let seed = 77321;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Mirror-slick standing rainwater puddles (10..34 grayscale -> vivid sky/fire reflections)
  for (let p = 0; p < 34; p++) {
    const px = rand() * size;
    const py = rand() * size;
    const rx = 28 + rand() * 78;
    const ry = 20 + rand() * 58;
    const g = ctx.createRadialGradient(px, py, 4, px, py, rx);
    g.addColorStop(0, 'rgba(10, 10, 10, 0.96)');
    g.addColorStop(0.62, 'rgba(34, 34, 34, 0.78)');
    g.addColorStop(1, 'rgba(148, 148, 148, 0)');
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureWallTexture(maxAniso = 8): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);

  ctx.fillStyle = '#606b76';
  ctx.fillRect(0, 0, size, size);

  let seed = 11487;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Precast concrete panel bands & dark weather-stained horizontal seams
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = 'rgba(20, 26, 34, 0.62)';
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = 'rgba(150, 165, 180, 0.16)';
    ctx.fillRect(0, y + 3, size, 2);

    // Subtle concrete formwork tie-bolt holes along each panel row
    for (let x = 24; x < size; x += 64) {
      ctx.fillStyle = 'rgba(18, 22, 28, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y + 14, 2.5, 0, Math.PI * 2);
      ctx.arc(x, y + 50, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Vertical expansion joints
  for (let x = 0; x < size; x += 128) {
    ctx.fillStyle = 'rgba(20, 26, 34, 0.48)';
    ctx.fillRect(x, 0, 3, size);
  }

  // Vertical rain & rust-runoff streaks below concrete ledges
  for (let s = 0; s < 68; s++) {
    const sx = rand() * size;
    const sy = Math.floor(rand() * 8) * 64;
    const sh = 40 + rand() * 180;
    const sw = 3 + rand() * 12;
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    const isRust = rand() > 0.7;
    grad.addColorStop(0, isRust ? 'rgba(92, 54, 38, 0.52)' : 'rgba(22, 28, 36, 0.48)');
    grad.addColorStop(1, 'rgba(22, 28, 36, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, sw, sh);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createCorrugatedRustTexture(maxAniso = 8): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#6c3e26';
  ctx.fillRect(0, 0, 256, 256);

  // Corrugated vertical ribs matching the slanted brown awnings in Amegakure
  for (let x = 0; x < 256; x += 16) {
    const ribGrad = ctx.createLinearGradient(x, 0, x + 16, 0);
    ribGrad.addColorStop(0.0, '#3a1f12');
    ribGrad.addColorStop(0.35, '#834b2e');
    ribGrad.addColorStop(0.65, '#6a3c24');
    ribGrad.addColorStop(1.0, '#361c10');
    ctx.fillStyle = ribGrad;
    ctx.fillRect(x, 0, 16, 256);
  }

  // Dark weathered rain grime along bottom eaves
  const grime = ctx.createLinearGradient(0, 0, 0, 256);
  grime.addColorStop(0, 'rgba(20, 12, 8, 0.35)');
  grime.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
  grime.addColorStop(1, 'rgba(18, 10, 8, 0.55)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureStatueTexture(maxAniso = 8): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Purplish-charcoal stone/metal patina matching the giant Amegakure face statue
  ctx.fillStyle = '#5c4e64';
  ctx.fillRect(0, 0, 512, 512);

  let seed = 33917;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 160; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 10 + rand() * 34;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const dark = rand() > 0.38;
    g.addColorStop(0, dark ? 'rgba(28, 22, 34, 0.35)' : 'rgba(136, 124, 152, 0.16)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark vertical rain streaks across statue face & cheekbones
  for (let s = 0; s < 42; s++) {
    const sx = rand() * 512;
    const sy = rand() * 320;
    const sh = 40 + rand() * 140;
    const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    grad.addColorStop(0, 'rgba(22, 16, 26, 0.42)');
    grad.addColorStop(1, 'rgba(22, 16, 26, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, sy, 2 + rand() * 6, sh);
  }

  // Pitted stone & iron corrosion specks
  for (let p = 0; p < 550; p++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(22, 18, 28, 0.5)' : 'rgba(148, 138, 164, 0.25)';
    ctx.fillRect(rand() * 512, rand() * 512, 2 + rand() * 4, 2 + rand() * 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAmegakureSkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);

  // Moody lavender-violet-slate storm overcast gradient with luminous silver-lavender canyon horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, '#2b2e52');
  skyGrad.addColorStop(0.22, '#4b5280');
  skyGrad.addColorStop(0.42, '#838bb8');
  skyGrad.addColorStop(0.54, '#b4bce0');
  skyGrad.addColorStop(0.64, '#7783ab');
  skyGrad.addColorStop(1.0, '#242b40');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  let seed = 8241;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Layered wispy rain-cloud strata across the sky dome
  for (let i = 0; i < 85; i++) {
    const cx = rand() * 1024;
    const cy = 48 + rand() * 230;
    const rx = 65 + rand() * 185;
    const ry = 14 + rand() * 30;
    const lightCloud = rand() > 0.42;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    g.addColorStop(0, lightCloud ? 'rgba(202, 208, 236, 0.26)' : 'rgba(38, 40, 72, 0.30)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createKanjiSignTexture(
  kanji: string,
  maxAniso = 8,
  variant: 'vertical' | 'horizontal' = 'vertical',
  theme: 'parchment' | 'dark' = 'parchment'
): THREE.CanvasTexture {
  const w = variant === 'vertical' ? 128 : 256;
  const h = variant === 'vertical' ? 384 : 128;
  const [canvas, ctx] = makeCanvas(w, h);

  // Authentic weathered signboard background + dark iron frame
  ctx.fillStyle = theme === 'dark' ? '#252930' : '#8d8878';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = theme === 'dark' ? '#0e1116' : '#181a20';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  if (theme === 'parchment') {
    ctx.strokeStyle = 'rgba(35, 34, 30, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(13, 13, w - 26, h - 26);
  }

  // Subtle grime & rain stains
  let seed = kanji.charCodeAt(0) * 131 + 17;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle =
      theme === 'dark'
        ? `rgba(12, 14, 18, ${0.18 + rand() * 0.24})`
        : `rgba(26, 28, 26, ${0.12 + rand() * 0.22})`;
    ctx.fillRect(rand() * w, rand() * h, 8 + rand() * 24, 18 + rand() * 48);
  }

  ctx.fillStyle = theme === 'dark' ? '#d8dee6' : '#14161a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const chars = Array.from(kanji);
  if (variant === 'vertical') {
    const fontSize = Math.min(72, Math.floor((h - 46) / Math.max(1, chars.length)));
    ctx.font = `900 ${fontSize}px serif`;
    const step = (h - 38) / Math.max(1, chars.length);
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], w / 2, 22 + step * (i + 0.5));
    }
  } else {
    const fontSize = Math.min(68, Math.floor((w - 36) / Math.max(1, chars.length)));
    ctx.font = `900 ${fontSize}px serif`;
    ctx.fillText(kanji, w / 2, h / 2 + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createRainRippleTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);

  const ring = ctx.createRadialGradient(64, 64, 34, 64, 64, 60);
  ring.addColorStop(0.0, 'rgba(186, 214, 255, 0)');
  ring.addColorStop(0.55, 'rgba(186, 214, 255, 0.28)');
  ring.addColorStop(0.8, 'rgba(224, 240, 255, 0.9)');
  ring.addColorStop(0.92, 'rgba(186, 214, 255, 0.34)');
  ring.addColorStop(1.0, 'rgba(186, 214, 255, 0)');

  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  const innerRing = ctx.createRadialGradient(64, 64, 16, 64, 64, 34);
  innerRing.addColorStop(0.0, 'rgba(200, 225, 255, 0)');
  innerRing.addColorStop(0.75, 'rgba(210, 232, 255, 0.45)');
  innerRing.addColorStop(1.0, 'rgba(200, 225, 255, 0)');
  ctx.fillStyle = innerRing;
  ctx.beginPath();
  ctx.arc(64, 64, 34, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAkatsukiCloakTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Deep Storm 4 matte ink-black Akatsuki cloak
  ctx.fillStyle = '#181920';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical anime ink pleat creases
  ctx.strokeStyle = '#0c0d12';
  ctx.lineWidth = 4;
  for (const x of [68, 160, 256, 352, 444]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (x > 256 ? 12 : -12), 512);
    ctx.stroke();
  }

  // Helper to paint iconic white-rimmed crimson Akatsuki cloud with Storm 4 black ink contour
  const drawAkatsukiCloud = (cx: number, cy: number, scale: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

    const traceCloud = () => {
      ctx.beginPath();
      ctx.arc(-28, 6, 18, Math.PI * 0.4, Math.PI * 1.6);
      ctx.arc(0, -10, 22, Math.PI * 1.0, Math.PI * 2.0);
      ctx.arc(28, 4, 17, Math.PI * 1.4, Math.PI * 0.6);
      ctx.quadraticCurveTo(0, 24, -28, 22);
      ctx.closePath();
    };

    // Bold black outer ink rim + crisp white outline + vivid crimson fill
    traceCloud();
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#0b0c10';
    ctx.stroke();

    traceCloud();
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = '#e5e7eb';
    ctx.stroke();

    ctx.fillStyle = '#c81e2b';
    ctx.fill();

    // Inner curl ink swirls
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-24, 6, 8, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(26, 4, 7.5, Math.PI, Math.PI * 2.35);
    ctx.stroke();

    ctx.restore();
  };

  drawAkatsukiCloud(112, 152, 0.92, -0.18);
  drawAkatsukiCloud(388, 170, 0.88, 0.22);
  drawAkatsukiCloud(256, 310, 1.02, -0.12); // Back / chest center motif
  drawAkatsukiCloud(96, 405, 0.85, 0.14);
  drawAkatsukiCloud(416, 415, 0.85, -0.16);

  // Center front crimson lining & zipper seam (u ~ 0.0 / 1.0 corresponds to +Z front on sculpted vertical geo!)
  ctx.fillStyle = '#8b151e';
  ctx.fillRect(0, 0, 18, 512);
  ctx.fillRect(494, 0, 18, 512);
  ctx.strokeStyle = '#090a0e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(18, 512);
  ctx.moveTo(494, 0);
  ctx.lineTo(494, 512);
  ctx.stroke();

  return finalizeColorTexture(canvas, maxAniso);
}

export function createMinatoCloakTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Crisp off-white Hokage haori
  ctx.fillStyle = '#eef0f4';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle Storm 4 cel fold ink lines
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 3;
  for (const x of [78, 175, 337, 434]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (x > 256 ? 10 : -10), 420);
    ctx.stroke();
  }

  // Iconic vibrant Fourth Hokage crimson flame tongues along bottom hem (v ~ 0 -> bottom of canvas y ~ 512)
  ctx.beginPath();
  ctx.moveTo(0, 512);
  const flameCount = 8;
  for (let i = 0; i < flameCount; i++) {
    const x0 = (i / flameCount) * 512;
    const xMid = ((i + 0.5) / flameCount) * 512;
    const x1 = ((i + 1) / flameCount) * 512;
    const tipY = i % 2 === 0 ? 336 : 366;
    ctx.lineTo(x0, 442);
    ctx.quadraticCurveTo(x0 + 18, tipY + 26, xMid, tipY);
    ctx.quadraticCurveTo(x1 - 18, tipY + 26, x1, 442);
  }
  ctx.lineTo(512, 512);
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#181a22';
  ctx.stroke();

  // Iconic vertical crimson kanji 「四代目火影」 down the center back (u = 0.5 -> x = 256)
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#181a22';
  ctx.lineWidth = 4;
  ctx.font = '900 44px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = ['四', '代', '目', '火', '影'];
  chars.forEach((ch, idx) => {
    const cy = 96 + idx * 52;
    ctx.strokeText(ch, 256, cy);
    ctx.fillText(ch, 256, cy);
  });

  return finalizeColorTexture(canvas, maxAniso);
}

export function createMadaraArmorTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Edo Madara layered crimson samurai armor matching Storm 4 cel style
  ctx.fillStyle = '#8b1e28';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal overlapping samurai armor lames with bold black ink seams
  const rowH = 64;
  for (let y = 0; y < 512; y += rowH) {
    ctx.fillStyle = y % 128 === 0 ? '#9c242f' : '#7b1922';
    ctx.fillRect(0, y, 512, rowH - 6);

    // Top highlight band per plate
    ctx.fillStyle = 'rgba(255, 196, 196, 0.14)';
    ctx.fillRect(0, y + 3, 512, 7);

    // Bold black Storm 4 ink overlap border
    ctx.fillStyle = '#15161e';
    ctx.fillRect(0, y + rowH - 7, 512, 7);

    // Gold/iron lacing rivets
    for (let x = 24; x < 512; x += 48) {
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(x, y + 14, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#15161e';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createSasukeTopTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Crisp War Arc lavender-white Uchiha shirt (matching Storm 4 Sasuke)
  ctx.fillStyle = '#d9dce8';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical crease lines
  ctx.strokeStyle = '#9aa2ba';
  ctx.lineWidth = 3;
  for (const x of [90, 178, 334, 422]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Front open V-neck skin/collar zipper seam along u=0/1 edges
  ctx.fillStyle = '#181a24';
  ctx.fillRect(0, 0, 10, 512);
  ctx.fillRect(502, 0, 10, 512);

  // Crisp Uchiha Fan Crest centered on upper back (u ~ 0.5 -> x = 256, y ~ 190)
  const cx = 256;
  const cy = 195;
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(cx, cy, 48, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#161820';
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx, cy + 4, 48, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(cx - 10, cy + 48, 20, 44);
  ctx.strokeRect(cx - 10, cy + 48, 20, 44);

  return finalizeColorTexture(canvas, maxAniso);
}

export function createGunbaiTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  // Cream-ivory War Fan face matching Tobi v2's `ntxr004.png`
  ctx.fillStyle = '#ddd7be';
  ctx.fillRect(0, 0, 512, 512);

  // Dark slate rim ring
  ctx.strokeStyle = '#181a22';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(256, 256, 224, 0, Math.PI * 2);
  ctx.stroke();

  // Crimson inner ring & 3 Uchiha tomoe emblems
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 256, 174, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const tx = 256 + Math.cos(a) * 96;
    const ty = 256 + Math.sin(a) * 96;
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.arc(tx, ty, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#181a22';
    ctx.stroke();
  }

  return finalizeColorTexture(canvas, maxAniso);
}

export function createStorm3RooftopTexture(maxAniso = 8, repeat = 5): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);

  // Dark drenched basalt & wet charcoal concrete rooftop deck
  ctx.fillStyle = '#252b34';
  ctx.fillRect(0, 0, size, size);

  let seed = 94211;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Large precision stone slabs (4x4 per tile) with damp weathering
  const tiles = 4;
  const step = size / tiles;
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const x = col * step;
      const y = row * step;
      const tone = 34 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${tone}, ${tone + 5}, ${tone + 12})`;
      ctx.fillRect(x + 3, y + 3, step - 6, step - 6);

      // Subtle mineral grain inside each basalt block
      for (let g = 0; g < 140; g++) {
        const gx = x + 6 + rand() * (step - 12);
        const gy = y + 6 + rand() * (step - 12);
        const gv = tone + Math.floor((rand() - 0.5) * 18);
        ctx.fillStyle = `rgba(${gv}, ${gv + 4}, ${gv + 10}, 0.52)`;
        ctx.fillRect(gx, gy, 2 + rand() * 5, 2 + rand() * 5);
      }

      // Crisp wet stone bevel edge
      ctx.strokeStyle = 'rgba(130, 152, 180, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + step - 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.lineTo(x + step - 4, y + 4);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(8, 10, 16, 0.78)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + step - 4, y + 4);
      ctx.lineTo(x + step - 4, y + step - 4);
      ctx.lineTo(x + 4, y + step - 4);
      ctx.stroke();
    }
  }

  // Standing dark rainwater pool sheen stains across the slab tiles
  for (let p = 0; p < 16; p++) {
    const px = rand() * size;
    const py = rand() * size;
    const rx = 50 + rand() * 110;
    const ry = 35 + rand() * 75;
    const g = ctx.createRadialGradient(px, py, 4, px, py, rx);
    g.addColorStop(0, 'rgba(12, 19, 30, 0.62)');
    g.addColorStop(0.65, 'rgba(20, 30, 44, 0.30)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = maxAniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createStorm3SkyscraperTexture(
  maxAniso = 8
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const w = 512;
  const h = 1024;
  const [albedoCanvas, aCtx] = makeCanvas(w, h);
  const [emitCanvas, eCtx] = makeCanvas(w, h);

  aCtx.fillStyle = '#1d2432';
  aCtx.fillRect(0, 0, w, h);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  let seed = 61803;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Vertical brutalist concrete pilaster ribs
  for (let x = 0; x < w; x += 64) {
    aCtx.fillStyle = '#121722';
    aCtx.fillRect(x, 0, 12, h);
    aCtx.fillStyle = 'rgba(120, 142, 172, 0.14)';
    aCtx.fillRect(x + 12, 0, 4, h);
  }

  // Horizontal concrete slab floors + Rain Village warm amber-gold lit windows
  const rows = 28;
  const cols = 8;
  const rowH = h / rows;
  const colW = w / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    aCtx.fillStyle = '#10141d';
    aCtx.fillRect(0, y, w, 6);

    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const litRoll = rand();
      const winX = x + 16;
      const winY = y + 10;
      const winW = colW - 22;
      const winH = rowH - 18;

      if (litRoll > 0.56) {
        // Warm tungsten / sodium amber lit office & tower room window (Storm 3 Rain Village signature!)
        const warmth = rand();
        const fill =
          warmth > 0.72
            ? '#fde68a'
            : warmth > 0.35
              ? '#f59e0b'
              : '#ea580c';
        aCtx.fillStyle = fill;
        aCtx.fillRect(winX, winY, winW, winH);
        eCtx.fillStyle = fill;
        eCtx.fillRect(winX, winY, winW, winH);

        // Window mullion divider
        aCtx.fillStyle = '#0b0e16';
        aCtx.fillRect(winX + winW * 0.48, winY, 3, winH);
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(winX + winW * 0.48, winY, 3, winH);
      } else {
        // Dark wet glass reflecting midnight rain sky
        aCtx.fillStyle = litRoll > 0.3 ? '#0c1524' : '#080c14';
        aCtx.fillRect(winX, winY, winW, winH);
      }
    }
  }

  // Vertical rain-streak grime overlay on concrete
  for (let s = 0; s < 55; s++) {
    const sx = rand() * w;
    const sy = rand() * h * 0.8;
    const sh = 60 + rand() * 200;
    const grad = aCtx.createLinearGradient(sx, sy, sx, sy + sh);
    grad.addColorStop(0, 'rgba(6, 9, 14, 0.55)');
    grad.addColorStop(1, 'rgba(6, 9, 14, 0)');
    aCtx.fillStyle = grad;
    aCtx.fillRect(sx, sy, 3 + rand() * 8, sh);
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAniso;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const emissiveMap = new THREE.CanvasTexture(emitCanvas);
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAniso;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.needsUpdate = true;

  return { map, emissiveMap };
}

export function createStorm3SkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 512);

  // Storm 3 Pain's Amegakure sky: deep slate-indigo thunderheads above, cool cyan-silver & distant warm amber mist at horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, '#090c17');
  skyGrad.addColorStop(0.24, '#141c31');
  skyGrad.addColorStop(0.45, '#253352');
  skyGrad.addColorStop(0.56, '#43587e');
  skyGrad.addColorStop(0.66, '#27314a');
  skyGrad.addColorStop(1.0, '#0a0d16');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  let seed = 44201;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Swirling ominous thunderhead cloud banks
  for (let i = 0; i < 110; i++) {
    const cx = rand() * 1024;
    const cy = 28 + rand() * 255;
    const rx = 55 + rand() * 190;
    const ry = 12 + rand() * 34;
    const bright = rand() > 0.52;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    g.addColorStop(
      0,
      bright ? 'rgba(130, 158, 198, 0.24)' : 'rgba(10, 13, 24, 0.42)'
    );
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Subtle city ambient glow along lower horizon line
  const cityGlow = ctx.createLinearGradient(0, 260, 0, 360);
  cityGlow.addColorStop(0, 'rgba(245, 158, 11, 0)');
  cityGlow.addColorStop(0.65, 'rgba(245, 158, 11, 0.14)');
  cityGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = cityGlow;
  ctx.fillRect(0, 260, 1024, 100);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

