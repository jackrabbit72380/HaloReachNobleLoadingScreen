/*  Holographic Particle Accelerator — Blob
 *  Jackrabbit72380
 *  2026
 *
 *  The blob target: a real sphere the music deforms. Quiet, it is a ball — every point sits on
 *  one shell with nothing to see but the ball. Each point answers the band at its own place on
 *  the surface, so a loud passage pushes waves across it and the ball turns into an organic,
 *  rippling mass.
 *
 *  It is registered as blob3d rather than blob: the engine treats "blob" as a flat disc facing
 *  the camera — it rolls it in the view plane and gives it oversized, softer sprites — which is
 *  exactly what hid the shape of a sphere. Under its own name it turns, and reads, like every
 *  other target.
 */

(() => {
  'use strict';

  const HPA = window.HPA;
  if (!HPA || !HPA.shapes) return;

  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const COUNT = 14000;

  HPA.shapes.blob3d = () => {
    const config = HPA.config || {};
    const radius = (Number(config.MASK_HEIGHT) || 4.6) * 0.32;
    const points = [];

    for (let i = 0; i < COUNT; i++) {
      // Fibonacci sphere: even coverage all the way round, with no poles to pinch and no seam.
      const up = 1 - (2 * (i + 0.5)) / COUNT;
      const ring = Math.sqrt(Math.max(0, 1 - up * up));
      const phi = i * GOLDEN;
      const across = Math.cos(phi) * ring;
      const through = Math.sin(phi) * ring;

      // The ball arrives a quarter turn over, like an imported model that came in Z-up: its
      // equator — the band that swells hardest — runs up and down instead of round the middle.
      // Turned that way, its ripples sweep across the face as it spins, so it reads as turning
      // exactly like the other shapes instead of sitting there looking round.
      const x = across;
      const y = through;
      const z = -up;

      const shell = radius * (0.995 + Math.random() * 0.01);
      const lon = Math.atan2(through, across);
      const lat = Math.asin(Math.max(-1, Math.min(1, up)));
      const girth = ring;

      // Bands run diagonally over the surface — twice round the sphere and twice pole to pole —
      // so a loud band travels across it as a wave instead of lifting one smooth shell. The
      // small jitter lets neighbouring points answer neighbouring bands, which is the ripple.
      const turn = (((lon * 2 + lat * 2.5 + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const band = (turn / (Math.PI * 2)) * 63.999 + (Math.random() - 0.5) * 2.5;

      points.push({
        x: x * shell,
        y: y * shell,
        z: z * shell,
        wait: Math.random() * 0.3,
        band: Math.max(0, Math.min(63.999, band)),
        // Round the equator a band pushes hardest and round the poles least, so the sphere
        // swells into lobes. The three long, slow waves keep the surface uneven as it moves.
        height: (0.30 + 0.45 * girth) * (0.7 + 0.3 * Math.cos(lon * 3 + lat * 2))
      });
    }

    return points;
  };
})();
