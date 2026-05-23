import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idempotencyKey = req.headers.get("Idempotency-Key");

    if (idempotencyKey && redis) {
      const cachedResponse = await redis.get(`idempotency:extend:${idempotencyKey}`);
      if (cachedResponse) {
        return NextResponse.json(cachedResponse, { status: 200 });
      }
    }

    const extendedReservation = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) {
        throw new Error("NotFound");
      }

      if (reservation.status !== "PENDING") {
        throw new Error("AlreadyProcessed");
      }

      if (reservation.expiresAt < new Date()) {
        // Expired, can't extend
        throw new Error("Expired");
      }

      // Extend by 5 minutes (300000 ms)
      const updated = await tx.reservation.update({
        where: { id },
        data: { expiresAt: new Date(reservation.expiresAt.getTime() + 5 * 60 * 1000) },
      });

      return updated;
    });

    const responsePayload = { reservation: extendedReservation };

    if (idempotencyKey && redis) {
      await redis.set(`idempotency:extend:${idempotencyKey}`, responsePayload, { ex: 86400 });
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NotFound") {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
      if (error.message === "AlreadyProcessed") {
        return NextResponse.json({ error: "Reservation is no longer pending" }, { status: 400 });
      }
      if (error.message === "Expired") {
        return NextResponse.json({ error: "Cannot extend an expired reservation" }, { status: 410 });
      }
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
