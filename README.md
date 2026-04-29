# Arremate 🇧🇷

> **Brazil-first, trust-first, managed live shopping marketplace.**  
> _Compre ao vivo, com confiança._

Arremate connects verified sellers with buyers through real-time live-auction streams. Every transaction is protected by escrow, every seller is verified, and every bid happens live on camera.

---

## Monorepo Structure

```
arremate/
├── apps/
│   ├── web/          (@arremate/web)    Buyer-facing storefront  – React + Vite + Tailwind  :3000
│   ├── admin/        (@arremate/admin)  Internal ops panel       – React + Vite + Tailwind  :3001
│   ├── api/          (@arremate/api)    Backend REST API          – Hono + TypeScript        :4000
│   └── mobile/       (@arremate/mobile) Buyer-first mobile app   – Expo + React Native + TypeScript
├── packages/
│   ├── ui/           (@arremate/ui)           Shared React components (Button, Badge, …)
│   ├── types/        (@arremate/types)         Core domain TypeScript interfaces
│   ├── config/       (@arremate/config)        Env helpers (getEnv, requireEnv)
│   ├── auth/         (@arremate/auth)          JWT utilities & token parsing
│   ├── database/     (@arremate/database)      Prisma client + schema (Neon Postgres)
│   ├── payments/     (@arremate/payments)      Payment intent types & BRL formatting
│   ├── video/        (@arremate/video)         Stream session types & provider helpers
│   ├── observability/(@arremate/observability) Structured logger
│   └── shared-utils/ (@arremate/shared-utils)  formatCurrency, slugify, timeAgo, clsx, …
├── docs/
│   └── plans/arremate-mvp-build-plan.md
├── .env.example
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 (use `.nvmrc`) |
| pnpm | ≥ 9 |

```bash
# Install pnpm if needed
npm install -g pnpm@latest

# Use the correct Node version
nvm use   # reads .nvmrc
```

---

## Getting Started

```bash
# 1. Clone
git clone https://github.com/goblinsan/arremate.git
cd arremate

# 2. Install all workspace dependencies
pnpm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL (Neon), JWT_SECRET, etc.

# 4. Generate Prisma client (first time only)
pnpm --filter @arremate/database db:generate

# 5. Start everything in parallel
pnpm dev
```

Open:
- **Buyer web:** http://localhost:3000
- **Admin panel:** http://localhost:3001
- **API health:** http://localhost:4000/health

---

## Available Scripts

Run from the repo root:

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in watch mode (parallel) |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all test suites |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript check across all packages |
| `pnpm clean` | Remove all `dist/` outputs |

Run for a specific package:

```bash
pnpm --filter @arremate/api dev
pnpm --filter @arremate/web build
pnpm --filter @arremate/database db:migrate

# Mobile app (requires Expo CLI)
pnpm --filter @arremate/mobile dev       # Start Expo dev server
pnpm --filter @arremate/mobile typecheck # TypeScript check
```

---

## Package Overview

| Package | Role |
|---------|------|
| `@arremate/web` | Buyer storefront: browse auctions, watch live, bid |
| `@arremate/admin` | Ops panel: auction moderation, user & payment management |
| `@arremate/api` | REST API with Hono; deploys to Cloudflare Workers in staging/production |
| `@arremate/mobile` | Buyer-first iOS/Android app built with Expo + React Native |
| `@arremate/ui` | Reusable design-system components |
| `@arremate/types` | Shared TypeScript types (`User`, `Auction`, `Bid`, `Product`) |
| `@arremate/config` | `getEnv` / `requireEnv` helpers |
| `@arremate/database` | Prisma ORM, Neon Postgres, migration scripts |
| `@arremate/auth` | JWT decode, `extractBearerToken`, expiry check |
| `@arremate/payments` | Payment types, `formatBRL`, provider stubs |
| `@arremate/video` | Stream session types, thumbnail helpers |
| `@arremate/observability` | Structured `logger` (debug/info/warn/error) |
| `@arremate/shared-utils` | `formatCurrency`, `formatDate`, `slugify`, `clsx`, … |

---

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

```env
DATABASE_URL="postgresql://..."   # Neon Postgres connection string
DIRECT_URL="postgresql://..."     # Neon direct (non-pooled) URL
PORT=4000                         # API port
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=change-me-in-production
```

---

## CI/CD (GitHub Actions + Cloudflare)

Workflow: [ .github/workflows/ci.yml ](.github/workflows/ci.yml)

- Pull requests to `main`/`develop`:
	- run validate (lint/typecheck/test/build)
	- deploy API to Cloudflare Workers `staging`
	- deploy web/admin preview builds to Cloudflare Pages using branch `pr-<number>`
- Push/merge to `main`:
	- run validate
	- deploy API to Cloudflare Workers `production`
	- deploy web/admin to Cloudflare Pages production (`main` branch)

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL_STAGING`
- `DIRECT_URL_STAGING` (optional; falls back to `DATABASE_URL_STAGING`)
- `DATABASE_URL_PRODUCTION`
- `DIRECT_URL_PRODUCTION` (optional; falls back to `DATABASE_URL_PRODUCTION`)
- `SYNTHETIC_PROBE_BEARER` (Cognito access token for scheduled API health probes)

