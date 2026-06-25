import * as THREE from 'three';

// Day/night cycle. Drives the sun's direction + intensity, the sky background,
// fog color, and ambient light over a configurable period. Exposes isNight so
// wildlife can gate nocturnal creatures (fireflies appear, more wolves prowl).

const DAY_SKY = new THREE.Color(0x80a0e0);
const NIGHT_SKY = new THREE.Color(0x0b1233);
const DAY_FOG = new THREE.Color(0x80a0e0);
const NIGHT_FOG = new THREE.Color(0x0a1029);
const DAY_SUN = new THREE.Color(0xfff4e0);
const DUSK_SUN = new THREE.Color(0xff8a4a);

export class DayNight {
  constructor(scene, sun, ambient, dayLength = 140) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;
    this.dayLength = dayLength;
    this.t = 0.28; // start mid-morning
    this._sky = new THREE.Color();
    this._fog = new THREE.Color();
  }

  /** 0..1 sun elevation factor (1 = noon, <=0 = below horizon). */
  get elevation() {
    return Math.sin(this.t * Math.PI * 2 - Math.PI / 2);
  }

  get isNight() {
    return this.elevation < -0.05;
  }

  update(dt, playerPos) {
    this.t = (this.t + dt / this.dayLength) % 1;
    const e = this.elevation; // -1..1

    // Sun orbits around the player on a tilted arc.
    const ang = this.t * Math.PI * 2;
    const radius = 80;
    this.sun.position.set(
      playerPos.x + Math.cos(ang) * radius,
      playerPos.y + Math.max(8, e * 90),
      playerPos.z + Math.sin(ang) * radius * 0.4
    );
    if (this.sun.target) this.sun.target.position.copy(playerPos);

    // Day factor 0 (night) .. 1 (full day).
    const day = THREE.MathUtils.clamp(e * 1.4 + 0.4, 0, 1);
    // Dusk tint near the horizon.
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(e) * 3, 0, 1);

    this.sun.intensity = 0.25 + day * 1.4;
    this.sun.color.copy(DAY_SUN).lerp(DUSK_SUN, dusk * 0.7);
    this.ambient.intensity = 0.12 + day * 0.28;

    this._sky.copy(NIGHT_SKY).lerp(DAY_SKY, day);
    this._fog.copy(NIGHT_FOG).lerp(DAY_FOG, day);
    if (this.scene.background && this.scene.background.copy) this.scene.background.copy(this._sky);
    else this.scene.background = this._sky.clone();
    if (this.scene.fog) this.scene.fog.color.copy(this._fog);
  }
}
