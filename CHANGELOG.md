# Changelog

All notable changes to Peregrine are documented in this file.

## v0.43.6 — 2026-06-24

### Fixed (build)

- **Removed a now-stale `@ts-expect-error` directive** in
  `backend/src/lib/fail2ban.ts:94`. The directive was introduced
  in v0.39.0 because `@types/node@22.10.x` predated the
  `readOnly` option on `DatabaseSyncOptions`. v0.43.5's bump to
  `@types/node@22.20.0` ships the option declaration upstream,
  so the call:

  ```ts
  new DatabaseSync(filePath, { readOnly: true });
  ```

  is now plain idiomatic TypeScript. With the directive still in
  place, `tsc 5.9.3` raised `TS2578: Unused '@ts-expect-error'
  directive`, failing `backend-build 6/6 RUN npm run build`
  during the Docker image build.

### Verified

- `grep -rE '@ts-expect-error|@ts-ignore' backend/src frontend/src`
  returns zero matches — no other directives became stale at the
  same time. Build path is now clear.

### Notes

- One-line code patch + version bumps + lockfile root bumps.
  No dependency change vs v0.43.5.
- **Docker rebuild required**:
  `docker compose up -d --build`.

## v0.43.5 — 2026-06-24

### Changed (backend deps)

Dependabot PR #13 proposed 5 bumps in one batch. We
cherry-picked **3 outright**, **bumped 2 within their current
major instead** of accepting Dependabot's cross-major target,
and added `ignore` rules to `dependabot.yml` so the cross-major
nag stops on those two until they're actually ready.

**Applied as proposed:**

| Package | From | To | Rationale |
|---|---|---|---|
| `@fastify/multipart` | 9.0.3 | 10.0.0 | Compat with `fastify@5.8.5` maintained; v10 is the version that pairs with Fastify v5+. |
| `dotenv` | 16.4.7 | 17.4.2 | Our only use is `dotenv.config({ path })` in `config.ts` — the v16→v17 breaking changes (callback signature removal, stricter quote parsing, removed `silent` option) don't touch our call site. |
| `@types/dockerode` | 3.3.31 | 4.0.1 | Types-only, runtime `dockerode@5.0.0` unchanged. |

**Bumped within current major instead** of Dependabot's
cross-major target:

| Package | Dependabot wanted | Applied | Why |
|---|---|---|---|
| `@types/node` | `26.0.0` | `22.20.0` (latest 22.x) | The runtime is Node 22 LTS (`engines: ">=22 <23"`). `@types/node@26` would advertise Node-26-only APIs (new `fs.*`, `node:sqlite` additions, etc.) to TypeScript — code using them would compile cleanly and then crash at runtime on Node 22. Sticking to the matching major prevents that whole class of bugs. |
| `typescript` | `6.0.3` | `5.9.3` (latest stable 5.x) | TS v6 ships breaking changes (stricter type-narrowing, removed legacy syntax, `--strict` default shifts). Adopting it requires a full repo typecheck pass + manual fixes to anything the stricter inference now flags. Worth doing in its own release, not folded into a routine dep bump. |

### Added — Dependabot ignore rules

```yaml
ignore:
  - dependency-name: "@types/node"
    update-types: ["version-update:semver-major"]
  - dependency-name: "typescript"
    update-types: ["version-update:semver-major"]
```

Dependabot will keep proposing minor / patch bumps within the
current majors (so we still get `22.21.x` and `5.10.x` when
they ship) — only the cross-major churn is silenced. To
explicitly take the TS v6 or `@types/node` v26+ jump later,
either remove the relevant `ignore` entry or use `@dependabot
allow @types/node major` on a PR.

### Notes

- **No backend source code change.** Dotenv and multipart v10
  upgrades verified against our actual call sites — no migration
  needed.
- **Lockfile fully repinned.** Backend `package-lock.json`
  regenerated incrementally; every entry retains its
  `resolved` + `integrity` fields (verified post-regen).
- Frontend lockfile root version bumped to 0.43.5 to stay in
  sync; no other frontend change.
- **Docker rebuild required**: `docker compose up -d --build`.
  The new `node_modules/` need to land in the runtime image.
- Dependabot PR #13 auto-closes when this hits `main`.

## v0.43.4 — 2026-06-24

### Changed (CI)

- **`actions/checkout` bumped from `@v4` to `@v7`** in every
  workflow, per Dependabot PR #14:
  - `.github/workflows/build.yml` — both the Backend and
    Frontend jobs.
  - `.github/workflows/secret-scan.yml` — the Gitleaks job
    (with `fetch-depth: 0` preserved).
- The major bump v4 → v7 is purely a GitHub-side runtime
  refresh (newer Node on the runner, updated default git
  flags). Our workflow YAML doesn't use any flag removed by
  the bump, so the diff is the version string only.

### Notes

- **Pure CI metadata change.** No backend code, no frontend
  code, no Docker rebuild needed. The panel running in
  production is unaffected; only future PRs / pushes will
  exercise the v7 action.
- Dependabot PR #14 will auto-close when this hits `main`.
- The Dependabot warning "label could not be found: ci" on
  every PR is unrelated to this fix — it's a repo-config item
  on the GitHub UI side (the `ci` label needs to be created
  in *Repository → Labels → New label*, alongside `backend`,
  `frontend`, `docker` for the matching `dependabot.yml`
  entries). Once the labels exist, Dependabot stops warning
  and uses them to tag PRs for easy filtering.

## v0.43.3 — 2026-06-24

### Security

