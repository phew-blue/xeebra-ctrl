param([string]$InstallDir)

$taskName = "xeebra-ctrl"
$exePath  = Join-Path $InstallDir "xeebra-ctrl.exe"

# Remove existing task if present
schtasks /Delete /TN $taskName /F 2>$null | Out-Null

# Create a task that runs at logon for any user
$action  = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null

Write-Host "Startup task '$taskName' registered."
