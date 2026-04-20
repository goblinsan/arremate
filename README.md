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
│   └── api/          (@arremate/api)    Backend REST API          – Fastify + TypeScript     :4000
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
```

---

## Package Overview

| Package | Role |
|---------|------|
| `@arremate/web` | Buyer storefront: browse auctions, watch live, bid |
| `@arremate/admin` | Ops panel: auction moderation, user & payment management |
| `@arremate/api` | REST API with Fastify; all business logic |
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