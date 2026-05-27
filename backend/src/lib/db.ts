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

  // Migration 4 - username login (case-insensitive unique) + invite tokens.
  // The expression index makes "alice" and "ALICE" collide, so usernames
  // can be compared without surprises across cases.
  `CREATE UNIQUE INDEX users_username_unique ON users(LOWER(username));
   CREATE TABLE user_invites (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     token      TEXT NOT NULL UNIQUE,
     expires_at TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );`,

  // Migration 5 - per-server activity log. Each event is a small row
  // describing what happened (kind), who did it (actor_id, nullable for
  // system events), and optional human-readable details. Cascading deletes
  // keep the table tidy when a server or user is removed.
  `CREATE TABLE server_activity (
     id         TEXT PRIMARY KEY,
     server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
     kind       TEXT NOT NULL,
     details    TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX server_activity_by_server ON server_activity(server_id, created_at DESC);`,
];

/** Applies any migrations that have not been run on this database yet. */
function applyMigrations(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    database.exec(MIGRATIONS[version]);
  }
  // PRAGMA does not accept bound parameters; the value is our own integer.
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
