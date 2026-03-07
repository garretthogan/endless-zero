import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const STAR_COUNT = 4200;
const STAR_SPEED = 6050;
const Z_STAR_BACK = -6050;
const Z_STAR_FRONT = -1050;
const Z_STAR_RANGE = Z_STAR_FRONT - Z_STAR_BACK;
const SPREAD = 5500;
const SPREAD_INNER = 0.085;
const STREAK_LENGTH_FAR = 2;
const STREAK_LENGTH_NEAR = 1020;
const LENGTH_POWER = 1.8;
const NUM_WIDTH_BUCKETS = 5;
const WIDTH_MIN = 0.24;
const WIDTH_MAX = 4.5;
const WIDTH_OUTLINE_SCALE = 1;
const BUCKET_MAX = 300;
const STAR_COLOR = 0x6bb5d8;
const OUTLINE_COLOR = 0xffffff;

function randomStarXY() {
  const angle = Math.random() * Math.PI * 2;
  const r = SPREAD * (SPREAD_INNER + (1 - SPREAD_INNER) * Math.random());
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

let lineSegments;
let headPositions;
let starfieldGroup;
let bucketGeometries;
let bucketCounts;

export function createStarfield(parentScene) {
  starfieldGroup = new THREE.Group();
  headPositions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const xy = randomStarXY();
    headPositions[i * 3] = xy.x;
    headPositions[i * 3 + 1] = xy.y;
    headPositions[i * 3 + 2] = Z_STAR_BACK + Math.random() * Z_STAR_RANGE;
  }

  bucketGeometries = [];
  bucketCounts = new Uint32Array(NUM_WIDTH_BUCKETS);
  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);

  for (let b = 0; b < NUM_WIDTH_BUCKETS; b++) {
    const width = WIDTH_MIN + (b / (NUM_WIDTH_BUCKETS - 1)) * (WIDTH_MAX - WIDTH_MIN);
    const geom = new LineSegmentsGeometry();
    geom.setPositions(new Float32Array(BUCKET_MAX * 6));
    const matOutline = new LineMaterial({
      color: OUTLINE_COLOR,
      linewidth: width * WIDTH_OUTLINE_SCALE,
      resolution,
      transparent: true,
      opacity: 0.95,
    });
    const matMain = new LineMaterial({
      color: STAR_COLOR,
      linewidth: width,
      resolution,
      transparent: true,
      opacity: 0.95,
    });
    const outlineSegs = new LineSegments2(geom, matOutline);
    outlineSegs.renderOrder = -2;
    starfieldGroup.add(outlineSegs);
    const mainSegs = new LineSegments2(geom, matMain);
    mainSegs.renderOrder = -1;
    starfieldGroup.add(mainSegs);
    bucketGeometries.push(geom);
  }
  lineSegments = starfieldGroup.children;
  starfieldGroup.renderOrder = -1;

  writeStreaks();
  parentScene.add(starfieldGroup);
  return starfieldGroup;
}

function writeStreaks() {
  const head = headPositions;
  const zMin = Z_STAR_BACK;
  const zRange = Z_STAR_RANGE;
  for (let b = 0; b < NUM_WIDTH_BUCKETS; b++) bucketCounts[b] = 0;

  for (let i = 0; i < STAR_COUNT; i++) {
    const x = head[i * 3];
    const y = head[i * 3 + 1];
    const z = head[i * 3 + 2];
    const t = Math.max(0, Math.min(1, (z - zMin) / zRange));
    const len = STREAK_LENGTH_FAR + Math.pow(t, LENGTH_POWER) * (STREAK_LENGTH_NEAR - STREAK_LENGTH_FAR);
    const bucket = Math.min(NUM_WIDTH_BUCKETS - 1, Math.floor(t * NUM_WIDTH_BUCKETS));
    const c = bucketCounts[bucket];
    if (c >= BUCKET_MAX) continue;
    const arr = bucketGeometries[bucket].attributes.instanceStart.array;
    const j = c * 6;
    arr[j] = x;
    arr[j + 1] = y;
    arr[j + 2] = z - len;
    arr[j + 3] = x;
    arr[j + 4] = y;
    arr[j + 5] = z;
    bucketCounts[bucket]++;
  }

  for (let b = 0; b < NUM_WIDTH_BUCKETS; b++) {
    const geom = bucketGeometries[b];
    geom.instanceCount = bucketCounts[b];
    geom.attributes.instanceStart.needsUpdate = true;
    geom.attributes.instanceEnd.needsUpdate = true;
  }
}

export function updateStarfield(dt, cameraZ) {
  if (!headPositions) return;
  const cullZ = typeof cameraZ === 'number' ? cameraZ : 50;
  const pos = headPositions;
  for (let i = 0; i < STAR_COUNT; i++) {
    pos[i * 3 + 2] += STAR_SPEED * dt;
    if (pos[i * 3 + 2] > cullZ) {
      pos[i * 3 + 2] = Z_STAR_BACK + Math.random() * Z_STAR_RANGE;
      const xy = randomStarXY();
      pos[i * 3] = xy.x;
      pos[i * 3 + 1] = xy.y;
    }
  }
  writeStreaks();
}

export function setStarfieldResolution(width, height) {
  if (!lineSegments?.length) return;
  const res = new THREE.Vector2(width, height);
  lineSegments.forEach((segs) => {
    if (segs.material?.resolution) segs.material.resolution.copy(res);
  });
}

export function disposeStarfield() {
  if (!starfieldGroup) return;
  bucketGeometries?.forEach((geom) => geom.dispose());
  starfieldGroup.children.forEach((segs) => segs.material?.dispose());
  starfieldGroup.clear();
}
