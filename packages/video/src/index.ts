import { createHmac, timingSafeEqual } from 'node:crypto';

export type StreamStatus = 'IDLE' | 'STARTING' | 'LIVE' | 'ENDED';

export interface StreamSession {
  id: string;
  auctionId: string;
  status: StreamStatus;
  ingestUrl?: string;
  playbackUrl?: string;
  startedAt?: Date;
  endedAt?: Date;
}

export interface StreamConfig {
  provider: 'MUX' | 'CLOUDFLARE_STREAM' | 'CUSTOM';
  region: string;
}

/**
 * Returns a thumbnail URL from a playback ID (Mux-style).
 * Replace with actual provider logic in Phase 3.
 */
export function getThumbnailUrl(playbackId: string, time = 0): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}`;
}

// ─── Live Video Provider Abstraction ─────────────────────────────────────────

/**
 * Control-plane data returned when a broadcast session is prepared.
 * All fields beyond providerSessionId are optional because not every
 * provider supports every capability.
 */
export interface PrepareBroadcastResult {
  /** Opaque identifier assigned by the provider; stored on ShowSession. */
  providerSessionId: string;
  /** HLS or WebRTC playback URL that buyers can load. */
  playbackUrl?: string;
  /** WHIP or other publish endpoint for the seller's browser. */
  publishUrl?: string;
  /** Short-lived credential for the publish endpoint (if required). */
  publishToken?: string;
  /** ISO-8601 timestamp after which publishToken must be refreshed. */
  expiresAt?: string;
  /** Fallback RTMP ingest details for external encoders. */
  fallbackRtmp?: {
    ingestUrl: string;
    streamKey: string;
  };
}

/**
 * Provider-agnostic interface for managing live video sessions.
 * Implement this interface to swap video backends without touching
 * core commerce logic.
 */
export interface LiveVideoProvider {
  /**
   * Allocate a new live-stream resource at the provider and return all
   * control-plane data needed to begin broadcasting.
   */
  prepareBroadcast(showId: string): Promise<PrepareBroadcastResult>;
  /**
   * Notify the provider that the seller has successfully connected and
   * the broadcast has started.  Providers that derive first-frame timing
   * from webhooks may leave this as a no-op.
   */
  markBroadcastStarted?(providerSessionId: string): Promise<void>;
  /** Terminate the live-stream resource at the provider. */
  endSession(providerSessionId: string): Promise<void>;
  /**
   * Validate an inbound webhook from the provider.
   * Returns the parsed event payload or throws if the signature is invalid.
   */
  verifyWebhook?(rawBody: string, signature: string): unknown;
}

/**
 * No-op stub provider used in development and testing.
 * Returns deterministic IDs so the rest of the flow can be exercised
 * without a real video backend.
 */
export class StubLiveVideoProvider implements LiveVideoProvider {
  async prepareBroadcast(showId: string): Promise<PrepareBroadcastResult> {
    const id = `stub-${showId}`;
    return {
      providerSessionId: id,
      playbackUrl: `https://stub.example.com/hls/${showId}/index.m3u8`,
      publishUrl: `https://stub.example.com/whip/${showId}/publish`,
      publishToken: `stub-token-${showId}`,
      fallbackRtmp: {
        ingestUrl: 'rtmps://stub.example.com/live/',
        streamKey: `stub-key-${showId}`,
      },
    };
  }

  async markBroadcastStarted(_providerSessionId: string): Promise<void> {
    // no-op
  }

  async endSession(_providerSessionId: string): Promise<void> {
    // no-op
  }

  verifyWebhook(rawBody: string, _signature: string): unknown {
    return JSON.parse(rawBody) as unknown;
  }
}

// ─── Cloudflare Stream Live Provider ─────────────────────────────────────────

interface CloudflareLiveInputResult {
  uid: string;
  webRTC?: { url: string };
  webRTCPlayback?: { url: string };
  rtmps?: { url: string; streamKey: string };
}

interface CloudflareApiResponse {
  result: CloudflareLiveInputResult;
  success: boolean;
  errors: Array<{ message: string }>;
}

/**
 * Cloudflare Stream Live provider.
 *
 * Required environment variables:
 *   CF_ACCOUNT_ID           – Cloudflare account identifier
 *   CF_API_TOKEN            – API token with Stream:Edit permission
 *
 * Optional environment variables:
 *   CF_STREAM_WEBHOOK_SECRET – HMAC-SHA256 secret for verifying provider webhooks
 */
