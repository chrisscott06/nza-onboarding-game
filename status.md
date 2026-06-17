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
- **Part I done and verified.** `CLAUDE.md` written for a cold agent — explains
  the game, the level contract, folder structure, asset locations, naming rules,
  and the `status.md` house style. **Passed the cold-agent test:** a fresh agent
  with no prior context, given only the repo + CLAUDE.md, built a correct new
  level (`levels/level-lava/` "Lava Leap"), registered it, added a placeholder
  face, touched no engine code, and it loads cleanly in the picker. CLAUDE.md
  was then tightened (added the player size 34×46 so start/goal placement isn't
  guesswork). `level-lava` is kept as a third demo + proof of the test.

## Foundation status — what's done vs. left

Parts A–G and I are built and verified in-browser. Part H's build side
(responsive + touch + deploy config) is done and verified in a mobile viewport.

**Left for Chris (the one open gate):** deploy to Vercel and play the live URL on
a real phone with touch — the real-device acceptance for Part H. Steps are in
README → "Deploy (Vercel)". Also: swap `public/nza-logo.svg` and the placeholder
faces for the real assets when ready.

## Level 1 — "Power Up the Grid" (folded in from the level-1 bundle)

The first real content level, built on the foundation contract. Done in three
verified pieces:

- **Objects merged** into `data/objects.json` (still a bare array): kept the
  foundation hazards, enriched solar/wind/heat-pump (points, `realValue`,
  `effect`), and added `battery-cell`, `ccgt`, `peaker`, `standby-gremlin`,
  `insulation`. Placeholder sprites for the new ones under `public/sprites/`.
  `game.js` now cache-busts JSON (and scripts via an inline loader) so editing
  data and reloading shows the change immediately.
- **Level placed** at `levels/level-grid/` ("Power Up the Grid"), registered
  first in `data/levels.json`. `buildSpec` carries object `effect`/`realValue`
  through, normalises platforms, and passes the `mechanic`/`world` blocks.
- **Storage-meter mechanic wired** (level-scoped — other levels unaffected):
  battery-cells grow the meter; solar/wind only bank (score) if there's room,
  else they're curtailed (wasted + warning); a full meter spends on a grid-surge
  dash (Shift / ⚡ touch button) giving a speed boost + invincibility;
  standby-gremlins drain the meter (non-lethal); insulation shields one hit.
  Storage meter + status drawn in the HUD. All behaviours verified in-browser.

**Deferred from the bundle (not yet built — flagged for a follow-up):**
- Peaker "darts when near" AI (currently a static hazard).
- On-screen narrative strings (`narrative/story.md`) — intro/prompts/win-lose.
- Audio: CC0 SFX per `audio/AUDIO-GUIDE.md` (sound paths are in the data; no
  playback wired, no files fetched yet).
- Displaying each object's `realValue` in-game (the data is carried).

## Narrative & win (next-version asks)

- **Landing-page intro:** the home screen is now a 16-bit game intro — NZA mark,
  "NZA Net Zero Hero" title, a typed-out narrative crawl (reduced-motion safe,
  click to skip), and a how-to-play legend (collect renewables / avoid fossil
  fuels / heat-pump power-up / reach the goal) built from the real sprites.
- **Finish-line win:** reaching the goal triggers a celebration — confetti
  shower + an overlay that tallies the score (count-up), with "Play again"
  (reloads `?level=<name>`) and "Menu" (back to the landing page). This delivers
  the "substation-flip win/level-complete" that was deferred.
- **Dirty→clean sky transform (built + verified):** levels with a `world` block
  start smoggy (warm/murky sky, brown haze band over the horizon, dim stars) and
  visibly green as renewables are *banked* — the sky cools to clear blue, the
  smog lifts, stars sharpen, the horizon glow shifts from smog-orange to the
  level accent. Curtailed (wasted) energy doesn't count; reaching the goal snaps
  it fully clean (the substation flip). Driven by a `green` value eased toward
  `cleanGot / cleanTotal`. Levels with no `world` block are unchanged (verified
  `level-grid` dirty→clean both endpoints + a live bank stepping `greenTarget` to
  1/9, and `level-chris` pixel-identical to the old night look; no console
  errors). That closes the last outstanding bit of the Level 1 bundle.

## Net Zero Hero — reusable mechanics roster (GDD §5; brief Parts 1–5 done)

All added to the level contract as data-driven `actors` in `level.json` (a level
adds them by JSON alone — no engine edits to use). Each verified in-browser:

- **Moving platforms** (`mover`) — horizontal/vertical, path `distance` + `speed`;
  the player rides them.
- **Breakable blocks** (`block`) — bash from below to shatter; optional `drop`
  pops out a collectible.
- **Patrolling enemies** (`enemy`) — patrol a range; stomp to defeat (bounce +
  points), side/below contact kills.
- **Projectile hazards** (`emitter`) — fire lethal bolts on `interval` (optional
  proximity `range`); bolts cull off-screen.
- **Springs** (`spring`) — launch the player high; **collapsing platforms**
  (`crumble`) — shake then break shortly after you land.

### Retro framing, feel & docs (brief Parts 6–10)

