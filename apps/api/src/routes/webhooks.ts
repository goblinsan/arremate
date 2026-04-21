import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

app.post('/v1/webhooks/pix', async (c) => {
  const signature = c.req.header('x-pix-signature') ?? '';
  const rawBody = await c.req.text();

  const pixAdapter = createPixAdapter();
  let event;
  try {
    event = pixAdapter.verifyWebhook(rawBody, signature);
  } catch {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
  }

  const payment = await prisma.payment.findFirst({ where: { providerId: event.providerId }, include: { order: true } });
  if (!payment) return c.json({ received: true });
  if (payment.status !== 'PENDING') return c.json({ received: true });

  const dbPaymentStatus = ((): 'PAID' | 'FAILED' | 'REFUNDED' => {
    if (event.status === 'PAID') return 'PAID';
    if (event.status === 'REFUNDED') return 'REFUNDED';
    return 'FAILED';
  })();
  const dbOrderStatus = event.status === 'PAID' ? 'PAID' : 'CANCELLED';

  await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: { status: dbPaymentStatus, webhookPayload: JSON.parse(rawBody) } }),
    prisma.order.update({ where: { id: payment.orderId }, data: { status: dbOrderStatus } }),
  ]);

  return c.json({ received: true });
});

export { app as webhookRoutes };
