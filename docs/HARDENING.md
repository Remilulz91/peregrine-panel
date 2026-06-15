# Production hardening guide

> **Read [`DEPLOYMENT.md`](DEPLOYMENT.md) first.** That guide gets you a
> working panel with HTTPS, UFW, and fail2ban. This document is the
> *complement* — every step here goes **beyond** the baseline install
> and exists to push the security floor higher when the panel is
> exposed to the public Internet.

Each section follows the same shape: **why this matters**, **the
exact commands**, **how to verify it stuck**. Pick the sections that
match your threat model; the order is from "essential on any public
host" (1 – 5) to "specialist / advanced" (6 – 9).

Tested on Debian 13 (bookworm + trixie). The commands also work on
Debian 12 and recent Ubuntu LTS with minor tweaks.

---

## Threat model and scope

Hardening only makes sense against a specific adversary. The
checklist below targets the **three realistic threat profiles** for a
small self-hosted Minecraft panel:

| Adversary | Examples | Sections that defend against it |
|---|---|---|
| **Opportunistic Internet scanner** | Mass SSH brute-force, automated CVE scans, default-credential probes | 2 (SSH), 3 (TLS), 5 (auto-updates), 8 (UFW + fail2ban tuning) |
| **Targeted attacker** | Someone who wants *your* server (rival community, disgruntled player) | All of the above + 4 (Cloudflare), 7 (monitoring + alerting), 9 (off-site backup) |
| **Physical theft / VPS-provider compromise** | Laptop lost, provider hypervisor breach, disk seized | 1 (LUKS at rest), 9 (off-site backups with client-side encryption) |

This guide does **not** defend against:

- A nation-state attacker with persistent access to your registrar /
  hosting provider — out of scope for a small self-hosted panel.
- Application-layer bugs in Peregrine itself — those are addressed in
  [`SECURITY.md`](SECURITY.md) (report flow) and via the Zero Trust
  input sanitization, ACL, audit log, and supply-chain controls
  documented in [`SUPPLY-CHAIN.md`](SUPPLY-CHAIN.md).

---

## 1. Encrypt the data disk at rest (LUKS)

**Why.** If your VPS is shut down and the host's disk image is
copied — by a malicious provider employee, by law enforcement under
a warrant, or by an attacker who broke into the hypervisor — every
file your container ever wrote is readable in plain text, including
the SQLite database (which contains password hashes, JWT secrets in
your `.env`, audit events, and Minecraft world data). LUKS makes
that copy useless without the passphrase.

LUKS only protects the disk **at rest** — once the volume is open
and mounted, the data is plaintext to anything running on the host.
So this defends against "powered-off" or "ex-filtrated image"
attacks, not against a live root compromise.

### 1a. LUKS on a dedicated data disk (recommended)

`DEPLOYMENT.md` step 4 walks you through attaching a dedicated disk
for game-server data. Add LUKS to that flow — encrypt **before** the
filesystem is created:

```bash
# Identify the new disk (here /dev/sdb — adjust to yours)
lsblk

# Install cryptsetup if not already present
apt install -y cryptsetup

# Format the disk as LUKS2 (the default in cryptsetup ≥ 2.4).
# You will be asked for a passphrase TWICE — pick a long one
# (4-word diceware or 25+ random chars). LOSE THIS = LOSE THE DATA.
cryptsetup luksFormat --type luks2 /dev/sdb

# Open the encrypted device — gives you /dev/mapper/peregrine-data
cryptsetup luksOpen /dev/sdb peregrine-data

# Make the filesystem and mount it
mkfs.ext4 /dev/mapper/peregrine-data
mkdir -p /srv/peregrine
mount /dev/mapper/peregrine-data /srv/peregrine
```

To unlock automatically at boot (so the panel restarts without manual
intervention after a reboot), use a **key file on the encrypted root
partition** (NOT on the disk being unlocked) plus
`/etc/crypttab` + `/etc/fstab`:

```bash
# Make a high-entropy keyfile. It MUST live on a different
# (preferably also encrypted) volume, otherwise this is theatre.
dd if=/dev/urandom of=/root/peregrine-data.key bs=512 count=4
chmod 600 /root/peregrine-data.key

# Add the keyfile as an additional unlock slot (you'll be asked
# for the original passphrase one last time).
cryptsetup luksAddKey /dev/sdb /root/peregrine-data.key

# crypttab — unlocks at early boot using the keyfile.
echo "peregrine-data /dev/sdb /root/peregrine-data.key luks,discard" \
  >> /etc/crypttab

# fstab — mounts the unlocked volume on /srv/peregrine.
echo "/dev/mapper/peregrine-data /srv/peregrine ext4 defaults,noatime 0 2" \
  >> /etc/fstab

# Test the wiring before relying on it.
systemctl daemon-reload
mount -a
```

### 1b. LUKS on the root partition (advanced)

Encrypting the root partition is also possible, but requires either
(a) reinstalling Debian and ticking the "Encrypted LVM" option in
the installer, or (b) the in-place `cryptsetup-reencrypt` procedure
which is too dangerous to recommend in a short guide. If your host
already runs in production, skip 1b — encrypting the data volume
gives you 95 % of the value.

### Verify

```bash
lsblk -f                            # /dev/sdb should show TYPE=crypto_LUKS
cryptsetup status peregrine-data    # should print "type: LUKS2, cipher: aes-xts-plain64"
mount | grep peregrine              # should be on /dev/mapper/peregrine-data
```

Power-cycle the host once to confirm the auto-unlock chain works.

---

## 2. SSH hardening

### 2a. Disable password auth (enforce key-only)

**Why.** Even with fail2ban, an enabled-by-default password endpoint
is what *every* SSH brute-force botnet probes. Once `PasswordAuthentication
no` is set, those attempts are rejected at the protocol level — they
never even reach fail2ban's filter.

```bash
# 1. Verify you can log in via key FIRST (do not skip this).
#    From your laptop, in a new terminal:
ssh -i ~/.ssh/your_key.pub user@your-server     # must succeed

# 2. Once confirmed, on the server:
sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication .*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

### 2b. Move SSH to a non-standard port

**Why.** This is *not* security-by-obscurity in the bad sense — it
reduces log noise by ~99 % and lets fail2ban / your eyes focus on
the few attempts that come from actually-targeted reconnaissance.

```bash
# Pick a port between 1024 and 65535 that doesn't conflict with anything
# you run. Avoid common alternates (2222 is itself scanned now).
PORT=49222

sed -i "s/^#*Port .*/Port ${PORT}/" /etc/ssh/sshd_config

# Open the new port BEFORE restarting sshd, otherwise you'll lock
# yourself out.
ufw allow ${PORT}/tcp
ufw delete allow OpenSSH
systemctl restart ssh
```

Reconnect on the new port: `ssh -p 49222 user@host`.

### 2c. Two-factor auth on SSH (libpam-google-authenticator)

**Why.** A leaked or stolen SSH private key still gets the attacker
in. Adding TOTP — same algorithm Peregrine uses for the panel's 2FA
— means *both* the key AND a 6-digit code from your phone are needed.

```bash
apt install -y libpam-google-authenticator

# Run as YOUR user (not as root) — generates ~/.google_authenticator.
# Scan the QR code with Google Authenticator / Authy / 1Password /
# Bitwarden. Save the recovery codes somewhere offline.
google-authenticator -t -d -f -r 3 -R 30 -W
```

Flags above mean: time-based (`-t`), disallow code reuse (`-d`),
force file write (`-f`), rate-limit to 3 logins per 30 s (`-r 3 -R 30`),
window of ±1 step (`-W`).

Wire PAM + sshd to require it:

```bash
# 1. Tell PAM to ask for the OTP after the key check.
echo "auth required pam_google_authenticator.so nullok" \
  >> /etc/pam.d/sshd

