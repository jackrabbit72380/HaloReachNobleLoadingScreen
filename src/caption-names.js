/*  Holographic Particle Accelerator — Caption names
 *  Jackrabbit72380
 *  2026
 *
 *  Three ways to fill the caption from what you just loaded: the track that is playing, the
 *  picture, or the model. Each one remembers the last file chosen for it — by picker, drop or
 *  paste — and the buttons stay dim until there is a name to use.
 */

(() => {
  'use strict';

  const title = Array.from(document.querySelectorAll('#sections .section')).find((node) => {
    const heading = node.querySelector('h2');
    return heading && heading.textContent === 'Title';
  });
  if (!title) return;

  const input = title.querySelector('input[type="text"]');
  if (!input) return;

  // The engine lives in this window, or in the particle window this page opened.
  function engine() {
    const offered = window.HPA_PLAYER;
    if (offered && offered !== window) {
      try {
        if (!offered.closed && offered.HPA) return offered.HPA;
      } catch (error) {
        /* the particle window is not ours to read */
      }
    }
    return window.HPA || null;
  }

  // A file name without its extension: "midnight-drive.mp3" reads better as "midnight-drive".
  const tidy = (name) => String(name || '').replace(/\.[^.]+$/, '').trim();

  const names = { track: '', image: '', model: '' };

  function classify(file) {
    if (!file) return '';
    const name = String(file.name || '');
    if (/\.(obj|ply)$/i.test(name)) return 'model';
    if (/^audio\//i.test(file.type || '') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(name)) return 'track';
    if (/^image\//i.test(file.type || '') || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(name)) return 'image';
    return '';
  }

  function remember(kind, file) {
    const name = tidy(file && file.name);
    if (!kind || !name) return;
    names[kind] = name;
    refresh();
  }

  /*--- The buttons ---*/

  const style = document.createElement('style');
  style.textContent = '.name-row{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px}' +
    '.name-row button{flex:0 0 auto;padding:5px 9px;font-size:11px;letter-spacing:.04em}' +
    '.name-row button:disabled{opacity:.4;cursor:default}';
  document.head.appendChild(style);

  const row = document.createElement('div');
  row.className = 'name-row';

  const made = {};
  for (const [kind, label] of [['track', 'Use track name'], ['image', 'Use image name'], ['model', 'Use model name']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = true;
    button.title = 'Fills the caption with the name of the last file you loaded';
    button.addEventListener('click', () => {
      if (!names[kind]) return;
      input.value = names[kind];
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const api = engine();
      if (api && api.set) api.set({ LABEL: names[kind] });
    });
    row.appendChild(button);
    made[kind] = button;
  }

  const captionRow = input.closest('.row') || input.parentElement;
  if (captionRow) captionRow.after(row);
  else title.appendChild(row);

  function refresh() {
    for (const [kind, button] of Object.entries(made)) {
      button.disabled = !names[kind];
      button.textContent = names[kind]
        ? `${kind === 'track' ? 'Use track' : kind === 'image' ? 'Use image' : 'Use model'}: ${names[kind]}`
        : kind === 'track' ? 'Use track name' : kind === 'image' ? 'Use image name' : 'Use model name';
    }
  }

  /*--- Watching what gets loaded ---*/

  // One listener for every file input, catching the event on its way down: the panel's own
  // inputs are built in another file, and a picker may be added later, so nothing here depends on
  // holding a reference to a particular element.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || input.type !== 'file') return;
    const file = input.files && input.files[0];
    if (!file) return;

    if (input.id === 'file') return remember('image', file);
    const accept = String(input.accept || '');
    if (/audio/i.test(accept)) return remember('track', file);
    if (/\.obj|\.ply/i.test(accept)) return remember('model', file);
    return remember(classify(file), file);
  }, true);

  // Dropping and pasting skip the inputs, so the files are read here instead.
  const pick = (event) => {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files) return;
    for (const file of files) remember(classify(file), file);
  };
  window.addEventListener('drop', pick, true);
  window.addEventListener('paste', (event) => {
    const items = event.clipboardData && event.clipboardData.files;
    if (!items) return;
    for (const file of items) remember(classify(file), file);
  }, true);

  refresh();
})();
