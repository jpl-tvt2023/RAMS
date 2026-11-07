# Sets up the RAMS Connector on the office PC (M8). "Setup RAMS Connector"
# (setup.ps1) runs this for you; to run it by hand, from the packaged folder
# (npm run package), in PowerShell, as the Windows user who runs Tally:
#
#   powershell -ExecutionPolicy Bypass -File .\install-service.ps1
#
# It:
#   1. checks for Node: the runtime\node.exe packaged with it, else Node 20+
#   2. stops a Connector already running from the install folder, then copies
#      this folder to C:\RAMS\Connector (a new version replaces the old)
#   3. creates %ProgramData%\RAMS\connector.json from the template if it is
#      missing -- put the Connector token an Admin gives you in it
#   4. adds a scheduled task "RAMS Connector" that starts `run` when this user
#      signs in, in a hidden window, and restarts it if it stops
#
# -SettingsFile and -TaskName keep a test install apart from the real one.
# The Connector only reads Tally. To remove it: uninstall-service.ps1.
param(
  [string]$InstallDir = 'C:\RAMS\Connector',
  [string]$SettingsFile = (Join-Path $env:ProgramData 'RAMS\connector.json'),
  [string]$TaskName = 'RAMS Connector',
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $here 'runtime\node.exe')) {
  Write-Host 'Node packaged with the Connector (runtime\node.exe).'
} else {
  $nodeVersion = $null
  try { $nodeVersion = (& node --version) } catch { }
  if (-not $nodeVersion -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 20) {
    Write-Host 'Node 20 or newer is needed. Install the LTS from https://nodejs.org, then run this again.' -ForegroundColor Red
    exit 1
  }
  Write-Host "Node $nodeVersion found."
}

# A Connector running from the install folder: its task, and its node.exe,
# which would hold runtime\node.exe open while the folder is replaced.
function Stop-Connector {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath -like "$InstallDir\*") -or ($_.CommandLine -and $_.CommandLine -like "*$InstallDir\src\cli.js*")
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

$target = (New-Item -ItemType Directory -Force $InstallDir).FullName
if ((Resolve-Path $here).Path -ne $target) {
  Stop-Connector
  Start-Sleep -Milliseconds 500
  Get-ChildItem $InstallDir -Force | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $here '*') -Destination $InstallDir -Recurse -Force
  Write-Host "Copied to $InstallDir."
}

New-Item -ItemType Directory -Force (Split-Path -Parent $SettingsFile) | Out-Null
if (-not (Test-Path $SettingsFile)) {
  Copy-Item (Join-Path $InstallDir 'connector.example.json') $SettingsFile
  Write-Host "Created $SettingsFile. Put the Connector token in it (an Admin makes one), then run this again." -ForegroundColor Yellow
  notepad $SettingsFile
  exit 0
}
if ((Get-Content $SettingsFile -Raw) -match '"token"\s*:\s*"rams_\.\.\.') {
  Write-Host "$SettingsFile still has the example token. Put the real one in, then run this again." -ForegroundColor Yellow
  exit 1
}

# Hidden, so nobody closes the Connector's window by mistake. --config only
# when it isn't the usual place (a test install).
$config = if ($SettingsFile -ne (Join-Path $env:ProgramData 'RAMS\connector.json')) { " --config '$SettingsFile'" } else { '' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $InstallDir `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"& '$InstallDir\rams-connector.cmd' run$config; exit `$LASTEXITCODE`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$options = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $options `
  -Description 'RAMS Connector: reads Tally (never writes to it) and syncs it into RAMS.' -Force | Out-Null
Write-Host "Scheduled task `"$TaskName`" added: it starts when you sign in."

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host 'Started. Check it with:' -NoNewline
  Write-Host "  $InstallDir\rams-connector.cmd status" -ForegroundColor Cyan
}
Write-Host "Logs: $(Join-Path (Split-Path -Parent $SettingsFile) 'logs')"
