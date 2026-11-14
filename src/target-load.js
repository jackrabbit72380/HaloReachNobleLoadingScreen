/*  Holographic Particle Accelerator — Load
 *  Jackrabbit72380
 *  2026
 *
 *  One button for both kinds of file. The panel used to offer Load image… and Model file… side by
 *  side, which is two doors into the same room: a picture and a mesh both replace the target, and
 *  the file's own extension says which is which. This gives the Target section a single Load…
 *  that opens one picker for either, and hands the file to the control that already knows what to
 *  do with it — the same import, the same status line, the same drop-and-paste path.
 */

(() => {
  'use strict';

  const section = Array.from(document.querySelectorAll('#sections .section')).find((node) => {
    const title = node.querySelector('h2');
    return title && title.textContent === 'Target';
  });
  if (!section) return;

  const buttons = section.querySelector('.buttons');
  if (!buttons) return;

  const byText = (pattern) =>
    Array.from(buttons.querySelectorAll('button')).find((button) => pattern.test(button.textContent.trim()));

  const imageButton = byText(/^load image/i);
  const modelButton = byText(/^model file/i);
  if (!imageButton || !modelButton) return;

  const imageInput = document.getElementById('file');
  const modelInput = section.querySelector('input[type="file"][accept*=".obj"]');
  if (!imageInput || !modelInput) return;

  // One picker, both kinds. The order puts pictures first, because that is the commoner one.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.hidden = true;
  picker.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,.obj,.ply';
  section.appendChild(picker);

  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Load…';

  buttons.insertBefore(loadButton, imageButton);
  imageButton.remove();
  modelButton.remove();

  // The 90 degree tilt lives with the model import, so asking for a file is the moment it can.
  const tiltRow = document.querySelector('.tilt-row');
  loadButton.addEventListener('click', () => {
    if (tiltRow) tiltRow.hidden = false;
    picker.click();
  });

  // Hand the file to the input that owns it: set its files, then let its own listener run, so
  // nothing about importing or loading changes — only the way the file is chosen.
  picker.addEventListener('change', () => {
    const file = picker.files && picker.files[0];
    picker.value = '';
    if (!file) return;

    const isModel = /\.(obj|ply)$/i.test(file.name);
    const target = isModel ? modelInput : imageInput;

    const carrier = new DataTransfer();
    carrier.items.add(file);
    target.files = carrier.files;
    target.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
