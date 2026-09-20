'use client';

import { useEffect, useState } from 'react';
import { bookAction } from '@/app/actions';
import { t, type Lang } from '@/lib/i18n';

interface ServiceOption {
  id: number;
  name: string;
  durationMin: number;
  priceMad: number;
}

type SlotState =
  { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; slots: string[] };

export function BookingForm(props: {
  lang: Lang;
  services: ServiceOption[];
  minDate: string;
  maxDate: string;
  defaultService: number | undefined;
  defaultDate: string;
}) {
  const { lang } = props;
  const [serviceId, setServiceId] = useState<number | undefined>(props.defaultService);
  const [date, setDate] = useState(props.defaultDate);
  const [time, setTime] = useState('');
  // The latest answer from the slots API, tagged with the request it belongs to. Loading is derived (no answer for the
  // current service + date yet), so no state is set synchronously inside the effect.
  const [answer, setAnswer] = useState<{ key: string; slots: string[] | null } | null>(null);
  const key = `${serviceId}|${date}`;

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    fetch(`/api/slots?serviceId=${serviceId}&date=${date}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { slots: string[] }) => setAnswer({ key, slots: d.slots }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setAnswer({ key, slots: null });
      });
    return () => controller.abort();
  }, [serviceId, date, key]);

  const state: SlotState =
    !serviceId || !date
      ? { status: 'idle' }
      : answer?.key !== key
        ? { status: 'loading' }
        : answer.slots === null
          ? { status: 'error' }
          : { status: 'ready', slots: answer.slots };
  // A previously picked time only counts if it is still offered for the current service and day.
  const selectedTime = state.status === 'ready' && state.slots.includes(time) ? time : '';

  return (
    <form action={bookAction} className="mt-6 grid gap-6">
      <input type="hidden" name="lang" value={lang} />
      {/* Honeypot for bots: hidden from people and from assistive tech, never focusable */}
      <div aria-hidden="true" className="absolute -start-[9999px]">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="label text-lg">{t(lang, 'service')}</legend>
        <div className="grid gap-2">
          {props.services.map((s) => (
            <label
              key={s.id}
              className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2 has-checked:border-[var(--accent)] has-checked:ring-2 has-checked:ring-[var(--accent)]"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="serviceId"
                  value={s.id}
                  checked={serviceId === s.id}
                  onChange={() => setServiceId(s.id)}
                  required
                />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="text-sm text-muted">
                    {s.durationMin} {t(lang, 'minutes')}
                  </span>
                </span>
              </span>
              <span className="font-bold tabular-nums">
                {s.priceMad} {t(lang, 'mad')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label text-lg" htmlFor="date">
          {t(lang, 'date')}
        </label>
        <input
          id="date"
          name="date"
          type="date"
          className="field"
          required
          min={props.minDate}
          max={props.maxDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <fieldset aria-live="polite">
        <legend className="label text-lg">{t(lang, 'time')}</legend>
        {state.status === 'idle' && <p className="text-muted">{t(lang, 'pickSlot')}</p>}
        {state.status === 'loading' && <p className="text-muted">{t(lang, 'loading')}</p>}
        {state.status === 'error' && <p className="text-red-800">{t(lang, 'slotsError')}</p>}
        {state.status === 'ready' && state.slots.length === 0 && (
          <p className="text-muted">{t(lang, 'noSlots')}</p>
        )}
        {state.status === 'ready' && state.slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {state.slots.map((s) => (
              <label
                key={s}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-white font-semibold tabular-nums has-checked:border-[var(--accent)] has-checked:bg-[var(--accent)] has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--accent)]"
              >
                <input
                  type="radio"
                  name="time"
                  value={s}
                  checked={selectedTime === s}
                  onChange={() => setTime(s)}
                  required
                  className="sr-only"
                />
                <span dir="ltr">{s}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="label text-lg">{t(lang, 'you')}</legend>
        <div>
          <label className="label" htmlFor="name">
            {t(lang, 'name')}
          </label>
          <input
            id="name"
            name="name"
            className="field"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            {t(lang, 'phone')}
          </label>
          <input
            id="phone"
            name="phone"
            className="field"
            dir="ltr"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="06 12 34 56 78"
          />
        </div>
        <div>
          <label className="label" htmlFor="note">
            {t(lang, 'note')}
          </label>
          <textarea id="note" name="note" className="field" rows={2} maxLength={300} />
        </div>
      </fieldset>

      <button type="submit" className="btn btn-solid text-lg" disabled={!selectedTime}>
        {t(lang, 'book')}
      </button>
    </form>
  );
}
