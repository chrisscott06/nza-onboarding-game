# status.md

## Purpose

The NZA Onboarding Game — a deliberately silly 2D platformer (Super Mario, but
the baddies are gas boilers, ICE cars and oil slicks; the collectibles are
renewables; the power-up is an air-source heat pump). The game is bait: its real
job is to teach two new starters (Will and Imi) the exact NZA way of building
software with AI agents — clone, work to a contract, create and store assets,
commit in stages, branch, push, open a PR, deploy, and verify on a real device.

This repo currently builds **only the foundation (Level 0)**: the engine, the
face system, the branding, and the level contract that lets others drop in their
own levels. See `BRIEF.md` for the full specification and the STOP-AND-PROVE
gates for each Part.

## Current state

- Repo cloned and initialised. `BRIEF.md` landed.
- **Part A done and verified.** A vanilla HTML5 canvas engine (no framework, no
  build tool) renders a character that runs left/right, jumps with a deliberate
  Mario feel (acceleration/friction, variable-height jump, coyote-time,
  jump-buffering), and lands on platforms. A side-scrolling camera follows it.
  Keyboard controls work (← → / A D move, Space / ↑ / W jump).
  - Verified in a real browser: character ran to top speed, jumped (went
    airborne), and landed back on the ground (`onGround` true); camera scrolled.
    Screenshot confirmed the character, platforms and camera render correctly.
- `README.md` (how to run locally) and `CREDITS.md` (engine provenance) added.
- **Part B done and verified.** Collision outcomes added:
  - Touching a **hazard** (gas boiler, ☠) resets the run — player back to start,
    score zeroed, collectibles restored.
  - Touching a **collectible** (solar panel, ✦) adds points and removes it.
  - A **SCORE** readout is drawn in screen space (monospace, top-left).
  - Verified in a real browser: collectibles accumulated 100 → 200 → 300;
    hazard reset the run (score 0, player at start, collectibles back); HUD and
    object art confirmed on screen via screenshot.
- **Part C done and verified.** The level contract is live:
  - `data/objects.json` — the SHARED table (id, type, sprite, points) for gas
    boiler / ICE car / oil slick / solar panel / wind turbine / heat pump.
  - `levels/level-chris/level.json` — platforms, placements (objectId + x,y),
    startPosition, goal. `meta.json` — name, author, theme, faceAsset,
    accentColor. Plus a placeholder `assets/face-chris.svg`.
  - `levels/_template-level/` — documented stub `level.json` + `meta.json`
    (every field explained via `_doc_*` comment-strings the engine ignores) and
    an empty `assets/.gitkeep`. This is the contract Will and Imi copy.
  - `src/game.js` now READS the JSON and resolves placements against the object
    table; the engine has zero hardcoded level content. Object sprites are
    loaded from the paths in `objects.json` (with a placeholder fallback).
  - Real shared sprites added under `public/sprites/` (SVG).
  - Verified in a real browser: engine loaded the level from JSON (9 platforms,
    5 placements, goal); sprites rendered; moving a platform in `level.json`
    visibly relocated it with NO code change, then reverted cleanly.
- **Part D done and verified.** A second level proves the contract:
  - `levels/level-test/` ("Traffic Jam") — created by copying the template and
    changing ONLY data + a placeholder face. Uses different shared objects
    (ICE car, oil slick, wind turbines) and a purple accent.
  - `data/levels.json` — the level manifest the picker reads. Adding a level is
    data-only: drop a folder + add its name here (no engine edits).
  - Home-screen **level picker** on `index.html`: a card per level (name,
    author, theme, accent), populated from each `meta.json`. A "☰ Menu" button
    returns to the picker while playing.
  - Verified in a real browser: both levels appear in the picker and load;
    Traffic Jam rendered its ICE car / wind turbine / oil slick sprites. The
    second level required ZERO engine-code edits — only data + a manifest line.
  - `level-test` is kept as a demo / second worked example (not deleted).
- **Part E done and verified.** The face system is live:
  - `src/face.js` loads the level's `meta.json` → `faceAsset` SVG and draws it
    as the character's HEAD, on a body tinted with the level's `accentColor`,
    with little legs. The face mirrors when walking left. Falls back to a plain
    head until the asset loads / if it's missing.
  - The collision box is unchanged — only rendering changed.
  - Verified in a real browser: Chris's pixel face appeared on the character in
    `level-chris`; editing the SVG file (orange hair + sunglasses) visibly
    swapped the face on reload with NO code change, then reverted.
  - Camera upload is deliberately deferred — faces are drop-in files.
- **Part F done and verified.** NZA branding applied:
  - Type system wired via Google Fonts — DM Serif Display (display, 400 only),
    Inter (body/UI), IBM Plex Mono (score + labels). All SIL OFL.
  - Palette: navy base, teal/purple/coral/cream. Teal is the dominant UI accent;
    each level's `accentColor` colours its card + character body.
  - `public/nza-logo.svg` (placeholder NZA mark) shown on the menu and drawn as
    a faint watermark behind the play area.
  - Home screen restyled (serif title, mono labels, accent-bordered cards,
    "Net Zero Advisory" footer); focus states + reduced-motion respected.
  - Verified in a real browser via screenshots: menu and in-game both visibly
    carry NZA identity.
  - NOTE: the logo is a placeholder — swap `public/nza-logo.svg` for the
    official asset when available (see CREDITS.md).
- **Part G done and verified.** The heat-pump power-up:
  - Collecting the heat pump (added to `level-chris`) gives the character a
    glowing aura + brighter body, and a "⚡ HEAT PUMP" HUD readout with a
    draining timer bar. Lasts 6s, then reverts.
  - Super-skills while powered: **higher jump** (×1.32) and **invincibility**
    (hazards are harmless — blast through boilers).
  - Respects `prefers-reduced-motion` (steady glow instead of a pulse).
  - Verified in a real browser: transformation visible; invincibility shown via
    A/B (powered survives a boiler, unpowered dies); higher jump reaches the top
    of the screen vs mid-screen unpowered; reverts to normal at timeout.
    (Verified via forced-frame screenshots + state checks — the headless preview
    throttles the rAF loop when backgrounded; real-time play is confirmed on a
    phone in Part H.)

- **Part H — build side done and verified; deploy + phone is Chris's step.**
  - Canvas now keeps its 16:9 aspect (letterboxed) at any viewport size.
  - On-screen **touch controls** (◄ ► + JUMP) wired into the same logical input
    the keyboard uses (via `Input.setAction`), shown on touch / small screens,
    hidden on desktop-with-mouse. Keyboard hint hidden on mobile.
  - `vercel.json` for a zero-build static deploy; README has deploy steps.
  - Verified in a 375px mobile viewport: buttons visible with good touch
    targets; pressing ◄/►/JUMP drives the player; layout letterboxes correctly.
  - **NOT yet done (Chris's gate):** deploy to Vercel and play it on a real
    phone with touch. That real-device check is the actual Part H acceptance
    and cannot be done from here — see README "Deploy (Vercel)".

## Next

- **Part I** — the self-documenting `CLAUDE.md`, tested by a cold agent building
  a level from the template.
- **Chris:** deploy to Vercel + real-phone playtest to close the Part H gate.

(Build order: A → B → C → D → E → F → G → H → I. Each Part has a STOP-AND-PROVE
gate in `BRIEF.md §6`. Nothing is "done" until verified working in a real
browser / on a real phone.)
