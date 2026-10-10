/* ============================================================
   ASTRODOCX — the AstroDocX chapter (#astrodocx)
   No canvas of its own: the body's particles have just become the
   ASTRODOCX wordmark (engine shape 7, the 'toAdx' chapter). Here the
   wordmark rises and shrinks and the pitch, steps and buttons fade
   in below it. Chapter progress p (0..1), a pure function:
     0.00-0.08  hold the wordmark
     0.08-0.45  wordmark rises and shrinks
     0.15-0.60  content fades in
     0.60-1.00  hold
   Static mode (reduced motion / no WebGL): a normal section with the
   CSS wordmark (the same <h1>) and a plain fade-in.
============================================================ */
(function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sm = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const small = () => window.innerWidth <= 900;

  function create(root) {
    const items = Array.from(root.querySelectorAll('.adx-reveal')).filter(el => !el.classList.contains('adx-wordmark'));
    return {
      /* the wordmark's scale / offset for chapter progress p (fed to engine.set as the override) */
      word: function (p) {
        const rise = sm(clamp((p - 0.08) / 0.37, 0, 1));
        return { sc: lerp(3.2, small() ? 1.9 : 2.1, rise), off: [0, lerp(0, small() ? 2.6 : 2.1, rise), 0] };
      },
      update: function (p) {
        const show = clamp((p - 0.15) / 0.45, 0, 1);
        items.forEach((el, i) => {
          const v = clamp((show - i * 0.09) / 0.5, 0, 1);
          el.style.opacity = v.toFixed(3);
          el.style.translate = '0 ' + ((1 - v) * 24).toFixed(1) + 'px';
          el.style.pointerEvents = v > 0.6 ? 'auto' : 'none';
        });
      },
      makeStatic: function (reduce) {
        root.classList.remove('is-particle');
        const all = root.querySelectorAll('.adx-reveal');
        all.forEach(el => { el.style.cssText = ''; });
        if (reduce) { gsap.set(all, { opacity: 1 }); return; }
        gsap.fromTo(all, { opacity: 0, y: 28 }, {
          scrollTrigger: { trigger: root, start: 'top 70%' }, opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out'
        });
      }
    };
  }
  window.ADX_REVEAL_UI = { create: create };
})();
