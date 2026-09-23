# Registra as rotinas do PC no Agendador de Tarefas do Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-rotinas.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-rotinas.ps1 -ColetaLocal
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-rotinas.ps1 -Remover
#
# Desde 23/09/2026 a coleta do PNCP roda no GitHub Actions
# (.github\workflows\sincronizacao-pncp.yml), e o PC fica só com a rotina diária
# de documentos e embeddings, que depende do Ollama local. Por padrão este script
# registra essa rotina e REMOVE a coleta de 3 h do PC: dois condutores na mesma
# coleta dobram a carga sobre o PNCP.
#
# -ColetaLocal é o plano B para quando o Actions estiver fora: registra de novo a
# coleta de 3 h no PC. Desligue o workflow no GitHub antes, pelo mesmo motivo.
#
# Roda no seu usuário, sem exigir elevação. `StartWhenAvailable` executa a tarefa
# quando a máquina voltar caso um dos horários tenha sido perdido.

param([switch]$Remover, [switch]$ColetaLocal)

$ErrorActionPreference = "Stop"
$NomeColeta = "3AM Licitacao - incremental 3h"
$NomeDiaria = "3AM Licitacao - documentos diarios"
$NomesAntigos = @(
  "3AM Licitacao - reconciliacao diaria",
  "3AM Licitacao - sincronizacao 3h",
  "3AM Licitacao - rotina noturna"
)
$Raiz = Split-Path -Parent $PSScriptRoot
$CmdColeta = Join-Path $PSScriptRoot "rotina-3h.cmd"
$CmdDiaria = Join-Path $PSScriptRoot "rotina-diaria.cmd"

function Remover-Tarefa([string]$Tarefa) {
  if (Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false
    Write-Host "Tarefa removida: $Tarefa"
  }
}

if ($Remover) {
  foreach ($Tarefa in @($NomeColeta, $NomeDiaria) + $NomesAntigos) { Remover-Tarefa $Tarefa }
  return
}

if (-not (Test-Path $CmdDiaria)) { throw "Nao encontrei $CmdDiaria" }
if ($ColetaLocal -and -not (Test-Path $CmdColeta)) { throw "Nao encontrei $CmdColeta" }

$Config = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

# IgnoreNew e o limite de 4 h impedem duas rodadas concorrentes da mesma tarefa.

foreach ($Tarefa in $NomesAntigos) { Remover-Tarefa $Tarefa }

# `conhost --headless` roda o cmd sem janela. Com janela visível, fechá-la (ou
# um Ctrl+C) matava a coleta no meio: os `^C` nos logs e o código 0xC000013A da
# reconciliação de 23/09/2026 vêm daí.
$AcaoDiaria = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless cmd.exe /c `"$CmdDiaria`"" -WorkingDirectory $Raiz
Register-ScheduledTask -TaskName $NomeDiaria -Action $AcaoDiaria -Trigger (New-ScheduledTaskTrigger -Daily -At 03:47) -Settings $Config `
  -Description "Baixa documentos pendentes e gera embeddings (Ollama local). Log em logs\diaria-AAAA-MM-DD.log" `
  -Force | Out-Null
Write-Host "Tarefa registrada: $NomeDiaria (proxima: $((Get-ScheduledTaskInfo -TaskName $NomeDiaria).NextRunTime))"

if ($ColetaLocal) {
  $AcaoColeta = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless cmd.exe /c `"$CmdColeta`"" -WorkingDirectory $Raiz
  $Gatilhos = 0, 3, 6, 9, 12, 15, 18, 21 | ForEach-Object {
    New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($_).AddMinutes(17))
  }
  Register-ScheduledTask -TaskName $NomeColeta -Action $AcaoColeta -Trigger $Gatilhos -Settings $Config `
    -Description "PLANO B: coleta do PNCP no PC a cada 3 horas. Log em logs\rotina-AAAA-MM-DD.log" `
    -Force | Out-Null
  Write-Host "Tarefa registrada (plano B): $NomeColeta (proxima: $((Get-ScheduledTaskInfo -TaskName $NomeColeta).NextRunTime))"
} else {
  Remover-Tarefa $NomeColeta
}
