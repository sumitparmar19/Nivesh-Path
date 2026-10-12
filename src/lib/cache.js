// Small TTL cache: uses Redis when REDIS_URL is set, otherwise an in-process Map. Every lookup is counted as a hit
// or miss per cache (the key prefix, e.g. "quote" or "metrics") for the Grafana dashboard. CACHE_DISABLED=1 turns
// caching off entirely (every lookup misses): the load test's "cache off" run uses it to measure what the cache saves.
const { config } = require("../config");
const { logger } = require("./logger");
const { recordCache } = require("./metrics");

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
    this.client.on("error", (err) => logger.error("Redis error: %s", err.message));
    this.ready = this.client.connect().catch((err) => {
      logger.error("Redis unavailable, caching disabled: %s", err.message);
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

/** No caching at all: every get misses, every set is dropped (CACHE_DISABLED=1). */
class NullCache {
  async get() {
    return null;
  }

  async set() {}
}

/** Wraps a cache so each get() records a hit or miss for its key prefix. */
function countedCache(inner) {
  return {
    inner,
    async get(key) {
      const value = await inner.get(key);
      recordCache(String(key).split(":")[0] || "other", value !== null && value !== undefined);
      return value;
    },
    set: (key, value, ttl) => inner.set(key, value, ttl),
  };
}

function createCache({ disabled = process.env.CACHE_DISABLED === "1" } = {}) {
  if (disabled) return countedCache(new NullCache());
  return countedCache(config.redisUrl ? new RedisCache(config.redisUrl) : new MemoryCache());
}

module.exports = { createCache, MemoryCache, NullCache, countedCache };
