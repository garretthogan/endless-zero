import './style.css';
import { createScene, getScene, getCamera, getRenderer, getPlayArea, getComposer, getOutlinePass, resize as sceneResize, dispose as sceneDispose } from './scene.js';
import { createShip, updateShip, disposeShip, getBulletSpawnOffset, getShipGroup, SHIP_Z_OFFSET, setShipColliderVisible, updateShipColliderPosition, setShieldVisible } from './ship.js';
import { initInput, getTargetWorldPosition, getFireHeld, removeInputListeners } from './input.js';
import {
  ACTION_CHAIN_DURATION,
  MAX_HULL,
  getState,
  tick as simulationTick,
  resetState,
  setAsteroidsReadyFn,
  getNextSpawnBatchSize,
  getMaxBullets,
} from './simulation.js';
import { createStarfield, updateStarfield, disposeStarfield, setStarfieldResolution } from './starfield.js';
import { createBullets, syncBullets, disposeBullets } from './bullets.js';
import { createAsteroids, syncAsteroids, syncFragments, disposeAsteroids, isAsteroidsReady, setAsteroidCollidersVisible } from './asteroids.js';
import { createHoops, syncHoops, disposeHoops } from './hoops.js';
import { createFireworks, syncFireworkParticles, disposeFireworks } from './fireworks.js';
import { createPowerUps, syncPowerUps, disposePowerUps } from './powerups.js';

let animationId;
let lastTime = 0;
let gameStarted = false;
let gamePaused = false;
let escapeKeyHandler = null;

let hudFireRequested = false;
const MOBILE_AUTO_FIRE_MAX_Z_AHEAD = 240;
const MOBILE_AUTO_FIRE_PATH_PADDING = 1.25;
const ACTION_TOAST_DURATION_MS = 1400;
const BEST_SCORE_STORAGE_KEY = 'endless-zero-best-score';

const ui = {};
let bestScore = 0;
let runSummaryUpdated = false;
let lastActionId = null;
let actionToastTimer = null;

const baseUrl = import.meta.env.BASE_URL;

let sfxVolume = 0.55;
let soundtrackVolume = 0.25;

const laserSounds = [
  new Audio(baseUrl + 'sfx/laser1.wav'),
  new Audio(baseUrl + 'sfx/laser2.wav'),
];
let laserSoundIndex = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function whenAudioReady() {
  const allAudio = [...laserSounds, ...explosionSounds, hoopSound, invincibilitySound, twinFireSound, ...musicTracks];
  return Promise.all(
    allAudio.map(
      (audio) =>
        new Promise((resolve, reject) => {
          if (audio.readyState >= 3) {
            resolve();
            return;
          }
          audio.addEventListener('canplaythrough', () => resolve(), { once: true });
          audio.addEventListener('error', (e) => reject(e), { once: true });
        })
    )
  );
}

/** On iOS/touch devices, canplaythrough often never fires until after user tap. Race with timeout so we don't hang. */
const AUDIO_READY_TIMEOUT_MS = 5000;

function whenAudioReadyOrTimeout() {
  return Promise.race([whenAudioReady(), delay(AUDIO_READY_TIMEOUT_MS)]);
}

/** Safety: never block the UI longer than this, even if something fails to resolve. */
const LOAD_SAFETY_TIMEOUT_MS = 15000;

function playLaserSound() {
  ensureMusicStarted();
  const s = laserSounds[laserSoundIndex];
  s.volume = sfxVolume;
  s.currentTime = 0;
  s.play().catch(() => {});
  laserSoundIndex = 1 - laserSoundIndex;
}

const explosionSounds = [
  new Audio(baseUrl + 'sfx/space_explosion.wav'),
  new Audio(baseUrl + 'sfx/space_explosion2.wav'),
  new Audio(baseUrl + 'sfx/space_explosion3.wav'),
];

const hoopSound = new Audio(baseUrl + 'sfx/hoop.wav');
const invincibilitySound = new Audio(baseUrl + 'sfx/invincibility.wav');
const twinFireSound = new Audio(baseUrl + 'sfx/twinfire.wav');

function playHoopSound() {
  ensureMusicStarted();
  hoopSound.volume = sfxVolume;
  hoopSound.currentTime = 0;
  hoopSound.play().catch(() => {});
}

