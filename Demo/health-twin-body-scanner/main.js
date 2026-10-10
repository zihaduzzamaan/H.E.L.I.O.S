/* ============================================================
   HELIOS x ASTRODOCX — MAIN SCANNER DEMO CONTROLLER
============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const canvas = document.getElementById('scannerCanvas');
  const stage = document.getElementById('twin-stage');
  const playBtn = document.getElementById('btnPlay');
  const scrubRange = document.getElementById('scanScrub');
  const scrubVal = document.getElementById('scrubVal');
  const resetBtn = document.getElementById('btnReset');
  const modelStatus = document.getElementById('modelStatus');

  let isPlaying = false;
  let scanProgress = 1.0; // Start with full scan revealed immediately!
  let customRotation = 0;
  let isDragging = false;
  let lastMouseX = 0;

  scrubRange.value = 1.0;
  if (scrubVal) scrubVal.textContent = '100%';
  if (playBtn) playBtn.textContent = 'RE-SCAN';

  // 1. Initialize 3D Engine
  const engine = window.HELIOS_SCANNER_ENGINE.create(canvas, {
    basePath: './targets/',
    onLoaded: (isBaked, rig) => {
      if (modelStatus) {
        modelStatus.textContent = isBaked ? '312KB BAKED 24K TARGET' : 'PROCEDURAL GPU FALLBACK';
      }
    }
  });

  // 2. Initialize HUD & Leader lines
  const hud = window.HELIOS_SCANNER_HUD.create(stage);

  // 3. Mouse Orbit Interaction
  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastMouseX = e.clientX;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    customRotation += dx * 0.008;
    lastMouseX = e.clientX;
  });

  // Touch controls for mobile
  let lastTouchX = 0;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDragging = true;
      lastTouchX = e.touches[0].clientX;
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });

  window.addEventListener('touchmove', e => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastTouchX;
    customRotation += dx * 0.008;
    lastTouchX = e.touches[0].clientX;
  }, { passive: true });

  // 3b. Disable Zoom & Wheel Scaling entirely (camera stays locked, page doesn't zoom or scroll)
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });

  if (stage) {
    stage.addEventListener('wheel', e => {
      e.preventDefault();
    }, { passive: false });
  }

  // Prevent browser pinch-zoom & ctrl+wheel zoom
  window.addEventListener('wheel', e => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('gesturestart', e => e.preventDefault());
  window.addEventListener('gesturechange', e => e.preventDefault());
  window.addEventListener('gestureend', e => e.preventDefault());

  // 4. Scrub bar controls
  scrubRange.addEventListener('input', e => {
    isPlaying = false;
    if (playBtn) playBtn.textContent = 'PLAY';
    scanProgress = parseFloat(e.target.value);
    if (scrubVal) scrubVal.textContent = Math.round(scanProgress * 100) + '%';
  });

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (scanProgress >= 1.0) {
        scanProgress = 0.0;
        isPlaying = true;
        playBtn.textContent = 'PAUSE';
      } else {
        isPlaying = !isPlaying;
        playBtn.textContent = isPlaying ? 'PAUSE' : 'RESUME';
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      customRotation = 0;
      scanProgress = 1.0;
      scrubRange.value = 1.0;
      if (scrubVal) scrubVal.textContent = '100%';
      isPlaying = false;
      if (playBtn) playBtn.textContent = 'RE-SCAN';
    });
  }

  // Focus organ on card click
  document.querySelectorAll('.tw-label').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const stages = [1, 3, 0, 2, 7, 5];
      const targetReg = stages[idx];
      const foc = engine.uniforms.uFocus.value;
      for (let r = 0; r < 10; r++) foc[r] = (r === targetReg ? 1.0 : 0.0);
    });
  });

  // 5. Main Render Loop
  let lastTime = performance.now();
  function loop(timeMs) {
    requestAnimationFrame(loop);
    const dt = (timeMs - lastTime) * 0.001;
    lastTime = timeMs;

    const t = timeMs * 0.001;

    // Advance scan sweep if playing
    if (isPlaying) {
      scanProgress += dt * 0.12; // Sweep from 0 to 1
      if (scanProgress >= 1.0) {
        scanProgress = 1.0;
        isPlaying = false;
        if (playBtn) playBtn.textContent = 'RE-SCAN';
      }
      scrubRange.value = scanProgress.toFixed(3);
      if (scrubVal) scrubVal.textContent = Math.round(scanProgress * 100) + '%';
    }

    // Auto-sway when not manually rotating
    const currentAngle = customRotation !== 0 ? customRotation : 0.32 * Math.sin(t * 0.22);

    // Update 3D Engine & Render
    engine.render(t, currentAngle);

    // Update Leader lines and HUD DOM cards
    hud.update(engine.uniforms, engine.camera, scanProgress, currentAngle, engine.bodyRig());

    // When fully scanned, keep laser line scanning up and down as an idle scan radar beam
    if (scanProgress >= 1.0) {
      engine.uniforms.uScan.value = 1.8 * Math.sin(t * 1.5);
    }
  }

  // Handle Resize
  window.addEventListener('resize', () => {
    engine.resize();
  });
  engine.resize();

  requestAnimationFrame(loop);
});
