import * as THREE from 'three';
import { blocks } from './blocks';

// ---------------------------------------------------------------------------
// Sniper rifle for MINECRAFT.js. Toggle with F. Left click fires (infinite
// ammo), right click aims down a zoomed scope. Shots travel far: they kill
// creatures and break blocks at range via a voxel-DDA ray + creature ray-hit
// test, with a bullet tracer, muzzle flash, recoil, and a death-poof of voxel
// particles. The gun model is parented to the camera; a DOM crosshair and scope
// overlay provide the aiming UI.
// ---------------------------------------------------------------------------

const RANGE = 220;
const DAMAGE = 20;
const FIRE_COOLDOWN = 0.09; // machine-gun cadence
const CLOUD = blocks.cloud ? blocks.cloud.id : -1;

const KIND_COLORS = {
  sheep: 0xefeae0, pig: 0xe89aa6, fox: 0xd97b30, cow: 0x6b5a4c,
  slime: 0x57c266, bird: 0x4a5dad, firefly: 0xfff2a0,
};

export class Weapon {
  constructor(scene, player, world, wildlife, audio) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.wildlife = wildlife;
    this.audio = audio;

    this.active = false;
    this.aiming = false;
    this.isFiring = false;     // held for full-auto
    this.multiplayer = null;   // set when online (PvP)
    this.cooldown = 0;
    this.recoil = 0;
    this.flashTime = 0;
    this.defaultFov = player.camera.fov;
    this.zoomFov = 16;

    this.tracers = [];
    this.particles = [];

    this.#buildModel();
    this.#buildUI();

    window.__weaponActive = false;

    // Spawn death particles whenever the wildlife manager reaps a kill.
    this.wildlife.onKill = (c) => this.#poof(c.group.position, KIND_COLORS[c.kind] ?? 0xffffff);

