import {
  SHIP_HIT_RADIUS,
  SHIP_BOUNDARY_RADIUS,
  SHIP_Y_OFFSET,
  SHIP_MAX_SPEED,
  SHIP_SLOWING_RADIUS,
  SHIP_STEER_GAIN,
  SHIP_EXPLODE_FRAGMENTS_MIN,
  SHIP_EXPLODE_FRAGMENTS_MAX,
  SHIP_EXPLODE_SPEED,
  SHIP_EXPLODE_LIFETIME,
  SHIP_EXPLODE_DURATION,
  getShipColliderCenterForLogicalPosition,
} from './ship.js';
import { BULLET_RADIUS, BULLET_SPEED, BULLET_MAX_DIST, FIRE_INTERVAL } from './bullets.js';
import {
  ASTEROID_SPEED,
  ASTEROID_SPAWN_Z,
  ASTEROID_RADIUS_MAX,
  ASTEROID_SPAWN_INTERVAL,
  ASTEROID_MAX,
  ASTEROID_MAX_CAP,
  ASTEROID_SIZE_TIERS,
  ASTEROID_BATCH_Z_SPACING,
} from './asteroids.js';
import {
  HOOP_SPEED,
  HOOP_SPAWN_Z,
  HOOP_SPAWN_INTERVAL,
  HOOP_MAX,
  HOOP_POINTS,
  HOOP_RADIUS,
  HOOP_SPAWN_RADIUS,
  HOOP_MIN_DIST_FROM_ASTEROID_XY,
  HOOP_MIN_DIST_FROM_ASTEROID_Z,
} from './hoops.js';
import {
  POWERUP_SPAWN_CHANCE,
  POWERUP_RADIUS,
  SHIELD_DURATION,
  HOMING_DURATION,
  POWERUP_SPEED,
} from './powerups.js';

const HOMING_CONE_ANGLE = (20 * Math.PI) / 180;
const HOMING_CONE_COS = Math.cos(HOMING_CONE_ANGLE);

const FRAGMENT_COUNT_MIN = 3;
const FRAGMENT_COUNT_MAX = 6;
const FRAGMENT_SPEED = 50;
const FRAGMENT_LIFETIME = 0.7;

const FIREWORK_COLORS = [0xffff00, 0xffaa00, 0xff6600, 0xffffff, 0x22d3ee];
const FIREWORK_PARTICLE_COUNT = 48;
const FIREWORK_SPEED_MIN = 35;
const FIREWORK_SPEED_MAX = 75;
const FIREWORK_LIFETIME = 0.9;

const PARSECS_PER_SECOND = 2.5;
const PARSECS_PER_SECTOR = 50;
const INITIAL_ASTEROID_SPAWN_DELAY = 2.5;
const SECTOR_SPAWN_INTERVAL_FLOOR = 1.25;
const SECTOR_SPAWN_INTERVAL_SCALE = 0.88;
const SECTORS_PER_BATCH_INCREASE = 3;
const MAX_ASTEROID_BATCH_SIZE = 4;
const EARLY_SMALL_BATCH_COUNT = 2;
const EARLY_START_LANE_PADDING = 3;

export const MAX_HULL = 3;
const HIT_INVULNERABILITY_DURATION = 1.25;
const NORMAL_BULLET_CAPACITY = 3;
const OVERDRIVE_BULLET_CAPACITY = 6;
const OVERDRIVE_COMBO_THRESHOLD = 10;
const OVERDRIVE_FIRE_INTERVAL = 0.16;
const OVERDRIVE_SHOT_OFFSET = 0.7;

export const ACTION_CHAIN_DURATION = 5;
const NEAR_MISS_MARGIN = 3.5;
const NEAR_MISS_POINTS = 5;
const POWERUP_PITY_KILLS = 5;

let nextAsteroidId = 0;
let nextHoopId = 0;
let nextPowerUpId = 0;
let nextActionId = 1;
let isAsteroidsReady = () => false;

