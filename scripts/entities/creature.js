import * as THREE from 'three';
import { blocks } from '../blocks';

// ---------------------------------------------------------------------------
// Living creatures for MINECRAFT.js. Each creature is a small voxel model with
// animated parts and a lightweight AI: quadrupeds graze/wander and flee the
// player, slimes bounce, birds fly and flock loosely, and fireflies drift and
// glow. They follow the terrain surface and avoid water. Pure procedural meshes
// (no extra assets), so they spawn anywhere the AI-generated world goes.
// ---------------------------------------------------------------------------

export const AIR = blocks.empty.id;
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** World-space height of the first free cell above the terrain at (x,z). */
export function surfaceTopAt(world, x, z, maxY = 30) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  for (let y = maxY; y >= 1; y--) {
    const b = world.getBlock(xi, y, zi);
    if (b && b.id !== AIR) {
      const above = world.getBlock(xi, y + 1, zi);
      if (!above || above.id === AIR) return y + 0.5; // block top face (cubes are center-anchored)
    }
  }
  return null;
}

function boxMesh(sx, sy, sz, color, opts) {
  const m = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color, ...(opts || {}) }));
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

// Quadruped species presets (sheep / pig / fox / cow).
const QUAD = {
  sheep: { body: 0xefeae0, head: 0xe7e1d4, leg: 0x4a423b, accent: 0x3a3330, s: 0.9, speed: 1.3, run: 3.6, flee: 8, legLen: 0.5, tail: false },
  pig:   { body: 0xe89aa6, head: 0xe89aa6, leg: 0xc97f8b, accent: 0xb96f7b, s: 0.85, speed: 1.1, run: 3.0, flee: 7, legLen: 0.4, tail: false },
  fox:   { body: 0xd97b30, head: 0xe08a3d, leg: 0x3a2c20, accent: 0xf4ece0, s: 0.62, speed: 2.1, run: 4.8, flee: 6, legLen: 0.42, tail: true },
  cow:   { body: 0x4d4038, head: 0x4d4038, leg: 0x2f2620, accent: 0xf2efe6, s: 1.0, speed: 1.0, run: 2.8, flee: 8, legLen: 0.56, tail: true },
};

export class Creature {
  constructor(kind, world) {
    this.kind = kind;
    this.world = world;
    this.group = new THREE.Group();
    this.refs = {};
    this.heading = Math.random() * Math.PI * 2;
    this.phase = Math.random() * Math.PI * 2;
    this.seed = Math.random() * 1000;
    this.walkPhase = 0;
    this.state = 'wander';
    this.stateTimer = 1 + Math.random() * 2;
    this.vy = 0;
    this.hopTimer = Math.random();
    this.hx = 0;
    this.hz = 0;
    this.onGround = false;
    this.anchor = new THREE.Vector3();

    if (QUAD[kind]) {
      this.family = 'quad';
      this.cfg = QUAD[kind];
      this.#buildQuad(this.cfg);
    } else if (kind === 'slime') {
      this.family = 'slime';
      this.#buildSlime();
    } else if (kind === 'bird') {
      this.family = 'bird';
      this.#buildBird();
    } else if (kind === 'wolf') {
      this.family = 'wolf';
      this.cfg = { s: 0.82, speed: 3.3, legLen: 0.46, body: 0x3b3f47, head: 0x33373f, leg: 0x23262c, accent: 0x14161a, tail: false };
      this.#buildQuad(this.cfg);
      const s = this.cfg.s;
      // Glowing red eyes.
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
        eye.scale.setScalar(0.1 * s);
        eye.position.set(sx * 0.16, 0.06, 0.28);
        this.refs.head.add(eye);
      }
      // Long snout.
      const snout = boxMesh(0.3 * s, 0.26 * s, 0.4 * s, 0x2a2e35);
      snout.position.set(0, -0.04 * s, 0.42 * s);
      this.refs.head.add(snout);
      // Bushy raised tail.
      const tail = boxMesh(0.2 * s, 0.5 * s, 0.2 * s, 0x2a2e35);
      tail.position.set(0, this.cfg.legLen + 0.55 * s, -0.72 * s);
      tail.rotation.x = -0.9;
      this.group.add(tail);
      this.attackTimer = 0;
    } else {
      this.family = 'firefly';
      this.#buildFirefly();
    }

