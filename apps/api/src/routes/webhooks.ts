import { Hono } from 'hono';
import { prisma, Prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { createLiveVideoProvider } from '@arremate/video';
import { createHash, timingSafeEqual } from 'node:crypto';
import { trackEvent, TelemetryEvents } from '@arremate/observability';
import { createPayableFromOrder } from '../services/payout-service.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();

type CloudflareLiveWebhookPayload = {
  data?: {
    input_id?: string;
    event_type?: string;
    updated_at?: string;
    live_input_errored?: {
      error?: {
        code?: string;
        message?: string;
      };
      video_codec?: string;
      audio_codec?: string;
    };
  };
  uid?: string;
  event?: string;
  type?: string;
  providerSessionId?: string;
  live_input_id?: string;
  reason?: string;
};

function secureEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

app.post('/v1/webhooks/pix', async (c) => {
  const signature = c.req.header('x-pix-signature') ?? '';
  const rawBody = await c.req.text();

  trackEvent(TelemetryEvents.WEBHOOK_RECEIVED, { provider: 'pix' });

  const pixAdapter = createPixAdapter();
  let event;
  try {
    event = pixAdapter.verifyWebhook(rawBody, signature);
  } catch {
    trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: 'pix', reason: 'INVALID_SIGNATURE' });
    return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
  }

  // Derive an idempotency key from the signature; fall back to a hash of the body.
  const idempotencyKey = signature
    ? createHash('sha256').update(signature).digest('hex')
    : createHash('sha256').update(rawBody).digest('hex');

  // Deduplicate: if we have already processed this exact delivery, ack and return.
  const existingLog = await prisma.pixWebhookLog.findUnique({ where: { idempotencyKey } });
  if (existingLog) {
    trackEvent(TelemetryEvents.WEBHOOK_DUPLICATE, { provider: 'pix', providerId: event.providerId });
    return c.json({ received: true });
  }

  const payment = await prisma.payment.findFirst({ where: { providerId: event.providerId }, include: { order: true } });

  // Persist the raw event for audit purposes regardless of whether a matching
  // payment exists or has already been transitioned.
  const parsedPayload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  await prisma.pixWebhookLog.create({
    data: {
      paymentId: payment?.id ?? null,
      providerId: event.providerId,
      eventStatus: event.status,
      idempotencyKey,
      rawPayload: parsedPayload,
    },
  });

  if (!payment) return c.json({ received: true });
  if (payment.status !== 'PENDING') return c.json({ received: true });

  const dbPaymentStatus = ((): 'PAID' | 'FAILED' | 'REFUNDED' => {
    if (event.status === 'PAID') return 'PAID';
    if (event.status === 'REFUNDED') return 'REFUNDED';
    return 'FAILED';
  })();
  const dbOrderStatus = event.status === 'PAID' ? 'PAID' : 'CANCELLED';

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: dbPaymentStatus, webhookPayload: parsedPayload } });
    await tx.order.update({ where: { id: payment.orderId }, data: { status: dbOrderStatus } });
    if (dbOrderStatus === 'PAID') {
      await createPayableFromOrder(payment.orderId, tx);
    }
  });

  trackEvent(TelemetryEvents.WEBHOOK_PROCESSED, {
    provider: 'pix',
    providerId: event.providerId,
    paymentId: payment.id,
    orderId: payment.orderId,
    eventStatus: event.status,
  });

  return c.json({ received: true });
});

