# Game Analytics Dashboard - Deploy to Windows Server (IIS)
# Usage: .\deploy\deploy.ps1 -Server "your-server" -SitePath "C:\inetpub\game-dashboard"
#
# Prerequisites on the server:
#   - IIS with HttpPlatformHandler module installed
#   - Node.js installed and in PATH
#   - IIS site created pointing to $SitePath with SSL binding
#   - First user created: node server\manage-users.cjs add <username>

param(
    [string]$Server = "YOUR_SERVER",
    [string]$SitePath = "C:\inetpub\game-dashboard",
    [string]$AppPool = "GameDashboard"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "==> Building dashboard..." -ForegroundColor Cyan
Push-Location $ScriptDir
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
Pop-Location

# Verify build safety
if (Test-Path "$ScriptDir\dist\data\.env") {
    throw "SECURITY ERROR: dist\data\.env exists! Build script is leaking secrets."
}

$distDataCount = (Get-ChildItem "$ScriptDir\dist\data" -File).Count
if ($distDataCount -gt 3) {
    Write-Warning "dist\data\ has $distDataCount files (expected 2). Extra pipeline files may be leaking."
    Get-ChildItem "$ScriptDir\dist\data" -File | ForEach-Object { Write-Host "  $_" }
    $confirm = Read-Host "Continue anyway? [y/N]"
    if ($confirm -ne 'y') { exit 1 }
}

Write-Host "==> Deploying to $Server`:$SitePath..." -ForegroundColor Cyan

# Stop the app pool to release file locks
Write-Host "  Stopping app pool $AppPool..."
Invoke-Command -ComputerName $Server -ScriptBlock {
    param($pool) Import-Module WebAdministration; Stop-WebAppPool -Name $pool -ErrorAction SilentlyContinue
} -ArgumentList $AppPool

# Copy files (adjust method based on your network setup)
# Option 1: UNC path (if server shares the folder)
$remotePath = "\\$Server\$($SitePath -replace ':', '$')"
Write-Host "  Copying dist/ ..."
robocopy "$ScriptDir\dist" "$remotePath\dist" /MIR /NFL /NDL /NJH /NJS
Write-Host "  Copying server/ ..."
robocopy "$ScriptDir\server" "$remotePath\server" /MIR /XF users.json /NFL /NDL /NJH /NJS
Write-Host "  Copying web.config and package.json ..."
Copy-Item "$ScriptDir\web.config" "$remotePath\web.config" -Force
Copy-Item "$ScriptDir\package.json" "$remotePath\package.json" -Force

# Install production deps on server
Write-Host "  Installing dependencies on server..."
Invoke-Command -ComputerName $Server -ScriptBlock {
    param($path) Set-Location $path; npm install --omit=dev 2>&1 | Out-Null
} -ArgumentList $SitePath

# Start the app pool
Write-Host "  Starting app pool $AppPool..."
Invoke-Command -ComputerName $Server -ScriptBlock {
    param($pool) Import-Module WebAdministration; Start-WebAppPool -Name $pool
} -ArgumentList $AppPool

Write-Host "==> Done! Dashboard deployed to $Server." -ForegroundColor Green
