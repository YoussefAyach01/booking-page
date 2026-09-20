import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addClosureAction,
  addServiceAction,
  adminLogoutAction,
  deleteServiceAction,
  removeClosureAction,
  saveHoursAction,
  saveSalonAction,
  setStatusAction,
  updateServiceAction,
} from '@/app/actions';
import { getDb } from '@/lib/db';
import { formatDay, formatTime, salonConfirmMessage } from '@/lib/i18n';
import { waUrl } from '@/lib/phone';
import { getSalon, listBookings, listClosures, listServices, type Booking } from '@/lib/repo';
import { requireAdmin } from '@/lib/session';
import { nowInSalon } from '@/lib/time';

export const metadata: Metadata = { title: 'Rendez-vous', robots: { index: false } };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  service_added: 'Prestation ajoutée.',
  service_saved: 'Prestation mise à jour.',
  service_deleted: 'Prestation retirée du site (les anciens rendez-vous sont conservés).',
  salon_saved: 'Réglages enregistrés.',
  hours_saved: 'Horaires enregistrés.',
  closure_added: 'Jour de fermeture ajouté.',
  closure_removed: 'Jour de fermeture retiré.',
};
const ERRORS: Record<string, string> = {
  invalid_service: 'Prestation invalide : nom, durée (5 à 480 min) et prix en dirhams entiers.',
  invalid_salon: 'Réglages invalides : vérifiez le nom, le numéro WhatsApp et les nombres.',
  invalid_hours:
    'Horaires invalides : chaque plage doit avoir une ouverture avant la fermeture, sans chevauchement.',
  invalid_closure: 'Date de fermeture invalide.',
};
const STATUS_FR = { pending: 'En attente', confirmed: 'Confirmé', cancelled: 'Annulé' } as const;
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function StatusButton({ b, status, label }: { b: Booking; status: string; label: string }) {
  return (
    <form action={setStatusAction}>
      <input type="hidden" name="id" value={b.id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={status === 'cancelled' ? 'btn btn-danger' : 'btn'}
        aria-label={`${label} : ${b.customer_name}, ${formatTime(b.start_min)}`}
      >
        {label}
      </button>
    </form>
  );
}

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  await requireAdmin();
  const { msg, error } = await searchParams;
  const db = getDb();
  const salon = getSalon(db);
  const today = nowInSalon().date;
  const bookings = listBookings(db, { fromDate: today });
  const services = listServices(db, { activeOnly: true });
  const closures = listClosures(db);
  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  const flash = msg ? MESSAGES[msg] : undefined;
  const problem = error ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{salon.name}</h1>
          <p className="text-sm text-muted">
            <Link href="/" className="underline">
              Voir la page de réservation
            </Link>
          </p>
        </div>
        <form action={adminLogoutAction}>
          <button className="btn" type="submit">
            Se déconnecter
          </button>
        </form>
      </header>
      <nav aria-label="Sections" className="flex flex-wrap gap-2 pb-4">
        {[
          ['#rdv', 'Rendez-vous'],
          ['#services', 'Prestations'],
          ['#hours', 'Horaires'],
          ['#closures', 'Fermetures'],
          ['#settings', 'Réglages'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 font-semibold"
          >
            {label}
          </a>
        ))}
      </nav>

      <main className="grid gap-8">
        {flash && (
          <p role="status" className="rounded-lg border border-green-800 bg-green-50 p-3 text-green-900">
            {flash}
          </p>
        )}
        {problem && (
          <p role="alert" className="rounded-lg border border-red-700 bg-red-50 p-3 text-red-900">
            {problem}
          </p>
        )}

        <section id="rdv" aria-labelledby="rdv-h">
          <h2 id="rdv-h" className="font-display text-2xl font-bold">
            Rendez-vous à venir
          </h2>
          {bookings.length === 0 && <p className="mt-2 text-muted">Aucun rendez-vous pour l’instant.</p>}
          {[...byDate.entries()].map(([date, list]) => (
            <div key={date} className="mt-4">
              <h3 className="font-semibold capitalize">
                {formatDay(date, 'fr')}
                {date === today && ' (aujourd’hui)'}
              </h3>
              <ul className="mt-2 grid gap-2">
                {list.map((b) => (
                  <li
                    key={b.id}
                    className={`card grid gap-2 ${b.status === 'cancelled' ? 'opacity-60' : ''}`}
                  >
                    <p className="text-lg font-bold">
                      <span dir="ltr">{formatTime(b.start_min)}</span> · {b.service_name} · {b.customer_name}
                    </p>
                    <p className="text-sm text-muted">
                      <a className="underline" href={`tel:+${b.customer_phone}`}>
                        +{b.customer_phone}
                      </a>
                      {b.note && ` · « ${b.note} »`} · <strong>{STATUS_FR[b.status]}</strong>
                    </p>
                    {b.status !== 'cancelled' && (
                      <div className="flex flex-wrap gap-2">
                        {b.status === 'pending' && (
                          <StatusButton b={b} status="confirmed" label="Confirmer" />
                        )}
                        <a
                          className="btn"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={waUrl(
                            b.customer_phone,
                            salonConfirmMessage(salon.name, {
                              customerName: b.customer_name,
                              serviceName: b.service_name,
                              date: b.date,
                              startMin: b.start_min,
                            }),
                          )}
                        >
                          Écrire au client
                        </a>
                        <StatusButton b={b} status="cancelled" label="Annuler" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section id="services" aria-labelledby="services-h" className="card">
          <h2 id="services-h" className="font-display text-2xl font-bold">
            Prestations
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {services.map((s) => (
              <li key={s.id} className="py-3">
                <form
                  action={updateServiceAction}
                  className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
                >
                  <input type="hidden" name="id" value={s.id} />
                  <div>
                    <label className="label" htmlFor={`sn-${s.id}`}>
                      Nom
                    </label>
                    <input
                      id={`sn-${s.id}`}
                      name="name"
                      className="field"
                      defaultValue={s.name}
                      required
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`sd-${s.id}`}>
                      Durée (min)
                    </label>
                    <input
                      id={`sd-${s.id}`}
                      name="durationMin"
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      className="field"
                      defaultValue={s.duration_min}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`sp-${s.id}`}>
                      Prix (MAD)
                    </label>
                    <input
                      id={`sp-${s.id}`}
                      name="priceMad"
                      type="number"
                      min={0}
                      className="field"
                      defaultValue={s.price_mad}
                      required
                    />
                  </div>
                  <button className="btn" type="submit" aria-label={`Enregistrer ${s.name}`}>
                    Enregistrer
                  </button>
                </form>
                <form action={deleteServiceAction} className="mt-2">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn btn-danger" type="submit" aria-label={`Retirer ${s.name}`}>
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form
            action={addServiceAction}
            className="mt-4 grid gap-2 rounded-lg border border-dashed border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
          >
            <div>
              <label className="label" htmlFor="new-name">
                Nouvelle prestation
              </label>
              <input
                id="new-name"
                name="name"
                className="field"
                required
                maxLength={80}
                placeholder="Coupe + brushing"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-dur">
                Durée (min)
              </label>
              <input
                id="new-dur"
                name="durationMin"
                type="number"
                min={5}
                max={480}
                step={5}
                className="field"
                defaultValue={45}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new-price">
                Prix (MAD)
              </label>
              <input id="new-price" name="priceMad" type="number" min={0} className="field" required />
            </div>
            <button className="btn btn-solid" type="submit">
              Ajouter
            </button>
          </form>
        </section>

        <section id="hours" aria-labelledby="hours-h" className="card">
          <h2 id="hours-h" className="font-display text-2xl font-bold">
            Horaires d’ouverture
          </h2>
          <p className="mt-1 text-sm text-muted">
            Deux plages par jour (matin et après-midi). Laissez vide pour un jour fermé.
          </p>
          <form action={saveHoursAction} className="mt-3 grid gap-3">
            {DAYS.map((name, day) => {
              const r = salon.hours[day] ?? [];
              return (
                <fieldset
                  key={day}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_repeat(4,1fr)] sm:items-end"
                >
                  <legend className="sr-only">{name}</legend>
                  <p className="col-span-2 font-semibold sm:col-span-1 sm:pb-3" aria-hidden="true">
                    {name}
                  </p>
                  {[1, 2].map((n) => (
                    <div key={n} className="contents">
                      <div>
                        <label className="label" htmlFor={`o${n}-${day}`}>
                          {n === 1 ? 'Ouvre' : 'Rouvre'}
                          <span className="sr-only"> ({name})</span>
                        </label>
                        <input
                          id={`o${n}-${day}`}
                          name={`o${n}-${day}`}
                          type="time"
                          className="field"
                          defaultValue={r[n - 1]?.open ?? ''}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`c${n}-${day}`}>
                          Ferme<span className="sr-only"> ({name})</span>
                        </label>
                        <input
                          id={`c${n}-${day}`}
                          name={`c${n}-${day}`}
                          type="time"
                          className="field"
                          defaultValue={r[n - 1]?.close ?? ''}
                        />
                      </div>
                    </div>
                  ))}
                </fieldset>
              );
            })}
            <button className="btn btn-solid justify-self-start" type="submit">
              Enregistrer les horaires
            </button>
          </form>
        </section>

        <section id="closures" aria-labelledby="closures-h" className="card">
          <h2 id="closures-h" className="font-display text-2xl font-bold">
            Jours de fermeture
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {closures.length === 0 && <li className="py-2 text-muted">Aucun.</li>}
            {closures.map((c) => (
              <li key={c.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {formatDay(c.date, 'fr')} {c.reason && `· ${c.reason}`}
                </span>
                <form action={removeClosureAction}>
                  <input type="hidden" name="date" value={c.date} />
                  <button className="btn" type="submit" aria-label={`Retirer la fermeture du ${c.date}`}>
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form
            action={addClosureAction}
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          >
            <div>
              <label className="label" htmlFor="cl-date">
                Date
              </label>
              <input id="cl-date" name="date" type="date" min={today} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="cl-reason">
                Motif (facultatif)
              </label>
              <input id="cl-reason" name="reason" className="field" maxLength={80} placeholder="Aïd" />
            </div>
            <button className="btn btn-solid" type="submit">
              Fermer ce jour
            </button>
          </form>
        </section>

        <section id="settings" aria-labelledby="settings-h" className="card">
          <h2 id="settings-h" className="font-display text-2xl font-bold">
            Réglages
          </h2>
          <form action={saveSalonAction} className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-name">
                Nom du salon
              </label>
              <input
                id="s-name"
                name="name"
                className="field"
                defaultValue={salon.name}
                required
                maxLength={80}
              />
            </div>
            <div>
              <label className="label" htmlFor="s-wa">
                WhatsApp du salon
              </label>
              <input
                id="s-wa"
                name="whatsapp"
                className="field"
                dir="ltr"
                defaultValue={`+${salon.whatsapp}`}
                required
                inputMode="tel"
              />
            </div>
            <div>
              <label className="label" htmlFor="s-chairs">
                Clients servis en même temps
              </label>
              <input
                id="s-chairs"
                name="chairs"
                type="number"
                min={1}
                max={20}
                className="field"
                defaultValue={salon.rules.chairs}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="s-step">
                Créneaux toutes les
              </label>
              <select id="s-step" name="stepMin" className="field" defaultValue={salon.rules.stepMin}>
                {[5, 10, 15, 20, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="s-lead">
                Délai minimum avant un rendez-vous (min)
              </label>
              <input
                id="s-lead"
                name="leadMin"
                type="number"
                min={0}
                max={10080}
                className="field"
                defaultValue={salon.rules.leadMin}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="s-ahead">
                Réservation possible jusqu’à (jours)
              </label>
              <input
                id="s-ahead"
                name="maxDaysAhead"
                type="number"
                min={1}
                max={365}
                className="field"
                defaultValue={salon.rules.maxDaysAhead}
                required
              />
            </div>
            <button className="btn btn-solid justify-self-start" type="submit">
              Enregistrer
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
