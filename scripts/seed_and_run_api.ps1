# Requires PostgreSQL reachable at DATABASE_URL (see .env.example).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\backend"

if (-not (Test-Path "$root\.env")) {
  Copy-Item "$root\.env.example" "$root\.env"
  Write-Host "Created .env from .env.example — set UPSTREAM_* and DATABASE_URL before production use."
}

python -m pip install -r requirements.txt
$env:PYTHONPATH = (Get-Location).Path
# Load simple KEY=VAL from ../.env into process env
Get-Content "$root\.env" | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_.Split('=', 2)
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}

Write-Host "Starting API on http://127.0.0.1:8000 ..."
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
