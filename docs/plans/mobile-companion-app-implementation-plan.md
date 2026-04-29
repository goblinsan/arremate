# Mobile Companion App Implementation Plan

> Goal: ship a buyer-first Arremate mobile app that becomes the primary customer surface for discovery, live shopping, bidding, checkout, and post-purchase tracking, while fitting the repo's current architecture and deployment model.

---

## Current Repo Reality

This plan is anchored to the repo as it exists today, not an idealized rebuild.

### Current architecture

1. `apps/web` is the current buyer-facing React + Vite + Tailwind app.
2. `apps/api` is a Hono API deployed as a Cloudflare Worker.
3. Neon Postgres + Prisma back all marketplace state.
4. Shared domain contracts live in `packages/types`.
5. Shared auth helpers live in `packages/auth`.
6. Shared utility packages already exist for configuration, observability, payments, video, and common formatting.

### Current product shape

1. Buyer identity and profile are already modeled in the API.
2. Live shows, pinned items, bids, claims, orders, and Pix checkout already exist.
3. Seller live control is currently web-first.
4. Buyer live-room UX is progressing toward a mobile-style overlay experience, but it still lives in `apps/web`.

### Important constraints

1. There is no mobile app project in the monorepo yet.
2. The API was built primarily for web polling flows, not mobile push or realtime-first behavior.
3. Chat, live-session state, and viewer presence still rely on polling.
4. Current auth uses Cognito hosted flows and token handling designed around the web app.
5. Mobile should reuse domain logic where reasonable, but not blindly reuse web UI code.

---

## Product Positioning

The mobile app should not be a thin wrapper around the website. It should be the primary buyer experience.

### Primary audience

1. Buyers browsing shows throughout the day.
2. Buyers joining live streams and bidding in real time.
3. Buyers returning for claims, checkout, order tracking, and re-engagement.

### Phase 1 product intent

1. Make it easy to discover and join live shows quickly.
2. Make live-room participation feel native and fast.
3. Make bidding and claiming low-friction.
4. Make Pix checkout, order status, and seller trust signals mobile-first.

### Not the initial goal

1. Rebuilding the full seller live studio in native mobile on day one.
2. Replacing the web admin surface.
3. Supporting every power-user seller workflow in the first mobile release.

---

## Recommended Technical Direction

### Recommendation: Expo + React Native + TypeScript

Use Expo-managed React Native as the starting point.

Why it fits:

1. It keeps the stack TypeScript-native.
2. It allows reuse of `packages/types`, `packages/auth`, and `packages/shared-utils`.
3. It gives a practical path for iOS and Android from one codebase.
4. It supports native modules later if live playback, notifications, or camera workflows require them.
5. It is materially faster to ship than separate native apps.

### Recommended app shape

Create a new workspace app:

1. `apps/mobile`

Recommended baseline libraries:

1. Expo Router for navigation and deep linking.
2. TanStack Query for API state, caching, retries, and polling control.
3. NativeWind only if the team wants Tailwind-like ergonomics in mobile; otherwise use plain React Native styles.
4. SecureStore for tokens and auth session persistence.
5. Expo Notifications for push notifications.

### What to reuse

Reuse directly:

1. `packages/types`
2. `packages/auth`
3. `packages/shared-utils`
4. parts of `packages/config`

Do not assume direct reuse:

1. `packages/ui`
2. `apps/web` components
3. Tailwind-specific layout patterns

Instead, introduce mobile-specific presentation components inside `apps/mobile`, and only extract a shared `packages/mobile-ui` later if duplication justifies it.

---

## Buyer App Scope

### Phase 1 in-scope surfaces

1. Authentication and session restore.
2. Home / discovery feed.
3. Upcoming and live show listing.
4. Show detail page.
5. Live room.
6. Bidding and claim flow.
7. Pix checkout handoff and payment status.
8. Buyer orders list and order detail.
9. Profile and account basics.
10. Notifications and deep links into live shows and orders.

### Phase 1 out of scope

1. Native seller broadcast studio.
2. Full seller inventory management.
3. Seller application upload flow unless needed for a limited seller beta.
4. Admin moderation workflows.
5. Complex offline-first behavior.

---

## App Architecture

