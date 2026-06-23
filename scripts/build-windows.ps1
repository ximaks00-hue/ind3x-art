# Build Windows installers for inD3X Art
# Requires: Rust, Node.js, WebView2 (installed by NSIS bootstrapper if missing)
#
# Usage:
#   .\scripts\build-windows.ps1                    # all bundles
#   .\scripts\build-windows.ps1 -Bundles nsis      # NSIS only
#   .\scripts\build-windows.ps1 -Bundles msi       # MSI only
#   .\scripts\build-windows.ps1 -Bundles nsis,msi  # both

param(
    [string[]]$Bundles = @()
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

$buildArgs = @("run", "tauri", "build")
if ($Bundles.Count -gt 0) {
    $bundleList = ($Bundles -join ",")
    $buildArgs += @("--", "--bundles", $bundleList)
    Write-Host "Building bundles: $bundleList" -ForegroundColor Cyan
} else {
    Write-Host "Building all release bundles..." -ForegroundColor Cyan
    $buildArgs = @("run", "build:release")
}

npm @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "Tauri build failed with exit code $LASTEXITCODE"
}

$bundleRoot = Join-Path $ProjectRoot "src-tauri\target\release\bundle"
if (Test-Path $bundleRoot) {
    Write-Host "`nInstallers:" -ForegroundColor Green
    Get-ChildItem $bundleRoot -Recurse -Include *.exe,*.msi | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  $($_.FullName)  ($sizeMb MB)"
    }
} else {
    Write-Host "Bundle folder not found at $bundleRoot" -ForegroundColor Yellow
}
