# Production deployment guide

This guide explains how to deploy Peregrine on a Debian server with a domain
name, automatic HTTPS, a firewall, intrusion protection, and an optional
dedicated disk for game server data. It was written for Debian 13, and also
works on Debian 12 and recent Ubuntu with minor changes.

## Target architecture

```
Internet --> Caddy (ports 80/443, HTTPS) --> Peregrine (port 3000, local only)
```

Caddy is a reverse proxy: it handles HTTPS with a free, automatically renewed
Let's Encrypt certificate, and forwards traffic to Peregrine. Peregrine itself
is bound to `127.0.0.1` only, so it is never exposed directly to the Internet.

## Prerequisites

- A Debian server reachable from the Internet on ports 80 and 443.
- A domain name.
- Root (or sudo) access. The commands below assume root; otherwise prefix them
  with `sudo`.

## 1. DNS

At your domain registrar, create an `A` record pointing your domain (or a
subdomain) to the server's public IP address. DNS changes can take from a few
minutes to a few hours to propagate; Caddy needs this record to obtain the
HTTPS certificate, so do it first.

## 2. Prepare the system

```bash
apt update && apt upgrade -y
apt install -y curl git ca-certificates
```

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

## 4. (Optional) Dedicated disk for game server data

Game servers can use a lot of storage. Putting them on a separate disk lets you
resize that storage independently, without ever touching the system disk.

After attaching a new disk to the machine (for example in Proxmox, your VM
host, or your cloud provider), identify it:

```bash
lsblk
```

Look for the new, empty disk — for example `/dev/sdb` — with the expected size
and no partitions.

> **Warning:** the next command **erases** the target disk. Double-check the
> disk name with `lsblk`. Never run it on `/dev/sda` (the system disk).

Format the disk, mount it, and make the mount permanent across reboots:

```bash
mkfs.ext4 /dev/sdb
mkdir -p /srv/peregrine
UUID=$(blkid -s UUID -o value /dev/sdb)
echo "UUID=$UUID  /srv/peregrine  ext4  defaults,nofail  0 2" >> /etc/fstab
mount -a
df -h /srv/peregrine
```

The disk is now mounted at `/srv/peregrine`, ready to hold game server data.
From Phase 2 onwards (when server creation is implemented), Peregrine will be
configured to store each game server's files under this path.

### Resizing the disk later

After enlarging the virtual disk on your host, grow the filesystem live —
no need to unmount or reboot:

```bash
resize2fs /dev/sdb
df -h /srv/peregrine
```

If `resize2fs` reports that the disk has not changed, the kernel has not seen
the new size yet. Force a rescan (adjust the disk name) or reboot, then run
`resize2fs` again:

```bash
echo 1 > /sys/block/sdb/device/rescan
```

## 5. Install Peregrine

The repository is private, so cloning it requires a GitHub personal access
token (GitHub: Settings -> Developer settings -> Personal access tokens).

```bash
cd /opt
git clone https://github.com/Remilulz_91/peregrine-panel.git
cd /opt/peregrine-panel
cp .env.example .env
```

Edit `.env` and set, at least:

- `APP_URL` to `https://your-domain`
- `JWT_SECRET` to a long random value — generate one with `openssl rand -hex 32`
- keep `PEREGRINE_BIND=127.0.0.1` so the panel stays behind the reverse proxy

Then build and start the panel:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:3000/api/health
```

The last command should return `{"status":"ok",...}`.

## 6. Install Caddy (automatic HTTPS)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Configure Caddy as a reverse proxy (replace the domain):

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
your-domain.example {
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy
```

Caddy automatically obtains and renews the HTTPS certificate.

## 7. Firewall (UFW)

```bash
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

> **Important — Docker and UFW:** Docker manages its own firewall rules and
> bypasses UFW. A container port published on `0.0.0.0` would be reachable
> from the Internet even if UFW denies it. Peregrine avoids this by binding to
> `127.0.0.1` (the `PEREGRINE_BIND` setting in `.env`). Do not publish the
> panel on `0.0.0.0` on an Internet-facing server.

## 8. Install fail2ban

fail2ban blocks IP addresses after repeated failed login attempts.

```bash
apt install -y fail2ban
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
fail2ban-client status sshd
```

## 9. Verification

```bash
docker compose -f /opt/peregrine-panel/docker-compose.yml ps
ufw status verbose
fail2ban-client status sshd
curl -I https://your-domain.example
```

Then open `https://your-domain` in a browser: you should see the Peregrine
home page with a valid HTTPS padlock.

## 10. Updating Peregrine

To update an existing installation to the latest version:

```bash
cd /opt/peregrine-panel
git pull
docker compose up -d --build
```

`git pull` downloads the new code; `docker compose up -d --build` rebuilds and
restarts the panel. The `peregrine-data` volume is preserved, so accounts and
settings are kept across updates.

To avoid entering your GitHub token on every update, you can cache the
credentials with `git config --global credential.helper store`, or use an SSH
deploy key.

## Security recommendations

- Harden SSH: once you have a working SSH key, disable password authentication
  in `/etc/ssh/sshd_config` (`PasswordAuthentication no`), then restart SSH.
- Keep the system updated regularly: `apt update && apt upgrade`.
- Keep backups of the `peregrine-data` Docker volume and of `/srv/peregrine`.