### Proposed folder shape

```txt
apps/mobile/
├── app/                  # Expo Router routes
├── src/
│   ├── api/              # typed fetchers + query hooks
│   ├── components/       # native UI building blocks
│   ├── features/         # auth, shows, live, checkout, orders
│   ├── lib/              # storage, env, analytics, auth helpers
│   ├── providers/        # query client, auth provider, theme, notifications
│   └── styles/           # tokens and theme constants
├── app.json
├── babel.config.js
└── package.json
```

### State architecture

1. Auth state should be centralized in a mobile auth provider.
2. Server state should be handled with TanStack Query.
3. Polling should be screen-aware and reduced when the app is backgrounded.
4. Ephemeral live-room UI state should remain local to the feature.

### Design direction

1. Mobile should follow the product brand, not mirror the web layouts.
2. Live-room UI should be vertically optimized, overlay-heavy, and thumb-friendly.
3. Navigation should minimize taps to join a live show.

---

## Screen Plan

### 1. Auth

Screens:

1. Welcome / sign-in entry.
2. Hosted-login redirect handling.
3. Social login buttons.
4. Session restore / loading state.

Notes:

1. Mobile should not rely on browser-local storage assumptions from `apps/web`.
2. Cognito flow likely needs mobile deep-link callback handling rather than the current web callback route model.

### 2. Home / discovery

Screens:

1. Home feed with live and upcoming sections.
2. Search and category filtering later.
3. Personalized "starting soon" and "live now" modules.

Goal:

1. Reduce time-to-live-room.

### 3. Show detail

Screens:

1. Upcoming show details.
2. Seller trust and profile summary.
3. Queue preview or sample items.
4. CTA to set reminder or enter live room.

### 4. Live room

This is the core buyer experience.

Must support:

1. Full-screen video.
2. Overlaid seller trust info.
3. Viewer count.
4. Chat.
5. Pinned item details.
6. Bid input.
7. Claim CTA.
8. Fast transition into order / payment flow.

This should become the reference mobile product surface, not a port of the desktop page.

### 5. Checkout / payment

Screens:

1. Claim confirmation.
2. Order summary.
3. Pix code / QR display.
4. Payment status progression.

### 6. Orders

Screens:

1. Order history.
2. Order detail.
3. Shipping / fulfillment timeline.
4. Seller messaging and support later.

### 7. Profile

Screens:

1. Buyer profile basics.
2. Identity state.
3. Saved preferences later.
4. Switch to seller profile only if seller support is included in that release.

---

## Live Video Strategy for Mobile

### Buyer playback

The mobile app should consume the same `ShowSession.playbackUrl` contract already used by web.

Recommended direction:

1. Keep the API response contract unchanged where possible.
2. Use a native-capable mobile video player that can handle the actual provider playback mode.
3. Treat Cloudflare playback mode as a platform concern inside the mobile client, not a new API concern.

### Phase 1 recommendation

1. Prioritize stable buyer playback in the mobile app.
2. Do not make seller native mobile broadcasting a phase-1 dependency for launch.

Reason:

1. The buyer app is the primary product priority.
2. Seller native broadcast on mobile is more operationally risky than buyer playback.
3. The seller web control room can remain the initial broadcasting surface.

### Phase 2 mobile seller work

After buyer launch:

1. evaluate native seller broadcast from mobile
2. reuse the same provider and control-plane model
3. likely build a dedicated seller app mode or seller section

---

## API and Backend Gaps to Address

The current API is usable as a foundation, but not yet mobile-complete.

### 1. Auth flow adaptation

Need:

1. mobile-safe Cognito redirect handling
2. secure token persistence
3. deep-link callback routing

Likely changes:

1. explicit mobile redirect URIs
2. possible API support for auth bootstrap convenience if needed

### 2. Push notifications

Mobile requires notification primitives that do not exist yet.

Add backend support for:

1. device token registration
2. user notification preferences
3. notification event triggers

Initial notification types:

1. show starting soon
2. seller you follow is live
3. claim expiring
4. payment confirmed
5. order shipped

### 3. Deep linking

Need stable routes and payloads for:

1. `/shows/:id`
2. `/shows/:id/live`
3. `/orders/:id`
4. auth callback destinations