# 2. Tell sshd to honour PAM AND keep the key check.
sed -i 's/^#*UsePAM .*/UsePAM yes/'                                  /etc/ssh/sshd_config
sed -i 's/^#*KbdInteractiveAuthentication .*/KbdInteractiveAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication .*/ChallengeResponseAuthentication yes/' /etc/ssh/sshd_config

# 3. Enforce two factors (key + OTP), with no fallback.
echo "AuthenticationMethods publickey,keyboard-interactive" \
  >> /etc/ssh/sshd_config

# 4. Test from a NEW terminal before logging out the current one.
systemctl restart ssh
```

The `nullok` keyword in the PAM line means users who haven't run
`google-authenticator` yet can still log in (with key only). Remove
`nullok` once everyone has set up TOTP.

### Verify

```bash
ss -tlnp | grep sshd                # listening on your custom port only
grep -E '^(Port|PermitRoot|PasswordAuth)' /etc/ssh/sshd_config
fail2ban-client status sshd         # filter is active
# From a new terminal: ssh -p 49222 user@host  → asks for OTP
```

---

## 3. Web edge — TLS, post-quantum key exchange, HTTP headers

`DEPLOYMENT.md` step 6 already installs Caddy with auto-Let's-Encrypt.
What follows tightens that baseline.

### 3a. Use Caddy 2.10+ for X25519MLKEM768 (post-quantum hybrid)

**Why.** A passive network adversary can record TLS traffic today and
attempt to break the key exchange years later, when a large quantum
computer becomes available ("harvest now, decrypt later"). Caddy 2.10
(April 2025) ships built on Go 1.23+, which **enables the
X25519MLKEM768 hybrid key exchange by default** for TLS 1.3 — a
post-quantum scheme standardized by NIST (ML-KEM = FIPS 203). 2.10
also adds automated Encrypted Client Hello (ECH) and ACME 6-day
short-lived certificate profiles. It costs ~1 ms extra per handshake
and is invisible to clients that don't support it (they fall back to
plain X25519).

```bash
# Check the installed Caddy version.
caddy version
# If it's < 2.10 you can either re-install from cloudsmith
# (which now ships 2.x stable) or download the static binary from
# https://caddyserver.com/download:
apt install --only-upgrade -y caddy
caddy version    # should print v2.10.x or later
systemctl restart caddy
```

To verify the post-quantum group is offered in handshakes (from any
machine):

```bash
# testssl.sh is the most reliable offline tool.
docker run --rm -it drwetter/testssl.sh --groups your-domain.example
# Look for "X25519MLKEM768" in the supported groups list.
```

### 3b. Restrict to TLS 1.3 + harden the Caddyfile

`DEPLOYMENT.md` ships a minimal Caddyfile. Replace it with the
hardened variant below — same domain, same reverse-proxy, plus
strict TLS, security headers, and access logging:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
{
    # Email used by ACME to email cert-expiry warnings (yours).
    email ops@your-domain.example

    # Disable HTTP/3 if you want a slightly smaller attack surface
    # (it's enabled by default in Caddy 2.x). Comment back in to allow.
    # servers { protocols h1 h2 }
}

# v0.43.1+: catch-all for any HTTP request that isn't the
# configured canonical domain (bare server IP, www. typos, stale
# DNS records). Redirects to the canonical HTTPS URL so neither
# the Caddy welcome page nor a downgrade attack can surface.
:80 {
    redir https://your-domain.example{uri} permanent
}

your-domain.example {
    encode zstd gzip

    # Enforce TLS 1.3 only — kills downgrade attacks against TLS 1.2.
    tls {
        protocols tls1.3
        # Caddy uses sensible cipher defaults; do not override.
    }

    # Strict transport security: 1 year, include subdomains, preload.
    # Submit to https://hstspreload.org/ once stable.
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    header X-Content-Type-Options    "nosniff"
    header X-Frame-Options           "DENY"
    header Referrer-Policy           "strict-origin-when-cross-origin"
    header Permissions-Policy        "geolocation=(), microphone=(), camera=()"
    # Caddy doesn't expose its version; remove the "Server: Caddy" header.
    header -Server

    reverse_proxy 127.0.0.1:3000

    log {
        output file /var/log/caddy/access.log {
            roll_size 10mb
            roll_keep 7
        }
        format json
    }
}
EOF

mkdir -p /var/log/caddy
systemctl reload caddy
```

