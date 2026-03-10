import * as THREE from 'three';

const POOL_SIZE = 96;
const PARTICLE_SIZE = 0.28;

let container;
let pool = [];
let geometry;

function createParticleMesh() {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
    })
  );
  return mesh;
}

export function createFireworks(parentScene) {
  container = new THREE.Group();
  parentScene.add(container);
  geometry = new THREE.SphereGeometry(PARTICLE_SIZE, 8, 8);
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = createParticleMesh();
    mesh.visible = false;
    pool.push(mesh);
    container.add(mesh);
  }
}

export function syncFireworkParticles(particleList) {
  if (!container) return;
  const list = particleList ?? [];
  for (let i = 0; i < pool.length; i++) {
    const mesh = pool[i];
    if (i >= list.length) {
      mesh.visible = false;
      continue;
    }
    const p = list[i];
    mesh.position.set(p.x, p.y, p.z);
    mesh.visible = true;
    const mat = mesh.material;
    if (mat && p.color != null) {
      mat.color.setHex(p.color);
      mat.opacity = Math.max(0.15, p.lifetime / 0.9);
    }
    const scale = Math.max(0.3, p.lifetime / 0.9);
    mesh.scale.setScalar(scale);
  }
}

export function disposeFireworks() {
  pool.forEach((mesh) => {
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  });
  pool = [];
  if (container) container.clear();
  geometry?.dispose();
  geometry = null;
}
