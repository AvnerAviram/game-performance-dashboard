# Deploy Game Analytics Dashboard

**Server:** EC2AMAZ-S37G6IA | **URL:** `https://gamedashboard.playags-games.com`

---

## Dev Machine

- [ ] `cd game_analytics_export && npm install && npm run build`

## Server - Install

- [ ] Install IIS: `Install-WindowsFeature -Name Web-Server, Web-Default-Doc, Web-Http-Errors, Web-Static-Content, Web-Http-Logging, Web-Stat-Compression, Web-Filtering, Web-Mgmt-Console -IncludeManagementTools`
- [ ] Install Node.js 20 LTS (x64 .msi from https://nodejs.org)
- [ ] Install HttpPlatformHandler v1.2 (x64 from https://www.iis.net/downloads/microsoft/httpplatformhandler)

## Server - Deploy App

- [ ] Create folders:
```
mkdir C:\inetpub\game-dashboard
mkdir C:\inetpub\game-dashboard\logs
mkdir C:\inetpub\game-dashboard\data
mkdir "C:\inetpub\game-dashboard\src\config"
```
- [ ] Copy from dev machine (`game_analytics_export/`):
  - `dist\` --> `C:\inetpub\game-dashboard\dist\`
  - `server\` --> `C:\inetpub\game-dashboard\server\`
  - `data\games_dashboard.json` --> `C:\inetpub\game-dashboard\data\`
  - `data\theme_consolidation_map.json` --> `C:\inetpub\game-dashboard\data\`
  - `src\config\theme-breakdowns.json` --> `C:\inetpub\game-dashboard\src\config\`
  - `web.config` --> `C:\inetpub\game-dashboard\`
  - `package.json` --> `C:\inetpub\game-dashboard\`
- [ ] `cd C:\inetpub\game-dashboard && npm install --omit=dev`

## Server - Configure

- [ ] Generate secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Create `C:\inetpub\game-dashboard\.env`:
```
SESSION_SECRET=<paste secret>
NODE_ENV=production
```
- [ ] Create user: `node server\manage-users.cjs add avner`

## IIS

- [ ] App Pool: name `GameDashboard`, No Managed Code, Integrated
- [ ] Site: name `GameDashboard`, pool `GameDashboard`, path `C:\inetpub\game-dashboard`, https 443, hostname `gamedashboard.playags-games.com`, cert `*.playags-games.com`, SNI checked
- [ ] Permissions:
```
$pool = "IIS AppPool\GameDashboard"
icacls "C:\inetpub\game-dashboard" /grant "${pool}:(OI)(CI)R" /T
icacls "C:\inetpub\game-dashboard\logs" /grant "${pool}:(OI)(CI)M" /T
icacls "C:\inetpub\game-dashboard\server" /grant "${pool}:(OI)(CI)M" /T
icacls "C:\inetpub\game-dashboard\.env" /inheritance:r /grant "BUILTIN\Administrators:(R)" /grant "${pool}:(R)"
```

## Go Live

- [ ] GoDaddy DNS: A record `gamedashboard` --> server public IP
- [ ] AWS Security Group: inbound HTTPS 443
- [ ] Windows Firewall: `New-NetFirewallRule -DisplayName "HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow`
- [ ] Start app pool + site in IIS Manager
- [ ] Test: `https://gamedashboard.playags-games.com/`
