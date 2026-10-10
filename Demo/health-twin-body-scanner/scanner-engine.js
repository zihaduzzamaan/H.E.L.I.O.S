/* ============================================================
   HELIOS x ASTRODOCX — HEALTH TWIN 3D ENGINE
   24,000 Particle GPU X-Ray Human Body Scanner
   Single draw call THREE.Points system with:
   - Real-time traveling arterial Lub-Dub pulse wave propagation
   - Live brain cortex activity + stochastic neuron firing
   - Beating ventricular heart pump & respiratory lung oscillation
   - Translucent X-ray skin with silhouette Fresnel rim lighting
   - Downward Gaussian laser scanline sweep
   - Baked body.bin loader + full procedural mathematical fallback
============================================================ */

(function (window) {
  'use strict';

  const N_POINTS = 24000;
  const CENTERS = { 0: 9, 1: 1.70, 2: 0.78, 3: 0.86, 4: 0.26, 5: -1.2, 6: 0.5, 7: 0.0, 8: 0, 9: -9 };
  const DEFAULT_HEART = [0.06, 0.78, 0.07];

  // Seeded PRNG for deterministic procedural anatomy
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(r) {
    const u = Math.max(1e-6, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* -------------------------------------------------------------
     Procedural Body Generator (Fallback if body.bin is offline)
  ------------------------------------------------------------- */
  function genBody(n, r) {
    const pos = new Float32Array(n * 3);
    const reg = new Float32Array(n);
    const nrm = new Float32Array(n * 3);
    let k = 0;

    const put = (x, y, z, g, nx, ny, nz) => {
      if (k >= n) return false;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      reg[k] = g;
      nrm[k * 3] = nx || 0;
      nrm[k * 3 + 1] = ny || 0;
      nrm[k * 3 + 2] = nz || 0;
      k++;
      return true;
    };

    const lerp = (p, q, t) => p + (q - p) * t;

    // Torso Superellipses
    const TORSO = [
      [-0.26, 0.24, 0.15, 0], [-0.05, 0.33, 0.17, -0.01], [0.15, 0.29, 0.155, 0],
      [0.35, 0.265, 0.15, 0.01], [0.55, 0.32, 0.175, 0.015], [0.75, 0.37, 0.2, 0.02],
      [0.95, 0.395, 0.195, 0.01], [1.08, 0.38, 0.155, -0.01], [1.17, 0.22, 0.11, -0.02],
      [1.24, 0.09, 0.085, -0.01]
    ];
    const SE = 2.6;

    function torsoAt(y) {
      if (y < TORSO[0][0] || y > TORSO[TORSO.length - 1][0]) return null;
      let i = 0;
      while (i < TORSO.length - 2 && y > TORSO[i + 1][0]) i++;
      const A = TORSO[i], B = TORSO[i + 1], t = (y - A[0]) / (B[0] - A[0]), s = t * t * (3 - 2 * t);
      return [lerp(A[1], B[1], s), lerp(A[2], B[2], s), lerp(A[3], B[3], s)];
    }

    const CONES = [];
    const limb = (p0, r0, p1, r1, gl, gr) => {
      CONES.push([-p0[0], p0[1], p0[2], r0, -p1[0], p1[1], p1[2], r1, gl]);
      CONES.push([p0[0], p0[1], p0[2], r0, p1[0], p1[1], p1[2], r1, gr === undefined ? gl : gr]);
    };
    limb([0.43, 1.07, -0.01], 0.115, [0.51, 0.70, 0.00], 0.094, 0);
    limb([0.51, 0.70, 0.00], 0.094, [0.565, 0.42, 0.02], 0.068, 0);
    limb([0.565, 0.42, 0.02], 0.072, [0.60, 0.12, 0.05], 0.064, 0, 7);
    limb([0.60, 0.12, 0.05], 0.064, [0.625, -0.17, 0.07], 0.045, 0, 7);
    limb([0.175, -0.12, 0.0], 0.18, [0.16, -0.62, 0.01], 0.14, 5);
    limb([0.16, -0.62, 0.01], 0.14, [0.145, -1.02, 0.02], 0.09, 5);
    limb([0.145, -1.02, 0.02], 0.092, [0.15, -1.32, -0.01], 0.102, 5);
    limb([0.15, -1.32, -0.01], 0.102, [0.15, -1.86, 0.0], 0.052, 5);
    CONES.push([0, 1.22, -0.01, 0.068, 0, 1.45, 0.0, 0.062, 0]);

    const ELLS = [[0, 1.66, 0.015, 0.152, 0.205, 0.178, 0]];
    [-1, 1].forEach(sd => {
      ELLS.push([sd * 0.635, -0.30, 0.08, 0.035, 0.12, 0.06, sd > 0 ? 7 : 0]);
      ELLS.push([sd * 0.15, -1.97, 0.07, 0.06, 0.05, 0.14, 5]);
    });
    const headSq = y => y < 1.62 ? lerp(0.7, 1, (y - 1.46) / 0.16) : 1;

    // Skin point sampling
    const skinPts = Math.round(n * 0.46);
    for (let i = 0; i < skinPts; i++) {
      const choice = r();
      if (choice < 0.35) {
        // Torso surface
        const y = TORSO[0][0] + r() * (TORSO[TORSO.length - 1][0] - TORSO[0][0]);
        const c = torsoAt(y);
        if (c) {
          const th = r() * 6.2832;
          const cs = Math.cos(th), sn = Math.sin(th), ex = 2 / SE;
          const x = Math.sign(cs) * Math.pow(Math.abs(cs), ex) * c[0];
          const z = Math.sign(sn) * Math.pow(Math.abs(sn), ex) * c[1] + c[2];
          const gx = Math.pow(Math.abs(x) / c[0], SE - 1) * Math.sign(x) / c[0];
          const gz = Math.pow(Math.abs(z - c[2]) / c[1], SE - 1) * Math.sign(z - c[2]) / c[1];
          put(x, y, z, 0, gx, 0, gz);
        }
      } else if (choice < 0.85) {
        // Limbs & neck
        const cone = CONES[Math.floor(r() * CONES.length)];
        const t = r(), th = r() * 6.2832;
        const ax = [cone[4] - cone[0], cone[5] - cone[1], cone[6] - cone[2]];
        const L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
        const d = [ax[0] / L, ax[1] / L, ax[2] / L];
        const u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let e1 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
        const l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
        e1 = e1.map(v => v / l1);
        const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
        const rad = lerp(cone[3], cone[7], t);
        const nn = [0, 1, 2].map(idx => Math.cos(th) * e1[idx] + Math.sin(th) * e2[idx]);
        put(cone[0] + ax[0] * t + nn[0] * rad, cone[1] + ax[1] * t + nn[1] * rad, cone[2] + ax[2] * t + nn[2] * rad, cone[8], nn[0], nn[1], nn[2]);
      } else {
        // Head / Hands / Feet
        const el = ELLS[Math.floor(r() * ELLS.length)];
        const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1;
        const y = el[1] + v[1] / l * el[4], sx = el === ELLS[0] ? headSq(y) : 1;
        put(el[0] + v[0] / l * el[3] * sx, y, el[2] + v[2] / l * el[5], el[6], v[0] / l / (el[3] * sx), v[1] / l / el[4], v[2] / l / el[5]);
      }
    }

    // Skeleton / Bones (Region 6)
    const bone = (p0, p1, rad, count) => {
      const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
      for (let i = 0; i < count; i++) {
        const t = r(), th = r() * 6.2832, rr = rad * Math.sqrt(r());
        put(p0[0] + ax[0] * t + Math.cos(th) * rr, p0[1] + ax[1] * t, p0[2] + ax[2] * t + Math.sin(th) * rr, 6);
      }
    };

    // Vertebrae (Spine S-Curve)
    for (let v = 0; v < 26; v++) {
      const y = 1.46 - v * 0.061, z = -0.1 + 0.035 * Math.sin((y - 0.2) * 2.4);
      for (let i = 0; i < 22; i++) {
        const t = r() * 6.2832, rr = 0.026 * Math.sqrt(r());
        put(Math.cos(t) * rr * 1.3, y + (r() - 0.5) * 0.03, z + Math.sin(t) * rr, 6);
      }
    }

    // 10 Pairs of Ribs
    for (let rb = 0; rb < 10; rb++) {
      const y0 = 1.04 - rb * 0.058, w = 0.2 + Math.min(rb, 5) * 0.022 - Math.max(0, rb - 6) * 0.02, dp = 0.15 + Math.min(rb, 5) * 0.006;
      for (let i = 0; i < 46; i++) {
        const sd = i & 1 ? 1 : -1, t = r() * (rb < 7 ? 1 : 0.75), a = t * Math.PI;
        put(sd * Math.sin(a) * w, y0 - t * 0.12, -0.08 - Math.cos(a) * dp + (t > 0.5 ? (t - 0.5) * 0.04 : 0), 6);
      }
    }

    // Long bones
    bone([0, 1.04, 0.165], [0, 0.66, 0.175], 0.012, 110); // sternum
    [-1, 1].forEach(sd => {
      bone([sd * 0.04, 1.13, 0.1], [sd * 0.37, 1.1, -0.01], 0.01, 70); // clavicle
      bone([sd * 0.43, 1.05, -0.01], [sd * 0.56, 0.43, 0.02], 0.016, 150); // humerus
      bone([sd * 0.565, 0.41, 0.03], [sd * 0.61, -0.16, 0.08], 0.009, 90); // radius
      bone([sd * 0.55, 0.41, 0.0], [sd * 0.635, -0.15, 0.05], 0.008, 80); // ulna
      bone([sd * 0.155, -0.14, 0.0], [sd * 0.145, -1.0, 0.02], 0.02, 190); // femur
      bone([sd * 0.14, -1.06, 0.03], [sd * 0.15, -1.86, 0.0], 0.015, 150); // tibia
      bone([sd * 0.19, -1.08, 0.0], [sd * 0.18, -1.84, -0.02], 0.008, 70); // fibula
    });

    // Arteries / Vascular Tree (Region 8)
    const VES = [];
    function path(pts, d0) {
      let d = d0;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
        VES.push([pts[i - 1], pts[i], d, L]);
        d += L;
      }
      return d;
    }

    const H = [0.06, 0.8, 0.07], ARCH = [0.02, 0.98, 0.02];
    const dArch = path([H, [0.05, 0.92, 0.05], ARCH], 0);
    const dBif = path([ARCH, [-0.02, 0.97, -0.05], [-0.01, 0.75, -0.07], [0, 0.35, -0.06], [0, -0.1, -0.02]], dArch);
    [-1, 1].forEach(sd => {
      path([[0, -0.1, -0.02], [sd * 0.13, -0.28, 0.03], [sd * 0.16, -0.7, 0.05], [sd * 0.15, -1.04, 0.0], [sd * 0.16, -1.5, -0.02], [sd * 0.15, -1.88, 0.02]], dBif);
      const dNeck = path([ARCH, [sd * 0.045, 1.12, 0.04], [sd * 0.055, 1.42, 0.05], [sd * 0.07, 1.56, 0.04]], dArch);
      path([[sd * 0.07, 1.56, 0.04], [sd * 0.09, 1.7, 0.06], [sd * 0.04, 1.8, 0.04]], dNeck);
      const dSh = path([ARCH, [sd * 0.18, 1.06, 0.02], [sd * 0.38, 1.04, 0.0], [sd * 0.47, 0.95, 0.02]], dArch);
      path([[sd * 0.47, 0.95, 0.02], [sd * 0.52, 0.7, 0.04], [sd * 0.565, 0.42, 0.05], [sd * 0.6, 0.12, 0.08], [sd * 0.625, -0.18, 0.1]], dSh);
    });

    const vesL = VES.reduce((s, v) => s + v[3], 0);
    for (let i = 0; i < 3000; i++) {
      let w = r() * vesL, v = VES[0];
      for (let q = 0; q < VES.length; q++) {
        w -= VES[q][3];
        if (w <= 0) { v = VES[q]; break; }
      }
      const t = r();
      const jt = [(r() - 0.5) * 0.014, (r() - 0.5) * 0.014, (r() - 0.5) * 0.014];
      put(lerp(v[0][0], v[1][0], t) + jt[0], lerp(v[0][1], v[1][1], t) + jt[1], lerp(v[0][2], v[1][2], t) + jt[2], 8, v[2] + v[3] * t, 0, 0);
    }

    // Brain (Region 1)
    for (let i = 0; i < 1400; i++) {
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, d = [v[0] / l, v[1] / l, v[2] / l];
      if (d[1] < -0.45) continue;
      const fold = 0.9 + 0.1 * Math.sin(d[0] * 22 + Math.sin(d[1] * 17) * 2) * Math.sin(d[2] * 19 + d[1] * 9);
      const gap = Math.abs(d[0]) < 0.06 ? 0.85 : 1;
      put(d[0] * 0.112 * fold * gap, 1.71 + d[1] * 0.1 * fold, 0.015 + d[2] * 0.128 * fold, 1);
    }

    // Heart (Region 2)
    for (let i = 0; i < 800; i++) {
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, q = Math.cbrt(r()) / l;
      let x = v[0] * q, y = v[1] * q, z = v[2] * q;
      const lobe = x > 0 ? 1 : -1;
      y = y * 0.068 + (y < 0 ? y * 0.035 : 0);
      x = x * 0.052 + lobe * 0.024 * (1 + Math.min(0, y) * 9);
      z = z * 0.05;
      const ax = x * 0.9 - y * 0.35, ay = y * 0.9 + x * 0.35;
      put(H[0] + ax, H[1] - 0.01 + ay, H[2] + z, 2);
    }

    // Lungs (Region 3)
    const ell = (cnt, c, rd, g) => {
      for (let i = 0; i < cnt; i++) {
        const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, q = (0.86 + r() * 0.14) / l;
        put(c[0] + v[0] * q * rd[0], c[1] + v[1] * q * rd[1], c[2] + v[2] * q * rd[2], g);
      }
    };
    ell(700, [-0.16, 0.86, 0.01], [0.12, 0.21, 0.11], 3);
    ell(700, [0.17, 0.86, 0.01], [0.11, 0.21, 0.11], 3);

    // Floor Ring (Region 9)
    while (k < n) {
      const t = r() * 6.2832, rr = 0.5 + Math.pow(r(), 0.6) * 0.75;
      put(Math.cos(t) * rr, -2.08, Math.sin(t) * rr, 9);
    }

    return { pos, reg, nrm };
  }

  /* -------------------------------------------------------------
     GLSL Shaders
  ------------------------------------------------------------- */
  const VS = [
    'attribute vec3 aP0;',
    'attribute vec4 aSeed;',
    'attribute float aReg;',
    'attribute vec3 aNrm;',
    'uniform float uTime, uPR, uSize, uBright;',
    'uniform float uAng, uScan, uAlert, uBeatAmp, uBeatR;',
    'uniform vec3 uChest, uMouse;',
    'uniform float uLit[10], uFocus[10];',
    'uniform vec3 uTint;',
    'varying vec3 vC;',
    'varying float vA;',

    'vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }',
    'vec3 curl(vec3 p){ vec3 n=vec3(sin(p.y*1.7+uTime*.31)+sin(p.z*2.3-uTime*.17), sin(p.z*1.9+uTime*.26)+sin(p.x*2.1+uTime*.13), sin(p.x*1.6+uTime*.35)+sin(p.y*2.4-uTime*.21)); return vec3(n.y-n.z, n.z-n.x, n.x-n.y)*.5; }',

    'void main(){',
    '  vec3 pos = rotY(aP0, uAng);',
    '  int ri = int(aReg + 0.5);',    // Idle anatomical breathing and micro-vibration
    '  pos += curl(pos * 1.3 + aSeed.xyz * 5.0) * 0.006;',

    // Respiration in lungs (bilateral expansion wave)
    '  if (ri == 3) {',
    '    float lungBreathe = sin(uTime * 1.3);',
    '    pos.x += pos.x * 0.045 * lungBreathe;',
    '    pos.y += 0.02 * sin(uTime * 1.3 + pos.x * 2.5);',
    '  }',

    // ONLY the anatomical heart contracts and relaxes - the rest of the body does NOT expand!
    '  if (ri == 2) {',
    '    pos = uChest + (pos - uChest) * (1.0 + uBeatAmp * 0.18);',
    '  }',

    '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',

    // Base color, opacity and scale per anatomical region
    '  float by = aP0.y;',
    '  float li = uLit[ri];',
    '  float fo = uFocus[ri];',
    '  vec3 col = vec3(0.50, 0.80, 1.0);',
    '  float ab = 0.42;',
    '  float sz = 0.88;',

    // Region 1: Live Brain (folding cortex + neuron sparks + alert shift)
    '  if (ri == 1) {',
    '    float wave = 0.5 + 0.5 * sin(uTime * 4.5 - length(aP0 - vec3(0.0, 1.71, 0.015)) * 42.0);',
    '    float fire = step(0.92, fract(sin(dot(aSeed.xy, vec2(12.98, 78.23)) + floor(uTime * 7.5 + aSeed.w * 7.0)) * 43758.5));',
    '    col = mix(vec3(1.0, 0.28, 0.68), vec3(0.42, 0.95, 1.0), fire * 0.85);',
    '    ab = 0.38 + 0.28 * wave + 1.5 * fire;',
    '    sz = 0.95 + 0.75 * fire;',
    '  }',
    // Region 2: Heart (incandescent crimson core with systolic white flash)
    '  else if (ri == 2) {',
    '    col = mix(vec3(1.0, 0.03, 0.08), vec3(1.0, 0.88, 0.88), uBeatAmp * 0.65);',
    '    ab = 0.88 * (1.0 + uBeatAmp * 0.6);',
    '    sz = 1.15 + uBeatAmp * 0.25;',
    '  }',
    // Region 3: Pulmonary Lungs ("fush fush" - airy, distinct coral-pink / cyan respiratory lobes)
    '  else if (ri == 3) {',
    '    col = mix(vec3(0.42, 0.78, 1.0), vec3(1.0, 0.38, 0.50), 0.80);',
    '    ab = 0.52;',
    '    sz = 0.90;',
    '  }',
    // Region 4: Visceral gut / core abdomen cluster
    '  else if (ri == 4) {',
    '    col = vec3(0.40, 0.70, 1.0);',
    '    ab = 0.28;',
    '    sz = 0.82;',
    '  }',
    // Region 6: Bones / Skeleton (crisp radiant white-blue clavicles, sternum, ribs, spine, pelvis)
    '  else if (ri == 6) {',
    '    col = vec3(0.90, 0.96, 1.0);',
    '    ab = by > 1.45 ? 0.45 : 0.75;',
    '    sz = 0.92;',
    '  }',
    // Region 7: Forearm Telemetry Transmitter (amber beacon)
    '  else if (ri == 7) {',
    '    col = vec3(1.0, 0.85, 0.48);',
    '    ab = 0.65;',
    '    sz = 0.98;',
    '  }',
    // Region 8: Arterial Blood Vessels (Traveling Lub-Dub pulse wave from heart through whole body)
    '  else if (ri == 8) {',
    '    float d = aNrm.x;',
    '    float f1 = fract(uTime - d / 4.0);',
    '    float f2 = fract(uTime - 0.28 - d / 4.0);',
    '    float pl = exp(-f1 * 15.0) + 0.45 * exp(-f2 * 15.0);',
    '    col = mix(vec3(0.96, 0.03, 0.06), vec3(1.0, 0.42, 0.36), clamp(pl, 0.0, 1.0));',
    '    ab = 0.80 + 2.2 * pl;',
    '    sz = 1.05 + 1.0 * pl;',
    '  }',
    // Region 9: Floor Horizon Ambient Stardust (subtle, non-distracting pedestal)
    '  else if (ri == 9) {',
    '    col = vec3(0.25, 0.70, 0.88);',
    '    ab = 0.20;',
    '    sz = 0.60;',
    '  }',

    // Translucent Skin & Limbs (Fresnel silhouette rim: airy holographic center, crisp outer edge)
    '  if (ri == 0 || ri == 5 || ri == 7) {',
    '    float nl = length(aNrm); float rim = 0.55;',
    '    if (nl > 0.4) {',
    '      vec3 nw = normalize(rotY(aNrm, uAng));',
    '      rim = 1.0 - abs(dot(nw, normalize(cameraPosition - pos)));',
    '      rim = 0.35 + 1.8 * pow(rim, 1.6);',
    '      col = mix(col, vec3(0.72, 0.94, 1.0), 0.35 * rim);',
    '      sz *= 0.90 + 0.35 * rim;',
    '    }',
    '    // Attenuate skin in center so internal organs and bones are clearly visible',
    '    if (ri == 0 || ri == 5) {',
    '      ab *= clamp(rim / 0.55, 0.68, 1.6);',
    '    }',
    '  }',

    // Cardiac systolic pulse brightness modulation strictly for heart & vessels
    '  float beatGlow = (ri == 2) ? (uBeatAmp * 0.8) : 0.0;',
    '  ab *= (0.35 + 0.65 * li) * (1.0 + fo * 1.5) * (1.0 + beatGlow);',
    '  ab *= (1.0 + 2.0 * exp(-pow((by - uScan) / 0.09, 2.0)));',
    '  if (ri == 1) ab *= 1.0 + uAlert * 0.35 * sin(uTime * 3.2);',
    '  ab *= (0.60 + aSeed.z * 0.40);',

    '  vC = col * uTint;',
    '  vA = clamp(ab, 0.0, 1.0);',

    // Optimized stardust point size calculation: fine, crisp, distinct pinpricks
    '  float pz = max(0.1, -mv.z);',
    '  gl_PointSize = clamp((0.90 + aSeed.z * 1.5) * sz * 0.75 * uSize * uPR * (9.0 / pz), 1.2, 6.2);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  const FS = [
    'precision mediump float;',
    'uniform float uBright;',
    'varying vec3 vC;',
    'varying float vA;',
    'void main(){',
    '  vec2 d = gl_PointCoord - 0.5;',
    '  float r2 = dot(d, d) * 4.0;',
    '  if (r2 > 1.0) discard;',
    '  float a = exp(-r2 * 5.2) + 0.12 * exp(-r2 * 1.4);',
    '  gl_FragColor = vec4(vC * a * vA * uBright, a * vA);',
    '}'
  ].join('\n');

  /* -------------------------------------------------------------
     Engine Factory
  ------------------------------------------------------------- */
  function createScannerEngine(canvas, options) {
    const opts = options || {};
    const basePath = opts.basePath || './targets/';
    const onLoaded = opts.onLoaded || function () {};

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x02030a, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    camera.position.set(0, 0.05, 6.4);
    camera.lookAt(0, 0, 0);

    const n = N_POINTS;
    const rngInst = rng(20261009);

    // Initial procedural geometry
    const procedural = genBody(n, rngInst);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(procedural.pos, 3);
    const regAttr = new THREE.BufferAttribute(procedural.reg, 1);
    const nrmAttr = new THREE.BufferAttribute(procedural.nrm, 3);

    const seed = new Float32Array(n * 4);
    const sr = rng(20261008);
    for (let i = 0; i < n * 4; i++) seed[i] = sr();
    const seedAttr = new THREE.BufferAttribute(seed, 4);

    geo.setAttribute('position', posAttr); // Required by Three.js WebGLRenderer to determine point count!
    geo.setAttribute('aP0', posAttr);
    geo.setAttribute('aReg', regAttr);
    geo.setAttribute('aNrm', nrmAttr);
    geo.setAttribute('aSeed', seedAttr);

    const uniforms = {
      uTime: { value: 0 },
      uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: 1.95 },
      uBright: { value: 1.75 },
      uAng: { value: 0 },
      uScan: { value: 3.0 },
      uAlert: { value: 0.0 },
      uBeatAmp: { value: 0.0 },
      uBeatR: { value: 0.0 },
      uChest: { value: new THREE.Vector3().fromArray(DEFAULT_HEART) },
      uMouse: { value: new THREE.Vector3(99, 99, 0) },
      uLit: { value: new Float32Array(10) },
      uFocus: { value: new Float32Array(10) },
      uTint: { value: new THREE.Vector3(1, 1, 1) }
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    let bodyRig = {
      heart: DEFAULT_HEART,
      at: [
        [0, 1.70, 0.06],
        [-0.16, 0.86, 0.08],
        [-0.27, 0.30, 0.12],
        [0.06, 0.78, 0.12],
        [0.60, 0.12, 0.08],
        [0.15, -1.15, 0.08]
      ],
      centers: CENTERS
    };

    // Load High-Fidelity Baked Binary Asset
    Promise.all([
      fetch(basePath + 'body.bin').then(r => r.ok ? r.arrayBuffer() : Promise.reject('body.bin not found')),
      fetch(basePath + 'body.json').then(r => r.ok ? r.json() : Promise.reject('body.json not found'))
    ]).then(([buf, json]) => {
      if (buf.byteLength === n * 13 && json && json.heart && json.at) {
        const dv = new DataView(buf);
        const pa = posAttr.array;
        const na = nrmAttr.array;
        const ra = regAttr.array;

        for (let i = 0; i < n; i++) {
          for (let c = 0; c < 3; c++) {
            pa[i * 3 + c] = dv.getInt16(i * 6 + c * 2, true) / 8192;
            na[i * 3 + c] = dv.getInt16(n * 6 + i * 6 + c * 2, true) / 4096;
          }
          ra[i] = dv.getUint8(n * 12 + i);
        }

        posAttr.needsUpdate = true;
        nrmAttr.needsUpdate = true;
        regAttr.needsUpdate = true;
        bodyRig = json;
        console.log('[HELIOS 3D] Baked body.bin (312KB) loaded successfully.');
        onLoaded(true, bodyRig);
      }
    }).catch(err => {
      console.warn('[HELIOS 3D] Using procedural mathematical human body.', err);
      onLoaded(false, bodyRig);
    });

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uPR.value = pr;
    }

    return {
      scene,
      camera,
      renderer,
      uniforms,
      bodyRig: () => bodyRig,
      resize,
      render: (time, customAngle) => {
        uniforms.uTime.value = time;
        const ang = customAngle !== undefined ? customAngle : 0.32 * Math.sin(time * 0.22);
        uniforms.uAng.value = ang;

        // Cardiac Lub-Dub contraction
        const ph = time % 1.0;
        const dub = (time + 0.72) % 1.0;
        uniforms.uBeatR.value = ph * 1.7;
        uniforms.uBeatAmp.value = Math.max(0, 1.0 - ph * 1.6) * 0.9 + Math.max(0, 1.0 - dub * 3.0) * 0.25 * (dub < 0.33 ? 1 : 0);

        // Update chest origin rotated with the body
        const c = Math.cos(ang), s = Math.sin(ang), h = bodyRig.heart;
        uniforms.uChest.value.set(c * h[0] + s * h[2], h[1], -s * h[0] + c * h[2]);

        renderer.render(scene, camera);
      },
      dispose: () => {
        renderer.dispose();
        geo.dispose();
        mat.dispose();
      }
    };
  }

  window.HELIOS_SCANNER_ENGINE = { create: createScannerEngine };
})(window);
