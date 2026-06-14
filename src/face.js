/*
 * face.js — the face system (Part E).
 *
 * A level's meta.json names a `faceAsset` (a pixel-face SVG dropped into that
 * level's assets/ folder). This module loads that file and draws it as the
 * character's HEAD, on a simple body tinted with the level's accent colour.
 *
 * The engine calls Face.setFace(path) when a level loads, and
 * Face.drawCharacter(...) every frame. Swapping the SVG file (same path) swaps
 * the face — no code change. Camera upload is deliberately NOT here; the
 * foundation teaches "create an asset + store it correctly + reference it from
 * data", and a dropped-in file does exactly that.
 */

const Face = (() => {
  let img = null;
  let ready = false;
  let currentPath = null;

  // Point the face system at a new SVG/PNG. Re-loads only if the path changed.
  function setFace(path) {
    if (path === currentPath) return;
    currentPath = path || null;
    ready = false;
    img = null;
    if (!path) return;
    const candidate = new Image();
    candidate.onload = () => { img = candidate; ready = true; };
    candidate.onerror = () => { ready = false; }; // fall back to a plain head
    candidate.src = path;
  }

  // Draw the player as head (the face) + body (accent colour) + little legs.
  // The face overflows the top of the collision box slightly so the character
  // reads as a head on a body, Mario-style.
  function drawCharacter(ctx, p, accent) {
    const cx = p.x + p.w / 2;
    const color = accent || '#2dd4bf';

    // body
    const bodyW = p.w * 0.72;
    const bodyH = p.h * 0.42;
    const bodyX = cx - bodyW / 2;
    const bodyY = p.y + p.h - bodyH;
    ctx.fillStyle = color;
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 4);
    ctx.fill();

    // legs
    ctx.fillStyle = '#0b1220';
    const legW = bodyW * 0.26;
    const legY = p.y + p.h - 4;
    ctx.fillRect(bodyX + bodyW * 0.08, legY, legW, 4);
    ctx.fillRect(bodyX + bodyW * 0.66, legY, legW, 4);

    // head (the face)
    const head = p.w;
    const headX = cx - head / 2;
    const headY = p.y - 3;
    if (ready && img) {
      ctx.save();
      ctx.imageSmoothingEnabled = false; // keep pixel faces crisp
      if (p.facing < 0) {
        // mirror the face when walking left
        ctx.translate(headX * 2 + head, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, headX, headY, head, head);
      ctx.restore();
    } else {
      // fallback head until the asset loads (or if it's missing)
      ctx.fillStyle = '#f1c9a5';
      roundRect(ctx, headX, headY, head, head, 4);
      ctx.fill();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  return {
    setFace,
    drawCharacter,
    get ready() { return ready; },
    get path() { return currentPath; },
  };
})();
