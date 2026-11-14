/*  Holographic Particle Accelerator — dock
 *  Jackrabbit72380
 *  2026
 *
 *  The controller panel lives inside the particle window, sliding in from the right instead of
 *  sitting in a window of its own. Home opens and closes it; the animation keeps running behind.
 *
 *  src/controller.js talks to "the player window" through a handle and calls window.HPA on it.
 *  Inside this page that window is this one, so it is handed a stand-in handle pointing at its
 *  own engine — the panel code itself is unchanged and still works from controller.html too.
 */

(() => {
    'use strict';

    const dock = document.getElementById('dock');
    if (!dock) return;

    window.HPA_PLAYER = {
        closed: false,
        HPA: window.HPA,
        focus() { /* this window already has focus */ },
        close() { /* nothing to close: the panel is docked here */ }
    };

    const hint = document.getElementById('dock-hint');

    function setOpen(open) {
        dock.classList.toggle('open', open);
        dock.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (hint) hint.hidden = open;
    }

    // Home is not used by the engine (it only reads the arrow keys), so it is free for this.
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Home' || event.ctrlKey || event.metaKey || event.altKey) return;

        // Let a text field keep its own Home: that key jumps to the start of the line there.
        const field = event.target;
        if (field && (field.isContentEditable ||
            (field.tagName === 'INPUT' && ['text', 'color', 'search', 'email', 'url'].includes(field.type)) ||
            field.tagName === 'TEXTAREA')) return;

        event.preventDefault();
        setOpen(!dock.classList.contains('open'));
    });

    if (hint) {
        hint.addEventListener('click', () => setOpen(true));
        hint.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setOpen(true);
            }
        });
    }

    setOpen(false);
})();
