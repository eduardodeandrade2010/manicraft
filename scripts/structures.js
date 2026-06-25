import { FAVELA_WALLS } from './blocks';

// Procedural structures placed during chunk generation when a world THEME is
// set (by the AI/keyword interpreter). Favela = colorful stacked brick shacks
// packed onto the hills of Rio; cyberpunk = tall neon-striped metal towers.
// Structures write straight into the chunk's block data (before meshing) and are
// clipped at chunk borders, which reads as dense, organic sprawl.

const CONCRETE = 19;
const DARK_METAL = 22;
const NEON = 20;
const NEON_PINK = 21;

/** A small favela shack: colored walls, a doorway, windows, a concrete roof. */
export function buildFavelaShack(chunk, rng, x, baseY, z) {
  const w = 3 + Math.floor(rng.random() * 3); // 3..5
  const d = 3 + Math.floor(rng.random() * 3);
  const h = 3 + Math.floor(rng.random() * 3); // 3..5
  const wall = FAVELA_WALLS[Math.floor(rng.random() * FAVELA_WALLS.length)];
  const doorX = 1 + Math.floor(rng.random() * Math.max(1, w - 2));

  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      for (let dy = 0; dy < h; dy++) {
        const edge = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1;
        if (!edge) continue;
        const isDoor = dz === 0 && dx === doorX && dy < 2;
        const isWindow = dy === Math.floor(h / 2) && (dx + dz) % 2 === 0 && rng.random() < 0.6;
        if (isDoor || isWindow) continue;
        chunk.setBlockId(x + dx, baseY + dy, z + dz, wall);
      }
    }
  }
  // Flat concrete roof (favela laje).
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      chunk.setBlockId(x + dx, baseY + h, z + dz, CONCRETE);
    }
  }

  // Iconic details: rooftop water tank (caixa d'água), neon antenna, graffiti.
  if (rng.random() < 0.55) {
    const tx = x + 1 + Math.floor(rng.random() * Math.max(1, w - 2));
    const tz = z + 1 + Math.floor(rng.random() * Math.max(1, d - 2));
    chunk.setBlockId(tx, baseY + h + 1, tz, 17); // blue tank
    chunk.setBlockId(tx, baseY + h + 2, tz, 17);
  }
  if (rng.random() < 0.3) {
    const ax = x + Math.floor(w / 2);
    const az = z + Math.floor(d / 2);
    chunk.setBlockId(ax, baseY + h + 1, az, DARK_METAL);
    chunk.setBlockId(ax, baseY + h + 2, az, rng.random() < 0.5 ? NEON : NEON_PINK); // glowing sign
  }
  if (rng.random() < 0.5) {
    const gy = baseY + 1 + Math.floor(rng.random() * Math.max(1, h - 1));
    chunk.setBlockId(x, gy, z, rng.random() < 0.5 ? NEON : NEON_PINK); // graffiti tag
  }
}

/** The Cristo Redentor landmark — a concrete statue on a pedestal. */
export function buildCristo(chunk, lx, baseY, lz) {
  const C = CONCRETE;
  // Pedestal.
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 0; dy < 4; dy++) chunk.setBlockId(lx + dx, baseY + dy, lz + dz, C);

  const y = baseY + 4;
  // Robe/body, widening at the base.
  for (let dy = 0; dy < 11; dy++) {
    const wdt = dy < 3 ? 1 : 0;
    for (let dx = -wdt; dx <= wdt; dx++)
      for (let dz = -wdt; dz <= wdt; dz++) chunk.setBlockId(lx + dx, y + dy, lz + dz, C);
  }
  // Outstretched arms.
  const armY = y + 8;
  for (let dx = -5; dx <= 5; dx++) chunk.setBlockId(lx + dx, armY, lz, C);
  chunk.setBlockId(lx - 5, armY - 1, lz, C);
  chunk.setBlockId(lx + 5, armY - 1, lz, C);
  // Head.
  chunk.setBlockId(lx, y + 11, lz, C);
  chunk.setBlockId(lx, y + 12, lz, C);
}

/** A neon-lit cyberpunk tower. */
export function buildTower(chunk, rng, x, baseY, z) {
  const h = 8 + Math.floor(rng.random() * 14);
  const w = 2 + Math.floor(rng.random() * 2); // 2..3
  for (let dy = 0; dy < h; dy++) {
    const neonFloor = dy % 4 === 0;
    for (let dx = 0; dx < w; dx++) {
      for (let dz = 0; dz < w; dz++) {
        const edge = dx === 0 || dx === w - 1 || dz === 0 || dz === w - 1;
        if (!edge && !neonFloor) continue;
        let id = DARK_METAL;
        if (neonFloor) id = rng.random() < 0.5 ? NEON : NEON_PINK;
        chunk.setBlockId(x + dx, baseY + dy, z + dz, id);
      }
    }
  }
}

/**
 * Run the structure pass for a chunk based on its world theme.
 * @param {WorldChunk} chunk
 * @param {RNG} rng
 * @param {string} theme
 * @param {(x:number,z:number)=>number|null} surfaceY  local-coord surface lookup
 */
const LANDMARK_X = 8;
const LANDMARK_Z = 8;

export function generateStructures(chunk, rng, theme, surfaceY) {
  if (!theme) return;
  const size = chunk.size.width;

  // Cristo Redentor: built once, in whichever favela chunk contains the landmark.
  if (theme === 'favela') {
    const lx = LANDMARK_X - chunk.position.x;
    const lz = LANDMARK_Z - chunk.position.z;
    if (lx >= 6 && lx < size - 6 && lz >= 6 && lz < size - 6) {
      const y = surfaceY(lx, lz);
      if (y !== null) buildCristo(chunk, lx, y, lz);
    }
  }

  let freq = 0;
  if (theme === 'favela') freq = 0.03;
  else if (theme === 'cyberpunk') freq = 0.012;
  else return;

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (rng.random() >= freq) continue;
      const y = surfaceY(x, z);
      if (y === null || y < 4) continue; // skip water/low
      if (theme === 'favela') buildFavelaShack(chunk, rng, x, y, z);
      else buildTower(chunk, rng, x, y, z);
    }
  }
}