const state = {
  ship: { x: 0, y: 0, vx: 0, vy: 0 },
  bullets: [],
  asteroids: [],
  hoops: [],
  powerUps: [],
  fireworkParticles: [],
  fragments: [],
  fireCooldown: 0,
  spawnTimer: INITIAL_ASTEROID_SPAWN_DELAY,
  hoopSpawnTimer: 0,
  currentSpawnInterval: ASTEROID_SPAWN_INTERVAL,
  spawnCount: 0,
  gameOver: false,
  shipExploding: false,
  shipExplodeTimer: 0,
  shieldTimer: 0,
  homingTimer: 0,
  invulnerabilityTimer: 0,
  score: 0,
  totalParsecs: 0,
  sector: 1,
  hull: MAX_HULL,
  maxHull: MAX_HULL,
  hitsTaken: 0,
  asteroidsDestroyed: 0,
  hoopsPassed: 0,
  nearMisses: 0,
  comboCount: 0,
  comboTimer: 0,
  multiplier: 1,
  bestCombo: 0,
  overdrive: false,
  lastAction: null,
  killsSincePowerUp: 0,
};

export function getState() {
  return state;
}

export function getMaxBullets() {
  return state.overdrive ? OVERDRIVE_BULLET_CAPACITY : NORMAL_BULLET_CAPACITY;
}

function spawnFragmentsAt(x, y, z) {
  const n = FRAGMENT_COUNT_MIN + Math.floor(Math.random() * (FRAGMENT_COUNT_MAX - FRAGMENT_COUNT_MIN + 1));
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.6;
    const speed = FRAGMENT_SPEED * (0.6 + Math.random() * 0.8);
    state.fragments.push({
      x,
      y,
      z,
      vx: Math.cos(pitch) * Math.cos(angle) * speed,
      vy: Math.sin(pitch) * speed,
      vz: Math.cos(pitch) * Math.sin(angle) * speed,
      lifetime: FRAGMENT_LIFETIME * (0.8 + Math.random() * 0.4),
    });
  }
}

function spawnShipExplosionFragmentsAt(x, y, z) {
  const n = SHIP_EXPLODE_FRAGMENTS_MIN + Math.floor(Math.random() * (SHIP_EXPLODE_FRAGMENTS_MAX - SHIP_EXPLODE_FRAGMENTS_MIN + 1));
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.8;
    const speed = SHIP_EXPLODE_SPEED * (0.5 + Math.random() * 0.8);
    state.fragments.push({
      x,
      y,
      z,
      vx: Math.cos(pitch) * Math.cos(angle) * speed,
      vy: Math.sin(pitch) * speed,
      vz: Math.cos(pitch) * Math.sin(angle) * speed,
      lifetime: SHIP_EXPLODE_LIFETIME * (0.8 + Math.random() * 0.4),
    });
  }
}

function spawnFireworkBurstAt(x, y, z) {
  for (let i = 0; i < FIREWORK_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = FIREWORK_SPEED_MIN + Math.random() * (FIREWORK_SPEED_MAX - FIREWORK_SPEED_MIN);
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    state.fireworkParticles.push({
      x,
      y,
      z,
      vx: Math.cos(pitch) * Math.cos(angle) * speed,
      vy: Math.sin(pitch) * speed,
      vz: Math.cos(pitch) * Math.sin(angle) * speed,
      lifetime: FIREWORK_LIFETIME * (0.85 + Math.random() * 0.3),
      color,
    });
  }
}

function updateFragments(dt) {
  for (let i = state.fragments.length - 1; i >= 0; i--) {
    const fragment = state.fragments[i];
    fragment.x += fragment.vx * dt;
    fragment.y += fragment.vy * dt;
    fragment.z += fragment.vz * dt;
    fragment.lifetime -= dt;
    if (fragment.lifetime <= 0) state.fragments.splice(i, 1);
  }
}

function updateFireworks(dt) {
  for (let i = state.fireworkParticles.length - 1; i >= 0; i--) {
    const particle = state.fireworkParticles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    particle.lifetime -= dt;
    if (particle.lifetime <= 0) state.fireworkParticles.splice(i, 1);
  }
}

function getMultiplierForCombo(comboCount) {
  if (comboCount >= 15) return 5;
  if (comboCount >= 10) return 4;
  if (comboCount >= 6) return 3;
  if (comboCount >= 3) return 2;
  return 1;
}

function resetActionChain() {
  state.comboCount = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.overdrive = false;
}

