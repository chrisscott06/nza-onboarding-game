/*
 * transition.js — a retro pixel "squash shut → logo → reopen" wipe.
 *
 * Transition.play(swapFn) covers the screen with two chunky navy panels that
 * squash toward the centre (pixel-stepped edges), flashes the pixelated NZA
 * mark at the pinch, then reopens — calling swapFn() (which may swap the scene,
 * sync or async) at the fully-covered midpoint. Robust to a throttled/paused
 * rAF loop: a setTimeout fallback always completes the swap + hides the overlay.
 */

const Transition = (() => {
  let cv, ctx, busy = false;
  const off = document.createElement('canvas'); // tiny buffer → pixelated logo
  const octx = off.getContext('2d');
  const logo = new Image();
  let logoReady = false;
  logo.onload = () => { logoReady = true; };
  logo.src = 'public/nza-logo.svg';

  const CELL = 28;
  const reduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensure() {
    if (!cv) { cv = document.getElementById('transition'); ctx = cv && cv.getContext('2d'); }
    if (cv) { cv.width = Math.max(1, window.innerWidth); cv.height = Math.max(1, window.innerHeight); }
    return !!ctx;
  }

  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function drawPixelLogo(cx, cy, size, squashY) {
    if (!logoReady) return;
    const s = 26;
    off.width = s; off.height = s;
    octx.imageSmoothingEnabled = false;
    octx.clearRect(0, 0, s, s);
    octx.drawImage(logo, 0, 0, s, s);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    ctx.scale(1, squashY);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(off, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // cover: 0 = fully open (clear), 1 = fully closed (covered). t01 drives the
  // logo squash bounce while closed.
  function draw(cover, t01) {
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (cover <= 0) return;
    const panelH = (H / 2) * cover;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, panelH);              // top panel
    ctx.fillRect(0, H - panelH, W, panelH);     // bottom panel
    // chunky pixel-stepped leading edges (alternating teeth)
    for (let c = 0, i = 0; c < W; c += CELL, i++) {
      if (i % 2 === 0) {
        ctx.fillRect(c, panelH, CELL, CELL);              // top edge tooth
        ctx.fillRect(c, H - panelH - CELL, CELL, CELL);   // bottom edge tooth
      }
    }
    // near-closed: a bright seam + the pixelated mark, with a squash bounce
    if (cover > 0.82) {
      const k = (cover - 0.82) / 0.18;
      ctx.fillStyle = 'rgba(94,234,212,' + (0.5 * k) + ')';
      ctx.fillRect(0, H / 2 - 2, W, 4);
      const squash = reduced() ? 1 : 0.86 + 0.14 * Math.sin(t01 * Math.PI * 3);
      drawPixelLogo(W / 2, H / 2, Math.min(W, H) * 0.2, squash);
    }
  }

  function play(swapFn) {
    if (!ensure() || busy) { // no canvas, or already running → just swap
      try { const r = swapFn && swapFn(); if (r && r.then) r.catch((e) => console.error(e)); } catch (e) { console.error('[NZA] transition swap', e); }
      return;
    }
    busy = true;
    cv.hidden = false;
    const r = reduced();
    const COVER = r ? 90 : 300, HOLD = r ? 70 : 170, OPEN = r ? 90 : 300, TOTAL = COVER + HOLD + OPEN;
    let start = null, swapped = false, finished = false;

    const doSwap = () => {
      if (swapped) return; swapped = true;
      try { const out = swapFn && swapFn(); if (out && out.then) out.catch((e) => console.error(e)); }
      catch (e) { console.error('[NZA] transition swap', e); }
    };
    const finish = () => {
      if (finished) return; finished = true;
      busy = false;
      if (cv) { ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
    };

    const frame = (now) => {
      if (finished) return;
      if (start == null) start = now;
      const t = now - start;
      let cover, t01 = 0;
      if (t < COVER) cover = easeInOut(t / COVER);
      else if (t < COVER + HOLD) { cover = 1; t01 = (t - COVER) / HOLD; }
      else cover = easeInOut(Math.max(0, 1 - (t - COVER - HOLD) / OPEN));
      draw(cover, t01);
      if (t >= COVER) doSwap();
      if (t >= TOTAL) { finish(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // safety net: if rAF is throttled/paused, still swap + clear up
    setTimeout(() => { doSwap(); finish(); }, TOTAL + 500);
  }

  window.addEventListener('resize', () => { if (cv && !cv.hidden) ensure(); });

  return { play };
})();
