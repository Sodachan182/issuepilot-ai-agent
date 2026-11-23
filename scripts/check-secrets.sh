#!/usr/bin/env bash
# CI twin of check-secrets.ps1: fail if tracked files include .env/databases or secret-looking strings.
set -euo pipefail
cd "$(dirname "$0")/.."

if git ls-files | grep -E '(^|/)\.env$|\.db$'; then
  echo "Forbidden files are tracked" >&2
  exit 1
fi

pattern='ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}'
if git ls-files -z | grep -zvE '\.(png|jpg|jpeg|gif|woff2?|ico)$|package-lock\.json$' \
  | xargs -0 grep -nE "$pattern" 2>/dev/null; then
  echo "Possible secrets found" >&2
  exit 1
fi
echo "check-secrets: OK"
