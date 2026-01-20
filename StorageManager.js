const dbModule = require('./db.js');
const {
  profiles,
  snapshots,
  oauthCredentials,
  storageMetrics,
  storageBackups,
  storageQuotas
} = require('../shared/schema.js');

const getDb = () => dbModule.db;
const { eq, sql, desc, and } = require('drizzle-orm');
const ObjectStorage = require('./ObjectStorage.js');
const CacheManager = require('./CacheManager.js');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

class StorageManager {
  constructor(config = {}) {
    this.objectStorage = new ObjectStorage(config.objectStorage || {});
    this.cacheManager = new CacheManager(config.cache || {});
    this.encryptionKey = null;
    this.keyFilePath = path.join(process.env.HOME, 'cloud-browser-data', '.encryption_key');
    
    // Performance tracking
    this.performanceMetrics = {
      operations: 0,
      totalTime: 0,
      avgTime: 0
    };

    // Auto-tiering configuration
    this.tieringRules = {
      hot: { maxAge: 7 * 24 * 60 * 60 * 1000, maxSize: 500 * 1024 * 1024 }, // 7 days, 500MB
      warm: { maxAge: 30 * 24 * 60 * 60 * 1000, maxSize: 2 * 1024 * 1024 * 1024 }, // 30 days, 2GB
      cold: { maxAge: Infinity, maxSize: Infinity } // No limits
    };
  }

  async initialize() {
    await Promise.all([
      this.objectStorage.initialize(),
      this.cacheManager.initialize(),
      this.loadOrGenerateEncryptionKey()
    ]);

    // Initialize default quotas
    await this.initializeQuotas();

    // Start background tasks
    this.startBackgroundTasks();

    console.log('✅ Advanced StorageManager initialized');
    console.log('   - Multi-tier storage (hot/warm/cold)');
    console.log('   - Intelligent caching');
    console.log('   - Data compression & deduplication');
    console.log('   - Automatic backups');
    console.log('   - Storage analytics');
  }

