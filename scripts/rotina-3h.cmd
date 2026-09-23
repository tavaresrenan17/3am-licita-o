@echo off
rem Rotina do 3AM Licitacao - coleta do PNCP a cada tres horas no PC.
rem
rem PLANO B: desde 23/09/2026 a coleta roda no GitHub Actions. Esta rotina so e
rem agendada com `scripts\agendar-rotinas.ps1 -ColetaLocal`, para quando o
rem Actions estiver fora; nunca as duas ao mesmo tempo.
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

rem Janela de 2 h 40 min: da tempo de esperar o cooldown dos segmentos quando o
rem PNCP oscila, em vez de desistir e so tentar de novo no horario seguinte, e
rem ainda termina antes do proximo disparo.
set "SYNC_MAX_RUNTIME_MS=9600000"

echo. >> "%ARQ%"
echo --- incremental SP --- >> "%ARQ%"
call npm run sincronizar -- incremental --uf SP >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo Rotina incremental encerrada em %DATE% %TIME% >> "%ARQ%"
endlocal
