# NZA Onboarding Game

A deliberately silly 2D platformer — Super Mario, but the baddies are gas
boilers, ICE cars and oil slicks, the collectibles are renewables, and the
power-up is an air-source heat pump. Each team member's face becomes their
character.

The game is bait. Its real job is to teach the NZA way of building software with
AI agents: clone a repo, work to a contract, create and store assets, commit in
stages, branch, push, open a PR, deploy, and verify on a real device.

See [`BRIEF.md`](BRIEF.md) for the full specification and
[`status.md`](status.md) for what currently works.

## Run it locally

It's plain web — HTML, CSS, JS. No build step. You just need a tiny static
server (browsers block JS modules / fetch on `file://`).

```bash
# from the repo root, any one of these:
python3 -m http.server 5173
# or
npx serve .
```

Then open <http://localhost:5173> in a browser.

**Controls:** ← / → (or A / D) to move, Space / ↑ / W to jump. Touch controls
arrive in Part H.

## Project layout

See [`BRIEF.md` §3](BRIEF.md) for the full, intentional folder structure — it is
part of what the game teaches. `CLAUDE.md` (added in Part I) explains the level
contract so anyone's agent can build a new level from `levels/_template-level/`.
