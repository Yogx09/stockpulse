import { NextRequest, NextResponse } from "next/server";
import { InMemoryStore } from "../../../../packages/shared/src/store";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
const memStore = InMemoryStore.getInstance();

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/reservations`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch {
    // Graceful fallback
  }

  return NextResponse.json(memStore.reservations);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      headers["idempotency-key"] = idempotencyKey;
    }

    try {
      const res = await fetch(`${GATEWAY_URL}/api/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok || res.status === 409 || res.status === 400) {
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }
    } catch {
      // Gateway unreachable, fall back to in-memory store
    }

    const { inventoryId, quantity } = body;
    const reservation = memStore.reserveStock(inventoryId, quantity || 1);
    if (!reservation) {
      return NextResponse.json({ error: "Not enough stock available" }, { status: 409 });
    }

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    console.error("Reservation POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
