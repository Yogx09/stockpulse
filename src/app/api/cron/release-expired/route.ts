import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
    });

    if (expiredReservations.length === 0) {
      return NextResponse.json({ message: "No expired reservations to clean up." }, { status: 200 });
    }

    let releasedCount = 0;

    for (const reservation of expiredReservations) {
      await prisma.$transaction(async (tx) => {
        // Re-check just in case
        const res = await tx.reservation.findUnique({ where: { id: reservation.id } });
        if (res && res.status === "PENDING") {
          await tx.reservation.update({
            where: { id: res.id },
            data: { status: "RELEASED" },
          });

          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "reservedStock" = "reservedStock" - ${res.quantity}
            WHERE "id" = ${res.inventoryId}
          `;
          releasedCount++;
        }
      });
    }

    return NextResponse.json({ message: `Successfully released ${releasedCount} expired reservations.` }, { status: 200 });
  } catch (error) {
    console.error("Cron failed:", error);
    return NextResponse.json({ error: "Failed to release expired reservations." }, { status: 500 });
  }
}
