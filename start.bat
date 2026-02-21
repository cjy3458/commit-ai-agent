@echo off
title Commit Analyzer
echo.
echo  ⚡ Commit Analyzer 시작 중...
echo.
cd /d  "%~dp0"
start "" "http://localhost:3000"
npm start
