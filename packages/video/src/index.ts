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

export interface LiveSessionResult {
  providerSessionId: string;
  playbackUrl?: string;
  ingestUrl?: string;
}

/**
 * Provider-agnostic interface for managing live video sessions.
 * Implement this interface to swap video backends without touching
 * core commerce logic.
 */
export interface LiveVideoProvider {
  createSession(showId: string): Promise<LiveSessionResult>;
  endSession(providerSessionId: string): Promise<void>;
}

/**
 * No-op stub provider used in development and testing.
 * Returns deterministic IDs so the rest of the flow can be exercised
 * without a real video backend.
 */
export class StubLiveVideoProvider implements LiveVideoProvider {
  async createSession(showId: string): Promise<LiveSessionResult> {
    return {
      providerSessionId: `stub-${showId}-${Date.now()}`,
      playbackUrl: undefined,
      ingestUrl: undefined,
    };
  }

  async endSession(_providerSessionId: string): Promise<void> {
    // no-op
  }
}

/**
 * Factory that returns a LiveVideoProvider implementation.
 * Pass the provider name explicitly, or set LIVE_VIDEO_PROVIDER in the
 * calling environment and forward it as the argument.
 * Add new provider cases here when integrating a real backend.
 */
export function createLiveVideoProvider(provider = 'stub'): LiveVideoProvider {
  switch (provider) {
    case 'stub':
    default:
      return new StubLiveVideoProvider();
  }
}
