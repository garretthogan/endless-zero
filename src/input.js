const keys = {};
let mouseButtonDown = false;
let mouseNDC = null;
let canvasRect = { left: 0, top: 0, width: 1, height: 1 };
let _boundPointerDown = null;

const FIRE_KEYS = ['Space', 'Mouse0'];

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
  canvasRect = canvas.getBoundingClientRect();
  const ndcX = (e.clientX - canvasRect.left) / canvasRect.width * 2 - 1;
  const ndcY = -((e.clientY - canvasRect.top) / canvasRect.height * 2 - 1);
  mouseNDC = { x: ndcX, y: ndcY };
}

function onPointerDown(e, canvas) {
  if (e.button === 0) mouseButtonDown = true;
  document.body.style.cursor = 'none';
}

function onPointerUp(e) {
  if (e.button === 0) mouseButtonDown = false;
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
  window.addEventListener('pointerdown', _boundPointerDown);
  window.addEventListener('pointerup', onPointerUp);
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
  window.removeEventListener('pointerup', onPointerUp);
  if (canvas) canvas.removeEventListener('pointerleave', onPointerLeave);
}
