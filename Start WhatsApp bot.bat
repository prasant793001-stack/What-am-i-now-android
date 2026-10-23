@echo off
setlocal
title What Am I Now? WhatsApp bot
cd /d "%~dp0whatsapp-bot"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing it now, please wait...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements || start https://nodejs.org
  echo.
  echo Done. Close this window and double-click "Start WhatsApp bot" again.
  pause & exit /b
)
where git >nul 2>nul
if errorlevel 1 (
  echo Git is needed once to install the bot. Installing it now...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements || start https://git-scm.com/download/win
  echo.
  echo Done. Close this window and double-click "Start WhatsApp bot" again.
  pause & exit /b
)

if not exist "node_modules" (
  echo First time: installing the bot. This takes a few minutes...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Install failed. Check the internet connection and try again. & pause & exit /b 1 )
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WhatAmINow WhatsApp bot.bat"
if not exist "%STARTUP%" (
  choice /c YN /m "Start the bot automatically every time this PC starts"
  if not errorlevel 2 (
    > "%STARTUP%" echo @start "What Am I Now? WhatsApp bot" /min "%~f0"
    echo OK, it will start by itself with Windows.
  )
)

echo.
echo Starting the WhatsApp bot. Keep this window open (you can minimise it).
echo The first time, a pairing code appears below: on the phone with the bot's WhatsApp open
echo   Settings ^> Linked devices ^> Link a device ^> Link with phone number instead, and type the code.
echo.
:loop
node bot.mjs
echo.
echo The bot stopped. Restarting in 10 seconds... (close this window to stop it)
timeout /t 10 >nul
goto loop
