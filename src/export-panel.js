/*  Holographic Particle Accelerator — Model export panel
 *  Jackrabbit72380
 *  2026
 *
 *  Adds the model download to the Capture section, next to the PNG and video buttons.
 *  The file is written inside the particle window (that is where the geometry lives) and
 *  handed to the browser from there.
 */

(() => {
    'use strict';

    const sections = document.getElementById('sections');
    if (!sections) return;

    const capture = [...sections.querySelectorAll('.section')]
        .find((node) => node.querySelector('h2') && node.querySelector('h2').textContent === 'Capture');
    if (!capture) return;

    function player() {
        const offered = window.HPA_PLAYER;
        return offered && !offered.closed && offered.HPA ? offered.HPA : null;
    }

    const row = document.createElement('div');
    row.className = 'buttons';
    row.style.marginTop = '10px';

    for (const [format, label] of [['obj', 'Model (.obj)'], ['ply', 'Model (.ply)']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
            const api = player();
            if (api && api.exportModel) api.exportModel(format);
        });
        row.appendChild(button);
    }

    capture.appendChild(row);

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'The model is the chosen target as a point cloud in world units — one vertex per particle, no faces. Blender imports either file directly (File → Import → Wavefront .obj, or Stanford .ply), then instance a sphere or metaball on the points. A .blend cannot be written here: it is Blender’s own memory dump with that version’s schema, so only Blender can save one.';
    capture.appendChild(note);
})();
