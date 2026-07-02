@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer from nodejs.org.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
