/*  Holographic Particle Accelerator — Layers
 *  Jackrabbit72380
 *  2026
 *
 *  The two layers, side by side: the target in front, the background behind it. Each has its own
 *  on/off, and the background has its own source — any built-in shape, or a picture or model you
 *  load just for it — plus its own size, turn, brightness and band height, so it can move
 *  independently of the target.
 *
 *  Target off is a blank shape: the engine has no opacity of its own for the target, and a shape
 *  with no points is the one thing that draws nothing at all while it is off.
 */

(() => {
  'use strict';

  const root = document.getElementById('sections');
  if (!root) return;

  // The shapes the Target list offers, without the ones that only make sense as a target:
  // an imported mesh lives in memory, and a picture is flat.
  const SHAPES = [
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
    ['blob3d', 'Blob (audio)']
  ];

  const BLANK = 'hpaBlank';

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

  /*--- What the engine needs registered ---*/

  // The layer's band height is baked into the heights of its points, so each shape is registered
  // a second time under its own name; the target keeps the shared setting.
  let bandHeight = 0.5;

  function registerShapes() {
    const api = engine();
    if (!api || !api.shapes || api.shapes.hpaLayerShapes) return;

    api.shapes[BLANK] = () => [];

    for (const [value] of SHAPES) {
      const base = api.shapes[value];
      if (typeof base !== 'function') continue;
      api.shapes[value + ':layer'] = () =>
        base().map((point) => Object.assign({}, point, { height: (Number(point.height) || 0) * bandHeight }));
    }
    api.shapes.hpaLayerShapes = true;
  }

  /*--- Files for the background ---*/

  let fileCount = 0;

  // A point cloud from anything the panel can read: a picture, an .obj, or an ASCII .ply.
  function fit(points, world) {
    if (!points.length) return points;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const centreZ = (minZ + maxZ) / 2;
    const reach = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scale = (world * 0.62) / reach;

    for (const p of points) {
      p.x = (p.x - centreX) * scale;
      p.y = (p.y - centreY) * scale;
      p.z = (p.z - centreZ) * scale;
      p.wait = Math.random();
      if (p.height === undefined) p.height = 0.3;
      if (p.band === undefined) p.band = 0;
    }
    return points;
  }

  function imagePoints(file, world) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('that image would not open')); };
      image.onload = () => {
        const width = 130;
        const height = Math.max(2, Math.round(width * ((image.height || 1) / (image.width || 1))));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        URL.revokeObjectURL(url);

        const points = [];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            const alpha = pixels[at + 3] / 255;
            const light = (pixels[at] * 0.299 + pixels[at + 1] * 0.587 + pixels[at + 2] * 0.114) / 255;
            const ink = alpha < 0.12 ? 0 : Math.abs(light - 0.5) * 2;
            if (ink < 0.35) continue;
            points.push({
              x: (x + Math.random()) / width - 0.5,
              y: 0.5 - (y + Math.random()) / height,
              z: (Math.random() - 0.5) * 0.04
            });
          }
        }
        resolve(fit(points, world));
      };
      image.src = url;
    });
  }

  function meshPoints(vertices, faces, world) {
    const points = [];
    if (!faces.length) {
      for (const vertex of vertices) points.push({ x: vertex[0], y: vertex[1], z: vertex[2] });
      return fit(points, world);
    }

    // Area-weighted over the triangles, so a dense corner fills in as densely as the file says.
    const areas = faces.map((face) => {
      let total = 0;
      for (let i = 1; i < face.length - 1; i++) {
        const a = vertices[face[0]];
        const b = vertices[face[i]];
        const c = vertices[face[i + 1]];
        if (!a || !b || !c) continue;
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        total += Math.hypot(
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0]
        ) / 2;
      }
      return total;
    });
    const sum = areas.reduce((a, b) => a + b, 0) || 1;
    const wanted = 16000;

    faces.forEach((face, index) => {
      const share = Math.max(1, Math.round((areas[index] / sum) * wanted));
      for (let n = 0; n < share; n++) {
        let u = Math.random();
        let v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const a = vertices[face[0]];
        const b = vertices[face[1]] || a;
        const c = vertices[face[2]] || a;
        if (!a) continue;
        points.push({
          x: a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
          y: a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
          z: a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v
        });
      }
    });
    return fit(points, world);
  }

  function objPoints(text, world) {
    const vertices = [];
    const faces = [];
    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'v') vertices.push([Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0]);
      else if (parts[0] === 'f') {
        const face = parts.slice(1).map((token) => parseInt(token.split('/')[0], 10) - 1).filter((i) => i >= 0);
        if (face.length >= 3) faces.push(face);
      }
    }
    if (!vertices.length) throw new Error('no vertices in that .obj');
    return meshPoints(vertices, faces, world);
  }

  function plyPoints(text, world) {
    if (/^format\s+binary/i.test(text.slice(0, 400))) throw new Error('export that .ply as ASCII, or use .obj');
    const lines = text.split('\n');
    let count = 0;
    let headerEnd = 0;
    let index = 0;
    for (; index < lines.length; index++) {
      const line = lines[index].trim();
      if (/^element\s+vertex\s+(\d+)/i.test(line)) count = parseInt(RegExp.$1, 10);
      if (/^end_header/i.test(line)) { headerEnd = index + 1; break; }
    }
    const vertices = [];
    for (let i = headerEnd; i < headerEnd + count && i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 3) continue;
      vertices.push([Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0]);
    }
    if (!vertices.length) throw new Error('no vertices in that .ply');
    return meshPoints(vertices, [], world);
  }

  async function pointsFor(file) {
    const api = engine();
    const world = Number((api && api.config && api.config.MASK_HEIGHT) || 4.6);
    const name = String(file.name || '').toLowerCase();

    if (/^image\//i.test(file.type || '') || /\.(png|jpe?g|webp|gif|avif|svg)$/.test(name)) return imagePoints(file, world);
    if (name.endsWith('.obj')) return objPoints(await file.text(), world);
    if (name.endsWith('.ply')) return plyPoints(await file.text(), world);
    throw new Error('use an image, .obj or .ply');
  }

  /*--- The panel ---*/

  // The blob is a target like any other, so it belongs in the Target list.
  const targetSelect = root.querySelector('select');
  if (targetSelect && !Array.from(targetSelect.options).some((option) => option.value === 'blob3d')) {
    const option = el('option', '', 'Blob (audio)');
    option.value = 'blob3d';
    const meshOption = Array.from(targetSelect.options).find((item) => item.value === 'mesh');
    targetSelect.insertBefore(option, meshOption || null);
    targetSelect.addEventListener('change', () => {
      if (targetSelect.value === 'blob3d') apply({ MODE: 'shape', MASK_SRC: 'blob3d' });
    });
  }

  const panel = el('div', 'section');
  panel.appendChild(el('h2', '', 'Layers'));

  // Both toggles on one row: target on the left, background on the right.
  const toggles = el('div', 'buttons');
  panel.appendChild(toggles);

  const targetButton = el('button', '', 'Target');
  targetButton.type = 'button';
  targetButton.setAttribute('role', 'checkbox');
  toggles.appendChild(targetButton);

  const layerButton = el('button', '', 'Background');
  layerButton.type = 'button';
  layerButton.setAttribute('role', 'checkbox');
  toggles.appendChild(layerButton);

  // Background: its own source, shapes or a file of its own.
  const sourceRow = el('div', 'row wide');
  sourceRow.appendChild(el('span', 'label', 'Background source'));
  const sourceSelect = el('select');
  for (const [value, label] of SHAPES) {
    const option = el('option', '', label);
    option.value = value + ':layer';
    sourceSelect.appendChild(option);
  }
  sourceRow.appendChild(sourceSelect);
  panel.appendChild(sourceRow);

  const loadRow = el('div', 'buttons');
  const loadButton = el('button', '', 'Load for background…');
  loadButton.type = 'button';
  loadRow.appendChild(loadButton);
  panel.appendChild(loadRow);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,.obj,.ply';
  fileInput.hidden = true;
  panel.appendChild(fileInput);

  /*--- State ---*/

  let targetOn = true;
  let lastTarget = 'ball';
  let switchedOn = false;
  let chosen = 'ball:layer';

  function paint() {
    targetButton.classList.toggle('on', targetOn);
    targetButton.setAttribute('aria-checked', targetOn ? 'true' : 'false');

    layerButton.classList.toggle('on', switchedOn);
    layerButton.setAttribute('aria-checked', switchedOn ? 'true' : 'false');

    sourceSelect.disabled = !switchedOn;
    loadButton.disabled = !switchedOn;
  }

  targetButton.addEventListener('click', () => {
    const api = engine();
    if (!api) return;
    targetOn = !targetOn;

    if (targetOn) {
      apply({ MODE: 'shape', MASK_SRC: lastTarget && lastTarget !== BLANK ? lastTarget : 'ball' });
    } else {
      if (api.config.MASK_SRC && api.config.MASK_SRC !== BLANK) lastTarget = api.config.MASK_SRC;
      apply({ MODE: 'shape', MASK_SRC: BLANK });
    }
    paint();
  });

  layerButton.addEventListener('click', () => {
    switchedOn = !switchedOn;
    paint();
    apply({ LAYER_SRC: switchedOn ? chosen : 'off' });
  });

  sourceSelect.addEventListener('change', () => {
    chosen = sourceSelect.value;
    if (switchedOn) apply({ LAYER_SRC: chosen });
  });

  /*--- Sliders ---*/

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

  slider('LAYER_SCALE', 'Size', 0.8, 8, 0.1, 3, (v) => `${v.toFixed(1)}×`);
  slider('LAYER_SPIN', 'Turn', -0.5, 0.5, 0.005, -0.04,
    (v) => `${v.toFixed(3)} turns/s`, (v) => v * turn, decimal(3));
  slider('LAYER_ALPHA', 'Brightness', 0, 1, 0.05, 0.6, (v) => `${Math.round(v * 100)}%`);

  // The layer's own audio weight: it scales the heights baked into its points.
  const bandRow = el('div', 'row');
  const bandShown = el('span', 'value', `${bandHeight.toFixed(2)}×`);
  const bandInput = el('input');
  bandInput.type = 'range';
  bandInput.min = 0;
  bandInput.max = 2;
  bandInput.step = 0.05;
  bandInput.value = bandHeight;
  bandRow.append(el('span', 'label', 'Band height'), bandShown, bandInput);
  panel.appendChild(bandRow);

  bandInput.addEventListener('input', () => {
    bandHeight = Number(bandInput.value);
    bandShown.textContent = `${bandHeight.toFixed(2)}×`;
  });

  bandInput.addEventListener('change', () => {
    if (switchedOn) apply({ LAYER_SRC: chosen });
  });

  sliders.LAYER_BAND = (configValue) => {
    bandHeight = Math.max(0, Math.min(2, Number(configValue) || 0));
    bandInput.value = bandHeight;
    bandShown.textContent = `${bandHeight.toFixed(2)}×`;
  };

  /*--- Loading a file for the background ---*/

  loadButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    const status = document.getElementById('status');
    if (status) status.textContent = `reading ${file.name.slice(0, 24)}`;

    try {
      const points = await pointsFor(file);
      const api = engine();
      if (!api || !api.shapes) throw new Error('this page has no engine');
      if (!points.length) throw new Error('nothing to sample in that file');

      const key = `hpaLayer:${++fileCount}`;
      api.shapes[key] = () => points;

      const option = el('option', '', file.name.replace(/\.[^.]+$/, '').slice(0, 22));
      option.value = key;
      sourceSelect.appendChild(option);
      sourceSelect.value = key;

      chosen = key;
      switchedOn = true;
      paint();
      apply({ LAYER_SRC: key });
      if (status) status.textContent = 'background ready';
    } catch (error) {
      if (status) status.textContent = String(error.message).slice(0, 64);
    }
  });

  // The panel sits where it always did: straight after the Band height section.
  const anchor = Array.from(root.children).find((node) => {
    const heading = node.querySelector('h2');
    return heading && (heading.textContent === 'Band height' || heading.textContent === 'Visualizer');
  });
  if (anchor) anchor.after(panel);
  else root.appendChild(panel);

  registerShapes();
  paint();

  /*--- Keeping the panel honest ---*/

  function sync() {
    const api = engine();
    const config = api && api.config ? api.config : null;
    if (!config) return false;

    if ('MASK_SRC' in config) {
      targetOn = String(config.MASK_SRC) !== BLANK;
      if (targetOn && config.MODE === 'shape') lastTarget = String(config.MASK_SRC);
      paint();
    }

    if ('LAYER_SRC' in config) {
      const source = String(config.LAYER_SRC || 'off');
      switchedOn = source !== 'off';
      if (switchedOn) {
        chosen = source;
        if (!Array.from(sourceSelect.options).some((option) => option.value === source)) {
          const option = el('option', '', 'Loaded file');
          option.value = source;
          sourceSelect.appendChild(option);
        }
        sourceSelect.value = source;
      }
      paint();
    }

    for (const [key, update] of Object.entries(sliders)) {
      if (key in config) update(config[key]);
    }
    return true;
  }

  let tries = 0;
  const timer = window.setInterval(() => {
    if (sync() || ++tries > 24) window.clearInterval(timer);
  }, 500);

  const resetButton = document.getElementById('reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => window.setTimeout(sync, 600));
  }
})();
