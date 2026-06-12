# Changelog

All notable changes to Peregrine are documented in this file.

## v0.29.1 — 2026-06-12

### Fixed

- **Brief Console flash when switching tabs.** The
  server-detail page used to fall back to the Console tab via
  `visibleTabs.find(...) ?? 'console'` during transient
  re-renders (typically while the 4-second polling refresh
  was in flight). That caused a 1-frame flash of `ConsolePage`
  (with LiveStats and the server-state badge) before the new
  tab settled. Two changes together fix this:
  - The render switch now reads `tab` directly instead of
    `safeTab`. The router already validates `tab` against the
    `ServerTab` enum at parse time, so the fallback was
    redundant and only added a failure mode.
  - The tab content wrapper gets `key={tab}`, forcing React
    to fully unmount the previous tab component before
    mounting the new one — no leftover state, no diff
    confusion between e.g. `SchedulesPage` and `ConsolePage`.

### Notes

- Pure frontend change, no backend touch, no database migration.

## v0.29.0 — 2026-06-11

### Added

- **Whitelist / Operators / Banned players / Banned IPs**
  management on the Game tab (Java only). Below the existing
  Game settings form, a new "Player access control" section
  with 4 internal tabs lets you read and edit each of the
  four `*.json` files that Minecraft uses for access control,
  without ever touching the file manager.
- New permission `players.manage` (assignable to subusers via
  the Users tab) gates every modification. Reading the lists
  is allowed for any account that can see the server.

### How it works

- Reads parse the on-disk JSON files (`whitelist.json`,
  `ops.json`, `banned-players.json`, `banned-ips.json`), so
  you can view the lists even when the server is offline.
- Writes go through RCON (`whitelist add`, `op`, `ban`,
  `pardon`, ...) so Minecraft resolves the player name to a
  UUID via Mojang, applies the change live and rewrites the
  JSON file for us. The server must therefore be RUNNING for
  modifications — the route returns 409 with a clear message
  otherwise and the UI surfaces it inline.
- 12 new REST routes under `/api/servers/:id/access/{kind}`:
  `GET` lists, `POST` adds, `DELETE` removes.

### Notes

- Pure addition, no breaking changes, no database migration.
- Bedrock servers are intentionally not supported (they use
  `allowlist.json` with a different schema). The routes
  return 501 for non-Java templates.
- All modifications are logged in the per-server activity
  feed (`server.whitelist_add`, `server.player_ban`, ...).

## v0.28.0 — 2026-06-11

### Added

- **Live host overview on the Dashboard** (admins only). A new
  card sits above the server list and refreshes every 5 s,
  showing the host's current CPU usage (%), RAM usage
  (used / total) and disk usage on the data volume. Each
  metric is rendered as a coloured progress bar — green up to
  75 %, amber from 75 % to 90 %, red beyond 90 % — so a
  saturated machine is instantly visible.
- Load average (1 / 5 / 15 min) is shown in the card header
  for users who want a deeper read of how the machine is
  holding up.

### Backend changes

- `lib/host.ts` gains `getHostMetrics()` which computes CPU %
  from two `os.cpus()` snapshots 200 ms apart, reads
  `/proc/meminfo` for an accurate available-memory figure
  (with `os.freemem()` fallback for non-Linux dev), and reuses
  the existing `getDiskUsage()` helper for the data volume.
- New route `GET /api/host/metrics` (the existing `GET /api/host`
  is unchanged — it still returns the allocation snapshot used
  by the create-server preflight).

### Notes

- The metrics route is admin-only by virtue of the Dashboard
  widget being mounted behind `isAdmin`. The API itself only
  checks the user is authenticated, so a non-admin who knows
  the URL can still poll it. We may tighten this to
  admin-only at the API level in a future release if needed.
- Pure addition, no breaking changes, no database migration.

## v0.27.0 — 2026-06-11

### Changed

- **Wider main layout.** The Dashboard and the server-detail
  page now use `max-w-screen-2xl` (1536px) instead of
  `max-w-5xl` (1024px) — 50% more horizontal real estate on
  wide screens. The Account settings page is kept narrower
  since it's a single small form.
- **Slightly larger base font** (16px → 17px on `html`). All
  Tailwind utility classes are rem-based, so the whole UI
  scales up by ~6% — noticeable on small laptops without
  breaking the layout on big screens.

### Notes

- Pure CSS/Tailwind changes, no backend touch, no database
  migration.
- The server cards now have more breathing room on wide
  screens, and labels (PORT, MÉMOIRE, CPU, status badges) are
  easier to read on 13–14" laptops.

## v0.26.0 — 2026-06-11

### Added

- **Single active session per user.** A user can now only be
  logged in on one device at a time. When you sign in from a
  second browser/machine, the previous device's cookie becomes
  invalid on its next request (HTTP 401 with code
  `auth.session_kicked`), and the panel automatically swaps to
  the Login screen with the explanation:
  *"Your session was ended because your account signed in on
  another device. Please sign in again."*
  Same behaviour for both administrators and regular users.

### How it works

- **Migration 15** adds a `session_id` column to the `users`
  table (random 32-char hex per row).
- The JWT cookie now embeds a `sid` claim. The backend
  `authenticate` and `authenticateAdmin` guards verify `sid`
  matches the user's current `session_id` in the database on
  every request.
- `session_id` is rotated on every successful login, setup,
  invite acceptance, MFA verification, and logout.

### Notes

- **No effect on multiple tabs of the same browser.** Tabs in
  the same browser profile share the cookie, so they all carry
  the same `sid` and continue to work in parallel.
- **No effect on backups, schedules, SFTP, or game container
  control.** Only HTTP authentication is touched. SFTP keeps
  using its own credentials path.
