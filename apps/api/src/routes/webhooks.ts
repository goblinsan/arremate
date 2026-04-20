import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';

/**
 * Provider webhook routes.
 *
 * POST /v1/webhooks/pix  – receive and process Pix payment events
 *
 * The endpoint uses the configured PaymentProviderAdapter to verify the
 * signature before trusting the payload, then reconciles payment and order
 * status idempotently.
 */
export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/v1/webhooks/pix', async (request, reply) => {
    const signature = (request.headers['x-pix-signature'] as string | undefined) ?? '';
    const rawBody = JSON.stringify(request.body);

    const pixAdapter = createPixAdapter();

    let event;
    try {
      event = pixAdapter.verifyWebhook(rawBody, signature);
    } catch (err) {
      request.log.warn({ err }, 'Pix webhook signature verification failed');
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid webhook signature',
      });
    }

    // Find the payment by provider id
    const payment = await prisma.payment.findFirst({
      where: { providerId: event.providerId },
      include: { order: true },
    });

    if (!payment) {
      // Unknown charge – acknowledge so the provider stops retrying
      request.log.warn({ providerId: event.providerId }, 'Pix webhook: payment not found');
      return reply.send({ received: true });
    }

    // Idempotency: skip if already in a terminal state
    if (payment.status !== 'PENDING') {
      return reply.send({ received: true });
    }

    const dbPaymentStatus = ((): 'PAID' | 'FAILED' | 'REFUNDED' => {
      if (event.status === 'PAID') return 'PAID';
      if (event.status === 'REFUNDED') return 'REFUNDED';
      return 'FAILED';
    })();

    const dbOrderStatus = event.status === 'PAID' ? 'PAID' : 'CANCELLED';

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: dbPaymentStatus,
          webhookPayload: request.body as object,
        },
      }),
      prisma.order.update({
        where: { id: payment.orderId },
        data: { status: dbOrderStatus },
      }),
    ]);

    request.log.info(
      { paymentId: payment.id, orderId: payment.orderId, event: event.status },
      'Pix webhook processed',
    );

    return reply.send({ received: true });
  });
}
