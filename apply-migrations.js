const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

async function applyMigrations() {
  try {
    let databaseUrl = process.env.DATABASE_URL || (fs.existsSync('/tmp/replitdb') ? fs.readFileSync('/tmp/replitdb', 'utf8').trim() : null);
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found');
    }

    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    
    try {
      // Read and execute the migration SQL
      const migrationPath = path.join(__dirname, 'drizzle', '0000_concerned_ironclad.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      console.log('📝 Applying migration SQL...');
      
      // Split by semicolon and execute each statement
      const statements = sql.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        try {
          await pool.query(statement);
          console.log('✓', statement.substring(0, 50) + '...');
        } catch (e) {
          if (!e.message.includes('already exists')) {
            throw e;
          }
          console.log('⚠ Already exists:', statement.substring(0, 30) + '...');
        }
      }
      
      console.log('\n✅ Migrations applied!');
      
      // Verify tables
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' ORDER BY table_name;
      `);
      
      console.log('\n📊 Database tables:');
      result.rows.forEach(row => console.log(`  ✓ ${row.table_name}`));
      
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyMigrations();
