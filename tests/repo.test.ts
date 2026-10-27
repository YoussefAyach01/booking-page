import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/lib/db.ts';
import * as repo from '../src/lib/repo.ts';
import { bookingSchema, parseHoursForm, salonSchema } from '../src/lib/schemas.ts';
import { checkAdminPassword, createAdminToken, getSessionSecret, verifyAdminToken } from '../src/lib/auth.ts';
import { normalizeMoroccanPhone } from '../src/lib/phone.ts';
import { customerMessage, salonConfirmMessage } from '../src/lib/i18n.ts';

// Monday 2026-09-21 at 08:00 Casablanca (UTC+1 in September) = 07:00Z
const NOW = new Date('2026-09-21T07:00:00Z');
const DAY = '2026-09-22'; // Tuesday, default hours 09-13 and 15-19

let db: DB;
let cut: repo.Service;
beforeEach(() => {
  db = openDb(':memory:');
  const id = repo.addService(db, { name: 'Coupe', durationMin: 30, priceMad: 80 });
  cut = repo.getService(db, id)!;
});

const book = (over: Partial<Parameters<typeof repo.createBooking>[1]> = {}, now = NOW) =>
  repo.createBooking(
    db,
    { serviceId: cut.id, date: DAY, time: '10:00', name: 'Sara', phone: '212612345678', note: '', ...over },
    now,
  );

describe('booking', () => {
  it('books an open slot and removes it from availability', () => {
    expect(repo.availableSlots(db, cut, DAY, NOW)).toContain('10:00');
    const r = book();
    expect(r.ok).toBe(true);
    expect(repo.availableSlots(db, cut, DAY, NOW)).not.toContain('10:00');
    expect(repo.availableSlots(db, cut, DAY, NOW)).toContain('10:30');
  });

  it('refuses a second booking for the same slot (no double booking)', () => {
    expect(book().ok).toBe(true);
    expect(book({ name: 'Other', phone: '212698765432' })).toEqual({ ok: false, error: 'slot_unavailable' });
  });

  it('refuses times that are not offered: outside hours, off-grid, past, closed day', () => {
    for (const time of ['07:00', '10:07', '13:00', '19:00'])
      expect(book({ time })).toEqual({ ok: false, error: 'slot_unavailable' });
    expect(book({ date: '2026-09-20', time: '10:00' }).ok).toBe(false); // Sunday, closed
    expect(book({ date: '2026-09-21', time: '08:30' }).ok).toBe(false); // Monday but within lead time
    expect(book({ time: 'garbage' })).toEqual({ ok: false, error: 'slot_unavailable' });
  });

  it('a cancelled booking frees the slot again', () => {
    const r = book();
    if (!r.ok) throw new Error('setup');
    expect(repo.cancelByToken(db, r.value.token, NOW).ok).toBe(true);
    expect(repo.availableSlots(db, cut, DAY, NOW)).toContain('10:00');
    expect(book({ name: 'Next', phone: '212698765432' }).ok).toBe(true);
  });

  it('longer services block every slot they overlap', () => {
    const long = repo.getService(
      db,
      repo.addService(db, { name: 'Couleur', durationMin: 120, priceMad: 300 }),
    )!;
    repo.createBooking(
      db,
      { serviceId: long.id, date: DAY, time: '09:00', name: 'A', phone: '212612345678', note: '' },
      NOW,
    );
    const free = repo.availableSlots(db, cut, DAY, NOW);
    expect(free).not.toContain('10:30');
    expect(free).toContain('11:00');
  });

  it('limits active future bookings per phone number', () => {
    for (const time of ['09:00', '09:30', '10:00']) expect(book({ time }).ok).toBe(true);
    expect(book({ time: '10:30' })).toEqual({ ok: false, error: 'too_many_bookings' });
    expect(book({ time: '10:30', phone: '212600000001' }).ok).toBe(true);
  });

  it('rejects unknown or deactivated services', () => {
    expect(book({ serviceId: 999 })).toEqual({ ok: false, error: 'service_not_found' });
    repo.deactivateService(db, cut.id);
    expect(book()).toEqual({ ok: false, error: 'service_not_found' });
  });

  it('respects closures and salon rules (chairs)', () => {
    repo.addClosure(db, DAY, 'Fête');
    expect(repo.availableSlots(db, cut, DAY, NOW)).toEqual([]);
    repo.removeClosure(db, DAY);
    expect(repo.availableSlots(db, cut, DAY, NOW).length).toBeGreaterThan(0);

    book();
    const s = repo.getSalon(db);
    repo.updateSalon(db, {
      name: s.name,
      whatsapp: s.whatsapp,
      chairs: 2,
      stepMin: 15,
      leadMin: 60,
      maxDaysAhead: 30,
    });
    expect(repo.availableSlots(db, cut, DAY, NOW)).toContain('10:00');
  });

  it('keeps the service name and duration on old bookings after the service is edited', () => {
    const r = book();
    if (!r.ok) throw new Error('setup');
    repo.updateService(db, cut.id, { name: 'Coupe premium', durationMin: 60, priceMad: 120 });
    const b = repo.getBookingByToken(db, r.value.token)!;
    expect([b.service_name, b.duration_min]).toEqual(['Coupe', 30]);
  });
});

