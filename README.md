# Holographic Particle Accelerator

A WebGL2 particle animation. Thousands of points fly in from a sphere and assemble a real 3D
ball — or a cube, a torus, an atom, a helix, a pyramid, a star, a spear, or a mesh you bring in
from Blender — then keep turning, hold, and rebuild. The controls live in a panel docked down the
right-hand side of the same window: **Home** opens it, **Home** closes it.

Written by **Jackrabbit72380**. No libraries, no build step.

| File | Purpose |
| :--- | :--- |
| `index.html` | The animation, with the controller docked on the right. Flags below. |
| `controller.html` | The same panel in a window of its own, for a second screen. |
| `src/engine.js` | The whole engine — buffers, shaders, `window.HPA`. |
| `src/shapes3d.js` | `HPA.shapes` — the 3D torus, atom, helix, pyramid and star. |
| `src/dock.js` | Opens and closes the docked panel with Home, and bridges it to this window. |
| `src/relay.js` | Offers the particle window to its opener, so a reloaded panel re-attaches. |
| `src/reset.js` | `HPA.reset()` — puts the shipped settings back. |
| `src/show.js` | `HPA.show()` — the autopilot behind the show modes. |
| `src/export.js` | `HPA.exportModel()` — the target as an OBJ / PLY model. |
| `src/import.js` | `HPA.importModel()` — a Blender OBJ / PLY mesh as 3D points. |
| `src/controller.js` | Every section of the panel, in the order it appears. |
| `src/style.css`, `src/controller.css` | Styling. |
| `res/hpa-glyph.svg` | Optional flat target — a picture, so it stays flat. |

## Run

```bash
python3 -m http.server 3000
```

1. Open `http://localhost:3000/`.
2. Press **Home** — the controller slides in from the right. Press **Home** again to close it.
3. Drive it. The animation keeps running behind the panel and every control applies live.

`file://` will not work — reading a mask image needs HTTP.

The panel is the same code in both places. `src/controller.js` reaches the engine through a
player handle and calls `window.HPA` on it; docked, that window is the one it is already in, so
`src/dock.js` hands it a stand-in (`window.HPA_PLAYER = { HPA: window.HPA }`) and nothing else
changes. Home is only taken when a text field does not need it, so typing a caption keeps its
own Home key.

### The separate window

Open `controller.html` instead — or on a second screen, alongside the animation — and press
**Open particle window**. Both pages are same-origin, so the panel holds a live reference to the
window returned by `window.open` and calls `window.HPA` on it directly: no embedding, no iframe,
no message protocol. The panel re-checks the link every 700 ms, so closing the particle window
shows *particle window closed* instead of silently doing nothing.

Reloading that panel does not cost the animation. `src/relay.js` keeps offering the player
window to whoever opened it, so the panel finds it again on the next check and says
*reconnected — animation kept running*; **Open particle window** then reclaims that window as it
stands rather than pointing it at `index.html` again.

If popups are blocked the panel says so — allow popups for the page, or use the docked panel.

## The shape

Every target is real geometry with depth, so each one can be walked round: turn it and the far
side comes into view, **Tilt** it and you see the top, inside view puts the camera among its
points. The one exception is a picture — an image you load, or the shipped glyph — which is flat
by nature.

| Target | What it is |
| :--- | :--- |
| **Ball** | A sphere sampled on its surface — 24 meridians, 12 parallels and a skin between them (~10 800 points, radius 2.07). |
| **Cube** | Six flat faces with the twelve edges and eight corners built up denser (~12 000 points, half-extent 2.07). |
| **Torus** | A ring with a solid tube, points spread evenly over the surface (1.52 ring, 0.66 tube). |
| **Atom** | A nucleus ball with three elliptical orbits in different planes, an electron riding each. |
| **Helix** | A double helix along X, two strands with rungs between them. |
| **Pyramid** | A square pyramid: four triangular sides, a base, ridges and corners denser. |
| **Star** | A five-pointed star with real thickness — the rim drawn back to a point on each face. |
| **Spear** | Pommel, ferrule, wrapped shaft, socket collar and a leaf blade along X. |
| **Imported mesh** | A Blender OBJ / PLY turned into a point cloud over its triangles. |
| **Glyph, any image** | A picture sampled as a silhouette — flat, with a thin slab of depth. |

All of them are sized against `MASK_HEIGHT` (4.6), so changing target does not change how big the
thing is on screen, and all of them arrive from the middle outward as the assembly runs.

