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
