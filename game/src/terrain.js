// Terrain: a deterministic island archipelago. One function, terrainHeight(x, z),
// answers every question the game asks about the ground — collisions, the runway
// plateau, tree placement and the renderer's ground grid — so the picture and the
// physics can never disagree. Everything is seeded, so the same world renders
// identically on every machine and every run.
import { WORLD } from './config.js';

/** Small integer hash → [0, 1). The same input always gives the same output. */
function hash2(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177);
  n = (n ^ (n >> 16)) >>> 0;
  return n / 4294967295;
}

/** Smooth value noise in [-1, 1], bilinearly interpolated between lattice points. */
function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz) * 2 - 1;
  const b = hash2(ix + 1, iz) * 2 - 1;
  const c = hash2(ix, iz + 1) * 2 - 1;
  const d = hash2(ix + 1, iz + 1) * 2 - 1;
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sz;
}

/** Two octaves of rolling-hill noise, a few metres tall. */
function hillNoise(x, z) {
  return valueNoise(x / 90, z / 90) * 3.2 + valueNoise(x / 31, z / 31) * 1.1;
}

/**
 * Ground height in metres at world (x, z). Water is 0 and below; the runway area
 * is flattened to the runway elevation so the strip is landable.
 */
export function terrainHeight(x, z) {
  let height = -6;
  for (let i = 0; i < WORLD.islands.length; i += 1) {
    const island = WORLD.islands[i];
    const dx = x - island.x;
    const dz = z - island.z;
    const d2 = (dx * dx + dz * dz) / (island.radius * island.radius);
    if (d2 < 4) height += island.height * Math.exp(-d2 * 1.6);
  }
  if (height > 0.5) height += hillNoise(x, z);
  // Flatten the runway strip and its southern approach corridor: blend to
  // runway elevation near the strip so the strip is landable and the final
  // approach does not meet a rising hillside.
  const runway = WORLD.runway;
  const inZ = z > runway.zMin - 60 && z < runway.zMax + 160;
  if (inZ) {
    const dx = Math.abs(x - runway.x);
    const dz = Math.max(0, Math.max(runway.zMin - z, z - (runway.zMax + 100)));
    const edge = Math.max(dx - runway.halfWidth - 8, dz);
    const blend = Math.max(0, 1 - edge / 55);
    if (blend > 0) {
      const flat = WORLD.runwayElevation + hillNoise(x, z) * 0.15;
      height = height * (1 - blend) + flat * blend;
    }
  }
  return height;
}

/** True when (x, z) is dry land (above the water line). */
export function isLand(x, z) {
  return terrainHeight(x, z) > 0.5;
}

/** True when the point is on the runway strip itself. */
export function onRunway(x, z) {
  const runway = WORLD.runway;
  return Math.abs(x - runway.x) <= runway.halfWidth && z >= runway.zMin && z <= runway.zMax;
}
