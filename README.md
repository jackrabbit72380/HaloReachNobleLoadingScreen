# Holographic Particle Accelerator

A WebGL2 particle animation. Thousands of points fly in from a sphere and assemble a real 3D
ball — or a spear, or any image you point them at — then keep turning, hold, and rebuild. A
separate controller window drives it: swap the target, change colour and effects, zoom, move the
camera inside the object, react to music, capture PNG / WebP / video.

Written by **Jackrabbit72380**. No libraries, no build step.

| File | Purpose |
| :--- | :--- |
| `index.html` | The animation (the particle window). Flags below. |
| `controller.html` | The control panel, in its own window. |
| `src/engine.js` | The whole engine — shapes, buffers, shaders, `window.HPA`. |
| `src/relay.js` | Offers the particle window to its opener, so a reloaded panel re-attaches. |
| `src/reset.js` | `HPA.reset()` — puts the shipped settings back. |
| `src/show.js` | `HPA.show()` — the autopilot behind the show modes. |
| `src/export.js` | `HPA.exportModel()` — the target as an OBJ / PLY model. |
| `src/controller.js` | Every section of the panel, in the order it appears, and the link to the particle window. |
| `src/style.css`, `src/controller.css` | Styling. |
| `res/hpa-glyph.svg` | Optional flat target (the default is the 3D ball). |

## Run

```bash
python3 -m http.server 3000
```

1. Open `http://localhost:3000/controller.html`.
2. Press **Open particle window** — the animation opens in its own window.
3. Drive it from the panel. **Bring to front** raises it, **Close** disconnects.

`file://` will not work — reading a mask image needs HTTP.

### How the two windows talk

Both pages are same-origin, so the controller holds a live reference to the window returned by
`window.open` and calls `window.HPA` on it directly. There is no embedding, no iframe and no
message protocol: when a slider moves, the controller mutates the engine's `CONFIG` in the other
window and the next frame shows it. The panel re-checks the link every 700 ms, so closing the
particle window shows *particle window closed* instead of silently doing nothing.

Reloading the controller does not cost the animation. `src/relay.js` keeps offering the player
window to whoever opened it, so the panel finds it again on the next check and says
*reconnected — animation kept running*; **Open particle window** then reclaims that window as it
stands rather than pointing it at `index.html` again. Only a genuinely missing window is opened
fresh.

If popups are blocked the panel says so — allow popups for the page, or open `index.html`
yourself and use the API from that window.

## The shape

The default target is a 3D ball: a sphere sampled on its surface with 24 meridians, 12 parallels
and a skin of scattered points between them (~10 800 points, radius 2.07 in world units), so it
reads as a globe rather than a fuzzy cloud.

Also built in: a 3D spear (pommel, ferrule, wrapped shaft, socket collar and a leaf blade along
X), the flat glyph, six procedural 2D shapes, and any PNG / JPEG / WebP / SVG you load.

### Turning

The turn never stops. The assembly winds the shape in and eases it to **Settle angle** (0–360°),
so the pose it finishes coming together at is something you pick; from that angle an accumulated
spin carries it round forever. Because the angle is accumulated per frame rather than read from
the clock, it never jumps or pauses when a cycle rebuilds the shape.

**Timing → Rebuild loop** off skips the hold, fade and rebuild entirely: assemble once, then
rotate indefinitely. With the loop on, the same endless turn keeps running through each rebuild.

| Control | What it does |
| :--- | :--- |
| **Spin speed** | Turns per second of the endless turn — one turn is 360°. 0 freezes the pose. |
| **Settle angle** | The yaw the assembly comes to rest at, in degrees. |
| **Rebuild loop** | On: assemble, hold, fade, rebuild forever. Off: assemble once and keep turning. |

## Camera

