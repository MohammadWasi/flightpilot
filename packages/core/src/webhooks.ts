import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { FlightPilotError } from '@flightpilot/shared';
import { equalSecret } from './security';
import type { FlightService } from './service';
// Official Duffel format: HMAC-SHA256(secret, timestamp + '.' + unmodified body).
export function verifyWebhook(body: string, header: string, secret: string, now = Date.now()) {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map((p) => p[1] ?? '');
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    throw new FlightPilotError('FORBIDDEN', 'Invalid or expired webhook signature.');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  if (!signatures.some((s) => equalSecret(s, expected)))
    throw new FlightPilotError('FORBIDDEN', 'Invalid webhook signature.');
}
const EventSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.string().max(120),
    live_mode: z.literal(false),
    idempotency_key: z.string().max(200).optional(),
    data: z.object({ object: z.object({ id: z.string().optional() }).passthrough() }).optional(),
  })
  .passthrough();
export async function handleWebhook(service: FlightService, body: string, header: string) {
  if (service.config.mode !== 'duffel_test' || !service.config.webhookSecret)
    throw new FlightPilotError('WEBHOOK_DISABLED', 'Duffel test webhooks are not configured.');
  verifyWebhook(body, header, service.config.webhookSecret);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new FlightPilotError('INVALID_INPUT', 'Invalid webhook JSON.');
  }
  const event = EventSchema.parse(parsed);
  const user = 'local-user';
  const key = `${event.type}:${event.idempotency_key ?? event.id}`;
  const existing = await service.store.get<{ state: string }>('webhooks', key, user);
  if (existing?.state === 'processed') return { received: true, duplicate: true };
  await service.store.insert('webhooks', key, user, { id: event.id, type: event.type, state: 'pending' });
  // Events may arrive out of order: never trust event status or PII; re-fetch the current order.
  const id = event.data?.object.id;
  if (event.type.startsWith('order.') && id?.startsWith('ord_')) {
    const known = await service.store.get('bookings', id, user);
    if (known) await service.booking(user, id);
  }
  await service.store.put('webhooks', key, user, {
    id: event.id,
    type: event.type,
    state: 'processed',
    processedAt: new Date().toISOString(),
  });
  return { received: true, duplicate: false };
}
