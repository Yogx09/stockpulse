# Allo Take-Home: Stockpulse

**Live Demo URL:** [Insert your Vercel URL here after deployment]

### My approach & understanding the problem

The core challenge of this assignment isn't just showing a countdown timer on the frontend. It's preventing overselling in a highly concurrent environment. If two users hit checkout at the exact same millisecond for the last physical unit in a warehouse, the database must safely reject one of them.

My approach was to tackle this concurrency guarantee first at the database level, build a robust expiry mechanism, and then wrap it in an intuitive frontend that makes it easy to visualize the full reservation lifecycle.

### How I solved concurrency

To ensure race-condition-free reservations, I couldn't rely on a standard ORM findFirst followed by an update, because another network request could easily slide in between the read and the write. 

Instead, I used an atomic raw SQL update wrapped inside a Prisma transaction. I executed: 
```sql
UPDATE "Inventory" SET "reservedStock" = "reservedStock" + 1 WHERE "id" = {id} AND ("totalStock" - "reservedStock") >= 1;
```

Because PostgreSQL evaluates the WHERE clause at execution time under row-level locks, it natively guarantees that we can never reserve more stock than we actually have. If a concurrent request tries to update the exact same row when available stock is 0, the WHERE condition fails, it affects 0 rows, and the API cleanly aborts with a 409 Conflict.

### How the expiry mechanism works

Reservations are held for 10 minutes. In production, I handle these expirations using a two-pronged approach:

1. Lazy Cleanup: Whenever a user requests to make a new reservation for a specific inventory item, the API first checks for any expired pending reservations for that specific item. If it finds any, it immediately releases them and decrements the reservedStock before attempting to lock the new reservation. This guarantees a user isn't unfairly blocked from buying stock that expired just seconds ago.

2. Eager Cleanup: A Vercel Cron endpoint (/api/cron/release-expired) runs in the background to sweep the database and release any expired reservations globally. This keeps the global inventory metrics accurate even if no one is currently trying to buy that specific product.

(Bonus) Idempotency: I also added an idempotency layer using Redis to ensure that if a user's network drops and their client retries the request, we don't accidentally reserve 2 physical items.

### How to run locally

**Environment Setup**
You'll need a PostgreSQL database and optionally a Redis database. Create a .env in the root directory:
```env
DATABASE_URL="your-postgres-url"
DIRECT_URL="your-direct-postgres-url"
UPSTASH_REDIS_REST_URL="your-redis-url"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"
```

**Database Migrations & Seeding**
```bash
npx prisma generate
npx prisma db push
npm run seed
```

**Run the App**
```bash
npm run dev
```

### Trade-offs and what I'd do differently

- **Optimistic UI vs Source of Truth**: Right now, the frontend waits for the database to confirm the reservation before updating the UI state. It's safer, but with more time, I'd implement optimistic UI updates to make the "Reserve" button click feel instantaneous.

- **Polling vs WebSockets**: I'm currently polling the backend every 5 seconds to keep the global stock numbers and reservation statuses fresh. For a true high-scale product drop, I'd swap this for WebSockets to push inventory updates to clients immediately.

- **Why a Single-Page App?**: Instead of building two completely disconnected pages for /products and /checkout, I decided to build out a centralized SPA dashboard. I did this because it made it significantly easier to test the end-to-end flow and visually track how global inventory numbers change in real-time.
