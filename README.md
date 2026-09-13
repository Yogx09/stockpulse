# ⚡ Stockpulse: Distributed Flash-Sale & High-Concurrency Inventory Engine

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Pub%2FSub%20%2B%20ZSET-red?style=for-the-badge&logo=redis)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)

**Stockpulse** is an enterprise-grade, event-driven microservices platform engineered for extreme flash-sale traffic, distributed warehouse synchronization, and **100% Zero-Oversell** atomic reservation guarantees.

</div>

---

## 1. 📊 Executive Dashboard (Live System)

*The real-time Stockpulse Command Center featuring live reservation metrics, 10m TTL lock volume, cluster node latency, and high-density flash catalog availability.*

![Stockpulse Executive Dashboard](public/docs/1_dashboard_overview.png)

---

## 2. 🏗️ Microservices Architecture & Event Diagrams

### System Architecture Topology
```mermaid
graph TD
    Client[Next.js 16 Executive Web App] -->|REST API Calls| Gateway[API Gateway :4000]
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

### End-to-End Concurrency & Idempotency Sequence Flow
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

## 4. 🧩 Microservices Mesh Breakdown

| Service | Port / Protocol | Technology | Responsibilities |
| :--- | :--- | :--- | :--- |
| **API Gateway** | `http://localhost:4000` | Fastify / Reverse Proxy | Unified route orchestration, health checks, rate limiting, and CORS. |
| **Catalog Service** | `http://localhost:4001` | Fastify / PostgreSQL | Product metadata, regional warehouse stock aggregation, and caching. |
| **Inventory Service** | `http://localhost:4002` | Fastify / Prisma / Row Locks | Atomic reservations (`SELECT FOR UPDATE`), checkout confirmations, and releases. |
| **Expiry Worker** | Background Daemon | Node.js / Redis ZSET | Millisecond-precision TTL queue worker automatically releasing expired locks. |
| **Realtime Gateway**| `ws://localhost:4003/ws` | WebSockets / Redis PubSub | Live broadcast feed pushing reservations, orders, and timer ticks. |
| **Frontend Web App** | `http://localhost:3000` | Next.js 16 (App Router) | Luxury responsive dashboard with real-time UI, multi-currency, and export. |

---

## 5. 🔒 Zero-Oversell Concurrency Model

Stockpulse eliminates overselling under high concurrency through four layered defenses:

1. **Row-Level Atomic Locking**:
   ```sql
   UPDATE "Inventory" 
   SET "reservedStock" = "reservedStock" + $qty 
   WHERE "id" = $inventoryId AND ("totalStock" - "reservedStock") >= $qty;
   ```
2. **Distributed Redis Idempotency**: Every reservation request checks an `Idempotency-Key` header with TTL caching to avoid duplicate charges on network retries.
3. **Decoupled 10-Minute Expiry Engine**: Non-blocking Redis Sorted Set (`ZSET`) queue triggers automatic release without expensive table scans.
4. **Optimistic UI with Realtime Sync**: Immediate feedback on lock actions paired with WebSocket broadcasts to synchronize all active clients.

---

## 6. 🚀 Quick Start & Setup

### Prerequisites
- Node.js 18+ or 20+
- npm or pnpm
- (Optional) Docker & Docker Compose for containerized deployment

### 1. Installation
```bash
git clone https://github.com/Yogx09/stockpulse.git
cd stockpulse
npm install
```

### 2. Run the Full Mesh + Frontend
```bash
# Starts API Gateway, Catalog, Inventory, Expiry Worker, Realtime Gateway, and Next.js
npm run dev:all
```

The web dashboard will be available at **`http://localhost:3000`**.

### 3. Run Individual Microservices (Modular Scaling)
```bash
npm run dev:gateway      # Port 4000
npm run dev:catalog      # Port 4001
npm run dev:inventory    # Port 4002
npm run dev:realtime     # Port 4003
npm run dev:expiry       # Background Worker
```

### 4. Run Automated Integration & Concurrency Tests
```bash
npm run test:services
```

### 5. Production Docker Compose
```bash
docker-compose up --build
```

---

## 7. 📡 API Endpoints Reference

### Catalog Service (`:4001` or `:4000/api/products`)
- `GET /api/products` — Retrieve all products with aggregated warehouse inventory.
- `GET /api/warehouses` — List all distributed fulfillment nodes.

### Inventory Service (`:4002` or `:4000/api/reservations`)
- `GET /api/reservations` — List active, confirmed, and expired reservation locks.
- `POST /api/reservations` — Atomically reserve stock for 10 minutes (`headers: { "Idempotency-Key": "..." }`).
- `POST /api/reservations/:id/confirm` — Confirm lock and transition to finalized order.
- `POST /api/reservations/:id/release` — Cancel reservation and return stock to warehouse.
- `POST /api/inventory/restock` — Replenish inventory units for a warehouse node.
- `POST /api/inventory/simulate-concurrency` — Trigger simulated parallel bursts.

### Realtime Gateway (`:4003`)
- `ws://localhost:4003/ws` — Real-time event stream broadcasting JSON events:
  - `RESERVATION_CREATED`
  - `RESERVATION_CONFIRMED`
  - `RESERVATION_EXPIRED`
  - `RESERVATION_RELEASED`
  - `STOCK_UPDATED`

---

## 8. 🛠️ Tech Stack

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons.
- **Backend**: Node.js, TypeScript, Fastify, tsx.
- **Database & ORM**: PostgreSQL, Prisma ORM.
- **Caching & Messaging**: Redis Pub/Sub, Redis Sorted Sets (ZSET), WebSockets.
- **DevOps & Testing**: Docker, Docker Compose, Vitest / Custom Test Runners.

---

## 9. 📄 Detailed Documentation

For deep technical architecture, database schemas, and distributed locking algorithms, refer to [**DOCUMENTATION.md**](DOCUMENTATION.md).

---

## 📜 License

MIT License © 2026 Stockpulse Team.
