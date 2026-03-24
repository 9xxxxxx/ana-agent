param(
    [string]$Model = "deepseek-chat",
    [string]$DatabaseUrl = "postgresql+psycopg2://postgres:postgres@localhost:5432/demo"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$tmp = Join-Path $root "scripts\check_agent_runtime.py"
if (-not (Test-Path $tmp)) {
    throw "Missing helper file: $tmp"
}

uv run python $tmp $Model $DatabaseUrl