| Control | What it does |
| :--- | :--- |
| **Spin speed** | Turns per second, first slider in the section, right above Zoom. |
| **Zoom** | Camera distance, 0.35×–6×. The mouse wheel over the particle window does the same. |
| **Outside view** | Orbit camera looking in at the object. |
| **Inside view** | Camera sits inside the ball's shell (or just inside the spear's tip), so the shape wraps around you. |
| **Tilt** | Pitch of the object in degrees. 0° is dead head-on; positive tips the top away from you. |
| **Pan left / right**, **Pan up / down** | Slides the view in world units, as far as ±6. |
| **Arrow keys** | In the particle window, nudge the view left/right/up/down 0.25 at a press, 1.0 with shift. |
| **Head-on** | Puts the tilt and both pan offsets back to zero. |

The pitch used to be a fixed lean, which is why shapes always looked like they were being viewed
from above. It now comes from **Tilt** (default 0°), so a fresh page shows the target level, and
the old slow wobble is available separately as `SWAY` if you want the pose to breathe again.

## Show

The **Show** section runs the animation by itself. Pick a mode and leave it running.

| Mode | What it does |
| :--- | :--- |
| **Inside spin** | Puts the camera inside the ball, turns the rebuild loop off and lets the endless spin carry the view round forever. |
| **Music visualizer** | The zoom rises and falls with the audio level and the tint walks round the wheel; how hard is the **Zoom pulse** slider. |
| **Rainbow** | The tint sweeps the whole wheel on its own — a turn every five seconds at rest, faster as **Colour drift** goes up. |
| **Off** | Hands the picture back: the original tint and zoom return, the camera goes back outside and the panel is in charge again. |

Three visualizer presets:

| Preset | Character |
| :--- | :--- |
| **Pulse** | Punchy zoom on the level, steady target, slow colour. |
| **Drift** | Softer zoom, much faster colour travel. |
| **Chaos** | Strong zoom, fast colour, and a new target and tint every **Shuffle every** seconds (4–40 s). |

Shuffle picks shapes with the panel's own *Random shape* button, so the procedural targets are in
the rotation as well as the ball and spear. **Zoom pulse**, **Colour drift** and **Shuffle every**
apply live; the level comes from whatever the Audio response section is listening to, and with no
audio the visualizer still breathes on its own.

The **Inside spin** and **Off** modes move the camera as well, so the **Camera** section's
*Outside view* / *Inside view* buttons light up to match rather than keeping the state they had.

## Controller

All of the panel is built in `src/controller.js` — one block per section, in the order the table
below lists them, so a control's markup and the engine call it makes sit together.

| Section | What it does |
| :--- | :--- |
| **Particle window** | Open / raise / close the window the animation runs in. |
| **Target** | Ball (3D), spear (3D), the flat glyph, six procedural shapes, or any image — load, drag-and-drop or paste, then **Rebuild**. |
| **Particles** | Density, point size, slab depth, spin turns, dust motes. |
| **Camera** | Spin speed, zoom, settle angle, tilt and pan, outside / inside view. |
| **Show** | Inside spin, music visualizer and rainbow modes, their presets, and the shuffle timer. |
| **Visualizer** | Equalizer ring on/off and its band height. |
| **Timing** | Assembly, hold and fade durations, plus the rebuild loop toggle. |
| **Look** | Tint, glow falloff, chromatic rim, caption text and size. |
| **Effects** | Grid, scanlines, vignette, camera shake — on/off. |
| **Audio** | Microphone, system audio or a local audio file. Level drives size and brightness. |
| **Capture** | PNG frame, WebP frame, WebM 5 s / 10 s, MP4 8 s where the browser supports it, and the model download — captured inside the particle window. |

**Reset** in the top-right puts every setting back to the shipped defaults — in the particle
window and in the panel — and starts the assembly over: ball target, 0.064 turns/s, settle angle
0°, tilt 0°, no pan, loop on, tint `#a1d6ff`, show mode off.

Everything is applied live except density, depth, dust and the visualizer mode, which rebuild
the particle buffer. Video is captured from the canvas only, so the caption overlay is not in
the frame.

### Model export

