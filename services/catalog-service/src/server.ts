import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createLogger } from "../../../packages/shared/src/logger";
import { InMemoryStore } from "../../../packages/shared/src/store";
import { MicroserviceHealth } from "../../../packages/shared/src/types";

dotenv.config();

const app = express();
const port = process.env.CATALOG_SERVICE_PORT || 4001;
const logger = createLogger("catalog-service");
const prisma = new PrismaClient({ log: [] });
const memStore = InMemoryStore.getInstance();

app.use(cors());
app.use(express.json());

// Health Endpoint
app.get("/health", async (_req: Request, res: Response) => {
  const health: MicroserviceHealth = {
    service: "catalog-service",
    status: "UP",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return res.json(health);
});

// GET /products
app.get("/products", async (_req: Request, res: Response) => {
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

    const formatted = products.map((product) => ({
      ...product,
      inventories: product.inventories.map((inv) => ({
        ...inv,
        availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
      })),
    }));

    return res.json(formatted);
  } catch {
    // Resilient fallback to in-memory store
    const formatted = memStore.products.map((p) => {
      const invs = memStore.inventories
        .filter((inv) => inv.productId === p.id)
        .map((inv) => ({
          ...inv,
          availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
          warehouse: memStore.warehouses.find((w) => w.id === inv.warehouseId) || {
            name: "Main Hub",
            location: "Hub",
          },
        }));
      return {
        ...p,
        inventories: invs,
      };
    });

    return res.json(formatted);
  }
});

// GET /products/:id
app.get("/products/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
    });

    if (product) {
      return res.json({
        ...product,
        inventories: product.inventories.map((inv) => ({
          ...inv,
          availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
        })),
      });
    }
  } catch {
    // ignore
  }

  const p = memStore.products.find((prod) => prod.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found" });

  const invs = memStore.inventories
    .filter((inv) => inv.productId === p.id)
    .map((inv) => ({
      ...inv,
      availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
      warehouse: memStore.warehouses.find((w) => w.id === inv.warehouseId) || {
        name: "Main Hub",
        location: "Hub",
      },
    }));

  return res.json({ ...p, inventories: invs });
});

// GET /warehouses
app.get("/warehouses", async (_req: Request, res: Response) => {
  try {
    const warehouses = await prisma.warehouse.findMany();
    return res.json(warehouses);
  } catch {
    return res.json(memStore.warehouses);
  }
});

export function startCatalogService() {
  return app.listen(port, () => {
    logger.success(`Product Catalog Service running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startCatalogService();
}

export default app;