### 3c. Verify the TLS profile

```bash
# A quality grade from Qualys — open the URL in any browser:
echo "https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.example"

# OR run testssl locally for a more detailed report:
docker run --rm -it drwetter/testssl.sh your-domain.example
# Target: A+ rating, TLS 1.3 only, HSTS preload-ready.

# Verify the response headers:
curl -sI https://your-domain.example | grep -iE 'strict-transport|content-type-options|frame-options|referrer'
```

---

## 4. DDoS upstream (Cloudflare)

**Why.** Application-layer rate-limiting (which Peregrine already
does for failed logins, MFA brute-force, etc.) cannot stop a
volumetric DDoS — if 50 Gbps of UDP reflection hits your VPS, your
provider's emergency null-route kicks in long before your panel
gets the request. The only realistic free defence against L3/L4
attacks for a self-hosted panel is putting Cloudflare in front of
it. Cloudflare's free tier includes unmetered L3/L4 mitigation and
basic WAF rules.

### 4a. Move DNS to Cloudflare and turn on the proxy

1. Create a free Cloudflare account.
2. Add your domain — Cloudflare assigns you 2 nameservers; update
   them at your registrar. Propagation is ≤ 24 h.
3. In **DNS → Records**, click the orange cloud next to the `A`
   record pointing at your VPS. Orange = proxied (traffic flows
   through Cloudflare). Grey = DNS-only (no protection).

### 4b. Lock UFW to Cloudflare IPs only

The panel's IP is still public — an attacker who finds it can bypass
Cloudflare entirely. Lock ports 80 + 443 to Cloudflare's published
IP ranges:

```bash
# Pull the current list (refresh quarterly — they update slowly).
curl -fsS https://www.cloudflare.com/ips-v4 > /etc/cloudflare-ips-v4
curl -fsS https://www.cloudflare.com/ips-v6 > /etc/cloudflare-ips-v6

# Replace the broad "ufw allow 80/443" with per-CIDR rules.
ufw delete allow 80/tcp
ufw delete allow 443/tcp
while read cidr; do
  [ -n "$cidr" ] && ufw allow from "$cidr" to any port 80,443 proto tcp
done < /etc/cloudflare-ips-v4
while read cidr; do
  [ -n "$cidr" ] && ufw allow from "$cidr" to any port 80,443 proto tcp
done < /etc/cloudflare-ips-v6
ufw reload
```

Also configure Caddy to **trust** Cloudflare's `CF-Connecting-IP`
header so audit logs show the real client IP, not Cloudflare's edge:

```caddyfile
your-domain.example {
    # … rest of config …
    trusted_proxies static cloudflare
}
```

Caddy ≥ 2.7 has a built-in `cloudflare` trusted_proxies source that
auto-updates from Cloudflare's published list.

### 4c. Cloudflare WAF + rate-limit rules (free-tier)

In the Cloudflare dashboard, under **Security**:

- **Security Level**: Medium.
- **Bot Fight Mode**: On (free tier blocks the worst offenders).
- **Browser Integrity Check**: On.
- **Challenge bad reputation IPs**: On (default).
- **Rate Limiting Rules** (free tier allows 1 rule): apply to the
  login endpoint:
  - Path: `/api/auth/login`
  - Method: `POST`
  - Threshold: 5 requests / 10 s per IP → Challenge.

### Verify

```bash
# Without Cloudflare cookies, the panel URL should return Cloudflare's
# challenge page or the Peregrine HTML — never a direct backend banner.
curl -sI https://your-domain.example | head -5

# Connecting directly to the VPS IP on 443 should now be REFUSED.
curl -k --resolve your-domain.example:443:YOUR.VPS.IP.HERE https://your-domain.example
# Expected: "couldn't connect" or "connection refused".
```

