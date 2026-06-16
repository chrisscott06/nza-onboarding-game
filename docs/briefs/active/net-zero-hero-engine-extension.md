# Brief — Net Zero Hero: engine extension (World 1 + reusable toolbox)

**Derived from:** `Net-Zero-Hero-GDD.md` §9 (Build Scope Now) and §10.
**Status:** active. Execution not yet started — awaiting one decision (Part 6).
**Rule above all:** nothing is "done" until verified working in a real browser
(and the final gate, on a real phone). One Part = one commit (or a small few).
STOP-AND-PROVE at each gate; state "Verified: [what you observed]".

This brief extends the existing level contract — it does **not** break it. Will &
Imi still build a level by copying `levels/_template-level/`, now with a richer
toolbox. Levels/objects stay plain JSON; no framework, no build tool, no backend.

---

## 0. Session-start reconciliation (do every session)

Read `status.md` + `CLAUDE.md` + this brief, then confirm against the repo what
is genuinely done. State: "Reconciled: Parts X–Y verified, resuming at Z."

### Already built (do NOT rebuild — verify and move on)

- **Level 1 "Power Up the Grid"** (`levels/level-grid/`): merged object table
  (battery / ccgt / peaker / standby-gremlin / insulation + `realValue`), and the
  **storage-meter** mechanic (battery grows storage; renewables bank or curtail;
  full meter → grid-surge dash; gremlin drains; insulation shields).
