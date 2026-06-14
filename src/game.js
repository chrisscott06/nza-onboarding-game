/*
 * game.js — the glue (Part C: the level contract).
 *
 * The engine knows nothing about specific levels. THIS file reads a level from
 * data files and hands the engine a plain spec:
 *
 *   levels/<level>/meta.json   → name, author, theme, faceAsset, accentColor
 *   levels/<level>/level.json  → platforms, placements, startPosition, goal
 *   data/objects.json          → the SHARED table: id, type, sprite, points
 *
 * A "placement" in level.json just says "put objectId X at (x, y)". We look the
 * id up in objects.json to find its type/points/sprite. That's the whole
 * contract: edit the JSON, change the game — no engine code changes. Adding a
 * row to objects.json makes a new object available to EVERY level.
 */

const DEFAULT_LEVEL = 'level-chris';

(async function boot() {
  const canvas = document.getElementById('game');

  // Which level? (level picker wired in Part D; default for now.)
  const levelName = DEFAULT_LEVEL;
  const levelDir = `levels/${levelName}`;

  try {
    const [meta, level, objectTable] = await Promise.all([
      fetchJSON(`${levelDir}/meta.json`),
      fetchJSON(`${levelDir}/level.json`),
      fetchJSON('data/objects.json'),
    ]);

    const spec = buildSpec(level, objectTable, meta);
    Engine.start(canvas, spec);
  } catch (err) {
    showFatal(err);
    throw err;
  }
})();

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
    return {
      id: def.id,
      type: def.type,
      sprite: def.sprite,
      points: def.points || 0,
      x: pl.x,
      y: pl.y,
    };
  });

  return {
    meta,
    startPosition: level.startPosition,
    bounds: level.bounds,
    platforms: level.platforms || [],
    objects,
    goal: level.goal || null,
  };
}

function fetchJSON(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${url} (HTTP ${r.status})`);
    return r.json();
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
