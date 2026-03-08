const keys = {};
let mouseButtonDown = false;
let mouseNDC = null;
let canvasRect = { left: 0, top: 0, width: 1, height: 1 };
let _boundPointerDown = null;
let _boundPointerMove = null;
let _boundPointerUp = null;

const FIRE_KEYS = ['Space', 'Mouse0'];

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function clientToNDC(clientX, clientY, canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const ndcX = (clientX - rect.left) / rect.width * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height * 2 - 1);
  return { x: ndcX, y: ndcY };
}

function onKeyDown(e) {
  keys[e.code] = true;
  if (FIRE_KEYS.includes(e.code)) e.preventDefault();
}

function onKeyUp(e) {
  keys[e.code] = false;
  if (e.code === 'Escape') document.body.style.cursor = '';
}

function onMouseMove(e, canvas) {
  if (!canvas) return;
  if (isTouchDevice()) return;
  canvasRect = canvas.getBoundingClientRect();
  const ndc = clientToNDC(e.clientX, e.clientY, canvas);
  if (ndc) mouseNDC = ndc;
}

function onPointerMove(e, canvas) {
  if (!canvas) return;
  canvasRect = canvas.getBoundingClientRect();
  if (e.pointerType === 'touch') {
    e.preventDefault();
    const ndc = clientToNDC(e.clientX, e.clientY, canvas);
    if (ndc) mouseNDC = ndc;
  }
}

function onPointerDown(e, canvas) {
  if (e.button === 0) mouseButtonDown = true;
  if (e.pointerType === 'touch') {
    const ndc = clientToNDC(e.clientX, e.clientY, canvas);
    if (ndc) mouseNDC = ndc;
  }
  document.body.style.cursor = 'none';
}

function onPointerUp(e) {
  if (e.button === 0) mouseButtonDown = false;
  if (e.pointerType === 'touch') {
    mouseNDC = null;
  }
}

function onPointerLeave() {
  document.body.style.cursor = '';
}

export function initInput(canvas) {
  if (!canvas) return;
  canvasRect = canvas.getBoundingClientRect();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', (e) => onMouseMove(e, canvas));
  _boundPointerDown = (e) => onPointerDown(e, canvas);
  _boundPointerMove = (e) => onPointerMove(e, canvas);
  _boundPointerUp = onPointerUp;
  window.addEventListener('pointerdown', _boundPointerDown);
  window.addEventListener('pointermove', _boundPointerMove, { passive: false });
  window.addEventListener('pointerup', _boundPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
}

export function getMouseNDC() {
  return mouseNDC;
}

export function getFireHeld() {
  return mouseButtonDown || (keys['Space'] ?? false);
}

export function removeInputListeners(canvas) {
  document.body.style.cursor = '';
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  if (_boundPointerDown) {
    window.removeEventListener('pointerdown', _boundPointerDown);
    _boundPointerDown = null;
  }
  if (_boundPointerMove) {
    window.removeEventListener('pointermove', _boundPointerMove);
    _boundPointerMove = null;
  }
  if (_boundPointerUp) {
    window.removeEventListener('pointerup', _boundPointerUp);
    _boundPointerUp = null;
  }
  if (canvas) canvas.removeEventListener('pointerleave', onPointerLeave);
}
