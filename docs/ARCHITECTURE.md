# Peregrine Panel — Architecture & Development Plan

> Version 1.0 — living document.
> Peregrine is a self-hostable game server panel, in the spirit of Pterodactyl
> and Pelican.

---

## 1. Project vision

Peregrine is a web application that lets anyone install a "panel" on their own
Linux machine, then create, start, stop and manage game servers (Minecraft to
begin with) without ever touching the command line.

Each game server runs in its own Docker container: this guarantees isolation,
resource limits, and the ability to run several games or different versions on
the same machine without them interfering with each other.

The project targets three audiences:

- **The host**: the person who installs Peregrine on their machine and wants a
  simple interface to manage their servers.
- **The player / server owner**: the person who logs into the panel to manage
  their own Minecraft server (console, files, restarts).
- **The contributor**: the person who downloads the code to report bugs or
  security vulnerabilities.

**Goal of this first stage (the "MVP")**: a working single-machine version —
the panel and the game servers run on the same machine. Multi-machine support
will come later (see the roadmap).

---

## 2. Tech stack

The guiding principle: **one language from start to finish**, so there is only
one thing to learn.

| Component | Choice | Why |
|---|---|---|
| Language | **TypeScript** | One language for both the server AND the interface. TypeScript is JavaScript with guardrails that catch many errors before runtime. |
| Server (backend) | **Node.js + Fastify** | Node.js runs the TypeScript on the server side. Fastify is a modern, fast, well-documented web framework. |
| Interface (frontend) | **React + Vite + Tailwind CSS** | React is the most widely used UI library. Vite makes development fast. Tailwind handles styling without separate CSS files. |
| Database | **SQLite**, via Node's built-in driver | SQLite is a single file — **zero installation**, no database server to run. Peregrine uses Node.js's built-in SQLite (`node:sqlite`), so there is no extra dependency to install or download. |
| Authentication | **JWT + Argon2** | JSON Web Tokens keep the user logged in (stored in a secure httpOnly cookie); Argon2 hashes passwords so they are never stored in plain text. |
| Real time | **Socket.IO** | For the live server console and real-time status. Socket.IO handles reconnections automatically. (From Phase 4.) |
| Docker access | **dockerode** | A mature Node.js library to control Docker (create/start/stop containers) from code. (From Phase 2.) |
| UI languages | **English / French** | The panel interface is bilingual, with a language selector. |
| Deployment | **Docker Compose** | Installation for the end user is two commands: `git clone` then `docker compose up`. |

### Why not PHP/Laravel like Pterodactyl?

Pterodactyl and Pelican use PHP, which is a perfectly valid choice. But PHP
would require learning **two** languages (PHP on the server side + JavaScript on
the interface side). Staying on **TypeScript everywhere** reduces the learning
curve without sacrificing anything: Node.js handles Docker, real time and
WebSockets — everything a panel needs.

---

## 3. Overall architecture (single-machine MVP)

