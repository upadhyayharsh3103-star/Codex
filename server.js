const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const net = require('net');
const ProfileManager = require('./ProfileManager');
const StorageManager = require('./server/StorageManager');
const EnhancedProfileManager = require('./server/EnhancedProfileManager');
const AutoSaveManager = require('./server/AutoSaveManager');
const GeminiAgent = require('./server/GeminiAgent');
const AuthManager = require('./middleware/auth');
const BrowserConfigManager = require('./server/BrowserConfigManager');
const createProfileRoutes = require('./routes/profiles');
const createStorageRoutes = require('./routes/storage');
const createAutoSaveRoutes = require('./routes/autosave');
const createGeminiRoutes = require('./routes/gemini');
const PublishManager = require('./server/PublishManager');
const createPublishRoutes = require('./routes/publish');

const app = express();
const PORT = process.env.PORT || 5000;
const VNC_HOST = 'localhost';
const VNC_PORT = 5900;

app.use((req, res, next) => {
  const allowedOrigins = ['capacitor://localhost', 'http://localhost', 'https://localhost', 'ionic://localhost'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/novnc', express.static('novnc'));

// Initialize the advanced storage system
const storageManager = new StorageManager({
  objectStorage: {
    compressionLevel: 9,
    enableDeduplication: true
  },
  cache: {
    maxMemoryMB: 200,
    defaultTTL: 3600000
  }
});

// Keep legacy ProfileManager for backwards compatibility if needed
const profileManager = new ProfileManager();
const authManager = new AuthManager();
const geminiAgent = new GeminiAgent();
const browserConfigManager = new BrowserConfigManager();
const publishManager = new PublishManager(profileManager);

// Will be set after initialization
let enhancedProfileManager = null;
let autoSaveManager = null;
let globalVncProcess = null; // Track VNC process for restart capability

console.log('🚀 Initializing Cloud Browser with Advanced Storage System...');
console.log('   ✨ Features:');
console.log('   - PostgreSQL database with optimized indexes');
console.log('   - Multi-tier object storage (hot/warm/cold)');
console.log('   - Intelligent caching layer');
console.log('   - Data compression & deduplication');
console.log('   - Automatic backups & recovery');
console.log('   - Storage analytics & monitoring');
console.log('   - Auto-tiering based on access patterns');
console.log('   - Auto-Save Memory System (continuous browser data backup)');
console.log('   - 📤 Publish & Share System (create shareable links, export sessions)');

// Initialize in proper order - NON-BLOCKING for health checks
// Start server immediately, initialize services in background
const initializeServices = async () => {
  try {
    await Promise.all([
      profileManager.initialize(),
      authManager.initialize()
    ]);
    
    // Check if database is available
    const fs = require('fs');
    const databaseUrl = fs.existsSync('/tmp/replitdb') 
      ? fs.readFileSync('/tmp/replitdb', 'utf8').trim()
      : process.env.DATABASE_URL;
    
    if (databaseUrl) {
      // Database available - use enhanced profile manager
      enhancedProfileManager = new EnhancedProfileManager(storageManager);
      await Promise.all([
        storageManager.initialize(),
        enhancedProfileManager.initialize()
      ]);
      
      // Create auto-save with enhanced profile manager
      autoSaveManager = new AutoSaveManager(enhancedProfileManager, {
        autoSaveInterval: 5 * 60 * 1000, // 5 minutes
        maxAutoSaves: 100 // Keep last 100 auto-saves
      });
    } else {
      console.log('⚠️  Database not available yet. Using legacy ProfileManager for auto-save.');
      console.log('   Please reload your workspace to enable PostgreSQL-backed storage.');
      
      // Create auto-save with legacy profile manager
      autoSaveManager = new AutoSaveManager(profileManager, {
        autoSaveInterval: 5 * 60 * 1000, // 5 minutes
        maxAutoSaves: 100 // Keep last 100 auto-saves
      });
    }
    
    // Initialize auto-save manager
    await autoSaveManager.initialize();
    
    // Auto-restore latest saved data on startup (no API needed)
    if (autoSaveManager) {
      try {
        const history = await autoSaveManager.getAutoSaveHistory(1);
        if (history && history.length > 0) {
          console.log('🔄 Found previous auto-save, restoring on next browser start...');
        }
      } catch (e) {
        // Ignore - just a courtesy check
      }
    }
    
    console.log('✅ All systems initialized and ready');
    if (enhancedProfileManager) {
      console.log('📊 Storage Dashboard: http://localhost:5000/storage-dashboard.html?api_key=' + authManager.apiKey);
    }
    console.log('🤖 Auto-Save Dashboard: http://localhost:5000/autosave-dashboard.html?api_key=' + authManager.apiKey);
    console.log('👤 Profile Manager: http://localhost:5000/manager.html?api_key=' + authManager.apiKey);
    console.log('🧠 AI Agent: http://localhost:5000/ai-agent.html?api_key=' + authManager.apiKey);
    
    // Start the Auto-Save Memory System
    autoSaveManager.start().then(() => {
      console.log('🚀 Auto-Save Memory System started successfully!');
    }).catch(err => {
      console.error('⚠️  Failed to start auto-save system:', err);
    });
  } catch (err) {
    console.error('❌ Failed to initialize:', err);
  }
};

// Start initialization in background - non-blocking
initializeServices().catch(err => {
  console.error('⚠️  Background initialization error:', err);
});

// API Routes - Set up after initialization
app.use('/api/profiles', authManager.middleware(), (req, res, next) => {
  const manager = enhancedProfileManager || profileManager;
  createProfileRoutes(manager)(req, res, next);
});

app.use('/api/storage', authManager.middleware(), (req, res, next) => {
  if (!enhancedProfileManager) {
    return res.status(503).json({ error: 'Storage system not available. Please reload workspace to enable database.' });
  }
  createStorageRoutes(storageManager)(req, res, next);
});

app.use('/api/autosave', authManager.middleware(), (req, res, next) => {
  if (!autoSaveManager) {
    return res.status(503).json({ error: 'Auto-save system not available yet. Please wait for initialization.' });
  }
  createAutoSaveRoutes(autoSaveManager)(req, res, next);
});

// Legacy profile API (keep for backwards compatibility)
app.use('/api/v1/profiles', authManager.middleware(), createProfileRoutes(profileManager));

// Gemini AI Agent routes - public access (Gemini API key is the authentication)
app.use('/api/gemini', createGeminiRoutes(geminiAgent));

// Publish & Share routes
app.use('/api/publish', authManager.middleware(), createPublishRoutes(publishManager));

// Public share viewer (no auth required)
app.get('/share/:shareToken', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'publish-dashboard.html'));
});