Required repository variables:

- `VITE_COGNITO_DOMAIN`

Cloudflare Worker runtime secrets (set directly in Cloudflare, not in GitHub):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CF_ACCOUNT_ID` when `LIVE_VIDEO_PROVIDER=cloudflare_stream`
- `CF_API_TOKEN` when `LIVE_VIDEO_PROVIDER=cloudflare_stream`
- `CF_STREAM_WEBHOOK_SECRET` for `POST /v1/webhooks/live-video`

## Live Streaming Configuration

Production live streaming is now expected to use `cloudflare_stream`.

- Seller go-live requests hit the API control plane.
- The API creates Cloudflare Stream Live inputs when `LIVE_VIDEO_PROVIDER=cloudflare_stream`.
- Cloudflare live notifications should be delivered to:
  - `https://api.arrematelive.com/v1/webhooks/live-video`

Cloudflare setup summary:

1. Set `LIVE_VIDEO_PROVIDER=cloudflare_stream` for the production Worker.
2. Set Worker secrets:
   - `CF_ACCOUNT_ID`
   - `CF_API_TOKEN`
   - `CF_STREAM_WEBHOOK_SECRET`
3. In Cloudflare Notifications, create a webhook destination pointing at the live-video webhook route.
4. Use the same secret value in Cloudflare Notifications and `CF_STREAM_WEBHOOK_SECRET`.
5. Attach a Stream notification policy for live input events.

API Worker environments are configured in [apps/api/wrangler.toml](apps/api/wrangler.toml).

---

## Roadmap

See [`docs/plans/arremate-mvp-build-plan.md`](docs/plans/arremate-mvp-build-plan.md) for the full phased build plan:

- **Phase 0** ✅ Repository & architecture setup
- **Phase 1** 🔜 Core API (auth, auction CRUD, bidding)
- **Phase 2** Frontend (buyer web + admin)
- **Phase 3** Live streaming (Mux / Cloudflare Stream)
- **Phase 4** Payments (Stripe + PIX / PagSeguro)
- **Phase 5** Trust features (seller verification, escrow, ratings)

---

## Runbooks & Operations

| Document | Description |
|----------|-------------|
| [Environment Setup](docs/runbooks/environment-setup.md) | First-time deployment, env vars, DB migration, seed data |
| [Incident Response](docs/runbooks/incident-response.md) | Severity levels, triage checklist, common incidents |
| [Seller Onboarding](docs/runbooks/seller-onboarding.md) | Application review and approval procedures |
| [Dispute Handling](docs/runbooks/dispute-handling.md) | Buyer–seller dispute resolution procedures |
| [Launch Checklist](docs/launch-checklist.md) | Go / No-Go criteria for external pilot launch |

---

## License

Private — all rights reserved © Arremate Tecnologia Ltda.
