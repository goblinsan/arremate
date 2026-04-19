export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export type PaymentProvider = 'STRIPE' | 'PAGSEGURO' | 'PIX';

export interface PaymentIntent {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountCents: number;
  currency: 'BRL';
  metadata?: Record<string, string>;
  createdAt: Date;
}

export interface CreatePaymentParams {
  amountCents: number;
  provider: PaymentProvider;
  customerId: string;
  auctionId: string;
  description?: string;
}

/**
 * Formats an integer amount in cents to a BRL string.
 * e.g. 10050 → "R$ 100,50"
 */
export function formatBRL(amountCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountCents / 100);
}

// TODO: integrate Stripe and PagSeguro SDK clients in Phase 4
