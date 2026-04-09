import type Database from 'better-sqlite3';
import type {
  Task, CreateTaskInput, TaskGroup, Profile, CreateProfileInput,
  LogEntry, LogFilters, Settings,
} from '../types';
import { DEFAULT_SETTINGS, TaskStatus } from '../types';
import { encrypt, decrypt } from '../main/keychain';

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function dbGetTasks(db: Database.Database): Task[] {
  return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Task[];
}

export function dbGetTask(db: Database.Database, id: number): Task | null {
  return (db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task) ?? null;
}

export function dbCreateTask(db: Database.Database, input: CreateTaskInput): Task {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO tasks
      (group_id, retailer, product_url, keywords, size, quantity, profile_id, proxy, poll_interval, status, created_at, updated_at)
    VALUES
      (@group_id, @retailer, @product_url, @keywords, @size, @quantity, @profile_id, @proxy, @poll_interval, @status, @now, @now)
  `).run({
    group_id:      input.group_id     ?? null,
    retailer:      input.retailer,
    product_url:   input.product_url  ?? null,
    keywords:      input.keywords     ?? null,
    size:          input.size         ?? null,
    quantity:      input.quantity     ?? 1,
    profile_id:    input.profile_id   ?? null,
    proxy:         input.proxy        ?? null,
    poll_interval: input.poll_interval ?? 3000,
    status:        TaskStatus.Idle,
    now,
  });
  return dbGetTask(db, info.lastInsertRowid as number)!;
}

export function dbUpdateTask(db: Database.Database, id: number, input: Partial<CreateTaskInput>): Task {
  const current = dbGetTask(db, id);
  if (!current) throw new Error(`Task ${id} not found`);

  const merged = { ...current, ...input, updated_at: Date.now() };
  db.prepare(`
    UPDATE tasks SET
      group_id      = @group_id,
      retailer      = @retailer,
      product_url   = @product_url,
      keywords      = @keywords,
      size          = @size,
      quantity      = @quantity,
      profile_id    = @profile_id,
      proxy         = @proxy,
      poll_interval = @poll_interval,
      updated_at    = @updated_at
    WHERE id = @id
  `).run({ ...merged, id });

  return dbGetTask(db, id)!;
}

export function dbUpdateTaskStatus(db: Database.Database, id: number, status: TaskStatus): void {
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

export function dbDeleteTask(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// ─── Task Groups ──────────────────────────────────────────────────────────────

export function dbGetGroups(db: Database.Database): TaskGroup[] {
  return db.prepare('SELECT * FROM task_groups ORDER BY created_at ASC').all() as TaskGroup[];
}

export function dbCreateGroup(db: Database.Database, name: string): TaskGroup {
  const now = Date.now();
  const info = db.prepare('INSERT INTO task_groups (name, created_at) VALUES (?, ?)')
    .run(name, now);
  return db.prepare('SELECT * FROM task_groups WHERE id = ?')
    .get(info.lastInsertRowid) as TaskGroup;
}

export function dbDeleteGroup(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM task_groups WHERE id = ?').run(id);
}

export function dbGetTasksByGroup(db: Database.Database, groupId: number): Task[] {
  return db.prepare('SELECT * FROM tasks WHERE group_id = ?').all(groupId) as Task[];
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    ...row,
    billing_same_as_shipping: Boolean(row.billing_same_as_shipping),
    card_number: row.card_number_enc ? decrypt(row.card_number_enc as string) : '',
    card_cvv:    row.card_cvv_enc    ? decrypt(row.card_cvv_enc    as string) : '',
  } as Profile;
}

export function dbGetProfiles(db: Database.Database): Profile[] {
  const rows = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(rowToProfile);
}

export function dbGetProfile(db: Database.Database, id: number): Profile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function dbCreateProfile(db: Database.Database, input: CreateProfileInput): Profile {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO profiles (
      name, email, phone,
      ship_first_name, ship_last_name, ship_address1, ship_address2,
      ship_city, ship_state, ship_zip, ship_country,
      billing_same_as_shipping,
      bill_first_name, bill_last_name, bill_address1, bill_address2,
      bill_city, bill_state, bill_zip, bill_country,
      card_name, card_number_enc, card_expiry, card_cvv_enc,
      created_at
    ) VALUES (
      @name, @email, @phone,
      @ship_first_name, @ship_last_name, @ship_address1, @ship_address2,
      @ship_city, @ship_state, @ship_zip, @ship_country,
      @billing_same_as_shipping,
      @bill_first_name, @bill_last_name, @bill_address1, @bill_address2,
      @bill_city, @bill_state, @bill_zip, @bill_country,
      @card_name, @card_number_enc, @card_expiry, @card_cvv_enc,
      @now
    )
  `).run({
    name:  input.name,
    email: input.email,
    phone: input.phone ?? null,
    ship_first_name: input.ship_first_name,
    ship_last_name:  input.ship_last_name,
    ship_address1:   input.ship_address1,
    ship_address2:   input.ship_address2 ?? null,
    ship_city:       input.ship_city,
    ship_state:      input.ship_state,
    ship_zip:        input.ship_zip,
    ship_country:    input.ship_country ?? 'US',
    billing_same_as_shipping: input.billing_same_as_shipping !== false ? 1 : 0,
    bill_first_name: input.bill_first_name ?? null,
    bill_last_name:  input.bill_last_name  ?? null,
    bill_address1:   input.bill_address1   ?? null,
    bill_address2:   input.bill_address2   ?? null,
    bill_city:       input.bill_city       ?? null,
    bill_state:      input.bill_state      ?? null,
    bill_zip:        input.bill_zip        ?? null,
    bill_country:    input.bill_country    ?? null,
    card_name:       input.card_name,
    card_number_enc: encrypt(input.card_number),
    card_expiry:     input.card_expiry,
    card_cvv_enc:    encrypt(input.card_cvv),
    now,
  });
  return dbGetProfile(db, info.lastInsertRowid as number)!;
}