---

### 3d. (Optional) Plan the Node.js base-image bump

**Why.** The panel's Dockerfile uses `node:22-slim` as its base image.
Node 22 went into **maintenance LTS** in October 2025 and reaches
end-of-life in April 2027. Node 24 is the **active LTS** as of
mid-2026 (EOL April 2028), and Node 26 enters LTS in October 2026.
Staying on Node 22 is fine for the next ~10 months but you'll want
to plan the bump:

```bash
# Test locally before flipping the production Dockerfile:
docker build --build-arg NODE_IMAGE=node:24-slim -t peregrine:test .

# Once you've smoke-tested it, the change is two lines in
# Dockerfile (every `FROM node:22-slim` -> `FROM node:24-slim`)
# plus backend/package.json -> "engines": { "node": ">=22 <25" }.
```

Verify before / after with:
`docker exec peregrine node --version`.

---

## 5. Automatic security updates (unattended-upgrades)

**Why.** Most VPS compromises are NOT zero-days — they're unpatched
kernel / OpenSSL / sudo vulnerabilities the operator forgot to apply.
`unattended-upgrades` applies Debian's security pocket automatically.

```bash
apt install -y unattended-upgrades apt-listchanges
dpkg-reconfigure -plow unattended-upgrades    # answer "Yes"

# Tighten the defaults: also auto-reboot at 04:00 if a kernel/libc
# update requires it. Comment out if you'd rather reboot manually.
cat > /etc/apt/apt.conf.d/52unattended-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
EOF

# Dry run.
unattended-upgrade --dry-run --debug | tail
```

### Verify

```bash
systemctl status apt-daily.timer apt-daily-upgrade.timer
cat /var/log/unattended-upgrades/unattended-upgrades.log | tail -20
```

---

## 6. Entropy (for cryptographic primitives)

**Why.** JWT secret generation, TOTP secret generation, and the
crypto-random IVs / nonces used internally all draw from
`/dev/urandom`, which in turn is seeded from `/dev/random` plus the
kernel's CRNG. On a long-lived VPS that's fine; on a freshly
imaged / first-boot host the early kernel CRNG can be very low
quality for the first few seconds. `rngd` keeps the pool well-fed,
and a hardware TRNG is the gold standard.

### 6a. rngd from `rng-tools-debian`

```bash
apt install -y rng-tools-debian
systemctl enable --now rngd
```

`rngd` will use `/dev/hwrng` if your host CPU exposes RDRAND/RDSEED
(every Intel CPU since 2012 and AMD since Ryzen does), and falls
back to entropy from system jitter if not. On a typical Debian
13 system this just works.

### Verify

```bash
cat /proc/sys/kernel/random/entropy_avail
# After rngd: should sit comfortably above 256 (modern kernel doesn't
# go higher than ~256 by design).
journalctl -u rngd --no-pager -n 20
```

### 6b. (Advanced) YubiKey 5+ as a hardware TRNG

If you have a YubiKey 5 series (or any FIDO/PIV-capable hardware
token) plugged into your VPS — uncommon on a remote VPS, more
realistic on a home-server — you can use its NIST-certified TRNG to
seed `/dev/random`.

```bash
apt install -y ykman scdaemon pcscd
systemctl enable --now pcscd

# Check the YubiKey is detected:
ykman list
# Expected: a line per connected key (serial number + firmware).

# Pipe YubiKey entropy into the kernel pool every 30 s:
cat > /etc/systemd/system/yubikey-rngfeed.service <<'EOF'
[Unit]
Description=Feed YubiKey TRNG into /dev/random
After=pcscd.service

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/bin/sh -c 'while true; do ykman --reader Yubico script /usr/local/bin/yubi-rng.sh > /dev/random; sleep 30; done'

[Install]
WantedBy=multi-user.target
EOF
```

This is genuinely niche — for 99 % of operators, rngd from 6a is
enough. Skip 6b unless you have a hardware threat model that
specifically requires certified entropy sources.

