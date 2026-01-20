const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const upload = multer({ dest: '/tmp/uploads' });

function createStorageRoutes(storageManager) {
  const router = express.Router();

  // Get storage statistics and analytics
  router.get('/stats', async (req, res) => {
    try {
      const stats = await storageManager.getStorageStats();
      res.json(stats);
    } catch (err) {
      console.error('Error getting storage stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get storage health
  router.get('/health', async (req, res) => {
    try {
      const stats = await storageManager.getStorageStats();
      const health = {
        status: 'healthy',
        checks: {
          quotas: {
            status: stats.quotas.every(q => !q.exceeded) ? 'ok' : 'warning',
            details: stats.quotas.filter(q => q.exceeded)
          },
          cache: {
            status: stats.cache.hitRate > 50 ? 'ok' : 'warning',
            hitRate: stats.cache.hitRate
          },
          storage: {
            status: 'ok',
            tiers: {
              hot: `${(stats.storage.hot.size / 1024 / 1024).toFixed(2)} MB`,
              warm: `${(stats.storage.warm.size / 1024 / 1024).toFixed(2)} MB`,
              cold: `${(stats.storage.cold.size / 1024 / 1024).toFixed(2)} MB`
            }
          },
          performance: {
            status: stats.performance.avgTime < 1000 ? 'ok' : 'slow',
            avgResponseTime: `${stats.performance.avgTime.toFixed(2)} ms`
          }
        },
        timestamp: new Date().toISOString()
      };

      res.json(health);
    } catch (err) {
      console.error('Error checking storage health:', err);
      res.status(500).json({ 
        status: 'unhealthy',
        error: err.message 
      });
    }
  });

  // Get storage quotas
  router.get('/quotas', async (req, res) => {
    try {
      const { db } = require('../server/db.js');
      const { storageQuotas } = require('../shared/schema.js');
      const quotas = await db.select().from(storageQuotas);
      res.json(quotas);
    } catch (err) {
      console.error('Error getting quotas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update storage quota
  router.put('/quotas/:quotaType', async (req, res) => {
    try {
      const { quotaType } = req.params;
      const { limitValue, warningThreshold } = req.body;
      
      const { db } = require('../server/db.js');
      const { storageQuotas } = require('../shared/schema.js');
      const { eq } = require('drizzle-orm');

      const [updated] = await db.update(storageQuotas)
        .set({ 
          limitValue, 
          warningThreshold: warningThreshold || 0.8,
          lastCheckedAt: new Date()
        })
        .where(eq(storageQuotas.quotaType, quotaType))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error('Error updating quota:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get storage metrics history
  router.get('/metrics', async (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const { db } = require('../server/db.js');
      const { storageMetrics } = require('../shared/schema.js');
      const { desc } = require('drizzle-orm');

      const metrics = await db.select()
        .from(storageMetrics)
        .orderBy(desc(storageMetrics.timestamp))
        .limit(parseInt(limit));

      res.json(metrics);
    } catch (err) {
      console.error('Error getting metrics:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Create backup
  router.post('/backups', async (req, res) => {
    try {
      const { type = 'full' } = req.body;
      const backupId = await storageManager.createBackup(type);
      res.json({ 
        success: true, 
        backupId,
        message: 'Backup started successfully' 
      });
    } catch (err) {
      console.error('Error creating backup:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // List backups
  router.get('/backups', async (req, res) => {
    try {
      const { db } = require('../server/db.js');
      const { storageBackups } = require('../shared/schema.js');
      const { desc } = require('drizzle-orm');

      const backups = await db.select()
        .from(storageBackups)
        .orderBy(desc(storageBackups.startedAt));

      res.json(backups);
    } catch (err) {
      console.error('Error listing backups:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Clear cache
  router.post('/cache/clear', async (req, res) => {
    try {
      await storageManager.cacheManager.clear();
      res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (err) {
      console.error('Error clearing cache:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get cache stats
  router.get('/cache/stats', async (req, res) => {
    try {
      const stats = storageManager.cacheManager.getStats();
      res.json(stats);
    } catch (err) {
      console.error('Error getting cache stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger auto-tiering manually
  router.post('/tier/auto', async (req, res) => {
    try {
      await storageManager.autoTierData();
      res.json({ success: true, message: 'Auto-tiering completed' });
    } catch (err) {
      console.error('Error auto-tiering:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get object storage stats
  router.get('/object-storage/stats', async (req, res) => {
    try {
      const stats = await storageManager.objectStorage.getStats();
      res.json(stats);
    } catch (err) {
      console.error('Error getting object storage stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createStorageRoutes;
