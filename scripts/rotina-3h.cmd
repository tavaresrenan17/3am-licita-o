@echo off
rem Rotina noturna do 3AM Licitacao - roda as 03:00 pelo Agendador de Tarefas.
rem
rem A ordem importa:
rem   1. descoberta  - traz as oportunidades novas com proposta aberta
rem   2. incremental - traz o que MUDOU no que ja acompanhamos
rem
rem Documentos nao entram nesta rotina: o catalogo guarda o resumo e o link
rem oficial do PNCP. Metadados de anexos podem ser coletados sob demanda.
rem
rem Cada etapa e retomavel: se o PNCP cair no meio, a proxima noite continua de
rem onde parou, e nada do que ja foi gravado se perde.

setlocal
cd /d "%~dp0.."

set "LOG=%~dp0..\logs"
if not exist "%LOG%" mkdir "%LOG%"

rem Nome do arquivo com a data em AAAA-MM-DD, independente do formato regional.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "ARQ=%LOG%\rotina-%HOJE%.log"

echo ================================================= >> "%ARQ%"
echo Rotina iniciada em %DATE% %TIME% >> "%ARQ%"

echo. >> "%ARQ%"
echo --- 1/2 descoberta --- >> "%ARQ%"
call npm run sincronizar >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo --- 2/2 incremental --- >> "%ARQ%"
call npm run sincronizar -- incremental >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo Rotina encerrada em %DATE% %TIME% >> "%ARQ%"
endlocal