function recordAction(type, label, basePoints) {
  state.comboCount += 1;
  state.comboTimer = ACTION_CHAIN_DURATION;
  state.multiplier = getMultiplierForCombo(state.comboCount);
  state.bestCombo = Math.max(state.bestCombo, state.comboCount);
  state.overdrive = state.comboCount >= OVERDRIVE_COMBO_THRESHOLD;
  const points = basePoints * state.multiplier;
  state.score += points;
  state.lastAction = {
    id: nextActionId++,
    type,
    label,
    points,
    multiplier: state.multiplier,
  };
}

function recordStatus(type, label) {
  state.lastAction = {
    id: nextActionId++,
    type,
    label,
    points: 0,
    multiplier: state.multiplier,
  };
}

function updateActionChain(dt) {
  if (state.comboCount <= 0) return;
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) resetActionChain();
}

/** Returns the first normalized time at which a moving point enters a sphere, or -1. */
function sweptSphereHitT(startX, startY, startZ, endX, endY, endZ, radius) {
  const dx = endX - startX;
  const dy = endY - startY;
  const dz = endZ - startZ;
  const a = dx * dx + dy * dy + dz * dz;
  const radiusSq = radius * radius;
  const startDistSq = startX * startX + startY * startY + startZ * startZ;
  if (startDistSq <= radiusSq) return 0;
  if (a <= 1e-9) return -1;

  const b = 2 * (startX * dx + startY * dy + startZ * dz);
  const c = startDistSq - radiusSq;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return -1;
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const entryT = (-b - sqrtDiscriminant) / (2 * a);
  const exitT = (-b + sqrtDiscriminant) / (2 * a);
  if (entryT >= 0 && entryT <= 1) return entryT;
  if (exitT >= 0 && exitT <= 1) return 0;
  return -1;
}

function getSpawnIntervalForSector(sector) {
  return Math.max(
    SECTOR_SPAWN_INTERVAL_FLOOR,
    ASTEROID_SPAWN_INTERVAL * Math.pow(SECTOR_SPAWN_INTERVAL_SCALE, Math.max(0, sector - 1))
  );
}

function getAsteroidMaxForSector(sector) {
  return Math.min(ASTEROID_MAX_CAP, ASTEROID_MAX + Math.max(0, sector - 1));
}

function getBatchSizeForSector(sector) {
  return Math.min(
    MAX_ASTEROID_BATCH_SIZE,
    1 + Math.floor(Math.max(0, sector - 1) / SECTORS_PER_BATCH_INCREASE)
  );
}

/** Spawn weights: large=1, medium=2, small=2 so medium/small spawn more often. */
const ASTEROID_TIER_WEIGHTS = [1, 2, 2];

function pickWeightedSizeTier(forceSmall = false) {
  if (forceSmall) return ASTEROID_SIZE_TIERS.length - 1;
  const total = ASTEROID_TIER_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let randomWeight = Math.random() * total;
  for (let i = 0; i < ASTEROID_SIZE_TIERS.length; i++) {
    randomWeight -= ASTEROID_TIER_WEIGHTS[i];
    if (randomWeight <= 0) return i;
  }
  return ASTEROID_SIZE_TIERS.length - 1;
}

