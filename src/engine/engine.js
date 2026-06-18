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
  const RETRO_SCALE = 1;    // 1 = crisp full-res (pixel-art sprites stay sharp).
                            // Lower (e.g. 0.5) downsamples for a chunkier look.
  const POWER_DURATION = 6; // heat-pump power-up lasts this many seconds
  const POWER_JUMP_MULT = 1.32; // higher jump while powered
  const SURGE_SPEED_MULT = 1.9; // grid-surge dash speed multiplier
  const SHIELD_INVULN = 0.9; // brief invulnerability after insulation absorbs a hit
  const GREMLIN_DRAIN_CD = 0.7; // seconds between storage drains from one gremlin
  const STOMP_BOUNCE = 540; // upward hop after stomping an enemy
  const CRUMBLE_FUSE = 0.5; // seconds a collapsing platform lasts after you land
  const LIVES_START = 3;    // hits you can take before a game-over (Sonic-style)
  const HURT_INVULN = 1.3;  // mercy invulnerability after a non-fatal hit

  // Respect the user's motion preference for the power-up pulse.
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas, ctx;         // ctx draws to the low-res buffer
  let screenCtx, buffer;   // the visible canvas ctx + the offscreen render buffer
  let logicalW = 960, logicalH = 540; // the logical drawing size (world view)
  let world = null;        // { player, platforms, bounds }
  let camera = { x: 0, y: 0 };
  let accumulator = 0;
  let lastTime = null;
  let running = false;
  let onWin = null; // callback fired once when the player reaches the goal
  let onBeat = null; // callback fired when a narrative beat triggers (pauses play)
  let onEnterGate = null; // hub: fired when the player enters an unlocked world gate

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
        stretch: 0,   // squash-and-stretch (+ tall on jump, - wide on land)
        wasOnGround: false,
      },
      platforms: spec.platforms.map((p) => ({ ...p })),
      // moving platforms / dynamic things (Part: reusable mechanics)
      actors: (spec.actors || []).map((a) => ({
        dir: a.dir != null ? a.dir : 1, dir0: a.dir != null ? a.dir : 1,
        off: 0, dx: 0, dy: 0, broken: false, dead: false,
        triggered: false, fuse: 0, squash: 0,
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
      lives: LIVES_START,
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
      shake: 0,        // screen-shake magnitude (decays)
      tip: '', tipT: 0, // on-screen caption (narrative + data one-liners)
      shownTips: new Set(), // tips that have already fired (once each)
      paused: false,    // a cutscene/dialogue beat is on screen
      cutscene: null,   // active staged cutscene { beat, lines, idx, actor, npc, phase, t }
      beats: (spec.beats || []).map((b) => ({ ...b, fired: false })),
      darkness: 0, targetDarkness: 0, // atmosphere: scene dims when the foil arrives
      // dirty→clean world transform: the sky greens as renewables are banked,
      // and snaps fully clean on the win (the "substation flip"). Only levels
      // with a `world` block transform; everything else keeps the night look.
      worldDef: spec.world || null,
      green: 0, greenTarget: 0, // 0 = dirty/smoggy, 1 = clean/bright (eased in render)
      cleanTotal: 0, cleanGot: 0, // renewables banked vs. total → drives the green
      particles: [],   // transient visual bits (death burst, confetti)
      projectiles: [], // emitter bolts in flight
      // overworld hub: a walkable map of world gates (no hazards / scoring)
      hub: !!spec.hub,
      nearGate: null,  // the gate the player is currently standing in front of
      entering: false, // a gate was entered; ignore further input while it loads
      // hub intro: walk only the left bit while the spiel shows, then a wall
      // lifts and a "walk right" arrow points to the pillars
      intro: (spec.hub && spec.intro) ? spec.intro : null,
      introActive: !!(spec.hub && spec.intro),
      introT: 0,       // typing clock for the intro panel
      // boss fight (BEAT 5): banked clean energy is ammo against the Oil Baron
      boss: spec.boss ? {
        name: spec.boss.name || 'The Oil Baron',
        x: spec.boss.x, y: spec.boss.y, y0: spec.boss.y,
        w: spec.boss.w || 90, h: spec.boss.h || 110,
        maxHp: spec.boss.hp || 5, hp: spec.boss.hp || 5,
        engageX: spec.boss.engageX != null ? spec.boss.engageX : spec.boss.x - 220,
        fireInterval: spec.boss.fireInterval || 1.8,
        boltSpeed: spec.boss.boltSpeed || 240,
        moveRange: spec.boss.moveRange || 90,
        moveSpeed: spec.boss.moveSpeed || 70,
        engaged: false, defeated: false, defeatT: 0,
        off: 0, dir: -1, fireT: spec.boss.fireInterval || 1.8, flash: 0,
      } : null,
      playerBolts: [], // the player's clean-energy shots at the boss
      animT: 0, // free-running clock for idle animations (ready-to-act pulse)
    };
    if (world.mechanic && world.mechanic.type === 'storage-meter') {
      world.storage = {
        capacity: world.mechanic.startSegments || 0, // segments unlocked (grown by batteries)
        fill: 0,                                      // segments currently holding clean energy
        max: world.mechanic.maxSegments || 8,
      };
    }
    if (world.worldDef) {
      // total renewables to gather; start fully clean only if the level says so
      world.cleanTotal = world.objects.filter((o) => o.type === 'collectible').length;
      world.green = world.worldDef.startState === 'clean' ? 1 : 0;
      world.greenTarget = world.green;
    }
    // preload any sprites the objects reference (rendered with a fallback)
    for (const o of world.objects) loadSprite(o.sprite);
    // point the face system at this level's face asset (Part E)
    Face.setFace(spec.meta && spec.meta.faceAsset);
    camera = { x: 0, y: 0 };
    if (spec.meta && spec.meta.intro) showTip(spec.meta.intro, 5);
  }

  // ---- Narrative beats / cutscenes -------------------------------------
  // Fire a beat when its trigger is met: 'start' (first frame), {x:N} (player
  // passes x), or 'goal' (handled on win). Pauses play and calls onBeat().
  function checkBeats() {
    for (const b of world.beats) {
      if (b.fired) continue;
      let hit = false;
      if (b.trigger === 'start') hit = true;
      // wait until the player is past the x AND standing on the ground, so a
      // chat never starts mid-jump or while falling
      else if (b.trigger && b.trigger.x != null) hit = world.player.x >= b.trigger.x && world.player.onGround;
      if (!hit) continue;
      b.fired = true;
      startCutscene(b);
      return;
    }
  }

  // Begin a staged cutscene: the speaking character walks in from off-screen.
  function startCutscene(beat) {
    const p = world.player;
    const actor = beat.actor || (beat.lines.find((l) => l.who !== 'You') || {}).who || 'You';
    const camRight = camera.x + logicalW;
    world.paused = true;
    world.cutscene = {
      beat, lines: beat.lines, idx: 0, actor, phase: 'enter', t: 0,
      npc: {
        w: 34, h: 46,
        x: camRight + 30,             // walk in from the right edge
        y: p.y,                       // same baseline as the player
        targetX: p.x + 78,            // stop just to the player's right
        facing: -1,
      },
    };
    sfx('talk');                                            // a chime as they walk in
    if (typeof Sound !== 'undefined' && Sound.setDialogue) Sound.setDialogue(true); // calm the music
  }

  function updateCutscene(dt) {
    const cs = world.cutscene;
    cs.t += dt;
    const n = cs.npc;
    if (cs.phase === 'enter') {
      const dir = (n.targetX < n.x) ? -1 : 1;
      n.x += dir * 460 * dt; // brisk walk-in
      if ((dir < 0 && n.x <= n.targetX) || (dir > 0 && n.x >= n.targetX)) {
        n.x = n.targetX;
        cs.phase = 'talk';
        if (cs.beat.setMood) world.targetDarkness = cs.beat.setMood === 'dark' ? 0.5 : 0; // shift as they speak
      }
    } else if (cs.phase === 'exit') {
      n.x += n.facing * 320 * dt; // zoom off-screen
      if (n.x + n.w < camera.x - 20 || n.x > camera.x + logicalW + 20) {
        const thenWin = cs.beat.thenWin;
        world.cutscene = null;
        world.paused = false;
        if (typeof Sound !== 'undefined' && Sound.setDialogue) Sound.setDialogue(false); // music carries on
        if (thenWin) triggerWin(); // the boss-victory beat ends → celebrate
      }
    }
    // 'talk' waits for cutsceneAdvance()
  }

  function cutsceneAdvance() {
    const cs = world.cutscene;
    if (!cs || cs.phase !== 'talk') return;
    cs.idx += 1;
    if (cs.idx >= cs.lines.length) {
      cs.phase = 'exit';
      cs.npc.facing = -1; // continue off the left
    }
  }

  // ---- Cutscene rendering (world space) --------------------------------
  function drawCutscene() {
    const cs = world.cutscene, n = cs.npc;
    drawNpc(cs);
    if (cs.phase === 'talk') {
      const line = cs.lines[cs.idx];
      if (line.who !== 'You') drawBubble(line.text, n.x + n.w / 2, n.y, line.who);
      else { const p = world.player; drawBubble(line.text, p.x + p.w / 2, p.y, 'You'); }
    }
  }

  function drawNpc(cs) {
    const n = cs.npc;
    const bob = cs.phase === 'talk' ? 0 : Math.sin(cs.t * 16) * 2;
    const x = n.x, y = n.y + bob;
    if (cs.actor === 'PABLO') {
      const w = 78, h = 39, fy = y + Math.sin(cs.t * 3) * 3;
      if (pablo.ready) ctx.drawImage(pablo.img, x - (w - n.w) / 2, fy, w, h);
      return;
    }
    const cast = CAST[cs.actor] || { c: '#94a3b8', g: '?' };
    const bw = n.w * 0.74, bh = n.h * 0.5;
    const bx = x + (n.w - bw) / 2, by = y + n.h - bh;
    ctx.fillStyle = cast.c;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(bx + 2, y + n.h - 3, 6, 3);
    ctx.fillRect(bx + bw - 8, y + n.h - 3, 6, 3);
    // the head/face — a drawn pixel face with a bit of character. Big-head
    // (chibi) proportions so the features read at cutscene size.
    const hw = n.w * 1.24, hh = n.h * 0.8;
    drawCastFace(cs.actor, x + (n.w - hw) / 2, y - n.h * 0.34, hw, hh, {});
  }

  // A characterful pixel face for a cast member, drawn into box (x,y,w,h). Shared
  // by cutscene portraits and the boss. opts: { hit } washes it white (boss flash),
  // { menace } gives the Oil Baron glowing red eyes. Coords are fractions of the
  // box, so the same face scales from a tiny portrait to the big boss.
  function drawCastFace(actor, x, y, w, h, opts) {
    opts = opts || {};
    const R = (fx, fy, fw, fh, col) => {
      ctx.fillStyle = opts.hit ? '#f5f1e6' : col;
      ctx.fillRect(Math.round(x + w * fx), Math.round(y + h * fy), Math.ceil(w * fw), Math.ceil(h * fh));
    };

    if (actor === 'Ed Megawatt') {
      // friendly energy minister in a hi-vis hard hat
      R(0.20, 0.34, 0.60, 0.56, '#e8b489');         // face
      R(0.13, 0.50, 0.09, 0.18, '#dba273');         // ears
      R(0.78, 0.50, 0.09, 0.18, '#dba273');
      R(0.14, 0.22, 0.72, 0.14, '#f0a01a');         // hard-hat brim
      R(0.24, 0.04, 0.52, 0.22, '#fbbf24');         // hard-hat dome
      R(0.46, 0.04, 0.08, 0.20, '#f0a01a');         // hat ridge
      R(0.30, 0.50, 0.10, 0.12, '#1f2433');         // eyes
      R(0.60, 0.50, 0.10, 0.12, '#1f2433');
      R(0.31, 0.51, 0.04, 0.04, '#f5f1e6');         // eye glints
      R(0.61, 0.51, 0.04, 0.04, '#f5f1e6');
      R(0.24, 0.64, 0.09, 0.07, '#f0a0a0');         // rosy cheeks
      R(0.67, 0.64, 0.09, 0.07, '#f0a0a0');
      R(0.34, 0.76, 0.32, 0.06, '#7a3b2a');         // big grin
      R(0.40, 0.79, 0.20, 0.04, '#f5f1e6');         // teeth
      return;
    }

    if (actor === 'Oil Baron') {
      R(0.30, 0.02, 0.40, 0.26, '#0b0f1a');         // top-hat crown
      R(0.30, 0.20, 0.40, 0.05, '#7a3b12');         // hat band
      R(0.16, 0.26, 0.68, 0.08, '#0b0f1a');         // hat brim
      R(0.24, 0.34, 0.52, 0.56, '#b9ad81');         // sallow face
      R(0.20, 0.52, 0.06, 0.14, '#aa9e72');         // ears
      R(0.74, 0.52, 0.06, 0.14, '#aa9e72');
      R(0.30, 0.42, 0.15, 0.05, '#2a2417');         // angled angry brows
      R(0.55, 0.42, 0.15, 0.05, '#2a2417');
      const eye = opts.menace ? '#fb3b4d' : '#241f14';
      R(0.33, 0.49, 0.08, 0.08, eye);               // beady eyes
      R(0.59, 0.49, 0.08, 0.08, eye);
      // monocle ring + chain over the right eye
      ctx.strokeStyle = opts.hit ? '#f5f1e6' : '#d4af37';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(x + w * 0.555), Math.round(y + h * 0.47), Math.ceil(w * 0.17), Math.ceil(h * 0.14));
      R(0.63, 0.61, 0.02, 0.18, '#d4af37');         // chain
      R(0.30, 0.72, 0.40, 0.05, '#1a160d');         // moustache bar
      R(0.26, 0.67, 0.06, 0.06, '#1a160d');         // curled-up ends
      R(0.68, 0.67, 0.06, 0.06, '#1a160d');
      R(0.43, 0.81, 0.14, 0.04, '#5a3320');         // smug sneer
      return;
    }

    if (actor === 'Mr Net Stupid Zero') {
      // flustered naysayer: messy hair, flushed face, mid-rant
      R(0.22, 0.30, 0.56, 0.60, '#e09784');         // flushed face
      R(0.16, 0.16, 0.68, 0.18, '#3a3326');         // messy hair
      R(0.20, 0.08, 0.16, 0.12, '#3a3326');         // tufts
      R(0.44, 0.05, 0.16, 0.12, '#3a3326');
      R(0.66, 0.10, 0.14, 0.12, '#3a3326');
      R(0.27, 0.42, 0.16, 0.05, '#2a2218');         // angry V brows
      R(0.57, 0.42, 0.16, 0.05, '#2a2218');
      R(0.31, 0.49, 0.10, 0.10, '#1f2433');         // wide eyes
      R(0.59, 0.49, 0.10, 0.10, '#1f2433');
      R(0.40, 0.72, 0.20, 0.13, '#5a1f1f');         // shouting mouth
      R(0.81, 0.33, 0.09, 0.11, '#7dd3fc');         // sweat drop
      return;
    }

    // 'You' (and fallback): a determined hero
    R(0.22, 0.32, 0.56, 0.58, '#e8b489');           // face
    R(0.16, 0.14, 0.68, 0.18, '#6b4a2f');           // hair
    R(0.18, 0.18, 0.10, 0.22, '#6b4a2f');           // sideburns
    R(0.72, 0.18, 0.10, 0.22, '#6b4a2f');
    R(0.30, 0.49, 0.10, 0.10, '#1f2433');           // eyes
    R(0.60, 0.49, 0.10, 0.10, '#1f2433');
    R(0.38, 0.73, 0.24, 0.05, '#7a3b2a');           // small confident smile
  }

  function drawBubble(text, cx, anchorTopY, speaker) {
    const bodyFont = '600 14px "IBM Plex Mono", ui-monospace, monospace';
    const nameFont = '700 11px "IBM Plex Mono", ui-monospace, monospace';
    const maxW = 250, lh = 18, padX = 10, padY = 8, hdrH = speaker ? 17 : 0;
    ctx.font = bodyFont;
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    let tw = Math.max.apply(null, lines.map((l) => ctx.measureText(l).width));
    if (speaker) { ctx.font = nameFont; tw = Math.max(tw, ctx.measureText(speaker.toUpperCase()).width); ctx.font = bodyFont; }
    const bw = Math.min(maxW + 20, tw) + padX * 2;
    const bh = lines.length * lh + padY * 2 + hdrH;
    const bx = clamp(cx - bw / 2, camera.x + 4, camera.x + logicalW - bw - 4);
    const by = Math.max(4, anchorTopY - bh - 12);
    ctx.fillStyle = '#f5f1e6';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(45,212,191,0.9)';
    ctx.fillRect(bx, by, bw, 3);
    ctx.beginPath(); // tail toward the speaker
    ctx.moveTo(cx - 8, by + bh - 1); ctx.lineTo(cx + 8, by + bh - 1); ctx.lineTo(cx, by + bh + 9);
    ctx.closePath(); ctx.fillStyle = '#f5f1e6'; ctx.fill();
    ctx.textBaseline = 'top';
    let ty = by + padY;
    if (speaker) {
      ctx.font = nameFont;
      ctx.fillStyle = NAMECOL[speaker] || '#0b1220';
      ctx.fillText(speaker.toUpperCase(), bx + padX, ty);
      ty += hdrH;
      ctx.font = bodyFont;
    }
    ctx.fillStyle = '#0b1220';
    lines.forEach((l, i) => ctx.fillText(l, bx + padX, ty + i * lh));
    ctx.textBaseline = 'alphabetic';
  }

  // ---- On-screen captions (narrative + data one-liners) ----------------
  function showTip(text, dur) { world.tip = text; world.tipT = dur || 3.6; }
  function tipOnce(key, text, dur) {
    if (world.shownTips.has(key)) return;
    world.shownTips.add(key);
    showTip(text, dur);
  }
  // "Wind turbine: 41% UK offshore wind capacity factor" — the real datum.
  function realValueTip(o) {
    const r = o.realValue;
    return `${o.label || o.id}: ${r.value}${r.unit} ${r.metric}`;
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
  const logo = { img: new Image(), ready: false, pix: null };
  logo.img.onload = () => {
    logo.ready = true;
    // pre-render a low-res copy so the background watermark reads as chunky
    // pixels (nearest-neighbour upscaled) like the rest of the art, instead of
    // a smooth anti-aliased SVG.
    const s = 60;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    c.getContext('2d').drawImage(logo.img, 0, 0, s, s);
    logo.pix = c;
  };
  logo.img.src = 'public/nza-logo.svg';

  // Cutscene cast: in-world character look (body/coat colour). Faces are drawn
  // per character by drawCastFace().
  const CAST = {
    'Ed Megawatt':        { c: '#fbbf24' },
    'Mr Net Stupid Zero': { c: '#fb7185' },
    'Oil Baron':          { c: '#111827' },
    'You':                { c: '#2dd4bf' },
  };
  // Darker, high-contrast name colours for the cream speech-bubble header.
  const NAMECOL = {
    'Ed Megawatt': '#b57d0a', 'Mr Net Stupid Zero': '#d63a50',
    'Oil Baron': '#8a6d14', 'You': '#0d8a7d', 'PABLO': '#4a52c2',
  };
  const pablo = { img: new Image(), ready: false }; // PABLO shows as its logo
  pablo.img.onload = () => { pablo.ready = true; };
  pablo.img.src = 'public/logos/pablo-logo.svg';

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

    // a staged cutscene takes over: characters walk in, talk, walk off
    if (world.cutscene) { updateCutscene(dt); return; }
    checkBeats();
    if (world.cutscene) return; // a beat just started a cutscene

    world.animT += dt; // idle-animation clock (ready-to-act pulse)

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
    const jumpPressed = Input.consumeJumpPress();
    // hub intro: SPACE/tap finishes the typing then dismisses the intro (no jump,
    // no gate, and the player is walled into the left bit — see the bounds clamp)
    if (world.hub && world.introActive) {
      world.introT += dt;
      if (jumpPressed) advanceIntro();
    } else {
      // overworld hub: standing at a gate + jump = enter that world (no hop)
      if (world.hub && handleGate(jumpPressed)) return;
      if (jumpPressed) p.jumpBufferT = t.jumpBuffer;
    }
    p.jumpBufferT = Math.max(0, p.jumpBufferT - dt);
    p.coyote = p.onGround ? t.coyoteTime : Math.max(0, p.coyote - dt);

    if (p.jumpBufferT > 0 && p.coyote > 0) {
      p.vy = -t.jumpSpeed * (p.powerT > 0 ? POWER_JUMP_MULT : 1);
      p.onGround = false;
      p.coyote = 0;
      p.jumpBufferT = 0;
      if (!reduceMotion) p.stretch = 0.22; // stretch up on the leap
      sfx('jump');
    }

    // tick down timers
    if (p.powerT > 0) p.powerT = Math.max(0, p.powerT - dt);
    if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
    if (world.tipT > 0) world.tipT = Math.max(0, world.tipT - dt);
    for (const o of world.objects) if (o.drainCD > 0) o.drainCD -= dt;

    // dash (⚡): grid-surge normally, but during the boss fight it FIRES banked
    // clean energy at the Oil Baron instead of surging.
    const dashPressed = Input.consumeDashPress ? Input.consumeDashPress() : false;
    const fighting = world.boss && world.boss.engaged && !world.boss.defeated;
    if (fighting && dashPressed) firePlayerBolt();
    updateSurge(dt, fighting ? false : dashPressed);

    // variable jump height: cut the rise short if jump released early
    if (p.vy < 0 && !Input.isJumpHeld()) {
      p.vy = Math.max(p.vy, -t.minJumpSpeed);
    }

    // --- gravity ---
    const g = p.vy > 0 ? t.fallGravity : t.gravity;
    p.vy = Math.min(p.vy + g * dt, t.maxFallSpeed);

    // --- wind updraft: caught in a turbine's airflow, you float upward (hold
    // jump to rise faster). Steer out the top/sides. Overrides gravity here. ---
    updateUpdraft(dt);

    // --- integrate + collide, one axis at a time ---
    p.onGround = false;
    p.x += p.vx * dt;
    resolveAxis('x');
    const impactVy = p.vy; // fall speed at the moment of landing
    p.y += p.vy * dt;
    resolveAxis('y');

    // squash on a real landing; ease stretch back to neutral
    if (!reduceMotion && p.onGround && !p.wasOnGround && impactVy > 250) {
      p.stretch = -Math.min(0.32, impactVy / 2800);
    }
    p.wasOnGround = p.onGround;
    p.stretch += (0 - p.stretch) * Math.min(1, dt * 14);

    // --- keep inside the level bounds horizontally ---
    const b = world.bounds;
    if (p.x < b.x) { p.x = b.x; p.vx = 0; }
    if (p.x + p.w > b.x + b.w) { p.x = b.x + b.w - p.w; p.vx = 0; }
    // hub intro: an invisible wall keeps the player in the left bit until the
    // spiel is dismissed (then the wall lifts and the pillars are reachable)
    if (world.introActive && world.intro && world.intro.barrierX != null) {
      const lim = world.intro.barrierX - p.w;
      if (p.x > lim) { p.x = lim; if (p.vx > 0) p.vx = 0; }
    }

    // --- hazards / collectibles / enemies / projectiles ---
    handleObjects();
    handleEnemies();
    updateProjectiles(dt);
    if (world.boss) { updateBoss(dt); updatePlayerBolts(dt); }

    // --- reached the goal? celebrate (but a boss must be beaten first) ---
    if (world.goal && !world.won && (!world.boss || world.boss.defeated) &&
        aabb(p, goalBox(world.goal))) triggerWin();

    // --- fell off the bottom: costs a life; respawn at start (or game over) ---
    if (p.y > b.y + b.h + 200) {
      world.lives -= 1;
      if (world.lives <= 0) startDeath();
      else { respawnAtStart(); addShake(6); sfx('hit'); }
    }
  }

  // Storage-meter surge: when the meter is full you can spend it on a dash that
  // boosts speed and makes you briefly invincible. Only active on levels whose
  // mechanic is 'storage-meter'.
  function updateSurge(dt, dashPressed) {
    const s = world.storage;
    if (world.surgeT > 0) world.surgeT = Math.max(0, world.surgeT - dt);
    if (world.curtailT > 0) world.curtailT = Math.max(0, world.curtailT - dt);
    // "meter full" = every unlocked segment is holding energy
    const inFight = world.boss && world.boss.engaged && !world.boss.defeated;
    world.surgeReady = !inFight && !!(s && s.capacity >= 1 && s.fill >= s.capacity && world.surgeT <= 0);
    if (world.surgeReady) tipOnce('surge', 'Storage maxed — press DASH (Shift / ⚡) to surge the grid!');
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
    const hb = hurtBox();
    for (const o of world.objects) {
      if (o.collected) continue;
      // hazards use the forgiving inset box; pickups use the full body
      if (!aabb(o.type === 'hazard' ? hb : p, o)) continue;

      if (o.type === 'collectible') {
        if (o.effect === 'grow-storage') {
          // battery: unlock another storage segment, and score its points
          if (s) s.capacity = Math.min(s.max, s.capacity + 1);
          o.collected = true;
          world.score += o.points || 0;
          bankedClean();
          sfx('collect-low');
          tipOnce('battery', o.realValue
            ? 'Storage online — clean energy now banks. ' + realValueTip(o) + '.'
            : 'Storage online — now clean energy banks instead of going to waste.');
        } else if (s) {
          // renewable on a storage-meter level: only banks if there's room
          if (s.fill < s.capacity) {
            s.fill += 1;
            world.score += o.points || 0; // banked
            o.collected = true;
            bankedClean();
            sfx('bank');
            if (o.realValue) tipOnce('rv-' + o.id, realValueTip(o));
          } else {
            o.collected = true;     // curtailment: storage full → energy wasted
            world.curtailT = 1.6;   // brief on-screen warning, no points
            sfx('curtail');
            tipOnce('curtail', 'Storage full — that energy is wasted. Build more storage!');
          }
        } else {
          // no storage mechanic on this level: score normally
          o.collected = true;
          world.score += o.points || 0;
          bankedClean();
          sfx(soundKey(o));
          if (o.realValue) tipOnce('rv-' + o.id, realValueTip(o));
        }
      } else if (o.type === 'powerup') {
        o.collected = true;
        if (o.effect === 'shield-one-hit') {
          p.shield = true; // insulation: fabric first
          sfx('shield');
          tipOnce('insulation', o.realValue
            ? 'Insulated — one free hit, fabric first. ' + realValueTip(o) + '.'
            : 'Insulated — you can take one hit. Fabric first.');
        } else {
          p.powerT = POWER_DURATION; // supercharge (heat pump)
          sfx('powerup');
          tipOnce('heatpump', o.realValue ? `Heat pump! ${o.realValue.value}${o.realValue.unit} efficient — supercharged!` : 'Heat pump — supercharged!');
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
        hurt(o.x + o.w / 2); // lose a life (or game over on the last)
        return;
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
      else if (a.type === 'spring') resolveSpring(p, a, axis);
      else if (a.type === 'crumble') resolveCrumble(p, a, axis);
    }
  }

  // Bounce pad: landing on top launches the player higher than a normal jump.
  // A spring is a launch PAD, not a wall — you can walk straight onto it and it
  // catapults you up. Fires whenever you're on/over it and not rising (so a
  // walk-on from flat ground bounces you, not just a fall-on from above).
  function resolveSpring(p, s, axis) {
    if (axis !== 'y' || !aabb(p, s)) return;
    if (p.vy >= 0) {
      p.y = s.y - p.h;
      p.vy = -(s.power || 1300);
      s.squash = 0.18;
      sfx('spring');
    }
  }

  // Collapsing platform: solid, but starts a fuse the moment you land; when it
  // runs out the platform breaks and you fall.
  function resolveCrumble(p, c, axis) {
    if (!aabb(p, c)) return;
    if (axis === 'y') {
      if (p.vy > 0) {
        p.y = c.y - p.h; p.onGround = true;
        if (!c.triggered) { c.triggered = true; c.fuse = CRUMBLE_FUSE; }
      } else if (p.vy < 0) { p.y = c.y + c.h; }
      p.vy = 0;
    } else {
      if (p.vx > 0) p.x = c.x - p.w; else if (p.vx < 0) p.x = c.x + c.w;
      p.vx = 0;
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
      } else if (a.type === 'spring') {
        if (a.squash > 0) a.squash = Math.max(0, a.squash - dt);
      } else if (a.type === 'crumble' && a.triggered && !a.broken) {
        a.fuse -= dt;
        if (a.fuse <= 0) {
          a.broken = true;
          spawnBurst(a.x + a.w / 2, a.y + a.h / 2, ['#5b4636', '#64748b', '#334155'], 10);
          sfx('break');
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
      q.y += (q.vy || 0) * dt;
      if (q.x < b.x - 60 || q.x > b.x + b.w + 60 || q.y < -80 || q.y > b.y + b.h + 80) { ps.splice(i, 1); continue; }
      if (!aabb(hurtBox(), q)) continue;
      ps.splice(i, 1);
      if (invincible()) continue;
      if (p.shield) { p.shield = false; p.invulnT = SHIELD_INVULN; sfx('shield'); continue; }
      hurt(q.x + q.w / 2);
      return;
    }
  }

  // ---- Boss fight (BEAT 5): the Oil Baron --------------------------------
  // Banked clean energy is ammo. The dash button fires a clean-energy bolt that
  // auto-aims at the Baron and costs one stored segment; enough hits defeat him.
  // He hovers and lobs oil-gunk (lethal) at the player meanwhile.
  function firePlayerBolt() {
    const s = world.storage, p = world.player, boss = world.boss;
    if (!s || s.fill <= 0) {
      showTip('Out of clean energy! Collect + bank renewables, then fire (⚡).', 2.2);
      sfx('curtail');
      return;
    }
    s.fill -= 1;
    const sx = p.x + p.w / 2, sy = p.y + p.h / 2;
    const tx = boss.x + boss.w / 2, ty = boss.y + boss.h / 2;
    const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
    const spd = 480;
    world.playerBolts.push({ x: sx - 7, y: sy - 9, w: 14, h: 18, vx: (dx / d) * spd, vy: (dy / d) * spd });
    sfx('surge');
  }

  function updatePlayerBolts(dt) {
    const b = world.bounds, boss = world.boss, list = world.playerBolts;
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.x < b.x - 80 || q.x > b.x + b.w + 80 || q.y < -120 || q.y > b.y + b.h + 120) { list.splice(i, 1); continue; }
      if (boss && boss.engaged && !boss.defeated && aabb(q, boss)) {
        list.splice(i, 1);
        boss.hp -= 1;
        boss.flash = 0.18;
        spawnBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, ['#2dd4bf', '#a5f3fc', '#f5f1e6'], 10);
        addShake(4);
        sfx('hit');
        if (boss.hp <= 0) defeatBoss();
      }
    }
  }

  function updateBoss(dt) {
    const boss = world.boss, p = world.player;
    if (boss.flash > 0) boss.flash = Math.max(0, boss.flash - dt);
    if (boss.defeated) { boss.defeatT += dt; boss.y += 24 * dt; return; } // sinks as he flees
    if (!boss.engaged) {
      // the fight begins once the player reaches the arena (after the taunt beat)
      if (p.x >= boss.engageX && !world.cutscene) {
        boss.engaged = true;
        showTip('The Oil Baron! Fire banked clean energy — ⚡ / DASH. Dodge the gunk!', 3.4);
      }
      return;
    }
    // hover up and down
    boss.off += boss.dir * boss.moveSpeed * dt;
    if (boss.off >= boss.moveRange) { boss.off = boss.moveRange; boss.dir = -1; }
    else if (boss.off <= -boss.moveRange) { boss.off = -boss.moveRange; boss.dir = 1; }
    boss.y = boss.y0 + boss.off;
    // lob oil-gunk at the player on an interval
    boss.fireT -= dt;
    if (boss.fireT <= 0) {
      boss.fireT = boss.fireInterval;
      const sx = boss.x + boss.w / 2, sy = boss.y + boss.h * 0.7;
      const tx = p.x + p.w / 2, ty = p.y + p.h / 2;
      const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
      world.projectiles.push({ x: sx - 9, y: sy - 9, w: 18, h: 18, vx: (dx / d) * boss.boltSpeed, vy: (dy / d) * boss.boltSpeed, gunk: true });
      sfx('drain');
    }
  }

  function defeatBoss() {
    const boss = world.boss;
    boss.defeated = true; boss.defeatT = 0; boss.hp = 0;
    world.projectiles.length = 0; world.playerBolts.length = 0; // clear the air
    spawnBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, ['#2dd4bf', '#fbbf24', '#f5f1e6', '#34d399'], 26);
    addShake(8);
    sfx('powerup');
    world.greenTarget = 1; // the gas plant flips green
    // play the victory beat (Baron flees + Ed's "Pillar one: DONE"), then win
    const beat = world.beats.find((b) => b.trigger === 'boss-defeat' && !b.fired);
    if (beat) { beat.fired = true; beat.thenWin = true; startCutscene(beat); }
    else { showTip('The Oil Baron flees! Grid clean.', 2.4); triggerWin(); }
  }

  // Wind updraft: while the player is in a turbine's airflow column, ease their
  // vertical speed toward a steady rise (hold jump to rise faster). They steer
  // out the top or sides. Non-solid; pure data actor.
  function updateUpdraft(dt) {
    const p = world.player;
    for (const a of world.actors) {
      if (a.type !== 'updraft' || !aabb(p, a)) continue;
      // the wind carries you up at a steady rate (overrides gravity); hold jump
      // to rise faster. Steer out the top or sides to leave the column.
      const base = a.lift || 220;
      p.vy = Input.isJumpHeld() ? -base * 1.6 : -base;
      p.onGround = false; p.coyote = 0;
      break;
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
        addShake(4);
        sfx('break');
      } else if (!invincible() && aabb(hurtBox(), e)) { // forgiving lethal box
        if (p.shield) { p.shield = false; p.invulnT = SHIELD_INVULN; sfx('shield'); continue; }
        hurt(e.x + e.w / 2);
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
    p.stretch = 0; p.wasOnGround = false;
    world.score = 0; world.shake = 0; world.tipT = 0; world.paused = false; world.cutscene = null;
    world.surgeT = 0; world.surgeReady = false; world.curtailT = 0;
    world.won = false; world.winT = 0;
    world.freezeT = 0; world.particles = [];
    p.ridingActor = null;
    world.projectiles = [];
    for (const a of world.actors) {
      a.off = 0; a.dir = a.dir0; a.x = a.x0; a.y = a.y0; a.dx = 0; a.dy = 0;
      a.broken = false; a.dead = false; a.fireT = a.interval != null ? a.interval : 2;
      a.triggered = false; a.fuse = 0; a.squash = 0;
    }
    if (world.storage) {
      world.storage.capacity = world.mechanic.startSegments || 0;
      world.storage.fill = 0;
    }
    world.objects = world.objects.filter((o) => !o.spawned); // drop block-spawned items
    for (const o of world.objects) { o.collected = false; o.drainCD = 0; }
    world.lives = LIVES_START; // game over → fresh lives
  }

  // A non-fatal hit: lose a life (and a bit of progress, with a comedy CO2
  // puff), get knocked back with brief mercy-invulnerability, and KEEP GOING.
  // Only a hit with the last life ends the run.
  function hurt(sourceX) {
    const p = world.player;
    if (p.invulnT > 0 || p.dying || world.won) return;
    world.lives -= 1;
    if (world.lives <= 0) { startDeath(); return; } // game over
    p.invulnT = HURT_INVULN;
    p.vy = -320; // knockback hop
    p.vx = (sourceX != null && p.x + p.w / 2 < sourceX ? -1 : 1) * 220;
    co2Puff(p.x + p.w / 2, p.y + p.h / 2); // "you released CO2!"
    if (world.storage && world.storage.fill > 0) world.storage.fill -= 1; // drop a banked renewable
    else world.score = Math.max(0, world.score - 10);
    addShake(6);
    sfx('hit');
  }

  // Fell in a pit: costs a life and respawns at the start (keeps score/progress).
  function respawnAtStart() {
    const p = world.player;
    p.x = world.start.x; p.y = world.start.y;
    p.vx = 0; p.vy = 0; p.onGround = false; p.coyote = 0; p.jumpBufferT = 0;
    p.ridingActor = null; p.invulnT = HURT_INVULN;
  }

  // A little plume of grey CO2 (rises, then disperses).
  function co2Puff(x, y) {
    const colors = ['#4b5563', '#6b7280', '#374151'];
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const sp = 60 + Math.random() * 120;
      const life = 0.6 + Math.random() * 0.5;
      world.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life, max: life, color: colors[(Math.random() * 3) | 0], size: 4 + Math.random() * 4,
      });
    }
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
    addShake(11);
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

  // Hub intro: SPACE/tap first finishes the typing, then dismisses the spiel.
  const INTRO_CPS = 38; // intro typing speed (chars/sec)
  function introFullChars() {
    return world.intro ? world.intro.lines.reduce((a, l) => a + l.length, 0) : 0;
  }
  function advanceIntro() {
    if (!world.introActive) return;
    if (world.introT < 0.3) return; // ignore a stray tap as the hub opens
    if (!reduceMotion && world.introT * INTRO_CPS < introFullChars()) {
      world.introT = (introFullChars() + 4) / INTRO_CPS; // finish the typing
    } else {
      world.introActive = false; // dismissed → the wall lifts
      sfx('click');
    }
  }

  // Hub: find the gate the player is standing in front of; a jump enters an
  // unlocked world (or nudges a locked one with a "coming soon" tip).
  function handleGate(jumpPressed) {
    if (world.entering) return true; // a world is loading — swallow input
    const p = world.player;
    const pcx = p.x + p.w / 2;
    let near = null;
    for (const a of world.actors) {
      if (a.type !== 'gate') continue;
      if (pcx >= a.x - 12 && pcx <= a.x + a.w + 12) { near = a; break; }
    }
    world.nearGate = near;
    if (!near || !jumpPressed) return false;
    if (near.locked || !near.level) {
      showTip('🔒 ' + (near.name || ('World ' + near.world)) + ' — coming soon', 2.4);
      sfx('curtail');
      return true; // consume the press so the player doesn't hop on the spot
    }
    world.entering = true; // freeze input while the chosen world loads
    sfx('powerup');
    if (onEnterGate) onEnterGate(near.level);
    return true;
  }

  // A renewable was actually banked → nudge the world a step greener.
  function bankedClean() {
    if (!world.worldDef) return;
    world.cleanGot += 1;
    if (world.cleanTotal > 0) {
      world.greenTarget = Math.max(world.greenTarget, Math.min(1, world.cleanGot / world.cleanTotal));
    }
  }

  function triggerWin() {
    if (world.won) return;
    world.won = true;
    world.winT = 0;
    if (world.worldDef) world.greenTarget = 1; // the substation flip: snap fully clean
    if (!reduceMotion) spawnConfetti(40);
    if (typeof Sound !== 'undefined') Sound.stopMusic();
    sfx('win');
    if (onWin) onWin(world.score); // the page shows the celebration overlay
  }

  function spawnConfetti(count) {
    const left = camera.x, W = logicalW;
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
    let targetX = p.x + p.w / 2 - logicalW / 2;
    camera.x = clamp(targetX, b.x, Math.max(b.x, b.x + b.w - logicalW));
    camera.y = 0;
  }

  // ---- Render ----------------------------------------------------------
  function render() {
    // draw in logical coords; the transform maps them into the low-res buffer
    ctx.setTransform(RETRO_SCALE, 0, 0, RETRO_SCALE, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    // ease the world toward its green target (smooth dirty→clean transition)
    world.green += (world.greenTarget - world.green) * 0.05;

    // simple parallax sky bands so motion reads clearly
    drawBackground();

    if (world.shake > 0.2) world.shake *= 0.86; else world.shake = 0;
    const sk = world.shake;
    const ox = sk ? (Math.random() - 0.5) * sk : 0;
    const oy = sk ? (Math.random() - 0.5) * sk : 0;
    ctx.save();
    ctx.translate(-Math.round(camera.x) + ox, -Math.round(camera.y) + oy);

    for (const plat of world.platforms) drawPlatform(plat);
    for (const a of world.actors) drawActor(a);
    drawGoal(world.goal);
    for (const o of world.objects) if (!o.collected) drawObject(o);
    if (world.boss) drawBoss();
    drawProjectiles();
    drawPlayerBolts();
    drawPlayer(world.player);
    drawReadyCharge(world.player); // "ready to throw / surge" hand-spark
    drawParticles();
    if (world.cutscene) drawCutscene();

    ctx.restore();

    // atmosphere: ease the dimming toward its target, tint the whole scene cold
    world.darkness += (world.targetDarkness - world.darkness) * 0.06;
    if (world.darkness > 0.01) {
      ctx.fillStyle = `rgba(12,16,32,${world.darkness})`;
      ctx.fillRect(0, 0, logicalW, logicalH);
    }

    drawHUD(); // screen-space, not affected by the camera

    // upscale the low-res buffer onto the visible canvas (chunky, no smoothing)
    screenCtx.imageSmoothingEnabled = false;
    screenCtx.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, canvas.width, canvas.height);
  }

  // Parallax background: sky, stars, an accent horizon glow, two rolling hill
  // layers (the far one carries wind-turbine silhouettes), and drifting clouds.
  // Everything is camera-driven and deterministic (no per-frame randomness, so
  // no flicker and nothing auto-animates — reduced-motion safe). Themed by the
  // level's accent colour.
  function drawBackground() {
    const W = logicalW, H = logicalH, cx = camera.x;
    const accent = world.accent || '#2dd4bf';
    // dirty→clean transform: world levels blend the whole sky by `green`
    // (0 = smoggy/dirty, 1 = clean). Non-world levels sit at the clean night
    // look (g = 1) so they're pixel-identical to before.
    const wd = world.worldDef;
    const g = wd ? world.green : 1;
    const skyClean = (wd && wd.skyClean) || '#3FA9C4';
    const skyDirty = (wd && wd.skyDirty) || '#C8743A';

    // sky gradient — warm/murky when dirty, cool/clear when clean
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, wd ? mixHex('#241a16', '#0e1830', g) : '#0e1830');
    sky.addColorStop(0.6, wd ? mixHex('#3a2616', '#0b1324', g) : '#0b1324');
    sky.addColorStop(1, wd ? mixHex(skyDirty, mixHex(skyClean, '#0a0f1c', 0.45), g) : '#0a0f1c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars: hazy/dim under smog, crisp once clean
    drawStars(W, H, cx, wd ? 0.10 + 0.22 * g : 0.32);

    // NZA logo watermark, subtly, behind the play area — drawn from the low-res
    // copy and upscaled nearest-neighbour so it's chunky/pixelated like the rest.
    if (logo.ready && logo.pix) {
      const size = Math.min(W, H) * 0.62;
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(logo.pix, (W - size) / 2, (H - size) / 2, size, size);
      ctx.restore();
    }

    drawClouds(W, H, cx);

    // a brown smog band hanging over the horizon that lifts as the grid cleans
    if (wd && g < 0.98) {
      const smog = ctx.createLinearGradient(0, H * 0.4, 0, H);
      smog.addColorStop(0, 'rgba(0,0,0,0)');
      smog.addColorStop(1, hexA(skyDirty, 0.34 * (1 - g)));
      ctx.fillStyle = smog;
      ctx.fillRect(0, H * 0.4, W, H * 0.6);
    }

    // horizon glow: smog-orange when dirty → accent/clean when bright
    const glowColor = wd ? mixHex(skyDirty, accent, g) : accent;
    const glow = ctx.createLinearGradient(0, H * 0.5, 0, H);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(1, hexA(glowColor, wd ? 0.08 + 0.1 * g : 0.1));
    ctx.fillStyle = glow;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    const farHill = wd ? mixHex('#241a14', '#101a30', g) : '#101a30';
    const nearHill = wd ? mixHex('#1d130d', '#0d1526', g) : '#0d1526';
    drawHills(W, H, cx, 0.22, H * 0.66, 26, farHill, null, false);
    drawHills(W, H, cx, 0.42, H * 0.78, 40, nearHill, accent, true);
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

  function drawStars(W, H, cx, alpha) {
    const off = (cx * 0.1) % 240;
    ctx.fillStyle = `rgba(245,241,230,${alpha == null ? 0.32 : alpha})`;
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

  // Linear blend between two hex colours → "#rrggbb". t=0 → a, t=1 → b.
  function rgbOf(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
  }
  function mixHex(a, b, t) {
    const ca = rgbOf(a), cb = rgbOf(b);
    const m = (i) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
    const hx = (v) => v.toString(16).padStart(2, '0');
    return `#${hx(m(0))}${hx(m(1))}${hx(m(2))}`;
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
    if (a.type === 'spring') return drawSpring(a);
    if (a.type === 'crumble') return drawCrumble(a);
    if (a.type === 'gate') return drawGate(a);
    if (a.type === 'updraft') return drawUpdraft(a);
  }

  // Wind updraft: a translucent accent column with chevrons rising up it, so
  // it reads as "stand here and the wind lifts you".
  function drawUpdraft(a) {
    const accent = world.accent || '#2dd4bf';
    const grad = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
    grad.addColorStop(0, hexA(accent, 0.02));
    grad.addColorStop(1, hexA(accent, 0.18));
    ctx.fillStyle = grad;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = hexA(accent, 0.28); ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y + a.h);
    ctx.moveTo(a.x + a.w, a.y); ctx.lineTo(a.x + a.w, a.y + a.h);
    ctx.stroke();
    const cx = a.x + a.w / 2, span = 42;
    const off = reduceMotion ? 0 : (world.animT * 130) % span;
    ctx.strokeStyle = hexA(accent, 0.55); ctx.lineWidth = 2;
    for (let y = a.y + a.h - off; y > a.y + 6; y -= span) {
      ctx.beginPath();
      ctx.moveTo(cx - 10, y + 6); ctx.lineTo(cx, y); ctx.lineTo(cx + 10, y + 6);
      ctx.stroke();
    }
  }

  // Overworld gate: a portal/arch into a world. Unlocked = accent-glowing and
  // inviting; locked = dim grey with a padlock. Shows the world number + name,
  // and a "JUMP to enter" prompt when the player is standing in front of it.
  function drawGate(a) {
    const accent = a.accent || world.accent || '#2dd4bf';
    const locked = a.locked || !a.level;
    const col = locked ? '#64748b' : accent;
    const x = a.x, y = a.y, w = a.w, h = a.h;
    const isNear = world.nearGate === a;

    // soft ground glow under an unlocked gate (and a brighter one when near)
    if (!locked) {
      const gl = ctx.createRadialGradient(x + w / 2, y + h, 4, x + w / 2, y + h, w);
      gl.addColorStop(0, hexA(accent, isNear ? 0.5 : 0.28));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x - w, y, w * 3, h + 10);
    }

    // pillar base (plinth) + capital slabs make the door read as a column
    const stone = locked ? '#2b3344' : '#324056';
    ctx.fillStyle = stone;
    ctx.fillRect(x - 12, y + h - 16, w + 24, 16); // base plinth
    ctx.fillRect(x - 10, y - 8, w + 20, 12);       // capital
    ctx.fillStyle = hexA(col, locked ? 0.4 : 0.85);
    ctx.fillRect(x - 10, y - 8, w + 20, 2);        // capital top edge

    // the portal interior (the doorway in the column)
    ctx.fillStyle = locked ? 'rgba(30,41,59,0.85)' : hexA(accent, 0.16);
    ctx.fillRect(x, y, w, h);
    // arch frame
    ctx.strokeStyle = col;
    ctx.lineWidth = locked ? 3 : 4;
    ctx.strokeRect(x, y, w, h);
    // vertical fluting (column grooves)
    ctx.strokeStyle = hexA(locked ? '#94a3b8' : '#f5f1e6', 0.13);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const fx = x + (w * i) / 4;
      ctx.beginPath(); ctx.moveTo(fx, y + 12); ctx.lineTo(fx, y + h - 12); ctx.stroke();
    }
    // inner keyline for the unlocked, lit look
    if (!locked) {
      ctx.strokeStyle = hexA('#f5f1e6', 0.5);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    }

    // world number, big and centred
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = locked ? '#94a3b8' : '#f5f1e6';
    ctx.font = '700 46px "DM Serif Display", Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(a.world != null ? a.world : '?'), x + w / 2, y + h / 2 - 4);

    // padlock for locked gates
    if (locked) {
      ctx.font = '600 22px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('🔒', x + w / 2, y + h - 22);
    }

    // world name + pillar above the arch
    ctx.fillStyle = locked ? '#94a3b8' : accent;
    ctx.font = '600 15px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText((a.name || '').toUpperCase(), x + w / 2, y - 30);
    if (a.pillar) {
      ctx.fillStyle = 'rgba(203,213,225,0.7)';
      ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(a.pillar.toUpperCase(), x + w / 2, y - 12);
    }

    // "JUMP to enter" prompt when standing in front of an unlocked gate
    if (isNear && !locked) {
      ctx.fillStyle = hexA('#f5f1e6', 0.92);
      ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('▲ JUMP TO ENTER', x + w / 2, y + h + 18);
    }
    ctx.restore();
  }

  // Bounce pad: a coil under an accent cap; compresses when it fires.
  function drawSpring(a) {
    const sq = a.squash > 0 ? 0.5 : 1;
    const h = a.h * sq;
    const top = a.y + (a.h - h);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const yy = top + h * (i / 3);
      ctx.moveTo(a.x + 4, yy);
      ctx.lineTo(a.x + a.w - 4, yy);
    }
    ctx.stroke();
    ctx.fillStyle = hexA(world.accent || '#2dd4bf', 0.95);
    ctx.fillRect(a.x, top - 5, a.w, 5);
    // bobbing "launch up" chevrons above the pad so its purpose reads at a glance
    if (a.squash <= 0) {
      const bob = reduceMotion ? 0 : Math.sin(world.animT * 5) * 3;
      const cx = a.x + a.w / 2, cy = top - 16 - bob;
      ctx.strokeStyle = hexA(world.accent || '#2dd4bf', 0.8);
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        const yy = cy - i * 8;
        ctx.beginPath();
        ctx.moveTo(cx - 7, yy + 5); ctx.lineTo(cx, yy); ctx.lineTo(cx + 7, yy + 5);
        ctx.stroke();
      }
    }
  }

  // Collapsing platform: earthy slab with cracks; shakes once the fuse is lit.
  function drawCrumble(a) {
    const shake = a.triggered ? Math.sin(a.fuse * 50) * 1.5 : 0;
    const x = a.x + shake;
    ctx.fillStyle = '#5b4636';
    ctx.fillRect(x, a.y, a.w, a.h);
    ctx.fillStyle = '#3f3026';
    ctx.fillRect(x, a.y + a.h - 4, a.w, 4);
    ctx.strokeStyle = 'rgba(11,18,32,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + a.w * 0.3, a.y); ctx.lineTo(x + a.w * 0.4, a.y + a.h);
    ctx.moveTo(x + a.w * 0.7, a.y); ctx.lineTo(x + a.w * 0.6, a.y + a.h);
    ctx.stroke();
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
      if (q.gunk) {
        // oily blob: dark green-black core with a slick sheen
        ctx.fillStyle = 'rgba(20,30,16,0.45)';
        ctx.beginPath(); ctx.arc(cx, cy + 3, q.w * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1c2b12';
        ctx.beginPath(); ctx.arc(cx, cy, q.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,180,90,0.5)';
        ctx.beginPath(); ctx.arc(cx - q.w * 0.15, cy - q.h * 0.15, q.w * 0.16, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      ctx.fillStyle = 'rgba(75,85,99,0.4)';
      ctx.beginPath(); ctx.arc(cx + (q.vx > 0 ? -6 : 6), cy, q.w * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4b5563';
      ctx.beginPath(); ctx.arc(cx, cy, q.w / 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The player's clean-energy bolts: bright teal glowing pellets.
  function drawPlayerBolts() {
    for (const q of world.playerBolts) {
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const gl = ctx.createRadialGradient(cx, cy, 1, cx, cy, q.w);
      gl.addColorStop(0, 'rgba(165,243,252,0.95)');
      gl.addColorStop(1, 'rgba(45,212,191,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(cx, cy, q.w, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5f1e6';
      ctx.beginPath(); ctx.arc(cx, cy, q.w * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The Oil Baron: a top-hatted fossil tycoon hovering over the gas plant, with
  // an HP bar. Flashes white when hit; fades out as he flees on defeat.
  function drawBoss() {
    const boss = world.boss;
    if (boss.defeated && boss.defeatT > 1.3) return; // gone once he's fled
    const x = boss.x, y = boss.y, w = boss.w, h = boss.h;
    ctx.save();
    if (boss.defeated) ctx.globalAlpha = Math.max(0, 1 - boss.defeatT / 1.3);
    const hit = boss.flash > 0;
    const dark = hit ? '#f5f1e6' : '#161b27';

    // sooty exhaust haze behind him while engaged
    if (boss.engaged && !boss.defeated && !reduceMotion) {
      ctx.fillStyle = 'rgba(60,70,50,0.18)';
      ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.3, w * 0.85, 0, Math.PI * 2); ctx.fill();
    }

    // coat / body
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + 18, w, h - 18);
    // oily lapels
    ctx.fillStyle = hit ? '#cbd5e1' : '#243b1c';
    ctx.fillRect(x + w * 0.42, y + 20, w * 0.16, h - 20);
    // head + top hat + face (same Oil Baron face as the cutscene; red-eyed while
    // he's fighting), sitting over the coat
    drawCastFace('Oil Baron', x + w * 0.12, y - 30, w * 0.76, 58, { hit, menace: !boss.defeated });
    ctx.restore();

    // HP bar above him while the fight is on
    if (boss.engaged && !boss.defeated) {
      const bw = w + 20, bx = x - 10, by = y - 42;
      ctx.fillStyle = 'rgba(11,18,32,0.8)';
      ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), 8);
      ctx.fillStyle = '#f5f1e6';
      ctx.textAlign = 'center';
      ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('THE OIL BARON', x + w / 2, by - 14);
      ctx.textAlign = 'left';
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

    // flash while in mercy-invulnerability after a hit
    const flashing = p.invulnT > 0;
    if (flashing) {
      ctx.save();
      ctx.globalAlpha = reduceMotion ? 0.55 : 0.3 + 0.45 * Math.abs(Math.sin(p.invulnT * 28));
    }

    const drawBody = () => {
      Face.drawCharacter(ctx, p, color);
      if (p.shield) drawShield(p);
    };
    if (p.stretch && !reduceMotion) {
      // squash-and-stretch, scaled about the feet
      const sy = 1 + p.stretch, sx = 1 - p.stretch * 0.5;
      const cx = p.x + p.w / 2, feet = p.y + p.h;
      ctx.save();
      ctx.translate(cx, feet); ctx.scale(sx, sy); ctx.translate(-cx, -feet);
      drawBody();
      ctx.restore();
    } else {
      drawBody();
    }

    if (flashing) ctx.restore();
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

  // A glowing spark in the hero's leading hand when an action is ready: "ready to
  // throw" clean energy at the boss, or a surge dash when the meter is full. It's
  // the at-a-glance "you can press ⚡ / DASH now" cue.
  function drawReadyCharge(p) {
    const canFire = world.boss && world.boss.engaged && !world.boss.defeated && world.storage && world.storage.fill > 0;
    const canSurge = world.surgeReady;
    if (!canFire && !canSurge) return;
    const pulse = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(world.animT * 9);
    const hx = p.facing >= 0 ? p.x + p.w + 1 : p.x - 1; // the leading hand
    const hy = p.y + p.h * 0.52;
    const r = 5 + 3 * pulse;
    const col = canFire ? '94,234,212' : '165,243,252'; // clean-energy teal / surge cyan
    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 2.2);
    grad.addColorStop(0, `rgba(${col},${0.55 + 0.35 * pulse})`);
    grad.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(hx, hy, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(245,241,230,${0.7 + 0.3 * pulse})`;
    ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  // Hub intro: a top panel that types out the spiel; the hero is visible walking
  // below it. SPACE / tap finishes the typing, then dismisses it.
  function drawIntroPanel() {
    const W = logicalW, lines = world.intro.lines;
    const full = introFullChars();
    const shown = reduceMotion ? full : Math.floor(world.introT * INTRO_CPS);
    const panelH = 26 * lines.length + 64;
    ctx.fillStyle = 'rgba(8,12,22,0.85)';
    ctx.fillRect(0, 56, W, panelH);
    ctx.fillStyle = hexA('#2dd4bf', 0.7);
    ctx.fillRect(0, 56, W, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5eead4';
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('NET ZERO HERO', W / 2, 68);
    ctx.fillStyle = '#f5f1e6';
    ctx.font = '600 15px "IBM Plex Mono", ui-monospace, monospace';
    let count = 0, y = 90;
    for (const ln of lines) {
      const s = shown >= count + ln.length ? ln : (shown > count ? ln.slice(0, shown - count) : '');
      ctx.fillText(s, W / 2, y);
      y += 26; count += ln.length;
    }
    if (shown >= full) {
      ctx.fillStyle = '#5eead4';
      ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('▸ SPACE / TAP TO CONTINUE', W / 2, y + 4);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Hub (after the intro): a pulsing "WALK RIGHT →" arrow until the player nears
  // the pillars, nudging them over to choose a world.
  function drawHubArrow() {
    const gates = world.actors.filter((a) => a.type === 'gate');
    if (!gates.length) return;
    const firstX = Math.min.apply(null, gates.map((a) => a.x));
    if (world.player.x > firstX - 240) return; // close enough — they can see them
    const pulse = reduceMotion ? 0 : 10 * Math.abs(Math.sin(world.animT * 4));
    const x = logicalW - 150 + pulse, y = logicalH / 2;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hexA('#5eead4', 0.95);
    ctx.font = '700 40px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('→', x, y);
    ctx.fillStyle = 'rgba(245,241,230,0.85)';
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('WALK RIGHT', x, y + 34);
    ctx.restore();
  }

  function drawHUD() {
    // Overworld hub: no score/lives/storage — just a title + how-to.
    if (world.hub) {
      if (world.introActive) { drawIntroPanel(); ctx.textAlign = 'left'; drawTip(); return; }
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5f1e6';
      ctx.font = '700 30px "DM Serif Display", Georgia, serif';
      ctx.fillText('Choose your world', logicalW / 2, 20);
      ctx.fillStyle = 'rgba(203,213,225,0.8)';
      ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('STAND AT A PILLAR + JUMP TO ENTER', logicalW / 2, 58);
      ctx.textAlign = 'left';
      drawHubArrow();
      drawTip();
      return;
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f5f1e6'; // cream
    ctx.font = '600 26px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    ctx.fillText('SCORE ' + String(world.score).padStart(4, '0'), 22, 20);

    // lives (hearts) on the score line
    ctx.fillStyle = '#fb7185';
    ctx.font = '600 22px "IBM Plex Mono", ui-monospace, monospace';
    let hearts = '';
    for (let i = 0; i < world.lives; i++) hearts += '♥ ';
    ctx.fillText(hearts.trim(), 300, 22);

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
      const inFight = world.boss && world.boss.engaged && !world.boss.defeated;
      if (inFight) {
        // during the boss fight the meter is AMMO and DASH fires clean energy
        if (s.fill > 0) { ctx.fillStyle = '#5eead4'; ctx.fillText('⚡ FIRE CLEAN ENERGY — DASH', 22, y); }
        else { ctx.fillStyle = '#fb7185'; ctx.fillText('OUT OF AMMO — BANK RENEWABLES', 22, y); }
        y += 22;
      } else if (world.curtailT > 0) {
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

    if (world.cutscene && world.cutscene.phase === 'talk') {
      ctx.fillStyle = 'rgba(245,241,230,0.55)';
      ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▸ SPACE / TAP TO CONTINUE', logicalW / 2, logicalH - 22);
      ctx.textAlign = 'left';
    }

    drawTip();
  }

  // A caption at the bottom — narrative beats + the real data values.
  function drawTip() {
    if (world.tipT <= 0 || !world.tip) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, world.tipT * 2.5); // fade out at the end
    ctx.font = '600 15px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = logicalW / 2, ty = logicalH - 74;
    const tw = ctx.measureText(world.tip).width + 28;
    ctx.fillStyle = 'rgba(11,18,32,0.86)';
    ctx.fillRect(cx - tw / 2, ty - 16, tw, 32);
    ctx.fillStyle = hexA(world.accent || '#2dd4bf', 0.75);
    ctx.fillRect(cx - tw / 2, ty - 16, tw, 2);
    ctx.fillStyle = '#f5f1e6';
    ctx.fillText(world.tip, cx, ty + 1);
    ctx.textAlign = 'left';
    ctx.restore();
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
    screenCtx = canvas.getContext('2d');
    screenCtx.imageSmoothingEnabled = false;
    logicalW = canvas.width;
    logicalH = canvas.height;
    // render into a half-res offscreen buffer; the loop upscales it nearest-
    // neighbour onto the visible canvas, for chunky retro pixels.
    if (!buffer) buffer = document.createElement('canvas');
    buffer.width = Math.round(logicalW * RETRO_SCALE);
    buffer.height = Math.round(logicalH * RETRO_SCALE);
    ctx = buffer.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    onWin = (opts && opts.onWin) || null;
    onBeat = (opts && opts.onBeat) || null;
    onEnterGate = (opts && opts.onEnterGate) || null;
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
  // Forgiving hit-box for LETHAL contacts (inset from the visible body) so the
  // player never dies on a sprite corner. Pickups use the full body (generous).
  function hurtBox() {
    const p = world.player;
    return { x: p.x + 6, y: p.y + 4, w: p.w - 12, h: p.h - 8 };
  }
  function addShake(mag) {
    if (!reduceMotion) world.shake = Math.max(world.shake, mag);
  }
  // Map an object's sound path (e.g. "audio/collect-bright.mp3") to a synth key.
  function soundKey(o) {
    return o.sound ? o.sound.replace(/^.*\//, '').replace(/\.\w+$/, '') : 'collect-soft';
  }

  return {
    start,
    cutsceneAdvance, // advance the active staged cutscene
    introAdvance: advanceIntro, // finish/dismiss the hub intro (SPACE / tap)
    get world() { return world; },
    get camera() { return camera; },
  };
})();
