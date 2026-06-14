/*
 * engine.js — the platformer engine (Part A foundation).
 *
 * Responsibilities:
 *   - fixed-timestep game loop
 *   - player physics with a deliberate "Mario feel"
 *   - AABB collision against solid platforms
 *   - a side-scrolling camera that follows the player
 *   - rendering of the world (placeholder shapes for now; sprites land later)
 *
 * It knows nothing about specific levels. In Part C it will be fed a level
 * described by JSON. For Part A the level is handed in by game.js.
 */

const Engine = (() => {
  // ---- Tuning: the numbers that make it feel like Mario ----------------
  // Units are pixels and seconds. Tuned against a 960x540 internal canvas.
  const TUNING = {
    gravity: 2400,        // downward accel
    fallGravity: 3000,    // stronger when falling -> snappy descent
    moveAccel: 5200,      // horizontal accel while holding a direction
    airAccel: 3200,       // weaker control in the air
    friction: 6000,       // decel when no direction held (on ground)
    maxRunSpeed: 360,     // horizontal top speed
    jumpSpeed: 880,       // initial upward velocity on jump
    minJumpSpeed: 360,    // velocity floor when jump released early (var height)
    maxFallSpeed: 1100,   // terminal velocity
    coyoteTime: 0.09,     // grace after leaving a ledge where jump still works
    jumpBuffer: 0.12,     // press jump slightly early and it still fires on land
  };

  const FIXED_DT = 1 / 120; // physics step (s)

  let canvas, ctx;
  let world = null;        // { player, platforms, bounds }
  let camera = { x: 0, y: 0 };
  let accumulator = 0;
  let lastTime = null;
  let running = false;

  // ---- World setup -----------------------------------------------------
  function load(spec) {
    world = {
      player: {
        x: spec.startPosition.x,
        y: spec.startPosition.y,
        w: 34,
        h: 46,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        coyote: 0,
        jumpBufferT: 0,
      },
      platforms: spec.platforms.map((p) => ({ ...p })),
      // hazards + collectibles. Sensible default size if a placement omits w/h.
      objects: (spec.objects || []).map((o) => ({
        w: 40, h: 40, points: 0, collected: false, ...o,
      })),
      score: 0,
      meta: spec.meta || null,
      start: { x: spec.startPosition.x, y: spec.startPosition.y },
      goal: spec.goal || null,
      bounds: spec.bounds || { x: 0, y: 0, w: 3000, h: 540 },
    };
    // preload any sprites the objects reference (rendered with a fallback)
    for (const o of world.objects) loadSprite(o.sprite);
    camera = { x: 0, y: 0 };
  }

  // ---- Sprite cache ----------------------------------------------------
  // Object art is data-driven: objects.json gives each object a sprite PATH.
  // We load it once and draw it; until it's ready (or if it's missing) we fall
  // back to a coloured placeholder so the game never blanks out.
  const sprites = {}; // path -> { img, ready }
  function loadSprite(path) {
    if (!path || sprites[path]) return;
    const rec = { img: new Image(), ready: false };
    rec.img.onload = () => { rec.ready = true; };
    rec.img.onerror = () => { rec.ready = false; };
    rec.img.src = path;
    sprites[path] = rec;
  }

  // ---- Physics ---------------------------------------------------------
  function update(dt) {
    const p = world.player;
    const t = TUNING;

    // --- horizontal intent ---
    const dir = (Input.held.right ? 1 : 0) - (Input.held.left ? 1 : 0);
    const accel = p.onGround ? t.moveAccel : t.airAccel;

    if (dir !== 0) {
      p.vx += dir * accel * dt;
      p.facing = dir;
    } else if (p.onGround) {
      // friction toward zero
      const sign = Math.sign(p.vx);
      p.vx -= sign * t.friction * dt;
      if (Math.sign(p.vx) !== sign) p.vx = 0;
    }
    p.vx = clamp(p.vx, -t.maxRunSpeed, t.maxRunSpeed);

    // --- jump: coyote time + input buffering ---
    if (Input.consumeJumpPress()) p.jumpBufferT = t.jumpBuffer;
    p.jumpBufferT = Math.max(0, p.jumpBufferT - dt);
    p.coyote = p.onGround ? t.coyoteTime : Math.max(0, p.coyote - dt);

    if (p.jumpBufferT > 0 && p.coyote > 0) {
      p.vy = -t.jumpSpeed;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBufferT = 0;
    }

    // variable jump height: cut the rise short if jump released early
    if (p.vy < 0 && !Input.isJumpHeld()) {
      p.vy = Math.max(p.vy, -t.minJumpSpeed);
    }

    // --- gravity ---
    const g = p.vy > 0 ? t.fallGravity : t.gravity;
    p.vy = Math.min(p.vy + g * dt, t.maxFallSpeed);

    // --- integrate + collide, one axis at a time ---
    p.onGround = false;
    p.x += p.vx * dt;
    resolveAxis('x');
    p.y += p.vy * dt;
    resolveAxis('y');

    // --- keep inside the level bounds horizontally ---
    const b = world.bounds;
    if (p.x < b.x) { p.x = b.x; p.vx = 0; }
    if (p.x + p.w > b.x + b.w) { p.x = b.x + b.w - p.w; p.vx = 0; }

    // --- hazards / collectibles ---
    handleObjects();

    // --- fell off the bottom: that's a death, restart the run ---
    if (p.y > b.y + b.h + 200) resetRun();
  }

  // Collide the player against world objects: collect collectibles (score up),
  // die on hazards (restart the run). Power-ups are handled in Part G.
  function handleObjects() {
    const p = world.player;
    for (const o of world.objects) {
      if (o.collected) continue;
      if (!aabb(p, o)) continue;
      if (o.type === 'collectible') {
        o.collected = true;
        world.score += o.points || 0;
      } else if (o.type === 'hazard') {
        resetRun();
        return; // player has been moved; stop checking this frame
      }
    }
  }

  function resolveAxis(axis) {
    const p = world.player;
    for (const plat of world.platforms) {
      if (!aabb(p, plat)) continue;
      if (axis === 'x') {
        if (p.vx > 0) p.x = plat.x - p.w;
        else if (p.vx < 0) p.x = plat.x + plat.w;
        p.vx = 0;
      } else {
        if (p.vy > 0) {
          p.y = plat.y - p.h;
          p.onGround = true;
        } else if (p.vy < 0) {
          p.y = plat.y + plat.h;
        }
        p.vy = 0;
      }
    }
  }

  // Restart the whole run: player back to start, score zeroed, collectibles
  // returned. "The run" is the unit you lose when you touch a hazard.
  function resetRun() {
    const p = world.player;
    p.x = world.start.x; p.y = world.start.y;
    p.vx = 0; p.vy = 0;
    p.onGround = false; p.coyote = 0; p.jumpBufferT = 0;
    world.score = 0;
    for (const o of world.objects) o.collected = false;
  }

  // ---- Camera ----------------------------------------------------------
  function updateCamera() {
    const p = world.player;
    const b = world.bounds;
    // center the player, then clamp to the level so we never show the void
    let targetX = p.x + p.w / 2 - canvas.width / 2;
    camera.x = clamp(targetX, b.x, Math.max(b.x, b.x + b.w - canvas.width));
    camera.y = 0;
  }

  // ---- Render ----------------------------------------------------------
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // simple parallax sky bands so motion reads clearly
    drawBackground();

    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    for (const plat of world.platforms) drawPlatform(plat);
    drawGoal(world.goal);
    for (const o of world.objects) if (!o.collected) drawObject(o);
    drawPlayer(world.player);

    ctx.restore();

    drawHUD(); // screen-space, not affected by the camera
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#16203a');
    g.addColorStop(1, '#0b1220');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlatform(plat) {
    ctx.fillStyle = '#33415c';
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = '#475569';
    ctx.fillRect(plat.x, plat.y, plat.w, 6); // top lip
  }

  // Draw an object from its sprite (path comes from data/objects.json). If the
  // sprite isn't loaded yet, fall back to a coloured block + glyph by type.
  function drawObject(o) {
    const rec = o.sprite && sprites[o.sprite];
    if (rec && rec.ready) {
      ctx.drawImage(rec.img, o.x, o.y, o.w, o.h);
      return;
    }
    const isHazard = o.type === 'hazard';
    ctx.fillStyle = isHazard ? '#fb7185' : '#fbbf24'; // coral hazard / amber pickup
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = '#0b1220';
    ctx.font = `${Math.floor(o.h * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isHazard ? '☠' : '✦', o.x + o.w / 2, o.y + o.h / 2 + 1);
    ctx.textAlign = 'left';
  }

  // The finish flag, drawn from the level's goal position.
  function drawGoal(g) {
    if (!g) return;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(g.x, g.y, 4, 64); // pole
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.moveTo(g.x + 4, g.y);
    ctx.lineTo(g.x + 30, g.y + 9);
    ctx.lineTo(g.x + 4, g.y + 18);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer(p) {
    // placeholder body — the pixel face replaces the head in Part E
    ctx.fillStyle = '#2dd4bf'; // teal
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // a little eye so facing direction is visible
    ctx.fillStyle = '#0b1220';
    const eyeX = p.facing >= 0 ? p.x + p.w - 12 : p.x + 6;
    ctx.fillRect(eyeX, p.y + 12, 6, 6);
  }

  function drawHUD() {
    ctx.fillStyle = '#f5f1e6'; // cream
    ctx.font = '700 26px ui-monospace, "IBM Plex Mono", Menlo, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('SCORE ' + String(world.score).padStart(4, '0'), 22, 20);
  }

  // ---- Loop ------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    if (lastTime === null) lastTime = now;
    let delta = (now - lastTime) / 1000;
    lastTime = now;
    // guard against huge jumps (tab refocus) — cap catch-up
    delta = Math.min(delta, 0.1);

    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    updateCamera();
    render();
    requestAnimationFrame(frame);
  }

  function start(canvasEl, spec) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    load(spec);
    running = true;
    lastTime = null;
    accumulator = 0;
    requestAnimationFrame(frame);
  }

  // ---- helpers ---------------------------------------------------------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  return { start, get world() { return world; }, get camera() { return camera; } };
})();
