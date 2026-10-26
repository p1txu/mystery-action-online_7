@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pokemon Mystery Action - Actualizar
where node >nul 2>nul
if errorlevel 1 goto nonode
rem Descarga e instala la ultima version (tus partidas no se tocan).
rem No hace falta usarlo: Jugar.bat ya busca actualizaciones al abrirse.
node tools\update.mjs %*
pause
exit /b

:nonode
echo.
echo   Falta Node.js. Abre primero Instalar.bat (lo instala solo).
echo.
pause
exit /b 1
