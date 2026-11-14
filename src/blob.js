/*  Holographic Particle Accelerator — Blob
 *  Jackrabbit72380
 *  2026
 *
 *  The blob target: a real sphere the music deforms. Quiet, it is a ball — every point sits on
 *  one shell. Each point answers the band at its own longitude, so a loud passage pushes whole
 *  wedges of the sphere outward and the ball turns into an organic, wobbling mass.
 *
 *  Registered over the engine's own blob so the Target list keeps its name.
 */

(() => {
  'use strict';

  const HPA = window.HPA;
  if (!HPA || !HPA.shapes) return;

  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const COUNT = 14000;

  HPA.shapes.blob = () => {
    const config = HPA.config || {};
    const radius = (Number(config.MASK_HEIGHT) || 4.6) * 0.32;
    const points = [];

    for (let i = 0; i < COUNT; i++) {
      // Fibonacci sphere: even coverage all the way round, with no poles to pinch and no seam.
      const y = 1 - (2 * (i + 0.5)) / COUNT;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * GOLDEN;
      const x = Math.cos(phi) * ring;
      const z = Math.sin(phi) * ring;

      const shell = radius * (0.995 + Math.random() * 0.01);
      const band = ((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 63.999;

      points.push({
        x: x * shell,
        y: y * shell,
        z: z * shell,
        wait: Math.random() * 0.3,
        band,
        // Round the equator a band pushes hard, near the poles it barely moves: the sphere
        // swells into lobes instead of growing evenly like a balloon.
        height: 0.05 + 0.26 * ring
      });
    }

    return points;
  };
})();
