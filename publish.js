module.exports = (publishManager) => {
  const express = require('express');
  const router = express.Router();

  /**
   * Publish a session - create shareable link
   * POST /api/publish/sessions
   */
  router.post('/sessions', async (req, res) => {
    try {
      const { profileId, title, description, expiresIn, isPublic, password } = req.body;

      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      const published = await publishManager.publishSession(profileId, {
        title,
        description,
        expiresIn: expiresIn || 30 * 24 * 60 * 60 * 1000,
        isPublic: isPublic || false,
        password
      });

      res.json({
        success: true,
        ...published,
        fullShareUrl: `${req.protocol}://${req.get('host')}/share/${published.shareToken}`
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * List published sessions for current user
   * GET /api/publish/sessions/:profileId
   */
  router.get('/sessions/:profileId', async (req, res) => {
    try {
      const { profileId } = req.params;
      const sessions = await publishManager.listPublishedSessions(profileId);

      res.json({
        success: true,
        count: sessions.length,
        sessions: sessions.map(s => ({
          publishId: s.publishId,
          title: s.title,
          description: s.description,
          shareUrl: `${req.protocol}://${req.get('host')}/share/${s.shareToken}`,
          accessCount: s.accessCount,
          lastAccessed: s.lastAccessedAt,
          expiresAt: s.expiresAt,
          isExpired: s.isExpired,
          isPublic: s.isPublic
        }))
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Update publish settings
   * PUT /api/publish/sessions/:publishId
   */
  router.put('/sessions/:publishId', async (req, res) => {
    try {
      const { publishId } = req.params;
      const { profileId, updates } = req.body;

      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      const updated = await publishManager.updatePublishSettings(publishId, profileId, updates);

      res.json({
        success: true,
        ...updated
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Revoke/unpublish a session
   * DELETE /api/publish/sessions/:publishId
   */
  router.delete('/sessions/:publishId', async (req, res) => {
    try {
      const { publishId } = req.params;
      const { profileId } = req.body;

      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      const result = await publishManager.revokeSession(publishId, profileId);

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Export session in various formats
   * GET /api/publish/export/:profileId?format=json|html|zip&includeData=true
   */
  router.get('/export/:profileId', async (req, res) => {
    try {
      const { profileId } = req.params;
      const { format = 'json', includeData = 'true' } = req.query;

      const exported = await publishManager.exportSession(
        profileId,
        format,
        includeData === 'true'
      );

      res.set('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.set('Content-Type', exported.mimeType);
      res.send(exported.content);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Get publish analytics
   * GET /api/publish/analytics/:profileId
   */
  router.get('/analytics/:profileId', async (req, res) => {
    try {
      const { profileId } = req.params;
      const analytics = await publishManager.getPublishAnalytics(profileId);

      res.json({
        success: true,
        ...analytics
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * Public share viewer - no auth required
   * GET /share/:shareToken
   */
  router.get('/viewer/:shareToken', async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { password } = req.query;

      const session = await publishManager.getPublishedSession(shareToken, password);

      res.json({
        success: true,
        title: session.title,
        description: session.description,
        profileId: session.profileId,
        allowDownload: session.allowDownload,
        accessCount: session.accessCount
      });
    } catch (error) {
      res.status(403).json({ error: error.message });
    }
  });

  return router;
};
