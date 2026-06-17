/*
 * game.js — the glue (Parts C & D: the level contract + the picker).
 *
 * The engine knows nothing about specific levels. THIS file:
 *   1. reads data/levels.json (which levels exist) and builds the home-screen
 *      picker from each level's meta.json,
 *   2. when a level is chosen, reads its data files and hands the engine a
 *      plain spec.
 *
 *   levels/<level>/meta.json   → name, author, theme, faceAsset, accentColor
 *   levels/<level>/level.json  → platforms, placements, startPosition, goal
 *   data/objects.json          → the SHARED table: id, type, sprite, points
 *
 * A "placement" just says "put objectId X at (x, y)". We look the id up in
 * objects.json to find its type/points/sprite. That's the whole contract: edit
 * the JSON, change the game — no engine code changes. Adding a level is data
 * only: drop a folder under levels/ and add its name to data/levels.json.
 */

(async function boot() {
  const canvas = document.getElementById('game');
  const menu = document.getElementById('menu');
  const menuBtn = document.getElementById('menu-btn');

  // "Menu" returns to the 2D world hub (the home screen).
  menuBtn.addEventListener('click', () => { Sound.play('click'); startLevel(canvas, menu, 'level-hub'); });
  setupTouch();
  setupSound();

  // Advance the in-world staged cutscenes. Only Enter (or a tap) advances — NOT
  // the movement keys, so holding ←/→ when a character walks in can't skip their
  // lines. And only once they've finished walking in (the engine's 'talk' phase).
  const advanceCutscene = () => {
    const w = Engine.world;
    if (w && w.cutscene && w.cutscene.phase === 'talk') { Sound.play('click'); Engine.cutsceneAdvance(); }
  };
  canvas.addEventListener('click', advanceCutscene); // tap to continue
  window.addEventListener('keydown', (e) => {
    const w = Engine.world;
    if (!(w && w.cutscene)) return;
    // swallow everything during a cutscene, but only Enter advances it
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); advanceCutscene(); }
  }, true);

  // The 2D world hub IS the home screen — PRESS START drops straight into it,
  // no level menu. (A ?level=<name> deep-link, e.g. "Play again", jumps straight
  // to that level.)
  const autoLevel = new URLSearchParams(location.search).get('level');
  if (autoLevel) {
    const boot = document.getElementById('boot');
    if (boot) boot.hidden = true;
    startLevel(canvas, menu, autoLevel);
  } else {
    setupBoot(() => startLevel(canvas, menu, 'level-hub')); // PRESS START → into the world
  }
})();

let currentLevel = null;

async function startLevel(canvas, menu, levelName) {
  currentLevel = levelName;
  const levelDir = `levels/${levelName}`;
  try {
    const [meta, level, objectTable] = await Promise.all([
      fetchJSON(`${levelDir}/meta.json`),
      fetchJSON(`${levelDir}/level.json`),
      fetchJSON('data/objects.json'),
    ]);
    const spec = buildSpec(level, objectTable, meta);
    menu.style.display = 'none';
    document.body.classList.add('playing');
    // From the hub, entering a gate loads that world (the same code path).
    Engine.start(canvas, spec, { onWin: showWin, onEnterGate: (lvl) => startLevel(canvas, menu, lvl) });
    Sound.startMusic(); // backing track (silent until unmuted / after a gesture)
    watchSurge(); // toggles the touch dash button when a grid-surge is ready
  } catch (err) {
    showFatal(err);
    throw err;
  }
}

// Resolve each placement (objectId + x,y) against the shared object table.
function buildSpec(level, objectTable, meta) {
  const byId = {};
  for (const o of objectTable) byId[o.id] = o;

  const objects = (level.placements || []).map((pl) => {
    const def = byId[pl.objectId];
    if (!def) {
      throw new Error(
        `level.json references objectId "${pl.objectId}", which is not in data/objects.json`
      );
    }
    // Carry the whole object definition through (type, sprite, points, and the
    // richer fields: effect, behaviour, label, realValue, sound), plus where it
    // sits. The engine uses effect/behaviour for level-specific mechanics.
    return { ...def, points: def.points || 0, x: pl.x, y: pl.y };
  });

  // Normalise platforms to the engine's {x,y,w,h}. Accept the shorthand `width`
  // and default a height so a level can omit it.
  const platforms = (level.platforms || []).map((p) => ({
    x: p.x,
    y: p.y,
    w: p.w != null ? p.w : p.width,
    h: p.h != null ? p.h : 28,
  }));

  // Resolve an actor's `drop` (a breakable block's prize) against the object table.
  const actors = (level.actors || []).map((a) => {
    const def = a.drop && byId[a.drop];
    if (!def) return a;
    return { ...a, dropDef: { id: def.id, type: def.type, sprite: def.sprite, points: def.points || 0 } };
  });

  return {
    meta,
    startPosition: level.startPosition,
    bounds: level.bounds,
    platforms,
    objects,
    actors, // moving platforms, breakable blocks etc. (Part: reusable mechanics)
    goal: level.goal || null,
    beats: level.beats || [], // narrative/dialogue beats (Story layer)
    mechanic: level.mechanic || null, // drives level-specific mechanics (Part: storage-meter)
    world: level.world || null,
    hub: level.hub || false, // overworld map: walkable gates into each world
    boss: level.boss || null, // end-of-world boss fight (the Oil Baron)
  };
}

