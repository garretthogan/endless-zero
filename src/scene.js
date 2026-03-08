import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const DEFAULT_SIZE = 20;
const FOV_DEG = 50;
let scene;
let camera;
let renderer;
let composer;
let outlinePass;
let halfWidth = DEFAULT_SIZE;
let halfHeight = DEFAULT_SIZE;

function createToonGradientMap() {
  const width = 4;
  const height = 1;
  const data = new Uint8Array(width * height * 4);
  const steps = [
    [30, 32, 45, 255],
    [80, 85, 110, 255],
    [160, 165, 190, 255],
    [255, 255, 255, 255],
  ];
  for (let i = 0; i < width; i++) {
    const o = i * 4;
    data[o] = steps[i][0];
    data[o + 1] = steps[i][1];
    data[o + 2] = steps[i][2];
    data[o + 3] = steps[i][3];
  }
  const tex = new THREE.DataTexture(data, width, height);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

let toonGradientMap = null;

function updatePlayAreaFromCamera() {
  const vFov = (FOV_DEG * Math.PI) / 180;
  const camZ = camera.position.z;
  halfHeight = Math.tan(vFov / 2) * camZ;
  halfWidth = halfHeight * camera.aspect;
}

function isMobileOrTouch() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function createScene(container) {
  scene = new THREE.Scene();

  let w = Math.max(1, container.clientWidth || window.innerWidth);
  let h = Math.max(1, container.clientHeight || window.innerHeight);
  const aspect = w / h;
  camera = new THREE.PerspectiveCamera(FOV_DEG, aspect, 0.1, 6000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  updatePlayAreaFromCamera();

  const useComposer = !isMobileOrTouch();
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.setClearColor(0x000011, 1);
  container.appendChild(renderer.domElement);

  toonGradientMap = createToonGradientMap();

  const ambient = new THREE.AmbientLight(0x8090b0, 0.7);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.4);
  directional.position.set(5, 8, 10);
  scene.add(directional);

  composer = null;
  outlinePass = null;
  if (useComposer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const resolution = new THREE.Vector2(w, h);
    outlinePass = new OutlinePass(resolution, scene, camera, []);
    outlinePass.edgeThickness = 1.5;
    outlinePass.edgeStrength = 2.5;
    outlinePass.visibleEdgeColor.set(0x000000);
    outlinePass.hiddenEdgeColor.set(0x000000);
    composer.addPass(outlinePass);
    composer.addPass(new OutputPass());
  }

  return { scene, camera, renderer };
}

export function getToonGradientMap() {
  return toonGradientMap;
}

export function getComposer() {
  return composer;
}

export function getOutlinePass() {
  return outlinePass;
}

export function getScene() {
  return scene;
}

export function getCamera() {
  return camera;
}

export function getRenderer() {
  return renderer;
}

export function getPlayArea() {
  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}

export function resize(container) {
  if (!renderer || !camera || !container) return;
  const w = Math.max(1, container.clientWidth || window.innerWidth);
  const h = Math.max(1, container.clientHeight || window.innerHeight);
  renderer.setSize(w, h);
  if (composer) {
    composer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
  }
  if (outlinePass) outlinePass.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  updatePlayAreaFromCamera();
}

export function dispose() {
  toonGradientMap?.dispose();
  toonGradientMap = null;
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }
}
