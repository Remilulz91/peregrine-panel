import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config';

/**
 * Ordered list of schema migrations. Each entry runs once, in order.
 *
 * SQLite's built-in "user_version" counter records how many migrations have
 * already been applied, so new ones can simply be appended to this array in
 * future phases — existing databases will be upgraded automatically.
 */
const MIGRATIONS: string[] = [
  // Migration 1 - user accounts
  `CREATE TABLE users (
     id            TEXT PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE,
     username      TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'USER',
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Migration 2 - game templates and game servers
  `CREATE TABLE game_templates (
     id              TEXT PRIMARY KEY,
     name            TEXT NOT NULL UNIQUE,
     docker_image    TEXT NOT NULL,
     default_version TEXT NOT NULL DEFAULT 'LATEST',
     created_at      TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE servers (
     id                TEXT PRIMARY KEY,
     owner_id          TEXT NOT NULL REFERENCES users(id),
     template_id       TEXT NOT NULL REFERENCES game_templates(id),
     name              TEXT NOT NULL,
     status            TEXT NOT NULL DEFAULT 'INSTALLING',
     container_id      TEXT,
     minecraft_version TEXT NOT NULL DEFAULT 'LATEST',
     memory_mb         INTEGER NOT NULL DEFAULT 2048,
     port              INTEGER NOT NULL UNIQUE,
     created_at        TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Migration 3 - resource limits and per-game template details
  `ALTER TABLE game_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'java';
   ALTER TABLE game_templates ADD COLUMN internal_port INTEGER NOT NULL DEFAULT 25565;
   ALTER TABLE game_templates ADD COLUMN port_protocol TEXT NOT NULL DEFAULT 'tcp';
   ALTER TABLE servers ADD COLUMN cpu_limit REAL NOT NULL DEFAULT 2;`,

  // Migration 4 - username login + invite tokens.
  `CREATE UNIQUE INDEX users_username_unique ON users(LOWER(username));
   CREATE TABLE user_invites (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     token      TEXT NOT NULL UNIQUE,
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Migration 5 - per-server activity log.
  `CREATE TABLE server_activity (
     id         TEXT PRIMARY KEY,
     server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
     kind       TEXT NOT NULL,
     details    TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX server_activity_by_server ON server_activity(server_id, created_at DESC);`,

  // Migration 6 - per-server backups (metadata only).
  `CREATE TABLE server_backups (
     id          TEXT PRIMARY KEY,
     server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     name        TEXT NOT NULL,
     file_path   TEXT NOT NULL,
     size_bytes  INTEGER NOT NULL DEFAULT 0,
     created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX server_backups_by_server ON server_backups(server_id, created_at DESC);`,

  // Migration 7 - per-server subusers with a granular permission set.
  `CREATE TABLE server_subusers (
     id          TEXT PRIMARY KEY,
     server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     permissions TEXT NOT NULL DEFAULT '[]',
     created_at  TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE(server_id, user_id)
   );
   CREATE INDEX server_subusers_by_user ON server_subusers(user_id);`,

  // Migration 8 - per-server recurring schedules.
  `CREATE TABLE server_schedules (
     id          TEXT PRIMARY KEY,
     server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     name        TEXT NOT NULL,
     action      TEXT NOT NULL DEFAULT 'backup.create',
     frequency   TEXT NOT NULL,
     hour        INTEGER NOT NULL DEFAULT 3,
     minute      INTEGER NOT NULL DEFAULT 0,
     day_of_week INTEGER NOT NULL DEFAULT 1,
     enabled     INTEGER NOT NULL DEFAULT 1,
     last_run_at TEXT,
     next_run_at TEXT,
     created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX server_schedules_by_next_run
     ON server_schedules(next_run_at) WHERE enabled = 1;`,

  // Migration 9 - per-user TOTP MFA + recovery codes.
  `ALTER TABLE users ADD COLUMN mfa_secret TEXT;
   ALTER TABLE users ADD COLUMN mfa_recovery_codes TEXT;`,

  // Migration 10 - per-server loader (vanilla / paper / fabric / forge).
  // Defaults to 'vanilla' so existing rows keep their current behaviour
  // (which was implicit vanilla). Bedrock servers will also carry
  // 'vanilla' — the column is meaningless for them but harmless.
  `ALTER TABLE servers ADD COLUMN loader TEXT NOT NULL DEFAULT 'vanilla';`,

  // Migration 11 - optional human-readable description per server.
  // Free-text field shown under the server name in the dashboard
  // and editable from the Settings tab. NULL means "no description".
  `ALTER TABLE servers ADD COLUMN description TEXT;`,

  // Migration 12 - per-server disk quota + measured usage.
  // disk_quota_mb is NULL = no quota enforcement (unlimited within
  // the host disk reserve). disk_used_mb is filled by the worker
  // (services/diskQuotaWorker.ts) on a 60 s tick using `du -sb`;
  // its initial value is 0 until the first tick lands.
  `ALTER TABLE servers ADD COLUMN disk_quota_mb INTEGER;
   ALTER TABLE servers ADD COLUMN disk_used_mb INTEGER NOT NULL DEFAULT 0;`,

  // Migration 13 - lead time (in minutes) for pre-restart in-game
  // warnings on schedule actions of kind 'server.restart' (v0.22.1+).
  // 0 = no warning, immediate restart. Up to 30 = broadcast a series
  // of `say` messages over RCON before actually restarting the
  // container, so players have time to log out cleanly.
  `ALTER TABLE server_schedules ADD COLUMN warning_minutes INTEGER NOT NULL DEFAULT 0;`,

  // Migration 14 - auth event log (v0.23.0+). Records authentication
  // attempts (success / failure / logout) so an admin can audit who
  // tried to log in, when, and from where. `user_id` is nullable
  // because failed-login events for unknown usernames have no user
  // to attribute to.
  `CREATE TABLE auth_events (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     kind       TEXT NOT NULL,
     user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
     username   TEXT,
     remote_ip  TEXT,
     details    TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX auth_events_by_created_at ON auth_events(created_at);
   CREATE INDEX auth_events_by_user ON auth_events(user_id);`,
];

/** Applies any migrations that have not been run on this database yet. */
function applyMigrations(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    database.exec(MIGRATIONS[version]);
  }
  database.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
}

/** Opens the database file, creating it (and its folder) if necessary. */
function openDatabase(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const database = new DatabaseSync(config.databasePath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(database);
  return database;
}

/**
 * The shared database connection, opened once for the whole backend.
 *
 * Uses Node's built-in SQLite engine — there is no separate database
 * server to install, and no native module or external download.
 */
export const db = openDatabase();
