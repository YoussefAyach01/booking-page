import { randomBytes } from 'node:crypto';
import type { DB } from './db.ts';
import { generateSlots, type BookedInterval, type SlotRules, type WeeklyHours } from './slots.ts';
import { isValidDate, nowInSalon, toMinutes } from './time.ts';

export interface Salon {
  name: string;
  whatsapp: string;
  hours: WeeklyHours;
  rules: SlotRules;
}
export interface Service {
  id: number;
  name: string;
  duration_min: number;
  price_mad: number;
  active: number;
}
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export interface Booking {
  id: number;
  token: string;
  service_id: number;
  service_name: string;
  duration_min: number;
  date: string;
  start_min: number;
  customer_name: string;
  customer_phone: string;
  note: string;
  status: BookingStatus;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_ACTIVE_PER_PHONE = 3;

const one = <T>(row: unknown): T | undefined => (row ?? undefined) as T | undefined;
const many = <T>(rows: unknown): T[] => rows as T[];

// ---------- salon ----------
export function getSalon(db: DB): Salon {
  const r = db.prepare('SELECT * FROM salon WHERE id = 1').get() as Record<string, string | number>;
  return {
    name: String(r.name),
    whatsapp: String(r.whatsapp),
    hours: JSON.parse(String(r.hours_json)) as WeeklyHours,
    rules: {
      chairs: Number(r.chairs),
      stepMin: Number(r.step_min),
      leadMin: Number(r.lead_min),
      maxDaysAhead: Number(r.max_days_ahead),
    },
  };
}

export function updateSalon(
  db: DB,
  d: {
    name: string;
    whatsapp: string;
    chairs: number;
    stepMin: number;
    leadMin: number;
    maxDaysAhead: number;
  },
): void {
  db.prepare(
    'UPDATE salon SET name = ?, whatsapp = ?, chairs = ?, step_min = ?, lead_min = ?, max_days_ahead = ? WHERE id = 1',
  ).run(d.name, d.whatsapp, d.chairs, d.stepMin, d.leadMin, d.maxDaysAhead);
}

export function setHours(db: DB, hours: WeeklyHours): void {
  db.prepare('UPDATE salon SET hours_json = ? WHERE id = 1').run(JSON.stringify(hours));
}

// ---------- services ----------
export function listServices(db: DB, opts: { activeOnly: boolean }): Service[] {
  return many<Service>(
    db.prepare(`SELECT * FROM services ${opts.activeOnly ? 'WHERE active = 1' : ''} ORDER BY id`).all(),
  );
}
export function getService(db: DB, id: number): Service | undefined {
  return one<Service>(db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(id));
}
export function addService(db: DB, d: { name: string; durationMin: number; priceMad: number }): number {
  const r = db
    .prepare('INSERT INTO services (name, duration_min, price_mad) VALUES (?, ?, ?)')
    .run(d.name, d.durationMin, d.priceMad);
  return Number(r.lastInsertRowid);
}
export function updateService(
  db: DB,
  id: number,
  d: { name: string; durationMin: number; priceMad: number },
): boolean {
  return (
    Number(
      db
        .prepare('UPDATE services SET name = ?, duration_min = ?, price_mad = ? WHERE id = ?')
        .run(d.name, d.durationMin, d.priceMad, id).changes,
    ) > 0
  );
}
/** Soft delete: past bookings keep pointing at the service. */
export function deactivateService(db: DB, id: number): boolean {
  return Number(db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(id).changes) > 0;
}

// ---------- closures ----------
export function listClosures(db: DB): { date: string; reason: string }[] {
  return many(db.prepare('SELECT date, reason FROM closures ORDER BY date').all());
}
export function addClosure(db: DB, date: string, reason: string): void {
  db.prepare('INSERT OR REPLACE INTO closures (date, reason) VALUES (?, ?)').run(date, reason);
}
export function removeClosure(db: DB, date: string): void {
  db.prepare('DELETE FROM closures WHERE date = ?').run(date);
}

// ---------- availability ----------
function activeIntervals(db: DB, date: string): BookedInterval[] {
  return many<{ start_min: number; duration_min: number }>(
    db
      .prepare("SELECT start_min, duration_min FROM bookings WHERE date = ? AND status != 'cancelled'")
      .all(date),
  ).map((b) => ({ startMin: b.start_min, durationMin: b.duration_min }));
}

export function availableSlots(
  db: DB,
  service: Pick<Service, 'duration_min'>,
  date: string,
  now = new Date(),
): string[] {
  if (!isValidDate(date)) return [];
  const salon = getSalon(db);
  const closed = new Set(listClosures(db).map((c) => c.date));
  return generateSlots({
    date,
    durationMin: service.duration_min,
    hours: salon.hours,
    booked: activeIntervals(db, date),
    closedDates: closed,
    now: nowInSalon(now),
    rules: salon.rules,
  });
}

// ---------- bookings ----------
export function createBooking(
  db: DB,
  input: { serviceId: number; date: string; time: string; name: string; phone: string; note: string },
  now = new Date(),
): Result<{ token: string }> {
  const service = getService(db, input.serviceId);
  if (!service) return { ok: false, error: 'service_not_found' };
  const start = toMinutes(input.time);
  if (start === null) return { ok: false, error: 'slot_unavailable' };

  // BEGIN IMMEDIATE takes the write lock first, so two people cannot both pass the availability check for the same slot.
  db.exec('BEGIN IMMEDIATE');
  try {
    const active = one<{ n: number }>(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM bookings WHERE customer_phone = ? AND status != 'cancelled' AND date >= ?",
        )
        .get(input.phone, nowInSalon(now).date),
    );
    if ((active?.n ?? 0) >= MAX_ACTIVE_PER_PHONE) {
      db.exec('ROLLBACK');
      return { ok: false, error: 'too_many_bookings' };
    }
    if (!availableSlots(db, service, input.date, now).includes(input.time)) {
      db.exec('ROLLBACK');
      return { ok: false, error: 'slot_unavailable' };
    }
    const token = randomBytes(16).toString('hex');
    db.prepare(
      `INSERT INTO bookings (token, service_id, service_name, duration_min, date, start_min, customer_name, customer_phone, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      token,
      service.id,
      service.name,
      service.duration_min,
      input.date,
      start,
      input.name,
      input.phone,
      input.note,
    );
    db.exec('COMMIT');
    return { ok: true, value: { token } };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getBookingByToken(db: DB, token: string): Booking | undefined {
  if (!/^[0-9a-f]{32}$/.test(token)) return undefined;
  return one<Booking>(db.prepare('SELECT * FROM bookings WHERE token = ?').get(token));
}

/** A customer may cancel their own booking (by secret token) until it has started. */
export function cancelByToken(db: DB, token: string, now = new Date()): Result<undefined> {
  const b = getBookingByToken(db, token);
  if (!b) return { ok: false, error: 'not_found' };
  const n = nowInSalon(now);
  if (b.date < n.date || (b.date === n.date && b.start_min <= n.minutes))
    return { ok: false, error: 'already_started' };
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
  return { ok: true, value: undefined };
}

export function listBookings(db: DB, opts: { fromDate: string }): Booking[] {
  return many<Booking>(
    db.prepare('SELECT * FROM bookings WHERE date >= ? ORDER BY date, start_min, id').all(opts.fromDate),
  );
}

export function setBookingStatus(db: DB, id: number, status: BookingStatus): boolean {
  return Number(db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id).changes) > 0;
}
