# Dispute Handling Runbook

> Procedures for the ops team to review and resolve buyer–seller disputes on
> the Arremate platform.

---

## Overview

Buyers can open a dispute on any order via `POST /v1/orders/:orderId/dispute`.
Disputes are reviewed by the ops team in the admin panel under **Disputas**.

**Dispute lifecycle:**
`OPEN` → `UNDER_REVIEW` → `RESOLVED` | `CLOSED`

**Dispute reasons:**

| Reason | Description |
|--------|-------------|
| `ITEM_NOT_RECEIVED` | Buyer claims the item was never delivered |
| `ITEM_NOT_AS_DESCRIBED` | Item differs materially from the listing |
| `PAYMENT_ISSUE` | Payment was processed but order status is incorrect |
| `OTHER` | Any other reason (requires detailed description) |

---

## SLA targets

| Dispute type | First response | Resolution target |
|-------------|---------------|-------------------|
| Item not received | 24 h | 5 business days |
| Item not as described | 24 h | 7 business days |
| Payment issue | 4 h | 2 business days |
| Other | 48 h | 10 business days |

---

## Step 1 – Receive and triage

1. Open the admin panel → **Disputas** → filter by `OPEN`.
2. Review the dispute reason and buyer description.
3. Set status to `UNDER_REVIEW` and assign yourself.
4. Contact both buyer and seller via the support system to gather evidence.

---

## Step 2 – Evidence gathering

### From the buyer
- Order confirmation and payment receipt (available in admin panel).
- Photos / video showing the issue (buyer must provide).
- Shipping tracking number (if provided by seller).
- Date the item was expected and date received (if applicable).

### From the seller
- Tracking number and carrier name.
- Proof of shipment (carrier receipt, photo of package).
- Product description and photos at time of listing.

---

## Step 3 – Resolution decision matrix

| Evidence | Decision | Action |
|---------|----------|--------|
| Seller has valid tracking – item delivered | Dispute rejected | Inform buyer; close dispute |
| Seller has no tracking or tracking shows not delivered | Buyer wins | Issue full refund |
| Item received but significantly not as described (with evidence) | Buyer wins | Issue full refund |
| Item received but minor difference | Negotiate partial refund | Agree with both parties |
| Payment issue confirmed | Fix order status | Correct payment record; no refund if item received |
| Fraudulent buyer claim | Dispute rejected | Add strike to buyer account; close dispute |

---

## Step 4 – Issuing a refund

Full or partial refunds are issued via the admin panel:

```
Admin panel → Disputas → [Dispute ID] → Resolve → Issue Refund
```

Or directly via the admin API:

```
POST /v1/admin/orders/:orderId/refund
Body: { "amountCents": 15000, "reason": "Item not received" }
```

After refund:
- The order status changes to `REFUNDED`.
- The payment status changes to `REFUNDED`.
- Both parties receive a notification (if email integration is active).

---

## Step 5 – Recording the resolution

When resolving a dispute via the admin panel:
- Set status to `RESOLVED`.
- Add a resolution note summarising the decision and evidence reviewed.
- The resolution note is stored and auditable.

---

## Step 6 – Seller strikes and suspension

Issue a seller strike if:
- The seller shipped a fraudulent or significantly misrepresented item.
- The seller failed to ship within the stated timeframe without explanation.
- The dispute was the seller's third dispute in 30 days.

```
Admin panel → Usuários → [Seller ID] → Strike
```

Suspend the seller immediately if:
- Confirmed fraud (identity theft, counterfeit goods).
- Three or more unresolved strikes.

```
Admin panel → Usuários → [Seller ID] → Suspend
```

---

## Escalation

Escalate to the trust & safety lead if:
- The dispute involves a claim over R$ 5,000.
- There is suspected organised fraud.
- Legal threats are made by either party.
- You cannot reach a resolution within the SLA.
