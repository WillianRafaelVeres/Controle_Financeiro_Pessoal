$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$backend = Start-Process -FilePath (Join-Path $root ".venv\Scripts\python.exe") `
  -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "17831") `
  -WorkingDirectory (Join-Path $root "backend") `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 2
try {
  Push-Location (Join-Path $root "frontend")
  npm run dev
}
finally {
  Pop-Location
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