    // Life: hit points, hit-flash timer, death flag.
    this.health = this.family === 'wolf' ? 4 : this.family === 'quad' ? 3 : this.family === 'slime' ? 2 : 1;
    this.dead = false;
    this.flash = 0;
  }

  /** Take damage from the player's weapon. Returns true if this killed it. */
  hit(damage, dir) {
    if (this.dead) return false;
    this.health -= damage;
    this.flash = 0.18;
    const p = this.group.position;
    p.x += dir.x * 0.5;
    p.z += dir.z * 0.5;
    if (this.family === 'quad') {
      this.state = 'flee';
      this.heading = Math.atan2(dir.z, dir.x);
      this.stateTimer = 2.5;
    } else if (this.family === 'slime') {
      this.heading = Math.atan2(dir.z, dir.x);
      this.hopTimer = 0;
    }
    if (this.health <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  // ---- Model builders ----

  #buildQuad(cfg) {
    const s = cfg.s;
    const legLen = cfg.legLen;
    const bodyH = 0.7 * s;
    const bodyW = 0.85 * s;
    const bodyL = 1.35 * s;
    const bodyY = legLen + bodyH / 2;

    const body = boxMesh(bodyL, bodyH, bodyW, cfg.body);
    body.position.set(0, bodyY, 0);
    this.group.add(body);

    const headSize = 0.62 * s;
    const head = boxMesh(headSize, headSize, headSize, cfg.head);
    head.position.set(0, bodyY + 0.16 * s, bodyL / 2 + headSize / 2 - 0.05);
    this.group.add(head);
    this.refs.head = head;

    // Snout / nose accent.
    const snout = boxMesh(headSize * 0.45, headSize * 0.4, 0.18 * s, cfg.accent);
    snout.position.set(0, -0.04 * s, headSize / 2);
    head.add(snout);
    // Ears.
    for (const sx of [-1, 1]) {
      const ear = boxMesh(0.16 * s, 0.2 * s, 0.1 * s, cfg.head);
      ear.position.set(sx * headSize * 0.32, headSize * 0.5, -0.02);
      head.add(ear);
    }

    // Legs as pivoted groups (swing from the hip).
    this.refs.legs = [];
    const lx = bodyW / 2 - 0.12 * s;
    const lz = bodyL / 2 - 0.2 * s;
    const corners = [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]];
    for (const [cx, cz] of corners) {
      const hip = new THREE.Group();
      hip.position.set(cx, legLen, cz);
      const leg = boxMesh(0.2 * s, legLen, 0.2 * s, cfg.leg);
      leg.position.set(0, -legLen / 2, 0);
      hip.add(leg);
      this.group.add(hip);
      this.refs.legs.push(hip);
    }

    if (cfg.tail) {
      const tail = boxMesh(0.14 * s, 0.14 * s, 0.5 * s, cfg.accent);
      tail.position.set(0, bodyY + 0.1 * s, -bodyL / 2 - 0.2 * s);
      tail.rotation.x = -0.4;
      this.group.add(tail);
      this.refs.tail = tail;
    }
  }

  #buildSlime() {
    const body = boxMesh(0.9, 0.9, 0.9, 0x57c266, { transparent: true, opacity: 0.82 });
    body.position.y = 0.45;
    this.group.add(body);
    this.refs.body = body;
    for (const sx of [-1, 1]) {
      const eye = boxMesh(0.14, 0.14, 0.06, 0x102014);
      eye.position.set(sx * 0.22, 0.55, 0.46);
      this.group.add(eye);
    }
    this.scaleBase = 1;
  }

  #buildBird() {
    const body = boxMesh(0.35, 0.3, 0.6, 0x394a8f);
    this.group.add(body);
    const head = boxMesh(0.28, 0.28, 0.28, 0x4a5dad);
    head.position.set(0, 0.12, 0.4);
    this.group.add(head);
    const beak = boxMesh(0.1, 0.1, 0.18, 0xe7b54a);
    beak.position.set(0, 0.1, 0.62);
    this.group.add(beak);
    const tail = boxMesh(0.2, 0.06, 0.3, 0x2c3a72);
    tail.position.set(0, 0.02, -0.42);
    this.group.add(tail);
    // Wings pivot at the shoulders.
    this.refs.wingL = new THREE.Group();
    this.refs.wingR = new THREE.Group();
    for (const [grp, dir] of [[this.refs.wingL, -1], [this.refs.wingR, 1]]) {
      const wing = boxMesh(0.55, 0.05, 0.4, 0x5066b8);
      wing.position.set(dir * 0.4, 0, 0);
      grp.add(wing);
      grp.position.set(dir * 0.16, 0.08, 0);
      this.group.add(grp);
    }
  }

  #buildFirefly() {
    const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    m.scale.setScalar(0.18);
    this.group.add(m);
    // Soft halo.
    const halo = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.25 }));
    halo.scale.setScalar(0.4);
    this.group.add(halo);
    this.refs.core = m;
    this.refs.halo = halo;
  }

  // ---- Behavior ----

  update(dt, player, time) {
    switch (this.family) {
      case 'quad': this.#updateQuad(dt, player); break;
      case 'slime': this.#updateSlime(dt, player); break;
      case 'bird': this.#updateBird(dt, player, time); break;
      case 'wolf': this.#updateWolf(dt, player); break;
      default: this.#updateFirefly(dt, player); break;
    }

    // Hit-flash: briefly tint the creature red when damaged.
    if (this.flash > 0) {
      this.flash -= dt;
      const hex = this.flash > 0 ? 0x882020 : 0x000000;
      this.group.traverse((o) => {
        if (o.material && o.material.emissive) o.material.emissive.setHex(hex);
      });
    }
  }

  get waterY() {
    return this.world.params.terrain.waterOffset + 1;
  }

  #updateQuad(dt, player) {
    const cfg = this.cfg;
    const p = this.group.position;
    const dx = p.x - player.position.x;
    const dz = p.z - player.position.z;
    const dist = Math.hypot(dx, dz);

    let speed = cfg.speed;
    let moving = true;

    if (dist < cfg.flee) {
      this.state = 'flee';
      this.heading = Math.atan2(dz, dx); // run directly away
      speed = cfg.run;
    } else {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (Math.random() < 0.3) {
          this.state = 'idle';
          this.stateTimer = 1 + Math.random() * 2.5;
        } else {
          this.state = 'wander';
          this.stateTimer = 2 + Math.random() * 3;
          this.heading += (Math.random() - 0.5) * 1.4;
        }
      }
      if (this.state === 'idle') moving = false;
    }

    if (moving) {
      const vx = Math.cos(this.heading) * speed;
      const vz = Math.sin(this.heading) * speed;
      const nx = p.x + vx * dt;
      const nz = p.z + vz * dt;
      const feet = surfaceTopAt(this.world, nx, nz);
      if (feet === null || feet <= this.waterY || Math.abs(feet - p.y) > 1.6) {
        // Cliff, water, or unloaded — turn away.
        this.heading += (Math.random() < 0.5 ? 1 : -1) * 1.8;
        moving = false;
      } else {
        p.x = nx;
        p.z = nz;
        this.group.rotation.y = Math.atan2(vx, vz);
        this.walkPhase += dt * speed * 4;
      }
    }

    // Gravity + settle so creatures never float: fall fast toward the ground,
    // ease onto it, and keep falling if no ground is known beneath them.
    const feetNow = surfaceTopAt(this.world, p.x, p.z);
    if (feetNow !== null) {
      if (p.y > feetNow + 0.05) p.y = Math.max(feetNow, p.y - 14 * dt);
      else p.y += (feetNow - p.y) * Math.min(1, dt * 12);
    } else {
      p.y -= 14 * dt;
    }

    // Animate legs / head / tail.
    const amt = moving ? 1 : 0;
    const legs = this.refs.legs;
    if (legs) {
      for (let i = 0; i < legs.length; i++) {
        const off = i === 0 || i === 3 ? 0 : Math.PI;
        legs[i].rotation.x = Math.sin(this.walkPhase + off) * 0.6 * amt;
      }
    }
    if (this.refs.head) this.refs.head.rotation.x = Math.sin(this.walkPhase * 0.5) * 0.05 * amt;
    if (this.refs.tail) this.refs.tail.rotation.y = Math.sin(this.walkPhase * 0.8) * 0.4;
  }

  #updateSlime(dt, player) {
    const p = this.group.position;
    this.vy -= 20 * dt;
    p.y += this.vy * dt;

    const feet = surfaceTopAt(this.world, p.x, p.z);
    if (feet !== null && p.y <= feet) {
      p.y = feet;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.onGround) {
      this.hopTimer -= dt;
      if (this.hopTimer <= 0) {
        this.hopTimer = 0.7 + Math.random() * 1.3;
        const dx = p.x - player.position.x;
        const dz = p.z - player.position.z;
        const d = Math.hypot(dx, dz);
        this.heading = d < 6 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
        this.vy = 6.5;
        const s = d < 6 ? 3.0 : 2.0;
        this.hx = Math.cos(this.heading) * s;
        this.hz = Math.sin(this.heading) * s;
        this.group.rotation.y = Math.atan2(this.hx, this.hz);
      }
    } else {
      const nx = p.x + this.hx * dt;
      const nz = p.z + this.hz * dt;
      const f = surfaceTopAt(this.world, nx, nz);
      if (f !== null && f > this.waterY) {
        p.x = nx;
        p.z = nz;
      }
    }

    // Squash & stretch.
    const target = this.onGround ? 0.8 : 1.25;
    const b = this.refs.body;
    b.scale.y += (target - b.scale.y) * Math.min(1, dt * 12);
    const flat = 1 + (1 - b.scale.y) * 0.6;
    b.scale.x = flat;
    b.scale.z = flat;
  }

  #updateBird(dt, player, time) {
    const p = this.group.position;
    const dx = player.position.x - p.x;
    const dz = player.position.z - p.z;
    const d = Math.hypot(dx, dz);

    if (d > 55) this.heading = Math.atan2(dz, dx); // steer back toward player
    else this.heading += (Math.random() - 0.5) * dt * 1.6;

    const speed = 6;
    const vx = Math.cos(this.heading) * speed;
    const vz = Math.sin(this.heading) * speed;
    p.x += vx * dt;
    p.z += vz * dt;

    const ground = surfaceTopAt(this.world, p.x, p.z) ?? this.world.params.terrain.offset;
    const targetY = ground + 11 + Math.sin(time * 0.001 + this.phase) * 2;
    p.y += (targetY - p.y) * Math.min(1, dt * 2);

    this.group.rotation.y = Math.atan2(vx, vz);
    const flap = Math.sin(time * 0.02 + this.phase) * 0.9;
    this.refs.wingL.rotation.z = flap;
    this.refs.wingR.rotation.z = -flap;
    this.group.rotation.z = Math.sin(time * 0.001 + this.phase) * 0.15;
  }

  #updateFirefly(dt, player) {
    this.phase += dt;
    this.anchor.x += (player.position.x - this.anchor.x) * 0.004;
    this.anchor.z += (player.position.z - this.anchor.z) * 0.004;
    const p = this.group.position;
    p.x = this.anchor.x + Math.sin(this.phase * 0.7 + this.seed) * 3.5;
    p.z = this.anchor.z + Math.cos(this.phase * 0.5 + this.seed * 1.3) * 3.5;
    const ground = surfaceTopAt(this.world, p.x, p.z) ?? this.world.params.terrain.offset;
    p.y = ground + 1.6 + Math.sin(this.phase * 1.3 + this.seed) * 1.0;

    const glow = 0.6 + 0.4 * Math.sin(this.phase * 5 + this.seed);
    this.refs.core.scale.setScalar(0.14 + glow * 0.08);
    this.refs.halo.material.opacity = 0.12 + glow * 0.22;
  }

  // Hostile: chases the player and bites on contact (damage via onPlayerHit).
  #updateWolf(dt, player) {
    const p = this.group.position;
    const dx = player.position.x - p.x;
    const dz = player.position.z - p.z;
    const dist = Math.hypot(dx, dz);
    this.heading = Math.atan2(dz, dx);

    let moving = false;
    if (dist > 1.4) {
      const vx = Math.cos(this.heading) * this.cfg.speed;
      const vz = Math.sin(this.heading) * this.cfg.speed;
      const nx = p.x + vx * dt;
      const nz = p.z + vz * dt;
      const feet = surfaceTopAt(this.world, nx, nz);
      if (feet !== null && feet > this.waterY && Math.abs(feet - p.y) < 2.2) {
        p.x = nx;
        p.z = nz;
        this.group.rotation.y = Math.atan2(vx, vz);
        this.walkPhase += dt * this.cfg.speed * 4;
        moving = true;
      }
    } else {
      // In range: bite on a cooldown.
      this.group.rotation.y = Math.atan2(dx, dz);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = 0.8;
        if (this.onPlayerHit) this.onPlayerHit(8);
      }
    }

    const legs = this.refs.legs;
    if (legs) {
      for (let i = 0; i < legs.length; i++) {
        const off = i === 0 || i === 3 ? 0 : Math.PI;
        legs[i].rotation.x = Math.sin(this.walkPhase + off) * 0.7 * (moving ? 1 : 0);
      }
    }

    const feetNow = surfaceTopAt(this.world, p.x, p.z);
    if (feetNow !== null) {
      if (p.y > feetNow + 0.05) p.y = Math.max(feetNow, p.y - 14 * dt);
      else p.y += (feetNow - p.y) * Math.min(1, dt * 12);
    } else {
      p.y -= 14 * dt;
    }
  }
}
