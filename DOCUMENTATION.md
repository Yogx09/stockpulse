# 📘 Stockpulse: Technical Architecture & System Design Documentation

---

## 1. 📊 Executive Dashboard (Live System)

*The real-time Stockpulse Command Center featuring live reservation metrics, 10m TTL lock volume, cluster node latency, and high-density flash catalog availability.*

![Stockpulse Executive Dashboard](public/docs/1_dashboard_overview.png)

---

## 2. 🏗️ Microservices Architecture & Distributed System Design

### Architecture Topology
```mermaid
graph TD
    Client[Next.js 16 Executive Web App] -->|REST API Requests| Gateway[API Gateway :4000]
    Client -->|WebSocket Stream| RealtimeSvc[Realtime WebSocket Gateway :4003]

    subgraph "Microservices Mesh"
        Gateway -->|/api/products, /api/warehouses| CatalogSvc[Catalog Service :4001]
        Gateway -->|/api/reservations/*| InventorySvc[Inventory Service :4002]
    end

    subgraph "Event Backbone & Delayed TTL Queue (Redis)"
        InventorySvc -->|Publish domain events| RedisBus[(Redis Pub/Sub & Streams)]
        InventorySvc -->|Schedule 10m TTL| RedisZSet[(Redis ZSET Delayed Queue)]
        RedisZSet -->|Trigger Expiry| ExpiryWorker[Async Expiry Worker]
        ExpiryWorker -->|Atomic Release & Event| InventorySvc
        RedisBus -->|Broadcast events| RealtimeSvc
    end

    subgraph "Data Storage Layer"
        CatalogSvc --> PostgresCatalog[(PostgreSQL Catalog DB)]
        InventorySvc --> PostgresInventory[(PostgreSQL Atomic Row Locks)]
    end
```

### End-to-End Concurrency & Idempotency Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant GW as API Gateway (:4000)
    participant Inv as Inventory Service (:4002)
    participant DB as PostgreSQL (Row Lock)
    participant Redis as Redis (ZSET & PubSub)
    participant RT as Realtime Gateway (:4003)

    User->>GW: POST /api/reservations (inventoryId, quantity=1, IdempotencyKey)
    GW->>Inv: Forward Request
    Inv->>Redis: Check IdempotencyKey
    alt Duplicate Request
        Redis-->>Inv: Return Cached Response
        Inv-->>User: HTTP 200 (Idempotent replay)
    else New Request
        Inv->>DB: Atomic Update with WHERE available >= 1
        alt Stock Available
            DB-->>Inv: 1 Row Updated (Stock Locked)
            Inv->>Redis: ZADD reservations:expirations (now + 600s, resId)
            Inv->>Redis: PUBLISH event "RESERVATION_CREATED"
            Redis->>RT: Push Event
            RT->>User: WebSocket Event Update
            Inv-->>User: HTTP 201 Created (10m TTL Lock Granted)
        else Stock Depleted
            DB-->>Inv: 0 Rows Updated (Conflict)
            Inv-->>User: HTTP 409 Conflict (Zero-Oversell Guarantee)
        end
    end
