import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getToonGradientMap } from './scene.js';

const SHIP_GLB_PATH = '/space_fighter_the_protector_of_the_galaxy.glb';
const SHIP_TARGET_SIZE = 6;
export const SHIP_Z_OFFSET = 35;
const SHIP_Y_OFFSET = -1.5;
export const SHIP_HIT_RADIUS = 1.5;
/** Offset of collider from mesh center, in ship local space. (0,0,0) = centered. +Z = back. */
const SHIP_COLLIDER_OFFSET = new THREE.Vector3(0, 0, 0);

export const SHIP_MAX_SPEED = 50;
export const SHIP_SLOWING_RADIUS = 7;
export const SHIP_STEER_GAIN = 5;
export const SHIP_EXPLODE_FRAGMENTS_MIN = 10;
export const SHIP_EXPLODE_FRAGMENTS_MAX = 16;
export const SHIP_EXPLODE_SPEED = 80;
export const SHIP_EXPLODE_LIFETIME = 1.2;
export const SHIP_EXPLODE_DURATION = 1.5;

let ship = null;
let colliderDebug = null;
let shipColliderVisible = true;
let center = new THREE.Vector3(0, 0, 0);

function createColliderOutline() {
  const geometry = new THREE.SphereGeometry(SHIP_HIT_RADIUS, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0x44ff44,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1000;
  return mesh;
}

function disposeModel(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

export function createShip(parentScene) {
  const loader = new GLTFLoader();
  loader.load(
    SHIP_GLB_PATH,
    (gltf) => {
      ship = gltf.scene;

      ship.rotation.set(0, Math.PI, 0);
      ship.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(ship);
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      let scale = SHIP_TARGET_SIZE / maxDim;
      scale = Math.max(0.01, Math.min(100, scale));
      ship.scale.setScalar(scale);

      ship.position.x = -center.x * scale;
      ship.position.y = SHIP_Y_OFFSET - center.y * scale;
      ship.position.z = SHIP_Z_OFFSET - center.z * scale;

      colliderDebug = createColliderOutline();
      colliderDebug.visible = shipColliderVisible;
      colliderDebug.scale.setScalar(1);
      parentScene.add(colliderDebug);

      const gradientMap = getToonGradientMap();
      ship.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = false;
          if (child.material) {
            const oldMat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (oldMat && gradientMap) {
              const toon = new THREE.MeshToonMaterial({
                color: oldMat.color?.clone?.() ?? 0x8888aa,
                map: oldMat.map ?? null,
                gradientMap,
                side: THREE.DoubleSide,
              });
              child.material = toon;
            } else if (oldMat) oldMat.side = THREE.DoubleSide;
          }
        }
      });

      parentScene.add(ship);
    },
    undefined,
    (err) => console.error('Ship GLB load error:', err)
  );

  return { shipMesh: ship };
}

export function updateShip(position) {
  if (!ship) return;
  const s = ship.scale.x;
  ship.position.set(
    position.x - center.x * s,
    position.y - center.y * s + SHIP_Y_OFFSET,
    SHIP_Z_OFFSET - center.z * s
  );
}

export function getShipGroup() {
  return ship;
}

export function setShipColliderVisible(visible) {
  shipColliderVisible = visible;
  if (colliderDebug) colliderDebug.visible = visible;
}

/** Update collider debug mesh position/scale to match ship (call each frame). */
export function updateShipColliderPosition() {
  if (!colliderDebug || !ship) return;
  const pos = getShipColliderCenter();
  if (pos) {
    colliderDebug.position.set(pos.x, pos.y, pos.z);
  }
}

/** Returns world position of the ship mesh center (for bullet spawn). */
export function getBulletSpawnOffset() {
  if (!ship) return null;
  const s = ship.scale.x;
  return {
    x: ship.position.x + center.x * s,
    y: ship.position.y + center.y * s,
    z: ship.position.z + center.z * s,
  };
}

/** Returns world position of the ship collider center (for asteroid collision). */
export function getShipColliderCenter() {
  if (!ship) return null;
  const s = ship.scale.x;
  const ox = -SHIP_COLLIDER_OFFSET.x * s;
  const oy = SHIP_COLLIDER_OFFSET.y * s;
  const oz = -SHIP_COLLIDER_OFFSET.z * s;
  return {
    x: ship.position.x + center.x * s + ox,
    y: ship.position.y + center.y * s + oy,
    z: ship.position.z + center.z * s + oz,
  };
}

/** Collider center for a given logical ship position (state.ship.x, state.ship.y). Use this when checking collision after movement so the center matches the frame's position. */
export function getShipColliderCenterForLogicalPosition(logicalX, logicalY) {
  if (!ship) return null;
  const s = ship.scale.x;
  const ox = -SHIP_COLLIDER_OFFSET.x * s;
  const oy = SHIP_COLLIDER_OFFSET.y * s;
  const oz = -SHIP_COLLIDER_OFFSET.z * s;
  return {
    x: logicalX + ox,
    y: logicalY + oy,
    z: SHIP_Z_OFFSET + oz,
  };
}

export function disposeShip() {
  if (colliderDebug && colliderDebug.parent) {
    colliderDebug.parent.remove(colliderDebug);
  }
  if (colliderDebug) {
    colliderDebug.geometry?.dispose();
    colliderDebug.material?.dispose();
    colliderDebug = null;
  }
  disposeModel(ship);
  ship = null;
}
