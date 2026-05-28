# Changelog

All notable changes to Peregrine are documented in this file.

## v0.9.0 — 2026-05-28

SFTP access. Peregrine now runs a built-in SFTP server on its own
port (`2022` by default), letting every user connect with their
favourite SFTP client (FileZilla, WinSCP, Cyberduck, lftp...) to
browse, upload, edit and delete the files of any server they have
access to — just like Pterodactyl.

### Added

- **Built-in SFTP server** running in-process alongside the HTTP
  panel. Listens on `0.0.0.0:2022` by default; the port is
  configurable via `SFTP_PORT` (set to `0` to disable).
- **Per-server credentials** — the SFTP username is
  `<panel-username>.<server-id>` and the password is the user's
  regular panel password (Argon2-verified).
- **Granular permission gates** — file writes require the
  `files.write` permission, deletions require `files.delete`. Subusers
  who lack those permissions get read-only access, exactly like in the
  web UI.
- **Chroot per session** — each connection is locked inside the
  matching server's data directory. Path traversal attempts (`../`)
  are rejected at every operation.
- **Activity log entry** (`sftp.connect`) recorded every time a
  session is accepted.
- **Network tab section** showing the host, port, SFTP username and
  password hint, with copy buttons and an `Open in SFTP client`
  launch link (`sftp://...`).

### Changed

- The Docker host key is generated automatically on first boot
  (RSA-2048) and persisted to `${SFTP_HOST_KEY_PATH}` (default:
  `data/sftp_host_key`) so SFTP clients don't see "host key changed"
  warnings across restarts.
- `docker-compose.yml` exposes port 2022 (configurable via
  `PEREGRINE_SFTP_BIND` + `SFTP_PORT`).
- `install.sh` opens 2022/tcp in UFW.

### Security note

SSH/SFTP has no native concept of a second factor, so accounts with
MFA enabled can still log in to SFTP with just their panel password
(same trade-off as Pterodactyl). The Network tab shows a clear
warning for those users — pick a strong, unique password.

## v0.8.0 — 2026-05-28

Easier Minecraft server creation: pick the loader and the version from
dropdowns instead of typing the version by hand. Vanilla, Paper, Fabric
and Forge are all first-class choices for Java servers.

### Added

- **Loader picker** in the create-server dialog (Java only): Vanilla,
  Paper, Fabric, Forge. A short hint explains what each one is for
  (vanilla = pure MC, Paper = high-performance fork, Fabric/Forge =
  mods).
- **Curated Minecraft version dropdown** replaces the free-text input.
  Java offers LATEST + 1.21.1 / 1.21 / 1.20.6 / 1.20.4 / 1.20.1 /
  1.19.4 / 1.19.2 / 1.18.2 / 1.17.1 / 1.16.5 / 1.12.2 / 1.8.9. Bedrock
  exposes LATEST only (its version numbering is awkward).
- **Loader shown on the server card** when it is not vanilla — appears
  in the subtitle in amber, e.g. `Minecraft Java · Fabric · 1.21.1`.

### Changed

- The backend now stores a `loader` column on each server and passes
  `TYPE=VANILLA|PAPER|FABRIC|FORGE` to the itzg image. The same Docker
  image handles every flavour, so no new image to pull.
- **Existing servers** automatically migrate to `loader = 'vanilla'`,
  which matches their previous (implicit) behaviour. No restart needed
  beyond the regular `docker compose up -d --build`.
- Bedrock servers force `loader = 'vanilla'` server-side — the loader
  picker is hidden in the UI for Bedrock.

### Notes

- If you pick a combination Forge / Fabric doesn't ship for the chosen
  Minecraft version yet, the container will land in `INSTALL_FAILED`.
  Pick a different combo and recreate the server.
- Migration 10 adds the `loader` column.

## v0.7.0 — 2026-05-27

Two-factor authentication (TOTP). Each user can secure their account
with a 6-digit code from any authenticator app (Google Authenticator,
Authy, 1Password, Bitwarden, ...), backed by single-use recovery codes
in case the phone is lost. Admins can reset another user's MFA when
both phone and codes are lost.

## v0.6.0 — 2026-05-27

Scheduled tasks: owners can now have Peregrine create backups
automatically on a recurring schedule (every hour / day / week), with
a "run now" button.

## v0.5.0 — 2026-05-27

Subusers + granular permissions. Owners can grant another existing
account access to one of their servers with a custom permission set;
the UI hides every action the viewer cannot perform.

## v0.4.0 — 2026-05-27

Backups + disk safety. Take, restore, download and delete snapshots
stored on the dedicated disk, with a 2 GiB / 5 % reserve.

## v0.3.0 — 2026-05-27

Detail-page architecture: list becomes pure navigation, every per-server
action moves into a dedicated detail page with tabs.

## v0.2.0 — 2026-05-27

User management: the admin creates accounts and shares single-use
invitation links. Login by username instead of email.

## v0.1.0 — 2026-05-22

The first release of the Peregrine MVP — a self-hostable game server
panel. Accounts, bilingual UI, Minecraft Java / Bedrock servers in
isolated Docker containers, live console, file manager, resource
limits, Caddy + UFW + fail2ban deployment.
