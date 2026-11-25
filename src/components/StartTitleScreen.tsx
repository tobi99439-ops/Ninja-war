import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { PWAInstallButton } from './PWAInstallButton';

const TITLE_BG_IMAGE_URL = 'https://files.catbox.moe/9vjk0w.png';

interface StartTitleScreenProps {
  onEnter: () => void;
}

interface CloudPuff {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  opacity: number;
  layer: number;
  puffs: Array<{ ox: number; oy: number; rx: number; ry: number }>;
}

interface WindParticle {
  kind: 'leaf' | 'sakura';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  rotSpeed: number;
  flip: number;
  flipSpeed: number;
  swayPhase: number;
  swayAmp: number;
  swayFreq: number;
  depth: number; // 0.45 (far) .. 1.25 (near)
  color: string;
  accent: string;
  alpha: number;
}

interface WindStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  amp: number;
  phase: number;
  alpha: number;
  thickness: number;
}

const LEAF_PALETTE: Array<[string, string]> = [
  ['#4ade80', '#bbf7d0'],
  ['#22c55e', '#86efac'],
  ['#16a34a', '#4ade80'],
  ['#65a30d', '#bef264'],
];

const SAKURA_PALETTE: Array<[string, string]> = [
  ['#fbcfe8', '#ffffff'],
  ['#f9a8d4', '#fdf2f8'],
  ['#fda4af', '#fff1f2'],
  ['#f472b6', '#fce7f3'],
];

function createCloud(w: number, h: number, randomX: boolean): CloudPuff {
  const layer = Math.random() < 0.5 ? 0 : 1;
  const cw = (layer === 0 ? 220 : 320) + Math.random() * 210;
  const ch = cw * (0.24 + Math.random() * 0.08);
  const puffCount = 4 + Math.floor(Math.random() * 3);
  const puffs: Array<{ ox: number; oy: number; rx: number; ry: number }> = [];
  for (let i = 0; i < puffCount; i++) {
    const t = puffCount === 1 ? 0.5 : i / (puffCount - 1);
    const arch = Math.sin(t * Math.PI);
    puffs.push({
      ox: (t - 0.5) * cw * 0.72,
      oy: -arch * ch * 0.32 + (Math.random() - 0.5) * ch * 0.14,
      rx: cw * (0.19 + arch * 0.14 + Math.random() * 0.05),
      ry: ch * (0.38 + arch * 0.28 + Math.random() * 0.08),
    });
  }
  return {
    x: randomX ? Math.random() * (w + cw) - cw * 0.5 : -cw * 0.65 - Math.random() * 140,
    y: h * (0.04 + Math.random() * 0.25),
    w: cw,
    h: ch,
    speed: (layer === 0 ? 9 : 17) + Math.random() * 10,
    opacity: layer === 0 ? 0.16 + Math.random() * 0.1 : 0.22 + Math.random() * 0.12,
    layer,
    puffs,
  };
}

function createParticle(w: number, h: number, kind: 'leaf' | 'sakura', randomX: boolean): WindParticle {
  const depth = 0.48 + Math.random() * 0.78;
  const palette = kind === 'leaf' ? LEAF_PALETTE : SAKURA_PALETTE;
  const [color, accent] = palette[Math.floor(Math.random() * palette.length)];
  const baseSize = kind === 'leaf' ? 9 + Math.random() * 8 : 6.5 + Math.random() * 6.5;

  return {
    kind,
    x: randomX ? Math.random() * (w + 160) - 80 : -35 - Math.random() * 160,
    y: randomX ? Math.random() * h : Math.random() * (h * 0.92) - h * 0.06,
    vx: (kind === 'leaf' ? 56 : 44) * depth + Math.random() * 34 * depth,
    vy: (kind === 'leaf' ? 10 : 14) * depth + (Math.random() - 0.35) * 16,
    size: baseSize * depth,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 2.4,
    flip: Math.random() * Math.PI * 2,
    flipSpeed: 1.9 + Math.random() * 2.8,
    swayPhase: Math.random() * Math.PI * 2,
    swayAmp: (12 + Math.random() * 20) * depth,
    swayFreq: 1.1 + Math.random() * 1.4,
    depth,
    color,
    accent,
    alpha: Math.min(0.95, 0.48 + depth * 0.42),
  };
}

