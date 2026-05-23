import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";

// Initialize Redis if credentials are provided (for idempotency)
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const reserveSchema = z.object({
  inventoryId: z.string().min(1),
  quantity: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    
    if (idempotencyKey && redis) {
      const cachedResponse = await redis.get(`idempotency:reserve:${idempotencyKey}`);
      if (cachedResponse) {
        return NextResponse.json(cachedResponse, { status: 200 });
      }
    }

    const body = await req.json();
    const result = reserveSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { inventoryId, quantity } = result.data;

    // Use a transaction and atomic raw update to ensure correctness under concurrency
    const reservation = await prisma.$transaction(async (tx) => {
      // Clean up expired reservations for this inventory lazily to free up stock immediately
      // This ensures we have the most up-to-date available stock before trying to reserve
      const expiredReservations = await tx.reservation.findMany({
        where: {
          inventoryId,
          status: "PENDING",
          expiresAt: { lt: new Date() }
        }
      });

      if (expiredReservations.length > 0) {
        const expiredIds = expiredReservations.map(r => r.id);
        const expiredQuantitySum = expiredReservations.reduce((sum, r) => sum + r.quantity, 0);

        await tx.reservation.updateMany({
          where: { id: { in: expiredIds } },
          data: { status: "RELEASED" }
        });

        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedStock" = "reservedStock" - ${expiredQuantitySum}
          WHERE "id" = ${inventoryId}
        `;
      }

      // Try to increment reserved stock atomically
      const updatedCount = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedStock" = "reservedStock" + ${quantity}
        WHERE "id" = ${inventoryId} AND ("totalStock" - "reservedStock") >= ${quantity}
      `;

      if (updatedCount === 0) {
        throw new Error("InsufficientStock");
      }

      // Create the reservation record holding the stock
      return await tx.reservation.create({
        data: {
          inventoryId,
          quantity,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
        },
      });
    });

    const responsePayload = { reservation };

    if (idempotencyKey && redis) {
      await redis.set(`idempotency:reserve:${idempotencyKey}`, responsePayload, { ex: 86400 }); // Expire in 24 hours
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "InsufficientStock") {
        return NextResponse.json({ error: "Not enough stock available" }, { status: 409 });
      }
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