- **GHSA — `ws < 8.21.0` memory-exhaustion DoS (High).**
  Dependabot raised the advisory on the panel's repo on
  2026-06-24. The `ws` WebSocket library, version 8.0.0 →
  8.20.x, allocates structural wrappers per WebSocket fragment
  in a way that lets a remote peer force OOM-kill of the
  receiver by streaming a high volume of 1-byte non-final
  fragments at modest bandwidth.
  - Reaches Peregrine as a **transitive** dependency:
    - Backend: `socket.io@4.8.3 → … → ws@8.20.1` (the live
      console socket).
    - Frontend: `socket.io-client@4.8.1 → … → ws@8.20.1` (the
      browser side of the same socket).
  - **Mitigation applied**: both `backend/package.json` and
    `frontend/package.json` add `"ws": "8.21.0"` to their
    `overrides` block, alongside the existing `esbuild` pin
    from v0.34.0. Both `package-lock.json` files regenerated
    incrementally to keep every other transitive
    `resolved`/`integrity` field intact; verified post-regen:
    `npm ls ws` reports `ws@8.21.0` everywhere it appears.
  - **Why we patched directly rather than waiting for
    Dependabot's PR to merge**: identical effect on the
    dependency tree (npm `overrides` is the strongest pin
    available), and it keeps the panel's release cadence in
    sync with the CHANGELOG / tags instead of producing an
    out-of-band `dependabot/…` commit on `main`.
  - Patched version: `ws@8.21.0` ([upstream commit](https://github.com/websockets/ws/commit/bca91adf15677e47dbe4f959653452727be28b94)).
  - Credit to Nadav Magier for the responsible disclosure.

### Action required

```bash
cd peregrine-panel
git pull
docker compose up -d --build     # ws@8.21.0 picked up at install time
```

After the rebuild:

```bash
docker exec peregrine sh -c 'cat /app/backend/node_modules/ws/package.json | grep \"version\"'
# Expected: "version": "8.21.0",
```

### Notes

- **Pure dependency pin**, no panel code change, no API
  change, no migration. The two Dependabot PRs (#13 / #16)
  auto-close when this hits `main`.
- The `ws` package will reach 8.22.0+ eventually with further
  patches; Dependabot will continue to alert and we'll bump
  the override at that point. Keeping `"ws": "8.21.0"` as an
  exact pin (no caret) matches the supply-chain policy from
  v0.35.0 (`save-exact=true` in `.npmrc`).

## v0.43.2 — 2026-06-14

### Fixed (regression — backups + scheduled tasks)

- **`tar` was deleted from the runtime container by the
  anti-LOLBin hardening introduced in v0.34.0**, but
  `backend/src/services/backups.ts` spawns the system `tar`
  binary in two code paths:
  - `runTarCreate()` — `tar -czf <archive> -C <parent> <child>`,
    used by every backup creation (manual via the *Backups* tab,
    automatic via the *Schedules* worker).
  - `runTarExtract()` — `tar -xzf <archive> -C <parent>`, used
    by every backup restore.

  Both failed with `tar: command not found` the moment a
  cache-less Docker rebuild made the `rm -f /usr/bin/tar …` line
  actually take effect. User-visible symptoms reported on
  v0.43.1:
  - *Backups → Create* → no row appears, server log shows
    "backup creation failed".
  - *Schedules → Run now* on a backup schedule → HTTP 500
    `Could not run the schedule.`
  - Automatic scheduled backups silently log "tar create exited
    127" on every tick.
- **Fix**: `tar`, `gzip`, `gunzip` are no longer in the
  Dockerfile's anti-LOLBin removal list. A new comment block
  spells out why: they ARE technically LOLBins from an attacker's
  point of view, but they're functional dependencies of the panel
  itself; the trade-off is accepted. `du` is also kept (used by
  `diskQuotaWorker` + `measureDirectorySize`) — it was never on
  the removal list but is now explicitly mentioned. All the
  *other* LOLBins removed in v0.34.0 (`apt`, `dpkg`, `find`,
  `xargs`, `curl`, `wget`, `ssh`, `scp`, `nc`, `ncat`, `xxd`,
  `base32`, `sftp`) stay removed — no security regression on
  those.

### Why this only surfaced now

The `rm -f` shipped in v0.34.0, but the silent `|| true` fallback
meant the deletion was a no-op on Docker layers that had cached
the previous filesystem state. Many operators (including the
maintainer's own deployment) had been re-using a cached layer
across v0.34.0 → v0.43.1 builds and so `tar` was still actually
on disk in their running containers. Recent `install.sh` runs and
`docker compose up -d --build` invocations triggered a full
no-cache rebuild that finally cleared that layer — and the
breakage surfaced immediately.

### Action required

Pull v0.43.2 and run:

```bash
cd peregrine-panel
git pull
docker compose up -d --build
```

After the rebuild, `docker exec peregrine which tar` should
print `/usr/bin/tar`, and both manual backups and scheduled
tasks should run cleanly. Existing backup archives are
unaffected — only NEW backup creation and existing-archive
restore needed the binary.

### Notes

- **No backend code change**, no migration. Pure Dockerfile +
  CHANGELOG.
- **A future hardening pass** could replace the `spawn('tar', …)`
  calls with a pure-Node tar implementation (`node-tar` or
  `tar-stream`), making the panel binary-free again. Out of
  scope for this patch — the surgical fix is to restore the
  binary the existing code depends on.

## v0.43.1 — 2026-06-14

### Fixed (operator docs)

- **Caddy welcome page on bare-IP access.** The Caddyfile
  shipped by `install.sh` (and the matching examples in
  `docs/DEPLOYMENT.md` §6 and `docs/HARDENING.md` §3b) only
  declared a site block for the canonical domain. Any HTTP
  request whose `Host` header didn't match that exact string
  — including someone typing the server's bare IP into a
  browser — fell through to Caddy's default behaviour, which
  is to serve its "Welcome / how to set up Caddy" page. Both
  an annoying UX regression and a small information leak
  about the server stack. Fixed by adding a `:80` catch-all
  to every shipped Caddyfile:

  ```caddyfile
  :80 {
      redir https://your-domain.example{uri} permanent
  }

  your-domain.example {
      reverse_proxy 127.0.0.1:3000
      # …
  }
  ```

  Behaviour after the fix:
  - `http://<server-IP>` → `301 / 308 → https://your-domain.example/`
  - `http://www.your-domain.example` → same redirect
  - `http://your-domain.example` → Caddy's built-in HTTPS auto-upgrade
    (unchanged)
  - `https://<server-IP>` → browser cert-name-mismatch warning
    (Let's Encrypt cannot issue certs for bare IPs — out of
    scope for the panel, and not a security regression: nobody
    accidentally types a server IP with `https://`).

### Added (operator docs)

- **DEPLOYMENT.md §6 now documents two modes:**
  - **Option A — Production (HTTPS).** The default. Catch-all
    `:80` block + canonical-domain site block. Picked by
    `install.sh`.
  - **Option B — HTTP-only (no domain, intranet / lab).** A
    one-block Caddyfile (`http://` site) that serves the panel
    on plain HTTP for any hostname. Comes with a "passwords
    travel unencrypted, only use on a trusted local network"
    caveat. Replaces what used to be an undocumented edge
    case for users without a domain.

### Notes

- **Pure documentation + installer fix.** No backend code,
  no frontend code, no database migration. Lockfiles unchanged.
- **For existing deployments**, the fix is a one-liner: SSH
  into the server, edit `/etc/caddy/Caddyfile` to add the
  `:80 { redir https://your-domain.example{uri} permanent }`
  block above the existing site block, then
  `systemctl reload caddy`. Or pull v0.43.1 and re-run
  `install.sh your-domain.example`.

## v0.43.0 — 2026-06-14

### Added — two-dropdown loader matrix

The single loader `<select>` in the *Create server* dialog and on
the per-server *Settings → Game version* page is replaced by two
sub-dropdowns:

- **Mod loader**: `No mods / Fabric / Quilt / Forge / NeoForge`
- **Plugin API**: `No plugins / Paper / Purpur / Folia / Spigot / Bukkit`

The panel resolves the `(modLoader, pluginApi)` pair to one of the
existing backend `ServerLoader` values via a new module
`frontend/src/lib/loaderMatrix.ts` — deterministic table, no
runtime ambiguity:

| Mod loader | Plugin API | Resolved binary |
|---|---|---|
| none | none | `vanilla` |
| none | Paper / Purpur / Folia / Spigot / Bukkit | same name |
| Fabric / Quilt / Forge / NeoForge | none | same name |
| Fabric | Bukkit | **`banner`** (Fabric + Bukkit hybrid) |
| Forge | Bukkit | **`arclight`** (Forge + Bukkit hybrid) |
| NeoForge | Bukkit | **`arclight`** (also handles NeoForge) |
| Quilt | Bukkit | INVALID (no widely-deployed hybrid) |
| any mod loader | Paper / Purpur / Folia / Spigot | INVALID (the Paper family is not what hybrids re-implement; Bukkit is the lowest common denominator) |

The resolved name is shown below the two dropdowns as
"*Server binary: Arclight*", along with a hybrid-server warning
when the resolution lands on Mohist / Arclight / Banner. Invalid
pairs render a rose-bordered "no binary exists for this
combination" message and disable the Create button. The
Settings page reverse-maps an existing server's saved
`server.loader` to the right (modLoader, pluginApi) pair at mount
via a new `splitLoader()` helper, so editing a Mohist or Banner
server shows the right two dropdowns without surprise.

**Why two dropdowns rather than a categorised single one?** The
matrix accurately reflects how Minecraft hybrid servers are
built — Arclight, Banner and Mohist are literally "Forge or
Fabric plus Bukkit", baked into one binary. Picking the two
ingredients separately matches the user's mental model of "I
want mods, AND I want plugins".

### Added — Arclight + Banner loaders

Two new entries in the backend `ServerLoader` type and the
itzg-image type-mapping (`backend/src/lib/docker.ts`):

- **Arclight** (`TYPE=ARCLIGHT`) — the modern, actively-
  maintained Forge / NeoForge + Bukkit hybrid. Default for
  Forge + Bukkit and NeoForge + Bukkit pairings.
- **Banner** (`TYPE=BANNER`) — the Fabric + Bukkit hybrid.
  Default for Fabric + Bukkit pairings.

Together with v0.42.0's Mohist, the panel now covers the three
"mods + plugins" hybrid pairings the community actively
maintains. Mohist remains in the type union — existing Mohist
servers continue to work — but the create dialog no longer
emits it as a default since Arclight is the active successor.

### Added — hybrid-server warning callout

When the resolved binary is one of the hybrids
(Arclight / Banner / Mohist), the dialog shows an amber-bordered
callout below the picker:

> Hybrid server (mods + plugins) — these binaries are
> community-maintained and not officially endorsed by Paper or
> Forge upstream. Most plugins and mods work, but expect
> occasional incompatibilities; test critical add-ons before
> going live.

This is a structural caveat of how hybrids are built — the panel
exposes the existing community options as cleanly as possible
but can't make Arclight more stable than Arclight itself is.

### Fixed — dropdown trigger arrow + rounded right edge

Every `<select>` in the create dialog and the Settings version
picker now uses `appearance-none` plus a CSS-embedded SVG
chevron (data URI, peregrine-400 fill, positioned right-3
center). This eliminates the OS-default arrow that was eating
into the `rounded-lg` right corner on Windows and giving the
trigger a half-rounded look. **Caveat documented in the
release**: when the user *opens* a native `<select>`, the
pop-up list is still rendered by the operating system and
cannot be styled via CSS in any browser. Fully styling the
opened list would require a custom popover + listbox component
— planned for a future dedicated release.

### Changed — i18n

15+ new keys (EN + FR):

- `loader.arclight`, `loader.banner` — display names.
- `loader.mod.*` (5 keys) — left dropdown options.
- `loader.plugin.*` (6 keys) — right dropdown options.
- `loader.hybridWarning` — the warning callout text.
- `create.modLoaderLabel`, `create.pluginApiLabel` — column
  headers.
- `create.loaderResolved` — "Server binary: {name}" line.
- `create.loaderInvalidCombination` — the rose-bordered "no
  binary exists" error.

### Notes

- **No backend wire-format change.** The existing
  `loader: ServerLoader` field on the create / update endpoints
  is unchanged; the frontend simply submits the resolved value.
- **No database migration.**
- **Lockfile unchanged.** Pure code addition on the frontend
  (`loaderMatrix.ts`) plus two backend type-union entries.
- **Stability disclaimer.** The user asked for a hybrid system
  "more stable than Mohist / Arclight / Cardboard". The panel
  cannot make a binary more stable than the binary itself is —
  Arclight / Banner are developed outside this project. What
  the panel CAN do, and now does: surface the three viable
  hybrids cleanly, set expectations via the warning callout,
  and refuse impossible combinations up front.

## v0.42.0 — 2026-06-14

This release is the output of a mid-2026 best-practices audit
against authoritative sources (OWASP, NIST SP 800-63B Rev. 4,
the `itzg/minecraft-server` documentation, NeoForge release
notes, Caddy 2.10 release notes, the Node.js release schedule).
Every change below is a strict superset of v0.41.1: no loader
is removed, no minimum version is raised, no audit event is
dropped, no security primitive is relaxed.

### Added — 4 new server loaders

The itzg image's [types-and-platforms](https://docker-minecraft-server.readthedocs.io/en/latest/types-and-platforms/)
documentation lists Paper, Hybrids, Quilt etc. as first-class
categories. These were the four mainstream gaps in our picker:

- **Purpur** (`TYPE=PURPUR`) — Paper fork with extra performance
  and config knobs. Plugin ecosystem identical to Paper.
- **Folia** (`TYPE=FOLIA`) — Paper's threaded fork (regionised
  tick loop) for very large servers. Most Paper plugins work;
  a few break because of the threading model.
- **Quilt** (`TYPE=QUILT`) — Fabric fork with stronger
  backward-compat across MC versions. Shares Fabric's mod
  ecosystem heavily.
- **Mohist** (`TYPE=MOHIST`) — Forge + Bukkit hybrid: load mods
  AND plugins on the same server.

All four ship as binaries (no BuildTools first-start cost — the
amber BuildTools warning is still gated to Bukkit / Spigot only).

### Added — new Minecraft versions

Mojang adopted a year-based numbering scheme in March 2026
([source](https://www.minecraft.net/en-us/article/minecraft-new-version-numbering-system)).
**26.1 "Tiny Takeover"** shipped 24 March 2026
([wiki](https://minecraft.wiki/w/Java_Edition_26.1)). 1.21.5 and
1.21.6 are the late point releases of the legacy 1.21 line.

Added to the per-loader curated lists:

- **Vanilla / Paper / Fabric / NeoForge / Purpur / Folia / Quilt** —
  gain `26.1`, `1.21.6`, `1.21.5` at the top.
- **Bukkit / Spigot** — gain `1.21.6`, `1.21.5` (no 26.1 yet;
  BuildTools mappings typically lag a few weeks behind a new
  Mojang line).
- **Forge / Mohist** — unchanged. Forge does not ship for 1.21.5+
  at time of writing; Mohist tends to lag further still.

NeoForge confirmed its 26.1 support in
[its 24 March 2026 release notes](https://neoforged.net/news/26.1release/).

### Changed — Argon2id `parallelism: 4 → 1`

OWASP's [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
lists every recommended Argon2id configuration with **p=1**, and
RFC 9106 §4 explicitly recommends p=1 unless multi-threaded
hashing is the application's bottleneck. Interactive logins are
latency-bounded, not throughput-bounded, and `@node-rs/argon2`
already runs each hash on its own libuv worker. Using p=1 also
makes the hash deterministic across machines with different CPU
core counts, which is the canonical default the spec expects.

**Memory and time costs are unchanged** (`memoryCost: 65536 KiB
(64 MiB)`, `timeCost: 3`) — well above OWASP's 19 MiB floor. The
panel's hash cost stays within the OWASP "interactive login"
envelope (~150 ms on a typical 2-core VPS).

**Backward compatibility — verified.** Argon2 PHC strings encode
their params (`$argon2id$v=19$m=65536,t=3,p=4$…`). `verify()`
reads those params from the hash itself, so every existing
password (hashed with the old `p=4`) keeps verifying without a
rehash. New passwords (sign-up, password change) use `p=1`.

### Added — fail2ban `bancount` column

Surfaces the `bancount` field from fail2ban's `bips` schema
([reference](https://deepwiki.com/fail2ban/fail2ban/7.1-ban-time-increment-system)).
This is the foundation of fail2ban's ban-time-increment feature
and is the single most useful column for triaging the dashboard:
`1` = first offence, anything higher = recidivist. The Security
panel now displays it in a dedicated column, coloured rose for
any value ≥ 2 so the eye lands on persistent attackers first.

### Changed — HARDENING.md

- §3a now recommends **Caddy 2.10+** (April 2025) instead of 2.9+.
  2.10 ships automated ECH and ACME 6-day cert profiles in
  addition to the X25519MLKEM768 post-quantum hybrid key exchange
  that was the original 2.9 reason ([Caddy 2.10 notes](https://github.com/caddyserver/caddy/releases/tag/v2.10.0)).
- New §3d optional sub-section documents the **Node 22 → Node 24
  LTS migration** that operators will want to plan over the next
  10 months — Node 22 is in maintenance LTS (EOL April 2027),
  Node 24 is the active LTS (EOL April 2028), Node 26 enters LTS
  October 2026 ([release schedule](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule),
  [endoflife.date](https://endoflife.date/nodejs)).

### Considered, deferred

These were flagged by the audit as "should consider" but require
a larger refactor or a follow-up release:

- **JWT → opaque server-side sessions** (cheap revocation,
  smaller attack surface). The panel is single-instance with
  SQLite, so a `sessions` table would be a clean fit — but it
  affects every authenticated endpoint and warrants its own
  release.
- **Plugin browser via Modrinth API**
  ([Modrinth supports plugins since 2024](https://modrinth.com/news/article/plugins-resource-packs/),
  itzg already supports auto-download via `MODRINTH_PROJECTS`).
  Biggest user-facing payoff of the deferred items; planned for
  a future release.
- **Explicit seccomp profile** in `docker-compose.yml`. Docker's
  default seccomp profile is already applied automatically;
  declaring it explicitly only adds auditability, not protection.

### Notes

- No new dependency. No database migration. Lockfile root version
  bumped to 0.42.0; no transitive package changes.
- All 4 new loaders work automatically with the existing per-loader
  version dropdown (v0.41.1 architecture) and the existing capitalised
  display in `ServerCard.tsx`.

## v0.41.1 — 2026-06-14

### Changed

- **Minecraft version is now a `<select>` scoped to the chosen
  loader**, in both the *Create server* dialog and the per-server
  *Settings → Game version* picker. Previously, the field was a
  free-text `<input>` showing the same placeholder regardless of
  loader, which let users land on combinations the loader doesn't
  ship for (e.g. NeoForge for 1.8.9, which never existed).
- New module-level data in `frontend/src/lib/api.ts`:
  `VERSIONS_BY_LOADER` (one curated list per loader) plus the
  `mcVersionsFor(loader)` helper. The per-loader floors are:
  - **Vanilla / Paper** — back to 1.8.8 / 1.8.9.
  - **Fabric** — back to 1.14.4 (Fabric API was introduced in 1.14).
  - **Forge** — back to 1.7.10 (Forge pre-1.7.10 servers are
    vanishingly rare today).
  - **NeoForge** — back to 1.20.1 (NeoForge was forked from
    Forge in late 2023).
  - **Bukkit / Spigot** — back to 1.8.8 (BuildTools technically
    supports earlier but pre-1.8 builds are rarely usable on
    modern hardware/JVMs).
- Each list is capped at the latest curated breakpoint (1.21.4
  at time of writing). New Mojang releases will need an entry
  added to the relevant `*_MC_VERSIONS` arrays — purely
  data-driven, no logic change required.

### Behavior

- **Auto-reset on loader switch.** When the user picks a new
  loader, if the currently-selected Minecraft version isn't in
  that loader's curated list, the version snaps to LATEST.
  Implemented inline in the loader `<select>`'s `onChange` so
  the state and the rendered options can never disagree.
- **Live-version preservation on the Settings page.** If a
  server is running an older Minecraft version than the curated
  floor (e.g. Fabric 1.15.2 — predates the 1.16.5 cut-off), the
  Settings dropdown still shows that exact value as the selected
  option. Only an explicit loader change wipes it. The operator
  never loses sight of the live build the server is on.
- **`JAVA_MC_VERSIONS` kept as a legacy alias** of the Vanilla
  list so any external code that imported it (none in the
  current tree — verified by grep — but stable APIs are kind to
  out-of-tree consumers) keeps compiling.

### Notes

- **Backend unchanged.** The version string still flows to
  Mojang's manifest validation in `lib/minecraftVersions.ts`,
  which is the authoritative gate. The frontend dropdown is
  purely UX shaping — a curated list of "versions the loader
  actively ships for", not a security boundary.
- **No database migration, no new dependency, no API change.**
- This is the extension of v0.41.0 the user asked for *"de
  manière chirurgicale"*: 1 helper added in api.ts, 2 components
  updated, 1 free-text field → 1 select per component.

## v0.41.0 — 2026-06-14

### Added

- **Bukkit and Spigot loader support.** Both are now selectable
  in the *Create server* dialog and in the per-server
  *Settings → Game version* picker, alongside the existing
  Vanilla / Paper / Fabric / Forge / NeoForge options. Behind
  the scenes:
  - The backend `ServerLoader` type union and validation set
    (`LOADER_SET`) gain `'bukkit'` and `'spigot'` entries.
  - `lib/docker.ts`'s `itzgTypeFor()` maps them to the
    `TYPE=BUKKIT` and `TYPE=SPIGOT` env vars the
    `itzg/minecraft-server` image consumes — no other changes
    needed, the existing `VERSION=` + `MEMORY=` plumbing is
    unchanged.
  - The Mojang manifest validation in `lib/minecraftVersions.ts`
    is reused as-is: Bukkit/Spigot version strings match the
    upstream Minecraft version they target (e.g. `1.21.4`,
    `1.20.6`, …), so the same curated dropdown list applies.
  - The frontend type union and `JAVA_LOADERS` array gain the
    two new entries (listed last so newcomers don't pick Bukkit
    or Spigot by reflex over Paper, which is a strict superset).
  - New `BUILDTOOLS_LOADERS` set in `frontend/src/lib/api.ts`
    centralises the "BuildTools is required" predicate.
- **BuildTools first-start callout.** Bukkit and Spigot cannot
  be redistributed as pre-built binaries (DMCA — Mojang owns
  the CraftBukkit sources). The itzg image therefore runs
  `BuildTools.jar` on first container start to compile the
  server locally from Mojang's mappings. That compile uses
  ~1–2 GiB of RAM and takes 5–15 minutes before the server is
  ready. To avoid users mistaking the long *INSTALLING* state
  for a hang, the UI shows an amber-bordered callout the moment
  either loader is selected — in both the Create dialog and the
  Settings version picker. Subsequent restarts reuse the
  compiled JAR from `/data` and are as fast as Vanilla.
- New i18n keys: `loader.bukkit`, `loader.spigot`,
  `loader.buildtoolsWarning` (EN + FR).

### Plugin compatibility (clarification)

- All five Bukkit-API-compatible loaders — **Bukkit, Spigot,
  Paper** (and the existing Paper has always supported it) —
  load plugins from the same `/data/plugins/` directory. Drop
  any `.jar` from SpigotMC / Modrinth / Hangar into that folder
  via the panel's File manager (or SFTP), restart the server,
  done. No backend change was needed for plugins; this CHANGELOG
  entry is just to make the wiring obvious to operators who
  picked Bukkit/Spigot specifically to run plugins.

### Notes

- **No database migration.** The `loader` column is `TEXT`
  with a per-write validation against `LOADER_SET`; adding two
  new accepted values is a code-only change.
- **No new dependency.** Lockfiles unchanged.
- **Memory budgeting reminder.** During the BuildTools compile,
  the container needs ~1–2 GiB of RAM **on top of** whatever
  the running server will use. If the server is configured
  with the bare minimum (1 GiB), the compile may OOM-kill. Pick
  at least 2 GiB for the server's `memoryMb` if you plan to use
  Bukkit or Spigot, or temporarily bump it for the first start
  and lower it later via Settings.

## v0.40.2 — 2026-06-14

### Fixed (typography)

- **Feature-intro titles now visually outrank their description.**
  Inside the admin Security dashboard, the "Log retention" card
  and the fail2ban "not configured" callout used
  `<p className="font-medium text-peregrine-100">` for the
  title — which inherited the container's `text-xs` body size,
  producing two visually identical paragraphs and forcing the
  eye to read both before realising the first was a heading.
  Both titles are now `text-sm font-semibold text-white` (one
  notch larger than the body + heading weight + max contrast).
  Spacing between the title and the supporting paragraph also
  goes from `mt-0.5` (2 px) to `mt-1` (4 px) for breathing room.

### Audit notes

- A grep pass across `frontend/src/` found exactly two instances
  matching the buggy pattern. Other occurrences of
  `<p className="…font-medium…">` are legitimate:
  - `HostMetricsCard.tsx:45` — uppercase tiny stat labels
    (CPU / RAM / DISK), already correctly styled for that role.
  - `PlayerAccessLists.tsx:342` — player name in a list row,
    not a category title.
  - `Subusers.tsx:202` — form-field label, not a section
    header.
  - `Game.tsx:151` — warning callout already using
    `font-semibold` + amber accent.
- This document now records the recommended pattern so future
  additions follow it: inside a card, **title** is `text-sm
  font-semibold text-white`, **body** is `text-xs
  text-peregrine-300/400`, **spacing** is `mt-1`.

### Notes

- Pure typography polish. Two `<p>` className strings changed in
  one file. No new dependency, no API change, no behavioural
  change.

## v0.40.1 — 2026-06-14

### Fixed (UX / accessibility)

- **Visible keyboard focus ring on every interactive element.**
  An audit found **zero** `focus-visible:ring-*` classes across
  the entire `frontend/src/` tree (~120 buttons). Tailwind v3's
  preflight removes the browser-default `outline` on buttons,
  and nothing replaced it — meaning a user navigating the panel
  with Tab / Shift+Tab had no idea which button was focused.
  Fixed via a single `@layer base` rule in `frontend/src/index.css`
  that paints a 2 px amber (`ring-falcon`) ring with a 2 px dark
  offset (`ring-offset-peregrine-950`) on every focused
  `<button>`, `<a>`, `[role="button"]`, and `[type="submit"]` /
  `[type="reset"]` element. Inputs / textareas / selects get a
  subtler 1 px tinted ring as a complement to the existing
  `focus:border-falcon` style.
- **`cursor: pointer` restored on `<button>`.** Tailwind v3
  removed this from its preflight (browsers historically
  disagreed). Re-added via the same `@layer base` rule.
  `:disabled` buttons still get `cursor: not-allowed` from their
  per-button utilities.
- **`user-select: none` on buttons.** Clicking a button used to
  occasionally select its label text — annoying and unexpected.
  Inputs, textareas, and prose still allow selection (the rule
  only targets `<button>` and `[role="button"]`).

### Notes

- **Zero component-file edits.** All ~120 buttons across
  AdminPanel, SecurityPanel, ServerCard, file manager, console,
  backups, schedules, account settings, etc. now have visible
  focus indicators without any individual file having been
  touched. The rule lives in one place (`index.css`) and
  any component that ever needs to opt out can add
  `focus-visible:ring-0` to override.
- **No new dependency, no database migration, no API change.**
  Pure CSS polish.
- Border-radius inconsistencies investigated and judged
  intentional: `rounded` on small badges (text-[10px]) is the
  proportional choice, `rounded-md` on Dashboard tabs is correct
  nesting (parent `rounded-lg` container → smaller inner radius
  produces the "matryoshka" effect modern UIs use). The dominant
  `rounded-lg` (117 uses) and `rounded-2xl` (67 uses) remain the
  primary radii for buttons and panels respectively.

## v0.40.0 — 2026-06-14

### Added

- **Automatic log retention worker.** Once per day (and once on
  startup, to catch up after long downtimes), Peregrine now
  DELETEs every row older than `LOG_RETENTION_DAYS` (default
  **30 days**) across the three log tables:
  - `auth_events` (login attempts, MFA, SFTP)
  - `audit_events` (sensitive backend operations)
  - `server_activity` (user-visible server actions per server)
  
  The worker is best-effort: a failing DELETE on one table does
  NOT roll back the others. Each non-zero run emits exactly one
  `audit.logs_retention_auto` row with the per-table deletion
  counts in its `details` (e.g. `auth=42 audit=7 activity=128
  retention_days=30`).
- **Manual "Clear failed logins" button** on the admin Security
  dashboard. Deletes only the failed-auth kinds
  (`auth.login_failed`, `auth.login_rate_limited`,
  `auth.mfa_failed`, `auth.sftp_failed`,
  `auth.sftp_rate_limited`). Successful logins, MFA setup,
  logout events, and SFTP success rows are PRESERVED — they're
  useful for "when did this account last log in legitimately"
  questions and don't grow at attacker speed. The action is
  audit-logged (`audit.logs_cleared_manual`).
- New env var `LOG_RETENTION_DAYS` (default 30, clamped 0..3650).
  Value `0` disables the worker entirely; manual button still
  works.
- New audit kinds:
  - `audit.logs_cleared_manual` — emitted on each manual button click
  - `audit.logs_retention_auto` — emitted once per daily worker run with non-zero deletions
- New backend module `backend/src/services/logRetentionWorker.ts`.
- New backend route `POST /api/admin/security/clear-failed-logins`
  (admin-only, returns `{ deleted: number }`).
- New service helpers in `backend/src/services/securityLog.ts`:
  `clearFailedAuthEvents()` and `deleteLogsOlderThan(days)`.

### Changed

- `.env.example` documents `LOG_RETENTION_DAYS` with the
  recommended bumps to 90/180/365 days for longer forensic
  windows, and explains the `0` disable value.
- Admin Security dashboard gains a header card explaining the
  retention policy and the right-hand red "Clear failed logins"
  button.

### Notes

- **No database migration.** The worker only DELETEs from
  existing tables; no schema change.
- **No data is gone forever for operators who care about
  long-term forensics** — they should either (a) bump
  `LOG_RETENTION_DAYS` to a high value, (b) export rows to an
  external SIEM before they age out (no built-in exporter yet),
  or (c) set `LOG_RETENTION_DAYS=0` and accept unbounded growth.
- Manual deletion of `audit_events` rows is intentionally NOT
  exposed via a UI button: those rows are the forensic record of
  every sensitive panel action, and offering a one-click wipe
  would be a footgun. Use SQL directly if you really need to
  scrub them.

## v0.39.0 — 2026-06-14

### Added

- **Admin-only Security dashboard.** New "Security" tab in the
  Administration panel, gated by the same `authenticateAdmin`
  hook as the rest of `/api/admin/*`. Four sections, refreshed
  every 30 s:
  - **Stats header** — failed authentications in the last 24 h
    and 7 d, plus distinct usernames and distinct IPs targeted
    over the last 7 d. Tells an admin at a glance whether the
    panel is under active brute-force.
  - **fail2ban — currently banned IPs** — pulls the live ban
    table from the host's fail2ban SQLite database (read-only).
    Shows jail, IP, ban timestamp, and time-to-expiry. If
    fail2ban isn't installed or the mount isn't wired up, the
    card renders a friendly "not configured (see
    HARDENING.md §8)" callout instead of crashing.
  - **Top offenders (last 7 days)** — failed auth events
    aggregated by `(username, IP)`, ordered by attempt count
    desc. Each row breaks the kinds down with coloured badges
    (`login_failed`, `mfa_failed`, `sftp_failed`,
    `rate_limited`, …).
  - **Recent raw attempts** — newest-first table of the last
    100 failed events, with timestamp, kind badge, username,
    IP and free-text details.
- New backend module `backend/src/services/securityLog.ts`:
  read-only queries on the existing `auth_events` table —
  `failedLoginStats()`, `topFailedLoginOffenders()`,
  `listRecentFailedLogins()`. All client-supplied limits are
  clamped (max 500 rows, max 90-day window) so a curious admin
  can't accidentally pull a multi-GB payload.
- New backend module `backend/src/lib/fail2ban.ts`: opens the
  fail2ban SQLite DB in **read-only** mode via Node 22's
  `node:sqlite` `readOnly: true` flag (mapped to
  `SQLITE_OPEN_READONLY`). Filters historical rows so only
  active bans are returned. Gracefully falls back to
  `{ available: false, reason: '...' }` if the file is missing,
  unreadable, or has the wrong schema.
- Three new admin-gated routes:
  - `GET /api/admin/security/failed-logins?limit&days`
  - `GET /api/admin/security/banned-ips`
- New frontend `frontend/src/components/SecurityPanel.tsx`
  rendering inside `AdminPanel.tsx` under the new "Security"
  tab. Bilingual EN/FR i18n keys (`admin.security.*`).

### Changed

- `docker-compose.yml` carries the recommended (but commented
  out) read-only bind-mount of `/var/lib/fail2ban` →
  `/host/fail2ban`. Operators uncomment the line once fail2ban
  is installed on the host. Default-disabled because the mount
  would otherwise prevent `docker compose up` on hosts that
  haven't installed fail2ban yet.
- `.env.example` adds the optional `FAIL2BAN_DB_PATH` variable
  (defaults to `/host/fail2ban/fail2ban.sqlite3`; set to empty
  string to disable the integration entirely).
- `docs/HARDENING.md` §8 documents the panel-side integration:
  what the mount does, what to put in `docker-compose.yml`, and
  what happens if fail2ban is missing.

### Security notes

- The fail2ban integration is **strictly read-only**. The panel
  never invokes `fail2ban-client`, never writes to the
  fail2ban DB, and the bind-mount carries the `:ro` flag. A
  panel RCE cannot ban or unban arbitrary IPs through this
  feature.
- Both endpoints are guarded by `authenticateAdmin`. A
  non-admin user trying to query them gets 401/403 the same
  way they would for any other `/api/admin/*` route.
- `auth_events` already stored everything we display — there
  is no new data collection in this release. The dashboard is
  a *view* on data the panel was already keeping for forensic
  reconstruction (see v0.23.0+ notes).

### Notes

- No new dependency. No database migration.
- Lockfiles unchanged.

## v0.38.0 — 2026-06-14

### Added

- **`docs/HARDENING.md`** — comprehensive production hardening
  runbook (~820 lines, 13 sections). Companion to
  `docs/DEPLOYMENT.md`: where DEPLOYMENT gets you a working public
  panel, HARDENING raises the security floor for operators who
  expose the panel on the open Internet. Every section follows the
  same shape: **why this matters → exact copy-pasteable commands →
  how to verify it stuck**.

  Covered topics:
  - **Threat model** matrix mapping three realistic adversary
    profiles (opportunistic scanner, targeted attacker, physical
    theft / provider compromise) to the sections that defend
    against each.
  - **LUKS at-rest encryption** of the dedicated data disk, with
    auto-unlock via a keyfile on the encrypted root for unattended
    reboots.
  - **SSH hardening**: public-key only, non-standard port (and the
    safe re-application of UFW rules around the swap), TOTP second
    factor via `libpam-google-authenticator` with
    `AuthenticationMethods publickey,keyboard-interactive`.
  - **Web edge / TLS**: upgrade to Caddy 2.9+ for the
    X25519MLKEM768 post-quantum hybrid key exchange (built-in
    since the move to Go 1.23); hardened Caddyfile with TLS 1.3
    only, full security-header set, JSON access log with rotation.
  - **Cloudflare DDoS upstream**: proxied DNS, UFW locked to
    Cloudflare's published CIDRs only (so the VPS IP can't be
    bypassed), `trusted_proxies static cloudflare` so audit logs
    show the real client IP, free-tier WAF + rate-limit rule
    template for `/api/auth/login`.
  - **`unattended-upgrades`** with 04:00 auto-reboot for
    kernel/libc patches.
  - **System entropy**: `rngd` from `rng-tools-debian` as the
    baseline, optional YubiKey 5+ TRNG feed for hardware
    certified-entropy threat models.
  - **Network and process audit**: `ss`, SUID-bit find, lightweight
    monitoring via netdata over SSH tunnel, daily digest via
    `logwatch`.
  - **Extra fail2ban jails** for the panel's `/api/auth/login`
    (parses Caddy's JSON access log) and a 404-scanner jail that
    catches the precursor sweeps (wp-admin, `/.env`, phpmyadmin).
  - **Off-site backups** — the explicit replacement for the
    v0.36.x panel-side Picocrypt encryption that was removed in
    v0.37.0: rsync over SSH to a laptop, then `age` encryption,
    then `rclone` to S3/B2; with restore-drill cadence (every 90
    days, recorded in `/srv/peregrine/RESTORE-TESTED.txt`).
  - **Pre-production audit checklist** — 25 items grouped into
    Crypto/secrets, Network, TLS, SSH, Updates, Backups, Audit
    trail, Containers. Designed to be ticked off literally one
    by one before announcing the panel publicly.
  - **Appendix A — emergency response runbook** for suspected
    compromise: don't reboot (preserve memory state), cut at
    Cloudflare DNS, snapshot the host, rotate `JWT_SECRET`, and
    the exact SQL to query the last 7 days of `audit_events`.
  - **Appendix B — explicit non-goals**: MAC profiles, kernel
    hardening LSMs, multi-host clustering, compliance frameworks.
    Listed so readers don't waste time on items that aren't in
    scope for a small self-hosted panel.

- **`docs/DEPLOYMENT.md`** updated with a pointer to
  `HARDENING.md` from its "Security recommendations" section, so
  operators following the linear install flow are nudged into the
  deeper guide once the basic deployment is working.
- **`README.md`** callout updated.

### Notes

- **Pure docs release.** No code change in `backend/src/` or
  `frontend/src/`, no dependency change, no database migration. The
  `npm ci` lockfiles are unchanged. Operators who only care about
  application behaviour can skip this update; operators preparing
  a public deployment should read `HARDENING.md` end to end before
  flipping the DNS record.

## v0.37.0 — 2026-06-14

### Removed

- **Encrypted backup download (Picocrypt v1.48 format).** The
  feature added in v0.36.0 has been **rolled back in its entirety**.
  Reason: the format's hardcoded Argon2id parameters (1 GiB memory,
  4 iterations, parallelism 4) mean every concurrent encrypted
  download requests an extra **1 GiB of RAM** for ~5–10 s on the
  panel container. 64 simultaneous downloads = 64 GiB of RAM, which
  is not a realistic budget on a self-hosted VPS. The plaintext
  `.tar.gz` download is unchanged and remains the way to take a
  copy of a backup off the panel. Anyone who needs at-rest
  encryption should encrypt with their own tool (Picocrypt
  desktop, age, gpg, …) **after** downloading.
- Files deleted: `backend/src/lib/picocrypt.ts`,
  `backend/src/lib/picocryptReedSolomon.ts`,
  `backend/src/types/libsodium-wrappers-sumo.d.ts`.
- Route removed: `POST
  /api/servers/:id/backups/:backupId/download-encrypted`.
- UI removed: the "Encrypted download" button + password modal in
  the Backups tab; 10 EN/FR i18n keys (`backups.encrypt*`).
- Dependencies removed from `backend/package.json`:
  `libsodium-wrappers-sumo@0.7.15`, `@noble/hashes@1.6.1`. Lockfile
  shrinks by 3 entries (sumo + libsodium + @noble/hashes).
- Audit event kind `audit.backup_download_encrypted` will no longer
  be emitted, but historical rows in `audit_events` are preserved
  (no destructive migration).

### Performance (VPS-friendly)

- **Frontend polling reduced.** Dashboard server-list refresh:
  4 s → **10 s** (−60 % XHRs). Host metrics card: 5 s → **15 s**
  (−70 % XHRs). The UI does not feel any staler at typical Minecraft
  server reaction times.
- **Node V8 heap capped at 512 MiB** via
  `ENV NODE_OPTIONS=--max-old-space-size=512` in the Dockerfile.
  Peregrine's steady-state heap is well under 200 MiB; capping at
  512 MiB means a leak crashes the container fast rather than slowly
  starving the rest of the VPS.
- **Socket.IO `perMessageDeflate: false`** in
  `backend/src/realtime/console.ts`. Console log streams are small
  text bursts where the deflate CPU cost (~5–10 % of socket I/O CPU
  on busy panels) was not worth the marginal bandwidth saving.
- **New SQLite index** `servers_by_owner` on `servers(owner_id)`
  (migration #17). Speeds up the dashboard's
  `SELECT … FROM servers WHERE owner_id = ?` and the subuser-aware
  outer-join variant from O(n) full scans to O(log n).
- Backend `node_modules` is ~5 MiB smaller (sumo + libsodium + @noble
  removed).

### Verified preserved

- Argon2id login params unchanged: 64 MiB / 3 iters / parallelism 4
  (RFC 9106).
- Zero Trust input sanitization (`sanitizeFreeText` — 14 call sites)
  unchanged.
- Audit event pipeline (`logAuditEvent` — 4 call sites) unchanged.
- Tor exit-node blocking unchanged.
- JWT cookie auth + `requirePermission` ACL — 96 hook attachments
  across the routes, none touched.
- HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy
  response headers unchanged.
- Supply-chain hardening (`.npmrc`, `--ignore-scripts`, Dependabot,
  gitleaks, CodeQL, secret-scan workflow) all intact.
- Container hardening (`no-new-privileges`, `read_only`, `cap_drop:
  ALL`, `pids_limit`) all intact.

### Migration notes

- Database migration #17 (the new `servers_by_owner` index) applies
  automatically on first startup.
- No environment variable / `.env` change required. Heap cap is
  overridable from `docker-compose.yml` with
  `environment: NODE_OPTIONS=--max-old-space-size=256` if the
  operator wants to go even leaner.

## v0.36.2 — 2026-06-14

### Fixed

- **`npm ci` no longer crashes with `TypeError: Invalid Version:`**
  during the Docker build. Root cause was the v0.36.1
  `backend/package-lock.json` (regenerated from an empty starting
  point with `npm install --package-lock-only`) which silently
  produced a lockfile missing the `resolved` URL and `integrity`
  hash on 174 of its 212 entries. With those fields missing, `npm
  ci` re-resolves every transitive dep against the live registry
  on each run, hitting a separate `npm@10` arborist bug that
  crashes inside `semver.compare()` while deduplicating
  `@grpc/grpc-js@1.14.4` (the registry metadata of that package
  contains a literal `file:../proto-loader` reference in its
  devDependencies, which is not a valid semver target).
- Backend `package-lock.json` regenerated **incrementally** on
  top of the last known-good v0.35.2 lockfile, so every package
  carries its `resolved` URL + `integrity` hash. Verified locally:
  `rm -rf node_modules && npm ci --ignore-scripts` completes
  successfully with the new lockfile.
- Frontend `package-lock.json` regenerated the same way for
  consistency; no actual lockfile content change beyond the root
  version bump.
- Root versions in both lockfiles are now in sync with their
  respective `package.json` (`0.36.2`).

### Notes

- Pure lockfile / metadata fix. **No source code change** anywhere
  in `backend/src/` or `frontend/src/`. The Picocrypt-format
  encryption implementation from v0.36.0 and the libsodium-sumo
  switch from v0.36.1 are untouched.
- Anyone whose `docker compose build` failed on v0.36.0 or v0.36.1
  with either `Missing: <pkg> from lock file` or
  `Invalid Version:` should pull v0.36.2 and rebuild — no manual
  intervention needed.
- Lesson learned: in supply-chain hardened setups
  (`--ignore-scripts`, `engine-strict`, `audit-level=moderate`),
  ALWAYS regenerate lockfiles by running a real `npm install`
  (which fetches the tarballs and records hashes), never `npm
  install --package-lock-only` from an empty starting point.

## v0.36.1 — 2026-06-14

### Fixed

- **Backend build no longer fails** on `npm ci` and runtime. The
  v0.36.0 release pinned `libsodium-wrappers@0.7.15`, but that
  build of the library does **not** expose
  `crypto_stream_xchacha20_xor_ic` — only the Poly1305-tagged AEAD
  variants. The Picocrypt v1.48 format uses the **raw** XChaCha20
  stream cipher (paired with a separate global BLAKE2b MAC), not
  AEAD, so the missing primitive made the backend either fail to
  import or, worse, encrypt with a different construction and
  produce files Picocrypt desktop could not decrypt.
- **Switched to `libsodium-wrappers-sumo@0.7.15`** (the "full
  symbols" build of the same library) which does expose the raw
  stream cipher. The two packages share the same WASM core; the
  sumo build is ~1 MB larger on disk, no other cost.
- **Replaced `@types/libsodium-wrappers`** (which did not type the
  sumo-only functions anyway) with a local ambient declaration at
  `backend/src/types/libsodium-wrappers-sumo.d.ts`. The deprecated
  `@types/libsodium-wrappers-sumo` stub is **not** used (it has no
  actual `.d.ts` content despite its claim).
- **Lockfile regenerated** so `npm ci --ignore-scripts` in the
  Dockerfile passes again.

### Notes

- Pure build / dependency fix. No new feature, no API change, no
  behavioural change vs the design described in v0.36.0. Anyone
  who tried to build v0.36.0 will hit the npm-ci error from the
  release notes — pull v0.36.1 and rebuild.
- Smoke-tested end-to-end on a 4 KiB plaintext: Argon2id 1 GiB
  derivation, HKDF-SHA3-256, XChaCha20 streaming via libsodium-sumo,
  BLAKE2b-512 keyed MAC, header back-patch — all primitives wire up
  cleanly, file is exactly 789 + plaintext bytes, header starts
  with the ASCII bytes `v1.48` post-RS-decode, MAC slot is
  populated.
- The user-side interop verification with the official Picocrypt
  desktop app is still the gating step for declaring v0.36.x done.

## v0.36.0 — 2026-06-14

### Added

- **Picocrypt-format encrypted backup download.** Every backup in the
  per-server Backups tab now gets a second action next to *Download*:
  **Encrypted download**. The user is asked for a password (with a
  confirmation field), and the panel produces a file in the
  [Picocrypt v1.48 file format](https://github.com/Picocrypt/Picocrypt)
  — byte-for-byte compatible with the official, free, cross-platform
  Picocrypt desktop app for Windows, macOS, and Linux. Decryption
  therefore needs **no proprietary tool, no Peregrine running**, and
  no internet access. The output filename ends in `.tar.gz.pcv`.
- New backend module `backend/src/lib/picocrypt.ts` implementing the
  baseline Picocrypt mode:
  - **Argon2id** key derivation with the format's hardcoded params
    (time=4, memory=1 GiB, parallelism=4, 32-byte output);
  - **HKDF-SHA3-256** to split the master key into a BLAKE2b MAC
    subkey and a Serpent key (consumed but unused in non-paranoid
    mode — kept on the wire so the HKDF stream stays aligned with
    the reference impl);
  - **XChaCha20** raw stream cipher (NOT XChaCha20-Poly1305), via
    `libsodium-wrappers`' `crypto_stream_xchacha20_xor_ic`, streamed
    in 1 MiB chunks;
  - **Keyed BLAKE2b-512** global MAC over the post-XChaCha20
    ciphertext, computed incrementally and back-patched into the
    192-byte header slot once the body is fully written.
- New backend module `backend/src/lib/picocryptReedSolomon.ts`: a
  pure-TypeScript Reed-Solomon encoder over GF(2⁸) (irreducible
  polynomial `0x11D`, generator α=2), bit-compatible with the
  `github.com/Picocrypt/infectious` library Picocrypt uses for
  header forward-error-correction. Implements the encoding side
  only (we never need to decode our own output) for the FEC sizes
  Picocrypt actually uses on the wire: `FEC(5,15)`, `FEC(16,48)`,
  `FEC(24,72)`, `FEC(32,96)`, `FEC(64,192)`.
- New API route `POST /api/servers/:id/backups/:backupId/download-encrypted`
  taking `{ password }` in the body (passwords stay out of URLs and
  access logs), gated by the existing `backups.download` permission.
  Streams a Picocrypt-format ciphertext, then deletes the temp file
  whether the client got the whole stream or dropped mid-way.
- New audit event `audit.backup_download_encrypted` recorded in the
  `audit_events` table for forensic reconstruction.
- New frontend dialog in the Backups tab (`Backups.tsx`) with password
  + confirm fields, an in-progress state, a "1 GiB RAM during key
  derivation, ~5–10 s, password loss is unrecoverable" notice, and
  bilingual EN/FR i18n keys (`backups.encrypt*`).

### Dependencies

- `backend/package.json` — added:
  - `libsodium-wrappers@0.7.15` (raw XChaCha20 stream cipher with
    explicit initial-counter for streaming);
  - `@noble/hashes@1.6.1` (keyed BLAKE2b-512, SHA3-256, SHA3-512,
    HKDF — pure JS, audited);
  - `@types/libsodium-wrappers@0.7.14` (devDep).
- No new frontend dependencies. The browser handles the file save
  with `URL.createObjectURL` + a synthetic anchor click.

### Verification

- Argon2id and BLAKE2b are deterministic and well-tested upstream;
  the file format itself is the part that needs cross-checking. The
  intended verification flow is to encrypt a small file in Peregrine,
  open it in the official Picocrypt desktop app, and confirm the
  decrypted plaintext is identical to the original.
- The Reed-Solomon port follows the standard Vandermonde construction
  used by `infectious`. If a byte differs from the reference, the
  Picocrypt decryptor will either flag the header as corrupt or
  refuse to verify the MAC — both fail closed, never silently produce
  garbage plaintext.

### Notes

- **Format is intentionally narrow.** Only the most common Picocrypt
  mode is produced: no paranoid (Serpent cascade), no keyfiles, no
  Reed-Solomon body encoding, no deniability mode, no comments. All
  flag bits are zero in the header. Adding the other flags is a
  pure extension — files produced today stay decryptable by all
  future Picocrypt versions.
- **Server-side cost.** The format mandates **Argon2id with 1 GiB of
  memory** for key derivation; that's a per-request RAM spike on
  the panel container during the ~5–10 s derivation. Stays within
  `pids_limit: 1024` since it's a single Argon2 call per backup
  download.
- **`docker-compose.yml`** does not need editing: the encrypted
  temp file is written under the same `peregrine-data` volume as
  the rest of the backups, inside a `tmp/` subfolder.

## v0.35.2 — 2026-06-13

### Fixed

- **`scripts/setup-dev.sh`** no longer crashes ungracefully when run
  on a machine without Node / npm. It now:
  - detects the absence of `node` and `npm`, prints a clear message
    explaining that the script is for **dev machines, not the
    production server** (which uses Docker to bundle its own Node),
    and exits cleanly with code 0;
  - detects a wrong Node major version (anything other than 22.x)
    and refuses to continue, pointing the user at nodejs.org;
  - reports backend or frontend install failures with a clearer
    "see the npm output above" hint instead of bailing silently.
- **`CONTRIBUTING.md`** now opens its *Development setup* section
  with a callout making the dev/prod distinction explicit, so
  contributors don't run the script on their production server by
  accident.

### Notes

- Pure docs / tooling. No code change, no behaviour change for
  operators.

## v0.35.1 — 2026-06-13

### Documentation

- **`scripts/setup-dev.sh`** — one-shot developer setup script.
  Run `bash scripts/setup-dev.sh` once after cloning to:
  - activate the pre-commit gitleaks hook
    (`git config core.hooksPath .githooks`),
  - install backend dependencies with `npm ci --ignore-scripts`,
  - install frontend dependencies with `npm ci --ignore-scripts`.
- **`CONTRIBUTING.md`** gets a "Development setup" section
  explaining the script, what it does, the manual fallback, and
  how to install `gitleaks` itself.
- **`README.md`** gets a small "Development" section pointing at
  the script + `CONTRIBUTING.md`.

### Why

The v0.35.0 release shipped the `.githooks/pre-commit` hook and
the supply-chain flags, but did not tell contributors how to
activate them on their clone (`git config core.hooksPath` is
not automatic — git deliberately refuses to do that for security
reasons). v0.35.1 closes that documentation gap.

### Notes

- Pure docs / tooling. Zero code change, zero behaviour change
  for existing operators. Skip this version if you do not
  contribute to the source.

## v0.35.0 — 2026-06-13

### Security — Supply chain hardening

- **`.npmrc` strict** at repo root + per-project (backend, frontend):
  - `save-exact=true` — `npm install <pkg>` always pins the exact
    version, no more `^`.
  - `engine-strict=true` — install fails if the local Node does
    not match `engines` in `package.json`.
  - `audit-level=moderate` — `npm audit` exits non-zero on
    moderate-or-higher CVE.
  - `fund=false`, `loglevel=warn` — cleaner CI output.
- **Exact version pinning** in both `package.json` files. Every
  direct dependency now uses a fixed version (e.g. `"5.8.5"`
  instead of `"^5.8.5"`). The `package-lock.json` already pinned
  the full tree, but the source `package.json` previously allowed
  silent minor upgrades on `npm install`. Now both source and
  lockfile are pinned.
- **`engines: { "node": ">=22 <23" }`** declared in both
  `package.json`s. Builds and installs on Node 21 / 23 fail
  immediately rather than silently producing a different binary.
- **`npm ci --ignore-scripts`** in the Dockerfile (both build and
  runtime stages). Blocks the classic supply-chain payload via
  postinstall scripts (`event-stream`, `colors.js`,
  `ua-parser-js`-style attacks). No native module in the current
  dep tree requires a script; if one is ever added it must be
  re-allowlisted with an explicit `npm rebuild <pkg>`.
- **`overrides`** force-patches transitive deps:
  - `backend`: `esbuild` 0.28.1 (the version tsx ships with
    bundled is older and CVE-affected; the override applies even
    though tsx is dev-only).
  - `frontend`: `esbuild` 0.28.1 (same vector via vite).
- **Additional CVE patches**:
  - `tsx` 4.19.2 → 4.22.4 — drops vulnerable bundled esbuild.
  - `postcss` 8.4.49 → 8.5.15 — closes XSS in CSS stringify
    output.
  - `autoprefixer` 10.4.20 → 10.4.21 — postcss-8.5 compat.
  - `vite` 7.1.5 → 7.3.5 — closes dev-server CORS bypass that
    could let a malicious website read responses from the running
    dev server.
- Result: **`npm audit` reports 0 vulnerabilities** on both
  backend and frontend.

### Security — Anti-secret-leak

- **GitHub Dependabot** (`.github/dependabot.yml`): weekly checks
  on Mondays at 04:00 Europe/Paris for backend, frontend, GitHub
  Actions and Docker base image. Open PRs are grouped per
  ecosystem to avoid spam.
- **CI workflow `secret-scan.yml`** runs **gitleaks** on every
  push and PR. Catches accidental secret commits before they make
  it past CI. Pairs with GitHub's native Secret Scanning + Push
  Protection (enabled in repo Settings, see also
  `docs/SECURITY.md`).
- **CI workflow `build.yml`** typechecks and builds both backend
  and frontend on every PR. `npm audit --audit-level=moderate`
  blocks merges that introduce vulnerable deps.
- **Pre-commit hook** at `.githooks/pre-commit` runs gitleaks
  locally before each commit. Activate with
  `git config core.hooksPath .githooks`.
- **`.gitleaksignore`** allows the known-safe paths
  (`.env.example`, `docs/HARDENING.md`, `CHANGELOG.md`) to mention
  secret-looking patterns without firing false positives.
- **`.gitattributes`** forces LF line endings on all text files
  (CRLF was creating noise on every commit when the repo was
  edited from Windows; this fixes it at the git layer).

### Documentation

- **`docs/SECURITY.md`** — formal vulnerability disclosure policy
  (private reporting via GitHub Advisories or email), scope, and
  90-day coordinated disclosure window.
- **`docs/SUPPLY-CHAIN.md`** — a defender-facing map of every
  control in the chain, the threat model they protect against,
  and a "how to add a new dependency" runbook.

### Notes

- The `.npmrc` strict settings affect anyone who runs `npm install`
  locally, not just CI. If you previously did `npm install <pkg>`
  on a dev machine and got a `^x.y.z` line, it will now be `x.y.z`
  exact — expected.
- Pre-commit hook is opt-in: it only fires after the operator runs
  `git config core.hooksPath .githooks`. Done once per clone.
- Dependabot will start opening PRs the Monday after this is
  merged. Review them carefully — that is the supply-chain
  inspection step.

## v0.34.0 — 2026-06-13

### Security — CVE patches

- **`@fastify/jwt`** 9.0.4 → 10.1.0 — closes 6 CVEs on `fast-jwt`
  including a critical JWT auth bypass via empty HMAC secret and
  algorithm confusion (Peregrine was not exploitable thanks to
  explicit HS256 + non-empty secret, but the vulnerable code is now
  gone).
- **`@fastify/static`** 8.0.4 → 9.1.3 — closes path traversal in
  directory listing and route-guard bypass via encoded path
  separators (Peregrine did not use listing; still patched).
- **`dockerode`** 4.0.2 → 5.0.0 — pulls in `uuid` 11 with the
  missing buffer-bounds-check fix.
- **`vite`** 6.0.7 → 7.1.5 (latest 7.x) + `esbuild` forced via
  npm `overrides` to ^0.28.1 — closes the dev-server RCE
  (`NPM_CONFIG_REGISTRY` integrity bypass) and Windows arbitrary
  file read. Production builds were not exploitable; dev mode now
  patched too.
- Bumps: `fastify` 5.2.1 → 5.8.5, `socket.io` 4.8.1 → 4.8.3,
  `ssh2` 1.16.0 → 1.17.0.

Result: `npm audit` reports **0 vulnerabilities** in both backend
and frontend.

### Security — Hardening

- **JWT_SECRET fail-fast in production**: the panel now refuses to
  start when `NODE_ENV=production` and `JWT_SECRET` is missing,
  rather than silently using the public development fallback
  (`peregrine-development-secret-change-me`). Loud crash + clear
  error message pointing to `openssl rand -hex 32`.
- **Argon2id** explicit + tuned parameters (64 MiB / 3 iterations /
  parallelism 4, RFC 9106 / OWASP). Existing hashes (any Argon2
  variant) keep verifying via the embedded `$argon2X$` prefix; new
  hashes are written as Argon2id.
- **HTTP security headers** on every response:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (anti-clickjacking)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`...
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; ...`
  - **Anti-XSS even if React's escaping is bypassed**.
- **Anti-DoS Fastify limits**: 1 MiB JSON body, 5 s keep-alive,
  30 s request timeout, 30 s connection timeout. Mitigates
  slow-loris and small resource-exhaustion attacks.
- **Tor exit node detection** on `/api/auth/login` and SFTP auth.
  Refreshes the official Tor list every 12 h, rejects connections
  from listed IPs with HTTP 403 / SSH disconnect. `BLOCK_TOR=false`
  in `.env` to disable.
- **Anti-symlink-escape** in `lib/files.ts`: `realpath` + `lstat`
  checks block any symlink (file-manager + SFTP previously followed
  symlinks pointing outside the server's data directory).
- **Zero Trust input sanitisation library** (`lib/sanitize.ts` on
  both backend and frontend):
  - NFC Unicode normalisation
  - Reject C0 control chars, DEL, bidi override (RTL `‮`), zero-width
    chars (anti-`Remi​lulz` impersonation)
  - Length enforcement
  - Applied to server name, server description, schedule name,
    backup name, RCON `kick`/`ban`/`ban-ip` reasons.
- **RCON-specific sanitisation** also strips Minecraft chat colour
  codes (`§`) — prevents fake server messages in ban reasons.
- **Audit event log** (`audit_events` table, migration 16):
  forensic-grade tracking of backup downloads, file writes,
  file deletes (and extensible to RCON commands, permission
  changes, etc.). Queryable via SQL on the SQLite DB for
  post-compromise reconstruction.

### Security — Container hardening

- **Dockerfile runtime stage** purges `apt`, `dpkg`, `find`,
  `xargs`, `curl`, `wget`, `tar`, `gzip`, `ssh`, `scp`, `nc`,
  `ncat`, `xxd`, `base32`, `sftp` from the final image. The only
  significant binary an attacker can leverage post-RCE is `node`
  itself. **Anti-LOLBin defence**.
- **`docker-compose.yml` hardening**:
  - `security_opt: no-new-privileges:true` — blocks privilege
    escalation.
  - `read_only: true` — root filesystem immutable, only `/tmp`
    (50 MiB tmpfs) writable.
  - `cap_drop: ALL` + `cap_add: CHOWN, SETUID, SETGID,
    DAC_OVERRIDE, FOWNER` — minimum-privilege capability set.
  - `pids_limit: 1024`, `ulimits: nproc/nofile` — anti fork bomb.

### Notes

- Existing user passwords keep verifying — no forced password
  reset.
- The Tor list is fetched at startup over HTTPS from
  `check.torproject.org`. Sites behind strict egress filters
  should allow this destination, or set `BLOCK_TOR=false`.
- The CSP is restrictive. If you intend to add inline scripts
  later or third-party fonts, you'll need to relax it. The
  current panel ships entirely from self.
- This is the largest hardening release Peregrine has shipped.
  Test thoroughly before deploying to a production install.

## v0.33.0 — 2026-06-13

### Added

- **Edit user accounts from the Admin panel.** Each row in
  the Users table now has a **Modifier / Edit** button that
  opens a dialog where an admin can update:
  - the **username** (subject to uniqueness)
  - the **email** address (subject to uniqueness)
  - the **role** (USER ↔ ADMIN)

  Password is intentionally NOT editable — accounts that have
  lost their password should be deleted and re-invited
  through the existing "Regenerate invite" flow.

### Safety guards

- **Self-demote blocked**: the role dropdown is disabled when
  the admin is editing their own account, preventing the only
  admin from accidentally locking themselves out.
- **Last-admin protection**: the backend rejects (HTTP 409)
  any attempt to demote the last remaining ADMIN account.
- **Uniqueness enforced**: backend returns HTTP 409 if the
  new username or email conflicts with another account.

### Backend changes

- New helper `updateUser(id, { username?, email?, role? })`
  in `lib/users.ts`.
- New route `PATCH /api/admin/users/:id` accepting the same
  field shape, gated by the existing admin preHandler.

### Notes

- No database migration, no breaking change.
- Username pattern (`^[A-Za-z0-9._-]+$`) and length range
  (3-32) are reused from the create-user route for
  consistency.

## v0.32.0 — 2026-06-13

### Security

- **Resources (RAM / CPU) section** in the server's Settings
  tab is now **admin-only**. Previously it was visible to
  any owner, which leaked host-capacity information (max
  allocatable RAM / cores).
- **Disk usage section** in the server's Settings tab is now
  also **admin-only**. Previously visible to anyone with
  access to the server. The quota editor inside was already
  admin-only; the entire panel (usage bar, used MiB total)
  is now hidden from non-admins.

### Notes

- Pure frontend visibility change. The backend routes that
  modify resources / quota were already admin-only, so this
  is defence-in-depth: removing UI temptation in addition to
  the existing API rejection.
- For Remilulz_91 (admin) the UI is unchanged. For any
  non-admin owner or subuser, the two sections simply do
  not appear in the Settings tab.
- No database migration, no backend touch.

## v0.31.2 — 2026-06-13

### Fixed

- **Duplicate "Game version" section on the Settings tab.**
  The block was rendered twice because the JSX got inserted
  twice during the v0.31.1 file-restore. Both copies were
  byte-identical and functionally interchangeable; this
  release removes the duplicate so only one section is
  visible.

### Notes

- Pure frontend cleanup, no backend change, no database
  migration.

## v0.31.1 — 2026-06-12

### Fixed

- **Frontend build failure on v0.31.0.** The Settings tab's
  state hooks and `handleVersionChange` function were missing
  from the published v0.31.0 due to a file-write race
  condition during release. The new "Game version" JSX was in
  place but referenced symbols that didn't exist, so
  `tsc --noEmit` rejected the build with ~18 errors.
  v0.31.1 ships the complete, working implementation.

### Notes

- Pure frontend fix, no backend change, no database migration.
- If you tried to deploy v0.31.0 and the build failed, this
  is the version that actually works. Pull and rebuild as
  usual.

## v0.31.0 — 2026-06-12

### Added

- **Change the Minecraft version and / or loader on an
  existing server.** A new "Game version" section in the
  Settings tab lets you switch from e.g. Vanilla 1.21.2 to
  Vanilla 1.21.4, or from Fabric 1.21.1 to NeoForge 1.21.4,
  without recreating the server from scratch.
- New permission `settings.version` (assignable to subusers
  via the Users tab). The action is admin-only by default;
  subusers must be explicitly granted the permission.

### How it works

- The container is stopped, removed, and re-created with the
  new `VERSION` / `TYPE` env vars. The data volume on the
  dedicated disk (world, mods, configs, server.properties,
  whitelist, ops, bans, etc.) is **fully preserved**.
- The new version is validated against Mojang's manifest
  **before** the old container is removed, so a typo never
  leaves the server in a broken state.
- The server is intentionally left **stopped** after the
  change so the user can review the first-boot logs (mods may
  be incompatible with a new Minecraft version, for example).
- Failure modes: if container recreation fails, the server is
  marked as `INSTALL_FAILED` and the user can retry from the
  same Settings section. The new version is still recorded in
  the DB.

### Notes

- Works for **both Java and Bedrock** servers (loader picker
  only shown for Java since Bedrock has no loaders).
- Activity feed records every version change as
  `server.version_change` with a `old loader/version → new
  loader/version` detail.
- **No database migration.** The change reuses the existing
  `minecraft_version` and `loader` columns.

## v0.30.0 — 2026-06-12

### Added

- **Kick and Ban buttons in the live online player list**
  (Console tab, Java only). Each online player now has two
  small action buttons:
  - **Kick** — disconnects the player from the running session
    with an optional reason (`prompt`).
  - **Ban** — confirms first (`window.confirm`, since the
    action is permanent), then asks for an optional reason
    (`prompt`), and fires the RCON `ban` command. The player
    is kicked immediately and added to the `banned-players`
    list visible on the Game tab.
- Both actions are gated by the `players.manage` permission
  (already introduced in v0.29.0 for whitelist / ops / bans
  management), so subusers without the permission don't see
  the buttons at all.
- Activity feed entries are recorded as `server.player_kick`
  and `server.player_ban`.

### Backend changes

- New routes `POST /api/servers/:id/players/:name/kick` and
  `/ban`. Both:
  - Require the server to be Java (return 501 otherwise).
  - Require the server to be running (return 409 otherwise).
  - Validate the player name against the Mojang username
    pattern.
  - Execute the corresponding RCON command via the existing
    `sendConsoleCommand` helper, using the password parsed
    from `server.properties`.

### Notes

- Pure addition, no breaking changes, no database migration.
- Bedrock servers don't expose the player list panel at all,
  so the new buttons are not reachable on them.

## v0.29.2 — 2026-06-12

### Fixed

- **Header flash when switching sub-tabs inside the
  Whitelist / Ops / Bans section.** When the user was
  scrolled to the bottom of the Game tab and switched
  between the internal sub-tabs (e.g. Whitelist → Operators),
  the newly mounted tab briefly rendered an empty list (before
  its API fetch resolved). The page collapsed in height for a
  frame, the browser's scroll position got pinned to the now
  shorter content area, and the top of the page — server
  name, status badge, and the main tab bar with "Console" as
  the first entry — flashed into view.
  - Every sub-tab is now kept mounted in the DOM; inactive
    ones are simply hidden with `hidden` (Tailwind's
    `display: none`). State and fetched entries are preserved
    across switches, no remount, no API re-fetch.
  - A `min-h-[320px]` is pinned on the container as a safety
    net for the very first mount (when all 4 tabs are
    fetching in parallel).

### Notes

- Pure frontend change, no backend touch, no database migration.

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
