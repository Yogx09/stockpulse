import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createLogger } from "../../../packages/shared/src/logger";
import { MicroserviceHealth } from "../../../packages/shared/src/types";

dotenv.config();

const app = express();
const port = process.env.GATEWAY_PORT || 4000;
const logger = createLogger("api-gateway");

const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || "http://localhost:4001";
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || "http://localhost:4002";
const REALTIME_SERVICE_URL = process.env.REALTIME_SERVICE_URL || "http://localhost:4003";

app.use(cors());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Root service registry info
app.get("/", (_req: Request, res: Response) => {
  return res.json({
    name: "Stockpulse API Gateway",
    version: "1.0.0",
    services: {
      catalog: { url: CATALOG_SERVICE_URL, routes: ["/api/products", "/api/warehouses"] },
      inventory: { url: INVENTORY_SERVICE_URL, routes: ["/api/reservations", "/api/reservations/:id/confirm", "/api/reservations/:id/release", "/api/reservations/:id/extend"] },
      realtime: { url: REALTIME_SERVICE_URL, websocket: `${REALTIME_SERVICE_URL}/ws` },
    },
    health: "/health",
  });
});

// Aggregated Health Check
app.get("/health", async (_req: Request, res: Response) => {
  const checkService = async (name: string, url: string): Promise<MicroserviceHealth> => {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return (await response.json()) as MicroserviceHealth;
      }
      return { service: name, status: "DOWN", timestamp: new Date().toISOString() };
    } catch {
      return { service: name, status: "DOWN", timestamp: new Date().toISOString() };
    }
  };

  const [catalogHealth, inventoryHealth, realtimeHealth] = await Promise.all([
    checkService("catalog-service", CATALOG_SERVICE_URL),
    checkService("inventory-service", INVENTORY_SERVICE_URL),
    checkService("realtime-service", REALTIME_SERVICE_URL),
  ]);

  const allUp =
    catalogHealth.status === "UP" &&
    inventoryHealth.status === "UP" &&
    realtimeHealth.status === "UP";

  return res.status(allUp ? 200 : 207).json({
    gateway: {
      service: "api-gateway",
      status: "UP",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    services: {
      catalog: catalogHealth,
      inventory: inventoryHealth,
      realtime: realtimeHealth,
    },
  });
});

// Route /api/products -> Catalog Service
app.use(
  createProxyMiddleware({
    pathFilter: "/api/products",
    target: CATALOG_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/products": "/products" },
  })
);

// Route /api/warehouses -> Catalog Service
app.use(
  createProxyMiddleware({
    pathFilter: "/api/warehouses",
    target: CATALOG_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/warehouses": "/warehouses" },
  })
);

// Route /api/reservations -> Inventory Service
app.use(
  createProxyMiddleware({
    pathFilter: "/api/reservations",
    target: INVENTORY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/reservations": "/reservations" },
  })
);

// Route /api/inventory -> Inventory Service (restock, simulate)
app.use(
  createProxyMiddleware({
    pathFilter: "/api/inventory",
    target: INVENTORY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/inventory": "/inventory" },
  })
);

// Metrics endpoint
app.get("/metrics", async (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  return res.json({
    gateway: {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryHeapUsedMB: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
      memoryRSSMB: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
    },
    targets: {
      catalog: CATALOG_SERVICE_URL,
      inventory: INVENTORY_SERVICE_URL,
      realtime: REALTIME_SERVICE_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

export function startGateway() {
  return app.listen(port, () => {
    logger.success(`API Gateway running on http://localhost:${port}`);
    logger.info(`Routing /api/products -> ${CATALOG_SERVICE_URL}`);
    logger.info(`Routing /api/warehouses -> ${CATALOG_SERVICE_URL}`);
    logger.info(`Routing /api/reservations -> ${INVENTORY_SERVICE_URL}`);
    logger.info(`Routing /api/inventory -> ${INVENTORY_SERVICE_URL}`);
  });
}

if (require.main === module) {
  startGateway();
}

export default app;
