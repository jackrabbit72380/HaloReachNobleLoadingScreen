/*  Holographic Particle Accelerator — Panel
 *  Jackrabbit72380
 *  2026
 *
 *  Keeps the control panel readable: every long note becomes a small "i" pill that opens when
 *  it is clicked, instead of a paragraph that takes three lines of every section. It also takes
 *  the Equalizer ring button off the Visualizer section, because the same target already sits in
 *  the Target list as Equalizer (audio bars) — one way in is enough.
 */

(() => {
  'use strict';

  const sections = document.getElementById('sections');
  if (!sections) return;

  const style = document.createElement('style');
  style.textContent = [
    '.info-pill{width:18px;height:18px;margin:2px 0 6px;padding:0;border-radius:50%;',
    'border:1px solid rgba(143,216,255,.45);background:transparent;color:inherit;',
    'font:600 11px/1 system-ui,sans-serif;cursor:pointer;opacity:.7;flex:0 0 auto}',
    '.info-pill:hover,.info-pill.open{opacity:1;border-color:#8fd8ff}',
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

  /*--- Notes become pills ---*/

  for (const note of sections.querySelectorAll('.note')) {
    if (note.dataset.pill) continue;
    note.dataset.pill = '1';

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'info-pill';
    pill.textContent = 'i';
    pill.title = 'What this section does';
    pill.setAttribute('aria-expanded', 'false');

    note.hidden = true;
    pill.addEventListener('click', () => {
      const open = note.hidden;
      note.hidden = !open;
      pill.classList.toggle('open', open);
      pill.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    note.before(pill);
  }
})();
