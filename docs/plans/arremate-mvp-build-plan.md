# Arremate MVP – Build Plan

> **Brazil-first, trust-first, managed live shopping marketplace**

---

## Project Overview

Arremate is a live-auction marketplace focused on the Brazilian market. Sellers host real-time video streams while buyers participate in live auctions, place bids, and complete purchases — all with end-to-end trust guarantees (verified sellers, escrow payments, buyer protection).

**Core value proposition:** _Compre ao vivo, com confiança._

### Key differentiators
- Live video + real-time bidding in a single UI
- Seller identity verification before listing
- Escrow-based payment flow (funds held until delivery confirmed)
- Community ratings visible before any bid is placed
- First-class PIX / PagSeguro support for the Brazilian market

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces | Fast installs, workspace protocol, no Turborepo overhead at MVP |
| Language | TypeScript 5 (strict) | End-to-end type safety across all packages |
| Frontend | React 18 + Vite + Tailwind CSS | Fast DX, tree-shakeable, no framework lock-in |
| Backend | Fastify 4 | High-throughput, schema-first, plugin ecosystem |
| Database | Prisma + Neon (Postgres) | Serverless-friendly, branchable DBs for preview envs |
| Auth | JWT (jose) + refresh tokens | Stateless, easy to scale; social login via OAuth in Phase 2 |
| Payments | Stripe (global) + PagSeguro/PIX | Cover credit cards + local Brazilian payment methods |
| Video streaming | Mux or Cloudflare Stream | Managed RTMP ingest, adaptive HLS playback |
| CI/CD | GitHub Actions | Native GH integration |
| Observability | Custom logger (Phase 0) → OpenTelemetry (Phase 4) | Start simple, add OTEL spans as load grows |

---

## Package Responsibilities

| Package | Responsibility |
|---|---|
| `@arremate/web` | Buyer-facing storefront: browse, watch live auctions, bid, checkout |
| `@arremate/admin` | Internal ops: auction moderation, user management, payment reviews |
| `@arremate/api` | Fastify REST API; all business logic lives here |
| `@arremate/ui` | Shared design-system components (Button, Badge, Modal, …) |
| `@arremate/types` | Canonical domain interfaces shared across front- and back-end |
| `@arremate/config` | `getEnv` / `requireEnv` helpers + runtime environment validation |
| `@arremate/database` | Prisma client singleton + schema migrations |
| `@arremate/auth` | JWT utilities, token parsing, `extractBearerToken` |
| `@arremate/payments` | Payment intent types, provider adapters, BRL formatting |
| `@arremate/video` | Stream session types, thumbnail helpers, provider adapters |
| `@arremate/observability` | Structured logger; future OTEL trace/span helpers |
| `@arremate/shared-utils` | `formatCurrency`, `slugify`, `timeAgo`, `clsx`, etc. |

---

## Environment Setup

```bash
# 1. Prerequisites
node --version   # ≥ 20
pnpm --version   # ≥ 9

# 2. Clone & install
git clone https://github.com/goblinsan/arremate.git
cd arremate
pnpm install

# 3. Environment variables
cp .env.example .env
# Edit .env with your Neon DATABASE_URL, JWT_SECRET, etc.

# 4. Database setup (requires DATABASE_URL)
pnpm --filter @arremate/database db:generate
pnpm --filter @arremate/database db:push

# 5. Start all services in parallel
pnpm dev
#   web   → http://localhost:3000
#   admin → http://localhost:3001
#   api   → http://localhost:4000
```

---

## Phase 0 – Repository & Architecture Setup ✅

**Goal:** Working monorepo skeleton that every developer can clone and run locally.

### Deliverables
- [x] pnpm workspace with `apps/*` and `packages/*`
- [x] Shared `tsconfig.base.json`, ESLint, Prettier
- [x] `@arremate/web` – React + Vite + Tailwind (port 3000)
- [x] `@arremate/admin` – React + Vite + Tailwind (port 3001)
- [x] `@arremate/api` – Fastify with `/health` endpoint (port 4000)
- [x] `@arremate/types` – core domain interfaces
- [x] `@arremate/config` – env helpers
- [x] `@arremate/database` – Prisma schema (User, Auction, Bid)
- [x] `@arremate/auth`, `payments`, `video`, `observability`, `shared-utils` stubs
- [x] GitHub Actions CI (lint → typecheck → test → build)
- [x] `.env.example` with all required variables documented

---

## Phase 1 – Core API

**Goal:** Production-ready REST API covering authentication and core auction lifecycle.

