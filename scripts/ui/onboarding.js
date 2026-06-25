import { saveProfile, downscalePhoto, loadLocalProfile } from '../net/profile';

// First-run onboarding: pick a name + a profile photo, then drop straight into
// the world (no long intro). The photo becomes the avatar's head sphere.

export class Onboarding {
  constructor(onDone) {
    this.onDone = onDone;
    this.photo = null;
  }

  open() {
    window.__onboarding = true;
    const existing = loadLocalProfile();
    this.photo = existing?.photo || null;

    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(circle at 50% 0%,#16243f,#0a0e18 70%);font-family:Segoe UI,system-ui,sans-serif;color:#e8eefc';
    el.innerHTML = `
      <div style="width:min(420px,92vw);background:rgba(18,24,40,0.95);border:1px solid rgba(120,150,200,0.25);border-radius:18px;padding:28px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.55)">
        <div style="font-size:34px;font-weight:800;letter-spacing:-1px;background:linear-gradient(90deg,#5db4ff,#7cf2c0);-webkit-background-clip:text;background-clip:text;color:transparent">ManiCraft</div>
        <p style="color:#9fb0cc;margin:4px 0 18px;font-size:14px">Mundo online — escolha seu nome e sua foto.</p>
        <div style="display:flex;justify-content:center;margin-bottom:14px">
          <label for="ob-file" style="cursor:pointer">
            <div id="ob-circle" style="width:104px;height:104px;border-radius:50%;border:3px solid #5db4ff;background:#0e1424 center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#5e7398;font-size:13px;overflow:hidden">+ foto</div>
          </label>
          <input id="ob-file" type="file" accept="image/*" style="display:none" />
        </div>
        <input id="ob-name" type="text" maxlength="14" placeholder="Seu nome"
          style="width:100%;font:inherit;color:#e8eefc;background:#0e1424;border:1px solid rgba(120,150,200,0.25);border-radius:10px;padding:12px 14px;text-align:center;margin-bottom:14px" />
        <button id="ob-play" style="width:100%;font:inherit;font-weight:700;background:linear-gradient(90deg,#5db4ff,#3f8fe0);color:#06121f;border:none;border-radius:10px;padding:13px;cursor:pointer">Entrar no mundo</button>
        <div id="ob-status" style="color:#9fb0cc;font-size:12px;margin-top:10px;min-height:16px"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    const circle = el.querySelector('#ob-circle');
    const file = el.querySelector('#ob-file');
    const nameInput = el.querySelector('#ob-name');
    const status = el.querySelector('#ob-status');
    const play = el.querySelector('#ob-play');

    if (existing?.name) nameInput.value = existing.name;
    if (this.photo) {
      circle.style.backgroundImage = `url(${this.photo})`;
      circle.textContent = '';
    }
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());

    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      status.textContent = 'Processando foto…';
      this.photo = await downscalePhoto(f);
      if (this.photo) {
        circle.style.backgroundImage = `url(${this.photo})`;
        circle.textContent = '';
      }
      status.textContent = '';
    });

    const submit = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        status.textContent = 'Digite um nome.';
        return;
      }
      play.disabled = true;
      status.innerHTML = 'Entrando…';
      const profile = await saveProfile(name, this.photo);
      window.__onboarding = false;
      el.remove();
      this.onDone(profile);
    };

    play.addEventListener('click', submit);
    nameInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') submit();
    });
    setTimeout(() => nameInput.focus(), 30);
  }
}
