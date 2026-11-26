// Input: keyboard state for the stick and throttle, plus mouse clicks on the
// canvas buttons the renderer draws (menus) and a click to resume from pause.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    clicked: null,
    mouse: { x: 0, y: 0 },
  };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    keys.add(event.key.toLowerCase());
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.clicked = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    input.mouse = { x: input.clicked.x, y: input.clicked.y };
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });

  return input;
}

/** Stick + throttle from the current key set: pitch -1..1, roll -1..1. */
export function readFlightInput(input) {
  const keys = input.keys;
  const pitchUp = keys.has('arrowup') || keys.has('i');
  const pitchDown = keys.has('arrowdown') || keys.has('k');
  const rollLeft = keys.has('arrowleft') || keys.has('a') || keys.has('j');
  const rollRight = keys.has('arrowright') || keys.has('d') || keys.has('l');
  const throttleUp = keys.has('w');
  const throttleDown = keys.has('s');
  return {
    pitch: (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0),
    roll: (rollRight ? 1 : 0) - (rollLeft ? 1 : 0),
    throttle: (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0),
  };
}

/** True once when the key was pressed (consumed by the caller). */
export function pressed(input, key) {
  if (!input.keys.has(key)) return false;
  input.keys.delete(key);
  return true;
}

/** The click point since the last frame, or null. Consumed on read. */
export function takeClick(input) {
  const click = input.clicked;
  input.clicked = null;
  return click;
}

/** True when the click point falls inside a button rect. */
export function hitButton(click, button) {
  return (
    click !== null
    && click.x >= button.x
    && click.x <= button.x + button.w
    && click.y >= button.y
    && click.y <= button.y + button.h
  );
}
