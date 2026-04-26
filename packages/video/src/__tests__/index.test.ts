import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  StubLiveVideoProvider,
  CloudflareStreamLiveProvider,
  createLiveVideoProvider,
} from '../index.js';

// ─── StubLiveVideoProvider ────────────────────────────────────────────────────

describe('StubLiveVideoProvider', () => {
  it('prepareBroadcast returns a deterministic result for the same showId', async () => {
    const provider = new StubLiveVideoProvider();
    const result = await provider.prepareBroadcast('show-abc');

    expect(result.providerSessionId).toBe('stub-show-abc');
    expect(result.publishUrl).toContain('show-abc');
    expect(result.publishToken).toContain('show-abc');
    expect(result.playbackUrl).toContain('show-abc');
    expect(result.fallbackRtmp).toBeDefined();
    expect(result.fallbackRtmp?.ingestUrl).toBeTruthy();
    expect(result.fallbackRtmp?.streamKey).toContain('show-abc');
  });

  it('prepareBroadcast returns the same providerSessionId on repeated calls', async () => {
    const provider = new StubLiveVideoProvider();
    const r1 = await provider.prepareBroadcast('show-xyz');
    const r2 = await provider.prepareBroadcast('show-xyz');
    expect(r1.providerSessionId).toBe(r2.providerSessionId);
  });

  it('markBroadcastStarted resolves without error', async () => {
    const provider = new StubLiveVideoProvider();
    await expect(provider.markBroadcastStarted?.('sess-1')).resolves.toBeUndefined();
  });

  it('endSession resolves without error', async () => {
    const provider = new StubLiveVideoProvider();
    await expect(provider.endSession('sess-1')).resolves.toBeUndefined();
  });

  it('verifyWebhook parses a valid JSON body', () => {
    const provider = new StubLiveVideoProvider();
    const payload = { event: 'live_input.connected', uid: 'sess-1' };
    const result = provider.verifyWebhook?.(JSON.stringify(payload), 'any-sig');
    expect(result).toEqual(payload);
  });

  it('verifyWebhook throws on invalid JSON', () => {
    const provider = new StubLiveVideoProvider();
    expect(() => provider.verifyWebhook?.('not-json', 'sig')).toThrow();
  });
});

// ─── CloudflareStreamLiveProvider ─────────────────────────────────────────────

describe('CloudflareStreamLiveProvider', () => {
  it('throws when CF_ACCOUNT_ID is missing', () => {
    expect(
      () =>
        new CloudflareStreamLiveProvider({
          CF_API_TOKEN: 'tok',
        }),
    ).toThrow(/CF_ACCOUNT_ID/);
  });

  it('throws when CF_API_TOKEN is missing', () => {
    expect(
      () =>
        new CloudflareStreamLiveProvider({
          CF_ACCOUNT_ID: 'acc',
        }),
    ).toThrow(/CF_API_TOKEN/);
  });

  describe('prepareBroadcast', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('calls the Cloudflare API and returns mapped fields', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          result: {
            uid: 'cf-live-uid-123',
            webRTC: { url: 'https://customer-abc.cloudflarestream.com/cf-live-uid-123/webRTC/publish' },
            webRTCPlayback: { url: 'https://customer-abc.cloudflarestream.com/cf-live-uid-123/webRTC/play' },
            rtmps: {
              url: 'rtmps://live.cloudflare.com/live/',
              streamKey: 'rtmp-key-123',
            },
          },
        }),
      };
      vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc-id',
        CF_API_TOKEN: 'api-tok',
      });
      const result = await provider.prepareBroadcast('show-1');

      expect(result.providerSessionId).toBe('cf-live-uid-123');
      expect(result.publishUrl).toContain('webRTC/publish');
      expect(result.playbackUrl).toContain('webRTC/play');
      expect(result.fallbackRtmp?.ingestUrl).toBe('rtmps://live.cloudflare.com/live/');
      expect(result.fallbackRtmp?.streamKey).toBe('rtmp-key-123');
    });

    it('throws when the HTTP response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as unknown as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      await expect(provider.prepareBroadcast('show-1')).rejects.toThrow(/401/);
    });

    it('throws when the API returns success: false', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          errors: [{ message: 'Invalid account' }],
          result: null,
        }),
      } as unknown as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      await expect(provider.prepareBroadcast('show-1')).rejects.toThrow(/Invalid account/);
    });
  });

  describe('endSession', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends a DELETE request to the live input endpoint', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200 } as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      await provider.endSession('live-uid-abc');

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toContain('live-uid-abc');
      expect((init as RequestInit).method).toBe('DELETE');
    });

    it('treats a 404 response as success (already deleted)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      await expect(provider.endSession('ghost-uid')).resolves.toBeUndefined();
    });

    it('throws on unexpected errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as unknown as Response);

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      await expect(provider.endSession('uid')).rejects.toThrow(/500/);
    });
  });

  describe('verifyWebhook', () => {
    it('throws when CF_STREAM_WEBHOOK_SECRET is not configured', () => {
      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
      });
      expect(() => provider.verifyWebhook?.('{}', 'time=1,v1=abc')).toThrow(
        /CF_STREAM_WEBHOOK_SECRET/,
      );
    });

    it('throws on malformed signature header', () => {
      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
        CF_STREAM_WEBHOOK_SECRET: 'secret',
      });
      expect(() => provider.verifyWebhook?.('{}', 'bad-format')).toThrow(
        /signature format/,
      );
    });

    it('throws when the HMAC does not match', () => {
      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
        CF_STREAM_WEBHOOK_SECRET: 'secret',
      });
      expect(() => provider.verifyWebhook?.('{}', 'time=1234,v1=deadbeef')).toThrow(
        /mismatch/,
      );
    });

    it('returns the parsed body when the signature is valid', () => {
      // Compute the expected HMAC outside of the provider to verify round-trip.
      const body = '{"event":"live_input.connected"}';
      const timestamp = '1700000000';
      const secret = 'my-webhook-secret';
      const hex = createHmac('sha256', secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      const provider = new CloudflareStreamLiveProvider({
        CF_ACCOUNT_ID: 'acc',
        CF_API_TOKEN: 'tok',
        CF_STREAM_WEBHOOK_SECRET: secret,
      });
      const result = provider.verifyWebhook?.(`${body}`, `time=${timestamp},v1=${hex}`);
      expect(result).toEqual({ event: 'live_input.connected' });
    });
  });
});

// ─── createLiveVideoProvider factory ──────────────────────────────────────────

describe('createLiveVideoProvider', () => {
  it('returns a StubLiveVideoProvider by default', () => {
    const provider = createLiveVideoProvider();
    expect(provider).toBeInstanceOf(StubLiveVideoProvider);
  });

  it('returns a StubLiveVideoProvider when "stub" is passed', () => {
    const provider = createLiveVideoProvider('stub');
    expect(provider).toBeInstanceOf(StubLiveVideoProvider);
  });

  it('returns a CloudflareStreamLiveProvider when "cloudflare_stream" is passed', () => {
    process.env.CF_ACCOUNT_ID = 'acc';
    process.env.CF_API_TOKEN = 'tok';
    const provider = createLiveVideoProvider('cloudflare_stream');
    expect(provider).toBeInstanceOf(CloudflareStreamLiveProvider);
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_API_TOKEN;
  });

  it('falls back to StubLiveVideoProvider for unknown provider names', () => {
    const provider = createLiveVideoProvider('unknown_provider');
    expect(provider).toBeInstanceOf(StubLiveVideoProvider);
  });
});
