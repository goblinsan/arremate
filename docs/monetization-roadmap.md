# Monetization Architecture Roadmap

This document is the canonical entrypoint for future monetization planning on the Arremate platform.
It covers the three tracks required before any new revenue product can be shipped:
**architecture**, **roadmap**, and **settlement compatibility**.

---

## Architecture Track

### Fee Type Model

All platform fees are classified under the `FeeType` enum (defined in both
`packages/database/prisma/schema.prisma` and `packages/types/src/index.ts`):

| Value | Description |
|---|---|
| `COMMISSION` | Standard per-sale platform commission (basis points of subtotal) |
| `PROCESSOR_FEE` | Payment processor pass-through fee (basis points of subtotal) |
| `SUBSCRIPTION` | Recurring seller subscription charge (flat or tiered) |
| `PROMOTED_LISTING` | Pay-to-promote a specific inventory item or show |
| `PREMIUM_SERVICE` | One-off premium service charges (e.g. white-glove onboarding) |
| `PAYOUT_ACCELERATION` | Fee for expedited payout settlement |
| `LOGISTICS_MARGIN` | Platform margin on integrated logistics products |

### How to Introduce a New Fee Type

1. Add the new `FeeType` value to the enum in `schema.prisma` and `packages/types/src/index.ts`.
2. For **order-adjacent** fees (charged at the time of sale), pass a `FeeLineItem` in
   `extraFees` when calling `calculateFee()`. The item will appear in `FeeBreakdown.feeLineItems`.
3. For **standalone** fees (charged independently of any order), create a
   `SettlementLedgerEntry` record. The `orderId` field is optional, allowing the entry
   to reference an order or stand alone.

### Key Files

| File | Purpose |
|---|---|
| `packages/database/prisma/schema.prisma` | `FeeType` enum, `SettlementLedgerEntry` model, `FeeConfig` / `FeeSellerOverride` / `FeePromotion` models |
| `apps/api/src/services/fee-calculator.ts` | Pure `calculateFee()` function, `FeeBreakdown`, `FeeLineItem`, `FeeType` |
| `apps/api/src/services/fee-evaluator.ts` | DB-aware `evaluateFee()` — wraps `calculateFee` with live config lookup |
| `packages/types/src/index.ts` | Shared TypeScript types including `FeeBreakdown`, `FeeLineItem`, `FeeType`, `SettlementLedgerEntry` |

---

## Roadmap Track

Below are the planned monetization modules and their readiness status.

### Subscriptions

Recurring monthly or annual plans for sellers, granting reduced commission rates,
higher listing limits, or premium badge placement.

- Architecture: `FeeType.SUBSCRIPTION` + `SettlementLedgerEntry` for recurring billing
- Status: architecture ready, product spec pending

### Promoted Listings

Sellers pay to boost visibility of inventory items or shows in search and browse surfaces.

- Architecture: `FeeType.PROMOTED_LISTING` + `SettlementLedgerEntry` (or order-adjacent `FeeLineItem`)
- Status: architecture ready, product spec pending

### Premium Services

One-off value-added services charged to sellers (e.g. professional photography, white-glove
onboarding, dedicated account management).

- Architecture: `FeeType.PREMIUM_SERVICE` + `SettlementLedgerEntry`
- Status: architecture ready, product spec pending

### Payout Acceleration

Sellers can pay a fee to receive settlement within 24 hours rather than the standard
settlement window.

- Architecture: `FeeType.PAYOUT_ACCELERATION` + `SettlementLedgerEntry`
- Status: architecture ready, settlement design pending (see Settlement Compatibility below)

### Logistics Margin Products

Platform-integrated shipping with a margin captured by Arremate (e.g. negotiated carrier
rates resold to sellers at a small mark-up).

- Architecture: `FeeType.LOGISTICS_MARGIN` as an `extraFees` `FeeLineItem` within the order
  `FeeBreakdown`, or a standalone `SettlementLedgerEntry` for post-sale logistics billing
- Status: architecture ready, carrier integration pending

---

## Settlement Compatibility Track

### Design Principles

1. **Immutable order snapshots** — Existing order-level fee fields
   (`commissionCents`, `processorFeeCents`, `sellerPayoutCents`, etc.) are never mutated
   after order creation. New fee products must not touch these fields.

2. **Adjacent ledger** — Non-order fees are recorded as `SettlementLedgerEntry` rows.
   Settlement calculations sum order payouts plus/minus ledger entries to derive the
   net amount owed to or owed by a seller for a given settlement period.

3. **Reversibility** — Every `SettlementLedgerEntry` must be reversible via a compensating
   entry (negative `amountCents`). This mirrors the existing `OrderRefund` pattern.

4. **Auditability** — All ledger entries carry `sellerId`, `feeType`, `description`, and
   optional `orderId` and `metadata`. Admin tooling should expose a settlement statement
   view that groups entries by period and fee type.

### Settlement Calculation Identity

For a given settlement period:

```
netSellerPayout
  = sum(order.sellerPayoutCents for PAID orders in period)
  - sum(refund.sellerClawbackCents for refunds in period)
  - sum(entry.amountCents for SettlementLedgerEntry with positive amount in period)
  + sum(abs(entry.amountCents) for SettlementLedgerEntry with negative amount in period)
```

### Compatibility Matrix

| Fee Product | Settlement Impact | Implementation Path |
|---|---|---|
| Commission | Captured in `Order.sellerPayoutCents` | Existing |
| Processor Fee | Captured in `Order.processorFeeCents` | Existing |
| Subscription | Negative ledger entry at billing cycle | `SettlementLedgerEntry` |
| Promoted Listing | Negative ledger entry at promotion activation | `SettlementLedgerEntry` |
| Premium Service | Negative ledger entry at service delivery | `SettlementLedgerEntry` |
| Payout Acceleration | Negative ledger entry at payout request | `SettlementLedgerEntry` |
| Logistics Margin | Order-adjacent `FeeLineItem` or ledger entry | `FeeLineItem` or `SettlementLedgerEntry` |
