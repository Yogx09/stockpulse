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
To provide a premium and highly functional user experience, I built out several "extra" features:
- **Vibrant Category Storefront**: The UI was completely redesigned into a bright, colorful, modern e-commerce storefront.
- **Live Search & Category Filters**: Users can instantly filter products by Category (e.g. Smartphones, Gaming, Laptops) or use the live text search input to find exactly what they want.
- **Dynamic Quantity Selection**: Users can choose exactly how many units they want to reserve (1 to N) using custom selectors, bounded by the maximum available stock. 
- **"+5m Extend Time" Bonus**: Users in checkout can extend their reservation time by 5 minutes natively via a custom `/api/reservations/:id/extend` endpoint.
- **"Low Stock" Urgency Pulse**: A dynamic visual indicator highlighting items with 5 or fewer units available. It includes a pulsing animation to drive urgency.

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
