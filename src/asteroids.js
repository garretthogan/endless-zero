import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getToonGradientMap } from './scene.js';

const ASTEROIDS_GLB_PATH = import.meta.env.BASE_URL + 'asteroids.glb';
const ASTEROID_TARGET_SIZE = 8;
const DEBUG_SPHERE_RADIUS = 4;

export const ASTEROID_SPEED = 220;
export const ASTEROID_SPAWN_Z = -1020;
export const ASTEROID_RADIUS_MIN = 1.5;
export const ASTEROID_RADIUS_MAX = 6.5;
export const ASTEROID_SPAWN_INTERVAL = 5.5;
export const ASTEROID_SPAWN_INTERVAL_MIN = 0.25;
export const ASTEROID_MAX = 12;
export const ASTEROID_MAX_CAP = 28;
export const ASTEROID_MAX_GROWTH_K = 4;
export const ASTEROID_SPAWN_BATCH_LOG_K = 0.5;
export const NUM_ASTEROID_TEMPLATES = 7;
/** Size tiers: 0 = large (5 pts), 1 = medium (10 pts), 2 = small (15 pts). */
export const ASTEROID_SIZE_TIERS = [
  { radiusMin: 5.5, radiusMax: 7.5, points: 5, templateIndices: [0, 1] },
  { radiusMin: 3.5, radiusMax: 5, points: 10, templateIndices: [2, 3, 4] },
  { radiusMin: 2.5, radiusMax: 3.5, points: 15, templateIndices: [5, 6] },
];
export const ASTEROID_SPAWN_RADIUS = 3;
export const ASTEROID_BATCH_Z_SPACING = 500;
export const ASTEROID_BATCH_X_SPACING = 10;
export const ASTEROID_BATCH_Y_SPACING = 2;

const FRAGMENT_POOL_SIZE = 32;
const FRAGMENT_SIZE = 0.8;

let asteroidTemplates = [];
let container;
let fragmentContainer;
const meshesById = new Map();
let asteroidCollidersVisible = false;
let fragmentGeometry;
let fragmentMaterial;

function createDebugSphere() {
  const geometry = new THREE.SphereGeometry(DEBUG_SPHERE_RADIUS, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = asteroidCollidersVisible;
  return mesh;
}

export function setAsteroidCollidersVisible(visible) {
  asteroidCollidersVisible = visible;
  meshesById.forEach((group) => {
    if (group.children[1]) group.children[1].visible = visible;
  });
}

function collectMeshes(obj, out) {
  if (!obj) return;
  if (obj.isMesh) out.push(obj);
  obj.children.forEach((c) => collectMeshes(c, out));
}

function cloneForInstance(source) {
  if (!source) return null;
  const clone = source.clone();
  clone.traverse((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry = child.geometry.clone();
    }
  });
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = ASTEROID_TARGET_SIZE / maxDim;
  clone.scale.setScalar(Math.max(0.01, Math.min(100, scale)));
  return clone;
}

export function isAsteroidsReady() {
  return asteroidTemplates.length > 0;
}

function applyToonToObject(obj) {
  const gradientMap = getToonGradientMap();
  if (!gradientMap) return;
  obj.traverse((child) => {
    if (child.isMesh && child.material) {
      const oldMat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (oldMat) {
        child.material = new THREE.MeshToonMaterial({
          color: oldMat.color?.clone?.() ?? 0x888888,
          map: oldMat.map ?? null,
          gradientMap,
          side: THREE.DoubleSide,
        });
      }
    }
  });
}

export function createAsteroids(parentScene) {
  container = new THREE.Group();
  parentScene.add(container);
  fragmentContainer = new THREE.Group();
  parentScene.add(fragmentContainer);
  fragmentGeometry = new THREE.SphereGeometry(FRAGMENT_SIZE, 6, 6);
  const gradientMap = getToonGradientMap();
  fragmentMaterial = gradientMap
    ? new THREE.MeshToonMaterial({ color: 0x555555, gradientMap, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ color: 0x555555 });
  for (let i = 0; i < FRAGMENT_POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
    mesh.visible = false;
    fragmentContainer.add(mesh);
  }
  const loadPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      ASTEROIDS_GLB_PATH,
      (gltf) => {
        const scene = gltf.scene;
        const meshes = [];
        collectMeshes(scene, meshes);
        if (meshes.length >= 7) {
          asteroidTemplates = meshes.slice(0, 7);
        } else if (meshes.length > 0) {
          asteroidTemplates = meshes.slice(0, 7);
        }
        if (asteroidTemplates.length === 0 && scene.children.length >= 7) {
          asteroidTemplates = scene.children.slice(0, 7);
        } else if (asteroidTemplates.length === 0 && scene.children.length > 0) {
          asteroidTemplates = scene.children.slice();
        }
        asteroidTemplates.forEach((t) => applyToonToObject(t));
        resolve();
      },
      undefined,
      (err) => {
        console.error('Asteroids GLB load error:', err);
        reject(err);
      }
    );
  });
  return { container, loadPromise };
}

export function syncAsteroids(asteroidList) {
  if (!container) return;
  const usedIds = new Set(asteroidList.map((a) => a.id));
  meshesById.forEach((mesh, id) => {
    if (!usedIds.has(id)) {
      container.remove(mesh);
      mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
      meshesById.delete(id);
    }
  });
  asteroidList.forEach((a) => {
    let group = meshesById.get(a.id);
    if (!group && asteroidTemplates.length > 0) {
      const idx = (a.templateIndex ?? 0) % asteroidTemplates.length;
      const clone = cloneForInstance(asteroidTemplates[idx]);
      if (clone) {
        group = new THREE.Group();
        group.add(clone);
        group.add(createDebugSphere());
        const scale = (a.radius != null ? a.radius : ASTEROID_RADIUS_MAX) / DEBUG_SPHERE_RADIUS;
        group.scale.setScalar(scale);
        meshesById.set(a.id, group);
        container.add(group);
      }
    }
    if (group) {
      group.position.set(a.x, a.y, a.z);
      group.rotation.set(a.rotX ?? 0, a.rotY ?? 0, a.rotZ ?? 0);
    }
  });
}

export function syncFragments(fragmentList) {
  if (!fragmentContainer) return;
  const children = fragmentContainer.children;
  for (let i = 0; i < children.length; i++) {
    const mesh = children[i];
    if (i < fragmentList.length) {
      const f = fragmentList[i];
      mesh.position.set(f.x, f.y, f.z);
      mesh.visible = true;
    } else {
      mesh.visible = false;
    }
  }
}

export function disposeAsteroids() {
  meshesById.forEach((mesh) => {
    mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  });
  meshesById.clear();
  if (container) container.clear();
  if (fragmentContainer) {
    fragmentContainer.clear();
    fragmentGeometry?.dispose();
    fragmentMaterial?.dispose();
  }
  asteroidTemplates = [];
}
