@echo off
REM ===========================================================================
REM  NZA Onboarding Game - one-click launcher (Windows).
REM  Double-click this file. It will:
REM    1. pull the latest version from GitHub (safely - never discards work),
REM    2. serve the game on a free-ish port,
REM    3. open it in your browser and serve until you close this window.
REM ===========================================================================
setlocal
cd /d "%~dp0"

echo ============================================
echo  NZA Onboarding Game - launcher
echo  %cd%
echo ============================================

REM --- 1. Get the latest, without overwriting local changes ----------------
where git >nul 2>nul
if %errorlevel%==0 (
  if exist ".git" (
    echo Checking GitHub for the latest version...
    git pull --ff-only
    if errorlevel 1 (
      echo   Could not fast-forward ^(local changes or diverged^) - launching your current version.
    ) else (
      echo   Up to date.
    )
  )
)

REM --- 2. Port away from your other dev servers ----------------------------
set PORT=8173

set URL=http://localhost:%PORT%
echo Serving at %URL%
echo   ^(Leave this window open while you play. Close it to stop.^)

start "" "%URL%"

REM --- 3. Serve with Python (py launcher, then python) ---------------------
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server %PORT%
) else (
  python -m http.server %PORT%
)

endlocal
