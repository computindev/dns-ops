import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const IDEMPOTENT_ERROR_CODES = new Set(['42P07', '42710', '42P06', '42701']);

function isIdempotentMigrationError(err) {
  const message = String(err?.message ?? '').toLowerCase();
  return IDEMPOTENT_ERROR_CODES.has(err?.code) || message.includes('already exists');
}

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('=== Migration Runner Starting ===');

  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required to run migrations');
  }

  console.log(`DATABASE_URL found: ${dbUrl.substring(0, 40)}...`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=no-verify') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');

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
        if (isIdempotentMigrationError(err)) {
          console.log(
            `Skipping ${file} (idempotent object already exists): ${err.code ?? ''} ${err.message}`
          );
          continue;
        }
        console.error(`Error in ${file}:`, err.code, err.message);
        throw err;
      }
    }

    console.log('=== Migrations Complete ===');
  } finally {
    await client.end().catch(() => undefined);
  }
}

runMigrations()
  .then(() => {
    console.log('Migration runner finished');
  })
  .catch((err) => {
    console.error('Migration runner failed:', err);
    process.exit(1);
  });
