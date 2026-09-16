@echo off
rem Rotina do 3AM Licitacao - roda a cada tres horas pelo Agendador de Tarefas.
rem
rem Busca apenas registros novos ou alterados desde a cobertura anterior.
rem
rem Documentos nao entram nesta rotina: o catalogo guarda o resumo e o link
rem oficial do PNCP. Metadados de anexos podem ser coletados sob demanda.
rem
rem A etapa e retomavel: se o PNCP cair no meio, o proximo horario continua de
rem onde parou, e nada do que ja foi gravado se perde.

setlocal
cd /d "%~dp0.."

set "LOG=%~dp0..\logs"
if not exist "%LOG%" mkdir "%LOG%"

rem Nome do arquivo com a data em AAAA-MM-DD, independente do formato regional.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "ARQ=%LOG%\rotina-%HOJE%.log"

echo ================================================= >> "%ARQ%"
echo Rotina incremental iniciada em %DATE% %TIME% >> "%ARQ%"

echo. >> "%ARQ%"
echo --- incremental SP --- >> "%ARQ%"
call npm run sincronizar -- incremental --uf SP >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo Rotina incremental encerrada em %DATE% %TIME% >> "%ARQ%"
endlocal
