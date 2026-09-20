// End-to-end check of the real booking flow in a real browser (system Chrome via playwright-core).
// Requires `npm run build` first. Starts its own server on port 3121 with a throwaway database.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3121;
const BASE = `http://localhost:${PORT}`;
const ADMIN_PASSWORD = 'e2e-admin-password';
const dir = mkdtempSync(join(tmpdir(), 'booking-e2e-'));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env,
    DATABASE_PATH: join(dir, 'e2e.db'),
    SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234',
    ADMIN_PASSWORD,
  },
  stdio: 'pipe',
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

/** A bookable weekday (not Sunday) a few days ahead, as YYYY-MM-DD in Morocco time. */
function bookableDate(daysAhead) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' });
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (new Date(fmt.format(d) + 'T00:00:00Z').getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return fmt.format(d);
}

async function pickSlot(page, date, time) {
  await page.getByLabel('Coupe', { exact: false }).first().check();
  await page.fill('#date', date);
  await page.getByText(time, { exact: true }).waitFor();
  await page.getByText(time, { exact: true }).click();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const owner = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  const DATE = bookableDate(3);

  // Admin guard and login
  await owner.goto(`${BASE}/admin`);
  check('anonymous /admin redirects to the login page', owner.url().endsWith('/admin/login'));
  await owner.fill('#password', 'wrong-password-123');
  await owner.click('button[type=submit]');
  await owner.waitForURL('**/admin/login?error=invalid');
  check(
    'wrong admin password is refused',
    (await owner.locator('main [role=alert]').innerText()).includes('incorrect'),
  );
  await owner.fill('#password', ADMIN_PASSWORD);
  await owner.click('button[type=submit]');
  await owner.waitForURL('**/admin');
  check('admin can log in', (await owner.locator('h1').innerText()).length > 0);

  // Empty salon message for customers
  const anon = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const guest = await anon.newPage();
  await guest.goto(BASE);
  check(
    'public page explains when no services exist',
    (await guest.locator('main').innerText()).includes('pas encore configuré'),
  );

  // Admin: add a service and close nothing yet
  await owner.fill('#new-name', 'Coupe femme');
  await owner.fill('#new-dur', '30');
  await owner.fill('#new-price', '120');
  await owner.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await owner.getByText('Prestation ajoutée.').waitFor();
  check('admin added a service', true);

  // Customer A books 10:00
  await guest.goto(BASE);
  check(
    'booking page has no horizontal scroll at 375px',
    await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  );
  await pickSlot(guest, DATE, '10:00');
  await guest.fill('#name', 'Sara');
  await guest.fill('#phone', '06 12 34 56 78');

  // Customer B loads the same slot before A submits (race)
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE);
  await pickSlot(pageB, DATE, '10:00');
  await pageB.fill('#name', 'Karim');
  await pageB.fill('#phone', '0698765432');

  await guest.getByRole('button', { name: 'Réserver ce créneau' }).click();
  await guest.waitForURL('**/booking/**');
  const bookingUrl = guest.url();
  const body = await guest.locator('main').innerText();
  check(
    'confirmation shows pending status, service and time',
    body.includes('En attente') && body.includes('Coupe femme') && body.includes('10:00'),
  );
  const wa = await guest.getByRole('link', { name: 'Confirmer sur WhatsApp' }).getAttribute('href');
  check(
    'WhatsApp link goes to the salon number with the details',
    wa.startsWith('https://wa.me/212600000000?text=') &&
      decodeURIComponent(wa).includes('10:00') &&
      decodeURIComponent(wa).includes('Sara'),
    wa,
  );

  await pageB.getByRole('button', { name: 'Réserver ce créneau' }).click();
  await pageB.waitForURL('**error=slot_unavailable**');
  check(
    'second customer racing for the same slot gets a clear error, no double booking',
    (await pageB.locator('main [role=alert]').innerText()).includes('vient d’être pris'),
  );

  // Slot is gone for others
  const res = await fetch(`${BASE}/api/slots?serviceId=1&date=${DATE}`);
  const { slots } = await res.json();
  check(
    'booked slot is no longer offered by the API',
    !slots.includes('10:00') && slots.includes('10:30'),
    JSON.stringify(slots),
  );

  // Admin sees it, confirms it
  await owner.goto(`${BASE}/admin`);
  check('admin sees the booking', (await owner.locator('#rdv').innerText()).includes('Sara'));
  await owner.getByRole('button', { name: /^Confirmer : Sara/ }).click();
  await owner.getByText('Confirmé', { exact: false }).first().waitFor();
  await guest.goto(bookingUrl);
  check(
    'customer sees Confirmed after admin confirms',
    (await guest.locator('main').innerText()).includes('Confirmé'),
  );

  // Customer cancels; slot returns
  await guest.getByRole('button', { name: 'Annuler mon rendez-vous' }).click();
  await guest.locator('main h1', { hasText: 'annulé' }).waitFor();
  const after = await (await fetch(`${BASE}/api/slots?serviceId=1&date=${DATE}`)).json();
  check('cancelling frees the slot', after.slots.includes('10:00'));

  // Closure hides the day
  await owner.goto(`${BASE}/admin`);
  await owner.fill('#cl-date', DATE);
  await owner.getByRole('button', { name: 'Fermer ce jour' }).click();
  await owner.getByText('Jour de fermeture ajouté.').waitFor();
  const closed = await (await fetch(`${BASE}/api/slots?serviceId=1&date=${DATE}`)).json();
  check('a closure day has no slots', closed.slots.length === 0);

  // Arabic + RTL
  await guest.goto(`${BASE}/?lang=ar`);
  check(
    'Arabic page is RTL',
    (await guest.locator('div[dir=rtl]').count()) === 1 &&
      (await guest.locator('h1').innerText()).includes('احجز'),
  );

  // Guards
  check('unknown booking token is a 404', (await fetch(`${BASE}/booking/${'0'.repeat(32)}`)).status === 404);
  check(
    'slots API rejects bad input',
    (await fetch(`${BASE}/api/slots?serviceId=x&date=nope`)).status === 400,
  );
  const head = await fetch(BASE);
  check(
    'security headers are set',
    head.headers.get('x-content-type-options') === 'nosniff' &&
      !!head.headers.get('content-security-policy') &&
      !head.headers.get('x-powered-by'),
  );
} catch (e) {
  failures++;
  console.error('FAIL  unexpected error:', e);
} finally {
  await browser?.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures === 0 ? '\nAll e2e checks passed.' : `\n${failures} e2e check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
