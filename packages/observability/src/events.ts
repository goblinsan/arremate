/**
 * Canonical telemetry event taxonomy for Arremate.
 *
 * These constants define the complete set of structured event names used across
 * all services.  Using named constants ensures consistent spelling across
 * producers and consumers, enables IDE auto-complete, and makes it easy to
 * search for all emission sites of a given event.
 *
 * Naming convention: `<domain>.<entity>.<action>` (all lower-case, dot-separated).
 */

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export const TelemetryEvents = {
  // ── HTTP ───────────────────────────────────────────────────────────────────
  /** A complete HTTP request/response cycle on the API server. */
  HTTP_REQUEST_COMPLETED: 'http.request.completed',
  /** An HTTP request that resulted in a 5xx server error. */
  HTTP_REQUEST_FAILED: 'http.request.failed',
  /** An HTTP request that resulted in a 4xx client error. */
  HTTP_REQUEST_CLIENT_ERROR: 'http.request.client_error',

  // ── Auction ────────────────────────────────────────────────────────────────
  /** A buyer placed a bid in a live auction. */
  AUCTION_BID_PLACED: 'auction.bid.placed',
  /** A bid was rejected (e.g. below current price, show not live). */
  AUCTION_BID_REJECTED: 'auction.bid.rejected',
  /** A lot was claimed by the highest bidder at auction close. */
  AUCTION_LOT_CLAIMED: 'auction.lot.claimed',
  /** A live show auction session started. */
  AUCTION_SESSION_STARTED: 'auction.session.started',
  /** A live show auction session ended. */
  AUCTION_SESSION_ENDED: 'auction.session.ended',

  // ── Payment ────────────────────────────────────────────────────────────────
  /** A Pix payment charge was created. */
  PAYMENT_CREATED: 'payment.created',
  /** A Pix payment charge could not be created (provider or validation error). */
  PAYMENT_CREATION_FAILED: 'payment.creation.failed',
  /** A Pix payment was confirmed as paid (webhook). */
  PAYMENT_PAID: 'payment.paid',
  /** A Pix payment expired without being paid. */
  PAYMENT_EXPIRED: 'payment.expired',
  /** A payment refund was initiated. */
  PAYMENT_REFUNDED: 'payment.refunded',
  /** A payment reconciliation was completed. */
  PAYMENT_RECONCILED: 'payment.reconciled',

  // ── Webhook ────────────────────────────────────────────────────────────────
  /** An inbound webhook delivery was received. */
  WEBHOOK_RECEIVED: 'webhook.received',
  /** An inbound webhook was successfully processed. */
  WEBHOOK_PROCESSED: 'webhook.processed',
  /** An inbound webhook was rejected (bad signature, unknown event, etc.). */
  WEBHOOK_REJECTED: 'webhook.rejected',
  /** A duplicate webhook delivery was detected and skipped. */
  WEBHOOK_DUPLICATE: 'webhook.duplicate',

  // ── Auth ───────────────────────────────────────────────────────────────────
  /** A user successfully authenticated. */
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  /** An authentication attempt failed. */
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  /** A user's session token was refreshed. */
  AUTH_TOKEN_REFRESHED: 'auth.token.refreshed',
  /** An access token failed verification. */
  AUTH_TOKEN_INVALID: 'auth.token.invalid',
  /** A user was denied access due to insufficient permissions. */
  AUTH_ACCESS_DENIED: 'auth.access.denied',

  // ── Security ───────────────────────────────────────────────────────────────
  /** An IP or user was rate-limited. */
  SECURITY_RATE_LIMIT_EXCEEDED: 'security.rate_limit.exceeded',
  /** A request was rejected due to a suspicious or malformed payload. */
  SECURITY_INVALID_REQUEST: 'security.invalid_request',
  /** An admin action was taken that requires an audit trail. */
  SECURITY_ADMIN_ACTION: 'security.admin.action',

  // ── Database ───────────────────────────────────────────────────────────────
  /** A database query exceeded the slow-query threshold. */
  DB_SLOW_QUERY: 'db.slow_query',
} as const;

/** Union type of all canonical event name strings. */
export type TelemetryEventName = (typeof TelemetryEvents)[keyof typeof TelemetryEvents];
