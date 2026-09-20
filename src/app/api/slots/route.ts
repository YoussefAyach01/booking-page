import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { availableSlots, getService } from '@/lib/repo';
import { slotsQuerySchema } from '@/lib/schemas';

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`slots:${ip}`, 120, 60_000).ok) return Response.json({ error: 'rate' }, { status: 429 });

  const url = new URL(req.url);
  const q = slotsQuerySchema.safeParse({
    serviceId: url.searchParams.get('serviceId'),
    date: url.searchParams.get('date'),
  });
  if (!q.success) return Response.json({ error: 'invalid' }, { status: 400 });

  const db = getDb();
  const service = getService(db, q.data.serviceId);
  if (!service) return Response.json({ error: 'service_not_found' }, { status: 404 });
  return Response.json(
    { slots: availableSlots(db, service, q.data.date) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
