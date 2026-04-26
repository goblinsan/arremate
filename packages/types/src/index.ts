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

export interface Show {
  id: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  title: string;
  description: string | null;
  status: ShowStatus;
  scheduledAt: Date | null;
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

export interface LiveBid {
  id: string;
  sessionId: string;
  queueItemId: string;
  bidderId: string;
  amount: number;
  createdAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
  lines?: OrderLine[];
  payments?: Payment[];
  shipment?: Shipment | null;
  supportTickets?: SupportTicket[];
  refunds?: OrderRefund[];
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

// ─── Fee Configuration ────────────────────────────────────────────────────────

export type ShippingModel = 'INCLUDED' | 'PASS_THROUGH' | 'FIXED';

export type FeeType =
  | 'COMMISSION'
  | 'PROCESSOR_FEE'
  | 'SUBSCRIPTION'
  | 'PROMOTED_LISTING'
  | 'PREMIUM_SERVICE'
  | 'PAYOUT_ACCELERATION'
  | 'LOGISTICS_MARGIN';

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
 *  Order-adjacent entries (e.g. logistics margin) may optionally reference an order. */
export interface SettlementLedgerEntry {
  id: string;
  sellerId: string;
  seller?: Pick<User, 'id' | 'name' | 'email'>;
  feeType: FeeType;
  amountCents: number;
  description: string | null;
  orderId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
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
