import { blocks } from './blocks';

// Unified hotbar / item selection. Slots: 0 = pickaxe, 1-8 = blocks, 9 = rifle.
// Scroll the mouse wheel (or press 0-9) to cycle. Selecting the rifle equips the
// gun (left click shoots); selecting any other slot holsters it and sets the
// active block / pickaxe. This is the single source of truth for what's in hand.

const SLOTS = 10; // 0..9

export class Hotbar {
  constructor(player, weapon) {
    this.player = player;
    this.weapon = weapon;
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

    if (i === 9) {
      // Rifle.
      this.weapon.equip(true);
      if (this.player.tool?.container) this.player.tool.container.visible = false;
      this.player.activeBlockId = blocks.empty.id;
    } else {
      // Pickaxe (0) or a block (1-8).
      this.weapon.equip(false);
      this.player.activeBlockId = i;
      if (this.player.tool?.container) this.player.tool.container.visible = i === 0;
    }
  }
}
