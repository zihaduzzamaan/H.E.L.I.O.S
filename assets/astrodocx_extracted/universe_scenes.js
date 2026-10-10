/* ============================================================
   ASTRODOCX — UNIVERSE INTRO · scene config (plan §12.2 / §12.3)
   The only place to tune copy and timing. Progress p runs 0..1
   over the whole pinned section; every other module reads this.

   hold  [a,b]  shape is stable and the text is readable
   The gap between one scene's hold end and the next one's hold
   start is the morph window (P1+).
============================================================ */
window.ADX_SCENES = [
  { id: 'dust',      name: 'Beginning',   tour: 2, hold: [0.00, 0.08], pos: 'center',
    head: ['EXPLORE', 'BEYOND'],                       sub: 'A new experience is taking shape.' },
  { id: 'planet',    name: 'Destination', tour: 3, hold: [0.16, 0.30], pos: 'left',
    head: ['BUILD THE', 'FUTURE'],                     sub: 'The next crews will travel months from home.' },
  { id: 'astronaut', name: 'Crew',        tour: 4.5, hold: [0.38, 0.52], pos: 'right',
    head: ['HUMAN', 'BEYOND LIMITS'],                  sub: 'Every heartbeat matters out here.' },
  { id: 'orion',     name: 'Journey',     tour: 3, hold: [0.60, 0.70], pos: 'left',
    head: ['GO', 'FURTHER'],                           sub: 'When Earth is up to 22 minutes away, the crew is the clinic.' },
  { id: 'relay',     name: 'Link',        tour: 3.5, hold: [0.75, 0.83], pos: 'right',
    head: ['CONNECT THE', 'UNKNOWN'],                  sub: 'Health logs sync home whenever the link allows.' },
  { id: 'earth',     name: 'Home',        tour: 3, hold: [0.94, 1.00], pos: 'top',
    head: ['ONE PLANET.', 'INFINITE POSSIBILITIES.'],  sub: 'Built for the crew, readable by flight surgeons on the ground.' }
];
/* The whole landing page is one pinned journey made of the same particles. Each chapter's length is in
   % of the viewport height (desktop, phone). The intro scenes above run over 'intro'; the two morphs
   carry the Earth into the body and the body into the ASTRODOCX wordmark. */
window.ADX_FLOW = [
  { id: 'intro',  len: [800, 620] },   // stardust -> ... -> Earth (ADX_SCENES)
  { id: 'toTwin', len: [110, 90] },    // Earth -> body
  { id: 'twin',   len: [440, 360] },   // scan, six systems, readiness
  { id: 'toAdx',  len: [110, 90] },    // body -> wordmark
  { id: 'adx',    len: [230, 190] }    // wordmark rises, pitch and buttons
];
