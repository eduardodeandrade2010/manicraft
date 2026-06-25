import * as THREE from 'three';

// A remote player's avatar: a blocky body + a sphere head textured with their
// profile photo (the "bolinha" with their face), plus a floating name tag.
// Local players are first-person, so this is what everyone else sees of you.

function nameTag(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((name || 'Player').slice(0, 14), 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.5;
  return sprite;
}

export function createAvatar(name, photoDataUrl) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x3a6ea5 });
  const limb = new THREE.MeshLambertMaterial({ color: 0x2b5580 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.32), skin);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.22), limb);
    arm.position.set(sx * 0.4, 1.15, 0);
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), limb);
    leg.position.set(sx * 0.16, 0.37, 0);
    g.add(leg);
  }

  // Photo-sphere head.
  let headMat;
  if (photoDataUrl) {
    const tex = new THREE.TextureLoader().load(photoDataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    headMat = new THREE.MeshLambertMaterial({ map: tex });
  } else {
    headMat = new THREE.MeshLambertMaterial({ color: 0xffd9a0 });
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), headMat);
  head.position.y = 1.95;
  head.castShadow = true;
  g.add(head);

  g.add(nameTag(name));
  return g;
}
