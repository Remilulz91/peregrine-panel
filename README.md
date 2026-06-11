# Peregrine

**A self-hostable game server panel.**

Peregrine lets you install a control panel on your own Linux machine, then
create and manage game servers (Minecraft Java and Bedrock) that each run in
an isolated Docker container. The project follows the spirit of Pterodactyl
and Pelican.

> **Version 0.26.0** — single active session per user. Sign in
> on a new device and the previous device is signed out on its
> next request, with a friendly "ended on another device"
> message on the Login screen.
> See the changelog in
> [`CHANGELOG.md`](CHANGELOG.md).

## Features

- User accounts, with an administrator account created on first launch
- **Two-factor authentication (2FA)** via TOTP (Google Authenticator,
  Authy, 1Password, Bitwarden, ...) — optional per account, with 8
  single-use recovery codes and an admin reset button
- The administrator can create more accounts (User or Administrator) and
  share a single-use invitation link
- Server isolation: each account only sees its own game servers (the
  administrator gets a separate view with every server)
- **Per-server detail page** with tabs:
  - **Console** — live output and command input (Java servers)
  - **Files** — browse, edit, upload, delete
  - **Network** — host, port, protocol, connection string +
    **SFTP credentials** (host, port, username, copy-paste-ready)
  - **Backups** — manual snapshots stored on the dedicated disk
  - **Schedules** — recurring backups (hourly / daily / weekly)
  - **Users** — grant a fellow account access with a granular
    permission set
  - **Settings** — rename, delete (blocked while running)
  - **Activity** — chronological log of who did what
- **Granular subuser permissions** — the UI hides every button the
  viewer cannot use; the backend enforces the same rules.
- **Easy server creation** — pick game, loader (Vanilla / Paper /
  Fabric / Forge for Java) and Minecraft version from dropdowns.
- **Disk safety** — Peregrine refuses to create a server or a backup if
  doing so would push the dedicated disk below a 2 GiB / 5 % reserve
- Create Minecraft servers (Java and Bedrock) in a few clicks
- Start, stop and restart servers
- Per-server resource limits (CPU, RAM)
- Bilingual interface (English / French)

## Tech stack

- **Backend**: Node.js + Fastify (TypeScript)
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite, via Node's built-in driver (`node:sqlite`)
- **Authentication**: JSON Web Tokens + Argon2 password hashing, TOTP
  2FA (RFC 6238, hand-rolled, no external dep)
- **Containers**: Docker, controlled with dockerode, using the
  `itzg/minecraft-server` image (Vanilla, Paper, Fabric, Forge) and
  `itzg/minecraft-bedrock-server`
- **Real time**: Socket.IO (live console)
- **Backups**: system `tar`, stored on the dedicated disk
- **Scheduler**: built-in 60 s tick worker
- **Deployment**: Docker Compose

## Quick start (with Docker)

Requirements: a Linux machine with Docker and Docker Compose installed.

```bash
git clone https://github.com/Remilulz91/peregrine-panel.git
cd peregrine-panel
cp .env.example .env
# Edit .env (at minimum, change JWT_SECRET)
docker compose up -d
```

The panel is then available at `http://localhost:3000`. On first access, a
wizard guides you through creating the administrator account.

## Production deployment

To deploy Peregrine on a server with your own domain name, automatic HTTPS, a
firewall (UFW) and intrusion protection (fail2ban):

- **Automated** — from the cloned directory, run
  `sudo bash install.sh your-domain.example`.
- **Manual** — follow the step-by-step guide in
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Timezone for scheduled tasks

The **Schedules** tab interprets times (e.g. "backup at 04:00") in the
panel container's timezone. By default that's **UTC**, so a 04:00
schedule actually fires at 04:00 UTC — that's **06:00 in Paris during
summer** and 05:00 in winter.

To make schedules use your local time, set `TZ` in your `.env`:

```
TZ=Europe/Paris
```

Then recreate the container:

```bash
docker compose up -d
```

After that, edit (or just toggle Enabled off / on) each existing
schedule so its `next_run_at` is recomputed in the new timezone.
See `.env.example` for examples and the IANA timezone list.

## Updating Peregrine

```bash
cd peregrine-panel
git pull
docker compose up -d --build
```

Your data (the `peregrine-data` volume) is preserved across updates.
Database migrations apply automatically on first launch.

## Roadmap

- [x] **Phase 0** — Project setup
- [x] **Phase 1** — Accounts & login
- [x] **Phase 2** — Server creation (Docker integration)
- [x] **Phase 3** — Server control (start / stop / restart)
- [x] **Phase 4** — Live console
- [x] **Phase 5** — File manager
- [x] **Phase 6** — Resource limits & Minecraft Bedrock
- [x] **Phase 7** — Polish & first release (`v0.1.0`)
- [x] **Phase 8** — User management & invitations (`v0.2.0`)
- [x] **Phase 9** — Detail-page architecture (`v0.3.0`)
- [x] **Phase 10** — Backups on the dedicated disk (`v0.4.0`)
- [x] **Phase 11** — Subusers with granular permissions (`v0.5.0`)
- [x] **Phase 12** — Scheduled tasks (`v0.6.0`)
- [x] **Phase 13** — Two-factor authentication (`v0.7.0`)
- [x] **Phase 14** — Loader picker & version dropdown (`v0.8.0`)
- [x] **Phase 15** — Built-in SFTP server (`v0.9.0`)
- [x] **Phase 16** — Editable resources + provisioning reliability (`v0.10.0`)

Ideas for later: multi-machine support, more games (Terraria, Valheim,
Palworld), more schedule actions (restart on a schedule, send a console
command), observability. Full details in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

Peregrine is distributed under a **source-available** license: the code is
public, but redistribution is not allowed. You may use Peregrine freely —
including for commercial purposes — and modify the code for your own use or to
contribute. You may not resell it, redistribute it, or present it as your own
product.

See the [`LICENSE`](LICENSE) file for the full terms.

## Contributing & reporting bugs

Bug reports are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). To report a
security vulnerability, see [`SECURITY.md`](SECURITY.md).
