import './style.css';
import { createScene, getScene, getCamera, getRenderer, getPlayArea, getComposer, getOutlinePass, resize as sceneResize, dispose as sceneDispose } from './scene.js';
import { createShip, updateShip, disposeShip, getBulletSpawnOffset, getShipGroup, SHIP_Z_OFFSET, setShipColliderVisible, updateShipColliderPosition } from './ship.js';
import { initInput, getMouseNDC, getFireHeld, removeInputListeners } from './input.js';
import { getState, tick as simulationTick, resetState, setAsteroidsReadyFn, getNextSpawnBatchSize } from './simulation.js';
import { createStarfield, updateStarfield, disposeStarfield, setStarfieldResolution } from './starfield.js';
import { createBullets, syncBullets, disposeBullets } from './bullets.js';
import { createAsteroids, syncAsteroids, syncFragments, disposeAsteroids, isAsteroidsReady, setAsteroidCollidersVisible } from './asteroids.js';

let animationId;
let lastTime = 0;

let sfxVolume = 1;
let soundtrackVolume = 0.5;

const laserSounds = [
  new Audio('/sfx/laser1.wav'),
  new Audio('/sfx/laser2.wav'),
];
let laserSoundIndex = 0;

function playLaserSound() {
  ensureMusicStarted();
  const s = laserSounds[laserSoundIndex];
  s.volume = sfxVolume;
  s.currentTime = 0;
  s.play().catch(() => {});
  laserSoundIndex = 1 - laserSoundIndex;
}

const explosionSounds = [
  new Audio('/sfx/space_explosion.wav'),
  new Audio('/sfx/space_explosion2.wav'),
  new Audio('/sfx/space_explosion3.wav'),
];

function playShipExplosionSound() {
  const s = explosionSounds[Math.floor(Math.random() * explosionSounds.length)];
  s.volume = sfxVolume;
  s.currentTime = 0;
  s.play().catch(() => {});
}

const musicTracks = [
  new Audio('/track1.wav'),
  new Audio('/track2.wav'),
];
let musicTrackIndex = 0;
let musicStarted = false;
let musicListenersAdded = false;

function startNextMusicTrack() {
  const track = musicTracks[musicTrackIndex];
  track.volume = soundtrackVolume;
  track.currentTime = 0;
  track.play().catch(() => {});
  musicTrackIndex = 1 - musicTrackIndex;
}

function ensureMusicStarted() {
  if (!musicListenersAdded) {
    musicListenersAdded = true;
    musicTracks[0].addEventListener('ended', () => startNextMusicTrack());
    musicTracks[1].addEventListener('ended', () => startNextMusicTrack());
  }
  if (musicStarted) return;
  const track = musicTracks[musicTrackIndex];
  track.volume = soundtrackVolume;
  track.currentTime = 0;
  track.play().then(() => { musicStarted = true; }).catch(() => {});
}

const ASTEROID_EXPLOSION_URLS = [
  '/sfx/asteroid_explosion.wav',
  '/sfx/asteroid_explosion2.wav',
  '/sfx/asteroid_explosion3.wav',
];
let audioCtx = null;
let asteroidExplosionBuffers = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function loadAsteroidExplosionBuffers() {
  if (asteroidExplosionBuffers) return Promise.resolve(asteroidExplosionBuffers);
  const ctx = getAudioContext();
  return Promise.all(
    ASTEROID_EXPLOSION_URLS.map((url) =>
      fetch(url).then((r) => r.arrayBuffer()).then((buf) => ctx.decodeAudioData(buf))
    )
  ).then((buffers) => {
    asteroidExplosionBuffers = buffers;
    return buffers;
  });
}

