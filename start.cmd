@echo off
title Nebula Play
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"

echo ========================================
echo   Nebula Play - Iniciando...
echo ========================================
echo.

echo [1/2] Iniciando API Server (porta 3001)...
start "Nebula API" /MIN node server.js
timeout /t 2 /nobreak >nul

echo [2/2] Iniciando Vite Dev Server (porta 3000)...
echo.
echo ========================================
echo   Abra: http://localhost:3000
echo ========================================
echo.
node node_modules\vite\bin\vite.js --port 3000
