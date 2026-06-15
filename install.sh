#!/usr/bin/env bash
#
# Peregrine - automated installer for Debian.
#
# Run this from inside the cloned peregrine-panel directory, as root:
#   sudo bash install.sh your-domain.example
#
# It installs Docker, starts Peregrine, and sets up Caddy (HTTPS), the UFW
# firewall and fail2ban. See docs/DEPLOYMENT.md for the manual steps.

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# --- Checks ----------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: this script must be run as root (use sudo)." >&2
  exit 1
fi

if [ ! -f docker-compose.yml ] || [ ! -f .env.example ]; then
  echo "Error: run this script from inside the peregrine-panel directory." >&2
  exit 1
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  read -rp "Domain name for the panel (e.g. panel.example.com): " DOMAIN
fi
if [ -z "$DOMAIN" ]; then
  echo "Error: a domain name is required." >&2
  exit 1
fi

# --- System ----------------------------------------------------------------

echo "==> Updating the system..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl ca-certificates gnupg

# --- Docker ----------------------------------------------------------------

echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker is already installed."
fi

# --- Peregrine configuration ----------------------------------------------

echo "==> Configuring Peregrine..."
if [ ! -f .env ]; then
  cp .env.example .env
  JWT_SECRET="$(openssl rand -hex 32)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" .env
  echo "    Created .env (with a freshly generated JWT secret)."
else
  echo "    .env already exists, keeping it."
fi
# Both folders live on the dedicated disk by default. Backups sit next
# to the servers so a single mount holds everything.
mkdir -p /srv/peregrine/servers /srv/peregrine/backups

echo "==> Building and starting Peregrine..."
docker compose up -d --build

# --- Caddy (HTTPS reverse proxy) ------------------------------------------

echo "==> Installing Caddy..."
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
else
  echo "    Caddy is already installed."
fi

echo "==> Configuring Caddy for ${DOMAIN}..."
# v0.43.1+: the `:80` catch-all redirects every HTTP request whose
# Host header isn't ${DOMAIN} (bare server IP, www. typos, stale DNS)
# to the canonical HTTPS URL. Without it, those requests hit Caddy's
# default welcome page — annoying UX and a small information leak.
cat > /etc/caddy/Caddyfile <<EOF
:80 {
    redir https://${DOMAIN}{uri} permanent
}

${DOMAIN} {
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy

# --- Firewall (UFW) --------------------------------------------------------

echo "==> Configuring the firewall..."
apt-get install -y ufw
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# Peregrine's built-in SFTP server. Adjust if you change SFTP_PORT in .env.
ufw allow 2022/tcp
ufw --force enable

# --- fail2ban --------------------------------------------------------------

echo "==> Installing fail2ban..."
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- Done ------------------------------------------------------------------

echo ""
echo "============================================================"
echo " Peregrine is installed."
echo " Open https://${DOMAIN} in your browser to create the"
echo " administrator account."
echo "============================================================"