function spawnOneAsteroid(batchIndex, batchSize, playArea) {
  const isEarlyBatch = state.spawnCount < EARLY_SMALL_BATCH_COUNT;
  const sizeTier = pickWeightedSizeTier(isEarlyBatch);
  const tier = ASTEROID_SIZE_TIERS[sizeTier];
  const radius = tier.radiusMin + Math.random() * (tier.radiusMax - tier.radiusMin);
  const templateIndex = tier.templateIndices[Math.floor(Math.random() * tier.templateIndices.length)];
  const area = playArea ?? { left: -20, right: 20, top: 20, bottom: -20 };
  const centerX = (area.left + area.right) * 0.5;
  const centerY = (area.bottom + area.top) * 0.5;
  const hasHorizontalRoom = area.left + radius <= area.right - radius;
  const hasVerticalRoom = area.bottom + radius <= area.top - radius;
  const minX = hasHorizontalRoom ? area.left + radius : centerX;
  const maxX = hasHorizontalRoom ? area.right - radius : centerX;
  const minY = hasVerticalRoom ? area.bottom + radius : centerY;
  const maxY = hasVerticalRoom ? area.top - radius : centerY;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const startLaneRadius = radius + SHIP_HIT_RADIUS + EARLY_START_LANE_PADDING;
  const startLaneX = state.ship.x;
  const startLaneY = state.ship.y + SHIP_Y_OFFSET;
  let x = centerX;
  let y = centerY;

  const maxAttempts = isEarlyBatch ? 12 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (batchSize > 1) {
      const laneIndex = (batchIndex + state.spawnCount) % batchSize;
      const laneT = (laneIndex + 0.15 + Math.random() * 0.7) / batchSize;
      x = minX + spanX * (state.spawnCount % 2 === 0 ? laneT : 1 - laneT);
    } else {
      x = minX + spanX * Math.random();
    }
    y = minY + spanY * Math.random();
    if (!isEarlyBatch || Math.hypot(x - startLaneX, y - startLaneY) >= startLaneRadius) break;
  }
  if (isEarlyBatch && Math.hypot(x - startLaneX, y - startLaneY) < startLaneRadius) {
    x = Math.abs(minX - startLaneX) >= Math.abs(maxX - startLaneX) ? minX : maxX;
    y = Math.abs(minY - startLaneY) >= Math.abs(maxY - startLaneY) ? minY : maxY;
  }

  state.asteroids.push({
    id: nextAsteroidId++,
    x,
    y,
    z: ASTEROID_SPAWN_Z - batchIndex * ASTEROID_BATCH_Z_SPACING,
    templateIndex,
    sizeTier,
    radius,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    rotVx: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
    rotVy: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
    rotVz: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
  });
}

function isHoopPositionClearOfAsteroids(x, y, z) {
  for (const asteroid of state.asteroids) {
    const distXY = Math.hypot(x - asteroid.x, y - asteroid.y);
    const distZ = Math.abs(z - asteroid.z);
    if (distXY < HOOP_MIN_DIST_FROM_ASTEROID_XY && distZ < HOOP_MIN_DIST_FROM_ASTEROID_Z) {
      return false;
    }
  }
  return true;
}

function spawnOneHoop() {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radiusFromCenter = (0.6 + 0.4 * Math.random()) * HOOP_SPAWN_RADIUS;
    const x = Math.cos(angle) * radiusFromCenter;
    const y = Math.sin(angle) * radiusFromCenter;
    const z = HOOP_SPAWN_Z;
    if (!isHoopPositionClearOfAsteroids(x, y, z)) continue;
    state.hoops.push({
      id: nextHoopId++,
      x,
      y,
      z,
      radius: HOOP_RADIUS,
      rotZ: (Math.random() - 0.5) * 0.5,
    });
    return;
  }
}

function maybeSpawnPowerUp(asteroid) {
  state.killsSincePowerUp += 1;
  const guaranteedDrop = state.killsSincePowerUp >= POWERUP_PITY_KILLS;
  if (!guaranteedDrop && Math.random() >= POWERUP_SPAWN_CHANCE) return;
  state.killsSincePowerUp = 0;
  state.powerUps.push({
    id: nextPowerUpId++,
    x: asteroid.x,
    y: asteroid.y,
    z: asteroid.z,
    type: Math.random() < 0.5 ? 'shield' : 'homing',
  });
}

function awardAsteroidKill(asteroid) {
  const tierIndex = asteroid.sizeTier ?? 0;
  const tier = ASTEROID_SIZE_TIERS[tierIndex] ?? ASTEROID_SIZE_TIERS[0];
  const labels = ['Large asteroid', 'Medium asteroid', 'Small asteroid'];
  state.asteroidsDestroyed += 1;
  recordAction('asteroid', labels[tierIndex] ?? 'Asteroid', tier.points);
  maybeSpawnPowerUp(asteroid);
}

export function setAsteroidsReadyFn(fn) {
  isAsteroidsReady = fn;
}

