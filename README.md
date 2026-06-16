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

## Quick start — just double-click

- **macOS:** double-click **`launch.command`**.
- **Windows:** double-click **`launch.bat`**.

Each one pulls the latest version from GitHub (safely — it never overwrites your
local changes; if it can't fast-forward it just runs your current copy), serves
the game on a free port (away from other dev servers), and opens it in your
browser. Leave the little terminal window open while you play; close it to stop.

> First time on macOS, Gatekeeper may block it: right-click `launch.command` →
> **Open** → **Open**. After that, a normal double-click works.

The game always loads the freshest files (it cache-busts its own data and
scripts), so every launch uses the latest version.

## Run it locally (manual)

It's plain web — HTML, CSS, JS. No build step. You just need a tiny static
server (browsers block JS modules / fetch on `file://`).

```bash
# from the repo root, any one of these:
python3 -m http.server 5173
# or
npx serve .
```

Then open <http://localhost:5173> in a browser.

**Controls:** ← / → (or A / D) to move, Space / ↑ / W to jump. On a touch
device, on-screen buttons appear automatically.

## Deploy (Vercel)

It's a static site — no build step. `vercel.json` already sets it up
(`framework: null`, no build, serve from repo root).

- **CLI:** `npm i -g vercel`, then run `vercel` in the repo root and follow the
  prompts (`vercel --prod` to promote).
- **Dashboard:** import the GitHub repo at vercel.com. Framework preset
  "Other", leave the build command empty, output directory `.`.

After deploying, **open the live URL on a real phone** and play it with the
touch buttons — that's the real-device check the build is designed to pass.

## Project layout

See [`BRIEF.md` §3](BRIEF.md) for the full, intentional folder structure — it is
part of what the game teaches. `CLAUDE.md` (added in Part I) explains the level
contract so anyone's agent can build a new level from `levels/_template-level/`.
