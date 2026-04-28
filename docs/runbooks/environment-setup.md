# Environment Setup

> Runbook for setting up a new Arremate deployment from scratch.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | Use [nvm](https://github.com/nvm-sh/nvm): `nvm use` (`.nvmrc` is present) |
| pnpm | ≥ 9 | `npm install -g pnpm@9` |
| AWS CLI | ≥ 2 | Required for S3 and Cognito management |
| Prisma CLI | bundled | Invoked via `pnpm --filter @arremate/database <cmd>` |

---

## 1. Clone and install

```bash
git clone https://github.com/goblinsan/arremate.git
cd arremate
nvm use          # applies .nvmrc
pnpm install
```

---

## 2. Environment variables

Copy the root `.env.example` to `.env` and fill in every value:

```bash
cp .env.example .env
```

### Required variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string (pooler URL) |
| `DIRECT_URL` | Neon direct connection URL (for migrations) |
| `COGNITO_REGION` | AWS region of the Cognito user pool |
| `COGNITO_USER_POOL_ID` | Cognito user pool ID (format: `<region>_<id>`) |
| `COGNITO_WEB_CLIENT_ID` | App client ID for the buyer-facing web app |
| `COGNITO_ADMIN_CLIENT_ID` | App client ID for the admin panel |
| `AWS_REGION` | AWS region for S3 |
| `AWS_ACCESS_KEY_ID` | AWS access key (IAM user with S3 + Cognito perms) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `S3_DOCUMENTS_BUCKET` | S3 bucket for seller document uploads |

### Optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `CORS_ORIGIN` | `*` | Allowed CORS origin for the API |
| `PIX_PROVIDER` | `stub` | Payment provider (`stub` for dev, `production` for live) |
| `LIVE_VIDEO_PROVIDER` | `stub` | Live video backend (`cloudflare_stream` in production) |
| `CF_ACCOUNT_ID` | — | Cloudflare account ID for Stream Live API calls |
| `CF_API_TOKEN` | — | Cloudflare API token with Stream Live permissions |
| `CF_STREAM_WEBHOOK_SECRET` | — | Shared secret used by the live-video webhook route |
| `SENTRY_DSN` | — | API Sentry DSN (leave blank to disable error reporting) |
| `VITE_SENTRY_DSN` | — | Frontend Sentry DSN |
| `NODE_ENV` | `development` | Set to `production` for live deployments |

### Vite frontend variables

Copy or symlink variables to the relevant app `.env.local` files:

```bash
# Buyer web app
cp apps/web/.env.example apps/web/.env.local   # if the file exists, otherwise set manually

# Admin app
cp apps/admin/.env.example apps/admin/.env.local
```

Key `VITE_*` variables for each frontend app:

```
VITE_COGNITO_REGION=<your-region>
VITE_COGNITO_USER_POOL_ID=<pool-id>
VITE_COGNITO_CLIENT_ID=<client-id>
VITE_API_URL=https://api.arremate.com.br   # or http://localhost:4000 for local dev
```

---

## 3. Database setup

### First-time migration (new database)

```bash
pnpm --filter @arremate/database db:generate  # generate Prisma client
pnpm --filter @arremate/database db:push      # push schema (dev/staging)
# OR for production:
# pnpm --filter @arremate/database db:migrate  # run and record migrations
```

### Seed bootstrap data

```bash
# Minimum required env vars for seeding:
export SEED_ADMIN_EMAIL=ops@arremate.com.br
export SEED_ADMIN_COGNITO_SUB=<cognito-sub-of-admin-user>
export SEED_ADMIN_NAME="Admin Arremate"

pnpm --filter @arremate/database db:seed
```

In non-production environments two demo seller accounts are also created.

---

## 4. AWS Cognito setup

### User pool configuration

1. Create a user pool in the target region.
2. Enable **User SRP Auth** flow.
3. Create two app clients:
   - `arremate-web` (public client, no secret) → `COGNITO_WEB_CLIENT_ID`
   - `arremate-admin` (public client, restrict to `ADMIN` group) → `COGNITO_ADMIN_CLIENT_ID`
4. Create a **Cognito Group** named `ADMIN`.
5. Add initial ops users to the `ADMIN` group.

### S3 bucket policy (seller documents)

Bucket must block public access. The API uses pre-signed URLs for upload and download.
Minimum IAM permissions for the service account:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::arremate-seller-documents/*"
}
```

---

## 5. Local development

```bash
pnpm dev         # starts all apps in parallel (web :3000, admin :3001, api :4000)
```

---

## 6. Cloudflare Stream Live setup

Only required if `LIVE_VIDEO_PROVIDER=cloudflare_stream`.

### Worker configuration

Production API deploys read `LIVE_VIDEO_PROVIDER` from [apps/api/wrangler.toml](../../apps/api/wrangler.toml) and Cloudflare secrets from the Worker environment.

Set these Worker secrets in Cloudflare:

- `CF_ACCOUNT_ID`
- `CF_API_TOKEN`
- `CF_STREAM_WEBHOOK_SECRET`

`CF_API_TOKEN` should have the minimum Stream permissions needed to create and delete live inputs.

### Webhook destination

The API now exposes a live-video webhook endpoint at:

`https://api.arrematelive.com/v1/webhooks/live-video`

Configure Cloudflare Notifications:

1. Go to `Notifications` -> `Destinations`.
2. Create a webhook destination.
3. Set the URL to the live-video webhook route above.
4. Set the destination secret to the same value used for `CF_STREAM_WEBHOOK_SECRET`.
5. Save and test the destination.

### Stream notification policy

After the destination exists:

1. Go to `Notifications` -> `All Notifications`.
2. Add a new `Stream` notification.
3. Attach the webhook destination.
4. Leave it account-wide or filter to specific live input IDs.
5. Enable the Stream Live events needed by the control plane.

The current API route reconciles these Cloudflare live input events:

- `live_input.connected`
- `live_input.disconnected`
- `live_input.errored`

Do not point Cloudflare Stream notifications at the Pix webhook route.

---

## 7. Build and validate

```bash
pnpm build       # compile all packages and apps
pnpm lint        # ESLint across all packages
pnpm typecheck   # TypeScript type checks
pnpm test        # Vitest unit tests
```

---

## 8. Enable Sentry error monitoring (optional)

1. Create a Sentry project for each surface (api, web, admin).
2. Set the DSN env vars:
   - `SENTRY_DSN` for the API server
   - `VITE_SENTRY_DSN` for the buyer web app
   - `VITE_SENTRY_DSN` in the admin build environment
3. Install the Sentry SDK packages:
   ```bash
   pnpm --filter @arremate/api add @sentry/node
   pnpm --filter @arremate/web add @sentry/react
   pnpm --filter @arremate/admin add @sentry/react
   ```
4. Uncomment the Sentry initialisation blocks in:
   - `apps/api/src/server.ts`
   - `apps/web/src/main.tsx`
   - `apps/admin/src/main.tsx`

Without a DSN, all errors are captured to structured logs only (no-op reporter).
