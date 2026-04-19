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

// TODO: integrate Mux or Cloudflare Stream in Phase 3
