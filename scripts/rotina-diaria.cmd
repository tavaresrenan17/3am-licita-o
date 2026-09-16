@echo off
rem Reconciliacao diaria: rele as oportunidades abertas de SP nos proximos 30 dias.

setlocal
cd /d "%~dp0.."

set "LOG=%~dp0..\logs"
if not exist "%LOG%" mkdir "%LOG%"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "ARQ=%LOG%\rotina-%HOJE%.log"

echo ================================================= >> "%ARQ%"
echo Reconciliacao diaria iniciada em %DATE% %TIME% >> "%ARQ%"
echo. >> "%ARQ%"
echo --- descoberta completa SP / 30 dias --- >> "%ARQ%"
call npm run sincronizar -- --uf SP --horizonte 30 >> "%ARQ%" 2>&1
echo. >> "%ARQ%"
echo Reconciliacao diaria encerrada em %DATE% %TIME% >> "%ARQ%"
endlocal
