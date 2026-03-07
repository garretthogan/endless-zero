import {
  SHIP_HIT_RADIUS,
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
  ASTEROID_RADIUS_MIN,
  ASTEROID_RADIUS_MAX,
  ASTEROID_SPAWN_INTERVAL,
  ASTEROID_SPAWN_INTERVAL_MIN,
  ASTEROID_MAX,
  ASTEROID_MAX_CAP,
  ASTEROID_MAX_GROWTH_K,
  ASTEROID_SPAWN_BATCH_LOG_K,
  NUM_ASTEROID_TEMPLATES,
  POINTS_PER_ASTEROID,
  ASTEROID_SPAWN_RADIUS,
  ASTEROID_BATCH_Z_SPACING,
} from './asteroids.js';

const SPAWN_INTERVAL_LOG_K = 1;

const FRAGMENT_COUNT_MIN = 3;
const FRAGMENT_COUNT_MAX = 6;
const FRAGMENT_SPEED = 50;
const FRAGMENT_LIFETIME = 0.7;

let nextAsteroidId = 0;
let isAsteroidsReady = () => false;

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

const PARSECS_PER_SECOND = 2.5;

const state = {
  ship: { x: 0, y: 0, vx: 0, vy: 0 },
  bullets: [],
  asteroids: [],
  fragments: [],
  fireCooldown: 0,
  spawnTimer: 0,
  currentSpawnInterval: ASTEROID_SPAWN_INTERVAL,
  spawnCount: 0,
  gameOver: false,
  shipExploding: false,
  shipExplodeTimer: 0,
  score: 0,
  totalParsecs: 0,
};

export function getState() {
  return state;
}

function spawnOneAsteroid(batchIndex = 0, batchSize = 1) {
  const radiusRange = ASTEROID_RADIUS_MAX - ASTEROID_RADIUS_MIN;
  const sizeTier = batchSize <= 1 ? 0.5 : batchIndex / Math.max(1, batchSize - 1);
  const radius = ASTEROID_RADIUS_MIN + radiusRange * (sizeTier * 0.85 + 0.15 * Math.random());
  const baseAngle = Math.random() * Math.PI * 2;
  const angleStep = (Math.PI * 2) / Math.max(1, batchSize);
  const angle = baseAngle + angleStep * batchIndex + (Math.random() - 0.5) * 0.4;
  const r = (0.6 + 0.4 * Math.random()) * ASTEROID_SPAWN_RADIUS;
  const z = ASTEROID_SPAWN_Z - batchIndex * ASTEROID_BATCH_Z_SPACING;
  state.asteroids.push({
    id: nextAsteroidId++,
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r,
    z,
    templateIndex: Math.floor(Math.random() * NUM_ASTEROID_TEMPLATES),
    radius,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    rotVx: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
    rotVy: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
    rotVz: (Math.random() - 0.5) * 2 * (2 + Math.random() * 4),
  });
}

export function setAsteroidsReadyFn(fn) {
  isAsteroidsReady = fn;
}

export function getNextSpawnBatchSize() {
  if (!isAsteroidsReady() || state.asteroids.length >= ASTEROID_MAX_CAP) return 0;
  const asteroidMax = Math.min(ASTEROID_MAX_CAP, ASTEROID_MAX + Math.floor(ASTEROID_MAX_GROWTH_K * Math.log(1 + state.spawnCount)));
  if (state.asteroids.length >= asteroidMax) return 0;
  return Math.min(
    asteroidMax - state.asteroids.length,
    Math.max(1, 1 + Math.floor(ASTEROID_SPAWN_BATCH_LOG_K * Math.log(1 + state.spawnCount)))
  );
}

function decreaseSpawnInterval() {
  state.spawnCount += 1;
  const range = ASTEROID_SPAWN_INTERVAL - ASTEROID_SPAWN_INTERVAL_MIN;
  state.currentSpawnInterval = ASTEROID_SPAWN_INTERVAL_MIN + range / (1 + SPAWN_INTERVAL_LOG_K * Math.log(1 + state.spawnCount));
}

export function resetState() {
  state.ship.x = 0;
  state.ship.y = 0;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.bullets.length = 0;
  state.asteroids.length = 0;
  state.fragments.length = 0;
  state.fireCooldown = 0;
  state.spawnTimer = 0;
  state.currentSpawnInterval = ASTEROID_SPAWN_INTERVAL;
  state.spawnCount = 0;
  state.gameOver = false;
  state.shipExploding = false;
  state.shipExplodeTimer = 0;
  state.score = 0;
  state.totalParsecs = 0;
}

