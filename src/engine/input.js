/*
 * input.js — keyboard input for the engine.
 *
 * Tracks which "actions" are currently held. The engine asks this each frame;
 * it never reads the keyboard directly. Touch controls are added in Part H and
 * will feed into this same action set, so the rest of the engine never changes.
 */

const Input = (() => {
  // Logical actions, decoupled from physical keys.
  const held = { left: false, right: false, jump: false };

  // Edge-detection: was "jump" pressed THIS frame (not just held)?
  let jumpPressed = false;
  let jumpQueued = false;

  const keyMap = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'jump',
    KeyW: 'jump',
    Space: 'jump',
  };

  window.addEventListener('keydown', (e) => {
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    if (action === 'jump' && !held.jump) jumpQueued = true; // rising edge
    held[action] = true;
  });

  window.addEventListener('keyup', (e) => {
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    held[action] = false;
  });

  return {
    held,
    // Call once per frame, at the top of update, to consume the jump press.
    consumeJumpPress() {
      jumpPressed = jumpQueued;
      jumpQueued = false;
      return jumpPressed;
    },
    isJumpHeld() {
      return held.jump;
    },
    // Used by touch controls (Part H) to drive the same actions.
    setAction(action, isDown) {
      if (!(action in held)) return;
      if (action === 'jump' && isDown && !held.jump) jumpQueued = true;
      held[action] = isDown;
    },
  };
})();