export class CloudflareStreamLiveProvider implements LiveVideoProvider {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly webhookSecret: string | undefined;
  private readonly apiBase = 'https://api.cloudflare.com/client/v4';

  constructor(env: {
    CF_ACCOUNT_ID?: string;
    CF_API_TOKEN?: string;
    CF_STREAM_WEBHOOK_SECRET?: string;
  } = {}) {
    const accountId = env.CF_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
    const apiToken = env.CF_API_TOKEN ?? process.env.CF_API_TOKEN;
    if (!accountId || !apiToken) {
      throw new Error(
        'CloudflareStreamLiveProvider requires CF_ACCOUNT_ID and CF_API_TOKEN',
      );
    }
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.webhookSecret =
      env.CF_STREAM_WEBHOOK_SECRET ?? process.env.CF_STREAM_WEBHOOK_SECRET;
  }

  async prepareBroadcast(showId: string): Promise<PrepareBroadcastResult> {
    const url = `${this.apiBase}/accounts/${this.accountId}/stream/live_inputs`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: { name: `show-${showId}` },
        recording: { mode: 'automatic' },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Cloudflare Stream API error ${response.status}: ${text}`,
      );
    }

    const data = (await response.json()) as CloudflareApiResponse;

    if (!data.success) {
      const messages = data.errors.map((e) => e.message).join(', ');
      throw new Error(`Cloudflare Stream API returned errors: ${messages}`);
    }

    const input = data.result;

    return {
      providerSessionId: input.uid,
      publishUrl: input.webRTC?.url,
      playbackUrl: input.webRTCPlayback?.url,
      fallbackRtmp: input.rtmps
        ? { ingestUrl: input.rtmps.url, streamKey: input.rtmps.streamKey }
        : undefined,
    };
  }

  async markBroadcastStarted(_providerSessionId: string): Promise<void> {
    // Cloudflare notifies stream-start via webhook; no explicit API call needed.
  }

  async endSession(providerSessionId: string): Promise<void> {
    const url = `${this.apiBase}/accounts/${this.accountId}/stream/live_inputs/${providerSessionId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    // 404 means the input was already deleted; treat as success.
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(
        `Cloudflare Stream API error ${response.status}: ${text}`,
      );
    }
  }

  /**
   * Verify a Cloudflare Stream webhook using HMAC-SHA256.
   *
   * Cloudflare sends the signature in the `Webhook-Signature` header with
   * the format `time=<unix_ts>,v1=<hex_digest>`.  The signed payload is
   * `<time>.<rawBody>`.
   */
  verifyWebhook(rawBody: string, signature: string): unknown {
    if (!this.webhookSecret) {
      throw new Error(
        'CF_STREAM_WEBHOOK_SECRET is required for webhook verification',
      );
    }

    // Parse "time=<ts>,v1=<hex>" from the header value.
    const timeMatch = /time=(\d+)/.exec(signature);
    const v1Match = /v1=([0-9a-f]+)/i.exec(signature);
    if (!timeMatch || !v1Match) {
      throw new Error('Invalid Cloudflare webhook signature format');
    }

    const timestamp = timeMatch[1];
    const expectedHex = v1Match[1].toLowerCase();
    const signedPayload = `${timestamp}.${rawBody}`;

    // Use node:crypto HMAC-SHA256 (available in Node.js and CF Workers via
    // the nodejs_compat compatibility flag).
    const actualHex = createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Use constant-time comparison to prevent timing-based side-channel attacks.
    const actual = Buffer.from(actualHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('Cloudflare webhook signature mismatch');
    }

    return JSON.parse(rawBody) as unknown;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Factory that returns a LiveVideoProvider implementation.
 * Pass the provider name explicitly, or set LIVE_VIDEO_PROVIDER in the
 * calling environment and forward it as the argument.
 * Add new provider cases here when integrating a real backend.
 */
export function createLiveVideoProvider(provider = 'stub'): LiveVideoProvider {
  switch (provider) {
    case 'cloudflare_stream':
      return new CloudflareStreamLiveProvider();
    case 'stub':
    default:
      return new StubLiveVideoProvider();
  }
}