---

## 7. Network and process audit

**Why.** Once a host is in production, the question "what's
actually listening / running on it" becomes the single most useful
piece of evidence in any incident response.

```bash
# What is listening on a network port?
ss -tunlp
# Expected on a hardened panel host:
#  - sshd on your custom port (e.g. 49222)
#  - caddy on 80 + 443
#  - docker-proxy (and only docker-proxy) for Peregrine on 127.0.0.1:3000
#  - dockerd on /var/run/docker.sock (unix socket, not TCP)

# What processes are running?
ps auxf | less

# Find SUID/SGID binaries (review the list — any unfamiliar entry is
# worth investigating).
find / -xdev -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null

# Find world-writable files outside /tmp /proc /sys.
find / -xdev -type f -perm -0002 -not -path '/tmp/*' -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null
```

### Lightweight monitoring — netdata

```bash
# Netdata gives you a real-time, browser-based view of CPU / RAM /
# disk / network / Docker per-container metrics with zero config.
# It runs as a non-root systemd service and binds to 127.0.0.1 by
# default — expose it via SSH tunnel rather than opening port 19999.
bash <(curl -Ss https://my-netdata.io/kickstart.sh) --dont-start-it --disable-telemetry
systemctl enable --now netdata

# Access from your laptop over SSH tunnel:
#   ssh -L 19999:127.0.0.1:19999 -p 49222 user@host
# then open http://localhost:19999 locally.
```

For multi-host or alerting, Prometheus + Grafana + Alertmanager is
the standard stack; out of scope for this guide but well documented
upstream.

### Log analysis — logwatch

```bash
apt install -y logwatch
# A daily digest emailed to root (assumes you've set up postfix or
# msmtp — out of scope here). Edit /etc/logwatch/conf/logwatch.conf
# to point at your address.
logwatch --output mail --mailto you@example.com --detail high
```

---

## 8. fail2ban — beyond the SSH default

`DEPLOYMENT.md` step 8 sets up the SSH jail. Add jails for **HTTPS
panel logins** and **Caddy 404 scanners** so volumetric scanning
trips an IP ban at the host level too:

```bash
cat > /etc/fail2ban/jail.d/peregrine.conf <<'EOF'
# Peregrine panel login brute-force — bans on 6 401s in 10 min.
[peregrine-login]
enabled  = true
filter   = peregrine-login
logpath  = /var/log/caddy/access.log
findtime = 10m
maxretry = 6
bantime  = 4h
backend  = auto

# 404-scanner — bans IPs sweeping for vulnerable apps (wp-admin,
# /.env, phpmyadmin …) — common precursor to a real attempt.
[caddy-404-scanner]
enabled  = true
filter   = caddy-404-scanner
logpath  = /var/log/caddy/access.log
findtime = 5m
maxretry = 15
bantime  = 1h
backend  = auto
EOF

# Matching filters — they parse Caddy's JSON access log.
cat > /etc/fail2ban/filter.d/peregrine-login.conf <<'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"uri":"/api/auth/login".*"status":401.*$
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/caddy-404-scanner.conf <<'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":404.*$
ignoreregex = ^.*"uri":"/(favicon\.ico|robots\.txt)".*$
EOF

systemctl restart fail2ban
fail2ban-client status peregrine-login
fail2ban-client status caddy-404-scanner
```

### Optional — read the bans inside the panel (v0.39.0+)

The admin **Security** tab can read fail2ban's live ban list and
display it next to Peregrine's own failed-login stats. The
integration is **read-only** — the panel cannot ban or unban
anyone, it only displays what fail2ban has already decided.

Wiring is done in `docker-compose.yml` by bind-mounting fail2ban's
database into the container with the `:ro` flag:

```yaml
services:
  peregrine:
    volumes:
      - "/var/lib/fail2ban:/host/fail2ban:ro"
    environment:
      - FAIL2BAN_DB_PATH=/host/fail2ban/fail2ban.sqlite3
```

