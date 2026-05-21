$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $root "scripts\build-backend.ps1")
& (Join-Path $root "scripts\build-desktop.ps1")

