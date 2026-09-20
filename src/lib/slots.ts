import { addDays, daysBetween, isValidDate, toHHmm, toMinutes, weekdayOf } from './time.ts';

export interface DayRange {
  open: string; // "HH:mm"
  close: string;
}
/** Index 0 = Sunday ... 6 = Saturday. An empty array means closed that day. */
export type WeeklyHours = DayRange[][];

export interface BookedInterval {
  startMin: number;
  durationMin: number;
}

export interface SlotRules {
  /** How many customers can be served at the same time (chairs / staff). */
  chairs: number;
  /** Smallest gap between two offered start times. */
  stepMin: number;
  /** A slot must start at least this many minutes from now. */
  leadMin: number;
  /** How far ahead customers can book, in days (today = day 0). */
  maxDaysAhead: number;
}

export interface SlotQuery {
  date: string;
  durationMin: number;
  hours: WeeklyHours;
  /** Active (pending or confirmed) bookings on that date. */
  booked: BookedInterval[];
  /** Whole-day closures ("YYYY-MM-DD"), e.g. holidays. */
  closedDates: ReadonlySet<string>;
  now: { date: string; minutes: number };
  rules: SlotRules;
}

export const DEFAULT_RULES: SlotRules = { chairs: 1, stepMin: 15, leadMin: 60, maxDaysAhead: 30 };

/** Highest number of simultaneous bookings if a new one were added at [start, start + duration). */
function peakLoad(start: number, duration: number, booked: BookedInterval[]): number {
  const end = start + duration;
  const overlapping = booked.filter((b) => b.startMin < end && b.startMin + b.durationMin > start);
  // The load only changes when something starts, so check the candidate start and each overlapping start.
  const points = [start, ...overlapping.map((b) => b.startMin).filter((s) => s > start && s < end)];
  let peak = 0;
  for (const p of points) {
    const load = overlapping.filter((b) => b.startMin <= p && b.startMin + b.durationMin > p).length;
    peak = Math.max(peak, load);
  }
  return peak + 1; // + the new booking itself
}

/** All bookable start times ("HH:mm") for one service on one date. Pure: pass in everything it needs. */
export function generateSlots(q: SlotQuery): string[] {
  const { date, durationMin, rules } = q;
  if (!isValidDate(date) || durationMin <= 0 || rules.stepMin <= 0) return [];
  const ahead = daysBetween(q.now.date, date);
  if (ahead < 0 || ahead > rules.maxDaysAhead) return [];
  if (q.closedDates.has(date)) return [];

  const ranges = q.hours[weekdayOf(date)] ?? [];
  const earliestNow = q.now.minutes + rules.leadMin;
  const slots = new Set<number>();

  for (const r of ranges) {
    const open = toMinutes(r.open);
    const close = toMinutes(r.close);
    if (open === null || close === null || close <= open) continue;
    // Start on a multiple of the step counted from opening time so slots look tidy (09:00, 09:15, ...).
    for (let start = open; start + durationMin <= close; start += rules.stepMin) {
      // Compare on one timeline so a long lead time also blocks the early hours of tomorrow.
      if (ahead * 1440 + start < earliestNow) continue;
      if (peakLoad(start, durationMin, q.booked) > rules.chairs) continue;
      slots.add(start);
    }
  }
  return [...slots].sort((a, b) => a - b).map(toHHmm);
}

/** First bookable date on or after today within the window, for pre-selecting the date picker. */
export function firstOpenDate(
  from: string,
  hours: WeeklyHours,
  closedDates: ReadonlySet<string>,
  maxDaysAhead: number,
): string | null {
  for (let i = 0; i <= maxDaysAhead; i++) {
    const d = addDays(from, i);
    if ((hours[weekdayOf(d)] ?? []).length > 0 && !closedDates.has(d)) return d;
  }
  return null;
}
