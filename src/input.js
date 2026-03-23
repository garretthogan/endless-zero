const keys = {};
let mouseButtonDown = false;
let mouseNDC = null;
let canvasRect = { left: 0, top: 0, width: 1, height: 1 };
let _boundPointerDown = null;
let _boundPointerMove = null;
let _boundPointerUp = null;
let _boundPointerCancel = null;

let joystickTouchActive = false;
let joystickPointerId = null;
let joystickStartClientX = 0;
let joystickStartClientY = 0;
let joystickStartShipX = 0;
let joystickStartShipY = 0;
let joystickStartSet = false;
let currentTouchClientX = 0;
let currentTouchClientY = 0;
let joystickEl = null;
let joystickBaseEl = null;
let joystickKnobEl = null;

const JOYSTICK_MAX_KNOB_OFFSET_PX = 30;

const FIRE_KEYS = ['Space', 'Mouse0'];

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateJoystickVisual(active) {
  if (!joystickEl || !joystickBaseEl || !joystickKnobEl) return;
  if (!active) {
    joystickEl.classList.remove('active');
    joystickKnobEl.style.transform = '';
    return;
  }

  joystickEl.classList.add('active');
  joystickBaseEl.style.left = `${joystickStartClientX}px`;
  joystickBaseEl.style.top = `${joystickStartClientY}px`;

  const dx = currentTouchClientX - joystickStartClientX;
  const dy = currentTouchClientY - joystickStartClientY;
  joystickKnobEl.style.transform = `translate(${clamp(dx, -JOYSTICK_MAX_KNOB_OFFSET_PX, JOYSTICK_MAX_KNOB_OFFSET_PX)}px, ${clamp(dy, -JOYSTICK_MAX_KNOB_OFFSET_PX, JOYSTICK_MAX_KNOB_OFFSET_PX)}px)`;
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
    if (joystickTouchActive && e.pointerId === joystickPointerId) {
      e.preventDefault();
      currentTouchClientX = e.clientX;
      currentTouchClientY = e.clientY;
      updateJoystickVisual(true);
    } else {
      const ndc = clientToNDC(e.clientX, e.clientY, canvas);
      if (ndc) mouseNDC = ndc;
    }
  }
}

function onPointerDown(e, canvas) {
  if (e.button === 0) mouseButtonDown = true;
  if (e.pointerType === 'touch') {
    if (joystickTouchActive) return;
    e.preventDefault();
    joystickTouchActive = true;
    joystickPointerId = e.pointerId;
    joystickStartSet = false;
    joystickStartClientX = e.clientX;
    joystickStartClientY = e.clientY;
    currentTouchClientX = e.clientX;
    currentTouchClientY = e.clientY;
    mouseNDC = null;
    updateJoystickVisual(true);
  }
  document.body.style.cursor = 'none';
}

function onPointerUp(e) {
  if (e.button === 0) mouseButtonDown = false;
  if (e.pointerType === 'touch' && e.pointerId === joystickPointerId) {
    joystickTouchActive = false;
    joystickPointerId = null;
    joystickStartSet = false;
    mouseNDC = null;
    updateJoystickVisual(false);
  }
}

function onPointerLeave() {
  document.body.style.cursor = '';
}

function onPointerCancel(e) {
  if (e.pointerType !== 'touch' || e.pointerId !== joystickPointerId) return;
  joystickTouchActive = false;
  joystickPointerId = null;
  joystickStartSet = false;
  mouseNDC = null;
  updateJoystickVisual(false);
}

export function initInput(canvas) {
  if (!canvas) return;
  canvasRect = canvas.getBoundingClientRect();
  joystickEl = document.getElementById('touch-joystick');
  joystickBaseEl = joystickEl?.querySelector('.touch-joystick-base') ?? null;
  joystickKnobEl = joystickEl?.querySelector('.touch-joystick-knob') ?? null;

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', (e) => onMouseMove(e, canvas));
  _boundPointerDown = (e) => onPointerDown(e, canvas);
  _boundPointerMove = (e) => onPointerMove(e, canvas);
  _boundPointerUp = onPointerUp;
  _boundPointerCancel = onPointerCancel;
  window.addEventListener('pointerdown', _boundPointerDown);
  window.addEventListener('pointermove', _boundPointerMove, { passive: false });
  window.addEventListener('pointerup', _boundPointerUp);
  window.addEventListener('pointercancel', _boundPointerCancel);
  canvas.addEventListener('pointerleave', onPointerLeave);
}

export function getMouseNDC() {
  return mouseNDC;
}

/**
 * Returns the world-space position the ship should move toward, or null to hold current position.
 * On desktop/mouse: uses pointer position.
 * On touch: uses ship position at touch start + thumb trajectory in world space.
 */
export function getTargetWorldPosition(playArea, shipX, shipY) {
  if (joystickTouchActive) {
    if (!joystickStartSet) {
      joystickStartShipX = shipX;
      joystickStartShipY = shipY;
      joystickStartSet = true;
    }
    const pixelDeltaX = currentTouchClientX - joystickStartClientX;
    const pixelDeltaY = currentTouchClientY - joystickStartClientY;
    const worldW = playArea.right - playArea.left;
    const worldH = playArea.top - playArea.bottom;
    if (canvasRect.width <= 0 || canvasRect.height <= 0) {
      return { x: joystickStartShipX, y: joystickStartShipY };
    }
    const worldDeltaX = (pixelDeltaX / canvasRect.width) * worldW;
    const worldDeltaY = -(pixelDeltaY / canvasRect.height) * worldH;
    return {
      x: joystickStartShipX + worldDeltaX,
      y: joystickStartShipY + worldDeltaY,
    };
  }
  if (mouseNDC !== null) {
    const { left, right, top, bottom } = playArea;
    return {
      x: left + (mouseNDC.x + 1) / 2 * (right - left),
      y: bottom + (mouseNDC.y + 1) / 2 * (top - bottom),
    };
  }
  return null;
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
  if (_boundPointerCancel) {
    window.removeEventListener('pointercancel', _boundPointerCancel);
    _boundPointerCancel = null;
  }
  if (canvas) canvas.removeEventListener('pointerleave', onPointerLeave);
  joystickTouchActive = false;
  joystickPointerId = null;
  joystickStartSet = false;
  updateJoystickVisual(false);
  joystickEl = null;
  joystickBaseEl = null;
  joystickKnobEl = null;
}
