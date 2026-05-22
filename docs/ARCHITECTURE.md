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
| Docker access | **dockerode** | A mature Node.js library to control Docker (create/start/stop containers) from code. |
| Real time | **Socket.IO** | Streams each server's live console to the browser and carries the commands typed back. |
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
  description of each server. **Note: the database does NOT store the game
  files** — those live on disk, in a folder bind-mounted into each container.
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
template describes **how to run a game**: which Docker image to use and the
default version. The built-in templates are seeded into the database on
startup.

For the MVP, two templates are planned:

- **Minecraft Java** — Docker image `itzg/minecraft-server`. *(Implemented in
  Phase 2.)*
- **Minecraft Bedrock** — image `itzg/minecraft-bedrock-server`. *(Phase 6.)*

The system is designed so that **adding a new game later = adding a template**,
without touching the rest of the code.

### The lifecycle of a server

1. **Creation**: the user picks a template, a name, a version and an amount of
   RAM. The API reserves a free port, downloads the Docker image and creates
   the container. *(Phase 2.)*
2. **Start / stop / restart**: the API tells Docker to start, stop or restart
   the container; the interface shows the live status. *(Phase 3.)*
3. **Live console**: the server's output is streamed to the browser over
   Socket.IO, and the user can type commands (sent via RCON). *(Phase 4.)*
4. **File management**: the user can browse, edit, upload and delete the
   server's files from the browser. *(Phase 5.)*
5. **Deletion**: the container and the data folder are removed. *(Phase 2.)*

---

## 5. Data model (database schema)

The schema grows phase by phase. The actual SQL lives in
`backend/src/lib/db.ts` and is applied automatically on startup.

**`users` — the accounts** *(Phase 1)*
- `id`, `email` (unique), `username`
- `password_hash` — the password hashed with Argon2 (never in plain text)
- `role` — `ADMIN` or `USER`
- `created_at`

**`game_templates` — the game templates** *(Phase 2)*
- `id`, `name` (unique)
- `docker_image`, `default_version`, `created_at`

**`servers` — the created game servers** *(Phase 2)*
- `id`, `owner_id`, `template_id`
- `name`, `status` (`INSTALLING`, `OFFLINE`, `INSTALL_FAILED`, ...)
- `container_id` — the Docker container id (empty until provisioned)
- `minecraft_version`, `memory_mb`
- `port` — the unique host port reserved for this server
- `created_at`

The running state shown to the user (running / offline) is read live from
Docker, not stored in the database, so it always reflects reality. The game
server's files are stored on disk under a per-server folder, not in the
database.

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
│       ├── routes/           # API endpoints (health, auth, servers, files)
│       ├── realtime/         # Real-time console (Socket.IO)
│       ├── plugins/          # Cross-cutting concerns (authentication)
│       ├── lib/              # Database, Docker, files, password hashing
│       └── services/         # Business logic (server provisioning)
│
├── frontend/
│   └── src/
│       ├── main.tsx          # Interface entry point
│       ├── App.tsx           # Chooses which screen to show
│       ├── pages/            # Screens (Setup, Login, Dashboard)
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
| `GET` | `/api/templates` | List the available game templates | Done |
| `GET` | `/api/servers` | List the user's servers (with live status) | Done |
| `POST` | `/api/servers` | Create a server | Done |
| `DELETE` | `/api/servers/:id` | Delete a server (container + files) | Done |
| `POST` | `/api/servers/:id/start` `/stop` `/restart` | Server power controls | Done |
| `GET` | `/api/servers/:id/files` | List a directory | Done |
| `GET/PUT` | `/api/servers/:id/file` | Read / write a text file | Done |
| `DELETE` | `/api/servers/:id/file` | Delete a file or directory | Done |
| `POST` | `/api/servers/:id/files` | Upload a file | Done |
| *(Socket.IO)* | `console:subscribe` / `console:command` | Live console | Done |

---

## 8. Roadmap — development by phases

The idea: move forward in small steps, each producing something that **works and
can be tested**. A phase is only left once the previous one is solid.

**Phase 0 — Setup**: the repository, the folder structure, the base files, and
the basic backend and frontend configuration.

**Phase 1 — Accounts & login**: the database, the browser-based first-run
wizard that creates the administrator, login, JSON Web Token sessions, and a
protected dashboard.

**Phase 2 — Server creation**: Docker integration (dockerode), the Minecraft
Java template, and the ability to create, list and delete game servers.

**Phase 3 — Server control**: start, stop and restart servers, with the live
status read directly from Docker.

**Phase 4 — Live console**: Socket.IO streams the server output to the browser
in real time, and the user can type commands (sent via RCON).

**Phase 5 — File manager**: browse, edit, upload and delete a server's files
from the browser.

**Phase 6 — Limits & templates**: apply CPU/RAM/disk limits, add the Minecraft
Bedrock template, an administration page.

**Phase 7 — Polish & release**: a polished installation guide, an installation
script, the first published version (`v0.1.0`).

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
  that one server cannot starve the others. *(Phase 6.)*
- **Game containers without privileges**: never `--privileged`, drop unneeded
  Linux capabilities, avoid running as `root` inside the container when
  possible.
- **File manager**: every path is resolved and checked to stay inside the
  server's own folder, which blocks "path traversal" attacks.
- **Passwords** hashed with Argon2, never stored in plain text.
- **Authentication tokens** kept in httpOnly cookies; the websocket console is
  authenticated with the same cookie, and a user can only reach their own
  servers.
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
  including commercial purposes.
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

- **Repository name**: `peregrine-panel` (lowercase with a hyphen). The
  displayed product name remains "Peregrine".
- **Base files**: `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`.
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
| Docker | dockerode |
| Real time | Socket.IO |
| Deployment | Docker Compose |
| Games at launch | Minecraft Java + Minecraft Bedrock |
| License | Custom source-available — "free use, reselling forbidden" |
| Repository visibility | Private at first, while the MVP is stabilized |
| UI languages | Bilingual: English / French |
| First admin account | Created on first launch via a browser-based setup wizard |
| Visual theme | Dark slate, amber accent (peregrine falcon inspired) |

---

## 12. Current status & next steps

**Phase 5 is complete.** Each game server now has a file manager: the user can
browse its folders, open and edit text files (such as `server.properties`),
upload files, and delete files or folders — all from the browser. Every path
is checked to stay inside the server's own directory.

Next up is **Phase 6** — resource limits and more games: enforcing CPU, RAM
and disk limits on each container, and adding the Minecraft Bedrock template.
