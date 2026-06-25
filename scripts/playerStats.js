// Player health: HUD bar, red hurt vignette, slow regen, and death → respawn.
// Wolves damage the player via Wildlife.onPlayerHit.

export class PlayerStats {
  constructor(onDeath) {
    this.health = 200;
    this.maxHealth = 200;
    this.dead = false;
    this.onDeath = onDeath;
    this.regenAccum = 0;
    this.sinceHit = 0;
    this.lastFrom = null;
    this.#buildUI();
    this.#render();
  }

  #buildUI() {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;left:16px;bottom:54px;width:200px;z-index:50;pointer-events:none;' +
      'font-family:monospace;font-size:12px;color:#fff;text-shadow:0 1px 2px #000';
    wrap.innerHTML =
      '<div style="margin-bottom:3px">❤ HEALTH</div>' +
      '<div style="height:14px;border-radius:7px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);overflow:hidden">' +
      '<div id="ps-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#ff4d4d,#ff9b9b);transition:width .2s"></div></div>';
    document.body.appendChild(wrap);
    this.bar = wrap.querySelector('#ps-bar');

    const vig = document.createElement('div');
    vig.style.cssText =
      'position:fixed;inset:0;z-index:48;pointer-events:none;opacity:0;transition:opacity .2s;' +
      'background:radial-gradient(circle at 50% 50%, transparent 40%, rgba(180,0,0,0.55) 100%)';
    document.body.appendChild(vig);
    this.vignette = vig;

    const dead = document.createElement('div');
    dead.style.cssText =
      'position:fixed;inset:0;z-index:60;pointer-events:none;display:none;align-items:center;justify-content:center;' +
      'background:rgba(40,0,0,0.55);color:#fff;font-family:monospace;font-size:48px;font-weight:bold;text-shadow:0 2px 8px #000';
    dead.textContent = 'YOU DIED';
    document.body.appendChild(dead);
    this.deadEl = dead;

    // "Hit by X" flash near the crosshair.
    const hit = document.createElement('div');
    hit.style.cssText =
      'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:50;pointer-events:none;' +
      'font-family:monospace;font-size:15px;color:#ff8a8a;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .15s';
    document.body.appendChild(hit);
    this.hitEl = hit;
  }

  #render() {
    const pct = Math.max(0, this.health) / this.maxHealth;
    this.bar.style.width = pct * 100 + '%';
    this.vignette.style.opacity = String(Math.min(0.9, (1 - pct) * 0.9 + (this.sinceHit < 0.3 ? 0.4 : 0)));
  }

  damage(d, from) {
    if (this.dead) return;
    this.health -= d;
    this.sinceHit = 0;
    if (from) {
      this.lastFrom = from;
      this.hitEl.textContent = '−' + d + (from ? '  ' + from : '');
      this.hitEl.style.opacity = '1';
      clearTimeout(this._hitTimer);
      this._hitTimer = setTimeout(() => (this.hitEl.style.opacity = '0'), 700);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deadEl.style.display = 'flex';
      const killer = this.lastFrom;
      setTimeout(() => {
        this.deadEl.style.display = 'none';
        this.reset();
        this.onDeath?.(killer);
      }, 1500);
    }
    this.#render();
  }

  reset() {
    this.health = this.maxHealth;
    this.dead = false;
    this.sinceHit = 99;
    this.#render();
  }

  update(dt) {
    if (this.dead) return;
    this.sinceHit += dt;
    // Regen after not being hit for a moment.
    if (this.sinceHit > 4 && this.health < this.maxHealth) {
      this.regenAccum += dt;
      if (this.regenAccum >= 0.5) {
        this.regenAccum = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.#render();
      }
    }
    if (this.sinceHit < 0.35) this.#render();
  }
}
