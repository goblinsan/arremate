# Payments, Settlement, and Fiscal Readiness Implementation Plan

Last updated: 2026-04-29

## Goal

Close the remaining platform gaps between the current order and fee architecture and a production-ready marketplace stack that can:

- collect real buyer payments
- retain and report platform fees correctly
- manage seller payables and payouts
- support refunds and payout offsets safely
- issue or track required fiscal documents
- support accounting close and reconciliation

This plan assumes the current architecture remains in place:

- `apps/api` is the control plane
- Prisma + Postgres remain the system of record
- orders keep immutable fee snapshots
- non-order monetization entries use `SettlementLedgerEntry`

## Current State

The repo already has:

- fee configuration and evaluation
- immutable fee snapshots on `Order`
- Pix payment abstractions and webhook routes
- deterministic refund calculations
- seller payout estimation views
- a settlement-ledger model for non-order fees

The repo does not yet have:

- a real Pix provider adapter
- correct buyer charge collection for `buyerTotalCents`
- seller payable and payout lifecycle tracking
- payout batch execution and reconciliation
- fiscal-document issuance support
- tax configuration and accounting exports

## Design Principles

### Preserve immutable order economics

Order-level fee snapshots must remain the historical source of truth for:

- buyer amount charged
- platform commission earned
- processor fee burden
- seller net proceeds

No backfilled fee rule change should mutate historical orders.

### Separate commercial truth from money movement

The platform should distinguish:

- commercial state: what the buyer owes, what the seller earned, what the platform retained
- operational state: whether the PSP collected funds, whether payout was initiated, whether refund and settlement side effects have cleared

### Model seller funds as payables, not revenue

Buyer cash collected is not equal to platform revenue. In the expected marketplace model:

- seller proceeds are a liability until payout
- platform commission and related fees are revenue
- PSP fees and reversals must reconcile independently

### Keep rollout additive and auditable

Schema changes should remain additive where possible, with event-style records for:

- payment attempts
- refund records
- payout batches
- payout line items
- fiscal-document records
- reconciliation snapshots

## Delivery Tracks

## Phase 0: Commercial Model and Financial Source of Truth

Purpose:

- lock the operating assumptions before the platform hardens code around them

Outputs:

- explicit marketplace operating model
- buyer-charge invariant aligned to persisted fee snapshots
- repository documentation for money movement and finance responsibilities

Key decisions:

- Is Arremate only a platform intermediary collecting commission, or merchant of record for goods?
- Are buyer-facing shipping and processor pass-through fees meant to be collected from the buyer?
- Does the PSP hold and disburse seller funds, or does Arremate run a separate payout treasury process?

Repo impact:

- order charging logic
- payout and liability modeling
- fiscal-document responsibilities
- accounting exports

## Phase 1: Real Payments and Charge Integrity

Purpose:

- replace the stubbed money collection layer with a production PSP integration

Required changes:

- implement a real Pix adapter behind `createPixAdapter()`
- persist richer provider metadata on payments
- align payment creation with the stored buyer amount
- harden webhook validation and idempotency
- add provider-status reconciliation jobs or admin tools

Critical invariant:

- the amount charged at the PSP must equal the intended collected buyer amount for the order

That means the repo must stop treating `order.totalCents` and `buyerTotalCents` ambiguously.

## Phase 2: Seller Payables, Settlement, and Refund Offsets

Purpose:

- turn estimated seller payout into an operational settlement system

Required changes:

- introduce seller payable lifecycle records
- create payout batches and payout line items
- record payout status transitions
- apply refund clawbacks and offsets against seller balances
- separate estimated payout views from settled payouts

Desired outcome:

- every paid order contributes to a seller payable
- every refund reduces payable or creates an offset
- every seller payout can be reconciled to specific orders, refunds, and ledger entries

## Phase 3: Fiscal Documents and Tax Configuration

Purpose:

- enable the platform to support its real fiscal obligations without mixing them into core order logic

Required changes:

- track invoice responsibility per transaction flow
- support Arremate-issued service invoices for platform fees
- track seller-side invoice responsibility for goods, unless the business model changes
- add tax-configuration primitives rather than embedding hard-coded rates in order flow
- add fiscal-document references and statuses to the system of record

Important constraint:

