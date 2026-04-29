# Arremate Marketplace Commercial Model

This document defines the authoritative commercial model for the Arremate
marketplace, including what the buyer is charged, what the seller earns, and
what the platform retains. All payment-creation, payout, and reporting code
must be consistent with the invariants described here.

---

## Core Amount Definitions

| Field | Formula | Description |
|---|---|---|
| `subtotalCents` | item price at claim time | Raw sale price agreed between buyer and seller. Equal to `totalCents` at order creation. |
| `shippingCents` | from fee config | Shipping add-on charged to the buyer (0 for `INCLUDED` model). |
| `buyerTotalCents` | `subtotalCents + shippingCents` | **The canonical amount the buyer is charged.** This is the amount sent to the PSP. |
| `commissionCents` | `round(subtotalCents * commissionBps / 10000)` | Platform commission deducted from the seller. |
| `processorFeeCents` | `round(subtotalCents * processorFeeBps / 10000)` | Payment processor pass-through fee deducted from the seller. |
| `sellerPayoutCents` | `subtotalCents - commissionCents - processorFeeCents` | Amount owed to the seller after platform deductions. |

---

## Financial Identities

The following identities must hold for every order that has a fee snapshot:

```
buyerTotalCents = subtotalCents + shippingCents

sellerPayoutCents = subtotalCents - commissionCents - processorFeeCents

platformRevenueCents = commissionCents + processorFeeCents
```

Note: when the shipping model is `INCLUDED`, the platform absorbs the shipping
cost separately from the order snapshot. `shippingCents` will be `0` on those
orders even though the platform incurs a logistics cost.

---

## Buyer Charge Invariant

> **The PSP charge amount for any order must equal `buyerTotalCents` when a fee
> snapshot exists, or `totalCents` for legacy orders created before fee
> snapshots were introduced.**

The code path responsible for this is `POST /v1/orders/:orderId/pix-payment`.
The helper `resolveChargeAmount` in that route encodes this rule and must be the
single source of truth for determining the PSP charge amount.

Orders must never be charged using the raw `totalCents` field when `buyerTotalCents`
is available, because the two values diverge whenever shipping is applied.

---

## Seller Payout

The seller is credited `sellerPayoutCents` upon order settlement. This amount is
always based on the immutable fee snapshot recorded at order creation time.
Fee snapshots are never mutated after order creation (see
[monetization-roadmap.md](./monetization-roadmap.md) for the settlement
compatibility design).

---

## Platform Revenue

For a fully settled order the platform retains:

```
platformRevenueCents = commissionCents + processorFeeCents
```

For reporting purposes, the `netRevenueCents` metric subtracts `processorFeeCents`
from `grossCommissionCents` to reflect that the processor fee is a cost to the
platform (passed through to the buyer but remitted to the PSP):

```
netRevenueCents = commissionCents - processorFeeCents
```

After refunds:

```
adjustedNetRevenueCents = (commissionCents - commissionReversalCents)
                        - (processorFeeCents - processorFeeReversalCents)
```

> **Note:** `netRevenueCents` (and its adjusted variant) can be negative when processor fees
> exceed commission — for example, when a promotional discount reduces the commission below
> the processor fee. This is expected and represents a per-order cost to the platform. There
> is no minimum net-revenue guarantee at the individual order level.

---

## Fiscal and Reporting Notes

- **GMV** is the sum of `subtotalCents` across settled orders with a fee
  snapshot (excludes shipping and legacy orders without a snapshot).
- **Total buyer spend** is the sum of `buyerTotalCents` and represents total
  cash collected from buyers.
- Admin analytics (`MonetizationReportPage`) and fee reconciliation
  (`FeeReconciliationPage`) use these exact fields — do not substitute
  `totalCents` for `buyerTotalCents` in aggregate reporting.
- The refund policy engine (`refund-policy.ts`) always derives refund amounts
  from the persisted snapshot, never from a live fee config recalculation.

---

## Legacy Orders

Orders created before fee snapshots were introduced have `buyerTotalCents = null`
and `sellerPayoutCents = null`. For these orders:

- The charge amount falls back to `totalCents`.
- Refunds fall back to `totalCents` as the reference total.
- They are excluded from GMV and commission aggregates but included in order counts.
