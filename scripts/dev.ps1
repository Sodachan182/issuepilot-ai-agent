<#
  Start the IssuePilot backend (FastAPI on 127.0.0.1:8000) and frontend (Vite on :5173)
  in two new PowerShell windows.

  Usage:
    .\scripts\dev.ps1          # start both
    .\scripts\dev.ps1 -Reset   # delete the local SQLite database first
#>
param([switch]$Reset)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if ($Reset) {
  $db = Join-Path $root "data\issuepilot.db"
  if (Test-Path $db) { Remove-Item $db -Confirm:$false; Write-Host "Deleted $db" }
}

if (-not (Test-Path $python)) {
  Write-Host "Creating backend virtual environment..."
  & py -3.12 -m venv (Join-Path $backend ".venv")
  & $python -m pip install --upgrade pip
  & $python -m pip install -e "$backend[dev]"
}
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
  Write-Host "Installing frontend dependencies..."
  Push-Location $frontend; npm install; Pop-Location
}
if (-not (Test-Path (Join-Path $root ".env"))) {
  Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
  Write-Host "Created .env from .env.example (heuristic mode, read-only)."
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; & '$python' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontend'; npm run dev"
Write-Host "Backend:  http://127.0.0.1:8000/docs"
Write-Host "Frontend: http://localhost:5173"