This mount is present by default in the docker-compose.yml that
ships with v0.39.0+. If fail2ban is **not** installed on the host
(rare, since DEPLOYMENT.md §8 sets it up), the mount fails the
container start. In that case, either install fail2ban, or comment
the volume line out and set `FAIL2BAN_DB_PATH=""` in `.env` — the
dashboard will then show a "not configured" callout and Peregrine
will start normally.

---

## 9. Off-site backups (replacement for the panel-side encryption)

**Why.** The encrypted-backup-download feature was removed in
v0.37.0 because its Argon2id memory budget (1 GiB per request) was
incompatible with a small VPS. The right place to encrypt backups
is **on your laptop / your backup destination**, not on the panel
container.

### 9a. Pull backups off the VPS with rsync over SSH

The simplest, most boring, most reliable option:

```bash
# From your laptop, fetch a fresh copy of all backups + the panel DB
# nightly. SSH config should already have the host alias from §2.
rsync -av --delete -e "ssh -p 49222" \
  peregrine-server:/srv/peregrine/data/backups/ \
  ~/peregrine-backups/

# Add to your laptop's crontab to run nightly:
echo "30 3 * * * rsync -aq --delete -e 'ssh -p 49222' peregrine-server:/srv/peregrine/data/backups/ ~/peregrine-backups/" | crontab -
```

### 9b. Encrypt with `age` before pushing to S3/B2/Backblaze

