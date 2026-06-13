#!/usr/bin/env bash
# Peregrine — one-shot dev environment setup (v0.35.2+).
#
# Run on your DEVELOPER MACHINE (your laptop, your PC) — NOT on the
# server that runs the panel in production. The production server uses
# Docker to build everything inside the container; it has no need for
# a local Node/npm install.
#
# Usage:
#   bash scripts/setup-dev.sh
#
# What it does:
#   1. Activates the local pre-commit hook (gitleaks scan before each commit).
#   2. Installs backend dependencies with --ignore-scripts (supply-chain safe).
#   3. Installs frontend dependencies with --ignore-scripts.
#
# Requirements:
#   - bash, git
#   - Node >= 22, npm   (skip steps 2 + 3 if missing — see message)

set -u  # `-u` only; we want to handle missing commands ourselves.

cd "$(dirname "$0")/.."

echo "==> Activating local pre-commit hook"
git config core.hooksPath .githooks
echo "    core.hooksPath = .githooks (active for this clone)"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo
  echo "==> Tip: install gitleaks locally so the hook can scan your commits"
  echo "    https://github.com/gitleaks/gitleaks/releases"
  echo "    The hook still lets commits through without it; CI will scan on push."
fi

# Check Node + npm. If either is missing this is almost certainly a
# production server, not a dev machine — say so and exit cleanly.
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo
  echo "==> Note: node and/or npm are not installed."
  echo "    This script is meant for a DEV machine — the machine you edit"
  echo "    code on and commit from. The production server doesn't need it:"
  echo "    Docker builds the panel inside the container, with its own Node."
  echo
  echo "    If this IS your dev machine, install Node >= 22 from"
  echo "    https://nodejs.org/  and re-run this script."
  echo
  echo "    Otherwise: you are done. The git hook is active (harmless even"
  echo "    if you never commit from here), and the panel keeps running"
  echo "    normally."
  exit 0
fi

# Check Node major version matches `engines` constraint (>=22 <23).
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ] || [ "$NODE_MAJOR" -ge 23 ]; then
  echo
  echo "==> Warning: Node $NODE_MAJOR detected. Peregrine requires Node 22.x"
  echo "    (declared in package.json engines). Install Node 22 LTS from"
  echo "    https://nodejs.org/ before re-running this script."
  exit 1
fi

echo
echo "==> Installing backend deps (npm ci --ignore-scripts)"
( cd backend && npm ci --ignore-scripts ) || {
  echo "    backend install failed — see the npm output above"
  exit 1
}

echo
echo "==> Installing frontend deps (npm ci --ignore-scripts)"
( cd frontend && npm ci --ignore-scripts ) || {
  echo "    frontend install failed — see the npm output above"
  exit 1
}

echo
echo "==> Done."
echo "    Run the backend with:   cd backend && npm run dev"
echo "    Run the frontend with:  cd frontend && npm run dev"