The procedural ones live in `src/shapes3d.js` and register themselves on `HPA.shapes` — the table
the engine samples a target from — so adding one is a function returning `[{x, y, z, wait}, …]`
and one line at the bottom of that file.

### Title

The words under the shape are yours: **Title → Caption text**. Type and it changes as you go —
no rebuild, no waiting for the next cycle. **Caption size** is the slider below it, and `?nocaption`
at the end of the URL hides the line entirely. A blank field leaves a space with nothing in it.

### Turning

The turn never stops. The assembly winds the shape in and eases it to **Settle angle** (0–360°),
so the pose it finishes coming together at is something you pick; from that angle an accumulated
spin carries it round forever. Because the angle is accumulated per frame rather than read from
the clock, it never jumps or pauses when a cycle rebuilds the shape.

**Timing → Rebuild loop** off skips the hold, fade and rebuild entirely: assemble once, then
rotate indefinitely — that is the "comes together, then turns forever" setting. With the loop on,
the same endless turn keeps running through each rebuild.

| Control | What it does |
| :--- | :--- |
| **Spin speed** | Turns per second of the endless turn — one turn is 360°. 0 freezes the pose. |
| **Settle angle** | The yaw the assembly comes to rest at, in degrees. |
| **Rebuild loop** | On: assemble, hold, fade, rebuild forever. Off: assemble once and keep turning. |

That accumulation is also why **Reset** has to zero it: restoring the settle angle is not enough
on its own, because the turn already banked would be added on top of it. `HPA.reset()` therefore
calls `HPA.resetRotation()`, and the assembly starts again from the settle angle you shipped
with — a reset really is the fresh-page pose.

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

**Inside spin** and **Off** move the camera as well, so the **Camera** section's *Outside view* /
*Inside view* buttons light up to match instead of keeping whatever they had.

## Controller

All of the panel is built in `src/controller.js` — one block per section, in the order the table
below lists them, so a control's markup and the engine call it makes sit together.

| Section | What it does |
| :--- | :--- |
| **Target** | Ball, cube, torus, atom, helix, pyramid, star, spear, imported mesh — all 3D — plus the glyph or any image, load, drop or paste, then **Rebuild**. |
| **Title** | The caption under the shape and its size. |
| **Particles** | Density, point size, slab depth, spin turns, dust motes. |
| **Camera** | Spin speed, zoom, settle angle, tilt and pan, outside / inside view. |
| **Show** | Inside spin, music visualizer and rainbow modes, their presets, and the shuffle timer. |
| **Visualizer** | Equalizer ring on/off and its band height. |
| **Timing** | Assembly, hold and fade durations, plus the rebuild loop toggle. |
| **Look** | Tint, glow falloff, chromatic rim. |
| **Effects** | Grid, scanlines, vignette, camera shake — on/off. |
| **Audio** | Microphone, system audio or a local audio file. Level drives size and brightness. |
| **Capture** | PNG frame, WebP frame, WebM 5 s / 10 s, MP4 8 s where the browser supports it, and the model download — captured inside the particle window. |

**Reset** in the top-right puts every setting back to the shipped defaults — in the engine and
in the panel — and starts the assembly over: ball target, the shipped caption, 0.064 turns/s,
settle angle 0°, tilt 0°, no pan, loop on, tint `#a1d6ff`, show mode off, and the accumulated turn
back to zero so the pose is the fresh-page one rather than that angle plus whatever it had turned.

Everything is applied live except density, depth, dust and the visualizer mode, which rebuild
the particle buffer. Video is captured from the canvas only, so the caption overlay is not in
the frame.

### Model export

**Capture → Model (.obj)** or **Model (.ply)** writes the target you are looking at — any of the
shapes, a loaded image or an imported mesh — as a point cloud: one vertex per particle, world
units, Y up, no faces. Blender imports either one in a single step (File → Import → Wavefront
`.obj`, or New Stanford `.ply`); instance a sphere or metaball on the points to give them body.

There is no `.blend` export, and it is not a missing feature: a `.blend` is a dump of Blender's
own memory plus the DNA schema of the version that wrote it, and no writer exists outside
Blender itself. The two formats above are how the geometry gets into Blender without it.

### Model import

