import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { SCHEMA_SQL } from './schema';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(app.getPath('userData'), 'checkout-bot.db');
  _db = new Database(dbPath, { verbose: undefined });
  _db.exec(SCHEMA_SQL);
  runMigrations(_db);
  return _db;
}

/**
 * Forward-only migrations. Each statement is attempted once; if the column
 * already exists SQLite throws an error which we silently ignore.
 */
function runMigrations(db: Database.Database): void {
  const migrations = [
    'ALTER TABLE tasks ADD COLUMN offer_id TEXT',
    'ALTER TABLE tasks ADD COLUMN skip_monitoring INTEGER NOT NULL DEFAULT 0',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists — ignore */ }
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
