import * as THREE from 'three';

// Throwable grenade (hotbar slot 8). Pull the pin and throw: it flies in an arc,
// and a trajectory preview shows where it will land (like an aiming reticle).
// On impact/fuse it explodes — blasting a crater in the terrain and dealing
// falloff damage to players (PvP), creatures, and you if you're too close.

const GRAV = 20;
const THROW_SPEED = 22;
const UP = 7;
const FUSE = 2.2;
const RADIUS = 4.5;
const STEP = 0.03;

export class Grenades {
  constructor(scene, player, world, wildlife, playerStats, audio) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.wildlife = wildlife;
    this.playerStats = playerStats;
    this.audio = audio;
    this.multiplayer = null; // set when online

    this.equipped = false;
    this.cooldown = 0;
    this.grenades = [];
    this.particles = [];
    this.shake = 0; // screen-shake magnitude (applied at render time in main)

    this.geo = new THREE.SphereGeometry(0.18, 12, 12);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x3c5a2e });
    this.debrisGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.debrisMat = new THREE.MeshBasicMaterial({ color: 0x6b6b6b });

    // Grenade in hand (parented to the camera).
    this.held = new THREE.Mesh(this.geo, this.mat);
    this.held.position.set(0.32, -0.3, -0.6);
    this.held.visible = false;
    this.player.camera.add(this.held);

    // Trajectory preview: a row of dots + a landing ring.
    this.dots = [];
    const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 16; i++) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.visible = false;
      this.scene.add(d);
      this.dots.push(d);
    }
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.09, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.9 })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.equipped || !this.player.controls.isLocked) return;
      if (this.cooldown <= 0) this.throw();
    });
  }

  equip(on) {
    this.equipped = on;
    this.held.visible = on;
    if (!on) {
      this.ring.visible = false;
      for (const d of this.dots) d.visible = false;
    }
  }

  #aim() {
    const cam = this.player.camera;
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const vel = dir.clone().multiplyScalar(THROW_SPEED);
    vel.y += UP;
    return { origin: origin.addScaledVector(dir, 0.6), vel };
  }

  throw() {
    this.cooldown = 0.7;
    this.audio?.pin();
    const { origin, vel } = this.#aim();
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({ mesh, vel: vel.clone(), fuse: FUSE });
  }

  #solidAt(p) {
    const b = this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    return b && b.id !== 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);

    // Trajectory preview while held.
    if (this.equipped) this.#preview();

    // Fly + detonate grenades.
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAV * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (g.fuse <= 0 || this.#solidAt(p) || p.y < -2) {
        this.#explode(p.clone());
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }

    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pa = this.particles[i];
      pa.ttl -= dt;
      if (pa.type === 'flash') {
        pa.mesh.scale.setScalar(1 + (0.3 - pa.ttl) * 12);
        pa.mesh.material.opacity = Math.max(0, pa.ttl / 0.3) * 0.9;
      } else {
        pa.vel.y -= 14 * dt;
        pa.mesh.position.addScaledVector(pa.vel, dt);
        pa.mesh.material.opacity = Math.max(0, pa.ttl / 0.8);
        pa.mesh.material.transparent = true;
      }
      if (pa.ttl <= 0) {
        this.scene.remove(pa.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  #preview() {
    const { origin, vel } = this.#aim();
    const p = origin.clone();
    const v = vel.clone();
    let land = null;
    let dotIdx = 0;
    const everyN = 7;
    let step = 0;
    for (let i = 0; i < 200; i++) {
      v.y -= GRAV * STEP;
      p.addScaledVector(v, STEP);
      if (step++ % everyN === 0 && dotIdx < this.dots.length) {
        this.dots[dotIdx].position.copy(p);
        this.dots[dotIdx].visible = true;
        dotIdx++;
      }
      if (this.#solidAt(p) || p.y < 0) {
        land = p.clone();
        break;
      }
    }
    for (let i = dotIdx; i < this.dots.length; i++) this.dots[i].visible = false;
    if (land) {
      this.ring.position.set(land.x, land.y + 0.05, land.z);
      this.ring.visible = true;
    } else {
      this.ring.visible = false;
    }
  }

  #explode(pos) {
    // Crater: remove solid blocks within the radius (persisted + broadcast via removeBlock).
    const r = Math.ceil(RADIUS);
    const cx = Math.floor(pos.x);
    const cy = Math.floor(pos.y);
    const cz = Math.floor(pos.z);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > RADIUS * RADIUS) continue;
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          if (y <= 0) continue;
          const b = this.world.getBlock(x, y, z);
          if (b && b.id !== 0) this.world.removeBlock(x, y, z);
        }
      }
    }

    // Damage with distance falloff — lethal up close.
    const hurtR = RADIUS + 1.5;
    const dl = pos.distanceTo(this.player.position);
    if (dl < hurtR) this.playerStats.damage(Math.max(1, Math.round((1 - dl / hurtR) * 200)), 'Granada');

    if (this.multiplayer) {
      for (const [id, pl] of this.multiplayer.players) {
        if (!pl.group || !pl.live) continue;
        const d = pos.distanceTo(pl.group.position);
        if (d < hurtR) this.multiplayer.sendHit(id, Math.max(1, Math.round((1 - d / hurtR) * 250)));
      }
    }
    if (this.wildlife) {
      const away = new THREE.Vector3();
      for (const c of this.wildlife.creatures) {
        const d = pos.distanceTo(c.group.position);
        if (d < hurtR) {
          away.copy(c.group.position).sub(pos).normalize();
          c.hit(100, away);
        }
      }
    }

    this.#fx(pos);
    if (this.multiplayer) this.multiplayer.sendExplode(pos);
  }

  /** Sound + flash + debris + screen shake (scaled by distance to the player). */
  #fx(pos) {
    this.audio?.explosion();
    this.#boom(pos);
    const dl = pos.distanceTo(this.player.position);
    const intensity = Math.min(0.7, (1 - Math.min(1, dl / 40)) * 0.8 + 0.04);
    this.shake = Math.max(this.shake, intensity);
  }

  /** Triggered by another player's grenade (damage/crater already arrive via the network). */
  feelExplosion(pos) {
    this.#fx(pos);
  }

  #boom(pos) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffce6a, transparent: true, opacity: 0.9 })
    );
    flash.position.copy(pos);
    this.scene.add(flash);
    this.particles.push({ mesh: flash, ttl: 0.3, type: 'flash' });

    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat.clone());
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 8 + 2, (Math.random() - 0.5) * 9);
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: v, ttl: 0.8, type: 'debris' });
    }
  }
}
