param(
    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $pids = netstat -ano |
        Select-String ":$Port" |
        ForEach-Object { ($_ -split "\s+")[-1] } |
        Where-Object { $_ -match "^\d+$" } |
        Sort-Object -Unique

    foreach ($procId in $pids) {
        try {
            Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
            Write-Host "Stopped process on port $Port: $procId"
        } catch {
            Write-Host "Skip stopping process $procId on port $Port: $($_.Exception.Message)"
        }
    }
}

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".files\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$backendLog = Join-Path $logDir "backend.log"
$frontendLog = Join-Path $logDir "frontend.log"
if (Test-Path $backendLog) { Remove-Item $backendLog -Force }
if (Test-Path $frontendLog) { Remove-Item $frontendLog -Force }

Stop-PortProcess -Port 8000
if (-not $NoFrontend) {
    Stop-PortProcess -Port 3000
}

Write-Host "Starting backend on http://localhost:8000 ..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "uv run python -m uvicorn app:app --host 0.0.0.0 --port 8000 > `"$backendLog`" 2>&1" `
    -WorkingDirectory $root

if (-not $NoFrontend) {
    Write-Host "Starting frontend on http://localhost:3000 ..."
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm run dev > `"$frontendLog`" 2>&1" `
        -WorkingDirectory (Join-Path $root "frontend")
}

Write-Host ""
Write-Host "Logs:"
Write-Host "  Backend : $backendLog"
if (-not $NoFrontend) {
    Write-Host "  Frontend: $frontendLog"
}
Write-Host ""
Write-Host "Tip:"
Write-Host "  Backend health: http://localhost:8000/api/health"
if (-not $NoFrontend) {
    Write-Host "  Frontend page : http://localhost:3000"
}