function playInvincibilitySound() {
  ensureMusicStarted();
  invincibilitySound.volume = sfxVolume;
  invincibilitySound.currentTime = 0;
  invincibilitySound.play().catch(() => {});
}

function playTwinFireSound() {
  ensureMusicStarted();
  twinFireSound.volume = sfxVolume;
  twinFireSound.currentTime = 0;
  twinFireSound.play().catch(() => {});
}

function playShipExplosionSound() {
  const s = explosionSounds[Math.floor(Math.random() * explosionSounds.length)];
  s.volume = sfxVolume;
  s.currentTime = 0;
  s.play().catch(() => {});
}

function shouldAutoFireOnMobile(state, spawnPosition) {
  if (!state || !spawnPosition) return false;
  if (state.shipExploding || state.gameOver) return false;
  if (!Array.isArray(state.asteroids) || state.asteroids.length === 0) return false;
  const spawnZ = typeof spawnPosition.z === 'number' ? spawnPosition.z : SHIP_Z_OFFSET;
  for (const asteroid of state.asteroids) {
    if (!asteroid) continue;
    const dzAhead = spawnZ - asteroid.z;
    if (dzAhead <= 0 || dzAhead > MOBILE_AUTO_FIRE_MAX_Z_AHEAD) continue;
    const lateralDist = Math.hypot(asteroid.x - spawnPosition.x, asteroid.y - spawnPosition.y);
    const laneRadius = (asteroid.radius ?? 0) + MOBILE_AUTO_FIRE_PATH_PADDING;
    if (lateralDist <= laneRadius) return true;
  }
  return false;
}

