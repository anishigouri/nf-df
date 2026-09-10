@echo off
setlocal

set PORT=3001
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

echo Iniciando o sistema, aguarde alguns segundos...
start "NFS-e - servidor rodando (NAO FECHE esta janela)" /d "%~dp0app" "%~dp0node\node.exe" server\index.js

timeout /t 6 /nobreak >nul
start "" "http://localhost:%PORT%"
