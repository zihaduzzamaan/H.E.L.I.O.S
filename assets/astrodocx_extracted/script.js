/* ═══════════════════════════════════════════════════════════
   ASTRODOCX — LANDING MAIN SCRIPT
   The page is one particle journey (#journey: #universe intro →
   #twin Health Twin → #astrodocx) → footer. The journey and the
   tour have their own files; this one holds the shared bits: nav,
   typewriter, back-to-top.
═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

gsap.registerPlugin(ScrollTrigger);
window.addEventListener('load', () => ScrollTrigger.refresh());

/* single source of truth for "does this visitor want reduced motion" */
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Health Twin: tell the CSS how tall the heading block really is, so the left labels start below it ── */
(function () {
  const twin = document.getElementById('twin'), head = twin && twin.querySelector('.tw-head');
  if (!head || !window.ResizeObserver) return;
  const set = () => twin.style.setProperty('--tw-head-b', Math.round(head.offsetTop + head.offsetHeight) + 'px');
  new ResizeObserver(set).observe(head);
  window.addEventListener('resize', set);
  set();
})();

/* ── Back to top ── */
(function () {
  const btn = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => { btn.classList.toggle('visible', window.scrollY > 400); }, { passive: true });
  btn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();

/* ── Footer year ── */
document.getElementById('footer-year').textContent = new Date().getFullYear();

/* ── Typewriter on the AstroDocX reveal ── */
(function () {
  const phrases = ['detecting drift…', 'explaining the change…', 'acting on the card…', 'syncing to Earth…'];
  let pi = 0, ci = 0, deleting = false, wait = 0;
  const el = document.getElementById('hero-typed');
  if (!el) return;
  const cursor = document.querySelector('.hero-cursor');
  /* retrigger the CSS "key hit" animation on every character (skipped under reduced motion) */
  function keyHit() {
    if (REDUCE_MOTION) return;
    [el, cursor].forEach(function (node) {
      if (!node) return;
      node.classList.remove('key-hit');
      void node.offsetWidth;
      node.classList.add('key-hit');
    });
  }
  function type() {
    if (wait > 0) { wait--; setTimeout(type, 50); return; }
    const cur = phrases[pi];
    if (!deleting) {
      if (ci <= cur.length) { el.textContent = cur.slice(0, ci++); keyHit(); setTimeout(type, ci === 1 ? 800 : 60); }
      else { deleting = true; wait = 42; setTimeout(type, 50); }
    } else {
      if (ci > 0) { el.textContent = cur.slice(0, --ci); keyHit(); setTimeout(type, 32); }
      else { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(type, 180); }
    }
  }
  if (REDUCE_MOTION) { el.textContent = phrases[0]; return; }
  setTimeout(type, 1200);
})();

});
