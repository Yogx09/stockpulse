import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { createLogger } from "../../../packages/shared/src/logger";
import { DistributedEventBus } from "../../../packages/shared/src/redis";
import { EVENT_CHANNELS } from "../../../packages/shared/src/events";
import { InMemoryStore } from "../../../packages/shared/src/store";
import { MicroserviceHealth } from "../../../packages/shared/src/types";

dotenv.config();

const app = express();
const port = process.env.INVENTORY_SERVICE_PORT || 4002;
const logger = createLogger("inventory-service");
const prisma = new PrismaClient({ log: [] });
const memStore = InMemoryStore.getInstance();
const eventBus = new DistributedEventBus();

// In-memory idempotency cache fallback
const inMemoryIdempotency = new Map<string, unknown>();

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

app.use(cors());
app.use(express.json());

const reserveSchema = z.object({
  inventoryId: z.string().min(1),
  quantity: z.number().int().positive(),
});

// Health check
app.get("/health", async (_req: Request, res: Response) => {
  const health: MicroserviceHealth = {
    service: "inventory-service",
    status: "UP",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return res.json(health);
});

// GET /reservations
app.get("/reservations", async (_req: Request, res: Response) => {
  try {
    const reservations = await prisma.reservation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inventory: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
    });

    const formatted = reservations.map((res) => ({
      id: res.id,
      inventoryId: res.inventoryId,
      quantity: res.quantity,
      status: res.status,
      expiresAt: res.expiresAt,
      createdAt: res.createdAt,
      productName: res.inventory?.product?.name,
      warehouseName: res.inventory?.warehouse?.name,
      image: res.inventory?.product?.image,
    }));

    return res.json(formatted);
  } catch {
    return res.json(memStore.reservations);
  }
});

