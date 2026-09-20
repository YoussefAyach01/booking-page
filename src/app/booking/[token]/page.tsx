import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cancelBookingAction } from '@/app/actions';
import { getDb } from '@/lib/db';
import { customerMessage, formatDay, formatTime, t, type Lang, type Key } from '@/lib/i18n';
import { waUrl } from '@/lib/phone';
import { getBookingByToken, getSalon } from '@/lib/repo';

export const dynamic = 'force-dynamic';
// The URL is a secret capability link: keep it out of search engines.
export const metadata: Metadata = { title: 'Rendez-vous', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; error?: string }> };

export default async function BookingPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const lang: Lang = sp.lang === 'ar' ? 'ar' : 'fr';
  const db = getDb();
  const booking = getBookingByToken(db, token);
  if (!booking) notFound();
  const salon = getSalon(db);
  const cancelled = booking.status === 'cancelled';
  const errorKey = sp.error === 'already_started' ? 'e_already_started' : undefined;

  const message = customerMessage(lang, {
    customerName: booking.customer_name,
    serviceName: booking.service_name,
    date: booking.date,
    startMin: booking.start_min,
  });

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="mx-auto max-w-xl px-4 py-8">
      <p className="font-display text-2xl font-bold">{salon.name}</p>
      <main className="mt-6">
        <h1 className="font-display text-3xl font-bold">
          {cancelled ? t(lang, 'cancelled') : t(lang, 'thanks')}
        </h1>
        {errorKey && (
          <p role="alert" className="mt-4 rounded-lg border border-red-700 bg-red-50 p-3 text-red-900">
            {t(lang, errorKey)}
          </p>
        )}
        <dl className="card mt-4 grid gap-2">
          <div>
            <dt className="text-sm text-muted">{booking.service_name}</dt>
            <dd className="text-xl font-bold">
              {formatDay(booking.date, lang)} {t(lang, 'at')}{' '}
              <span dir="ltr">{formatTime(booking.start_min)}</span>
            </dd>
          </div>
          <div>
            <dd>{booking.customer_name}</dd>
          </div>
          <div>
            <dd className="font-semibold" style={{ color: 'var(--accent)' }}>
              {t(lang, `status_${booking.status}` as Key)}
            </dd>
          </div>
        </dl>

        {!cancelled && (
          <>
            <p className="mt-4 text-muted">{t(lang, 'thanksText')}</p>
            <p className="mt-3">
              <a
                className="btn btn-solid w-full"
                href={waUrl(salon.whatsapp, message)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(lang, 'wa')}
              </a>
            </p>
            <form action={cancelBookingAction} className="mt-3">
              <input type="hidden" name="token" value={booking.token} />
              <input type="hidden" name="lang" value={lang} />
              <button type="submit" className="btn btn-danger w-full">
                {t(lang, 'cancel')}
              </button>
            </form>
            <p className="mt-3 text-sm text-muted">{t(lang, 'keep')}</p>
          </>
        )}
        <p className="mt-6">
          <Link
            href={`/?lang=${lang}`}
            className="font-semibold underline"
            style={{ color: 'var(--accent)' }}
          >
            {t(lang, 'another')}
          </Link>
        </p>
      </main>
    </div>
  );
}
