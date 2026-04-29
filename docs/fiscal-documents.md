# Fiscal Documents and Invoice Responsibility

This document explains how the Arremate platform handles fiscal-document lifecycle
tracking and invoice responsibility assignment.

---

## Overview

A marketplace transaction typically involves two distinct economic relationships:

1. **Platform service fee** - Arremate charges the seller a commission and processor fee
   for facilitating the sale. The platform is responsible for issuing an NFS-e
   (Nota Fiscal de Servicos Eletronico) for this amount.

2. **Goods sale** - The seller transfers ownership of goods to the buyer. Depending on
   the seller's registration and tax regime, the seller may be responsible for issuing
   an NF-e or NFS-e for the goods. Under certain marketplace facilitation models, this
   responsibility may shift to the platform or the transaction may be exempt.

---

## Data Model

### FiscalDocument

The `FiscalDocument` model (`fiscal_documents` table) records each fiscal document
that needs to be issued or tracked for a given transaction.

| Field | Description |
|---|---|
| `orderId` | Optional link to the associated order. Null for platform-wide documents. |
| `invoiceResponsibility` | Who is responsible for issuing this document (`PLATFORM` or `SELLER`). |
| `documentType` | The type of fiscal document (`NFS_E_SERVICE_FEE` or `NF_E_GOODS`). |
| `status` | Current lifecycle status (`PENDING`, `ISSUED`, `CANCELLED`, `ERROR`). |
| `externalId` | The external ID assigned by the issuing authority or integration (e.g. NFS-e number). |
| `issuedAt` | Timestamp when the document was successfully issued. |
| `errorMessage` | Error details when status is `ERROR`. |
| `metadata` | Arbitrary JSON for integration-specific data (e.g. provider payload). |

### InvoiceResponsibility

| Value | Meaning |
|---|---|
| `PLATFORM` | Arremate is responsible for issuing the document (e.g. NFS-e for commission). |
| `SELLER` | The seller is responsible for issuing the document (e.g. NF-e for the goods sold). |

### FiscalDocumentType

| Value | Meaning |
|---|---|
| `NFS_E_SERVICE_FEE` | NFS-e issued for the platform service fee (commission charged to the seller). |
| `NF_E_GOODS` | NF-e or NFS-e issued for the physical goods transferred from seller to buyer. |

### FiscalDocumentStatus

| Value | Meaning |
|---|---|
| `PENDING` | Document has been queued for issuance but has not yet been issued. |
| `ISSUED` | Document has been successfully issued. `externalId` and `issuedAt` are populated. |
| `CANCELLED` | Document was cancelled (e.g. after a refund). |
| `ERROR` | Issuance failed. `errorMessage` contains the reason. |

---

## Tax Configuration

The `TaxConfig` model (`tax_configs` table) stores accountant-approved parameters that
govern how taxes are applied to platform fees and goods. Only one configuration is
active at a time.

| Field | Description |
|---|---|
| `platformServiceTaxRateBps` | Tax rate applied to the platform service fee, in basis points (e.g. 500 = 5%). Used for ISS calculation on NFS-e. |
| `goodsSaleTaxModel` | How the goods sale tax obligation is handled (see below). |
| `isActive` | Whether this configuration is currently in effect. |
| `effectiveFrom` / `effectiveTo` | Date range during which the configuration is valid. |

### GoodsSaleTaxModel

| Value | Meaning |
|---|---|
| `SELLER_ISSUED` | The seller is responsible for issuing their own NF-e or NFS-e for goods. The platform does not create `FiscalDocument` records for goods. |
| `EXEMPT` | The transaction is exempt from goods-sale fiscal documentation (e.g. seller is MEI below the threshold). No NF-e is required. |
| `MARKETPLACE_FACILITATED` | The platform facilitates the goods-sale document on behalf of the seller. A `FiscalDocument` with `invoiceResponsibility=PLATFORM` and `documentType=NF_E_GOODS` is created. |

---

## Lifecycle Workflow

### Platform service fee (NFS-e)

1. When an order transitions to `PAID`, a `FiscalDocument` record is created:
   - `invoiceResponsibility = PLATFORM`
   - `documentType = NFS_E_SERVICE_FEE`
   - `status = PENDING`
2. The NFS-e issuance integration (future work) picks up `PENDING` documents and calls
   the municipal NFS-e API (e.g. via a background worker).
3. On success, the record is updated to `status = ISSUED` with `externalId` and `issuedAt`.
4. On failure, the record is updated to `status = ERROR` with `errorMessage`.
5. If the order is refunded, the document may be cancelled: `status = CANCELLED`.

### Goods sale (NF-e / NFS-e)

The handling depends on the active `TaxConfig.goodsSaleTaxModel`:

- **SELLER_ISSUED**: No `FiscalDocument` record is created for goods. The platform
  displays guidance to the seller about their own NF-e obligation. Admins can track
  this manually via a `FiscalDocument` record with `invoiceResponsibility = SELLER`.
- **EXEMPT**: No document is created.
- **MARKETPLACE_FACILITATED**: A `FiscalDocument` record is created with
  `invoiceResponsibility = PLATFORM` and `documentType = NF_E_GOODS`.

---

## Admin Surfaces

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/fiscal-documents` | List fiscal documents. Supports filtering by `status`, `invoiceResponsibility`, `orderId`, and pagination. |
| `GET` | `/v1/admin/fiscal-documents/:id` | Get a single fiscal document. |
| `POST` | `/v1/admin/fiscal-documents` | Manually create a fiscal document record. |
| `PATCH` | `/v1/admin/fiscal-documents/:id/status` | Update the status of a fiscal document (and optionally set `externalId` or `errorMessage`). |
| `GET` | `/v1/admin/tax-configs` | List all tax configurations. |
| `GET` | `/v1/admin/tax-configs/active` | Get the currently active tax configuration. |
| `GET` | `/v1/admin/tax-configs/:id` | Get a specific tax configuration. |
| `POST` | `/v1/admin/tax-configs` | Create a new tax configuration. |
| `POST` | `/v1/admin/tax-configs/:id/activate` | Activate a tax configuration (deactivates any currently active one). |
| `DELETE` | `/v1/admin/tax-configs/:id` | Delete an inactive tax configuration. |

### Admin UI

The **Documentos Fiscais** page in the admin panel shows all fiscal document records
with filtering by status and invoice responsibility. Use this page to:

- Identify orders that still have `PENDING` fiscal documents requiring action.
- Verify which documents have been `ISSUED` and their external IDs.
- Review `ERROR` documents and their error messages.

---

## Key Design Decisions

1. **Two documents per order** - An order can have both a `NFS_E_SERVICE_FEE` document
   (platform responsibility) and an `NF_E_GOODS` document (seller or platform
   responsibility). These are tracked independently.

2. **Responsibility is explicit** - The `invoiceResponsibility` field makes it
   unambiguous who must take action for each document. This avoids hard-coding
   assumptions in order-flow code.

3. **Tax config is environment-safe** - Tax rates and models live in `TaxConfig`,
   not in environment variables or route code. Only one config is active at a time,
   and all changes are audited.

4. **Issuance integration is decoupled** - The `FiscalDocument` model captures intent
   (`PENDING`) and outcome (`ISSUED` / `ERROR`). The actual NFS-e API integration is
   a separate concern (background worker or webhook) that writes back to these records.
