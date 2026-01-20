const dbModule = require('./db.js');
const { cacheEntries } = require('../shared/schema.js');
const { eq, lt, sql } = require('drizzle-orm');

const getDb = () => dbModule.db;

class CacheManager {
  constructor(config = {}) {
    this.maxMemoryMB = config.maxMemoryMB || 100;
    this.defaultTTL = config.defaultTTL || 3600000; // 1 hour in ms
    this.memoryCache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalMemoryBytes: 0
    };
    this.cleanupInterval = null;
  }

  async initialize() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute

    // Load frequently accessed items from database cache
    await this.loadHotCache();
    
    console.log('CacheManager initialized');
  }

  async loadHotCache() {
    try {
      // Load top 100 most accessed cache entries
      const hotEntries = await getDb()
        .select()
        .from(cacheEntries)
        .where(sql`${cacheEntries.expiresAt} > NOW()`)
        .orderBy(sql`${cacheEntries.hitCount} DESC`)
        .limit(100);

      for (const entry of hotEntries) {
        this.memoryCache.set(entry.key, {
          value: entry.value,
          expiresAt: entry.expiresAt?.getTime() || Date.now() + this.defaultTTL,
          sizeBytes: entry.sizeBytes || 0
        });
      }

      console.log(`Loaded ${hotEntries.length} hot cache entries`);
    } catch (err) {
      console.error('Failed to load hot cache:', err.message);
    }
  }

  async get(key) {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (memEntry.expiresAt > Date.now()) {
        this.stats.hits++;
        await this.incrementHitCount(key);
        return memEntry.value;
      } else {
        this.memoryCache.delete(key);
      }
    }

    // Check database cache
    try {
      const [entry] = await getDb()
        .select()
        .from(cacheEntries)
        .where(eq(cacheEntries.key, key));

      if (entry) {
        if (!entry.expiresAt || entry.expiresAt.getTime() > Date.now()) {
          this.stats.hits++;
          
          // Promote to memory cache
          this.memoryCache.set(key, {
            value: entry.value,
            expiresAt: entry.expiresAt?.getTime() || Date.now() + this.defaultTTL,
            sizeBytes: entry.sizeBytes || 0
          });
          
          await this.incrementHitCount(key);
          return entry.value;
        } else {
          // Expired, delete it
          await getDb().delete(cacheEntries).where(eq(cacheEntries.key, key));
        }
      }
    } catch (err) {
      console.error('Cache retrieval error:', err.message);
    }

    this.stats.misses++;
    return null;
  }

  async set(key, value, ttlMs = null) {
    const expiresAt = new Date(Date.now() + (ttlMs || this.defaultTTL));
    const valueStr = JSON.stringify(value);
    const sizeBytes = Buffer.byteLength(valueStr);

    // Store in memory cache
    this.memoryCache.set(key, {
      value,
      expiresAt: expiresAt.getTime(),
      sizeBytes
    });

    this.stats.totalMemoryBytes += sizeBytes;
    this.evictIfNeeded();

    // Store in database cache
    try {
      await getDb()
        .insert(cacheEntries)
        .values({
          key,
          value: value,
          expiresAt,
          hitCount: 0,
          lastAccessedAt: new Date(),
          sizeBytes
        })
        .onConflictDoUpdate({
          target: cacheEntries.key,
          set: {
            value: value,
            expiresAt,
            lastAccessedAt: new Date(),
            sizeBytes
          }
        });
    } catch (err) {
      console.error('Cache storage error:', err.message);
    }

    return true;
  }

  async incrementHitCount(key) {
    try {
      await getDb()
        .update(cacheEntries)
        .set({
          hitCount: sql`${cacheEntries.hitCount} + 1`,
          lastAccessedAt: new Date()
        })
        .where(eq(cacheEntries.key, key));
    } catch (err) {
      console.error('Failed to increment hit count:', err.message);
    }
  }

  async delete(key) {
    this.memoryCache.delete(key);
    
    try {
      await getDb().delete(cacheEntries).where(eq(cacheEntries.key, key));
    } catch (err) {
      console.error('Cache deletion error:', err.message);
    }
    
    return true;
  }

  async clear() {
    this.memoryCache.clear();
    this.stats.totalMemoryBytes = 0;
    
    try {
      await getDb().delete(cacheEntries);
    } catch (err) {
      console.error('Cache clear error:', err.message);
    }
  }

  evictIfNeeded() {
    const maxBytes = this.maxMemoryMB * 1024 * 1024;
    
    while (this.stats.totalMemoryBytes > maxBytes && this.memoryCache.size > 0) {
      // LRU eviction: remove oldest expired items first
      let oldestKey = null;
      let oldestTime = Infinity;
      
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt < oldestTime) {
          oldestTime = entry.expiresAt;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        const entry = this.memoryCache.get(oldestKey);
        this.stats.totalMemoryBytes -= entry.sizeBytes;
        this.memoryCache.delete(oldestKey);
        this.stats.evictions++;
      } else {
        break;
      }
    }
  }

  async cleanupExpired() {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.stats.totalMemoryBytes -= entry.sizeBytes;
        this.memoryCache.delete(key);
      }
    }

    // Clean database cache
    try {
      const result = await getDb()
        .delete(cacheEntries)
        .where(lt(cacheEntries.expiresAt, new Date()));
    } catch (err) {
      console.error('Cleanup error:', err.message);
    }
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;

    return {
      ...this.stats,
      hitRate: hitRate * 100,
      memoryUsageMB: this.stats.totalMemoryBytes / (1024 * 1024),
      memoryCacheSize: this.memoryCache.size
    };
  }

  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.cleanupExpired();
    console.log('CacheManager shut down');
  }
}

module.exports = CacheManager;
