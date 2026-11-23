<#
  Fails (exit 1) if tracked files include .env / databases or anything that looks like a secret.
  Run before every push:  .\scripts\check-secrets.ps1
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $files = git ls-files --cached --others --exclude-standard
  $bad = $files | Where-Object { $_ -match '(^|/)\.env$' -or $_ -match '\.db$' }
  if ($bad) { Write-Host "Forbidden files would be committed:`n$($bad -join "`n")"; exit 1 }

  $pattern = 'ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9]{20,}'
  $hits = @()
  foreach ($f in $files) {
    if (-not (Test-Path $f -PathType Leaf)) { continue }
    if ($f -match '\.(png|jpg|jpeg|gif|woff2?|ico)$' -or $f -match 'package-lock\.json$') { continue }
    $m = Select-String -Path $f -Pattern $pattern -CaseSensitive -List
    if ($m) { $hits += "$($f):$($m.LineNumber)" }
  }
  if ($hits) { Write-Host "Possible secrets found:`n$($hits -join "`n")"; exit 1 }
  Write-Host "check-secrets: OK ($($files.Count) files scanned)"
} finally {
  Pop-Location
}
