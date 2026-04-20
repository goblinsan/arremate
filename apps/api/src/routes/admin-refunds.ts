import type { FastifyInstance } from 'fastify';
import { prisma } from '@arremate/database';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import { createPixAdapter } from '@arremate/payments';

/**
 * Admin refund routes.
 *
 * POST /v1/admin/orders/:orderId/refund – trigger a refund for a paid order
 */
export async function adminRefundRoutes(fastify: FastifyInstance): Promise<void> {
  const adminGuard = [authenticate, requireRole('ADMIN')];

  fastify.post('/v1/admin/orders/:orderId/refund', { preHandler: adminGuard }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const admin = request.currentUser!;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Order not found' });
    }

    if (order.status !== 'PAID') {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Cannot refund an order with status: ${order.status}`,
      });
    }

    // Find the successful payment to refund
    const paidPayment = order.payments.find((p) => p.status === 'PAID');

    if (!paidPayment) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'No paid payment found for this order',
      });
    }

    // Trigger refund through the payment provider abstraction
    if (paidPayment.providerId) {
      const paymentAdapter = createPixAdapter();
      await paymentAdapter.refundCharge(paidPayment.providerId);
    }

    // Update payment and order status in a transaction
    const [updatedPayment, updatedOrder] = await prisma.$transaction([
      prisma.payment.update({
        where: { id: paidPayment.id },
        data: { status: 'REFUNDED' },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED' },
      }),
    ]);

    await createAuditEvent({
      action: 'ORDER_REFUNDED',
      actorId: admin.id,
      metadata: {
        orderId,
        paymentId: paidPayment.id,
        amountCents: paidPayment.amountCents,
        providerId: paidPayment.providerId,
      },
    });

    return reply.send({ order: updatedOrder, payment: updatedPayment });
  });
}
