<#
.SYNOPSIS
    Game Analytics Dashboard - Server Install/Update Script
.DESCRIPTION
    Run this after extracting a release zip to the deployment folder.
    Handles both first-time install and updates:
      - First install: npm install, .env creation, user setup, IIS permissions
      - Updates: npm install (preserves .env, users, tickets, sessions)

    Right-click > "Run with PowerShell" or run from any terminal.
    Automatically elevates to Administrator if needed.
.EXAMPLE
    cd C:\inetpub\game-dashboard
    .\install.ps1
.EXAMPLE
    .\install.ps1 -AppPool "MyPool" -SkipRestart
#>

param(
    [string]$AppPool = "GameDashboard",
    [switch]$SkipRestart
)

# ── Self-elevate to Administrator if needed ────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    if ($AppPool -ne "GameDashboard") { $argList += " -AppPool `"$AppPool`"" }
    if ($SkipRestart) { $argList += " -SkipRestart" }
    Start-Process PowerShell -Verb RunAs -ArgumentList $argList -Wait
    exit
}

$ErrorActionPreference = "Stop"

try {

$SitePath = $PSScriptRoot

# If install.ps1 is in the root of the deployment, use that; otherwise assume cwd
if (-not $SitePath -or -not (Test-Path (Join-Path $SitePath "package.json"))) {
    $SitePath = Get-Location
}

Set-Location $SitePath
Write-Host "`n  Game Analytics Dashboard - Install/Update" -ForegroundColor Cyan
Write-Host "  Path: $SitePath`n"

# ── Detect first install vs update ──────────────────────────────────────
$isFirstInstall = -not (Test-Path (Join-Path $SitePath "node_modules"))
if ($isFirstInstall) {
    Write-Host "  [First Install Detected]" -ForegroundColor Yellow
} else {
    Write-Host "  [Update Detected]" -ForegroundColor Green
}

# ── 1. Stop app pool ───────────────────────────────────────────────────
if (-not $SkipRestart) {
    try {
        Import-Module WebAdministration -ErrorAction SilentlyContinue
        $pool = Get-WebAppPoolState -Name $AppPool -ErrorAction SilentlyContinue
        if ($pool -and $pool.Value -eq "Started") {
            Write-Host "  Stopping app pool '$AppPool'..."
            Stop-WebAppPool -Name $AppPool
            Start-Sleep -Seconds 2
        }
    } catch {
        Write-Warning "Could not stop app pool '$AppPool': $_"
    }
}

# ── 2. Install production dependencies ─────────────────────────────────
Write-Host "  Installing dependencies (npm install --omit=dev)..."
npm install --omit=dev 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
}
Write-Host "  Dependencies installed." -ForegroundColor Green

# ── 3. Create logs directory ───────────────────────────────────────────
if (-not (Test-Path (Join-Path $SitePath "logs"))) {
    New-Item -ItemType Directory -Path (Join-Path $SitePath "logs") | Out-Null
    Write-Host "  Created logs/ directory."
}

# ── 4. Create .env if missing ─────────────────────────────────────────
$envPath = Join-Path $SitePath ".env"
if (-not (Test-Path $envPath)) {
    $secret = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    @"
SESSION_SECRET=$secret
NODE_ENV=production
"@ | Set-Content -Path $envPath -Encoding UTF8
    Write-Host "  Created .env with auto-generated SESSION_SECRET." -ForegroundColor Yellow
} else {
    Write-Host "  .env exists -- preserved."
}

# ── 5. Create first user if needed ─────────────────────────────────────
$usersPath = Join-Path (Join-Path $SitePath "server") "users.json"
$needsUser = $false
if (-not (Test-Path $usersPath)) {
    $needsUser = $true
} else {
    $usersContent = Get-Content $usersPath -Raw -ErrorAction SilentlyContinue
    if (-not $usersContent -or $usersContent.Trim() -eq "[]" -or $usersContent.Trim() -eq "{}") {
        $needsUser = $true
    }
}

if ($needsUser) {
    Write-Host ""
    Write-Host "  No users found. Create one now to be able to log in." -ForegroundColor Yellow
    $username = Read-Host "  Enter username (or press Enter to skip)"
    if ($username) {
        & node server\manage-users.cjs add $username
    } else {
        Write-Host "  Skipped. Create a user later: node server\manage-users.cjs add <username>"
    }
} else {
    Write-Host "  Users exist -- preserved."
}

# ── 6. Set IIS permissions (first install only) ───────────────────────
if ($isFirstInstall) {
    Write-Host "  Setting IIS permissions for 'IIS AppPool\$AppPool'..."
    $poolIdentity = "IIS AppPool\$AppPool"
    icacls $SitePath /grant "${poolIdentity}:(OI)(CI)R" /T /Q
    icacls (Join-Path $SitePath "logs") /grant "${poolIdentity}:(OI)(CI)M" /T /Q
    icacls (Join-Path $SitePath "server") /grant "${poolIdentity}:(OI)(CI)M" /T /Q
    if (Test-Path $envPath) {
        icacls $envPath /inheritance:r /grant "BUILTIN\Administrators:(R)" /grant "${poolIdentity}:(R)" /Q
    }
    Write-Host "  Permissions set." -ForegroundColor Green
} else {
    Write-Host "  Permissions already set -- skipping."
}

# ── 7. Start app pool ─────────────────────────────────────────────────
if (-not $SkipRestart) {
    try {
        Import-Module WebAdministration -ErrorAction SilentlyContinue
        Write-Host "  Starting app pool '$AppPool'..."
        Start-WebAppPool -Name $AppPool
    } catch {
        Write-Warning "Could not start app pool '$AppPool': $_"
    }
}

# ── 8. Summary ────────────────────────────────────────────────────────
$version = (Get-Content (Join-Path $SitePath "package.json") | ConvertFrom-Json).version
Write-Host ""
Write-Host "  =====================================" -ForegroundColor Green
Write-Host "  Dashboard v$version deployed!" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor Green
Write-Host ""
if ($isFirstInstall) {
    Write-Host "  Next: verify the site at https://gamedashboard.playags-games.com/"
    Write-Host "  IIS site + app pool must be configured separately (see DEPLOY_CHECKLIST.md)"
}
Write-Host ""

} catch {
    Write-Host ""
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "  Press any key to close..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
