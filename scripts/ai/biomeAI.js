// AI biome interpreter. Turns a natural-language prompt ("favela do Rio de
// Janeiro", "cidade cyberpunk neon", "planeta congelado") into a world patch:
// terrain shape, biome dominance, a structure THEME, and which creatures spawn.
//
// Works fully offline via keyword rules. If an optional backend (server.mjs,
// provider = Claude or DeepSeek) is running, /api/biome upgrades interpretation.

const BASE = () => ({
  theme: null,
  creatures: null,
  terrain: { scale: 100, magnitude: 8, offset: 6, waterOffset: 4 },
  biomes: { tundraToTemperate: 0.25, temperateToJungle: 0.5, jungleToDesert: 0.75 },
  title: '',
  summary: '',
});

// Force a single dominant biome by collapsing the noise thresholds.
function dominate(p, kind) {
  const b = p.biomes;
  if (kind === 'snow') { b.tundraToTemperate = 1; }
  else if (kind === 'temperate') { b.tundraToTemperate = 0.08; b.temperateToJungle = 0.95; b.jungleToDesert = 0.98; }
  else if (kind === 'jungle') { b.tundraToTemperate = 0; b.temperateToJungle = 0; b.jungleToDesert = 1; }
  else if (kind === 'desert') { b.tundraToTemperate = 0; b.temperateToJungle = 0; b.jungleToDesert = 0; }
}

const RULES = [
  // Note: favela/cyberpunk structure themes are paused (removed) — focus is on
  // beautiful natural biomes (terrain, caves, lakes). They can return later.
  {
    keys: ['congelado', 'frozen', 'gelo', 'neve', 'ártico', 'artico', 'inverno', 'ice'],
    apply: (p) => {
      dominate(p, 'snow');
      p.terrain.magnitude = 16;
      p.creatures = ['fox', 'wolf'];
      p.title = 'Planeta Congelado';
      p.summary = 'Montanhas geladas e poucas árvores.';
    },
  },
  {
    keys: ['deserto', 'desert', 'areia', 'duna', 'egito', 'árido', 'arido'],
    apply: (p) => {
      dominate(p, 'desert');
      p.terrain.magnitude = 6;
      p.creatures = ['fox'];
      p.title = 'Deserto';
      p.summary = 'Dunas e cactos sob o sol.';
    },
  },
  {
    keys: ['floresta', 'selva', 'jungle', 'tropical', 'amazônia', 'amazonia'],
    apply: (p) => {
      dominate(p, 'jungle');
      p.terrain.magnitude = 9;
      p.creatures = ['fox', 'pig', 'cow'];
      p.title = 'Floresta Tropical';
      p.summary = 'Selva densa e cheia de vida.';
    },
  },
  {
    keys: ['ilha', 'ilhas', 'oceano', 'mar', 'paradis'],
    apply: (p) => {
      p.terrain.waterOffset = 9;
      p.terrain.magnitude = 7;
      p.creatures = ['pig', 'cow', 'bird'];
      p.title = 'Ilhas Paradisíacas';
      p.summary = 'Mares e pequenas ilhas.';
    },
  },
  {
    keys: ['montanha', 'mountain', 'gigante', 'enorme', 'pico'],
    apply: (p) => {
      p.terrain.magnitude = 20;
      p.terrain.scale = 120;
      p.title = p.title || 'Montanhas Gigantes';
    },
  },
];

export function interpretBiome(prompt) {
  const p = BASE();
  const t = (prompt || '').toLowerCase();
  let matched = false;
  for (const r of RULES) {
    if (r.keys.some((k) => t.includes(k))) {
      r.apply(p);
      matched = true;
    }
  }
  if (!matched) {
    p.title = prompt.slice(0, 40) || 'Mundo Aleatório';
    p.summary = 'Um mundo equilibrado.';
  }
  return p;
}

/** Apply a world patch in place (caller then regenerates). */
export function applyBiome(world, p) {
  Object.assign(world.params.terrain, p.terrain);
  Object.assign(world.params.biomes, p.biomes);
  world.params.theme = p.theme ?? null;
  world.params.creatures = p.creatures ?? null;
  world.params.seed = Math.floor(Math.random() * 1_000_000);
}

const VALID_THEMES = new Set(['favela', 'cyberpunk', null]);
const VALID_CREATURES = new Set(['sheep', 'pig', 'fox', 'cow', 'slime', 'bird', 'wolf']);

function sanitize(prompt, raw) {
  const p = BASE();
  const r = raw || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  p.terrain.scale = Math.max(40, Math.min(200, num(r.terrainScale, 100)));
  p.terrain.magnitude = Math.max(2, Math.min(28, num(r.mountainAmplitude, 8)));
  p.terrain.offset = Math.max(2, Math.min(20, num(r.baseHeight, 6)));
  p.terrain.waterOffset = Math.max(0, Math.min(16, num(r.waterLevel, 4)));
  if (r.dominantBiome) dominate(p, String(r.dominantBiome));
  p.theme = VALID_THEMES.has(r.theme) ? r.theme : (r.theme === 'favela' || r.theme === 'cyberpunk' ? r.theme : null);
  if (Array.isArray(r.creatures)) {
    const c = r.creatures.filter((k) => VALID_CREATURES.has(k));
    if (c.length) p.creatures = c;
  }
  p.title = typeof r.title === 'string' ? r.title.slice(0, 40) : prompt.slice(0, 40);
  p.summary = typeof r.summary === 'string' ? r.summary.slice(0, 160) : '';
  return p;
}

export async function interpretWithAI(prompt) {
  try {
    const res = await fetch('/api/biome', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      return { patch: sanitize(prompt, data), source: data.__provider || 'ai' };
    }
  } catch {
    /* fall through to offline */
  }
  return { patch: interpretBiome(prompt), source: 'offline' };
}
