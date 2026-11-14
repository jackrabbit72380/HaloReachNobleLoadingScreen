/*  Holographic Particle Accelerator — Caption names
 *  Jackrabbit72380
 *  2026
 *
 *  Three ways to fill the caption from what you loaded: Track, Image, Model. They sit in one row
 *  under the caption field, and each remembers the last file chosen for it — picker, drop or paste
 *  — so the option is still there after a reload.
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

  const tidy = (name) => String(name || '').replace(/\.[^.]+$/, '').trim();

  /*--- What was loaded, kept between visits ---*/

  const STORE = 'hpa.captionNames';
  const names = { track: '', image: '', model: '' };

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE) || '{}');
    for (const key of Object.keys(names)) if (typeof saved[key] === 'string') names[key] = saved[key];
  } catch (error) {
    /* nothing saved yet, or storage is off */
  }

  function save() {
    try {
      window.localStorage.setItem(STORE, JSON.stringify(names));
    } catch (error) {
      /* private mode: the names just will not persist */
    }
  }

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
    save();
    refresh();
  }

  /*--- The three buttons, one row ---*/

  const style = document.createElement('style');
  style.textContent = [
    '.name-row{display:flex;flex-wrap:nowrap;gap:6px;margin:6px 0 4px}',
    '.name-row button{flex:1 1 0;min-width:0;padding:6px 4px;font-size:11px;letter-spacing:.05em;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.name-row button:disabled{opacity:.4;cursor:default}'
  ].join('');
  document.head.appendChild(style);

  const row = document.createElement('div');
  row.className = 'name-row';

  const made = {};
  for (const [kind, label] of [['track', 'Track'], ['image', 'Image'], ['model', 'Model']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
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
      button.title = names[kind]
        ? `Use the ${kind} name: ${names[kind]}`
        : `No ${kind} loaded yet`;
    }
  }

  /*--- Watching what gets loaded ---*/

  document.addEventListener('change', (event) => {
    const field = event.target;
    if (!field || field.type !== 'file') return;
    const file = field.files && field.files[0];
    if (!file) return;

    if (field.id === 'file') return remember('image', file);
    const accept = String(field.accept || '');
    if (/audio/i.test(accept)) return remember('track', file);
    if (/\.obj|\.ply/i.test(accept)) return remember('model', file);
    return remember(classify(file), file);
  }, true);

  window.addEventListener('drop', (event) => {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files) return;
    for (const file of files) remember(classify(file), file);
  }, true);

  window.addEventListener('paste', (event) => {
    const files = event.clipboardData && event.clipboardData.files;
    if (!files) return;
    for (const file of files) remember(classify(file), file);
  }, true);

  refresh();
})();
