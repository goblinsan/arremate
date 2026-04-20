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

// ─── Payment Provider Abstraction ─────────────────────────────────────────────

export interface PixChargeResult {
  providerId: string;
  pixCode: string;
  pixQrCodeBase64: string;
  expiresAt: Date;
}

export interface PixWebhookEvent {
  providerId: string;
  status: 'PAID' | 'EXPIRED' | 'REFUNDED';
  paidAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
  /**
   * Create a Pix charge for the given amount.
   */
  createPixCharge(params: {
    amountCents: number;
    orderId: string;
    description: string;
    expiresInMinutes?: number;
  }): Promise<PixChargeResult>;

  /**
   * Verify that a raw webhook body was signed by the provider.
   * Returns the parsed event or throws if the signature is invalid.
   */
  verifyWebhook(rawBody: string | Buffer, signature: string): PixWebhookEvent;

  /**
   * Query the provider for the current status of a charge.
   */
  getChargeStatus(providerId: string): Promise<'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED'>;

  /**
   * Trigger a refund for a previously paid charge.
   */
  refundCharge(providerId: string): Promise<void>;
}

// ─── Stub Pix Adapter ─────────────────────────────────────────────────────────

/**
 * In-memory stub adapter used in development and test environments.
 * It always generates deterministic fake Pix codes and accepts any
 * webhook signature value.
 */
export class StubPixAdapter implements PaymentProviderAdapter {
  async createPixCharge(params: {
    amountCents: number;
    orderId: string;
    description: string;
    expiresInMinutes?: number;
  }): Promise<PixChargeResult> {
    const expiresInMinutes = params.expiresInMinutes ?? 30;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const providerId = `stub_pix_${params.orderId}_${Date.now()}`;

    // Fake Pix EMV code segments:
    // 000201   – Payload format indicator (version 01)
    // 26...    – Merchant account info (BR Pix: br.gov.bcb.pix, with transaction key)
    // 5204...  – Merchant category code (0000 = generic)
    // 5303986  – Transaction currency (986 = BRL)
    // 5802BR   – Country code
    // 59...    – Merchant name (max 25 chars)
    // 60...    – Merchant city
    // 6207...  – Additional data (reference label)
    // 6304...  – CRC-16 checksum (placeholder ABCD)
    const pixCode =
      `00020126580014br.gov.bcb.pix0136${providerId}` +
      `5204000053039865802BR5913Arremate STUB` +
      `6009SAO PAULO62070503***6304ABCD`;

    // 1×1 transparent PNG in base64 as a placeholder QR code
    const pixQrCodeBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    return { providerId, pixCode, pixQrCodeBase64, expiresAt };
  }

  verifyWebhook(rawBody: string | Buffer, _signature: string): PixWebhookEvent {
    const payload =
      typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));

    if (!payload.providerId || !payload.status) {
      throw new Error('Invalid stub webhook payload: missing providerId or status');
    }

    return {
      providerId: payload.providerId as string,
      status: payload.status as 'PAID' | 'EXPIRED' | 'REFUNDED',
      paidAt: payload.paidAt ? new Date(payload.paidAt as string) : undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
    };
  }

  async getChargeStatus(
    _providerId: string,
  ): Promise<'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED'> {
    return 'PENDING';
  }

  async refundCharge(_providerId: string): Promise<void> {
    // Stub: no-op in development/test
  }
}

/**
 * Factory that returns the appropriate adapter based on the environment.
 * Extend this to support production providers (e.g. EfiPay, Asaas, Gerencianet).
 */
export function createPixAdapter(provider?: string): PaymentProviderAdapter {
  const name = provider ?? process.env.PIX_PROVIDER ?? 'stub';
  if (name === 'stub') {
    return new StubPixAdapter();
  }
  throw new Error(`Unknown Pix provider: ${name}`);
}