export function getNextSpawnBatchSize() {
  if (!isAsteroidsReady() || state.asteroids.length >= ASTEROID_MAX_CAP) return 0;
  const asteroidMax = getAsteroidMaxForSector(state.sector);
  if (state.asteroids.length >= asteroidMax) return 0;
  return Math.min(asteroidMax - state.asteroids.length, getBatchSizeForSector(state.sector));
}

export function resetState() {
  state.ship.x = 0;
  state.ship.y = 0;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.bullets.length = 0;
  state.asteroids.length = 0;
  state.hoops.length = 0;
  state.powerUps.length = 0;
  state.fireworkParticles.length = 0;
  state.fragments.length = 0;
  state.fireCooldown = 0;
  state.spawnTimer = INITIAL_ASTEROID_SPAWN_DELAY;
  state.hoopSpawnTimer = 0;
  state.currentSpawnInterval = ASTEROID_SPAWN_INTERVAL;
  state.spawnCount = 0;
  state.gameOver = false;
  state.shipExploding = false;
  state.shipExplodeTimer = 0;
  state.shieldTimer = 0;
  state.homingTimer = 0;
  state.invulnerabilityTimer = 0;
  state.score = 0;
  state.totalParsecs = 0;
  state.sector = 1;
  state.hull = MAX_HULL;
  state.maxHull = MAX_HULL;
  state.hitsTaken = 0;
  state.asteroidsDestroyed = 0;
  state.hoopsPassed = 0;
  state.nearMisses = 0;
  state.comboCount = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.bestCombo = 0;
  state.overdrive = false;
  state.lastAction = null;
  state.killsSincePowerUp = 0;
  nextActionId = 1;
}

function moveShip(dt, targetWorld, playArea) {
  const ship = state.ship;
  const previousX = ship.x;
  const previousY = ship.y;
  const tx = targetWorld?.x ?? ship.x;
  const ty = targetWorld?.y ?? ship.y;
  const dx = tx - ship.x;
  const dy = ty - ship.y;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const desiredSpeed = dist < SHIP_SLOWING_RADIUS
    ? SHIP_MAX_SPEED * (dist / SHIP_SLOWING_RADIUS)
    : SHIP_MAX_SPEED;
  const desiredVx = (dx / dist) * desiredSpeed;
  const desiredVy = (dy / dist) * desiredSpeed;
  ship.vx += (desiredVx - ship.vx) * SHIP_STEER_GAIN * dt;
  ship.vy += (desiredVy - ship.vy) * SHIP_STEER_GAIN * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  let minX = playArea.left + SHIP_BOUNDARY_RADIUS;
  let maxX = playArea.right - SHIP_BOUNDARY_RADIUS;
  let minY = playArea.bottom + SHIP_BOUNDARY_RADIUS - SHIP_Y_OFFSET;
  let maxY = playArea.top - SHIP_BOUNDARY_RADIUS - SHIP_Y_OFFSET;
  if (minX > maxX) minX = maxX = (playArea.left + playArea.right) * 0.5;
  if (minY > maxY) minY = maxY = (playArea.bottom + playArea.top) * 0.5;
  ship.x = Math.max(minX, Math.min(maxX, ship.x));
  ship.y = Math.max(minY, Math.min(maxY, ship.y));
  if (ship.x <= minX || ship.x >= maxX) ship.vx = 0;
  if (ship.y <= minY || ship.y >= maxY) ship.vy = 0;
  return { x: previousX, y: previousY };
}

function updateDifficultyAndSpawn(dt, playArea) {
  const nextSector = 1 + Math.floor(state.totalParsecs / PARSECS_PER_SECTOR);
  if (nextSector > state.sector) recordStatus('sector', `Sector ${nextSector}`);
  state.sector = nextSector;
  state.currentSpawnInterval = getSpawnIntervalForSector(state.sector);
  if (!isAsteroidsReady()) {
    state.asteroids.length = 0;
    return;
  }

  state.spawnTimer -= dt;
  const asteroidMax = getAsteroidMaxForSector(state.sector);
  if (state.spawnTimer <= 0 && state.asteroids.length < asteroidMax) {
    const batchSize = Math.min(
      asteroidMax - state.asteroids.length,
      getBatchSizeForSector(state.sector)
    );
    for (let i = 0; i < batchSize; i++) spawnOneAsteroid(i, batchSize, playArea);
    state.spawnCount += 1;
    state.spawnTimer = state.currentSpawnInterval;
  }

  for (const asteroid of state.asteroids) {
    asteroid.z += ASTEROID_SPEED * dt;
    asteroid.rotX = (asteroid.rotX ?? 0) + (asteroid.rotVx ?? 0) * dt;
    asteroid.rotY = (asteroid.rotY ?? 0) + (asteroid.rotVy ?? 0) * dt;
    asteroid.rotZ = (asteroid.rotZ ?? 0) + (asteroid.rotVz ?? 0) * dt;
  }
}

