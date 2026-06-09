$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot\..
Write-Host "Stopping Docker test stack..." -ForegroundColor Cyan
docker compose -f docker-compose.test.yml down -v
Write-Host "Stopping local Supabase..." -ForegroundColor Cyan
supabase stop
Write-Host "Stack down." -ForegroundColor Green
Pop-Location