export function tick(dt, targetWorld, fire, playArea, spawnPosition, cameraZ, onFire, onShipExplode, onAsteroidDestroyed) {
  if (state.gameOver) return;

  state.totalParsecs += PARSECS_PER_SECOND * dt;

  if (state.shipExploding) {
    state.shipExplodeTimer -= dt;
    if (state.shipExplodeTimer <= 0) {
      state.gameOver = true;
      state.shipExploding = false;
    }
  }

  const { left, right, top, bottom } = playArea;
  const ship = state.ship;

  if (!state.shipExploding) {
    const tx = targetWorld.x;
    const ty = targetWorld.y;
    const dx = tx - ship.x;
    const dy = ty - ship.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const slowingRadius = SHIP_SLOWING_RADIUS;
    const desiredSpeed = dist < slowingRadius
      ? SHIP_MAX_SPEED * (dist / slowingRadius)
      : SHIP_MAX_SPEED;
    const desiredVx = (dx / dist) * desiredSpeed;
    const desiredVy = (dy / dist) * desiredSpeed;
    const ax = (desiredVx - ship.vx) * SHIP_STEER_GAIN;
    const ay = (desiredVy - ship.vy) * SHIP_STEER_GAIN;
    ship.vx += ax * dt;
    ship.vy += ay * dt;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    ship.x = Math.max(left, Math.min(right, ship.x));
    ship.y = Math.max(bottom, Math.min(top, ship.y));
    if (ship.x <= left || ship.x >= right) ship.vx = 0;
    if (ship.y <= bottom || ship.y >= top) ship.vy = 0;
  }

  const sc = getShipColliderCenterForLogicalPosition(ship.x, ship.y) ?? { x: ship.x, y: ship.y, z: 0 };

  for (let i = state.fragments.length - 1; i >= 0; i--) {
    const f = state.fragments[i];
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.lifetime -= dt;
    if (f.lifetime <= 0) state.fragments.splice(i, 1);
  }

  if (!isAsteroidsReady()) {
    state.asteroids.length = 0;
  } else {
    state.spawnTimer -= dt;
    const asteroidMax = Math.min(ASTEROID_MAX_CAP, ASTEROID_MAX + Math.floor(ASTEROID_MAX_GROWTH_K * Math.log(1 + state.spawnCount)));
    if (state.spawnTimer <= 0 && state.asteroids.length < asteroidMax) {
      state.spawnTimer = state.currentSpawnInterval;
      const batchSize = Math.min(
        asteroidMax - state.asteroids.length,
        Math.max(1, 1 + Math.floor(ASTEROID_SPAWN_BATCH_LOG_K * Math.log(1 + state.spawnCount)))
      );
      for (let i = 0; i < batchSize; i++) spawnOneAsteroid(i, batchSize);
    }

    const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
    for (let i = state.asteroids.length - 1; i >= 0; i--) {
      const a = state.asteroids[i];
      a.z += ASTEROID_SPEED * dt;
      a.rotX = (a.rotX ?? 0) + (a.rotVx ?? 0) * dt;
      a.rotY = (a.rotY ?? 0) + (a.rotVy ?? 0) * dt;
      a.rotZ = (a.rotZ ?? 0) + (a.rotVz ?? 0) * dt;
      if (a.z > cullZ) {
        state.asteroids.splice(i, 1);
        continue;
      }
      if (!state.shipExploding) {
        const shipDistXY = Math.hypot(a.x - sc.x, a.y - sc.y);
        const r = a.radius ?? ASTEROID_RADIUS_MAX;
        if (a.z >= sc.z - SHIP_HIT_RADIUS - r && a.z <= sc.z + SHIP_HIT_RADIUS + r &&
            shipDistXY < SHIP_HIT_RADIUS + r) {
          spawnFragmentsAt(a.x, a.y, a.z);
          if (typeof onAsteroidDestroyed === 'function') onAsteroidDestroyed(a.x, a.y, a.z);
          state.asteroids.splice(i, 1);
          state.score += POINTS_PER_ASTEROID;
          decreaseSpawnInterval();
          spawnShipExplosionFragmentsAt(sc.x, sc.y, sc.z);
          state.shipExploding = true;
          state.shipExplodeTimer = SHIP_EXPLODE_DURATION;
          if (typeof onShipExplode === 'function') onShipExplode();
          break;
        }
      }
    }
  }

  if (!state.shipExploding) {
    state.fireCooldown -= dt;
    if (fire && state.fireCooldown <= 0) {
      state.fireCooldown = FIRE_INTERVAL;
      const pos = spawnPosition ?? { x: state.ship.x, y: state.ship.y, z: 0 };
      state.bullets.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: 0,
        vy: 0,
        vz: -BULLET_SPEED,
      });
      if (typeof onFire === 'function') onFire();
    }
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    const offScreen = b.z < -BULLET_MAX_DIST ||
      b.x < left - 2 || b.x > right + 2 ||
      b.y < bottom - 2 || b.y > top + 2;
    if (offScreen) {
      state.bullets.splice(i, 1);
      continue;
    }
    let bulletHit = false;
    if (isAsteroidsReady()) {
      for (let j = state.asteroids.length - 1; j >= 0; j--) {
        const a = state.asteroids[j];
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const r = a.radius ?? ASTEROID_RADIUS_MAX;
        if (d < r + BULLET_RADIUS) {
          spawnFragmentsAt(a.x, a.y, a.z);
          if (typeof onAsteroidDestroyed === 'function') onAsteroidDestroyed(a.x, a.y, a.z);
          state.asteroids.splice(j, 1);
          state.bullets.splice(i, 1);
          state.score += POINTS_PER_ASTEROID;
          decreaseSpawnInterval();
          bulletHit = true;
          break;
        }
      }
    }
    if (bulletHit) continue;
  }
}