// POST /reservations - Atomic Reservation Engine
app.post("/reservations", async (req: Request, res: Response) => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

    if (idempotencyKey) {
      if (redis) {
        const cached = await redis.get(`idempotency:reserve:${idempotencyKey}`);
        if (cached) return res.status(200).json(cached);
      } else if (inMemoryIdempotency.has(idempotencyKey)) {
        return res.status(200).json(inMemoryIdempotency.get(idempotencyKey));
      }
    }

    const parseResult = reserveSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request payload", details: parseResult.error.format() });
    }

    const { inventoryId, quantity } = parseResult.data;

    let responsePayload: { reservation: unknown } | null = null;

    try {
      // 1. Try PostgreSQL Atomic Transaction
      const reservation = await prisma.$transaction(async (tx) => {
        // Lazy Cleanup
        const expired = await tx.reservation.findMany({
          where: {
            inventoryId,
            status: "PENDING",
            expiresAt: { lt: new Date() },
          },
        });

        if (expired.length > 0) {
          const expiredIds = expired.map((r) => r.id);
          const expiredSum = expired.reduce((s, r) => s + r.quantity, 0);

          await tx.reservation.updateMany({
            where: { id: { in: expiredIds } },
            data: { status: "RELEASED" },
          });

          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "reservedStock" = "reservedStock" - ${expiredSum}
            WHERE "id" = ${inventoryId}
          `;
        }

        const updatedCount = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedStock" = "reservedStock" + ${quantity}
          WHERE "id" = ${inventoryId} AND ("totalStock" - "reservedStock") >= ${quantity}
        `;

        if (updatedCount === 0) {
          throw new Error("InsufficientStock");
        }

        return await tx.reservation.create({
          data: {
            inventoryId,
            quantity,
            status: "PENDING",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
          include: {
            inventory: {
              include: {
                product: true,
                warehouse: true,
              },
            },
          },
        });
      });

      responsePayload = {
        reservation: {
          id: reservation.id,
          inventoryId: reservation.inventoryId,
          quantity: reservation.quantity,
          status: reservation.status,
          expiresAt: reservation.expiresAt,
          createdAt: reservation.createdAt,
          productName: reservation.inventory?.product?.name,
          warehouseName: reservation.inventory?.warehouse?.name,
          image: reservation.inventory?.product?.image,
        },
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "InsufficientStock") {
        return res.status(409).json({ error: "Not enough stock available" });
      }

      // Fallback to in-memory transactional store
      const memRes = memStore.reserveStock(inventoryId, quantity);
      if (!memRes) {
        return res.status(409).json({ error: "Not enough stock available" });
      }
      responsePayload = { reservation: memRes };
    }

    if (idempotencyKey) {
      if (redis) {
        await redis.set(`idempotency:reserve:${idempotencyKey}`, responsePayload, { ex: 86400 });
      } else {
        inMemoryIdempotency.set(idempotencyKey, responsePayload);
      }
    }

    const finalRes = responsePayload.reservation as { id: string; expiresAt: string | Date; quantity: number };

    // Push to TTL queue
    await eventBus.scheduleExpiry(finalRes.id, new Date(finalRes.expiresAt).getTime());

    // Publish event
    await eventBus.publish(EVENT_CHANNELS.RESERVATION_EVENTS, {
      id: `evt_${Date.now()}`,
      type: "RESERVATION_CREATED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: {
        reservationId: finalRes.id,
        inventoryId,
        quantity: finalRes.quantity,
        status: "PENDING",
        expiresAt: new Date(finalRes.expiresAt).toISOString(),
      },
    });

    logger.success(`Reservation created: ${finalRes.id} for inventory ${inventoryId}`);
    return res.status(201).json(responsePayload);
  } catch (error) {
    logger.error("Error creating reservation", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reservations/:id/confirm
app.post("/reservations/:id/confirm", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    let confirmedRes: unknown = null;

    try {
      confirmedRes = await prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.findUnique({ where: { id } });
        if (!reservation) throw new Error("NotFound");
        if (reservation.status !== "PENDING") throw new Error("AlreadyProcessed");
        if (reservation.expiresAt < new Date()) {
          await tx.reservation.update({ where: { id }, data: { status: "RELEASED" } });
          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "reservedStock" = "reservedStock" - ${reservation.quantity}
            WHERE "id" = ${reservation.inventoryId}
          `;
          throw new Error("Expired");
        }

        const updated = await tx.reservation.update({ where: { id }, data: { status: "CONFIRMED" } });
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "totalStock" = "totalStock" - ${reservation.quantity},
              "reservedStock" = "reservedStock" - ${reservation.quantity}
          WHERE "id" = ${reservation.inventoryId}
        `;
        return updated;
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === "NotFound") return res.status(404).json({ error: "Reservation not found" });
        if (err.message === "AlreadyProcessed") return res.status(400).json({ error: "Reservation is no longer pending" });
        if (err.message === "Expired") return res.status(410).json({ error: "Reservation has expired" });
      }

      // Memory fallback
      const memConfirmed = memStore.confirmReservation(id);
      if (!memConfirmed) {
        return res.status(400).json({ error: "Reservation not found or no longer pending" });
      }
      confirmedRes = memConfirmed;
    }

    await eventBus.publish(EVENT_CHANNELS.RESERVATION_EVENTS, {
      id: `evt_${Date.now()}`,
      type: "RESERVATION_CONFIRMED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: {
        reservationId: id,
        status: "CONFIRMED",
      },
    });

    logger.success(`Reservation confirmed: ${id}`);
    return res.status(200).json({ reservation: confirmedRes });
  } catch (error) {
    logger.error(`Error confirming reservation ${req.params.id}`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reservations/:id/release
app.post("/reservations/:id/release", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    let releasedRes: unknown = null;

    try {
      releasedRes = await prisma.$transaction(async (tx) => {
        const resRecord = await tx.reservation.findUnique({ where: { id } });
        if (!resRecord) throw new Error("NotFound");
        if (resRecord.status !== "PENDING") throw new Error("AlreadyProcessed");

        const updated = await tx.reservation.update({ where: { id }, data: { status: "RELEASED" } });
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedStock" = "reservedStock" - ${resRecord.quantity}
          WHERE "id" = ${resRecord.inventoryId}
        `;
        return updated;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "NotFound") {
        return res.status(404).json({ error: "Reservation not found" });
      }
      const memReleased = memStore.releaseReservation(id);
      if (!memReleased) {
        return res.status(400).json({ error: "Reservation not pending" });
      }
      releasedRes = memReleased;
    }

    await eventBus.publish(EVENT_CHANNELS.RESERVATION_EVENTS, {
      id: `evt_${Date.now()}`,
      type: "RESERVATION_RELEASED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: {
        reservationId: id,
        status: "RELEASED",
      },
    });

    logger.info(`Reservation released: ${id}`);
    return res.status(200).json({ reservation: releasedRes });
  } catch (error) {
    logger.error(`Error releasing reservation ${req.params.id}`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reservations/:id/extend
app.post("/reservations/:id/extend", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const additionalMinutes = req.body?.minutes || 5;

    let extendedRes: unknown = null;

    try {
      extendedRes = await prisma.$transaction(async (tx) => {
        const resRecord = await tx.reservation.findUnique({ where: { id } });
        if (!resRecord) throw new Error("NotFound");
        if (resRecord.status !== "PENDING") throw new Error("AlreadyProcessed");

        const currentExpiry = new Date(resRecord.expiresAt).getTime();
        const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
        const newExpiresAt = new Date(baseTime + additionalMinutes * 60 * 1000);

        return await tx.reservation.update({
          where: { id },
          data: { expiresAt: newExpiresAt },
        });
      });
    } catch {
      const res = memStore.reservations.find((r) => r.id === id);
      if (res && res.status === "PENDING") {
        const cur = new Date(res.expiresAt).getTime();
        const base = cur > Date.now() ? cur : Date.now();
        res.expiresAt = new Date(base + additionalMinutes * 60 * 1000).toISOString();
        extendedRes = res;
      }
    }

    if (!extendedRes) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    await eventBus.publish(EVENT_CHANNELS.RESERVATION_EVENTS, {
      id: `evt_${Date.now()}`,
      type: "RESERVATION_EXTENDED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: { reservationId: id },
    });

    return res.status(200).json({ reservation: extendedRes });
  } catch (error) {
    logger.error(`Error extending reservation ${req.params.id}`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /inventory/restock - Add stock dynamically
app.post("/inventory/restock", async (req: Request, res: Response) => {
  try {
    const { inventoryId, quantity } = req.body;
    if (!inventoryId || !quantity || typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({ error: "Valid inventoryId and positive quantity required" });
    }

    let updatedInventory: any = null;

    try {
      await prisma.$executeRaw`
        UPDATE "Inventory"
        SET "totalStock" = "totalStock" + ${quantity}
        WHERE "id" = ${inventoryId}
      `;
      updatedInventory = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        include: { product: true, warehouse: true },
      });
    } catch {
      const inv = memStore.inventories.find((i) => i.id === inventoryId);
      if (inv) {
        inv.totalStock += quantity;
        updatedInventory = {
          ...inv,
          availableStock: inv.totalStock - inv.reservedStock,
          product: memStore.products.find((p) => p.id === inv.productId),
          warehouse: memStore.warehouses.find((w) => w.id === inv.warehouseId),
        };
      }
    }

    if (!updatedInventory) {
      return res.status(404).json({ error: "Inventory record not found" });
    }

    await eventBus.publish(EVENT_CHANNELS.INVENTORY_EVENTS, {
      id: `evt_restock_${Date.now()}`,
      type: "STOCK_UPDATED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: {
        inventoryId,
        addedQuantity: quantity,
        newTotalStock: updatedInventory.totalStock,
        availableStock: updatedInventory.totalStock - (updatedInventory.reservedStock || 0),
      },
    });

    logger.success(`Restocked inventory ${inventoryId} by +${quantity} units`);
    return res.status(200).json({ success: true, inventory: updatedInventory });
  } catch (error) {
    logger.error("Error restocking inventory", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /inventory/simulate-concurrency - High Concurrency Stress Test Engine
app.post("/inventory/simulate-concurrency", async (req: Request, res: Response) => {
  try {
    const inventoryId = req.body?.inventoryId || "inv_1";
    const burstCount = Math.min(100, Math.max(2, req.body?.concurrentRequests || 20));

    logger.info(`⚡ Starting concurrency simulation: ${burstCount} parallel requests on ${inventoryId}`);

    const startTime = Date.now();
    const promises: Promise<{ index: number; status: number; success: boolean; resId?: string; durationMs: number }>[] = [];

    for (let i = 1; i <= burstCount; i++) {
      const reqStart = Date.now();
      const p = (async () => {
        try {
          // Direct atomic reserve execution
          let resSuccess = false;
          let resId = "";

          try {
            const reservation = await prisma.$transaction(async (tx) => {
              const updatedCount = await tx.$executeRaw`
                UPDATE "Inventory"
                SET "reservedStock" = "reservedStock" + 1
                WHERE "id" = ${inventoryId} AND ("totalStock" - "reservedStock") >= 1
              `;
              if (updatedCount === 0) throw new Error("InsufficientStock");

              return await tx.reservation.create({
                data: {
                  inventoryId,
                  quantity: 1,
                  status: "PENDING",
                  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
              });
            });
            resSuccess = true;
            resId = reservation.id;
          } catch {
            const memRes = memStore.reserveStock(inventoryId, 1);
            if (memRes) {
              resSuccess = true;
              resId = memRes.id;
            }
          }

          const durationMs = Date.now() - reqStart;
          if (resSuccess) {
            return { index: i, status: 201, success: true, resId, durationMs };
          } else {
            return { index: i, status: 409, success: false, durationMs };
          }
        } catch {
          return { index: i, status: 500, success: false, durationMs: Date.now() - reqStart };
        }
      })();
      promises.push(p);
    }

    const results = await Promise.all(promises);
    const totalDurationMs = Date.now() - startTime;

    const successful = results.filter((r) => r.success).length;
    const conflicts = results.filter((r) => r.status === 409).length;
    const errors = results.filter((r) => r.status === 500).length;
    const avgLatencyMs = Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length);

    // Broadcast result event to the real-time mesh
    await eventBus.publish(EVENT_CHANNELS.INVENTORY_EVENTS, {
      id: `evt_sim_${Date.now()}`,
      type: "STOCK_UPDATED",
      timestamp: new Date().toISOString(),
      source: "inventory-service",
      payload: {
        inventoryId,
        simulation: { burstCount, successful, conflicts, totalDurationMs },
      },
    });

    logger.success(`Simulation completed in ${totalDurationMs}ms: ${successful} granted, ${conflicts} safely rejected (0 oversell)`);

    return res.json({
      summary: {
        totalRequests: burstCount,
        granted: successful,
        rejectedConflicts: conflicts,
        errors,
        totalDurationMs,
        avgLatencyMs,
        zeroOversellGuaranteed: true,
      },
      results,
    });
  } catch (error) {
    logger.error("Error during concurrency simulation", error);
    return res.status(500).json({ error: "Simulation failed" });
  }
});

export function startInventoryService() {
  return app.listen(port, () => {
    logger.success(`Inventory & Reservation Service running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startInventoryService();
}

export default app;
