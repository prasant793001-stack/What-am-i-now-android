@echo off
setlocal
title Publish to GitHub - What Am I Now?
cd /d "%~dp0"
set "REPO=https://github.com/prasant793001-stack/What-am-i-now-android.git"

echo ============================================
echo   Publishing What Am I Now? to GitHub
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed on this PC. Installing it now, please wait...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements || (echo Could not install automatically. Download Git from https://git-scm.com/download/win and install it with the default options. & start https://git-scm.com/download/win)
  echo.
  echo Git is installed. Close this window and double-click "Publish to GitHub" again.
  pause
  exit /b
)

if not exist ".git" (
  echo First time only: connecting this folder to GitHub...
  git init -q -b main
  git remote add origin "%REPO%"
  git fetch -q origin main
  if errorlevel 1 goto :failed
  git reset -q origin/main
)

findstr /c:"PASTE_API_KEY" firebase-config.js >nul 2>nul
if not errorlevel 1 (
  echo STOP: this folder is an old copy - its firebase-config.js has no keys.
  echo Publishing it would switch the live website back to Demo mode.
  echo Download the latest version from GitHub ^(Code ^> Download ZIP^) and use that folder instead.
  pause
  exit /b 1
)

git config user.name >nul 2>nul || git config user.name "prasant793001-stack"
git config user.email >nul 2>nul || git config user.email "prasant793001@gmail.com"

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Update from PC %date% %time%"
  echo Changes saved:
  git show --stat --format="" HEAD
) else (
  echo No new changes in this folder.
)

echo.
echo Uploading... (the first time, a GitHub sign-in window may open)
git pull -q --no-rebase --no-edit -X ours origin main
git push -q origin main
if errorlevel 1 goto :failed

echo.
echo DONE! Your changes are on GitHub. The website updates in about 1 minute.
timeout /t 10
exit /b 0

:failed
echo.
echo Upload FAILED. Check the internet connection and sign in to GitHub if asked, then try again.
pause
exit /b 1
