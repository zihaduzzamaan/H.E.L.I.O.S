/* ============================================================
   ASTRODOCX — generated soundtrack (Web Audio, no audio files)
   A slow organ-like drone that follows the particle journey:
     intro     one chord per scene, sparse high "star" notes,
               the filter opens as the story moves on
     morphs    a swell while Earth -> body and body -> wordmark
     twin      a quiet low chord and a soft heartbeat thump, in
               time with the particle heart (1 beat / s, lub-dub)
     adx       resolves to A major and opens up
     scrolling the particles move, and you hear them: a soft airy
               shimmer and tiny sparkle notes that grow with scroll
               speed, strongest in the two morphs, gone when you stop
   Muted by default: browsers only start audio after a click, so the
   speaker button (top right) starts it; while it plays it shows a wave. The choice is remembered per visitor.
   Nothing runs (no AudioContext, no loop) until the first click.
============================================================ */
(function () {
  'use strict';
  const btn = document.getElementById('soundToggle');
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!btn || !AC) { if (btn) btn.hidden = true; return; }

  const KEY = 'adx-sound';
  const store = { get: () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
                  set: v => { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  /* chords as MIDI notes, one per intro scene (dust, planet, astronaut, Orion, relay, Earth), then twin and AstroDocX */
  const CHORDS = {
    dust:      [45, 52, 59, 60],        // A minor (add9)
    planet:    [41, 48, 57, 60],        // F
    astronaut: [36, 48, 55, 64],        // C
    orion:     [43, 50, 55, 62],        // G (sus)
    relay:     [40, 47, 55, 59],        // E minor
    earth:     [41, 48, 57, 64],        // F maj7
    twin:      [45, 52, 57, 60],        // A minor, low and quiet
    adx:       [45, 52, 57, 61, 64]     // A major: the resolution
  };

  let ctx = null, master, filter, wet, comp, verb, dust, dustBP, on = false, lastY = 0, lastT = 0, speed = 0, grainAcc = 0, raf = 0, voices = null, chordId = '', lastBeat = -1, nextStar = 0;

  /* ── graph: voices -> lowpass -> dry + reverb -> compressor -> master ── */
  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    comp.connect(master); master.connect(ctx.destination);
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.4;
    const dry = ctx.createGain(); dry.gain.value = 0.55;
    wet = ctx.createGain(); wet.gain.value = 0.7;
    verb = ctx.createConvolver(); verb.buffer = impulse(5.5, 2.2);
    filter.connect(dry); dry.connect(comp);
    filter.connect(verb); verb.connect(wet); wet.connect(comp);
    /* slow breathing on the whole pad */
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(), bus = ctx.createGain();
    lfo.frequency.value = 0.07; lfoG.gain.value = 0.12; bus.gain.value = 0.88;
    lfo.connect(lfoG); lfoG.connect(bus.gain); lfo.start();
    bus.connect(filter);
    ctx.bus = bus;
    /* particle shimmer: looped white noise through a moving band-pass, silent until you scroll */
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    dustBP = ctx.createBiquadFilter(); dustBP.type = 'bandpass'; dustBP.frequency.value = 4000; dustBP.Q.value = 1.4;
    dust = ctx.createGain(); dust.gain.value = 0;
    const send = ctx.createGain(); send.gain.value = 0.8;
    src.connect(dustBP); dustBP.connect(dust); dust.connect(comp); dust.connect(send); send.connect(verb);
    src.start();
  }
  /* synthetic hall: decaying stereo noise */
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  /* one organ note: fundamental + octave + twelfth (drawbar-like), a hair detuned for width */
  function note(m, out) {
    const f = hz(m), parts = [[1, 0.5, 'sine'], [2, 0.18, 'sine'], [3, 0.07, 'triangle']], oscs = [];
    parts.forEach(([mul, g, type], i) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f * mul; o.detune.value = (i % 2 ? 4 : -3) + (Math.random() - 0.5) * 3;
      og.gain.value = g * (m < 44 ? 1.1 : m > 62 ? 0.7 : 0.9);
      o.connect(og); og.connect(out); o.start(); oscs.push(o);
    });
    return oscs;
  }
  /* crossfade to a new chord: old voices fade over 3.5 s and stop, new ones swell in over 2.5 s */
  function setChord(id) {
    if (id === chordId) return;
    chordId = id;
    const t = ctx.currentTime, g = ctx.createGain(), quiet = id === 'twin' ? 0.07 : 0.1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(quiet, t + 2.5);
    g.connect(ctx.bus);
    const oscs = [].concat.apply([], CHORDS[id].map(m => note(m, g)));
    if (voices) {
      const old = voices;
      old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 3.5);
      setTimeout(() => { old.oscs.forEach(o => { try { o.stop(); } catch (e) {} }); old.g.disconnect(); }, 3800);
    }
    voices = { g: g, oscs: oscs };
  }

  /* a soft low thump (the heart); `amp` 1 = lub, smaller = dub */
  function thump(amp) {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    o.connect(g); g.connect(filter);
    o.start(t); o.stop(t + 0.35);
  }
  /* a high bell-like star note from the current chord, mostly reverb */
  function star() {
    const ch = CHORDS[chordId] || CHORDS.dust, m = ch[Math.floor(Math.random() * ch.length)] + 24 + (Math.random() < 0.3 ? 12 : 0);
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
    o.connect(g); g.connect(filter); o.start(t); o.stop(t + 3.3);
  }

  /* one particle "grain": a tiny high sine blip from the chord, placed somewhere left / right, mostly reverb */
  function sparkle(amp) {
    const ch = CHORDS[chordId] || CHORDS.dust, m = ch[Math.floor(Math.random() * ch.length)] + (Math.random() < 0.5 ? 24 : 36);
    const t = ctx.currentTime, len = 0.05 + Math.random() * 0.1, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(m) * (1 + (Math.random() - 0.5) * 0.004);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0003, t + len);
    o.connect(g);
    if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.random() * 1.6 - 0.8; g.connect(pn); pn.connect(comp); pn.connect(verb); }
    else { g.connect(comp); g.connect(verb); }
    o.start(t); o.stop(t + len + 0.02);
  }

  /* ── follow the journey ── */
  const SCENE_IDS = ['dust', 'planet', 'astronaut', 'orion', 'relay', 'earth'];
  function introScene(q) {
    const S = window.ADX_SCENES || [];
    let k = 0; S.forEach((s, i) => { if (q >= s.hold[0] - 0.04) k = i; });
    return SCENE_IDS[k] || 'dust';
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    const J = window.ADX_JOURNEY, s = J && J.state ? J.state() : { id: 'intro', q: 0 };
    if (!s) return;
    const id = s.id, q = s.q, now = performance.now() / 1000, t = ctx.currentTime;
    /* chord */
    setChord(id === 'intro' ? introScene(q) : id === 'toTwin' ? (q < 0.5 ? 'earth' : 'twin') : id === 'twin' ? 'twin' : id === 'toAdx' ? (q < 0.5 ? 'twin' : 'adx') : 'adx');
    /* brightness: opens through the intro, swells mid-morph, wide open on the reveal */
    const swell = id === 'toTwin' || id === 'toAdx' ? Math.sin(Math.PI * q) : 0;
    const open = id === 'intro' ? 0.15 + q * 0.45 : id === 'twin' ? 0.3 : id === 'adx' ? 0.75 + q * 0.25 : id === 'toAdx' ? 0.3 + q * 0.5 : 0.6 - q * 0.3;
    filter.frequency.setTargetAtTime(500 + 2600 * clamp(open + swell * 0.5, 0, 1.2), t, 0.4);
    wet.gain.setTargetAtTime(0.7 + swell * 0.5, t, 0.5);
    /* heartbeat in the twin, in phase with the particle heart (engine.js: lub at whole seconds, dub 0.28 s later) */
    const inTwin = id === 'twin' || (id === 'toTwin' && q > 0.6) || (id === 'toAdx' && q < 0.3);
    const beat = Math.floor(now), ph = now - beat;
    if (inTwin && beat !== lastBeat && ph < 0.1) { lastBeat = beat; thump(1); setTimeout(() => { if (on) thump(0.45); }, 280); }
    /* moving particles: scroll speed (viewports per second, fast attack, slow release) drives shimmer + sparkles */
    const dt = lastT ? Math.min(0.1, now - lastT) : 0.016, y = window.scrollY;
    const v = lastT ? Math.abs(y - lastY) / dt / Math.max(1, innerHeight) : 0;
    lastT = now; lastY = y;
    speed += (v - speed) * (1 - Math.exp(-dt / (v > speed ? 0.08 : 0.4)));
    const move = clamp(speed / 1.4, 0, 1) * (1 + swell * 1.2);
    dust.gain.setTargetAtTime(0.05 * move, t, 0.06);
    dustBP.frequency.setTargetAtTime(2600 + 3200 * clamp(open, 0, 1) + 1800 * swell, t, 0.2);
    grainAcc += dt * 34 * move;
    for (let k = 0; grainAcc >= 1 && k < 4; k++) { grainAcc -= 1; sparkle(0.012 + 0.018 * Math.random() * clamp(move, 0, 1)); }
    if (grainAcc > 1) grainAcc = 0;
    /* star notes: sparse in the intro and on the reveal */
    if ((id === 'intro' || id === 'adx') && now > nextStar) { if (nextStar) star(); nextStar = now + 1.6 + Math.random() * 2.6; }
  }

  /* ── on / off ── */
  function start() {
    if (!ctx) build();
    on = true;
    ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.9, t + 2.5);
    if (!raf) tick();
    ui();
  }
  function stop() {
    on = false;
    if (ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.8);
      setTimeout(() => { if (!on) { cancelAnimationFrame(raf); raf = 0; ctx.suspend(); } }, 900);
    }
    ui();
  }
  function ui() {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  }

  btn.addEventListener('click', e => { e.stopPropagation(); if (on) { stop(); store.set('off'); } else { start(); store.set('on'); } });
  /* a visitor who turned it on before: start at their first click / key on the page (browsers need a gesture) */
  if (store.get() === 'on') {
    /* the button handles its own press: if this also started the sound on pointerdown, the click that follows would switch it straight off again */
    const resume = e => { if (e && e.target && btn.contains(e.target)) return; if (!on && store.get() === 'on') start(); off(); };
    const off = () => ['pointerdown', 'keydown'].forEach(ev => removeEventListener(ev, resume, true));
    ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, resume, true));
  }
  /* quiet while the tab is hidden */
  document.addEventListener('visibilitychange', () => { if (!ctx || !on) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  ui();
})();
