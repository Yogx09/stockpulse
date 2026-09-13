import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createLogger } from "../../../packages/shared/src/logger";
import { DistributedEventBus } from "../../../packages/shared/src/redis";
import { EVENT_CHANNELS } from "../../../packages/shared/src/events";
import { InMemoryStore } from "../../../packages/shared/src/store";

dotenv.config();

const logger = createLogger("expiry-worker");
const prisma = new PrismaClient({ log: [] });
const eventBus = new DistributedEventBus();
const memStore = InMemoryStore.getInstance();

let isRunning = false;

export async function processExpiredReservations() {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = Date.now();

    // 1. Check Redis ZSET queue
    const redisExpiredIds = await eventBus.getExpiredReservations(now);

    // 2. Try DB check
    let dbExpiredIds: string[] = [];
    try {
      const dbExpired = await prisma.reservation.findMany({
        where: {
          status: "PENDING",
          expiresAt: { lt: new Date() },
        },
        select: { id: true },
        take: 50,
      });
      dbExpiredIds = dbExpired.map((d) => d.id);
    } catch {
      // Fallback: check in-memory store
      const nowDate = new Date();
      dbExpiredIds = memStore.reservations
        .filter((r) => r.status === "PENDING" && new Date(r.expiresAt) < nowDate)
        .map((r) => r.id);
    }

    const allExpiredIds = Array.from(new Set([...redisExpiredIds, ...dbExpiredIds]));

    if (allExpiredIds.length === 0) {
      isRunning = false;
      return;
    }

    logger.info(`Found ${allExpiredIds.length} expired reservation(s) to release`);

    for (const resId of allExpiredIds) {
      try {
        await prisma.$transaction(async (tx) => {
          const reservation = await tx.reservation.findUnique({
            where: { id: resId },
          });

          if (reservation && reservation.status === "PENDING") {
            await tx.reservation.update({
              where: { id: reservation.id },
              data: { status: "RELEASED" },
            });

            await tx.$executeRaw`
              UPDATE "Inventory"
              SET "reservedStock" = "reservedStock" - ${reservation.quantity}
              WHERE "id" = ${reservation.inventoryId}
            `;
          }
        });
      } catch {
        // Fallback release in memory store
        memStore.releaseReservation(resId);
      }

      logger.info(`Released expired reservation ${resId}`);

      await eventBus.publish(EVENT_CHANNELS.RESERVATION_EVENTS, {
        id: `evt_exp_${Date.now()}`,
        type: "RESERVATION_EXPIRED",
        timestamp: new Date().toISOString(),
        source: "expiry-worker",
        payload: {
          reservationId: resId,
          status: "EXPIRED",
        },
      });
    }
  } catch (error) {
    logger.error("Error in expiry worker execution", error);
  } finally {
    isRunning = false;
  }
}

export function startExpiryWorker(pollIntervalMs = 3000) {
  logger.success(`Async Reservation Expiry Worker initialized (polling interval: ${pollIntervalMs}ms)`);
  processExpiredReservations();
  const interval = setInterval(processExpiredReservations, pollIntervalMs);
  return interval;
}

if (require.main === module) {
  startExpiryWorker();
}
