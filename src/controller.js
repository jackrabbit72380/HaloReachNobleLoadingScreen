/*  Holographic Particle Accelerator — Controller
 *  Jackrabbit72380
 *  2026
 *
 *  Drives the animation in the window it lives in (the dock in index.html) or in a separate
 *  window it opens (controller.html). Both pages are same-origin: the controller keeps a
 *  reference to the player window and calls window.HPA on it directly, with no embedding and
 *  no message protocol.
 *
 *  Every section of the panel is built here, in the order it appears:
 *    Reset, Target, Title, Particles, Camera, Show, Visualizer, Layers, Timing, Look, Effects, Audio, Capture
 */

(() => {
    'use strict';

    const wrap = document.getElementById('wrap');
    const statusEl = document.getElementById('status');
    const connectionEl = document.getElementById('connection');
    const sectionsRoot = document.getElementById('sections');
    const fileInput = document.getElementById('file');
    const openButton = document.getElementById('open-player');
    const focusButton = document.getElementById('focus-player');
    const closeButton = document.getElementById('close-player');
    const resetButton = document.getElementById('reset');

    const controls = new Map();
    const PLAYER_NAME = 'hpa-player';
    const PLAYER_FEATURES = 'popup=yes,width=1280,height=760';

    let player = null;
    let connected = false;
    let pollTimer = 0;
    let resuming = !!window.HPA_PLAYER;

    let audioCtx = null;
    let analyser = null;
    let audioData = null;
    let freqData = null;
    let audioOn = false;
    let audioRaf = 0;
    let sensitivity = 1;
    let audioElement = null;
    let mediaStream = null;
    let captureMode = '';

    /*--- Player window ---*/

    // The particle window keeps offering its own handle to the opener, so reloading this page
    function attachedPlayer() {
        if (player && !player.closed) {
            try {
                if (player.HPA) return player;
            } catch (error) {
                /* navigated somewhere we cannot touch */
            }
        }

        const offered = window.HPA_PLAYER;
        if (offered && offered !== window) {
            try {
                if (!offered.closed && offered.HPA) {
                    if (!player) resuming = true;
                    player = offered;
                    return player;
                }
            } catch (error) {
                /* not ours to touch */
            }
        }

        return null;
    }

    function playerApi() {
        const live = attachedPlayer();
        return live ? live.HPA : null;
    }

    function playerUrl() {
        return new URL('index.html', window.location.href).href;
    }

    // Asks for the window of that name as it is — an empty URL means "do not navigate" — so a
    function reclaim() {
        let existing;
        try {
            existing = window.open('', PLAYER_NAME);
        } catch (error) {
            return null;
        }
        if (!existing || existing === window) return null;

        try {
            if (existing.closed) return null;
            if (existing.HPA) return existing;          // still running: reuse untouched
            if (existing.document && existing.document.URL === 'about:blank') {
                existing.location.replace(playerUrl()); // empty shell the browser just made
                return existing;
            }
        } catch (error) {
            return null;
        }

        return null;                                    // showing another site: leave it alone
    }

    function needPlayer() {
        setStatus('open the particle window first', 'bad');
        openButton.classList.add('on');
        window.setTimeout(() => openButton.classList.remove('on'), 1200);
        return null;
    }

    function openPlayer() {
        const live = attachedPlayer();
        if (live) {
            live.focus();
            setStatus('reconnected — animation kept running', '');
            updateConnection();
            return;
        }
        const reclaimed = reclaim();
        if (reclaimed) {
            player = reclaimed;
            setStatus('reconnected — animation kept running', '');
            poll();
            return;
        }
        player = window.open(playerUrl(), PLAYER_NAME, PLAYER_FEATURES);
        if (!player) {
            setStatus('popup blocked — allow popups', 'bad');
            return;
        }
        setStatus('opening particle window…', 'busy');
        poll();
    }

    function focusPlayer() {
        const live = attachedPlayer();
        if (live) live.focus();
        else needPlayer();
    }

    function closePlayer() {
        const live = attachedPlayer();
        if (live) live.close();
        player = null;
        try { delete window.HPA_PLAYER; } catch (error) { /* already gone */ }
        connected = false;
        setStatus('particle window closed', '');
        updateConnection();
    }

    openButton.addEventListener('click', openPlayer);
    focusButton.addEventListener('click', focusPlayer);
    closeButton.addEventListener('click', closePlayer);
    resetButton.addEventListener('click', resetAll);

    // Reset sits at the very top of the panel, above every section — the button you reach for
    const resetSection = el('div', 'section');
    const resetRow = el('div', 'buttons');
    resetSection.appendChild(resetRow);
    sectionsRoot.insertBefore(resetSection, sectionsRoot.firstChild);
    resetButton.classList.remove('ghost');
    resetButton.style.width = '100%';
    resetRow.appendChild(resetButton);

    // Puts both sides back to the shipped settings: the engine restores its CONFIG and
    async function resetAll() {
        const api = playerApi();
        if (!api) return needPlayer();
        setStatus('resetting', 'busy');
        leaveEqualizer(api);
        await api.reset();
        syncControls(api.config);
        resetShow();
        setStatus('reset to defaults', '');
        window.setTimeout(() => {
            if (connected && statusEl.textContent === 'reset to defaults') setStatus('connected', '');
        }, 2200);
    }

    function syncControls(config) {
        for (const [key, control] of controls) {
            if (key in config) control.set(config[key]);
        }

        densityInput.value = config.SAMPLE_WIDTH;
        densityValue.textContent = `${Number(config.SAMPLE_WIDTH).toFixed(0)} px`;

        const known = PRESETS.some(([value]) => value === config.MASK_SRC);
        presetSelect.value = config.MODE === 'equalizer'
            ? 'equalizer'
            : config.MODE === 'grid' ? 'grid' : known ? config.MASK_SRC : 'ball';

        eqOn = config.MODE === 'equalizer';
        eqButton.classList.toggle('on', eqOn);
        syncViewButtons(config.VIEW);
        syncInfinite(!config.LOOP);
    }

    function updateConnection() {
        const api = playerApi();
        const open = !!player && !player.closed;
        connectionEl.textContent = api
            ? `Connected to the particle window${api.snapshot ? ` — ${api.snapshot().count.toLocaleString()} particles` : ''}. Every control below applies live.`
            : open
                ? 'Particle window found, waiting for its engine to finish loading…'
                : 'Not connected. The particle window opens separately and this panel drives it.';
        connectionEl.className = api ? 'note good' : 'note';
    }

    function poll() {
        window.clearTimeout(pollTimer);
        const api = playerApi();

        if (api && !connected) {
            connected = true;
            setStatus(resuming ? 'reconnected — animation kept running' : 'connected', '');
            resuming = false;
        } else if (!api && connected) {
            connected = false;
            setStatus(player && !player.closed ? 'reconnecting…' : 'particle window closed', 'bad');
        }

        updateConnection();
        pollTimer = window.setTimeout(poll, 700);
    }

    function set(patch) {
        const api = playerApi();
        if (!api) return needPlayer();
        api.set(patch);
        return api;
    }

    /*--- Messaging helpers ---*/

    function setStatus(text, tone = '') {
        statusEl.textContent = text;
        statusEl.className = 'status ' + tone;
    }

    /*--- Small DOM helpers ---*/

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function section(title) {
        const node = el('div', 'section');
        node.appendChild(el('h2', '', title));
        sectionsRoot.appendChild(node);
        return node;
    }

    // toConfig / fromConfig let a slider work in its own unit — turns per second, say — while
    function addRange(parent, options) {
        const {
            key, label, min, max, step, value,
            format = (v) => String(v), live = true,
            toConfig = (v) => v, fromConfig = (v) => v
        } = options;
        const row = el('div', 'row');
        const name = el('span', 'label', label);
        const shown = el('span', 'value', format(value));
        const input = el('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;
        row.append(name, shown, input);
        parent.appendChild(row);

        input.addEventListener('input', () => {
            const next = Number(input.value);
            shown.textContent = format(next);
            if (live) set({ [key]: toConfig(next) });
        });
        if (!live) {
            input.addEventListener('change', () => set({ [key]: toConfig(Number(input.value)) }));
        }

        controls.set(key, {
            set(next) {
                const slider = fromConfig(Number(next));
                input.value = slider;
                shown.textContent = format(slider);
            }
        });
        return input;
    }

    function addToggle(parent, options) {
        const { key, label, value = true, map = (on) => on } = options;
        const button = el('button', value ? 'on' : '', label);
        button.type = 'button';
        let state = value;

        button.addEventListener('click', () => {
            state = !state;
            button.classList.toggle('on', state);
            set({ [key]: map(state) });
        });

        (parent.querySelector('.buttons') || parent).appendChild(button);

        controls.set(key, {
            set(next) {
                state = !!next;
                button.classList.toggle('on', state);
            }
        });
        return button;
    }

    /*--- Target ---*/

    const sourceSection = section('Target');
    const sourceButtons = el('div', 'buttons');
    sourceSection.appendChild(sourceButtons);

    const loadButton = el('button', '', 'Load image…');
    loadButton.type = 'button';
    const modelButton = el('button', '', 'Model file…');
    modelButton.type = 'button';
    const rebuildButton = el('button', '', 'Rebuild');
    rebuildButton.type = 'button';
    const randomButton = el('button', '', 'Random shape');
    randomButton.type = 'button';
    sourceButtons.append(loadButton, modelButton, rebuildButton, randomButton);

    const modelInput = el('input');
    modelInput.type = 'file';
    modelInput.accept = '.obj,.ply';
    modelInput.hidden = true;
    sourceSection.appendChild(modelInput);

    // Every name here is a target the engine builds in 3D, or — the glyph — an image file it
    const presetRow = el('div', 'row wide');
    presetRow.style.marginTop = '10px';
    const presetSelect = el('select');
    const PRESETS = [
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
        ['blob', 'Blob (audio)'],
        ['mesh', 'Imported mesh (3D)'],
        ['res/hpa-glyph.svg', 'Glyph (image)']
    ];
    for (const [value, label] of PRESETS) {
        const option = el('option', '', label);
        option.value = value;
        presetSelect.appendChild(option);
    }
    presetRow.appendChild(presetSelect);
    sourceSection.appendChild(presetRow);
    sourceSection.appendChild(el('div', 'note', 'Every shape is real 3D geometry — turn it and you see the far side. A picture (any PNG, JPEG, WebP or SVG, or the glyph) is flat by nature: dark pixels on light, or a transparent cut-out. Drop or paste a file anywhere on this page. A mesh comes in as a .obj or .ply exported from Blender, and arrives with its depth intact. Equalizer is the disc of bars that answers the audio, and Grid is the same bars laid out as a square.'));

    loadButton.addEventListener('click', () => fileInput.click());
    modelButton.addEventListener('click', () => modelInput.click());
    modelInput.addEventListener('change', () => {
        const file = modelInput.files && modelInput.files[0];
        if (file) importModel(file);
        modelInput.value = '';
    });
    rebuildButton.addEventListener('click', () => {
        const api = playerApi();
        if (!api) return needPlayer();
        api.rebuild();
        setStatus('rebuilding', 'busy');
        window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 900);
    });
    randomButton.addEventListener('click', randomShape);
    presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

    // One place picks the next target, so the button and the visualizer's shuffle agree. The
    function randomShape() {
        const shapeKeys = PRESETS
            .map(([value]) => value)
            .filter((value) => value !== 'ball' && value !== 'spear' && value !== 'mesh'
                && value !== 'equalizer' && value !== 'grid' && !value.startsWith('res/'));
        const pick = shapeKeys[Math.floor(Math.random() * shapeKeys.length)];
        presetSelect.value = pick;
        applyPreset(pick);
        return pick;
    }

    // Every preset value is a mask source the engine understands: a shape name, the imported
    function applyPreset(value) {
        const api = playerApi();
        if (!api) return needPlayer();

        if (value === 'equalizer' || value === 'grid') {
            eqOn = value === 'equalizer';
            if (eqButton) eqButton.classList.toggle('on', eqOn);
            api.set({ MODE: value });
            setStatus(value === 'grid' ? 'audio grid — reacts to the audio' : 'equalizer — reacts to the audio', 'busy');
            window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1000);
            return;
        }

        leaveEqualizer(api);
        api.set({ MODE: 'shape', MASK_SRC: value });
        setStatus('swapping target', 'busy');
        window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1000);
    }

    // A mesh from Blender's OBJ / PLY export; src/import.js reads it into a point cloud.
    async function importModel(file) {
        const api = playerApi();
        if (!api) return needPlayer();
        if (!api.importModel) {
            setStatus('model import needs the particle page', 'bad');
            return;
        }

        presetSelect.value = 'ball';
        setStatus(`importing ${String(file.name).slice(0, 22)}`, 'busy');
        try {
            const result = await api.importModel(file);
            leaveEqualizer(api);
            presetSelect.value = 'mesh';
            setStatus(`${result.points.toLocaleString()} points — ${String(file.name).slice(0, 18)}`, 'busy');
            window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1800);
        } catch (error) {
            setStatus(String((error && error.message) || error), 'bad');
        }
    }

    /*--- Title ---*/

    // The words that fade in under the shape: its own section, near the top.
    const titleSection = section('Title');

    const captionRow = el('div', 'row wide');
    captionRow.appendChild(el('span', 'label', 'Caption text'));
    const captionInput = el('input');
    captionInput.type = 'text';
    captionInput.value = 'Holographic Particle Accelerator';
    captionInput.placeholder = 'Holographic Particle Accelerator';
    captionInput.spellcheck = false;
    captionRow.appendChild(captionInput);
    titleSection.appendChild(captionRow);

    captionInput.addEventListener('input', () => set({ LABEL: captionInput.value }));
    controls.set('LABEL', {
        set(text) {
            if (document.activeElement !== captionInput) captionInput.value = text;
        }
    });

    addRange(titleSection, {
        key: 'CAPTION_SCALE', label: 'Caption size', min: 0.4, max: 2.2, step: 0.05, value: 1,
        format: (v) => `${v.toFixed(2)}×`
    });

    titleSection.appendChild(el('div', 'note', 'This is the line under the shape. It fades in once the target has assembled — the `?nocaption` flag hides it entirely.'));

    function leaveEqualizer(api) {
        if (!eqOn) return;
        eqOn = false;
        if (eqButton) eqButton.classList.remove('on');
    }

    /*--- Particles ---*/

    const particleSection = section('Particles');

    const densityRow = el('div', 'row');
    const densityValue = el('span', 'value', '260 px');
    const densityInput = el('input');
    densityInput.type = 'range';
    densityInput.min = 80;
    densityInput.max = 600;
    densityInput.step = 10;
    densityInput.value = 260;
    densityRow.append(el('span', 'label', 'Density'), densityValue, densityInput);
    particleSection.appendChild(densityRow);
    densityInput.addEventListener('input', () => {
        densityValue.textContent = `${densityInput.value} px`;
    });
    densityInput.addEventListener('change', () => set({ SAMPLE_WIDTH: Number(densityInput.value) }));

    addRange(particleSection, {
        key: 'POINT_SIZE', label: 'Point size', min: 6, max: 80, step: 1, value: 30,
        format: (v) => v.toFixed(0)
    });

    addRange(particleSection, {
        key: 'MASK_DEPTH', label: 'Depth', min: 0, max: 3, step: 0.05, value: 0.9,
        format: (v) => v.toFixed(2), live: false
    });

    addRange(particleSection, {
        key: 'SPIN_TURNS', label: 'Spin turns', min: 0, max: 3, step: 0.25, value: 1,
        format: (v) => v.toFixed(2), live: false
    });

    addRange(particleSection, {
        key: 'DUST_PARTICLES', label: 'Dust motes', min: 0, max: 14000, step: 500, value: 6000,
        format: (v) => v.toFixed(0), live: false
    });

    /*--- Camera ---*/

    const cameraSection = section('Camera');

    const viewButtons = el('div', 'buttons');
    cameraSection.appendChild(viewButtons);

    const outsideButton = el('button', 'on', 'Outside view');
    const insideButton = el('button', '', 'Inside view');
    outsideButton.type = 'button';
    insideButton.type = 'button';
    viewButtons.append(outsideButton, insideButton);

    outsideButton.addEventListener('click', () => setView('orbit'));
    insideButton.addEventListener('click', () => setView('inside'));

    function setView(view) {
        const api = playerApi();
        if (!api) return needPlayer();
        api.set({ VIEW: view });
        syncViewButtons(view);
        setStatus(view === 'inside' ? 'inside the object' : 'outside view', '');
    }

    // One place turns the two view buttons on and off, so the panel, Reset and the Show modes
    function syncViewButtons(view) {
        outsideButton.classList.toggle('on', view !== 'inside');
        insideButton.classList.toggle('on', view === 'inside');
    }

    // First in the camera block, because how fast the thing turns is the setting people reach
    addRange(cameraSection, {
        key: 'ROTATE_SPEED', label: 'Spin speed', min: -0.5, max: 0.5, step: 0.002,
        value: Number((0.40 / (Math.PI * 2)).toFixed(3)),
        format: (v) => `${v.toFixed(3)} turns/s`,
        toConfig: (v) => v * Math.PI * 2,
        fromConfig: (v) => Number((v / (Math.PI * 2)).toFixed(3))
    });

    // Which axis the endless turn goes round. Y is the turntable a ball or a spear wants; X
    const axisRow = el('div', 'buttons');
    axisRow.style.marginTop = '6px';
    cameraSection.appendChild(axisRow);

    const axisButtons = new Map();
    for (const [axis, label] of [['y', 'Y — turntable'], ['x', 'X — tumble'], ['z', 'Z — roll']]) {
        const button = el('button', axis === 'y' ? 'on' : '', label);
        button.type = 'button';
        button.addEventListener('click', () => setSpinAxis(axis));
        axisRow.appendChild(button);
        axisButtons.set(axis, button);
    }

    function syncAxisButtons(axis) {
        for (const [key, button] of axisButtons) button.classList.toggle('on', key === axis);
    }

    function setSpinAxis(axis) {
        const api = playerApi();
        if (api) api.set({ SPIN_AXIS: axis });
        syncAxisButtons(axis);
        setStatus(`turning about ${axis.toUpperCase()}`, '');
    }

    controls.set('SPIN_AXIS', { set: syncAxisButtons });

    // "Turn forever": one rotation, no hold, no fade, no rebuild. That is the Timing section's
    const infiniteRow = el('div', 'buttons');
    infiniteRow.style.marginTop = '6px';
    cameraSection.appendChild(infiniteRow);

    const infiniteButton = el('button', '', 'Infinite rotation — no rebuild');
    infiniteButton.type = 'button';
    infiniteButton.setAttribute('role', 'checkbox');
    infiniteButton.setAttribute('aria-checked', 'false');
    infiniteRow.appendChild(infiniteButton);

    function syncInfinite(on) {
        infiniteButton.classList.toggle('on', !!on);
        infiniteButton.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    infiniteButton.addEventListener('click', () => {
        const next = !infiniteButton.classList.contains('on');
        syncInfinite(next);
        set({ LOOP: !next });
        controls.get('LOOP').set(!next);
        setStatus(next ? 'turning forever — no rebuild' : 'rebuilding on a loop', '');
    });

    controls.set('INFINITE_ROTATION', { set: syncInfinite });

    addRange(cameraSection, {
        key: 'ZOOM', label: 'Zoom', min: 0.35, max: 6, step: 0.05, value: 1,
        format: (v) => `${v.toFixed(2)}×`
    });

    addRange(cameraSection, {
        key: 'STOP_ANGLE', label: 'Settle angle', min: 0, max: 360, step: 5, value: 0,
        format: (v) => `${v.toFixed(0)}°`
    });

    // Aiming: the pitch of the object, and where the view sits in the frame.
    addRange(cameraSection, {
        key: 'TILT', label: 'Tilt (object)', min: -90, max: 90, step: 1, value: 0,
        format: (v) => `${v.toFixed(0)}°`
    });

    // Where the object turns from, in world units out from its middle. An imported model is
    addRange(cameraSection, {
        key: 'PIVOT_X', label: 'Pivot X', min: -5, max: 5, step: 0.05, value: 0,
        format: (v) => v.toFixed(2)
    });

    addRange(cameraSection, {
        key: 'PIVOT_Y', label: 'Pivot Y', min: -5, max: 5, step: 0.05, value: 0,
        format: (v) => v.toFixed(2)
    });

    addRange(cameraSection, {
        key: 'PIVOT_Z', label: 'Pivot Z', min: -5, max: 5, step: 0.05, value: 0,
        format: (v) => v.toFixed(2)
    });

    const pivotRow = el('div', 'buttons');
    pivotRow.style.marginTop = '6px';
    cameraSection.appendChild(pivotRow);

    const pivotCentreButton = el('button', '', 'Pivot: centre');
    const pivotBaseButton = el('button', '', 'Pivot: base');
    pivotCentreButton.type = 'button';
    pivotBaseButton.type = 'button';
    pivotRow.append(pivotCentreButton, pivotBaseButton);

    function setPivot(x, y, z) {
        const api = playerApi();
        if (api) api.set({ PIVOT_X: x, PIVOT_Y: y, PIVOT_Z: z });
        controls.get('PIVOT_X').set(x);
        controls.get('PIVOT_Y').set(y);
        controls.get('PIVOT_Z').set(z);
    }

    pivotCentreButton.addEventListener('click', () => setPivot(0, 0, 0));

    // Base asks the engine for the points it is actually turning — whatever the target is — and
    pivotBaseButton.addEventListener('click', () => {
        const api = playerApi();
        if (!api) return needPlayer();
        const points = api.geometry ? api.geometry() : [];
        if (!points.length) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const point of points) {
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.z < minZ) minZ = point.z;
            if (point.z > maxZ) maxZ = point.z;
        }

        const round = (value) => Number(value.toFixed(2));
        setPivot(round((minX + maxX) / 2), round(minY), round((minZ + maxZ) / 2));
        setStatus('turning on the base', '');
    });

    addRange(cameraSection, {
        key: 'PAN_X', label: 'Pan left / right', min: -6, max: 6, step: 0.1, value: 0,
        format: (v) => v.toFixed(1)
    });

    addRange(cameraSection, {
        key: 'PAN_Y', label: 'Pan up / down', min: -6, max: 6, step: 0.1, value: 0,
        format: (v) => v.toFixed(1)
    });

    const padRow = el('div', 'buttons');
    padRow.style.marginTop = '10px';
    cameraSection.appendChild(padRow);

    function nudge(dx, dy) {
        const api = playerApi();
        const config = api && api.config ? api.config : {};
        const clamp = (value) => Math.max(-9, Math.min(9, value));
        const panX = clamp((Number(config.PAN_X) || 0) + dx);
        const panY = clamp((Number(config.PAN_Y) || 0) + dy);
        if (api) api.set({ PAN_X: panX, PAN_Y: panY });
        controls.get('PAN_X').set(panX);
        controls.get('PAN_Y').set(panY);
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

    const headOnButton = el('button', '', 'Head-on');
    headOnButton.type = 'button';
    headOnButton.addEventListener('click', () => {
        const api = playerApi();
        if (api) api.set({ TILT: 0, PAN_X: 0, PAN_Y: 0 });
        controls.get('TILT').set(0);
        controls.get('PAN_X').set(0);
        controls.get('PAN_Y').set(0);
    });
    padRow.appendChild(headOnButton);

    cameraSection.appendChild(el('div', 'note', 'The assembly eases to the settle angle, then turns on forever from there. The three turn buttons pick which axis that goes round, and a negative spin speed turns it the other way. The wheel over the particle window zooms too, and inside view puts the camera in among the particles.'));
    cameraSection.appendChild(el('div', 'note', 'Tilt 0° looks at the object dead level; positive pitches the top away from you. The pad slides the view, and the arrow keys in the particle window do the same — hold shift for bigger steps. Head-on puts the tilt and the pan back to zero.'));
    cameraSection.appendChild(el('div', 'note', 'Pivot is the point the turn goes around. 0 is the target’s centre, which is what the built-in shapes use; an imported model is centred on its bounding box, so a typical one wants its base at about −2 on Y — Pivot: base finds it from the model itself.'));
    cameraSection.appendChild(el('div', 'note', 'Infinite rotation assembles the target once and then just turns it: no hold, no fade, no rebuild. It is the same setting as Timing → Rebuild loop, off.'));

    // A running particle window is the truth; show what it is actually set to.
    window.setTimeout(() => {
        const api = playerApi();
        if (!api || !api.config) return;
        for (const key of ['TILT', 'PIVOT_X', 'PIVOT_Y', 'PIVOT_Z', 'SPIN_AXIS', 'LOOP', 'PAN_X', 'PAN_Y']) {
            if (key in api.config) controls.get(key).set(api.config[key]);
        }
    }, 900);
