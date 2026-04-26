# Native Streaming Tools Implementation Plan

> Goal: let sellers go live directly from the Arremate site on iPhone Safari and desktop browsers, while fitting the repo's current architecture and preserving the existing fallback path.

---

## Current Repo Reality

This plan needs to fit the system that already exists, not a greenfield rebuild.

### Current architecture

1. `apps/web` is a React + Vite + Tailwind app deployed to Cloudflare Pages.
2. `apps/api` is a Hono API deployed as a Cloudflare Worker, with Neon Postgres via Prisma.
3. `packages/video` currently contains only a thin provider abstraction with a `stub` implementation.
4. `packages/types` defines the shared `ShowSession` shape used by both seller and buyer UIs.
5. Live commerce state is centered on `Show`, `ShowSession`, `ShowInventoryItem`, `Claim`, `LiveBid`, and `Order`.

### Current live workflow

1. Seller starts a live session from `SellerLiveControlPage`.
2. `POST /v1/seller/shows/:showId/go-live` creates a `ShowSession` and marks the show as `LIVE`.
3. Seller manually pastes a public playback URL through `PATCH /v1/seller/sessions/:sessionId/stream`.
4. Buyer `LiveRoomPage` polls `GET /v1/shows/:showId/session`.
5. Buyer playback currently uses a raw `<video src={playbackUrl}>` element.

### Important implementation constraints

1. The API Worker should only manage control-plane state, auth, provider calls, and webhooks. It should not attempt to handle media transport itself.
2. Buyer and seller pages currently rely on polling, not WebSockets or server push.
3. The current deployment path applies Prisma schema changes with `db:push`, so rollout-safe, nullable, backward-compatible schema changes matter.
4. There is no existing feature-flag platform in the repo, so rollout must use simple environment-based gating or allowlists.
5. There is no native HLS compatibility layer in the buyer app today, so desktop playback support needs explicit work.

---

## Why This Matters

Today the seller broadcast flow depends on Larix, PRISM, or OBS plus manual playback URL entry. That creates setup friction, support load, and avoidable abandoned streams. The desired experience is:

1. open live control
2. allow camera and microphone
3. preview
4. tap `Ir ao vivo`

---

## Product Outcome Targets

1. A seller can start a live stream from iPhone Safari in under 60 seconds.
2. 90%+ of successful live sessions start without external software.
3. Median time from opening live control to first buyer-visible frame is under 20 seconds.
4. Fewer than 2% of sessions fail due to setup confusion.

---

## Scope

### In Scope

1. Native in-browser broadcast studio for sellers in `apps/web`.
2. Camera and microphone permissions, local preview, start, stop, and reconnect UX.
3. Buyer playback updates needed to support provider HLS playback in the existing live room.
4. API control-plane support for ingest session creation, stream lifecycle, and telemetry.
5. Provider webhook handling for stream state changes.
6. Fallback path to external RTMP encoders during rollout.

### Out of Scope for Phase 1

1. Multi-camera production.
2. Scene switching, overlays, graphics, or lower thirds.
3. Guest video or co-host composition.
4. Native mobile apps.
5. Real-time chat transport changes beyond the current polling approach.

---

## Architecture Principles

1. Preserve the existing `Show -> ShowSession -> LiveRoom` model as the source of truth.
2. Extend the existing route families instead of inventing a parallel live API.
3. Keep `PATCH /v1/seller/sessions/:sessionId/stream` as a fallback for external encoders until native broadcasting is fully proven.
4. Keep media processing with a managed video provider; the Worker remains control plane only.
5. Make schema additions nullable and rollout-safe so production does not break during partial deploys.
6. Prefer incremental upgrades to `SellerLiveControlPage` and `LiveRoomPage` over entirely new screens.

---

## Recommended Technical Direction

Use a managed live-video provider that supports:

1. browser-native publishing over WebRTC or WHIP
2. HLS playback for buyers
3. server-side session creation and lifecycle APIs
4. webhook callbacks for stream lifecycle

### Provider recommendation

