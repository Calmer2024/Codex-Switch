$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\codex-switch'
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'Codex Switch.exe' -and
  $_.ExecutablePath -like "$installRoot\*"
})

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

if ($processes.Count -gt 0) {
  Start-Sleep -Milliseconds 500
}

Write-Output "Stopped $($processes.Count) installed Codex Switch process(es)"
