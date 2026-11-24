// Keyboard and mouse input: held keys, edge-triggered presses, pointer lock mouse deltas.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const state = {
    mouseDX: 0,
    mouseDY: 0,
    wheel: 0,
    lmb: false,
    rmb: false,
    lmbPressed: false,
    locked: false,
    enabled: false,
    onLockChange: null,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    held.add(e.code);
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    state.lmb = state.rmb = false;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      state.lmb = true;
      state.lmbPressed = true;
    }
    if (e.button === 2) state.rmb = true;
    if (state.enabled && !state.locked && !state.noLock) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* ignore */ } }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.lmb = false;
    if (e.button === 2) state.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (state.locked || state.dragLook) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
    }
  });
  window.addEventListener(
    'wheel',
    (e) => {
      state.wheel += Math.sign(e.deltaY);
    },
    { passive: true },
  );
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    state.onLockChange?.(state.locked);
  });

  return {
    state,
    down: (code) => held.has(code),
    hit: (code) => pressed.has(code),
    axis(neg, pos) {
      return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
    },
    lock() {
      try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed here */ }
    },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock?.();
    },
    endFrame() {
      pressed.clear();
      state.mouseDX = 0;
      state.mouseDY = 0;
      state.wheel = 0;
      state.lmbPressed = false;
    },
  };
}
