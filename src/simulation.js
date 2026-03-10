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
  ASTEROID_SIZE_TIERS,
  ASTEROID_SPAWN_RADIUS,
  ASTEROID_BATCH_Z_SPACING,
  ASTEROID_BATCH_X_SPACING,
  ASTEROID_BATCH_Y_SPACING,
} from './asteroids.js';
import {
  HOOP_SPEED,
  HOOP_SPAWN_Z,
  HOOP_SPAWN_INTERVAL,
  HOOP_MAX,
  HOOP_POINTS,
  HOOP_RADIUS,
  HOOP_PASS_Z_THRESHOLD,
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

const SPAWN_INTERVAL_LOG_K = 1;
/** Half-angle of cone in front of bullet (radians). Only asteroids within this cone are targeted. */
const HOMING_CONE_ANGLE = (20 * Math.PI) / 180;
const HOMING_CONE_COS = Math.cos(HOMING_CONE_ANGLE);

const FRAGMENT_COUNT_MIN = 3;
const FRAGMENT_COUNT_MAX = 6;
const FRAGMENT_SPEED = 50;
const FRAGMENT_LIFETIME = 0.7;

let nextAsteroidId = 0;
let nextHoopId = 0;
let nextPowerUpId = 0;
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
  hoops: [],
  powerUps: [],
  fireworkParticles: [],
  fragments: [],
  fireCooldown: 0,
  spawnTimer: 0,
  hoopSpawnTimer: 0,
  currentSpawnInterval: ASTEROID_SPAWN_INTERVAL,
  spawnCount: 0,
  gameOver: false,
  shipExploding: false,
  shipExplodeTimer: 0,
  shieldTimer: 0,
  homingTimer: 0,
  score: 0,
  totalParsecs: 0,
};

export function getState() {
  return state;
}

/** Spawn weights: large=1, medium=2, small=2 so medium/small spawn more often. */
const ASTEROID_TIER_WEIGHTS = [1, 2, 2];

function pickWeightedSizeTier() {
  const total = ASTEROID_TIER_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ASTEROID_SIZE_TIERS.length; i++) {
    r -= ASTEROID_TIER_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return ASTEROID_SIZE_TIERS.length - 1;
}

