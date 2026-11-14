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
    LAYER_SRC: 'off',            // a background layer shape, or 'off' for none
    LAYER_SCALE: 3,            // how much bigger than the target the layer sits
    LAYER_SPIN: -0.25,           // radians per second, the layer's own turn
    LAYER_ALPHA: 0.60,           // how bright the layer is
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

  function scaleMatrix(scale) {
    return new Float32Array([
      scale, 0, 0, 0,
      0, scale, 0, 0,
      0, 0, scale, 0,
      0, 0, 0, 1
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