1. Default recommendation: implement the adapter so Cloudflare Stream Live is the first provider evaluated, because the repo is already deployed on Cloudflare Workers and Pages.
2. Keep the provider contract generic enough that Mux can be slotted in if Cloudflare's browser ingest path or Safari support is insufficient.
3. Keep `stub` as the local development and test provider.

### Why this fits the current stack

1. It preserves the current Cloudflare-first deployment model.
2. It avoids self-hosted SFU or media infrastructure that does not belong in this repo.
3. It works with the existing `LIVE_VIDEO_PROVIDER` environment variable pattern.
4. It lets the buyer room continue to render a provider-supplied playback URL as the source of truth.

---

## Architecture Changes by Repo Area

### `apps/web`

### Seller live control

Replace the current manual playback-URL-first workflow in `SellerLiveControlPage.tsx` with a native studio panel while preserving the external fallback.

Planned changes:

1. Add a local preview using `navigator.mediaDevices.getUserMedia`.
2. Add camera and mic permission guidance before prompting.
3. Add publish state management:
   - `IDLE`
   - `PREPARING`
   - `READY`
   - `CONNECTING`
   - `LIVE`
   - `RECONNECTING`
   - `ENDED`
   - `ERROR`
4. Add native publish controls:
   - start broadcast
   - end broadcast
   - camera flip on mobile when supported
   - mute and unmute
5. Keep the current external encoder flow behind an "advanced / fallback" section that still supports manual playback URL updates.
6. Keep pinned item, sold-out, claim, and "passar o bastão" controls on the same page.

### Buyer live room

The current buyer room uses a raw `<video src={playbackUrl}>`. That is not enough for cross-browser HLS playback.

Planned changes:

1. Add a `LivePlayer` wrapper component.
2. Use native HLS playback in Safari when possible.
3. Add `hls.js` for browsers that do not natively play HLS manifests.
4. Keep the current `session.playbackUrl` contract as the playback source of truth.
5. Keep polling `GET /v1/shows/:showId/session` as the initial control-plane mechanism.

This is a required part of the native-streaming plan, not an optional enhancement.

---

### `apps/api`

### Existing routes to preserve

The current live-session API shape is already meaningful and should be extended rather than replaced:

1. `POST /v1/seller/shows/:showId/go-live`
2. `PATCH /v1/seller/sessions/:sessionId/stream`
3. `POST /v1/seller/sessions/:sessionId/end`
4. `GET /v1/shows/:showId/session`

### Recommended route evolution

#### 1. Keep `POST /v1/seller/shows/:showId/go-live`

This route should remain the seller entry point.

New behavior:

1. Create the `ShowSession`.
2. Mark the `Show` as `LIVE` so existing buyer polling continues to work.
3. Return the `ShowSession` plus a `broadcast` payload for the native publisher.
4. Set `ShowSession.status` to `STARTING` until the first successful publish is confirmed.

Suggested response shape:

```ts
{
  session: ShowSession,
  broadcast: {
    mode: 'NATIVE_WEBRTC' | 'RTMP_EXTERNAL',
    provider: 'stub' | 'cloudflare_stream' | 'mux',
    publishUrl?: string,
    publishToken?: string,
    expiresAt?: string,
    playbackUrl?: string,
    fallbackRtmp?: {
      ingestUrl: string,
      streamKey: string,
    },
  }
}
```

This is more compatible with the current architecture than introducing a new pre-session token route.

#### 2. Add `POST /v1/seller/sessions/:sessionId/broadcast-started`

Purpose:

1. Called by the seller client after successful provider publish setup, or by provider webhook reconciliation.
2. Confirms that the session has moved from `STARTING` to `LIVE`.
3. Stores provider identifiers and first-frame timestamps.

#### 3. Add `POST /v1/seller/sessions/:sessionId/broadcast-heartbeat`

Purpose:

1. Receives lightweight client telemetry during a native broadcast.
2. Updates freshness and health fields on `ShowSession`.
3. Supports reconnect and degraded-state UX.

Sample payload:

```ts
{
  reconnectCount: number,
  connectionState: 'good' | 'degraded' | 'offline',
  bitrateKbps?: number,
  packetLossPct?: number,
  roundTripMs?: number
}
```

