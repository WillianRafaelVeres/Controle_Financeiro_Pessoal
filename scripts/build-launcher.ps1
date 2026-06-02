$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

& (Join-Path $root "scripts\build-backend.ps1")

Push-Location (Join-Path $root "frontend")
try {
  npm run build
}
finally {
  Pop-Location
}

$pyinstaller = Join-Path $root ".venv\Scripts\pyinstaller.exe"
& $pyinstaller `
  --noconfirm `
  --clean `
  --windowed `
  --name "Central Financeira" `
  --distpath (Join-Path $root "dist") `
  --workpath (Join-Path $root "build") `
  --specpath $root `
  --icon (Join-Path $root "frontend\src-tauri\icons\icon.ico") `
  --add-data "$(Join-Path $root "frontend\dist");web" `
  --add-binary "$(Join-Path $root "backend\dist\central-financeira-backend.exe");backend" `
  (Join-Path $root "desktop\central_financeira_launcher.py")

Write-Host "App desktop gerado em: $(Join-Path $root "dist\Central Financeira\Central Financeira.exe")"