app.get('/publish-dashboard.html', (req, res) => {
  const apiKeyFromQuery = req.query.api_key;
  if (!authManager.validateApiKey(apiKeyFromQuery)) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Unauthorized</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Required</h1>
        <p>Please provide your API key to access the Publish Dashboard.</p>
        <p style="margin-top: 30px;">Add <code>?api_key=YOUR_KEY</code> to the URL</p>
        <p style="color: #666; margin-top: 20px;">Check the server console logs for your API key.</p>
      </body>
      </html>
    `);
  }
  res.sendFile(path.join(__dirname, 'public', 'publish-dashboard.html'));
});

// Browser Config API (no auth required - local settings)
app.get('/api/browser-config', (req, res) => {
  res.json(browserConfigManager.getConfig());
});

app.post('/api/browser-config', (req, res) => {
  try {
    const { browserCount } = req.body;
    const config = browserConfigManager.setBrowserCount(browserCount);
    
    // Restart VNC service with new browser count
    console.log(`🔄 Restarting VNC service with ${browserCount} browser(s)...`);
    if (globalVncProcess) {
      globalVncProcess.kill('SIGTERM');
      setTimeout(() => {
        startVncService();
      }, 2000);
    }
    
    res.json({ success: true, config, message: 'Browser configuration updated. VNC service restarting...' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Helper function to start VNC service
function startVncService() {
  globalVncProcess = spawn('./start-vnc.sh', {
    stdio: 'inherit',
    shell: true
  });

  globalVncProcess.on('error', (err) => {
    console.error('Failed to start VNC:', err);
  });

  globalVncProcess.on('exit', (code) => {
    console.log(`VNC process exited with code ${code}`);
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/manager.html', (req, res) => {
  const apiKeyFromHeader = req.get('X-API-Key');
  const apiKeyFromQuery = req.query.api_key;
  
  if (!authManager.validateApiKey(apiKeyFromHeader) && !authManager.validateApiKey(apiKeyFromQuery)) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Unauthorized</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Required</h1>
        <p>Please provide your API key to access the Profile Manager.</p>
        <p style="margin-top: 30px;">Add <code>?api_key=YOUR_KEY</code> to the URL</p>
        <p style="color: #666; margin-top: 20px;">Check the server console logs for your API key.</p>
      </body>
      </html>
    `);
  }
  
  const fs = require('fs');
  const managerPath = path.join(__dirname, 'manager.html');
  let html = fs.readFileSync(managerPath, 'utf8');
  
  html = html.replace(
    "let apiKey = '';",
    `let apiKey = '${authManager.apiKey}';`
  );
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

