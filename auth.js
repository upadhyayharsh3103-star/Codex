const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AuthManager {
  constructor() {
    this.sessionTokens = new Set();
    this.apiKeyPath = path.join(process.env.HOME, 'cloud-browser-snapshots', '.api_key');
    this.apiKey = null;
  }

  async initialize() {
    await this.loadOrGenerateApiKey();
  }

  async loadOrGenerateApiKey() {
    if (process.env.PROFILE_API_KEY) {
      this.apiKey = process.env.PROFILE_API_KEY;
      console.log('Using API key from environment variable');
      return;
    }

    try {
      this.apiKey = fs.readFileSync(this.apiKeyPath, 'utf8').trim();
      console.log('Loaded API key from file');
    } catch (err) {
      this.apiKey = crypto.randomBytes(32).toString('hex');
      const dir = path.dirname(this.apiKeyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.apiKeyPath, this.apiKey, { mode: 0o600 });
      console.log('Generated new API key and saved to file');
      console.log('*'.repeat(60));
      console.log('API KEY:', this.apiKey);
      console.log('Save this key! Use it in requests as:');
      console.log('  Header: X-API-Key: <key>');
      console.log('  Or Query: ?api_key=<key>');
      console.log('*'.repeat(60));
    }
  }

  validateApiKey(providedKey) {
    return providedKey && providedKey === this.apiKey;
  }

  generateSessionToken() {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessionTokens.add(token);
    return token;
  }

  validateSessionToken(token) {
    return this.sessionTokens.has(token);
  }

  revokeSessionToken(token) {
    this.sessionTokens.delete(token);
  }

  middleware() {
    return (req, res, next) => {
      const publicPaths = ['/health'];
      if (publicPaths.includes(req.path)) {
        return next();
      }

      const apiKeyFromHeader = req.get('X-API-Key');
      const apiKeyFromQuery = req.query.api_key;
      const sessionToken = req.get('X-Session-Token') || req.query.session_token;

      if (this.validateApiKey(apiKeyFromHeader) || this.validateApiKey(apiKeyFromQuery)) {
        return next();
      }

      if (this.validateSessionToken(sessionToken)) {
        return next();
      }

      res.status(401).json({
        success: false,
        error: 'Unauthorized. Please provide a valid API key or session token.',
        hint: 'Use X-API-Key header or ?api_key= query parameter'
      });
    };
  }
}

module.exports = AuthManager;
