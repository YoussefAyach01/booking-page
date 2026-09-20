# booking-page: business one-pager

## Buyer and problem

Owners of hair salons, barbershops, beauty and nail studios, hammams and massage spas. They take appointments by phone and WhatsApp during the busiest hours of the day, forget bookings, get no-shows and double bookings, and cannot answer while working with a client.

## Offer and pricing

| Item                                                                           | MAD                   | USD (approx.)   |
| ------------------------------------------------------------------------------ | --------------------- | --------------- |
| Setup: your own booking page, services, hours, WhatsApp, on the salon's domain | 1,000 - 1,500 one-off | 100 - 150       |
| Monthly (hosting, updates, backups, support)                                   | 99 - 149 / month      | 10 - 15 / month |
| Bundle with a site-kit website                                                 | + 500                 | + 50            |

One deployment per salon, so your cost is small (a shared VPS can host many, roughly 5 MAD per salon per month if you containerise them). Realistic goal: 10 salons = about 1,000-1,500 MAD/month recurring.

## First 5 customers

1. Pick 20 salons on Instagram/Google Maps in one neighbourhood whose bio says "réservation par WhatsApp". DM them a screenshot of a booking page already filled with their own services and prices (10 minutes to prepare), offering 1 month free.
2. Visit salons in person on a quiet weekday morning, show the customer flow on your phone, and let the owner make a fake booking and see it appear in their admin. Ask for the setup fee after the free month.
3. Ask your barber/hairdresser and relatives for introductions to 3 salon owners they know, in exchange for a free first month, then use those as references.

## Accounts needed to go live

- A VPS or PaaS with a persistent disk, and a domain (about 100 MAD/year per client if they want their own).
- No third-party accounts for the product itself: WhatsApp messages open in the user's own WhatsApp (`wa.me` links), so no WhatsApp Business API account is needed.

## Honest limits

- Confirmation and reminders are manual taps in WhatsApp, not automatic. Automatic reminders would need the WhatsApp Business API (paid, needs approval) or an SMS provider.
- Single shared admin password and no per-employee calendars; larger salons with many stylists need more.
- Free alternatives exist (Instagram DMs, Google Calendar appointment pages, Calendly): the pitch is Arabic/French, MAD prices, WhatsApp-native and set up for them.
- Tested with headless desktop Chrome at 375px and 1000px only; not on Safari/iOS or real Android. The WhatsApp hand-off was verified by inspecting the generated link, not by sending a message.
