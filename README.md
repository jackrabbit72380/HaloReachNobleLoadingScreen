# Holographic Particle Accelerator

A WebGL2 particle animation. Thousands of points fly in from a sphere and assemble any
image you point them at, hold, then rebuild — forever. The controller runs in its own window
and drives the animation in a **second, separate window**: swap the target, change colour and
effects, react to music, capture PNG / WebP / video.

Written by **Jackrabbit72380**. No libraries, no build step.

| File | Purpose |
| :--- | :--- |
| `index.html` | The animation (the particle window). Flags below. |
| `controller.html` | The control panel, in its own window. |
| `src/engine.js` | The whole engine — sampling, buffers, shaders, `window.HPA`. |
| `src/controller.js` | Panel logic and the link to the particle window. |
| `src/style.css`, `src/controller.css` | Styling. |
| `res/hpa-glyph.svg` | Default particle target (authored for this project). |

## Run

```bash
python3 -m http.server 3000
```

1. Open `http://localhost:3000/controller.html`.
2. Press **Open particle window** — the animation opens in its own window.
3. Drive it from the panel. **Bring to front** raises it, **Close** disconnects.

`file://` will not work — reading the mask image needs HTTP.

### How the two windows talk

Both pages are same-origin, so the controller holds a live reference to the window returned by
`window.open` and calls `window.HPA` on it directly. There is no embedding, no iframe and no
message protocol: when a slider moves, the controller mutates the engine's `CONFIG` in the other
window and the next frame shows it. The panel re-checks the link every 700 ms, so closing the
particle window shows *particle window closed* instead of silently doing nothing.

If popups are blocked the panel says so — allow popups for the page, or open `index.html`
yourself and use the API from that window.

## Controller

| Section | What it does |
| :--- | :--- |
| **Particle window** | Open / raise / close the window the animation runs in. |
| **Target** | Load any PNG / JPEG / WebP / SVG, drag-and-drop or paste it onto the panel, hit **Rebuild**, or swap between procedural shapes (torus, atom, cube, sphere, helix, pyramid, star). |
| **Particles** | Density (how many samples the mask is read at), point size, slab depth, spin turns, dust motes. |
| **Timing** | Assembly, hold and fade durations. |
| **Look** | Tint, glow falloff, chromatic rim, caption text and size. |
| **Effects** | Grid, scanlines, vignette, camera shake — on/off. |
| **Audio** | Three sources: microphone, system audio, or a local audio file. Level drives point size and brightness. |
| **Capture** | PNG frame, WebP frame, WebM 5 s / 10 s, MP4 8 s where the browser supports it — captured inside the particle window. |

Everything is applied live except density, depth and dust, which rebuild the particle buffer.
Video is captured from the canvas only, so the caption overlay is not in the frame.

### Reacting to music

| Source | How |
| :--- | :--- |
| **System audio** | Chrome / Edge on Windows or Linux. Click *System audio*, pick a screen or window, and tick **Share system audio**. Captures whatever the machine plays — Spotify, a DAW, a video. macOS does not offer this. |
| **Microphone** | Works everywhere; on a Mac route system sound into a loopback device (e.g. BlackHole) and select it as the input. |
| **Audio file** | Pick an MP3 / WAV / OGG / M4A — it plays through the page on loop and drives the same reaction. |

Only the level (RMS) is used — nothing is recorded, stored or uploaded. Sensitivity scales the
response; the meter shows the live level.

## Engine API

`index.html` exposes `window.HPA`, which is what the controller calls:

```js
HPA.set({ COLOR: [1, 0.4, 0.2], POINT_SIZE: 42 });  // any CONFIG key
HPA.setMask('res/hpa-glyph.svg');                    // image URL or data URL
HPA.rebuild();                                       // resample and restart
HPA.setAudio(0.7);                                   // 0..1
HPA.capture('image/png');                            // data URL
HPA.record({ ms: 5000, mime: 'video/webm' });        // Promise<Blob>
HPA.snapshot();                                      // counts + current config
```

## Flags

| Flag | Effect |
| :---: | :--- |
| `?4k` / `?2k` / `?sd` | Render scale |
| `?halfspeed` / `?quarterspeed` | Animation speed |
| `?nocaption` | Hide the caption overlay |
| `?nocontrols` | Ignore `postMessage` (standalone playback) |

## Defaults

`CONFIG` at the top of `src/engine.js`: 260-sample mask, 6 000 dust motes, 7 s assembly,
4.8 s hold, 1.2 s fade, one full spin, 0.9 slab depth, tint `#a1d6ff`.
