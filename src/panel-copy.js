/*  Holographic Particle Accelerator — Copy
 *  Jackrabbit72380
 *  2026
 *
 *  Two tidy-ups the panel needs from outside its own file: the Capture section's buttons are cut
 *  down to short labels — the full wording lives in each tooltip — and gathered into one grid so
 *  they take two rows instead of four. Everything else is already written in sentence case; it
 *  was the stylesheet's uppercase rule that shouted, and that has gone.
 */

(() => {
  'use strict';

  const sections = document.getElementById('sections');
  if (!sections) return;

  const capture = Array.from(sections.querySelectorAll('.section')).find((node) => {
    const heading = node.querySelector('h2');
    return heading && heading.textContent === 'Capture';
  });
  if (!capture) return;

  const style = document.createElement('style');
  style.textContent = [
    '.capture-buttons{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
    '.capture-buttons button{padding:7px 2px;font-size:11px;text-align:center;white-space:nowrap}'
  ].join('');
  document.head.appendChild(style);

  // One group of buttons rather than two lists, so the whole set fits in two rows.
  const groups = Array.from(capture.querySelectorAll('.buttons'));
  const grid = groups.shift();
  for (const group of groups) {
    for (const button of Array.from(group.querySelectorAll('button'))) grid.appendChild(button);
    group.remove();
  }
  grid.classList.add('capture-buttons');

  // Short labels, with the full wording kept as the tooltip.
  const SHORT = {
    'PNG frame': ['PNG', 'Save this frame as a PNG image'],
    'WebP frame': ['WebP', 'Save this frame as a WebP image'],
    'Record WebM 5s': ['WebM 5 s', 'Record five seconds as WebM video'],
    'WebM 10s': ['WebM 10 s', 'Record ten seconds as WebM video'],
    'Record MP4 8s': ['MP4', 'Record eight seconds as MP4, where the browser supports it'],
    'Model (.obj)': ['.obj', 'Download the target as a Wavefront .obj model'],
    'Model (.ply)': ['.ply', 'Download the target as a Stanford .ply model']
  };

  for (const button of grid.querySelectorAll('button')) {
    const label = button.textContent.trim();
    const entry = SHORT[label];
    if (!entry) continue;
    button.textContent = entry[0];
    button.title = entry[1];
  }
})();
