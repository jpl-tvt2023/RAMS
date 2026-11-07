# The RAMS Connector setup window (M8). Double-click "Setup RAMS Connector"
# in the packaged folder. On this PC, as the Windows user who runs Tally, it:
#   1. checks that Tally answers and which companies are open
#   2. checks the Connector code with RAMS (cli.js check)
#   3. saves the code in %ProgramData%\RAMS\connector.json
#   4. installs the Connector to start at sign-in (install-service.ps1)
#   5. the first time, loads all of Tally into RAMS (sync --kind resync)
#   6. starts it
# Each problem is said in plain words with what to do, then "Try again".
# Running it again later checks the connection, or takes a new code.
# The Connector only reads Tally; it never changes it.
#
# Kept to ASCII: Windows PowerShell reads a script without a BOM as ANSI.
#
# For testing: -Auto -Code X does every step without clicks (-LoadNow ticks
# the load box) and prints each step; -Screenshot FILE saves the window at the
# end; -ApiUrl, -InstallDir, -SettingsFile and -TaskName keep a test install
# apart from the real one.
param(
  [string]$Code = '',
  [string]$ApiUrl = '',
  [switch]$Auto,
  [switch]$LoadNow,
  [string]$Screenshot = '',
  [string]$InstallDir = 'C:\RAMS\Connector',
  [string]$SettingsFile = (Join-Path $env:ProgramData 'RAMS\connector.json'),
  [string]$TaskName = 'RAMS Connector'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:exitCode = 0

function Show-Problem([string]$text) {
  if ($Auto) { [Console]::Out.WriteLine("FAILED: $text") } else { [System.Windows.Forms.MessageBox]::Show($text, 'RAMS Connector setup', 'OK', 'Error') | Out-Null }
}

try {
  # Files from a downloaded zip are marked "from the internet"; Windows would
  # then ask before each one runs.
  Get-ChildItem $here -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

  $node = Join-Path $here 'runtime\node.exe'
  if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }

  # The settings to start from: this PC's, else the template.
  $template = Get-Content (Join-Path $here 'connector.example.json') -Raw | ConvertFrom-Json
  $saved = $null
  if (Test-Path $SettingsFile) {
    try { $saved = Get-Content $SettingsFile -Raw | ConvertFrom-Json } catch { $saved = $null }
  }
  $settings = if ($saved) { $saved } else { $template }
  if ($ApiUrl) { $settings | Add-Member -NotePropertyName apiUrl -NotePropertyValue $ApiUrl -Force }
  $hasCode = [bool]($saved -and $saved.token -and $saved.token -notmatch '^rams_\.\.\.')
  $site = ($settings.apiUrl -replace '/api(/agent)?/?$', '').TrimEnd('/')
  $installed = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)

  # ---- the window ----
  $font = New-Object System.Drawing.Font('Segoe UI', 10)
  $bold = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'RAMS Connector setup'
  $form.Font = $font
  $form.ClientSize = New-Object System.Drawing.Size(620, 650)
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.StartPosition = 'CenterScreen'
  $form.BackColor = [System.Drawing.Color]::White

  function Add-Label($text, $x, $y, $w, $h, $f = $font, $color = [System.Drawing.Color]::Black) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text
    $l.Location = New-Object System.Drawing.Point($x, $y)
    $l.Size = New-Object System.Drawing.Size($w, $h)
    $l.Font = $f
    $l.ForeColor = $color
    $form.Controls.Add($l)
    $l
  }
  $grey = [System.Drawing.Color]::FromArgb(90, 90, 90)
  $green = [System.Drawing.Color]::FromArgb(27, 67, 50)   # RAMS's accent

  Add-Label 'Connect TallyPrime on this PC to RAMS' 20 16 580 26 (New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)) $green | Out-Null
  Add-Label "RAMS only reads Tally. It never changes anything in it.`nRAMS: $site" 20 46 580 40 $font $grey | Out-Null

  Add-Label 'Connector code' 20 98 580 22 $bold | Out-Null
  $codeBox = New-Object System.Windows.Forms.TextBox
  $codeBox.Location = New-Object System.Drawing.Point(20, 122)
  $codeBox.Size = New-Object System.Drawing.Size(580, 26)
  $codeBox.UseSystemPasswordChar = $true
  $form.Controls.Add($codeBox)
  $codeHint = if ($hasCode) { 'A code is already saved on this PC. Leave this empty to keep it.' } else { 'An Admin of RAMS gives you this code. Paste it here.' }
  Add-Label $codeHint 20 152 580 22 $font $grey | Out-Null

  $loadBox = New-Object System.Windows.Forms.CheckBox
  $loadBox.Text = 'Load all of Tally into RAMS now (the first time; takes a few minutes)'
  $loadBox.Location = New-Object System.Drawing.Point(20, 180)
  $loadBox.Size = New-Object System.Drawing.Size(580, 26)
  $loadBox.Checked = -not $installed
  $form.Controls.Add($loadBox)

  $connect = New-Object System.Windows.Forms.Button
  $connect.Text = 'Connect'
  $connect.Location = New-Object System.Drawing.Point(480, 214)
  $connect.Size = New-Object System.Drawing.Size(120, 34)
  $connect.BackColor = $green
  $connect.ForeColor = [System.Drawing.Color]::White
  $connect.FlatStyle = 'Flat'
  $form.Controls.Add($connect)
  $form.AcceptButton = $connect

  # The steps: an icon and a sentence each.
  $STEPS = [ordered]@{
    tally     = 'Tally answers on this PC'
    companies = 'Companies open in Tally'
    rams      = 'RAMS accepts the code'
    install   = 'Installed: starts when you sign in to Windows'
    load      = 'Tally loaded into RAMS'
    running   = 'The Connector is running'
  }
  $ICON = @{ todo = [string][char]0x25CB; wait = [string][char]0x2026; ok = [string][char]0x2713; fail = [string][char]0x2717; warn = '!'; skip = [string][char]0x2013 }
  $COLOR = @{
    todo = [System.Drawing.Color]::FromArgb(160, 160, 160); wait = [System.Drawing.Color]::FromArgb(37, 99, 235)
    ok = [System.Drawing.Color]::FromArgb(22, 128, 61); fail = [System.Drawing.Color]::FromArgb(200, 30, 30)
    warn = [System.Drawing.Color]::FromArgb(180, 110, 0); skip = [System.Drawing.Color]::FromArgb(160, 160, 160)
  }
  $rows = @{}
  $y = 262
  # (Names differ from $ICON and $COLOR: PowerShell variables ignore case.)
  foreach ($key in $STEPS.Keys) {
    $mark = Add-Label '' 20 $y 30 30 (New-Object System.Drawing.Font('Segoe UI Symbol', 12, [System.Drawing.FontStyle]::Bold))
    $words = Add-Label '' 50 ($y + 3) 550 52
    $rows[$key] = @{ icon = $mark; text = $words; state = 'todo'; line = $STEPS[$key] }
    $y += 54
  }
  $status = Add-Label '' 20 590 370 50 $font $grey
  $openRams = New-Object System.Windows.Forms.Button
  $openRams.Text = 'Open RAMS'
  $openRams.Location = New-Object System.Drawing.Point(400, 600)
  $openRams.Size = New-Object System.Drawing.Size(100, 32)
  $openRams.Enabled = $false
  $form.Controls.Add($openRams)
  $close = New-Object System.Windows.Forms.Button
  $close.Text = 'Close'
  $close.Location = New-Object System.Drawing.Point(510, 600)
  $close.Size = New-Object System.Drawing.Size(90, 32)
  $form.Controls.Add($close)
  $form.CancelButton = $close

  function Set-Step($key, $state, $line = $null) {
    $row = $rows[$key]
    $row.state = $state
    if ($line) { $row.line = $line }
    $row.icon.Text = $ICON[$state]
    $row.icon.ForeColor = $COLOR[$state]
    $row.text.Text = $row.line
    $row.text.ForeColor = if ($state -eq 'todo' -or $state -eq 'skip') { $COLOR.todo } else { [System.Drawing.Color]::Black }
    # Event handlers have no pipeline to write to, so -Auto prints to the console.
    if ($Auto -and $state -ne 'wait' -and $state -ne 'todo') { [Console]::Out.WriteLine(("{0,-5} {1}: {2}" -f $state.ToUpper(), $key, $row.line)) }
    [System.Windows.Forms.Application]::DoEvents()
  }
  function Reset-Steps { foreach ($key in $STEPS.Keys) { Set-Step $key 'todo' $STEPS[$key] } }
  function Say($text) { $status.Text = $text; [System.Windows.Forms.Application]::DoEvents() }
  function Done($ok) {
    $connect.Enabled = $true
    $connect.Text = if ($ok) { 'Check again' } else { 'Try again' }
    $codeBox.Enabled = $true
    $loadBox.Enabled = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    if (-not $ok) { $script:exitCode = 1 }
    if ($Auto) { Finish }
  }
  function Finish {
    if ($Screenshot) {
      $bmp = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
      $form.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
      $bmp.Save($Screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
    }
    $form.Close()
  }
  function Write-Settings($path, $token) {
    $copy = $settings | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $copy | Add-Member -NotePropertyName token -NotePropertyValue $token -Force
    New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
    [System.IO.File]::WriteAllText($path, ($copy | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
  }

  # ---- the steps ----
  $script:load = $null
  function Start-Setup {
    $connect.Enabled = $false
    $codeBox.Enabled = $false
    $loadBox.Enabled = $false
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    Reset-Steps
    $openRams.Enabled = $false
    $token = $codeBox.Text.Trim().Trim('"').Trim()
    if (-not $token -and $hasCode) { $token = $saved.token }

    if (-not $node) {
      Set-Step 'tally' 'fail' 'Node.js is missing. Copy the whole RAMS Connector folder again, including its runtime folder.'
      Done $false; return
    }
    Set-Step 'tally' 'wait' 'Checking Tally and RAMS...'
    Say 'Checking...'

    # Check with a copy of the settings, so a wrong code never replaces a good one.
    $trial = Join-Path $env:TEMP ("rams-setup-" + [guid]::NewGuid().ToString('N') + '.json')
    # Only stdout: in Windows PowerShell a line on stderr would stop this script.
    $ErrorActionPreference = 'Continue'
    try {
      Write-Settings $trial $token
      $line = & $node (Join-Path $here 'src\cli.js') check --config $trial 2>$null | Select-Object -Last 1
    } finally {
      Remove-Item $trial -Force -ErrorAction SilentlyContinue
    }
    try { $r = "$line" | ConvertFrom-Json } catch {
      Set-Step 'tally' 'fail' "The Connector could not run its check: $line"
      Done $false; return
    }

    $ok = $true
    if ($r.tally.ok) {
      if ($r.tally.educational) {
        Set-Step 'tally' 'warn' "Tally answers on this PC ($($r.tally.where)), but it is in Educational mode. Use the licensed TallyPrime."
      } else {
        Set-Step 'tally' 'ok' "Tally answers on this PC ($($r.tally.where))"
      }
      if (@($r.tally.companies).Count) {
        Set-Step 'companies' 'ok' ("Companies open in Tally: " + (@($r.tally.companies) -join ', '))
      } else {
        Set-Step 'companies' 'fail' 'No company is open in Tally. Open your companies (MH, HR and WB) in TallyPrime, then click Try again.'
        $ok = $false
      }
    } else {
      $arrow = [string][char]0x2192
      Set-Step 'tally' 'fail' "Tally doesn't answer on this PC ($($r.tally.where)). In TallyPrime press F1 $arrow Settings $arrow Connectivity $arrow Client/Server configuration: set 'TallyPrime acts as' to Both and Port to 9000. Then click Try again."
      Set-Step 'companies' 'skip' 'Companies open in Tally: checked once Tally answers'
      $ok = $false
    }

    if ($r.rams.ok) {
      $on = @($r.rams.syncOn)
      $what = if ($on.Count) { "sync is on for $($on -join ', ')" } else { 'no company is switched on yet: an Admin does it in RAMS at Admin, Tally companies' }
      Set-Step 'rams' 'ok' "RAMS accepts the code; $what"
    } elseif (-not $token) {
      Set-Step 'rams' 'fail' 'Paste the Connector code first. An Admin of RAMS gives it to you.'
      $ok = $false
    } elseif ($r.rams.code -eq 'TOKEN_REJECTED') {
      Set-Step 'rams' 'fail' 'RAMS refused this code. Check that you pasted all of it, or ask an Admin of RAMS for a new one.'
      $ok = $false
    } elseif ($r.rams.code -eq 'UNREACHABLE') {
      Set-Step 'rams' 'fail' "This PC can't reach RAMS ($site). Check the internet connection, then click Try again."
      $ok = $false
    } else {
      Set-Step 'rams' 'fail' "RAMS answered: $($r.rams.message)"
      $ok = $false
    }
    if (-not $ok) { Say 'Fix what is marked, then click Try again.'; Done $false; return }

    Set-Step 'install' 'wait' 'Installing...'
    try {
      Write-Settings $SettingsFile $token
      $out = & (Join-Path $here 'install-service.ps1') -InstallDir $InstallDir -SettingsFile $SettingsFile -TaskName $TaskName -NoStart *>&1 | Out-String
      if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw $out.Trim() }
      Set-Step 'install' 'ok' "Installed in $InstallDir; starts when you sign in to Windows"
    } catch {
      Set-Step 'install' 'fail' "Could not install: $($_.Exception.Message)"
      Done $false; return
    }

    $installedNode = Join-Path $InstallDir 'runtime\node.exe'
    if (-not (Test-Path $installedNode)) { $installedNode = $node }
    if (-not $loadBox.Checked) {
      Set-Step 'load' 'skip' 'Tally loaded into RAMS: not asked this time (the Connector keeps RAMS up to date by itself)'
      Start-Connector; return
    }
    if (-not @($r.rams.syncOn).Count) {
      Set-Step 'load' 'skip' 'Nothing to load yet: once an Admin switches companies on in RAMS, the Connector loads them after office hours'
      Start-Connector; return
    }
    Set-Step 'load' 'wait' 'Loading Tally into RAMS... (a few minutes; Tally stays usable)'
    $logs = Join-Path (Split-Path -Parent $SettingsFile) 'logs'
    New-Item -ItemType Directory -Force $logs | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:loadOut = Join-Path $logs "setup-load-$stamp.log"
    $script:loadErr = Join-Path $logs "setup-load-$stamp.err.log"
    $script:load = Start-Process -FilePath $installedNode -ArgumentList @("`"$InstallDir\src\cli.js`"", 'sync', '--kind', 'resync', '--config', "`"$SettingsFile`"") `
      -WorkingDirectory $InstallDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:loadOut -RedirectStandardError $script:loadErr
    $null = $script:load.Handle   # so ExitCode is there once it ends
    $timer.Start()
  }

  # While the load runs: show its latest line; when it ends, start the Connector.
  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 800
  $timer.Add_Tick({
    $last = Get-Content $script:loadOut -Tail 40 -Encoding UTF8 -ErrorAction SilentlyContinue |
      Where-Object { $_ -match '(started|done|finished|failed|stored)' } | Select-Object -Last 1
    if ($last) { Say ('Loading: ' + ($last -replace '^\S+\s+\w+\s+', '')) }
    if (-not $script:load.HasExited) { return }
    $timer.Stop()
    if ($script:load.ExitCode -eq 0) {
      Set-Step 'load' 'ok' 'Tally loaded into RAMS'
    } else {
      $why = (Get-Content $script:loadErr -Tail 5 -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_.Trim() }) -join ' '
      Set-Step 'load' 'warn' "Tally was not fully loaded ($($why.Trim().TrimStart([char]0x2716).Trim())). The Connector tries again by itself. Log: $script:loadOut"
    }
    Start-Connector
  })

  function Start-Connector {
    Set-Step 'running' 'wait' 'Starting...'
    try {
      Start-ScheduledTask -TaskName $TaskName
      Start-Sleep -Seconds 3
      $task = Get-ScheduledTask -TaskName $TaskName
      if ($task.State -ne 'Running') { throw "the task is $($task.State)" }
      Set-Step 'running' 'ok' "The Connector is running. RAMS's Dashboard shows 'Connector online' within a minute."
      Say 'Done. You can close this window. Tally must stay open on this PC for RAMS to keep up to date.'
      $openRams.Enabled = $true
      Done $true
    } catch {
      Set-Step 'running' 'fail' "Could not start the Connector: $($_.Exception.Message)"
      Done $false
    }
  }

  $connect.Add_Click({ Start-Setup })
  $openRams.Add_Click({ Start-Process $site })
  $close.Add_Click({ $form.Close() })
  $form.Add_FormClosing({
    param($sender, $e)
    if ($script:load -and -not $script:load.HasExited -and -not $Auto) {
      $answer = [System.Windows.Forms.MessageBox]::Show('Tally is still being loaded into RAMS. Close anyway? The Connector finishes it later by itself.', 'RAMS Connector setup', 'YesNo', 'Question')
      if ($answer -ne 'Yes') { $e.Cancel = $true }
    }
  })
  Reset-Steps
  if ($Auto) {
    $codeBox.Text = $Code
    $loadBox.Checked = [bool]$LoadNow
    $form.Add_Shown({ Start-Setup })
  }
  [void]$form.ShowDialog()
} catch {
  Show-Problem "Setup stopped: $($_.Exception.Message)"
  $script:exitCode = 1
}
exit $script:exitCode
