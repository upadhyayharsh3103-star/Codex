const { migrate } = require('drizzle-orm/neon-serverless/migrator');
const { drizzle } = require('drizzle-orm/neon-serverless');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const fs = require('fs');

neonConfig.webSocketConstructor = ws;

async function runMigrations() {
  try {
    // Get database URL
    let databaseUrl = '';
    try {
      if (fs.existsSync('/tmp/replitdb')) {
        databaseUrl = fs.readFileSync('/tmp/replitdb', 'utf8').trim();
      }
    } catch (err) {
      // Ignore
    }
    
    if (!databaseUrl) {
      databaseUrl = process.env.DATABASE_URL;
    }

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found');
    }

    console.log('Connecting to database...');
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle({ client: pool });

    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    
    console.log('✅ Migrations completed successfully!');
    
    // Verify tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();
