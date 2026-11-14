/*  Holographic Particle Accelerator — Show
 *  Jackrabbit72380
 *  2026
 *
 *  The auto-pilot that runs inside the particle window while a mode is on:
 *  it reads the audio level the panel already sends, breathes the zoom and walks the tint
 *  round the wheel. Everything it touches is CONFIG, so the engine itself needs no changes.
 *
 *  HPA.show({ mode: 'off' | 'inside' | 'visualizer' | 'rainbow', preset, pulse, drift })
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api) return;

    const DEFAULTS = { mode: 'off', preset: 'pulse', pulse: 0.5, drift: 0.3 };

    // How hard each visualizer preset pushes. zoom is the level-driven punch, hue is degrees
    // per second at rest, breathe is the slow swell that keeps it moving with no music.
    const LOOKS = {
        pulse: { zoom: 0.45, hue: 12, breathe: 0.10 },
        drift: { zoom: 0.18, hue: 42, breathe: 0.22 },
        chaos: { zoom: 0.75, hue: 150, breathe: 0.30 }
    };

    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

    let state = { ...DEFAULTS };
    let hue = 200;
    let baseZoom = 1;
    let baseColor = null;
    let last = 0;

    function hslToRgb(degrees) {
        const h = (((degrees % 360) + 360) % 360) / 360;
        const s = 0.82;
        const l = 0.62;
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const channel = (t) => {
            let x = t;
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            if (x < 1 / 6) return p + (q - p) * 6 * x;
            if (x < 0.5) return q;
            if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
            return p;
        };
        return [
            Number(channel(h + 1 / 3).toFixed(3)),
            Number(channel(h).toFixed(3)),
            Number(channel(h - 1 / 3).toFixed(3))
        ];
    }

    function hueOf(rgb) {
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const span = max - min;
        if (!span) return 200;
        let h;
        if (max === r) h = ((g - b) / span) % 6;
        else if (max === g) h = (b - r) / span + 2;
        else h = (r - g) / span + 4;
        return (h * 60 + 360) % 360;
    }

    // Remember what the panel had set, so leaving a mode hands the picture back untouched.
    function capture() {
        if (baseColor) return;
        baseColor = api.config.COLOR.slice(0, 3);
        baseZoom = api.config.ZOOM;
        hue = hueOf(baseColor);
    }

    function release() {
        if (!baseColor) return;
        api.set({ COLOR: baseColor.slice(0, 3), ZOOM: baseZoom });
        baseColor = null;
    }

    function tick(now) {
        requestAnimationFrame(tick);
        const seconds = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        if (state.mode === 'off' || state.mode === 'inside') return;

        const level = clamp(Number(api.config.AUDIO) || 0, 0, 1);

        if (state.mode === 'rainbow') {
            // A turn every five seconds at rest, faster as drift goes up.
            hue = (hue + 72 * seconds * (1 + state.drift * 4)) % 360;
            api.set({ COLOR: hslToRgb(hue) });
            return;
        }

        const look = LOOKS[state.preset] || LOOKS.pulse;
        hue = (hue + look.hue * seconds * (1 + state.drift * 2 + level)) % 360;
        const breathe = Math.sin(now / 1400) * look.breathe;
        const zoom = clamp(baseZoom * (1 + state.pulse * (look.zoom * level + breathe)), 0.35, 6);
        api.set({ COLOR: hslToRgb(hue), ZOOM: zoom });
    }

    api.show = (options = {}) => {
        const next = options.mode || state.mode;
        if (next !== state.mode) {
            if (state.mode === 'off') capture();
            if (next === 'off') release();
        }

        state = { ...state, ...options };
        if (!(state.preset in LOOKS)) state.preset = DEFAULTS.preset;
        state.pulse = clamp(Number(state.pulse), 0, 1);
        state.drift = clamp(Number(state.drift), 0, 1);

        return { ...state };
    };

    api.show.state = () => ({ ...state });

    api.show.reset = () => {
        const wasOff = state.mode === 'off';
        state = { ...DEFAULTS };
        if (!wasOff) release();
        return { ...state };
    };

    requestAnimationFrame(tick);
})();