#### 4. Add `POST /v1/seller/sessions/:sessionId/broadcast-ended`

Purpose:

1. Explicit native-broadcast shutdown from the seller UI.
2. Separates stream-end telemetry from the broader commerce action of ending the session.

This route does not replace `POST /end`; it supports the publishing lifecycle. The current `POST /end` route should remain the session-level action that closes the buyer-visible live show.

#### 5. Add `GET /v1/seller/sessions/:sessionId/broadcast-status`

Purpose:

1. Recover publisher state on refresh.
2. Let the seller page know whether native publish is available, active, or degraded.
3. Keep the existing page resilient to reloads.

#### 6. Keep `PATCH /v1/seller/sessions/:sessionId/stream`

This stays in place as the operational fallback for:

1. Larix
2. PRISM
3. OBS
4. manual HLS playback override during rollout or incident mitigation

#### 7. Extend webhooks

Add a provider webhook route under the existing webhook surface, for example:

1. `POST /v1/webhooks/live-video`

Purpose:

1. validate provider signatures
2. reconcile stream lifecycle events
3. confirm first frame and stream ended states
4. prevent the UI from being the only source of truth

This should be implemented alongside the existing `apps/api/src/routes/webhooks.ts` pattern, not as a separate background service.

---

### `packages/video`

The current package only exposes a minimal `createSession` and `endSession` contract. That is too small for native browser broadcasting.

Planned contract expansion:

```ts
export interface PrepareBroadcastResult {
  providerSessionId: string;
  playbackUrl?: string;
  publishUrl?: string;
  publishToken?: string;
  expiresAt?: string;
  fallbackRtmp?: {
    ingestUrl: string;
    streamKey: string;
  };
}

export interface LiveVideoProvider {
  prepareBroadcast(showId: string): Promise<PrepareBroadcastResult>;
  markBroadcastStarted?(providerSessionId: string): Promise<void>;
  endSession(providerSessionId: string): Promise<void>;
  verifyWebhook?(rawBody: string, signature: string): unknown;
}
```

Implementation notes:

1. `stub` should remain deterministic for tests.
2. Provider-specific code belongs here, not in route handlers.
3. The provider package should return control-plane metadata only. Browser media publishing itself belongs in `apps/web`.

---

### `packages/database`

### Current state

`ShowSession` currently stores:

1. `status`
2. `providerSessionId`
3. `playbackUrl`
4. `pinnedItemId`
5. `raidedToShowId`
6. timestamps

That is not enough for native broadcast lifecycle, telemetry, or rollout safety.

### Recommended `ShowSession` additions

Add nullable fields such as:

1. `ingestMode` enum:
   - `NATIVE_WEBRTC`
   - `RTMP_EXTERNAL`
2. `providerName` string or enum
3. `providerStreamId` nullable string
4. `providerInputId` nullable string
5. `providerPlaybackId` nullable string
6. `publishUrl` nullable string
7. `publishTokenExpiresAt` nullable datetime
8. `broadcastStartedAt` nullable datetime
9. `firstFrameAt` nullable datetime
10. `broadcastLastHeartbeatAt` nullable datetime
11. `broadcastHealth` enum:
    - `GOOD`
    - `DEGRADED`
    - `DOWN`
12. `reconnectCount` integer default `0`
13. `broadcastErrorCode` nullable string
14. `broadcastEndedReason` nullable string

### Rollout note

Because this repo currently deploys schema updates via `db:push`, Phase 1 schema changes must be:

1. additive
2. nullable by default
3. safe for partial deploy windows
4. tolerated by API code until production schema is confirmed current

Do not assume immediate non-null constraints in the first native-streaming rollout.

---

### `packages/types`

`ShowSession` in `packages/types/src/index.ts` must be extended alongside the Prisma model so that:

1. seller live control can read native broadcast state
2. buyer live room can keep using `playbackUrl`
3. admin or debug surfaces can inspect health state later

This package is part of the implementation plan, not an afterthought.

---

## Feature Flag Strategy

The repo does not currently have a feature-flag service. Use a simple rollout strategy that fits the current stack.

