// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  activeRole: UserRole | null;
  isSeller: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Auction ─────────────────────────────────────────────────────────────────

export type AuctionStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

export interface Auction {
  id: string;
  title: string;
  description: string | null;
  status: AuctionStatus;
  startPrice: number;
  currentBid: number | null;
  startAt: Date | null;
  endAt: Date | null;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  bids?: Bid[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Bid ─────────────────────────────────────────────────────────────────────

export interface Bid {
  id: string;
  amount: number;
  userId: string;
  user?: Pick<User, 'id' | 'name'>;
  auctionId: string;
  createdAt: Date;
}

// ─── Product ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  title: string;
  description: string | null;
  imageUrls: string[];
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  sellerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Seller Onboarding ────────────────────────────────────────────────────────

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type DocumentType =
  | 'IDENTITY'
  | 'ADDRESS_PROOF'
  | 'BUSINESS_REGISTRATION'
  | 'OTHER';

export interface SellerApplication {
  id: string;
  userId: string;
  status: ApplicationStatus;
  businessName: string | null;
  businessType: string | null;
  taxId: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  brandLogoUrl: string | null;
  reviewedById: string | null;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  documents?: SellerDocument[];
}

export interface SellerDocument {
  id: string;
  applicationId: string;
  documentType: DocumentType;
  fileName: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number | null;
  uploadedAt: Date;
}

export interface SellerAccount {
  id: string;
  userId: string;
  applicationId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadUrlRequest {
  documentType: DocumentType;
  fileName: string;
  contentType: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}

// ─── Shows ────────────────────────────────────────────────────────────────────

export type ShowStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type ItemCondition = 'NEW' | 'USED' | 'REFURBISHED';

export type ShowCategory =
  | 'JEWELRY'
  | 'TOYS'
  | 'WOMENS_FASHION'
  | 'MENS_FASHION'
  | 'ELECTRONICS'
  | 'HOME_DECOR'
  | 'BEAUTY'
  | 'SPORTS'
  | 'COLLECTIBLES'
  | 'OTHER';

export type ShippingType = 'FREE' | 'FLAT_RATE' | 'DISCOUNTED';

export interface ShippingProfile {
  id: string;
  sellerId: string;
  name: string;
  shippingType: ShippingType;
  shippingCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Show {
  id: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  title: string;
  description: string | null;
  status: ShowStatus;
  scheduledAt: Date | null;
  category: ShowCategory | null;
  bannerImageUrl: string | null;
  videoUrl: string | null;
  preBidsEnabled: boolean;
  shippingProfileId: string | null;
  shippingProfile?: ShippingProfile | null;
  createdAt: Date;
  updatedAt: Date;
  queueItems?: ShowInventoryItem[];
}

export interface InventoryImage {
  id: string;
  itemId: string;
  s3Key: string;
  contentType: string;
  fileName: string;
  position: number;
  uploadedAt: Date;
}

export interface InventoryItem {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  condition: ItemCondition;
  startingPrice: number;
  createdAt: Date;
  updatedAt: Date;
  images?: InventoryImage[];
}

export interface ShowInventoryItem {
  id: string;
  showId: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  position: number;
  soldOut: boolean;
  currentBid: number | null;
  highestBidderId: string | null;
  bidCount: number;
  createdAt: Date;
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export type SessionStatus = 'STARTING' | 'LIVE' | 'ENDED';

export type IngestMode = 'NATIVE_WEBRTC' | 'RTMP_EXTERNAL';

export type BroadcastHealth = 'GOOD' | 'DEGRADED' | 'DOWN';

export interface ShowSession {
  id: string;
  showId: string;
  status: SessionStatus;
  providerSessionId: string | null;
  playbackUrl: string | null;
  viewerCount?: number;
  pinnedItemId: string | null;
  pinnedItem?: ShowInventoryItem & { inventoryItem: InventoryItem };
  raidedToShowId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Native broadcast fields (nullable; absent or null means external-encoder workflow)
  ingestMode: IngestMode | null;
  providerName: string | null;
  providerStreamId: string | null;
  providerInputId: string | null;
  providerPlaybackId: string | null;
  publishUrl: string | null;
  publishTokenExpiresAt: Date | null;
  broadcastStartedAt: Date | null;
  firstFrameAt: Date | null;
  broadcastLastHeartbeatAt: Date | null;
  broadcastHealth: BroadcastHealth | null;
  /** Always a non-negative integer; defaults to 0 (never null because the Prisma field carries @default(0)). */
  reconnectCount: number;
  broadcastErrorCode: string | null;
  broadcastEndedReason: string | null;
}

/**
 * Broadcast control-plane payload returned alongside the session when a
 * seller starts a live show.  Consumed by the seller UI to configure the
 * native publisher or external encoder.
 */
export interface BroadcastPayload {
  mode: IngestMode;
  provider: string;
  publishUrl?: string;
  publishToken?: string;
  expiresAt?: string;
  playbackUrl?: string;
  fallbackRtmp?: {
    ingestUrl: string;
    streamKey: string;
  };
}

/** Response shape returned by POST /v1/seller/shows/:showId/go-live. */
export interface GoLiveResponse {
  session: ShowSession;
  broadcast: BroadcastPayload;
}

/** Response shape returned by GET /v1/seller/sessions/:sessionId/broadcast-status. */
export interface BroadcastStatusResponse {
  sessionId: string;
  status: SessionStatus;
  ingestMode: IngestMode | null;
  broadcastHealth: BroadcastHealth | null;
  broadcastStartedAt: Date | null;
  firstFrameAt: Date | null;
  broadcastLastHeartbeatAt: Date | null;
  reconnectCount: number;
  broadcastErrorCode: string | null;
  broadcastEndedReason: string | null;
  publishUrl: string | null;
  playbackUrl: string | null;
}

export interface LiveBid {
  id: string;
  sessionId: string;
  queueItemId: string;
  bidderId: string;
  amount: number;
  createdAt: Date;
}

export interface SellerReview {
  id: string;
  orderId: string;
  sellerId: string;
  buyerId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  applicationId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ModerationStatus = 'APPROVED' | 'FLAGGED' | 'REMOVED';

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  user?: Pick<User, 'id' | 'name'>;
  content: string;
  moderationStatus: ModerationStatus;
  createdAt: Date;
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export type ClaimStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface Claim {
  id: string;
  sessionId: string;
  buyerId: string;
  queueItemId: string;
  queueItem?: ShowInventoryItem & { inventoryItem: InventoryItem };
  priceAtClaim: number;
  status: ClaimStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Orders & Payments ────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type FulfillmentStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface OrderLine {
  id: string;
  orderId: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  title: string;
  priceCents: number;
  quantity: number;
  createdAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  provider: string;
  amountCents: number;
  providerId: string | null;
  pixCode: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shipment {
  id: string;
  orderId: string;
  status: FulfillmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportTicket {
  id: string;
  orderId: string;
  userId: string;
  user?: Pick<User, 'id' | 'name' | 'email'>;
  subject: string;
  message: string;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  claimId: string;
  buyerId: string;
  buyer?: Pick<User, 'id' | 'name' | 'email'>;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  status: OrderStatus;
  totalCents: number;
  // Immutable fee snapshot captured at order creation
  feeConfigVersionId: string | null;
  feeConfigVersion: number | null;
  subtotalCents: number | null;
  commissionBps: number | null;
  commissionCents: number | null;
  processorFeeBps: number | null;
  processorFeeCents: number | null;
  shippingCents: number | null;
  buyerTotalCents: number | null;
  sellerPayoutCents: number | null;
  promotionCode: string | null;
  promotionDiscountBps: number | null;
  sellerOverrideApplied: boolean | null;
  invoiceResponsibility: InvoiceResponsibility | null;
  createdAt: Date;
  updatedAt: Date;
  lines?: OrderLine[];
  payments?: Payment[];
  shipment?: Shipment | null;
  supportTickets?: SupportTicket[];
  refunds?: OrderRefund[];
  fiscalDocuments?: FiscalDocument[];
}

export type RefundType = 'FULL' | 'PARTIAL';

export interface OrderRefund {
  id: string;
  orderId: string;
  issuedById: string;
  issuedBy?: Pick<User, 'id' | 'name' | 'email'>;
  refundType: RefundType;
  refundAmountCents: number;
  commissionReversalCents: number;
  processorFeeReversalCents: number;
  sellerClawbackCents: number;
  payoutOffsetCents: number;
  reason: string | null;
  createdAt: Date;
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

export type DisputeReason =
  | 'ITEM_NOT_RECEIVED'
  | 'ITEM_NOT_AS_DESCRIBED'
  | 'PAYMENT_ISSUE'
  | 'OTHER';

export interface Dispute {
  id: string;
  orderId: string;
  order?: Pick<Order, 'id' | 'totalCents' | 'status'>;
  raisedById: string;
  raisedBy?: Pick<User, 'id' | 'name' | 'email'>;
  reason: DisputeReason;
  description: string | null;
  status: DisputeStatus;
  resolvedById: string | null;
  resolvedBy?: Pick<User, 'id' | 'name' | 'email'> | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Moderation Cases ─────────────────────────────────────────────────────────

export type ModerationActionType = 'SELLER_STRIKE' | 'USER_SUSPENSION' | 'USER_UNSUSPENSION';

export interface ModerationCase {
  id: string;
  userId: string;
  user?: Pick<User, 'id' | 'name' | 'email'>;
  actionType: ModerationActionType;
  reason: string | null;
  actorId: string;
  actor?: Pick<User, 'id' | 'name' | 'email'>;
  createdAt: Date;
}

// ─── Fiscal Documents ─────────────────────────────────────────────────────────

export type InvoiceResponsibility = 'PLATFORM' | 'SELLER';

export type FiscalDocumentStatus = 'PENDING' | 'ISSUED' | 'CANCELLED' | 'ERROR';

export type FiscalDocumentType = 'NFS_E_SERVICE_FEE' | 'NF_E_GOODS';

export interface FiscalDocument {
  id: string;
  orderId: string | null;
  order?: Pick<Order, 'id' | 'totalCents' | 'status'> | null;
  invoiceResponsibility: InvoiceResponsibility;
  documentType: FiscalDocumentType;
  status: FiscalDocumentStatus;
  externalId: string | null;
  issuedAt: Date | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Tax Configuration ────────────────────────────────────────────────────────

export type GoodsSaleTaxModel =
  | 'SELLER_ISSUED'
  | 'EXEMPT'
  | 'MARKETPLACE_FACILITATED';

export interface TaxConfig {
  id: string;
  label: string | null;
  isActive: boolean;
  platformServiceTaxRateBps: number;
  goodsSaleTaxModel: GoodsSaleTaxModel;
  metadata: Record<string, unknown> | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Fee Configuration ────────────────────────────────────────────────────────

export type ShippingModel = 'INCLUDED' | 'PASS_THROUGH' | 'FIXED';

export type FeeType =
  | 'COMMISSION'
  | 'PROCESSOR_FEE'
  | 'SUBSCRIPTION'
  | 'PROMOTED_LISTING'
  | 'PREMIUM_SERVICE'
  | 'PAYOUT_ACCELERATION'
  | 'LOGISTICS_MARGIN'
  | 'REFUND_OFFSET';

export interface FeeLineItem {
  type: FeeType;
  amountCents: number;
  description: string | null;
}

export interface FeeConfig {
  id: string;
  version: number;
  label: string | null;
  commissionBps: number;
  processorFeeBps: number;
  shippingModel: ShippingModel;
  shippingFixedCents: number;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sellerOverrides?: FeeSellerOverride[];
  promotions?: FeePromotion[];
}

export interface FeeSellerOverride {
  id: string;
  feeConfigId: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  commissionBps: number;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeePromotion {
  id: string;
  feeConfigId: string | null;
  code: string;
  discountBps: number;
  sellerId: string | null;
  seller?: Pick<User, 'id' | 'name' | 'email'> | null;
  validFrom: Date;
  validTo: Date;
  maxUsages: number | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeBreakdown {
  configVersionId: string;
  configVersion: number;
  subtotalCents: number;
  commissionBps: number;
  commissionCents: number;
  processorFeeBps: number;
  processorFeeCents: number;
  shippingCents: number;
  totalBuyerCents: number;
  sellerPayoutCents: number;
  promotionCode: string | null;
  promotionDiscountBps: number;
  sellerOverrideApplied: boolean;
  /** All fee line items for this breakdown. Always includes COMMISSION and PROCESSOR_FEE;
   *  future monetization products (subscriptions, promoted listings, etc.) are appended here. */
  feeLineItems: FeeLineItem[];
}

/** Adjacent ledger entry for fee products that are not tied to a single order.
 *  Examples: subscription charges, promoted-listing fees, payout-acceleration fees.
 *  Order-adjacent entries (e.g. logistics margin) may optionally reference an order.
 *  Refund offset entries (REFUND_OFFSET) are always negative and link to an OrderRefund. */
export interface SettlementLedgerEntry {
  id: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  feeType: FeeType;
  amountCents: number;
  description: string | null;
  orderId: string | null;
  orderRefundId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Seller Payables & Payout Lifecycle ──────────────────────────────────────

export type PayableStatus = 'PENDING' | 'INCLUDED_IN_BATCH' | 'PAID' | 'OFFSET';

/** A seller payable is created for every order that transitions to PAID. */
export interface SellerPayable {
  id: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  orderId: string;
  amountCents: number;
  status: PayableStatus;
  source: 'ORDER';
  createdAt: Date;
  updatedAt: Date;
}

export type PayoutBatchStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

/** A payout batch groups one or more payout entries for a settlement period. */
export interface PayoutBatch {
  id: string;
  status: PayoutBatchStatus;
  periodStart: Date;
  periodEnd: Date;
  totalCents: number;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  entries?: PayoutEntry[];
  _count?: { entries: number };
}

/** A single line item in a payout batch, linked to a payable or ledger entry. */
export interface PayoutEntry {
  id: string;
  batchId: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  amountCents: number;
  description: string | null;
  payableId: string | null;
  payable?: Pick<SellerPayable, 'id' | 'orderId' | 'status'> | null;
  ledgerEntryId: string | null;
  ledgerEntry?: Pick<SettlementLedgerEntry, 'id' | 'feeType' | 'description' | 'orderId' | 'orderRefundId'> | null;
  createdAt: Date;
}

/** A pending settlement offset not yet absorbed into a payout batch. */
export interface PendingOffsetEntry {
  id: string;
  amountCents: number;
  description: string | null;
  orderId: string | null;
  orderRefundId: string | null;
  createdAt: Date;
}

/** Seller payout statement: estimated + settled amounts. */
export interface SellerPayoutStatement {
  /** Estimated payout from PAID orders that do not yet have a SellerPayable (legacy). */
  estimatedCents: number;
  /** Owed amounts in PENDING payables (not yet batched). */
  payableCents: number;
  /** Owed amounts already included in a payout batch (not yet disbursed). */
  inBatchCents: number;
  /** Total amounts from PAID payables and settled ledger entries. */
  settledCents: number;
  /** Sum of pending refund offset entries not yet absorbed into a batch (negative value). */
  pendingOffsetCents: number;
  totals: {
    pendingPayables: number;
    batchedPayables: number;
    paidPayables: number;
    estimatedOrders: number;
  };
  payables: SellerPayable[];
  settledLedgerEntries: Pick<PayoutEntry, 'id' | 'amountCents' | 'description' | 'createdAt'>[];
  /** Pending refund offset entries waiting to be absorbed into the next payout batch. */
  pendingOffsets: PendingOffsetEntry[];
}

// ─── Monetization Analytics ──────────────────────────────────────────────────

export interface MonetizationReport {
  periodStart: string;
  periodEnd: string;
  statuses: string[];

  orderCount: number;
  ordersWithSnapshotCount: number;

  gmvCents: number;
  totalBuyerSpendCents: number;

  grossCommissionCents: number;
  processorFeeTotalCents: number;
  shippingSubsidyCents: number;
  netRevenueCents: number;

  refundAmountCents: number;
  commissionReversedCents: number;
  processorFeeReversedCents: number;

  adjustedCommissionCents: number;
  adjustedNetRevenueCents: number;

  /** Effective take rate in basis points (adjustedCommission / GMV * 10 000). */
  effectiveTakeRateBps: number;
}

export interface PromotionImpact {
  code: string;
  usageCount: number;
  gmvCents: number;
  commissionWaivedCents: number;
}

export interface IncentiveReport {
  periodStart: string;
  periodEnd: string;

  overrideOrderCount: number;
  overrideGmvCents: number;
  overrideActualCommissionCents: number;
  overrideStandardCommissionCents: number;
  commissionWaivedByOverridesCents: number;

  promotionOrderCount: number;
  promotionGmvCents: number;
  commissionWaivedByPromotionsCents: number;
  topPromotions: PromotionImpact[];

  totalIncentiveWaivedCents: number;
}

/** Subset of the active FeeConfig returned to sellers for payout estimation. */
export interface SellerFeeInfo {
  id: string;
  version: number;
  label: string | null;
  commissionBps: number;
  processorFeeBps: number;
  shippingModel: ShippingModel;
  shippingFixedCents: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    perPage?: number;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

// ─── Mobile – Device Tokens & Notification Preferences ───────────────────────

export type DevicePlatform = 'IOS' | 'ANDROID';

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: DevicePlatform;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  showStartingSoon: boolean;
  sellerLive: boolean;
  claimExpiring: boolean;
  paymentConfirmed: boolean;
  orderShipped: boolean;
  createdAt: Date;
  updatedAt: Date;
}
