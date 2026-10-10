/* ============================================================
   ASTRODOCX — THE JOURNEY (#journey): the whole landing page
   One WebGL canvas, one starfield, one particle system. The three
   chapters (#universe intro, #twin Health Twin, #astrodocx) are
   layers inside one pinned section, and the same 24k particles are
   born as stardust, become the planet, astronaut, Orion, relay and
   Earth, gather into the Health Twin body and end as the ASTRODOCX
   wordmark. Chapter lengths: ADX_FLOW (scenes.js).

   One master value g (0..1, scroll-scrubbed) drives everything,
   as a pure function: particles, camera, chapter text. Fast
   scrolling, reversing and jumping can never break it.

   Modes (gsap.matchMedia):
     live     pinned, scrubbed (phones: shorter, low tier)
     static   prefers-reduced-motion or no WebGL: no pin, the three
              sections stack as normal page sections

   The RAF loop runs only while the journey is on screen and the
   tab is visible.
============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const journey = document.getElementById('journey');
  const root    = document.getElementById('universe');
  const twinEl  = document.getElementById('twin');
  const adxEl   = document.getElementById('astrodocx');
  const SCENES = window.ADX_SCENES, FLOW = window.ADX_FLOW;
  if (!journey || !root || !SCENES || !FLOW || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  const canvas  = document.getElementById('adxSky');
  const textBox = root.querySelector('.uni-text');
  const rail    = root.querySelector('.uni-rail');
  const skip    = root.querySelector('.uni-skip');
  const hint    = root.querySelector('.uni-hint');
  const REDUCE  = window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]reduce=1\b/.test(location.search);   // ?reduce=1 forces the static path for QA
  const clamp   = (v, a, b) => v < a ? a : v > b ? b : v;
  const sm      = t => t * t * (3 - 2 * t);
  const END_P   = SCENES[SCENES.length - 1].hold[0];          // the last intro scene (Earth) starts here; the nav comes back
  const mid     = s => (s.hold[0] + s.hold[1]) / 2;
  const small   = () => window.innerWidth <= 900;
  const twinUI  = window.ADX_TWIN_UI ? ADX_TWIN_UI.create(twinEl) : null;
  const adxUI   = window.ADX_REVEAL_UI ? ADX_REVEAL_UI.create(adxEl) : null;

  /* A reload with the browser's restored scroll makes ScrollTrigger measure the pin while already scrolled.
     The journey restarts at the top instead; deep links keep their hash. */
  if (!REDUCE && !location.hash) {
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }

  /* ── 1. flow: chapter starts / lengths in vh %, phone or desktop ── */
  let flow = null, total = 0;
  function buildFlow() {
    let at = 0;
    flow = FLOW.map(c => { const len = c.len[small() ? 1 : 0], o = { id: c.id, start: at, len: len }; at += len; return o; });
    total = at;
  }
  buildFlow();
  /* g (0..1) -> { id, q } with q the chapter's own progress */
  function chapterAt(g) {
    const u = clamp(g, 0, 1) * total;
    for (let i = flow.length - 1; i >= 0; i--) if (u >= flow[i].start || i === 0) return { id: flow[i].id, q: clamp((u - flow[i].start) / flow[i].len, 0, 1) };
  }
  const gOf = (id, q) => { const c = flow.find(f => f.id === id); return c ? (c.start + c.len * clamp(q, 0, 1)) / total : 0; };

  /* ── 2. intro DOM: scene text (real <h2>/<p>, so SEO + screen readers get the story) ── */
  const sceneEls = SCENES.map((s, i) => {
    const el = document.createElement('article');
    el.className = 'uni-scene';
    el.dataset.pos = s.pos;
    el.setAttribute('aria-labelledby', 'uniH' + i);
    el.innerHTML =
      '<span class="ch-no">' + String(i + 1).padStart(2, '0') + ' / ' + String(SCENES.length).padStart(2, '0') + '</span>' +
      '<h2 class="ch-title" id="uniH' + i + '">' + s.head.map(l => '<span>' + l + '</span>').join('') + '</h2>' +
      '<p class="ch-sub">' + s.sub + '</p>';
    textBox.appendChild(el);
    return el;
  });

  /* progress rail: one tick per scene, scene name on hover, click = jump to that hold */
  const ticks = SCENES.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'uni-tick';
    b.setAttribute('aria-label', 'Go to scene ' + (i + 1) + ': ' + s.name);
    b.innerHTML = '<i></i><b>' + s.name + '</b>';
    b.addEventListener('click', () => scrollToG(gOf('intro', mid(s))));
    li.appendChild(b); rail.appendChild(li);
    return b;
  });

  /* ── 3. intro text for intro progress p (pure function) ── */
  const FADE = 0.025;
  let current = -1, wasEnd = false;
  function applyText(p) {
    let best = 0, bi = 0;
    SCENES.forEach((s, i) => {
      const a = s.hold[0], b = s.hold[1];
      const prev = SCENES[i - 1], next = SCENES[i + 1];
      /* fade inside the morph window; scenes that abut (no gap) fade inside their own hold so two never overlap */
      const inStart  = prev && a - prev.hold[1] < FADE * 2 ? a : a - FADE;
      const outEnd   = next && next.hold[0] - b < FADE * 2 ? b : b + FADE;
      const vIn  = i === 0 ? 1 : clamp((p - inStart) / FADE, 0, 1);            // first scene is visible at p = 0
      const vOut = i === SCENES.length - 1 ? 1 : clamp((outEnd - p) / FADE, 0, 1);
      const v = Math.min(vIn, vOut), el = sceneEls[i];
      el.style.opacity = v.toFixed(3);
      el.style.visibility = v > 0.01 ? 'visible' : 'hidden';
      el.classList.toggle('is-on', v > 0.5);
      const k = (p < (a + b) / 2 ? 1 : -1) * 18 * (1 - v) * (i === 0 ? 0 : 1);         // enter from below, exit upward
      el.style.translate = '0 ' + k.toFixed(1) + 'px';
      if (v > best) { best = v; bi = i; }
    });
    if (bi !== current) {
      current = bi;
      ticks.forEach((t, i) => { t.classList.toggle('is-current', i === bi); if (i === bi) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    }
    const inEnd = p >= END_P - 0.005;
    if (inEnd !== wasEnd) wasEnd = inEnd;
    skip.classList.toggle('is-hidden', inEnd);
    hint.classList.toggle('is-hidden', p > 0.02);
  }

  /* chapter layers: only the chapter(s) on screen are visible (and clickable) */
  const layerV = { intro: -1, twin: -1, adx: -1 };
  function layer(el, key, v) {
    if (Math.abs(layerV[key] - v) < 0.001) return;
    layerV[key] = v;
    el.style.opacity = v.toFixed(3);
    el.style.visibility = v > 0.01 ? 'visible' : 'hidden';
  }
  function applyChapters(c) {
    const q = c.q;
    layer(root, 'intro', c.id === 'intro' ? 1 : c.id === 'toTwin' ? 1 - sm(clamp(q / 0.4, 0, 1)) : 0);
    layer(twinEl, 'twin', c.id === 'twin' ? 1 : c.id === 'toTwin' ? sm(clamp((q - 0.55) / 0.45, 0, 1)) : c.id === 'toAdx' ? 1 - sm(clamp(q / 0.4, 0, 1)) : 0);
    layer(adxEl, 'adx', c.id === 'adx' || (c.id === 'toAdx' && q > 0.5) ? 1 : 0);
    applyText(c.id === 'intro' ? q : 1);
  }

  /* ── 4. WebGL: one renderer, starfield, particle engine, intro effects ── */
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  let tier = (small() || lowEnd) ? 'low' : 'high';
  const DPR = { high: 1.75, mid: 1.5, low: 1.25 };
  const NEXT_TIER = { high: 'mid', mid: 'low' };

  let staticMode = false, posterT = 0;
  let renderer = null, scene, camera, stars = null, webgl = false, engine = null, fx = null;
  if (!REDUCE) {
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); webgl = true; }
    catch (e) { webgl = false; }
  }

  function setTier(t) {
    tier = t; if (stars) stars.setTier(t);
    if (engine) engine.setTier(t);
    resize();
  }

  if (webgl) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 0, 14);
    renderer.setClearColor(0x02030a, 1);
    stars = ADX_STARS.create(scene, { tier: tier });
    stars.setBright(0.4);
    engine = ADX_ENGINE.create(scene, { tier: tier });
    engine.onChange = () => { if (staticMode) schedulePosters(); else if (!running) renderOnce(); };
    fx = ADX_FX.create(scene, engine);
    /* the wordmark is drawn with the display font: redraw it once that font is in */
    if (document.fonts && document.fonts.load) document.fonts.load('700 190px "Space Grotesk"').then(() => engine.setWordFont('"Space Grotesk", sans-serif')).catch(() => {});
  }

  function resize() {
    if (!webgl) return;
    const w = journey.clientWidth || window.innerWidth, h = journey.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR[tier]);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    stars.setPR(dpr); engine.uniforms.uPR.value = dpr; fx.setPR(dpr);
  }

  /* ── 5. camera: the intro's Catmull-Rom path, then a fixed framing per chapter, blended across the morphs ── */
  const V3 = () => new THREE.Vector3();
  const camA = { pos: V3(), look: V3(), fov: 50 }, camB = { pos: V3(), look: V3(), fov: 50 }, cam = { pos: V3(), look: V3(), fov: 50 };
  const pullK = () => camera.aspect < 1.2 ? Math.min(2.4, 1.2 / camera.aspect) : 1;       // portrait: pull back so every shape and the wordmark fit
  function camIntro(p, o) {
    const c = ADX_CAMERA.at(p), k = pullK(); o.look.copy(c.look); o.pos.copy(c.pos).sub(c.look).multiplyScalar(k).add(c.look); o.fov = c.fov;
    if (k > 1 && engine) { const dx = (ADX_ENGINE.SHAPES[2].off[0] - o.look.x) * engine.weights[2]; o.look.x += dx; o.pos.x += dx; }   // portrait: the Crew scene is wider than the screen, centre on it
    return o;
  }
  function camTwin(o) { const k = small() ? 1.25 : 1; o.pos.set(0, 0.05, 6.4 * k); o.look.set(0, small() ? -0.35 : 0.0, 0); o.fov = 48; return o; }   // close enough that the figure fills the height
  function camAdx(o) { const k = pullK(); o.pos.set(0, 0.2, 9 * k); o.look.set(0, 0.2, 0); o.fov = 50; return o; }
  function blend(a, b, t, o) { o.pos.copy(a.pos).lerp(b.pos, t); o.look.copy(a.look).lerp(b.look, t); o.fov = a.fov + (b.fov - a.fov) * t; return o; }

  let mx = 0, my = 0, mouseSeen = false;
  const repelOn = !REDUCE && !small() && window.matchMedia('(pointer: fine)').matches;
  if (!REDUCE && !small()) {
    window.addEventListener('mousemove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; mouseSeen = true; }, { passive: true });
  }
  const mouseW = V3(), rayV = V3();
  function placeCamera(c) {
    camera.position.copy(c.pos);
    camera.position.x += mx * 0.35; camera.position.y += -my * 0.25;               // <= 1.5 deg of mouse parallax on desktop
    camera.lookAt(c.look);
    camera.rotation.y += -mx * 0.026; camera.rotation.x += -my * 0.026;
    if (Math.abs(camera.fov - c.fov) > 0.01) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    /* mouse repel: ray through the cursor hits the z = 0 plane (desktop only) */
    if (repelOn && mouseSeen) {
      rayV.set(mx * 2, -my * 2, 0.5).unproject(camera).sub(camera.position).normalize();
      mouseW.copy(camera.position).addScaledVector(rayV, -camera.position.z / rayV.z);
      engine.uniforms.uMouse.value.copy(mouseW); engine.uniforms.uRep.value = 0.6;
    } else engine.uniforms.uRep.value = 0;
  }

  /* ── 6. the whole state for g (0..1) at `time` ── */
  function render(g, time) {
    const c = chapterAt(g), q = c.q;
    stars.setTime(time);
    if (c.id === 'intro') { engine.setProgress(q, time); placeCamera(camIntro(q, cam)); }
    else if (c.id === 'toTwin') { engine.set(5, 6, q, time); placeCamera(blend(camIntro(1, camA), camTwin(camB), sm(q), cam)); }
    else if (c.id === 'twin') { engine.set(6, 6, 0, time); placeCamera(camTwin(cam)); }
    else if (c.id === 'toAdx') { engine.set(6, 7, q, time, null, adxUI.word(0)); placeCamera(blend(camTwin(camA), camAdx(camB), sm(q), cam)); }
    else { const w = adxUI.word(q); engine.set(7, 7, 0, time, w, w); placeCamera(camAdx(cam)); }
    if (twinUI && (c.id === 'toTwin' || c.id === 'twin' || c.id === 'toAdx')) twinUI.update(engine, camera, c.id === 'toTwin' ? 0.2 * q : c.id === 'twin' ? 0.2 + 0.8 * q : 1, time);
    if (adxUI && (c.id === 'adx' || c.id === 'toAdx')) adxUI.update(c.id === 'adx' ? q : 0);
    fx.update(time);
    renderer.render(scene, camera);
  }

  /* ── 7. loop (render only while on screen and visible) ── */
  let P = 0, targetP = 0, onScreen = false, running = false, lastT = 0, frames = 0, dtAvg = 16, slowMs = 0;
  function frame(time) {
    if (!onScreen || document.hidden || staticMode) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = lastT ? Math.min(100, time - lastT) : 16; lastT = time;
    /* adaptive tier: frame time above 22 ms (smoothed) for 2 s drops one tier (high -> mid -> low), never back up */
    if (++frames > 45 && NEXT_TIER[tier]) {
      slowMs = (dtAvg = dtAvg * 0.9 + dt * 0.1) > 22 ? slowMs + dt : 0;
      if (slowMs > 2000) { slowMs = 0; setTier(NEXT_TIER[tier]); }
    }
    P += (targetP - P) * (1 - Math.exp(-dt / 90));
    if (Math.abs(targetP - P) < 0.0002) P = targetP;
    render(P, time * 0.001);
  }
  function start() { if (webgl && !staticMode && !running && onScreen && !document.hidden) { running = true; lastT = 0; requestAnimationFrame(frame); } }
  function renderOnce() { if (webgl && !staticMode) render(P, 3); }

  new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) start(); }, { rootMargin: '80px 0px' }).observe(journey);
  document.addEventListener('visibilitychange', start);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; webgl = false; journey.classList.add('no-webgl'); });

  let rT, wasSmall = small();
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => {
    if (small() !== wasSmall) { wasSmall = small(); buildFlow(); if (st) ScrollTrigger.refresh(); }   // phone / desktop chapter lengths
    resize(); if (!running) renderOnce();
  }, 120); }, { passive: true });

  /* ── cursor: reuse the site cursor, add a label over [data-cursor] elements ── */
  const ring = document.getElementById('cursor-ring');
  skip.dataset.cursor = 'SKIP';
  if (ring) journey.querySelectorAll('[data-cursor]').forEach(el => {
    el.addEventListener('mouseenter', () => { ring.dataset.label = el.dataset.cursor; ring.classList.add('has-label'); });
    el.addEventListener('mouseleave', () => ring.classList.remove('has-label'));
  });

  /* ── 8. scroll: one pin for the whole journey ── */
  let st = null;
  const yAtG = g => st ? st.start + (st.end - st.start) * clamp(g, 0, 1) : 0;
  function scrollToG(g, instant) { if (st) window.scrollTo({ top: yAtG(g), behavior: REDUCE || instant ? 'auto' : 'smooth' }); }
  /* where each section's link lands: the twin once the scan has lit the body, AstroDocX once its content is in */
  const ANCHOR = { universe: ['intro', 0], twin: ['twin', 0.14], astrodocx: ['adx', 0.62] };
  function goTo(id, instant) {
    const a = ANCHOR[id];
    if (!a) return false;
    if (st) { scrollToG(gOf(a[0], a[1]), instant); return true; }
    const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: REDUCE || instant ? 'auto' : 'smooth' });
    return true;
  }
  skip.addEventListener('click', e => { e.preventDefault(); goTo('twin'); });
  /* nav / footer links to the three sections scroll to their place in the journey */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !st) return;
    const id = a.getAttribute('href').slice(1);
    if (ANCHOR[id]) { e.preventDefault(); goTo(id); if (history.replaceState) history.replaceState(null, '', '#' + id); }
  });

  /* ── static mode (reduced motion, or no WebGL): no pin, the three sections stack; with WebGL each intro
        scene gets a poster rendered once from the real engine (shape fully formed) as its background ── */
  function drawPosters() {
    if (!webgl || !engine) return;
    const W = 1280, H = 720;
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    stars.setPR(1); engine.uniforms.uPR.value = 1; fx.setPR(1);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    mx = my = 0;
    SCENES.forEach((s, i) => {
      const p = mid(s);
      engine.setProgress(p, 3); placeCamera(camIntro(p, cam)); fx.update(3);
      renderer.render(scene, camera);
      try { sceneEls[i].style.setProperty('--poster', 'url(' + canvas.toDataURL('image/jpeg', 0.82) + ')'); sceneEls[i].classList.add('has-poster'); } catch (e) {}
    });
  }
  function schedulePosters() { clearTimeout(posterT); posterT = setTimeout(drawPosters, 250); }
  function enterStatic() {
    staticMode = true;
    journey.classList.add('is-static'); journey.classList.remove('is-live');
    root.classList.add('is-static');
    [root, twinEl, adxEl].forEach(el => { el.style.opacity = ''; el.style.visibility = ''; });
    sceneEls.forEach(el => { el.style.cssText = ''; });
    if (twinUI) twinUI.makeStatic();
    if (adxUI) adxUI.makeStatic(REDUCE);
    if (webgl) (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(schedulePosters);
  }

  if (REDUCE || !webgl) enterStatic();
  else {
    journey.classList.add('is-live');
    adxEl.classList.add('is-particle');
    resize();
    st = ScrollTrigger.create({
      trigger: journey, start: 'top top', end: () => '+=' + (total / 100 * window.innerHeight),
      pin: true, pinSpacing: true, anticipatePin: 1, scrub: 0.8,
      onUpdate: self => { targetP = self.progress; applyChapters(chapterAt(self.progress)); if (!running) { P = targetP; renderOnce(); } }
    });
    applyChapters(chapterAt(0));
    renderOnce();
    requestAnimationFrame(() => ScrollTrigger.refresh());
    start();
    /* deep link (#twin, #astrodocx) or ?skip=1 -> its place in the journey once the layout is final */
    const hashId = location.hash.slice(1), skipQ = /[?&]skip=1\b/.test(location.search);
    if (ANCHOR[hashId] || skipQ) window.addEventListener('load', () => setTimeout(() => { ScrollTrigger.refresh(); goTo(skipQ ? 'twin' : hashId, true); }, 80), { once: true });
  }

  window.ADX_JOURNEY = {
    get live() { return !!st; },
    /* where the journey is right now: { id, q } of the smoothed progress (sound.js follows it).
       Static mode: the section in the middle of the screen, q = how far through it */
    state: () => {
      if (st) return chapterAt(P);
      const mid = innerHeight / 2, ids = [['intro', root], ['twin', twinEl], ['adx', adxEl]];
      for (const [id, el] of ids) { const r = el.getBoundingClientRect(); if (r.bottom > mid) return { id: id, q: clamp((mid - r.top) / Math.max(1, r.height), 0, 1) }; }
      return { id: 'adx', q: 1 };
    },
    /* the section the visitor is in (for the nav's active link) */
    section: () => {
      if (!st) return null;
      const id = chapterAt((window.scrollY - st.start) / Math.max(1, st.end - st.start)).id;
      return id === 'intro' ? 'universe' : id === 'toTwin' || id === 'twin' ? 'twin' : 'astrodocx';
    },
    /* for tour.js: pixel position of chapter progress, and the stops with how long to dwell (s) */
    yAt: (id, q) => yAtG(gOf(id, q)),
    get end() { return st ? st.end : 0; },
    stops: () => {
      const out = SCENES.map(s => ({ id: 'intro', q: mid(s), hold: s.tour || 3 }));
      if (twinUI) {
        const toQ = p => (p - 0.2) / 0.8;                       // twin progress -> chapter q
        out.push({ id: 'twin', q: toQ(0.31), hold: 1.5 });
        for (let i = 0; i < twinUI.stages; i++) out.push({ id: 'twin', q: toQ(twinUI.T0 + i * twinUI.STEP + 0.05), hold: 1.6 });
        out.push({ id: 'twin', q: toQ(Math.min(1, twinUI.FINAL_AT + 0.11)), hold: 4 });
      }
      out.push({ id: 'adx', q: 0.65, hold: 6 });
      return out;
    },
    get tier() { return tier; }, setTier: setTier, goTo: goTo, scenes: SCENES
  };
});
