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
  const POWER_DURATION = 6; // heat-pump power-up lasts this many seconds
  const POWER_JUMP_MULT = 1.32; // higher jump while powered
  const SURGE_SPEED_MULT = 1.9; // grid-surge dash speed multiplier
  const SHIELD_INVULN = 0.9; // brief invulnerability after insulation absorbs a hit
  const GREMLIN_DRAIN_CD = 0.7; // seconds between storage drains from one gremlin
  const STOMP_BOUNCE = 540; // upward hop after stomping an enemy

  // Respect the user's motion preference for the power-up pulse.
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas, ctx;
  let world = null;        // { player, platforms, bounds }
  let camera = { x: 0, y: 0 };
  let accumulator = 0;
  let lastTime = null;
  let running = false;
  let onWin = null; // callback fired once when the player reaches the goal

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
        powerT: 0,    // seconds of heat-pump power-up remaining
        shield: false, // insulation: absorbs one hazard hit
        invulnT: 0,   // brief grace after a shield break
        dying: false, // playing the death animation
        deathT: 0,    // time into the death animation
        ridingActor: null, // moving platform the player is standing on
      },
      platforms: spec.platforms.map((p) => ({ ...p })),
      // moving platforms / dynamic things (Part: reusable mechanics)
      actors: (spec.actors || []).map((a) => ({
        dir: a.dir != null ? a.dir : 1, dir0: a.dir != null ? a.dir : 1,
        off: 0, dx: 0, dy: 0, broken: false, dead: false,
        fireT: a.interval != null ? a.interval : 2,
        x0: a.x, y0: a.y, w: a.w || 80, h: a.h || 16,
        distance: a.distance != null ? a.distance : 120,
        speed: a.speed || 60,
        ...a,
      })),
      // hazards + collectibles. Sensible default size if a placement omits w/h.
      objects: (spec.objects || []).map((o) => ({
        w: 40, h: 40, points: 0, collected: false, drainCD: 0, ...o,
      })),
      score: 0,
      meta: spec.meta || null,
      accent: (spec.meta && spec.meta.accentColor) || '#2dd4bf',
      start: { x: spec.startPosition.x, y: spec.startPosition.y },
      goal: spec.goal || null,
      bounds: spec.bounds || { x: 0, y: 0, w: 3000, h: 540 },
      // storage-meter mechanic (only some levels have it)
      mechanic: spec.mechanic || null,
      storage: null,
      surgeT: 0,
      surgeReady: false,
      curtailT: 0,
      won: false,      // reached the goal
      winT: 0,         // time since winning (drives the confetti shower)
      freezeT: 0,      // hit-stop timer
      particles: [],   // transient visual bits (death burst, confetti)
      projectiles: [], // emitter bolts in flight
    };
    if (world.mechanic && world.mechanic.type === 'storage-meter') {
      world.storage = {
        capacity: world.mechanic.startSegments || 0, // segments unlocked (grown by batteries)
        fill: 0,                                      // segments currently holding clean energy
        max: world.mechanic.maxSegments || 8,
      };
    }
    // preload any sprites the objects reference (rendered with a fallback)
    for (const o of world.objects) loadSprite(o.sprite);
    // point the face system at this level's face asset (Part E)
    Face.setFace(spec.meta && spec.meta.faceAsset);
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

  // NZA branding: the logo, drawn as a faint watermark behind the play area.
  const logo = { img: new Image(), ready: false };
  logo.img.onload = () => { logo.ready = true; };
  logo.img.src = 'public/nza-logo.svg';

  // ---- Physics ---------------------------------------------------------
  function update(dt) {
    const p = world.player;
    const t = TUNING;

    // Hit-stop, death, and the win celebration each take over the simulation.
    if (world.freezeT > 0) { world.freezeT = Math.max(0, world.freezeT - dt); updateParticles(dt); return; }
    if (p.dying) { updateDeath(dt); return; }
    if (world.won) {
      world.winT += dt;
      if (!reduceMotion && world.winT < 3 && world.particles.length < 220) spawnConfetti(2);
      updateParticles(dt);
      return;
    }

    // move platforms first, and carry the player if they're riding one
    updateActors(dt);

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
    const maxRun = world.surgeT > 0 ? t.maxRunSpeed * SURGE_SPEED_MULT : t.maxRunSpeed;
    p.vx = clamp(p.vx, -maxRun, maxRun);

    // --- jump: coyote time + input buffering ---
    if (Input.consumeJumpPress()) p.jumpBufferT = t.jumpBuffer;
    p.jumpBufferT = Math.max(0, p.jumpBufferT - dt);
    p.coyote = p.onGround ? t.coyoteTime : Math.max(0, p.coyote - dt);

    if (p.jumpBufferT > 0 && p.coyote > 0) {
      p.vy = -t.jumpSpeed * (p.powerT > 0 ? POWER_JUMP_MULT : 1);
      p.onGround = false;
      p.coyote = 0;
      p.jumpBufferT = 0;
      sfx('jump');
    }

    // tick down timers
    if (p.powerT > 0) p.powerT = Math.max(0, p.powerT - dt);
    if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
    for (const o of world.objects) if (o.drainCD > 0) o.drainCD -= dt;

    // grid-surge: spend a full storage meter on a dash
    updateSurge(dt, Input.consumeDashPress ? Input.consumeDashPress() : false);

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

    // --- hazards / collectibles / enemies / projectiles ---
    handleObjects();
    handleEnemies();
    updateProjectiles(dt);

    // --- reached the goal? celebrate ---
    if (world.goal && !world.won && aabb(p, goalBox(world.goal))) triggerWin();

    // --- fell off the bottom: that's a death, restart the run ---
    if (p.y > b.y + b.h + 200) resetRun();
  }

  // Storage-meter surge: when the meter is full you can spend it on a dash that
  // boosts speed and makes you briefly invincible. Only active on levels whose
  // mechanic is 'storage-meter'.
  function updateSurge(dt, dashPressed) {
    const s = world.storage;
    if (world.surgeT > 0) world.surgeT = Math.max(0, world.surgeT - dt);
    if (world.curtailT > 0) world.curtailT = Math.max(0, world.curtailT - dt);
    // "meter full" = every unlocked segment is holding energy
    world.surgeReady = !!(s && s.capacity >= 1 && s.fill >= s.capacity && world.surgeT <= 0);
    if (dashPressed && world.surgeReady) {
      const dur = (world.mechanic.surge && world.mechanic.surge.duration) || 4;
      world.surgeT = dur;
      s.fill = 0; // spend the stored energy
      world.surgeReady = false;
      const p = world.player;
      p.vx = p.facing * TUNING.maxRunSpeed * SURGE_SPEED_MULT; // instant dash kick
      sfx('surge');
    }
  }

  function invincible() {
    const p = world.player;
    return p.powerT > 0 || world.surgeT > 0 || p.invulnT > 0;
  }

  // Collide the player against world objects. Behaviour depends on type and the
  // object's `effect` (from objects.json) and whether the level runs the
  // storage-meter mechanic.
  function handleObjects() {
    const p = world.player;
    const s = world.storage;
    for (const o of world.objects) {
      if (o.collected) continue;
      if (!aabb(p, o)) continue;

      if (o.type === 'collectible') {
        if (o.effect === 'grow-storage') {
          // battery: unlock another storage segment, and score its points
          if (s) s.capacity = Math.min(s.max, s.capacity + 1);
          o.collected = true;
          world.score += o.points || 0;
          sfx('collect-low');
        } else if (s) {
          // renewable on a storage-meter level: only banks if there's room
          if (s.fill < s.capacity) {
            s.fill += 1;
            world.score += o.points || 0; // banked
            o.collected = true;
            sfx('bank');
          } else {
            o.collected = true;     // curtailment: storage full → energy wasted
            world.curtailT = 1.6;   // brief on-screen warning, no points
            sfx('curtail');
          }
        } else {
          // no storage mechanic on this level: score normally
          o.collected = true;
          world.score += o.points || 0;
          sfx(soundKey(o));
        }
      } else if (o.type === 'powerup') {
        o.collected = true;
        if (o.effect === 'shield-one-hit') {
          p.shield = true; // insulation: fabric first
          sfx('shield');
        } else {
          p.powerT = POWER_DURATION; // supercharge (heat pump)
          sfx('powerup');
        }
      } else if (o.type === 'hazard') {
        if (o.effect === 'drain-storage') {
          // standby gremlin: nibbles a stored segment on contact, doesn't kill
          if (s && o.drainCD <= 0 && s.fill > 0) {
            s.fill -= 1;
            o.drainCD = GREMLIN_DRAIN_CD;
            sfx('drain');
          }
          continue;
        }
        if (invincible()) continue; // powered / surging / post-shield grace
        if (p.shield) {
          p.shield = false;   // insulation absorbs the hit
          p.invulnT = SHIELD_INVULN;
          sfx('shield');
          continue;
        }
        startDeath();
        return; // the death sequence takes over
      }
    }
  }

  function resolveAxis(axis) {
    const p = world.player;
    if (axis === 'y') p.ridingActor = null;
    for (const plat of world.platforms) resolveSolid(p, plat, axis, null);
    for (const a of world.actors) {
      if (a.broken) continue;
      if (a.type === 'mover') resolveSolid(p, a, axis, a);
      else if (a.type === 'block') resolveBlock(p, a, axis);
    }
  }

  // Resolve the player against one solid (a static platform or a moving one).
  function resolveSolid(p, plat, axis, rider) {
    if (!aabb(p, plat)) return;
    if (axis === 'x') {
      if (p.vx > 0) p.x = plat.x - p.w;
      else if (p.vx < 0) p.x = plat.x + plat.w;
      p.vx = 0;
    } else {
      if (p.vy > 0) {
        p.y = plat.y - p.h;
        p.onGround = true;
        if (rider) p.ridingActor = rider; // remember the platform we're standing on
      } else if (p.vy < 0) {
        p.y = plat.y + plat.h;
      }
      p.vy = 0;
    }
  }

  // Breakable block: solid, but a bash from below shatters it (and may drop a
  // collectible). Stand on top / bump the sides = solid.
  function resolveBlock(p, b, axis) {
    if (!aabb(p, b)) return;
    if (axis === 'y') {
      if (p.vy < 0) { breakBlock(b); p.vy = 0; return; } // bashed from below — bonk!
      if (p.vy > 0) { p.y = b.y - p.h; p.onGround = true; } // stand on top
      else return;
      p.vy = 0;
    } else {
      if (p.vx > 0) p.x = b.x - p.w;
      else if (p.vx < 0) p.x = b.x + b.w;
      p.vx = 0;
    }
  }

  function breakBlock(b) {
    if (b.broken) return;
    b.broken = true;
    spawnBurst(b.x + b.w / 2, b.y + b.h / 2, ['#94a3b8', '#cbd5e1', '#64748b'], 12);
    sfx('break');
    if (b.dropDef) {
      loadSprite(b.dropDef.sprite);
      world.objects.push({
        ...b.dropDef, x: b.x + b.w / 2 - 20, y: b.y - 44,
        w: 40, h: 40, collected: false, drainCD: 0, spawned: true,
      });
    }
  }

  // Move moving platforms along their path and carry the rider with them.
  function updateActors(dt) {
    for (const a of world.actors) {
      if (a.type === 'mover') {
        const px = a.x, py = a.y;
        a.off += a.dir * a.speed * dt;
        if (a.off >= a.distance) { a.off = a.distance; a.dir = -1; }
        else if (a.off <= 0) { a.off = 0; a.dir = 1; }
        if (a.axis === 'y') a.y = a.y0 + a.off;
        else a.x = a.x0 + a.off;
        a.dx = a.x - px;
        a.dy = a.y - py;
      } else if (a.type === 'enemy' && !a.dead) {
        const rng = a.range != null ? a.range : 120;
        a.off += a.dir * a.speed * dt;
        if (a.off >= rng) { a.off = rng; a.dir = -1; }
        else if (a.off <= 0) { a.off = 0; a.dir = 1; }
        a.x = a.x0 + a.off;
        a.facing = a.dir;
      } else if (a.type === 'emitter') {
        a.fireT -= dt;
        if (a.fireT <= 0) {
          a.fireT = a.interval || 2;
          const inRange = a.range == null || Math.abs(world.player.x - a.x) <= a.range;
          if (inRange) fireProjectile(a);
        }
      }
    }
    const p = world.player;
    if (p.ridingActor) { p.x += p.ridingActor.dx || 0; p.y += p.ridingActor.dy || 0; }
  }

  // Emitter fires a bolt in its facing direction.
  function fireProjectile(a) {
    const dir = a.dir || -1;
    world.projectiles.push({
      x: dir > 0 ? a.x + a.w : a.x - 14,
      y: a.y + a.h / 2 - 7,
      w: 14, h: 14,
      vx: dir * (a.speed || 220),
    });
  }

  // Move bolts, cull off-screen, and kill the player on contact.
  function updateProjectiles(dt) {
    const p = world.player, b = world.bounds, ps = world.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.x += q.vx * dt;
      if (q.x < b.x - 60 || q.x > b.x + b.w + 60) { ps.splice(i, 1); continue; }
      if (!aabb(p, q)) continue;
      ps.splice(i, 1);
      if (invincible()) continue;
      if (p.shield) { p.shield = false; p.invulnT = SHIELD_INVULN; sfx('shield'); continue; }
      startDeath();
      return;
    }
  }

  // Player vs patrolling enemies: a stomp from above defeats them (bounce +
  // points); any other contact is lethal (unless powered / shielded).
  function handleEnemies() {
    const p = world.player;
    for (const e of world.actors) {
      if (e.type !== 'enemy' || e.dead) continue;
      if (!aabb(p, e)) continue;
      const stomping = p.vy > 0 && (p.y + p.h) <= e.y + e.h * 0.6; // forgiving stomp
      if (stomping) {
        e.dead = true;
        world.score += e.points || 0;
        p.vy = -STOMP_BOUNCE;
        spawnBurst(e.x + e.w / 2, e.y + e.h / 2, ['#fbbf24', '#f5f1e6', '#9ca3af'], 10);
        sfx('break');
      } else if (!invincible()) {
        if (p.shield) { p.shield = false; p.invulnT = SHIELD_INVULN; sfx('shield'); continue; }
        startDeath();
        return;
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
    p.powerT = 0; p.shield = false; p.invulnT = 0;
    p.dying = false; p.deathT = 0;
    world.score = 0;
    world.surgeT = 0; world.surgeReady = false; world.curtailT = 0;
    world.won = false; world.winT = 0;
    world.freezeT = 0; world.particles = [];
    p.ridingActor = null;
    world.projectiles = [];
    for (const a of world.actors) {
      a.off = 0; a.dir = a.dir0; a.x = a.x0; a.y = a.y0; a.dx = 0; a.dy = 0;
      a.broken = false; a.dead = false; a.fireT = a.interval != null ? a.interval : 2;
    }
    if (world.storage) {
      world.storage.capacity = world.mechanic.startSegments || 0;
      world.storage.fill = 0;
    }
    world.objects = world.objects.filter((o) => !o.spawned); // drop block-spawned items
    for (const o of world.objects) { o.collected = false; o.drainCD = 0; }
  }

  // ---- Death (Mario-style) ---------------------------------------------
  // A brief hit-stop for impact, then the player pops up, tumbles, and falls
  // off the bottom of the screen before the run restarts.
  function startDeath() {
    const p = world.player;
    if (p.dying) return;
    p.dying = true;
    p.deathT = 0;
    p.vx = 0;
    p.vy = -780;          // the death "hop"
    world.freezeT = 0.1;  // hit-stop on impact
    spawnBurst(p.x + p.w / 2, p.y + p.h / 2, ['#fb7185', '#fbbf24', '#f5f1e6'], 16);
    sfx('lose');
  }

  function updateDeath(dt) {
    const p = world.player;
    p.deathT += dt;
    p.vy = Math.min(p.vy + TUNING.fallGravity * dt, TUNING.maxFallSpeed);
    p.y += p.vy * dt; // falls straight through everything
    updateParticles(dt);
    if (p.y > world.bounds.y + world.bounds.h + 300 || p.deathT > 1.9) resetRun();
  }

  // ---- Particles (death burst, pickups) --------------------------------
  function spawnBurst(x, y, colors, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 240;
      const life = 0.5 + Math.random() * 0.5;
      world.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 140,
        life, max: life,
        color: colors[(Math.random() * colors.length) | 0],
        size: 3 + Math.random() * 4,
      });
    }
  }

  function updateParticles(dt) {
    const ps = world.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) { ps.splice(i, 1); continue; }
      q.vy += 900 * dt; // gravity
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
  }

  function drawParticles() {
    for (const q of world.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---- Win (reach the goal) --------------------------------------------
  function goalBox(g) {
    return { x: g.x - 16, y: g.y - 10, w: 60, h: 90 };
  }

  function triggerWin() {
    if (world.won) return;
    world.won = true;
    world.winT = 0;
    if (!reduceMotion) spawnConfetti(40);
    if (typeof Sound !== 'undefined') Sound.stopMusic();
    sfx('win');
    if (onWin) onWin(world.score); // the page shows the celebration overlay
  }

  function spawnConfetti(count) {
    const left = camera.x, W = canvas.width;
    const colors = ['#2dd4bf', '#c084fc', '#fbbf24', '#34d399', '#f5f1e6', '#fb7185'];
    for (let i = 0; i < count; i++) {
      const life = 1.8 + Math.random() * 0.8;
      world.particles.push({
        x: left + Math.random() * W,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 60,
        vy: 50 + Math.random() * 110,
        life, max: life,
        color: colors[(Math.random() * colors.length) | 0],
        size: 4 + Math.random() * 5,
      });
    }
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
    for (const a of world.actors) drawActor(a);
    drawGoal(world.goal);
    for (const o of world.objects) if (!o.collected) drawObject(o);
    drawProjectiles();
    drawPlayer(world.player);
    drawParticles();

    ctx.restore();

    drawHUD(); // screen-space, not affected by the camera
  }

  // Parallax background: sky, stars, an accent horizon glow, two rolling hill
  // layers (the far one carries wind-turbine silhouettes), and drifting clouds.
  // Everything is camera-driven and deterministic (no per-frame randomness, so
  // no flicker and nothing auto-animates — reduced-motion safe). Themed by the
  // level's accent colour.
  function drawBackground() {
    const W = canvas.width, H = canvas.height, cx = camera.x;
    const accent = world.accent || '#2dd4bf';

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0e1830');
    sky.addColorStop(0.6, '#0b1324');
    sky.addColorStop(1, '#0a0f1c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawStars(W, H, cx);

    // NZA logo watermark, subtly, behind the play area
    if (logo.ready) {
      const size = Math.min(W, H) * 0.62;
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.drawImage(logo.img, (W - size) / 2, (H - size) / 2, size, size);
      ctx.restore();
    }

    drawClouds(W, H, cx);

    // accent horizon glow low on the screen
    const glow = ctx.createLinearGradient(0, H * 0.5, 0, H);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(1, hexA(accent, 0.1));
    ctx.fillStyle = glow;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    drawHills(W, H, cx, 0.22, H * 0.66, 26, '#101a30', null, false);
    drawHills(W, H, cx, 0.42, H * 0.78, 40, '#0d1526', accent, true);
  }

  function hillY(wx, baseY, amp) {
    return baseY - amp * Math.sin(wx * 0.0016) - amp * 0.5 * Math.sin(wx * 0.0041 + 1.3);
  }

  function drawHills(W, H, cx, factor, baseY, amp, color, tint, withTurbines) {
    const off = cx * factor;
    const step = 22;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += step) ctx.lineTo(sx, hillY(sx + off, baseY, amp));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (tint) {
      ctx.strokeStyle = hexA(tint, 0.16);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let sx = 0; sx <= W; sx += step) {
        const y = hillY(sx + off, baseY, amp);
        sx === 0 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
      }
      ctx.stroke();
    }
    if (withTurbines) {
      const spacing = 540;
      const start = Math.floor(off / spacing) * spacing;
      for (let wx = start; wx < off + W + spacing; wx += spacing) {
        drawTurbine(wx - off, hillY(wx, baseY, amp), tint);
      }
    }
  }

  function drawTurbine(x, baseY, accent) {
    const hubY = baseY - 48;
    ctx.strokeStyle = hexA(accent || '#2dd4bf', 0.3);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, hubY); ctx.stroke();
    ctx.save();
    ctx.translate(x, hubY);
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -24); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = hexA(accent || '#2dd4bf', 0.5);
    ctx.beginPath(); ctx.arc(x, hubY, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawStars(W, H, cx) {
    const off = (cx * 0.1) % 240;
    ctx.fillStyle = 'rgba(245,241,230,0.32)';
    const band = Math.floor(H * 0.5);
    for (let i = 0; i < 70; i++) {
      let bx = ((i * 137) % (W + 240)) - off;
      if (bx < 0) bx += W + 240;
      const by = (i * 83) % band;
      const r = i % 6 === 0 ? 1.6 : 1;
      ctx.fillRect(bx, by, r, r);
    }
  }

  function drawClouds(W, H, cx) {
    const off = (cx * 0.3) % 620;
    ctx.fillStyle = 'rgba(150,170,205,0.05)';
    for (let i = -1; i < Math.ceil(W / 620) + 1; i++) {
      const bx = i * 620 + 140 - off;
      const by = 50 + (((i + 4) % 3) * 46);
      cloudPuff(bx, by);
    }
  }

  function cloudPuff(x, y) {
    ctx.beginPath();
    ctx.ellipse(x, y, 60, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 44, y + 6, 40, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 40, y + 8, 34, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(n.slice(0, 2), 16) || 0;
    const g = parseInt(n.slice(2, 4), 16) || 0;
    const b = parseInt(n.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${a})`;
  }

  // Textured platform: gradient body, panel seams, and a top cap tinted with the
  // level's accent colour so each level reads a little differently.
  function drawPlatform(plat) {
    const g = ctx.createLinearGradient(0, plat.y, 0, plat.y + plat.h);
    g.addColorStop(0, '#3a4a66');
    g.addColorStop(1, '#28344c');
    ctx.fillStyle = g;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

    ctx.strokeStyle = 'rgba(11,18,32,0.35)';
    ctx.lineWidth = 1;
    for (let sx = plat.x + 40; sx < plat.x + plat.w; sx += 40) {
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, plat.y + 7);
      ctx.lineTo(sx + 0.5, plat.y + plat.h);
      ctx.stroke();
    }

    ctx.fillStyle = hexA(world.accent || '#2dd4bf', 0.85); // accent top cap
    ctx.fillRect(plat.x, plat.y, plat.w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(plat.x, plat.y + 4, plat.w, 2);
  }

  function drawActor(a) {
    if (a.broken || a.dead) return;
    if (a.type === 'mover') return drawMover(a);
    if (a.type === 'block') return drawBlock(a);
    if (a.type === 'enemy') return drawEnemy(a);
    if (a.type === 'emitter') return drawEmitter(a);
  }

  // A smokestack that puffs CO2 bolts from its mouth.
  function drawEmitter(a) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.fillStyle = '#334155';
    ctx.fillRect(a.x, a.y, a.w, 5);
    ctx.fillStyle = '#1f2937';
    const dir = a.dir || -1;
    ctx.fillRect(dir > 0 ? a.x + a.w - 4 : a.x, a.y + a.h / 2 - 6, 4, 12);
  }

  function drawProjectiles() {
    for (const q of world.projectiles) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      ctx.fillStyle = 'rgba(75,85,99,0.4)';
      ctx.beginPath(); ctx.arc(cx + (q.vx > 0 ? -6 : 6), cy, q.w * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4b5563';
      ctx.beginPath(); ctx.arc(cx, cy, q.w / 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // A patrolling soot critter: charcoal body, angry eyes (facing its direction),
  // little feet. Chunky and readable.
  function drawEnemy(a) {
    const f = a.facing >= 0 ? 1 : -1;
    ctx.fillStyle = '#374151';
    ctx.fillRect(a.x, a.y + 4, a.w, a.h - 4);
    ctx.beginPath();
    ctx.arc(a.x + a.w / 2, a.y + 6, a.w / 2, Math.PI, 0); // rounded top
    ctx.fill();
    ctx.fillStyle = '#0b1220'; // feet
    ctx.fillRect(a.x + 3, a.y + a.h - 3, 7, 3);
    ctx.fillRect(a.x + a.w - 10, a.y + a.h - 3, 7, 3);
    // eyes
    const ey = a.y + a.h * 0.42;
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(a.x + a.w / 2 - 9 + (f > 0 ? 4 : 0), ey, 6, 6);
    ctx.fillRect(a.x + a.w / 2 + 3 + (f > 0 ? 4 : 0), ey, 6, 6);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(a.x + a.w / 2 - 7 + (f > 0 ? 4 : 0), ey + 2, 3, 3);
    ctx.fillRect(a.x + a.w / 2 + 5 + (f > 0 ? 4 : 0), ey + 2, 3, 3);
  }

  // A moving platform: a metal slab with a centre seam and direction ticks so
  // it reads as "this one moves".
  function drawMover(a) {
    const g = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
    g.addColorStop(0, '#5b6b86');
    g.addColorStop(1, '#3a4763');
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.fillStyle = hexA(world.accent || '#2dd4bf', 0.9);
    ctx.fillRect(a.x, a.y, a.w, 3);
    ctx.fillStyle = 'rgba(11,18,32,0.5)';
    for (let i = 1; i < 3; i++) ctx.fillRect(a.x + (a.w * i) / 3, a.y + 4, 2, a.h - 5);
  }

  // A breakable block: a crate with rivets; a "?" if it holds a drop.
  function drawBlock(a) {
    ctx.fillStyle = '#a16207';
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4);
    ctx.fillStyle = '#713f12';
    const r = 3;
    [[a.x + 5, a.y + 5], [a.x + a.w - 8, a.y + 5], [a.x + 5, a.y + a.h - 8], [a.x + a.w - 8, a.y + a.h - 8]]
      .forEach(([rx, ry]) => ctx.fillRect(rx, ry, r, r));
    if (a.dropDef) {
      ctx.fillStyle = '#fde68a';
      ctx.font = `bold ${Math.floor(a.h * 0.6)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', a.x + a.w / 2, a.y + a.h / 2 + 1);
      ctx.textAlign = 'left';
    }
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
    // Dying: tumble (rotate) and tint hurt, no aura/shield.
    if (p.dying) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.deathT * 6);
      ctx.translate(-cx, -cy);
      Face.drawCharacter(ctx, p, '#fb7185');
      ctx.restore();
      return;
    }

    if (world.surgeT > 0) drawSurgeTrail(p);
    else if (p.powerT > 0) drawPowerAura(p);

    let color = world.accent;
    if (world.surgeT > 0) color = '#a5f3fc';      // surging: bright cyan
    else if (p.powerT > 0) color = '#7ef9e6';     // heat-pump: bright teal
    Face.drawCharacter(ctx, p, color);

    if (p.shield) drawShield(p);
  }

  function drawSurgeTrail(p) {
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = 0.16 / i;
      ctx.fillStyle = '#a5f3fc';
      ctx.fillRect(p.x - p.facing * i * 13, p.y, p.w, p.h);
    }
    ctx.restore();
  }

  function drawShield(p) {
    ctx.save();
    ctx.strokeStyle = 'rgba(244,114,182,0.85)'; // insulation pink
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerAura(p) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(p.powerT * 12);
    const r = p.w * (1.05 + 0.28 * pulse);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, 'rgba(94,234,212,0.55)');
    grad.addColorStop(1, 'rgba(94,234,212,0)');
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.powerT); // fade out in the final second
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHUD() {
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f5f1e6'; // cream
    ctx.font = '600 26px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    ctx.fillText('SCORE ' + String(world.score).padStart(4, '0'), 22, 20);

    let y = 58;

    // Storage meter (storage-meter levels only): segments show fill / capacity.
    const s = world.storage;
    if (s) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 14px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('STORAGE', 22, y);
      const by = y + 18, seg = 16, gap = 5;
      for (let i = 0; i < s.max; i++) {
        const bx = 22 + i * (seg + gap);
        if (i < s.fill) {                 // banked clean energy
          ctx.fillStyle = '#34d399'; ctx.fillRect(bx, by, seg, seg);
        } else if (i < s.capacity) {      // unlocked but empty
          ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, seg - 2, seg - 2);
        } else {                          // locked (need more batteries)
          ctx.fillStyle = '#1f2937'; ctx.fillRect(bx, by, seg, seg);
        }
      }
      y = by + seg + 8;
      ctx.font = '600 14px "IBM Plex Mono", ui-monospace, monospace';
      if (world.curtailT > 0) {
        ctx.fillStyle = '#fb7185'; ctx.fillText('STORAGE FULL — ENERGY WASTED', 22, y); y += 22;
      } else if (world.surgeT > 0) {
        ctx.fillStyle = '#a5f3fc'; ctx.fillText('⚡ SURGING', 22, y); y += 22;
      } else if (world.surgeReady) {
        ctx.fillStyle = '#5eead4'; ctx.fillText('SURGE READY — DASH', 22, y); y += 22;
      }
    }

    // Heat-pump power-up: a label + draining bar.
    const pt = world.player.powerT;
    if (pt > 0) {
      ctx.fillStyle = '#5eead4';
      ctx.font = '600 16px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('⚡ HEAT PUMP', 22, y);
      const bw = 150, byy = y + 22;
      ctx.globalAlpha = 0.25; ctx.fillRect(22, byy, bw, 7);
      ctx.globalAlpha = 1; ctx.fillRect(22, byy, bw * (pt / POWER_DURATION), 7);
      y = byy + 18;
    }

    if (world.player.shield) {
      ctx.fillStyle = '#f472b6';
      ctx.font = '600 14px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('INSULATED — ONE HIT', 22, y);
    }
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

  function start(canvasEl, spec, opts) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    onWin = (opts && opts.onWin) || null;
    load(spec);
    lastTime = null;
    accumulator = 0;
    // guard against starting a second animation loop on replay
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  // ---- helpers ---------------------------------------------------------
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  // Fire a sound effect if the sound system is loaded.
  function sfx(name) {
    if (typeof Sound !== 'undefined') Sound.play(name);
  }
  // Map an object's sound path (e.g. "audio/collect-bright.mp3") to a synth key.
  function soundKey(o) {
    return o.sound ? o.sound.replace(/^.*\//, '').replace(/\.\w+$/, '') : 'collect-soft';
  }

  return { start, get world() { return world; }, get camera() { return camera; } };
})();
