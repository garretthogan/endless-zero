import * as THREE from 'three';
import { getToonGradientMap } from './scene.js';

export const POWERUP_SPAWN_CHANCE = 0.05;
export const POWERUP_RADIUS = 4;
export const SHIELD_DURATION = 15;
export const HOMING_DURATION = 15;
export const POWERUP_SPEED = 120;

const POOL_SIZE = 12;
const BOX_SIZE = 3.0;

let container;
const meshesById = new Map();
let boxGeometry;

function createShieldMesh() {
  const gradientMap = getToonGradientMap();
  const mat = gradientMap
    ? new THREE.MeshToonMaterial({ color: 0x22c55e, gradientMap, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(boxGeometry, mat);
  return mesh;
}

function createHomingMesh() {
  const gradientMap = getToonGradientMap();
  const mat = gradientMap
    ? new THREE.MeshToonMaterial({ color: 0xdc2626, gradientMap, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(boxGeometry, mat);
  return mesh;
}

export function createPowerUps(parentScene) {
  container = new THREE.Group();
  parentScene.add(container);
  boxGeometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
}

export function syncPowerUps(powerUpList) {
  if (!container) return;
  const list = powerUpList ?? [];
  const usedIds = new Set(list.map((p) => p.id));
  meshesById.forEach((mesh, id) => {
    if (!usedIds.has(id)) {
      container.remove(mesh);
      if (mesh.geometry !== boxGeometry) {
        mesh.geometry?.dispose();
      }
      mesh.material?.dispose();
      meshesById.delete(id);
    }
  });
  list.forEach((p) => {
    let mesh = meshesById.get(p.id);
    if (!mesh) {
      if (p.type === 'shield') mesh = createShieldMesh();
      else mesh = createHomingMesh();
      meshesById.set(p.id, mesh);
      container.add(mesh);
    }
    mesh.position.set(p.x, p.y, p.z);
  });
}

export function disposePowerUps() {
  meshesById.forEach((mesh) => {
    if (mesh.geometry !== boxGeometry) {
      mesh.geometry?.dispose();
    }
    mesh.material?.dispose();
  });
  meshesById.clear();
  if (container) container.clear();
  boxGeometry?.dispose();
}
