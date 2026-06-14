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
- Level content is still hardcoded in `src/game.js` — moves to JSON in Part C.
- No hazards, collectibles, faces, branding, or power-up yet.

## Next

- **Part B** — Add collision outcomes: touching a hazard ends/resets the run;
  touching a collectible increments a visible score. Verify in-browser, commit.

(Build order: A → B → C → D → E → F → G → H → I. Each Part has a STOP-AND-PROVE
gate in `BRIEF.md §6`. Nothing is "done" until verified working in a real
browser / on a real phone.)