app.post('/v1/webhooks/live-video', async (c) => {
  const providerName = process.env.LIVE_VIDEO_PROVIDER ?? 'stub';
  const provider = createLiveVideoProvider(providerName);
  const rawBody = await c.req.text();

  trackEvent(TelemetryEvents.WEBHOOK_RECEIVED, { provider: providerName });

  let payload: CloudflareLiveWebhookPayload;

  if (providerName === 'cloudflare_stream') {
    const genericWebhookSecret = c.req.header('cf-webhook-auth');
    if (genericWebhookSecret) {
      const expectedSecret = process.env.CF_STREAM_WEBHOOK_SECRET;
      if (!expectedSecret || !secureEqual(genericWebhookSecret, expectedSecret)) {
        trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: providerName, reason: 'INVALID_SIGNATURE' });
        return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
      }

      payload = JSON.parse(rawBody) as CloudflareLiveWebhookPayload;
    } else {
      if (!provider.verifyWebhook) {
        trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: providerName, reason: 'NO_VERIFY_SUPPORT' });
        return c.json({ statusCode: 400, error: 'Bad Request', message: 'Provider does not support webhooks' }, 400);
      }

      const signature = c.req.header('webhook-signature') ?? c.req.header('x-webhook-signature') ?? '';
      try {
        payload = provider.verifyWebhook(rawBody, signature) as CloudflareLiveWebhookPayload;
      } catch {
        trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: providerName, reason: 'INVALID_SIGNATURE' });
        return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
      }
    }
  } else {
    if (!provider.verifyWebhook) {
      trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: providerName, reason: 'NO_VERIFY_SUPPORT' });
      return c.json({ statusCode: 400, error: 'Bad Request', message: 'Provider does not support webhooks' }, 400);
    }

    const signature = c.req.header('webhook-signature') ?? c.req.header('x-webhook-signature') ?? '';
    try {
      payload = provider.verifyWebhook(rawBody, signature) as CloudflareLiveWebhookPayload;
    } catch {
      trackEvent(TelemetryEvents.WEBHOOK_REJECTED, { provider: providerName, reason: 'INVALID_SIGNATURE' });
      return c.json({ statusCode: 400, error: 'Bad Request', message: 'Invalid webhook signature' }, 400);
    }
  }

  // Cloudflare Notifications wrap Stream Live events under `data`.
  // For flexibility, also tolerate top-level provider identifiers used by tests or future providers.
  const providerSessionId = payload.data?.input_id
    ?? payload.uid
    ?? payload.providerSessionId
    ?? payload.live_input_id;

  if (!providerSessionId) {
    return c.json({ received: true });
  }

  const session = await prisma.showSession.findFirst({ where: { providerSessionId } });
  if (!session) {
    return c.json({ received: true });
  }

  const eventType = payload.data?.event_type
    ?? payload.event
    ?? payload.type;

  if (!eventType) {
    return c.json({ received: true });
  }

  const providerErrorCode = payload.data?.live_input_errored?.error?.code;
  const providerErrorMessage = payload.data?.live_input_errored?.error?.message;

  // Do not end a commerce session on provider disconnect notifications.
  // Cloudflare may emit disconnects during temporary network loss, and sellers
  // should be allowed to reconnect without destroying the session.
  if (eventType === 'live_input.connected' || eventType === 'stream.started' || eventType === 'ready') {
    const wasAlreadyLive = session.status === 'LIVE';
    await prisma.showSession.update({
      where: { id: session.id },
      data: {
        broadcastStartedAt: session.broadcastStartedAt ?? new Date(),
        firstFrameAt: session.firstFrameAt ?? new Date(),
        broadcastHealth: 'GOOD',
        broadcastErrorCode: null,
        status: 'LIVE',
      },
    });
    if (!wasAlreadyLive) {
      await prisma.show.update({ where: { id: session.showId }, data: { status: 'LIVE' } });
    }
  } else if (eventType === 'live_input.disconnected' || eventType === 'stream.disconnected') {
    await prisma.showSession.update({
      where: { id: session.id },
      data: { broadcastHealth: 'DOWN' },
    });
  } else if (
    eventType === 'live_input.errored'
    || eventType === 'live_input.degraded'
    || eventType === 'stream.degraded'
  ) {
    await prisma.showSession.update({
      where: { id: session.id },
      data: {
        broadcastHealth: 'DEGRADED',
        broadcastErrorCode: providerErrorCode ?? session.broadcastErrorCode,
        broadcastEndedReason: providerErrorMessage ?? session.broadcastEndedReason,
      },
    });
  } else if (eventType === 'stream.ended' || eventType === 'ended') {
    if (session.status !== 'ENDED') {
      const reason = typeof payload.reason === 'string' ? payload.reason : 'provider_ended';
      await prisma.$transaction(async (tx) => {
        await tx.showSession.update({
          where: { id: session.id },
          data: { status: 'ENDED', endedAt: new Date(), broadcastEndedReason: reason, pinnedItemId: null },
        });
        await tx.show.update({ where: { id: session.showId }, data: { status: 'ENDED' } });
      });
    }
  }

  trackEvent(TelemetryEvents.WEBHOOK_PROCESSED, {
    provider: providerName,
    providerSessionId,
    eventType,
  });

  return c.json({ received: true });
});

export { app as webhookRoutes };
