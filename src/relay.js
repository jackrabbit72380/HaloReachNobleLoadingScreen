/*  Holographic Particle Accelerator — window relay
 *  Jackrabbit72380
 *  2026
 *
 *  The controller lives in its own window and can be reloaded at any moment; its fresh
 *  document then holds no reference to this one. Keep offering this window to the opener,
 *  so the panel finds the animation already running and reconnects instead of restarting it.
 */

(() => {
    'use strict';

    function announce() {
        const opener = window.opener;
        if (!opener || opener === window) return;
        try {
            if (opener.closed) return;
            opener.HPA_PLAYER = window;
        } catch (error) {
            /* opener moved to another origin; nothing to offer */
        }
    }

    announce();
    window.setInterval(announce, 500);
})();
