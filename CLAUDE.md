# CLAUDE.md — the brain of this repo

You are an AI agent working in the **NZA Onboarding Game**. This file is written
for you. Read it before doing anything, and you'll understand the whole game and
exactly how to add to it. If you're resuming, also read `status.md` first (see
"House style" below) and reconcile what's actually built against what it claims.

---

## 1. What this game is

A deliberately silly 2D platformer — Super Mario, but the baddies are gas
boilers, ICE cars and oil slicks; the collectibles are renewables (solar, wind);
the power-up is an air-source heat pump. Each person's pixel face becomes their
character's head.

The game is bait. Its real job is to teach people the NZA way of building
software with AI agents: clone a repo, work to a contract, create and store
assets, edit data that changes the world, commit in stages, push, open a PR,
deploy, verify on a real device. So the **craft matters more than the game** —
clean structure, honest status, verified work.

It's plain web — HTML, CSS, JavaScript. **No framework, no build tool, no
backend.** Levels and objects are plain JSON files. To run it locally, serve the
folder with any static server (`python3 -m http.server 5173`) and open it; do
not open `index.html` from `file://` (fetch/JSON won't work).

---

## 2. Folder structure (keep it exactly like this)

```
/
├── BRIEF.md                  the original foundation brief
├── CLAUDE.md                 this file
├── README.md                 how to run + deploy
├── CREDITS.md                every borrowed asset/font + its licence
├── status.md                 NZA house-style status (Purpose / Current state / Next)
├── index.html                entry point: the level picker + canvas
├── src/
│   ├── engine/
│   │   ├── input.js          keyboard + touch → logical actions
│   │   └── engine.js         the platformer engine (loop, physics, render)
│   ├── face.js               the face system (renders a level's faceAsset)
│   └── game.js               glue: reads JSON, builds the picker, starts a level
├── public/
│   ├── nza-logo.svg          branding (placeholder — swap for the official mark)
│   └── sprites/*.svg         the SHARED object sprites
├── data/
│   ├── objects.json          the SHARED object table (id, type, sprite, points)
│   └── levels.json           the list of levels the picker shows
└── levels/
    ├── level-chris/          the foundation's proof level
    │   ├── level.json        platforms, placements, startPosition, goal
    │   ├── meta.json          name, author, theme, faceAsset, accentColor
    │   └── assets/           this level's own sprites (e.g. the face SVG)
    ├── level-test/           a demo second level
    └── _template-level/      COPY THIS to make a new level
        ├── level.json        documented stub
        ├── meta.json         documented stub
        └── assets/           empty (.gitkeep)
```

**Naming rules (non-negotiable):** folders and files are **lowercase and
hyphenated** — `level-will`, `solar-panel.svg`, `face-imi.svg`. Never spaces,
camelCase, or underscores in level folder names. Level folders are
`level-<name>`.

---

## 3. The level contract (this is the heart of it)

The engine **never hardcodes level content** — it reads it. A level is a folder
under `levels/` with two JSON files. Adding or changing a level is **data only;
you never edit engine code.**

### `meta.json` — the level's identity card

```json
{
  "name": "Boiler Trouble",
  "author": "Chris",
  "theme": "gas boilers",
  "faceAsset": "levels/level-chris/assets/face-chris.svg",
  "accentColor": "#2dd4bf"
}
```

- `faceAsset` points to a pixel-face SVG dropped into THIS level's `assets/`
  folder. It becomes the character's head. Update the path to match your level
  folder name.
- `accentColor` (hex) is your level's identity — it tints your card and your
  character's body.

### `level.json` — the level itself

```json
{
  "startPosition": { "x": 80, "y": 80 },
  "bounds": { "x": 0, "y": 0, "w": 2400, "h": 540 },
  "platforms": [ { "x": 0, "y": 470, "w": 760, "h": 70 } ],
  "placements": [ { "objectId": "gas-boiler", "x": 430, "y": 430 } ],
  "goal": { "x": 2330, "y": 410 }
}
```

- All units are **pixels**, on a 960×540 canvas. `bounds.h` stays 540; widen
  `bounds.w` for a longer level (the camera scrolls within it).
- The **player is 34 wide × 46 tall**, and every position (`startPosition`, a
  platform, an object, the `goal`) is the **top-left corner**. So to stand the
  player or rest the goal flag on a platform whose top is at `y`, use
  `playerY = y − 46` (objects: `y − 40`). `startPosition` can sit higher — the
  player just falls onto the nearest platform below.
- `platforms`: solid ground/ledges (x,y = top-left). The player stands on and is
  blocked by each one. Leave gaps to jump across.
- `placements`: where objects sit. **`objectId` MUST match an `id` in
  `data/objects.json`.** To rest an object on a platform, set
  `y = (platform top y) − 40` (objects default to 40×40).
- `goal`: the finish-flag position (top-left).

### `data/objects.json` — the SHARED object table

```json
[
  { "id": "gas-boiler",   "type": "hazard",      "sprite": "public/sprites/gas-boiler.svg",  "points": 0 },
  { "id": "solar-panel",  "type": "collectible", "sprite": "public/sprites/solar-panel.svg", "points": 100 },
  { "id": "heat-pump",    "type": "powerup",     "sprite": "public/sprites/heat-pump.svg",   "points": 0 }
]
```

Three `type`s: `hazard` (resets the run), `collectible` (adds `points`),
`powerup` (transforms the player). This table is shared by **every** level —
adding a row here makes a new object available to all levels at once. That's the
"edit shared data → change everyone's world" lesson.

Optional fields on a row:
- `label` — human name. `sound` — path to an SFX (played when wired up).
- `realValue` `{ metric, value, unit, note }` — a true-ish real-world figure
  (capacity factor, carbon intensity, SCOP…). The disguised data lesson.
- `effect` / `behaviour` — gives an object special behaviour, read by the
  engine. Current effects: `grow-storage` (battery-cell adds a storage segment),
  `drain-storage` (gremlin nibbles a stored segment, doesn't kill),
  `supercharge` (heat pump → higher jump + invincibility),
  `shield-one-hit` (insulation absorbs one hazard hit).

Current object ids: `gas-boiler`, `ice-car`, `oil-slick`, `ccgt`, `peaker`,
`standby-gremlin` (hazards); `solar-panel`, `wind-turbine`, `battery-cell`
(collectibles); `heat-pump`, `insulation` (power-ups).

### Optional: a level's signature mechanic + world

A `level.json` may add two optional blocks (see `levels/level-grid/`):
- `mechanic` — a named, level-scoped mechanic the engine wires up. The one built
  so far is `storage-meter`: battery-cells grow a storage meter; solar/wind only
  *bank* (score) if there's room, else they're *curtailed* (wasted, with a
  warning); a full meter can be spent on a `grid-surge` dash (Shift / the ⚡ touch
  button). Levels without a `mechanic` just score collectibles normally.
- `world` — `startState`/`endState` + sky colours for a level that visibly
  transforms (e.g. dirty → clean). (Rendering of the transform is a later piece.)

### Optional: `actors` — the moving/active toolbox

A `level.json` may add an `actors` array of moving or interactive things. Like
placements, they're **pure data — no engine code to use them.** All x,y are
top-left pixels. Delete the ones you don't need.

| `type` | What it does | Key fields |
|---|---|---|
| `mover` | Moving platform the player rides | `axis` `"x"`/`"y"`, `distance` (px), `speed` (px/s), `w`, `h` |
| `block` | Breakable box — bash from below to shatter | optional `drop` = an `objectId` to pop out |
| `enemy` | Patroller; stomp from above defeats it, side-touch kills | `range` (px), `speed`, `points` |
| `emitter` | Fires lethal bolts | `dir` `-1`/`+1`, `interval` (s), `speed`; optional `range` (only fire when player within) |
| `spring` | Bounce pad — launches the player high | `power` (launch speed, ~1300) |
| `crumble` | Platform that breaks shortly after you land | `w`, `h` |

Example: `{ "type": "mover", "x": 600, "y": 430, "w": 96, "h": 16, "axis": "x", "distance": 150, "speed": 70 }`.
See `levels/_template-level/level.json` (documented stubs) and `levels/level-grid/`
(all six in use). Follow the **teach → practise → challenge** pattern: introduce a
mechanic somewhere safe before putting it over a death pit.

---

## 4. How to add a new level (the core task)

1. **Copy the template:** `levels/_template-level/` → `levels/level-<yourname>/`
   (lowercase, hyphenated).
2. **Edit `meta.json`:** set `name`, `author`, `theme`, `accentColor`, and point
   `faceAsset` at `levels/level-<yourname>/assets/<your-face>.svg`.
3. **Add your face:** drop a pixel-face SVG into your level's `assets/` folder at
   the path you set. (A simple 16×16-style SVG is perfect. If you don't have one
   yet, copy an existing `face-*.svg` as a placeholder.)
4. **Edit `level.json`:** lay out `platforms`, `placements` (using only
   `objectId`s that exist in `data/objects.json`), `startPosition`, `goal`.
   Delete the `_README`/`_doc_*` helper keys when you understand them (the engine
   ignores unknown keys, so leaving them won't break anything).
5. **Register it:** add `"level-<yourname>"` to the `levels` array in
   `data/levels.json`. This is the only shared file you touch — still no engine
   code.
6. **Verify in a browser** (see below) — your level must appear in the picker and
   be playable — then commit.

A new object (not just a new level) means adding a row to `data/objects.json`
and a sprite under `public/sprites/`.

---

## 5. Verify before you claim done (NZA rule #1)

**Nothing is "done" until you've seen it work in a browser.** Don't claim success
from reading code. Serve the folder, open it, and check with your own eyes (or a
screenshot):

```bash
python3 -m http.server 5173    # then open http://localhost:5173
```

- Your level shows in the picker with the right name/author/accent.
- It loads and is playable: the character runs (← → / A D), jumps (Space / ↑),
  dies on hazards, scores on collectibles.
- The browser console has **no errors**. (If a level fails to load, `game.js`
  shows a loud message and logs the cause — usually a bad `objectId` or
  malformed JSON.)

If you can't verify it, say so plainly and stop. Don't advance on a claim.

When something breaks: **audit before fix.** Read the source and diagnose *why*
first, state the cause, then fix it. A fast wrong fix is worse than a correct fix
after a minute's reading.

---

## 6. House style for `status.md`

`status.md` always has three plain-language sections, no jargon:

- **Purpose** — what this repo is.
- **Current state** — what actually works right now (honestly).
- **Next** — what isn't done yet.

Update it at the end of every piece of work so the repo always reflects reality.
At the **start** of every session, read `status.md` and reconcile it against the
actual repo before writing code, then state plainly what's genuinely done.

---

## 7. Commit style

Work in small, verified, logical commits — one unit of working, verified work per
commit. Write what changed and that you verified it in a browser. Use a branch
and open a pull request for review rather than committing straight to `main`.

---

## 8. What's intentionally out of scope (don't build these)

Camera/photo face upload (faces are drop-in files), a live leaderboard, a
database or server, multiplayer. These are later earned quests, not part of the
foundation.
