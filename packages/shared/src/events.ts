export const EVENT_CHANNELS = {
  INVENTORY_EVENTS: "stockpulse:events:inventory",
  RESERVATION_EVENTS: "stockpulse:events:reservation",
  ALL_EVENTS: "stockpulse:events",
  TTL_QUEUE_KEY: "stockpulse:reservations:ttl",
} as const;

export type EventType =
  | "RESERVATION_CREATED"
  | "RESERVATION_CONFIRMED"
  | "RESERVATION_RELEASED"
  | "RESERVATION_EXTENDED"
  | "RESERVATION_EXPIRED"
  | "STOCK_UPDATED";

export interface DomainEvent<T = unknown> {
  id: string;
  type: EventType;
  timestamp: string;
  source: "catalog-service" | "inventory-service" | "expiry-worker" | "api-gateway";
  payload: T;
}

export interface ReservationEventPayload {
  reservationId: string;
  inventoryId: string;
  productId?: string;
  warehouseId?: string;
  quantity: number;
  status: string;
  expiresAt?: string;
  remainingAvailableStock?: number;
}

export interface StockUpdatedPayload {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
}