If you want at-rest encryption on the cloud bucket (recommended),
use [age](https://github.com/FiloSottile/age) — modern, audited,
small. Argon2id is NOT used here, so it's cheap.

```bash
apt install -y age rclone

# Generate a recipient key pair (do this ONCE, store the private
# key in a password manager — losing it = losing the backups).
age-keygen -o ~/.age/peregrine.key
grep '^# public key:' ~/.age/peregrine.key

# Encrypt + push (run from the laptop pulling backups, after rsync):
for f in ~/peregrine-backups/*.tar.gz; do
  age -r "$(grep '^# public key:' ~/.age/peregrine.key | cut -d' ' -f4)" \
      "$f" > "$f.age"
done
rclone sync ~/peregrine-backups/ b2:my-bucket/peregrine/ \
  --include "*.age"
```

To decrypt later:
`age -d -i ~/.age/peregrine.key backup.tar.gz.age > backup.tar.gz`.

### 9c. Test the restore — periodically

A backup you've never restored is just a hope, not a backup. **Every
quarter**, on a scratch host (a fresh VPS or a local VM):

1. Install Peregrine fresh.
2. Stop the container.
3. Extract a recent backup over its data folder.
4. Restart and verify the world loads + the user accounts are intact.

Document the date you last did this in `/srv/peregrine/RESTORE-TESTED.txt`
so you and your future self both have a paper trail.

---

## Pre-production audit checklist

Run through this checklist **before** announcing the panel publicly.
Tick each box explicitly — "I think we did that" is how compromises
happen.

### Crypto and secrets
- [ ] `JWT_SECRET` in `.env` is a random 64-byte hex value (NOT the
      placeholder, NOT a memorable phrase).
- [ ] Database file (`/srv/peregrine/data/peregrine.db`) is on the
      LUKS-encrypted volume.
- [ ] First-launch admin account password is ≥ 16 chars random,
      stored in a password manager.
- [ ] 2FA enabled on the admin account.

### Network
- [ ] `ss -tunlp` lists only the expected listeners (SSH custom port,
      Caddy 80/443, Docker proxy on 127.0.0.1).
- [ ] UFW status is `active`, ports 80/443 restricted to Cloudflare
      IPs only (if §4 applied).
- [ ] Direct-to-VPS-IP HTTPS attempt is refused (Cloudflare bypass
      blocked).

### TLS
- [ ] `https://www.ssllabs.com/ssltest/` reports grade **A or A+**.
- [ ] HSTS header present with `max-age=31536000; includeSubDomains;
      preload`.
- [ ] No TLS < 1.3 protocol enabled.
- [ ] `https://securityheaders.com` reports grade **A or higher**.

### SSH
- [ ] `PasswordAuthentication no` confirmed.
- [ ] `PermitRootLogin no` confirmed.
- [ ] Custom port active, default 22 closed in UFW.
- [ ] (Optional) TOTP second factor enforced via
      `AuthenticationMethods publickey,keyboard-interactive`.

### Updates
- [ ] `unattended-upgrades` active and rebooting at 04:00 if needed.
- [ ] Panel `git pull && docker compose up -d --build` tested at
      least once.
- [ ] Dependabot enabled on the GitHub repo
      (see [`SUPPLY-CHAIN.md`](SUPPLY-CHAIN.md)).

### Backups
- [ ] Backups pulled off the VPS at least daily.
- [ ] Off-site backups encrypted with `age` (or equivalent).
- [ ] Restore drill done within the last 90 days.

### Audit trail
- [ ] `audit_events` table is being populated — verify by triggering
      a failed login and checking the row appears (`sqlite3
      peregrine.db 'SELECT * FROM audit_events ORDER BY id DESC LIMIT 5;'`).
- [ ] Caddy access logs rotate and are readable.

### Containers
- [ ] `docker inspect peregrine | grep -E 'ReadOnly|CapDrop|NoNewPriv|PidsLimit'`
      shows the hardening from `docker-compose.yml` is in effect.
- [ ] Image tag pinned in `docker-compose.yml` (not `latest`).

---

## Appendix A — emergency response

Suspect a compromise? Move fast and methodically.

1. **Don't panic, don't reboot.** A live attacker may have planted
   persistence that triggers on reboot but not while running. The
   running state is also more useful for forensics than a wiped
   memory.

2. **Cut the network at the edge**, not the host:

   ```bash
   # In the Cloudflare dashboard, set the DNS record to "DNS only"
   # (grey cloud) — this drops public access in seconds.
   # OR pause the entire site under Cloudflare → Overview → Advanced
   # → Pause Cloudflare on Site. Same effect, undo with one click.
   ```

3. **Snapshot the host BEFORE shutting it down.** Most VPS providers
   offer a one-click image. Do it — it's the only forensic evidence
   you'll have.

4. **Rotate everything**:

   ```bash
   # New JWT secret — invalidates every active session immediately.
   openssl rand -hex 32 > /tmp/new-jwt
   sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(cat /tmp/new-jwt)/" /opt/peregrine-panel/.env
   docker compose -f /opt/peregrine-panel/docker-compose.yml up -d
   ```

   Force-reset every admin password by deleting the user row and
   re-inviting (`audit_events` will log the operation).

5. **Audit query**:

   ```bash
   sqlite3 /srv/peregrine/data/peregrine.db <<'SQL'
   SELECT kind, actor_id, remote_ip, created_at, details
     FROM audit_events
     WHERE created_at > datetime('now', '-7 days')
     ORDER BY id DESC
     LIMIT 200;
   SQL
   ```

6. **Report the incident**: see [`SECURITY.md`](SECURITY.md) for the
   disclosure channel if the attack used a Peregrine bug.

---

## Appendix B — what this guide does *not* do

For clarity, these are not in scope here (and most don't need to
be for a small panel):

- **Mandatory Access Control (AppArmor / SELinux profiles)**. Debian
  has AppArmor in enforcing mode by default — that's enough for the
  panel's threat model.
- **Kernel hardening (grsec, lockdown LSM)**. The standard Debian
  kernel is fine.
- **Application-layer firewall on the panel itself**. Peregrine
  already does input validation, ACL, and rate-limiting on sensitive
  endpoints; another WAF in front would mostly add latency.
- **Multi-host clustering / failover**. Out of scope — Peregrine is
  designed for single-host self-hosting.
- **Compliance frameworks (SOC 2, ISO 27001, PCI-DSS)**. None apply
  to a self-hosted Minecraft panel. If they apply to *you* in your
  context, you have professionals for that and this guide is not the
  starting point.
