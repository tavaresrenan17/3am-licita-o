@echo off
rem Rotina diaria do PC: filas de documentos e embeddings.
rem
rem A coleta do catalogo (incremental a cada 3 h e reconciliacao diaria de 30
rem dias) roda no GitHub Actions desde 23/09/2026, em
rem .github\workflows\sincronizacao-pncp.yml. Ela saiu daqui para haver um unico
rem condutor: dois processos na mesma coleta dobram a carga sobre o PNCP. Estas
rem duas filas ficam no PC porque os embeddings dependem do Ollama local.

setlocal
cd /d "%~dp0.."

set "LOG=%~dp0..\logs"
if not exist "%LOG%" mkdir "%LOG%"

rem Arquivo proprio: se a rotina de 3 h voltar a rodar no PC como plano B, dois
rem cmd anexando no mesmo arquivo com >> disputam o arquivo e um perde a saida.
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "HOJE=%%d"
set "ARQ=%LOG%\diaria-%HOJE%.log"

echo ================================================= >> "%ARQ%"
echo Rotina diaria iniciada em %DATE% %TIME% >> "%ARQ%"

rem --------------------------------------------------------------------------
rem Filas de documentos e embeddings.
rem
rem Uma vez por dia, e nao a cada 3 h: medido em 18/09/2026, o PNCP
rem recusou 62%% dos downloads com HTTP 422 do proprio armazenamento dele.
rem Insistir de tres em tres horas contra uma fonte nesse estado gasta rede para
rem ganhar pouco. A janela de retentativa da fila e de 6 h, entao uma passada
rem por dia ja recupera o que voltou a ficar disponivel.
rem
rem A ordem importa: embedding so tem o que fazer depois que o texto existe.
rem --------------------------------------------------------------------------

echo. >> "%ARQ%"
echo --- garantindo o Ollama no ar --- >> "%ARQ%"
rem O Ollama nao inicia com o Windows (verificado: sem servico e sem entrada de
rem inicializacao). Sem isso, a etapa de embeddings falharia toda madrugada.
rem `start /b` nao bloqueia, e se ele ja estiver rodando o segundo processo sai
rem sozinho sem efeito nenhum.
start "" /b ollama serve >> "%ARQ%" 2>&1
rem Espera o socket subir. `ping` em vez de `timeout` porque `timeout` exige
rem console interativo e a tarefa agendada roda sem um.
ping -n 9 127.0.0.1 >nul 2>&1

echo. >> "%ARQ%"
echo --- fila de documentos: baixar e extrair texto --- >> "%ARQ%"
call npm run baixar:documentos >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo --- fila de embeddings: vetorizar licitacoes e trechos --- >> "%ARQ%"
rem O lease no banco impede que esta rodada colida com uma execucao manual:
rem se houver uma em andamento, este comando encerra avisando, sem estragar nada.
call npm run gerar:embeddings >> "%ARQ%" 2>&1

echo. >> "%ARQ%"
echo Rotina diaria encerrada em %DATE% %TIME% >> "%ARQ%"
endlocal
