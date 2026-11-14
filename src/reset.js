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
        // Two things live outside CONFIG and so cannot ride along with it: the show autopilot
        // (switched off here, before the settings land, so its tint and zoom cannot win) and the
        // endless turn, which is accumulated in the engine.
        if (api.show && api.show.reset) api.show.reset();
        if (api.resetRotation) api.resetRotation();

        // One call is enough. set() assigns every key of the patch, re-derives the accent and the
        // caption from them, and — because the snapshot carries the buffer keys (MASK_SRC, MODE,
        // SAMPLE_WIDTH, DUST_PARTICLES, MASK_DEPTH) — resamples the target and restarts the
        // assembly from zero. Written as one call so there is no half-restored CONFIG in between.
        return api.set(clone(DEFAULTS));
    };
})();