function tryFire(dt, fire, spawnPosition, onFire) {
  state.fireCooldown -= dt;
  if (!fire || state.fireCooldown > 0) return;

  const fireInterval = state.overdrive ? OVERDRIVE_FIRE_INTERVAL : FIRE_INTERVAL;
  state.fireCooldown = fireInterval;
  const availableSlots = getMaxBullets() - state.bullets.length;
  if (availableSlots <= 0) return;

  const position = spawnPosition ?? { x: state.ship.x, y: state.ship.y, z: 0 };
  const homing = state.homingTimer > 0;
  const shotCount = Math.min(state.overdrive ? 2 : 1, availableSlots);
  for (let i = 0; i < shotCount; i++) {
    const xOffset = shotCount === 2 ? (i === 0 ? -OVERDRIVE_SHOT_OFFSET : OVERDRIVE_SHOT_OFFSET) : 0;
    state.bullets.push({
      x: position.x + xOffset,
      y: position.y,
      z: position.z,
      vx: 0,
      vy: 0,
      vz: -BULLET_SPEED,
      homing,
    });
  }
  if (typeof onFire === 'function') onFire();
}

function updateBullets(dt, playArea, onAsteroidDestroyed) {
  const { left, right, top, bottom } = playArea;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const bullet = state.bullets[i];
    const previousX = bullet.x;
    const previousY = bullet.y;
    const previousZ = bullet.z;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.z += bullet.vz * dt;

    let hitIndex = -1;
    let earliestHitT = Infinity;
    if (isAsteroidsReady()) {
      for (let j = state.asteroids.length - 1; j >= 0; j--) {
        const asteroid = state.asteroids[j];
        const previousAsteroidZ = asteroid.z - ASTEROID_SPEED * dt;
        const radius = (asteroid.radius ?? ASTEROID_RADIUS_MAX) + BULLET_RADIUS;
        const hitT = sweptSphereHitT(
          previousX - asteroid.x,
          previousY - asteroid.y,
          previousZ - previousAsteroidZ,
          bullet.x - asteroid.x,
          bullet.y - asteroid.y,
          bullet.z - asteroid.z,
          radius
        );
        if (hitT >= 0 && hitT < earliestHitT) {
          hitIndex = j;
          earliestHitT = hitT;
        }
      }
    }

    if (hitIndex >= 0) {
      const asteroid = state.asteroids[hitIndex];
      spawnFragmentsAt(asteroid.x, asteroid.y, asteroid.z);
      if (typeof onAsteroidDestroyed === 'function') {
        onAsteroidDestroyed(asteroid.x, asteroid.y, asteroid.z);
      }
      state.asteroids.splice(hitIndex, 1);
      state.bullets.splice(i, 1);
      awardAsteroidKill(asteroid);
      continue;
    }

    if (bullet.homing && isAsteroidsReady()) {
      const target = findNearestAsteroidInCone(bullet.x, bullet.y, bullet.z);
      if (target) {
        const dx = target.x - bullet.x;
        const dy = target.y - bullet.y;
        const dz = target.z - bullet.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        bullet.vx = (dx / dist) * BULLET_SPEED;
        bullet.vy = (dy / dist) * BULLET_SPEED;
        bullet.vz = (dz / dist) * BULLET_SPEED;
      }
    }

    const offScreen = bullet.z < -BULLET_MAX_DIST ||
      bullet.x < left - 2 || bullet.x > right + 2 ||
      bullet.y < bottom - 2 || bullet.y > top + 2;
    if (offScreen) state.bullets.splice(i, 1);
  }
}