describe('customer cancellation by token', () => {
  it('cancels once, refuses unknown/malformed tokens, and refuses after the start time', () => {
    const r = book();
    if (!r.ok) throw new Error('setup');
    expect(repo.cancelByToken(db, 'a'.repeat(32), NOW)).toEqual({ ok: false, error: 'not_found' });
    expect(repo.cancelByToken(db, "x' OR '1'='1", NOW)).toEqual({ ok: false, error: 'not_found' });
    const afterStart = new Date('2026-09-22T09:30:00Z'); // 10:30 local
    expect(repo.cancelByToken(db, r.value.token, afterStart)).toEqual({
      ok: false,
      error: 'already_started',
    });
    expect(repo.getBookingByToken(db, r.value.token)?.status).toBe('pending');
    expect(repo.cancelByToken(db, r.value.token, NOW).ok).toBe(true);
    expect(repo.getBookingByToken(db, r.value.token)?.status).toBe('cancelled');
  });

  it('tokens are unguessable and unique per booking', () => {
    const a = book(),
      b = book({ time: '11:00' });
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(a.value.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.value.token).not.toBe(b.value.token);
  });
});

describe('admin queries', () => {
  it('lists upcoming bookings in chronological order and updates status', () => {
    book({ time: '11:00' });
    book({ time: '09:00', name: 'Early', phone: '212698765432' });
    const list = repo.listBookings(db, { fromDate: '2026-09-21' });
    expect(list.map((b) => b.customer_name)).toEqual(['Early', 'Sara']);
    expect(repo.setBookingStatus(db, list[0]!.id, 'confirmed')).toBe(true);
    expect(repo.listBookings(db, { fromDate: '2026-09-21' })[0]?.status).toBe('confirmed');
    expect(repo.listBookings(db, { fromDate: '2026-09-23' })).toEqual([]);
  });

  it('stores hostile text safely (SQL and HTML stay data)', () => {
    const r = book({ name: "Robert'); DROP TABLE bookings;--", note: '<script>alert(1)</script>' });
    expect(r.ok).toBe(true);
    expect(repo.listBookings(db, { fromDate: '2026-09-01' })[0]?.note).toBe('<script>alert(1)</script>');
  });
});

