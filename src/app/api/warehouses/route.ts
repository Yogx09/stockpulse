import { NextResponse } from "next/server";
import { InMemoryStore } from "../../../../packages/shared/src/store";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:4000";
const memStore = InMemoryStore.getInstance();

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/warehouses`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch {
    // Graceful serverless fallback
  }

  return NextResponse.json(memStore.warehouses);
}