function spawnOneAsteroid(batchIndex = 0, batchSize = 1) {
  const sizeTier = pickWeightedSizeTier();
  const tier = ASTEROID_SIZE_TIERS[sizeTier];
  const radius = tier.radiusMin + Math.random() * (tier.radiusMax - tier.radiusMin);
  const templateIndex = tier.templateIndices[Math.floor(Math.random() * tier.templateIndices.length)];
  const baseAngle = Math.random() * Math.PI * 2;
  const angleStep = (Math.PI * 2) / Math.max(1, batchSize);
  const angle = baseAngle + angleStep * batchIndex + (Math.random() - 0.5) * 0.4;
  const r = (0.6 + 0.4 * Math.random()) * ASTEROID_SPAWN_RADIUS;
  const z = ASTEROID_SPAWN_Z - batchIndex * ASTEROID_BATCH_Z_SPACING;
  const cols = Math.max(1, Math.ceil(Math.sqrt(batchSize)));
  const rows = Math.ceil(batchSize / cols);
  const col = batchIndex % cols;
  const row = Math.floor(batchIndex / cols);
  const xOffset = (col - (cols - 1) / 2) * ASTEROID_BATCH_X_SPACING;
  const yOffset = (row - (rows - 1) / 2) * ASTEROID_BATCH_Y_SPACING;
  state.asteroids.push({
    id: nextAsteroidId++,
    x: Math.cos(angle) * r + xOffset,
    y: Math.sin(angle) * r + yOffset,
    z,
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
  for (const a of state.asteroids) {
    const distXY = Math.hypot(x - a.x, y - a.y);
    const distZ = Math.abs(z - a.z);
    if (distXY < HOOP_MIN_DIST_FROM_ASTEROID_XY && distZ < HOOP_MIN_DIST_FROM_ASTEROID_Z) {
      return false;
    }
  }
  return true;
}

const FIREWORK_COLORS = [0xffff00, 0xffaa00, 0xff6600, 0xffffff, 0x22d3ee];
const FIREWORK_PARTICLE_COUNT = 48;
const FIREWORK_SPEED_MIN = 35;
const FIREWORK_SPEED_MAX = 75;
const FIREWORK_LIFETIME = 0.9;

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

function spawnOneHoop() {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = (0.6 + 0.4 * Math.random()) * HOOP_SPAWN_RADIUS;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
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
  state.hoops.length = 0;
  state.powerUps.length = 0;
  state.fireworkParticles.length = 0;
  state.fragments.length = 0;
  state.fireCooldown = 0;
  state.spawnTimer = 0;
  state.hoopSpawnTimer = 0;
  state.currentSpawnInterval = ASTEROID_SPAWN_INTERVAL;
  state.spawnCount = 0;
  state.gameOver = false;
  state.shipExploding = false;
  state.shipExplodeTimer = 0;
  state.shieldTimer = 0;
  state.homingTimer = 0;
  state.score = 0;
  state.totalParsecs = 0;
}

export function tick(dt, targetWorld, fire, playArea, spawnPosition, cameraZ, onFire, onShipExplode, onAsteroidDestroyed, onHoopPassed, onShieldCollected, onHomingCollected) {
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
  for (let i = state.fireworkParticles.length - 1; i >= 0; i--) {
    const p = state.fireworkParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.lifetime -= dt;
    if (p.lifetime <= 0) state.fireworkParticles.splice(i, 1);
  }
  state.shieldTimer = Math.max(0, state.shieldTimer - dt);
  state.homingTimer = Math.max(0, state.homingTimer - dt);

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
          state.score += ASTEROID_SIZE_TIERS[a.sizeTier ?? 0].points;
          decreaseSpawnInterval();
          if (state.shieldTimer <= 0) {
            spawnShipExplosionFragmentsAt(sc.x, sc.y, sc.z);
            state.shipExploding = true;
            state.shipExplodeTimer = SHIP_EXPLODE_DURATION;
            if (typeof onShipExplode === 'function') onShipExplode();
            break;
          }
        }
    }
  }
  }

  state.hoopSpawnTimer -= dt;
  if (state.hoopSpawnTimer <= 0 && state.hoops.length < HOOP_MAX) {
    state.hoopSpawnTimer = HOOP_SPAWN_INTERVAL;
    spawnOneHoop();
  }
  const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
  for (let i = state.hoops.length - 1; i >= 0; i--) {
    const h = state.hoops[i];
    h.z += HOOP_SPEED * dt;
    if (h.z > cullZ) {
      state.hoops.splice(i, 1);
      continue;
    }
    if (!state.shipExploding) {
      const distXY = Math.hypot(h.x - sc.x, h.y - sc.y);
      const radius = h.radius ?? HOOP_RADIUS;
      if (distXY < radius && Math.abs(h.z - sc.z) < HOOP_PASS_Z_THRESHOLD) {
        spawnFireworkBurstAt(h.x, h.y, h.z);
        if (typeof onHoopPassed === 'function') onHoopPassed();
        state.hoops.splice(i, 1);
        state.score += HOOP_POINTS;
      }
    }
  }

  const cullZPowerUps = typeof cameraZ === 'number' ? cameraZ : 50;
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const p = state.powerUps[i];
    p.z += POWERUP_SPEED * dt;
    if (p.z > cullZPowerUps) {
      state.powerUps.splice(i, 1);
      continue;
    }
    if (!state.shipExploding) {
      const distXY = Math.hypot(p.x - sc.x, p.y - sc.y);
      const distZ = Math.abs(p.z - sc.z);
      if (distXY < SHIP_HIT_RADIUS + POWERUP_RADIUS && distZ < SHIP_HIT_RADIUS + POWERUP_RADIUS) {
        spawnFireworkBurstAt(p.x, p.y, p.z);
        state.powerUps.splice(i, 1);
        if (p.type === 'shield') {
          state.shieldTimer = SHIELD_DURATION;
          if (typeof onShieldCollected === 'function') onShieldCollected();
        } else {
          state.homingTimer = HOMING_DURATION;
          if (typeof onHomingCollected === 'function') onHomingCollected();
        }
      }
    }
  }

  if (!state.shipExploding) {
    state.fireCooldown -= dt;
    if (fire && state.fireCooldown <= 0) {
      const maxBullets = 2;
      if (state.bullets.length >= maxBullets) {
        state.fireCooldown = FIRE_INTERVAL;
      } else {
        state.fireCooldown = FIRE_INTERVAL;
        const pos = spawnPosition ?? { x: state.ship.x, y: state.ship.y, z: 0 };
        const homing = state.homingTimer > 0;
        state.bullets.push({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: 0,
          vy: 0,
          vz: -BULLET_SPEED,
          homing,
        });
        if (typeof onFire === 'function') onFire();
      }
    }
  }

  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.homing && isAsteroidsReady()) {
      const target = findNearestAsteroidInCone(b.x, b.y, b.z);
      if (target) {
        const dx = target.x - b.x;
        const dy = target.y - b.y;
        const dz = target.z - b.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        b.vx = (dx / dist) * BULLET_SPEED;
        b.vy = (dy / dist) * BULLET_SPEED;
        b.vz = (dz / dist) * BULLET_SPEED;
      }
    }
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
          state.score += ASTEROID_SIZE_TIERS[a.sizeTier ?? 0].points;
          decreaseSpawnInterval();
          if (Math.random() < POWERUP_SPAWN_CHANCE) {
            const r = Math.random();
            const type = Math.random() < 0.5 ? 'shield' : 'homing';
            state.powerUps.push({
              id: nextPowerUpId++,
              x: a.x,
              y: a.y,
              z: a.z,
              type,
            });
          }
          bulletHit = true;
          break;
        }
      }
    }
    if (bulletHit) continue;
  }
}

function findNearestAsteroidInCone(bx, by, bz) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const a of state.asteroids) {
    if (a.z >= bz) continue;
    const dx = a.x - bx;
    const dy = a.y - by;
    const dz = a.z - bz;
    const dist = Math.hypot(dx, dy, dz) || 1e-6;
    if (dist > nearestDist) continue;
    if ((bz - a.z) / dist < HOMING_CONE_COS) continue;
    nearest = a;
    nearestDist = dist;
  }
  return nearest;
}
