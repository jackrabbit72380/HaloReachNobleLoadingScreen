/*  Holographic Particle Accelerator — Controller
 *  Jackrabbit72380
 *  2026
 *
 *  Drives index.html through postMessage. Every control writes straight into the
 *  engine's CONFIG, so changes are live while the animation keeps running.
 */

(() => {
    'use strict';

    const stage = document.getElementById('stage');
    const wrap = document.getElementById('stage-wrap');
    const hint = document.getElementById('hint');
    const statusEl = document.getElementById('status');
    const fileInput = document.getElementById('file');
    const sectionsRoot = document.getElementById('sections');

    let ready = false;
    let caps = { png: true, webp: true, webm: false, mp4: false, audio: false };
    const pending = [];
    const controls = new Map();

    let audioCtx = null;
    let analyser = null;
    let audioData = null;
    let audioOn = false;
    let audioRaf = 0;
    let sensitivity = 1;

    let recordTimer = 0;

    /*--- Messaging ---*/

    function send(message) {
        const payload = { source: 'hpa-controller', ...message };
        if (ready && stage.contentWindow) stage.contentWindow.postMessage(payload, '*');
        else pending.push(payload);
    }

    function flush() {
        while (pending.length && stage.contentWindow) {
            stage.contentWindow.postMessage(pending.shift(), '*');
        }
    }

    function setStatus(text, tone = '') {
        statusEl.textContent = text;
        statusEl.className = 'status ' + tone;
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.source !== 'hpa-engine') return;

        switch (message.type) {
            case 'ready':
                ready = true;
                caps = { ...caps, ...(message.caps || {}) };
                syncFromConfig(message.snapshot && message.snapshot.config);
                applyCaps();
                flush();
                setStatus('connected', '');
                break;

            case 'state':
                setStatus('connected', '');
                break;

            case 'captured': {
                const ext = (message.mime || 'image/png').includes('webp') ? 'webp' : 'png';
                download(message.dataUrl, `holographic-particle-accelerator-${stamp()}.${ext}`);
                setStatus(`saved ${ext}`, '');
                break;
            }

            case 'recorded': {
                const ext = (message.mime || '').includes('mp4') ? 'mp4' : 'webm';
                const url = URL.createObjectURL(message.blob);
                download(url, `holographic-particle-accelerator-${stamp()}.${ext}`);
                window.setTimeout(() => URL.revokeObjectURL(url), 20000);
                setStatus(`saved ${ext} (${(message.blob.size / 1048576).toFixed(1)} MB)`, '');
                break;
            }

            case 'record-start':
                setStatus(`recording ${Math.round((message.ms || 0) / 1000)}s…`, 'busy');
                window.clearTimeout(recordTimer);
                recordTimer = window.setTimeout(() => setStatus('finishing…', 'busy'), message.ms || 0);
                break;

            case 'error':
                setStatus(message.message || 'engine error', 'bad');
                break;

            default:
                break;
        }
    });

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
            if (live) send({ type: 'set', patch: { [key]: next } });
        });
        if (!live) {
            input.addEventListener('change', () => {
                send({ type: 'set', patch: { [key]: Number(input.value) } });
            });
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
            send({ type: 'set', patch: { [key]: map(state) } });
        });

        const buttons = parent.querySelector('.buttons') || parent;
        buttons.appendChild(button);

        controls.set(key, {
            set(next) {
                state = !!next;
                button.classList.toggle('on', state);
            }
        });
        return button;
    }

    /*--- Panel ---*/

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
        ['res/hpa-glyph.svg', 'Glyph (default)'],
        ['torus', 'Torus'],
        ['atom', 'Atom'],
        ['cube', 'Cube'],
        ['sphere', 'Sphere'],
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
    sourceSection.appendChild(el('div', 'note', 'Any PNG, JPEG, WebP or SVG works — dark pixels on light, or a transparent cut-out.'));

    loadButton.addEventListener('click', () => fileInput.click());
    rebuildButton.addEventListener('click', () => {
        send({ type: 'rebuild' });
        setStatus('rebuilding', 'busy');
    });
    randomButton.addEventListener('click', () => {
        const shapeKeys = PRESETS.slice(1).map(([value]) => value);
        const pick = shapeKeys[Math.floor(Math.random() * shapeKeys.length)];
        presetSelect.value = pick;
        applyPreset(pick);
    });
    presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

    function applyPreset(value) {
        if (value.startsWith('res/')) {
            send({ type: 'mask', src: value });
        } else {
            send({ type: 'mask', src: makeMask(MASKS[value]) });
        }
        setStatus('swapping target', 'busy');
    }

    /*--- Particles ---*/

    const particleSection = section('Particles');

    const densityRow = el('div', 'row');
    const densityLabel = el('span', 'label', 'Density');
    const densityValue = el('span', 'value', '260 px');
    const densityInput = el('input');
    densityInput.type = 'range';
    densityInput.min = 80;
    densityInput.max = 600;
    densityInput.step = 10;
    densityInput.value = 260;
    densityRow.append(densityLabel, densityValue, densityInput);
    particleSection.appendChild(densityRow);
    densityInput.addEventListener('input', () => {
        densityValue.textContent = `${densityInput.value} px`;
    });
    densityInput.addEventListener('change', () => {
        send({ type: 'set', patch: { SAMPLE_WIDTH: Number(densityInput.value) } });
        setStatus('rebuilding', 'busy');
    });

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

    /*--- Timing ---*/

    const timingSection = section('Timing');
    addRange(timingSection, {
        key: 'ASSEMBLY_MS', label: 'Assembly', min: 1500, max: 15000, step: 250, value: 7000,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });
    addRange(timingSection, {
        key: 'HOLD_MS', label: 'Hold', min: 300, max: 15000, step: 250, value: 4800,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });
    addRange(timingSection, {
        key: 'FADE_MS', label: 'Fade', min: 200, max: 4000, step: 100, value: 1200,
        format: (v) => `${(v / 1000).toFixed(2)} s`, live: false
    });

    /*--- Look ---*/

    const lookSection = section('Look');

    const colorRow = el('div', 'row wide');
    colorRow.appendChild(el('span', 'label', 'Tint'));
    const colorInput = el('input');
    colorInput.type = 'color';
    colorInput.value = '#a1d6ff';
    colorRow.appendChild(colorInput);
    lookSection.appendChild(colorRow);

    colorInput.addEventListener('input', () => {
        send({ type: 'set', patch: { COLOR: hexToColor(colorInput.value) } });
    });
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
    captionInput.addEventListener('input', () => {
        send({ type: 'set', patch: { LABEL: captionInput.value } });
    });
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

    const audioButton = el('button', 'danger', 'Enable mic');
    audioButton.type = 'button';
    audioButtons.appendChild(audioButton);

    const meter = el('div', 'meter');
    const meterFill = el('i');
    meter.appendChild(meterFill);
    audioSection.appendChild(meter);

    const meterRow = el('div', 'row');
    meterRow.style.marginTop = '10px';
    meterRow.appendChild(el('span', 'label', 'Sensitivity'));
    const meterValue = el('span', 'value', '1.00×');
    const sensitivityInput = el('input');
    sensitivityInput.type = 'range';
    sensitivityInput.min = 0.2;
    sensitivityInput.max = 6;
    sensitivityInput.step = 0.1;
    sensitivityInput.value = 1;
    meterRow.append(meterValue, sensitivityInput);
    audioSection.appendChild(meterRow);
    sensitivityInput.addEventListener('input', () => {
        sensitivity = Number(sensitivityInput.value);
        meterValue.textContent = `${sensitivity.toFixed(2)}×`;
    });

    audioSection.appendChild(el('div', 'note', 'Audio drives point size and brightness in real time. Nothing is recorded or uploaded.'));

    audioButton.addEventListener('click', () => {
        if (audioOn) stopAudio();
        else startAudio();
    });

    async function startAudio() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setStatus('no microphone support', 'bad');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.75;
            source.connect(analyser);
            audioData = new Uint8Array(analyser.fftSize);
            audioOn = true;
            audioButton.classList.add('on');
            audioButton.textContent = 'Mic on';
            setStatus('listening', '');
            pumpAudio();
        } catch (error) {
            setStatus('microphone denied', 'bad');
        }
    }

    function stopAudio() {
        audioOn = false;
        cancelAnimationFrame(audioRaf);
        audioButton.classList.remove('on');
        audioButton.textContent = 'Enable mic';
        meterFill.style.width = '0%';
        send({ type: 'audio', level: 0 });
        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
        }
        setStatus('mic off', '');
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
        send({ type: 'audio', level });
        meterFill.style.width = `${(level * 100).toFixed(1)}%`;
        audioRaf = requestAnimationFrame(pumpAudio);
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

    pngButton.addEventListener('click', () => {
        send({ type: 'capture', mime: 'image/png' });
        setStatus('capturing frame', 'busy');
    });
    webpButton.addEventListener('click', () => {
        send({ type: 'capture', mime: 'image/webp', quality: 0.92 });
        setStatus('capturing frame', 'busy');
    });
    webmButton.addEventListener('click', () => recordVideo(5000, 'video/webm;codecs=vp9'));
    webm10Button.addEventListener('click', () => recordVideo(10000, 'video/webm;codecs=vp9'));
    mp4Button.addEventListener('click', () => recordVideo(8000, 'video/mp4;codecs=avc1.42E01E'));

    function recordVideo(ms, mime) {
        if (recordTimer) window.clearTimeout(recordTimer);
        send({ type: 'record', ms, mime, bitrate: 14000000 });
        setStatus(`recording ${Math.round(ms / 1000)}s…`, 'busy');
    }

    captureSection.appendChild(el('div', 'note', 'Video is captured from the canvas only, so the caption overlay sits outside the frame. MP4 depends on browser support.'));

    function applyCaps() {
        webpButton.disabled = !caps.webp;
        webmButton.disabled = !caps.webm;
        webm10Button.disabled = !caps.webm;
        mp4Button.disabled = !caps.mp4;
        audioButton.disabled = !caps.audio;
        mp4Button.title = caps.mp4 ? '' : 'This browser cannot record MP4 from a canvas';
    }

    /*--- Sync incoming config into the panel ---*/

    function syncFromConfig(config) {
        if (!config) return;
        for (const [key, control] of controls) {
            if (key in config) control.set(config[key]);
        }
        if (typeof config.SAMPLE_WIDTH === 'number') {
            densityInput.value = config.SAMPLE_WIDTH;
            densityValue.textContent = `${Math.round(config.SAMPLE_WIDTH)} px`;
        }
    }

    /*--- File loading ---*/

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
            send({ type: 'mask', src: reader.result });
            setStatus(`swapped ${file.name.slice(0, 28)}`, 'busy');
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

    setStatus('connecting…', 'busy');
    window.setTimeout(() => {
        if (!ready) setStatus('no response from engine', 'bad');
    }, 8000);

    stage.addEventListener('load', () => {
        if (!ready) setStatus('waiting for engine…', 'busy');
    });

    hint.classList.add('show');
    window.setTimeout(() => hint.classList.remove('show'), 4200);
})();
