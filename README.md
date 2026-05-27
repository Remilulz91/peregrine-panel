# Peregrine

**A self-hostable game server panel.**

Peregrine lets you install a control panel on your own Linux machine, then
create and manage game servers (Minecraft Java and Bedrock) that each run in
an isolated Docker container. The project follows the spirit of Pterodactyl
and Pelican.

> **Version 0.6.0** — scheduled tasks. Owners can set up recurring
> backups (hourly / daily / weekly) and the panel takes care of them in
> the background. See the changelog in
> [`CHANGELOG.md`](CHANGELOG.md).

## Features

- User accounts, with an administrator account created on first launch
- The administrator can create more accounts (User or Administrator) and
  share a single-use invitation link so each person picks their own
  password
- Server isolation: each account only sees its own game servers (the
  administrator gets a separate view with every server, to troubleshoot)
- **Per-server detail page** with tabs:
  - **Console** — live output and command input (Java servers)
  - **Files** — browse, edit, upload, delete
  - **Network** — host, port, protocol, connection string
  - **Backups** — manual snapshots stored on the dedicated disk
  - **Schedules** — recurring backups (hourly / daily / weekly),
    owner-only
  - **Users** — grant a fellow account access with a granular
    permission set (owner-only)
  - **Settings** — rename, delete (blocked while running)
  - **Activity** — chronological log of who did what
- **Granular subuser permissions** — control / console / files /
  backups / settings. The UI hides every button the viewer cannot
  use; the backend enforces the same rules.
- **Disk safety** — Peregrine refuses to create a server or a backup if
  doing so would push the dedicated disk below a 2 GiB / 5 % reserve,
  so a runaway server can never starve the others
- Create Minecraft servers (Java and Bedrock) in a few clicks
- Start, stop and restart servers
- Per-server resource limits (CPU, RAM)
- Bilingual interface (English / French)

## Tech stack

- **Backend**: Node.js + Fastify (TypeScript)
- **Frontend**: React + Vite + Tailwind CSS
- **Database**: SQLite, via Node's built-in driver (`node:sqlite`)
- **Authentication**: JSON Web Tokens + Argon2 password hashing
- **Containers**: Docker, controlled with dockerode
- **Real time**: Socket.IO (live console)
- **Backups**: system `tar` (no JS dependency), stored on the dedicated
  disk
- **Scheduler**: built-in 60 s tick worker (no external cron daemon)
- **Deployment**: Docker Compose

## Quick start (with Docker)

Requirements: a Linux machine with Docker and Docker Compose installed.

```bash
git clone <repository-url> peregrine-panel
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
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), which also covers an optional
  dedicated disk for game server data.

## Updating Peregrine

To update an existing installation to the latest version:

```bash
cd peregrine-panel
git pull
docker compose up -d --build
```

Your data (the `peregrine-data` volume) is preserved across updates.
Database migrations apply automatically on first launch.

## Development (without Docker)

Requirements: Node.js 22 or newer.

```bash
npm run install:all
npm run dev:backend
# In another terminal:
npm run dev:frontend
```

## Project structure

```
peregrine-panel/
├── backend/            Fastify API (TypeScript)
├── frontend/           React interface (Vite + Tailwind)
├── docs/               Documentation (architecture, deployment)
├── install.sh          Automated installer for Debian
├── docker-compose.yml  One-command startup
└── Dockerfile          Production image
```

## Roadmap

- [x] **Phase 0** — Project setup
- [x] **Phase 1** — Accounts & login (automatic admin creation)
- [x] **Phase 2** — Server creation (Docker integration)
- [x] **Phase 3** — Server control (start / stop / restart)
- [x] **Phase 4** — Live console
- [x] **Phase 5** — File manager
- [x] **Phase 6** — Resource limits & Minecraft Bedrock
- [x] **Phase 7** — Polish & first release (`v0.1.0`)
- [x] **Phase 8** — User management & invitations (`v0.2.0`)
- [x] **Phase 9** — Detail-page architecture (`v0.3.0`)
- [x] **Phase 10** — Backups on the dedicated disk, with disk-space
  pre-checks (`v0.4.0`)
- [x] **Phase 11** — Subusers with granular per-server permissions
  (`v0.5.0`)
- [x] **Phase 12** — Scheduled tasks for recurring backups (`v0.6.0`)

Ideas for later: multi-machine support, databases, more games, more
schedule actions (restart on a schedule, send a console command). Full
details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
