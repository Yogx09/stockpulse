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
      const cachedResponse = await redis.get(`idempotency:confirm:${idempotencyKey}`);
      if (cachedResponse) {
        return NextResponse.json(cachedResponse, { status: 200 });
      }
    }

    const confirmedReservation = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) {
        throw new Error("NotFound");
      }

      if (reservation.status !== "PENDING") {
        throw new Error("AlreadyProcessed");
      }

      if (reservation.expiresAt < new Date()) {
        // Expired! Release the stock back.
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });

        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedStock" = "reservedStock" - ${reservation.quantity}
          WHERE "id" = ${reservation.inventoryId}
        `;
        throw new Error("Expired");
      }

      // Confirm it: Reduce totalStock by quantity, reduce reservedStock by quantity
      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
      });

      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "totalStock" = "totalStock" - ${reservation.quantity},
            "reservedStock" = "reservedStock" - ${reservation.quantity}
        WHERE "id" = ${reservation.inventoryId}
      `;

      return updated;
    });

    const responsePayload = { reservation: confirmedReservation };

    if (idempotencyKey && redis) {
      await redis.set(`idempotency:confirm:${idempotencyKey}`, responsePayload, { ex: 86400 });
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
        return NextResponse.json({ error: "Reservation has expired" }, { status: 410 });
      }
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