### 4. Realtime strategy

Short term:

1. mobile can launch on polling like web

But mobile should improve this soon after launch:

1. chat transport
2. bid updates
3. session status changes
4. viewer counts

Recommended path:

1. phase 1 uses careful polling with app-state awareness
2. phase 2 evaluates WebSocket or SSE for live-room events

### 5. Media and image delivery

Need a clearer public-asset story for mobile:

1. inventory image URLs
2. seller brand logo URLs
3. thumbnail / fallback image strategy

The current repo stores S3 object keys in several places, but mobile will need reliable client-consumable URLs.

### 6. Ratings and trust data

The app will need stable seller-trust payloads for:

1. rating average
2. rating count
3. shipping speed
4. possibly response rate later

Some of this is emerging in web/live APIs now, but the payloads should be formalized before mobile implementation starts.

---

## Shared Package Strategy

### Reuse now

1. `packages/types` for domain contracts.
2. `packages/auth` for JWT parsing and token helpers where platform-safe.
3. `packages/shared-utils` for formatting and common helpers.

### Add if needed

1. `packages/mobile-shared` for query helpers, DTO mappers, and feature constants.
2. `packages/mobile-ui` only after repeated UI patterns emerge across features.

### Avoid early over-abstraction

Do not start by trying to unify web and mobile UI components. The interaction models are too different, especially in the live room.

---

## Delivery Phases

### Phase 0: foundation

1. Create `apps/mobile`.
2. Set up Expo, routing, env handling, and CI build checks.
3. Reuse shared TypeScript packages where appropriate.
4. Establish auth shell and API client patterns.

### Phase 1: auth + discovery

1. Sign in and session restore.
2. Home feed.
3. Shows listing.
4. Show detail.
5. Deep-link entry into shows.

### Phase 2: live buyer experience

1. Live-room video playback.
2. Chat overlay.
3. Bid flow.
4. Claim flow.
5. Payment handoff.

### Phase 3: post-purchase lifecycle

1. Orders list.
2. Order detail.
3. Payment state refresh.
4. Shipping and fulfillment visibility.

### Phase 4: notifications + retention

1. Device token registration.
2. Push notifications.
3. Re-engagement flows.
4. Reminder and live-now notifications.

### Phase 5: seller/mobile expansion

1. Seller mode evaluation.
2. Lightweight seller management.
3. Native seller broadcast exploration if justified.

---

## Operational Concerns

### Analytics

Track at minimum:

1. app install to account creation
2. sign-in success
3. home-to-live-room conversion
4. bid attempts and success rate
5. claim attempts and conversion
6. Pix flow completion
7. push open rate
8. live playback errors by device and OS

### Crash and performance monitoring

Need:

1. mobile crash reporting
2. network error capture
3. playback diagnostics

### Release channels

Recommended:

1. internal dev builds
2. TestFlight / Android internal testing
3. limited beta
4. staged production rollout

---

## Key Decisions to Lock Before Build Starts

1. Confirm Expo / React Native as the mobile stack.
2. Decide whether phase 1 is buyer-only or includes seller account switching.
3. Decide whether mobile launch requires push notifications or can ship before them.
4. Decide whether live-room transport stays polling-only for v1.
5. Define the public media URL strategy for inventory and seller assets.
6. Define the mobile auth callback and Cognito app-client setup.

---

## Recommended Immediate Next Steps

1. Create `apps/mobile` as an Expo app in the monorepo.
2. Add a mobile-focused GitHub project or issue tree with epics for foundation, discovery, live room, checkout, and notifications.
3. Audit all buyer-facing API responses that mobile would depend on:
   - shows list
   - show detail
   - live session
   - chat
   - claim
   - order
   - payment
   - profile
4. Define the mobile auth approach with Cognito redirect URIs and secure token storage.
5. Decide whether buyer mobile launch should target iOS first, or iOS and Android together.

---

## Summary Recommendation

Build a buyer-first Expo React Native app in `apps/mobile`, reuse shared domain/auth/util packages, keep the existing API as the control-plane foundation, and explicitly fill the mobile gaps around auth callbacks, push notifications, deep links, media URLs, and live-room realtime behavior before the implementation starts.