**Target → Model file…**, or drop the file on the page, reads a mesh exported from Blender —
**Wavefront `.obj`**, or **Stanford `.ply`** (ASCII or little-endian binary, with or without
faces) — and turns it into a **3D point cloud**, not a front-view picture.

The mesh is centred on its bounding box and fitted to the same height as the built-in shapes, its
triangles are sampled area-weighted up to ~18 000 points (so a Blender cube — 8 vertices, 12
triangles — arrives as a solid cube rather than eight dots), and files with no faces come in as
their vertices. Because the points keep their Z, the import behaves like the other shapes:
turning shows the far side, **Tilt** shows the top, inside view walks into it, and **Capture →
Model** writes the same points back out. Density, depth and point size behave as for any other
target. The target list then reads **Imported mesh (3D)**.

A `.blend` itself cannot be read here, for the same reason it cannot be written: it is Blender's
memory image plus that version's DNA schema, and Blender now saves it zstd-compressed by default,
so a reader would mean a full DNA parser and a zstd decompressor inside the page. The one step
that gets a `.blend` in is **File → Export → Wavefront (.obj)** in Blender (Stanford `.ply` also
works).

## Equalizer ring

**Visualizer → Equalizer ring** replaces the shape with a flat disc of 64 bars standing on a
plane. The plane turns with the model, and each bar rises with its own frequency band, so it
reads as a circular graphic equalizer in 3D. Bars rise from the spectrum the panel sends 60
times a second from whatever audio source is listening; with no audio the disc lies flat.

### Reacting to music

| Source | How |
| :--- | :--- |
| **System audio** | Chrome / Edge on Windows or Linux. Click *System audio*, pick a screen or window, and tick **Share system audio**. Captures whatever the machine plays — Spotify, a DAW, a video. macOS does not offer this. |
| **Microphone** | Works everywhere; on a Mac route system sound into a loopback device (e.g. BlackHole) and select it as the input. |
| **Audio file** | Pick an MP3 / WAV / OGG / M4A — it plays through the page on loop and drives the same reaction. |

Only the level (RMS, plus 64 spectrum bands for the equalizer) is used — nothing is recorded,
stored or uploaded. Sensitivity scales the response; the meter shows the live level.

## Engine API

`index.html` exposes `window.HPA`, which is what the panel calls:

```js
HPA.set({ COLOR: [1, 0.4, 0.2], POINT_SIZE: 42 });  // any CONFIG key
HPA.set({ LABEL: 'Your title' });                   // the line under the shape
HPA.set({ CAPTION_SCALE: 1.4 });                    // and how big it is
HPA.set({ VIEW: 'inside', ZOOM: 2.4 });             // camera
HPA.set({ TILT: 0, PAN_X: 0, PAN_Y: 0 });           // head-on, centred
HPA.set({ ROTATE_SPEED: Math.PI, LOOP: false });    // radians per second + endless turn
HPA.set({ STOP_ANGLE: 90 });                        // the yaw the assembly settles at
HPA.set({ MODE: 'equalizer' });                     // 'shape' | 'equalizer'
HPA.setMask('torus');                               // a shape name, 'mesh', or an image URL
HPA.setPointCloud(points);                          // any [{x, y, z}, …] as the target, in 3D
HPA.shapes.spiral = () => points;                   // register a shape of your own
HPA.rebuild();                                      // resample and restart
HPA.resetRotation();                                // endless turn back to the settle angle
HPA.reset();                                        // shipped settings back, assemble again
HPA.show({ mode: 'rainbow' });                      // 'off' | 'inside' | 'visualizer' | 'rainbow'
HPA.show({ mode: 'visualizer', preset: 'chaos', pulse: 0.6, drift: 0.4 });
HPA.show.reset();                                   // autopilot off, picture restored
HPA.geometry();                                     // the target's points, [{x, y, z}, …]
HPA.exportModel('obj');                             // download the target ('obj' | 'ply')
HPA.importModel(file);                              // OBJ / PLY mesh in, as 3D points
HPA.setAudio(0.7);                                  // 0..1, drives size and glow
HPA.setSpectrum(bands);                             // Float32Array(64), 0..1 per band
HPA.capture('image/png');                           // data URL
HPA.record({ ms: 5000, mime: 'video/webm' });       // Promise<Blob>
HPA.snapshot();                                     // counts, config and the turn so far
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
angle, tilt 0° (head-on), no pan, loop on, tint `#a1d6ff`, caption `Holographic Particle
Accelerator`.
