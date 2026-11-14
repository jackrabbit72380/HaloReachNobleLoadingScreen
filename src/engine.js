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
    MASK_SRC: 'ball',
    MODE: 'shape',
    VIEW: 'orbit',
    ZOOM: 1.0,
    TILT: 0,
    PAN_X: 0,
    PAN_Y: 0,
    SWAY: 0,
    ROTATE_SPEED: 0.40,
    SPIN_AXIS: 'y',
    STOP_ANGLE: 0,
    LOOP: true,
    EQ_HEIGHT: 2.2,
    LAYER_SRC: 'off',
    LAYER_SCALE: 3,
    LAYER_SPIN: -0.25,
    LAYER_ALPHA: 0.60,
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
