/*  Holographic Particle Accelerator — 3D shapes
 *  Jackrabbit72380
 *  2026
 *
 *  The five procedural targets, as real geometry rather than flat drawings: a torus, an atom, a
 *  double helix, a square pyramid and a star. Each one returns points in world units and is
 *  registered on HPA.shapes, which is the table src/engine.js samples a target from, so they
 *  are drawn exactly like the ball, cube and spear — turn them and you see the far side.
 *
 *  Shapes are built around the origin and sized against CONFIG.MASK_HEIGHT (4.6), the same as
 *  the built-in ones, so swapping targets does not change how big the thing is on screen.
 */

(() => {
    'use strict';

    const api = window.HPA;
    if (!api || !api.shapes) return;

    const clamp01 = (value) => Math.max(0, Math.min(1, value));

    // A point picked anywhere inside a triangle, by barycentric coordinates. The flat-faced
    // shapes below are all built out of these.
    function trianglePoint(a, b, c) {
        let u = Math.random();
        let v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        return [
            a[0] * w + b[0] * u + c[0] * v,
            a[1] * w + b[1] * u + c[1] * v,
            a[2] * w + b[2] * u + c[2] * v
        ];
    }

    // A ring with a solid tube. The surface points are accepted by (R + r cos v) / (R + r), which
    // is what spreads them evenly instead of bunching them on the inner rim.
    function torus() {
        const points = [];
        const R = 1.52;
        const r = 0.66;
        const reach = R + r;

        const add = (x, y, z) => points.push({
            x, y, z,
            wait: clamp01(Math.hypot(x, y, z) / reach * 0.78 + Math.random() * 0.15)
        });

        const surface = (u, v) => {
            const ring = R + r * Math.cos(v);
            return [Math.cos(u) * ring, r * Math.sin(v), Math.sin(u) * ring];
        };

        let placed = 0;
        while (placed < 9000) {
            const u = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI * 2;
            if (Math.random() > (R + r * Math.cos(v)) / (R + r)) continue;
            const p = surface(u, v);
            add(p[0], p[1], p[2]);
            placed++;
        }

        // Both rims of the tube, then meridians over it, so the outline stays crisp.
        for (const v of [0, Math.PI]) {
            for (let i = 0; i < 1200; i++) {
                const p = surface(Math.random() * Math.PI * 2, v);
                add(p[0], p[1], p[2]);
            }
        }
        for (let m = 0; m < 24; m++) {
            const u = (m / 24) * Math.PI * 2;
            for (let i = 0; i < 90; i++) {
                const p = surface(u, Math.random() * Math.PI * 2);
                add(p[0], p[1], p[2]);
            }
        }

        return points;
    }

    // A nucleus ball with three elliptical orbits standing in different planes, and an electron
    // riding each one. The flat atom was the same drawing; this one has depth.
    function atom() {
        const points = [];
        const reach = 1.9;
        const add = (x, y, z, wait) => points.push({
            x, y, z,
            wait: wait === undefined ? clamp01(Math.hypot(x, y, z) / reach * 0.78 + Math.random() * 0.15) : wait
        });

        // Nucleus.
        const core = 0.34;
        for (let i = 0; i < 2200; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const shell = core * (0.85 + Math.random() * 0.15);
            add(
                Math.sin(phi) * Math.cos(theta) * shell,
                Math.cos(phi) * shell,
                Math.sin(phi) * Math.sin(theta) * shell,
                0.05 + Math.random() * 0.2
            );
        }

        const A = 1.85;
        const B = 0.62;

        for (let orbit = 0; orbit < 3; orbit++) {
            const turn = (orbit / 3) * Math.PI;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);

            const at = (t) => {
                const flatX = Math.cos(t) * A;
                const flatZ = Math.sin(t) * B;
                return [flatX * cos - flatZ * sin, flatX * sin + flatZ * cos];
            };

            for (let i = 0; i < 2400; i++) {
                const p = at(Math.random() * Math.PI * 2);
                add(p[0], 0, p[1]);
            }

            // The electron: a clump of points riding the same orbit.
            const centre = orbit * 2.2 + 0.6;
            for (let i = 0; i < 320; i++) {
                const p = at(centre + (Math.random() - 0.5) * 0.06);
                add(
                    p[0] + (Math.random() - 0.5) * 0.07,
                    (Math.random() - 0.5) * 0.07,
                    p[1] + (Math.random() - 0.5) * 0.07,
                    0.55 + Math.random() * 0.25
                );
            }
        }

        return points;
    }

    // Two strands wound round a shared axis, with rungs between them. It lies along X, like the
    // spear, so the endless Y turn shows the wind from every side.
    function helix() {
        const points = [];
        const LENGTH = 3.9;
        const RADIUS = 0.92;
        const TURNS = 2.6;

        const add = (x, y, z) => points.push({
            x, y, z,
            wait: clamp01((Math.abs(x) / (LENGTH / 2)) * 0.80 + Math.random() * 0.15)
        });

        const angleAt = (x) => (x / LENGTH) * Math.PI * 2 * TURNS;

        for (let strand = 0; strand < 2; strand++) {
            const offset = strand * Math.PI;
            for (let i = 0; i < 4200; i++) {
                const x = (Math.random() * 2 - 1) * (LENGTH / 2);
                const angle = angleAt(x) + offset;
                add(x, Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS);
            }
        }

        // Rungs: a straight run from one strand to the other, through the axis.
        const rungs = 15;
        for (let r = 0; r < rungs; r++) {
            const x = -LENGTH / 2 + (r / (rungs - 1)) * LENGTH;
            const base = angleAt(x);
            for (let i = 0; i < 260; i++) {
                const angle = base + Math.random() * Math.PI;
                add(x, Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS);
            }
        }

        return points;
    }

    // A square pyramid: four triangular sides and a base, with the ridges and the base's edges
    // denser, so it keeps its corners as it turns.
    function pyramid() {
        const points = [];
        const half = api.config.MASK_HEIGHT * 0.42;
        const top = api.config.MASK_HEIGHT * 0.46;
        const base = -api.config.MASK_HEIGHT * 0.34;
        const reach = Math.hypot(half, top, half);

        const add = (x, y, z) => points.push({
            x, y, z,
            wait: clamp01(Math.hypot(x, y, z) / reach * 0.78 + Math.random() * 0.15)
        });
        const fill = (a, b, c, count) => {
            for (let i = 0; i < count; i++) {
                const p = trianglePoint(a, b, c);
                add(p[0], p[1], p[2]);
            }
        };

        const apex = [0, top, 0];
        const corners = [
            [-half, base, -half],
            [half, base, -half],
            [half, base, half],
            [-half, base, half]
        ];

        for (let i = 0; i < 4; i++) {
            fill(apex, corners[i], corners[(i + 1) % 4], 1800);
        }
        fill(corners[0], corners[1], corners[2], 1800);
        fill(corners[0], corners[2], corners[3], 1800);

        // The four ridges down from the apex, and the four edges of the base.
        for (const corner of corners) {
            for (let i = 0; i < 260; i++) {
                const t = Math.random();
                add(
                    corner[0] * t,
                    top + (base - top) * t,
                    corner[2] * t
                );
            }
        }
        for (let i = 0; i < 4; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % 4];
            for (let j = 0; j < 260; j++) {
                const t = Math.random();
                add(a[0] + (b[0] - a[0]) * t, base, a[2] + (b[2] - a[2]) * t);
            }
        }

        return points;
    }

    // A five-pointed star with real thickness: ten rim points, each face drawn back to a point
    // at the centre of the star, so it has a front and a back and reads from any angle.
    function star() {
        const points = [];
        const outer = api.config.MASK_HEIGHT * 0.44;
        const inner = outer * 0.44;
        const depth = outer * 0.42;
        const reach = Math.hypot(outer, depth);

        const add = (x, y, z) => points.push({
            x, y, z,
            wait: clamp01(Math.hypot(x, y, z) / reach * 0.78 + Math.random() * 0.15)
        });
        const fill = (a, b, c, count) => {
            for (let i = 0; i < count; i++) {
                const p = trianglePoint(a, b, c);
                add(p[0], p[1], p[2]);
            }
        };

        const rim = [];
        for (let i = 0; i < 10; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI) / 5;
            const radius = i % 2 === 0 ? outer : inner;
            rim.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
        }

        const front = [0, 0, depth];
        const back = [0, 0, -depth];

        for (let i = 0; i < 10; i++) {
            const a = rim[i];
            const b = rim[(i + 1) % 10];
            fill(front, a, b, 520);
            fill(back, b, a, 520);
        }

        // The rim itself, so the points of the star stay sharp.
        for (let i = 0; i < 10; i++) {
            const a = rim[i];
            const b = rim[(i + 1) % 10];
            for (let j = 0; j < 200; j++) {
                const t = Math.random();
                add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0);
            }
        }

        return points;
    }

    api.shapes.torus = torus;
    api.shapes.atom = atom;
    api.shapes.helix = helix;
    api.shapes.pyramid = pyramid;
    api.shapes.star = star;
})();
