@echo off
title Commit Ai agent
echo.
echo  ⚡ Commit Ai agent 시작 중...
echo.
cd /d  "%~dp0"
start "" "http://localhost:3000"
npm start
