import { z } from 'zod';
import { normalizeMoroccanPhone } from './phone.ts';
import type { WeeklyHours } from './slots.ts';
import { isValidDate, toMinutes } from './time.ts';

const text = (max: number) => z.string().trim().max(max);

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeMoroccanPhone(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
    return n ?? '';
  });

const date = z.string().refine(isValidDate, 'invalid_date');
const time = z.string().refine((v) => toMinutes(v) !== null, 'invalid_time');

export const bookingSchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  date,
  time,
  name: text(80).min(2),
  phone,
  note: text(300).default(''),
});

export const slotsQuerySchema = z.object({ serviceId: z.coerce.number().int().positive(), date });

export const serviceSchema = z.object({
  name: text(80).min(2),
  durationMin: z.coerce.number().int().min(5).max(480),
  priceMad: z.coerce.number().int().min(0).max(100000),
});

export const salonSchema = z.object({
  name: text(80).min(2),
  whatsapp: phone,
  chairs: z.coerce.number().int().min(1).max(20),
  stepMin: z.coerce
    .number()
    .int()
    .refine((n) => [5, 10, 15, 20, 30, 60].includes(n), 'invalid_step'),
  leadMin: z.coerce.number().int().min(0).max(10080),
  maxDaysAhead: z.coerce.number().int().min(1).max(365),
});

export const closureSchema = z.object({ date, reason: text(80).default('') });

export const idSchema = z.coerce.number().int().positive();

/**
 * Parse the weekly-hours form: fields "o1-<day>", "c1-<day>", "o2-<day>", "c2-<day>" for day 0..6.
 * A range with both fields empty is skipped; half-filled or reversed ranges are an error.
 */
export function parseHoursForm(
  get: (name: string) => string,
): { ok: true; hours: WeeklyHours } | { ok: false } {
  const hours: WeeklyHours = [];
  for (let day = 0; day < 7; day++) {
    const ranges = [];
    for (const n of [1, 2]) {
      const open = get(`o${n}-${day}`).trim();
      const close = get(`c${n}-${day}`).trim();
      if (!open && !close) continue;
      const o = toMinutes(open);
      const c = toMinutes(close);
      if (o === null || c === null || c <= o) return { ok: false };
      ranges.push({ open, close });
    }
    // Overlapping ranges on one day would double count; reject them.
    ranges.sort((a, b) => (toMinutes(a.open) ?? 0) - (toMinutes(b.open) ?? 0));
    for (let i = 1; i < ranges.length; i++) {
      if ((toMinutes(ranges[i]!.open) ?? 0) < (toMinutes(ranges[i - 1]!.close) ?? 0)) return { ok: false };
    }
    hours.push(ranges);
  }
  return { ok: true, hours };
}
