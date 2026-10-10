/* ============================================================
   ASTRODOCX — 3D ANATOMY MODAL (L4)
   Opt-in Sketchfab viewer, opened from the Health Twin header.

   - The iframe is created only on open and removed on close, so
     the page carries no extra WebGL context until a visitor asks
     for it (the nebula + astronaut already use one).
   - Online only (Sketchfab). The Crew Console does not use this.
   - Focus is trapped in the dialog; Esc / backdrop / × close it
     and focus returns to the trigger.
============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const MODEL_UID = '51ebbf617d4f4faeb099d70336e13a58';
  const PARAMS = new URLSearchParams({
    autostart: '1',
    ui_theme: 'dark',
    ui_infos: '0',
    ui_hint: '2',
    ui_watermark_link: '0',
    dnt: '1',
  });
  const SRC = `https://sketchfab.com/models/${MODEL_UID}/embed?${PARAMS}`;

  const trigger = document.getElementById('anat3dOpen');
  const modal   = document.getElementById('anat3d');
  const frame   = document.getElementById('anat3dFrame');
  const closeBt = document.getElementById('anat3dClose');
  if (!trigger || !modal || !frame || !closeBt) return;

  let lastFocus = null;

  function open() {
    if (!modal.hidden) return;
    lastFocus = document.activeElement;

    frame.innerHTML = '<div class="anat3d__loading">Loading 3D model…</div>';
    const iframe = document.createElement('iframe');
    iframe.title = 'Animated human body anatomy (3D, Sketchfab)';
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking';
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = SRC;
    iframe.addEventListener('load', () => {
      const l = frame.querySelector('.anat3d__loading');
      if (l) l.remove();
    }, { once: true });
    frame.appendChild(iframe);

    modal.hidden = false;
    document.body.classList.add('anat3d-lock');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    closeBt.focus();
  }

  function close() {
    if (modal.hidden) return;
    modal.classList.remove('is-open');
    frame.innerHTML = '';                       // frees Sketchfab's WebGL context
    modal.hidden = true;
    document.body.classList.remove('anat3d-lock');
    trigger.setAttribute('aria-expanded', 'false');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  trigger.addEventListener('click', open);
  closeBt.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const f = modal.querySelectorAll('button, a[href], iframe');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
});
