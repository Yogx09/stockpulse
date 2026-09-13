import { Product, Warehouse, Inventory, Reservation } from "./types";

export interface SeedData {
  warehouses: Warehouse[];
  products: Product[];
  inventories: Inventory[];
  reservations: Reservation[];
}

export class InMemoryStore {
  private static instance: InMemoryStore;

  public warehouses: Warehouse[] = [
    { id: "wh_blr", name: "Bangalore Hub", location: "Bangalore" },
    { id: "wh_hyd", name: "Hyderabad Central", location: "Hyderabad" },
    { id: "wh_mum", name: "Mumbai Logistics", location: "Mumbai" },
    { id: "wh_del", name: "Delhi Distribution", location: "New Delhi" },
  ];

  public products: Product[] = [
    {
      id: "prod_iphone",
      name: "iPhone 15 Pro",
      description: "Apple flagship smartphone with titanium design.",
      image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569",
    },
    {
      id: "prod_ps5",
      name: "PlayStation 5 Pro",
      description: "Next-gen Sony gaming console with ray tracing.",
      image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db",
    },
    {
      id: "prod_macbook",
      name: "MacBook Pro M4",
      description: "Apple's most powerful laptop for creators.",
      image: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8",
    },
    {
      id: "prod_drone",
      name: "DJI Mini 4 Pro",
      description: "Compact drone with 4K HDR video and obstacle sensing.",
      image: "https://images.unsplash.com/photo-1579829366248-204fe8413f31",
    },
    {
      id: "prod_camera",
      name: "Sony Alpha a7 IV",
      description: "Mirrorless camera with 33MP full-frame sensor.",
      image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32",
    },
    {
      id: "prod_mouse",
      name: "Logitech MX Master 3S",
      description: "Premium wireless mouse with quiet clicks.",
      image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c3c9c",
    },
  ];

  public inventories: Inventory[] = [
    { id: "inv_1", productId: "prod_iphone", warehouseId: "wh_blr", totalStock: 15, reservedStock: 0 },
    { id: "inv_2", productId: "prod_iphone", warehouseId: "wh_mum", totalStock: 3, reservedStock: 0 },
    { id: "inv_3", productId: "prod_ps5", warehouseId: "wh_del", totalStock: 5, reservedStock: 0 },
    { id: "inv_4", productId: "prod_ps5", warehouseId: "wh_hyd", totalStock: 12, reservedStock: 0 },
    { id: "inv_5", productId: "prod_macbook", warehouseId: "wh_blr", totalStock: 8, reservedStock: 0 },
    { id: "inv_6", productId: "prod_drone", warehouseId: "wh_mum", totalStock: 2, reservedStock: 0 },
    { id: "inv_7", productId: "prod_drone", warehouseId: "wh_del", totalStock: 10, reservedStock: 0 },
    { id: "inv_8", productId: "prod_camera", warehouseId: "wh_hyd", totalStock: 4, reservedStock: 0 },
    { id: "inv_9", productId: "prod_mouse", warehouseId: "wh_blr", totalStock: 25, reservedStock: 0 },
    { id: "inv_10", productId: "prod_mouse", warehouseId: "wh_mum", totalStock: 30, reservedStock: 0 },
  ];

  public reservations: Reservation[] = [];

  public static getInstance(): InMemoryStore {
    if (!InMemoryStore.instance) {
      InMemoryStore.instance = new InMemoryStore();
    }
    return InMemoryStore.instance;
  }

  // Atomic lock & reserve
  public reserveStock(inventoryId: string, quantity: number): Reservation | null {
    // 1. Lazy cleanup
    const now = new Date();
    this.reservations.forEach((r) => {
      if (r.inventoryId === inventoryId && r.status === "PENDING" && new Date(r.expiresAt) < now) {
        r.status = "RELEASED";
        const inv = this.inventories.find((i) => i.id === inventoryId);
        if (inv) inv.reservedStock = Math.max(0, inv.reservedStock - r.quantity);
      }
    });

    const inventory = this.inventories.find((i) => i.id === inventoryId);
    if (!inventory) return null;

    const available = inventory.totalStock - inventory.reservedStock;
    if (available < quantity) {
      return null; // Insufficient stock
    }

    // Atomic increment
    inventory.reservedStock += quantity;

    const res: Reservation = {
      id: `res_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      inventoryId,
      quantity,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      productName: this.products.find((p) => p.id === inventory.productId)?.name,
      warehouseName: this.warehouses.find((w) => w.id === inventory.warehouseId)?.name,
      image: this.products.find((p) => p.id === inventory.productId)?.image || undefined,
    };

    this.reservations.unshift(res);
    return res;
  }

  public confirmReservation(id: string): Reservation | null {
    const res = this.reservations.find((r) => r.id === id);
    if (!res || res.status !== "PENDING") return null;

    if (new Date(res.expiresAt) < new Date()) {
      res.status = "RELEASED";
      const inv = this.inventories.find((i) => i.id === res.inventoryId);
      if (inv) inv.reservedStock = Math.max(0, inv.reservedStock - res.quantity);
      return null;
    }

    res.status = "CONFIRMED";
    const inv = this.inventories.find((i) => i.id === res.inventoryId);
    if (inv) {
      inv.totalStock = Math.max(0, inv.totalStock - res.quantity);
      inv.reservedStock = Math.max(0, inv.reservedStock - res.quantity);
    }
    return res;
  }

  public releaseReservation(id: string): Reservation | null {
    const res = this.reservations.find((r) => r.id === id);
    if (!res || res.status !== "PENDING") return null;

    res.status = "RELEASED";
    const inv = this.inventories.find((i) => i.id === res.inventoryId);
    if (inv) {
      inv.reservedStock = Math.max(0, inv.reservedStock - res.quantity);
    }
    return res;
  }
}
