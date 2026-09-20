'use server';

import { redirect } from 'next/navigation';
import { checkAdminPassword } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import * as repo from '@/lib/repo';
import {
  bookingSchema,
  closureSchema,
  idSchema,
  parseHoursForm,
  salonSchema,
  serviceSchema,
} from '@/lib/schemas';
import { clearAdminSession, clientIp, requireAdmin, setAdminSession } from '@/lib/session';

const str = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const HOUR = 3_600_000;
const langOf = (fd: FormData) => (str(fd, 'lang') === 'ar' ? 'ar' : 'fr');

// ---------------- public ----------------

export async function bookAction(fd: FormData): Promise<void> {
  const lang = langOf(fd);
  const back = (error: string): never =>
    redirect(
      `/?lang=${lang}&error=${error}&service=${encodeURIComponent(str(fd, 'serviceId'))}&date=${encodeURIComponent(str(fd, 'date'))}`,
    );

  // Honeypot: real people never see or fill this field.
  if (str(fd, 'website')) back('invalid');
  if (!rateLimit(`book:${await clientIp()}`, 6, HOUR).ok) back('rate');

  const parsed = bookingSchema.safeParse({
    serviceId: str(fd, 'serviceId'),
    date: str(fd, 'date'),
    time: str(fd, 'time'),
    name: str(fd, 'name'),
    phone: str(fd, 'phone'),
    note: str(fd, 'note'),
  });
  if (!parsed.success) return back('invalid');
  const result = repo.createBooking(getDb(), parsed.data);
  if (!result.ok) return back(result.error);
  redirect(`/booking/${result.value.token}?lang=${lang}`);
}

export async function cancelBookingAction(fd: FormData): Promise<void> {
  const lang = langOf(fd);
  const token = str(fd, 'token');
  const result = repo.cancelByToken(getDb(), token);
  redirect(`/booking/${encodeURIComponent(token)}?lang=${lang}${result.ok ? '' : `&error=${result.error}`}`);
}

// ---------------- admin ----------------

export async function adminLoginAction(fd: FormData): Promise<void> {
  const ip = await clientIp();
  if (!rateLimit(`admin-login:${ip}`, 8, 15 * 60_000).ok) redirect('/admin/login?error=rate');
  if (!checkAdminPassword(str(fd, 'password').slice(0, 200), process.env.ADMIN_PASSWORD)) {
    redirect('/admin/login?error=invalid');
  }
  await setAdminSession();
  redirect('/admin');
}

export async function adminLogoutAction(): Promise<void> {
  await clearAdminSession();
  redirect('/admin/login');
}

export async function setStatusAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = idSchema.safeParse(fd.get('id'));
  const status = str(fd, 'status');
  if (id.success && (status === 'confirmed' || status === 'cancelled' || status === 'pending')) {
    repo.setBookingStatus(getDb(), id.data, status);
  }
  redirect('/admin');
}

export async function addServiceAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const p = serviceSchema.safeParse({
    name: str(fd, 'name'),
    durationMin: str(fd, 'durationMin'),
    priceMad: str(fd, 'priceMad'),
  });
  if (!p.success) redirect('/admin?error=invalid_service#services');
  repo.addService(getDb(), p.data);
  redirect('/admin?msg=service_added#services');
}

export async function updateServiceAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = idSchema.safeParse(fd.get('id'));
  const p = serviceSchema.safeParse({
    name: str(fd, 'name'),
    durationMin: str(fd, 'durationMin'),
    priceMad: str(fd, 'priceMad'),
  });
  if (!id.success || !p.success) redirect('/admin?error=invalid_service#services');
  repo.updateService(getDb(), id.data, p.data);
  redirect('/admin?msg=service_saved#services');
}

export async function deleteServiceAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = idSchema.safeParse(fd.get('id'));
  if (id.success) repo.deactivateService(getDb(), id.data);
  redirect('/admin?msg=service_deleted#services');
}

export async function saveSalonAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const p = salonSchema.safeParse({
    name: str(fd, 'name'),
    whatsapp: str(fd, 'whatsapp'),
    chairs: str(fd, 'chairs'),
    stepMin: str(fd, 'stepMin'),
    leadMin: str(fd, 'leadMin'),
    maxDaysAhead: str(fd, 'maxDaysAhead'),
  });
  if (!p.success) redirect('/admin?error=invalid_salon#settings');
  repo.updateSalon(getDb(), p.data);
  redirect('/admin?msg=salon_saved#settings');
}

export async function saveHoursAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = parseHoursForm((name) => str(fd, name));
  if (!parsed.ok) redirect('/admin?error=invalid_hours#hours');
  repo.setHours(getDb(), parsed.hours);
  redirect('/admin?msg=hours_saved#hours');
}

export async function addClosureAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const p = closureSchema.safeParse({ date: str(fd, 'date'), reason: str(fd, 'reason') });
  if (!p.success) redirect('/admin?error=invalid_closure#closures');
  repo.addClosure(getDb(), p.data.date, p.data.reason);
  redirect('/admin?msg=closure_added#closures');
}

export async function removeClosureAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const date = closureSchema.safeParse({ date: str(fd, 'date') });
  if (date.success) repo.removeClosure(getDb(), date.data.date);
  redirect('/admin?msg=closure_removed#closures');
}
