import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
    });

    const formattedProducts = products.map((product) => ({
      ...product,

      inventories: product.inventories.map(
        (inventory) => ({
          ...inventory,

          availableStock:
            inventory.totalStock -
            inventory.reservedStock,
        })
      ),
    }));

    return NextResponse.json(
      formattedProducts
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Failed to fetch products",
      },
      {
        status: 500,
      }
    );
  }
}