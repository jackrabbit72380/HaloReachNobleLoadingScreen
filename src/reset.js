/*  Holographic Particle Accelerator — Reset
 *  Jackrabbit72380
 *  2026
 *
 *  Snapshots the shipped settings as soon as the engine is up and puts every one of them
 *  back on HPA.reset(). Kept beside the engine rather than inside it, so the renderer stays
 *  about rendering and the "what a fresh install looks like" copy lives in one small file.
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api) return;

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const DEFAULTS = clone(api.config);

    api.reset = () => {
        for (const key of Object.keys(DEFAULTS)) api.config[key] = clone(DEFAULTS[key]);

        // set() is what makes the engine act on the values: it re-derives the accent and the
        // caption, resamples the target and starts the assembly again from zero.
        return api.set({
            COLOR: clone(DEFAULTS.COLOR),
            LABEL: DEFAULTS.LABEL,
            CAPTION_SCALE: DEFAULTS.CAPTION_SCALE,
            MODE: DEFAULTS.MODE,
            MASK_SRC: DEFAULTS.MASK_SRC,
            ASSEMBLY_MS: DEFAULTS.ASSEMBLY_MS
        });
    };
})();
