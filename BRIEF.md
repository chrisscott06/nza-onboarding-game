# NZA Onboarding Game — Foundation Brief (Level 0)

**For:** Claude Code
**Built by:** Chris (player zero), before Will and Imi arrive
**Status:** First commit — this brief lands as `BRIEF.md` in the repo before any code is written
**One rule above all others:** Nothing is "done" until it has been verified working in a real browser, on a real phone. The agent does not get to mark a part complete by claiming success. Each Part below has an explicit STOP-AND-PROVE gate. Do not advance past a gate until its acceptance criteria are demonstrably met.

---

## 0. What this is, in one paragraph

We are building a small, deliberately silly 2D platform game — Super Mario, but the baddies are gas boilers, ICE cars, and oil slicks, and the things you collect are renewables (solar, wind), with an air-source heat pump as a power-up. Each team member's face becomes their character. The game itself is bait. Its real job is to teach two new starters (Will and Imi) the exact way NZA builds software with AI agents: clone a repo, work to a contract, create assets and store them correctly, edit data that changes the world, commit in stages, branch, push, open a pull request, deploy, and verify on a real device. This brief builds **only the foundation (Level 0)** — the engine, the face system, the branding, and the level contract that lets other people drop in their own levels. Will and Imi build their own levels later, against the contract this brief creates.

The foundation must be **lean**. Do not gold-plate. Start from an existing open-source platformer where possible (see Part 1). Burn as few tokens as possible while hitting every acceptance gate.

---

## 1. The build order (spine first — this is non-negotiable)

The single biggest risk is building everything at once, having it half-work, and not knowing which part is broken. So we build a thin working spine, prove it, then add one layer at a time. After every Part, the game must still run and be playable. If a Part breaks the spine, fix it before moving on.

**Part A — A character that runs, jumps, and exists on screen.**
**Part B — Hazards that kill and collectibles that score.**
**Part C — The level contract: the engine reads a level from a data file.**
**Part D — A second level proves the contract works (two levels, switchable).**
**Part E — The face system: a pixel face asset becomes the character.**
**Part F — NZA branding and the look.**
**Part G — The power-up (heat pump) and its effect.**
**Part H — Deploy to Vercel and verify on a real phone.**
**Part I — The self-documenting `CLAUDE.md` that teaches the next person's agent.**

Each Part is one commit (or a small number of commits). One Part = one logical unit of verified work.

### Session discipline (from the NZA Development Bible)

This build will span more than one Claude Code session. Two rules apply across sessions, both lifted from how NZA builds PABLO:

- **Session-start reconciliation.** At the start of *every* session, before writing any code, read `status.md` and the brief, then confirm against the actual repo what is genuinely done versus what the brief claims. Agents resume on the wrong assumption after a restart; this catches it. State plainly: "Reconciled: Parts A–X verified done, resuming at Part Y."
- **Audit before fix.** When something breaks at a gate, do NOT immediately start changing code. First read the source and diagnose *why* it broke. State the cause, then fix it. A wrong fix applied fast is worse than a right fix applied after a minute's reading.

---

## 2. Technology — keep it boring and bulletproof

- **Engine:** Do NOT write a physics engine from scratch. Search for and adapt a minimal, well-documented open-source HTML5/JS 2D platformer (e.g. a Kaboom.js / Phaser starter, or a vanilla-canvas Mario-style tutorial repo with a permissive licence). Pick the **smallest** one that does run/jump/collide. Record which repo you used and its licence in `CREDITS.md`.
- **Stack:** Plain web — HTML, CSS, JS. A light framework is fine if the chosen engine needs it, but do not introduce React or a build tool unless the engine requires it. Simplicity is the priority; this has to be debuggable by beginners next week.
- **Hosting:** Vercel (static deploy).
- **Data:** Levels and game objects are described in **plain JSON files committed to the repo.** There is NO live backend, NO database, NO server in the foundation. The "backend" for now is a JSON file. (A live leaderboard is explicitly OUT OF SCOPE for the foundation — it is a later, earned quest.)
- **Assets:** SVG and PNG sprites, stored in a fixed folder structure (Part C). Audio is optional in the foundation; if added, source only royalty-free SFX (Freesound, OpenGameArt, Pixabay) and log the source + licence in `CREDITS.md`.

---

## 3. Folder structure — this IS a lesson, get it exactly right

The repo structure is part of what we teach. It must be clean, lowercase, hyphenated, and self-explanatory, because Will and Imi will be tested on replicating it. Use exactly this shape:

