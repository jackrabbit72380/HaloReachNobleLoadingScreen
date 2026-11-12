# PROJECT NOBLE — Halo: Reach Loading Screen

<p align="center">
  <a href="https://site-03c3b4999edb4f28b4919b715e0bdeb0.freebuff.page">
    <img src="https://site-03c3b4999edb4f28b4919b715e0bdeb0.freebuff.page/preview.webp" alt="PROJECT NOBLE particle loading screen, looping" width="640">
  </a>
</p>

<p align="center">
  <a href="https://site-03c3b4999edb4f28b4919b715e0bdeb0.freebuff.page"><b>▶ Live demo</b></a>
  &nbsp;·&nbsp;
  <a href="https://site-03c3b4999edb4f28b4919b715e0bdeb0.freebuff.page/preview-4k.mp4">⬇ 4K master — 3840×2160, 16:9</a>
</p>

A particle loading animation: thousands of points drift in from a sphere, assemble the
Noble Team emblem, and hold while the **PROJECT NOBLE** wordmark fades in beneath it.

Written by **Jackrabbit72380**. Single-file WebGL2 engine, no libraries, no build step.

<br/>

## Preview

The animation above is a looping capture of the real engine — one full cycle: assembled hold,
fade out, rebuild from the particle shell, settle again. It starts on the assembled emblem so
the thumbnail opens on the finished mark.

| Property | Value |
| :--- | :--- |
| Master | `preview-4k.mp4` — **3840 × 2160**, 16:9, H.264, 5 fps, 14.4 s, 5.8 MB |
| Inline loop | `preview.webp` — 640 × 360, 16:9, animated WebP, 72 frames, 544 KB |
| Poster | `poster.jpg` — 1920 × 1080 still, for social previews |
| Capture | A real **3840 × 2160 viewport at 1× DPR**, not a 1080p layout upscaled. The wordmark resolves to 760 px, 19.8% of frame width — the genuine 4K composition. |

Frames were recorded against a frozen animation clock: `requestAnimationFrame` is replaced
with a manual stepper and advanced exactly 200 ms per frame, in one continuous session, so
the timeline is exact instead of drifting with screenshot latency. The inline loop is 640 px
wide on purpose — a full-cycle animated capture of a particle field is roughly incompressible,
and a heavy one makes the README page itself chew CPU while it plays.

<br/>

## Assets

| File | Use |
| :--- | :--- |
| `res/noble-emblem.png` | Particle target. The Noble Team symbol, 600 × 460 (aspect 1.305), trimmed and recoloured white on transparency. |
| `res/project-noble-wordmark.svg` | On-screen text overlay — PROJECT NOBLE on one row, both words the same size. Revealed at 97% assembly. |
| `res/project-noble-logo.svg` | Full lockup (emblem + wordmark) for standalone use — wallpaper, avatar, print. Note: the emblem inside it is an external reference, so it does not render as an `<img>`; use the preview above instead. |

<br/>

## How it works

| Stage | What happens |
| :--- | :--- |
| Boot | `res/noble-emblem.png` is rasterised into an offscreen canvas at 300 px wide. Every covered pixel becomes a particle with a world position, a small random depth and an assembly delay derived from its distance to the emblem's centre. |
| Assembly | Each particle follows an eased quadratic path — random point on a surrounding shell → off-axis control point → its place in the emblem. Particles near the centre arrive first, so the mark resolves outward. Over the same span the whole slab turns through one full 360° in 3D and settles square to camera. |
| Hold | The emblem breathes (±0.0035 world units of idle drift) and the wordmark fades in beneath it. |
| Loop | 5.2 s hold, 1.3 s fade, then the cycle rebuilds from the shell. |

The sampler auto-detects the mask type: if the image has meaningful alpha variation it uses
opacity, otherwise it inverts luminance. So a transparent cut-out and an opaque black-on-white
bitmap both work without editing code.

Rendering is two passes: a full-screen background shader (vignette, horizon band, faint
engineering grid, slow scan) and one additive `POINTS` draw with a soft radial sprite.
One interleaved buffer holds all particles (11 floats each: start, target+delay, control,
kind), so the emblem plus 6,000 dust motes is a single draw call.

The emblem is a real 3D slab, not a flat sheet: each particle gets a depth inside
`CONFIG.EMBLEM_DEPTH`, and a depth-shaded `vShade` dims the far face so the volume reads
while the mark turns.

<br/>

## Run it

No dependencies. Serve the folder — `file://` will block the mask read:

```bash
python3 -m http.server 3000
# open http://localhost:3000/
```

<br/>

## Flags

| Flag | Effect |
| :---: | :--- |
| `?4k` | 2× render scale |
| `?2k` | 1.34× render scale |
| `?sd` | 0.67× render scale |
| `?halfspeed` | Half animation speed |
| `?quarterspeed` | Quarter animation speed |
| `?nowordmark` | Never show the wordmark |

<br/>

## Swapping the mark

Replace `res/noble-emblem.png`, or point `CONFIG.EMBLEM_SRC` at another image. Particle
count adapts to the mask's coverage automatically. Tint, point size, timing, spin and camera
all live in `CONFIG` at the top of `src/reach.js`.

<br/>

## Provenance

The 3D/2D sources suggested for this project could not be downloaded from this environment
(all verified 2026-11-12):

| Source | Result |
| :--- | :--- |
| Cults3D — `halo-noble-6-logo` (STL, SpartanNash) | HTTP 403 to automated requests; download requires a signed-in account. |
| GrabCAD — `halo-noble-symbol-1` (STEP/IGES/IPT/STL) | Page loads; downloads gated behind a CAD account. |
| DeviantArt — Reach Noble Team Symbol Pack | URL returns 404. |
| Sketchfab — Noble Six character model | URL returns 404; a character model, not the symbol. |

`res/noble-emblem.png` is therefore sourced from Halopedia's `Noblelogo.png`
(1970 × 1508, black-on-transparent), trimmed to its solid content and recoloured white.
It is included as a reference asset for a non-commercial fan project — confirm your own
rights before publishing or redistributing. Halo and Halo: Reach are trademarks of
Microsoft; the Noble Team symbol is Bungie's.

<br/>

## Credits

Jackrabbit72380.
