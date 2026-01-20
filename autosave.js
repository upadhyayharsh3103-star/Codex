const express = require('express');

function createAutoSaveRoutes(autoSaveManager) {
  const router = express.Router();

  router.get('/status', async (req, res) => {
    try {
      const status = autoSaveManager.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting auto-save status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/start', async (req, res) => {
    try {
      await autoSaveManager.start();
      const status = autoSaveManager.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      console.error('Error starting auto-save:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/stop', async (req, res) => {
    try {
      await autoSaveManager.stop();
      const status = autoSaveManager.getStatus();
      res.json({ success: true, status });
    } catch (error) {
      console.error('Error stopping auto-save:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/save-now', async (req, res) => {
    try {
      const snapshot = await autoSaveManager.performAutoSave();
      res.json({ success: true, snapshot });
    } catch (error) {
      console.error('Error performing manual auto-save:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const history = await autoSaveManager.getAutoSaveHistory(limit);
      res.json(history);
    } catch (error) {
      console.error('Error getting auto-save history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/restore/:snapshotId', async (req, res) => {
    try {
      const { snapshotId } = req.params;
      await autoSaveManager.restoreFromHistory(snapshotId);
      res.json({ 
        success: true, 
        message: 'Browser data restored successfully. Browser will restart automatically.',
        requiresBrowserRestart: true
      });
    } catch (error) {
      console.error('Error restoring from auto-save:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const { autoSaveInterval, maxAutoSaves } = req.body;
      const config = {};
      
      if (autoSaveInterval !== undefined) {
        config.autoSaveInterval = parseInt(autoSaveInterval);
      }
      
      if (maxAutoSaves !== undefined) {
        config.maxAutoSaves = parseInt(maxAutoSaves);
      }
      
      const status = await autoSaveManager.updateConfig(config);
      res.json({ success: true, status });
    } catch (error) {
      console.error('Error updating auto-save config:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createAutoSaveRoutes;
