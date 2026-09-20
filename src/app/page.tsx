import Link from 'next/link';
import { getDb } from '@/lib/db';
import { t, type Lang } from '@/lib/i18n';
import { getSalon, listServices } from '@/lib/repo';
import { addDays, isValidDate, nowInSalon } from '@/lib/time';
import { BookingForm } from './booking-form';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ lang?: string; error?: string; service?: string; date?: string }> };

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const lang: Lang = sp.lang === 'ar' ? 'ar' : 'fr';
  const db = getDb();
  const salon = getSalon(db);
  const services = listServices(db, { activeOnly: true });
  const today = nowInSalon().date;
  const errorKey = sp.error ? (`e_${sp.error}` as const) : undefined;
  const validErrors = [
    'e_slot_unavailable',
    'e_too_many_bookings',
    'e_invalid',
    'e_rate',
    'e_service_not_found',
  ] as const;
  const error = validErrors.find((k) => k === errorKey);

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="mx-auto max-w-xl px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-5">
        <p className="font-display text-2xl font-bold">{salon.name}</p>
        <Link
          href={`/?lang=${lang === 'ar' ? 'fr' : 'ar'}`}
          lang={lang === 'ar' ? 'fr' : 'ar'}
          aria-label={t(lang, 'langLabel')}
          className="btn"
        >
          {t(lang, 'lang')}
        </Link>
      </header>
      <main>
        <h1 className="font-display text-4xl leading-tight font-bold">{t(lang, 'title')}</h1>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-700 bg-red-50 p-3 text-red-900">
            {t(lang, error)}
          </p>
        )}
        {services.length === 0 ? (
          <p className="mt-6 text-muted">{t(lang, 'noServices')}</p>
        ) : (
          <BookingForm
            lang={lang}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              durationMin: s.duration_min,
              priceMad: s.price_mad,
            }))}
            minDate={today}
            maxDate={addDays(today, salon.rules.maxDaysAhead)}
            defaultService={Number(sp.service) || services[0]?.id}
            defaultDate={sp.date && isValidDate(sp.date) ? sp.date : ''}
          />
        )}
      </main>
    </div>
  );
}
