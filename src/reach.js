/*  NOBLE — Halo: Reach Loading Screen
 *  Jackrabbit72380
 *  2026
 *
 *  A GPU particle loading animation. Thousands of points drift in from a sphere
 *  and assemble the NOBLE Team emblem; once assembled, the Halo: Reach wordmark
 *  fades in over a dim holographic grid. The loop then breathes, fades and
 *  rebuilds.
 *
 *  Deliberately dependency free: WebGL2, one buffer, two programs, no build step.
 *
 *  URL flags:
 *    ?4k ?2k ?sd    resolution scale
 *    ?halfspeed     half animation speed
 *    ?quarterspeed  quarter animation speed
 *    ?nowordmark    never show the wordmark overlay
 */

(() => {
    'use strict';

    /*--- Configuration ---*/

    const CONFIG = {
        EMBLEM_SRC: 'res/noble-emblem.png',
        SAMPLE_WIDTH: 300,          // Horizontal samples taken from the emblem mask
        DUST_PARTICLES: 1600,       // Free-floating background motes
        POINT_SIZE: 30.0,           // Point size at 1080p, one unit from camera
        COLOR: [0.63, 0.84, 1.0],   // Hologram tint (linear-ish sRGB)
        FOV: 42.0,
        ASSEMBLY_MS: 4200,          // Time for every particle to reach the emblem
        HOLD_MS: 5200,              // Assembled screen time
        FADE_MS: 1300,              // Scene fade before the loop restarts
        FADE_IN_MS: 900,            // Opening fade from black
        EMBLEM_HEIGHT: 4.6          // World-space height of the finished emblem
    };

    /*--- DOM & Context ---*/

    const canvas = document.getElementById('canvas');
    const wordmark = document.getElementById('wordmark');
    const loading = document.getElementById('loading');

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
    const SHOW_WORDMARK = !params.has('nowordmark');

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

        out vec4 outColor;

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            vec2 p  = uv - 0.5;
            p.x    *= uResolution.x / uResolution.y;

            // Radial vignette
            float radius = length(p);
            float vig = smoothstep(1.05, 0.10, radius);

            vec3 ink = mix(vec3(0.008, 0.012, 0.018), vec3(0.030, 0.052, 0.068), vig);

            // Cool band across the horizon
            ink += vec3(0.010, 0.030, 0.042) * smoothstep(0.55, 0.0, abs(uv.y - 0.44));

            // Faint engineering grid
            vec2 cell = abs(fract(p * 22.0) - 0.5);
            float line = smoothstep(0.020, 0.0, min(cell.x, cell.y));
            ink += vec3(0.055, 0.085, 0.105) * line * vig * 0.55;

            // Slow horizontal scan
            float scan = smoothstep(0.020, 0.0, abs(fract(uv.y * 1.0 - uTime * 0.03) - 0.5));
            ink += vec3(0.010, 0.022, 0.030) * scan * vig;

            outColor = vec4(ink * uFade, 1.0);
        }
    `;

    const PARTICLE_VERTEX = `#version 300 es
        layout(location = 0) in vec3  aStart;
        layout(location = 1) in vec4  aTarget;   // xyz final position, w assembly delay
        layout(location = 2) in vec3  aSwerve;
        layout(location = 3) in float aKind;     // 0 = emblem particle, 1 = dust mote

        uniform mat4  uProjection;
        uniform mat4  uView;
        uniform mat4  uModel;
        uniform float uProgress;
        uniform float uTime;
        uniform float uPointSize;
        uniform float uPixelScale;
        uniform float uFade;

        out float vAlpha;

        void main() {
            vec3 position;

            if (aKind > 0.5) {
                // Ambient dust: slow, self-contained drift
                position = aStart + vec3(
                    sin(uTime * 0.35 + aTarget.w * 41.0),
                    cos(uTime * 0.28 + aTarget.w * 37.0),
                    sin(uTime * 0.22 + aTarget.w * 19.0)
                ) * 0.30;
                vAlpha = 0.16 * uFade;
            } else {
                // Assembly: staggered, eased, curved path start -> swerve -> target
                float t = clamp((uProgress - aTarget.w * 0.60) / 0.40, 0.0, 1.0);
                t = t * t * (3.0 - 2.0 * t);

                vec3 legA = mix(aStart, aSwerve, t);
                vec3 legB = mix(aSwerve, aTarget.xyz, t);
                position = mix(legA, legB, t);

                // Post-arrival breathing keeps the emblem alive
                position += vec3(
                    sin(uTime * 0.9 + aTarget.w * 53.0),
                    cos(uTime * 1.1 + aTarget.w * 29.0),
                    0.0
                ) * 0.0035 * t;

                vAlpha = uFade * smoothstep(0.02, 0.28, t);
            }

            vec4 viewPosition = uView * uModel * vec4(position, 1.0);
            gl_Position = uProjection * viewPosition;

            float distance = max(-viewPosition.z, 0.15);
            float kindScale = aKind > 0.5 ? 0.55 : 1.0;
            gl_PointSize = uPointSize * uPixelScale * kindScale / distance;
        }
    `;

    const PARTICLE_FRAGMENT = `#version 300 es
        precision mediump float;

        in float vAlpha;

        uniform vec3 uColor;

        out vec4 outColor;

        void main() {
            vec2 offset = gl_PointCoord - 0.5;
            float falloff = exp(-dot(offset, offset) * 9.0);
            if (falloff < 0.01) discard;
            outColor = vec4(uColor, falloff * vAlpha);
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

    function rotationY(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    /*--- Emblem Sampling ---*/

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Unable to load ' + source));
            image.src = source;
        });
    }

    // Reads the emblem SVG into a small offscreen canvas and returns the world-space
    // position of every particle that makes up its silhouette.
    async function sampleEmblem() {
        const image = await loadImage(CONFIG.EMBLEM_SRC);
        const width = CONFIG.SAMPLE_WIDTH;
        const height = Math.max(2, Math.round(width * (image.height / image.width)));

        const surface = document.createElement('canvas');
        surface.width = width;
        surface.height = height;
        const context = surface.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;

        // Sources differ: some are transparent cut-outs, others an opaque bitmap with a
        // dark glyph on white. Detect which one this is rather than assuming.
        let alphaMin = 255;
        let alphaMax = 0;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] < alphaMin) alphaMin = pixels[i];
            if (pixels[i] > alphaMax) alphaMax = pixels[i];
        }
        const useAlpha = (alphaMax - alphaMin) > 96;

        const worldHeight = CONFIG.EMBLEM_HEIGHT;
        const worldWidth = worldHeight * (width / height);
        const aspect = width / height;

        const points = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;

                // Coverage: opacity for cut-outs, inverted luminance for opaque art
                const coverage = useAlpha
                    ? pixels[index + 3] / 255
                    : 1 - (pixels[index] * 0.30 + pixels[index + 1] * 0.59 + pixels[index + 2] * 0.11) / 255;

                // Soft edges still contribute, but at reduced probability
                if (coverage < 0.25 || Math.random() > coverage) continue;

                const u = (x + Math.random()) / width;
                const v = (y + Math.random()) / height;

                const wx = (u - 0.5) * worldWidth;
                const wy = (0.5 - v) * worldHeight;

                // Normalised radial distance drives the assembly order
                const dx = (u - 0.5) * aspect;
                const dy = v - 0.5;
                const radial = Math.min(Math.hypot(dx, dy) / 0.62, 1.0);

                points.push({
                    x: wx,
                    y: wy,
                    z: (Math.random() - 0.5) * 0.22,
                    wait: Math.min(Math.max(radial * 0.82 + Math.random() * 0.12, 0.0), 1.0)
                });
            }
        }

        return points;
    }

    /*--- Geometry ---*/

    function buildBuffer(emblemPoints) {
        const total = emblemPoints.length + CONFIG.DUST_PARTICLES;
        const stride = 11; // start(3) + target(4) + swerve(3) + kind(1)
        const data = new Float32Array(total * stride);
        let offset = 0;

        const randomUnit = () => Math.random() * 2 - 1;

        for (const point of emblemPoints) {
            // Start on a thin shell so particles converge inward
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

            // Control point pulled off the direct line for a curved approach
            data[offset++] = (sx + point.x) * 0.5 + randomUnit() * 0.85;
            data[offset++] = (sy + point.y) * 0.5 + randomUnit() * 0.55;
            data[offset++] = (sz + point.z) * 0.5 + randomUnit() * 0.85;

            data[offset++] = 0.0;
        }

        for (let i = 0; i < CONFIG.DUST_PARTICLES; i++) {
            data[offset++] = randomUnit() * 9.0;
            data[offset++] = randomUnit() * 5.0;
            data[offset++] = randomUnit() * 7.0 - 2.0;

            // w doubles as the dust seed in the shader
            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = Math.random();

            data[offset++] = 0.0;
            data[offset++] = 0.0;
            data[offset++] = 0.0;

            data[offset++] = 1.0;
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

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return { vao, count: total };
    }

    /*--- Setup ---*/

    const backgroundProgram = createProgram(BACKGROUND_VERTEX, BACKGROUND_FRAGMENT);
    const backgroundUniforms = uniformsOf(backgroundProgram, ['uResolution', 'uTime', 'uFade']);

    const particleProgram = createProgram(PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    const particleUniforms = uniformsOf(particleProgram, [
        'uProjection', 'uView', 'uModel', 'uProgress', 'uTime',
        'uPointSize', 'uPixelScale', 'uFade', 'uColor'
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
    let projection = null;
    let startedAt = 0;
    let wordmarkVisible = false;
    let pixelScale = 1;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(window.innerWidth * dpr * SCALE));
        canvas.height = Math.max(1, Math.round(window.innerHeight * dpr * SCALE));
        pixelScale = canvas.height / 1080;
        projection = perspective(CONFIG.FOV, canvas.width / canvas.height, 0.1, 80);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    /*--- Render Loop ---*/

    const CYCLE = CONFIG.ASSEMBLY_MS + CONFIG.HOLD_MS + CONFIG.FADE_MS;

    function easeOutCubic(value) {
        return 1 - Math.pow(1 - value, 3);
    }

    function render(now) {
        if (!startedAt) startedAt = now;
        const elapsed = (now - startedAt) * TIME_SCALE;
        const seconds = elapsed / 1000;

        const cycleTime = elapsed % CYCLE;
        const progress = Math.min(cycleTime / CONFIG.ASSEMBLY_MS, 1);

        const fadeOut = cycleTime > CYCLE - CONFIG.FADE_MS
            ? Math.max(0, (CYCLE - cycleTime) / CONFIG.FADE_MS)
            : 1;
        const fadeIn = Math.min(elapsed / CONFIG.FADE_IN_MS, 1);
        const fade = Math.min(fadeIn, fadeOut);

        // Camera: slow orbit with a dolly-in as the emblem forms
        const orbit = 0.11 * Math.sin(seconds * 0.18);
        const radius = 10.6 - 1.5 * easeOutCubic(progress);
        const eye = [
            Math.sin(orbit) * radius,
            0.55 + 0.35 * Math.sin(seconds * 0.13),
            Math.cos(orbit) * radius
        ];

        const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
        const model = rotationY(0.10 * Math.sin(seconds * 0.21));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Background pass
        gl.disable(gl.BLEND);
        gl.useProgram(backgroundProgram);
        gl.uniform2f(backgroundUniforms.uResolution, canvas.width, canvas.height);
        gl.uniform1f(backgroundUniforms.uTime, seconds);
        gl.uniform1f(backgroundUniforms.uFade, fade);
        gl.bindVertexArray(backgroundVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Particle pass, additive for the hologram glow
        if (scene) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

            gl.useProgram(particleProgram);
            gl.uniformMatrix4fv(particleUniforms.uProjection, false, projection);
            gl.uniformMatrix4fv(particleUniforms.uView, false, view);
            gl.uniformMatrix4fv(particleUniforms.uModel, false, model);
            gl.uniform1f(particleUniforms.uProgress, progress);
            gl.uniform1f(particleUniforms.uTime, seconds);
            gl.uniform1f(particleUniforms.uPointSize, CONFIG.POINT_SIZE);
            gl.uniform1f(particleUniforms.uPixelScale, pixelScale);
            gl.uniform1f(particleUniforms.uFade, fade);
            gl.uniform3fv(particleUniforms.uColor, CONFIG.COLOR);

            gl.bindVertexArray(scene.vao);
            gl.drawArrays(gl.POINTS, 0, scene.count);
            gl.bindVertexArray(null);
        }

        // Wordmark overlay
        const shouldShow = SHOW_WORDMARK && progress > 0.97 && fade > 0.25;
        if (shouldShow !== wordmarkVisible) {
            wordmarkVisible = shouldShow;
            if (wordmark) wordmark.classList.toggle('visible', shouldShow);
        }

        requestAnimationFrame(render);
    }

    /*--- Boot ---*/

    window.addEventListener('resize', resize);
    resize();

    sampleEmblem()
        .then((points) => {
            scene = buildBuffer(points);
            if (loading) loading.classList.add('hidden');
            requestAnimationFrame(render);
        })
        .catch((error) => {
            console.error(error);
            if (loading) loading.textContent = 'Unable to load ' + CONFIG.EMBLEM_SRC;
        });
})();