For the MVP, everything runs on **a single Linux machine**. It is kept as simple
as possible: no separate agent (Pterodactyl's "Wings"); the panel server talks
**directly** to Docker.

```
                    User's web browser
                              |
                              |  HTTPS / WebSocket
                              v
   +-------------------------------------------------------+
   |   LINUX MACHINE (the only computer, for the MVP)      |
   |                                                       |
   |   +-----------------------------------------------+   |
   |   |   "Peregrine" container                       |   |
   |   |   - React interface (static files)            |   |
   |   |   - Fastify API (TypeScript)                  |   |
   |   |   - Socket.IO (real-time console)             |   |
   |   |   - SQLite file (the database)                |   |
   |   +-----------------------------------------------+   |
   |                       |                               |
   |                       |  controls Docker via          |
   |                       |  /var/run/docker.sock         |
   |                       v                               |
   |   +-----------+  +-----------+  +-----------+          |
   |   | Container |  | Container |  | Container |   ...    |
   |   | Minecraft |  | Minecraft |  |  (other   |          |
   |   |  server 1 |  |  server 2 |  |   game)   |          |
   |   +-----------+  +-----------+  +-----------+          |
   |       ^ each game server = 1 Docker container          |
   +-------------------------------------------------------+
```

### The components

- **The interface (React)**: what the user sees in their browser. The list of
  their servers, start/stop buttons, the console, the file manager.
- **The API (Fastify)**: the brain. It receives requests from the interface
  ("create a server", "start it"), checks permissions, and gives orders to
  Docker.
- **The database (SQLite)**: the memory. It stores user accounts and the
  description of each server (name, owner, RAM limits, etc.). **Note: the
  database does NOT store the game files** — those live in Docker volumes.
- **Docker**: the engine that actually runs the game servers, each isolated in
  its own container.
- **The game containers**: one container = one game server. You can create as
  many as the machine can handle.

The panel itself runs in a container, and the machine's Docker socket
(`/var/run/docker.sock`) is mounted into it so it can create the other
containers. This is powerful but requires care — see the Security section.

---

## 4. How a game server works

### Game "templates"

Pterodactyl calls these "Eggs". In Peregrine they are called **templates**. A
template describes **how to run a game**: which Docker image to use, which
startup command, and which options the user can configure (version, RAM, server
type, etc.).

For the MVP, two templates are planned:

- **Minecraft Java** — Docker image `itzg/minecraft-server`. This is the
  reference image for Minecraft: it handles EULA acceptance, version selection,
  and variants (Vanilla, Paper, Forge, etc.) through simple variables.
- **Minecraft Bedrock** — image `itzg/minecraft-bedrock-server`, for the
  console/mobile version.

The system is designed so that **adding a new game later = adding a template**,
without touching the rest of the code.

### The lifecycle of a server

1. **Creation**: the user picks a template ("Minecraft Java"), a name and an
   amount of RAM. The API creates a database record, creates a **Docker volume**
   (persistent storage that survives restarts — this is where the world files
   live), reserves a free **port**, and creates the container (without starting
   it).
2. **Start**: the API asks Docker to start the container, with the resource
   limits (CPU/RAM) applied.
3. **Live console**: the API "listens" to the container's output and forwards it
   to the browser through Socket.IO. The user can also type commands, which are
   sent to the container's input.
4. **File management**: the user can browse, edit and upload files (configs,
   plugins, worlds) in the server's volume.
5. **Stop / restart**: orders sent to Docker.
6. **Deletion**: the container and (optionally) the volume are removed.

---

## 5. Data model (database schema)

The schema grows phase by phase. The actual SQL lives in
`backend/src/lib/db.ts`, applied automatically on startup. As of Phase 1, only
the `users` table exists; the tables below describe the full planned model.

**`users` — the accounts** *(implemented in Phase 1)*
- `id` — unique identifier
- `email` — unique
- `username`
- `password_hash` — the password hashed with Argon2 (never in plain text)
- `role` — `ADMIN` or `USER`
- `created_at`

**`game_templates` — the game templates** *(Phase 2)*
- `id`
- `name` — e.g. "Minecraft Java"
- `docker_image` — e.g. `itzg/minecraft-server`
- `startup_command`
- `stop_command` — the command for a clean shutdown (e.g. `stop`)
- `variables` — the configurable options (version, RAM, etc.), as JSON

**`servers` — the created game servers** *(Phase 2)*
- `id`, `owner_id`, `template_id`
- `name`, `container_id`, `docker_image`, `status`
- `memory_limit_mb`, `cpu_limit`, `disk_limit_mb`
- `volume_name` — the Docker volume that holds the game files
- `environment` — the variables chosen by the user, as JSON
- `created_at`

**`allocations` — the network ports** *(Phase 2)*
- `id`, `ip`, `port`
- `server_id` — which server uses the port (empty if free)

---

## 6. Project structure (repository layout)

A simple layout with two main folders: `backend` and `frontend`.

```
peregrine-panel/
├── README.md                 # Overview + installation guide
├── LICENSE                   # The license
├── docker-compose.yml        # Runs all of Peregrine in one command
├── .env.example              # Configuration template
│
├── backend/
│   └── src/
│       ├── index.ts          # Server entry point
│       ├── config.ts         # Configuration read from the environment
│       ├── routes/           # API endpoints (health, auth, ...)
│       ├── plugins/          # Cross-cutting concerns (authentication)
│       ├── lib/              # Database access, password hashing, helpers
│       └── services/         # Business logic (Docker, servers — Phase 2)
│
├── frontend/
│   └── src/
│       ├── main.tsx          # Interface entry point
│       ├── App.tsx           # Chooses which screen to show
│       ├── pages/            # Screens (Setup, Login, Dashboard, ...)
│       ├── components/       # Reusable interface building blocks
│       └── lib/              # API client, auth state, translations
│
└── docs/
    ├── ARCHITECTURE.md       # This document
    └── DEPLOYMENT.md         # Production deployment guide
```

---

## 7. Main API routes

Routes implemented so far, and the planned ones (mounted under `/api`).

| Method | URL | Purpose | Status |
|---|---|---|---|
| `GET` | `/api/health` | Service health check | Done |
| `GET` | `/api/auth/setup-required` | Is the first-run setup still needed? | Done |
| `POST` | `/api/auth/setup` | Create the first account (the administrator) | Done |
| `POST` | `/api/auth/login` | Log in (sets an httpOnly cookie) | Done |
| `POST` | `/api/auth/logout` | Log out | Done |
| `GET` | `/api/auth/me` | The currently logged-in user | Done |
| `GET` | `/api/servers` | List the user's servers | Phase 2 |
| `POST` | `/api/servers` | Create a server | Phase 2 |
| `POST` | `/api/servers/:id/start` | Start a server | Phase 3 |
| `POST` | `/api/servers/:id/stop` | Stop a server | Phase 3 |
| *(WebSocket)* | `/ws/servers/:id/console` | Live console | Phase 4 |

---

## 8. Roadmap — development by phases

The idea: move forward in small steps, each producing something that **works and
can be tested**. A phase is only left once the previous one is solid.

**Phase 0 — Setup**: create the repository, the folder structure, the `LICENSE`,
the `README`, the `docker-compose.yml`, and the basic backend and frontend
configuration. At the end: `docker compose up` launches an empty home page.

**Phase 1 — Accounts & login**: the database, registration of the first
administrator via a browser-based first-run wizard, login, JSON Web Token
sessions, and a protected dashboard. At the end: you can create the admin
account and log in.

**Phase 2 — Server creation**: Docker integration (dockerode), the Minecraft
Java template, create/list/delete a server. At the end: a Minecraft server
appears as a Docker container.

**Phase 3 — Server control**: start, stop, restart, real-time status display.
At the end: you can power a server on/off from the interface.

**Phase 4 — Live console**: Socket.IO, displaying the server output, sending
commands. At the end: you can see the Minecraft console and type into it.

**Phase 5 — File manager**: browse, edit, upload server files. At the end: you
can edit `server.properties` from the browser.

**Phase 6 — Limits & templates**: apply CPU/RAM/disk limits, add the Minecraft
Bedrock template, an administration page. At the end: a complete, usable MVP.

**Phase 7 — Polish & release**: a polished installation guide, an installation
script, the repository landing page, the first published version (`v0.1.0`).

**After the MVP**: multi-machine support (a separate "daemon" agent per
machine), automatic backups, sub-users and fine-grained permissions, a task
scheduler, usage statistics, more games.

---

## 9. Security — points of attention

A panel runs arbitrary code (mods, plugins) on machines, sometimes for other
people. To keep in mind from the start, even if not everything is for the MVP:

- **The Docker socket must never be exposed to the Internet.** Being able to
  talk to Docker means being able to do anything on the machine. Only the panel
  accesses it, locally.
- **Mandatory resource limits** on every game container (CPU, RAM, disk), so
  that one server cannot starve the others.
- **Game containers without privileges**: never `--privileged`, drop unneeded
  Linux capabilities, avoid running as `root` inside the container when
  possible.
- **File manager**: rigorously validate paths to prevent a user from escaping
  their server's folder (a "path traversal" attack).
- **Passwords** hashed with Argon2, never stored in plain text.
- **Authentication tokens** kept in httpOnly cookies, so page scripts cannot
  read them.
- **Permission checks** on every request: a user must only be able to manage
  their own servers; only an `ADMIN` can access the administration area.
- **HTTPS** in production via a reverse proxy (see `docs/DEPLOYMENT.md`).

---

## 10. License and GitHub setup

### The license

The chosen model: **free use, but reselling/redistributing Peregrine is
forbidden**. This is what is called a **source-available** license: the code is
publicly visible, but its reuse is restricted. Not to be confused with "open
source", which has a precise legal meaning that does allow redistribution.

No standard license matches this need exactly, so Peregrine uses a **custom
proprietary license** — the "Peregrine Source-Available License" — with these
principles:

- **Allowed**: download, install, run and use Peregrine for any purpose,
  including commercial purposes (for example, hosting servers for players).
- **Allowed**: modify the code for your own use, to evaluate the software,
  debug it, or propose fixes to the project.
- **Not allowed**: distribute, sell, rent, or share Peregrine or a modified
  version.
- **Not allowed**: remove or change the "Peregrine" name, branding or copyright
  notices to present the software as your own.
- Contributions submitted to the project (bug fixes) are licensed back to the
  project.
- No warranty: the software is provided "as is".

The full text is in the [`LICENSE`](../LICENSE) file. Note: this license was not
reviewed by a lawyer; for something fully enforceable, professional legal review
is recommended.

Also worth knowing: on a **public** GitHub repository, anyone can view and
"fork" the code — GitHub's terms allow it regardless of the license. It is the
license that makes redistribution **illegal**, not a technical lock. For real
access control, a **private** repository with invitations for testers is
required.

### The repository

- **Repository name**: `peregrine-panel` (lowercase with a hyphen — spaces
  cause trouble on the command line). The displayed product name remains
  "Peregrine".
- **Base files**: `README.md` (overview + installation), `LICENSE`,
  `CONTRIBUTING.md` (how to report bugs and vulnerabilities).
- **Vulnerability reporting**: the `SECURITY.md` file explains how to report a
  security issue responsibly (privately, not in a public issue).
- **GitHub Issues** are used for bug reports; issue templates guide reporters.

---

## 11. Summary of decisions

| Topic | Decision |
|---|---|
| Product name | Peregrine — repository `peregrine-panel` |
| Architecture | Single machine for the MVP (panel + Docker on the same machine) |
| Language | TypeScript everywhere |
| Backend | Node.js + Fastify |
| Frontend | React + Vite + Tailwind CSS |
| Database | SQLite, via Node's built-in `node:sqlite` driver |
| Authentication | JSON Web Tokens (httpOnly cookie) + Argon2 |
| Docker | dockerode (from Phase 2) |
| Real time | Socket.IO (from Phase 4) |
| Deployment | Docker Compose |
| Games at launch | Minecraft Java + Minecraft Bedrock |
| License | Custom source-available — "free use, reselling forbidden" |
| Repository visibility | Private at first, while the MVP is stabilized |
| UI languages | Bilingual: English / French |
| First admin account | Created on first launch via a browser-based setup wizard |
| Visual theme | Dark slate, amber accent (peregrine falcon inspired) |

---

## 12. Current status & next steps

**Phase 1 is complete.** On top of the Phase 0 setup, the panel now has:

- a SQLite database (Node's built-in driver), with migrations applied
  automatically on startup;
- a browser-based first-run wizard that creates the administrator account;
- login and logout, with sessions carried in a secure httpOnly cookie and
  passwords hashed with Argon2;
- a protected dashboard, shown only to signed-in users.

Next up is **Phase 2** — server creation: integrating Docker so the panel can
create and manage Minecraft game servers as containers.
