# Changelog

All notable changes to Peregrine are documented in this file.

## v0.7.0 — 2026-05-27

Two-factor authentication (TOTP). Each user can secure their account
with a 6-digit code from any authenticator app (Google Authenticator,
Authy, 1Password, Bitwarden, ...), backed by single-use recovery
codes in case the phone is lost.

### Added

- **My account page** at `/account`, reachable by clicking your username
  in the header. Shows profile info and the new Security section.
- **Two-step verification (2FA)** with TOTP:
  - **Setup wizard** with a QR code (and the secret as text for manual
    entry), a confirmation code field, and the 8 single-use recovery
    codes shown once at the end.
  - **Two-step login**: username + password → 6-digit code from your
    authenticator → dashboard. The intermediate state lives in a
    short-lived (5 min) httpOnly cookie.
  - **Recovery codes**: 8 codes, Argon2-hashed at rest, consumed one
    at a time. The login screen has a "Use a recovery code instead"
    link if you've lost your phone.
  - **Disable 2FA** re-asks for the password (defence in depth against
    a hijacked open session).
- **Admin reset 2FA** — administrators can wipe a user's MFA secret
  + recovery codes from the user list (handy when someone has lost
  both their phone and their codes). The user can re-enable from
  their Account page after they log back in.
- Activity log entries unchanged for now (MFA actions happen at the
  user level, not per server).
- **New REST endpoints** under `/api/auth/mfa/*`: `setup`, `enable`,
  `disable`, `verify`, plus `/api/admin/users/:id/mfa-reset`.
- **No external dependency** on the backend: TOTP (RFC 6238) and base32
  encoding are hand-rolled in ~80 lines of Node `crypto`. The frontend
  adds a single lightweight dep (`qrcode`) for the QR rendering.

### Changed

- `POST /api/auth/login` returns `{ requiresMfa: true }` instead of a
  session when MFA is enabled on the account. The client then calls
  `POST /api/auth/mfa/verify` with the code (or a recovery code) to
  complete the login.
- `GET /api/auth/me` and `GET /api/admin/users` now expose `mfaEnabled`
  (and `mfaRecoveryRemaining` on `/me`) so the UI can show the right
  badges and buttons.

### Notes

- 2FA is **optional** for every account. Existing logins keep working
  unchanged until each user opts in.
- Migration 9 adds `mfa_secret` and `mfa_recovery_codes` columns to the
  `users` table.

## v0.6.0 — 2026-05-27

Scheduled tasks: owners can now have Peregrine create backups
automatically on a recurring schedule (every hour / day / week), with a
"run now" button to verify the setup without waiting.

### Added

- **Schedules tab** on every server detail page (owner-only). Create,
  edit, enable/disable inline, run now, delete.
- **Background worker** with a 60 s tick loop, serial execution, skips
  missed slots after downtime.
- **Disk-aware**: scheduled runs reuse the manual-backup preflight; on
  a tight disk the run is logged as `schedule.skipped` and the
  schedule stays enabled for the next slot.
- New REST endpoints under `/api/servers/:id/schedules/*`.
- Migration 8 adds the `server_schedules` table.

## v0.5.0 — 2026-05-27

Subusers + granular permissions. Owners can grant another existing
account access to one of their servers with a custom permission set.
The UI hides every action the viewer cannot perform; the backend
enforces the same rules.

## v0.4.0 — 2026-05-27

Backups + disk safety. Take, restore, download and delete snapshots
stored on the dedicated disk, with a 2 GiB / 5 % reserve that prevents
a runaway server from filling the disk.

## v0.3.0 — 2026-05-27

Detail-page architecture: list becomes pure navigation, every per-server
action moves into a dedicated detail page with tabs (Console, Files,
Network, Settings, Activity).

## v0.2.0 — 2026-05-27

User management: the admin creates accounts and shares single-use
invitation links so users pick their own password. Login by username
(case-insensitive) instead of email.

## v0.1.0 — 2026-05-22

The first release of the Peregrine MVP — a self-hostable game server
panel. Accounts, bilingual UI, Minecraft Java / Bedrock servers in
isolated Docker containers, live console, file manager, resource
limits, Caddy + UFW + fail2ban deployment.
