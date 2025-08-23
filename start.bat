@echo off
title Dashboard Scrum - Acceso Publico

echo.
echo ========================================
echo [ + ] DARDITO - DASHBOARD SCRUM
echo ========================================
echo.

echo [ + ] Iniciando servidor local...
start "Corriendo Dardito..." cmd /k "node start.js"

echo [ + ] Esperando que dardito inicie...
timeout /t 5 /nobreak >nul

ngrok http --url=right-mite-infinite.ngrok-free.app 3000

pause