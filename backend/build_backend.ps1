$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $backendDir
$python = Join-Path $rootDir ".venv\Scripts\python.exe"

Get-Process -Name "central-financeira-backend" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$rootDir*" } |
  ForEach-Object { Stop-Process -Id $_.Id -Force }

if (!(Test-Path $python)) {
  Push-Location $rootDir
  python -m venv .venv
  Pop-Location
}

& $python -m pip install -r (Join-Path $backendDir "requirements.txt")

Push-Location $backendDir
& $python -m PyInstaller --clean --noconfirm central_financeira_backend.spec
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  throw "PyInstaller falhou com codigo $LASTEXITCODE."
}
Pop-Location

$src = Join-Path $backendDir "dist\central-financeira-backend.exe"
if (!(Test-Path $src)) {
  throw "Executavel do backend nao foi gerado: $src"
}
$binariesDir = Join-Path $rootDir "frontend\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binariesDir | Out-Null

$plainTarget = Join-Path $binariesDir "central-financeira-backend.exe"
$tauriTarget = Join-Path $binariesDir "central-financeira-backend-x86_64-pc-windows-msvc.exe"
Copy-Item -LiteralPath $src -Destination $plainTarget -Force
Copy-Item -LiteralPath $src -Destination $tauriTarget -Force

Write-Host "Backend gerado em: $src"
Write-Host "Sidecar copiado para: $tauriTarget"
