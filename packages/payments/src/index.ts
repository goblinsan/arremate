import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

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
  if (name === 'efipay') {
    return new EfiPayPixAdapter();
  }
  throw new Error(`Unknown Pix provider: ${name}`);
}

// ─── EfiPay Pix Adapter ───────────────────────────────────────────────────────

interface EfiPayTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface EfiPayChargeResponse {
  txid: string;
  status: string;
  pixCopiaECola: string;
  loc: { id: number };
  calendario: { criacao: string; expiracao: number };
}

interface EfiPayQrCodeResponse {
  qrcode: string;
  imagemQrcode: string;
}

interface EfiPayStatusResponse {
  status: string;
  pix?: Array<{ endToEndId: string; valor: string; horario: string }>;
}

interface EfiPayWebhookPayload {
  pix?: Array<{
    endToEndId: string;
    txid: string;
    valor: string;
    horario: string;
    chave?: string;
    infoPagador?: string;
  }>;
}

/**
 * Production EfiPay (Gerencianet) Pix adapter.
 *
 * Required environment variables:
 *   EFIPAY_CLIENT_ID       – OAuth2 client ID from EfiPay dashboard
 *   EFIPAY_CLIENT_SECRET   – OAuth2 client secret from EfiPay dashboard
 *   EFIPAY_PIX_KEY         – Your registered Pix key (CPF, CNPJ, phone, or random)
 *   EFIPAY_WEBHOOK_SECRET  – HMAC-SHA256 secret configured on the EfiPay webhook
 *
 * Optional environment variables:
 *   EFIPAY_SANDBOX         – Set to 'true' to use the homologation (sandbox) API
 *
 * For deployments that require mutual TLS (mTLS) to reach the EfiPay API, pass
 * a pre-configured `fetchFn` that handles the TLS handshake (e.g. via an
 * undici Agent with a client certificate, or an mTLS-terminating sidecar).
 */
