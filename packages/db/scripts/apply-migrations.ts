#!/usr/bin/env npx tsx
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const migrations = join(dirname(fileURLToPath(import.meta.url)), '../src/migrations');
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  for (const file of readdirSync(migrations)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const statements = readFileSync(join(migrations, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already exists') && !message.includes('duplicate_object'))
          throw error;
      }
    }
  }
} finally {
  await client.end();
}
