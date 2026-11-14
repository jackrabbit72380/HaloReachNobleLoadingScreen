/*  Holographic Particle Accelerator — Controller
 *  Jackrabbit72380
 *  2026
 *
 *  Runs in its own window and drives the animation in a second, separate window.
 *  Both pages are same-origin, so the controller keeps a live reference to the
 *  player and calls window.HPA directly — no embedding, no message protocol.
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

    // The particle window keeps offering its own handle to the opener (see announce() in
    // engine.js), so reloading this page no longer costs the connection: the next poll
    // picks the running window back up and nothing is navigated or restarted.
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

    // Asks the browser for the window of that name as it is — an empty URL means "do not
    // navigate" — so a window left over from before this page was refreshed is reused
    // exactly as it stands instead of being pointed at index.html again.
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

    function addRange(parent, options) {
        const { key, label, min, max, step, value, format = (v) => String(v), live = true } = options;
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
            if (live) set({ [key]: next });
        });
        if (!live) {
            input.addEventListener('change', () => set({ [key]: Number(input.value) }));
        }

        controls.set(key, {
            set(next) {
                input.value = next;
                shown.textContent = format(Number(next));
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
    const rebuildButton = el('button', '', 'Rebuild');
    rebuildButton.type = 'button';
    const randomButton = el('button', '', 'Random shape');
    randomButton.type = 'button';
    sourceButtons.append(loadButton, rebuildButton, randomButton);

    const presetRow = el('div', 'row wide');
    presetRow.style.marginTop = '10px';
    const presetSelect = el('select');
    const PRESETS = [
        ['ball', 'Ball (3D)'],
        ['spear', 'Spear (3D)'],
        ['res/hpa-glyph.svg', 'Glyph (flat)'],
        ['torus', 'Torus'],
        ['atom', 'Atom'],
        ['cube', 'Cube'],
        ['sphere', 'Sphere (flat)'],
        ['helix', 'Helix'],
        ['pyramid', 'Pyramid'],
        ['star', 'Star']
    ];
    for (const [value, label] of PRESETS) {
        const option = el('option', '', label);
        option.value = value;
        presetSelect.appendChild(option);
    }
    presetRow.appendChild(presetSelect);
    sourceSection.appendChild(presetRow);
    sourceSection.appendChild(el('div', 'note', 'Any PNG, JPEG, WebP or SVG works — dark pixels on light, or a transparent cut-out. Drop or paste it anywhere on this page.'));

    loadButton.addEventListener('click', () => fileInput.click());
    rebuildButton.addEventListener('click', () => {
        const api = playerApi();
        if (!api) return needPlayer();
        api.rebuild();
        setStatus('rebuilding', 'busy');
        window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 900);
    });
    randomButton.addEventListener('click', () => {
        const shapeKeys = PRESETS
            .map(([value]) => value)
            .filter((value) => value !== 'ball' && value !== 'spear' && !value.startsWith('res/'));
        const pick = shapeKeys[Math.floor(Math.random() * shapeKeys.length)];
        presetSelect.value = pick;
        applyPreset(pick);
    });
    presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

    function applyPreset(value) {
        const api = playerApi();
        if (!api) return needPlayer();
        const source = value === 'ball' || value === 'spear' || value.startsWith('res/')
            ? value
            : makeMask(MASKS[value]);
        leaveEqualizer(api);
        api.set({ MODE: 'shape', MASK_SRC: source });
        setStatus('swapping target', 'busy');
        window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1000);
    }

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
        outsideButton.classList.toggle('on', view === 'orbit');
        insideButton.classList.toggle('on', view === 'inside');
        setStatus(view === 'inside' ? 'inside the object' : 'outside view', '');
    }

    addRange(cameraSection, {
        key: 'ZOOM', label: 'Zoom', min: 0.35, max: 6, step: 0.05, value: 1,
        format: (v) => `${v.toFixed(2)}×`
    });

    addRange(cameraSection, {
        key: 'ROTATE_SPEED', label: 'Spin speed', min: 0, max: 3, step: 0.05, value: 0.40,
        format: (v) => `${v.toFixed(2)} rad/s`
    });

    addRange(cameraSection, {
        key: 'STOP_ANGLE', label: 'Settle angle', min: 0, max: 360, step: 5, value: 0,
        format: (v) => `${v.toFixed(0)}°`
    });

    cameraSection.appendChild(el('div', 'note', 'The assembly eases to the settle angle, then turns on forever from there. The wheel over the particle window zooms too, and inside view puts the camera in among the particles.'));

    /*--- Visualizer ---*/

    const visualizerSection = section('Visualizer');
    const visualizerButtons = el('div', 'buttons');
    visualizerSection.appendChild(visualizerButtons);

    const eqButton = el('button', '', 'Equalizer ring');
    eqButton.type = 'button';
    visualizerButtons.appendChild(eqButton);

    let eqOn = false;

    eqButton.addEventListener('click', () => {
        const api = playerApi();
        if (!api) return needPlayer();
        eqOn = !eqOn;
        eqButton.classList.toggle('on', eqOn);
        api.set({ MODE: eqOn ? 'equalizer' : 'shape' });
        setStatus(eqOn ? 'equalizer ring' : 'shape target', 'busy');
        window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1000);
    });

    addRange(visualizerSection, {
        key: 'EQ_HEIGHT', label: 'Band height', min: 0.4, max: 5, step: 0.1, value: 2.2,
        format: (v) => v.toFixed(1)
    });

    visualizerSection.appendChild(el('div', 'note', 'A flat disc of 64 bars that turns with the model; each bar rises with its own frequency band once an audio source is listening.'));

    /*--- Timing ---*/

    const timingSection = section('Timing');
    addRange(timingSection, {
        key: 'ASSEMBLY_MS', label: 'Assembly', min: 1500, max: 15000, step: 250, value: 7000,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });
    addRange(timingSection, {
        key: 'HOLD_MS', label: 'Hold', min: 300, max: 30000, step: 500, value: 12000,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });
    addRange(timingSection, {
        key: 'FADE_MS', label: 'Fade', min: 200, max: 4000, step: 100, value: 1200,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });

    const timingButtons = el('div', 'buttons');
    timingButtons.style.marginTop = '10px';
    timingSection.appendChild(timingButtons);
    addToggle(timingButtons, { key: 'LOOP', label: 'Rebuild loop', value: true });

    timingSection.appendChild(el('div', 'note', 'With the loop off the shape assembles once and then stays assembled, turning forever — hold, fade and rebuild are skipped.'));

    /*--- Look ---*/

    const lookSection = section('Look');

    const colorRow = el('div', 'row wide');
    colorRow.appendChild(el('span', 'label', 'Tint'));
    const colorInput = el('input');
    colorInput.type = 'color';
    colorInput.value = '#a1d6ff';
    colorRow.appendChild(colorInput);
    lookSection.appendChild(colorRow);

    colorInput.addEventListener('input', () => set({ COLOR: hexToColor(colorInput.value) }));
    controls.set('COLOR', {
        set(rgb) {
            colorInput.value = colorToHex(rgb);
        }
    });

    addRange(lookSection, {
        key: 'GLOW', label: 'Glow falloff', min: 2, max: 22, step: 0.5, value: 9,
        format: (v) => v.toFixed(1)
    });

    addRange(lookSection, {
        key: 'CHROMA', label: 'Chromatic rim', min: 0, max: 1, step: 0.05, value: 0,
        format: (v) => v.toFixed(2)
    });

    const captionRow = el('div', 'row wide');
    captionRow.style.marginTop = '10px';
    captionRow.appendChild(el('span', 'label', 'Caption'));
    const captionInput = el('input');
    captionInput.type = 'text';
    captionInput.value = 'Holographic Particle Accelerator';
    captionRow.appendChild(captionInput);
    lookSection.appendChild(captionRow);
    captionInput.addEventListener('input', () => set({ LABEL: captionInput.value }));
    controls.set('LABEL', {
        set(text) {
            if (document.activeElement !== captionInput) captionInput.value = text;
        }
    });

    addRange(lookSection, {
        key: 'CAPTION_SCALE', label: 'Caption size', min: 0.4, max: 2.2, step: 0.05, value: 1,
        format: (v) => `${v.toFixed(2)}×`
    });

    /*--- Effects ---*/

    const effectsSection = section('Effects');
    const effectButtons = el('div', 'buttons');
    effectsSection.appendChild(effectButtons);

    addToggle(effectButtons, { key: 'SHOW_GRID', label: 'Grid', value: true });
    addToggle(effectButtons, { key: 'SHOW_SCAN', label: 'Scanlines', value: true });
    addToggle(effectButtons, { key: 'SHOW_VIGNETTE', label: 'Vignette', value: true });
    addToggle(effectButtons, {
        key: 'SHAKE', label: 'Camera shake', value: false,
        map: (on) => (on ? 0.5 : 0)
    });

    /*--- Audio ---*/

    const audioSection = section('Audio response');
    const audioButtons = el('div', 'buttons');
    audioSection.appendChild(audioButtons);

    const micButton = el('button', '', 'Microphone');
    const systemButton = el('button', '', 'System audio');
    const fileButton = el('button', '', 'Audio file…');
    const stopButton = el('button', 'danger', 'Stop');
    for (const button of [micButton, systemButton, fileButton, stopButton]) {
        button.type = 'button';
        audioButtons.appendChild(button);
    }

    const meter = el('div', 'meter');
    const meterFill = el('i');
    meter.appendChild(meterFill);
    audioSection.appendChild(meter);

    const meterRow = el('div', 'row');
    meterRow.style.marginTop = '10px';
    const meterValue = el('span', 'value', '1.00×');
    const sensitivityInput = el('input');
    sensitivityInput.type = 'range';
    sensitivityInput.min = 0.2;
    sensitivityInput.max = 6;
    sensitivityInput.step = 0.1;
    sensitivityInput.value = 1;
    meterRow.append(el('span', 'label', 'Sensitivity'), meterValue, sensitivityInput);
    audioSection.appendChild(meterRow);
    sensitivityInput.addEventListener('input', () => {
        sensitivity = Number(sensitivityInput.value);
        meterValue.textContent = `${sensitivity.toFixed(2)}×`;
    });

    audioSection.appendChild(el('div', 'note', 'System audio needs Chrome or Edge on Windows or Linux — tick “Share system audio” in the picker. macOS blocks it; there use a loopback device (BlackHole) as the microphone. Audio file plays locally and drives the same reaction.'));

    const audioFileInput = el('input');
    audioFileInput.type = 'file';
    audioFileInput.accept = 'audio/*';
    audioFileInput.hidden = true;
    audioSection.appendChild(audioFileInput);

    micButton.addEventListener('click', () => startMic());
    systemButton.addEventListener('click', () => startSystem());
    fileButton.addEventListener('click', () => audioFileInput.click());
    stopButton.addEventListener('click', () => stopAudio(false));
    audioFileInput.addEventListener('change', () => {
        const file = audioFileInput.files && audioFileInput.files[0];
        if (file) startFile(file);
        audioFileInput.value = '';
    });

    function ensureContext() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (!analyser) {
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.75;
            audioData = new Uint8Array(analyser.fftSize);
            freqData = new Uint8Array(analyser.frequencyBinCount);
        }
        return audioCtx;
    }

    function beginListening(mode, label) {
        captureMode = mode;
        audioOn = true;
        syncAudioButtons();
        setStatus(label, '');
        pumpAudio();
    }

    async function startMic() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('no microphone support', 'bad');
            return;
        }
        stopAudio(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            mediaStream = stream;
            ensureContext().createMediaStreamSource(stream).connect(analyser);
            beginListening('mic', 'listening (mic)');
        } catch (error) {
            setStatus('microphone denied', 'bad');
        }
    }

    // Captures what the machine is playing. Chrome/Edge expose system audio through
    // getDisplayMedia behind the "Share system audio" checkbox; a video track is
    // mandatory to get the picker, so it is stopped immediately afterwards.
    async function startSystem() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            setStatus('no system capture here', 'bad');
            return;
        }
        stopAudio(true);
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    systemAudio: 'include',
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                selfBrowserSurface: 'exclude'
            });
            const audioTracks = stream.getAudioTracks();
            if (!audioTracks.length) {
                for (const track of stream.getTracks()) track.stop();
                setStatus('tick “Share system audio”', 'bad');
                return;
            }
            for (const track of stream.getVideoTracks()) track.stop();
            mediaStream = new MediaStream(audioTracks);
            ensureContext().createMediaStreamSource(mediaStream).connect(analyser);
            beginListening('system', 'listening (system)');
        } catch (error) {
            setStatus('system audio cancelled', 'bad');
        }
    }

    async function startFile(file) {
        stopAudio(true);
        try {
            const context = ensureContext();
            audioElement = new Audio(URL.createObjectURL(file));
            audioElement.loop = true;
            context.createMediaElementSource(audioElement).connect(analyser);
            analyser.connect(context.destination);
            await audioElement.play();
            beginListening('file', `listening (${file.name.slice(0, 24)})`);
        } catch (error) {
            setStatus('could not play that file', 'bad');
        }
    }

    function syncAudioButtons() {
        micButton.classList.toggle('on', audioOn && captureMode === 'mic');
        systemButton.classList.toggle('on', audioOn && captureMode === 'system');
        fileButton.classList.toggle('on', audioOn && captureMode === 'file');
        stopButton.disabled = !audioOn;
    }

    function stopAudio(silent) {
        audioOn = false;
        cancelAnimationFrame(audioRaf);
        if (mediaStream) {
            for (const track of mediaStream.getTracks()) track.stop();
            mediaStream = null;
        }
        if (audioElement) {
            audioElement.pause();
            audioElement.src = '';
            audioElement = null;
        }
        if (analyser) {
            try { analyser.disconnect(); } catch (error) { /* nothing attached */ }
        }
        captureMode = '';
        const api = playerApi();
        if (api) {
            api.setAudio(0);
            api.setSpectrum(null);
        }
        meterFill.style.width = '0%';
        syncAudioButtons();
        if (!silent) setStatus('audio off', '');
    }

    function pumpAudio() {
        if (!audioOn || !analyser) return;
        analyser.getByteTimeDomainData(audioData);
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            const value = (audioData[i] - 128) / 128;
            sum += value * value;
        }
        const rms = Math.sqrt(sum / audioData.length);
        const level = Math.min(1, rms * 4 * sensitivity);
        const api = playerApi();

        if (api) {
            api.setAudio(level);
            api.setSpectrum(spectrumBands());
        }

        meterFill.style.width = `${(level * 100).toFixed(1)}%`;
        audioRaf = requestAnimationFrame(pumpAudio);
    }

    // 64 log-spaced bands, which is what the equalizer ring draws as columns.
    function spectrumBands() {
        const bands = new Float32Array(64);
        if (!freqData) return bands;
        analyser.getByteFrequencyData(freqData);
        const bins = freqData.length;

        for (let band = 0; band < bands.length; band++) {
            const from = Math.floor(Math.pow(band / bands.length, 1.8) * bins);
            const to = Math.max(from + 1, Math.floor(Math.pow((band + 1) / bands.length, 1.8) * bins));
            let peak = 0;
            for (let i = from; i < to && i < bins; i++) peak = Math.max(peak, freqData[i]);
            bands[band] = Math.min(1, Math.pow(peak / 255, 0.8) * sensitivity * 0.95);
        }

        return bands;
    }

    /*--- Capture ---*/

    const captureSection = section('Capture');
    const captureButtons = el('div', 'buttons');
    captureSection.appendChild(captureButtons);

    const pngButton = el('button', '', 'PNG frame');
    const webpButton = el('button', '', 'WebP frame');
    const webmButton = el('button', '', 'Record WebM 5s');
    const webm10Button = el('button', '', 'WebM 10s');
    const mp4Button = el('button', '', 'Record MP4 8s');
    for (const button of [pngButton, webpButton, webmButton, webm10Button, mp4Button]) {
        button.type = 'button';
        captureButtons.appendChild(button);
    }

    pngButton.addEventListener('click', () => captureFrame('image/png'));
    webpButton.addEventListener('click', () => captureFrame('image/webp'));
    webmButton.addEventListener('click', () => recordVideo(5000, 'video/webm;codecs=vp9'));
    webm10Button.addEventListener('click', () => recordVideo(10000, 'video/webm;codecs=vp9'));
    mp4Button.addEventListener('click', () => recordVideo(8000, 'video/mp4;codecs=avc1.42E01E'));

    function captureFrame(mime) {
        const api = playerApi();
        if (!api) return needPlayer();
        const dataUrl = api.capture(mime, 0.92);
        const ext = mime.includes('webp') ? 'webp' : 'png';
        download(dataUrl, `holographic-particle-accelerator-${stamp()}.${ext}`);
        setStatus(`saved ${ext}`, '');
    }

    async function recordVideo(ms, mime) {
        const api = playerApi();
        if (!api) return needPlayer();

        setStatus(`recording ${Math.round(ms / 1000)}s…`, 'busy');
        try {
            const blob = await api.record({ ms, mime, bitrate: 14000000 });
            const ext = mime.includes('mp4') ? 'mp4' : 'webm';
            const url = URL.createObjectURL(blob);
            download(url, `holographic-particle-accelerator-${stamp()}.${ext}`);
            window.setTimeout(() => URL.revokeObjectURL(url), 20000);
            setStatus(`saved ${ext} (${(blob.size / 1048576).toFixed(1)} MB)`, '');
        } catch (error) {
            setStatus(String(error && error.message || error), 'bad');
        }
    }

    captureSection.appendChild(el('div', 'note', 'Video is captured inside the particle window from its canvas, so the caption overlay is not in the frame. MP4 depends on browser support.'));

    const caps = {
        webp: (() => {
            const probe = document.createElement('canvas');
            probe.width = probe.height = 1;
            return probe.toDataURL('image/webp').startsWith('data:image/webp');
        })(),
        webm: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
        mp4: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E'),
        audio: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        system: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    };

    webpButton.disabled = !caps.webp;
    webmButton.disabled = !caps.webm;
    webm10Button.disabled = !caps.webm;
    mp4Button.disabled = !caps.mp4;
    micButton.disabled = !caps.audio;
    systemButton.disabled = !caps.system;
    stopButton.disabled = true;
    mp4Button.title = caps.mp4 ? '' : 'This browser cannot record MP4 from a canvas';

    /*--- Image loading ---*/

    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) loadFile(file);
        fileInput.value = '';
    });

    function loadFile(file) {
        if (!file.type.startsWith('image/')) {
            setStatus('not an image', 'bad');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const api = playerApi();
            if (!api) return needPlayer();
            leaveEqualizer(api);
            api.set({ MODE: 'shape', MASK_SRC: reader.result });
            setStatus(`swapped ${file.name.slice(0, 28)}`, 'busy');
            window.setTimeout(() => { if (connected) setStatus('connected', ''); }, 1000);
        };
        reader.onerror = () => setStatus('could not read file', 'bad');
        reader.readAsDataURL(file);
    }

    for (const type of ['dragenter', 'dragover']) {
        wrap.addEventListener(type, (event) => {
            event.preventDefault();
            wrap.classList.add('dragging');
        });
    }
    for (const type of ['dragleave', 'drop']) {
        wrap.addEventListener(type, () => wrap.classList.remove('dragging'));
    }
    wrap.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) loadFile(file);
    });
    window.addEventListener('paste', (event) => {
        const items = event.clipboardData && event.clipboardData.files;
        if (items && items[0]) loadFile(items[0]);
    });

    /*--- Procedural masks ---*/

    function makeMask(paint) {
        const surface = document.createElement('canvas');
        surface.width = 512;
        surface.height = 512;
        const context = surface.getContext('2d');
        context.strokeStyle = '#ffffff';
        context.fillStyle = '#ffffff';
        context.lineWidth = 9;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        paint(context, 512);
        return surface.toDataURL('image/png');
    }

    const MASKS = {
        torus(x, s) {
            const c = s / 2;
            x.beginPath(); x.arc(c, c, 196, 0, Math.PI * 2); x.stroke();
            x.beginPath(); x.arc(c, c, 128, 0, Math.PI * 2); x.stroke();
            x.save();
            x.setLineDash([14, 22]);
            x.beginPath(); x.arc(c, c, 162, 0, Math.PI * 2); x.stroke();
            x.restore();
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                x.beginPath();
                x.moveTo(c + Math.cos(a) * 196, c + Math.sin(a) * 196);
                x.lineTo(c + Math.cos(a) * 210, c + Math.sin(a) * 210);
                x.stroke();
            }
        },
        atom(x, s) {
            const c = s / 2;
            for (let i = 0; i < 3; i++) {
                x.save();
                x.translate(c, c);
                x.rotate((i * Math.PI) / 3);
                x.beginPath();
                x.ellipse(0, 0, 200, 76, 0, 0, Math.PI * 2);
                x.stroke();
                x.restore();
            }
            x.beginPath(); x.arc(c, c, 30, 0, Math.PI * 2); x.fill();
            x.beginPath(); x.arc(c + 196, c, 12, 0, Math.PI * 2); x.fill();
            x.beginPath(); x.arc(c - 98, c - 170, 12, 0, Math.PI * 2); x.fill();
            x.beginPath(); x.arc(c - 98, c + 170, 12, 0, Math.PI * 2); x.fill();
        },
        cube(x, s) {
            const c = s / 2;
            const d = 86;
            const o = 52;
            x.beginPath(); x.rect(c - d, c - d, d * 2, d * 2); x.stroke();
            x.beginPath(); x.rect(c - d + o, c - d - o, d * 2, d * 2); x.stroke();
            for (const [px, py] of [[-d, -d], [d, -d], [d, d], [-d, d]]) {
                x.beginPath();
                x.moveTo(c + px, c + py);
                x.lineTo(c + px + o, c + py - o);
                x.stroke();
            }
        },
        sphere(x, s) {
            const c = s / 2;
            const r = 190;
            x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke();
            for (const k of [0.36, 0.72]) {
                x.beginPath(); x.ellipse(c, c, r * k, r, 0, 0, Math.PI * 2); x.stroke();
                x.beginPath(); x.ellipse(c, c, r, r * k, 0, 0, Math.PI * 2); x.stroke();
            }
            x.beginPath(); x.moveTo(c - r, c); x.lineTo(c + r, c); x.stroke();
            x.beginPath(); x.moveTo(c, c - r); x.lineTo(c, c + r); x.stroke();
        },
        helix(x, s) {
            const c = s / 2;
            const amplitude = 120;
            const span = 180;
            for (let phase = 0; phase < 2; phase++) {
                x.beginPath();
                for (let i = 0; i <= 120; i++) {
                    const t = i / 120;
                    const px = c - span + t * span * 2;
                    const py = c + Math.sin(t * Math.PI * 4 + phase * Math.PI) * amplitude;
                    if (i === 0) x.moveTo(px, py);
                    else x.lineTo(px, py);
                }
                x.stroke();
            }
            for (let i = 0; i <= 14; i++) {
                const t = i / 14;
                const px = c - span + t * span * 2;
                const py1 = c + Math.sin(t * Math.PI * 4) * amplitude;
                const py2 = c + Math.sin(t * Math.PI * 4 + Math.PI) * amplitude;
                x.beginPath(); x.moveTo(px, py1); x.lineTo(px, py2); x.stroke();
            }
        },
        pyramid(x, s) {
            const c = s / 2;
            const w = 170;
            const h = 200;
            const base = [
                [c, c + 70],
                [c + w, c + 20],
                [c, c - 30],
                [c - w, c + 20]
            ];
            x.beginPath();
            base.forEach(([px, py], index) => {
                if (index === 0) x.moveTo(px, py);
                else x.lineTo(px, py);
            });
            x.closePath(); x.stroke();
            for (const [px, py] of base) {
                x.beginPath(); x.moveTo(px, py); x.lineTo(c, c - h); x.stroke();
            }
        },
        star(x, s) {
            const c = s / 2;
            const outer = 210;
            const inner = 92;
            x.beginPath();
            for (let i = 0; i < 10; i++) {
                const angle = -Math.PI / 2 + (i * Math.PI) / 5;
                const radius = i % 2 === 0 ? outer : inner;
                const px = c + Math.cos(angle) * radius;
                const py = c + Math.sin(angle) * radius;
                if (i === 0) x.moveTo(px, py);
                else x.lineTo(px, py);
            }
            x.closePath(); x.stroke();
        }
    };

    /*--- Utilities ---*/

    function hexToColor(hex) {
        const value = hex.replace('#', '');
        return [
            parseInt(value.slice(0, 2), 16) / 255,
            parseInt(value.slice(2, 4), 16) / 255,
            parseInt(value.slice(4, 6), 16) / 255
        ].map((channel) => Number(channel.toFixed(3)));
    }

    function colorToHex(rgb) {
        if (!Array.isArray(rgb)) return '#a1d6ff';
        return '#' + rgb.slice(0, 3).map((channel) => {
            const value = Math.max(0, Math.min(255, Math.round(channel * 255)));
            return value.toString(16).padStart(2, '0');
        }).join('');
    }

    function stamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    function download(url, name) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    /*--- Boot ---*/

    setStatus('not connected', '');
    updateConnection();
    poll();
})();