```

---

## 3. 🌐 Website Subviews & User Interface

### Parallel Flash-Sale Concurrency Simulator
*Built-in stress testing suite firing 10 to 100 simultaneous atomic requests with zero-oversell validation.*
![Concurrency Simulator](public/docs/2_concurrency_simulator.png)

### Flash Catalog & Real-Time Stock Availability Table
*Instant CSV export, dynamic multi-currency converter, warehouse allocation, and 1-click lock actions.*
![Flash Catalog Table](public/docs/3_flash_catalog_table.png)

### Active Flash Reservations & Compact Lock Inspector
*Zero-scroll sliding window management with real-time TTL countdowns, inline quick actions, and instant order confirmation.*
![Lock Inspector](public/docs/4_reservations_inspector.png)

### Product Catalog Grid & Node Availability Meters
*Multi-warehouse distribution, instant 10-minute flash locks, stock replenishment, and multi-currency converter.*
![Product Catalog](public/docs/5_product_catalog_cards.png)

---

## 4. 🧩 Core Subsystem Technical Specifications

### 4.1. API Gateway (`services/api-gateway`)
- **Framework**: Fastify with high-throughput routing.
- **Port**: `4000`
- **Role**: Single entrypoint and reverse proxy.
- **Features**:
  - Aggregated `/health` endpoint checking all downstream microservices.
  - Path-based reverse routing: `/api/products` → Catalog (`:4001`), `/api/reservations/*` → Inventory (`:4002`).
  - CORS and rate-limiting headers.

### 4.2. Catalog Service (`services/catalog-service`)
- **Framework**: Fastify with PostgreSQL caching layer.
- **Port**: `4001`
- **Role**: Product metadata and regional warehouse stock aggregation.

### 4.3. Inventory Service (`services/inventory-service`)
- **Framework**: Fastify with Prisma ORM & raw atomic SQL locks.
- **Port**: `4002`
- **Role**: High-concurrency transaction processing.
- **Guarantees**:
  - **Atomic SQL Reservations**:
    ```sql
    UPDATE "Inventory" 
    SET "reservedStock" = "reservedStock" + $qty 
    WHERE "id" = $inventoryId AND ("totalStock" - "reservedStock") >= $qty;
    ```
  - **Idempotency Verification**: Validates `Idempotency-Key` headers in Redis within a 1-hour TTL window to safely prevent duplicate charges on retry.
  - **Redis Delayed Queue Scheduling**: Schedules a 10-minute expiry timestamp into the `reservations:expirations` ZSET.
  - **Pub/Sub Event Broadcasts**: Emits `RESERVATION_CREATED`, `RESERVATION_CONFIRMED`, `RESERVATION_RELEASED`, and `STOCK_UPDATED` events.

### 4.4. Expiry Worker Daemon (`services/expiry-worker`)
- **Framework**: Standalone Node.js daemon using Redis Sorted Sets (`ZSET`).
- **Interval**: 1,000ms polling loop.
- **Operation**:
  - Queries `ZRANGEBYSCORE reservations:expirations -inf <currentTimestamp> LIMIT 0 50`.
  - Automatically releases expired locks back to warehouse stock.
  - Broadcasts `RESERVATION_EXPIRED` to the event mesh.

### 4.5. Realtime WebSocket Gateway (`services/realtime-service`)
- **Framework**: `ws` WebSocket server connected to Redis Pub/Sub.
- **Port**: `4003`
- **Role**: Broadcasts domain events in real time to connected dashboards.

---

## 5. 🗄️ Database Schema & Data Models

```prisma
model Product {
  id          String      @id @default(cuid())
  name        String
  description String
  image       String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  inventories Inventory[]
}

model Warehouse {
  id          String      @id @default(cuid())
  name        String
  location    String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  inventories Inventory[]
}

model Inventory {
  id            String        @id @default(cuid())
  productId     String
  warehouseId   String
  totalStock    Int           @default(0)
  reservedStock Int           @default(0)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  product       Product       @relation(fields: [productId], references: [id])
  warehouse     Warehouse     @relation(fields: [warehouseId], references: [id])
  reservations  Reservation[]

  @@unique([productId, warehouseId])
}

model Reservation {
  id          String            @id @default(cuid())
  inventoryId String
  quantity    Int               @default(1)
  status      ReservationStatus @default(PENDING)
  expiresAt   DateTime
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  inventory   Inventory         @relation(fields: [inventoryId], references: [id])
}

enum ReservationStatus {
  PENDING
  CONFIRMED
  EXPIRED
  RELEASED
}
```

---

## 6. 🧪 Integration Testing Suite

Automated end-to-end tests in `scripts/test-microservices.ts`:

```bash
npm run test:services
```

### Verification Matrix:
1. `GET /health` (API Gateway Orchestration): Passed ✅
2. `GET /api/products` (Catalog aggregation): Passed ✅
3. `POST /api/reservations` (Atomic locking): Passed ✅
4. `POST /api/reservations` (Idempotency key deduplication): Passed ✅
5. `POST /api/reservations/:id/confirm` (Order confirmation): Passed ✅
6. `POST /api/reservations/:id/release` (Stock release): Passed ✅
7. `POST /api/inventory/simulate-concurrency` (Parallel burst race condition): Passed ✅
8. `POST /api/inventory/restock` (Replenishment broadcast): Passed ✅
9. `ws://localhost:4003/ws` (WebSocket live broadcast): Passed ✅

---

## 7. 🐳 Production Deployment (Docker Compose)

```bash
docker-compose up --build -d
```

Starts all containerized services:
- PostgreSQL 16
- Redis 7.2 Alpine
- API Gateway (`:4000`)
- Catalog Service (`:4001`)
- Inventory Service (`:4002`)
- Realtime Gateway (`:4003`)
- Expiry Worker (Background Daemon)
- Next.js Web Application (`:3000`)

---

*Stockpulse Architecture Documentation — Updated September 2026*