- Any active session is automatically migrated on first run:
  the migration populates each existing user's `session_id`
  with a fresh random value, and Peregrine remains usable
  without forcing a logout — the first authenticated request
  from your existing cookie will fail once and your browser
  will re-sign-in. (If you prefer, log out and back in once
  manually after the upgrade.)

## v0.25.0 — 2026-06-11

### Changed

- **Fresh tab sessions now land on the Dashboard.** When you close
  the panel on, say, `/servers/abc/console` and reopen the browser
  later, your navigator restores that URL — we now intercept that
  on first mount and redirect to `/`. F5 in the same tab keeps you
  on the current page (we use `sessionStorage`, which persists
  across refreshes but is wiped when the tab is closed).
- The `/invite/<token>` route is exempt from the redirect, since
  it's a public link the user is explicitly meant to land on.

### Notes

- Pure frontend change, no backend touch, no database migration.
- The behaviour only affects the very first mount of a tab. Once
  you're inside the panel, in-page navigation works exactly as
  before — clicking a server, switching tabs, opening Account,
  etc.

## v0.24.0 — 2026-06-11

### Added

- **NeoForge** is now available alongside Vanilla / Paper / Fabric /
  Forge in the loader dropdown when creating a Minecraft Java
  server. NeoForge is the community-maintained fork of Forge,
  supported by the `itzg/minecraft-server` image via
  `TYPE=NEOFORGE`. Pick it the same way you'd pick Forge — the
  Minecraft version selector and JAVA_VERSION work identically.

### Notes

- No database migration. The `loader` column already accepts any
  string; only the validation enum and the UI list were extended.
- Existing Vanilla / Paper / Fabric / Forge servers are
  unaffected.
- The hint under the loader picker has been updated to mention
  NeoForge in both English and French.

## v0.23.1 — 2026-06-06

### Fixed

- **Critical follow-up to v0.23.0**. Fastify is now started with
  `trustProxy: true`, so `request.ip` reflects the real client IP
  from `X-Forwarded-For` instead of the local socket address.
  Without this, every request behind Caddy / Nginx / Traefik would
  appear to come from `127.0.0.1` and a single brute-force burst
  would consume the rate-limiter's budget for ALL users at once.
  Set `TRUST_PROXY=false` in `.env` to opt out (e.g. when exposing
  the panel directly on a hostile network without a proxy).

## v0.23.0 — 2026-06-06

### Security

- **Login rate-limiter** on `/api/auth/login` and
  `/api/auth/mfa/verify`. Each remote IP is allowed 5 failed
  attempts per minute, after which the endpoint replies with HTTP
  429 and a `Retry-After` header for one minute. Successful
  logins clear the IP's budget so legitimate retries from the same
  network are not penalised. The limiter lives in process memory,
  has no external dependency, and adds zero ops burden.
- **SFTP brute-force throttle**. The built-in SFTP server now
  blocks an IP for 15 minutes after 5 failed authentications in a
  15-minute window, mirroring fail2ban behaviour for the panel's
  port 2022. Successful logins clear the bucket. Wrong-key
  attempts that never reach the password step are also tracked.
- **Auth event log** (new table `auth_events`, migration 14)
  records every login attempt, success or failure, with the kind
  of event (`auth.login`, `auth.login_failed`, `auth.mfa_failed`,
  `auth.login_rate_limited`, `auth.sftp_login`,
  `auth.sftp_failed`, `auth.sftp_rate_limited`, `auth.logout`,
  `auth.login_mfa`), the user id (if known), the username typed,
  and the remote IP. Lets an admin audit who tried to log in and
  confirm the rate-limiter caught a brute-force burst before any
  damage. Queryable directly via SQL on the SQLite database; a
  UI listing is planned for a future release.

### Notes

- **No breaking changes.** All existing flows behave exactly as
  before for legitimate users; only attackers see the new 429
  responses. No new dependency was added; the limiter is a
  ~100-line in-house helper (`backend/src/lib/rateLimit.ts`) that
  uses a `Map<key, attempts[]>` in process memory.
- **Reverse-proxy support**: Fastify is now started with
  `trustProxy: true` so `request.ip` reflects the real client IP
  from `X-Forwarded-For` (set automatically by Caddy / Nginx /
  Traefik). Without this, every request would look like it came
  from `127.0.0.1` and one bad client could lock out the whole
  panel. To opt out (e.g. when exposing Peregrine directly on a
  hostile network with no proxy), set `TRUST_PROXY=false` in
  your `.env`.
- **Multi-instance deployments** behind a load balancer: each
  replica has its own counter, so the effective limit is 5 ×
  number of replicas per IP per minute. Still far better than no
  limit at all, but planned for hardening once Peregrine officially
  supports horizontal scaling.

## v0.22.5 — 2026-06-06

### Changed

- **Pre-restart in-game broadcasts are now bilingual** (English /
  French) instead of French-only. Players see e.g.
  `[Peregrine] Server restart in 10 minutes / Redémarrage dans 10
  minutes`. Length stays well under Minecraft's 256-char chat
  limit and covers both audiences without any configuration.

### Added

- **TZ propagation to new Minecraft containers**. When `TZ` is
  set on the panel (recommended after v0.22.4), the same value is
  now forwarded as a container env var when Peregrine creates a
  new game server. Minecraft's own logs will then use the
  operator's local clock instead of UTC.

### Notes

