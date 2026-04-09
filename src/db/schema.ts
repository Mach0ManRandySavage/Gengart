export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS task_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id      INTEGER REFERENCES task_groups(id) ON DELETE SET NULL,
  retailer      TEXT    NOT NULL,
  product_url   TEXT,
  keywords      TEXT,
  size          TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  profile_id    INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  proxy         TEXT,
  status        TEXT    NOT NULL DEFAULT 'idle',
  poll_interval INTEGER NOT NULL DEFAULT 3000,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS profiles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,

  ship_first_name TEXT NOT NULL,
  ship_last_name  TEXT NOT NULL,
  ship_address1   TEXT NOT NULL,
  ship_address2   TEXT,
  ship_city       TEXT NOT NULL,
  ship_state      TEXT NOT NULL,
  ship_zip        TEXT NOT NULL,
  ship_country    TEXT NOT NULL DEFAULT 'US',

  billing_same_as_shipping INTEGER NOT NULL DEFAULT 1,
  bill_first_name TEXT,
  bill_last_name  TEXT,
  bill_address1   TEXT,
  bill_address2   TEXT,
  bill_city       TEXT,
  bill_state      TEXT,
  bill_zip        TEXT,
  bill_country    TEXT,

  card_name       TEXT NOT NULL,
  card_number_enc TEXT NOT NULL,
  card_expiry     TEXT NOT NULL,
  card_cvv_enc    TEXT NOT NULL,

  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  level     TEXT    NOT NULL DEFAULT 'info',
  message   TEXT    NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_task_id   ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks(group_id);
`;
