/*
 * input.js — keyboard input for the engine.
 *
 * Tracks which "actions" are currently held. The engine asks this each frame;
 * it never reads the keyboard directly. Touch controls are added in Part H and
 * will feed into this same action set, so the rest of the engine never changes.
 */

const Input = (() => {
  // Logical actions, decoupled from physical keys.
  const held = { left: false, right: false, jump: false, dash: false };

  // Edge-detection: was this action pressed THIS frame (not just held)?
  let jumpQueued = false;
  let dashQueued = false;

  const keyMap = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'jump',
    KeyW: 'jump',
    Space: 'jump',
    ShiftLeft: 'dash',
    ShiftRight: 'dash',
  };

  window.addEventListener('keydown', (e) => {
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    if (action === 'jump' && !held.jump) jumpQueued = true; // rising edge
    if (action === 'dash' && !held.dash) dashQueued = true;
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
    // Call once per frame to consume the jump press (rising edge).
    consumeJumpPress() {
      const was = jumpQueued;
      jumpQueued = false;
      return was;
    },
    // Same, for the grid-surge dash.
    consumeDashPress() {
      const was = dashQueued;
      dashQueued = false;
      return was;
    },
    isJumpHeld() {
      return held.jump;
    },
    // Used by touch controls to drive the same actions.
    setAction(action, isDown) {
      if (!(action in held)) return;
      if (action === 'jump' && isDown && !held.jump) jumpQueued = true;
      if (action === 'dash' && isDown && !held.dash) dashQueued = true;
      held[action] = isDown;
    },
  };
})();