- **Part 6 — retro look:** a PRESS START boot screen (NZA mark + "Net Zero Hero")
  and a chunky-pixel render pass (engine draws to a half-res buffer, upscaled
  nearest-neighbour). Kept the proven physics/levels (chose verifiable polish
  over a blind 340×192 re-author — that remains an option in the brief).
- **Part 7 — game feel:** forgiving inset hurt-box (no dying on a corner),
  squash-and-stretch on jump/land, screen-shake on death/stomp. Reduced-motion
  safe.
- **Part 8 — narrative + data:** a caption system — level intro card, mechanic
  one-liners on first encounter, and each object's real figure on collection
  (e.g. "Solar panel: 11% UK solar capacity factor" — the disguised data lesson).
- **Part 9 — toolbox docs:** the `actors` mechanics documented in CLAUDE.md +
  `_template-level`. **Cold-agent gate passed** — a fresh agent built
  `level-frostbite` ("Frostbite Manor") using all six mechanics from the docs
  alone; it loads & plays. Kept as a fifth demo level.
- **Part 10 — deploy readiness:** all new mechanics are touch-playable + retro +
  responsive on mobile (verified in a 375px viewport); `vercel.json` + README
  deploy steps already in place.

**Open gate (Chris):** deploy to Vercel and play it on a real phone (Part 10 /
the original Part H real-device acceptance). Optional future: the full authentic
340×192 tile re-author (deliberately deferred — see
`docs/briefs/active/net-zero-hero-engine-extension.md`).

## Story layer — World 1 (foundation built; see story brief)

Per `docs/net-zero-hero-story-bible.md` (foil = **Mr Net Stupid Zero**):
- **Reusable cutscene/dialogue system** — `beats` in `level.json` (trigger
  `start` / `{x}`); engine pauses, a 16-bit dialogue box (portrait + speaker +
  line) advances on tap/key, then resumes. `Engine.resume()`.
- **World 1 beats + cast** (v1.1) wired into `level-grid`: opening (Ed Megawatt),
  Mr Net Stupid Zero's villainy, Ed's market counter, **PABLO**, the Oil Baron
  taunt, the win. Caricature emoji portraits (🙂 🦺 😡 🤖 🎩).
- **Atmosphere system** — a beat's `setMood` dims/brightens the scene: dark when
  Mr Net Stupid Zero arrives, re-bright when Ed Megawatt counters.
- **World map** on the landing — four pillars, World 1 open, 2–4 locked.
- **2D explorable overworld hub (built + verified):** the landing's "▶ Explore
  the world map" button drops into a walkable hub level (`levels/level-hub/`) —
  no score/lives/hazards, a "Choose your world" HUD. You walk past four world
  gates; Gate 1 (Power Up the Grid) is lit/enterable and JUMP loads `level-grid`,
  Gates 2–4 are locked (dim + 🔒) and JUMP shows a "coming soon" message instead
  of entering. Built data-driven: a new `gate` actor type + a `hub: true` flag +
  an `onEnterGate` engine callback; adding/unlocking a world is JSON-only.
  Verified in a browser (desktop + 375px mobile): hub renders; Gate 1 → World 1;
  locked Gate 2 shows "🔒 Beat the Heat — coming soon" and stays in the hub; no
  console errors.

**Deferred (the feel-dependent batch — Chris to playtest first):** the staged
walk-in / funny-exit cutscene *animation*, PABLO's secret-path *mechanic*, the
EV-ride gag, and the **Oil Baron boss fight** (collectibles-as-ammo). Plus the
character-choice screen + flavour hazards (per the story brief).

## Sound (WebAudio synth)

- `src/audio.js` — all sound generated in code (no files): retro SFX for jump,
  collect, bank, curtail, surge, power-up, shield, drain, death, win, and UI
  clicks, plus a light looping chiptune backing track. A 🔊/🔇 toggle (top-right,
  persisted in localStorage) and the no-autoplay rule respected (audio unlocks
  on first interaction). Engine fires the SFX on events; game.js starts the
  music + wires the toggle. Verified loading/playing without errors in-browser
  (audible quality is for a human to confirm on a device with sound).
- Also hardened the index.html script loader to retry transient load failures
  (one failed fetch no longer blanks the game).

## Polish pass (look & feel)

- **Logo:** the real thick NZA mark (`public/nza-logo.svg`, from
  `public/logos/`) on the menu and as the in-game watermark.
- **Mario-style death:** hitting a lethal hazard now plays a hit-stop → hop →
  tumble → particle burst → fall off-screen, then restarts the run (instead of
  an instant reset). Invincibility and the insulation shield still pre-empt it.
- **Backgrounds & textures:** procedural parallax — starfield, drifting clouds,
  an accent horizon glow, rolling hills with wind-turbine silhouettes — plus
  textured platforms (gradient + panel seams + an accent-tinted top cap). All
  original canvas art, camera-driven/deterministic (reduced-motion safe), and
  themed per level via its `accentColor`. Verified in-browser.

## Next (after the foundation, per BRIEF §11 — not this session)

- The onboarding app (branded landing + live GitHub checklist).
- The wall reference / posters (the data-sharing cycle + NZA Build Checklist).

(Build order: A → B → C → D → E → F → G → H → I. Each Part has a STOP-AND-PROVE
gate in `BRIEF.md §6`. Nothing is "done" until verified working in a real
browser / on a real phone.)
