# Brief — Net Zero Hero: World 1 story layer (cutscenes, map, beats, boss)

**Derived from:** `docs/net-zero-hero-story-bible.md` §6 (Build Scope Now).
**Status:** active. Execution **not started** — awaiting go-ahead (this is a big,
design-heavy layer; see "Check-in" at the end).
**Rule above all:** verified in a real browser before "done"; one Part = one
commit; STOP-AND-PROVE gates.

The **foil is "Mr Net Stupid Zero"** (not "bloody") — corrected from the v1 draft.

---

## 0. Reconciliation (already built — do NOT rebuild)

- **Storage-meter** mechanic, the **fun-mechanics roster** (mover/block/enemy/
  emitter/spring/crumble), **game-feel polish**, **lives** — all done.
- **Face system** (your face on the hero) — done.
- **realValue data tips** on collection (the "first real data" motif) — done.
- **Boot screen + landing intro + intro caption + win celebration** — done (a
  partial version of the bible's "home/intro").
- **`level-grid` "Power Up the Grid"** exists and plays (storage, mechanics,
  goal). It is NOT yet shaped to the bible's §4.2 8-beat curve, and has no
  cutscenes/boss.

## 1. What this brief adds (the story layer)

- **Part 1 — Reusable dialogue/cutscene system.** Action pauses, a character
  portrait + lines appear (cheeky voice), advance on tap/key, control resumes.
  Data-driven (beats defined in level data), so every world can use it. Respect
  reduced-motion; skippable.
- **Part 2 — World 1 narrative beats + cast.** Wire the five §4.3 beats (opening,
  meet Milirenew, Mr Net Stupid Zero heckle, Oil Baron, win) triggered at level
  positions/events. Simple portrait art for Minister Milirenew, **Mr Net Stupid
  Zero**, the Oil Baron (original caricatures of a *stance*, never a real person).
- **Part 3 — World map.** A home → map screen: 4 nodes, World 1 open, Worlds 2–4
  locked ("coming soon"). Picks up the existing level picker.
- **Part 4 — Character-choice foundation.** Pick-your-hero screen (Student
  default, fully written); the Sustainability Lead path stubbed for later.
- **Part 5 — World transforms dirty → clean.** Sky/lighting shifts as renewables
  are banked; snaps fully clean on the win (the deferred transform, now wanted).
- **Part 6 — The EV ride.** Commandeer an electric car for a fast stretch
  (a ride/power-up: boosted speed, ICE cars become harmless while riding).
- **Part 7 — Flavour hazards + recycling.** Background plane/trucks (supply-chain
  dodge-and-learn) and an optional recycling-bin collectible for bonus points.
- **Part 8 — The Oil Baron boss.** A simple boss finale: flip electrify-switches
  (or stomp phases) until the gas plant goes green; then BEAT 5 win + "scarpers".
- **Part 9 — Reshape `level-grid`** to the §4.2 teaching curve (open → ally →
  storage → transport/EV → heckler → gauntlet → boss → win).
- **Part 10 — Deploy & verify on a phone** (Chris's real-device gate).

Each beat/mechanic follows **teach → practise → challenge**; the data motif
(weak when guessing, strong with real numbers) is felt, never stated, with the
single soft decodED line reserved for World 4 (out of scope here).

## 2. Out of scope (locked vision — NOT now)

Worlds 2–4 levels, the Lead path's full script, the final World-4 Oil Baron
fight. Captured in the Story Bible only.

## 3. Check-in before building

This layer is substantial and design-heavy (a cutscene system, a boss, a world
map, character choice, art for three characters). Recommend confirming scope +
order before execution — and note the **cutscene "feel" and boss difficulty are
playtest-dependent**, like the phone gate. Likely best built a few Parts at a
time with Chris in the loop, not one blind autonomous run.
