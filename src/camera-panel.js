/*  Holographic Particle Accelerator — Camera panel
 *  Jackrabbit72380
 *  2026
 *
 *  Adds the aiming controls to the Camera section: the object's tilt (0° is dead head-on),
 *  pan left/right and up/down, a four-way pad for nudging the view, and a Head-on button
 *  that puts the pitch back to zero. The arrow keys in the particle window do the same pan.
 */

(() => {
    'use strict';

    const sections = document.getElementById('sections');
    if (!sections) return;

    const camera = [...sections.querySelectorAll('.section')]
        .find((node) => node.querySelector('h2') && node.querySelector('h2').textContent === 'Camera');
    if (!camera) return;

    const DEFAULTS = { TILT: 0, PAN_X: 0, PAN_Y: 0 };
    const controls = new Map();

    // The section already ends with a note about the wheel and inside view; the new aiming
    // rows go above it, right under Settle angle, where they belong.
    const firstNote = camera.querySelector('.note');
    const place = (node) => (firstNote ? camera.insertBefore(node, firstNote) : camera.appendChild(node));

    function player() {
        const offered = window.HPA_PLAYER;
        return offered && !offered.closed && offered.HPA ? offered.HPA : null;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function send(patch) {
        const api = player();
        if (api) api.set(patch);
    }

    // The pad and the sliders write the same keys, so one nudges the other into step.
    function sync() {
        for (const [key, control] of controls) control(Number(DEFAULTS[key]) || 0);
    }

    function setValues() {
        const api = player();
        const config = api && api.config ? api.config : DEFAULTS;
        for (const [key, control] of controls) control(Number(config[key]) || 0);
    }

    function addRange(options) {
        const { key, label, min, max, step, format } = options;
        const row = el('div', 'row');
        const shown = el('span', 'value', format(DEFAULTS[key]));
        const input = el('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = DEFAULTS[key];
        row.append(el('span', 'label', label), shown, input);
        place(row);

        input.addEventListener('input', () => {
            const value = Number(input.value);
            shown.textContent = format(value);
            input.current = value;
            send({ [key]: value });
        });

        const control = (value) => {
            control.current = value;
            input.value = value;
            shown.textContent = format(value);
        };
        control.current = DEFAULTS[key];
        controls.set(key, control);
    }

    addRange({ key: 'TILT', label: 'Tilt (object)', min: -90, max: 90, step: 1, format: (v) => `${v.toFixed(0)}°` });
    addRange({ key: 'PAN_X', label: 'Pan left / right', min: -6, max: 6, step: 0.1, format: (v) => v.toFixed(1) });
    addRange({ key: 'PAN_Y', label: 'Pan up / down', min: -6, max: 6, step: 0.1, format: (v) => v.toFixed(1) });

    const padRow = el('div', 'buttons');
    padRow.style.marginTop = '10px';

    function nudge(dx, dy) {
        const api = player();
        const config = api && api.config ? api.config : DEFAULTS;
        const clamp = (value) => Math.max(-9, Math.min(9, value));
        const panX = clamp((Number(config.PAN_X) || 0) + dx);
        const panY = clamp((Number(config.PAN_Y) || 0) + dy);
        send({ PAN_X: panX, PAN_Y: panY });
        controls.get('PAN_X')(panX);
        controls.get('PAN_Y')(panY);
    }

    for (const [label, dx, dy, title] of [
        ['◀', -0.25, 0, 'Move the object left'],
        ['▲', 0, 0.25, 'Move the object up'],
        ['▼', 0, -0.25, 'Move the object down'],
        ['▶', 0.25, 0, 'Move the object right']
    ]) {
        const button = el('button', '', label);
        button.type = 'button';
        button.title = title;
        button.addEventListener('click', () => nudge(dx, dy));
        padRow.appendChild(button);
    }

    const headOn = el('button', '', 'Head-on');
    headOn.type = 'button';
    headOn.addEventListener('click', () => {
        send({ TILT: DEFAULTS.TILT, PAN_X: DEFAULTS.PAN_X, PAN_Y: DEFAULTS.PAN_Y });
        sync();
    });
    padRow.appendChild(headOn);
    place(padRow);

    camera.appendChild(el('div', 'note', 'Tilt 0° looks at the object dead level; positive pitches the top away from you. The pad slides the view, and the arrow keys in the particle window do the same — hold shift for bigger steps. Head-on puts the tilt and the pan back to zero.'));

    // The panel's Reset returns the engine to its defaults; mirror that here.
    const resetButton = document.getElementById('reset');
    if (resetButton) resetButton.addEventListener('click', () => window.setTimeout(sync, 60));

    // Coming back to a running particle window: show what it is actually set to.
    window.setTimeout(setValues, 900);
})();
