# Peregrine

**A self-hostable game server panel.**

Peregrine lets you install a control panel on your own Linux machine, then
create and manage game servers (starting with Minecraft) that each run in an
isolated Docker container. The project follows the spirit of Pterodactyl and
Pelican.

> **Work in progress.** Current version: `0.1.0` — Phase 0 (project setup).
> See the roadmap below.

## Planned features

- User accounts, with an administrator account created on first launch
- Create Minecraft servers (Java and Bedrock) in a few clicks
- Start, stop and restart servers
- Live console
- File manager
- Per-server resource limits (CPU, RAM, disk)

## Tech stack

- **Backend**: Node.js + Fastify (TypeScript)
- **Frontend**: React + Vite + Tailwind CSS (bilingual UI: English / French)
- **Database**: SQLite (via Prisma) — from Phase 1 onwards
- **Containers**: Docker, controlled with dockerode — from Phase 2 onwards
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
forwards `/api` calls to the backend.

## Project structure

```
peregrine-panel/
├── backend/            Fastify API (TypeScript)
├── frontend/           React interface (Vite + Tailwind)
├── docs/               Documentation (architecture, etc.)
├── docker-compose.yml  One-command startup
└── Dockerfile          Production image
```

## Roadmap

- [x] **Phase 0** — Project setup
- [ ] **Phase 1** — Accounts & login (automatic admin creation)
- [ ] **Phase 2** — Server creation (Docker integration)
- [ ] **Phase 3** — Server control (start / stop / restart)
- [ ] **Phase 4** — Live console
- [ ] **Phase 5** — File manager
- [ ] **Phase 6** — Resource limits & game templates
- [ ] **Phase 7** — Polish & first public release

Full details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
