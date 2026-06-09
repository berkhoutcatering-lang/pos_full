# Start de Docker test stack + lokale Supabase. Wait op healthchecks.
$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot\..

Write-Host "[1/4] Starting local Supabase..." -ForegroundColor Cyan
$supabaseStatus = supabase status 2>$null
if ($LASTEXITCODE -ne 0) {
    supabase start
}

Write-Host "[2/4] Applying migrations..." -ForegroundColor Cyan
supabase db reset --no-seed
Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object {
    Write-Host "  - $($_.Name)" -ForegroundColor DarkGray
}

Write-Host "[3/4] Building + starting Docker test stack..." -ForegroundColor Cyan
docker compose -f docker-compose.test.yml up -d --build pi-bridge mock-mypos mock-mollie mock-printer

Write-Host "[4/4] Waiting for healthchecks (max 90s)..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
    $health = docker compose -f docker-compose.test.yml ps --format json | ConvertFrom-Json
    $unhealthy = $health | Where-Object { $_.Health -ne "healthy" -and $_.Service -ne "mock-printer" -and $_.Service -ne "playwright" }
    if (-not $unhealthy) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Host "Healthcheck timeout. Service state:" -ForegroundColor Red
    docker compose -f docker-compose.test.yml ps
    exit 1
}

Write-Host "Stack up." -ForegroundColor Green
& "$PSScriptRoot\health-check.ps1"
Pop-Location
