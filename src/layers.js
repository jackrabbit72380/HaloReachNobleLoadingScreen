/*  Holographic Particle Accelerator — Layers
 *  Jackrabbit72380
 *  2026
 *
 *  The background layer: a second point cloud behind the target, built from any shape and
 *  sized until the camera sits inside it. It lives beside the controller rather than inside
 *  it, so this panel can be loaded on its own — it only needs the engine's LAYER_* settings
 *  and the panel's own classes.
 */

(() => {
  'use strict';

  const root = document.getElementById('sections');
  if (!root) return;

  const SHAPES = [
    ['off', 'Off'],
    ['ball', 'Ball (3D)'],
    ['cube', 'Cube (3D)'],
    ['torus', 'Torus (3D)'],
    ['atom', 'Atom (3D)'],
    ['helix', 'Helix (3D)'],
    ['pyramid', 'Pyramid (3D)'],
    ['star', 'Star (3D)'],
    ['spear', 'Spear (3D)'],
    ['equalizer', 'Equalizer (audio bars)'],
    ['grid', 'Grid (audio bars)'],
    ['blob', 'Blob (audio)']
  ];

  // The engine lives in this window when the panel is docked, or in the window this page
  // opened. Both are same-origin, so one lookup covers either case.
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

  function apply(patch) {
    const api = engine();
    if (api && api.set) api.set(patch);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /*--- The Blob target ---*/

  // The blob is a target like any other, so it belongs in the Target list.
  const targetSelect = root.querySelector('select');
  if (targetSelect && !Array.from(targetSelect.options).some((option) => option.value === 'blob')) {
    const option = el('option', '', 'Blob (audio)');
    option.value = 'blob';
    const meshOption = Array.from(targetSelect.options).find((item) => item.value === 'mesh');
    targetSelect.insertBefore(option, meshOption || null);
    targetSelect.addEventListener('change', () => {
      if (targetSelect.value === 'blob') apply({ MODE: 'shape', MASK_SRC: 'blob' });
    });
  }

  /*--- The Layers section ---*/

  const panel = el('div', 'section');
  panel.appendChild(el('h2', '', 'Layers'));

  const sourceRow = el('div', 'row wide');
  sourceRow.appendChild(el('span', 'label', 'Background shape'));
  const sourceSelect = el('select');
  for (const [value, label] of SHAPES) {
    const option = el('option', '', label);
    option.value = value;
    sourceSelect.appendChild(option);
  }
  sourceRow.appendChild(sourceSelect);
  panel.appendChild(sourceRow);
  sourceSelect.addEventListener('change', () => apply({ LAYER_SRC: sourceSelect.value }));

  // One slider shape for all three settings: label, live value, and the config key it drives.
  const sliders = {};

  function slider(key, label, min, max, step, value, format, toConfig, fromConfig) {
    const row = el('div', 'row');
    const shown = el('span', 'value', format(value));
    const input = el('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    row.append(el('span', 'label', label), shown, input);
    panel.appendChild(row);

    input.addEventListener('input', () => {
      const next = Number(input.value);
      shown.textContent = format(next);
      apply({ [key]: toConfig ? toConfig(next) : next });
    });

    sliders[key] = (configValue) => {
      const shownValue = fromConfig ? fromConfig(configValue) : Number(configValue);
      input.value = shownValue;
      shown.textContent = format(shownValue);
    };
    return input;
  }

  const turn = Math.PI * 2;
  const decimal = (places) => (number) => Number(number.toFixed(places));

  slider('LAYER_SCALE', 'Layer size', 0.8, 8, 0.1, 3,
    (v) => `${v.toFixed(1)}×`);
  slider('LAYER_SPIN', 'Layer spin', -0.5, 0.5, 0.005, -0.04,
    (v) => `${v.toFixed(3)} turns/s`, (v) => v * turn, decimal(3));
  slider('LAYER_ALPHA', 'Layer brightness', 0, 1, 0.05, 0.6,
    (v) => `${Math.round(v * 100)}%`);

  panel.appendChild(el('div', 'note', 'The layer is drawn behind the target from its own point cloud — pick any shape, size it up until the camera sits inside it, and it turns on its own. It ignores Tilt, Pan and Pivot so the target stays exactly where you put it.'));

  // The panel sits where it always did: straight after the Visualizer section.
  const visualizer = Array.from(root.children).find((node) => {
    const title = node.querySelector('h2');
    return title && title.textContent === 'Visualizer';
  });
  if (visualizer) visualizer.after(panel);
  else root.appendChild(panel);

  /*--- Keeping the panel honest ---*/

  function sync() {
    const api = engine();
    const config = api && api.config ? api.config : null;
    if (!config) return false;

    if ('LAYER_SRC' in config) {
      const known = Array.from(sourceSelect.options).some((option) => option.value === config.LAYER_SRC);
      sourceSelect.value = known ? config.LAYER_SRC : 'off';
    }
    for (const [key, update] of Object.entries(sliders)) {
      if (key in config) update(config[key]);
    }
    if (targetSelect && config.MODE === 'shape' && config.MASK_SRC === 'blob') targetSelect.value = 'blob';
    return true;
  }

  // The engine may still be assembling its first target; a few tries is enough.
  let tries = 0;
  const timer = window.setInterval(() => {
    if (sync() || ++tries > 24) window.clearInterval(timer);
  }, 500);

  const resetButton = document.getElementById('reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => window.setTimeout(sync, 600));
  }
})();
