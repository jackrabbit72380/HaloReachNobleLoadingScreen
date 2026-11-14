/*  Holographic Particle Accelerator — engine
 *  Jackrabbit72380
 *  2026
 *
 *  A GPU particle animation. Thousands of points fly in from a sphere and assemble
 *  whatever image they are pointed at, hold, fade, and rebuild. Controls live in
 *  controller.html; this file only renders and exposes window.HPA.
 *
 *  Deliberately dependency free: WebGL2, one buffer, two programs, no build step.
 *
 *  URL flags:
 *    ?4k ?2k ?sd    resolution scale
 *    ?halfspeed     half animation speed
 *    ?quarterspeed  quarter animation speed
 *    ?nocaption     never show the caption overlay
 *    ?nocontrols    ignore postMessage (standalone playback)
 */

(() => {
    'use strict';

    /*--- Configuration ---*/

    const CONFIG = {
        MASK_SRC: 'spear',           // 'spear' or any image URL / data URL
        MODE: 'shape',               // 'shape' | 'equalizer'
        VIEW: 'orbit',               // 'orbit' | 'inside'
        ZOOM: 1.0,
        ROTATE_SPEED: 0.40,          // radians per second once the shape is assembled
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

                // Equalizer columns: every point sits at its own slot up a bar, and the
                // bar rises with its own spectrum band, so the disc of bars dances in 3D.
                if (aEq.y > 0.0) {
                    float level = uSpectrum[int(clamp(aEq.x, 0.0, 63.0))];
                    position.y += aEq.y * level * uEqHeight;
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
        const nf = 1.0 / (near - far);
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

    function rotation3D(spinAngle, tiltAngle, lift) {
        const cy = Math.cos(spinAngle), sy = Math.sin(spinAngle);
        const cx = Math.cos(tiltAngle), sx = Math.sin(tiltAngle);

        const yaw = new Float32Array([
            cy, 0, -sy, 0,
            0, 1, 0, 0,
            sy, 0, cy, 0,
            0, 0, 0, 1
        ]);
        const pitch = new Float32Array([
            1, 0, 0, 0,
            0, cx, sx, 0,
            0, -sx, cx, 0,
            0, 0, 0, 1
        ]);

        const matrix = multiply4(pitch, yaw);
        matrix[13] = lift;
        return matrix;
    }

    /*--- Mask Sampling ---*/

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
        if (source === 'spear') return spearPoints();

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

    // A real 3D spear, sampled on its surfaces: pommel, ferrule, wrapped shaft, socket
    // collar and a lens-sectioned blade. It lies along X so the Y spin shows every side.
    function spearPoints() {
        const points = [];
        const TIP = CONFIG.MASK_HEIGHT / 2;
        const BUTT = -TIP;

        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const smooth = (value) => value * value * (3 - 2 * value);
        const add = (x, y, z, wait) => points.push({ x, y, z, wait: clamp01(wait) });
        const waitFor = (x) => clamp01((Math.abs(x) / TIP) * 0.80 + Math.random() * 0.15);

        // Shaft radius along X: thin at the butt, a grip swell, tapering into the collar.
        const shaftRadius = (x) => {
            const grip = Math.exp(-Math.pow((x + 0.55) / 0.85, 2)) * 0.020;
            const taper = 0.012 * clamp01((x - 1.05) / 1.25);
            return 0.070 + grip - taper;
        };

        // Blade: a leaf, wide in Y and thin in Z, with a spine ridge near the middle.
        const bladeWidth = (x) => {
            const t = clamp01((x - 1.22) / (TIP - 1.22));
            return Math.sin(Math.pow(t, 0.62) * Math.PI) * 0.260 * (1 - t * 0.15);
        };
        const bladeThickness = (x) => 0.020 + bladeWidth(x) * 0.14;

        // Pommel and ferrule.
        for (let i = 0; i < 900; i++) {
            const x = BUTT + Math.random() * 0.52;
            const radius = 0.020 + smooth((x - BUTT) / 0.52) * 0.090;
            const angle = Math.random() * Math.PI * 2;
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.85 + Math.random() * 0.10);
        }

        // Shaft.
        for (let i = 0; i < 5200; i++) {
            const x = -1.78 + Math.random() * 2.96;
            const angle = Math.random() * Math.PI * 2;
            const radius = shaftRadius(x);
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, waitFor(x));
        }

        // Socket collar where the blade meets the shaft.
        for (let i = 0; i < 700; i++) {
            const x = 1.05 + Math.random() * 0.27;
            const radius = 0.070 + Math.sin(((x - 1.05) / 0.27) * Math.PI) * 0.070;
            const angle = Math.random() * Math.PI * 2;
            add(x, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.55 + Math.random() * 0.20);
        }

        // Blade.
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

        // The plane the columns stand on.
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

    /*--- Geometry ---*/

    function buildBuffer(maskPoints) {
        // The equalizer needs a clean stage, so the dust behind it is thinned right out.
        const dustScale = CONFIG.MODE === 'equalizer' ? 0.18 : 1;
        const dust = Math.max(0, Math.round(CONFIG.DUST_PARTICLES * dustScale));
        const total = maskPoints.length + dust;
        const stride = 13;
        const data = new Float32Array(total * stride);
        let offset = 0;

        const randomUnit = () => Math.random() * 2 - 1;

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

            data[offset++] = 0.0;
            data[offset++] = point.band || 0;
            data[offset++] = point.height || 0;
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

        return { vao, buffer, count: total, maskCount: maskPoints.length };
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
        'uGlow', 'uChroma', 'uHalfDepth', 'uAudio', 'uSpectrum', 'uEqHeight'
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

        // The endless turn is accumulated rather than derived from the clock, so it never
        // jumps or pauses when a cycle rebuilds the shape, and it keeps going while LOOP
        // is off (assemble once, then turn forever).
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

        const zoom = Math.max(0.35, Math.min(6, Number(CONFIG.ZOOM) || 1));
        const inside = CONFIG.VIEW === 'inside';
        const distance = (inside ? 2.0 : 10.6 - 1.5 * easeOutCubic(progress)) / zoom;

        const eqMode = CONFIG.MODE === 'equalizer';
        const shake = CONFIG.SHAKE * (1 - progress * 0.85);
        // The equalizer is a flat disc, so it is read from above instead of edge-on.
        const eyeHeight = eqMode ? 3.4 : 0.25;
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

        const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);

        const spinEase = progress * progress * (3.0 - 2.0 * progress);
        const settle = 1 - spinEase;
        // Assembly winds the shape in and eases it to STOP_ANGLE; from there the endless
        // turn takes over, so the angle it finishes coming together at is yours to pick.
        const stop = (Number(CONFIG.STOP_ANGLE) || 0) * Math.PI / 180;
        const spin = stop + settle * Math.PI * 2 * CONFIG.SPIN_TURNS + spinAccum;

        const tilt = eqMode ? 0 : 0.42 + settle * 0.5 * Math.sin(seconds * 0.7);
        const model = rotation3D(spin, tilt, CONFIG.MASK_LIFT);

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
            gl.uniform1f(particleUniforms.uPointSize, CONFIG.POINT_SIZE * (inside ? 0.5 : 1) * (eqMode ? 0.75 : 1));
            gl.uniform1f(particleUniforms.uPixelScale, pixelScale);
            gl.uniform1f(particleUniforms.uFade, fade);
            gl.uniform1f(particleUniforms.uHalfDepth, CONFIG.MASK_DEPTH * 0.5);
            gl.uniform1f(particleUniforms.uGlow, CONFIG.GLOW);
            gl.uniform1f(particleUniforms.uChroma, CONFIG.CHROMA);
            gl.uniform1f(particleUniforms.uAudio, CONFIG.AUDIO);
            gl.uniform1fv(particleUniforms.uSpectrum, spectrum);
            gl.uniform1f(particleUniforms.uEqHeight, CONFIG.EQ_HEIGHT);
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
            const points = CONFIG.MODE === 'equalizer'
                ? equalizerPoints()
                : await sampleMask(CONFIG.MASK_SRC);
            const next = buildBuffer(points);
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
        ready,
        rebuild: () => rebuild(true),
        setMask: (src) => { CONFIG.MASK_SRC = src; return rebuild(true); },
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
        snapshot() {
            return {
                count: scene ? scene.count : 0,
                maskCount: scene ? scene.maskCount : 0,
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

    // The particle window is its own page, so zooming here is what people reach for.
    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        const next = (Number(CONFIG.ZOOM) || 1) * Math.exp(-event.deltaY * 0.0012);
        CONFIG.ZOOM = Math.max(0.35, Math.min(6, next));
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
