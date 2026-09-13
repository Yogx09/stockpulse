export interface Product {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  inventories?: InventoryWithWarehouse[];
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock?: number;
}

export interface InventoryWithWarehouse extends Inventory {
  warehouse: Warehouse;
}

export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";

export interface Reservation {
  id: string;
  inventoryId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string | Date;
  createdAt: string | Date;
  productName?: string;
  warehouseName?: string;
  image?: string;
}

export interface ReservationCreateDTO {
  inventoryId: string;
  quantity: number;
  idempotencyKey?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface MicroserviceHealth {
  service: string;
  status: "UP" | "DOWN" | "DEGRADED";
  timestamp: string;
  version?: string;
  uptimeSeconds?: number;
  details?: Record<string, unknown>;
}
