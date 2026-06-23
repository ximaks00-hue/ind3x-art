# Local CI — mirrors .github/workflows/ci.yml

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

Write-Host "Typecheck..." -ForegroundColor Cyan
npm run typecheck

Write-Host "Rust tests..." -ForegroundColor Cyan
npm run test

Write-Host "Frontend build..." -ForegroundColor Cyan
npm run build

Write-Host "`nCI passed." -ForegroundColor Green