### Deliverables
- [ ] `POST /api/v1/auth/register` – email + password signup, return JWT pair
- [ ] `POST /api/v1/auth/login` – credential validation, return JWT pair
- [ ] `POST /api/v1/auth/refresh` – refresh access token
- [ ] `GET /api/v1/users/me` – authenticated user profile
- [ ] `PATCH /api/v1/users/me` – update profile
- [ ] `GET /api/v1/auctions` – paginated list with filters (status, seller)
- [ ] `POST /api/v1/auctions` – create auction (SELLER role required)
- [ ] `GET /api/v1/auctions/:id` – auction detail + current bids
- [ ] `PATCH /api/v1/auctions/:id` – update auction (owner or ADMIN)
- [ ] `POST /api/v1/auctions/:id/bids` – place bid (authenticated BUYER)
- [ ] Fastify JWT plugin via `@fastify/jwt`
- [ ] Request schema validation via Zod or Fastify's built-in JSON Schema
- [ ] Integration tests with `vitest` + `supertest`

### Database migrations
- Run `pnpm --filter @arremate/database db:migrate` after adding new models

---

## Phase 2 – Frontend

**Goal:** Functional buyer web app and admin panel, consuming the Phase 1 API.

### Buyer Web (`@arremate/web`)
- [ ] Auth screens: `/login`, `/register`
- [ ] Auction list page with search + status filter
- [ ] Auction detail page: live video player, real-time bid feed, bid button
- [ ] User profile / purchase history
- [ ] React Query for data fetching + optimistic UI on bids

### Admin Panel (`@arremate/admin`)
- [ ] Auth guard – redirect to login if not ADMIN
- [ ] Dashboard with live stats (Active Auctions, Users, Revenue, Pending Reviews)
- [ ] Auction management table with approve/reject/cancel actions
- [ ] User management with role assignment
- [ ] Payment log view

### Shared
- [ ] Expand `@arremate/ui` with: Modal, Toast, Input, Select, Table, Skeleton
- [ ] Add React Query + Axios client wrapper in `@arremate/shared-utils`

---

## Phase 3 – Live Streaming Integration

**Goal:** Sellers can go live; buyers watch and bid in real-time.

### Deliverables
- [ ] Mux (or Cloudflare Stream) account + webhook endpoint
- [ ] `POST /api/v1/auctions/:id/stream/start` – create Mux live stream, store ingest credentials
- [ ] `POST /api/v1/auctions/:id/stream/end` – end stream, trigger auction close
- [ ] WebSocket endpoint (via `@fastify/websocket`) for real-time bid events
- [ ] Buyer web: HLS video player (e.g. `video.js` or `hls.js`)
- [ ] Real-time bid ticker using WebSocket
- [ ] Stream health indicator in admin dashboard

---

## Phase 4 – Payments

**Goal:** End-to-end payment flow with escrow semantics.

### Deliverables
- [ ] Stripe integration: PaymentIntent create + confirm + webhook
- [ ] PagSeguro/PIX integration for Brazilian buyers
- [ ] Escrow state machine: `PENDING` → `HELD` → `RELEASED` / `REFUNDED`
- [ ] `POST /api/v1/payments/intent` – create payment intent after winning bid
- [ ] `POST /api/v1/payments/confirm-delivery` – buyer confirms receipt → release funds
- [ ] `POST /api/v1/payments/dispute` – open dispute
- [ ] Webhook handler for async payment events from providers
- [ ] Payment history in buyer profile and admin panel

---

## Phase 5 – Trust Features

**Goal:** Community-driven trust layer that differentiates Arremate from generic auction sites.

### Deliverables
- [ ] Seller verification flow: document upload + admin review
- [ ] Verified seller badge on auction listings
- [ ] Buyer ↔ Seller rating system post-transaction
- [ ] Public seller profile with rating histogram and recent reviews
- [ ] Automatic suspension for sellers with < 3.5 avg after 10+ transactions
- [ ] Dispute resolution workflow in admin panel
- [ ] Trust score visible in real-time auction UI

---

## Milestones & Timeline (Rough)

| Phase | Target Duration | Status |
|---|---|---|
| Phase 0 – Setup | 1 week | ✅ Done |
| Phase 1 – Core API | 2 weeks | 🔜 Next |
| Phase 2 – Frontend | 2 weeks | — |
| Phase 3 – Live Streaming | 1 week | — |
| Phase 4 – Payments | 2 weeks | — |
| Phase 5 – Trust Features | 2 weeks | — |

**Total estimated time to MVP:** ~10 weeks

---

## Contributing

1. Branch from `develop` (e.g. `feat/auction-bidding`)
2. Run `pnpm install` and `pnpm typecheck` before pushing
3. All PRs must pass the CI workflow
4. Tag releases as `v0.x.0` on `main`
