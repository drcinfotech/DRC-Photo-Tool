# Deploy React Photo Tools to IIS
# Usage: Right-click → Run with PowerShell (as Administrator)
#
# Edit $DEST below to match your IIS physical path before first run.

$ErrorActionPreference = "Stop"

# === CONFIG — edit these to match your setup ===
$SOURCE   = "E:\Project\photo\react-photo-tools\dist"
$DEST     = "C:\inetpub\wwwroot\photo-tools"
$APP_POOL = "photo-tools-pool"   # or "DefaultAppPool"
# ================================================

# 1. Verify build exists
if (-not (Test-Path $SOURCE)) {
    Write-Host "ERROR: Build folder not found at $SOURCE" -ForegroundColor Red
    Write-Host "Run 'npm run build' first." -ForegroundColor Yellow
    exit 1
}

# 2. Ensure destination exists
if (-not (Test-Path $DEST)) {
    New-Item -ItemType Directory -Path $DEST -Force | Out-Null
    Write-Host "Created $DEST"
}

# 3. Clean old files
Write-Host "Cleaning $DEST..."
Remove-Item -Path "$DEST\*" -Recurse -Force -ErrorAction SilentlyContinue

# 4. Copy fresh build
Write-Host "Copying from $SOURCE..."
Copy-Item -Path "$SOURCE\*" -Destination $DEST -Recurse -Force

# 5. Set permissions
Write-Host "Setting IIS permissions..."
icacls $DEST /grant "IIS_IUSRS:(OI)(CI)RX" /T | Out-Null

# 6. Recycle app pool (ignore errors if pool doesn't exist)
try {
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    if (Get-ChildItem IIS:\AppPools | Where-Object { $_.Name -eq $APP_POOL }) {
        Restart-WebAppPool -Name $APP_POOL
        Write-Host "Recycled app pool: $APP_POOL"
    } else {
        Write-Host "App pool '$APP_POOL' not found — skipping recycle." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not recycle app pool: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Deployed successfully to $DEST" -ForegroundColor Green
Write-Host "Open browser and test your site." -ForegroundColor Green
