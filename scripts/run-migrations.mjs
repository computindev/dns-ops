import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const { Client } = pg;

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('=== Migration Runner Starting ===');
  
  if (!dbUrl) {
    console.log('ERROR: No DATABASE_URL environment variable');
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
    return;
  }

  console.log('DATABASE_URL found:', dbUrl.substring(0, 40) + '...');
  
  const client = new Client({ 
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=no-verify') ? { rejectUnauthorized: false } : undefined
  });
  
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');
    
    // Run each migration file in order
    const migrationsDir = join(process.cwd(), 'packages/db/src/migrations');
    const migrationFiles = [
      '0000_nebulous_steve_rogers.sql',
      '0001_clear_hairball.sql',
      '0002_fine_wolf_cub.sql',
      '0003_yummy_kate_bishop.sql',
      '0004_rare_agent_brand.sql',
      '0005_right_human_torch.sql',
      '0006_enforce_tenant_not_null.sql',
      '0007_tenant_domain_uniqueness.sql',
      '0008_moaning_mojo.sql',
      '0009_drop_vantage_points.sql',
      '0010_drop_global_domain_uniqueness.sql',
    ];
    
    for (const file of migrationFiles) {
      try {
        const sql = readFileSync(join(migrationsDir, file), 'utf8');
        console.log(`Running migration: ${file}`);
        await client.query(sql);
        console.log(`Completed: ${file}`);
      } catch (err) {
        // Ignore "already exists" errors
        if (err.code === '42P07' || err.code === '42710' || 
            err.message.includes('already exists') || 
            err.message.includes('duplicate')) {
          console.log(`Skipping ${file} (already exists)`);
        } else {
          console.error(`Error in ${file}:`, err.code, err.message);
        }
      }
    }
    
    console.log('=== Migrations Complete ===');
  } catch (err) {
    console.error('Migration connection error:', err.code, err.message);
    console.error(err.stack);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // Ignore
    }
  }
}

runMigrations().then(() => {
  console.log('Migration runner finished');
}).catch((err) => {
  console.error('Migration runner failed:', err);
});