    document.addEventListener('mousedown', (e) => {
      if (!this.active || !this.player.controls.isLocked) return;
      if (e.button === 0) {
        this.isFiring = true; // hold for full-auto
        this.fire();
      } else if (e.button === 2) this.setAim(true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isFiring = false;
      else if (e.button === 2) this.setAim(false);
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
  }

  // ---- Model & UI ----

  #buildModel() {
    const g = new THREE.Group();
    const part = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color })
      );
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    part(0.13, 0.15, 0.95, 0x24272c, 0, 0, -0.15);   // receiver
    part(0.06, 0.06, 1.0, 0x141619, 0, 0.03, -0.7);  // barrel
    part(0.11, 0.11, 0.32, 0x101216, 0, 0.15, -0.2); // scope tube
    part(0.05, 0.05, 0.05, 0x4aa3ff, 0, 0.15, -0.37);// scope lens (blue tint)
    part(0.14, 0.2, 0.28, 0x2c2f35, 0, -0.06, 0.28); // stock
    part(0.08, 0.16, 0.1, 0x1b1d21, 0, -0.14, 0.0);  // grip

    // Muzzle flash (hidden until firing).
    this.flashMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9 })
    );
    this.flashMesh.position.set(0, 0.03, -1.22);
    this.flashMesh.visible = false;
    g.add(this.flashMesh);

    this.basePos = new THREE.Vector3(0.3, -0.28, -0.55);
    g.position.copy(this.basePos);
    g.rotation.y = -0.04;
    g.visible = false;
    this.player.camera.add(g);
    this.gun = g;
    this.muzzleLocal = new THREE.Vector3(0, 0.03, -1.25);
  }

  #buildUI() {
    // Center crosshair (hip-fire).
    const ch = document.createElement('div');
    ch.style.cssText =
      'position:fixed;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);pointer-events:none;z-index:50;display:none';
    ch.innerHTML =
      '<div style="position:absolute;left:10px;top:0;width:2px;height:22px;background:#fff;box-shadow:0 0 2px #000"></div>' +
      '<div style="position:absolute;top:10px;left:0;height:2px;width:22px;background:#fff;box-shadow:0 0 2px #000"></div>';
    document.body.appendChild(ch);
    this.crosshair = ch;

    // Scope overlay (aiming).
    const scope = document.createElement('div');
    scope.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:49;display:none;' +
      'background:radial-gradient(circle at 50% 50%, transparent 0, transparent 30%, rgba(0,0,0,0.55) 31%, #000 42%);';
    scope.innerHTML =
      '<div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(0,0,0,0.7)"></div>' +
      '<div style="position:absolute;top:50%;left:0;height:1px;width:100%;background:rgba(0,0,0,0.7)"></div>' +
      '<div style="position:absolute;left:50%;top:50%;width:8px;height:8px;border:1px solid #d33;border-radius:50%;transform:translate(-50%,-50%)"></div>';
    document.body.appendChild(scope);
    this.scopeEl = scope;

    // Ammo / hint label.
    const hud = document.createElement('div');
    hud.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:50;color:#fff;font-family:monospace;font-size:18px;' +
      'text-shadow:0 1px 3px #000;pointer-events:none;display:none';
    hud.innerHTML = '🔫 RIFLE &nbsp; AMMO ∞';
    document.body.appendChild(hud);
    this.hud = hud;

    // Hit marker (flashes at center on a hit; red on headshot).
    const hm = document.createElement('div');
    hm.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:24px;height:24px;' +
      'z-index:51;pointer-events:none;opacity:0;transition:opacity .08s';
    hm.innerHTML =
      '<div style="position:absolute;left:11px;top:0;width:2px;height:24px;background:#fff"></div>' +
      '<div style="position:absolute;top:11px;left:0;height:2px;width:24px;background:#fff"></div>';
    document.body.appendChild(hm);
    this.hitMark = hm;

    // Kill feed.
    const kf = document.createElement('div');
    kf.style.cssText =
      'position:fixed;left:12px;top:96px;z-index:50;font-family:monospace;font-size:14px;color:#fff;' +
      'text-shadow:0 1px 2px #000;pointer-events:none;display:flex;flex-direction:column;gap:4px';
    document.body.appendChild(kf);
    this.killFeedEl = kf;
  }

  #hitMarker(headshot) {
    this.hitMark.querySelectorAll('div').forEach((d) => (d.style.background = headshot ? '#ff4040' : '#ffffff'));
    this.hitMark.style.opacity = '1';
    clearTimeout(this._hmTimer);
    this._hmTimer = setTimeout(() => (this.hitMark.style.opacity = '0'), 120);
  }

  #killFeed(kind, headshot) {
    const icons = { sheep: '🐑', pig: '🐷', fox: '🦊', cow: '🐮', slime: '🟢', bird: '🐦', wolf: '🐺', firefly: '✨' };
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(10,14,24,0.55);border-radius:6px;padding:3px 8px;opacity:1;transition:opacity .5s';
    row.innerHTML = `${icons[kind] || '❔'} ${kind} ${headshot ? '🎯' : ''} <span style="color:#ff5555">✕</span>`;
    this.killFeedEl.appendChild(row);
    setTimeout(() => {
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 500);
    }, 2500);
    while (this.killFeedEl.children.length > 5) this.killFeedEl.firstChild.remove();
  }

  /** Equip/holster the rifle (driven by the hotbar; the hotbar owns __weaponActive). */
  equip(on) {
    this.active = on;
    this.gun.visible = on;
    this.hud.style.display = on ? 'block' : 'none';
    if (!on) this.setAim(false);
  }

  setAim(on) {
    this.aiming = on && this.active;
  }

  // ---- Firing ----

  fire() {
    if (this.cooldown > 0) return;
    this.cooldown = FIRE_COOLDOWN;

    const cam = this.player.camera;
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    const block = this.#raycastBlock(origin, dir, RANGE);
    const tBlock = block ? block.t : Infinity;

    // Nearest creature whose body the ray passes through, before any block.
    let tCre = Infinity;
    let creHit = null;
    const center = new THREE.Vector3();
    const toC = new THREE.Vector3();
    for (const c of this.wildlife.creatures) {
      c.group.getWorldPosition(center);
      center.y += 0.4;
      toC.copy(center).sub(origin);
      const t = toC.dot(dir);
      if (t < 0 || t > RANGE || t >= tBlock) continue;
      const perp = toC.addScaledVector(dir, -t).length();
      const radius = c.family === 'firefly' ? 0.45 : c.family === 'bird' ? 0.6 : 0.85;
      if (perp < radius && t < tCre) {
        tCre = t;
        creHit = c;
      }
    }

    // PvP: nearest remote player along the ray, occluded by blocks/creatures and
    // capped to 100 blocks so you can't tag someone across the whole map.
    let playerHit = null;
    if (this.multiplayer) {
      playerHit = this.multiplayer.raycastPlayers(origin, dir, Math.min(tBlock, creHit ? tCre : Infinity, 100));
    }

    let hitPoint;
    if (playerHit) {
      const dmg = playerHit.head ? 45 : 14;
      this.multiplayer.sendHit(playerHit.id, dmg);
      hitPoint = origin.clone().addScaledVector(dir, playerHit.t);
      this.#hitMarker(playerHit.head);
      if (this.audio) { if (playerHit.head) this.audio.headshot(); else this.audio.hitmarker(); }
    } else if (creHit) {
      const hitY = origin.y + dir.y * tCre;
      const headZone = creHit.family === 'firefly' ? 99 : 0.9;
      const headshot = hitY - creHit.group.position.y > headZone;
      const killed = creHit.hit(headshot ? DAMAGE * 5 : DAMAGE, dir);
      hitPoint = origin.clone().addScaledVector(dir, tCre);
      this.#hitMarker(headshot);
      if (this.audio) {
        if (killed && headshot) this.audio.headshot();
        else if (killed) this.audio.kill();
        else this.audio.hitmarker();
      }
      if (killed) this.#killFeed(creHit.kind, headshot);
    } else if (block) {
      this.world.removeBlock(block.x, block.y, block.z);
      hitPoint = origin.clone().addScaledVector(dir, tBlock + 0.5);
      this.#poof(new THREE.Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5), 0xb9b6ad, 5);
      if (this.audio) this.audio.blockBreak();
    } else {
      hitPoint = origin.clone().addScaledVector(dir, RANGE);
    }

    if (this.audio) this.audio.shot();
    const muzzle = this.gun.localToWorld(this.muzzleLocal.clone());
    this.#tracer(muzzle, hitPoint);
    this.flashTime = 0.05;
    this.flashMesh.visible = true;
    this.recoil = 1;
  }

  /** Voxel-DDA march. Returns the first solid block hit (ignoring clouds). */
  #raycastBlock(origin, dir, range) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const tDX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = dir.x !== 0 ? (dir.x > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dir.x) : Infinity;
    let tMaxY = dir.y !== 0 ? (dir.y > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dir.y) : Infinity;
    let tMaxZ = dir.z !== 0 ? (dir.z > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dir.z) : Infinity;

    let t = 0;
    while (t <= range) {
      const b = this.world.getBlock(x, y, z);
      if (b && b.id !== 0 && b.id !== CLOUD && y > 0) return { x, y, z, t };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDX;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDY;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDZ;
      }
    }
    return null;
  }

  // ---- Effects ----

  #tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.08 });
  }

  #poof(pos, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshBasicMaterial({ color })
      );
      m.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 4
      );
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, ttl: 0.6 });
    }
  }

  // ---- Per-frame update ----

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    // Full-auto: keep firing while the button is held.
    if (this.isFiring && this.active && this.player.controls.isLocked) this.fire();

    // Muzzle flash.
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flashMesh.visible = false;
    }

    // Recoil recovery (kick gun back + up, ease home).
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 6);
    this.gun.position.set(
      this.basePos.x,
      this.basePos.y + this.recoil * 0.04,
      this.basePos.z + this.recoil * 0.12
    );

    // FOV zoom for the scope.
    const targetFov = this.aiming ? this.zoomFov : this.defaultFov;
    if (Math.abs(this.player.camera.fov - targetFov) > 0.05) {
      this.player.camera.fov += (targetFov - this.player.camera.fov) * Math.min(1, dt * 14);
      this.player.camera.updateProjectionMatrix();
    }

    // Tracers fade out.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.ttl -= dt;
      tr.line.material.opacity = Math.max(0, tr.ttl / 0.08) * 0.9;
      if (tr.ttl <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Particles: gravity + fade.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.ttl -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(Math.max(0.01, p.ttl / 0.6));
      if (p.ttl <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // UI visibility.
    const playing = this.active && this.player.controls.isLocked;
    this.crosshair.style.display = playing && !this.aiming ? 'block' : 'none';
    this.scopeEl.style.display = playing && this.aiming ? 'block' : 'none';
  }
}
