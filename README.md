# Holographic Particle Accelerator

A WebGL2 particle animation. Thousands of points fly in from a sphere and assemble any
image you point them at, hold, then rebuild — forever. A separate controller page drives it
live: swap the target, change colour and effects, react to music, capture PNG / WebP / video.

Written by **Jackrabbit72380**. No libraries, no build step.

| File | Purpose |
| :--- | :--- |
| `index.html` | The animation. Flags below. |
| `controller.html` | Live control panel for the animation. |
| `src/engine.js` | The whole engine — sampling, buffers, shaders, `window.HPA`. |
| `src/controller.js` | Panel logic and the `postMessage` bridge. |
| `src/style.css`, `src/controller.css` | Styling. |
| `res/hpa-glyph.svg` | Default particle target (authored for this project). |

## Run

```bash
python3 -m http.server 3000
# animation  http://localhost:3000/
# controller http://localhost:3000/controller.html
```

`file://` will not work — reading the mask image needs HTTP.

## Controller

| Section | What it does |
| :--- | :--- |
| **Target** | Load any PNG / JPEG / WebP / SVG, drag-and-drop or paste it onto the stage, hit **Rebuild**, or swap between procedural shapes (torus, atom, cube, sphere, helix, pyramid, star). |
| **Particles** | Density (how many samples the mask is read at), point size, slab depth, spin turns, dust motes. |
| **Timing** | Assembly, hold and fade durations. |
| **Look** | Tint, glow falloff, chromatic rim, caption text and size. |
| **Effects** | Grid, scanlines, vignette, camera shake — on/off. |
| **Audio** | Three sources: microphone, system audio, or a local audio file. Level drives point size and brightness. |
| **Capture** | PNG frame, WebP frame, WebM 5 s / 10 s, MP4 8 s where the browser supports it. |

Everything is applied live except density, depth and dust, which rebuild the particle
buffer. Video is captured from the canvas only, so the caption overlay is not in the frame.

### Reacting to music

| Source | How |
| :--- | :--- |
| **System audio** | Chrome / Edge on Windows or Linux. Click *System audio*, pick a screen or window, and tick **Share system audio**. Captures whatever the machine plays — Spotify, a DAW, a video. macOS does not offer this. |
| **Microphone** | Works everywhere; on a Mac route system sound into a loopback device (e.g. BlackHole) and select it as the input. |
| **Audio file** | Pick an MP3 / WAV / OGG / M4A — it plays through the page on loop and drives the same reaction. |

Only the level (RMS) is used — nothing is recorded, stored or uploaded. Sensitivity scales the
response; the meter shows the live level.

## Engine API

`index.html` exposes `window.HPA`:

```js
HPA.set({ COLOR: [1, 0.4, 0.2], POINT_SIZE: 42 });  // any CONFIG key
HPA.setMask('res/hpa-glyph.svg');                    // image URL or data URL
HPA.rebuild();                                       // resample and restart
HPA.setAudio(0.7);                                   // 0..1
HPA.capture('image/png');                            // data URL
HPA.record({ ms: 5000, mime: 'video/webm' });        // Promise<Blob>
HPA.snapshot();                                      // counts + current config
```

The controller uses the same calls over `postMessage` (`{ source: 'hpa-controller', … }`),
which is the only coupling between the two pages.

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
