# Changelog

All notable changes to Peregrine are documented in this file.

## v0.6.0 — 2026-05-27

Scheduled tasks: owners can now have Peregrine create backups
automatically on a recurring schedule (every hour / day / week), with a
"run now" button to verify the setup without waiting.

### Added

- **Schedules tab** on every server detail page (owner-only). Create,
  edit, enable/disable inline, run now, delete. Each schedule has a
  human name and a simple recurrence (hourly / daily / weekly) — no
  cron expressions to learn.
- **Background worker** built into the panel. Wakes up every 60 s,
  picks up due schedules and runs them in sequence. Missed occurrences
  (panel was down for a while) are NOT replayed — the worker skips to
  the next slot, which avoids a flood of backups at start-up.
- **Disk-aware**: scheduled runs use the same preflight as manual
  backups. If the disk is too tight, the run is skipped (logged as
  `schedule.skipped` in the activity log) and the schedule remains
  enabled for the next slot.
- **Run-now button** triggers a schedule on demand — useful while
  setting up to confirm everything works.
- **Last-run / next-run timestamps** on each schedule row, so you can
  see at a glance when the panel last fired and when it will next.
- **Activity log** records `schedule.create`, `schedule.update`,
  `schedule.delete`, `schedule.run`, `schedule.skipped`,
  `schedule.failed`.
- **New REST endpoints** (owner-only):
  - `GET /api/servers/:id/schedules` — list
  - `POST /api/servers/:id/schedules` — create
  - `PATCH /api/servers/:id/schedules/:scheduleId` — update
  - `DELETE /api/servers/:id/schedules/:scheduleId` — delete
  - `POST /api/servers/:id/schedules/:scheduleId/run` — fire now

### Notes

- The only action supported by a schedule today is "create a backup".
  The schema and routes are general enough to add more (restart,
  arbitrary console commands, ...) in a future release without another
  migration.
- Migration 8 adds the `server_schedules` table.

## v0.5.0 — 2026-05-27

Subusers: grant another existing account access to one of your servers,
with a granular permission set. The UI hides every action the viewer
cannot perform, and the backend enforces the same rules with proper
ACL gates.

### Added

- **Server subusers** — owners can add an existing account to one of
  their servers by email, with a custom permission set. A new "Users"
  tab in the server detail page lets you add, edit, and remove them.
- **Granular permission model** (11 permissions, grouped by category):
  - Power: `control.start`, `control.stop`, `control.restart`
  - Console: `console.send`
  - Files: `files.write`, `files.delete`
  - Backups: `backups.create`, `backups.restore`, `backups.delete`,
    `backups.download`
  - Settings: `settings.rename`
- **Server deletion stays owner-only** — never grantable through the
  subuser system.
- **UI mirrors the permissions** — buttons, forms, command input and
  upload zones the viewer cannot use are hidden (or disabled with a
  tooltip).
- **Dashboard "shared by" hint** — servers that aren't yours are tagged
  with the owner's username.
- **Activity log** records `subuser.add` / `update` / `remove`.

### Changed

- `GET /api/servers/:id` now returns `myPermissions`.
- `GET /api/servers` includes servers shared with the viewer, each
  carrying `isOwner` and `ownerUsername`.
- The console socket checks `console.send` before relaying a command.

## v0.4.0 — 2026-05-27

Backups: take, restore, download and delete snapshots of a server's
files, stored on the dedicated disk, with a safety reserve that prevents
a runaway server from filling the disk.

### Added

- **Backups tab** in the server detail page. Create, list, download,
  restore, delete.
- **Storage on the dedicated disk** at
  `${BACKUPS_PATH}/<server-id>/<backup-id>.tar.gz`.
- **Per-server cap** — 5 backups by default, oldest pruned on overflow.
- **Disk-usage indicator** in the Backups tab.
- **Safety reserve** — refuses writes that would push the disk below
  max(2 GiB, 5 %), returning HTTP 507 with a clear message.
- New `GET /api/disk` endpoint and full backup CRUD under
  `/api/servers/:id/backups`.

### Changed

- **Restore is blocked while the server is running** (409 server-side,
  disabled button + tooltip in the UI).
- **Deleting a server now wipes its backup folder on disk** too.

## v0.3.0 — 2026-05-27

Detail-page architecture: list becomes pure navigation, every per-server
action moves into a dedicated detail page with tabs.

### Added

- **Server detail page** at `/servers/<id>` with tabs Console, Files,
  Network, Settings, Activity.
- **Server name renaming** via `PATCH /api/servers/:id`.
- **Activity tab** — chronological log of server events (new
  `server_activity` table).

### Changed

- **List rows are clickable** (no inline action buttons).
- **Delete is blocked while running** (409 + disabled UI).

## v0.2.0 — 2026-05-27

User management: the admin creates accounts and shares single-use
invitation links so users pick their own password.

### Added

- Account creation by the admin, invitation links, server isolation
  per account, full administration view with all-users + all-servers.

### Changed

- **Login by username** (case-insensitive), not email.

## v0.1.0 — 2026-05-22

The first release of the Peregrine MVP — a self-hostable game server
panel. Accounts, bilingual UI, Minecraft Java / Bedrock servers in
isolated Docker containers, live console, file manager, resource
limits, Caddy + UFW + fail2ban deployment.