// Reached the goal: show the celebration overlay, tally the score, offer
// "play again" (same level) or back to the world hub.
function showWin(score) {
  const el = document.getElementById('win');
  const val = document.getElementById('win-score');
  if (!el || !val) return;
  el.hidden = false;

  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    val.textContent = score;
  } else {
    const dur = 900, t0 = performance.now();
    (function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      val.textContent = Math.round(score * k);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  const base = location.pathname;
  document.getElementById('win-menu').onclick = () => {
    Sound.play('click');
    el.hidden = true;
    startLevel(document.getElementById('game'), document.getElementById('menu'), 'level-hub');
  };
  document.getElementById('win-again').onclick = () => {
    Sound.play('click');
    location.href = base + '?level=' + encodeURIComponent(currentLevel || '');
  };
}

// Boot screen: a "PRESS START" tone-setter. On dismiss it unlocks audio (a user
// gesture) and drops straight into the world hub.
function setupBoot(onDismiss) {
  const bootEl = document.getElementById('boot');
  const go = () => { Sound.unlock(); Sound.play('click'); onDismiss(); };
  if (!bootEl) { go(); return; }
  const dismiss = () => {
    if (bootEl.hidden) return;
    bootEl.hidden = true;
    go();
  };
  bootEl.addEventListener('click', dismiss);
  window.addEventListener('keydown', dismiss, { once: true });
}

// (Cutscenes are now staged in-world by the engine — characters walk in, talk
// via speech bubbles, and walk off. game.js only forwards the advance input.)

// Sound toggle button + unlock audio on the first user gesture.
function setupSound() {
  const btn = document.getElementById('sound-btn');
  if (btn) {
    const sync = () => { btn.textContent = Sound.isMuted() ? '🔇' : '🔊'; };
    sync();
    btn.addEventListener('click', () => { Sound.toggleMute(); Sound.play('click'); sync(); });
  }
  const unlock = () => Sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

// Show the touch dash (⚡) button when a grid-surge is available, OR during the
// boss fight (where ⚡ fires banked clean energy at the Oil Baron).
function watchSurge() {
  const w = Engine.world;
  const inFight = !!(w && w.boss && w.boss.engaged && !w.boss.defeated);
  const ready = !!(w && (w.surgeReady || inFight));
  document.body.classList.toggle('surge-ready', ready);
  // the ⚡ button does different jobs — say which
  const dash = document.querySelector('.tbtn.dash');
  if (dash) {
    const lbl = dash.querySelector('.lbl');
    const text = inFight ? 'FIRE' : 'DASH';
    if (lbl && lbl.textContent !== text) lbl.textContent = text;
    const aria = inFight ? 'Fire clean energy' : 'Grid-surge dash';
    if (dash.getAttribute('aria-label') !== aria) dash.setAttribute('aria-label', aria);
  }
  requestAnimationFrame(watchSurge);
}

function fetchJSON(url) {
  // Always fetch fresh: editing a JSON file and reloading must show the change
  // immediately — that "edit data → change the world" loop is the whole lesson.
  const bust = (url.includes('?') ? '&' : '?') + '_=' + Date.now();
  return fetch(url + bust, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${url} (HTTP ${r.status})`);
    return r.json();
  });
}

// Wire the on-screen buttons to the SAME logical actions the keyboard uses, so
// the engine never knows whether input came from touch or keys (Part H).
function setupTouch() {
  const pad = document.getElementById('touch');
  if (!pad) return;
  pad.querySelectorAll('.tbtn').forEach((btn) => {
    const action = btn.dataset.action;
    const down = (e) => { e.preventDefault(); Input.setAction(action, true); btn.classList.add('active'); };
    const up = (e) => { e.preventDefault(); Input.setAction(action, false); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

// If a data file is missing or malformed, say so loudly instead of a blank canvas.
function showFatal(err) {
  const hint = document.getElementById('hint');
  if (hint) {
    hint.textContent = 'Level failed to load — see console';
    hint.style.opacity = '1';
    hint.style.color = '#fb7185';
  }
  console.error('[NZA] Level load failed:', err);
}
