import { NextRequest, NextResponse } from "next/server";
import { InMemoryStore } from "../../../../../../packages/shared/src/store";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
const memStore = InMemoryStore.getInstance();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    try {
      const res = await fetch(`${GATEWAY_URL}/api/reservations/${id}/confirm`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok || res.status === 404 || res.status === 400 || res.status === 410) {
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }
    } catch {
      // Fallback
    }

    const confirmed = memStore.confirmReservation(id);
    if (!confirmed) {
      return NextResponse.json({ error: "Reservation not found or no longer pending" }, { status: 400 });
    }

    return NextResponse.json({ reservation: confirmed }, { status: 200 });
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
