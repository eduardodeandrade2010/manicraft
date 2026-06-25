import { interpretWithAI, applyBiome } from '../ai/biomeAI.js';

// Prompt overlay (open with B). The player describes a world in natural language;
// the AI interpreter (offline keywords, or the optional Claude/DeepSeek backend)
// turns it into terrain + biome + structure theme + creatures, then regenerates.

const EXAMPLES = [
  'Planeta congelado com montanhas gigantes',
  'Deserto do Egito antigo',
  'Floresta tropical cheia de bichos',
  'Ilhas paradisíacas no oceano',
  'Montanhas enormes com lagos',
];

export class BiomePrompt {
  constructor(world, wildlife, player) {
    this.world = world;
    this.wildlife = wildlife;
    this.player = player;
    this.el = null;
  }

  get isOpen() {
    return !!this.el;
  }

  open() {
    if (this.el) return;
    if (document.pointerLockElement) document.exitPointerLock();

    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(6,10,20,0.6);backdrop-filter:blur(4px);font-family:Segoe UI,system-ui,sans-serif';
    el.innerHTML = `
      <div style="width:min(640px,92vw);background:#141a2c;border:1px solid rgba(120,150,200,0.25);border-radius:16px;padding:24px 26px;color:#e8eefc;box-shadow:0 24px 80px rgba(0,0,0,0.55)">
        <div style="font-size:24px;font-weight:800;background:linear-gradient(90deg,#5db4ff,#7cf2c0);-webkit-background-clip:text;background-clip:text;color:transparent">✦ Gerar Mundo por IA</div>
        <p style="color:#9fb0cc;margin:6px 0 16px;font-size:14px">Descreva o mundo. A IA cria bioma, terreno, estruturas e criaturas.</p>
        <input id="bp-input" type="text" placeholder="ex: Favela do Rio de Janeiro nos morros"
          style="width:100%;font:inherit;color:#e8eefc;background:#0e1424;border:1px solid rgba(120,150,200,0.25);border-radius:10px;padding:12px 14px" />
        <div id="bp-chips" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 16px"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="bp-cancel" style="font:inherit;background:transparent;color:#e8eefc;border:1px solid rgba(120,150,200,0.25);border-radius:10px;padding:10px 16px;cursor:pointer">Cancelar (Esc)</button>
          <button id="bp-go" style="font:inherit;background:linear-gradient(90deg,#5db4ff,#3f8fe0);color:#06121f;font-weight:700;border:none;border-radius:10px;padding:10px 18px;cursor:pointer">Gerar</button>
        </div>
        <div id="bp-status" style="color:#9fb0cc;font-size:13px;margin-top:12px;min-height:18px"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    const input = el.querySelector('#bp-input');
    const chips = el.querySelector('#bp-chips');
    for (const ex of EXAMPLES) {
      const c = document.createElement('span');
      c.textContent = ex;
      c.style.cssText =
        'font-size:12px;padding:6px 10px;border-radius:999px;background:#101830;border:1px solid rgba(120,150,200,0.25);color:#9fb0cc;cursor:pointer';
      c.onclick = () => (input.value = ex);
      chips.appendChild(c);
    }

    el.querySelector('#bp-cancel').onclick = () => this.close();
    el.querySelector('#bp-go').onclick = () => this.#submit();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') this.#submit();
      else if (e.code === 'Escape') this.close();
    });
    setTimeout(() => input.focus(), 30);
  }

  close() {
    this.el?.remove();
    this.el = null;
  }

  async #submit() {
    const input = this.el.querySelector('#bp-input');
    const status = this.el.querySelector('#bp-status');
    const prompt = input.value.trim();
    if (!prompt) {
      status.textContent = 'Digite uma descrição primeiro.';
      return;
    }
    status.innerHTML = '⏳ Interpretando o mundo…';
    const { patch, source } = await interpretWithAI(prompt);
    applyBiome(this.world, patch);
    this.world.generate(true);
    this.wildlife.reset();
    this.player.position.set(0, 40, 0);
    this.player.velocity.set(0, 0, 0);
    status.innerHTML = `<b>${patch.title}</b> — ${patch.summary} <span style="color:#7cf2c0">[${source}]</span>`;
    setTimeout(() => this.close(), 700);
  }
}
