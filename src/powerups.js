import * as THREE from 'three';
import { getToonGradientMap } from './scene.js';

export const POWERUP_SPAWN_CHANCE = 0.05;
export const POWERUP_RADIUS = 4;
export const SHIELD_DURATION = 15;
export const HOMING_DURATION = 15;
export const POWERUP_SPEED = 120;

const SHIELD_CORE_RADIUS = 1.2;
const ORBIT_RADIUS = 1.75;
const ORBIT_TUBE_RADIUS = 0.13;
const HOMING_ARROW_RADIUS = 0.9;
const HOMING_ARROW_LENGTH = 3.2;
const HOMING_TICK_LENGTH = 0.7;
const HOMING_TICK_THICKNESS = 0.18;

let container;
const meshesById = new Map();
let geometries;
let materials;
let animationClock;

function createMaterial(color, emissive, emissiveIntensity, opacity = 1) {
  const gradientMap = getToonGradientMap();
  const transparent = opacity < 1;
  if (gradientMap) {
    return new THREE.MeshToonMaterial({
      color,
      emissive,
      emissiveIntensity,
      gradientMap,
      side: THREE.DoubleSide,
      transparent,
      opacity,
      depthWrite: !transparent,
    });
  }
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent,
    opacity,
    depthWrite: !transparent,
  });
}

function createShieldMesh(phase) {
  const group = new THREE.Group();
  group.userData.powerUpType = 'shield';
  group.userData.animationPhase = phase;

  group.add(new THREE.Mesh(geometries.shieldCore, materials.shieldCore));

  const equator = new THREE.Mesh(geometries.orbit, materials.shieldRing);
  const vertical = new THREE.Mesh(geometries.orbit, materials.shieldRing);
  const diagonal = new THREE.Mesh(geometries.orbit, materials.shieldRing);
  vertical.rotation.x = Math.PI / 2;
  diagonal.rotation.y = Math.PI / 2;
  diagonal.rotation.z = Math.PI / 4;
  group.add(equator, vertical, diagonal);

  return group;
}

function createHomingMesh(phase) {
  const group = new THREE.Group();
  group.userData.powerUpType = 'homing';
  group.userData.animationPhase = phase;

  group.add(new THREE.Mesh(geometries.homingArrow, materials.homingArrow));
  group.add(new THREE.Mesh(geometries.orbit, materials.homingReticle));

  const tickPositions = [
    [0, ORBIT_RADIUS, 0, 0],
    [0, -ORBIT_RADIUS, 0, 0],
    [ORBIT_RADIUS, 0, 0, Math.PI / 2],
    [-ORBIT_RADIUS, 0, 0, Math.PI / 2],
  ];
  tickPositions.forEach(([x, y, z, rotationZ]) => {
    const tick = new THREE.Mesh(geometries.homingTick, materials.homingReticle);
    tick.position.set(x, y, z);
    tick.rotation.z = rotationZ;
    group.add(tick);
  });

  return group;
}

export function createPowerUps(parentScene) {
  container = new THREE.Group();
  parentScene.add(container);

  const homingArrow = new THREE.ConeGeometry(HOMING_ARROW_RADIUS, HOMING_ARROW_LENGTH, 6);
  homingArrow.rotateX(Math.PI / 2);
  geometries = {
    shieldCore: new THREE.IcosahedronGeometry(SHIELD_CORE_RADIUS, 1),
    orbit: new THREE.TorusGeometry(ORBIT_RADIUS, ORBIT_TUBE_RADIUS, 8, 24),
    homingArrow,
    homingTick: new THREE.BoxGeometry(HOMING_TICK_THICKNESS, HOMING_TICK_LENGTH, HOMING_TICK_THICKNESS),
  };
  materials = {
    shieldCore: createMaterial(0x16a34a, 0x22c55e, 0.65, 0.82),
    shieldRing: createMaterial(0x86efac, 0x22c55e, 0.9),
    homingArrow: createMaterial(0xdc2626, 0xff1744, 0.85),
    homingReticle: createMaterial(0xfca5a5, 0xef4444, 0.95),
  };
  animationClock = new THREE.Clock();
}

export function syncPowerUps(powerUpList) {
  if (!container) return;
  const list = powerUpList ?? [];
  const elapsed = animationClock?.getElapsedTime() ?? 0;
  const usedIds = new Set(list.map((p) => p.id));
  meshesById.forEach((mesh, id) => {
    if (!usedIds.has(id)) {
      container.remove(mesh);
      meshesById.delete(id);
    }
  });
  list.forEach((p) => {
    let mesh = meshesById.get(p.id);
    if (!mesh) {
      const phase = (Number(p.id) || 0) * 0.73;
      if (p.type === 'shield') mesh = createShieldMesh(phase);
      else mesh = createHomingMesh(phase);
      meshesById.set(p.id, mesh);
      container.add(mesh);
    }
    mesh.position.set(p.x, p.y, p.z);

    const phase = mesh.userData.animationPhase ?? 0;
    if (mesh.userData.powerUpType === 'shield') {
      mesh.rotation.y = elapsed * 0.8 + phase;
      mesh.rotation.z = Math.sin(elapsed * 1.1 + phase) * 0.2;
      mesh.scale.setScalar(1 + Math.sin(elapsed * 2.2 + phase) * 0.06);
    } else {
      mesh.rotation.z = elapsed * 1.35 + phase;
      mesh.rotation.x = Math.sin(elapsed * 1.4 + phase) * 0.12;
      mesh.scale.setScalar(1 + Math.sin(elapsed * 2.8 + phase) * 0.08);
    }
  });
}

export function disposePowerUps() {
  animationClock?.stop();
  animationClock = null;
  meshesById.clear();
  if (container) {
    container.parent?.remove(container);
    container.clear();
    container = null;
  }
  Object.values(geometries ?? {}).forEach((geometry) => geometry.dispose());
  Object.values(materials ?? {}).forEach((material) => material.dispose());
  geometries = null;
  materials = null;
}