function playAsteroidExplosionSound(x, y, z) {
  const ship = getState().ship;
  const listenerX = ship.x;
  const listenerY = ship.y;
  const listenerZ = SHIP_Z_OFFSET;
  loadAsteroidExplosionBuffers().then((buffers) => {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 20;
    panner.maxDistance = 400;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.setPosition(x, y, z);
    const listener = ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(listenerX, ctx.currentTime);
      listener.positionY.setValueAtTime(listenerY, ctx.currentTime);
      listener.positionZ.setValueAtTime(listenerZ, ctx.currentTime);
    } else {
      listener.setPosition(listenerX, listenerY, listenerZ);
    }
    const gainNode = ctx.createGain();
    gainNode.gain.value = sfxVolume;
    source.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  }).catch(() => {});
}

function showGameOver(show) {
  const el = document.getElementById('game-over');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  const state = getState();
  const scene = getScene();
  const camera = getCamera();
  const composer = getComposer();
  const outlinePass = getOutlinePass();

  function collectOutlineMeshes(obj, out) {
    if (obj.isMesh && obj.visible) {
      const mat = obj.material;
      const isWireframe = mat && (mat.wireframe || (Array.isArray(mat) && mat[0]?.wireframe));
      if (!isWireframe) out.push(obj);
    }
    obj.children.forEach((c) => collectOutlineMeshes(c, out));
  }

  if (state.gameOver) {
    showGameOver(true);
    if (scene && camera && outlinePass) {
      const meshes = [];
      scene.traverse((o) => collectOutlineMeshes(o, meshes));
      outlinePass.selectedObjects = meshes;
    }
    if (composer) composer.render(); else getRenderer()?.render(scene, camera);
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  const playArea = getPlayArea();
  const cameraZ = camera ? camera.position.z : 50;
  const mouseNDC = getMouseNDC();
  let targetX = state.ship.x;
  let targetY = state.ship.y;
  if (mouseNDC !== null) {
    const { left, right, top, bottom } = playArea;
    targetX = left + (mouseNDC.x + 1) / 2 * (right - left);
    targetY = bottom + (mouseNDC.y + 1) / 2 * (top - bottom);
  }

  const spawnPosition = getBulletSpawnOffset() ?? {
    x: state.ship.x,
    y: state.ship.y,
    z: SHIP_Z_OFFSET,
  };
  simulationTick(dt, { x: targetX, y: targetY }, getFireHeld(), playArea, spawnPosition, cameraZ, playLaserSound, playShipExplosionSound, playAsteroidExplosionSound);
  const newState = getState();

  const shipGroup = getShipGroup();
  if (shipGroup) shipGroup.visible = !newState.gameOver && !newState.shipExploding;

  updateShip(newState.ship);
  updateShipColliderPosition();
  updateStarfield(dt, camera?.position.z);
  syncBullets(newState.bullets);
  syncAsteroids(newState.asteroids);
  syncFragments(newState.fragments);

  const scoreEl = document.getElementById('score');
  if (scoreEl) scoreEl.textContent = `Asteroids: ${newState.score}`;
  const parsecsEl = document.getElementById('parsecs-display');
  if (parsecsEl) parsecsEl.textContent = `Parsecs: ${Math.floor(newState.totalParsecs)}`;

  const spawnIntervalEl = document.getElementById('dev-spawn-interval-value');
  if (spawnIntervalEl) spawnIntervalEl.textContent = newState.currentSpawnInterval.toFixed(2);
  const spawnBatchEl = document.getElementById('dev-spawn-batch-value');
  if (spawnBatchEl) spawnBatchEl.textContent = String(getNextSpawnBatchSize());

  if (scene && outlinePass) {
    const meshes = [];
    scene.traverse((o) => collectOutlineMeshes(o, meshes));
    outlinePass.selectedObjects = meshes;
  }
  if (composer) composer.render(); else getRenderer()?.render(scene, camera);

  animationId = requestAnimationFrame(gameLoop);
}

function onResize() {
  const container = document.getElementById('app');
  if (container) {
    sceneResize(container);
    setStarfieldResolution(container.clientWidth, container.clientHeight);
  }
}

function init() {
  const container = document.getElementById('app');
  if (!container) return;

  const { scene, camera, renderer } = createScene(container);
  createShip(scene);
  createStarfield(scene);
  createBullets(scene);
  createAsteroids(scene);
  setAsteroidsReadyFn(isAsteroidsReady);
  initInput(renderer.domElement);

  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      resetState();
      showGameOver(false);
      document.body.style.cursor = 'none';
    });
  }

  if (import.meta.env.DEV) {
    setShipColliderVisible(false);
    setAsteroidCollidersVisible(false);
    const panel = document.createElement('div');
    panel.className = 'dev-panel';
    panel.innerHTML = `
      <div class="dev-panel-title">Dev</div>
      <label class="dev-panel-row">
        <input type="checkbox" id="dev-ship-collider" />
        Ship collider
      </label>
      <label class="dev-panel-row">
        <input type="checkbox" id="dev-asteroid-colliders" />
        Asteroid colliders
      </label>
      <div class="dev-panel-row dev-panel-row-exposure">
        <label for="dev-exposure" class="dev-panel-label">Exposure</label>
        <input type="range" id="dev-exposure" min="0.25" max="2" step="0.05" value="0.5" />
        <span id="dev-exposure-value" class="dev-panel-value">0.50</span>
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <label for="dev-sfx-volume" class="dev-panel-label">SFX volume</label>
        <input type="range" id="dev-sfx-volume" min="0" max="1" step="0.05" value="1" />
        <span id="dev-sfx-volume-value" class="dev-panel-value">1.00</span>
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <label for="dev-soundtrack-volume" class="dev-panel-label">Soundtrack</label>
        <input type="range" id="dev-soundtrack-volume" min="0" max="1" step="0.05" value="0.5" />
        <span id="dev-soundtrack-volume-value" class="dev-panel-value">0.50</span>
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <span class="dev-panel-label">Spawn interval</span>
        <span id="dev-spawn-interval-value" class="dev-panel-value">1.50</span> s
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <span class="dev-panel-label">Next batch</span>
        <span id="dev-spawn-batch-value" class="dev-panel-value">1</span>
      </div>
    `;
    document.body.appendChild(panel);
    const shipCb = document.getElementById('dev-ship-collider');
    const asteroidCb = document.getElementById('dev-asteroid-colliders');
    shipCb.addEventListener('change', () => setShipColliderVisible(shipCb.checked));
    asteroidCb.addEventListener('change', () => setAsteroidCollidersVisible(asteroidCb.checked));
    const exposureInput = document.getElementById('dev-exposure');
    const exposureValue = document.getElementById('dev-exposure-value');
    exposureInput.addEventListener('input', () => {
      const v = parseFloat(exposureInput.value);
      exposureValue.textContent = v.toFixed(2);
      const r = getRenderer();
      if (r) r.toneMappingExposure = v;
    });
    const sfxVolumeInput = document.getElementById('dev-sfx-volume');
    const sfxVolumeValue = document.getElementById('dev-sfx-volume-value');
    sfxVolumeInput.addEventListener('input', () => {
      sfxVolume = parseFloat(sfxVolumeInput.value);
      sfxVolumeValue.textContent = sfxVolume.toFixed(2);
      laserSounds.forEach((s) => { s.volume = sfxVolume; });
      explosionSounds.forEach((s) => { s.volume = sfxVolume; });
    });
    const soundtrackVolumeInput = document.getElementById('dev-soundtrack-volume');
    const soundtrackVolumeValue = document.getElementById('dev-soundtrack-volume-value');
    soundtrackVolumeInput.addEventListener('input', () => {
      soundtrackVolume = parseFloat(soundtrackVolumeInput.value);
      soundtrackVolumeValue.textContent = soundtrackVolume.toFixed(2);
      musicTracks.forEach((t) => { t.volume = soundtrackVolume; });
    });
  }

  window.addEventListener('resize', onResize);
  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
  ensureMusicStarted();
}

function dispose() {
  musicTracks.forEach((t) => { t.pause(); t.currentTime = 0; });
  if (animationId != null) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  removeInputListeners(getRenderer()?.domElement);
  disposeShip();
  disposeStarfield();
  disposeBullets();
  disposeAsteroids();
  sceneDispose();
}

init();
window.addEventListener('beforeunload', dispose);