describe('validation', () => {
  const good = { serviceId: '1', date: DAY, time: '10:00', name: 'Sara', phone: '0612345678', note: '' };
  it('normalises the phone and coerces ids', () => {
    const p = bookingSchema.parse(good);
    expect(p.phone).toBe('212612345678');
    expect(p.serviceId).toBe(1);
  });
  it.each([
    { name: 'S' },
    { phone: '123' },
    { date: '2026-02-30' },
    { time: '25:00' },
    { serviceId: '-1' },
    { note: 'x'.repeat(301) },
  ])('rejects %j', (patch) => expect(bookingSchema.safeParse({ ...good, ...patch }).success).toBe(false));

  it('validates salon settings', () => {
    const ok = {
      name: 'Chez Sara',
      whatsapp: '0612345678',
      chairs: '2',
      stepMin: '15',
      leadMin: '60',
      maxDaysAhead: '30',
    };
    expect(salonSchema.safeParse(ok).success).toBe(true);
    expect(salonSchema.safeParse({ ...ok, stepMin: '7' }).success).toBe(false);
    expect(salonSchema.safeParse({ ...ok, chairs: '0' }).success).toBe(false);
  });

  it('parses the weekly hours form and rejects reversed, half-filled and overlapping ranges', () => {
    const form = (m: Record<string, string>) => (k: string) => m[k] ?? '';
    const okForm = form({ 'o1-1': '09:00', 'c1-1': '12:00', 'o2-1': '14:00', 'c2-1': '18:00' });
    const r = parseHoursForm(okForm);
    expect(r.ok && r.hours[1]).toEqual([
      { open: '09:00', close: '12:00' },
      { open: '14:00', close: '18:00' },
    ]);
    expect(r.ok && r.hours[0]).toEqual([]);
    expect(parseHoursForm(form({ 'o1-1': '12:00', 'c1-1': '09:00' })).ok).toBe(false);
    expect(parseHoursForm(form({ 'o1-1': '09:00' })).ok).toBe(false);
    expect(
      parseHoursForm(form({ 'o1-1': '09:00', 'c1-1': '13:00', 'o2-1': '12:00', 'c2-1': '15:00' })).ok,
    ).toBe(false);
  });
});

describe('admin auth', () => {
  it('checks the password in constant time and refuses weak or missing config', () => {
    expect(checkAdminPassword('correct-horse-1', 'correct-horse-1')).toBe(true);
    expect(checkAdminPassword('wrong', 'correct-horse-1')).toBe(false);
    expect(checkAdminPassword('', undefined)).toBe(false);
    expect(checkAdminPassword('short', 'short')).toBe(false);
  });
  const secret = 's'.repeat(32);
  it('signs, verifies, and rejects tampered or expired admin tokens', () => {
    const t = createAdminToken(secret, 1000);
    expect(verifyAdminToken(t, secret, 2000)).toBe(true);
    expect(verifyAdminToken(t, 'x'.repeat(32), 2000)).toBe(false);
    expect(verifyAdminToken(t, secret, 1000 + 13 * 3600 * 1000)).toBe(false);
    const forged = Buffer.from(JSON.stringify({ admin: true, exp: 9e15 })).toString('base64url');
    expect(verifyAdminToken(`${forged}.${t.split('.')[1]}`, secret, 2000)).toBe(false);
    for (const bad of [undefined, '', 'a', 'a.b']) expect(verifyAdminToken(bad, secret)).toBe(false);
  });
  it('requires a real secret in production', () => {
    expect(() => getSessionSecret({ NODE_ENV: 'production' })).toThrow();
    expect(getSessionSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });
});

describe('phone and messages', () => {
  it('normalises Moroccan numbers', () => {
    expect(normalizeMoroccanPhone('06 12 34 56 78')).toBe('212612345678');
    expect(normalizeMoroccanPhone('+212612345678')).toBe('212612345678');
    expect(normalizeMoroccanPhone('0112345678')).toBeNull();
  });
  it('builds French and Arabic WhatsApp texts with the right details', () => {
    const b = { customerName: 'Sara', serviceName: 'Coupe', date: DAY, startMin: 10 * 60 };
    expect(customerMessage('fr', b)).toContain('10:00');
    expect(customerMessage('fr', b)).toContain('Coupe');
    expect(customerMessage('ar', b)).toContain('السلام عليكم');
    expect(salonConfirmMessage('Chez Sara', b)).toContain('confirmé');
  });
});
