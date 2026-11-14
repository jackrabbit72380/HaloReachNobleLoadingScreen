/*  Holographic Particle Accelerator — engine
 *  Jackrabbit72380
 *  2026
 *
 *  A GPU particle animation: points fly in from a sphere, assemble whatever target they are
 *  pointed at, hold, fade and rebuild. Dependency free — WebGL2, one buffer, two programs.
 *  Every target is built here: the shapes, the equalizer wheel and the audio grid.
 *
 *  URL flags: ?4k ?2k ?sd  ?halfspeed  ?quarterspeed  ?nocaption  ?nocontrols
 */

(() => {
    'use strict';

    /*--- Configuration ---*/

    const CONFIG = {
        MASK_SRC: 'ball',            // a shape name, 'mesh', or an image URL / data URL
        MODE: 'shape',               // 'shape' | 'equalizer' | 'grid'
        VIEW: 'orbit',               // 'orbit' | 'inside'
        ZOOM: 1.0,
        TILT: 0,                     // degrees the model is pitched; 0 looks at it head-on
        PAN_X: 0,                    // view offset left/right, world units
        PAN_Y: 0,                    // view offset up/down, world units
        SWAY: 0,                     // 0..1 slow pitch wobble while the shape assembles
        ROTATE_SPEED: 0.40,          // radians per second once the shape is assembled
        SPIN_AXIS: 'y',              // the endless turn goes round this one: 'y', 'x' or 'z'
        STOP_ANGLE: 0,               // degrees: the yaw the assembly settles at
        LOOP: true,                  // false assembles once and rotates forever
        EQ_HEIGHT: 2.2,              // world height a full-scale spectrum band reaches
        SAMPLE_WIDTH: 260,
        DUST_PARTICLES: 6000,
        POINT_SIZE: 30.0,
        COLOR: [0.63, 0.84, 1.0],
        FOV: 42.0,
        ASSEMBLY_MS: 7000,
        HOLD_MS: 12000,
        FADE_MS: 1200,
        FADE_IN_MS: 900,
        MASK_HEIGHT: 4.6,
        MASK_LIFT: 0.0,
        // The point the turn goes around, in world units, from the middle of the target.
        // Zero is the target's own centre, which is where every built-in shape sits.
        PIVOT_X: 0.0,
        PIVOT_Y: 0.0,
        PIVOT_Z: 0.0,
        SPIN_TURNS: 1.0,
        MASK_DEPTH: 0.9,
        DUST_WIDTH: 12.0,
        DUST_HEIGHT: 6.5,
        GLOW: 9.0,
        CHROMA: 0.0,
        SHAKE: 0.0,
        SHOW_GRID: true,
        SHOW_SCAN: true,
        SHOW_VIGNETTE: true,
        AUDIO: 0.0,
        AUDIO_GAIN: 1.0,
        LABEL: 'Holographic Particle Accelerator',
        CAPTION_SCALE: 1.0
    };

    /*--- DOM & Context ---*/

    const canvas = document.getElementById('canvas');
    const caption = document.getElementById('caption');
    const loading = document.getElementById('loading');

    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        depth: false,
        powerPreference: 'high-performance'
    });

    if (!gl) {
        if (loading) loading.textContent = 'WebGL2 is required to run this animation.';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const SCALE = params.has('4k') ? 2.0 : params.has('2k') ? 1.34 : params.has('sd') ? 0.67 : 1.0;
    const TIME_SCALE = params.has('halfspeed') ? 0.5 : params.has('quarterspeed') ? 0.25 : 1.0;
    const SHOW_CAPTION = !params.has('nocaption');
    const ACCEPT_MESSAGES = !params.has('nocontrols');

    /*--- Shader Sources ---*/

    const BACKGROUND_VERTEX = `#version 300 es
        layout(location = 0) in vec2 aCorner;

        void main() {
            gl_Position = vec4(aCorner, 0.0, 1.0);
        }
    `;

    const BACKGROUND_FRAGMENT = `#version 300 es
        precision highp float;

        uniform vec2  uResolution;
        uniform float uTime;
        uniform float uFade;
        uniform float uGrid;
        uniform float uScan;
        uniform float uVignette;

        out vec4 outColor;

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            vec2 p  = uv - 0.5;
            p.x    *= uResolution.x / uResolution.y;

            float radius = length(p);
            float vig = smoothstep(1.05, 0.10, radius);

            vec3 ink = mix(vec3(0.008, 0.012, 0.018), vec3(0.030, 0.052, 0.068), vig * uVignette);

            ink += vec3(0.010, 0.030, 0.042) * smoothstep(0.55, 0.0, abs(uv.y - 0.44));

            vec2 cell = abs(fract(p * 22.0) - 0.5);
            float line = smoothstep(0.020, 0.0, min(cell.x, cell.y));
            ink += vec3(0.055, 0.085, 0.105) * line * vig * 0.55 * uGrid;

            float scan = smoothstep(0.020, 0.0, abs(fract(uv.y * 1.0 - uTime * 0.03) - 0.5));
            ink += vec3(0.010, 0.022, 0.030) * scan * vig * uScan;

            outColor = vec4(ink * uFade, 1.0);
        }
    `;

    const PARTICLE_VERTEX = `#version 300 es
        layout(location = 0) in vec3  aStart;
        layout(location = 1) in vec4  aTarget;
        layout(location = 2) in vec3  aSwerve;
        layout(location = 3) in float aKind;
        layout(location = 4) in vec2  aEq;

        uniform mat4  uProjection;
        uniform mat4  uView;
        uniform mat4  uModel;
        uniform float uProgress;
        uniform float uTime;
        uniform float uPointSize;
        uniform float uPixelScale;
        uniform float uFade;
        uniform float uHalfDepth;
        uniform float uAudio;
        uniform float uSpectrum[64];
        uniform float uEqHeight;
        uniform float uRadial;

        out float vAlpha;
        out float vShade;

        void main() {
            vec3 position;

            if (aKind > 0.5) {
                position = aStart + vec3(
                    sin(uTime * 0.055 + aTarget.w * 41.0),
                    cos(uTime * 0.042 + aTarget.w * 37.0),
                    sin(uTime * 0.031 + aTarget.w * 19.0)
                ) * 0.9;
                vAlpha = 0.14 * uFade;
                vShade = 0.75;
            } else {
                float t = clamp((uProgress - aTarget.w * 0.60) / 0.40, 0.0, 1.0);
                t = t * t * (3.0 - 2.0 * t);

                vec3 legA = mix(aStart, aSwerve, t);
                vec3 legB = mix(aSwerve, aTarget.xyz, t);
                position = mix(legA, legB, t);

                position += vec3(
                    sin(uTime * 0.9 + aTarget.w * 53.0),
                    cos(uTime * 1.1 + aTarget.w * 29.0),
                    0.0
                ) * 0.0035 * t;

                // Spectrum bands, from buildBuffer. The equalizer lifts each point up its own
                // column; every other target pushes it outward along its own radius, so the
                // music runs round the shape instead of raising the whole thing.
                if (aEq.y > 0.0) {
                    float level = uSpectrum[int(clamp(aEq.x, 0.0, 63.0))];
                    if (uRadial > 0.5) {
                        position += normalize(position + vec3(0.0001)) * (aEq.y * level * uEqHeight);
                    } else {
                        position.y += aEq.y * level * uEqHeight;
                    }
                }

                vAlpha = uFade * smoothstep(0.02, 0.28, t);

                float halfDepth = max(uHalfDepth, 0.001);
                vShade = mix(0.40, 1.0, clamp(position.z / halfDepth * 0.5 + 0.5, 0.0, 1.0));
            }

            vec4 viewPosition = uView * uModel * vec4(position, 1.0);
            gl_Position = uProjection * viewPosition;

            float distance = max(-viewPosition.z, 0.42);
            float kindScale = aKind > 0.5 ? 0.55 : 1.0;
            float pulse = 1.0 + uAudio * 0.85;
            gl_PointSize = min(uPointSize * uPixelScale * kindScale * pulse / distance, 120.0);
        }
    `;

    const PARTICLE_FRAGMENT = `#version 300 es
        precision mediump float;

        in float vAlpha;
        in float vShade;

        uniform vec3  uColor;
        uniform vec3  uColor2;
        uniform float uGlow;
        uniform float uChroma;
        uniform highp float uAudio;

        out vec4 outColor;

        void main() {
            vec2 offset = gl_PointCoord - 0.5;
            float falloff = exp(-dot(offset, offset) * uGlow);
            if (falloff < 0.01) discard;

            float rim = smoothstep(0.0, 0.5, length(offset));
            vec3 color = mix(uColor, uColor2, rim * uChroma);

            float boost = 1.0 + uAudio * 0.6;
            outColor = vec4(color * vShade, falloff * vAlpha * boost);
        }
    `;

    /*--- WebGL Helpers ---*/

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed.');
        }
        return shader;
    }

    function createProgram(vertexSource, fragmentSource) {
        const program = gl.createProgram();
        gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || 'Program link failed.');
        }
        return program;
    }

    function uniformsOf(program, names) {
        const locations = {};
        for (const name of names) locations[name] = gl.getUniformLocation(program, name);
        return locations;
    }

    /*--- Matrix Math (column major) ---*/

    function perspective(fovDegrees, aspect, near, far) {
        const f = 1.0 / Math.tan((fovDegrees * Math.PI) / 360.0);
        const nf = 1 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        ]);
    }

    function lookAt(eye, center, up) {
        let zx = eye[0] - center[0];
        let zy = eye[1] - center[1];
        let zz = eye[2] - center[2];
        let length = Math.hypot(zx, zy, zz) || 1;
        zx /= length; zy /= length; zz /= length;

        let xx = up[1] * zz - up[2] * zy;
        let xy = up[2] * zx - up[0] * zz;
        let xz = up[0] * zy - up[1] * zx;
        length = Math.hypot(xx, xy, xz) || 1;
        xx /= length; xy /= length; xz /= length;

        const yx = zy * xz - zz * xy;
        const yy = zz * xx - zx * xz;
        const yz = zx * xy - zy * xx;

        return new Float32Array([
            xx, yx, zx, 0,
            xy, yy, zy, 0,
            xz, yz, zz, 0,
            -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
            -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
            -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
            1
        ]);
    }

    function multiply4(a, b) {
        const out = new Float32Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                out[col * 4 + row] =
                    a[row] * b[col * 4] +
                    a[4 + row] * b[col * 4 + 1] +
                    a[8 + row] * b[col * 4 + 2] +
                    a[12 + row] * b[col * 4 + 3];
            }
        }
        return out;
    }

    // A turn about one axis: y is the turntable, x tumbles, z rolls.
    function turnMatrix(angle, axis) {
        const c = Math.cos(angle), s = Math.sin(angle);

        if (axis === 'x') {
            return new Float32Array([
                1, 0, 0, 0,
                0, c, s, 0,
                0, -s, c, 0,
                0, 0, 0, 1
            ]);
        }
        if (axis === 'z') {
            return new Float32Array([
                c, s, 0, 0,
                -s, c, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ]);
        }
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    // M = T(P) · R · T(-P): the turn goes around the pivot. TILT stays a pitch about X
    // whichever axis is turning.
    function rotation3D(spinAngle, tiltAngle, lift, pivot, axis) {
        const cx = Math.cos(tiltAngle), sx = Math.sin(tiltAngle);

        const pitch = new Float32Array([
            1, 0, 0, 0,
            0, cx, sx, 0,
            0, -sx, cx, 0,
            0, 0, 0, 1
        ]);

        const matrix = multiply4(pitch, turnMatrix(spinAngle, axis));

        const px = pivot[0];
        const py = pivot[1] + lift;
        const pz = pivot[2];

        matrix[12] = px - (matrix[0] * px + matrix[4] * py + matrix[8] * pz);
        matrix[13] = py - (matrix[1] * px + matrix[5] * py + matrix[9] * pz);
        matrix[14] = pz - (matrix[2] * px + matrix[6] * py + matrix[10] * pz);

        return matrix;
    }

    /*--- Mask Sampling ---*/

    // Shape generators by name, all in this file; HPA.shapes is this same table.
    const SHAPES = {};

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Unable to load ' + String(source).slice(0, 64)));
            image.src = source;
        });
    }

    async function sampleMask(source) {
        if (SHAPES[source]) return SHAPES[source]();
        if (source === 'mesh') return cloudPoints || ballPoints();

        const image = await loadImage(source);
        const width = Math.max(16, Math.round(CONFIG.SAMPLE_WIDTH));
        const height = Math.max(2, Math.round(width * (image.height / image.width)));

        const surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        const context = surface.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;

        let alphaMin = 255;
        let alphaMax = 0;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] < alphaMin) alphaMin = pixels[i];
            if (pixels[i] > alphaMax) alphaMax = pixels[i];
        }
        const useAlpha = (alphaMax - alphaMin) > 96;

        const worldHeight = CONFIG.MASK_HEIGHT;
        const worldWidth = worldHeight * (width / height);
        const aspect = width / height;

        const points = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;

                const coverage = useAlpha
                    ? pixels[index + 3] / 255
                    : 1 - (pixels[index] * 0.30 + pixels[index + 1] * 0.59 + pixels[index + 2] * 0.11) / 255;

                if (coverage < 0.25 || Math.random() > coverage) continue;

                const u = (x + Math.random()) / width;
                const v = (y + Math.random()) / height;

                const wx = (u - 0.5) * worldWidth;
                const wy = (0.5 - v) * worldHeight;

                const dx = (u - 0.5) * aspect;
                const dy = v - 0.5;
                const radial = Math.min(Math.hypot(dx, dy) / 0.62, 1.0);

                points.push({
                    x: wx,
                    y: wy,
                    z: (Math.random() - 0.5) * CONFIG.MASK_DEPTH,
                    wait: Math.min(Math.max(radial * 0.82 + Math.random() * 0.12, 0.0), 1.0)
                });
            }
        }

        return points;
    }

    /*--- Shapes ---*/

    // A point picked inside a triangle, by barycentric coordinates — the flat-faced shapes.
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

    // A ball: a sphere sampled on its surface, partly on a lat/long grid so it reads as a globe.
    function ballPoints() {
        const points = [];
        const radius = CONFIG.MASK_HEIGHT * 0.45;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const add = (x, y, z, wait) => points.push({ x, y, z, wait: clamp01(wait) });
        const waitFor = (x, y, z) => clamp01(Math.hypot(x, y, z) / radius * 0.78 + Math.random() * 0.15);

        for (let m = 0; m < 24; m++) {
            const lon = (m / 24) * Math.PI * 2;
            for (let i = 0; i < 120; i++) {
                const lat = (Math.random() * 2 - 1) * Math.PI / 2;
                const x = Math.cos(lat) * Math.cos(lon) * radius;
                const y = Math.sin(lat) * radius;
                const z = Math.cos(lat) * Math.sin(lon) * radius;
                add(x, y, z, waitFor(x, y, z));
            }
        }

        for (let p = 0; p < 12; p++) {
            const lat = ((p + 0.5) / 12) * Math.PI - Math.PI / 2;
            const ring = Math.cos(lat) * radius;
            const y = Math.sin(lat) * radius;
            for (let i = 0; i < 160; i++) {
                const lon = Math.random() * Math.PI * 2;
                const x = Math.cos(lon) * ring;
                const z = Math.sin(lon) * ring;
                add(x, y, z, waitFor(x, y, z));
            }
        }

        for (let i = 0; i < 6000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const shell = radius * (0.97 + Math.random() * 0.03);
            const x = Math.sin(phi) * Math.cos(theta) * shell;
            const y = Math.cos(phi) * shell;
            const z = Math.sin(phi) * Math.sin(theta) * shell;
            add(x, y, z, waitFor(x, y, z));
        }

        return points;
    }

    // A real 3D cube: six flat faces, edges and corners denser, so it holds up from any angle.
    function cubePoints() {
        const points = [];
        const half = CONFIG.MASK_HEIGHT * 0.45;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const add = (x, y, z, wait) => points.push({ x, y, z, wait: clamp01(wait) });
        const diagonal = half * Math.sqrt(3);
        const waitFor = (x, y, z) => clamp01(Math.hypot(x, y, z) / diagonal * 0.78 + Math.random() * 0.15);

        const face = (axis, sign, count) => {
            for (let i = 0; i < count; i++) {
                const u = (Math.random() * 2 - 1) * half;
                const v = (Math.random() * 2 - 1) * half;
                const fixed = sign * half + (Math.random() - 0.5) * 0.012 * sign;
                const x = axis === 0 ? fixed : u;
                const y = axis === 1 ? fixed : axis === 0 ? u : v;
                const z = axis === 2 ? fixed : v;
                add(x, y, z, waitFor(x, y, z));
            }
        };

        for (let axis = 0; axis < 3; axis++) {
            face(axis, 1, 1500);
            face(axis, -1, 1500);
        }

        for (let axis = 0; axis < 3; axis++) {
            for (const a of [-1, 1]) {
                for (const b of [-1, 1]) {
                    for (let i = 0; i < 220; i++) {
                        const along = (Math.random() * 2 - 1) * half;
                        const coords = [0, 0, 0];
                        coords[axis] = along;
                        coords[(axis + 1) % 3] = a * half;
                        coords[(axis + 2) % 3] = b * half;
                        add(coords[0], coords[1], coords[2], waitFor(coords[0], coords[1], coords[2]));
                    }
                }
            }
        }

        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    for (let i = 0; i < 40; i++) {
                        const x = sx * half + (Math.random() - 0.5) * 0.03;
                        const y = sy * half + (Math.random() - 0.5) * 0.03;
                        const z = sz * half + (Math.random() - 0.5) * 0.03;
                        add(x, y, z, waitFor(x, y, z));
                    }
                }
            }
        }

        return points;
    }

    // A ring with a solid tube; points are accepted by (R + r cos v) / (R + r) to spread evenly.
    function torusPoints() {
        const points = [];
        const R = 1.52;
        const r = 0.66;
        const reach = R + r;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
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

    // A nucleus with three orbits stood up round X by default, and an electron on each.
    function atomPoints() {
        const points = [];
        const reach = 1.9;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const add = (x, y, z, wait) => points.push({
            x, y, z,
            wait: wait === undefined ? clamp01(Math.hypot(x, y, z) / reach * 0.78 + Math.random() * 0.15) : wait
        });

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
        // The orbits stand up out of the flat plane by default, so the atom reads as an atom
        // from the front, each fanned 60° round the view axis and tipped slightly apart.
        for (let orbit = 0; orbit < 3; orbit++) {
            const fan = (orbit * Math.PI) / 3;
            const cosFan = Math.cos(fan);
            const sinFan = Math.sin(fan);
            const tip = (orbit - 1) * 0.35;
            const cosTip = Math.cos(tip);
            const sinTip = Math.sin(tip);

            // A point on this orbit: an ellipse half-height B, standing up in the view plane,
            // turned by `fan` round it and tipped back by `tip`.
            const at = (t) => {
                const across = Math.cos(t) * A;
                const along = Math.sin(t) * B;
                const px = across * cosFan - along * sinFan;
                const py = across * sinFan + along * cosFan;
                return [px, py * cosTip, py * sinTip];
            };

            for (let i = 0; i < 2400; i++) {
                const p = at(Math.random() * Math.PI * 2);
                add(p[0], p[1], p[2]);
            }

            const centre = orbit * 2.2 + 0.6;
            for (let i = 0; i < 320; i++) {
                const p = at(centre + (Math.random() - 0.5) * 0.06);
                add(
                    p[0] + (Math.random() - 0.5) * 0.07,
                    p[1] + (Math.random() - 0.5) * 0.07,
                    p[2] + (Math.random() - 0.5) * 0.07,
                    0.55 + Math.random() * 0.25
                );
            }
        }

        return points;
    }

    // Two strands wound round a shared axis, with rungs between them; it lies along X.
    function helixPoints() {
        const points = [];
        const LENGTH = 3.9;
        const RADIUS = 0.92;
        const TURNS = 2.6;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
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

    // A square pyramid: four triangular sides and a base, with ridges and corners denser.
    function pyramidPoints() {
        const points = [];
        const half = CONFIG.MASK_HEIGHT * 0.42;
        const top = CONFIG.MASK_HEIGHT * 0.46;
        const base = -CONFIG.MASK_HEIGHT * 0.34;
        const reach = Math.hypot(half, top, half);

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
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
    // at the centre, so it has a front and a back and reads from any angle.
    function starPoints() {
        const points = [];
        const outer = CONFIG.MASK_HEIGHT * 0.44;
        const inner = outer * 0.44;
        const depth = outer * 0.42;
        const reach = Math.hypot(outer, depth);

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
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

    // A real 3D spear, sampled on its surfaces, lying along X so the Y spin shows every side.
    function spearPoints() {
        const points = [];
        const TIP = CONFIG.MASK_HEIGHT / 2;
        const BUTT = -TIP;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const smooth = (value) => value * value * (3 - 2 * value);
        const add = (x, y, z, wait) => points.push({ x, y, z, wait: clamp01(wait) });
        const waitFor = (x) => clamp01((Math.abs(x) / TIP) * 0.80 + Math.random() * 0.15);

        const shaftRadius = (x) => {
            const grip = Math.exp(-Math.pow((x + 0.55) / 0.85, 2)) * 0.020;
            const taper = 0.012 * clamp01((x - 1.05) / 1.25);
            return 0.070 + grip - taper;
        };

        const bladeWidth = (x) => {
            const t = clamp01((x - 1.22) / (TIP - 1.22));
            return Math.sin(Math.pow(t, 0.62) * Math.PI) * 0.260 * (1 - t * 0.15);
        };
        const bladeThickness = (x) => 0.020 + bladeWidth(x) * 0.14;

        for (let i = 0; i < 900; i++) {
            const x = BUTT + Math.random() * 0.52;
            const radius = 0.020 + smooth((x - BUTT) / 0.52) * 0.090;
            const angle = Math.random() * Math.PI * 2;
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.85 + Math.random() * 0.10);
        }

        for (let i = 0; i < 5200; i++) {
            const x = -1.78 + Math.random() * 2.96;
            const angle = Math.random() * Math.PI * 2;
            const radius = shaftRadius(x);
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, waitFor(x));
        }

        for (let i = 0; i < 700; i++) {
            const x = 1.05 + Math.random() * 0.27;
            const radius = 0.070 + Math.sin(((x - 1.05) / 0.27) * Math.PI) * 0.070;
            const angle = Math.random() * Math.PI * 2;
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.55 + Math.random() * 0.20);
        }

        for (let i = 0; i < 5200; i++) {
            const x = 1.22 + Math.random() * (TIP - 1.22);
            const width = bladeWidth(x);
            if (width < 0.0005) continue;
            const thickness = bladeThickness(x);
            const angle = Math.random() * Math.PI * 2;
            add(x, Math.cos(angle) * width, Math.sin(angle) * thickness, waitFor(x));
        }

        return points;
    }

    // A flat disc of spectrum columns. The plane rotates with the model and every column
    // rises with its own frequency band, so it reads as a circular graphic equalizer.
    function equalizerPoints() {
        const points = [];
        const BANDS = 64;
        const inner = 1.25;
        const outer = 2.35;

        for (let band = 0; band < BANDS; band++) {
            const angle = (band / BANDS) * Math.PI * 2;
            const cx = Math.cos(angle);
            const cz = Math.sin(angle);
            for (let i = 0; i < 340; i++) {
                const radial = inner + Math.random() * (outer - inner);
                points.push({
                    x: cx * radial,
                    y: 0,
                    z: cz * radial,
                    wait: Math.random() * 0.6,
                    band,
                    height: 0.08 + Math.random() * 0.92
                });
            }
        }

        for (let i = 0; i < 3000; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radial = Math.sqrt(Math.random()) * outer;
            points.push({
                x: Math.cos(angle) * radial,
                y: 0,
                z: Math.sin(angle) * radial,
                wait: Math.random() * 0.9,
                band: 0,
                height: 0
            });
        }

        return points;
    }

    // The equalizer as a flat square instead of a wheel: an 8 × 8 grid of bars on a plane, one
    // cell per spectrum band. A Y turn spins it as a rotating grid; also a mode, not a mask.
    function gridPoints() {
        const points = [];
        const CELLS = 8;
        const side = CONFIG.MASK_HEIGHT;
        const pitch = side / CELLS;
        const barWidth = pitch * 0.62;

        for (let row = 0; row < CELLS; row++) {
            for (let col = 0; col < CELLS; col++) {
                const band = row * CELLS + col;
                const cx = (col + 0.5) * pitch - side / 2;
                const cz = (row + 0.5) * pitch - side / 2;
                for (let i = 0; i < 110; i++) {
                    points.push({
                        x: cx + (Math.random() - 0.5) * barWidth,
                        y: 0,
                        z: cz + (Math.random() - 0.5) * barWidth,
                        wait: Math.random() * 0.6,
                        band,
                        height: 0.08 + Math.random() * 0.92
                    });
                }
            }
        }

        // The plane the bars stand on: the grid of lines itself, so the square reads as a grid.
        for (let line = 0; line <= CELLS; line++) {
            const at = line * pitch - side / 2;
            for (let i = 0; i < 130; i++) {
                const along = (Math.random() - 0.5) * side;
                points.push({ x: along, y: 0, z: at, wait: Math.random() * 0.9, band: 0, height: 0 });
                points.push({ x: at, y: 0, z: along, wait: Math.random() * 0.9, band: 0, height: 0 });
            }
        }

        return points;
    }

    // Registered once every generator is defined, so the table is never half-built.
    SHAPES.ball = ballPoints;
    SHAPES.cube = cubePoints;
    SHAPES.torus = torusPoints;
    SHAPES.atom = atomPoints;
    SHAPES.helix = helixPoints;
    SHAPES.pyramid = pyramidPoints;
    SHAPES.star = starPoints;
    SHAPES.spear = spearPoints;

    /*--- Geometry ---*/

    function buildBuffer(maskPoints) {
        // The audio planes need a clean stage, so the dust behind them is thinned right out.
        const dustScale = CONFIG.MODE === 'equalizer' || CONFIG.MODE === 'grid' ? 0.18 : 1;
        const dust = Math.max(0, Math.round(CONFIG.DUST_PARTICLES * dustScale));
        const total = maskPoints.length + dust;
        const stride = 13;
        const data = new Float32Array(total * stride);
        let offset = 0;

        const randomUnit = () => Math.random() * 2 - 1;

        // How far the target reaches from its middle: inside view, Fit and the band weights need it.
        let reach = 0;
        for (const point of maskPoints) {
            const distance = Math.hypot(point.x, point.y, point.z);
            if (distance > reach) reach = distance;
        }
        if (!(reach > 0)) reach = 1;

        for (const point of maskPoints) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(randomUnit());
            const radius = 5.2 + Math.random() * 3.4;

            const sx = Math.sin(phi) * Math.cos(theta) * radius;
            const sy = Math.cos(phi) * radius * 0.72;
            const sz = Math.sin(phi) * Math.sin(theta) * radius;

            data[offset++] = sx;
            data[offset++] = sy;
            data[offset++] = sz;

            data[offset++] = point.x;
            data[offset++] = point.y;
            data[offset++] = point.z;
            data[offset++] = point.wait;

            data[offset++] = (sx + point.x) * 0.5 + randomUnit() * 0.85;
            data[offset++] = (sy + point.y) * 0.5 + randomUnit() * 0.55;
            data[offset++] = (sz + point.z) * 0.5 + randomUnit() * 0.85;

            // Which band a point answers and how hard it moves. The audio planes bring their own
            // pair and those win; anything else gets a band from its angle round the turn axis.
            data[offset++] = 0.0;
            data[offset++] = point.band === undefined ? bandOf(point) : point.band;
            data[offset++] = point.height === undefined ? reactOf(point, reach) : point.height;
        }

        for (let i = 0; i < dust; i++) {
            data[offset++] = randomUnit() * CONFIG.DUST_WIDTH;
            data[offset++] = randomUnit() * CONFIG.DUST_HEIGHT;
            data[offset++] = randomUnit() * 9.0 - 3.0;

            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = Math.random();

            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = 0.0;

            data[offset++] = 1.0;

            data[offset++] = 0.0;
            data[offset++] = 0.0;
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const bytes = stride * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, bytes, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bytes, 28);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bytes, 40);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, bytes, 44);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return { vao, buffer, count: total, maskCount: maskPoints.length, radius: reach };
    }

    // A band for a point that did not bring one: its angle round the turn axis, over 64 slots.
    function bandOf(point) {
        const angle = Math.atan2(point.z, point.x);
        return ((angle + Math.PI) / (Math.PI * 2)) * 63.999;
    }

    // How hard a point answers the music: the middle barely moves, the outer surface swells.
    function reactOf(point, reach) {
        const outward = Math.min(1, Math.hypot(point.x, point.y, point.z) / reach);
        return 0.05 + 0.13 * outward;
    }

    function disposeScene(old) {
        if (!old) return;
        if (old.buffer) gl.deleteBuffer(old.buffer);
        if (old.vao) gl.deleteVertexArray(old.vao);
    }

    /*--- Setup ---*/

    const backgroundProgram = createProgram(BACKGROUND_VERTEX, BACKGROUND_FRAGMENT);
    const backgroundUniforms = uniformsOf(backgroundProgram, [
        'uResolution', 'uTime', 'uFade', 'uGrid', 'uScan', 'uVignette'
    ]);

    const particleProgram = createProgram(PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    const particleUniforms = uniformsOf(particleProgram, [
        'uProjection', 'uView', 'uModel', 'uProgress', 'uTime',
        'uPointSize', 'uPixelScale', 'uFade', 'uColor', 'uColor2',
        'uGlow', 'uChroma', 'uHalfDepth', 'uAudio', 'uSpectrum', 'uEqHeight', 'uRadial'
    ]);

    const backgroundVao = gl.createVertexArray();
    gl.bindVertexArray(backgroundVao);
    const backgroundBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    let scene = null;
    let cloudPoints = null;
    let spectrum = new Float32Array(64);
    let projection = null;
    let startedAt = 0;
    let spinAccum = 0;
    let lastTick = 0;
    let captionVisible = false;
    let pixelScale = 1;

    function accentFor(color) {
        return new Float32Array([
            Math.min(1, color[0] * 0.70 + 0.24),
            Math.max(0, color[1] * 0.38),
            Math.min(1, color[2] * 0.85 + 0.10)
        ]);
    }
    let accent = accentFor(CONFIG.COLOR);

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(window.innerWidth * dpr * SCALE));
        canvas.height = Math.max(1, Math.round(window.innerHeight * dpr * SCALE));
        pixelScale = canvas.height / 1080;
        projection = perspective(CONFIG.FOV, canvas.width / canvas.height, 0.02, 80);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function applyCaption() {
        if (!caption) return;
        caption.textContent = CONFIG.LABEL;
        caption.style.setProperty('--caption-scale', String(CONFIG.CAPTION_SCALE));
    }

    /*--- Render Loop ---*/

    function cycleLength() {
        return Math.max(500, CONFIG.ASSEMBLY_MS + CONFIG.HOLD_MS + CONFIG.FADE_MS);
    }

    function easeOutCubic(value) {
        return 1 - Math.pow(1 - value, 3);
    }

    function render(now) {
        if (!startedAt) startedAt = now;

        const elapsed = (now - startedAt) * TIME_SCALE;
        const seconds = elapsed / 1000;

        // The endless turn is accumulated, so it never jumps when a cycle rebuilds the shape.
        const frameSeconds = lastTick ? Math.min(0.1, (now - lastTick) / 1000) * TIME_SCALE : 0;
        lastTick = now;
        if (seconds > CONFIG.ASSEMBLY_MS / 1000) spinAccum += frameSeconds * CONFIG.ROTATE_SPEED;

        const CYCLE = cycleLength();
        const cycleTime = elapsed % CYCLE;
        const progress = CONFIG.LOOP
            ? Math.min(cycleTime / Math.max(1, CONFIG.ASSEMBLY_MS), 1)
            : Math.min(elapsed / Math.max(1, CONFIG.ASSEMBLY_MS), 1);

        const fadeOut = CONFIG.LOOP && cycleTime > CYCLE - CONFIG.FADE_MS
            ? Math.max(0, (CYCLE - cycleTime) / Math.max(1, CONFIG.FADE_MS))
            : 1;
        const fadeIn = Math.min(elapsed / Math.max(1, CONFIG.FADE_IN_MS), 1);
        const fade = Math.min(fadeIn, fadeOut);

        const zoom = Math.max(0.15, Math.min(6, Number(CONFIG.ZOOM) || 1));
        const inside = CONFIG.VIEW === 'inside';
        // Inside view: the ball wants to sit inside its shell, the spear inside its tip, an
        // imported model inside its own surface. The audio planes are read from above.
        const shell = scene && scene.radius ? scene.radius : CONFIG.MASK_HEIGHT * 0.45;
        const eqPlane = CONFIG.MODE === 'equalizer' || CONFIG.MODE === 'grid';
        const insideDistance = eqPlane
            ? 1.1
            : CONFIG.MASK_SRC === 'spear'
                ? 2.0
                : CONFIG.MASK_SRC === 'mesh'
                    ? Math.max(0.8, shell * 0.78)
                    : 1.1;
        const distance = (inside ? insideDistance : 10.6 - 1.5 * easeOutCubic(progress)) / zoom;

        const shake = CONFIG.SHAKE * (1 - progress * 0.85);
        // Both audio planes lie flat, so they are read from above instead of edge-on.
        const eyeHeight = eqPlane ? 3.4 : 0.25;
        const eye = inside
            ? [
                Math.sin(seconds * 0.21) * 0.30 + Math.sin(seconds * 37.0) * shake * 0.15,
                0.10 + Math.cos(seconds * 0.17) * 0.18,
                distance
            ]
            : [
                Math.sin(seconds * 37.0) * shake,
                eyeHeight + Math.cos(seconds * 41.0) * shake,
                distance
            ];

        const panX = Number(CONFIG.PAN_X) || 0;
        const panY = Number(CONFIG.PAN_Y) || 0;
        eye[0] += panX;
        eye[1] += panY;

        const view = lookAt(eye, [panX, panY, 0], [0, 1, 0]);

        const spinEase = progress * progress * (3.0 - 2.0 * progress);
        const settle = 1 - spinEase;
        const stop = (Number(CONFIG.STOP_ANGLE) || 0) * Math.PI / 180;
        const spin = stop + settle * Math.PI * 2 * CONFIG.SPIN_TURNS + spinAccum;

        const sway = (Number(CONFIG.SWAY) || 0) * settle * 0.5 * Math.sin(seconds * 0.7);
        const tilt = eqPlane ? 0 : (Number(CONFIG.TILT) || 0) * Math.PI / 180 + sway;
        const model = rotation3D(spin, tilt, CONFIG.MASK_LIFT, [
            Number(CONFIG.PIVOT_X) || 0,
            Number(CONFIG.PIVOT_Y) || 0,
            Number(CONFIG.PIVOT_Z) || 0
        ], String(CONFIG.SPIN_AXIS || 'y').toLowerCase().charAt(0));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.disable(gl.BLEND);
        gl.useProgram(backgroundProgram);
        gl.uniform2f(backgroundUniforms.uResolution, canvas.width, canvas.height);
        gl.uniform1f(backgroundUniforms.uTime, seconds);
        gl.uniform1f(backgroundUniforms.uFade, fade);
        gl.uniform1f(backgroundUniforms.uGrid, CONFIG.SHOW_GRID ? 1 : 0);
        gl.uniform1f(backgroundUniforms.uScan, CONFIG.SHOW_SCAN ? 1 : 0);
        gl.uniform1f(backgroundUniforms.uVignette, CONFIG.SHOW_VIGNETTE ? 1 : 0);
        gl.bindVertexArray(backgroundVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (scene) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

            gl.useProgram(particleProgram);
            gl.uniformMatrix4fv(particleUniforms.uProjection, false, projection);
            gl.uniformMatrix4fv(particleUniforms.uView, false, view);
            gl.uniformMatrix4fv(particleUniforms.uModel, false, model);
            gl.uniform1f(particleUniforms.uProgress, progress);
            gl.uniform1f(particleUniforms.uTime, seconds);
            const insideScale = CONFIG.MASK_SRC === 'spear' ? 0.5 : 0.9;
            gl.uniform1f(particleUniforms.uPointSize, CONFIG.POINT_SIZE * (inside ? insideScale : 1) * (eqPlane ? 0.75 : 1));
            gl.uniform1f(particleUniforms.uPixelScale, pixelScale);
            gl.uniform1f(particleUniforms.uFade, fade);
            gl.uniform1f(particleUniforms.uHalfDepth, CONFIG.MASK_DEPTH * 0.5);
            gl.uniform1f(particleUniforms.uGlow, CONFIG.GLOW);
            gl.uniform1f(particleUniforms.uChroma, CONFIG.CHROMA);
            gl.uniform1f(particleUniforms.uAudio, CONFIG.AUDIO);
            gl.uniform1fv(particleUniforms.uSpectrum, spectrum);
            gl.uniform1f(particleUniforms.uEqHeight, CONFIG.EQ_HEIGHT);
            // The audio planes lift their bars; every other target pushes its points out.
            gl.uniform1f(particleUniforms.uRadial, eqPlane ? 0 : 1);
            gl.uniform3fv(particleUniforms.uColor, CONFIG.COLOR);
            gl.uniform3fv(particleUniforms.uColor2, accent);

            gl.bindVertexArray(scene.vao);
            gl.drawArrays(gl.POINTS, 0, scene.count);
            gl.bindVertexArray(null);
        }

        const shouldShow = SHOW_CAPTION && progress > 0.97 && fade > 0.25;
        if (shouldShow !== captionVisible) {
            captionVisible = shouldShow;
            if (caption) caption.classList.toggle('visible', shouldShow);
        }

        requestAnimationFrame(render);
    }

    /*--- Rebuild ---*/

    let rebuilding = null;

    function rebuild(restart = true) {
        rebuilding = (rebuilding || Promise.resolve()).then(async () => {
            const audioPlane = CONFIG.MODE === 'equalizer' ? equalizerPoints
                : CONFIG.MODE === 'grid' ? gridPoints
                    : null;
            const points = audioPlane ? audioPlane() : await sampleMask(CONFIG.MASK_SRC);
            const next = buildBuffer(points);
            next.points = points;      // kept on the CPU so the model can be exported
            disposeScene(scene);
            scene = next;
            if (restart) startedAt = 0;
            if (loading) loading.classList.add('hidden');
            return { count: next.count, maskCount: next.maskCount };
        }).catch((error) => {
            console.error(error);
            if (loading) loading.textContent = 'Unable to load the mask image.';
            return { error: String(error && error.message || error) };
        });
        return rebuilding;
    }

    /*--- Recording / Capture ---*/

    function capture(type = 'image/png', quality) {
        return canvas.toDataURL(type, quality);
    }

    function record({ ms = 5000, mime = 'video/webm', bitrate = 12000000 } = {}) {
        return new Promise((resolve, reject) => {
            if (typeof MediaRecorder === 'undefined') {
                reject(new Error('MediaRecorder is not available in this browser.'));
                return;
            }
            if (!MediaRecorder.isTypeSupported(mime)) {
                reject(new Error(mime + ' is not supported in this browser.'));
                return;
            }

            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
            const chunks = [];

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) chunks.push(event.data);
            };
            recorder.onerror = (event) => reject(event.error || new Error('Recording failed.'));
            recorder.onstop = () => {
                for (const track of stream.getTracks()) track.stop();
                resolve(new Blob(chunks, { type: mime }));
            };

            recorder.start();
            window.setTimeout(() => {
                if (recorder.state !== 'inactive') recorder.stop();
            }, Math.max(250, ms));
        });
    }

    /*--- Public API ---*/

    const ready = rebuild();

    window.HPA = {
        config: CONFIG,
        shapes: SHAPES,
        ready,
        rebuild: () => rebuild(true),
        setMask: (src) => { CONFIG.MASK_SRC = src; return rebuild(true); },
        // An imported mesh: points in world units, fitted by src/import.js, kept beside CONFIG.
        setPointCloud(points) {
            cloudPoints = Array.isArray(points) && points.length ? points : null;
            CONFIG.MASK_SRC = cloudPoints ? 'mesh' : 'ball';
            return rebuild(true);
        },
        set(patch = {}) {
            const needsRebuild =
                'MASK_SRC' in patch ||
                'MODE' in patch ||
                'SAMPLE_WIDTH' in patch ||
                'DUST_PARTICLES' in patch ||
                'MASK_DEPTH' in patch;
            Object.assign(CONFIG, patch);
            if ('COLOR' in patch) accent = accentFor(CONFIG.COLOR);
            if ('LABEL' in patch || 'CAPTION_SCALE' in patch) applyCaption();
            if (needsRebuild) return rebuild(true);
            if ('ASSEMBLY_MS' in patch || 'HOLD_MS' in patch || 'FADE_MS' in patch) startedAt = 0;
            return Promise.resolve({ count: scene ? scene.count : 0 });
        },
        // The endless turn is accumulated per frame, so a clean start has to zero it.
        resetRotation() {
            spinAccum = 0;
            return spinAccum;
        },
        setAudio(level) {
            CONFIG.AUDIO = Math.max(0, Math.min(1, Number(level) || 0));
        },
        setSpectrum(values) {
            const source = values && values.length ? values : [];
            for (let i = 0; i < spectrum.length; i++) {
                const value = Number(source[i]) || 0;
                spectrum[i] = Math.max(0, Math.min(1, value));
            }
        },
        capture,
        record,
        geometry() {
            return scene && scene.points ? scene.points : [];
        },
        // A zoom that frames the whole target, from its reach and the camera distance.
        fitZoom() {
            const radius = (scene && scene.radius) || CONFIG.MASK_HEIGHT * 0.45;
            if (!(radius > 0)) return 1;
            const tan = Math.tan(((Number(CONFIG.FOV) || 42) * Math.PI) / 180 / 2);
            const aspect = canvas.height ? canvas.width / canvas.height : 1;
            const framed = (9.1 * tan * 0.82 * Math.min(1, aspect)) / radius;
            return Math.max(0.15, Math.min(6, Number(framed.toFixed(2))));
        },
        snapshot() {
            return {
                count: scene ? scene.count : 0,
                maskCount: scene ? scene.maskCount : 0,
                spin: spinAccum,
                canvas: [canvas.width, canvas.height],
                config: JSON.parse(JSON.stringify(CONFIG))
            };
        }
    };

    /*--- Controller Bridge ---*/

    function postToController(message) {
        if (!window.parent || window.parent === window) return;
        try {
            window.parent.postMessage({ source: 'hpa-engine', ...message }, '*');
        } catch (error) {
            /* parent may be cross-origin; ignore */
        }
    }

    if (ACCEPT_MESSAGES) {
        window.addEventListener('message', async (event) => {
            const message = event.data;
            if (!message || message.source !== 'hpa-controller') return;

            try {
                switch (message.type) {
                    case 'set':
                        await window.HPA.set(message.patch || {});
                        postToController({ type: 'state', snapshot: window.HPA.snapshot() });
                        break;
                    case 'mask':
                        await window.HPA.setMask(message.src);
                        postToController({ type: 'state', snapshot: window.HPA.snapshot() });
                        break;
                    case 'rebuild':
                        await window.HPA.rebuild();
                        postToController({ type: 'state', snapshot: window.HPA.snapshot() });
                        break;
                    case 'audio':
                        window.HPA.setAudio(message.level);
                        break;
                    case 'capture': {
                        const dataUrl = capture(message.mime || 'image/png', message.quality);
                        postToController({ type: 'captured', dataUrl, mime: message.mime || 'image/png' });
                        break;
                    }
                    case 'record': {
                        postToController({ type: 'record-start', ms: message.ms });
                        const blob = await record(message);
                        postToController({ type: 'recorded', blob, mime: message.mime || 'video/webm' });
                        break;
                    }
                    default:
                        break;
                }
            } catch (error) {
                postToController({ type: 'error', message: String(error && error.message || error) });
            }
        });
    }

    /*--- Boot ---*/

    applyCaption();
    window.addEventListener('resize', resize);
    resize();

    // Arrow keys nudge the view about: left/right/up/down, shift for a bigger step.
    const ARROWS = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1]
    };

    window.addEventListener('keydown', (event) => {
        const move = ARROWS[event.key];
        if (!move || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        const step = event.shiftKey ? 1.0 : 0.25;
        CONFIG.PAN_X = Math.max(-9, Math.min(9, (Number(CONFIG.PAN_X) || 0) + move[0] * step));
        CONFIG.PAN_Y = Math.max(-9, Math.min(9, (Number(CONFIG.PAN_Y) || 0) + move[1] * step));
    });

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const next = (Number(CONFIG.ZOOM) || 1) * Math.exp(-event.deltaY * 0.0012);
        CONFIG.ZOOM = Math.max(0.15, Math.min(6, next));
    }, { passive: false });

    ready.then(() => {
        requestAnimationFrame(render);
        postToController({
            type: 'ready',
            snapshot: window.HPA.snapshot(),
            caps: {
                png: true,
                webp: (() => {
                    const probe = document.createElement('canvas');
                    probe.width = probe.height = 1;
                    return probe.toDataURL('image/webp').startsWith('data:image/webp');
                })(),
                webm: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'),
                mp4: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E'),
                audio: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            }
        });
    });
})();
