import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

/** Mon-Sat 09:00-13:00 and 15:00-19:00, Sunday closed. Index 0 = Sunday. */
const DEFAULT_HOURS = JSON.stringify(
  [0, 1, 2, 3, 4, 5, 6].map((d) =>
    d === 0
      ? []
      : [
          { open: '09:00', close: '13:00' },
          { open: '15:00', close: '19:00' },
        ],
  ),
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS salon (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  chairs INTEGER NOT NULL DEFAULT 1 CHECK (chairs BETWEEN 1 AND 20),
  step_min INTEGER NOT NULL DEFAULT 15 CHECK (step_min IN (5, 10, 15, 20, 30, 60)),
  lead_min INTEGER NOT NULL DEFAULT 60 CHECK (lead_min BETWEEN 0 AND 10080),
  max_days_ahead INTEGER NOT NULL DEFAULT 30 CHECK (max_days_ahead BETWEEN 1 AND 365),
  hours_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  price_mad INTEGER NOT NULL CHECK (price_mad >= 0),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  service_name TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, start_min);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(customer_phone);
CREATE TABLE IF NOT EXISTS closures (
  date TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT ''
);
`;

/** Open (and migrate) the database. Use ":memory:" in tests. */
export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO salon (id, name, whatsapp, hours_json) VALUES (1, ?, ?, ?)').run(
    'Mon Salon',
    '212600000000',
    DEFAULT_HOURS,
  );
  return db;
}

const globalForDb = globalThis as unknown as { __bookingDb?: DB };

export function getDb(): DB {
  globalForDb.__bookingDb ??= openDb(process.env.DATABASE_PATH ?? './data/booking.db');
  return globalForDb.__bookingDb;
}