  async loadOrGenerateEncryptionKey() {
    if (process.env.PROFILE_ENCRYPTION_KEY) {
      this.encryptionKey = process.env.PROFILE_ENCRYPTION_KEY;
      return;
    }

    try {
      this.encryptionKey = await fs.readFile(this.keyFilePath, 'utf8');
      this.encryptionKey = this.encryptionKey.trim();
    } catch (err) {
      this.encryptionKey = crypto.randomBytes(32).toString('hex');
      await fs.mkdir(path.dirname(this.keyFilePath), { recursive: true });
      await fs.writeFile(this.keyFilePath, this.encryptionKey, { mode: 0o600 });
    }
  }

  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey.substring(0, 64), 'hex');
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = parts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async initializeQuotas() {
    const defaultQuotas = [
      { id: 'quota_total_size', quotaType: 'total_size', limitValue: 10 * 1024 * 1024 * 1024 }, // 10GB
      { id: 'quota_profile_count', quotaType: 'profile_count', limitValue: 100 },
      { id: 'quota_snapshot_count', quotaType: 'snapshot_count', limitValue: 1000 }
    ];

    for (const quota of defaultQuotas) {
      try {
        await getDb().insert(storageQuotas).values(quota).onConflictDoNothing();
      } catch (err) {
        console.log('Quota already exists:', quota.quotaType);
      }
    }
  }

  async createProfile(name, description = null) {
    const startTime = Date.now();

    // Check quota
    await this.checkQuota('profile_count');

    const profileId = uuidv4();
    const [profile] = await getDb().insert(profiles).values({
      id: profileId,
      name,
      description,
      storageTier: 'hot',
      accessCount: 0
    }).returning();

    await this.updateQuotaUsage('profile_count', 1);
    await this.cacheManager.set(`profile:${profileId}`, profile);

    this.trackPerformance(Date.now() - startTime);
    return profile;
  }

  async listProfiles() {
    const cacheKey = 'profiles:list';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const profileList = await getDb().select().from(profiles).orderBy(desc(profiles.createdAt));
    
    await this.cacheManager.set(cacheKey, profileList, 300000); // 5 min cache
    return profileList;
  }

  async getProfile(profileId) {
    const cacheKey = `profile:${profileId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const [profile] = await getDb().select().from(profiles).where(eq(profiles.id, profileId));
    
    if (profile) {
      // Update access tracking
      await getDb().update(profiles)
        .set({
          accessCount: sql`${profiles.accessCount} + 1`,
          lastAccessedAt: new Date()
        })
        .where(eq(profiles.id, profileId));

      await this.cacheManager.set(cacheKey, profile);
    }

    return profile;
  }

  async deleteProfile(profileId) {
    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error('Profile not found');

    // Delete all snapshots
    const profileSnapshots = await getDb().select().from(snapshots).where(eq(snapshots.profileId, profileId));
    
    for (const snapshot of profileSnapshots) {
      await this.deleteSnapshot(snapshot.id);
    }

    // Delete profile
    await getDb().delete(profiles).where(eq(profiles.id, profileId));
    await this.cacheManager.delete(`profile:${profileId}`);
    await this.cacheManager.delete('profiles:list');
    await this.updateQuotaUsage('profile_count', -1);

    return true;
  }

  async createSnapshot(profileId, snapshotName, sourceFilePath) {
    const startTime = Date.now();

    // Check quota
    await this.checkQuota('snapshot_count');

    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error('Profile not found');

    const snapshotId = uuidv4();
    const objectKey = `snapshots/${profileId}/${snapshotId}.zip`;

    // Store in object storage with compression and deduplication
    const storageResult = await this.objectStorage.store(objectKey, sourceFilePath, {
      tier: 'warm',
      compress: true,
      compressionAlgorithm: 'gzip',
      encrypt: true,
      encryptionKey: this.encryptionKey,
      enableDedup: true
    });

    // Create snapshot record
    const [snapshot] = await getDb().insert(snapshots).values({
      id: snapshotId,
      profileId,
      name: snapshotName,
      filePath: storageResult.path,
      objectStorageKey: objectKey,
      sizeBytes: storageResult.originalSize,
      compressedSize: storageResult.compressedSize,
      encrypted: true,
      compressionAlgorithm: 'gzip',
      deduplicationHash: storageResult.dedupHash,
      storageTier: 'warm',
      accessCount: 0
    }).returning();

    // Update profile
    await getDb().update(profiles)
      .set({
        updatedAt: new Date(),
        sizeBytes: sql`${profiles.sizeBytes} + ${storageResult.compressedSize}`
      })
      .where(eq(profiles.id, profileId));

    await this.updateQuotaUsage('snapshot_count', 1);
    await this.updateQuotaUsage('total_size', storageResult.compressedSize);
    await this.cacheManager.delete('profiles:list');

    this.trackPerformance(Date.now() - startTime);

    return {
      ...snapshot,
      savings: storageResult.deduplicated 
        ? { deduplicated: true, originalSize: storageResult.originalSize, storedSize: storageResult.storedSize }
        : { compressionRatio: storageResult.compressionRatio }
    };
  }

  async deleteSnapshot(snapshotId) {
    const [snapshot] = await getDb().select().from(snapshots).where(eq(snapshots.id, snapshotId));
    if (!snapshot) throw new Error('Snapshot not found');

    // Delete from object storage
    if (snapshot.objectStorageKey) {
      await this.objectStorage.delete(snapshot.objectStorageKey, snapshot.storageTier);
    }

    // Delete snapshot record
    await getDb().delete(snapshots).where(eq(snapshots.id, snapshotId));

    // Update quotas
    await this.updateQuotaUsage('snapshot_count', -1);
    if (snapshot.compressedSize) {
      await this.updateQuotaUsage('total_size', -snapshot.compressedSize);
    }

    return true;
  }

  async checkQuota(quotaType) {
    const [quota] = await getDb().select().from(storageQuotas).where(eq(storageQuotas.quotaType, quotaType));
    
    if (quota && quota.currentValue >= quota.limitValue) {
      throw new Error(`Quota exceeded for ${quotaType}: ${quota.currentValue}/${quota.limitValue}`);
    }
  }

  async updateQuotaUsage(quotaType, delta) {
    await getDb().update(storageQuotas)
      .set({
        currentValue: sql`${storageQuotas.currentValue} + ${delta}`,
        lastCheckedAt: new Date(),
        isExceeded: sql`(${storageQuotas.currentValue} + ${delta}) >= ${storageQuotas.limitValue}`
      })
      .where(eq(storageQuotas.quotaType, quotaType));
  }

  async getStorageStats() {
    const cacheKey = 'storage:stats';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const [profileStats] = await getDb().select({
      count: sql`count(*)::int`.as('count'),
      totalSize: sql`sum(${profiles.sizeBytes})::int`.as('totalSize')
    }).from(profiles);

    const [snapshotStats] = await getDb().select({
      count: sql`count(*)::int`.as('count'),
      totalSize: sql`sum(${snapshots.sizeBytes})::int`.as('totalSize'),
      compressedSize: sql`sum(${snapshots.compressedSize})::int`.as('compressedSize')
    }).from(snapshots);

    const objectStorageStats = await this.objectStorage.getStats();
    const cacheStats = this.cacheManager.getStats();
    const quotas = await getDb().select().from(storageQuotas);

    const stats = {
      profiles: {
        count: profileStats.count || 0,
        totalSize: profileStats.totalSize || 0
      },
      snapshots: {
        count: snapshotStats.count || 0,
        originalSize: snapshotStats.totalSize || 0,
        compressedSize: snapshotStats.compressedSize || 0,
        compressionRatio: snapshotStats.totalSize > 0
          ? ((snapshotStats.totalSize - snapshotStats.compressedSize) / snapshotStats.totalSize * 100).toFixed(2)
          : 0
      },
      storage: objectStorageStats,
      cache: cacheStats,
      quotas: quotas.map(q => ({
        type: q.quotaType,
        current: q.currentValue,
        limit: q.limitValue,
        usage: ((q.currentValue / q.limitValue) * 100).toFixed(2) + '%',
        exceeded: q.isExceeded
      })),
      performance: this.performanceMetrics,
      deduplicationSavings: snapshotStats.totalSize - snapshotStats.compressedSize || 0
    };

    await this.cacheManager.set(cacheKey, stats, 60000); // 1 min cache
    return stats;
  }

  async recordMetrics() {
    const stats = await this.getStorageStats();
    
    await getDb().insert(storageMetrics).values({
      id: uuidv4(),
      totalProfiles: stats.profiles.count,
      totalSnapshots: stats.snapshots.count,
      totalSizeBytes: stats.snapshots.originalSize,
      compressedSizeBytes: stats.snapshots.compressedSize,
      hotStorageBytes: stats.storage.hot.size,
      warmStorageBytes: stats.storage.warm.size,
      coldStorageBytes: stats.storage.cold.size,
      cacheHitRate: stats.cache.hitRate,
      avgAccessTime: this.performanceMetrics.avgTime,
      deduplicationSavings: stats.deduplicationSavings
    });
  }

  async createBackup(type = 'full') {
    const backupId = uuidv4();
    const backupPath = path.join(process.env.HOME, 'cloud-browser-backups', `backup_${backupId}.zip`);
    
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    await getDb().insert(storageBackups).values({
      id: backupId,
      type,
      status: 'running'
    });

    try {
      const output = require('fs').createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', async () => {
        const sizeBytes = archive.pointer();
        
        await getDb().update(storageBackups)
          .set({
            status: 'completed',
            completedAt: new Date(),
            sizeBytes,
            filePath: backupPath
          })
          .where(eq(storageBackups.id, backupId));
      });

      archive.on('error', async (err) => {
        await getDb().update(storageBackups)
          .set({
            status: 'failed',
            completedAt: new Date(),
            errorMessage: err.message
          })
          .where(eq(storageBackups.id, backupId));
        throw err;
      });

      archive.pipe(output);
      
      // Add object storage directories to backup
      const storageStats = await this.objectStorage.getStats();
      archive.directory(this.objectStorage.baseDir, 'object-storage');
      
      await archive.finalize();
      
      return backupId;
    } catch (err) {
      console.error('Backup failed:', err);
      throw err;
    }
  }

  async autoTierData() {
    const now = Date.now();
    
    // Move old hot data to warm
    const oldHotSnapshots = await getDb().select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.storageTier, 'hot'),
          sql`${snapshots.lastAccessedAt} < NOW() - INTERVAL '7 days'`
        )
      );

    for (const snapshot of oldHotSnapshots) {
      if (snapshot.objectStorageKey) {
        await this.objectStorage.moveTier(snapshot.objectStorageKey, 'hot', 'warm');
        await getDb().update(snapshots)
          .set({ storageTier: 'warm' })
          .where(eq(snapshots.id, snapshot.id));
      }
    }

    // Move old warm data to cold
    const oldWarmSnapshots = await getDb().select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.storageTier, 'warm'),
          sql`${snapshots.lastAccessedAt} < NOW() - INTERVAL '30 days'`
        )
      );

    for (const snapshot of oldWarmSnapshots) {
      if (snapshot.objectStorageKey) {
        await this.objectStorage.moveTier(snapshot.objectStorageKey, 'warm', 'cold');
        await getDb().update(snapshots)
          .set({ storageTier: 'cold' })
          .where(eq(snapshots.id, snapshot.id));
      }
    }

    console.log(`Auto-tiering: Moved ${oldHotSnapshots.length} to warm, ${oldWarmSnapshots.length} to cold`);
  }

  trackPerformance(duration) {
    this.performanceMetrics.operations++;
    this.performanceMetrics.totalTime += duration;
    this.performanceMetrics.avgTime = this.performanceMetrics.totalTime / this.performanceMetrics.operations;
  }

  startBackgroundTasks() {
    // Record metrics every 5 minutes
    setInterval(() => {
      this.recordMetrics().catch(err => console.error('Metrics recording failed:', err));
    }, 5 * 60 * 1000);

    // Auto-tier data every hour
    setInterval(() => {
      this.autoTierData().catch(err => console.error('Auto-tiering failed:', err));
    }, 60 * 60 * 1000);

    // Create daily backup at 2 AM
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        this.createBackup('incremental').catch(err => console.error('Backup failed:', err));
      }
    }, 60 * 1000);

    console.log('Background tasks started: metrics, auto-tiering, backups');
  }

  async shutdown() {
    await this.cacheManager.shutdown();
    console.log('StorageManager shut down');
  }
}

module.exports = StorageManager;
