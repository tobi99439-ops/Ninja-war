import * as THREE from 'three';

const SIMPLEX_NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fireFbm(vec3 p) {
  float value = 0.54 * (snoise3(p) * 0.5 + 0.5);
  p = p * 2.12 + vec3(13.1, 7.7, 5.3);
  value += 0.31 * (snoise3(p) * 0.5 + 0.5);
  p = p * 2.18 + vec3(4.3, 11.9, 8.1);
  value += 0.15 * (snoise3(p) * 0.5 + 0.5);
  return value;
}

vec3 blackbodyFireColor(float temp) {
  float t = clamp(temp, 0.0, 1.45);
  vec3 darkSoot  = vec3(0.14, 0.02, 0.01);
  vec3 deepRed   = vec3(0.84, 0.09, 0.01);
  vec3 orange    = vec3(1.00, 0.36, 0.03);
  vec3 gold      = vec3(1.06, 0.72, 0.16);
  vec3 whiteHot  = vec3(1.32, 1.18, 0.88);

  vec3 col = mix(darkSoot, deepRed, smoothstep(0.02, 0.25, t));
  col = mix(col, orange, smoothstep(0.22, 0.52, t));
  col = mix(col, gold, smoothstep(0.48, 0.82, t));
  col = mix(col, whiteHot, smoothstep(0.80, 1.22, t));
  return col;
}
`;

export function createVolumetricFireCoreMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vTurb;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        vec3 nPos = position * 2.5 + vec3(uSeed * 3.1, -uTime * 4.4, -uTime * 6.0);
        float turb = fireFbm(nPos);
        float disp = (turb - 0.42) * 0.28;
        vec3 displaced = position + normal * disp;
        vObjPos = displaced;
        vTurb = turb;
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uIntensity;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vTurb;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float fresnel = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
        vec3 sampleP = vObjPos * 3.8 + vec3(uSeed * 5.7, -uTime * 5.4, -uTime * 7.2);
        float f = fireFbm(sampleP);
        float temp = mix(0.52, 1.38, pow(fresnel, 0.65)) + (f - 0.46) * 0.62 + (vTurb - 0.45) * 0.36;
        vec3 col = blackbodyFireColor(temp) * uIntensity * 1.18;
        float alpha = smoothstep(0.02, 0.30, fresnel + f * 0.34);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
  });
}

export function createVolumetricFireMantleMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vTurb;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        vec3 flow = vec3(uSeed * 2.9, -uTime * 5.1, -uTime * 8.2);
        float turb = fireFbm(position * 2.75 + flow);
        float backBias = clamp(-position.z * 0.65 + 0.5, 0.25, 1.35);
        vec3 displaced = position + normal * ((turb - 0.36) * 0.34 * backBias);
        displaced.y += max(0.0, turb - 0.44) * 0.12;
        vObjPos = displaced;
        vTurb = turb;
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uIntensity;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vTurb;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        vec3 flow = vec3(uSeed * 4.7, -uTime * 6.2, -uTime * 9.1);
        float f = fireFbm(vObjPos * 3.7 + flow);
        float density = f * 0.78 + vTurb * 0.34;
        float rimFade = smoothstep(0.05, 0.52, ndotv);
        float mask = smoothstep(0.36, 0.80, density) * rimFade;
        float heat = clamp((density - 0.30) * 1.75 + ndotv * 0.32, 0.15, 1.3);
        vec3 col = blackbodyFireColor(heat) * uIntensity * 1.1;
        gl_FragColor = vec4(col * mask, clamp(mask * 0.9, 0.0, 0.94));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createVolumetricFireShellMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vFlameDisp;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        vec3 flow = vec3(uSeed * 4.3, -uTime * 5.0, -uTime * 8.6);
        float lick = fireFbm(position * 2.4 + flow);
        float backBias = clamp(-position.z * 0.95 + 0.42, 0.22, 1.65);
        vec3 displaced = position + normal * ((lick - 0.30) * 0.48 * backBias);
        displaced.y += max(0.0, lick - 0.42) * 0.22;
        vObjPos = displaced;
        vFlameDisp = lick;
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uIntensity;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vFlameDisp;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        vec3 flow = vec3(uSeed * 6.1, -uTime * 6.4, -uTime * 9.8);
        float n = fireFbm(vObjPos * 3.6 + flow);
        float fineLick = fireFbm(vObjPos * 6.4 + flow * 1.35);
        float density = n * 0.68 + fineLick * 0.22 + vFlameDisp * 0.28;

        float rimFade = smoothstep(0.03, 0.54, ndotv);
        float flameMask = smoothstep(0.42, 0.86, density) * rimFade;

        float heat = clamp((density - 0.38) * 1.65 + ndotv * 0.22, 0.04, 1.15);
        vec3 col = blackbodyFireColor(heat) * uIntensity;
        gl_FragColor = vec4(col * flameMask, clamp(flameMask * 0.86, 0.0, 0.94));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createFireTrailConeMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      varying vec3 vLocalPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        vUv = uv;
        float tailMask = uv.y;
        float twistAngle = tailMask * 5.2 - uTime * 8.4;
        vec3 p = position;
        float n = snoise3(vec3(p.xy * 2.5 + vec2(cos(twistAngle), sin(twistAngle)), p.z * 1.7 + uTime * 8.2 + uSeed * 3.1)) * 0.22 * tailMask;
        p += normal * n;
        vLocalPos = p;
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vLocalPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float headToTail = 1.0 - vUv.y;
        float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        vec3 flow = vLocalPos * vec3(2.9, 2.9, 1.85) + vec3(uSeed * 2.7, uTime * 2.4, uTime * 10.6);
        float turb = fireFbm(flow);

        float endFade = smoothstep(0.0, 0.56, headToTail) * smoothstep(1.0, 0.76, headToTail);
        float edgeFade = smoothstep(0.05, 0.52, ndotv);
        float mask = smoothstep(0.36, 0.80, turb + headToTail * 0.30) * endFade * edgeFade;

        float heat = mix(0.18, 1.04, headToTail) * (0.72 + turb * 0.48);
        vec3 col = blackbodyFireColor(heat) * uIntensity;
        gl_FragColor = vec4(col * mask, clamp(mask * 0.82, 0.0, 0.88));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createFireBlastDomeMaterial(seed = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uProgress;
      uniform float uSeed;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vNoise;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float n = fireFbm(position * 2.4 + vec3(uSeed * 4.1, -uTime * 3.2, uTime * 2.4));
        float bulge = (n - 0.38) * (0.28 + uProgress * 0.34);
        vec3 displaced = position + normal * bulge;
        vObjPos = displaced;
        vNoise = n;
        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uProgress;
      uniform float uSeed;
      varying vec3 vObjPos;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vNoise;
      ${SIMPLEX_NOISE_GLSL}
      void main() {
        float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float detail = fireFbm(vObjPos * 3.6 + vec3(uSeed * 5.2, -uTime * 4.5, 0.0));
        float combined = detail * 0.65 + vNoise * 0.35;

        // Progressive noise erosion as the fireball explosion expands and cools
        float dissolveThresh = mix(0.18, 0.86, pow(uProgress, 0.85));
        float edgeMask = smoothstep(dissolveThresh - 0.14, dissolveThresh + 0.16, combined);
        float lifeFade = 1.0 - smoothstep(0.55, 1.0, uProgress);
        float alpha = edgeMask * lifeFade * smoothstep(0.02, 0.42, ndotv);

        float cooling = mix(1.22, 0.28, uProgress);
        float temp = cooling * (0.65 + combined * 0.55);
        vec3 col = blackbodyFireColor(temp);
        gl_FragColor = vec4(col * alpha, clamp(alpha * 0.92, 0.0, 0.95));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