- tax and invoice obligations depend on the legal model and accountant-approved treatment
- the code should support the approved policy, not guess it

## Phase 4: Accounting, Reconciliation, and Finance Operations

Purpose:

- make finance operations auditable and closeable every month

Required changes:

- exportable reconciliation datasets
- PSP-vs-platform cash matching
- seller payable statements
- refund and reversal reporting
- fiscal-document audit views
- month-close friendly finance reports

Desired outcome:

- finance can explain every real-money movement from buyer payment through seller payout and platform retained revenue

## Recommended Implementation Order

1. Lock commercial model and charging invariants.
2. Ship real Pix integration and amount integrity.
3. Introduce seller payable and payout lifecycle tables and APIs.
4. Add fiscal-document and tax configuration support.
5. Add reconciliation exports and operational close tooling.

This order matters. Building fiscal or accounting tooling before payment and payout truth is stable will create rework.

## Proposed Architecture Changes

### Payments

Add or extend:

- `PaymentAttempt` or equivalent provider-attempt metadata if the current `Payment` table becomes too coarse
- provider event idempotency storage for webhook replay safety
- explicit payment amount fields:
  - subtotal charged basis
  - buyer total charged
  - currency
  - provider fee amounts when available

### Settlement

Add:

- `SellerBalance` or `SellerAccountingBalance`
- `PayoutBatch`
- `PayoutEntry`
- `PayoutReversal` or offset records if not modeled through batch entries

These should reference:

- `Order`
- `OrderRefund`
- `SettlementLedgerEntry`

### Fiscal

Add:

- `FiscalDocument`
- `FiscalDocumentType`
- `FiscalResponsibilityModel`
- provider / issuer reference fields
- issue status, cancel status, and timestamps

### Reconciliation

Add:

- export endpoints or admin CSV generation for:
  - payments
  - refunds
  - seller payables
  - payouts
  - fiscal documents
- reconciliation snapshots or reports for finance review

## API and UI Surfaces to Expect

### API

- payment creation and status reconciliation endpoints
- admin payment reconciliation endpoints
- seller payout statement and payout-history endpoints
- admin payout batch creation and execution endpoints
- fiscal-document status and export endpoints

### Seller UI

- payout statement page based on settled, not only estimated, data
- payout status and offset visibility
- fiscal-document responsibility and status visibility where needed

### Admin UI

- payment reconciliation dashboard
- payout batch operations
- refund offset visibility
- fiscal-document queue and exception handling
- accounting export surfaces

## Risks

### Legal-model drift

If the business treats itself one way operationally and another way for tax/accounting, the platform will be hard to reconcile later.

### PSP mismatch

Some PSPs support simple Pix collection but do not support marketplace settlement well. Choosing the wrong provider will force a large custom payout layer.

### Historic data ambiguity

Legacy orders created before finance hardening may lack complete snapshots or payment metadata. Migration and reporting should tolerate partial history.

### Overloading the order model

Do not keep stuffing settlement, fiscal, and reconciliation concerns directly onto `Order`. Use adjacent tables with explicit relationships.

## Acceptance Criteria for Overall Program

The program is complete when:

- real buyer payments are collected through a production PSP
- collected amounts match approved buyer-charge rules
- seller net proceeds become explicit payables
- payouts are batched, tracked, and reconcilable
- refunds correctly reverse platform and seller amounts
- fiscal-document responsibilities are trackable in the platform
- accounting can export a monthly close package from system data

## Suggested Project Structure

Use five milestones:

1. Phase 0: Commercial Model and Charging Integrity
2. Phase 1: Real Pix Integration
3. Phase 2: Seller Payables and Payout Settlement
4. Phase 3: Fiscal Documents and Tax Configuration
5. Phase 4: Accounting and Reconciliation Operations

Within those milestones, split work into epics for:

- financial source-of-truth hardening
- real Pix adapter and webhook integrity
- seller payable and payout lifecycle
- refund offset and settlement reconciliation
- fiscal-document support
- accounting exports and finance operations

## Notes for Implementation

- Keep schema changes additive and deploy-safe.
- Prefer explicit lifecycle records over status-only booleans.
- Preserve current fee snapshots and refund-policy determinism.
- Do not ship fiscal automation until invoice responsibility is explicitly approved.
- Treat accounting exports as productized operational tooling, not ad hoc SQL.
