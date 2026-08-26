@echo off
cd /d "%~dp0"
title Project 10 - Daily Study Dashboard (Port 3000)
cls
echo ============================================================
echo  Project 10 - Daily Study Dashboard (Node.js Port 3000)
echo ============================================================
echo.
echo Starting server on http://localhost:3000 ...
start "" http://localhost:3000
node server.js
echo.
echo ============================================================
echo  Server stopped. Press any key to close this window.
echo ============================================================
pause >nul
