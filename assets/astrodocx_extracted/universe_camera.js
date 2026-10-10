/* ============================================================
   ASTRODOCX — UNIVERSE INTRO · P3 camera path (plan §12.6)
   One key per scene on a Catmull-Rom curve (position and look-at),
   so the motion is smooth by construction and exactly reversible:
   camera state is a pure function of progress p. FOV has its own
   keys (the "kick" in scene 04). No shake, no roll.
============================================================ */
(function () {
  'use strict';
  /* p = where the key sits, pos / look in world units (shapes sit at x = +-2..2.6, see engine.js SHAPES) */
  const KEYS = [
    { p: 0.00, pos: [0, 0, 14],        look: [0, 0, 0],        fov: 50 },   // 01 far, slow approach
    { p: 0.08, pos: [0, 0, 10.5],      look: [0, 0, 0],        fov: 50 },
    { p: 0.23, pos: [-1.4, 0.5, 9],    look: [1.6, 0, 0],      fov: 50 },   // 02 gentle orbit past the planet
    { p: 0.34, pos: [-0.6, 0.2, 9.4],  look: [0.2, 0, 0],      fov: 50 },
    { p: 0.45, pos: [1.6, 1.1, 8],     look: [-1.6, 0.1, 0],   fov: 50 },   // 03 3/4 side angle, a little above (the Moon reads as ground)
    { p: 0.56, pos: [0.3, -0.3, 9],    look: [0, 0, 0],        fov: 52 },
    { p: 0.65, pos: [-3.4, 0.7, 8],    look: [1.6, 0.1, 0],    fov: 57 },   // 04 trailing chase, FOV kick
    { p: 0.735, pos: [-1.0, 0.3, 9],   look: [0, 0, 0],        fov: 52 },
    { p: 0.82, pos: [2.2, 0.9, 7.8],   look: [-1.6, -0.1, 0],  fov: 50 },   // 05 around the relay, Earth behind
    { p: 0.90, pos: [0.8, 0.5, 8.6],   look: [0, -0.4, 0],     fov: 50 },
    { p: 0.93, pos: [0, 0.3, 9.4],     look: [0, -0.7, 0],     fov: 50 },   // 06 slow push-in on Earth, then the Health Twin
    { p: 1.00, pos: [0, 0.2, 7.2],     look: [0, -0.8, 0],     fov: 48 }
  ];

  const V = a => new THREE.Vector3(a[0], a[1], a[2]);
  let posC = null, lookC = null;
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3();

  function build() {
    posC = new THREE.CatmullRomCurve3(KEYS.map(k => V(k.pos)), false, 'catmullrom', 0.5);
    lookC = new THREE.CatmullRomCurve3(KEYS.map(k => V(k.look)), false, 'catmullrom', 0.5);
  }

  /* p -> {pos, look, fov}; key index + local fraction (smoothstepped so velocity is 0 at every key) */
  function at(p) {
    if (!posC) build();
    p = p < 0 ? 0 : p > 1 ? 1 : p;
    let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1], f = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))), s = f * f * (3 - 2 * f);
    const u = (i + s) / (KEYS.length - 1);
    posC.getPoint(u, tmpP); lookC.getPoint(u, tmpL);
    return { pos: tmpP, look: tmpL, fov: a.fov + (b.fov - a.fov) * s };
  }
  window.ADX_CAMERA = { at: at, KEYS: KEYS };
})();
