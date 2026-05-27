# Changelog

All notable changes to Peregrine are documented in this file.

## v0.2.0 — 2026-05-27

User management: the administrator can now create accounts for other
people and let them set their own password through a single-use
invitation link.

### Added

- **Account creation by the administrator** — the admin can create new
  accounts (User or Administrator) from a new "Admin" section. Each new
  account is paired with a one-time invitation link that the admin shares
  out-of-band (Discord, email, ...).
- **Invitation links** — opening `/invite/<token>` lets the invited
  person see their username, choose their own password (entered twice)
  and log in. The link is valid for 7 days and is destroyed as soon as
  it is used. The admin can regenerate a fresh link at any time.
- **Server isolation** — each account only sees its own game servers in
  the regular dashboard.
- **Administration view** — administrators get an extra "Admin" toggle
  in the header that opens a separate view, with two tabs: a table of
  every user account (create, regenerate invite, delete) and a list of
  every server on the panel, with full controls (start, stop, console,
  files, delete) so the admin can help any user troubleshoot.
- **Safety guards** — an administrator cannot delete their own account,
  and the last remaining administrator cannot be removed.

### Changed

- **Login by username** — the login screen now asks for a username
  instead of an email address. Usernames are compared case-insensitively
  (so `alice` and `ALICE` are the same account).
- The database schema is migrated automatically on first launch after
  the update (no manual step required).

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