**Capture → Model (.obj)** or **Model (.ply)** writes the target you are looking at — ball, spear,
glyph, a procedural shape or a loaded image — as a point cloud: one vertex per particle, world
units, Y up, no faces. Blender imports either one in a single step (File → Import → Wavefront
`.obj`, or New Stanford `.ply`); instance a sphere or metaball on the points to give them body.

There is no `.blend` export, and it is not a missing feature: a `.blend` is a dump of Blender's
own memory plus the DNA schema of the version that wrote it, and no writer exists outside
Blender itself. The two formats above are how the geometry gets into Blender without it.

## Equalizer ring

**Visualizer → Equalizer ring** replaces the shape with a flat disc of 64 bars standing on a
plane. The plane turns with the model, and each bar rises with its own frequency band, so it
reads as a circular graphic equalizer in 3D. Bars rise from the spectrum the panel sends 60
times a second from whatever audio source is listening; with no audio the disc lies flat.

### Reacting to music

| Source | How |
| :--- | :--- |
| **System audio** | Chrome or Edge on Windows or Linux. Click *System audio*, pick a screen or window, and tick **Share system audio**. Captures whatever the machine plays — Spotify, a DAW, a video. macOS does not offer this. |
| **Microphone** | Works everywhere; on a Mac route system sound into a loopback device (e.g. BlackHole) and select it as the input. |
| **Audio file** | Pick an MP3 / WAV / OGG / M4A — it plays through the page on loop and drives the same reaction. |

Only the level (RMS, plus 64 spectrum bands for the equalizer) is used — nothing is recorded,
stored or uploaded. Sensitivity scales the response; the meter shows the live level.

## Engine API

`index.html` exposes `window.HPA`, which is what the controller calls:

```js
HPA.set({ COLOR: [1, 0.4, 0.2], POINT_SIZE: 42 });  // any CONFIG key
HPA.set({ VIEW: 'inside', ZOOM: 2.4 });             // camera
HPA.set({ TILT: 0, PAN_X: 0, PAN_Y: 0 });           // head-on, centred
HPA.set({ ROTATE_SPEED: Math.PI, LOOP: false });    // radians per second + endless turn
HPA.set({ STOP_ANGLE: 90 });                        // the yaw the assembly settles at
HPA.set({ MODE: 'equalizer' });                     // 'shape' | 'equalizer'
HPA.setMask('ball');                                // 'ball', 'spear' or an image URL / data URL
HPA.rebuild();                                      // resample and restart
HPA.reset();                                        // shipped settings back, assemble again
HPA.show({ mode: 'rainbow' });                      // 'off' | 'inside' | 'visualizer' | 'rainbow'
HPA.show({ mode: 'visualizer', preset: 'chaos', pulse: 0.6, drift: 0.4 });
HPA.show.reset();                                   // autopilot off, picture restored
HPA.geometry();                                     // the target's points, [{x, y, z}, …]
HPA.exportModel('obj');                             // download the target ('obj' | 'ply')
HPA.setAudio(0.7);                                  // 0..1, drives size and glow
HPA.setSpectrum(bands);                             // Float32Array(64), 0..1 per band
HPA.capture('image/png');                           // data URL
HPA.record({ ms: 5000, mime: 'video/webm' });       // Promise<Blob>
HPA.snapshot();                                     // counts + current config
```

`ROTATE_SPEED` is radians per second in the API; the panel's **Spin speed** slider shows the same
number in turns per second, so 0.064 turns/s is the default 0.40 rad/s.

## Flags

| Flag | Effect |
| :---: | :--- |
| `?4k` / `?2k` / `?sd` | Render scale |
| `?halfspeed` / `?quarterspeed` | Animation speed |
| `?nocaption` | Hide the caption overlay |
| `?nocontrols` | Ignore `postMessage` (standalone playback) |

## Defaults

`CONFIG` at the top of `src/engine.js`: 3D ball target, 260-sample mask, 6 000 dust motes,
7 s assembly, 12 s hold, 1.2 s fade, 0.40 rad/s (0.064 turns/s) endless spin from a 0° settle
angle, tilt 0° (head-on), no pan, loop on, tint `#a1d6ff`.
