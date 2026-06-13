#!/usr/bin/env bash
# Peregrine — one-shot dev environment setup (v0.35.1+).
#
# Run once after cloning the repo:
#   bash scripts/setup-dev.sh
#
# What it does:
#   1. Activates the local pre-commit hook (gitleaks scan before each commit).
#   2. Installs backend dependencies with --ignore-scripts (supply-chain safe).
#   3. Installs frontend dependencies with --ignore-scripts.
#   4. Prints a short reminder about gitleaks if it isn't installed.
#
# Requires: bash, git, node >= 22, npm.

set -e

cd "$(dirname "$0")/.."

echo "==> Activating local pre-commit hook"
git config core.hooksPath .githooks
echo "    core.hooksPath = .githooks"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo
  echo "==> Tip: install gitleaks locally so the hook can scan your commits"
  echo "    https://github.com/gitleaks/gitleaks/releases"
  echo "    The hook still lets commits through without it; CI will scan on push."
  echo
fi

echo "==> Installing backend deps (npm ci --ignore-scripts)"
( cd backend && npm ci --ignore-scripts )

echo "==> Installing frontend deps (npm ci --ignore-scripts)"
( cd frontend && npm ci --ignore-scripts )

echo
echo "==> Done. Run the backend with:   cd backend && npm run dev"
echo "    Run the frontend with:        cd frontend && npm run dev"
