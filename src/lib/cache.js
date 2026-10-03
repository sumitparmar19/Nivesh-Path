// Small TTL cache: uses Redis when REDIS_URL is set, otherwise an in-process Map.
const { config } = require("../config");

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key, value, ttlSeconds) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

class RedisCache {
  constructor(url) {
    const { createClient } = require("redis");
    this.client = createClient({ url });
    this.client.on("error", (err) => console.error("Redis error:", err.message));
    this.ready = this.client.connect().catch((err) => {
      console.error("Redis unavailable, caching disabled:", err.message);
      this.client = null;
    });
  }

  async get(key) {
    await this.ready;
    if (!this.client) return null;
    const raw = await this.client.get(key).catch(() => null);
    return raw ? JSON.parse(raw) : null;
  }

  async set(key, value, ttlSeconds) {
    await this.ready;
    if (!this.client) return;
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {});
  }
}

function createCache() {
  return config.redisUrl ? new RedisCache(config.redisUrl) : new MemoryCache();
}

module.exports = { createCache, MemoryCache };
