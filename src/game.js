/*
 * game.js — the glue.
 *
 * For Part A this hands the engine a hardcoded level so we can prove the spine:
 * a character that runs, jumps, and lands. From Part C onward this file will
 * instead load a level from JSON (the level contract) and pass it to the engine
 * unchanged — the engine already takes a plain spec object, so that swap is
 * data-only.
 */

(function boot() {
  const canvas = document.getElementById('game');

  // A small Mario-style course: some ground, a few platforms to hop between.
  const level = {
    startPosition: { x: 80, y: 80 },
    bounds: { x: 0, y: 0, w: 2400, h: 540 },
    platforms: [
      // ground (left section)
      { x: 0,    y: 470, w: 760,  h: 70 },
      // gap, then ground continues
      { x: 900,  y: 470, w: 1500, h: 70 },
      // floating platforms to jump up and across
      { x: 280,  y: 360, w: 150,  h: 24 },
      { x: 520,  y: 280, w: 150,  h: 24 },
      { x: 760,  y: 360, w: 120,  h: 24 },
      { x: 1080, y: 350, w: 160,  h: 24 },
      { x: 1340, y: 270, w: 160,  h: 24 },
      { x: 1640, y: 360, w: 200,  h: 24 },
      { x: 1980, y: 300, w: 180,  h: 24 },
    ],
  };

  Engine.start(canvas, level);
})();
