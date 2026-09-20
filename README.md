# booking-page

Online appointment booking for a salon (hair, beauty, barber, spa): customers pick a service, a day and a free time slot, then confirm by WhatsApp. The owner manages bookings, services, opening hours and closing days from a password-protected `/admin`. One deployment = one salon.

Stack: Next.js 16 (App Router) + Tailwind 4 + TypeScript strict + SQLite via the built-in `node:sqlite` (no native modules, no cloud account). Customer page in French and Arabic (RTL); admin in French.

## Run

Requires Node 22.18+ (developed on Node 25).

```bash
npm install
cp .env.example .env.local     # set ADMIN_PASSWORD and SESSION_SECRET
npm run seed                   # optional demo salon with 4 services
npm run dev                    # http://localhost:3120  (admin: /admin)
```

Checks: `npm run typecheck && npm run lint && npm test`.
End-to-end in real Chrome (needs `npm run build` first): `npm run test:e2e`.

## How it works

- Times are stored as local salon time (`YYYY-MM-DD` + minutes since midnight), never as UTC instants, so there are no daylight-saving or Ramadan-clock surprises. "Now" is read in `Africa/Casablanca` with `Intl` (`src/lib/time.ts`).
- `src/lib/slots.ts` is a pure function: opening ranges (two per day, so a lunch break works), service duration, existing bookings, number of chairs, closing days, lead time and booking window in, list of free start times out. It is the most heavily tested file.
- `createBooking` re-checks the slot inside `BEGIN IMMEDIATE`, so two customers can never take the same slot (tested, plus verified in the browser).
- The booking page (`/booking/<token>`) is a secret 128-bit link: it lets the customer see status and cancel. It is `noindex`.
- WhatsApp: the customer gets a "Confirm on WhatsApp" button with a prefilled message to the salon; the owner gets a "Write to client" button with a prefilled confirmation. No WhatsApp API or paid service is used.
- Security: zod validation everywhere, parameterised SQL, admin password compared in constant time, signed httpOnly SameSite=Lax cookie (Secure in production), rate limits on booking, slots and admin login, honeypot field, max 3 upcoming bookings per phone number, CSP and other headers in `next.config.ts`.

## Deploy

Needs a Node host with a persistent disk (SQLite is a file): a small VPS, Railway or Fly with a volume. It will not work on Vercel's serverless filesystem as-is (swap `src/lib/db.ts` + `repo.ts` for Postgres/Turso to use Vercel).

1. Set `ADMIN_PASSWORD` (10+ chars) and `SESSION_SECRET` (32+ random chars; the app throws in production without it), and `DATABASE_PATH` on a persistent volume.
2. `npm run build && npm start` behind HTTPS (Caddy/nginx). Make your proxy overwrite `X-Forwarded-For`, otherwise rate limiting can be bypassed.
3. Open `/admin`, set salon name and WhatsApp number, add services, check opening hours.
4. Back up the SQLite file regularly.

## Known limits

- One salon per deployment, one shared admin password, no staff calendars: "chairs" is just how many customers can be served at once.
- No reminders or SMS/e-mail (WhatsApp messages are manual, one tap). No customer accounts, no online payment or deposit.
- Service names are entered once (any language); the surrounding UI is French/Arabic.
- Rate limiting is in memory (single process).
