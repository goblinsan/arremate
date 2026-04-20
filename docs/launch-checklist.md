# Launch Readiness Checklist

> Go / No-Go gate for moving from internal build-out to pilot launch.
> Every item in the **Blocking** column must be **✅ done** before external users are onboarded.
> Non-blocking items should be completed within the first two weeks of pilot.

---

## How to use

1. Work through each section with the relevant team member.
2. Mark each item `✅` when complete, `❌` if intentionally deferred, or `⚠️` if partially done.
3. A Go decision requires all **Blocking** items to be ✅.
4. Schedule a 30-minute Go/No-Go call with the full team before flipping the switch.

---

## Engineering – Infrastructure

| # | Item | Blocking | Status |
|---|------|----------|--------|
| E1 | Production database (Neon) is provisioned and connection strings are set | ✅ | ⬜ |
| E2 | `DATABASE_URL` and `DIRECT_URL` point to production (not dev) | ✅ | ⬜ |
| E3 | All Prisma migrations applied to production DB | ✅ | ⬜ |
| E4 | Seed script run: admin user and bootstrap data present | ✅ | ⬜ |
| E5 | API server is deployed and `/health` returns `{ "status": "ok" }` | ✅ | ⬜ |
| E6 | `GET /v1/admin/health` reports all sub-systems `ok` | ✅ | ⬜ |
| E7 | CORS origin is set to the production web app domain (not `*`) | ✅ | ⬜ |
| E8 | HTTPS is enabled for all external endpoints | ✅ | ⬜ |
| E9 | S3 bucket for seller documents is created with correct IAM policy | ✅ | ⬜ |
| E10 | `NODE_ENV=production` is set on the API server | ✅ | ⬜ |

---

## Engineering – Authentication

| # | Item | Blocking | Status |
|---|------|----------|--------|
| A1 | Cognito user pool created in production region | ✅ | ⬜ |
| A2 | `arremate-web` and `arremate-admin` app clients created | ✅ | ⬜ |
| A3 | `ADMIN` Cognito group exists; initial admin users added | ✅ | ⬜ |
| A4 | `COGNITO_*` env vars set correctly on the API server | ✅ | ⬜ |
| A5 | `VITE_COGNITO_*` vars built into the web and admin apps | ✅ | ⬜ |
| A6 | End-to-end sign-in tested for buyer, seller, and admin personas | ✅ | ⬜ |

---

## Engineering – Payments

| # | Item | Blocking | Status |
|---|------|----------|--------|
| P1 | `PIX_PROVIDER` set to production provider (not `stub`) | ✅ | ⬜ |
| P2 | PIX provider credentials configured and tested | ✅ | ⬜ |
| P3 | Webhook endpoint (`POST /v1/webhooks/pix`) verified with provider | ✅ | ⬜ |
| P4 | End-to-end payment flow tested with a real (small) transaction | ✅ | ⬜ |
| P5 | Refund flow tested via admin panel | ✅ | ⬜ |

---

## Engineering – Observability

| # | Item | Blocking | Status |
|---|------|----------|--------|
| O1 | Structured logs are flowing to a log aggregator (CloudWatch / Datadog / etc.) | ✅ | ⬜ |
| O2 | `SENTRY_DSN` configured; errors appear in Sentry project | ❌ optional | ⬜ |
| O3 | `/v1/admin/health` dashboard is accessible in the admin panel | ✅ | ⬜ |
| O4 | Alert rule exists for API health check failures | ✅ | ⬜ |
| O5 | Alert rule exists for elevated error log rate | ❌ optional | ⬜ |

---

## Engineering – CI / CD

| # | Item | Blocking | Status |
|---|------|----------|--------|
| C1 | CI pipeline passes on `main` branch (lint + typecheck + test + build) | ✅ | ⬜ |
| C2 | Production deploy is triggered automatically on merge to `main` | ❌ optional | ⬜ |
| C3 | Rollback procedure documented and tested | ✅ | ⬜ |

---

## Operations

| # | Item | Blocking | Status |
|---|------|----------|--------|
| Op1 | At least one admin user can log in to the admin panel | ✅ | ⬜ |
| Op2 | Ops team has read the [environment setup runbook](./runbooks/environment-setup.md) | ✅ | ⬜ |
| Op3 | Ops team has read the [incident response runbook](./runbooks/incident-response.md) | ✅ | ⬜ |
| Op4 | Ops team has read the [seller onboarding runbook](./runbooks/seller-onboarding.md) | ✅ | ⬜ |
| Op5 | Ops team has read the [dispute handling runbook](./runbooks/dispute-handling.md) | ✅ | ⬜ |
| Op6 | On-call rotation defined (at least 2 people) | ✅ | ⬜ |
| Op7 | Incident response contacts are documented (internal wiki) | ✅ | ⬜ |
| Op8 | Seller support email / channel is live and monitored | ✅ | ⬜ |

---

## Trust & Safety

| # | Item | Blocking | Status |
|---|------|----------|--------|
| T1 | Seller application review process is operational | ✅ | ⬜ |
| T2 | At least 2 pilot sellers have been pre-approved | ✅ | ⬜ |
| T3 | Dispute resolution flow end-to-end tested by ops team | ✅ | ⬜ |
| T4 | Content moderation (chat) enabled for all live sessions | ✅ | ⬜ |
| T5 | Seller suspension / strike flow tested | ✅ | ⬜ |
| T6 | Refund policy is documented and communicated to pilot sellers | ✅ | ⬜ |

---

## Legal & Compliance (Brazil)

| # | Item | Blocking | Status |
|---|------|----------|--------|
| L1 | Terms of Service reviewed by legal counsel | ✅ | ⬜ |
| L2 | Privacy Policy compliant with LGPD | ✅ | ⬜ |
| L3 | ToS and Privacy Policy linked from web app | ✅ | ⬜ |
| L4 | Data retention policy defined | ❌ optional | ⬜ |
| L5 | CNPJ / legal entity registered if processing payments | ✅ | ⬜ |

---

## Pilot scope

Before external rollout, confirm:

- [ ] Maximum number of pilot sellers: ___
- [ ] Maximum number of pilot buyers: ___
- [ ] Pilot duration: ___ weeks
- [ ] Escalation contact during pilot: ___
- [ ] Success metrics defined (e.g., GMV, dispute rate, NPS): ___

---

## Go / No-Go decision

| Date | Decision | Signed off by | Notes |
|------|----------|--------------|-------|
| | ⬜ Go / ⬜ No-Go | | |