Recommended approach:

1. API env var:
   - `NATIVE_BROADCAST_ENABLED=true|false`
2. Optional allowlist:
   - `NATIVE_BROADCAST_ALLOWLIST_EMAILS=a@x.com,b@y.com`
3. Optional provider env vars:
   - provider account ID
   - provider API token
   - provider webhook signing secret

The API should return native-broadcast capability in the `go-live` response so the frontend does not rely only on build-time flags.

---

## UX Plan

### Seller UX

### Primary path

1. Seller opens live control.
2. Seller sees a preflight card:
   - camera check
   - microphone check
   - browser support check
   - connection guidance
3. Seller grants permissions.
4. Seller sees preview.
5. Seller taps `Ir ao vivo`.
6. Seller sees connection progress and then live confirmation.

### iPhone-specific requirements

1. Safari permission prompts need pre-prompt explanation.
2. The UI must handle denied permissions gracefully.
3. The UI must detect page backgrounding or camera interruption and show a reconnect path.
4. The UI should warn before navigation away while broadcasting.

### Fallback path

Keep an advanced fallback block with:

1. external encoder instructions
2. ingest URL and stream key copy actions if the provider supports RTMP fallback
3. manual playback URL override during rollout

The fallback is a stability mechanism, not the primary product experience.

### Buyer UX

1. Buyer room stays at the current route and layout.
2. Buyers continue polling `GET /v1/shows/:showId/session`.
3. If a session is `STARTING`, show "transmissão em breve" instead of a blank player.
4. When `playbackUrl` is available, the player attaches automatically.
5. "Passar o bastão" behavior remains unchanged.

---

## Observability and Telemetry

The repo does not currently have a dedicated analytics pipeline for live broadcasting, so Phase 1 should use a mix of:

1. `ShowSession` fields
2. structured logs from the Worker
3. audit entries where useful
4. provider webhook reconciliation

Track at minimum:

1. native start success rate
2. time from `go-live` click to `broadcast-started`
3. time to first frame
4. reconnect count per session
5. fallback usage rate
6. permission denial rate
7. stream-ended reason categories

---

## Security and Abuse Controls

1. Publish credentials must be short-lived and scoped to a single seller session.
2. Provider secrets must never be embedded in the frontend bundle.
3. Every session lifecycle endpoint must validate seller ownership through the existing auth middleware.
4. Broadcast token issuance and heartbeat routes should be rate-limited.
5. Provider webhooks must be signature-verified.
6. Audit log entries should capture start, stop, reconnect storms, and authentication failures.

---

## Delivery Phases

### Phase 0: Architecture Hardening

Objective: make the current live flow safer and prepare the codebase for native streaming.

1. Add the `LivePlayer` abstraction for buyer playback.
2. Add `hls.js` support for non-Safari HLS playback.
3. Extend shared types for future broadcast metadata.
4. Add nullable `ShowSession` schema fields.
5. Keep the current external-encoder guide intact.
6. Add simple feature-gating env support.

Exit criteria:

1. Buyer playback is reliable across Safari and Chrome.
2. Schema changes are deployed safely.
3. The codebase can represent native broadcast state without using it yet.

### Phase 1: Provider Spike and Control Plane

Objective: prove the provider contract and Worker-side control plane.

1. Expand `packages/video` provider interface.
2. Implement a real provider adapter behind `LIVE_VIDEO_PROVIDER`.
3. Extend `POST /go-live` to return broadcast configuration.
4. Add broadcast lifecycle endpoints.
5. Add provider webhook verification and reconciliation.

Exit criteria:

1. Internal sellers can get a valid publish config from the API.
2. Provider lifecycle is represented in `ShowSession`.
3. No changes are required to commerce flows such as pinning, claims, or bids.

### Phase 2: Seller Native Broadcast MVP

Objective: native broadcast from the existing seller live control page.

1. Add the camera and mic preflight UI.
2. Add local preview.
3. Add publish start and stop.
4. Keep external fallback available.
5. Show native broadcast state on the existing seller live control screen.

Exit criteria:

