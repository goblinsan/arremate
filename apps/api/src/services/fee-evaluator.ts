import { prisma } from '@arremate/database';
import { calculateFee } from './fee-calculator.js';
import type {
  FeeConfigSnapshot,
  FeeBreakdown,
  CalculateFeeParams,
  SellerOverrideSnapshot,
  PromotionSnapshot,
} from './fee-calculator.js';

export type {
  FeeConfigSnapshot,
  FeeBreakdown,
  CalculateFeeParams,
  SellerOverrideSnapshot,
  PromotionSnapshot,
};
export { calculateFee };

// ─── DB-aware evaluator ───────────────────────────────────────────────────────

export interface EvaluateFeeParams {
  subtotalCents: number;
  sellerId: string;
  at?: Date;
  promotionCode?: string;
}

export async function evaluateFee(params: EvaluateFeeParams): Promise<FeeBreakdown> {
  const { subtotalCents, sellerId, at = new Date(), promotionCode } = params;

  const config = await prisma.feeConfig.findFirst({
    where: {
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      sellerOverrides: { where: { sellerId } },
      promotions: {
        where: {
          validFrom: { lte: at },
          validTo: { gt: at },
          OR: [{ sellerId: null }, { sellerId }],
          ...(promotionCode ? { code: promotionCode } : {}),
        },
        orderBy: { discountBps: 'desc' },
        take: 1,
      },
    },
  });

  if (!config) {
    throw new Error('No active fee configuration found for the requested time');
  }

  const sellerOverride: SellerOverrideSnapshot | null = config.sellerOverrides[0]
    ? { commissionBps: config.sellerOverrides[0].commissionBps }
    : null;

  const promotion: PromotionSnapshot | null = config.promotions[0]
    ? { code: config.promotions[0].code, discountBps: config.promotions[0].discountBps }
    : null;

  return calculateFee({
    config: {
      id: config.id,
      version: config.version,
      commissionBps: config.commissionBps,
      processorFeeBps: config.processorFeeBps,
      shippingModel: config.shippingModel,
      shippingFixedCents: config.shippingFixedCents,
    },
    subtotalCents,
    sellerOverride,
    promotion,
  });
}
