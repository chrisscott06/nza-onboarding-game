#!/bin/bash
#
# NZA Onboarding Game — one-click launcher (macOS).
# Double-click this file in Finder. It will:
#   1. pull the latest version from GitHub (safely — never discards your work),
#   2. find a free port (away from your other dev servers),
#   3. open the game in your browser and serve it until you close this window.
#
# First time only: macOS may block it. Right-click the file → Open → Open.

cd "$(dirname "$0")" || exit 1

echo "============================================"
echo " NZA Onboarding Game — launcher"
echo " $(pwd)"
echo "============================================"

# --- 1. Get the latest, without ever overwriting local changes -------------
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  echo "→ Checking GitHub for the latest version…"
  git fetch --quiet 2>/dev/null
  if git pull --ff-only 2>/dev/null; then
    echo "  ✓ Up to date."
  else
    echo "  ⚠ Couldn't fast-forward (you have local changes, or the branches"
    echo "    diverged). Nothing was changed — launching your current version."
  fi
else
  echo "→ (Not a git checkout — launching the files as they are.)"
fi

# --- 2. Pick a free port (avoids 5173/5183/5190 etc.) ----------------------
PORT=""
for P in 8173 8174 8175 8420 8421 9173; do
  if ! lsof -i ":$P" >/dev/null 2>&1; then PORT="$P"; break; fi
done
[ -z "$PORT" ] && PORT=8173

# --- 3. Find a Python to serve with ----------------------------------------
if command -v python3 >/dev/null 2>&1; then
  SERVE=(python3 -m http.server "$PORT")
elif command -v python >/dev/null 2>&1; then
  SERVE=(python -m http.server "$PORT")
else
  echo "✗ Python isn't installed. Install it, or run:  npx serve ."
  echo "Press any key to close."
  read -n 1 -s
  exit 1
fi

URL="http://localhost:$PORT"
echo "→ Serving at $URL"
echo "  (Leave this window open while you play. Press Ctrl-C or close it to stop.)"

# open the browser once the server has had a moment to start
( sleep 1; open "$URL" ) &

exec "${SERVE[@]}"
