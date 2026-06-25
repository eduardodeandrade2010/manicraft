import * as THREE from 'three';
import { Creature, surfaceTopAt } from './creature';

// ---------------------------------------------------------------------------
// Wildlife manager. Keeps a living population around the player: passive ground
// animals + slimes, birds in the sky, hostile wolves that hunt the player, and
// a nocturnal firefly swarm. Which animals appear can be steered by the AI theme
// (world.params.creatures). More wolves prowl at night; fireflies only at night.
// ---------------------------------------------------------------------------

const ALL_GROUND = ['sheep', 'pig', 'fox', 'cow', 'slime'];

export class Wildlife {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'wildlife';
    scene.add(this.group);

    this.creatures = [];
    this.spawnCooldown = 0;

    this.targetGround = 14;
    this.targetBird = 2;
    this.targetFirefly = 16;

    this.spawnMin = 18;
    this.spawnMax = 52;
    this.despawn = 95;

    // Set by main: onKill(creature), onPlayerHit(damage).
    this.onKill = null;
    this.onPlayerHit = null;
  }

  reset() {
    for (const c of this.creatures) this.group.remove(c.group);
    this.creatures = [];
  }

  count(predicate) {
    let n = 0;
    for (const c of this.creatures) if (predicate(c)) n++;
    return n;
  }

  spawn(kind, x, z, y) {
    const c = new Creature(kind, this.world);
    c.group.position.set(x, y, z);
    c.anchor.set(x, y, z);
    if (kind === 'wolf') c.onPlayerHit = this.onPlayerHit;
    this.group.add(c.group);
    this.creatures.push(c);
    return c;
  }

  trySpawnGround(player, kind) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = this.spawnMin + Math.random() * (this.spawnMax - this.spawnMin);
      const x = player.position.x + Math.cos(ang) * r;
      const z = player.position.z + Math.sin(ang) * r;
      const feet = surfaceTopAt(this.world, x, z);
      if (feet !== null && feet > this.world.params.terrain.waterOffset + 1) {
        this.spawn(kind, x, z, feet);
        return true;
      }
    }
    return false;
  }

  #groundKinds() {
    const want = this.world.params.creatures;
    if (Array.isArray(want) && want.length) {
      const f = ALL_GROUND.filter((k) => want.includes(k));
      if (f.length) return f;
    }
    return ALL_GROUND;
  }

  update(dt, player, time, isNight) {
    // Update + cull (distance, death, fell out, daytime fireflies).
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      c.update(dt, player, time);
      const dx = c.group.position.x - player.position.x;
      const dz = c.group.position.z - player.position.z;
      const far = Math.hypot(dx, dz) > this.despawn;
      const fireflyByDay = c.family === 'firefly' && !isNight;
      if (c.dead || c.group.position.y < -10 || far || fireflyByDay) {
        if (c.dead && this.onKill) this.onKill(c);
        this.group.remove(c.group);
        this.creatures.splice(i, 1);
      }
    }

    // Throttle spawns across frames.
    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0) return;
    this.spawnCooldown = 0.25;

    const groundKinds = this.#groundKinds();
    const ground = this.count((c) => c.family === 'quad' || c.family === 'slime');
    const wolves = this.count((c) => c.family === 'wolf');
    const birds = this.count((c) => c.family === 'bird');
    const fireflies = this.count((c) => c.family === 'firefly');
    const wolfTarget = isNight ? 7 : 3;

    if (ground < this.targetGround) {
      this.trySpawnGround(player, groundKinds[Math.floor(Math.random() * groundKinds.length)]);
      return;
    }
    if (wolves < wolfTarget) {
      this.trySpawnGround(player, 'wolf');
      return;
    }
    if (birds < this.targetBird) {
      const ang = Math.random() * Math.PI * 2;
      const r = this.spawnMin + Math.random() * (this.spawnMax - this.spawnMin);
      const x = player.position.x + Math.cos(ang) * r;
      const z = player.position.z + Math.sin(ang) * r;
      const g = surfaceTopAt(this.world, x, z) ?? this.world.params.terrain.offset;
      this.spawn('bird', x, z, g + 12);
      return;
    }
    if (isNight && fireflies < this.targetFirefly) {
      const ang = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      const x = player.position.x + Math.cos(ang) * r;
      const z = player.position.z + Math.sin(ang) * r;
      const g = surfaceTopAt(this.world, x, z) ?? this.world.params.terrain.offset;
      this.spawn('firefly', x, z, g + 2);
    }
  }
}