function damageShip(shipCollider, onShipExplode) {
  state.hitsTaken += 1;
  state.hull = Math.max(0, state.hull - 1);
  resetActionChain();
  recordStatus('damage', state.hull > 0 ? 'Hull breached' : 'Hull depleted');
  if (state.hull > 0) {
    state.invulnerabilityTimer = HIT_INVULNERABILITY_DURATION;
    return;
  }

  spawnShipExplosionFragmentsAt(shipCollider.x, shipCollider.y, shipCollider.z);
  state.shipExploding = true;
  state.shipExplodeTimer = SHIP_EXPLODE_DURATION;
  if (typeof onShipExplode === 'function') onShipExplode();
}

function resolveAsteroidsAgainstShip(dt, previousShipCollider, shipCollider, cameraZ, onShipExplode, onAsteroidDestroyed) {
  const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const asteroid = state.asteroids[i];
    const previousZ = asteroid.z - ASTEROID_SPEED * dt;
    const collisionRadius = SHIP_HIT_RADIUS + (asteroid.radius ?? ASTEROID_RADIUS_MAX);
    const hitT = sweptSphereHitT(
      asteroid.x - previousShipCollider.x,
      asteroid.y - previousShipCollider.y,
      previousZ - previousShipCollider.z,
      asteroid.x - shipCollider.x,
      asteroid.y - shipCollider.y,
      asteroid.z - shipCollider.z,
      collisionRadius
    );

    if (hitT >= 0) {
      spawnFragmentsAt(asteroid.x, asteroid.y, asteroid.z);
      if (typeof onAsteroidDestroyed === 'function') {
        onAsteroidDestroyed(asteroid.x, asteroid.y, asteroid.z);
      }
      state.asteroids.splice(i, 1);
      if (state.shieldTimer > 0) {
        recordStatus('shield', 'Shield held');
      } else if (state.invulnerabilityTimer <= 0) {
        damageShip(shipCollider, onShipExplode);
        if (state.shipExploding) return true;
      }
      continue;
    }

    if (previousZ < shipCollider.z && asteroid.z >= shipCollider.z) {
      const crossingT = (shipCollider.z - previousZ) / Math.max(1e-9, asteroid.z - previousZ);
      const shipXAtCrossing = previousShipCollider.x + (shipCollider.x - previousShipCollider.x) * crossingT;
      const shipYAtCrossing = previousShipCollider.y + (shipCollider.y - previousShipCollider.y) * crossingT;
      const lateralDistance = Math.hypot(asteroid.x - shipXAtCrossing, asteroid.y - shipYAtCrossing);
      if (lateralDistance > collisionRadius && lateralDistance <= collisionRadius + NEAR_MISS_MARGIN) {
        state.nearMisses += 1;
        recordAction('near-miss', 'Near miss', NEAR_MISS_POINTS);
      }
    }

    if (asteroid.z > cullZ) state.asteroids.splice(i, 1);
  }
  return false;
}

function updateHoops(dt, previousShipCollider, shipCollider, cameraZ, onHoopPassed) {
  state.hoopSpawnTimer -= dt;
  if (state.hoopSpawnTimer <= 0 && state.hoops.length < HOOP_MAX) {
    state.hoopSpawnTimer = HOOP_SPAWN_INTERVAL;
    spawnOneHoop();
  }

  const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
  for (let i = state.hoops.length - 1; i >= 0; i--) {
    const hoop = state.hoops[i];
    const previousZ = hoop.z;
    hoop.z += HOOP_SPEED * dt;
    if (previousZ < shipCollider.z && hoop.z >= shipCollider.z) {
      const crossingT = (shipCollider.z - previousZ) / Math.max(1e-9, hoop.z - previousZ);
      const shipXAtCrossing = previousShipCollider.x + (shipCollider.x - previousShipCollider.x) * crossingT;
      const shipYAtCrossing = previousShipCollider.y + (shipCollider.y - previousShipCollider.y) * crossingT;
      const radius = hoop.radius ?? HOOP_RADIUS;
      if (Math.hypot(hoop.x - shipXAtCrossing, hoop.y - shipYAtCrossing) < radius) {
        spawnFireworkBurstAt(hoop.x, hoop.y, hoop.z);
        if (typeof onHoopPassed === 'function') onHoopPassed();
        state.hoops.splice(i, 1);
        state.hoopsPassed += 1;
        recordAction('hoop', 'Hoop', HOOP_POINTS);
        continue;
      }
    }
    if (hoop.z > cullZ) state.hoops.splice(i, 1);
  }
}

