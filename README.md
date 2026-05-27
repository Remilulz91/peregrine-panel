# Peregrine

**A self-hostable game server panel.**

Peregrine lets you install a control panel on your own Linux machine, then
create and manage game servers (Minecraft Java and Bedrock) that each run in
an isolated Docker container. The project follows the spirit of Pterodactyl
and Pelican.

> **Version 0.3.0** — detail-page architecture: clicking a server in the
> list opens its dedicated page with Console, Files, Network, Settings
> and Activity tabs. See the changelog in [`CHANGELOG.md`](CHANGELOG.md).

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
  - **Settings** — rename, delete (blocked while running)
  - **Activity** — chronological log of who did what
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

## Development (without Docker)

Requirements: Node.js 22 or newer.

```bash
# Install backend and frontend dependencies
npm run install:all

# Start the backend (port 3000)
npm run dev:backend

# In another terminal, start the frontend (port 5173)
npm run dev:frontend
```

The development frontend runs at `http://localhost:5173`; it automatically
forwards `/api` calls and the websocket to the backend.

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
- [ ] **Phase 10** — Backups on the dedicated disk, with disk-space
  pre-checks (`v0.4.0`, next)
- [ ] **Phase 11** — Subusers with granular per-server permissions
- [ ] **Phase 12** — Scheduled tasks (recurring backups)

Ideas for later: multi-machine support, databases, more games. Full details
in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
