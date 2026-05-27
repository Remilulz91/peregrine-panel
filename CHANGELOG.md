# Changelog

All notable changes to Peregrine are documented in this file.

## v0.5.0 — 2026-05-27

Subusers: grant another existing account access to one of your servers,
with a granular permission set. The UI hides every action the viewer
cannot perform, and the backend enforces the same rules with proper
ACL gates.

### Added

- **Server subusers** — owners can add an existing account to one of
  their servers by email, with a custom permission set. A new "Users"
  tab in the server detail page lets you add, edit, and remove them.
  Subusers see the server in their dashboard immediately; no email or
  invite link is needed (the account must already exist).
- **Granular permission model** (11 permissions, grouped by category):
  - Power: `control.start`, `control.stop`, `control.restart`
  - Console: `console.send`
  - Files: `files.write`, `files.delete`
  - Backups: `backups.create`, `backups.restore`, `backups.delete`,
    `backups.download`
  - Settings: `settings.rename`
- **Server deletion stays owner-only** — it cannot be granted through
  the subuser system, ever. Same for managing the subuser list itself
  (no privilege escalation).
- **UI mirrors the permissions** — buttons, forms, command input and
  upload zones the viewer cannot use are hidden (or disabled with a
  tooltip) rather than failing with a 403 after the click. Sees the
  Subusers tab only as the owner / an admin.
- **Dashboard "shared by" hint** — servers that aren't yours are tagged
  with the owner's username in the list subtitle.
- **Activity log** records `subuser.add`, `subuser.update`,
  `subuser.remove`.
- **New REST endpoints** (owner-only):
  - `GET /api/servers/:id/subusers` — list + available permissions
  - `POST /api/servers/:id/subusers` — add by email + permissions
  - `PATCH /api/servers/:id/subusers/:subId` — update permissions
  - `DELETE /api/servers/:id/subusers/:subId` — remove

### Changed

- **`GET /api/servers/:id` now returns `myPermissions`** — the array
  of permissions the viewer holds on the server, used by the UI to
  decide which controls to render.
- **`GET /api/servers`** now also lists servers shared with the
  viewer (previously only owned servers were returned). Each row
  carries `isOwner` and `ownerUsername` so the dashboard can tag
  shared rows.
- **The console socket** checks `console.send` before relaying a
  command, on top of the visibility check.
- The shared `lib/acl.ts` factors the visibility and permission checks
  used across the server, files, backups and console routes.

### Notes

- Subusers cannot manage other subusers — that requires being the
  server's owner (or an administrator). This is enforced both on the
  routes and in the UI (the tab is hidden).
- Migration 7 adds the `server_subusers` table with a UNIQUE
  (server_id, user_id) constraint and cascading deletes, so removing
  a user or a server tidies up automatically.

## v0.4.0 — 2026-05-27

Backups: take, restore, download and delete snapshots of a server's
files, stored on the dedicated disk, with a safety reserve that prevents
a runaway server from filling the disk and crashing every other server.

### Added

- **Backups tab** in the server detail page. Create a backup (optional
  custom name), list existing backups, download the .tar.gz archive,
  restore a backup, or delete one.
- **Storage on the dedicated disk** — archives live at
  `${BACKUPS_PATH}/<server-id>/<backup-id>.tar.gz`. By default
  `BACKUPS_PATH` is a sibling of `SERVERS_PATH`, so a single mount holds
  both. A new bind mount in `docker-compose.yml` exposes it to the
  Peregrine container.
- **Per-server cap** — up to 5 backups per server (configurable in the
  source). Creating a 6th prunes the oldest automatically.
- **Disk-usage indicator** — a compact bar in the Backups tab shows
  used / reserved / free space on the dedicated disk.
- **Safety reserve** — Peregrine refuses to write a new server or a
  new backup if doing so would push the free space below the larger of
  2 GiB or 5 % of the disk. The API returns HTTP 507 with a clear
  message; the UI shows it inline.
- **New REST endpoints**:
  - `GET /api/disk` — current disk usage of the dedicated disk
  - `GET /api/servers/:id/backups` — list backups (with the cap)
  - `POST /api/servers/:id/backups` — create a backup
  - `DELETE /api/servers/:id/backups/:backupId` — delete one
  - `POST /api/servers/:id/backups/:backupId/restore` — restore one
  - `GET /api/servers/:id/backups/:backupId/download` — stream the
    archive
- **Activity events** — backup create / restore / delete are recorded
  in the activity log.

### Changed

- **Restore is blocked while the server is running** (refused with HTTP
  409 server-side, and the button is disabled with a tooltip in the UI).
  Restoring over a live container would corrupt the running game.
- **Deleting a server now also wipes its backup folder on disk** (the
  DB rows already cascaded).
- **install.sh** creates `/srv/peregrine/backups` next to
  `/srv/peregrine/servers`.

## v0.3.0 — 2026-05-27

A Pterodactyl-style detail-page architecture: the server list becomes
pure navigation, and every per-server action moves into a dedicated
detail page with tabs.

### Added

- **Server detail page** at `/servers/<id>`. Clicking a row in the list
  opens it. A small in-app router handles back/forward without any
  external dependency.
- **Tabs**: Console, Files, Network, Settings, Activity. Switching tabs
  updates the URL (e.g. `/servers/<id>/files`) so each tab can be
  bookmarked or shared.
- **Network** tab — the host, port, protocol and a copy-paste-ready
  `host:port` connection string.
- **Settings** tab — rename the server, and a "Danger zone" with the
  Delete button.
- **Activity** tab — chronological log of what happened on the server:
  power actions (start / stop / restart), renames, file edits, file
  deletes, file uploads. New SQLite migration adds the
  `server_activity` table.
- **Server name renaming** via `PATCH /api/servers/:id`.

### Changed

- **List rows are now clickable**. No more inline action buttons on the
  list — every action lives in the detail page. The list is purely a
  navigation surface, easier to scan when you have many servers.
- **Delete is blocked while the server is running** (both in the UI,
  with a disabled button + tooltip, and on the backend with a 409
  response). You must stop the server before removing it.
- The console and the file manager moved out of modal dialogs into
  full-page tabs inside the detail page.
- The Stop button on the detail page is styled as a destructive action
  (red border) to match the gravity of the action.

### Removed

- `ConsoleDialog` and `FilesDialog` components — replaced by their
  full-page equivalents in the detail page.

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
