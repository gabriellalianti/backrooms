export type Role = "viewer" | "staff" | "admin";
export type CollectionState = "pending" | "collected";
export type MatchStatus = "exact" | "parenthetical" | "manual" | "ambiguous" | "unmatched";

export interface User {
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  location: string | null;
  pageUrl: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  metadataState: "current" | "last_known" | "unavailable";
  metadataRefreshedAt: string | null;
}

export interface OrderItem {
  id: string;
  rawName: string;
  quantity: number;
  lineTotalCents: number;
  matchStatus: MatchStatus;
  product: Product | null;
}

export interface OrderEvent {
  id: string;
  action: CollectionState;
  actorEmail: string;
  createdAt: string;
  note: string | null;
}

export interface Order {
  id: string;
  dateAdded: string;
  sourceStatus: string;
  comments: string | null;
  collectionState: CollectionState;
  collectedBy: string | null;
  collectedAt: string | null;
  version: number;
  items: OrderItem[];
  events: OrderEvent[];
}

export interface ParsedOrderItem {
  rawName: string;
  quantity: number;
  lineTotalCents: number;
}

export interface ParsedOrder {
  id: string;
  dateAdded: string;
  sourceStatus: string;
  comments: string | null;
  items: ParsedOrderItem[];
}

