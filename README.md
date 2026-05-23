# Allo Engineering Take-Home: Stockpulse

Stockpulse is an inventory and order-fulfillment platform that handles high-concurrency reservations.

## Features Implemented
- **Data Model**: Full Prisma schema mapping `Product`, `Warehouse`, `Inventory` (with `totalStock` and `reservedStock`), and `Reservation` models.
- **RESTful API**: Endpoints for listing products/warehouses and managing reservations.
- **Race-Condition-Free Reservations**: Achieved using Postgres atomic updates (`$executeRaw` with conditional logic `WHERE totalStock - reservedStock >= quantity`) wrapped inside a Prisma transaction.
- **Idempotency (Bonus)**: Implemented using Redis (`@upstash/redis`). Duplicate requests using the same `Idempotency-Key` return the cached response, safely ignoring repeated side effects.
- **Expiry Mechanism**:
  - **Lazy Cleanup**: Before creating a new reservation, the endpoint cleans up any expired reservations on that inventory to ensure the user gets accurate stock availability.
  - **Cron Job**: A Vercel Cron endpoint (`/api/cron/release-expired`) runs every minute to eagerly release expired reservations, freeing up `reservedStock`.
- **Frontend App**: Built with Next.js App Router and Tailwind CSS. Features dynamic countdown timers, toast messages, error handling (409 and 410), and real-time state updates.

## Standout UX & Platform Features
To provide a premium and highly functional user experience, I built out an enterprise-grade Single-Page Application (SPA):
- **Enterprise Logistics Dashboard**: The UI was completely redesigned into a dark-mode, pixel-perfect logistics command center inspired by high-end SaaS applications (Stripe/Linear).
- **Seamless SPA Routing**: A fully interactive sidebar routes users between the Dashboard, Products Catalog, Warehouses, and the centralized Reservations Hub without page reloads.
- **Dynamic Data Visualization**: Integrated beautifully designed Area Charts and Donut Charts built purely via SVG/Tailwind that dynamically calculate data based on live Postgres inventory levels.
- **Reservations Hub & Real-time Countdown**: A dedicated view tracking all historical reservations pulled directly from the DB. When a user creates a new reservation, the UI seamlessly slides into the Hub, displaying a live animated progress bar for the 10-minute expiry window.
- **Smart Status Badges**: Products feature contextual low-stock warnings (e.g. `IN STOCK`, `DEPLETED`), and reservations dynamically update their status badges (`PENDING`, `CONFIRMED`, `RELEASED`, `EXPIRED`).

## Getting Started Locally

### 1. Environment Variables
Create a `.env` file in the root directory:
```bash
# Your PostgreSQL connection strings (e.g. Supabase, Neon)
DATABASE_URL="..."
DIRECT_URL="..."

# Your Upstash Redis credentials
UPSTASH_REDIS_REST_URL="..."
UPSTASH_REDIS_REST_TOKEN="..."
```

### 2. Setup Database
Apply migrations and seed the database with initial products, warehouses, and inventories:
```bash
npx prisma generate
npx prisma db push
npm run seed
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

## Expiry Mechanism in Production
In production, reservation expiry is handled in two ways:
1. **Cron Job (Eager)**: A Vercel Cron job pings `/api/cron/release-expired` every minute. It finds all `PENDING` reservations past their `expiresAt` timestamp, marks them as `RELEASED`, and decrements the `reservedStock` in the `Inventory` table.
2. **Lazy Cleanup**: To prevent users from waiting up to 1 minute for the cron job to run when stock is highly contested, the `/api/reservations` endpoint performs a targeted lazy cleanup. Before attempting to reserve, it releases any expired reservations specifically for the requested inventory unit, instantly freeing up capacity.

## Concurrency Guarantee
When handling `/api/reservations`, we must prevent overselling the last unit of a SKU. We guarantee exactly-once reservation using an atomic database operation:
```sql
UPDATE "Inventory" 
SET "reservedStock" = "reservedStock" + 1 
WHERE "id" = {id} AND ("totalStock" - "reservedStock") >= 1;
```
Because PostgreSQL evaluates the `WHERE` clause at execution time under row-level locks, if two requests execute simultaneously for 1 available unit, the first request will succeed and increment the reserved stock. The second request will find that `totalStock - reservedStock >= 1` evaluates to `false`, the update will return `0` affected rows, and the API gracefully aborts with a 409 Conflict.

## Trade-offs and Future Improvements
- **Optimistic UI**: The frontend currently waits for the API response before updating the view. With more time, I would implement optimistic updates to make the "Reserve" interaction feel instantaneous.
- **Queueing / WebSockets**: For highly anticipated product drops, polling or WebSockets could keep the available stock numbers perfectly in sync across all active clients.
- **Database Indexing**: As the `Reservation` table grows, we would need to add indexes on `status` and `expiresAt` to optimize the cron job queries.