```
/
├── BRIEF.md                  ← this document (first commit)
├── CLAUDE.md                 ← the brain: explains the game + the level contract (Part I)
├── README.md                 ← human-facing: how to run it locally
├── CREDITS.md                ← every borrowed engine/asset/sound + its licence
├── status.md                 ← NZA house-style status (Purpose / Current state / Next)
├── index.html                ← entry point, reads the level picker
├── src/
│   ├── engine/               ← the adapted platformer engine
│   ├── game.js               ← glue: loads a level, runs it
│   └── face.js               ← the face system (Part E)
├── public/
│   └── nza-logo.svg          ← background branding
├── data/
│   └── objects.json          ← the SHARED object table (collectibles, hazards, power-ups)
└── levels/
    ├── level-chris/          ← the foundation's proof level (gas boilers)
    │   ├── level.json        ← describes platforms, hazard/collectible placements
    │   ├── meta.json         ← name, theme, author, face asset path
    │   └── assets/           ← this level's sprites/audio
    └── _template-level/      ← EMPTY template Will and Imi copy to make their level
        ├── level.json        ← documented stub
        ├── meta.json         ← documented stub
        └── assets/           ← empty, with a .gitkeep
```

The `_template-level/` folder is critical: it is the contract made physical. Will copies it to `level-will/`, Imi copies it to `level-imi/`. Document every field in the stub JSONs with comments-as-strings so their agents understand the shape by reading it.

---

## 4. The level contract (the most important architectural piece)

A level is a folder under `levels/`. The engine discovers and loads any level folder that contains a valid `level.json` and `meta.json`. The contract:

- **`meta.json`** declares: `name`, `author`, `theme` (free-text, e.g. "underwater"), `faceAsset` (path to the author's pixel face SVG), `accentColor` (hex, the level's own identity).
- **`level.json`** declares: an array of `platforms` (x, y, width), an array of `placements` (objectId from `objects.json` + x, y), the `startPosition`, and the `goal` position.
- **`data/objects.json`** is the SHARED table every level reads. Each object has: `id`, `type` (`hazard` | `collectible` | `powerup`), `sprite` (path), `points`, and optional `sound`. Adding a row here makes a new object available to ALL levels — this is the "edit shared data → change everyone's world" lesson.

The engine must NOT hardcode level contents. It reads them. To prove this, Part D adds a second level with ZERO engine code changes — only new data and assets. If adding a level requires touching engine code, the contract has failed and must be fixed.

---

## 5. Game content (the silly part)

- **Hazards (kill the player):** gas boiler, ICE car, oil slick. (Defined as rows in `objects.json`.)
- **Collectibles (score points):** solar panel, wind turbine.
- **Power-up (heat pump):** collecting it triggers a visible transformation (Part G) — the character lights up / changes colour, and gains a temporary super-skill (e.g. higher jump or brief invincibility). Keep the effect cheap to render but obviously fun.
- **Character:** the player's pixel face (Part E) on a simple body.
- **Background:** the NZA logo, subtly, behind the play area (Part F).
- **The foundation's proof level (`level-chris`):** a gas-boiler level, Mario-style, that demonstrates every mechanic working end to end.

---

## 6. The Parts, with STOP-AND-PROVE gates

For each Part: build it, then run the game in a real browser and confirm the acceptance criteria with your own eyes (take a screenshot if the environment allows). Only then commit. State explicitly at each gate: "Verified: [what you observed]." If you cannot verify it, say so plainly and stop — do not claim success.

### Part A — Character runs and jumps
**Build:** adapt the chosen engine to render a character on a platform that can move left/right and jump under gravity.
**Gate:** In a browser, the character visibly moves and jumps and lands. Controls work on keyboard. **Verify and commit.**

### Part B — Hazards kill, collectibles score
**Build:** add collision. Touching a hazard ends/resets the run; touching a collectible increments a visible score.
**Gate:** Player dies on a boiler; score goes up on a solar panel; score is visible on screen. **Verify and commit.**

### Part C — The level contract
**Build:** move all level content into `levels/level-chris/level.json` + `data/objects.json`. The engine reads these instead of hardcoded values. Create `_template-level/` with fully documented stub files.
**Gate:** Editing `level.json` (e.g. moving a platform) visibly changes the game with no code change. **Verify and commit.**

### Part D — A second level proves the contract
**Build:** create a throwaway `levels/level-test/` by copying the template and changing only data + a placeholder asset. Add a level picker on `index.html`.
**Gate:** Both levels are selectable and playable. Adding the second level required ZERO engine-code edits. (Delete `level-test` after proving, or keep as a demo — your call, note it.) **Verify and commit.**

### Part E — The face system
**Build:** `src/face.js` takes a pixel face SVG from a level's `meta.json` (`faceAsset`) and renders it as the character's head. For the foundation, the face is a **file dropped into the level's `assets/` folder** — NOT a live camera uploader. (Camera upload is explicitly deferred; it is the single most likely thing to break and is not needed to teach the lesson. A dropped-in SVG teaches asset creation + correct storage + data-reference, which is the point.)
**Gate:** Chris's pixel face appears on the character in `level-chris`. Swapping the SVG file swaps the face. **Verify and commit.**

> **Note for the team brief later:** "you can't play until your face is ready" becomes a rule in the onboarding app, not the engine. The engine simply renders whatever `faceAsset` points to.

### Part F — NZA branding
**Build:** apply the NZA design system (see Part 10). NZA logo subtly in the background. Navy base, the accent palette, the typography. The game should look intentional and expensive, not like a tutorial.
**Gate:** The game visibly carries NZA identity. Screenshot it. **Verify and commit.**

