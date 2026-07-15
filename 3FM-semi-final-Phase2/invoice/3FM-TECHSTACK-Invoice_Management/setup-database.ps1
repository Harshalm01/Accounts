# PostgreSQL Setup Helper for 3FM Project
# This script helps set up PostgreSQL and configure the database for the 3FM project

$PostgresPath = "C:\Program Files\PostgreSQL\18\bin"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "3FM DATABASE SETUP HELPER" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Check if PostgreSQL is installed
if (-not (Test-Path $PostgresPath)) {
    Write-Host "`nERROR: PostgreSQL not found at $PostgresPath" -ForegroundColor Red
    Write-Host "Please install PostgreSQL 18 from: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✓ PostgreSQL installed at: $PostgresPath" -ForegroundColor Green

# Set PostgreSQL bin path
$env:Path += ";$PostgresPath"

Write-Host "`nStep 1: Testing PostgreSQL Connection..." -ForegroundColor Yellow
Write-Host "Enter the password for 'postgres' user (default during installation)" -ForegroundColor Gray

# Try to connect without password first
try {
    $output = & "$PostgresPath\psql.exe" -U postgres -h localhost -w -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Connected to PostgreSQL successfully!" -ForegroundColor Green
        Write-Host "  No password required (or using .pgpass file)" -ForegroundColor Green
    } else {
        Write-Host "✗ Connection failed with existing password" -ForegroundColor Red
        Write-Host "`nYou need to provide the correct PostgreSQL password." -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Error connecting to PostgreSQL" -ForegroundColor Red
}

Write-Host "`nStep 2: Creating Database..." -ForegroundColor Yellow

# Create database using psql
$createDBScript = @"
CREATE DATABASE `"3fm_db`";
"@

Write-Host "`nExecuting: CREATE DATABASE 3fm_db" -ForegroundColor Cyan

try {
    $output = $createDBScript | &"$PostgresPath\psql.exe" -U postgres -h localhost -w 2>&1
    
    if ($LASTEXITCODE -eq 0 -or $output -match "already exists") {
        Write-Host "✓ Database created or already exists" -ForegroundColor Green
    } else {
        Write-Host "✗ Error creating database" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error connecting to database" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
}

Write-Host "`nStep 3: Verify Database Setup..." -ForegroundColor Yellow
Write-Host "Run the following commands to verify:" -ForegroundColor Cyan
Write-Host "`n  cd backend" -ForegroundColor Cyan
Write-Host "  npm run prisma:migrate" -ForegroundColor Cyan

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "SETUP COMPLETE!" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Update backend/.env with the correct PostgreSQL password" -ForegroundColor White
Write-Host "2. Run: npm run prisma:migrate" -ForegroundColor White
Write-Host "3. Run: npm run dev" -ForegroundColor White
