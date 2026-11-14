/*  Holographic Particle Accelerator — Show panel
 *  Jackrabbit72380
 *  2026
 *
 *  The Show section of the controller: the modes (inside spin, music visualizer, rainbow),
 *  the visualizer presets, and the shuffle timer that swaps shapes and colours while a
 *  preset is running. It talks to the particle window through the handle src/relay.js leaves
 *  on the opener, which is the same window the rest of the panel drives.
 */

(() => {
    'use strict';

    const sections = document.getElementById('sections');
    if (!sections) return;

    const DEFAULTS = { mode: 'off', preset: 'pulse', pulse: 0.5, drift: 0.3, shuffle: 12 };
    const PRESETS = [
        ['pulse', 'Pulse — punchy, steady shape'],
        ['drift', 'Drift — slow colour and swell'],
        ['chaos', 'Chaos — shuffles shape and colour']
    ];
    const TINTS = [
        [0.63, 0.84, 1.0],
        [1.0, 0.55, 0.30],
        [0.55, 1.0, 0.62],
        [0.85, 0.55, 1.0],
        [1.0, 0.85, 0.35],
        [0.45, 1.0, 0.95],
        [1.0, 0.42, 0.62]
    ];
    const MODE_NOTES = {
        off: 'Off — the panel is in charge of everything again.',
        inside: 'Inside spin — the camera sits in the ball and it turns forever. Zoom out a touch for more room.',
        visualizer: 'Visualizer — the zoom breathes and the tint walks with the audio level.',
        rainbow: 'Rainbow — the tint sweeps the wheel on its own.'
    };

    let state = { ...DEFAULTS };
    let shuffleTimer = 0;
    let presetSelect;
    let note;

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

    function addRange(parent, options) {
        const { label, min, max, step, value, format, onInput } = options;
        const row = el('div', 'row');
        const shown = el('span', 'value', format(value));
        const input = el('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;
        row.append(el('span', 'label', label), shown, input);
        parent.appendChild(row);
        input.addEventListener('input', () => {
            const next = Number(input.value);
            shown.textContent = format(next);
            onInput(next);
        });
        return { input, shown, format };
    }

    /*--- Section ---*/

    const section = el('div', 'section');
    section.appendChild(el('h2', '', 'Show'));
    const buttons = el('div', 'buttons');
    section.appendChild(buttons);

    // Sit right under Camera, where the camera and spin controls already are.
    const camera = [...sections.querySelectorAll('.section')]
        .find((node) => node.querySelector('h2') && node.querySelector('h2').textContent === 'Camera');
    if (camera) sections.insertBefore(section, camera.nextSibling);
    else sections.appendChild(section);

    const modeButtons = new Map();
    for (const [mode, label] of [['off', 'Off'], ['inside', 'Inside spin'], ['visualizer', 'Music visualizer'], ['rainbow', 'Rainbow']]) {
        const button = el('button', mode === 'off' ? 'on' : '', label);
        button.type = 'button';
        button.addEventListener('click', () => applyMode(mode));
        buttons.appendChild(button);
        modeButtons.set(mode, button);
    }

    const presetRow = el('div', 'row wide');
    presetRow.style.marginTop = '10px';
    presetSelect = el('select');
    for (const [value, label] of PRESETS) {
        const option = el('option', '', label);
        option.value = value;
        presetSelect.appendChild(option);
    }
    presetSelect.addEventListener('change', () => {
        state.preset = presetSelect.value;
        push();
        scheduleShuffle();
    });
    presetRow.appendChild(presetSelect);
    section.appendChild(presetRow);

    const pulseRow = addRange(section, {
        label: 'Zoom pulse', min: 0, max: 1, step: 0.05, value: state.pulse,
        format: (v) => `${Math.round(v * 100)}%`,
        onInput: (value) => { state.pulse = value; push(); }
    });

    const driftRow = addRange(section, {
        label: 'Colour drift', min: 0, max: 1, step: 0.05, value: state.drift,
        format: (v) => `${Math.round(v * 100)}%`,
        onInput: (value) => { state.drift = value; push(); }
    });

    const shuffleRow = addRange(section, {
        label: 'Shuffle every', min: 4, max: 40, step: 1, value: state.shuffle,
        format: (v) => `${v} s`,
        onInput: (value) => { state.shuffle = value; scheduleShuffle(); }
    });

    note = el('div', 'note', MODE_NOTES.off);
    section.appendChild(note);

    /*--- Driving the particle window ---*/

    function push() {
        const api = player();
        if (!api || !api.show) return;
        api.show({ mode: state.mode, preset: state.preset, pulse: state.pulse, drift: state.drift });
    }

    function applyMode(mode) {
        state.mode = mode;
        for (const [key, button] of modeButtons) button.classList.toggle('on', key === mode);
        note.textContent = MODE_NOTES[mode];

        const api = player();
        if (!api) {
            note.textContent = `${MODE_NOTES[mode]} Open the particle window to start it.`;
            return;
        }

        if (mode === 'inside') {
            api.set({ VIEW: 'inside', LOOP: false, STOP_ANGLE: 0 });
        } else if (mode === 'off') {
            api.set({ LOOP: true });
        }

        if (api.show) {
            api.show({ mode, preset: state.preset, pulse: state.pulse, drift: state.drift });
        }

        scheduleShuffle();
    }

    // Chaos swaps the target and tint on a timer. The shape comes from the panel's own Random
    // shape button, so the visualizer gets the procedural targets as well as ball and spear.
    function scheduleShuffle() {
        window.clearTimeout(shuffleTimer);
        if (state.mode !== 'visualizer' || state.preset !== 'chaos') return;

        shuffleTimer = window.setTimeout(() => {
            const api = player();
            if (api) {
                const random = [...document.querySelectorAll('#sections button')]
                    .find((button) => button.textContent.trim() === 'Random shape');
                if (random) random.click();
                api.set({ COLOR: TINTS[Math.floor(Math.random() * TINTS.length)] });
            }
            scheduleShuffle();
        }, Math.max(4, Number(state.shuffle) || 12) * 1000);
    }

    function syncUi() {
        for (const [key, button] of modeButtons) button.classList.toggle('on', key === state.mode);
        presetSelect.value = state.preset;
        pulseRow.input.value = state.pulse;
        pulseRow.shown.textContent = pulseRow.format(state.pulse);
        driftRow.input.value = state.drift;
        driftRow.shown.textContent = driftRow.format(state.drift);
        shuffleRow.input.value = state.shuffle;
        shuffleRow.shown.textContent = shuffleRow.format(state.shuffle);
        note.textContent = MODE_NOTES[state.mode];
    }

    // The main panel's Reset button restores the engine; the Show settings ride along.
    const resetButton = document.getElementById('reset');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            window.clearTimeout(shuffleTimer);
            state = { ...DEFAULTS };
            syncUi();
            const api = player();
            if (api && api.show) api.show.reset();
        });
    }

    section.appendChild(el('div', 'note', 'Presets: Pulse punches with the level, Drift walks the colour slowly, Chaos also swaps the target and tint every few seconds. The zoom pulse rises and falls with whatever the Audio response section is listening to.'));
})();
