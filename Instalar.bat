@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Pokemon Mystery Action - Instalador
echo.
echo   Pokemon Mystery Action - instalador
echo   ===================================
echo.

rem --- 1. Node.js (el juego lo necesita para el servidor y el cliente)
where node >nul 2>nul
if errorlevel 1 goto installnode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto oldnode
goto havenode

:installnode
echo   No tienes Node.js instalado. Se va a instalar la version LTS.
where winget >nul 2>nul
if errorlevel 1 goto manualnode
echo   Instalando Node.js con winget. Acepta el aviso de Windows si aparece...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto manualnode
goto havenode

:oldnode
echo   Tu Node.js es demasiado antiguo (hace falta la 22.13 o posterior).
where winget >nul 2>nul
if errorlevel 1 goto manualnode
echo   Actualizando Node.js con winget. Acepta el aviso de Windows si aparece...
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto manualnode
goto havenode

:manualnode
echo.
echo   No se ha podido instalar Node.js automaticamente.
echo   Se abrira la pagina de descarga: instala la version LTS
echo   y despues vuelve a abrir Instalar.bat.
start "" "https://nodejs.org/es/download"
pause
exit /b 1

:havenode
rem --- 2. Dependencias del juego (npm install, sin Git)
node tools\launch.mjs --install-only
if errorlevel 1 goto failed

rem --- 3. Acceso directo en el escritorio
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Pokemon Mystery Action.lnk')); $s.TargetPath=(Join-Path '%~dp0' 'Jugar.bat'); $s.WorkingDirectory='%~dp0'; $s.Description='Pokemon Mystery Action'; $s.Save()" >nul 2>nul
if errorlevel 1 (echo   No se pudo crear el acceso directo; usa Jugar.bat de esta carpeta.) else (echo   Acceso directo creado en el escritorio: "Pokemon Mystery Action".)
echo.
echo   Instalacion terminada. Arrancando el juego...
echo.

rem --- 4. Jugar
call "%~dp0Jugar.bat"
exit /b

:failed
echo.
echo   La instalacion no ha terminado. Lee el mensaje de arriba.
pause
exit /b 1