app.get('/storage-dashboard.html', (req, res) => {
  const apiKeyFromHeader = req.get('X-API-Key');
  const apiKeyFromQuery = req.query.api_key;
  
  if (!authManager.validateApiKey(apiKeyFromHeader) && !authManager.validateApiKey(apiKeyFromQuery)) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Unauthorized</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Required</h1>
        <p>Please provide your API key to access the Storage Dashboard.</p>
        <p style="margin-top: 30px;">Add <code>?api_key=YOUR_KEY</code> to the URL</p>
        <p style="color: #666; margin-top: 20px;">Check the server console logs for your API key.</p>
      </body>
      </html>
    `);
  }
  
  const fs = require('fs');
  const dashboardPath = path.join(__dirname, 'public', 'storage-dashboard.html');
  let html = fs.readFileSync(dashboardPath, 'utf8');
  
  html = html.replace(
    "let apiKey = '';",
    `let apiKey = '${authManager.apiKey}';`
  );
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

app.get('/autosave-dashboard.html', (req, res) => {
  const apiKeyFromHeader = req.get('X-API-Key');
  const apiKeyFromQuery = req.query.api_key;
  
  if (!authManager.validateApiKey(apiKeyFromHeader) && !authManager.validateApiKey(apiKeyFromQuery)) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Unauthorized</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Required</h1>
        <p>Please provide your API key to access the Auto-Save Dashboard.</p>
        <p style="margin-top: 30px;">Add <code>?api_key=YOUR_KEY</code> to the URL</p>
        <p style="color: #666; margin-top: 20px;">Check the server console logs for your API key.</p>
      </body>
      </html>
    `);
  }
  
  const fs = require('fs');
  const dashboardPath = path.join(__dirname, 'public', 'autosave-dashboard.html');
  let html = fs.readFileSync(dashboardPath, 'utf8');
  
  html = html.replace(
    "let apiKey = '';",
    `let apiKey = '${authManager.apiKey}';`
  );
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

app.get('/ai-agent.html', (req, res) => {
  // AI Agent page is public - no authentication required
  const fs = require('fs');
  const agentPath = path.join(__dirname, 'public', 'ai-agent.html');
  let html = fs.readFileSync(agentPath, 'utf8');
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Cloud Browser is running' });
});

