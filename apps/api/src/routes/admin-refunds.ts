import { Hono } from 'hono';
import { prisma } from '@arremate/database';
import { createPixAdapter } from '@arremate/payments';
import { authenticate } from '../plugins/authenticate.js';
import { requireRole } from '../plugins/authorize.js';
import { createAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

const app = new Hono<AppEnv>();
const adminGuard = [authenticate, requireRole('ADMIN')] as const;

app.post('/v1/admin/orders/:orderId/refund', ...adminGuard, async (c) => {
  const orderId = c.req.param('orderId');
  const admin = c.get('currentUser');
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: 'desc' } } } });
  if (!order) return c.json({ statusCode: 404, error: 'Not Found', message: 'Order not found' }, 404);
  if (order.status !== 'PAID') return c.json({ statusCode: 409, error: 'Conflict', message: `Cannot refund an order with status: ${order.status}` }, 409);
  const paidPayment = order.payments.find((p) => p.status === 'PAID');
  if (!paidPayment) return c.json({ statusCode: 409, error: 'Conflict', message: 'No paid payment found for this order' }, 409);
  if (paidPayment.providerId) {
    const paymentAdapter = createPixAdapter();
    await paymentAdapter.refundCharge(paidPayment.providerId);
  }
  const [updatedPayment, updatedOrder] = await prisma.$transaction([
    prisma.payment.update({ where: { id: paidPayment.id }, data: { status: 'REFUNDED' } }),
    prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } }),
  ]);
  await createAuditEvent({ action: 'ORDER_REFUNDED', actorId: admin.id, metadata: { orderId, paymentId: paidPayment.id, amountCents: paidPayment.amountCents, providerId: paidPayment.providerId } });
  return c.json({ order: updatedOrder, payment: updatedPayment });
});

export { app as adminRefundRoutes };