export class EfiPayPixAdapter implements PaymentProviderAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly pixKey: string;
  private readonly webhookSecret: string;
  private readonly sandbox: boolean;
  private readonly fetchFn: typeof fetch;

  private cachedToken: string | undefined;
  private tokenExpiresAt = 0;

  constructor(
    env: {
      EFIPAY_CLIENT_ID?: string;
      EFIPAY_CLIENT_SECRET?: string;
      EFIPAY_PIX_KEY?: string;
      EFIPAY_WEBHOOK_SECRET?: string;
      EFIPAY_SANDBOX?: string;
    } = {},
    fetchFn?: typeof fetch,
  ) {
    const get = (key: keyof typeof env) => env[key] ?? process.env[key as string] ?? '';
    this.clientId = get('EFIPAY_CLIENT_ID');
    this.clientSecret = get('EFIPAY_CLIENT_SECRET');
    this.pixKey = get('EFIPAY_PIX_KEY');
    this.webhookSecret = get('EFIPAY_WEBHOOK_SECRET');
    this.sandbox = (env.EFIPAY_SANDBOX ?? process.env['EFIPAY_SANDBOX']) === 'true';
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  private get baseUrl(): string {
    return this.sandbox
      ? 'https://pix-h.api.efipay.com.br'
      : 'https://pix.api.efipay.com.br';
  }

  private async apiFetch(path: string, init: RequestInit = {}): Promise<{ status: number; data: unknown }> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, init);
    let data: unknown;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data };
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const result = await this.apiFetch('/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    if (result.status !== 200) {
      throw new Error(`EfiPay auth failed: HTTP ${result.status}`);
    }
    const token = result.data as EfiPayTokenResponse;
    this.cachedToken = token.access_token;
    this.tokenExpiresAt = Date.now() + (token.expires_in - 60) * 1000;
    return this.cachedToken;
  }

  async createPixCharge(params: {
    amountCents: number;
    orderId: string;
    description: string;
    expiresInMinutes?: number;
  }): Promise<PixChargeResult> {
    const accessToken = await this.getAccessToken();
    const expiresInMinutes = params.expiresInMinutes ?? 30;
    const txid = params.orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);
    const amountFormatted = (params.amountCents / 100).toFixed(2);

    const chargeResult = await this.apiFetch(`/v2/cob/${txid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        calendario: { expiracao: expiresInMinutes * 60 },
        valor: { original: amountFormatted },
        chave: this.pixKey,
        solicitacaoPagador: params.description.slice(0, 140),
        infoAdicionais: [{ nome: 'orderId', valor: params.orderId }],
      }),
    });
    if (chargeResult.status !== 201 && chargeResult.status !== 200) {
      throw new Error(`EfiPay charge creation failed: HTTP ${chargeResult.status}`);
    }
    const charge = chargeResult.data as EfiPayChargeResponse;

    const qrResult = await this.apiFetch(`/v2/loc/${charge.loc.id}/qrcode`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let pixQrCodeBase64 = '';
    if (qrResult.status === 200) {
      const qrData = qrResult.data as EfiPayQrCodeResponse;
      const raw = qrData.imagemQrcode ?? qrData.qrcode ?? '';
      pixQrCodeBase64 = raw.replace(/^data:image\/[^;]+;base64,/, '');
    }

    const expiresAt = new Date(
      new Date(charge.calendario.criacao).getTime() + charge.calendario.expiracao * 1000,
    );

    return {
      providerId: charge.txid,
      pixCode: charge.pixCopiaECola,
      pixQrCodeBase64,
      expiresAt,
    };
  }

  verifyWebhook(rawBody: string | Buffer, signature: string): PixWebhookEvent {
    if (!this.webhookSecret) {
      throw new Error('EFIPAY_WEBHOOK_SECRET is not configured');
    }

    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    // Signature may be prefixed with "sha256=" (GitHub style) – strip it
    const sigHex = signature.replace(/^sha256=/, '');
    const actualBytes = Buffer.from(sigHex, 'hex');

    if (
      actualBytes.length === 0 ||
      expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)
    ) {
      throw new Error('Invalid EfiPay webhook signature');
    }

    const payload = JSON.parse(body) as EfiPayWebhookPayload;
    const firstPix = payload.pix?.[0];
    if (!firstPix?.txid) {
      throw new Error('EfiPay webhook payload missing pix[0].txid');
    }

    return {
      providerId: firstPix.txid,
      status: 'PAID',
      paidAt: firstPix.horario ? new Date(firstPix.horario) : undefined,
      metadata: {
        endToEndId: firstPix.endToEndId,
        valor: firstPix.valor,
        infoPagador: firstPix.infoPagador,
      },
    };
  }

  async getChargeStatus(providerId: string): Promise<'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED'> {
    const accessToken = await this.getAccessToken();

    const result = await this.apiFetch(`/v2/cob/${providerId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (result.status === 404) return 'EXPIRED';
    if (result.status !== 200) {
      throw new Error(`EfiPay getChargeStatus failed: HTTP ${result.status}`);
    }

    const data = result.data as EfiPayStatusResponse;
    switch (data.status) {
      case 'CONCLUIDA': return 'PAID';
      case 'REMOVIDA_PELO_USUARIO_RECEBEDOR':
      case 'REMOVIDA_PELO_PSP':
        return 'EXPIRED';
      case 'ATIVA': return 'PENDING';
      default: return 'PENDING';
    }
  }

  async refundCharge(providerId: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    const statusResult = await this.apiFetch(`/v2/cob/${providerId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (statusResult.status !== 200) {
      throw new Error(`EfiPay refund lookup failed: HTTP ${statusResult.status}`);
    }
    const data = statusResult.data as EfiPayStatusResponse;
    const e2eid = data.pix?.[0]?.endToEndId;
    if (!e2eid) {
      throw new Error(`EfiPay refund: no endToEndId found for txid ${providerId}`);
    }

    const refundId = createHash('md5').update(`refund-${providerId}`).digest('hex').slice(0, 35);
    const refundResult = await this.apiFetch(`/v2/pix/${e2eid}/devolucao/${refundId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ valor: data.pix?.[0]?.valor ?? '0.00' }),
    });
    if (refundResult.status !== 201 && refundResult.status !== 200) {
      throw new Error(`EfiPay refund failed: HTTP ${refundResult.status}`);
    }
  }
}