- **Existing game containers are unaffected** — Docker doesn't
  allow changing env vars on existing containers. To get the new
  TZ on an already-running server, delete + recreate it via the
  panel. For day-to-day timestamps that's purely cosmetic
  (schedule timing is driven by the panel's TZ, not the game
  container's), so most users can ignore this.

## v0.22.4 — 2026-06-06

Documentation-only release.

### Added

- **`TZ` env var** documented in `.env.example`, wired through
  `docker-compose.yml` with the `${TZ:-UTC}` default, and a new
  **Timezone for scheduled tasks** section in the README. By
  default the panel container runs in UTC, which is a footgun for
  European users — a "backup at 04:00" schedule actually fires at
  04:00 UTC = 06:00 CEST in summer. Setting `TZ=Europe/Paris` (or
  any IANA timezone) in `.env` makes schedule times match the
  operator's local clock.

### Notes

- After changing `TZ`, recreate the container with
  `docker compose up -d` and edit (or toggle Enabled off/on) each
  existing schedule so its `next_run_at` is recomputed.
- No code change — the schedule worker already uses Node's local
  TZ (which Docker derives from the `TZ` env var). This release
  just makes that switch visible and easy to set.

## v0.22.3 — 2026-06-05

### Fixed

- **RCON authentication failed on imported servers** — itzg
  generates a random `RCON_PASSWORD` env var at container creation
  and stores the same value in `server.properties`. When the user
  imports an existing server (uploads their old `server.properties`
  via SFTP), Minecraft starts using the imported password while
  `rcon-cli` keeps using itzg's random env var → mismatch → every
  `say` / `list` call returns `rcon: authentication failed`. The
  player list widget then shows `0 / 0 online` forever, and
  scheduled-restart in-game warnings never reach the players.

  The fix: `sendConsoleCommand()` now reads `rcon.password` from
  the server's own `server.properties` at every call and passes it
  explicitly to `rcon-cli --password "..."`. Whatever password
  Minecraft is actually accepting, that's what we send — no more
  env-var-vs-file drift.

### Added

- **`readRconPassword(serverId)`** helper in `lib/properties.ts`,
  reuses the existing properties parser. Returns `null` when the
  file is missing or the key is absent; in that case `rcon-cli`
  falls back to its default behaviour (RCON_PASSWORD env var) so
  fresh installs keep working out of the box.
- The three RCON callers (`realtime/console.ts`,
  `routes/players.ts`, `services/scheduleWorker.ts`) now read the
  password via the helper and pass it through.

### Notes

- No migration needed — the fix is purely on the read path.
- Restart your panel after pulling so the new code is loaded.
  The Minecraft container itself doesn't need to restart.
- This also unblocks the **player list widget** (v0.16.0+) on
  imported servers, the **Game tab** for servers with non-default
  RCON passwords, and the **pre-restart broadcast** sequence
  (v0.22.1+).

## v0.22.2 — 2026-06-05

### Fixed

- **Editing a schedule silently did nothing** — `updateSchedule()`
  in `lib/schedules.ts` had a SQL placeholder count that didn't
  match the positional arguments passed to `.run()`. The UPDATE
  statement had 9 SET placeholders + 1 WHERE = 10, but `.run()`
  only passed 9 values, so:
  - `warning_minutes` received the next_run ISO timestamp (cast to
    its default 0 by SQLite)
  - `next_run_at` received the row id (a UUID string)
  - `WHERE id = ?` received `undefined` → matched no rows → the
    UPDATE was a silent no-op

  Concretely: edit a schedule, change the action / warning lead
  time / any field, click Save — the UI seemed to save but the row
  was untouched on the next read. Visible symptom: reopen the
  edit dialog and the previous value is back.

  The bug was introduced when `action` was added in v0.22.0 (the
  Python patch script that edited the file added a placeholder but
  forgot the matching `.run()` argument) and amplified when
  `warning_minutes` was added in v0.22.1. The `.run()` arguments
  now match the placeholder count exactly (10 / 10).

- **Backup → Restart conversion via edit was broken** for the same
  reason. Existing backup schedules can now be turned into restart
  schedules by editing them.

### Notes

- Creating a brand-new schedule (POST) was unaffected — that
  INSERT path always had the right column / value count. Only the
  PATCH path was broken.

## v0.22.1 — 2026-06-05

Scheduled restarts (v0.22.0) can now **warn players in-game**
before pulling the plug — essential when day-and-night-shift
players share a server.

### Added

- **`warningMinutes` field on every schedule** (default `0`),
  configurable from 0 to 30. Only meaningful for `server.restart`
  schedules — backups never need a heads-up.
- **Migration 13** adds `warning_minutes INTEGER NOT NULL DEFAULT 0`
  on `server_schedules`. Existing schedules keep their previous
  behaviour (immediate restart).
- **Pre-restart broadcast sequence** when `warningMinutes > 0`:
  - **T-warningMinutes**: `say [Peregrine] Redémarrage dans N
    minutes`
  - **T-1 min**: `say [Peregrine] Redémarrage dans 1 minute`
  - **T-30 s**: `say [Peregrine] Redémarrage dans 30 secondes`
  - **T-10 s**: `say [Peregrine] Redémarrage dans 10 secondes`
  - **T-0**: `restartContainer` Docker
  Each broadcast goes through the existing `sendConsoleCommand`
  (RCON `say`). A failed broadcast (RCON down) is swallowed; the
  restart still fires.
- **Frontend dialog** picks up a new "Pre-restart warning
  (minutes)" input that only appears when the **server.restart**
  action is selected. Defaults to 5 minutes on new restart
  schedules.
- **`schedule.warningMinutes` field** exposed by the GET/POST/PATCH
  `/api/servers/:id/schedules` routes.

### Notes

- The broadcast runs as a **detached async task** so the worker
  loop isn't blocked during the warning window. Other schedules
  fire normally even while a 5-minute restart countdown is in
  progress.
- The actual restart happens at **the schedule's time + warning
  window**. Setting a 05:00 schedule with `warningMinutes=5` means
  the broadcast starts at 05:00 and the container restarts around
  05:05. (Think of the schedule time as "when the heads-up
  begins".)
- Messages are in **French** for now (Peregrine's main audience).
  Bilingual or per-schedule language could be added in a future
  release if needed.

## v0.22.0 — 2026-06-05

Scheduled tasks (v0.6.0) used to only support automatic backups.
They now also support **automatic restarts** — handy for long-
running modded Java servers where the JVM heap drifts upward over
days. Set a weekly "Sunday 5 AM restart" and your server stays
fresh.

### Added

- **New scheduled action `server.restart`** alongside the existing
  `backup.create`. The scheduleWorker dispatches on the action
  type, calls `restartContainer` for restart schedules, and writes
  an activity entry (`schedule.run` on success, `schedule.failed`
  on Docker error, `schedule.skipped` if the server was offline at
  fire time — a restart schedule deliberately does NOT auto-start
  a stopped server).
- **Action picker in the schedule create / edit dialog** — a new
  dropdown sits between Name and Frequency: "Take a backup" or
  "Restart the server" (FR: "Faire une sauvegarde" / "Redémarrer le
  serveur"). The action is preserved when toggling enabled on/off
  from the list.
- **Action column in the schedules table** so you can tell at a
  glance which schedules do what.
- **Backend helpers**: `isScheduleAction()` type guard,
  `ScheduleAction` union widened, `createSchedule` / `updateSchedule`
  both accept `action`. The DB column already existed (it's been
  `action TEXT NOT NULL DEFAULT 'backup.create'` since migration 8)
  so no migration is needed.

### Notes

- Existing backup schedules keep working unchanged — the default
  on `action` is still `'backup.create'`, so older rows are
  treated identically to before.
- A scheduled restart skips silently if the server is currently
  OFFLINE. The intent of a "weekly restart" is to keep a running
  24/7 server healthy, not to bring a stopped one back up.
- No in-game warning ("Server restarting in 1 minute") yet — if
  you want it, run a manual `say Restart in 1 minute` from the
  Console tab before the scheduled time, or wait for a future
  release that adds a notify-before grace window.

## v0.21.0 — 2026-06-05

Live container stats on the Console tab — Pterodactyl-style
sidebar so you can see at a glance whether the server is
healthy or struggling.

### Added

- **Backend `lib/dockerStats.ts`** — wraps Docker's
  `container.stats({ stream: true })` API, parses each frame,
  and exposes `streamContainerStats(containerId, onTick,
  onError)` that yields `{ cpuPercent, memoryBytes,
  memoryLimitBytes, memoryPercent, uptimeSeconds, ts }` roughly
  once per second. CPU is computed as % of host cores (matching
  `docker stats`), memory excludes the page cache (itzg fills it
  with world data, counting it would make the widget useless).
- **Socket.IO `stats:subscribe` / `stats:tick` / `stats:unsubscribe`**
  events wired into the existing realtime channel. Same JWT-cookie
  auth and ACL check as the console — subusers see live stats
  for any server they can read, owners and admins for theirs.
- **Frontend `LiveStats` component** mounted in a sidebar to the
  right of the Console widget. Three stat boxes (CPU%, Memory
  used/limit + %, Uptime) and two mini SVG sparklines for the
  last 60 seconds (CPU + Memory). On screens narrower than
  `lg` the sidebar stacks below the console.
- **"Offline" state** — when the server is not `RUNNING`, the
  widgets show the localised "Offline" label and no streaming
  happens. As soon as the server boots, the subscribe kicks in
  and the graphs start drawing.

### Notes

- CPU% is shown as **fraction of allocated cores**, not host
  cores. A container with `cpuLimit=2` running at 100% reports
  `100.0%`, not `200%`. This is more intuitive when the user
  knows they paid for 2 cores.
- The stats stream is opened **once per browser tab**, so
  multiple users watching the same server each open their own
  Docker stats stream. If that becomes a load issue on hosts
  with many concurrent operators, a future release can
  multiplex.
- The Console tab continues to also poll the player list every
  30 s (v0.16.0) — both are independent. The Game tab and the
  rest of the UI are unchanged.

## v0.20.1 — 2026-06-05

### Fixed

- **The Game tab silently hid typos in `server.properties`** —
  hand-editing the file via the Files tab and typing
  `difficulty=normals` (or any other invalid value) made the Game
  tab show `easy` (the default), with no hint that anything was
  wrong. If the user then saved the Game tab without noticing, the
  typo was overwritten silently and the intent was lost.

  `readGameSettings` now records a **warning** for every value it
  had to reject (`not_in_enum`, `not_a_boolean`, `not_an_integer`,
  `out_of_range`), the route forwards them on GET, and the Game tab
  renders an **amber banner** above the form listing every issue
  (key, raw value, fallback that's being shown). The user can then
  either fix the file via the Files tab, or pick the right value
  here and click Save to overwrite — saving clears the banner.

### Notes

- Saving the Game tab still **rewrites every managed key** with the
  values the form shows. That's intentional — it's the simplest
  "fix it for me" flow once the user has seen what was wrong. The
  warning banner makes sure the user knows what they're about to
  overwrite.

## v0.20.0 — 2026-06-05

Fixes a long-standing **ownership mismatch** in the built-in SFTP
server that broke server imports and could silently prevent
Minecraft from saving world chunks.

### Fixed

- **Files uploaded via SFTP were owned by `root:root` (UID 0) with
  `0755/0644` permissions**, while the itzg Minecraft image runs as
  UID 1000 and expects `1000:1000` with group-writable perms
  (`0775/0664`). The mismatch meant:
  - imported worlds couldn't be saved (silent `Permission denied`
    on chunk writes after the server boot)
  - some SFTP clients failed mid-transfer with a generic code 4
    when they tried to write into a subdir owned by root
  - mods stored in `mods/` worked at first boot but couldn't be
    updated by mods that write back to disk
  The SFTP server now calls `fchown(uid, gid)` and `fchmod(mode)`
  after every successful `OPEN` in write mode, and matching `chown`
  /`chmod` after every `MKDIR`, so the on-disk ownership matches
  what itzg expects out of the box.

### Added

- **`CONTAINER_UID`** (default `1000`), **`CONTAINER_GID`**
  (default `1000`), **`CONTAINER_FILE_MODE`** (default `0o664`)
  and **`CONTAINER_DIR_MODE`** (default `0o775`) env vars in
  `backend/src/config.ts` so non-itzg images that use a different
  UID/GID can be supported without code changes.
- **`[sftp]` log lines** on `OPEN`, `WRITE` and `MKDIR` failures
  (`console.warn`). They show up in `docker compose logs
  peregrine-panel` so operators can finally see what the SFTP
  server is doing when something goes wrong — previously these
  failures were invisible because they didn't go through the
  Fastify logger.

### Notes

- **Existing data is not auto-fixed.** Files already uploaded by
  previous versions still have the old `root:root / 0644` mode and
  may prevent the server from saving. Run this one-shot fix on
  your Debian host (replace `<id>` with the affected server's id):
  ```
  sudo chown -R 1000:1000 /chemin/vers/data/servers/<id>/
  sudo find /chemin/vers/data/servers/<id>/ -type d -exec chmod 775 {} \;
  sudo find /chemin/vers/data/servers/<id>/ -type f -exec chmod 664 {} \;
  ```
  New uploads from v0.20.0 onwards land with the right ownership
  automatically.
- `fchown` requires root inside the container. If you ever run the
  panel as a non-root user, the chown silently no-ops (`EPERM`)
  and you'll get the pre-v0.20.0 behaviour. The default Docker
  setup runs the panel as root, so this is a non-issue for
  standard installs.

## v0.19.2 — 2026-06-05

### Fixed

- **Version-validation error messages were hard-coded in English** —
  unlike the rest of the create-server dialog, the "unknown Minecraft
  Java version" / "invalid Bedrock version" / "Mojang manifest
  unreachable" messages were assembled on the backend as a single
  English string and forwarded as-is to the UI. They are now
  translated FR / EN like everything else.

### Changed

- The `validateVersion` function now returns a stable `code`
  (`version.empty`, `version.bedrock_shape`, `version.unknown_java`,
  `version.unknown_java_no_suggestion`, `version.unverifiable`) plus
  a `data` object (`raw`, `suggestion`) and an English `message`
  fallback. The POST `/api/servers` route forwards `code` + `data`
  alongside the legacy English `error` string, so non-UI consumers
  still get a sensible reason out of the box.
- The frontend picks the matching `create.versionError.*` i18n key
  and substitutes `{raw}` / `{suggestion}` so the user always sees a
  message in their language.

## v0.19.1 — 2026-06-05

Follow-ups to v0.19.0 based on real-world testing of the new
free-text create-server form.

### Fixed

- **Bedrock version picker caused a 404 download** — typing
  anything other than the latest version made itzg's Bedrock entry
  point try to fetch a URL Microsoft no longer serves, which left
  the server in `INSTALL_FAILED`. The version field is now hidden
  entirely on Bedrock; switching the game from Java to Bedrock
  also silently snaps the version to `LATEST`.
- **All errors looked like "Not enough RAM / CPU on the host"** —
  the version check ran *after* the disk and host-resources checks,
  so a typo in the version field was masked by the host preflight's
  message. Version is now validated *first*, before disk and host,
  so the user sees the actual cause.
- **CPU errors showed "Bad Request" instead of a useful message**
  — Fastify's built-in validation handler returns
  `{ error: "Bad Request", message: "<detail>" }`, but the API
  client was reading `error` and discarding the detail. It now
  prefers `message` whenever `error` is one of Fastify's generic
  labels (Bad Request, Unauthorized, Forbidden, Not Found,
  Conflict, etc.), so the user sees what was actually wrong.
- **Browser "Please enter a valid value" tooltip on Memory / CPU**
  — the `step=256` / `step=0.5` attributes triggered the native
  HTML5 step validation when the user typed any number off the
  step. The inputs now use `step="any"` so the browser stays
  quiet and the backend's host-resources preflight is the only
  source of truth.

## v0.19.0 — 2026-05-31

The Version, Memory and CPU pickers in the create-server dialog
were dropdowns with a tiny preset list. They're now **free-text
inputs** with proper validation — type the value you want and the
backend tells you specifically what's wrong if it isn't acceptable.

### Changed

- **Version field** — was a dropdown of ~10 hard-coded entries
  ("LATEST", "1.21.4", etc.); is now a text input that accepts:
  - the magic keywords `LATEST` and `SNAPSHOT` (passed straight to
    itzg's entrypoint)
  - any Minecraft Java version that appears in **Mojang's official
    version manifest** (e.g. `1.21.4`, `1.20.6`, `24w14a`)
  - any `X.Y.Z(.W)` shape for Bedrock servers (Microsoft has no
    public manifest to check against)
- **Memory field** — was a dropdown of `1 / 2 / 4 / 8 GB`; is now
  a number input in MiB, validated against the host's available
  RAM (the existing host-resources preflight enforces the ceiling).
  Sub-1 GB allocations are now possible (min 512 MiB), so small VPS
  can host more servers.
- **CPU field** — was a dropdown of `0.5 / 1 / 2 / 4` cores; is
  now a number input with 0.5 step, validated against the host's
  available cores.
- **Helper text under each numeric field** shows the host's
  current allocatable RAM and CPU so you know the ceiling before
  you submit.

### Added

- **Backend `lib/minecraftVersions.ts`** — fetches Mojang's
  manifest at `https://launchermeta.mojang.com/mc/game/version_manifest.json`,
  caches it for 24 h, and exposes `validateVersion({ kind, loader,
  version })`. Concurrent callers share an in-flight promise so the
  manifest is fetched at most once per refresh window.
- **Graceful Mojang fallback** — if the manifest can't be fetched
  (DNS hiccup, Mojang outage) and we have no cached copy, the
  validator falls back to a loose shape check so server creation
  isn't blocked. The error message tells the user we couldn't
  verify with Mojang.
- **Targeted error messages**:
  - `"abc" is not a known Minecraft Java version. Try "1.21.4" or "LATEST".`
  - `"1.20" is not a valid Bedrock version. Expected something like "1.20.81.01".`
  - The existing host-resources error already says how much RAM /
    CPU is actually available; the new helper text mirrors it so the
    user knows before submitting.

### Notes

- The server's JSON-schema bounds were widened (`memoryMb` up to
  524 288 MiB, `cpuLimit` up to 256) so the **host-resources
  preflight** is the source of truth for "too much for this
  machine", with a clear error message, instead of a generic
  "value must be ≤ 16384" rejection.

## v0.18.1 — 2026-05-31

### Fixed

- **Game tab label was left in English in the French UI** — the
  `Game` tab now reads `Jeu` in French, in line with every other
  tab (`Console`, `Fichiers`, `Réseau`, `Sauvegardes`, …). The
  English label is unchanged.

## v0.18.0 — 2026-05-31

A new **Game** tab in the server panel lets owners edit the most
common Minecraft `server.properties` keys from the web UI, in the
spirit of Pterodactyl's Startup / Settings split.

### Added

- **Backend `lib/properties.ts`** — parses and serialises
  `server.properties` while preserving original line order and
  comments. Only the eight managed keys are rewritten; anything else
  the user added by hand (or that a plugin wrote) is left intact.
- **`GET /api/servers/:id/game-settings`** — returns the current
  values for `motd`, `max-players`, `gamemode`, `difficulty`, `pvp`,
  `online-mode`, `white-list`, `view-distance`. Returns the defaults
  when the file does not exist yet (fresh install).
- **`PUT /api/servers/:id/game-settings`** — overwrites those keys
  after server-side validation (enums, numeric ranges, MOTD length).
  Requires the `settings.rename` permission.
- **Java-only** — both routes return `501 Not Implemented` on
  Bedrock servers with a clear message. The Game tab in the UI
  shows the same notice instead of an empty form.
- **`OVERRIDE_SERVER_PROPERTIES=FALSE`** is now set on every new
  Java container, so user edits to `server.properties` survive a
  container restart instead of being overwritten by the itzg
  entrypoint from env-var defaults.
- **Frontend `Game` tab** — sits between Files and Network. Form
  with two-column layout for gamemode/difficulty/max-players/view-
  distance, MOTD on its own row, and grouped toggles for pvp,
  white-list and online-mode (with a security warning when online
  mode is turned off).
- **Activity log event**: `server.game_settings_updated` (records a
  short summary of the new state).

### Notes

- Changes take effect at the next server restart — this is shown
  inline next to the Save button and reiterated in the success
  banner after saving.
- Servers created on versions prior to v0.18.0 will keep
  overwriting `server.properties` on every restart (the env-var
  flag was set at container creation time, and Docker can't update
  envs on an existing container). For best results, recreate the
  server, or stop / re-pull / recreate the container via the host.

## v0.17.0 — 2026-05-31

Upload a per-server icon — a small visual identifier that replaces
the generic server glyph in the dashboard list, much like
Pterodactyl's server avatars.

### Added

- **`GET /api/servers/:id/icon`** — streams the PNG with
  `Cache-Control: public, max-age=86400`. The URL carries a `?v=`
  query string built from the file's `mtime` so the browser refreshes
  it as soon as the icon is re-uploaded.
- **`POST /api/servers/:id/icon`** — multipart upload. Accepts PNG
  only (magic-byte validated, not just the extension or MIME type),
  hard-capped at 256 KiB. Requires the `settings.rename` permission,
  the same gate as renaming or editing the description.
- **`DELETE /api/servers/:id/icon`** — removes the file. Same
  permission as upload.
- **`hasIcon` and `iconUpdatedAt`** added to the public server payload
  so the frontend can pick the right URL and bust the cache without
  an extra round-trip.
- **Icon section in the Settings tab** — preview + upload + remove
  buttons, with inline validation for type and size.
- **Icon on each ServerCard** — falls back to the generic glyph when
  no icon is set.
- **Activity log events**: `server.icon_set` and `server.icon_cleared`.
- **`ICONS_PATH` env var** (defaults to `./data/icons` in dev) — the
  filesystem location where icons are stored. Already covered by the
  existing Docker `data` volume.

### Notes

- Icons are stored on disk rather than in the database to keep the
  request path fast (the route can use `fs.createReadStream` straight
  to the response) and to avoid bloating the SQLite file. Cleanup is
  automatic — when a server is deleted, its icon is removed too.

## v0.16.1 — 2026-05-30

### Fixed

- **Player list parser was too lenient** and mis-parsed RCON
  connection errors during the first ~30 s of server boot. Symptoms
  on screen included a wrong "2026 / 5 en ligne" count (digits
  scraped from the error timestamp `2026/05/30 20:32 Failed to
  connect to RCON...`) and a green chip showing the connection-
  refused error as if it were a connected pseudo. The parser now
  explicitly recognises the standard "Failed to connect to RCON",
  "connection refused" and "Unable to connect" messages and returns
  a zero state for them, and the success regex requires the exact
  `There are X of a max of Y players online:` phrasing instead of a
  loose digit-pair match.

## v0.16.0 — 2026-05-29

Live player list on the Console tab — see at a glance who is
connected without having to type `list` in the console.

### Added

- **`GET /api/servers/:id/players`** endpoint that runs the `list`
  RCON command and returns `{ supported, running, online, max,
  players[] }`.
- **`PlayerList` component** mounted above the live console on the
  Console tab. Polls the endpoint every 30 seconds, shows
  `X / Y online` and a chip per connected pseudo (color: emerald).
  When the server is offline, shows a soft "start it to see who
  connects" hint instead.

### Notes

- **Java servers only.** Bedrock containers from itzg don't expose
  RCON, so the component returns `supported: false` and renders
  nothing for them — no error, no empty box.
- The output of the `list` command is parsed leniently to cope with
  small wording differences between vanilla, Paper, Fabric and Forge.

## v0.15.1 — 2026-05-29

### Changed

- **Create-server dialog reworked into a two-column landscape
  layout.** With every field accumulated over v0.13–v0.15 (name,
  description, owner, game, loader, version, memory, CPU, disk
  quota, autostart), the previous single-column dialog had become
  too tall and spilled off-screen. The dialog is now wider
  (`max-w-3xl`, ~768 px) and groups identity fields on the left
  (name, description, owner) and technical fields on the right
  (game, loader, version, memory/CPU, disk quota). The autostart
  checkbox + Cancel/Create buttons span the full width at the
  bottom.
- Falls back to a single-column stack below the `md` breakpoint
  (768 px) so phones and narrow windows stay usable.
- Adds a `max-h-[90vh] overflow-y-auto` safety so the dialog still
  scrolls cleanly on very small viewports.

## v0.15.0 — 2026-05-29

The biggest of the three Pterodactyl-inspired releases: per-server
disk quotas, with measured usage and hard enforcement.

### Added

- **Per-server disk quota** in MiB, set at creation time (admin) and
  editable from a new **Disk usage** section on the Settings tab.
  When the quota is exceeded:
  - the running container is hard-stopped on the next worker tick
    (60 s), with a `server.quota_exceeded` activity entry
  - subsequent `POST /api/servers/:id/start` calls return HTTP 409
    until the user frees space or the admin raises the quota
- **Live disk usage bar** in the Settings tab, color-coded green /
  amber / red depending on how close the server is to its limit.
  Refreshed by a background worker that walks each server's data
  folder via `du -sb` every minute and persists the result.
- **`backend/src/services/diskQuotaWorker.ts`** — boots alongside
  the schedule and SFTP workers in `index.ts`.
- **Migration 12** adds `disk_quota_mb` (nullable = unlimited) and
  `disk_used_mb` (default 0) columns to the `servers` table.
- **`PATCH /api/servers/:id`** accepts a `diskQuotaMb` field (admin-
  only, 0 = remove the quota). Logged as `server.quota`.

### Notes

- The eventual consistency window is up to 60 s — a server can
  briefly exceed its quota between two worker ticks. That's
  acceptable for the panel's threat model (protect against runaway
  worlds, not against tenants trying to fill the disk in seconds).
- `disk_used_mb` starts at 0 for existing servers until the first
  worker tick lands; the UI just shows 0 MiB / quota briefly.

## v0.14.0 — 2026-05-29

Small quality-of-life: the create-server dialog now auto-starts the
server right after the install completes, matching what Pterodactyl
does. No more "wait for status to flip then go click Start".

### Added

- **"Start the server right after installation"** checkbox in the
  create-server dialog, on by default. When checked, Peregrine
  calls `startContainer` automatically as soon as the install
  finishes, and records a `server.start` activity entry tagged
  "auto-start after install".
- **`POST /api/servers`** now accepts an `autostart: boolean` field
  (default `true`). Set to `false` to keep the server offline after
  the install.

### Notes

- If the auto-start fails (e.g. Docker daemon hiccup), the install
  is still marked as successful — the server stays in `OFFLINE`
  state and the failure is logged as `server.autostart_failed`. The
  user can simply hit Start manually from the panel.

## v0.13.0 — 2026-05-29

A small but useful organisational feature inspired by Pterodactyl:
per-server free-text descriptions.

### Added

- **Server description** — an optional free-text field (max 200
  characters) set when creating a server and editable later from the
  Settings tab. Shown in italics under the server name in the
  Dashboard list, so you can tell apart "Vanilla for friends" from
  "Test server" at a glance.
- **Migration 11** adds a nullable `description` column to the
  `servers` table. Applied automatically on first boot; existing
  servers come up with no description until you set one.
- **`PATCH /api/servers/:id`** accepts a `description` field. Same
  permission as rename (`settings.rename`).
- **Activity log entry** `server.describe` recorded when the
  description is changed (or cleared).

## v0.12.0 — 2026-05-29

**Breaking change** to the permissions model: server **creation** and
**deletion** are now restricted to administrators. Regular users can
still manage every aspect of the servers they own (start/stop,
console, files, backups, rename, resize, subusers, …) — they just
can't spin up new servers or delete existing ones. This brings the
hosting model closer to what shared-hosting panels (Pterodactyl,
Pelican, …) do.

### Changed

- **`POST /api/servers`** now returns HTTP 403 unless the caller has
  the `ADMIN` role. The route also accepts an optional `ownerId`
  field so an admin can create a server on behalf of any user.
- **`DELETE /api/servers/:id`** is administrator-only (HTTP 403
  otherwise). The previous "must be the owner" check is dropped —
  ownership no longer grants the right to destroy a server, only the
  right to manage it.
- **Create-server dialog** now includes an **Owner** dropdown listing
  every account (admin-only UI). Defaults to the calling admin.
- **Dashboard** hides the "Create server" button for non-admin
  users (it would 403 anyway).
- **Settings → Danger zone** shows the Delete button only to admins,
  with an updated French/English message.

### Notes for existing deployments

- Existing non-admin owners keep full management rights on their
  servers; the only thing they lose is the ability to delete them.
- The historical `settings.deleteOwnerOnly` i18n key was renamed to
  `settings.deleteAdminOnly`. If you forked the translations, update
  accordingly.
- No database migration is needed for this release.

## v0.11.0 — 2026-05-29

A small but useful quality-of-life feature: Peregrine now tells the
admin when a newer version is available on GitHub.

### Added

- **Update-available badge** in the header (admin-only). The panel
  checks the GitHub Releases API of the Peregrine repo once an hour
  and, when a newer tag is found, shows a small amber pill labelled
  *"Update available: vX.Y.Z"*. Clicking it opens the release notes
  in a new tab so the admin can review what changed before running
  `git pull && docker compose up -d --build`.
- **`GET /api/updates`** endpoint exposing the cached snapshot
  (`currentVersion`, `latestVersion`, `upToDate`, `releaseUrl`,
  `publishedAt`).
- **`backend/src/lib/version.ts`** centralises the running version so
  `routes/health.ts` and the update checker can't drift.

### Notes

- The check is **fail-quiet**: if GitHub is unreachable or
  rate-limited (60 req/h unauthenticated), the badge stays hidden
  rather than showing an error.
- The badge is **rendered only for admins**, since only admins can
  apply the update. Regular users see nothing.
- **No auto-update**: pulling and rebuilding stays a deliberate
  admin action so a broken release can't take the panel down
  silently.

## v0.10.3 — 2026-05-29

### Changed

- **Default host safety margin lowered** from `1024 MiB + 1 core` to
  `512 MiB + 0.5 core`. The new defaults are the realistic minimum
  for Debian + Docker + the Peregrine container + Caddy + fail2ban —
  small 2 GiB / 2 vCPU VPS now work out of the box without having
  to override anything in `.env`. Admins who want more breathing
  room can still raise the values via `RESERVED_MEM_MB` and
  `RESERVED_CPUS`.
- **Create-server dialog now offers a 0.5-core CPU option** in
  addition to 1 / 2 / 4. Useful on small hosts where reserving a
  full core for a game server is too much.

### Notes for upgraders

- If you set `RESERVED_MEM_MB=512` and `RESERVED_CPUS=0.5` in your
  `.env` for v0.10.2 to make Peregrine work on a small VPS, you can
  now delete those two lines: the new defaults match what you set.

## v0.10.2 — 2026-05-29

### Added

- **Configurable host safety margin** via two new env vars:
  `RESERVED_MEM_MB` (default 1024) and `RESERVED_CPUS` (default 1).
  Lower the defaults on small VPS where the 1 GiB / 1 core reserve
  ate too much of the available host. Example for a 2 vCPU / 2 GiB
  host:
  ```
  RESERVED_MEM_MB=512
  RESERVED_CPUS=0.5
  ```
- **Specific error message in the create-server dialog** when the
  refusal comes from the host-resources preflight (HTTP 507): the
  user now sees the exact RAM and CPU still allocatable, plus a hint
  about the new env vars, instead of the generic "Le serveur n'a pas
  pu être créé."

### Fixed

- Frontend now reads the structured error payload Peregrine attaches
  to 507 responses, instead of swallowing the error and showing a
  generic one.

## v0.10.1 — 2026-05-29

### Fixed

- **Live console no longer stays blank** when the user opens the
  Console tab while the server is stopped and then clicks Start.
  Console.tsx now (re-)subscribes to the logs stream every time
  `server.status` changes, instead of only once on mount. The root
  cause was Docker's `logs --follow` ending immediately on a stopped
  container, leaving the original stream dead by the time the
  container actually started. Switching tabs and coming back used to
  be the workaround; that is no longer necessary.

## v0.10.0 — 2026-05-29

Editable server resources and a more reliable server creation. RAM
and CPU limits can now be changed on a stopped server straight from
the Settings tab, with a host-side preflight that refuses any
allocation that would push the machine past its safety margin.
Server creation also became more robust: image pulls are retried on
transient errors, and failures now leave a trail in the activity log
and the panel logs instead of vanishing silently.

### Added

- **Editable Resources section** on the Settings tab — owner-only,
  with inputs for RAM (MiB) and CPU cores plus a small host
  "used / total" line. The Save button is disabled while the server
  runs, with a clear message asking the user to stop it first.
- **Host preflight** — when creating *or* resizing a server, the
  backend refuses the allocation if it would push the machine past
  the safety margin (1 GiB RAM + 1 CPU core kept for the OS,
  Docker and the panel itself). Returns HTTP 507 with the host
  resource snapshot so the UI can tell the user exactly what is
  still free.
- **`GET /api/host`** endpoint exposing the host's CPU/RAM totals,
  what is already allocated to existing servers, and what is still
  available.
- **Activity log entry** `server.resize` recorded on every change.
- **Activity log entry** `server.install_failed` recorded when a
  provisioning attempt fails, with the actual reason saved as
  details (`pull: …`, `create: …`, etc.).

### Changed

- **Image pulls are retried** up to 3 times with backoff (2 s, 4 s)
  in `provisionServer`, which absorbs the vast majority of the
  transient Docker Hub / network failures that used to leave a
  server stuck in `INSTALL_FAILED` on the first try.
- The provisioning error is no longer swallowed silently: the real
  cause (`pull`, `create`, ...) is printed to the panel's logs.
- `PATCH /api/servers/:id` now accepts `memoryMb` and `cpuLimit`
  in addition to the existing `name`. Resize requires the server
  to be **stopped** and is **owner-only**.
- Docker's container update API is used to push the new limits to
  the existing container — no need to recreate it.

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
