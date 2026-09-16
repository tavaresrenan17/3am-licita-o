# Registra a rotina noturna no Agendador de Tarefas do Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover
#
# Roda no seu usuário, sem exigir elevação. O computador precisa estar ligado às
# 03:00 — `StartWhenAvailable` faz a tarefa correr assim que ele voltar, então
# uma noite com a máquina desligada vira atraso, não buraco no catálogo.

param([switch]$Remover)

$ErrorActionPreference = "Stop"
$Nome = "3AM Licitacao - rotina noturna"
$Raiz = Split-Path -Parent $PSScriptRoot
$Cmd = Join-Path $PSScriptRoot "rotina-3h.cmd"

if ($Remover) {
  if (Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
    Write-Host "Tarefa removida."
  } else {
    Write-Host "Nao havia tarefa registrada com esse nome."
  }
  return
}

if (-not (Test-Path $Cmd)) { throw "Nao encontrei $Cmd" }

$Acao = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Cmd`"" -WorkingDirectory $Raiz
$Gatilho = New-ScheduledTaskTrigger -Daily -At 03:00

$Config = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

# IgnoreNew e o limite de 4 h existem juntos: se uma noite travar contra um PNCP
# fora do ar, a tarefa e encerrada e a noite seguinte comeca limpa, em vez de
# duas rodadas concorrentes disputando o mesmo job.

Register-ScheduledTask -TaskName $Nome -Action $Acao -Trigger $Gatilho -Settings $Config `
  -Description "Sincroniza o catalogo do PNCP e coleta documentos. Log em logs\rotina-AAAA-MM-DD.log" `
  -Force | Out-Null

$t = Get-ScheduledTask -TaskName $Nome
Write-Host "Tarefa registrada: $($t.TaskName)"
Write-Host "Proxima execucao: $((Get-ScheduledTaskInfo -TaskName $Nome).NextRunTime)"
Write-Host "Para remover:  powershell -ExecutionPolicy Bypass -File scripts\agendar-3h.ps1 -Remover"
