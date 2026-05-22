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
