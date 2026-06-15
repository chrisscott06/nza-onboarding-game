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
  const listEl = document.getElementById('level-list');

  menuBtn.addEventListener('click', () => location.reload()); // back to picker
  setupTouch();

  try {
    const manifest = await fetchJSON('data/levels.json');
    const names = manifest.levels || [];

    // Load each level's meta so the card can show name/author/theme/accent.
    const cards = await Promise.all(
      names.map(async (name) => ({ name, meta: await fetchJSON(`levels/${name}/meta.json`) }))
    );

    renderPicker(listEl, cards, (name) => startLevel(canvas, menu, name));
  } catch (err) {
    listEl.textContent = 'Could not load levels — see console';
    console.error('[NZA] Level list failed:', err);
    throw err;
  }
})();

function renderPicker(listEl, cards, onPick) {
  listEl.innerHTML = '';
  for (const { name, meta } of cards) {
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.style.setProperty('--accent', meta.accentColor || '#2dd4bf');
    btn.innerHTML =
      `<div class="name">${escapeHTML(meta.name || name)}</div>` +
      `<div class="meta"><span class="swatch"></span>${escapeHTML(meta.author || '—')} · ${escapeHTML(meta.theme || '')}</div>`;
    btn.addEventListener('click', () => onPick(name));
    listEl.appendChild(btn);
  }
}

async function startLevel(canvas, menu, levelName) {
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
    Engine.start(canvas, spec);
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

  return {
    meta,
    startPosition: level.startPosition,
    bounds: level.bounds,
    platforms,
    objects,
    goal: level.goal || null,
    mechanic: level.mechanic || null, // drives level-specific mechanics (Part: storage-meter)
    world: level.world || null,
  };
}

// Show the touch dash button only while a grid-surge is available.
function watchSurge() {
  const ready = !!(Engine.world && Engine.world.surgeReady);
  document.body.classList.toggle('surge-ready', ready);
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

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
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
