const fs = require('fs');

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
  return process.env.DATABASE_URL || '';
}

module.exports = {
  schema: './shared/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
};
