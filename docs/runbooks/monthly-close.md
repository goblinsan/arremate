# Monthly Close Procedure

This runbook documents the end-of-month financial close steps for the Arremate
platform.  Follow these steps in order.  Each step references the admin tooling
or data export that supports it.

---

## Prerequisites

- You have **ADMIN** access to the Arremate admin panel.
- You have confirmed the calendar period for the close (e.g. 2024-03-01 →
  2024-03-31).
- The accounting team has confirmed no in-flight promotions or fee-config changes
  are scheduled to affect the period after the close starts.

---

## Step 1 — Reconcile pending PSP payments

> **Admin page**: Payments (or use the PSP webhook reconciliation endpoint)

1. Go to **Admin › Reconciliação** (`/reconciliation`) or call:
   ```
   POST /v1/admin/payments/reconcile
   ```
   with `{ "olderThanMinutes": 0 }` to flush all stale PENDING payments.
2. Confirm the response shows 0 PENDING payments remaining for the month.
3. If any payments remain PENDING, investigate each one via:
   ```
   POST /v1/admin/payments/:paymentId/reconcile
   ```
4. Document any payments that could not be reconciled (PSP outage, disputed
   charges, etc.) in the exceptions log.

---

## Step 2 — Review the finance reconciliation dashboard

> **Admin page**: Reconciliação Financeira (`/finance/reconciliation`)

1. Set the period to the calendar month being closed.
2. Confirm:
   - **Caixa PSP → Total coletado** matches the PSP settlement statement for
     the period.
   - **Receita líquida ajustada** is positive and agrees with the GL entry.
   - **Passivo com vendedores → Pendente** reflects only orders processed after
     the cut-off.
3. Review the **Exceções** section:
   - `STALE_PENDING_PAYMENT` — resolve via Step 1 above.
   - `PAID_ORDER_WITHOUT_PAYABLE` — these are data integrity gaps; escalate to
     engineering.
   - `FISCAL_DOCUMENT_ERROR` — resolve via Step 5 below.
   - `FAILED_PAYOUT_BATCH` — resolve via Step 4 below.
4. No HIGH-severity exceptions should remain before proceeding.

---

## Step 3 — Export close-ready datasets

> **Admin page**: Exportação Financeira (`/finance/export`)

Set the period to the calendar month being closed and download each dataset:

| Dataset | Filename pattern | Used for |
|---|---|---|
| Pagamentos | `payments-YYYY-MM-01_YYYY-MM-31.csv` | PSP cash reconciliation |
| Reembolsos | `refunds-YYYY-MM-01_YYYY-MM-31.csv` | Refund liability entries |
| Repasses devidos (payables) | `payables-YYYY-MM-01_YYYY-MM-31.csv` | Seller payable ageing |
| Lotes de repasse | `payouts-YYYY-MM-01_YYYY-MM-31.csv` | Disbursement register |
| Taxas retidas (plataforma) | `retained-fees-YYYY-MM-01_YYYY-MM-31.csv` | Revenue recognition |
| Documentos fiscais | `fiscal-documents-YYYY-MM-01_YYYY-MM-31.csv` | NFS-e / NF-e audit |

All CSV files use semicolon separators and UTF-8 with BOM for Excel
compatibility.  Upload to the shared accounting folder for the period.

Alternatively, export via API for automated pipelines:
```
GET /v1/admin/finance/export/payments?from=YYYY-MM-01&to=YYYY-MM-31
GET /v1/admin/finance/export/refunds?from=YYYY-MM-01&to=YYYY-MM-31
GET /v1/admin/finance/export/payables?from=YYYY-MM-01&to=YYYY-MM-31
GET /v1/admin/finance/export/payouts?from=YYYY-MM-01&to=YYYY-MM-31
GET /v1/admin/finance/export/retained-fees?from=YYYY-MM-01&to=YYYY-MM-31
GET /v1/admin/finance/export/fiscal-documents?from=YYYY-MM-01&to=YYYY-MM-31
```
All require an `Authorization: Bearer <admin-token>` header.

---

## Step 4 — Generate and finalise payout batches

> **Admin page**: Lotes de repasse (`/payouts`)

1. Generate a batch for the close period:
   - Click **Gerar lote**, set `Período início` and `Período fim` to the
     calendar month, and click **Gerar lote**.
   - Or call `POST /v1/admin/payout-batches` with `periodStart` and
     `periodEnd`.
2. Review the batch entries:
   - Confirm each seller's net amount matches the `payables` export for that
     seller.
   - Negative entries (refund offsets) should reduce the seller's net payout.
3. Click **Processar** to move the batch to `PROCESSING`.
4. Once disbursement is confirmed with the bank / payment provider:
   - Click **Marcar pago** or call:
     ```
     PATCH /v1/admin/payout-batches/:batchId/status
     { "status": "PAID" }
     ```
5. If a batch fails, mark it `FAILED` and re-generate after investigating the
   root cause.

---

## Step 5 — Resolve fiscal document exceptions

> **Admin page**: Documentos Fiscais (`/fiscal-documents`)

1. Filter for `ERROR` status documents.
2. For each error:
   - Read the `errorMessage` field.
   - Correct the underlying data or trigger reissuance via your NFS-e / NF-e
     integration.
3. Filter for `PENDING` documents older than 2 business days.  Escalate to the
   fiscal team if they remain stuck.
4. Export the final document status using the `fiscal-documents` dataset (Step 3)
   after all errors are resolved.

---

## Step 6 — Cross-check GL entries

Using the exported datasets:

1. **Revenue**: Sum of `retained-fees` → `netRetainedBrl` column equals the
   platform service revenue line in the GL.
2. **Refund liability**: Sum of `refunds` → `refundAmountBrl` equals the total
   refund provision reversed from accounts receivable.
3. **Seller payable**: Sum of `payables` where `status = PENDING` at month-end
   equals the seller payable accrual on the balance sheet.
4. **Cash received**: Sum of `payments` where `status = PAID` → `amountBrl`
   equals the PSP settlement statement net of any in-transit items.

Any variances greater than R$ 1.00 must be investigated before signing off.

---

## Step 7 — Sign-off

1. Complete the close checklist in the accounting system.
2. Archive the exported CSV files with the period label.
3. Email the reconciliation summary (screenshot of `/finance/reconciliation`)
   to the finance lead and CFO.
4. Tag the close in the accounting system as **LOCKED** to prevent back-dated
   changes.

---

## Escalation contacts

| Issue | Owner |
|---|---|
| PSP not responding to reconciliation calls | Payments team (engineering) |
| Seller payable data integrity gaps | Platform engineering |
| NFS-e / NF-e issuance failures | Fiscal / tax team |
| GL variance > R$ 1.00 | Finance lead + CFO |

---

## Related runbooks

- [Dispute handling](./dispute-handling.md)
- [Seller onboarding](./seller-onboarding.md)
- [Incident response](./incident-response.md)
