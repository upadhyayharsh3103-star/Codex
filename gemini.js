const express = require('express');

function createGeminiRoutes(geminiAgent) {
  const router = express.Router();

  router.post('/set-api-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      const userId = req.ip || 'default';

      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      const validation = await geminiAgent.validateApiKey(apiKey);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.message });
      }

      geminiAgent.setUserApiKey(userId, apiKey);

      res.json({
        success: true,
        message: 'API key configured successfully'
      });
    } catch (error) {
      console.error('Set API key error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api-key', (req, res) => {
    try {
      const userId = req.ip || 'default';
      geminiAgent.removeUserApiKey(userId);
      res.json({ success: true, message: 'API key removed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/status', (req, res) => {
    try {
      const userId = req.ip || 'default';
      res.json({
        hasApiKey: geminiAgent.hasApiKey(userId),
        isUsingDefault: !geminiAgent.userApiKeys.has(userId) && !!process.env.GEMINI_API_KEY
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/chat', async (req, res) => {
    try {
      const { message, context } = req.body;
      const userId = req.ip || 'default';

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (!geminiAgent.hasApiKey(userId)) {
        return res.status(400).json({
          error: 'No API key configured. Please add your Google API key in settings.'
        });
      }

      const result = await geminiAgent.chat(userId, message, context || {});
      res.json(result);
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/suggest', async (req, res) => {
    try {
      const { settings } = req.body;
      const userId = req.ip || 'default';

      if (!geminiAgent.hasApiKey(userId)) {
        return res.status(400).json({
          error: 'No API key configured. Please add your Google API key in settings.'
        });
      }

      const result = await geminiAgent.suggestCustomizations(userId, settings || {});
      res.json(result);
    } catch (error) {
      console.error('Suggest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/analyze', async (req, res) => {
    try {
      const { usageData } = req.body;
      const userId = req.ip || 'default';

      if (!geminiAgent.hasApiKey(userId)) {
        return res.status(400).json({
          error: 'No API key configured. Please add your Google API key in settings.'
        });
      }

      const result = await geminiAgent.analyzeUsage(userId, usageData || {});
      res.json(result);
    } catch (error) {
      console.error('Analyze error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createGeminiRoutes;
