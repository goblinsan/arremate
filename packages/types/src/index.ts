// ─── User ────────────────────────────────────────────────────────────────────

export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
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
  createdAt: Date;
}

// ─── Live Sessions ────────────────────────────────────────────────────────────

export type SessionStatus = 'STARTING' | 'LIVE' | 'ENDED';

export interface ShowSession {
  id: string;
  showId: string;
  status: SessionStatus;
  providerSessionId: string | null;
  playbackUrl: string | null;
  pinnedItemId: string | null;
  pinnedItem?: ShowInventoryItem & { inventoryItem: InventoryItem };
  startedAt: Date | null;
  endedAt: Date | null;
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
  createdAt: Date;
  updatedAt: Date;
  lines?: OrderLine[];
  payments?: Payment[];
  shipment?: Shipment | null;
  supportTickets?: SupportTicket[];
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
