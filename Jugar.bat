@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Instalado con el instalador: usa su Node.js portatil (runtime\); si no, el del sistema
if exist "%~dp0runtime\node.exe" set "PATH=%~dp0runtime;%PATH%"
title Pokemon Mystery Action
where node >nul 2>nul
if errorlevel 1 goto nonode
rem Instala lo que falte, arranca servidor y juego, y abre el navegador.
rem Deja esta ventana abierta mientras juegas; cierrala para salir.
node tools\launch.mjs %*
if errorlevel 1 pause
exit /b

:nonode
echo.
echo   Falta Node.js. Abre primero Instalar.bat (lo instala solo).
echo.
pause
exit /b 1
