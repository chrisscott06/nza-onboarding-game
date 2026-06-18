# CREDITS

Every borrowed engine, asset, sound, font, or piece of code — and its licence —
gets logged here as it is added. This is part of the lesson: never lose track of
where a thing came from or whether you're allowed to use it.

## Engine

**Decision (Part A):** No third-party game engine was used. The brief asked us
to prefer adapting a minimal open-source platformer (Kaboom/Phaser starter or a
vanilla-canvas tutorial). After weighing it, we wrote a small **vanilla HTML5
canvas** engine from scratch instead — roughly 200 lines, no dependencies, no
build tool, no framework.

Rationale (kept here so the choice is auditable):
- The brief's strongest steer is "boring and bulletproof… debuggable by
  beginners next week." A dependency-free canvas engine is the most readable
  thing Will and Imi can study — every line of physics is right there.
- It avoids a CDN/version dependency and any framework lock-in.
- It is genuinely small, so the "don't write a whole physics engine" risk
  (token blow-out, bugs) is contained.

The physics follows standard, widely-documented 2D platformer technique
(acceleration + friction, variable-height jump, coyote-time, jump-buffering,
axis-separated AABB collision). No code was copied from a specific source; it is
original to this repo and therefore carries the repo's own licence.

If we later swap in a third-party engine, its name, repo URL, and licence go
here.

## Fonts (Part F)

Loaded via Google Fonts, all under the SIL Open Font License 1.1 (free for
commercial use, embedding allowed):
- **DM Serif Display** (Colophon Foundry) — display / headings, weight 400 only.
- **Inter** (Rasmus Andersson) — body and UI.
- **IBM Plex Mono** (IBM) — data/score readouts and labels.

**Stolzl** (NOT OFL — a licensed brand face) — the NZA display font, used for the
"NET ZERO HERO" wordmark on the boot/intro screen. Self-hosted from
`public/fonts/stolzl_*.otf` (the same files as the NZA website). Covered by the
NZA Stolzl licence — do not redistribute outside NZA projects.

## Logo (Part F)

- `public/nza-logo.svg` — the **official NZA mark** (layered triangles in a ring,
  brand line style), used on the menu and as the faint in-game watermark. Copied
  from the NZA brand asset set (`public/logos/NZA-LOGO-LINE.svg`).

## NZA brand asset library

- `public/logos/`, `public/icons/`, `public/infographics/` — official NZA / NZAI
  / Pablo brand SVGs (and a Pablo `.ai` source), kept in the repo as a handy
  asset set to draw on. NZA-owned; not all are used by the game yet.

## Assets (sprites)

- `public/sprites/*.svg` — the shared object sprites. Original to this repo.
  Foundation six: gas boiler, ICE car, oil slick, solar panel, wind turbine,
  heat pump. Level-1 ("Power Up the Grid") additions: battery cell, CCGT gas
  plant, peaker plant, standby-load gremlin, insulation.
- `levels/*/assets/face-*.svg` — placeholder pixel faces. Original to this repo;
  authors drop in their own face SVG to replace them.

## Audio

All sound is **generated in code** at runtime (`src/audio.js`) using the Web
Audio API — retro chiptune SFX and a light backing loop. Nothing is sampled or
downloaded, so there are no third-party audio assets or licences to track. This
is the AUDIO-GUIDE's "Route 2 — generate custom retro sounds", done
programmatically. Original to this repo.

(If anyone later swaps in CC0 sound files per `audio/AUDIO-GUIDE.md`, log each
one here with its source URL + licence.)
