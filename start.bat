@echo off
title TOKAT BAR
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kur.
  pause
  exit /b
)
start "" http://localhost:3000
node server.js
pause