1. Internal users can go live from iPhone Safari.
2. Internal users can go live from desktop Chrome and Safari.
3. Buyer room receives usable playback without manual URL paste.

### Phase 3: Reliability and Rollout

Objective: make the native path operationally safe.

1. Add reconnect handling.
2. Add heartbeat-based degraded-state UX.
3. Add richer errors for permissions, device loss, and provider failures.
4. Roll out by allowlist or percentage gate.
5. Keep fallback route available during rollout.

Exit criteria:

1. Native start success rate is at least 95% for the rollout cohort.
2. Median time to first frame is under 20 seconds.
3. External encoder usage is the minority path.

### Phase 4: Default-On and Admin Visibility

Objective: make native streaming the standard operating path.

1. Turn native broadcasting on by default.
2. Keep fallback as an incident or edge-case tool.
3. Add an admin-facing stream health view or system health panel.

Exit criteria:

1. Native path is default for all eligible sellers.
2. Support can diagnose live-session failures from the existing admin surface and logs.

---

## Concrete Work Breakdown

### `apps/web`

1. Add `LivePlayer` with native HLS plus `hls.js` fallback.
2. Add seller broadcast studio components and hooks.
3. Keep the current session, queue, pin, and claim UI on the same page.
4. Preserve the external encoder block during rollout.

### `apps/api`

1. Extend `go-live` rather than replacing it.
2. Add broadcast lifecycle routes on the existing session namespace.
3. Add provider webhook route under the current webhook route family.
4. Use existing auth and seller role guards.

### `packages/video`

1. Expand the provider contract.
2. Implement real provider adapter plus stub parity.
3. Keep provider-specific API logic out of route handlers.

### `packages/database`

1. Extend `ShowSession` with native broadcast metadata.
2. Keep new fields nullable for rollout safety.
3. Update schema rollout docs to match the current `db:push` deployment model.

### `packages/types`

1. Extend `ShowSession` and related live types.
2. Keep buyer and seller pages on a single shared contract.

### `docs/runbooks`

1. Add seller troubleshooting guidance for camera, microphone, and network issues.
2. Add provider webhook and credential configuration steps.
3. Add incident guidance for switching sellers back to external encoders if native publish degrades.

---

## Test Strategy

### Unit tests

1. provider adapter contract tests in `packages/video`
2. live-session state transition tests in `apps/api`
3. player wrapper tests for HLS attach and fallback behavior in `apps/web`

### API integration tests

1. `go-live` response shape and seller ownership checks
2. lifecycle endpoint idempotency
3. webhook verification and reconciliation
4. fallback `PATCH /stream` path remaining functional

### Web E2E tests

1. seller grants permissions and sees preview
2. seller can start and stop a native broadcast
3. buyer sees video from the resulting `playbackUrl`
4. fallback external path remains reachable

### Device matrix

1. iPhone Safari current and previous major version
2. Android Chrome latest
3. Desktop Chrome latest
4. Desktop Safari latest

---

## Risks and Mitigations

1. iPhone Safari media quirks
   Mitigation: test matrix, strict preflight UX, keep fallback path.

2. Provider browser-ingest limitations
   Mitigation: keep the provider interface generic and validate Cloudflare first without hard-coding the UI to one SDK.

3. Playback incompatibility on desktop browsers
   Mitigation: add `hls.js` before rolling out native ingest.

4. Worker and schema drift during rollout
   Mitigation: additive nullable schema, tolerant API reads, staged deploys.

5. Lack of real feature flags
   Mitigation: env-driven allowlists and API-controlled capability responses.

---

## Immediate Next Actions

1. Run a short provider spike to confirm iPhone Safari browser publish viability and required frontend SDK or WHIP client shape.
2. Add `LivePlayer` and `hls.js` support first, because the buyer playback surface is currently too thin.
3. Expand `packages/video` with a real provider contract.
4. Extend `ShowSession` and shared types with nullable broadcast metadata.
5. Modify `POST /v1/seller/shows/:showId/go-live` to return native broadcast config without breaking current callers.
6. Build the native seller preflight and preview UI behind an env-based allowlist.
7. Keep the external encoder fallback in place until production metrics show native start success is stable.
