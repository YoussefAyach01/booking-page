// Fills a demo salon with services so the page is not empty. Usage: npm run seed
import { openDb } from '../src/lib/db.ts';
import { addService, listServices, updateSalon, getSalon } from '../src/lib/repo.ts';

const db = openDb(process.env.DATABASE_PATH ?? './data/booking.db');
if (listServices(db, { activeOnly: false }).length > 0) {
  console.log('Services already exist, nothing to do.');
} else {
  const s = getSalon(db);
  updateSalon(db, {
    name: 'Salon Nour',
    whatsapp: '212612345678',
    chairs: 2,
    stepMin: s.rules.stepMin,
    leadMin: s.rules.leadMin,
    maxDaysAhead: s.rules.maxDaysAhead,
  });
  addService(db, { name: 'Coupe femme', durationMin: 45, priceMad: 120 });
  addService(db, { name: 'Brushing', durationMin: 30, priceMad: 70 });
  addService(db, { name: 'Coloration', durationMin: 120, priceMad: 350 });
  addService(db, { name: 'Soin visage', durationMin: 60, priceMad: 200 });
  console.log('Demo salon created.');
}