// Browser Control UI - simple endpoint for managing dual/triple browser setup
app.get('/browser-control.html', (req, res) => {
  const fs = require('fs');
  const currentConfig = browserConfigManager.getConfig();
  const browserCount = currentConfig.browserCount;
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Browser Control</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; font-size: 14px; }
        .controls { display: flex; gap: 10px; margin-bottom: 30px; }
        button { padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.3s; }
        .btn { background: #f0f0f0; color: #333; }
        .btn:hover { background: #e0e0e0; }
        .btn.active { background: #4CAF50; color: white; }
        .status { padding: 12px; background: #e8f5e9; border-radius: 6px; color: #2e7d32; font-size: 13px; margin-bottom: 20px; }
        .info { background: #f3e5f5; border-left: 4px solid #7c4dff; padding: 12px; border-radius: 4px; margin-top: 20px; font-size: 12px; color: #512da8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🖥️ Browser Control</h1>
        <p>Select how many browsers you want to run simultaneously</p>
        
        <div class="status">
          Current: <strong>${browserCount} browser(s)</strong>
        </div>
        
        <div class="controls">
          <button class="btn ${browserCount === 1 ? 'active' : ''}" onclick="setBrowserCount(1)">1 Browser</button>
          <button class="btn ${browserCount === 2 ? 'active' : ''}" onclick="setBrowserCount(2)">2 Browsers</button>
          <button class="btn ${browserCount === 3 ? 'active' : ''}" onclick="setBrowserCount(3)">3 Browsers</button>
        </div>
        
        <div class="info">
          ℹ️ Changing browser count will restart the VNC service. Your data is automatically saved and restored.
        </div>
      </div>
      
      <script>
        async function setBrowserCount(count) {
          try {
            const response = await fetch('/api/browser-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ browserCount: count })
            });
            
            if (response.ok) {
              const data = await response.json();
              alert('Browser configuration updated! VNC service restarting...');
              setTimeout(() => location.reload(), 2000);
            }
          } catch (error) {
            alert('Error updating browser configuration: ' + error.message);
          }
        }
      </script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

// Browser optimization settings
let browserOptimizationSettings = {
  memoryLimit: 512,
  cpuCoreUsage: 0.9
};

app.post('/api/browser/optimize', (req, res) => {
  const { memoryLimit, cpuCoreUsage } = req.body;
  
  if (memoryLimit) {
    browserOptimizationSettings.memoryLimit = Math.min(2048, Math.max(256, memoryLimit));
  }
  if (cpuCoreUsage) {
    browserOptimizationSettings.cpuCoreUsage = Math.min(2.0, Math.max(0.1, cpuCoreUsage));
  }
  
  console.log('🔧 Browser Optimization Applied:', browserOptimizationSettings);
  res.json({ 
    success: true, 
    message: 'Browser optimization settings applied',
    settings: browserOptimizationSettings 
  });
});

app.get('/api/browser/optimization', (req, res) => {
  res.json(browserOptimizationSettings);
});

app.post('/api/send-key', (req, res) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Key parameter required' });
  }
  
  const { exec } = require('child_process');
  const display = process.env.DISPLAY || ':99';
  
  exec(`DISPLAY=${display} xdotool key ${key}`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error sending key:', error);
      return res.status(500).json({ error: 'Failed to send key', details: error.message });
    }
    res.json({ success: true, key });
  });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ 
  server,
  path: '/websockify'
});

console.log('WebSocket server configured on path /websockify');

wss.on('connection', (ws) => {
  console.log('New WebSocket connection for VNC');
  
  let messageQueue = [];
  let flushTimer = null;
  
  const vncSocket = net.createConnection({
    host: VNC_HOST,
    port: VNC_PORT
  });

  vncSocket.setNoDelay(true);

  vncSocket.on('connect', () => {
    console.log('Connected to VNC server');
  });

  const flushMessages = () => {
    if (messageQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
      const combined = Buffer.concat(messageQueue);
      ws.send(combined, { binary: true });
      messageQueue = [];
    }
    flushTimer = null;
  };

  vncSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      messageQueue.push(data);
      
      if (messageQueue.length >= 5 || data.length > 8192) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushMessages();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushMessages, 16);
      }
    }
  });

  ws.on('message', (message) => {
    vncSocket.write(message);
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (flushTimer) clearTimeout(flushTimer);
    vncSocket.end();
  });

  vncSocket.on('close', () => {
    console.log('VNC connection closed');
    if (flushTimer) clearTimeout(flushTimer);
    ws.close();
  });

  vncSocket.on('error', (err) => {
    console.error('VNC socket error:', err.message);
    if (flushTimer) clearTimeout(flushTimer);
    ws.close();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    if (flushTimer) clearTimeout(flushTimer);
    vncSocket.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cloud Browser server running on http://0.0.0.0:${PORT}`);
  console.log('WebSocket proxy integrated on /websockify path');
  console.log('Starting VNC and browser services...');
  
  startVncService();

  // ═══════════════════════════════════════════════════════════
  // 🔄 KEEP-ALIVE SYSTEM - Keep App 24/7 Active on Render
  // ═══════════════════════════════════════════════════════════
  
  // Enable 24/7 keep-alive by default (can be disabled with KEEP_ALIVE=false)
  const KEEP_ALIVE_ENABLED = process.env.KEEP_ALIVE !== 'false';
  const KEEP_ALIVE_INTERVAL = parseInt(process.env.KEEP_ALIVE_INTERVAL || '10') * 60 * 1000; // Default: 10 minutes
  
  if (KEEP_ALIVE_ENABLED) {
    console.log(`🔄 Keep-Alive System: ENABLED (pings every ${KEEP_ALIVE_INTERVAL / 60000} minutes)`);
    
    // Internal keep-alive ping that maintains server activity
    let keepAliveTimer = setInterval(() => {
      // Perform internal health check
      const http = require('http');
      const options = {
        hostname: 'localhost',
        port: PORT,
        path: '/health',
        method: 'GET',
        timeout: 5000
      };
      
      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          console.log(`✅ Keep-Alive: Server active (${new Date().toISOString()})`);
        }
      });
      
      req.on('error', (err) => {
        console.warn(`⚠️  Keep-Alive ping failed: ${err.message}`);
      });
      
      req.on('timeout', () => {
        console.warn('⚠️  Keep-Alive ping timeout');
        req.destroy();
      });
      
      req.end();
    }, KEEP_ALIVE_INTERVAL);
    
    // Graceful cleanup on shutdown
    process.on('SIGTERM', () => {
      clearInterval(keepAliveTimer);
    });
    
    process.on('SIGINT', () => {
      clearInterval(keepAliveTimer);
    });
  }
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  profileManager.close();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  profileManager.close();
  process.exit(0);
});