function updateBulletDots(maxBullets, bulletCount) {
  const dotsContainer = ui.bulletDots ?? document.getElementById('bullet-dots');
  if (!dotsContainer) return;
  if (dotsContainer.children.length !== maxBullets) {
    dotsContainer.textContent = '';
    for (let i = 0; i < maxBullets; i++) {
      const dot = document.createElement('span');
      dot.className = 'bullet-dot';
      dotsContainer.appendChild(dot);
    }
  }
  const available = Math.max(0, maxBullets - bulletCount);
  const isTouch = document.body.classList.contains('touch-device');
  setAttributeValue(
    ui.bulletFill,
    'aria-label',
    isTouch
      ? `Fire now; auto-fire active; ${available} of ${maxBullets} shots ready`
      : `Fire; ${available} of ${maxBullets} shots ready`
  );
  for (let i = 0; i < dotsContainer.children.length; i++) {
    const dot = dotsContainer.children[i];
    dot.classList.toggle('available', i < available);
    dot.classList.toggle('spent', i >= available);
  }
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setAttributeValue(element, name, value) {
  if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function readBestScore() {
  try {
    const value = Number.parseInt(window.localStorage.getItem(BEST_SCORE_STORAGE_KEY) ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(value));
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

function cacheUiElements() {
  ui.bulletFill = document.getElementById('bullet-fill');
  ui.bulletDots = document.getElementById('bullet-dots');
  ui.score = document.getElementById('score');
  ui.parsecs = document.getElementById('parsecs-display');
  ui.sector = document.getElementById('sector-display');
  ui.hull = document.getElementById('hull-display');
  ui.hullPips = Array.from(document.querySelectorAll('.hull-pip'));
  ui.chain = document.getElementById('chain-display');
  ui.chainMode = document.getElementById('chain-mode');
  ui.chainCount = document.getElementById('chain-count');
  ui.multiplier = document.getElementById('multiplier-display');
  ui.chainMeter = document.getElementById('chain-meter');
  ui.chainMeterFill = document.getElementById('chain-meter-fill');
  ui.powerupTimer = document.getElementById('powerup-timer');
  ui.actionToast = document.getElementById('action-toast');
  ui.gameOver = document.getElementById('game-over');
  ui.restart = document.getElementById('restart-btn');
  ui.summaryReason = document.getElementById('run-summary-reason');
  ui.summaryScore = document.getElementById('summary-score');
  ui.summaryBestScore = document.getElementById('summary-best-score');
  ui.summaryParsecs = document.getElementById('summary-parsecs');
  ui.summaryBestChain = document.getElementById('summary-best-chain');
  ui.summaryAsteroids = document.getElementById('summary-asteroids');
  ui.summaryHoops = document.getElementById('summary-hoops');
  ui.summaryNearMisses = document.getElementById('summary-near-misses');
  setAttributeValue(ui.chainMeter, 'aria-valuemax', String(ACTION_CHAIN_DURATION));
  bestScore = readBestScore();
}

function formatMultiplier(multiplier) {
  return Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
}

function showActionToast(action) {
  if (!action || action.id == null || action.id === lastActionId) return;
  lastActionId = action.id;
  if (!ui.actionToast) return;

  const label = action.label || 'Chain extended';
  const points = Math.max(0, Number(action.points) || 0);
  const multiplier = Math.max(1, Number(action.multiplier) || 1);
  const pointsText = points > 0 ? ` +${Math.floor(points)}` : '';
  const multiplierText = points > 0 && multiplier > 1 ? ` · ×${formatMultiplier(multiplier)}` : '';
  setText(ui.actionToast, `${label}${pointsText}${multiplierText}`);
  ui.actionToast.classList.add('visible');

  if (actionToastTimer != null) window.clearTimeout(actionToastTimer);
  actionToastTimer = window.setTimeout(() => {
    ui.actionToast?.classList.remove('visible');
    actionToastTimer = null;
  }, ACTION_TOAST_DURATION_MS);
}

function updateHud(state) {
  const hull = Math.max(0, Math.min(MAX_HULL, Math.floor(Number(state.hull) || 0)));
  const sector = Math.max(1, Math.floor(Number(state.sector) || 1));
  const comboCount = Math.max(0, Math.floor(Number(state.comboCount) || 0));
  const multiplier = Math.max(1, Number(state.multiplier) || 1);
  const comboTimer = Math.max(0, Math.min(ACTION_CHAIN_DURATION, Number(state.comboTimer) || 0));
  const overdrive = Boolean(state.overdrive);

  setText(ui.score, `Score: ${Math.floor(Number(state.score) || 0)}`);
  setText(ui.parsecs, `Parsecs: ${Math.floor(Number(state.totalParsecs) || 0)}`);
  setText(ui.sector, `Sector: ${sector}`);
  if (ui.hull) {
    setAttributeValue(ui.hull, 'aria-label', `Hull ${hull} of ${MAX_HULL}`);
    ui.hull.classList.toggle('critical', hull === 1);
  }
  ui.hullPips?.forEach((pip, index) => pip.classList.toggle('empty', index >= hull));

  setText(ui.chainMode, overdrive ? 'Overdrive' : 'Chain');
  setText(ui.chainCount, String(comboCount));
  setText(ui.multiplier, `×${formatMultiplier(multiplier)}`);
  ui.chain?.classList.toggle('active', comboCount > 0);
  ui.chain?.classList.toggle('overdrive', overdrive);
  setAttributeValue(ui.chain, 'aria-label', `${overdrive ? 'Overdrive' : 'Chain'} ${comboCount}, multiplier ${formatMultiplier(multiplier)}`);
  setAttributeValue(ui.chainMeter, 'aria-valuenow', comboTimer.toFixed(1));
  if (ui.chainMeterFill) {
    const width = `${(comboTimer / ACTION_CHAIN_DURATION) * 100}%`;
    if (ui.chainMeterFill.style.width !== width) ui.chainMeterFill.style.width = width;
  }

  if (ui.powerupTimer) {
    const active = [];
    if (state.shieldTimer > 0) active.push(`Shield: ${state.shieldTimer.toFixed(1)}s`);
    if (state.homingTimer > 0) active.push(`Homing: ${state.homingTimer.toFixed(1)}s`);
    if (active.length > 0) {
      setText(ui.powerupTimer, active.join('  ·  '));
      if (ui.powerupTimer.style.display !== 'block') ui.powerupTimer.style.display = 'block';
    } else {
      setText(ui.powerupTimer, '');
      if (ui.powerupTimer.style.display !== 'none') ui.powerupTimer.style.display = 'none';
    }
  }

  showActionToast(state.lastAction);
}

function resetRunPresentation() {
  runSummaryUpdated = false;
  lastActionId = null;
  if (actionToastTimer != null) {
    window.clearTimeout(actionToastTimer);
    actionToastTimer = null;
  }
  ui.actionToast?.classList.remove('visible');
  setText(ui.actionToast, '');
}

function updateRunSummary(state) {
  if (runSummaryUpdated) return;
  runSummaryUpdated = true;
  if (actionToastTimer != null) {
    window.clearTimeout(actionToastTimer);
    actionToastTimer = null;
  }
  ui.actionToast?.classList.remove('visible');

  const score = Math.max(0, Math.floor(Number(state.score) || 0));
  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
  }

  const sector = Math.max(1, Math.floor(Number(state.sector) || 1));
  setText(ui.summaryReason, `Hull depleted in Sector ${sector}.`);
  setText(ui.summaryScore, String(score));
  setText(ui.summaryBestScore, String(bestScore));
  setText(ui.summaryParsecs, String(Math.floor(Number(state.totalParsecs) || 0)));
  setText(ui.summaryBestChain, String(Math.max(0, Math.floor(Number(state.bestCombo) || 0))));
  setText(ui.summaryAsteroids, String(Math.max(0, Math.floor(Number(state.asteroidsDestroyed) || 0))));
  setText(ui.summaryHoops, String(Math.max(0, Math.floor(Number(state.hoopsPassed) || 0))));
  setText(ui.summaryNearMisses, String(Math.max(0, Math.floor(Number(state.nearMisses) || 0))));
}

const musicTracks = [
  new Audio(baseUrl + 'track1.wav'),
  new Audio(baseUrl + 'track2.wav'),
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

/**
 * On iOS/mobile, HTML Audio and Web Audio must be "unlocked" during a user gesture.
 * Call this when the user taps Start so laser, explosion, and asteroid SFX can play later.
 */
function unlockSfxForMobile() {
  getAudioContext();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const allSfx = [...laserSounds, ...explosionSounds, hoopSound, invincibilitySound, twinFireSound];
  allSfx.forEach((audio) => {
    const prevVolume = audio.volume;
    audio.volume = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prevVolume;
      }).catch(() => {
        audio.volume = prevVolume;
      });
    } else {
      audio.volume = prevVolume;
    }
  });
}

const ASTEROID_EXPLOSION_URLS = [
  baseUrl + 'sfx/asteroid_explosion.wav',
  baseUrl + 'sfx/asteroid_explosion2.wav',
  baseUrl + 'sfx/asteroid_explosion3.wav',
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
  const el = ui.gameOver ?? document.getElementById('game-over');
  const display = show ? 'flex' : 'none';
  if (!el || el.style.display === display) return;
  el.style.display = display;
  if (show) {
    window.requestAnimationFrame(() => {
      (ui.restart ?? document.getElementById('restart-btn'))?.focus({ preventScroll: true });
    });
  } else if (el.contains(document.activeElement)) {
    ui.bulletFill?.focus({ preventScroll: true });
  }
}

function showPauseMenu(show) {
  const el = document.getElementById('pause-menu');
  if (el) el.style.display = show ? 'flex' : 'none';
  if (show) document.body.style.cursor = '';
}

function setPaused(paused) {
  if (gamePaused === paused) return;
  gamePaused = paused;
  showPauseMenu(paused);
  if (!paused) document.body.style.cursor = 'none';
}

function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  const scene = getScene();
  const camera = getCamera();
  const composer = getComposer();

  if (!gameStarted) {
    updateStarfield(dt, camera?.position.z);
    if (composer) composer.render();
    else getRenderer()?.render(scene, camera);
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  if (gamePaused) {
    if (composer) composer.render();
    else getRenderer()?.render(scene, camera);
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  const state = getState();
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
    updateHud(state);
    updateRunSummary(state);
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

  const playArea = getPlayArea(SHIP_Z_OFFSET);
  const cameraZ = camera ? camera.position.z : 50;
  const targetWorld = getTargetWorldPosition(playArea, state.ship.x, state.ship.y);
  let targetX = state.ship.x;
  let targetY = state.ship.y;
  if (targetWorld !== null) {
    targetX = targetWorld.x;
    targetY = targetWorld.y;
  }

  const spawnPosition = getBulletSpawnOffset() ?? {
    x: state.ship.x,
    y: state.ship.y,
    z: SHIP_Z_OFFSET,
  };
  const isTouch = document.body.classList.contains('touch-device');
  const mobileAutoFire = isTouch && shouldAutoFireOnMobile(state, spawnPosition);
  const fire = isTouch
    ? (hudFireRequested || mobileAutoFire) && state.bullets.length < getMaxBullets()
    : hudFireRequested || getFireHeld();
  hudFireRequested = false;
  simulationTick(dt, { x: targetX, y: targetY }, fire, playArea, spawnPosition, cameraZ, playLaserSound, playShipExplosionSound, playAsteroidExplosionSound, playHoopSound, playInvincibilitySound, playTwinFireSound);
  const newState = getState();

  const shipGroup = getShipGroup();
  if (shipGroup) {
    const invulnerabilityTimer = Math.max(0, Number(newState.invulnerabilityTimer) || 0);
    const blinkVisible = invulnerabilityTimer <= 0 || Math.floor(invulnerabilityTimer * 12) % 2 === 0;
    shipGroup.visible = !newState.gameOver && !newState.shipExploding && blinkVisible;
  }

  updateShip(newState.ship);
  updateShipColliderPosition();
  setShieldVisible(newState.shieldTimer > 0 && !newState.gameOver && !newState.shipExploding);
  updateStarfield(dt, camera?.position.z);
  syncBullets(newState.bullets);
  syncAsteroids(newState.asteroids);
  syncHoops(newState.hoops);
  syncPowerUps(newState.powerUps);
  syncFireworkParticles(newState.fireworkParticles);
  syncFragments(newState.fragments);

  const maxBullets = getMaxBullets();
  updateBulletDots(maxBullets, newState.bullets.length);
  updateHud(newState);

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

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.add('loaded');
}

function showMainMenu() {
  const el = document.getElementById('main-menu');
  if (el) {
    el.style.display = 'flex';
    el.classList.remove('hidden');
  }
  document.body.classList.add('menu-visible');
}

function hideMainMenu() {
  const el = document.getElementById('main-menu');
  if (el) {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
  document.body.classList.remove('menu-visible');
}

function startGame(renderer) {
  gameStarted = true;
  resetRunPresentation();
  updateHud(getState());
  onResize();
  requestAnimationFrame(() => onResize());
  unlockSfxForMobile();
  whenAudioReadyOrTimeout().catch(() => {});
  loadAsteroidExplosionBuffers().catch(() => {});
  initInput(renderer.domElement);
  hideMainMenu();

  const bulletFillEl = document.getElementById('bullet-fill');
  if (bulletFillEl) {
    bulletFillEl.addEventListener('click', (e) => {
      if (getState().gameOver || gamePaused) return;
      e.preventDefault();
      e.stopPropagation();
      hudFireRequested = true;
    });
  }

  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      resetState();
      resetRunPresentation();
      updateHud(getState());
      updateBulletDots(getMaxBullets(), 0);
      hudFireRequested = false;
      showGameOver(false);
      document.body.style.cursor = 'none';
    });
  }

  const resumeBtn = document.getElementById('resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => setPaused(false));
  }

  escapeKeyHandler = (e) => {
    if (e.code !== 'Escape') return;
    if (getState().gameOver) return;
    e.preventDefault();
    setPaused(!gamePaused);
  };
  window.addEventListener('keydown', escapeKeyHandler);

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
        <input type="range" id="dev-exposure" min="0.25" max="2" step="0.05" value="0.85" />
        <span id="dev-exposure-value" class="dev-panel-value">0.85</span>
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <label for="dev-sfx-volume" class="dev-panel-label">SFX volume</label>
        <input type="range" id="dev-sfx-volume" min="0" max="1" step="0.05" value="0.55" />
        <span id="dev-sfx-volume-value" class="dev-panel-value">0.55</span>
      </div>
      <div class="dev-panel-row dev-panel-row-exposure">
        <label for="dev-soundtrack-volume" class="dev-panel-label">Soundtrack</label>
        <input type="range" id="dev-soundtrack-volume" min="0" max="1" step="0.05" value="0.25" />
        <span id="dev-soundtrack-volume-value" class="dev-panel-value">0.25</span>
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
      hoopSound.volume = sfxVolume;
      invincibilitySound.volume = sfxVolume;
      twinFireSound.volume = sfxVolume;
    });
    const soundtrackVolumeInput = document.getElementById('dev-soundtrack-volume');
    const soundtrackVolumeValue = document.getElementById('dev-soundtrack-volume-value');
    soundtrackVolumeInput.addEventListener('input', () => {
      soundtrackVolume = parseFloat(soundtrackVolumeInput.value);
      soundtrackVolumeValue.textContent = soundtrackVolume.toFixed(2);
      musicTracks.forEach((t) => { t.volume = soundtrackVolume; });
    });
  }

  ensureMusicStarted();
}

function isFullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen);
}

function isFullscreen() {
  return !!(document.fullscreenElement ?? document.webkitFullscreenElement ?? document.mozFullScreenElement ?? document.msFullscreenElement);
}

function updateFullscreenIcon() {
  const expandEl = document.querySelector('.fullscreen-icon-expand');
  const exitEl = document.querySelector('.fullscreen-icon-exit');
  if (!expandEl || !exitEl) return;
  const full = isFullscreen();
  expandEl.style.display = full ? 'none' : 'block';
  exitEl.style.display = full ? 'block' : 'none';
}

function exitFullscreen() {
  const doc = document;
  (doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen)?.call(doc);
}

function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) {
    req.call(el).catch(() => {});
  }
}

function toggleFullscreen() {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function initFullscreenButton() {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  if (!isFullscreenSupported()) {
    btn.style.display = 'none';
    return;
  }

  const onFullscreenChange = () => updateFullscreenIcon();
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('mozfullscreenchange', onFullscreenChange);
  document.addEventListener('MSFullscreenChange', onFullscreenChange);

  function handleFullscreenTap(e) {
    e.preventDefault();
    toggleFullscreen();
  }

  btn.addEventListener('pointerup', handleFullscreenTap);

  updateFullscreenIcon();
}

function init() {
  const container = document.getElementById('app');
  if (!container) return;

  cacheUiElements();
  initFullscreenButton();

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
    ui.bulletFill?.setAttribute('aria-label', 'Fire now; auto-fire active');
    ui.bulletFill?.setAttribute('title', 'Auto-fire; tap to fire');
  }

  const { scene, camera, renderer } = createScene(container);
  const shipLoadPromise = createShip(scene);
  createStarfield(scene);
  createBullets(scene);
  const { loadPromise: asteroidsLoadPromise } = createAsteroids(scene);
  createHoops(scene);
  createPowerUps(scene);
  createFireworks(scene);
  setAsteroidsReadyFn(isAsteroidsReady);

  const loadPromises = Promise.all([
    shipLoadPromise,
    asteroidsLoadPromise,
  ]);

  Promise.race([loadPromises, delay(LOAD_SAFETY_TIMEOUT_MS)])
    .then(() => {
      hideLoading();
      showMainMenu();

      window.addEventListener('resize', onResize);
      onResize();
      requestAnimationFrame(() => onResize());

      lastTime = performance.now();
      animationId = requestAnimationFrame(gameLoop);

      const startBtn = document.getElementById('start-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => startGame(renderer), { once: true });
      }
    })
    .catch((err) => {
      console.error('Load error:', err);
      hideLoading();
      showMainMenu();
      window.addEventListener('resize', onResize);
      onResize();
      requestAnimationFrame(() => onResize());
      lastTime = performance.now();
      animationId = requestAnimationFrame(gameLoop);
      const startBtn = document.getElementById('start-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => startGame(renderer), { once: true });
      }
    });
}

function dispose() {
  if (actionToastTimer != null) {
    window.clearTimeout(actionToastTimer);
    actionToastTimer = null;
  }
  if (escapeKeyHandler) {
    window.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }
  musicTracks.forEach((t) => { t.pause(); t.currentTime = 0; });
  if (animationId != null) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  removeInputListeners(getRenderer()?.domElement);
  disposeShip();
  disposeStarfield();
  disposeBullets();
  disposeAsteroids();
  disposeHoops();
  disposePowerUps();
  disposeFireworks();
  sceneDispose();
}

init();
window.addEventListener('beforeunload', dispose);
