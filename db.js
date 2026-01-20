const { Pool, neonConfig } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless');
const ws = require("ws");
const schema = require("../shared/schema.js");
const fs = require('fs');

neonConfig.webSocketConstructor = ws;

let pool;
let db;

function getDatabaseUrl() {
  // Check /tmp/replitdb first (Replit stores it here after provisioning)
  try {
    if (fs.existsSync('/tmp/replitdb')) {
      const url = fs.readFileSync('/tmp/replitdb', 'utf8').trim();
      if (url) {
        return url;
      }
    }
  } catch (err) {
    // Ignore and fall through to environment variable
  }
  
  // Fall back to environment variable
  return process.env.DATABASE_URL;
}

function getDb() {
  if (!db) {
    const databaseUrl = getDatabaseUrl();
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle({ client: pool, schema });
  }
  return db;
}

module.exports = { get db() { return getDb(); }, pool, getDb };
