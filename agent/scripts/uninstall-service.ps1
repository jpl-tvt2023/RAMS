# Removes the RAMS Connector's scheduled task (install-service.ps1) and stops
# the Connector. Its settings and logs in %ProgramData%\RAMS, and the folder
# C:\RAMS\Connector, are left in place; delete them by hand if they are no
# longer wanted.
#
#   powershell -ExecutionPolicy Bypass -File .\uninstall-service.ps1
param(
  [string]$InstallDir = 'C:\RAMS\Connector',
  [string]$TaskName = 'RAMS Connector'
)
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host 'The RAMS Connector task is not installed.'
  exit 0
}
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  ($_.ExecutablePath -and $_.ExecutablePath -like "$InstallDir\*") -or ($_.CommandLine -and $_.CommandLine -like "*$InstallDir\src\cli.js*")
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host 'The RAMS Connector task is removed. It no longer starts at sign-in.'
