/*  Holographic Particle Accelerator — Model tilt
 *  Jackrabbit72380
 *  2026
 *
 *  Some exporters — Blender's own default among them — write their geometry standing up along
 *  Z, so a model arrives on its side with a 90 degree tilt. This adds "Apply 90° tilt" to the
 *  model import: ticked, a model is turned a quarter turn about X on its way in, and a model
 *  already on screen turns with the tick, so the fix can be checked without importing again.
 *
 *  It belongs to the model file, not to the shape list, so it stays out of sight until Model
 *  file… is used, and goes away again when a different target is picked.
 */

(() => {
  'use strict';

  const HPA = window.HPA;
  if (!HPA || !HPA.setPointCloud || !HPA.importModel) return;

  const install = HPA.setPointCloud.bind(HPA);
  const readModel = HPA.importModel.bind(HPA);

  let turnedOn = false;
  let model = null; // { straight, turned } — the cloud as the file had it, and a quarter turn on

  // A quarter turn about X: whatever stood along Z now stands along Y.
  function tilt(points) {
    return points.map((point) => Object.assign({}, point, { x: point.x, y: point.z, z: -point.y }));
  }

  // Imports reach the engine through one call, so the turn is made there: the cloud lands in
  // the right orientation and assembles once, instead of arriving and then pivoting.
  let intake = null;

  HPA.setPointCloud = (points, ...rest) => {
    if (intake && Array.isArray(points) && points.length) {
      intake.straight = points;
      if (turnedOn) {
        intake.turned = tilt(points);
        return install(intake.turned, ...rest);
      }
    }
    return install(points, ...rest);
  };

  HPA.importModel = async (file) => {
    const outer = intake;
    intake = { straight: null, turned: null };
    try {
      const result = await readModel(file);
      if (intake.straight) {
        model = { straight: intake.straight, turned: intake.turned || tilt(intake.straight) };
        reveal();
      }
      return result;
    } finally {
      intake = outer;
    }
  };

  // Swapping orientation afterwards: install the cloud, then frame it again, because a quarter
  // turn changes which way the model reaches on screen.
  async function show(points) {
    await install(points);
    HPA.set({ MODE: 'shape' });
    if (HPA.fitZoom) {
      const fit = HPA.fitZoom();
      if (Number.isFinite(fit)) HPA.set({ ZOOM: Math.max(0.35, Math.min(6, fit)) });
    }
  }

  /*--- The tick box ---*/

  const style = document.createElement('style');
  style.textContent = [
    '.tilt-row[hidden]{display:none!important}',
    '.tilt-row{display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:2px 0 8px}',
    '.tilt-row input[type="checkbox"]{width:16px;height:16px;margin:0;flex:0 0 auto;cursor:pointer;accent-color:#8fd8ff}',
    '.tilt-row label{margin:0;flex:1 1 auto;text-align:left;font-size:12px;cursor:pointer;opacity:.85}'
  ].join('');
  document.head.appendChild(style);

  const row = document.createElement('div');
  row.className = 'row tilt-row';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'tilt-model';

  const label = document.createElement('label');
  label.htmlFor = 'tilt-model';
  label.textContent = 'Apply 90° tilt on import';

  row.append(box, label);

  const target = Array.from(document.querySelectorAll('#sections .section')).find((section) => {
    const title = section.querySelector('h2');
    return title && title.textContent === 'Target';
  });
  if (target) {
    const buttons = target.querySelector('.buttons');
    if (buttons) buttons.after(row);
    else target.appendChild(row);
  }
  row.hidden = true;

  box.addEventListener('change', () => {
    turnedOn = box.checked;
    if (!model) return;
    show(turnedOn ? model.turned : model.straight);
  });

  /*--- When it shows ---*/

  function reveal() {
    row.hidden = false;
  }

  const modelButton = Array.from(document.querySelectorAll('button')).find(
    (button) => /^model file/i.test(button.textContent.trim())
  );
  if (modelButton) {
    modelButton.addEventListener('click', reveal);
  }

  // Picking another target puts the model away, so the box goes with it.
  const presetSelect = target ? target.querySelector('select') : null;
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      if (presetSelect.value !== 'mesh') row.hidden = true;
    });
  }

  // A model on screen keeps it on show, even after a reload of the panel.
  let settleTries = 0;
  const settle = window.setInterval(() => {
    if (HPA.config && HPA.config.MASK_SRC === 'mesh') {
      reveal();
      window.clearInterval(settle);
    } else if (++settleTries > 20) {
      window.clearInterval(settle);
    }
  }, 700);
})();
