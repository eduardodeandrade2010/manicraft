import * as THREE from 'three';
import { supabase, WORLD_ID } from './supabaseClient';
import { createAvatar } from '../avatar';
import { fetchPhoto } from './profile';

// Realtime multiplayer over Supabase Realtime (one channel per world).
//   - Presence: who is in the world (id + name); their photo is fetched for the avatar.
//   - Broadcast 'pos': each player's position/yaw (~10 Hz) → interpolated avatars.
//   - Broadcast 'hit': PvP damage from the machine gun (target applies it locally).
//   - Broadcast 'edit': live block changes so builds appear for everyone instantly.

export class Multiplayer {
  constructor(scene, profile) {
    this.scene = scene;
    this.profile = profile;
    this.localId = profile.id;
    this.players = new Map(); // id -> { group, target, yaw, name }
    this.channel = null;
    this.onDamaged = null;
    this.onRemoteEdit = null;
    this.onPlayerDown = null;
    this.onExplode = null;
    this.onWorldReset = null;
    this._tmp = new THREE.Vector3();
    this._to = new THREE.Vector3();

    // PvP kill feed.
    const feed = document.createElement('div');
    feed.style.cssText =
      'position:fixed;right:16px;top:54px;z-index:50;display:flex;flex-direction:column;gap:4px;align-items:flex-end;' +
      'font-family:monospace;font-size:14px;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none';
    document.body.appendChild(feed);
    this.feedEl = feed;
  }

  feed(text) {
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(120,10,10,0.6);border-radius:6px;padding:3px 9px;opacity:1;transition:opacity .5s';
    row.textContent = text;
    this.feedEl.appendChild(row);
    setTimeout(() => {
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 500);
    }, 3500);
    while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
  }

  async connect() {
    const ch = supabase.channel('world-' + WORLD_ID, {
      config: { presence: { key: this.localId }, broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => this.#onPos(payload));
    ch.on('broadcast', { event: 'hit' }, ({ payload }) => {
      if (payload && payload.target === this.localId && this.onDamaged) this.onDamaged(payload.dmg, payload.from);
    });
    ch.on('broadcast', { event: 'edit' }, ({ payload }) => {
      if (this.onRemoteEdit) this.onRemoteEdit(payload);
    });
    ch.on('broadcast', { event: 'down' }, ({ payload }) => {
      if (this.onPlayerDown) this.onPlayerDown(payload);
    });
    ch.on('broadcast', { event: 'explode' }, ({ payload }) => {
      if (this.onExplode) this.onExplode(payload);
    });
    ch.on('broadcast', { event: 'reset' }, ({ payload }) => {
      if (this.onWorldReset) this.onWorldReset(payload?.seed);
    });
    ch.on('presence', { event: 'sync' }, () => this.#sync());
    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const p of leftPresences || []) this.#remove(p.id);
    });
    await ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ id: this.localId, name: this.profile.name });
    });
    this.channel = ch;
  }

  #sync() {
    const state = this.channel.presenceState();
    const seen = new Set();
    for (const k in state) {
      for (const m of state[k]) {
        if (!m.id || m.id === this.localId) continue;
        seen.add(m.id);
        if (!this.players.has(m.id)) this.#add(m);
      }
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.#remove(id);
  }

  async #add(meta) {
    if (this.players.has(meta.id)) return;
    this.players.set(meta.id, { loading: true }); // reserve slot
    const photo = await fetchPhoto(meta.id);
    const group = createAvatar(meta.name, photo);
    group.position.set(0, -999, 0);
    this.scene.add(group);
    // live=false until a real position arrives, so the default-spawn avatar is
    // never shootable (prevents "phantom" hits near the origin).
    this.players.set(meta.id, { group, target: new THREE.Vector3(0, -999, 0), yaw: 0, name: meta.name, live: false });
  }

  #remove(id) {
    const pl = this.players.get(id);
    if (pl && pl.group) this.scene.remove(pl.group);
    this.players.delete(id);
  }

  #onPos(p) {
    if (!p || p.id === this.localId) return;
    const pl = this.players.get(p.id);
    if (!pl || !pl.group) return;
    if (!pl.live) pl.group.position.set(p.x, p.y - 1.62, p.z); // snap on first real pos
    pl.target.set(p.x, p.y, p.z);
    pl.yaw = p.yaw || 0;
    pl.live = true;
  }

  sendPos(x, y, z, yaw) {
    this.channel?.send({ type: 'broadcast', event: 'pos', payload: { id: this.localId, x, y, z, yaw } });
  }
  sendHit(targetId, dmg) {
    this.channel?.send({ type: 'broadcast', event: 'hit', payload: { target: targetId, dmg, from: this.profile.name } });
  }
  sendEdit(e) {
    this.channel?.send({ type: 'broadcast', event: 'edit', payload: e });
  }
  sendDown(name, by) {
    this.channel?.send({ type: 'broadcast', event: 'down', payload: { name, by } });
  }
  sendExplode(pos) {
    this.channel?.send({ type: 'broadcast', event: 'explode', payload: { x: pos.x, y: pos.y, z: pos.z } });
  }
  sendReset(seed) {
    this.channel?.send({ type: 'broadcast', event: 'reset', payload: { seed } });
  }

  update(dt) {
    for (const pl of this.players.values()) {
      if (!pl.group) continue;
      this._to.set(pl.target.x, pl.target.y - 1.62, pl.target.z); // eye -> feet
      pl.group.position.lerp(this._to, Math.min(1, dt * 10));
      pl.group.rotation.y = pl.yaw;
    }
  }

  /** Nearest remote player the ray passes through before maxT. {id,t,head}|null. */
  raycastPlayers(origin, dir, maxT) {
    let best = null;
    let bt = maxT;
    for (const [id, pl] of this.players) {
      if (!pl.group || !pl.live) continue; // only players with a known real position
      this._tmp.copy(pl.group.position);
      this._tmp.y += 1.4; // chest
      const tox = this._tmp.x - origin.x;
      const toy = this._tmp.y - origin.y;
      const toz = this._tmp.z - origin.z;
      const t = tox * dir.x + toy * dir.y + toz * dir.z;
      if (t < 0 || t > bt) continue;
      const px = tox - dir.x * t;
      const py = toy - dir.y * t;
      const pz = toz - dir.z * t;
      const perp = Math.sqrt(px * px + py * py + pz * pz);
      if (perp < 0.6) {
        const hitY = origin.y + dir.y * t;
        best = { id, t, head: hitY > pl.group.position.y + 1.75 };
        bt = t;
      }
    }
    return best;
  }
}
