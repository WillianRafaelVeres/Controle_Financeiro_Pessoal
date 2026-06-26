param(
  [Parameter(Mandatory = $true)]
  [string]$DatabasePassword,

  [switch]$Desktop
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$databaseUrl = "postgresql://postgres.qmglaobhnbgxgcfucxtj:$DatabasePassword@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

if ($Desktop) {
  $targetDir = Join-Path $env:APPDATA "CentralFinanceira"
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $target = Join-Path $targetDir ".env"
} else {
  $target = Join-Path $root "backend\.env"
}

Set-Content -Path $target -Encoding UTF8 -Value "DATABASE_URL=$databaseUrl"
Write-Output "Supabase DATABASE_URL gravado em $target"
