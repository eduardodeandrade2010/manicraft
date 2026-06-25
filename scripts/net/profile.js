import { supabase } from './supabaseClient';

// Player profile: a name + a small profile photo. Stored locally (so returning
// players skip onboarding) and upserted to Supabase `profiles`. The photo is
// downscaled to a tiny JPEG so it's cheap to store and to texture onto the
// player's avatar head.

const KEY = 'manicraft_profile';

export function loadLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export async function saveProfile(name, photoDataUrl) {
  const existing = loadLocalProfile();
  const id = existing?.id || (crypto.randomUUID ? crypto.randomUUID() : 'p_' + Math.random().toString(36).slice(2));
  const profile = { id, name, photo: photoDataUrl || existing?.photo || null };
  localStorage.setItem(KEY, JSON.stringify(profile));
  try {
    await supabase.from('profiles').upsert({ id, name: profile.name, photo: profile.photo });
  } catch (e) {
    console.warn('profile upsert failed', e);
  }
  return profile;
}

/** Fetch another player's photo by id (for their avatar). */
export async function fetchPhoto(id) {
  try {
    const { data } = await supabase.from('profiles').select('photo').eq('id', id).maybeSingle();
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
