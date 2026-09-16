# Registra a rotina a cada três horas no Agendador de Tarefas do Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover
#
# Roda no seu usuário, sem exigir elevação. `StartWhenAvailable` executa a tarefa
# quando a máquina voltar caso um dos horários tenha sido perdido.

param([switch]$Remover)

$ErrorActionPreference = "Stop"
$Nome = "3AM Licitacao - sincronizacao 3h"
$NomeAntigo = "3AM Licitacao - rotina noturna"
$Raiz = Split-Path -Parent $PSScriptRoot
$Cmd = Join-Path $PSScriptRoot "rotina-3h.cmd"

if ($Remover) {
  foreach ($Tarefa in @($Nome, $NomeAntigo)) {
    if (Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false
      Write-Host "Tarefa removida: $Tarefa"
    }
  }
  return
}

if (-not (Test-Path $Cmd)) { throw "Nao encontrei $Cmd" }

$Acao = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Cmd`"" -WorkingDirectory $Raiz
$Gatilhos = 0, 3, 6, 9, 12, 15, 18, 21 | ForEach-Object {
  New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($_).AddMinutes(17))
}

$Config = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

# IgnoreNew e o limite de 4 h impedem duas rodadas concorrentes. O checkpoint no
# banco permite que o próximo horário retome uma coleta interrompida.

if (Get-ScheduledTask -TaskName $NomeAntigo -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $NomeAntigo -Confirm:$false
}

Register-ScheduledTask -TaskName $Nome -Action $Acao -Trigger $Gatilhos -Settings $Config `
  -Description "Sincroniza licitacoes abertas de SP no PNCP a cada 3 horas. Log em logs\rotina-AAAA-MM-DD.log" `
  -Force | Out-Null

$t = Get-ScheduledTask -TaskName $Nome
Write-Host "Tarefa registrada: $($t.TaskName)"
Write-Host "Proxima execucao: $((Get-ScheduledTaskInfo -TaskName $Nome).NextRunTime)"
Write-Host "Para remover:  powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover"