function createWindStreak(w: number, h: number, randomX: boolean): WindStreak {
  return {
    x: randomX ? Math.random() * w : -320 - Math.random() * 260,
    y: h * (0.12 + Math.random() * 0.74),
    length: 140 + Math.random() * 220,
    speed: 240 + Math.random() * 210,
    amp: 8 + Math.random() * 16,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.1 + Math.random() * 0.14,
    thickness: 1.1 + Math.random() * 1.4,
  };
}

function drawKonohaLeaf(ctx: CanvasRenderingContext2D, p: WindParticle) {
  const s = p.size;
  const flipScale = 0.24 + Math.abs(Math.cos(p.flip)) * 0.76;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, flipScale);
  ctx.globalAlpha = p.alpha;

  // Pointed curved leaf silhouette
  const grad = ctx.createLinearGradient(-s, -s * 0.3, s, s * 0.3);
  grad.addColorStop(0, p.color);
  grad.addColorStop(1, p.accent);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(-s * 1.05, 0);
  ctx.bezierCurveTo(-s * 0.45, -s * 0.72, s * 0.42, -s * 0.64, s * 1.12, -s * 0.04);
  ctx.bezierCurveTo(s * 0.42, s * 0.62, -s * 0.45, s * 0.66, -s * 1.05, 0);
  ctx.closePath();
  ctx.fill();

  // Delicate leaf central vein
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = Math.max(0.7, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, 0.02 * s);
  ctx.quadraticCurveTo(0, -s * 0.08, s * 0.85, -s * 0.03);
  ctx.stroke();

  ctx.restore();
}

