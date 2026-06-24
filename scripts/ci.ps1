# Local CI — core subset of .github/workflows/ci.yml
# NOTE: does not run: ESLint, Prettier, coverage, bundle-size, bindings drift, E2E.
# For full gate parity use: npm run ci

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

function Invoke-NpmStep {
  param(
    [string]$Name,
    [string[]]$NpmArgs
  )
  Write-Host "$Name..." -ForegroundColor Cyan
  # npm.cmd ensures a reliable exit code on Windows PowerShell 5.x
  & npm.cmd @NpmArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "$Name FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Invoke-NpmStep "Typecheck" @("run", "typecheck")
Invoke-NpmStep "Unit tests" @("run", "test:unit")
Invoke-NpmStep "Rust tests" @("run", "test")
Invoke-NpmStep "Frontend build" @("run", "build")

Write-Host "`nCI passed." -ForegroundColor Green
