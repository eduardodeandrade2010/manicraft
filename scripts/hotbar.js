import { blocks } from './blocks';

// Unified hotbar / item selection. Slots: 0 = pickaxe, 1-7 = blocks, 8 = grenade,
// 9 = rifle. Scroll the mouse wheel (or press 0-9) to cycle. The grenade and
// rifle set window.__weaponActive so the player's pickaxe/block clicks are
// suppressed while they're equipped. Single source of truth for what's in hand.

const SLOTS = 10; // 0..9

export class Hotbar {
  constructor(player, weapon, grenade) {
    this.player = player;
    this.weapon = weapon;
    this.grenade = grenade;
    this.index = 0;

    document.addEventListener('wheel', (e) => {
      if (!this.player.controls.isLocked) return;
      this.select(this.index + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.code && e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 0 && n <= 9) this.select(n);
      }
    });

    this.select(0);
  }

  select(i) {
    i = ((i % SLOTS) + SLOTS) % SLOTS;
    this.index = i;

    for (let k = 0; k <= 9; k++) document.getElementById('toolbar-' + k)?.classList.remove('selected');
    document.getElementById('toolbar-' + i)?.classList.add('selected');

    const tool = this.player.tool?.container;
    if (i === 9) {
      // Rifle.
      this.weapon.equip(true);
      this.grenade?.equip(false);
      if (tool) tool.visible = false;
      this.player.activeBlockId = blocks.empty.id;
    } else if (i === 8) {
      // Grenade (replaces the last block slot).
      this.weapon.equip(false);
      this.grenade?.equip(true);
      if (tool) tool.visible = false;
      this.player.activeBlockId = blocks.empty.id;
    } else {
      // Pickaxe (0) or a block (1-7).
      this.weapon.equip(false);
      this.grenade?.equip(false);
      this.player.activeBlockId = i;
      if (tool) tool.visible = i === 0;
    }

    // Rifle and grenade suppress the player's pickaxe/block mouse input.
    window.__weaponActive = i === 8 || i === 9;
  }
}
