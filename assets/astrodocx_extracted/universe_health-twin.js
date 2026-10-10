/* ============================================================
   ASTRODOCX — HEALTH TWIN chapter (#twin)
   No canvas of its own: the page's one particle system (engine.js,
   shape 6 = body) is the twin. This module drives the body's regions
   and the DOM around it from the chapter's progress p (0..1):

     0.00-0.20  the Earth's particles gather into the body (the morph
                itself is the 'toTwin' chapter; p runs 0..0.20 there)
     0.20-0.31  a scan line sweeps head to feet; each region lights
     0.30-0.84  six systems, one every 0.09: the region glows, its label
                and leader line appear
     0.86-1.00  crew readiness and the action card

   Numbers are the demo mission snapshot (Pilot).
============================================================ */
(function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const small = () => window.innerWidth <= 900;
  const READY = 83;                                              // Pilot, demo mission end state

  /* label order = reveal order. reg = body region to glow, at = body-space anchor of the leader line */
  const STAGES = [
    { reg: 1, at: [0, 1.70, 0.06] },        // brain  - Isolation
    { reg: 3, at: [-0.16, 0.86, 0.08] },    // lungs  - Environment
    { reg: 0, at: [-0.27, 0.30, 0.12] },    // whole body - Radiation
    { reg: 2, at: [0.06, 0.78, 0.12] },     // heart  - Gravity
    { reg: 7, at: [0.60, 0.12, 0.08] },     // right forearm transmitter - Distance
    { reg: 5, at: [0.15, -1.15, 0.08] }     // legs   - Gravity
  ];
  const T0 = 0.30, STEP = 0.09, FINAL_AT = 0.86;
  const CENTERS = { 0: 9, 1: 1.70, 2: 0.78, 3: 0.86, 4: 0.26, 5: -1.2, 6: 0.5, 7: 0.0, 8: 0, 9: -9 };

  function create(root) {
    const labels = Array.from(root.querySelectorAll('.tw-label'));
    const final = root.querySelector('.tw-final');
    const linesSvg = root.querySelector('.tw-lines');
    const readyEl = root.querySelector('#twReadyVal');
    const SVGNS = 'http://www.w3.org/2000/svg';
    const lines = labels.map(() => { const l = document.createElementNS(SVGNS, 'polyline'); l.setAttribute('class', 'tw-line'); linesSvg.appendChild(l); return l; });
    const dots = labels.map(() => { const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('r', 3.2); c.setAttribute('class', 'tw-dot'); linesSvg.appendChild(c); return c; });
    const tmp = new THREE.Vector3();

    /* body regions (engine uniforms) for chapter progress p */
    function body(U, p, rig) {
      const centers = rig.centers || CENTERS;
      const morph = clamp(p / 0.20, 0, 1);
      const scan = p < 0.20 ? 3 : p > 0.31 ? -3 : 2.3 - (p - 0.20) / 0.11 * 4.6;           // sweeps 2.3 -> -2.3
      U.uScan.value = scan;
      const lit = U.uLit.value, foc = U.uFocus.value;
      for (let r = 0; r < 10; r++) lit[r] = r === 0 || r === 8 || r === 9 ? clamp(morph * 1.6 - 0.2, 0, 1) : clamp((centers[r] - scan) / 0.5 + 0.5, 0, 1) * (p > 0.20 ? 1 : 0);
      let cur = -1;
      for (let i = 0; i < STAGES.length; i++) if (p >= T0 + i * STEP) cur = i;
      for (let r = 0; r < 10; r++) foc[r] = 0;
      if (cur >= 0 && p < FINAL_AT) foc[STAGES[cur].reg] = 1;
      U.uAlert.value = lit[1];
      return cur;
    }

    /* labels and the readiness card: fade in at their stage; phones show only the current one */
    function dom(p, cur) {
      const fv = clamp((p - FINAL_AT) / 0.05, 0, 1);
      labels.forEach((el, i) => {
        const v = clamp((p - (T0 + i * STEP)) / 0.04, 0, 1);
        el.style.opacity = (small() ? (i === cur && p < FINAL_AT ? v : 0) : v * (1 - 0.7 * fv)).toFixed(3);
        el.classList.toggle('is-current', i === cur && p < FINAL_AT);
        el.style.translate = '0 ' + ((1 - v) * 16).toFixed(1) + 'px';
      });
      if (final) {
        final.style.opacity = fv.toFixed(3); final.style.translate = '0 ' + ((1 - fv) * 16).toFixed(1) + 'px';
        if (readyEl) readyEl.textContent = Math.round(READY * clamp((p - FINAL_AT) / 0.1, 0, 1));
      }
    }

    /* text the lines must not cross: the chapter heading (tight text boxes, not the block boxes), the labels, the readiness card */
    const range = document.createRange();
    const textBox = el => { if (el.tagName === 'BUTTON') return el.getBoundingClientRect(); range.selectNodeContents(el); return range.getBoundingClientRect(); };   // the pill's border counts
    const head = Array.from(root.querySelectorAll('.tw-head .ch-no, .tw-head .ch-title > span, .tw-head .ch-sub, .tw-head .ch-pill'));
    function obstacles(box) {
      const rs = head.map(textBox).concat(labels.map(el => el.getBoundingClientRect()), final ? [final.getBoundingClientRect()] : []);
      return rs.filter(r => r.width > 0).map(r => ({ l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top }));
    }

    /* leader lines: out of the label, along a vertical lane clear of every text block, then across to the organ.
       Lanes are in "distance from the label column" (k); lines going up nest outward top to bottom, lines going
       down nest outward bottom to top, so no two lines cross. */
    const GAP = 18, LANE = 14, CHAMFER = 8;
    function drawLines(camera, ang, rig) {
      const box = root.getBoundingClientRect(), W = box.width, H = box.height, c = Math.cos(ang), s = Math.sin(ang);
      const obs = small() ? [] : obstacles(box), route = [];
      labels.forEach((el, i) => {
        const v = parseFloat(el.style.opacity) || 0, ln = lines[i], dt = dots[i];
        if (small() || v < 0.02) { ln.style.opacity = 0; dt.style.opacity = 0; return; }
        const a = (rig.at && rig.at[i]) || STAGES[i].at;                               // the baked body brings its own anchors
        tmp.set(c * a[0] + s * a[2], a[1], -s * a[0] + c * a[2]).project(camera);
        const ax = (tmp.x * 0.5 + 0.5) * W, ay = (-tmp.y * 0.5 + 0.5) * H;
        const r = el.getBoundingClientRect(), left = el.dataset.side === 'left', dir = left ? 1 : -1;
        const sx = (left ? r.right : r.left) - box.left + dir * 10, sy = r.top - box.top + 10;
        /* k: how far out from sx the lane must sit to pass every obstacle spanning the line's vertical run */
        const y0 = Math.min(sy, ay) - 6, y1 = Math.max(sy, ay) + 6;
        let k = GAP;
        obs.forEach(o => {
          if (o.b < y0 || o.t > y1) return;
          const edge = left ? o.r - sx : sx - o.l;                                        // obstacle's far edge, in k
          if (edge > 0 && edge < dir * (ax - sx)) k = Math.max(k, edge + GAP);
        });
        route.push({ el, ln, dt, v, left, dir, sx, sy, ax, ay, k, up: ay < sy });
      });
      [true, false].forEach(left => [true, false].forEach(up => {
        const g = route.filter(q => q.left === left && q.up === up).sort((p, q) => up ? p.sy - q.sy : q.sy - p.sy);
        g.forEach((q, j) => { if (j) q.k = Math.max(q.k, g[j - 1].k + LANE); });
      }));
      route.forEach(q => {
        const { ln, dt, el, v, dir, sx, sy, ax, ay } = q;
        const lane = sx + dir * Math.min(q.k, Math.max(GAP, dir * (ax - sx) - GAP));   // never past the organ
        const dy = ay - sy, ch = Math.min(CHAMFER, Math.abs(dy) / 2, Math.abs(lane - sx), Math.abs(ax - lane)), sg = Math.sign(dy);
        ln.setAttribute('points', [[sx, sy], [lane - dir * ch, sy], [lane, sy + sg * ch], [lane, ay - sg * ch], [lane + dir * ch, ay], [ax, ay]].map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
        dt.setAttribute('cx', ax); dt.setAttribute('cy', ay);
        ln.style.opacity = (v * 0.9).toFixed(2); dt.style.opacity = v.toFixed(2);
        ln.classList.toggle('is-act', el.dataset.state === 'act'); dt.classList.toggle('is-act', el.dataset.state === 'act');
      });
    }

    return {
      /* p: chapter progress (0..1). Returns the current stage. */
      update: function (engine, camera, p, time) {
        const cur = body(engine.uniforms, p, engine.bodyRig);
        dom(p, cur);
        drawLines(camera, engine.bodyAngle(time), engine.bodyRig);
        return cur;
      },
      makeStatic: function () {
        root.classList.add('is-static');
        if (readyEl) readyEl.textContent = READY;
        labels.forEach(l => { l.style.cssText = ''; l.style.opacity = 1; });
        if (final) { final.style.cssText = ''; final.style.opacity = 1; }
      },
      stages: STAGES.length, T0: T0, STEP: STEP, FINAL_AT: FINAL_AT
    };
  }
  window.ADX_TWIN_UI = { create: create };
})();
