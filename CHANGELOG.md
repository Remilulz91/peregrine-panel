# Changelog

All notable changes to Peregrine are documented in this file.

## v0.1.0 — 2026-05-22

The first release of the Peregrine MVP — a self-hostable game server panel.

### Added

- **Accounts & login** — a browser-based first-run wizard creates the
  administrator account; login and logout use JSON Web Token sessions, with
  passwords hashed using Argon2.
- **Bilingual interface** — the whole panel is available in English and
  French, with a language selector.
- **Game servers** — create, list and delete game servers, each running in
  its own Docker container. Two games are supported: Minecraft Java and
  Minecraft Bedrock.
- **Server control** — start, stop and restart servers, with the live status
  read directly from Docker.
- **Live console** — each server's output is streamed to the browser in real
  time over Socket.IO; commands can be sent to Java servers.
- **File manager** — browse, edit, upload and delete a server's files, with
  protection against path-traversal attacks.
- **Resource limits** — every server is created with a hard CPU and RAM
  limit.
- **Deployment** — a Docker Compose setup, a production deployment guide
  (`docs/DEPLOYMENT.md`) and an automated installer (`install.sh`) for Debian,
  with HTTPS, a firewall (UFW) and intrusion protection (fail2ban).
