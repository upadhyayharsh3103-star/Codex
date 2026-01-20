const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class PublishManager {
  constructor(profileManager) {
    this.profileManager = profileManager;
    this.publishedSessions = new Map(); // In-memory storage
    this.exportFormats = ['json', 'html', 'zip'];
  }

  async initialize() {
    // Initialize from database if available
    console.log('📤 PublishManager initialized');
  }

  generateShareToken(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Create a shareable link for a session
   */
  async publishSession(profileId, options = {}) {
    const {
      title = `Published Session - ${new Date().toLocaleString()}`,
      description = '',
      expiresIn = 30 * 24 * 60 * 60 * 1000, // 30 days default
      isPublic = false,
      allowDownload = true,
      allowSharing = true,
      password = null
    } = options;

    const publishId = uuidv4();
    const shareToken = this.generateShareToken();
    const expiresAt = new Date(Date.now() + expiresIn);

    const publishRecord = {
      publishId,
      profileId,
      shareToken,
      title,
      description,
      isPublic,
      allowDownload,
      allowSharing,
      password: password ? crypto.createHash('sha256').update(password).digest('hex') : null,
      expiresAt,
      createdAt: new Date(),
      accessCount: 0,
      lastAccessedAt: null,
      shareUrl: `/share/${shareToken}`
    };

    this.publishedSessions.set(publishId, publishRecord);
    console.log(`✅ Session published: ${publishId}`);
    return publishRecord;
  }

  /**
   * Get a published session by share token
   */
  async getPublishedSession(shareToken, password = null) {
    for (const [, record] of this.publishedSessions) {
      if (record.shareToken === shareToken) {
        // Check expiration
        if (new Date() > record.expiresAt) {
          throw new Error('Share link has expired');
        }

        // Check password if required
        if (record.password) {
          const hashedPassword = crypto.createHash('sha256').update(password || '').digest('hex');
          if (hashedPassword !== record.password) {
            throw new Error('Invalid password');
          }
        }

        // Update access count
        record.accessCount++;
        record.lastAccessedAt = new Date();

        return record;
      }
    }
    throw new Error('Share link not found');
  }

  /**
   * Export session in various formats
   */
  async exportSession(profileId, format = 'json', includeData = true) {
    if (!this.exportFormats.includes(format)) {
      throw new Error(`Unsupported format: ${format}. Supported: ${this.exportFormats.join(', ')}`);
    }

    const profile = await this.profileManager.getProfile(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const exportData = {
      metadata: {
        profileId,
        exportedAt: new Date().toISOString(),
        title: profile.name || 'Exported Session',
        browserData: profile.browserData || {},
        bookmarks: profile.bookmarks || [],
        history: profile.history || [],
        cookies: profile.cookies || []
      }
    };

    if (includeData && profile.data) {
      exportData.data = profile.data;
    }

    switch (format) {
      case 'json':
        return {
          format: 'json',
          content: JSON.stringify(exportData, null, 2),
          filename: `session-${profileId}-${Date.now()}.json`,
          mimeType: 'application/json'
        };

      case 'html':
        const htmlContent = this.generateHTMLExport(exportData);
        return {
          format: 'html',
          content: htmlContent,
          filename: `session-${profileId}-${Date.now()}.html`,
          mimeType: 'text/html'
        };

      case 'zip':
        // Return instructions for client to create ZIP
        return {
          format: 'zip',
          content: JSON.stringify(exportData),
          filename: `session-${profileId}-${Date.now()}.zip`,
          mimeType: 'application/zip',
          requiresClientZip: true
        };

      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  generateHTMLExport(exportData) {
    const { metadata } = exportData;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title} - Exported from Cloud Browser</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 {
      color: #667eea;
      margin-top: 0;
    }
    .metadata {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .section {
      margin: 30px 0;
    }
    .section h2 {
      color: #764ba2;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .bookmark-list, .history-list {
      list-style: none;
      padding: 0;
    }
    .bookmark-list li, .history-list li {
      padding: 10px;
      margin: 5px 0;
      background: #f9f9f9;
      border-left: 4px solid #667eea;
      border-radius: 4px;
    }
    .bookmark-list a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .bookmark-list a:hover {
      text-decoration: underline;
    }
    .timestamp {
      color: #999;
      font-size: 0.9em;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #999;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ${metadata.title}</h1>
    
    <div class="metadata">
      <p><strong>Exported:</strong> ${metadata.exportedAt}</p>
      <p><strong>Profile ID:</strong> <code>${metadata.profileId}</code></p>
    </div>

    ${metadata.bookmarks && metadata.bookmarks.length > 0 ? `
    <div class="section">
      <h2>🔖 Bookmarks (${metadata.bookmarks.length})</h2>
      <ul class="bookmark-list">
        ${metadata.bookmarks.map(b => `
          <li>
            <a href="${b.url}" target="_blank">${b.title || b.url}</a>
            ${b.timestamp ? `<div class="timestamp">${new Date(b.timestamp).toLocaleString()}</div>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${metadata.history && metadata.history.length > 0 ? `
    <div class="section">
      <h2>📜 History (${metadata.history.length} recent)</h2>
      <ul class="history-list">
        ${metadata.history.slice(0, 50).map(h => `
          <li>
            <strong>${h.title || 'Untitled'}</strong>
            ${h.url ? `<br><small>${h.url}</small>` : ''}
            ${h.timestamp ? `<div class="timestamp">${new Date(h.timestamp).toLocaleString()}</div>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    <div class="footer">
      <p>Exported from Cloud Browser</p>
      <p style="font-size: 0.85em; color: #ccc;">This is a read-only export of your session.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * List all published sessions for a profile
   */
  async listPublishedSessions(profileId) {
    const sessions = [];
    for (const [, record] of this.publishedSessions) {
      if (record.profileId === profileId) {
        sessions.push({
          ...record,
          isExpired: new Date() > record.expiresAt
        });
      }
    }
    return sessions;
  }

  /**
   * Revoke/unpublish a session
   */
  async revokeSession(publishId, profileId) {
    const record = this.publishedSessions.get(publishId);
    if (!record || record.profileId !== profileId) {
      throw new Error('Publish record not found or unauthorized');
    }
    this.publishedSessions.delete(publishId);
    console.log(`🔒 Session unpublished: ${publishId}`);
    return { success: true, publishId };
  }

  /**
   * Update publish settings
   */
  async updatePublishSettings(publishId, profileId, updates) {
    const record = this.publishedSessions.get(publishId);
    if (!record || record.profileId !== profileId) {
      throw new Error('Publish record not found or unauthorized');
    }

    const allowedUpdates = ['title', 'description', 'isPublic', 'allowDownload', 'allowSharing'];
    allowedUpdates.forEach(key => {
      if (key in updates) {
        record[key] = updates[key];
      }
    });

    console.log(`✏️  Publish settings updated: ${publishId}`);
    return record;
  }

  /**
   * Get analytics for published sessions
   */
  async getPublishAnalytics(profileId) {
    const sessions = await this.listPublishedSessions(profileId);
    return {
      totalPublished: sessions.length,
      totalAccesses: sessions.reduce((sum, s) => sum + s.accessCount, 0),
      activeSessions: sessions.filter(s => !s.isExpired).length,
      sessions: sessions.map(s => ({
        publishId: s.publishId,
        title: s.title,
        accessCount: s.accessCount,
        lastAccessed: s.lastAccessedAt,
        expiresAt: s.expiresAt,
        isExpired: s.isExpired
      }))
    };
  }
}

module.exports = PublishManager;