### Part G — The heat-pump power-up
**Build:** collecting the heat pump triggers a visible transformation and a temporary super-skill. Cheap to render, obviously fun.
**Gate:** Collecting it visibly changes the character and grants the skill for a few seconds, then reverts. **Verify and commit.**

### Part H — Deploy and verify on a phone
**Build:** deploy to Vercel. Ensure the layout is responsive and the controls work on touch (on-screen buttons or tap-to-jump).
**Gate:** Open the live Vercel URL **on an actual phone.** The game is playable with touch. This is the real-device verification — it is NOT satisfied by a desktop browser resized small, and NOT by the agent asserting it should work. If touch controls are missing, the Part is not done. **Verify on a real device, then commit.**

### Part I — The self-documenting CLAUDE.md
**Build:** write `CLAUDE.md` so that another person's Claude Code agent, opening this repo cold, understands: what the game is, the level contract (Part 4), the folder structure (Part 3), where assets go, the naming rules (lowercase-hyphen), and the NZA house style for `status.md`. It must be good enough that an agent can build a valid new level from the template by reading CLAUDE.md alone, with no other briefing.
**Gate:** Test it for real — in a fresh session/agent with no prior context, point it at the repo and ask it to scaffold a new level from the template. If it produces a correctly-structured, correctly-named level folder that loads, CLAUDE.md passes. If it gets confused, fix CLAUDE.md until it doesn't. **Verify and commit.**

---

## 7. Where this goes wrong — and the guard against each

You asked me to look ahead. These are the realistic failure modes and the built-in defence:

- **"Agent says it works, it doesn't."** → Every Part has a STOP-AND-PROVE gate requiring observed behaviour, and Chris checks each gate as player zero. No advancing on a claim.
- **The level contract leaks** (engine secretly hardcodes level content). → Part D forces a second level with zero engine edits. If that's not possible, the contract is broken and gets fixed before anything else.
- **Mobile is an afterthought and the phone demo flops.** → Part H requires real-device verification with touch controls as an explicit acceptance criterion, not "responsive-ish."
- **Token blow-out from building an engine from scratch.** → Part 1 mandates adapting an existing minimal engine.
- **Camera/upload eats days and crashes.** → Explicitly deferred (Part E). Faces are dropped-in files in the foundation.
- **CLAUDE.md is written for humans, not agents, so Will/Imi's agents get lost next week.** → Part I is verified by an actual cold agent building a level from it. The doc isn't done until that works.
- **Borrowed assets/engine create a licensing mess.** → `CREDITS.md` logs every borrowed thing and its licence as it's added.
- **Scope creep (leaderboard, multiplayer, live DB).** → All explicitly out of scope for the foundation. They are later earned quests.

---

## 8. NZA house style for status.md and CLAUDE.md

`status.md` always has three sections: **Purpose** (what this repo is), **Current state** (what works right now), **Next** (what's not done yet). Plain language. No consultancy jargon. Update it at the end of every Part so the repo always honestly reflects reality.

---

## 9. Definition of done (the whole foundation)

- Game runs, deployed on Vercel, playable on a real phone with touch.
- A character with a dropped-in pixel face runs, jumps, dies on hazards, scores on collectibles, and transforms on the heat-pump power-up.
- All level content lives in JSON; the engine reads it; a second level loads with zero engine edits.
- `_template-level/` exists and is documented.
- NZA branding is visibly applied.
- `CLAUDE.md` passes the cold-agent test (Part I).
- `CREDITS.md`, `README.md`, and `status.md` are accurate.
- Every Part was verified in-browser before commit.

---

## 10. NZA design system (apply throughout)

- **Base:** dark navy.
- **Accents:** teal, purple, coral, cream. Use one accent as the dominant for the game's UI; reserve others for state (score, power-up, danger).
- **Type:** display in DM Serif Display (weight 400 only, never bold) or Stölzl for headings; Inter / Inter Tight for body and UI; IBM Plex Mono for any data/score readouts.
- **Tone:** intentional and expensive, never templated. The game is silly; the *craft* is serious.
- **Motion:** deliberate, not scattered. A clean power-up transition lands harder than constant effects. Respect reduced-motion.
- **Quality floor (silent):** responsive to mobile, visible focus states, touch targets large enough for thumbs.

---

## 11. What comes after this brief (so you hold the whole picture)

This foundation is one of three artefacts. The other two — built after the foundation is proven — are:
1. **The onboarding app:** a slick, branded landing page Will and Imi log into (shared password + pick-your-name), which explains the mission, teaches what cloning a repo is, and shows a live checklist that watches their GitHub via the API and goes green as real work lands. The "nine boxes" each level must satisfy live here.
2. **The wall reference / posters:** the permanent residue — the data-sharing cycle (clone → build → commit → push → PR → merge → pull) and the NZA Build Checklist ("have you done this?"), the pre-flight every real project uses afterwards. This is what stops the workflow being forgotten once the game is over.

Do not build those in this session. This session builds and verifies the foundation only.
