import { supabase } from './supabaseClient';

// Player accounts: name + 4-digit PIN = register/login (no recovery — lose the
// PIN, lose the account). Names are unique. The PIN never travels or is stored
// in clear: we send a SHA-256 hash to a server-side function that does the
// atomic register-or-login and never exposes the hash back to clients.

const KEY = 'manicraft_profile';

export function loadLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

function saveLocal(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Register a new account or log into an existing one. Throws on wrong PIN. */
export async function registerOrLogin(name, pin, photoDataUrl) {
  const cleanName = name.trim().toLowerCase();
  const hash = await sha256(cleanName + ':' + pin);
  const { data, error } = await supabase.rpc('login_or_register', {
    p_name: cleanName,
    p_hash: hash,
    p_photo: photoDataUrl || null,
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('NOME_OU_SENHA')) throw new Error('Esse nome já existe e a senha está errada.');
    if (msg.includes('duplicate') || msg.includes('unique')) throw new Error('Esse nome acabou de ser registrado. Use outro nome.');
    throw new Error('Falha no login: ' + msg);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Falha no login.');
  const profile = { id: row.id, name: row.name, photo: row.photo || photoDataUrl || null };
  saveLocal(profile);
  return profile;
}

/** Fetch a player's photo by id (public view — no PIN exposure). */
export async function fetchPhoto(id) {
  try {
    const { data } = await supabase.from('players_public').select('photo').eq('id', id).maybeSingle();
    return data?.photo || null;
  } catch {
    return null;
  }
}

/** Crop-to-square + downscale an image File to a tiny JPEG data URL. */
export function downscalePhoto(file, size = 64) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
