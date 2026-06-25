import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world';
import { Player } from './player';
import { Physics } from './physics';
import { setupUI } from './ui';
import { ModelLoader } from './modelLoader';
import { Wildlife } from './entities/wildlife';
import { Weapon } from './weapon';
import { GameAudio } from './audio';
import { DayNight } from './daynight';
import { PlayerStats } from './playerStats';
import { Hotbar } from './hotbar';
import { updateWater } from './water';
import { Onboarding } from './ui/onboarding';
import { Multiplayer } from './net/multiplayer';
import { Persistence, loadOrCreateWorldSeed } from './net/persistence';

// UI Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// Renderer setup
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Cinematic tonemapping so bloom + sunset read nicely.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x80a0e0, 50, 75);

const world = new World();
scene.add(world);
// The world is the SHARED online world — its seed is loaded from Supabase and
// it is generated after onboarding (see the Onboarding handler at the bottom).

const player = new Player(scene, world);
const physics = new Physics(scene);

// Background music — starts when the world begins (pointer lock), loops.
// >>> Save your track at:  base/public/music.mp3  <<<
const music = new Audio('music.mp3');
music.loop = true;
music.volume = 0.45;
player.controls.addEventListener('lock', () => {
  if (music.paused) music.play().catch(() => {});
});

// Living creatures populate the world around the player.
const wildlife = new Wildlife(scene, world);

// Audio, player health, sniper rifle.
const audio = new GameAudio();
const playerStats = new PlayerStats((killer) => {
  player.position.set(0, 50, 0);
  player.velocity.set(0, 0, 0);
  if (mp && myProfile) mp.sendDown(myProfile.name, killer);
});
const weapon = new Weapon(scene, player, world, wildlife, audio);
wildlife.onPlayerHit = (d) => {
  playerStats.damage(d);
  audio.playerHurt();
};

// Unified hotbar: scroll wheel / 0-9 to switch pickaxe, blocks, and the rifle.
const hotbar = new Hotbar(player, weapon);

// Browsers require a user gesture before audio can start.
const resumeAudio = () => audio.resume();
document.addEventListener('keydown', resumeAudio, { once: true });
document.addEventListener('mousedown', resumeAudio, { once: true });

// Click the canvas to enter the world (lock the pointer) once onboarding is done.
renderer.domElement.addEventListener('click', () => {
  if (!window.__onboarding && !player.controls.isLocked) player.controls.lock();
});

// Debug hook (harmless): inspect/drive from the console.
window.__mc = { world, player, wildlife, scene, weapon, stats: playerStats };

// Online state (set after onboarding).
let mp = null;
let myProfile = null;
let posTimer = 0;

/** Apply a block edit received from another player (no echo back).
 *  e.cx/e.cz are the chunk's WORLD offset (already multiples of 32). */
function applyRemoteEdit(e) {
  world.__applyingRemote = true;
  world.dataStore.set(e.cx, e.cz, e.x, e.y, e.z, e.id);
  const wx = e.cx + e.x;
  const wz = e.cz + e.z;
  if (e.id === 0) world.removeBlock(wx, e.y, wz);
  else world.addBlock(wx, e.y, wz, e.id);
  world.__applyingRemote = false;
}

// Camera setup
const orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(24, 24, 24);
orbitCamera.layers.enable(1);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.update();
window.__mc.orbit = orbitCamera;
window.__mc.controls = controls;

// Post-processing: bloom makes lit windows, neon, and the sun glow.
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, player.camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.32, // strength — subtle glow, not a wash
  0.3,  // radius
  0.92  // threshold — only neon / lit windows / the sun bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const modelLoader = new ModelLoader((models) => {
  player.setTool(models.pickaxe);
})

let sun;
let ambient;
function setupLights() {
  sun = new THREE.DirectionalLight();
  sun.intensity = 1.5;
  sun.position.set(50, 50, 50);
  sun.castShadow = true;

  // Set the size of the sun's shadow box
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0001;
  sun.shadow.mapSize = new THREE.Vector2(2048, 2048);
  scene.add(sun);
  scene.add(sun.target);

  ambient = new THREE.AmbientLight();
  ambient.intensity = 0.2;
  scene.add(ambient);
}

// Render loop
let previousTime = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const dt = (currentTime - previousTime) / 1000;

  // Only update physics when player controls are locked
  if (player.controls.isLocked) {
    physics.update(dt, player, world);
    player.update(world);
    world.update(player);
    dayNight.update(dt, player.position);
    wildlife.update(dt, player, currentTime, dayNight.isNight);
    playerStats.update(dt);

    // Broadcast my position to other players ~10x/second.
    if (mp) {
      posTimer += dt;
      if (posTimer > 0.1) {
        posTimer = 0;
        mp.sendPos(player.position.x, player.position.y, player.position.z, player.camera.rotation.y);
      }
    }

    // Update position of the orbit camera to track player
    orbitCamera.position.copy(player.position).add(new THREE.Vector3(16, 16, 16));
    controls.target.copy(player.position);
  }

  // Weapon effects + animated water + remote avatars update every frame.
  weapon.update(dt);
  updateWater(currentTime / 1000);
  if (mp) mp.update(dt);

  renderPass.camera = player.controls.isLocked ? player.camera : orbitCamera;
  composer.render();
  stats.update();

  previousTime = currentTime;
}

window.addEventListener('resize', () => {
  // Resize camera aspect ratio and renderer size to the new window size
  orbitCamera.aspect = window.innerWidth / window.innerHeight;
  orbitCamera.updateProjectionMatrix();
  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

setupUI(world, player, physics, scene);
setupLights();
const dayNight = new DayNight(scene, sun, ambient);
window.__mc.dayNight = dayNight;
animate();

// Onboarding: pick name + photo, then drop straight into the shared online world.
const onboarding = new Onboarding(async (profile) => {
  window.__mc.profile = profile;
  myProfile = profile;
  mp = new Multiplayer(scene, profile);
  window.__mp = mp;

  // Shared world: load (or create) its seed + everyone's saved builds.
  const seed = await loadOrCreateWorldSeed();
  const persistence = new Persistence(world);
  await persistence.loadInto();
  world.params.seed = seed;

  // Every build/break is saved to Supabase AND broadcast to other players live.
  const origSet = world.dataStore.set.bind(world.dataStore);
  world.dataStore.set = (cx, cz, x, y, z, id) => {
    origSet(cx, cz, x, y, z, id);
    if (world.__applyingRemote) return;
    persistence.record(cx, cz, x, y, z, id);
    if (mp) mp.sendEdit({ cx, cz, x, y, z, id });
  };
  world.generate();

  mp.onRemoteEdit = (e) => applyRemoteEdit(e);
  mp.onDamaged = (dmg, from) => {
    playerStats.damage(dmg, from);
    audio.playerHurt();
  };
  mp.onPlayerDown = (p) => mp.feed('☠ ' + (p?.name || 'Player') + (p?.by ? '  ✕ ' + p.by : ''));
  weapon.multiplayer = mp;
  await mp.connect();

  player.position.set(0, 50, 0);
  player.velocity.set(0, 0, 0);

  const el = document.getElementById('status');
  if (el) {
    el.innerHTML = 'Clique para jogar — bem-vindo, ' + profile.name + '!';
    setTimeout(() => (el.innerHTML = ''), 4000);
  }
});
onboarding.open();