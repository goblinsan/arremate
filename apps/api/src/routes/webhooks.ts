import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { createLiveVideoProvider } from '@arremate/video';
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

app.post('/v1/webhooks/live-video', async (c) => {
  const providerName = process.env.LIVE_VIDEO_PROVIDER ?? 'stub';
  const provider = createLiveVideoProvider(providerName);

  if (!provider.verifyWebhook) {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Provider does not support webhooks' }, 400);
  }

  const signature = c.req.header('webhook-signature') ?? c.req.header('x-webhook-signature') ?? '';
  const rawBody = await c.req.text();

  let event: unknown;
  try {
    event = provider.verifyWebhook(rawBody, signature);
  } catch {
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
  }

  // Reconcile provider lifecycle events into ShowSession
  // Cloudflare Stream uses 'uid' for the live input ID; generic/custom providers may use
  // 'providerSessionId' or 'live_input_id' depending on their payload shape.
  const payload = event as Record<string, unknown>;
  const providerSessionId = (payload.uid ?? payload.providerSessionId ?? payload.live_input_id) as string | undefined;

  if (!providerSessionId) {
    return c.json({ received: true });
  }

  const session = await prisma.showSession.findFirst({ where: { providerSessionId } });
  if (!session) {
    return c.json({ received: true });
  }

  // Cloudflare Stream uses 'event' for the event name; generic providers may use 'type'.
  const eventType = (payload.event ?? payload.type) as string | undefined;

  if (!eventType) {
    return c.json({ received: true });
  }

  // Map provider event types to session state updates
  // Cloudflare Stream uses 'live_input.connected' / 'live_input.disconnected' / 'live_input.degraded'
  // Generic providers may use 'stream.started' / 'stream.ended' / 'stream.degraded'
  // Simple providers may use 'ready' / 'ended'
  if (eventType === 'live_input.connected' || eventType === 'stream.started' || eventType === 'ready') {
    const wasAlreadyLive = session.status === 'LIVE';
    await prisma.showSession.update({
      where: { id: session.id },
      data: {
        firstFrameAt: session.firstFrameAt ?? new Date(),
        broadcastHealth: 'GOOD',
        status: 'LIVE',
      },
    });
    if (!wasAlreadyLive) {
      await prisma.show.update({ where: { id: session.showId }, data: { status: 'LIVE' } });
    }
  } else if (eventType === 'live_input.disconnected' || eventType === 'stream.ended' || eventType === 'ended') {
    if (session.status !== 'ENDED') {
      const reason = typeof payload.reason === 'string' ? payload.reason : 'provider_ended';
      await prisma.$transaction([
        prisma.showSession.update({
          where: { id: session.id },
          data: { status: 'ENDED', endedAt: new Date(), broadcastEndedReason: reason, pinnedItemId: null },
        }),
        prisma.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } }),
      ]);
    }
  } else if (eventType === 'live_input.degraded' || eventType === 'stream.degraded') {
    await prisma.showSession.update({
      where: { id: session.id },
      data: { broadcastHealth: 'DEGRADED' },
    });
  }

  return c.json({ received: true });
});

export { app as webhookRoutes };
