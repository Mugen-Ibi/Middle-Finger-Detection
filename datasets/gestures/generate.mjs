// Procedural regression data, NOT captured hands or a model training corpus.
// Separate seeded splits allow deterministic reproduction without committing MBs.
export function* generateSamples(seed = 20261023, variants = 256) {
  let state = seed >>> 0;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  for (let pose = 0; pose < 20; pose++) {
    for (let variant = 0; variant < variants; variant++) {
      const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
      const label = pose === 2 ? 'middle_finger' : pose === 16 ? 'thumbs_up' : pose === 17 ? 'thumbs_down' : null;
      for (const [i, base] of [5, 9, 13, 17].entries()) {
        const x = (i - 1.5) * 0.028, y = -0.07;
        const length = 0.028 * (0.85 + random() * 0.3);
        const extended = pose < 16 && (pose & (1 << i));
        points[base] = { x, y, z: 0 };
        points[base + 1] = { x, y: y - length, z: 0 };
        points[base + 2] = { x: x + (extended ? 0 : length * 0.25), y: y - length * (extended ? 1.7 : 0.6), z: extended ? 0 : -length * 0.25 };
        points[base + 3] = { x, y: y - length * (extended ? 2.3 : 0.3), z: extended ? 0 : -length * 0.2 };
      }
      const thumb = pose >= 16 && pose <= 18;
      points[1] = { x: -0.045, y: -0.02, z: 0 };
      points[2] = { x: -0.065, y: -0.045, z: 0 };
      points[3] = { x: thumb ? -0.08 : -0.045, y: thumb ? -0.085 : -0.055, z: 0 };
      points[4] = { x: thumb ? -0.09 : -0.025, y: thumb ? -0.125 : -0.06, z: 0 };
      const rotation = (pose === 17 ? Math.PI : pose === 18 ? Math.PI / 2 : 0) + (random() - 0.5) * 0.5;
      const yaw = (random() - 0.5) * 0.8;
      const scale = 0.5 + random() * 1.5, mirror = random() > 0.5 ? 1 : -1;
      const offset = { x: random() - 0.5, y: random() - 0.5, z: random() - 0.5 };
      const world = points.map(p => {
        const x = p.x * Math.cos(yaw), z = p.x * Math.sin(yaw) + p.z;
        return {
          x: (x * Math.cos(rotation) - p.y * Math.sin(rotation)) * scale * mirror + offset.x + (random() - 0.5) * 0.0007 * scale,
          y: (x * Math.sin(rotation) + p.y * Math.cos(rotation)) * scale + offset.y + (random() - 0.5) * 0.0007 * scale,
          z: z * scale + offset.z + (random() - 0.5) * 0.0007 * scale,
        };
      });
      const aspectRatio = [4 / 3, 16 / 9, 9 / 16, 1][variant % 4];
      const image = world.map(p => ({ x: 0.5 + (p.x - offset.x) / aspectRatio, y: 0.6 + p.y - offset.y, z: p.z - offset.z }));
      yield { id: `${seed}-${pose}-${variant}`, source: 'procedural-v1', label, world, image, aspectRatio };
    }
  }
}
