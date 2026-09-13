import { NextRequest, NextResponse } from "next/server";
import { InMemoryStore } from "../../../../../packages/shared/src/store";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
const memStore = InMemoryStore.getInstance();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inventoryId, quantity } = body;

    try {
      const res = await fetch(`${GATEWAY_URL}/api/inventory/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, { status: 200 });
      }
    } catch {
      // Fallback
    }

    const inv = memStore.inventories.find((i) => i.id === inventoryId);
    if (!inv) {
      return NextResponse.json({ error: "Inventory record not found" }, { status: 404 });
    }

    inv.totalStock += quantity || 5;

    return NextResponse.json({
      success: true,
      inventory: {
        ...inv,
        availableStock: inv.totalStock - inv.reservedStock,
      },
    });
  } catch (error) {
    console.error("Restock error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
