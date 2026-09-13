import Redis from "ioredis";
import { EVENT_CHANNELS, DomainEvent } from "./events";

export class DistributedEventBus {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private inMemorySubscribers: Map<string, Set<(data: string) => void>> = new Map();
  private redisUrl: string | null;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || null;
    if (this.redisUrl) {
      try {
        this.pubClient = new Redis(this.redisUrl, { retryStrategy: () => 1000, lazyConnect: true });
        this.subClient = new Redis(this.redisUrl, { retryStrategy: () => 1000, lazyConnect: true });
        this.pubClient.connect().catch((err) => console.warn("[RedisBus] Pub connect warning:", err.message));
        this.subClient.connect().catch((err) => console.warn("[RedisBus] Sub connect warning:", err.message));
      } catch (err: unknown) {
        console.warn("[RedisBus] Running with in-process event fallback:", (err as Error).message);
      }
    }
  }

  async publish(channel: string, event: DomainEvent): Promise<void> {
    const payload = JSON.stringify(event);
    if (this.pubClient && this.pubClient.status === "ready") {
      await this.pubClient.publish(channel, payload);
      await this.pubClient.publish(EVENT_CHANNELS.ALL_EVENTS, payload);
    } else {
      // In-process broadcast fallback
      const handlers = this.inMemorySubscribers.get(channel);
      if (handlers) {
        handlers.forEach((fn) => fn(payload));
      }
      const allHandlers = this.inMemorySubscribers.get(EVENT_CHANNELS.ALL_EVENTS);
      if (allHandlers) {
        allHandlers.forEach((fn) => fn(payload));
      }
    }
  }

  async subscribe(channel: string, callback: (event: DomainEvent) => void): Promise<void> {
    const handler = (msg: string) => {
      try {
        const parsed = JSON.parse(msg) as DomainEvent;
        callback(parsed);
      } catch (e) {
        console.error("[RedisBus] Failed to parse event JSON:", e);
      }
    };

    if (this.subClient && this.subClient.status === "ready") {
      await this.subClient.subscribe(channel);
      this.subClient.on("message", (chn, message) => {
        if (chn === channel) handler(message);
      });
    } else {
      if (!this.inMemorySubscribers.has(channel)) {
        this.inMemorySubscribers.set(channel, new Set());
      }
      this.inMemorySubscribers.get(channel)!.add(handler);
    }
  }

  // TTL Queue Management (ZSET)
  async scheduleExpiry(reservationId: string, expiresAtTimestamp: number): Promise<void> {
    if (this.pubClient && this.pubClient.status === "ready") {
      await this.pubClient.zadd(EVENT_CHANNELS.TTL_QUEUE_KEY, expiresAtTimestamp, reservationId);
    }
  }

  async getExpiredReservations(maxTimestamp: number): Promise<string[]> {
    if (this.pubClient && this.pubClient.status === "ready") {
      // Fetch reservation IDs where score <= maxTimestamp
      const expired = await this.pubClient.zrangebyscore(EVENT_CHANNELS.TTL_QUEUE_KEY, 0, maxTimestamp);
      if (expired.length > 0) {
        await this.pubClient.zrem(EVENT_CHANNELS.TTL_QUEUE_KEY, ...expired);
      }
      return expired;
    }
    return [];
  }
}
