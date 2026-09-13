import express, { Request, Response } from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import dotenv from "dotenv";
import { createLogger } from "../../../packages/shared/src/logger";
import { DistributedEventBus } from "../../../packages/shared/src/redis";
import { EVENT_CHANNELS, DomainEvent } from "../../../packages/shared/src/events";
import { MicroserviceHealth } from "../../../packages/shared/src/types";

dotenv.config();

const app = express();
const port = process.env.REALTIME_SERVICE_PORT || 4003;
const logger = createLogger("realtime-service");
const eventBus = new DistributedEventBus();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const connectedClients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket, req) => {
  connectedClients.add(ws);
  logger.info(`Client connected from ${req.socket.remoteAddress}. Active clients: ${connectedClients.size}`);

  // Send initial welcome message
  ws.send(
    JSON.stringify({
      type: "SYSTEM_CONNECTED",
      message: "Connected to Stockpulse Realtime Gateway",
      timestamp: new Date().toISOString(),
      activeClients: connectedClients.size,
    })
  );

  ws.on("close", () => {
    connectedClients.delete(ws);
    logger.info(`Client disconnected. Active clients: ${connectedClients.size}`);
  });

  ws.on("error", (err) => {
    logger.error("WebSocket client error", err);
    connectedClients.delete(ws);
  });
});

// Broadcast helper
export function broadcastEvent(event: DomainEvent) {
  const message = JSON.stringify(event);
  let sentCount = 0;
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });
  if (sentCount > 0) {
    logger.info(`Broadcasted ${event.type} to ${sentCount} connected client(s)`);
  }
}

// Subscribe to distributed event bus
eventBus.subscribe(EVENT_CHANNELS.ALL_EVENTS, (event) => {
  broadcastEvent(event);
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  const health: MicroserviceHealth = {
    service: "realtime-service",
    status: "UP",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    details: {
      connectedClients: connectedClients.size,
    },
  };
  return res.json(health);
});

export function startRealtimeService() {
  return server.listen(port, () => {
    logger.success(`Realtime WebSocket Gateway running on ws://localhost:${port}/ws and http://localhost:${port}`);
  });
}

if (require.main === module) {
  startRealtimeService();
}

export default app;