- **Audio**: `src/audio.js` WebAudio synth — SFX for every event + music loop +
  mute toggle. (GDD's "satisfying chiptune SFX" ✓.)
- **Vintage polish already present**: parallax background (§4 ✓), nearest-neighbour
  scaling (§4 ✓), coyote-time + input buffering (§4 ✓), textured per-accent
  platforms, Mario-style death.
- **Narrative (partial)**: landing-page intro crawl + how-to-play legend; win
  celebration with score tally.

### Gaps this brief closes

Fun-mechanics roster (§5) · finish on-screen narrative + show `realValue` (§6/§7)
· "PRESS START" boot screen (§4) · forgiving hitboxes + squash/stretch +
screen-shake (§4) · 16×16 tile-grid discipline (§4) · template + CLAUDE.md
toolbox docs · deploy + phone.

---

## 1. Build order (spine stays playable after every Part)

- **Part 1 — Reusable mechanics, foundation: the tile/grid contract & a moving platform.**
- **Part 2 — Breakable blocks** (bash/stomp, may drop a collectible).
- **Part 3 — Patrolling enemies** (walk, turn at edges, defeat by stomping; forgiving).
- **Part 4 — Projectile hazards** (timed / proximity emitter, e.g. CO₂ bolts).
- **Part 5 — Springs / bounce pads & collapsing platforms.**
- **Part 6 — Vintage framing decision + boot screen** (the one decision; see below).
- **Part 7 — Game-feel polish** (forgiving hitboxes, squash-and-stretch, screen-shake).
- **Part 8 — Finish the narrative** (per-level intro card + mechanic one-liners + show `realValue`).
- **Part 9 — Toolbox docs** (extend `_template-level/` + `CLAUDE.md` for every new mechanic).
- **Part 10 — Deploy & verify on a real phone.**

Each mechanic follows the GDD's **teach → safe practice → challenge → combine**
pattern, and is demonstrated by placing it in `level-grid` (or a scratch level)
purely through data — **zero engine edits to USE it** once built.

---

## 2. Mechanics live in the contract (architecture)

New object/tile types are added to `data/objects.json` (shared table) and/or a
new optional `tiles`/`actors` array in `level.json`, resolved by `game.js` and
rendered/simulated by the engine. The test for every mechanic: **a level can add
it by editing JSON only.** If using it needs engine code, the contract leaked —
fix that first.

Per-placement config travels in `level.json` (e.g. a moving platform's `path` +
`speed`, a patroller's range, an emitter's interval), documented in the template.

---

## 3. The Parts, with STOP-AND-PROVE gates

### Part 1 — Moving platforms + the placement contract for actors
**Build:** an engine notion of "actors" (things that move/update), starting with
horizontal & vertical moving platforms defined in `level.json` (`path`, `speed`).
The player rides them (carried along). Introduce them safe-first in `level-grid`.
**Gate:** a platform moves on its data-defined path; the player rides it and can
ride/jump off cleanly; adding a second one is data-only. **Verify & commit.**

### Part 2 — Breakable blocks
**Build:** a block that breaks when bashed from below or stomped; optionally drops
a collectible (config in data). Particle puff on break (reuse the particle system).
**Gate:** bashing/stomping breaks it, the drop is collectible, score updates; a
solid (non-breakable) block is unaffected. **Verify & commit.**

### Part 3 — Patrolling enemies
**Build:** an enemy that walks a platform and turns at edges/walls; stomping it
defeats it (squash + SFX), touching it from the side triggers the normal death.
Forgiving stomp hitbox (GDD: don't kill on a corner). Defeat = points (data).
**Gate:** it patrols, stomp defeats + scores, side-contact kills the run; verified.
**Commit.**

### Part 4 — Projectile hazards
**Build:** an emitter (e.g. a smokestack) that fires a projectile on a timer or
when the player is near (config: `interval`, `range`, `speed`). Projectiles are
lethal hazards reusing the death path; cleaned up off-screen.
**Gate:** it fires on cadence, the projectile travels and kills on contact (unless
powered/shielded), and is cheap (no leak). **Verify & commit.**

### Part 5 — Springs / bounce pads + collapsing platforms
**Build:** (a) a spring/gust that launches the player higher than a normal jump;
(b) a platform that crumbles a moment after you land (telegraphed: shake, then
fall), respawning on run reset. Both data-placed.
**Gate:** the spring launches reliably; the collapsing platform gives a fair
warning then drops, and is restored on death. **Verify & commit.**

### Part 6 — Vintage framing **decision** + boot screen
**Decision (Chris):** the GDD specs a ~**340×192** internal resolution on a strict
**16×16** tile grid. We're currently a polished **960×540**. Options:
- **(A) Keep 960×540**, but adopt a 16-px design grid for new tiles/sprites and a
  light overscan vignette — keeps the current look, low risk.
- **(B) Switch to ~340×192** nearest-neighbour upscaled — the most authentically
  retro, but re-tunes physics constants and re-lays-out every existing level.
**Build (after decision):** a **boot screen** — NZA logo + "PRESS START"
(DM-serif-meets-pixel), two-second tone-setter, leading into the landing page.
**Gate:** boot screen shows and starts the game; chosen framing applied without
regressing Level 1. **Verify & commit.**

### Part 7 — Game-feel polish
**Build:** forgiving player hitbox (slightly inset), squash-and-stretch on
jump/land, screen-shake on death / heavy hits (respect reduced-motion).
**Gate:** jumps/landings have juice, hits shake, reduced-motion disables shake;
nothing feels worse. **Verify & commit.**

### Part 8 — Finish the narrative + show the data
**Build:** per-level **intro card** (from `meta.json`) and mechanic-teaching
one-liners as you first meet each mechanic (toast/caption), plus **show a level's
`realValue`** on screen (the disguised data-literacy lesson). Win/lose lines.
**Gate:** intro card shows, a one-liner fires the first time you meet a mechanic,
the real data value is visible. **Verify & commit.**

### Part 9 — Toolbox docs (the onboarding payoff)
**Build:** extend `levels/_template-level/` with documented stubs for every new
mechanic, and update `CLAUDE.md` so a cold agent can place each one from the
template alone.
**Gate:** cold-agent test — a fresh agent builds a level using ≥2 new mechanics
from the docs alone, and it loads & plays. **Verify & commit.**

### Part 10 — Deploy & verify on a phone
**Build:** ensure new mechanics are touch-playable; deploy to Vercel.
**Gate (Chris):** play the live URL on a real phone — new mechanics work with
touch. **Verify on device & commit.**

---

## 4. Out of scope (locked vision, NOT now — GDD §8/§9)

Worlds 2–4 levels, bosses beyond W1, the cast/caricatures as art, multiplayer,
leaderboards, the public/LinkedIn marketing build. Captured in the GDD only.

## 5. Guardrails carried from the GDD

- **Caricature a type/stance, never a named living person** (GDD §3) — applies
  whenever cast art is added (not in this scope, but keep it in mind).
- **One signature mechanic per world**; Rule of Three; teach in a safe space.
- **Forgiving hitboxes** — never kill on a sprite corner.
