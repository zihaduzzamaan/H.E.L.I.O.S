/* ============================================================
   ASTRODOCX — shared starfield (intro, Health Twin, AstroDocX reveal)
   Three depth layers of twinkling white / blue / gold stars, additive,
   at most 35% of the main particle brightness. Built at the top count;
   lower tiers just draw a prefix. One module so every WebGL section
   has the exact same sky.
============================================================ */
(function () {
  'use strict';
  const COUNTS = { high: [3000, 1500, 600], mid: [2200, 1100, 450], low: [1500, 750, 300] };
  const RADII = [[28, 60], [18, 40], [10, 26]];                               // far, mid, near shells

  const VS =
    'attribute vec4 aSeed; uniform float uTime, uPR, uLayer; varying float vA; varying vec3 vC;' +
    'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);' +
    ' float tw = .7 + .3 * sin(uTime * (.4 + aSeed.x * 1.6) + aSeed.y * 6.2831);' +
    ' gl_PointSize = clamp((1.1 + aSeed.z * 2.2) * uPR * (320.0 / -mv.z) * (.6 + uLayer * .25), 1.0, 7.0);' +
    ' vA = tw * (.35 + aSeed.z * .65);' +
    ' vC = aSeed.w < .7 ? vec3(.92,.95,1.) : (aSeed.w < .92 ? vec3(.5,.66,1.) : vec3(.96,.79,.48));' +
    ' gl_Position = projectionMatrix * mv; }';
  const FS =
    'precision mediump float; uniform float uBright; varying float vA; varying vec3 vC;' +
    'void main(){ vec2 d = gl_PointCoord - .5; float r2 = dot(d,d) * 4.0;' +
    ' float a = exp(-r2 * 5.0) + .15 * exp(-r2 * 1.6);' +
    ' gl_FragColor = vec4(vC * a * vA * uBright * 2.4, a * vA); }';

  function create(scene, opts) {
    let tier = (opts && opts.tier) || 'high';
    const U = { uTime: { value: 0 }, uPR: { value: 1 }, uBright: { value: 0.35 } };
    const layers = [];
    COUNTS.high.forEach((n, li) => {
      const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const r = RADII[li][0] + Math.random() * (RADII[li][1] - RADII[li][0]);
        pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u * 0.7; pos[i * 3 + 2] = r * s * Math.sin(th) - 8;
        seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      const m = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uLayer: { value: li } }, U), vertexShader: VS, fragmentShader: FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false;
      scene.add(pts); layers.push(pts);
    });
    function range() { layers.forEach((l, li) => l.geometry.setDrawRange(0, COUNTS[tier][li])); }
    range();
    return {
      setTime: t => { U.uTime.value = t; },
      setPR: pr => { U.uPR.value = pr; },
      setBright: b => { U.uBright.value = b; },
      setTier: t => { tier = COUNTS[t] ? t : 'low'; range(); },
      dispose: () => layers.forEach(l => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); })
    };
  }
  window.ADX_STARS = { create: create };
})();
