param(
  [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "package.json")) {
  throw "package.json not found in $PSScriptRoot"
}

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile. Copy .env.example to .env and edit values."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[bridge] Installing dependencies..."
  npm install
}

Write-Host "[bridge] Starting FS25 Firebase bridge..."
node bridge.js
