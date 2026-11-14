/*  Holographic Particle Accelerator — Panel
 *  Jackrabbit72380
 *  2026
 *
 *  Keeps the control panel readable: the long notes of a section become one small "i" pill in
 *  its top right, level with the heading, that opens them when it is clicked. No paragraphs, and
 *  no extra row. It also takes the Equalizer ring button off the Visualizer section, because the
 *  same target already sits in the Target list as Equalizer (audio bars) — one way in is enough.
 */

(() => {
  'use strict';

  const sections = document.getElementById('sections');
  if (!sections) return;

  const style = document.createElement('style');
  style.textContent = [
    '.section{position:relative}',
    '.info-pill{position:absolute;top:9px;right:2px;width:18px;height:18px;margin:0;padding:0;',
    'border-radius:50%;border:1px solid rgba(143,216,255,.45);background:transparent;color:inherit;',
    'font:600 11px/1 system-ui,sans-serif;cursor:pointer;opacity:.7;z-index:2}',
    '.info-pill:hover,.info-pill.open{opacity:1;border-color:#8fd8ff}',
    '.section h2{padding-right:22px}',
    '.note[hidden]{display:none!important}',
    '.note{margin-top:2px}'
  ].join('');
  document.head.appendChild(style);

  /*--- One way into the audio ring ---*/

  const ring = Array.from(sections.querySelectorAll('button')).find(
    (button) => /^equalizer ring$/i.test(button.textContent.trim())
  );

  if (ring) {
    const section = ring.closest('.section');
    ring.remove();

    const title = section && section.querySelector('h2');
    if (title && title.textContent.trim() === 'Visualizer') title.textContent = 'Band height';

    const note = section && section.querySelector('.note');
    if (note) {
      note.textContent = 'How far the audio lifts each point — one setting for the target and the background layer. Equalizer and Grid are in the Target list.';
    }
  }

  /*--- Notes become one pill per section, in the heading ---*/

  // A section can hold several notes, and the heading has room for one pill, so they open together.
  const bySection = new Map();
  for (const note of sections.querySelectorAll('.note')) {
    const section = note.closest('.section');
    if (!section) continue;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(note);
  }

  for (const [section, notes] of bySection) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'info-pill';
    pill.textContent = 'i';
    pill.title = 'What this section does';
    pill.setAttribute('aria-expanded', 'false');

    for (const note of notes) note.hidden = true;

    pill.addEventListener('click', () => {
      const open = notes[0].hidden;
      for (const note of notes) note.hidden = !open;
      pill.classList.toggle('open', open);
      pill.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    section.appendChild(pill);
  }
})();
