# Holographic Particle Accelerator

A WebGL2 particle animation. Thousands of points fly in from a sphere and assemble a real 3D
spear — or any image you point them at — then keep turning, hold, and rebuild. A separate
controller window drives it: swap the target, change colour and effects, zoom, move the camera
inside the object, react to music, capture PNG / WebP / video.

Written by **Jackrabbit72380**. No libraries, no build step.

| File | Purpose |
| :--- | :--- |
| `index.html` | The animation (the particle window). Flags below. |
| `controller.html` | The control panel, in its own window. |
| `src/engine.js` | The whole engine — shapes, buffers, shaders, `window.HPA`. |
| `src/relay.js` | Offers the particle window to its opener, so a reloaded panel re-attaches. |
| `src/controller.js` | Panel logic and the link to the particle window. |
| `src/style.css`, `src/controller.css` | Styling. |
| `res/hpa-glyph.svg` | Optional flat target (the default is the 3D spear). |

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

The default target is a 3D spear generated inside the engine: pommel, ferrule, wrapped shaft,
socket collar and a leaf blade with a lens cross-section, sampled on its surfaces (~12 000
points). It lies along X, so the spin shows every side of the blade.

Any PNG / JPEG / WebP / SVG still works: it is sampled flat with depth, and procedural shapes
(torus, atom, cube, sphere, helix, pyramid, star) are drawn in the panel and fed in the same way.

### Turning

The turn never stops. The assembly winds the shape in and eases it to **Settle angle** (0–360°),
so the pose it finishes coming together at is something you pick; from that angle an accumulated
spin carries it round forever. Because the angle is accumulated per frame rather than read from
the clock, it never jumps or pauses when a cycle rebuilds the shape.

**Timing → Rebuild loop** off skips the hold, fade and rebuild entirely: assemble once, then
rotate indefinitely. With the loop on, the same endless turn keeps running through each rebuild.

| Control | What it does |
| :--- | :--- |
| **Spin speed** | Radians per second of the endless turn. 0 freezes the pose. |
| **Settle angle** | The yaw the assembly comes to rest at, in degrees. |
| **Rebuild loop** | On: assemble, hold, fade, rebuild forever. Off: assemble once and keep turning. |

## Camera

| Control | What it does |
| :--- | :--- |
| **Zoom** | Camera distance, 0.35×–6×. The mouse wheel over the particle window does the same. |
| **Outside view** | Orbit camera looking in at the object. |
| **Inside view** | Camera sits inside the particle cloud, close to the spear's axis, so the spear sweeps past you. |

## Controller

| Section | What it does |
| :--- | :--- |
| **Particle window** | Open / raise / close the window the animation runs in. |
| **Target** | Spear (3D), the flat glyph, six procedural shapes, or any image — load, drag-and-drop or paste, then **Rebuild**. |
| **Particles** | Density, point size, slab depth, spin turns, dust motes. |
| **Camera** | Zoom, spin speed, settle angle, outside / inside view. |
| **Visualizer** | Equalizer ring on/off and its band height. |
| **Timing** | Assembly, hold and fade durations, plus the rebuild loop toggle. |
| **Look** | Tint, glow falloff, chromatic rim, caption text and size. |
| **Effects** | Grid, scanlines, vignette, camera shake — on/off. |
| **Audio** | Microphone, system audio or a local audio file. Level drives size and brightness. |
| **Capture** | PNG frame, WebP frame, WebM 5 s / 10 s, MP4 8 s where the browser supports it — captured inside the particle window. |

Everything is applied live except density, depth, dust and the visualizer mode, which rebuild
the particle buffer. Video is captured from the canvas only, so the caption overlay is not in
the frame.

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

`index.html` exposes `window.HPA`, which is what the controller calls:

```js
HPA.set({ COLOR: [1, 0.4, 0.2], POINT_SIZE: 42 });  // any CONFIG key
HPA.set({ VIEW: 'inside', ZOOM: 2.4 });             // camera
HPA.set({ STOP_ANGLE: 90, LOOP: false });           // pose + endless turn
HPA.set({ MODE: 'equalizer' });                     // 'shape' | 'equalizer'
HPA.setMask('spear');                               // 'spear' or an image URL / data URL
HPA.rebuild();                                      // resample and restart
HPA.setAudio(0.7);                                  // 0..1, drives size and glow
HPA.setSpectrum(bands);                             // Float32Array(64), 0..1 per band
HPA.capture('image/png');                           // data URL
HPA.record({ ms: 5000, mime: 'video/webm' });       // Promise<Blob>
HPA.snapshot();                                     // counts + current config
```

## Flags

| Flag | Effect |
| :---: | :--- |
| `?4k` / `?2k` / `?sd` | Render scale |
| `?halfspeed` / `?quarterspeed` | Animation speed |
| `?nocaption` | Hide the caption overlay |
| `?nocontrols` | Ignore `postMessage` (standalone playback) |

## Defaults

`CONFIG` at the top of `src/engine.js`: 3D spear target, 260-sample mask, 6 000 dust motes,
7 s assembly, 12 s hold, 1.2 s fade, 0.40 rad/s endless spin from a 0° settle angle, loop on,
tint `#a1d6ff`.
