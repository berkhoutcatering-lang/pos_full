$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot\..
Write-Host "Resetting test state (volumes + DB)..." -ForegroundColor Cyan
docker compose -f docker-compose.test.yml down -v
supabase db reset --no-seed
docker compose -f docker-compose.test.yml up -d --build pi-bridge mock-mypos mock-mollie mock-printer
Write-Host "Reset complete." -ForegroundColor Green
& "$PSScriptRoot\health-check.ps1"
Pop-Location
