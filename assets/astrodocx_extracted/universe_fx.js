/* ============================================================
   ASTRODOCX — UNIVERSE INTRO · P3 scene effects (plan §12.2)
   Extra small Points systems, each driven only by (progress, time)
   and the engine's scene weights, so they are as reversible as the
   morph itself.
     03  ECG line made of particles across the lunar foreground
     04  engine trail streaming back from the Orion engine
     05  small far Earth + data packets (satellite -> Earth along an arc)
   (heartbeat ripple, mouse repel and planet shading live in engine.js)
============================================================ */
(function () {
  'use strict';
  const CYAN = [0.13, 0.83, 0.93];

  const VS =
    'attribute vec4 aSeed; attribute float aT; uniform float uTime,uPR,uW,uKind,uHead; uniform vec3 uA,uB,uC; varying float vA; varying vec3 vC;' +
    'void main(){ vec3 p=position; float a=1.;' +
    ' if(uKind<.5){ p=position; float d=uHead-aT; a=(d>0.&&d<.9)?pow(1.-d/.9,1.3):.0; a+=.08; }' +                         // ECG: bright head, fading tail
    ' else if(uKind<1.5){ float life=fract(uTime*.55+aSeed.x); p=vec3(uA.x-life*3.2*(.6+aSeed.y*.8), uA.y, uA.z);' +       // engine trail: streams back (-x), spreads
    '   float sp=.05+life*.34; p.y+=(aSeed.z-.5)*sp*2.; p.z+=(aSeed.w-.5)*sp*2.; a=(1.-life)*(1.-life); }' +
    ' else if(uKind<2.5){ float tt=fract(uTime*.28+aSeed.x*.22+aT); vec3 m=(uA+uB)*.5+vec3(0.,1.7,0.);' +                    // packets: quadratic arc A -> C(m) -> B
    '   p=(1.-tt)*(1.-tt)*uA+2.*(1.-tt)*tt*m+tt*tt*uB; p+=(aSeed.yzw-.5)*.09; a=sin(3.14159*tt); }' +
    ' else { p=position; a=.55; }' +                                                                                       // far Earth
    ' vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=clamp((.9+aSeed.y*1.6)*uPR*(9./-mv.z)*(uKind>1.5&&uKind<2.5||uKind<.5?2.4:1.7),1.,12.);' +
    ' vA=a*uW; vC=vec3(' + CYAN.join(',') + '); if(uKind>=1.5&&uKind<2.5) vC=mix(vC,vec3(.9,1.,1.),.5); if(uKind>2.5) vC=vec3(.45,.65,1.);' +
    ' if(uKind>.5&&uKind<1.5) vC=vec3(.75,.88,1.);' +
    ' gl_Position=projectionMatrix*mv; }';
  const FS =
    'precision mediump float; varying float vA; varying vec3 vC;' +
    'void main(){ vec2 d=gl_PointCoord-.5; float r2=dot(d,d)*4.; float a=exp(-r2*6.)+.14*exp(-r2*1.5); gl_FragColor=vec4(vC*a*vA*1.6,a*vA); }';

  function system(scene, n, kind, fill) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), seed = new Float32Array(n * 4), t = new Float32Array(n);
    for (let i = 0; i < n * 4; i++) seed[i] = Math.random();
    if (fill) fill(pos, t, n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    const U = { uTime: { value: 0 }, uPR: { value: 1 }, uW: { value: 0 }, uKind: { value: kind }, uHead: { value: 0 },
      uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() } };
    const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
    return { pts: pts, U: U, pos: pos, geo: g };
  }

  /* ECG shape: baseline, P bump, QRS spike, T bump; x in 0..1 per beat */
  function ecg(x) {
    const b = (c, w, h) => h * Math.exp(-Math.pow((x - c) / w, 2));
    return b(0.18, 0.035, 0.12) - b(0.37, 0.012, 0.14) + b(0.40, 0.012, 1.0) - b(0.43, 0.012, 0.28) + b(0.66, 0.05, 0.22);
  }

  function create(scene, engine) {
    const S = engine.uniforms, W = engine.weights;
    const ecgN = 360, ECG_X = -3.6, ECG_Y = -3.28, ECG_Z = 2.6, ECG_LEN = 3.2;
    const E = system(scene, ecgN, 0, function (pos, t, n) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), beats = 2.2, ph = (u * beats) % 1;
        pos[i * 3] = ECG_X - ECG_LEN / 2 + u * ECG_LEN; pos[i * 3 + 1] = ECG_Y + ecg(ph) * 0.42; pos[i * 3 + 2] = ECG_Z; t[i] = u;
      }
    });
    const T = system(scene, 900, 1);
    T.U.uA.value.set(-0.24, 0.2, 0);                       // Orion engine bell: offset 2.0 + (-0.55 - 0.28) * scale 2.7 (engine.js SHAPES; Orion does not spin)
    const earthN = 700;
    const FE = system(scene, earthN, 3, function (pos) {
      for (let i = 0; i < earthN; i++) { const y = 1 - (i + .5) / earthN * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996; pos[i * 3] = 2.4 + Math.cos(th) * r * 0.9; pos[i * 3 + 1] = -1.4 + y * 0.9; pos[i * 3 + 2] = -4 + Math.sin(th) * r * 0.9; }
    });
    const PK = system(scene, 160, 2, function (pos, t, n) { for (let i = 0; i < n; i++) t[i] = Math.floor(i / 40) / 4; });   // 4 bursts of 40
    PK.U.uA.value.set(-2.0, 0.55, 0); PK.U.uB.value.set(2.1, -1.2, -3.2);          // relay dish -> far Earth

    const all = [E, T, FE, PK];
    const sm = (x) => x * x * (3 - 2 * x);
    return {
      setPR: function (pr) { all.forEach(s => { s.U.uPR.value = pr; }); },
      update: function (time) {
        const wAstro = W[2], wOrion = W[3], wRelay = W[4];
        E.U.uW.value = sm(wAstro); E.pts.visible = wAstro > 0.01; E.U.uHead.value = (time * 0.42) % 1.5;     // head sweeps, tail fades; pause beyond 1 for a beat
        T.U.uW.value = sm(wOrion); T.pts.visible = wOrion > 0.01; T.U.uTime.value = time;
        FE.U.uW.value = sm(wRelay); FE.pts.visible = wRelay > 0.01;
        PK.U.uW.value = sm(wRelay); PK.pts.visible = wRelay > 0.01; PK.U.uTime.value = time;
      },
      dispose: function () { all.forEach(s => { scene.remove(s.pts); s.geo.dispose(); s.pts.material.dispose(); }); }
    };
  }
  window.ADX_FX = { create: create };
})();
