/* ============================================================
   ASTRODOCX — the one particle system of the landing page
   One THREE.Points system, one draw call, 24k particles for the
   whole page. Eight target shapes live on the GPU as vertex
   attributes aP0..aP7; the vertex shader mixes shape a -> b from
   uniforms (uSeg, uSegB, uT), so a particle's position is a pure
   function of scroll: fast scrolling, reversing and jumping can
   never break it.

     0 dust  1 planet  2 astronaut  3 Orion  4 relay  5 Earth   (intro)
     6 body  (Health Twin: regions in aReg light up per system)
     7 ASTRODOCX wordmark  (the reveal)

   The same particles are born as stardust and end as the wordmark.
   Astronaut, Orion, TDRS and Earth load baked NASA-model bins; the
   body loads a real human shape baked from a turntable video.
============================================================ */
(function () {
  'use strict';

  const N_MAX = 24000;
  const TIER_N = { high: 24000, mid: 14000, low: 8000 };

  /* per-shape placement / look. off = world offset (keeps the form clear of the text side),
     sc = scale, rot = idle spin (rad/s), sway = idle turn (rad) instead of a spin, yaw = base turn (rad), tint = colour multiplier,
     dis = dissolve strength of the morph INTO this shape, chest = heartbeat origin in shape space */
  const SHAPES = [
    { id: 'dust',      sc: 4.2, off: [0, 0, 0],       rot: 0.02, tint: [1, 1, 1],          dis: 0.0 },
    { id: 'planet',    sc: 2.5, off: [2.6, 0, 0],     rot: 0.10, tint: [1.0, 0.86, 0.62],  dis: 1.6 },
    { id: 'astronaut', sc: 3.3, off: [-3.9, -0.3, 0],   rot: 0, yaw: 0.52, sway: 0.15, tint: [1, 1, 1],  dis: 1.6, chest: [0.337, -0.191, 0.156] },   // Crew: salute, flag, Moon, Earth (tools/bake-moon.mjs)
    { id: 'orion',     sc: 2.7, off: [3.0, 0.3, 0],     rot: 0.0, tint: [0.95, 0.97, 1.0],  dis: 1.6 },
    { id: 'relay',     sc: 3.0, off: [-3.4, -0.3, 0],    rot: 0.02, tint: [1, 1, 1],          dis: 1.6 },
    { id: 'earth',     sc: 2.3, off: [0, -2.25, 0],    rot: 0.08, tint: [0.62, 0.82, 1.15], dis: 1.6 }
  ];

  /* ── deterministic PRNG so every load builds the same shapes ── */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r()); }
  function noise3(x, y, z) {                                  // cheap smooth-ish value noise, enough for land / craters
    return (Math.sin(x * 1.7 + Math.sin(y * 2.3) + z) + Math.sin(y * 1.9 + Math.sin(z * 2.1) + x * .7) + Math.sin(z * 2.2 + Math.sin(x * 1.3) + y * .9)) / 3;
  }
  function fib(i, n) {                                        // Fibonacci sphere point i of n
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
    return [Math.cos(th) * rr, y, Math.sin(th) * rr];
  }

  /* ── Morton (Z-order) sort: particle i lands in the same region of every shape -> clean morphs ── */
  function spread(v) { v &= 0x3ff; v = (v | (v << 16)) & 0x030000ff; v = (v | (v << 8)) & 0x0300f00f; v = (v | (v << 4)) & 0x030c30c3; return (v | (v << 2)) & 0x09249249; }
  function mortonSort(a, n, extras) {
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = a[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    const keys = new Float64Array(n), idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const q = [0, 1, 2].map(k => Math.min(1023, Math.max(0, Math.floor((a[i * 3 + k] - min[k]) / ((max[k] - min[k]) || 1) * 1023))));
      keys[i] = spread(q[0]) + spread(q[1]) * 2 + spread(q[2]) * 4; idx[i] = i;
    }
    const order = Array.from(idx).sort((x, y) => keys[x] - keys[y]);
    const out = new Float32Array(n * 3);
    order.forEach((o, i) => { out[i * 3] = a[o * 3]; out[i * 3 + 1] = a[o * 3 + 1]; out[i * 3 + 2] = a[o * 3 + 2]; });
    (extras || []).forEach(x => { const w = x.length / n, ex = x.slice(); order.forEach((o, i) => { for (let c = 0; c < w; c++) x[i * w + c] = ex[o * w + c]; }); });   // per-point values (body region, normal) follow their point
    return out;
  }

  /* ── procedural shape generators: n points, extent about [-1, 1] ── */
  function genDust(n, r) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {                              // thick shell, denser toward the middle
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, k = (0.35 + Math.pow(r(), 0.7) * 0.65) / l * 1.15;
      a[i * 3] = v[0] * k * 1.25; a[i * 3 + 1] = v[1] * k * 0.8; a[i * 3 + 2] = v[2] * k;
    }
    return a;
  }
  function genPlanet(n, r) {
    const a = new Float32Array(n * 3), ringN = Math.floor(n * 0.08), tilt = 0.42;
    for (let i = 0; i < n - ringN; i++) {
      const p = fib(i, n - ringN), h = 1 + noise3(p[0] * 5, p[1] * 5, p[2] * 5) * 0.035;
      a[i * 3] = p[0] * h * 0.72; a[i * 3 + 1] = p[1] * h * 0.72; a[i * 3 + 2] = p[2] * h * 0.72;
    }
    for (let j = 0; j < ringN; j++) {                          // orbit ring, tilted
      const i = n - ringN + j, th = r() * 6.2832, rad = 0.95 + r() * 0.22, x = Math.cos(th) * rad, z = Math.sin(th) * rad, y = (r() - .5) * 0.015;
      a[i * 3] = x; a[i * 3 + 1] = y * Math.cos(tilt) + z * Math.sin(tilt) * 0.35; a[i * 3 + 2] = z * Math.cos(tilt) - y * Math.sin(tilt);
    }
    return a;
  }
  function ellipsoids(n, r, parts) {                           // surface points on a list of ellipsoids [cx,cy,cz,rx,ry,rz,weight]
    const a = new Float32Array(n * 3), tot = parts.reduce((s, p) => s + p[6], 0);
    for (let i = 0; i < n; i++) {
      let w = r() * tot, p = parts[0];
      for (let k = 0; k < parts.length; k++) { w -= parts[k][6]; if (w <= 0) { p = parts[k]; break; } }
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1;
      a[i * 3] = p[0] + v[0] / l * p[3]; a[i * 3 + 1] = p[1] + v[1] / l * p[4]; a[i * 3 + 2] = p[2] + v[2] / l * p[5];
    }
    return a;
  }
  function genAstronaut(n, r) {
    return ellipsoids(n, r, [
      [0, 0.80, 0.02, 0.26, 0.28, 0.27, 5],      // helmet
      [0, 0.82, 0.20, 0.15, 0.13, 0.08, 1.2],    // visor
      [0, 0.26, 0, 0.36, 0.50, 0.24, 8],         // torso
      [0, 0.30, -0.28, 0.30, 0.40, 0.14, 4],     // life-support pack
      [-0.52, 0.28, 0.06, 0.12, 0.42, 0.12, 3],  // left arm
      [0.52, 0.28, 0.06, 0.12, 0.42, 0.12, 3],   // right arm
      [-0.17, -0.58, 0, 0.14, 0.50, 0.14, 3.5],  // left leg
      [0.17, -0.58, 0, 0.14, 0.50, 0.14, 3.5]    // right leg
    ]);
  }
  function rect(a, i, r, c, u, v) {                            // point on a parallelogram centre c, half-axes u, v
    const s = r() * 2 - 1, t = r() * 2 - 1;
    a[i * 3] = c[0] + u[0] * s + v[0] * t; a[i * 3 + 1] = c[1] + u[1] * s + v[1] * t; a[i * 3 + 2] = c[2] + u[2] * s + v[2] * t;
  }
  function genOrion(n, r) {                                    // crew module cone + service module cylinder + 4 solar wings, axis along +x
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const w = r();
      if (w < 0.26) {                                          // cone
        const x = r(), rad = 0.42 * (1 - x) + 0.13 * x, th = r() * 6.2832;
        a[i * 3] = 0.15 + x * 0.55; a[i * 3 + 1] = Math.cos(th) * rad; a[i * 3 + 2] = Math.sin(th) * rad;
      } else if (w < 0.48) {                                   // service module
        const x = r(), th = r() * 6.2832;
        a[i * 3] = -0.55 + x * 0.70; a[i * 3 + 1] = Math.cos(th) * 0.42; a[i * 3 + 2] = Math.sin(th) * 0.42;
      } else if (w < 0.54) {                                   // engine bell
        const x = r(), th = r() * 6.2832, rad = 0.12 + x * 0.16;
        a[i * 3] = -0.55 - x * 0.28; a[i * 3 + 1] = Math.cos(th) * rad; a[i * 3 + 2] = Math.sin(th) * rad;
      } else {                                                 // 4 wings, 2 panels each side of the module
        const side = (i & 1) ? 1 : -1, up = (i & 2) ? 1 : 0;
        rect(a, i, r, up ? [-0.28, 0, side * 0.82] : [-0.28, side * 0.82, 0], [0.16, 0, 0], up ? [0, 0, side * 0.34] : [0, side * 0.34, 0]);
      }
    }
    return a;
  }
  function genRelay(n, r) {                                    // TDRS-like: bus box, two big panels, dish
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const w = r();
      if (w < 0.18) {                                          // bus
        const f = Math.floor(r() * 6), u = r() * 2 - 1, v = r() * 2 - 1, ax = f >> 1, sg = (f & 1) ? 1 : -1, d = [.2, .2, .2];
        const p = [0, 0, 0]; p[ax] = sg * d[ax]; p[(ax + 1) % 3] = u * d[(ax + 1) % 3]; p[(ax + 2) % 3] = v * d[(ax + 2) % 3];
        a[i * 3] = p[0]; a[i * 3 + 1] = p[1]; a[i * 3 + 2] = p[2];
      } else if (w < 0.80) {                                   // panels (denser sampling so they read as panels)
        const side = (i & 1) ? 1 : -1, s = r() * 2 - 1, t = r() * 2 - 1;
        a[i * 3] = side * (0.34 + (s * .5 + .5) * 0.62); a[i * 3 + 1] = t * 0.3; a[i * 3 + 2] = (r() - .5) * 0.01;
      } else if (w < 0.92) {                                   // dish
        const th = r() * 6.2832, rr = Math.sqrt(r()) * 0.34;
        a[i * 3] = Math.cos(th) * rr; a[i * 3 + 1] = 0.25 + rr * rr * 1.2; a[i * 3 + 2] = Math.sin(th) * rr + 0.2;
      } else {                                                 // boom
        const t = r(); a[i * 3] = 0; a[i * 3 + 1] = 0.2 + t * 0.15; a[i * 3 + 2] = 0.1 + t * 0.1;
      }
    }
    return a;
  }
  function genEarth(n, r) {
    const a = new Float32Array(n * 3), cloudN = Math.floor(n * 0.04);
    let k = 0, guard = 0;
    while (k < n - cloudN && guard++ < n * 8) {
      const p = fib(Math.floor(r() * 200000), 200000), land = noise3(p[0] * 2.6 + 1, p[1] * 2.6, p[2] * 2.6) + noise3(p[0] * 6, p[1] * 6, p[2] * 6) * 0.25 > 0.12;
      if (land || r() < 0.8) { a[k * 3] = p[0] * 0.8; a[k * 3 + 1] = p[1] * 0.8; a[k * 3 + 2] = p[2] * 0.8; k++; }
    }
    for (; k < n; k++) { const p = fib(Math.floor(r() * 5000), 5000); a[k * 3] = p[0] * 0.85; a[k * 3 + 1] = p[1] * 0.85; a[k * 3 + 2] = p[2] * 0.85; }
    return a;
  }
  function genWordmark(n, r, fam) {                            // "ASTRODOCX" drawn to a canvas, lit pixels sampled 
    const W = 1400, H = 260, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 190px ' + fam; if (c.letterSpacing !== undefined) c.letterSpacing = '14px';
    c.fillText('ASTRODOCX', W / 2, H / 2 + 8);
    const d = c.getImageData(0, 0, W, H).data, px = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4] > 128) px.push(x, y);
    const a = new Float32Array(n * 3), m = px.length / 2;
    for (let i = 0; i < n; i++) {
      const q = Math.floor(r() * m) * 2;
      a[i * 3] = (px[q] + r() * 2 - W / 2) / (W / 2) * 1.55;               // x in about [-1.55, 1.55] at scale 1
      a[i * 3 + 1] = -(px[q + 1] + r() * 2 - H / 2) / (W / 2) * 1.55;
      a[i * 3 + 2] = (r() - .5) * 0.12;
    }
    return a;
  }
  /* Health Twin body: a sculpted human figure, about 8 heads tall (feet y -2.05, crown y 1.9 at scale 1).
     The skin is a surface made of a lofted torso, head, neck and tapered limbs ("round cones"); points that
     fall inside another part are dropped, so only the outer skin is left and the silhouette is clean. Each
     skin point carries its surface normal (the shader lights the edges like a hologram); about a third
     are snapped to horizontal contour lines. Inside, X-ray style: full skeleton, arteries, folded brain,
     a two-ventricle heart, lungs and gut.
     reg (per point): 0 skin, 1 brain, 2 heart, 3 lungs, 4 gut, 5 legs, 6 skeleton, 7 right forearm, 8 arteries, 9 floor ring.
     Arteries store their path distance from the heart in the normal's x (the pulse runs along it). */
  function genBody(n, r) {
    const a = new Float32Array(n * 3), reg = new Float32Array(n), nrm = new Float32Array(n * 3);
    let k = 0;
    const put = (x, y, z, g, nx, ny, nz) => { if (k >= n) return false; a[k * 3] = x; a[k * 3 + 1] = y; a[k * 3 + 2] = z; reg[k] = g; nrm[k * 3] = nx || 0; nrm[k * 3 + 1] = ny || 0; nrm[k * 3 + 2] = nz || 0; k++; return true; };
    const lerp = (p, q, t) => p + (q - p) * t;

    /* torso: cross-sections bottom -> top [y, half width, half depth, z offset]; superellipse, so it is not a tube */
    const TORSO = [[-0.26, 0.24, 0.15, 0], [-0.05, 0.33, 0.17, -0.01], [0.15, 0.29, 0.155, 0], [0.35, 0.265, 0.15, 0.01], [0.55, 0.32, 0.175, 0.015],
                   [0.75, 0.37, 0.2, 0.02], [0.95, 0.395, 0.195, 0.01], [1.08, 0.38, 0.155, -0.01], [1.17, 0.22, 0.11, -0.02], [1.24, 0.09, 0.085, -0.01]];
    const SE = 2.6;
    function torsoAt(y) {
      if (y < TORSO[0][0] || y > TORSO[TORSO.length - 1][0]) return null;
      let i = 0; while (i < TORSO.length - 2 && y > TORSO[i + 1][0]) i++;
      const A = TORSO[i], B = TORSO[i + 1], t = (y - A[0]) / (B[0] - A[0]), s = t * t * (3 - 2 * t);
      return [lerp(A[1], B[1], s), lerp(A[2], B[2], s), lerp(A[3], B[3], s)];
    }
    const inTorso = (x, y, z) => { const c = torsoAt(y); return c && Math.pow(Math.abs(x) / c[0], SE) + Math.pow(Math.abs(z - c[2]) / c[1], SE) < 1; };

    /* round cones: [x0,y0,z0, r0, x1,y1,z1, r1, region] (mirrored for left / right) */
    const CONES = [];
    const limb = (p0, r0, p1, r1, gl, gr) => { CONES.push([-p0[0], p0[1], p0[2], r0, -p1[0], p1[1], p1[2], r1, gl]); CONES.push([p0[0], p0[1], p0[2], r0, p1[0], p1[1], p1[2], r1, gr === undefined ? gl : gr]); };
    limb([0.43, 1.07, -0.01], 0.115, [0.51, 0.70, 0.00], 0.094, 0);          // shoulder cap -> upper arm
    limb([0.51, 0.70, 0.00], 0.094, [0.565, 0.42, 0.02], 0.068, 0);          // upper arm -> elbow
    limb([0.565, 0.42, 0.02], 0.072, [0.60, 0.12, 0.05], 0.064, 0, 7);       // forearm (right one is the transmitter)
    limb([0.60, 0.12, 0.05], 0.064, [0.625, -0.17, 0.07], 0.045, 0, 7);       // forearm -> wrist
    limb([0.175, -0.12, 0.0], 0.18, [0.16, -0.62, 0.01], 0.14, 5);         // thigh
    limb([0.16, -0.62, 0.01], 0.14, [0.145, -1.02, 0.02], 0.09, 5);       // -> knee
    limb([0.145, -1.02, 0.02], 0.092, [0.15, -1.32, -0.01], 0.102, 5);       // calf bulge
    limb([0.15, -1.32, -0.01], 0.102, [0.15, -1.86, 0.0], 0.052, 5);         // -> ankle
    CONES.push([0, 1.22, -0.01, 0.068, 0, 1.45, 0.0, 0.062, 0]);              // neck
    function inCone(c, x, y, z, m) {
      const dx = c[4] - c[0], dy = c[5] - c[1], dz = c[6] - c[2], L2 = dx * dx + dy * dy + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - c[0]) * dx + (y - c[1]) * dy + (z - c[2]) * dz) / L2));
      const px = c[0] + dx * t, py = c[1] + dy * t, pz = c[2] + dz * t;
      return Math.hypot(x - px, y - py, z - pz) < lerp(c[3], c[7], t) - m;
    }
    /* ellipsoids: head (with a narrower jaw), hands, feet [cx,cy,cz, rx,ry,rz, region] */
    const ELLS = [[0, 1.66, 0.015, 0.152, 0.205, 0.178, 0]];
    [-1, 1].forEach(sd => {
      ELLS.push([sd * 0.635, -0.30, 0.08, 0.035, 0.12, 0.06, sd > 0 ? 7 : 0]);        // hand
      ELLS.push([sd * 0.15, -1.97, 0.07, 0.06, 0.05, 0.14, 5]);                       // foot
    });
    const headSq = y => y < 1.62 ? lerp(0.7, 1, (y - 1.46) / 0.16) : 1;             // jaw narrows toward the chin
    function inEll(e, x, y, z, m) {
      const sx = e === ELLS[0] ? headSq(y) : 1;
      const u = (x - e[0]) / (e[3] * sx - m), v = (y - e[1]) / (e[4] - m), w = (z - e[2]) / (e[5] - m);
      return u * u + v * v + w * w < 1;
    }
    const M = 0.006;
    const inside = (x, y, z, self) => (self !== 'torso' && inTorso(x, y, z)) || CONES.some(c => c !== self && inCone(c, x, y, z, M)) || ELLS.some(e => e !== self && inEll(e, x, y, z, M));

    /* skin parts with an area estimate, so every part gets points in proportion to its surface */
    const parts = [];
    parts.push({ area: 2.4, sample: () => {                                          // torso
      const y = TORSO[0][0] + r() * (TORSO[TORSO.length - 1][0] - TORSO[0][0]), c = torsoAt(y), th = r() * 6.2832;
      const cs = Math.cos(th), sn = Math.sin(th), ex = 2 / SE;
      const x = Math.sign(cs) * Math.pow(Math.abs(cs), ex) * c[0], z = Math.sign(sn) * Math.pow(Math.abs(sn), ex) * c[1] + c[2];
      const gx = Math.pow(Math.abs(x) / c[0], SE - 1) * Math.sign(x) / c[0], gz = Math.pow(Math.abs(z - c[2]) / c[1], SE - 1) * Math.sign(z - c[2]) / c[1];
      return { p: [x, y, z], n: [gx, 0, gz], g: 0, self: 'torso' };
    } });
    CONES.forEach(c => parts.push({ area: 6.2832 * (c[3] + c[7]) / 2 * Math.hypot(c[4] - c[0], c[5] - c[1], c[6] - c[2]), sample: () => {
      const t = r(), th = r() * 6.2832, ax = [c[4] - c[0], c[5] - c[1], c[6] - c[2]], L = Math.hypot(ax[0], ax[1], ax[2]);
      const d = [ax[0] / L, ax[1] / L, ax[2] / L], u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let e1 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]; const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map(v => v / l1);
      const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
      const rad = lerp(c[3], c[7], t), nn = [0, 1, 2].map(i => Math.cos(th) * e1[i] + Math.sin(th) * e2[i]);
      return { p: [0, 1, 2].map(i => c[i] + ax[i] * t + nn[i] * rad), n: nn, g: c[8], self: c };
    } }));
    const ellArea = e => { const P = 1.6, A = Math.pow(e[3] * e[4], P), B = Math.pow(e[3] * e[5], P), C = Math.pow(e[4] * e[5], P); return 4 * Math.PI * Math.pow((A + B + C) / 3, 1 / P); };   // Knud Thomsen
    ELLS.forEach(e => parts.push({ area: ellArea(e) * (e === ELLS[0] ? 1.7 : 1), sample: () => {
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, y = e[1] + v[1] / l * e[4], sx = e === ELLS[0] ? headSq(y) : 1;
      const p = [e[0] + v[0] / l * e[3] * sx, y, e[2] + v[2] / l * e[5]];
      return { p: p, n: [v[0] / l / (e[3] * sx), v[1] / l / e[4], v[2] / l / e[5]], g: e[6], self: e };
    } }));
    const totA = parts.reduce((s, q) => s + q.area, 0);

    /* X-ray budget: 46% translucent skin, then skeleton, arteries, organs and the floor ring */
    const SKIN = Math.floor(n * 0.46);
    let guard = 0;
    while (k < SKIN && guard++ < SKIN * 20) {
      let w = r() * totA, q = parts[0];
      for (let i = 0; i < parts.length; i++) { w -= parts[i].area; if (w <= 0) { q = parts[i]; break; } }
      const s = q.sample(), p = s.p;
      if (inside(p[0], p[1], p[2], s.self)) continue;
      if (r() < 0.34) p[1] = Math.round(p[1] / 0.075) * 0.075;                       // scanner contour lines
      const nl = Math.hypot(s.n[0], s.n[1], s.n[2]) || 1;
      put(p[0], p[1], p[2], s.g, s.n[0] / nl, s.n[1] / nl, s.n[2] / nl);
    }
    const f = n / 24000, j3 = s => [(r() - .5) * s, (r() - .5) * s, (r() - .5) * s];

    /* ── skeleton (region 6): bones as point lines with knobbed ends, skull and ribcage as shells ── */
    function bone(p0, p1, rad, cnt) {
      cnt = Math.round(cnt * f);
      for (let i = 0; i < cnt; i++) {
        const t = r(), knob = t < 0.08 || t > 0.92 ? 1.9 : 1, g = [gauss(r), gauss(r), gauss(r)];
        put(lerp(p0[0], p1[0], t) + g[0] * rad * knob, lerp(p0[1], p1[1], t) + g[1] * rad * knob * 0.5, lerp(p0[2], p1[2], t) + g[2] * rad * knob, 6);
      }
    }
    for (let i = 0, m = Math.round(170 * f); i < m; i++) {                               // skull shell + jaw
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1;
      if (v[1] / l < -0.55 && v[2] / l < 0.2) continue;
      const y = 1.68 + v[1] / l * 0.17; put(v[0] / l * 0.125 * (y < 1.6 ? 0.8 : 1), y, 0.0 + v[2] / l * 0.15, 6);
    }
    for (let i = 0, m = Math.round(110 * f); i < m; i++) { const t = (r() - 0.5) * 2.4; put(Math.sin(t) * 0.085, 1.5 - Math.cos(t) * 0.03, 0.02 + Math.cos(t) * 0.1, 6); }   // jaw
    for (let v = 0; v < 26; v++) {                                                      // vertebrae, a gentle S-curve
      const y = 1.46 - v * 0.061, z = -0.1 + 0.035 * Math.sin((y - 0.2) * 2.4);
      for (let i = 0, m = Math.round(22 * f); i < m; i++) { const t = r() * 6.2832, rr = 0.026 * Math.sqrt(r()); put(Math.cos(t) * rr * 1.3, y + (r() - .5) * 0.03, z + Math.sin(t) * rr, 6); }
    }
    for (let rb = 0; rb < 10; rb++) {                                                   // 10 pairs of ribs, sloping down to the front
      const y0 = 1.04 - rb * 0.058, w = 0.2 + Math.min(rb, 5) * 0.022 - Math.max(0, rb - 6) * 0.02, dp = 0.15 + Math.min(rb, 5) * 0.006;
      for (let i = 0, m = Math.round(46 * f); i < m; i++) {
        const sd = i & 1 ? 1 : -1, t = r() * (rb < 7 ? 1 : 0.75), a = t * Math.PI;
        put(sd * Math.sin(a) * w, y0 - t * 0.12, -0.08 - Math.cos(a) * (dp - 0.0) + 0.0 + (t > 0.5 ? (t - 0.5) * 0.04 : 0), 6);
      }
    }
    bone([0, 1.04, 0.165], [0, 0.66, 0.175], 0.012, 110);                              // sternum
    [-1, 1].forEach(sd => {
      bone([sd * 0.04, 1.13, 0.1], [sd * 0.37, 1.1, -0.01], 0.01, 70);                 // clavicle
      bone([sd * 0.43, 1.05, -0.01], [sd * 0.56, 0.43, 0.02], 0.016, 150);             // humerus
      bone([sd * 0.565, 0.41, 0.03], [sd * 0.61, -0.16, 0.08], 0.009, 90);             // radius
      bone([sd * 0.55, 0.41, 0.0], [sd * 0.635, -0.15, 0.05], 0.008, 80);              // ulna
      for (let fg = 0; fg < 4; fg++) bone([sd * 0.625, -0.2, 0.06 + fg * 0.012], [sd * (0.63 + fg * 0.004), -0.4 + Math.abs(fg - 1.5) * 0.03, 0.06 + fg * 0.02], 0.005, 16);   // fingers
      bone([sd * 0.155, -0.14, 0.0], [sd * 0.145, -1.0, 0.02], 0.02, 190);             // femur
      bone([sd * 0.14, -1.06, 0.03], [sd * 0.15, -1.86, 0.0], 0.015, 150);             // tibia
      bone([sd * 0.19, -1.08, 0.0], [sd * 0.18, -1.84, -0.02], 0.008, 70);             // fibula
      for (let t = 0; t < 4; t++) bone([sd * 0.15, -1.95, 0.0], [sd * (0.12 + t * 0.02), -2.0, 0.2], 0.006, 16);   // foot bones
      for (let i = 0, m = Math.round(150 * f); i < m; i++) {                           // iliac wing of the pelvis
        const t = r() * 3.1, rr = 0.6 + r() * 0.4; put(sd * (0.08 + Math.sin(t) * 0.12 * rr), -0.02 + Math.cos(t) * 0.1 * rr, -0.04 + (r() - .5) * 0.04, 6);
      }
    });
    for (let i = 0, m = Math.round(120 * f); i < m; i++) { const t = r() * 3.1416 + 3.1416; put(Math.cos(t) * 0.13, -0.17 + Math.sin(t) * 0.04, 0.06 + (r() - .5) * 0.03, 6); }   // pubic arch

    /* ── arteries (region 8): a tree from the heart; aNrm.x = path distance from the heart, so the shader runs a pulse along it ── */
    const VES = [];
    function path(pts, d0) { let d = d0; for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); VES.push([pts[i - 1], pts[i], d, L]); d += L; } return d; }
    const H = [0.06, 0.8, 0.07], ARCH = [0.02, 0.98, 0.02];
    const dArch = path([H, [0.05, 0.92, 0.05], ARCH], 0);
    const dBif = path([ARCH, [-0.02, 0.97, -0.05], [-0.01, 0.75, -0.07], [0, 0.35, -0.06], [0, -0.1, -0.02]], dArch);           // descending aorta
    [-1, 1].forEach(sd => {
      path([[0, -0.1, -0.02], [sd * 0.13, -0.28, 0.03], [sd * 0.16, -0.7, 0.05], [sd * 0.15, -1.04, 0.0], [sd * 0.16, -1.5, -0.02], [sd * 0.15, -1.88, 0.02], [sd * 0.15, -1.98, 0.17]], dBif);   // leg
      const dNeck = path([ARCH, [sd * 0.045, 1.12, 0.04], [sd * 0.055, 1.42, 0.05], [sd * 0.07, 1.56, 0.04]], dArch);              // carotid
      path([[sd * 0.07, 1.56, 0.04], [sd * 0.09, 1.7, 0.06], [sd * 0.04, 1.8, 0.04]], dNeck);                                     // into the brain
      path([[sd * 0.07, 1.56, 0.04], [sd * 0.11, 1.6, 0.12], [sd * 0.08, 1.68, 0.15]], dNeck);                                    // face
      const dSh = path([ARCH, [sd * 0.18, 1.06, 0.02], [sd * 0.38, 1.04, 0.0], [sd * 0.47, 0.95, 0.02]], dArch);                  // subclavian
      path([[sd * 0.47, 0.95, 0.02], [sd * 0.52, 0.7, 0.04], [sd * 0.565, 0.42, 0.05], [sd * 0.6, 0.12, 0.08], [sd * 0.625, -0.18, 0.1], [sd * 0.64, -0.38, 0.1]], dSh);   // arm
      path([[sd * 0.02, 0.6, -0.06], [sd * 0.1, 0.42, -0.03]], dArch + 0.4);                                                      // renal / gut branches
      path([[sd * 0.16, -0.7, 0.05], [sd * 0.2, -0.9, 0.06]], dBif + 0.6);
    });
    const vesL = VES.reduce((s, v) => s + v[3], 0), vesN = Math.round(3000 * f);
    for (let i = 0; i < vesN; i++) {
      let w = r() * vesL, v = VES[0]; for (let q = 0; q < VES.length; q++) { w -= VES[q][3]; if (w <= 0) { v = VES[q]; break; } }
      const t = r(), jt = j3(0.014);
      put(lerp(v[0][0], v[1][0], t) + jt[0], lerp(v[0][1], v[1][1], t) + jt[1], lerp(v[0][2], v[1][2], t) + jt[2], 8, v[2] + v[3] * t, 0, 0);
    }

    /* ── organs ── */
    function ell(cnt, c, rd, g, shell) {
      cnt = Math.round(cnt * f);
      for (let i = 0; i < cnt; i++) {
        const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, q = shell ? (0.86 + r() * 0.14) / l : Math.cbrt(r()) / l;
        put(c[0] + v[0] * q * rd[0], c[1] + v[1] * q * rd[1], c[2] + v[2] * q * rd[2], g);
      }
    }
    /* brain: folded cortex (radius wobbles with a noise of the direction = gyri) over a dimmer core, two hemispheres */
    for (let i = 0, m = Math.round(1350 * f); i < m; i++) {
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, d = [v[0] / l, v[1] / l, v[2] / l];
      if (d[1] < -0.45) continue;
      const fold = 0.9 + 0.1 * Math.sin(d[0] * 22 + Math.sin(d[1] * 17) * 2) * Math.sin(d[2] * 19 + d[1] * 9), gap = Math.abs(d[0]) < 0.06 ? 0.85 : 1;
      put(d[0] * 0.112 * fold * gap, 1.71 + d[1] * 0.1 * fold, 0.015 + d[2] * 0.128 * fold, 1);
    }
    ell(300, [0, 1.69, 0.0], [0.07, 0.06, 0.08], 1);                                    // core
    ell(160, [0, 1.585, -0.07], [0.05, 0.03, 0.04], 1);                                 // cerebellum
    /* heart: two ventricles meeting in an apex that points down-left, plus the atria */
    for (let i = 0, m = Math.round(760 * f); i < m; i++) {
      const v = [gauss(r), gauss(r), gauss(r)], l = Math.hypot(v[0], v[1], v[2]) || 1, q = Math.cbrt(r()) / l;
      let x = v[0] * q, y = v[1] * q, z = v[2] * q;
      const lobe = x > 0 ? 1 : -1;
      y = y * 0.068 + (y < 0 ? y * 0.035 : 0); x = x * 0.052 + lobe * 0.024 * (1 + Math.min(0, y) * 9); z = z * 0.05;
      const ax = x * 0.9 - y * 0.35, ay = y * 0.9 + x * 0.35;                           // tilt: apex down and to the left
      put(H[0] + ax, H[1] - 0.01 + ay, H[2] + z, 2);
    }
    ell(140, [0.03, 0.865, 0.03], [0.05, 0.03, 0.04], 2);                               // atria
    ell(700, [-0.16, 0.86, 0.01], [0.12, 0.21, 0.11], 3, true); ell(700, [0.17, 0.86, 0.01], [0.11, 0.21, 0.11], 3, true);   // lungs (shells: X-ray)
    ell(650, [0, 0.26, 0.04], [0.19, 0.16, 0.1], 4, true);                              // gut
    while (k < n) { const t = r() * 6.2832, rr = 0.5 + Math.pow(r(), 0.6) * 0.75; put(Math.cos(t) * rr, -2.08, Math.sin(t) * rr, 9); }           // floor ring
    return { pos: a, reg: reg, nrm: nrm };
  }

  /* body and wordmark sit after the six intro shapes; sway = idle turn (rad) instead of a spin */
  const BODY = { id: 'body', sc: 1, off: [0, 0, 0], rot: 0, sway: 0.32, tint: [1, 1, 1], dis: 1.3 };
  const WORD = { id: 'wordmark', sc: 3.2, off: [0, 0, 0], rot: 0, tint: [1, 1, 1], dis: 2.4 };
  const ALL = SHAPES.concat([BODY, WORD]);
  const HEART = [0.06, 0.78, 0.07];
  const angle = (S, time) => (S.yaw || 0) + (S.sway ? S.sway * Math.sin(time * 0.22) : time * S.rot);

  /* ── shaders ── */
  const VS = [
    'attribute vec3 aP0,aP1,aP2,aP3,aP4,aP5,aP6,aP7; attribute vec4 aSeed; attribute float aReg; attribute vec3 aNrm; attribute float aTag;',
    'uniform float uSeg,uSegB,uT,uTime,uPR,uDis,uScA,uScB,uAngA,uAngB,uSize;',
    'uniform vec3 uOffA,uOffB,uTintA,uTintB,uChest,uMouse,uPlanetC,uLight,uEarthC;',
    'uniform float uBeatR,uBeatAmp,uWAstro,uWPlanet,uRep,uBodyA,uBodyB,uScan,uAlert;',
    'uniform float uLit[10]; uniform float uFocus[10];',
    'varying vec3 vC; varying float vA;',
    'vec3 pick(float i){ if(i<.5) return aP0; if(i<1.5) return aP1; if(i<2.5) return aP2; if(i<3.5) return aP3; if(i<4.5) return aP4; if(i<5.5) return aP5; if(i<6.5) return aP6; return aP7; }',
    'float n3(vec3 p){ return (sin(p.x*1.7+sin(p.y*2.3)+p.z)+sin(p.y*1.9+sin(p.z*2.1)+p.x*.7)+sin(p.z*2.2+sin(p.x*1.3)+p.y*.9))/3.; }',
    'vec3 rotY(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z); }',
    'vec3 curl(vec3 p){ vec3 n=vec3(sin(p.y*1.7+uTime*.31)+sin(p.z*2.3-uTime*.17), sin(p.z*1.9+uTime*.26)+sin(p.x*2.1+uTime*.13), sin(p.x*1.6+uTime*.35)+sin(p.y*2.4-uTime*.21)); return vec3(n.y-n.z,n.z-n.x,n.x-n.y)*.5; }',
    /* Crew scene (shape 2) tags: 16..255 flag cloth at (u, v) ripples out from the pole, 1 the small Earth turns */
    'vec3 crew(vec3 p){ if(aTag>15.5){ float id=aTag-16., u=mod(id,16.)/15., v=floor(id/16.)/14.; p.z+=.022*u*(.3+.7*v)*sin(u*6.5+v*1.4-uTime*2.1); }',
    ' else if(aTag>.5){ vec3 q=p-uEarthC; float c=cos(uTime*.3),s=sin(uTime*.3); p=uEarthC+vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z); } return p; }',
    'void main(){',
    ' vec3 pa=pick(uSeg), pb=pick(uSegB);',
    ' if(abs(uSeg-2.)<.5) pa=crew(pa); if(abs(uSegB-2.)<.5) pb=crew(pb);',
    ' vec3 a=rotY(pa*uScA,uAngA)+uOffA, b=rotY(pb*uScB,uAngB)+uOffB;',
    ' float st=aSeed.w*.55+clamp(pa.y*.5+.5,0.,1.)*.30;',                          // stagger: random + height
    ' float t=clamp((uT-st*.4)/.6,0.,1.); float e=t*t*(3.-2.*t);',
    ' float wb=uBodyA*(1.-e)+uBodyB*e; int ri=int(aReg+.5);',                       // wb: how much this particle is "body" right now
    ' vec3 pos=mix(a,b,e);',
    ' pos+=curl(pos*.7+aSeed.xyz*3.)*uDis*sin(3.14159*t);',                         // dissolve peaks mid-morph
    ' pos+=curl(pos*1.3+aSeed.xyz*5.)*mix(.025,.012,wb);',                          // idle breathing
    ' if(ri==3) pos.y+=.025*sin(uTime*1.1+pos.x*2.)*wb;',                           // lungs breathe
    ' float dc=length(pos-uChest); float bw=uBeatAmp*max(uWAstro,wb)*exp(-pow((dc-uBeatR)*mix(3.5,4.,wb),2.));',   // heartbeat ripple from the chest / heart
    ' pos+=normalize(pos-uChest+vec3(1e-4))*bw*mix(.16,.09,wb);',
    ' if(ri==2) pos=uChest+(pos-uChest)*(1.+uBeatAmp*.2*wb);',                      // the heart itself pumps
    ' if(uRep>0.){ vec3 dm=pos-uMouse; float md=length(dm); pos+=normalize(dm+vec3(1e-4))*(1.-smoothstep(0.,uRep,md))*.5; }',   // mouse repel (desktop)
    ' vec4 mv=modelViewMatrix*vec4(pos,1.);',
    /* star look (intro shapes, wordmark) */
    ' vec3 base=aSeed.y<.70?vec3(.92,.95,1.):(aSeed.y<.90?vec3(.50,.66,1.):vec3(.96,.79,.48));',
    /* Earth (shape 5): land and sea use the same noise as genEarth, so continents read in green and sand against deep blue, with ice caps and white cloud */
    ' float ew=(abs(uSeg-5.)<.5?1.-e:0.)+(abs(uSegB-5.)<.5?e:0.); vec3 eq=abs(uSegB-5.)<.5?pb:pa; vec3 ed=normalize(eq+vec3(1e-5)); float elr=length(eq);',
    ' float eL=n3(ed*2.6+vec3(1.,0.,0.))+n3(ed*6.)*.25; float land=step(.12,eL); float hi=smoothstep(.2,.5,n3(ed*3.1+vec3(4.,1.,2.)));',
    ' vec3 earthC=mix(vec3(.05,.3,.95),vec3(.2,.62,1.),smoothstep(-.1,.1,eL));',
    ' earthC=mix(earthC,mix(vec3(.18,.72,.3),vec3(.85,.68,.36),hi),land);',
    ' earthC=mix(earthC,vec3(.96,.98,1.),smoothstep(.8,.92,abs(ed.y)));',
    ' float cloud=step(.82,elr); earthC=mix(earthC,vec3(1.),cloud);',
    ' vec3 cI=mix(base*mix(uTintA,uTintB,e),earthC,ew);',
    ' float aI=(.55+aSeed.z*.45)*(1.+sin(3.14159*t)*.35)*(1.+bw*5.); aI*=mix(1.,mix(.95,1.35,land)*(1.+cloud*.2),ew);',
    ' float lit=smoothstep(-.25,.65,dot(normalize(pos-uPlanetC),uLight)); aI*=mix(1.,.3+1.0*lit,uWPlanet);',   // planet terminator
    ' if(aTag>.5&&aTag<1.5){ vec3 ep=abs(uSegB-2.)<.5?pb:pa; float el=smoothstep(-.3,.45,dot(normalize(ep-uEarthC),vec3(-.62,.4,.67))); aI*=mix(1.,.12+1.1*el,uWAstro); cI=mix(cI,vec3(.5,.72,1.),.55*uWAstro); }',   // Crew: Earth half-lit, faintly blue
    /* body look: colour per region, the scan line and the focused system glow */
    /* X-ray look: translucent skin, white bones, red arteries with a pulse running out from the heart, a red beating heart, a live brain */
    ' vec3 bp=uBodyA>.5?pa:pb; float by=bp.y, li=uLit[ri], fo=uFocus[ri];',
    ' vec3 col=vec3(.5,.78,1.); float ab=.26; float sz=.8;',
    ' if(ri==1){',                                                                    // brain: folded cortex, activity waves and neurons firing
    '  float wave=.5+.5*sin(uTime*5.-length(bp-vec3(0.,1.71,.015))*45.);',
    '  float fire=step(.93,fract(sin(dot(aSeed.xy,vec2(12.98,78.23))+floor(uTime*7.+aSeed.w*7.))*43758.5));',
    '  col=mix(mix(vec3(1.,.28,.72),vec3(1.,.55,.1),uAlert*.7),vec3(.45,.95,1.),fire*.85); ab=.2+.26*wave+1.5*fire; sz=.9+.8*fire; }',
    ' else if(ri==2){ col=mix(vec3(1.,.03,.08),vec3(1.,.22,.2),uBeatAmp*.5); ab=.5*(1.+uBeatAmp*1.5); sz=1.+uBeatAmp*.3; }',   // heart: red, flashes on every beat
    ' else if(ri==3){ col=vec3(.4,.65,1.); ab=.16; sz=.8; }',
    ' else if(ri==4){ col=vec3(.4,.62,1.); ab=.16; }',
    ' else if(ri==6){ col=vec3(.86,.94,1.); ab=by>1.45?.35:.72; sz=.9; }',                    // bone
    ' else if(ri==7){ col=vec3(.98,.84,.5); ab=.6; }',
    ' else if(ri==8){',                                                               // arteries: lub and dub run from the heart to the head, hands and feet
    '  float d=aNrm.x, f1=fract(uTime-d/4.), f2=fract(uTime-.28-d/4.), pl=exp(-f1*16.)+.45*exp(-f2*16.);',
    '  col=mix(vec3(.9,.03,.07),vec3(1.,.3,.26),clamp(pl,0.,1.)); ab=.75+3.2*pl; sz=1.+1.3*pl; }',
    ' else if(ri==9){ col=vec3(.25,.82,.95); ab=.8; }',
    /* skin: bright at the silhouette (normal at right angles to the view), faint where it faces the camera */
    ' float nl=length(aNrm), rim=.55;',
    ' if(nl>.5&&ri!=8){ vec3 nw=normalize(rotY(aNrm,uBodyA>.5?uAngA:uAngB)); rim=1.-abs(dot(nw,normalize(cameraPosition-pos))); rim=.3+1.8*pow(rim,1.8); if(ri==0||ri==5||ri==7){ col=mix(col,vec3(.7,.93,1.),.35*rim); sz*=.9+.35*rim; } }',
    ' ab*=rim/.55;',
    ' ab*=(.28+.72*li)*(1.+fo*1.7)*(1.+bw*(ri==2||ri==8?1.:2.))*(1.+2.4*exp(-pow((by-uScan)/.09,2.)));',
    ' if(ri==1) ab*=1.+uAlert*.35*sin(uTime*3.2);',
    ' ab*=(.55+aSeed.z*.45)*.95;',
    ' vC=mix(cI,col,wb); vA=mix(aI,ab,wb);',
    ' gl_PointSize=clamp((.9+aSeed.z*1.7)*mix(1.,sz*(1.+fo*.5)*.72,wb)*uSize*uPR*(9./-mv.z),1.,10.);',
    ' gl_Position=projectionMatrix*mv; }'
  ].join('\n');
  const FS = [
    'precision mediump float; uniform float uBright; varying vec3 vC; varying float vA;',
    'void main(){ vec2 d=gl_PointCoord-.5; float r2=dot(d,d)*4.;',
    ' float a=exp(-r2*6.)+.12*exp(-r2*1.5);',                                        // soft gaussian core + faint halo
    ' gl_FragColor=vec4(vC*a*vA*uBright,a*vA); }'
  ].join('\n');

  /* ── public: create(scene, {tier, family}) -> engine ── */
  function create(scene, opts) {
    const tier = (opts && opts.tier) || 'high';
    const r = rng(20261008), n = N_MAX;
    const gens = [genDust, genPlanet, genAstronaut, genOrion, genRelay, genEarth];
    const shapes = gens.map(g => mortonSort(g(n, r), n));
    const body = genBody(n, rng(20261009)), bodyReg = body.reg, bodyNrm = body.nrm;
    shapes.push(mortonSort(body.pos, n, [bodyReg, bodyNrm]));
    const wordOf = fam => mortonSort(genWordmark(n, rng(99), fam), n);
    shapes.push(wordOf((opts && opts.family) || '"Space Grotesk", sans-serif'));

    /* Slot j holds sorted particle perm[j] (seeded shuffle). The Morton order is kept per shape, and any prefix
       of the slots is a uniform subsample of every shape, so drawRange(0, k) lowers the tier without rebuilding. */
    const count = n, perm = new Uint32Array(n), rp = rng(4242);
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rp() * (i + 1)), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const geo = new THREE.BufferGeometry(), attrs = [];
    function fill(arr, src) { for (let i = 0; i < count; i++) { const o = perm[i] * 3; arr[i * 3] = src[o]; arr[i * 3 + 1] = src[o + 1]; arr[i * 3 + 2] = src[o + 2]; } }
    for (let s = 0; s < 8; s++) {
      const arr = new Float32Array(count * 3); fill(arr, shapes[s]);
      const at = new THREE.BufferAttribute(arr, 3); geo.setAttribute('aP' + s, at); attrs.push(at);
    }
    const reg = new Float32Array(count);
    for (let i = 0; i < count; i++) reg[i] = bodyReg[perm[i]];
    geo.setAttribute('aReg', new THREE.BufferAttribute(reg, 1));
    const nrmA = new Float32Array(count * 3); fill(nrmA, bodyNrm);
    geo.setAttribute('aNrm', new THREE.BufferAttribute(nrmA, 3));                     // body skin normals (0 elsewhere)
    const regAt = geo.getAttribute('aReg'), nrmAt = geo.getAttribute('aNrm');
    const tagAt = new THREE.BufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aTag', tagAt);                                                   // Crew scene parts (baked astronaut.bin tags, 0 elsewhere)
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));   // required by three; unused
    const seed = new Float32Array(count * 4), rs = rng(7);
    for (let i = 0; i < count * 4; i++) seed[i] = rs();
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));

    const U = {
      uSeg: { value: 0 }, uSegB: { value: 1 }, uT: { value: 0 }, uTime: { value: 0 }, uPR: { value: 1 }, uDis: { value: 0 }, uSize: { value: 1.9 }, uBright: { value: 1.7 },
      uScA: { value: 1 }, uScB: { value: 1 }, uAngA: { value: 0 }, uAngB: { value: 0 },
      uOffA: { value: new THREE.Vector3() }, uOffB: { value: new THREE.Vector3() },
      uChest: { value: new THREE.Vector3() }, uMouse: { value: new THREE.Vector3(99, 99, 0) }, uRep: { value: 0 },
      uPlanetC: { value: new THREE.Vector3(2.6, 0, 0) }, uEarthC: { value: new THREE.Vector3(9, 9, 9) }, uLight: { value: new THREE.Vector3(-0.7, 0.4, 0.6).normalize() },
      uBeatR: { value: 9 }, uBeatAmp: { value: 0 }, uWAstro: { value: 0 }, uWPlanet: { value: 0 },
      uBodyA: { value: 0 }, uBodyB: { value: 0 }, uScan: { value: 9 }, uAlert: { value: 0 },
      uLit: { value: new Float32Array(10) }, uFocus: { value: new Float32Array(10) },
      uTintA: { value: new THREE.Vector3(1, 1, 1) }, uTintB: { value: new THREE.Vector3(1, 1, 1) }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    /* baked targets (tools/bake-particles.mjs, tools/bake-moon.mjs): Int16 x,y,z, 24k points, Morton-sorted,
       optionally followed by one Uint8 tag per point. A missing or malformed bin is ignored and the
       procedural stand-in stays, so the page never breaks. */
    const BAKED = { 2: 'astronaut', 3: 'orion', 4: 'relay', 5: 'earth' };
    Object.keys(BAKED).forEach(function (k) {
      fetch('universe/targets/' + BAKED[k] + '.bin').then(function (res) { return res.ok ? res.arrayBuffer() : Promise.reject(); }).then(function (buf) {
        if (buf.byteLength !== n * 6 && buf.byteLength !== n * 7) return;             // wrong point count: keep the fallback
        const src = new Int16Array(buf, 0, n * 3), arr = attrs[k].array;
        for (let i = 0; i < count; i++) { const o = perm[i] * 3; arr[i * 3] = src[o] / 32767; arr[i * 3 + 1] = src[o + 1] / 32767; arr[i * 3 + 2] = src[o + 2] / 32767; }
        attrs[k].needsUpdate = true;
        if (buf.byteLength === n * 7 && +k === 2) {                                   // Crew tags; the Earth turns about its own centre
          const tags = new Uint8Array(buf, n * 6), ta = tagAt.array, c = [0, 0, 0]; let ne = 0;
          for (let i = 0; i < count; i++) { ta[i] = tags[perm[i]]; if (ta[i] === 1) { ne++; for (let q = 0; q < 3; q++) c[q] += arr[i * 3 + q]; } }
          if (ne) U.uEarthC.value.set(c[0] / ne, c[1] / ne, c[2] / ne);
          tagAt.needsUpdate = true;
        }
        if (api.onChange) api.onChange();
      }).catch(function () {});
    });

    /* the Health Twin body (tools/bake-body.mjs): per point Int16 position (/8192), Int16 aNrm (/4096), Uint8 region,
       plus body.json with the anchors in that body (heart, label anchors, region heights). Missing: the procedural body stays. */
    Promise.all([
      fetch('universe/targets/body.bin').then(res => res.ok ? res.arrayBuffer() : Promise.reject()),
      fetch('universe/targets/body.json').then(res => res.ok ? res.json() : Promise.reject())
    ]).then(function (got) {
      const buf = got[0], rig = got[1];
      if (buf.byteLength !== n * 13 || !rig || !rig.heart || !rig.at) return;
      const dv = new DataView(buf), arr = attrs[6].array, na = nrmAt.array, ra = regAt.array;
      for (let i = 0; i < count; i++) {
        const o = perm[i];
        for (let c = 0; c < 3; c++) { arr[i * 3 + c] = dv.getInt16(o * 6 + c * 2, true) / 8192; na[i * 3 + c] = dv.getInt16(n * 6 + o * 6 + c * 2, true) / 4096; }
        ra[i] = dv.getUint8(n * 12 + o);
      }
      attrs[6].needsUpdate = nrmAt.needsUpdate = regAt.needsUpdate = true;
      api.bodyRig = rig;
      if (api.onChange) api.onChange();
    }).catch(function () {});

    /* intro morph windows from the scene config: into scene i = [end of hold i-1, start of hold i] */
    const S = window.ADX_SCENES;
    function windowInto(i) { return [S[i - 1].hold[1], S[i].hold[0]]; }
    function locate(p) {
      for (let i = S.length - 1; i >= 1; i--) {
        const w = windowInto(i);
        if (p > w[0]) return { seg: i - 1, t: Math.min(1, (p - w[0]) / Math.max(1e-4, w[1] - w[0])) };
      }
      return { seg: 0, t: 0 };
    }

    const heartW = new THREE.Vector3();
    const api = {
      points: points, uniforms: U, count: count, onChange: null, weights: [0, 0, 0, 0, 0, 0, 0, 0], drawn: n,
      BODY: 6, WORD: 7,
      bodyRig: { heart: HEART, at: null, centers: null },                              // replaced by body.json when the baked body loads
      /* lower / raise the particle count without rebuilding; dimmer-per-point is compensated a little */
      setTier: function (t) {
        const k = Math.min(TIER_N[t] || n, n);
        geo.setDrawRange(0, k);
        U.uBright.value = 1.7 * Math.pow(n / k, 0.3); U.uSize.value = 1.9 * Math.pow(n / k, 0.15);
        api.drawn = k;
      },
      /* morph shape a -> b by t (0..1). overA / overB override a shape's scale / offset (the wordmark rises and shrinks) */
      set: function (a, b, t, time, overA, overB) {
        const A = overA ? Object.assign({}, ALL[a], overA) : ALL[a], B = overB ? Object.assign({}, ALL[b], overB) : ALL[b];
        U.uSeg.value = a; U.uSegB.value = b; U.uT.value = t; U.uTime.value = time;
        U.uScA.value = A.sc; U.uScB.value = B.sc; U.uAngA.value = angle(A, time); U.uAngB.value = angle(B, time);
        U.uOffA.value.set(A.off[0], A.off[1], A.off[2]); U.uOffB.value.set(B.off[0], B.off[1], B.off[2]);
        U.uTintA.value.set(A.tint[0], A.tint[1], A.tint[2]); U.uTintB.value.set(B.tint[0], B.tint[1], B.tint[2]);
        U.uDis.value = a === b ? 0 : B.dis;
        /* shape weights 0..1 (how much of each shape is on screen), shared with fx.js */
        const e = t * t * (3 - 2 * t), w = api.weights;
        for (let k = 0; k < 8; k++) w[k] = (k === a ? 1 - e : 0) + (k === b ? e : 0);
        U.uWAstro.value = w[2]; U.uWPlanet.value = w[1];
        U.uBodyA.value = a === 6 ? 1 : 0; U.uBodyB.value = b === 6 ? 1 : 0;
        /* heartbeat: one pulse a second (lub, then a softer dub), ripple radius grows from the chest / heart */
        const ph = time % 1, dub = (time + 0.72) % 1, isBody = a === 6 || b === 6;
        if (isBody) { const g = angle(BODY, time), c = Math.cos(g), s = Math.sin(g), h = api.bodyRig.heart; U.uChest.value.copy(heartW.set(c * h[0] + s * h[2], h[1], -s * h[0] + c * h[2])); }
        else { const A2 = ALL[2], g = angle(A2, time), c = Math.cos(g), s = Math.sin(g), q = A2.chest.map(v => v * A2.sc);   // the astronaut's chest, following its sway
          U.uChest.value.set(c * q[0] + s * q[2] + A2.off[0], q[1] + A2.off[1], -s * q[0] + c * q[2] + A2.off[2]); }
        U.uBeatR.value = ph * (isBody ? 1.7 : 2.4);
        U.uBeatAmp.value = Math.max(0, 1 - ph * 1.6) * 0.9 + Math.max(0, 1 - dub * 3) * 0.25 * (dub < 0.33 ? 1 : 0);
      },
      /* the intro: p (0..1) -> intro shape pair + t, a pure function of p */
      setProgress: function (p, time) { const L = locate(p); api.set(L.seg, L.seg + 1, L.t, time); },
      /* body turn at `time` (the Health Twin leader lines follow it) */
      bodyAngle: time => angle(BODY, time),
      /* the wordmark is sampled from a canvas: redraw it once the display font has loaded */
      setWordFont: function (fam) { fill(attrs[7].array, wordOf(fam)); attrs[7].needsUpdate = true; if (api.onChange) api.onChange(); },
      dispose: function () { scene.remove(points); geo.dispose(); mat.dispose(); }
    };
    api.setTier(tier);
    return api;
  }

  window.ADX_ENGINE = { create: create, SHAPES: ALL };
})();