export function dbUpdateProfile(db: Database.Database, id: number, input: Partial<CreateProfileInput>): Profile {
  const current = dbGetProfile(db, id);
  if (!current) throw new Error(`Profile ${id} not found`);

  const merged = { ...current, ...input };
  db.prepare(`
    UPDATE profiles SET
      name = @name, email = @email, phone = @phone,
      ship_first_name = @ship_first_name, ship_last_name = @ship_last_name,
      ship_address1 = @ship_address1, ship_address2 = @ship_address2,
      ship_city = @ship_city, ship_state = @ship_state,
      ship_zip = @ship_zip, ship_country = @ship_country,
      billing_same_as_shipping = @billing_same_as_shipping,
      bill_first_name = @bill_first_name, bill_last_name = @bill_last_name,
      bill_address1 = @bill_address1, bill_address2 = @bill_address2,
      bill_city = @bill_city, bill_state = @bill_state,
      bill_zip = @bill_zip, bill_country = @bill_country,
      card_name = @card_name, card_number_enc = @card_number_enc,
      card_expiry = @card_expiry, card_cvv_enc = @card_cvv_enc
    WHERE id = @id
  `).run({
    ...merged,
    id,
    billing_same_as_shipping: merged.billing_same_as_shipping ? 1 : 0,
    card_number_enc: encrypt(merged.card_number),
    card_cvv_enc:    encrypt(merged.card_cvv),
  });
  return dbGetProfile(db, id)!;
}

export function dbDeleteProfile(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export function dbInsertLog(
  db: Database.Database,
  taskId: number | null,
  level: string,
  message: string,
): LogEntry {
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO logs (task_id, level, message, timestamp) VALUES (?, ?, ?, ?)'
  ).run(taskId, level, message, now);
  return { id: info.lastInsertRowid as number, task_id: taskId, level: level as LogEntry['level'], message, timestamp: now };
}

export function dbGetLogs(db: Database.Database, filters: LogFilters = {}): LogEntry[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.task_id !== undefined) { conditions.push('task_id = ?');  params.push(filters.task_id); }
  if (filters.level   !== undefined) { conditions.push('level = ?');    params.push(filters.level); }
  if (filters.since   !== undefined) { conditions.push('timestamp >= ?'); params.push(filters.since); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ? `LIMIT ${filters.limit}` : 'LIMIT 500';

  return db.prepare(`SELECT * FROM logs ${where} ORDER BY timestamp DESC ${limit}`)
    .all(...params) as LogEntry[];
}

export function dbClearLogs(db: Database.Database): void {
  db.prepare('DELETE FROM logs').run();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function dbGetSettings(db: Database.Database): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(map)) {
    const key = k as keyof Settings;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'number')  (settings as Record<string, unknown>)[key] = Number(v);
    else if (typeof def === 'boolean') (settings as Record<string, unknown>)[key] = v === 'true';
    else (settings as Record<string, unknown>)[key] = key === 'imap_password' ? (v ? decrypt(v) : '') : v;
  }
  return settings;
}

export function dbSaveSettings(db: Database.Database, partial: Partial<Settings>): void {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const upsertMany = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v);
  });

  const entries: [string, string][] = Object.entries(partial).map(([k, v]) => {
    if (k === 'imap_password') return [k, v ? encrypt(String(v)) : ''];
    return [k, String(v)];
  });
  upsertMany(entries);
}
