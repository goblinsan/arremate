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
