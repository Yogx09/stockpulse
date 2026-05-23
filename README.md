# Allo Take-Home: Stockpulse

**Live Demo URL:** [Insert your Vercel URL here after deployment]

## My Approach & Understanding the Problem
The core challenge of this assignment isn't just showing a countdown timer on the frontend—it's preventing overselling in a highly concurrent environment. If two users hit checkout at the exact same millisecond for the last physical unit in a warehouse, the database must safely reject one of them.

My approach was to tackle this concurrency guarantee first at the database level, build a robust expiry mechanism, and then wrap it in an intuitive frontend that makes it easy to visualize the full reservation lifecycle.

## How I Solved Concurrency
To ensure race-condition-free reservations, I couldn't rely on a standard ORM `findFirst` followed by an `update`, because another network request could easily slide in between the read and the write. 

Instead, I used an atomic raw SQL update wrapped inside a Prisma transaction:
```sql
UPDATE "Inventory" 
SET "reservedStock" = "reservedStock" + 1 
WHERE "id" = {id} AND ("totalStock" - "reservedStock") >= 1;
```
Because PostgreSQL evaluates the `WHERE` clause at execution time under row-level locks, it natively guarantees that we can never reserve more stock than we actually have. If a concurrent request tries to update the exact same row when `availableStock` is 0, the `WHERE` condition fails, it affects 0 rows, and the API cleanly aborts with a 409 Conflict.

## How the Expiry Mechanism Works
Reservations are held for 10 minutes. In production, I handle these expirations using a two-pronged approach:

1. **Lazy Cleanup (Just-In-Time)**: Whenever a user requests to make a new reservation for a specific inventory item, the API first checks for any expired `PENDING` reservations for *that specific item*. If it finds any, it immediately releases them and decrements the `reservedStock` before attempting to lock the new reservation. This guarantees a user isn't unfairly blocked from buying stock that expired just seconds ago.
2. **Eager Cleanup (Cron Job)**: A Vercel Cron endpoint (`/api/cron/release-expired`) runs in the background to sweep the database and release any expired reservations globally. This keeps the global inventory metrics accurate even if no one is currently trying to buy that specific product.

*(Bonus) Idempotency*: I also added an idempotency layer using Redis (`Idempotency-Key` headers) to ensure that if a user's network drops and their client retries the reservation request, we don't accidentally reserve 2 physical items.

## How to Run Locally

### 1. Environment Setup
You'll need a PostgreSQL database (I used Supabase/Neon) and optionally a Redis database (I used Upstash). Create a `.env` in the root directory:
```bash
# PostgreSQL connection strings
DATABASE_URL="your-postgres-url"
DIRECT_URL="your-direct-postgres-url"

# Upstash Redis (Optional - for idempotency)
UPSTASH_REDIS_REST_URL="your-redis-url"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"
```

### 2. Database Migrations & Seeding
```bash
npx prisma generate
npx prisma db push
npm run seed
```

### 3. Run the App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## Trade-offs and What I'd Do Differently
- **Optimistic UI vs Source of Truth**: Right now, the frontend waits for the database to confirm the reservation before updating the UI state. It's safer, but with more time, I'd implement optimistic UI updates to make the "Reserve" button click feel instantaneous.
- **Polling vs WebSockets**: I'm currently polling the backend every 5 seconds to keep the global stock numbers and reservation statuses fresh. For a true high-scale product drop, I'd swap this for WebSockets (or Server-Sent Events) to push inventory updates to clients immediately and reduce database read-load.
- **Why a Single-Page App?**: Instead of building two completely disconnected pages for `/products` and `/checkout`, I decided to build out a centralized SPA dashboard. I did this because it made it significantly easier to test the end-to-end flow and visually track how global inventory numbers change in real-time when a reservation is created, confirmed, or released.
