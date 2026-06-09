$ErrorActionPreference = "Continue"
$failed = $false

function Test-Service {
    param([string]$Name, [string]$Url, [string]$Method = "GET", [string]$ExtraHeader = $null)
    try {
        $hdr = @{}
        if ($ExtraHeader) {
            $parts = $ExtraHeader -split ":", 2
            $hdr[$parts[0].Trim()] = $parts[1].Trim()
        }
        $resp = Invoke-WebRequest -Uri $Url -Method $Method -TimeoutSec 5 -UseBasicParsing -Headers $hdr -SkipHttpErrorCheck
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
            Write-Host ("  [{0}] {1} {2} -> OK ({3})" -f "OK", $Method, $Url, $resp.StatusCode) -ForegroundColor Green
            return $true
        }
    } catch {
        # fall through
    }
    Write-Host ("  [{0}] {1} {2} -> FAIL" -f "FAIL", $Method, $Url) -ForegroundColor Red
    $script:failed = $true
    return $false
}

Write-Host "Health check:" -ForegroundColor Cyan
Test-Service "pi-bridge-public" "http://localhost:3001/_health" | Out-Null
Test-Service "mock-mypos" "http://localhost:8081/mockserver/status" "PUT" | Out-Null
Test-Service "mock-mollie" "http://localhost:8082/mockserver/status" "PUT" | Out-Null

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.ConnectAsync("localhost", 9100).Wait(2000) | Out-Null
    if ($tcp.Connected) {
        Write-Host "  [OK] mock-printer tcp://localhost:9100 -> OK" -ForegroundColor Green
        $tcp.Close()
    } else {
        Write-Host "  [FAIL] mock-printer tcp://localhost:9100 -> FAIL" -ForegroundColor Red
        $failed = $true
    }
} catch {
    Write-Host "  [FAIL] mock-printer tcp://localhost:9100 -> $($_.Exception.Message)" -ForegroundColor Red
    $failed = $true
}

$supabase = supabase status 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] supabase (local) -> OK" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] supabase (local) not running" -ForegroundColor Red
    $failed = $true
}

if ($failed) {
    Write-Host "One or more services unhealthy." -ForegroundColor Red
    exit 1
}
Write-Host "All services healthy." -ForegroundColor Green
