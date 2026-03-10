import * as THREE from 'three';
import { getToonGradientMap } from './scene.js';

export const HOOP_SPEED = 220;
export const HOOP_SPAWN_Z = -320;
export const HOOP_SPAWN_INTERVAL = 4;
export const HOOP_MAX = 6;
export const HOOP_POINTS = 10;
/** Ring radius in world units (for pass-through check and visual). */
export const HOOP_RADIUS = 4;
/** Ship passes through when within this z-distance of the hoop plane. */
export const HOOP_PASS_Z_THRESHOLD = 3;
export const HOOP_SPAWN_RADIUS = 7;
/** Min XY distance from hoop spawn to any asteroid. */
export const HOOP_MIN_DIST_FROM_ASTEROID_XY = 12;
/** Min Z distance from hoop spawn to any asteroid. */
export const HOOP_MIN_DIST_FROM_ASTEROID_Z = 80;

const TUBE_RADIUS = 0.35;
const RADIAL_SEGMENTS = 16;
const TUBULAR_SEGMENTS = 24;

let container;
const meshesById = new Map();

function createHoopMesh(radius) {
  const geometry = new THREE.TorusGeometry(radius, TUBE_RADIUS, RADIAL_SEGMENTS, TUBULAR_SEGMENTS);
  const gradientMap = getToonGradientMap();
  const material = gradientMap
    ? new THREE.MeshToonMaterial({ color: 0x22d3ee, gradientMap, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

export function createHoops(parentScene) {
  container = new THREE.Group();
  parentScene.add(container);
}

export function syncHoops(hoopList) {
  if (!container) return;
  const usedIds = new Set(hoopList.map((h) => h.id));
  meshesById.forEach((mesh, id) => {
    if (!usedIds.has(id)) {
      container.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
      meshesById.delete(id);
    }
  });
  hoopList.forEach((h) => {
    let mesh = meshesById.get(h.id);
    if (!mesh) {
      mesh = createHoopMesh(h.radius ?? HOOP_RADIUS);
      meshesById.set(h.id, mesh);
      container.add(mesh);
    }
    mesh.position.set(h.x, h.y, h.z);
    mesh.rotation.z = h.rotZ ?? 0;
  });
}

export function disposeHoops() {
  meshesById.forEach((mesh) => {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  });
  meshesById.clear();
  if (container) container.clear();
}
