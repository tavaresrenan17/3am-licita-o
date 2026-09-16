# Registra a rotina a cada três horas no Agendador de Tarefas do Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover
#
# Roda no seu usuário, sem exigir elevação. `StartWhenAvailable` executa a tarefa
# quando a máquina voltar caso um dos horários tenha sido perdido.

param([switch]$Remover)

$ErrorActionPreference = "Stop"
$Nome = "3AM Licitacao - incremental 3h"
$NomeCompleta = "3AM Licitacao - reconciliacao diaria"
$NomeIntermediario = "3AM Licitacao - sincronizacao 3h"
$NomeAntigo = "3AM Licitacao - rotina noturna"
$Raiz = Split-Path -Parent $PSScriptRoot
$CmdIncremental = Join-Path $PSScriptRoot "rotina-3h.cmd"
$CmdCompleta = Join-Path $PSScriptRoot "rotina-diaria.cmd"

if ($Remover) {
  foreach ($Tarefa in @($Nome, $NomeCompleta, $NomeIntermediario, $NomeAntigo)) {
    if (Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false
      Write-Host "Tarefa removida: $Tarefa"
    }
  }
  return
}

if (-not (Test-Path $CmdIncremental)) { throw "Nao encontrei $CmdIncremental" }
if (-not (Test-Path $CmdCompleta)) { throw "Nao encontrei $CmdCompleta" }

$AcaoIncremental = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$CmdIncremental`"" -WorkingDirectory $Raiz
$AcaoCompleta = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$CmdCompleta`"" -WorkingDirectory $Raiz
# 03:17 fica reservado à carga completa iniciada às 03:47. Assim as duas
# rotinas não disputam a API nem o mesmo job no banco.
$GatilhosIncrementais = 0, 6, 9, 12, 15, 18, 21 | ForEach-Object {
  New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($_).AddMinutes(17))
}
$GatilhoCompleta = New-ScheduledTaskTrigger -Daily -At 03:47

$Config = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

# IgnoreNew e o limite de 4 h impedem duas rodadas concorrentes. O checkpoint no
# banco permite que o próximo horário retome uma coleta interrompida.

foreach ($TarefaObsoleta in @($NomeIntermediario, $NomeAntigo)) {
  if (Get-ScheduledTask -TaskName $TarefaObsoleta -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TarefaObsoleta -Confirm:$false
  }
}

Register-ScheduledTask -TaskName $Nome -Action $AcaoIncremental -Trigger $GatilhosIncrementais -Settings $Config `
  -Description "Atualiza registros novos ou alterados do PNCP em SP a cada 3 horas. Log em logs\rotina-AAAA-MM-DD.log" `
  -Force | Out-Null

Register-ScheduledTask -TaskName $NomeCompleta -Action $AcaoCompleta -Trigger $GatilhoCompleta -Settings $Config `
  -Description "Reconcilia diariamente as licitacoes abertas de SP para os proximos 30 dias." `
  -Force | Out-Null

Write-Host "Tarefa registrada: $Nome"
Write-Host "Proxima incremental: $((Get-ScheduledTaskInfo -TaskName $Nome).NextRunTime)"
Write-Host "Tarefa registrada: $NomeCompleta"
Write-Host "Proxima completa: $((Get-ScheduledTaskInfo -TaskName $NomeCompleta).NextRunTime)"
Write-Host "Para remover:  powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover"
