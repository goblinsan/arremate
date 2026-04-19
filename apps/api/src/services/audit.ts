import { prisma, Prisma } from '@arremate/database';

/**
 * Creates an audit event record for sensitive review actions.
 */
export async function createAuditEvent(params: {
  action: string;
  actorId: string;
  applicationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      action: params.action,
      actorId: params.actorId,
      applicationId: params.applicationId ?? null,
      metadata: (params.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}
