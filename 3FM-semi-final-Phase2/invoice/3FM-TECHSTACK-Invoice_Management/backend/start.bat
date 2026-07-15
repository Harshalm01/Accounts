@echo off
title 3FM Backend Server
cd /d "%~dp0"
echo Starting 3FM Backend...
echo.
call npm run dev
pause
