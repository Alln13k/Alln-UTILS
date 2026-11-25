@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title Alln UTILS

where node >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Node.js introuvable dans le PATH. Installe Node.js 20+ : https://nodejs.org
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
    echo [ATTENTION] Node.js %NODE_MAJOR% detecte, version 20+ requise.
)

if not exist ".env" (
    copy /y ".env.example" ".env" >nul
    echo [INFO] .env cree depuis .env.example.
    echo        Renseigne DISCORD_TOKEN, CLIENT_ID et GUILD_ID puis relance ce fichier.
    notepad ".env"
    pause
    exit /b 0
)

if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERREUR] npm install a echoue.
        pause
        exit /b 1
    )
)

echo [INFO] Demarrage du bot...
node src/index.js

echo.
echo [INFO] Le bot s'est arrete. Code de sortie : %ERRORLEVEL%
pause