function drawSakuraPetal(ctx: CanvasRenderingContext2D, p: WindParticle) {
  const s = p.size;
  const flipScale = 0.22 + Math.abs(Math.sin(p.flip)) * 0.78;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, flipScale);
  ctx.globalAlpha = p.alpha;

  const grad = ctx.createRadialGradient(-s * 0.2, 0, s * 0.1, 0, 0, s * 1.05);
  grad.addColorStop(0, p.accent);
  grad.addColorStop(0.55, p.color);
  grad.addColorStop(1, 'rgba(244, 114, 182, 0.85)');
  ctx.fillStyle = grad;

  // Notched cherry blossom petal
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.bezierCurveTo(-s * 0.35, -s * 0.82, s * 0.52, -s * 0.78, s * 0.95, -s * 0.22);
  ctx.lineTo(s * 0.62, 0);
  ctx.lineTo(s * 0.95, s * 0.22);
  ctx.bezierCurveTo(s * 0.52, s * 0.78, -s * 0.35, s * 0.82, -s * 0.85, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, c: CloudPuff) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.globalAlpha = c.opacity;

  for (let i = 0; i < c.puffs.length; i++) {
    const pf = c.puffs[i];
    const r = Math.max(pf.rx, pf.ry);
    const grad = ctx.createRadialGradient(pf.ox, pf.oy - pf.ry * 0.15, r * 0.08, pf.ox, pf.oy, r);
    grad.addColorStop(0, 'rgba(255, 250, 238, 0.95)');
    grad.addColorStop(0.5, 'rgba(246, 241, 230, 0.55)');
    grad.addColorStop(1, 'rgba(235, 244, 255, 0)');

    ctx.save();
    ctx.translate(pf.ox, pf.oy);
    ctx.scale(pf.rx / r, pf.ry / r);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawWindStreak(ctx: CanvasRenderingContext2D, s: WindStreak, t: number) {
  ctx.save();
  const grad = ctx.createLinearGradient(s.x, s.y, s.x + s.length, s.y);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.35, `rgba(255, 251, 235, ${s.alpha})`);
  grad.addColorStop(0.7, `rgba(254, 243, 199, ${s.alpha * 0.85})`);
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = s.thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const px = s.x + u * s.length;
    const py = s.y + Math.sin(u * Math.PI * 2.2 + s.phase + t * 2.4) * s.amp * Math.sin(u * Math.PI);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function StartTitleScreen({ onEnter }: StartTitleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgParallaxRef = useRef<HTMLDivElement | null>(null);
  const turbulenceRef = useRef<SVGFETurbulenceElement | null>(null);
  const triggeredRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const [exiting, setExiting] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  const handleStartInteraction = useCallback(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setExiting(true);

    // Unlock Web Audio for UI chimes & battle voices, keeping menus silent until match begins
    soundEngine.unlock();
    soundEngine.setMusicTheme('silent');
    soundEngine.playChakraStart();

    exitTimerRef.current = window.setTimeout(() => {
      onEnter();
    }, 700);
  }, [onEnter]);

  // Press ANY keyboard key to begin
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (triggeredRef.current) return;
      if (e.key === 'F11' || e.key === 'F12') return;
      e.preventDefault();
      e.stopPropagation();
      handleStartInteraction();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [handleStartInteraction]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  // 60fps canvas animation for drifting clouds, Konoha leaves, sakura petals, wind streaks,
  // plus gentle SVG breeze wave modulation and damped mouse/touch parallax.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const cloudCount = width < 640 ? 5 : 8;
    const leafCount = width < 640 ? 18 : 26;
    const sakuraCount = width < 640 ? 24 : 36;
    const streakCount = width < 640 ? 4 : 6;

    const clouds: CloudPuff[] = Array.from({ length: cloudCount }, () =>
      createCloud(width, height, true)
    );
    const particles: WindParticle[] = [
      ...Array.from({ length: leafCount }, () => createParticle(width, height, 'leaf', true)),
      ...Array.from({ length: sakuraCount }, () => createParticle(width, height, 'sakura', true)),
    ];
    particles.sort((a, b) => a.depth - b.depth);

    const streaks: WindStreak[] = Array.from({ length: streakCount }, () =>
      createWindStreak(width, height, true)
    );

    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let smoothParallaxX = 0;
    let smoothParallaxY = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (width <= 0 || height <= 0) return;
      targetParallaxX = (e.clientX / width - 0.5) * 2;
      targetParallaxY = (e.clientY / height - 0.5) * 2;
    };

    let orientationTimeout: number | null = null;
    const onOrientationResize = () => {
      resize();
      if (orientationTimeout !== null) {
        window.clearTimeout(orientationTimeout);
      }
      orientationTimeout = window.setTimeout(resize, 120);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', onOrientationResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let lastFilterTick = 0;

    const animate = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      // Subtle damped parallax drift on background image container
      const damp = 1 - Math.exp(-4.2 * dt);
      smoothParallaxX += (targetParallaxX - smoothParallaxX) * damp;
      smoothParallaxY += (targetParallaxY - smoothParallaxY) * damp;

      if (bgParallaxRef.current) {
        const autoX = Math.sin(elapsed * 0.42) * 5;
        const autoY = Math.cos(elapsed * 0.31) * 3.5;
        const tx = -smoothParallaxX * 10 + autoX;
        const ty = -smoothParallaxY * 7 + autoY;
        bgParallaxRef.current.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      }

      // Smooth breeze wave ripple on SVG turbulence filter (~24Hz to stay ultra-light on mobile GPU)
      if (turbulenceRef.current && now - lastFilterTick > 42) {
        lastFilterTick = now;
        const fx = 0.0085 + Math.sin(elapsed * 0.85) * 0.0022;
        const fy = 0.017 + Math.cos(elapsed * 0.68) * 0.0028;
        turbulenceRef.current.setAttribute('baseFrequency', `${fx.toFixed(5)} ${fy.toFixed(5)}`);
      }

      ctx.clearRect(0, 0, width, height);

      // Periodic Konoha breeze gust multiplier (left -> right)
      const gust = 1 + Math.sin(elapsed * 0.72) * 0.28 + Math.sin(elapsed * 1.9) * 0.1;

      // 1. Drifting clouds in upper sky above Hokage Mountain
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.x += c.speed * (0.85 + gust * 0.15) * dt;
        if (c.x - c.w * 0.7 > width) {
          Object.assign(c, createCloud(width, height, false));
        }
        drawCloud(ctx, c);
      }

      // 2. Subtle glowing wind streaks sweeping left -> right
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        s.x += s.speed * gust * dt;
        s.y += Math.sin(elapsed * 0.9 + s.phase) * 9 * dt;
        if (s.x > width + 80) {
          Object.assign(s, createWindStreak(width, height, false));
        }
        drawWindStreak(ctx, s, elapsed);
      }

      // 3. Green Konoha leaves & pink sakura petals fluttering left -> right
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.swayPhase += p.swayFreq * dt;
        p.x += (p.vx * gust + Math.cos(p.swayPhase * 0.7) * 12 * p.depth) * dt;
        p.y += (p.vy + Math.sin(p.swayPhase) * p.swayAmp) * dt;
        p.rot += p.rotSpeed * dt;
        p.flip += p.flipSpeed * dt;

        if (p.x > width + 60 || p.y > height + 60 || p.y < -80) {
          const respawn = createParticle(width, height, p.kind, false);
          Object.assign(p, respawn);
        }

        if (p.kind === 'leaf') {
          drawKonohaLeaf(ctx, p);
        } else {
          drawSakuraPetal(ctx, p);
        }
      }

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (orientationTimeout !== null) {
        window.clearTimeout(orientationTimeout);
      }
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', onOrientationResize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="اضغط للبدء - Press Any Button"
      onPointerDown={(e) => {
        e.stopPropagation();
        handleStartInteraction();
      }}
      className={`fixed inset-0 z-40 overflow-hidden select-none cursor-pointer bg-[#0b1220] transition-all duration-700 ease-out ${
        exiting ? 'opacity-0 scale-[1.035] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Hidden SVG filter definition for gentle breeze wave displacement */}
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
        <defs>
          <filter id="storm-breeze-wave" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              ref={turbulenceRef}
              type="fractalNoise"
              baseFrequency="0.0085 0.017"
              numOctaves="2"
              seed="7"
              result="windNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="windNoise"
              scale="6.5"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Living Key Art Layer with Parallax & Subtle Breathing Motion */}
      <div
        ref={bgParallaxRef}
        className="pointer-events-none absolute -inset-4 will-change-transform"
      >
        <div className="relative h-full w-full animate-storm-bg-breathe">
          {/* Crisp primary key artwork */}
          <img
            src={TITLE_BG_IMAGE_URL}
            alt="Naruto Shippuden Konoha Title Background"
            onLoad={() => setImageReady(true)}
            draggable={false}
            className={`h-full w-full object-cover object-center transition-opacity duration-500 ${
              imageReady ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Softly masked breeze-rippled overlay so headband, clothes, foliage & sky undulate in the wind */}
          <img
            src={TITLE_BG_IMAGE_URL}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              filter: 'url(#storm-breeze-wave)',
              maskImage:
                'radial-gradient(ellipse 85% 68% at 50% 62%, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 58%, rgba(0,0,0,0.2) 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 85% 68% at 50% 62%, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 58%, rgba(0,0,0,0.2) 100%)',
            }}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-center mix-blend-normal transition-opacity duration-500 ${
              imageReady ? 'opacity-55' : 'opacity-0'
            }`}
          />
        </div>
      </div>

      {/* Warm Konoha Golden Sunbeam Drift */}
      <div
        className="pointer-events-none absolute inset-0 animate-storm-sunbeam"
        style={{
          background:
            'linear-gradient(112deg, rgba(254,240,138,0) 14%, rgba(254,240,138,0.24) 30%, rgba(255,255,255,0) 46%, rgba(251,191,36,0.16) 66%, rgba(255,255,255,0) 82%)',
        }}
      />

      {/* 60fps Canvas Overlay: Drifting Sky Clouds + Green Konoha Leaves + Pink Sakura Petals + Wind Streaks */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Subtle Bottom Cinematic Scrim so Golden Prompt Pops Without Blocking the Artwork */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[36vh]"
        style={{
          background:
            'linear-gradient(to top, rgba(6, 8, 15, 0.86) 0%, rgba(8, 11, 20, 0.44) 48%, rgba(8, 11, 20, 0) 100%)',
        }}
      />

      {/* Unobtrusive Top-Left Install Chip for Mobile Users */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute top-3 left-3 z-20"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <PWAInstallButton variant="floating" />
      </div>

      {/* Bottom-Center Interactive Glowing Golden Anime Prompt + Konoha Leaf Crest */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center justify-end px-4 text-center"
        style={{ paddingBottom: 'max(1.65rem, env(safe-area-inset-bottom))' }}
      >
        <div className="animate-storm-cta-pulse flex flex-col items-center">
          <span
            className="font-display text-2xl font-black tracking-wide sm:text-3xl md:text-[2.2rem]"
            style={{
              backgroundImage:
                'linear-gradient(180deg, #fffbeb 0%, #fef08a 38%, #f59e0b 78%, #b45309 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            اضغط للبدء
          </span>

          <span className="mt-1 font-['Chakra_Petch',sans-serif] text-[11px] font-bold uppercase tracking-[0.34em] text-amber-200/95 sm:text-xs">
            PRESS ANY BUTTON
          </span>
        </div>

        {/* Golden Konoha Leaf Village Crest Emblem flanked by tapered light lines */}
        <div className="mt-2.5 flex items-center justify-center gap-3.5">
          <div className="h-[1.5px] w-14 bg-gradient-to-l from-amber-300/90 via-amber-400/50 to-transparent sm:w-24" />
          <svg
            viewBox="0 0 64 64"
            className="animate-storm-crest-glow h-9 w-9 sm:h-10 sm:w-10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="رمز قرية الورق"
          >
            <defs>
              <linearGradient id="konoha-gold-grad" x1="12" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fffbeb" />
                <stop offset="38%" stopColor="#fde047" />
                <stop offset="76%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>
            {/* Outer subtle halo ring */}
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="url(#konoha-gold-grad)"
              strokeWidth="1.2"
              strokeOpacity="0.45"
            />
            {/* Iconic Konoha Leaf spiral + pointed leaf tip + triangular stem */}
            <path
              d="M32 33.5C32 30.8 34.4 29.2 36.7 30.3C39.6 31.7 39.9 36 37.3 38.2C33.8 41.2 28.1 40.3 25.8 36.2C22.9 31.1 25.2 24.4 30.6 22.3C37.2 19.7 44.5 23.8 45.8 30.9C47.2 38.4 42.3 45.8 34.5 47.2C25.3 48.9 16.9 41.8 16.5 32.3C16.1 22.6 23.4 14.5 33.2 14.5C39.5 14.5 44.4 17.6 51.8 17.2C47.8 21.8 45.9 25.4 45.6 29.2"
              stroke="url(#konoha-gold-grad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Lower-left Konoha triangular leaf notch/stem */}
            <path
              d="M21.8 43.2L13.2 49.4L18.4 39.2"
              stroke="url(#konoha-gold-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="h-[1.5px] w-14 bg-gradient-to-r from-amber-300/90 via-amber-400/50 to-transparent sm:w-24" />
        </div>
      </div>

      {/* Brief Golden Anime Chakra Flash on Start Transition */}
      {exiting && (
        <div
          className="pointer-events-none absolute inset-0 animate-storm-chakra-burst"
          style={{
            background:
              'radial-gradient(circle at 50% 62%, rgba(255, 251, 235, 0.92) 0%, rgba(253, 224, 71, 0.45) 38%, rgba(245, 158, 11, 0.14) 72%, rgba(9, 10, 15, 0) 100%)',
          }}
        />
      )}
    </div>
  );
}
