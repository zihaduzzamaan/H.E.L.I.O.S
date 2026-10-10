/* ============================================================
   HELIOS x ASTRODOCX — HUD TELEMETRY & DYNAMIC LEADER LINES
   - Real-time 3D-to-2D Vector projection
   - Dynamic chamfered orthogonal SVG leader lines
   - Obstacle avoidance around headings and cards
   - Live readiness gauge and telemetry card controller
============================================================ */

(function (window) {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const READY = 83; // Pilot mission readiness score

  const STAGES = [
    { reg: 1, at: [0, 1.70, 0.05], label: 'Isolation' },
    { reg: 0, at: [-0.28, 0.30, 0.12], label: 'Radiation' },
    { reg: 3, at: [0.24, 0.84, 0.08], label: 'Environment' },
    { reg: 7, at: [0.60, 0.28, 0.08], label: 'Distance' },
    { reg: 5, at: [0.18, -1.15, 0.06], label: 'Gravity' }
  ];

  const T0 = 0.28, STEP = 0.09, FINAL_AT = 0.82;
  const GAP = 18, LANE = 14, CHAMFER = 8;
  const SVGNS = 'http://www.w3.org/2000/svg';

  function createScannerHUD(root) {
    const labels = Array.from(root.querySelectorAll('.tw-hazard-pill, .tw-label'));
    const finalCard = root.querySelector('.tw-final');
    const linesSvg = root.querySelector('.tw-lines');
    const readyEl = root.querySelector('#twReadyVal');

    // Create SVG leader lines and single small anchor dots (only one dot per marker)
    const lines = labels.map(() => {
      const l = document.createElementNS(SVGNS, 'polyline');
      l.setAttribute('class', 'tw-line');
      linesSvg.appendChild(l);
      return l;
    });

    const dots = labels.map(() => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('r', 2.6); // Small, crisp single marking dot
      c.setAttribute('class', 'tw-dot');
      linesSvg.appendChild(c);
      return c;
    });

    const tmp = new THREE.Vector3();
    const range = document.createRange();

    const textBox = el => {
      if (el.tagName === 'BUTTON' || el.classList.contains('ctrl-panel')) return el.getBoundingClientRect();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };

    const headElements = Array.from(root.querySelectorAll('.tw-head .ch-no, .tw-head .ch-title, .tw-head .ch-sub, .tw-head .ch-pill, .scanner-toolbar'));

    function getObstacles(box) {
      const rs = headElements.map(textBox).concat(labels.map(el => el.getBoundingClientRect()), finalCard ? [finalCard.getBoundingClientRect()] : []);
      return rs.filter(r => r.width > 0).map(r => ({
        l: r.left - box.left,
        r: r.right - box.left,
        t: r.top - box.top,
        b: r.bottom - box.top
      }));
    }

    /* Update GLSL uniforms for scan progress p (0..1) */
    function updateUniforms(uniforms, p, rig) {
      const centers = (rig && rig.centers) || { 0: 9, 1: 1.70, 2: 0.78, 3: 0.86, 4: 0.26, 5: -1.2, 6: 0.5, 7: 0.0, 8: 0, 9: -9 };
      // Scan sweeps head (+2.3) to feet (-2.3) between p = 0.15 and 0.32
      const scan = p < 0.15 ? 3.0 : p > 0.35 ? -3.0 : 2.3 - (p - 0.15) / 0.20 * 4.6;
      uniforms.uScan.value = scan;

      const lit = uniforms.uLit.value;
      const foc = uniforms.uFocus.value;

      for (let r = 0; r < 10; r++) {
        lit[r] = (r === 0 || r === 8 || r === 9)
          ? 1.0
          : clamp((centers[r] - scan) / 0.5 + 0.5, 0, 1) * (p > 0.15 ? 1 : 0);
      }

      let cur = -1;
      for (let i = 0; i < STAGES.length; i++) {
        if (p >= T0 + i * STEP) cur = i;
      }

      for (let r = 0; r < 10; r++) foc[r] = 0;
      if (cur >= 0 && p < FINAL_AT) {
        foc[STAGES[cur].reg] = 1.0;
      }

      uniforms.uAlert.value = lit[1]; // Brain alert intensity
      return cur;
    }

    /* Fade labels and readiness score based on scan progress */
    function updateDOM(p, cur) {
      const fv = clamp((p - FINAL_AT) / 0.08, 0, 1);

      labels.forEach((el, i) => {
        const stageP = T0 + i * STEP;
        const v = clamp((p - stageP) / 0.05, 0, 1);
        // Keep cards crisp and visible once revealed
        const opacity = p >= FINAL_AT ? (0.85 + 0.15 * (i === cur ? 1 : 0)) : v;
        el.style.opacity = opacity.toFixed(3);
        el.classList.toggle('is-current', i === cur);
        el.style.transform = `translateY(${(1 - v) * 14}px)`;
      });

      if (finalCard) {
        finalCard.style.opacity = fv.toFixed(3);
        finalCard.style.transform = `translateX(-50%) translateY(${(1 - fv) * 14}px)`;
        if (readyEl) {
          readyEl.textContent = Math.round(READY * (p >= 1.0 ? 1 : clamp((p - FINAL_AT) / 0.15, 0, 1)));
        }
      }
    }

    /* Dynamic Obstacle-Avoiding Orthogonal Chamfered Leader Lines */
    function drawLines(camera, ang, rig) {
      const box = root.getBoundingClientRect();
      const W = box.width;
      const H = box.height;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const obs = W <= 900 ? [] : getObstacles(box);
      const route = [];

      labels.forEach((el, i) => {
        const v = parseFloat(el.style.opacity) || 0;
        const ln = lines[i];
        const dt = dots[i];

        if (W <= 768 || v < 0.02) {
          ln.style.opacity = 0;
          dt.style.opacity = 0;
          return;
        }

        const a = (STAGES[i] && STAGES[i].at) || [0, 0, 0];
        // Project 3D rotated point into 2D camera viewport
        tmp.set(c * a[0] + s * a[2], a[1], -s * a[0] + c * a[2]).project(camera);
        const ax = (tmp.x * 0.5 + 0.5) * W;
        const ay = (-tmp.y * 0.5 + 0.5) * H;

        const r = el.getBoundingClientRect();
        const isLeft = el.dataset.side === 'left';
        const dir = isLeft ? 1 : -1;
        const sx = (isLeft ? r.right : r.left) - box.left + dir * 10;
        const sy = r.top - box.top + r.height * 0.5;

        const y0 = Math.min(sy, ay) - 6;
        const y1 = Math.max(sy, ay) + 6;
        let k = GAP;

        obs.forEach(o => {
          if (o.b < y0 || o.t > y1) return;
          const edge = isLeft ? o.r - sx : sx - o.l;
          if (edge > 0 && edge < dir * (ax - sx)) k = Math.max(k, edge + GAP);
        });

        route.push({ el, ln, dt, v, isLeft, dir, sx, sy, ax, ay, k, up: ay < sy });
      });

      // Sort lanes so lines don't cross
      [true, false].forEach(isLeft => {
        [true, false].forEach(up => {
          const g = route.filter(q => q.isLeft === isLeft && q.up === up).sort((p, q) => up ? p.sy - q.sy : q.sy - p.sy);
          g.forEach((q, j) => {
            if (j) q.k = Math.max(q.k, g[j - 1].k + LANE);
          });
        });
      });

      // Draw chamfered SVG polyline
      route.forEach(q => {
        const { ln, dt, el, v, dir, sx, sy, ax, ay } = q;
        const lane = sx + dir * Math.min(q.k, Math.max(GAP, dir * (ax - sx) - GAP));
        const dy = ay - sy;
        const ch = Math.min(CHAMFER, Math.abs(dy) / 2, Math.abs(lane - sx), Math.abs(ax - lane));
        const sg = Math.sign(dy);

        const pts = [
          [sx, sy],
          [lane - dir * ch, sy],
          [lane, sy + sg * ch],
          [lane, ay - sg * ch],
          [lane + dir * ch, ay],
          [ax, ay]
        ].map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

        ln.setAttribute('points', pts);
        dt.setAttribute('cx', ax);
        dt.setAttribute('cy', ay);

        ln.style.opacity = (v * 0.95).toFixed(2);
        dt.style.opacity = v.toFixed(2);

        const isAct = el.dataset.state === 'act';
        ln.classList.toggle('is-act', isAct);
        dt.classList.toggle('is-act', isAct);
      });
    }

    return {
      update: function (uniforms, camera, p, ang, rig) {
        const cur = updateUniforms(uniforms, p, rig);
        updateDOM(p, cur);
        drawLines(camera, ang, rig);
        return cur;
      },
      showStaticAll: function () {
        labels.forEach(l => {
          l.style.opacity = 1;
          l.style.transform = 'none';
        });
        if (finalCard) {
          finalCard.style.opacity = 1;
          finalCard.style.transform = 'translateX(-50%) none';
          if (readyEl) readyEl.textContent = READY;
        }
      }
    };
  }

  window.HELIOS_SCANNER_HUD = { create: createScannerHUD };
})(window);
