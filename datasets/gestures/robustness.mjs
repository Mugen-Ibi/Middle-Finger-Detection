// Kinematic rule-regression poses. No captured images or training data.
// Vary PIP and DIP flexion independently, then apply rigid 3D transforms.
export function* generateRobustnessSamples(seed = 20261029, variants = 128) {
  let state = seed >>> 0;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  const poses = Array.from({ length: 16 }, (_, bits) => ({
    name: `extensions-${bits}`, label: bits === 2 ? 'middle_finger' : null,
    bends: Array.from({ length: 4 }, (_, i) => bits & (1 << i) ? [0, 0] : [95, 55]),
  }));
  poses.push(
    { name: 'relaxed-middle', label: 'middle_finger', bends: [[95, 55], [25, 10], [95, 55], [95, 55]] },
    { name: 'dip-folded-neighbors', label: 'middle_finger', bends: [[0, 105], [0, 0], [0, 105], [0, 105]] },
    { name: 'mixed-folds', label: 'middle_finger', bends: [[0, 105], [20, 15], [85, 45], [10, 100]] },
    { name: 'bent-middle', label: null, bends: [[95, 55], [45, 25], [95, 55], [95, 55]] },
    { name: 'bent-middle-tip', label: null, bends: [[95, 55], [0, 60], [95, 55], [95, 55]] },
    { name: 'ambiguous-index', label: null, bends: [[25, 20], [0, 0], [95, 55], [95, 55]] },
  );
  for (const pose of poses) for (let variant = 0; variant < variants; variant++) {
    const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    for (const [i, base] of [5, 9, 13, 17].entries()) {
      const length = 0.03 * (0.85 + random() * 0.3);
      let joint = points[base] = { x: (i - 1.5) * 0.027, y: -0.065, z: 0 };
      let flexion = 0;
      for (let segment = 0; segment < 3; segment++) {
        if (segment > 0) flexion += pose.bends[i][segment - 1] * Math.PI / 180;
        const size = length * [1, 0.7, 0.6][segment];
        joint = points[base + segment + 1] = {
          x: joint.x, y: joint.y - Math.cos(flexion) * size, z: joint.z + Math.sin(flexion) * size,
        };
      }
    }
    const rotations = Array.from({ length: 3 }, () => (random() - 0.5) * Math.PI * 2);
    const mirror = variant % 2 ? -1 : 1, scale = 0.5 + random() * 1.5;
    const offset = { x: random() - 0.5, y: random() - 0.5, z: random() - 0.5 };
    const world = points.map(p => {
      let { x, y, z } = p;
      [y, z] = [y * Math.cos(rotations[0]) - z * Math.sin(rotations[0]), y * Math.sin(rotations[0]) + z * Math.cos(rotations[0])];
      [x, z] = [x * Math.cos(rotations[1]) - z * Math.sin(rotations[1]), x * Math.sin(rotations[1]) + z * Math.cos(rotations[1])];
      [x, y] = [x * Math.cos(rotations[2]) - y * Math.sin(rotations[2]), x * Math.sin(rotations[2]) + y * Math.cos(rotations[2])];
      return { x: offset.x + scale * (x * mirror + (random() - 0.5) * 0.0002),
        y: offset.y + scale * (y + (random() - 0.5) * 0.0002),
        z: offset.z + scale * (z + (random() - 0.5) * 0.0002) };
    });
    const aspectRatio = [4 / 3, 16 / 9, 9 / 16, 1][Math.floor(variant / 2) % 4];
    const image = world.map(p => ({ x: 0.5 + (p.x - offset.x) / aspectRatio, y: 0.6 + p.y - offset.y, z: p.z - offset.z }));
    yield { id: `${seed}-${pose.name}-${variant}`, source: 'kinematic-v1', pose: pose.name,
      mirrored: mirror < 0, label: pose.label, world, image, aspectRatio };
  }
}
