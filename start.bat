@echo off
cd /d "%~dp0"
title Project 10 - Daily Study Dashboard (Port 3000)
cls
echo ============================================================
echo  Project 10 - Daily Study Dashboard (Node.js Port 3000)
echo ============================================================
echo.
echo Starting server and waiting for readiness...

start /b "" node -e "const http = require('http'); function poll() { http.get('http://localhost:3000/', r => { if (r.statusCode === 200) { console.log('[OK] Server is ready! Opening browser...'); require('child_process').exec('start http://localhost:3000'); } else { setTimeout(poll, 300); } }).on('error', () => setTimeout(poll, 300)); } setTimeout(poll, 500);"

node server.js

echo.
echo ============================================================
echo  Server stopped. Press any key to close this window.
echo ============================================================
pause >nul
