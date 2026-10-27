import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, firstOpenDate, generateSlots, type WeeklyHours } from '../src/lib/slots.ts';
import {
  addDays,
  daysBetween,
  isValidDate,
  nowInSalon,
  toHHmm,
  toMinutes,
  weekdayOf,
} from '../src/lib/time.ts';

const open = (open: string, close: string) => [{ open, close }];
// 2026-09-21 is a Monday. Mon-Fri 09:00-12:00, Sat 09:00-11:00 and 14:00-16:00, Sunday closed.
const hours: WeeklyHours = [
  [],
  open('09:00', '12:00'),
  open('09:00', '12:00'),
  open('09:00', '12:00'),
  open('09:00', '12:00'),
  open('09:00', '12:00'),
  [...open('09:00', '11:00'), ...open('14:00', '16:00')],
];
const base = {
  date: '2026-09-21',
  durationMin: 60,
  hours,
  booked: [],
  closedDates: new Set<string>(),
  now: { date: '2026-09-20', minutes: 12 * 60 },
  rules: { ...DEFAULT_RULES, stepMin: 30 },
};

describe('time helpers', () => {
  it('converts between "HH:mm" and minutes', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toHHmm(570)).toBe('09:30');
    expect(toHHmm(0)).toBe('00:00');
  });
  it.each(['24:00', '9:30', '12:60', '', 'ab:cd'])('rejects time %j', (v) => expect(toMinutes(v)).toBeNull());
  it('validates real calendar dates only', () => {
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('26-01-01')).toBe(false);
  });
  it('knows weekdays and date arithmetic across month and year ends', () => {
    expect(weekdayOf('2026-09-21')).toBe(1);
    expect(weekdayOf('2026-09-20')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-20', '2026-10-20')).toBe(30);
  });
  it('reads the current date and time in Casablanca, not UTC', () => {
    // Morocco moved to permanent GMT/UTC+0 on 2026-09-20 (dropped its seasonal +1 offset entirely),
    // so by late Sept 2026 Casablanca local time is just UTC with no shift.
    expect(nowInSalon(new Date('2026-09-30T23:30:00Z'))).toEqual({ date: '2026-09-30', minutes: 1410 });
  });
});

describe('generateSlots', () => {
  it('offers every step inside opening hours so the service still fits before closing', () => {
    expect(generateSlots(base)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('a 90 minute service cannot start where it would overrun closing time', () => {
    expect(generateSlots({ ...base, durationMin: 90 })).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('returns nothing on a closed weekday', () => {
    expect(generateSlots({ ...base, date: '2026-09-27' })).toEqual([]);
  });

  it('supports a lunch break (two ranges) and never bridges the gap', () => {
    expect(generateSlots({ ...base, date: '2026-09-26', durationMin: 60 })).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '14:00',
      '14:30',
      '15:00',
    ]);
  });

  it('removes slots overlapping an existing booking (partial overlaps included)', () => {
    const booked = [{ startMin: 10 * 60, durationMin: 60 }];
    expect(generateSlots({ ...base, booked })).toEqual(['09:00', '11:00']);
  });

  it('allows back-to-back bookings', () => {
    const booked = [{ startMin: 9 * 60, durationMin: 60 }];
    expect(generateSlots({ ...base, booked })).toContain('10:00');
  });

  it('with two chairs, one booking leaves the slot open and two block it', () => {
    const rules = { ...base.rules, chairs: 2 };
    const one = [{ startMin: 9 * 60, durationMin: 60 }];
    const two = [...one, { startMin: 9 * 60 + 30, durationMin: 60 }];
    expect(generateSlots({ ...base, rules, booked: one })).toContain('09:00');
    const blocked = generateSlots({ ...base, rules, booked: two });
    expect(blocked).not.toContain('09:30');
    expect(blocked).not.toContain('09:00'); // 09:00-10:00 overlaps both at 09:30
    expect(blocked).toContain('10:30');
  });

  it('hides closure days', () => {
    expect(generateSlots({ ...base, closedDates: new Set(['2026-09-21']) })).toEqual([]);
  });

  it('enforces the lead time today and never offers the past', () => {
    const today = { ...base, date: '2026-09-21', now: { date: '2026-09-21', minutes: 9 * 60 + 40 } };
    // now 09:40 + 60 min lead = 10:40, so the first slot on the 30 min grid is 11:00
    expect(generateSlots(today)).toEqual(['11:00']);
    expect(generateSlots({ ...today, now: { date: '2026-09-21', minutes: 23 * 60 } })).toEqual([]);
  });

  it('a long lead time also blocks the early hours of tomorrow', () => {
    const q = {
      ...base,
      now: { date: '2026-09-20', minutes: 22 * 60 },
      rules: { ...base.rules, leadMin: 13 * 60 },
    };
    // 22:00 + 13h = 11:00 tomorrow
    expect(generateSlots(q)).toEqual(['11:00']);
  });

  it('respects the booking window: day 7 allowed, day 8 not, past and invalid dates rejected', () => {
    const rules = { ...base.rules, maxDaysAhead: 7 };
    const now = { date: '2026-09-21', minutes: 0 };
    expect(generateSlots({ ...base, rules, now, date: '2026-09-28' }).length).toBeGreaterThan(0);
    expect(generateSlots({ ...base, rules, now, date: '2026-09-29' })).toEqual([]);
    expect(generateSlots({ ...base, now, date: '2026-09-20' })).toEqual([]);
    expect(generateSlots({ ...base, date: 'nope' })).toEqual([]);
    expect(generateSlots({ ...base, durationMin: 0 })).toEqual([]);
  });

  it('ignores malformed ranges instead of crashing', () => {
    const bad: WeeklyHours = [
      [],
      [
        { open: '12:00', close: '09:00' },
        { open: 'xx', close: '10:00' },
      ],
      [],
      [],
      [],
      [],
      [],
    ];
    expect(generateSlots({ ...base, hours: bad })).toEqual([]);
  });
});

describe('firstOpenDate', () => {
  it('skips closed weekdays and closure dates', () => {
    // 2026-09-20 is a Sunday (closed); Monday 21st is a closure; first open is Tuesday 22nd
    expect(firstOpenDate('2026-09-20', hours, new Set(['2026-09-21']), 30)).toBe('2026-09-22');
  });
  it('returns null when nothing is open in the window', () => {
    expect(firstOpenDate('2026-09-20', [[], [], [], [], [], [], []], new Set(), 30)).toBeNull();
  });
});
