import { supabase, WORLD_ID } from './supabaseClient';

// World persistence: block edits (what players build/break) are saved to the
// shared Supabase `edits` table, grouped per chunk as { "x,y,z": blockId }.
// On join we load them into the world's dataStore before generation, so every
// player sees every build. The shared world seed lives in the `worlds` table.

export class Persistence {
  constructor(world) {
    this.world = world;
    this.chunks = {}; // chunkKey -> { "x,y,z": blockId }
    this.dirty = new Set();
    this.timer = null;
  }

  /** Load all saved edits into the world's dataStore (call before generate). */
  async loadInto() {
    const { data, error } = await supabase.from('edits').select('chunk_key,data').eq('world_id', WORLD_ID);
    if (error) {
      console.warn('load edits failed', error);
      return;
    }
    for (const row of data || []) {
      this.chunks[row.chunk_key] = row.data || {};
      const [cx, cz] = row.chunk_key.split(',').map(Number);
      for (const posKey in row.data) {
        const [x, y, z] = posKey.split(',').map(Number);
        this.world.dataStore.data[`${cx},${cz},${x},${y},${z}`] = row.data[posKey];
      }
    }
  }

  /** Record one block change (chunk coords + local block coords). */
  record(cx, cz, x, y, z, id) {
    const ck = `${cx},${cz}`;
    (this.chunks[ck] = this.chunks[ck] || {})[`${x},${y},${z}`] = id;
    this.dirty.add(ck);
    if (!this.timer) this.timer = setTimeout(() => this.#flush(), 600);
  }

  async #flush() {
    this.timer = null;
    const cks = [...this.dirty];
    this.dirty.clear();
    if (!cks.length) return;
    const rows = cks.map((ck) => ({ world_id: WORLD_ID, chunk_key: ck, data: this.chunks[ck] }));
    try {
      await supabase.from('edits').upsert(rows);
    } catch (e) {
      console.warn('save edits failed', e);
    }
  }
}

export async function loadOrCreateWorldSeed() {
  try {
    const { data } = await supabase.from('worlds').select('seed').eq('id', WORLD_ID).maybeSingle();
    if (data && data.seed != null) return Number(data.seed);
    const seed = Math.floor(Math.random() * 1_000_000);
    await supabase.from('worlds').insert({ id: WORLD_ID, seed, params: {} });
    return seed;
  } catch (e) {
    console.warn('world seed failed', e);
    return 12345;
  }
}
