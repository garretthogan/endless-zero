import * as THREE from 'three';
import { getToonGradientMap } from './scene.js';

const POOL_SIZE = 64;

export const BULLET_RADIUS = 0.52;
export const BULLET_SPEED = 500;
export const BULLET_MAX_DIST = 2000;
export const FIRE_INTERVAL = 0.25;

const BURST_LENGTH = BULLET_RADIUS * 12;

let container;
let pool = [];
let active = [];
let geometry;
let material;

function createBulletMesh() {
  return new THREE.Mesh(geometry, material);
}

export function createBullets(parentScene) {
  container = new THREE.Group();
  geometry = new THREE.ConeGeometry(BULLET_RADIUS, BURST_LENGTH, 8);
  geometry.rotateX(Math.PI / 2);
  const gradientMap = getToonGradientMap();
  material = gradientMap
    ? new THREE.MeshToonMaterial({
        color: 0xff69b4,
        emissive: 0xff1493,
        emissiveIntensity: 0.9,
        gradientMap,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshBasicMaterial({ color: 0xff69b4 });
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    pool.push(mesh);
    container.add(mesh);
  }
  parentScene.add(container);
  return container;
}

export function syncBullets(bulletList) {
  if (!container) return;
  while (active.length > 0) {
    const m = active.pop();
    m.visible = false;
    pool.push(m);
  }
  for (let i = 0; i < bulletList.length; i++) {
    const b = bulletList[i];
    let mesh = pool.length > 0 ? pool.pop() : createBulletMesh();
    if (mesh.parent !== container) container.add(mesh);
    mesh.position.set(b.x, b.y, b.z);
    mesh.visible = true;
    active.push(mesh);
  }
}

export function disposeBullets() {
  geometry?.dispose();
  material?.dispose();
  pool.forEach((m) => {
    if (m.geometry !== geometry) m.geometry?.dispose();
    if (m.material !== material) m.material?.dispose();
  });
  pool = [];
  active = [];
}
