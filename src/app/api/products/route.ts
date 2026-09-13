import { NextResponse } from "next/server";
import { InMemoryStore } from "../../../../packages/shared/src/store";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
const memStore = InMemoryStore.getInstance();

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/products`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch {
    // Graceful serverless fallback for cloud/Vercel deployments
  }

  const formatted = memStore.products.map((p) => {
    const invs = memStore.inventories
      .filter((inv) => inv.productId === p.id)
      .map((inv) => ({
        ...inv,
        availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
        warehouse: memStore.warehouses.find((w) => w.id === inv.warehouseId) || {
          id: "wh_blr",
          name: "Main Hub",
          location: "Hub",
        },
      }));
    return { ...p, inventories: invs };
  });

  return NextResponse.json(formatted);
}