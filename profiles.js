const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const upload = multer({ dest: '/tmp/uploads/' });

function createProfileRoutes(profileManager) {
  router.get('/profiles', async (req, res) => {
    try {
      const profiles = await profileManager.listProfiles();
      res.json({ success: true, profiles });
    } catch (error) {
      console.error('Error listing profiles:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/profiles', async (req, res) => {
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Profile name is required' });
      }
      
      const profile = await profileManager.createProfile(name, description);
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error creating profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/profiles/:profileId', async (req, res) => {
    try {
      const { profileId } = req.params;
      const profile = await profileManager.getProfile(profileId);
      
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error getting profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.delete('/profiles/:profileId', async (req, res) => {
    try {
      const { profileId } = req.params;
      const result = await profileManager.deleteProfile(profileId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/profiles/:profileId/snapshots', async (req, res) => {
    try {
      const { profileId } = req.params;
      const snapshots = await profileManager.listSnapshots(profileId);
      res.json({ success: true, snapshots });
    } catch (error) {
      console.error('Error listing snapshots:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/profiles/:profileId/snapshots', async (req, res) => {
    try {
      const { profileId } = req.params;
      const { name, includeActive } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Snapshot name is required' });
      }
      
      const snapshot = await profileManager.createSnapshot(
        profileId, 
        name, 
        includeActive !== false
      );
      
      res.json({ success: true, snapshot });
    } catch (error) {
      console.error('Error creating snapshot:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/snapshots/:snapshotId/restore', async (req, res) => {
    try {
      const { snapshotId } = req.params;
      const result = await profileManager.restoreSnapshot(snapshotId);
      res.json(result);
    } catch (error) {
      console.error('Error restoring snapshot:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/snapshots/:snapshotId/export', async (req, res) => {
    try {
      const { snapshotId } = req.params;
      const snapshot = profileManager.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId);
      
      if (!snapshot) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      
      res.download(snapshot.file_path, `snapshot_${snapshot.name}_${Date.now()}.zip`);
    } catch (error) {
      console.error('Error exporting snapshot:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/profiles/:profileId/import', upload.single('snapshot'), async (req, res) => {
    try {
      const { profileId } = req.params;
      const { name } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Snapshot file is required' });
      }
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Snapshot name is required' });
      }
      
      const snapshot = await profileManager.importSnapshot(
        profileId,
        req.file.path,
        name
      );
      
      await fs.unlink(req.file.path);
      
      res.json({ success: true, snapshot });
    } catch (error) {
      console.error('Error importing snapshot:', error);
      
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up uploaded file:', unlinkError);
        }
      }
      
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/snapshots', async (req, res) => {
    try {
      const snapshots = await profileManager.listSnapshots();
      res.json({ success: true, snapshots });
    } catch (error) {
      console.error('Error listing all snapshots:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/profiles/:profileId/oauth/:provider', async (req, res) => {
    try {
      const { profileId, provider } = req.params;
      const credentials = req.body;
      
      const result = await profileManager.saveOAuthCredentials(profileId, provider, credentials);
      res.json(result);
    } catch (error) {
      console.error('Error saving OAuth credentials:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/profiles/:profileId/oauth/:provider', async (req, res) => {
    try {
      const { profileId, provider } = req.params;
      const credentials = await profileManager.getOAuthCredentials(profileId, provider);
      
      if (!credentials) {
        return res.status(404).json({ success: false, error: 'Credentials not found' });
      }
      
      res.json({ success: true, credentials });
    } catch (error) {
      console.error('Error getting OAuth credentials:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/profiles/:profileId/oauth', async (req, res) => {
    try {
      const { profileId } = req.params;
      const credentials = await profileManager.listOAuthCredentials(profileId);
      res.json({ success: true, credentials });
    } catch (error) {
      console.error('Error listing OAuth credentials:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.delete('/oauth/:credentialId', async (req, res) => {
    try {
      const { credentialId } = req.params;
      const result = await profileManager.deleteOAuthCredentials(credentialId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting OAuth credentials:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/current-profile/save', async (req, res) => {
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, error: 'Profile name is required' });
      }
      
      const profile = await profileManager.createProfile(name, description || 'Current browser state');
      
      const snapshotName = `Initial snapshot - ${new Date().toLocaleString()}`;
      const snapshot = await profileManager.createSnapshot(profile.id, snapshotName, true);
      
      res.json({ 
        success: true, 
        profile, 
        snapshot,
        message: 'Current browser state saved successfully'
      });
    } catch (error) {
      console.error('Error saving current profile:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createProfileRoutes;