function updatePowerUps(dt, previousShipCollider, shipCollider, cameraZ, onShieldCollected, onHomingCollected) {
  const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const powerUp = state.powerUps[i];
    const previousZ = powerUp.z;
    powerUp.z += POWERUP_SPEED * dt;
    const collisionRadius = SHIP_HIT_RADIUS + POWERUP_RADIUS;
    const hitT = sweptSphereHitT(
      powerUp.x - previousShipCollider.x,
      powerUp.y - previousShipCollider.y,
      previousZ - previousShipCollider.z,
      powerUp.x - shipCollider.x,
      powerUp.y - shipCollider.y,
      powerUp.z - shipCollider.z,
      collisionRadius
    );
    if (hitT >= 0) {
      spawnFireworkBurstAt(powerUp.x, powerUp.y, powerUp.z);
      state.powerUps.splice(i, 1);
      if (powerUp.type === 'shield') {
        state.shieldTimer = SHIELD_DURATION;
        if (typeof onShieldCollected === 'function') onShieldCollected();
      } else {
        state.homingTimer = HOMING_DURATION;
        if (typeof onHomingCollected === 'function') onHomingCollected();
      }
      continue;
    }
    if (powerUp.z > cullZ) state.powerUps.splice(i, 1);
  }
}

export function tick(dt, targetWorld, fire, playArea, spawnPosition, cameraZ, onFire, onShipExplode, onAsteroidDestroyed, onHoopPassed, onShieldCollected, onHomingCollected) {
  if (state.gameOver) return;

  if (state.shipExploding) {
    updateFragments(dt);
    updateFireworks(dt);
    state.shipExplodeTimer -= dt;
    if (state.shipExplodeTimer <= 0) {
      state.gameOver = true;
      state.shipExploding = false;
    }
    return;
  }

  state.totalParsecs += PARSECS_PER_SECOND * dt;
  state.shieldTimer = Math.max(0, state.shieldTimer - dt);
  state.homingTimer = Math.max(0, state.homingTimer - dt);
  state.invulnerabilityTimer = Math.max(0, state.invulnerabilityTimer - dt);
  updateActionChain(dt);
  updateFragments(dt);
  updateFireworks(dt);

  const previousShipPosition = moveShip(dt, targetWorld, playArea);
  const shipCollider = getShipColliderCenterForLogicalPosition(state.ship.x, state.ship.y) ?? {
    x: state.ship.x,
    y: state.ship.y,
    z: 0,
  };
  const previousShipCollider = getShipColliderCenterForLogicalPosition(previousShipPosition.x, previousShipPosition.y) ?? {
    x: previousShipPosition.x,
    y: previousShipPosition.y,
    z: shipCollider.z,
  };

  updateDifficultyAndSpawn(dt, playArea);
  tryFire(dt, fire, spawnPosition, onFire);
  updateBullets(dt, playArea, onAsteroidDestroyed);

  const lethalHit = resolveAsteroidsAgainstShip(
    dt,
    previousShipCollider,
    shipCollider,
    cameraZ,
    onShipExplode,
    onAsteroidDestroyed
  );
  if (lethalHit) return;

  updateHoops(dt, previousShipCollider, shipCollider, cameraZ, onHoopPassed);
  updatePowerUps(dt, previousShipCollider, shipCollider, cameraZ, onShieldCollected, onHomingCollected);
}

function findNearestAsteroidInCone(bx, by, bz) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const asteroid of state.asteroids) {
    if (asteroid.z >= bz) continue;
    const dx = asteroid.x - bx;
    const dy = asteroid.y - by;
    const dz = asteroid.z - bz;
    const dist = Math.hypot(dx, dy, dz) || 1e-6;
    if (dist > nearestDist) continue;
    if ((bz - asteroid.z) / dist < HOMING_CONE_COS) continue;
    nearest = asteroid;
    nearestDist = dist;
  }
  return nearest;
}
