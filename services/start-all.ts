import dotenv from "dotenv";
import { startCatalogService } from "./catalog-service/src/server";
import { startInventoryService } from "./inventory-service/src/server";
import { startExpiryWorker } from "./expiry-worker/src/worker";
import { startRealtimeService } from "./realtime-service/src/server";
import { startGateway } from "./api-gateway/src/server";
import { createLogger } from "../packages/shared/src/logger";

dotenv.config();

const logger = createLogger("system-boot");

async function bootstrap() {
  console.log("\n==================================================================");
  console.log("       🚀 BOOTING STOCKPULSE DISTRIBUTED MICROSERVICES MESH       ");
  console.log("==================================================================\n");

  try {
    // 1. Catalog Service
    startCatalogService();

    // 2. Inventory & Reservation Service
    startInventoryService();

    // 3. Realtime WebSocket Gateway
    startRealtimeService();

    // 4. Async Expiry Worker
    startExpiryWorker(3000);

    // 5. API Gateway
    startGateway();

    console.log("\n------------------------------------------------------------------");
    logger.success("All 5 microservices & background workers started successfully!");
    console.log("  • API Gateway:             http://localhost:4000");
    console.log("  • Product Catalog Service: http://localhost:4001");
    console.log("  • Inventory Service:       http://localhost:4002");
    console.log("  • Realtime Gateway:        ws://localhost:4003/ws");
    console.log("  • Expiry Worker:           Running (Active TTL Queue Monitor)");
    console.log("------------------------------------------------------------------\n");
  } catch (error) {
    logger.error("Failed to bootstrap microservices", error);
    process.exit(1);
  }
}

bootstrap();
