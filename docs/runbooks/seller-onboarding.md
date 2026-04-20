# Seller Onboarding Runbook

> Procedures for the ops team to review and approve seller applications on
> the Arremate platform.

---

## Overview

Sellers apply through the buyer-facing web app at `/seller-application`.
Their application is reviewed manually by an admin before they can list
inventory or start live shows.

**Application lifecycle:**
`DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` | `REJECTED`

---

## Step 1 – Receive and acknowledge a new application

1. Open the admin panel → **Vendedores** → filter by `SUBMITTED`.
2. Assign yourself as the reviewer (update status to `UNDER_REVIEW`).
3. Send a confirmation email to the applicant if your email tooling supports it.

---

## Step 2 – Document verification checklist

Verify the following for every application:

- [ ] **Identity document** – CPF or CNPJ is legible and matches the applicant name.
- [ ] **Address proof** – Utility bill or bank statement dated within the last 90 days.
- [ ] **Business registration** (if applicable) – CNPJ card or Contrato Social.
- [ ] Tax ID (`taxId`) matches the uploaded documents.
- [ ] Phone number is a valid Brazilian number.
- [ ] No prior suspension record for this email or tax ID.

---

## Step 3 – Background checks

Run these checks before approving:

1. **Cross-reference with existing users** – Search the `users` table for the email and tax ID.
2. **Prior disputes** – Check if the email or name appears in any dispute records.
3. **Blocklist** – Check against your internal blocklist (maintain in your internal wiki).

---

## Step 4 – Approve or reject

### Approve

```
Admin panel → Seller Applications → [Application ID] → Review → APPROVED
Add review notes: "Documents verified on [date] by [reviewer name]"
```

On approval:
- The user's `role` changes to `SELLER`.
- A `SellerAccount` record is created.
- The seller can now create shows and list inventory.

### Reject

```
Admin panel → Seller Applications → [Application ID] → Review → REJECTED
Review notes are mandatory – explain the reason clearly.
```

Rejection reasons to document:
- Incomplete or unreadable documents
- Suspected identity fraud
- Business type not supported (e.g., regulated financial services)
- Prior account suspension

---

## Step 5 – Post-approval actions

1. Notify the seller via email that their account is approved.
2. Point them to the seller guide (link in internal wiki).
3. Offer an optional onboarding call for sellers with high expected volume.

---

## Escalation

If documents appear fraudulent or you cannot verify identity within 2 business days:

1. Flag the application with a note: `"Pending escalation – [reason]"`.
2. Escalate to the trust & safety lead.
3. Do not approve or reject until escalation is resolved.

---

## Edge cases

| Situation | Action |
|-----------|--------|
| Seller resubmits after rejection | Create a new application record; do not reuse the rejected one |
| Seller requests document change before approval | Ask them to upload updated documents via the app; re-review |
| Legal notice / law enforcement request | Stop all review actions; escalate immediately to legal counsel |
