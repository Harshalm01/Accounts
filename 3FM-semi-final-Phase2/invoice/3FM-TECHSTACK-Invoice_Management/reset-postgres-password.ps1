#!/usr/bin/env powershell
# PostgreSQL Password Reset Helper for Windows
# This script helps reset the PostgreSQL password if you don't remember it

$PostgresPath = "C:\Program Files\PostgreSQL\18"
$DataPath = "$PostgresPath\data"

Write-Host "PostgreSQL Password Reset Helper" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")

if (-not $isAdmin) {
    Write-Host "ERROR: This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Stop PostgreSQL Service" -ForegroundColor Yellow

try {
    Stop-Service -Name postgresql-x64-18 -Force -ErrorAction Stop
    Write-Host "✓ PostgreSQL service stopped" -ForegroundColor Green
    Start-Sleep -Seconds 2
} catch {
    Write-Host "ERROR: Could not stop PostgreSQL service" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Create pg_hba.conf backup" -ForegroundColor Yellow

$pgHbaPath = "$DataPath\pg_hba.conf"
$pgHbaBackup = "$DataPath\pg_hba.conf.backup"

if (-not (Test-Path $pgHbaPath)) {
    Write-Host "ERROR: pg_hba.conf not found at $pgHbaPath" -ForegroundColor Red
    Start-Service postgresql-x64-18
    exit 1
}

Copy-Item -Path $pgHbaPath -Destination $pgHbaBackup -Force
Write-Host "✓ Backup created: $pgHbaBackup" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Modify pg_hba.conf for trust authentication" -ForegroundColor Yellow

# Read the file
$content = Get-Content $pgHbaPath

# Modify local connections to use trust
$content = $content -replace "host.*all.*all.*127\.0\.0\.1.*", "host    all             all             127.0.0.1/32            trust"
$content = $content -replace "local.*all.*all", "local   all             all                                     trust"

# Write back
Set-Content -Path $pgHbaPath -Value $content
Write-Host "✓ pg_hba.conf updated" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Start PostgreSQL Service" -ForegroundColor Yellow

try {
    Start-Service -Name postgresql-x64-18 -ErrorAction Stop
    Write-Host "✓ PostgreSQL service started" -ForegroundColor Green
    Start-Sleep -Seconds 3
} catch {
    Write-Host "ERROR: Could not start PostgreSQL service" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 5: Reset postgres password" -ForegroundColor Yellow

$env:Path += ";$PostgresPath\bin"

# Create SQL script to reset password
$sqlScript = @"
ALTER USER postgres WITH PASSWORD 'postgres';
"@

$sqlScript | &"$PostgresPath\bin\psql.exe" -U postgres -h localhost 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Password reset to: postgres" -ForegroundColor Green
} else {
    Write-Host "ERROR: Could not reset password" -ForegroundColor Red
}

Write-Host ""
Write-Host "Step 6: Restore pg_hba.conf to require password" -ForegroundColor Yellow

# Read the file again
$content = Get-Content $pgHbaPath

# Change back to md5/scram auth
$content = $content -replace "host.*all.*all.*127\.0\.0\.1.*trust", "host    all             all             127.0.0.1/32            scram-sha-256"
$content = $content -replace "local.*all.*all.*trust", "local   all             all                                     scram-sha-256"

# Write back
Set-Content -Path $pgHbaPath -Value $content
Write-Host "✓ pg_hba.conf restored" -ForegroundColor Green

Write-Host ""
Write-Host "Step 7: Restart PostgreSQL" -ForegroundColor Yellow

try {
    Restart-Service postgresql-x64-18 -ErrorAction Stop
    Write-Host "✓ PostgreSQL restarted" -ForegroundColor Green
    Start-Sleep -Seconds 2
} catch {
    Write-Host "ERROR: Could not restart PostgreSQL" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Password Reset Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Your PostgreSQL password is now: postgres" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Update backend/.env with:" -ForegroundColor White
Write-Host '   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/3fm_db?schema=public"' -ForegroundColor Gray
Write-Host ""
Write-Host "2. Run database migration:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   npm run prisma:migrate" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Restart the servers and try logging in again" -ForegroundColor White
