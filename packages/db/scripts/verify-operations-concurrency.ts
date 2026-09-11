#!/usr/bin/env npx tsx
/**
 * Verifies database-enforced canonical-signal deduplication and case-version CAS
 * against a freshly migrated, disposable PostgreSQL schema.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run --filter @dns-ops/db verify-operations-concurrency
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_SCHEMA = `operations_concurrency_${Date.now()}`;
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222';

function schemaQuery(schema: string): string {
  return `SET search_path TO "${schema}", public`;
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  await client.query(schemaQuery(TEST_SCHEMA));
  const migrationDirectory = join(__dirname, '../src/migrations');
  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const statements = readFileSync(join(migrationDirectory, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await client.query(statement);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for isolated concurrency verification');
  }

  const setup = new Client({ connectionString });
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  try {
    await setup.connect();
    await applyMigrations(setup);
    await setup.query(
      `INSERT INTO domains (id, name, normalized_name, zone_management, tenant_id)
       VALUES ($1, 'concurrency.example', 'concurrency.example', 'managed', $2)`,
      [DOMAIN_ID, TENANT_ID]
    );

    await Promise.all([first.connect(), second.connect()]);
    await Promise.all([
      first.query(schemaQuery(TEST_SCHEMA)),
      second.query(schemaQuery(TEST_SCHEMA)),
    ]);

    const conditionKey = `${TENANT_ID}:${DOMAIN_ID}:MAIL_DNS_CONFIGURATION_REGRESSION:spf`;
    const inserts = await Promise.allSettled(
      [first, second].map((client) =>
        client.query(
          `INSERT INTO internal_signals (tenant_id, domain_id, kind, condition_key)
           VALUES ($1, $2, 'MAIL_DNS_CONFIGURATION_REGRESSION', $3)
           RETURNING id`,
          [TENANT_ID, DOMAIN_ID, conditionKey]
        )
      )
    );
    const successfulInserts = inserts.filter(
      (result): result is PromiseFulfilledResult<pg.QueryResult<{ id: string }>> =>
        result.status === 'fulfilled'
    );
    const duplicateInserts = inserts.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (successfulInserts.length !== 1 || duplicateInserts.length !== 1) {
      throw new Error('Canonical signal uniqueness did not admit exactly one concurrent insert');
    }
    const duplicateCode = (duplicateInserts[0].reason as { code?: unknown }).code;
    if (duplicateCode !== '23505') {
      throw new Error(
        `Expected unique-constraint conflict 23505, received ${String(duplicateCode)}`
      );
    }

    const signalId = successfulInserts[0].value.rows[0]?.id;
    if (!signalId) throw new Error('Canonical signal insert did not return an ID');
    const caseResult = await setup.query<{ id: string }>(
      `INSERT INTO internal_cases (tenant_id, signal_id)
       VALUES ($1, $2)
       RETURNING id`,
      [TENANT_ID, signalId]
    );
    const caseId = caseResult.rows[0]?.id;
    if (!caseId) throw new Error('Canonical case insert did not return an ID');

    const updates = await Promise.all([
      first.query(
        `UPDATE internal_cases
         SET disposition = 'first', version = version + 1, updated_at = now()
         WHERE id = $1 AND version = 1
         RETURNING id`,
        [caseId]
      ),
      second.query(
        `UPDATE internal_cases
         SET disposition = 'second', version = version + 1, updated_at = now()
         WHERE id = $1 AND version = 1
         RETURNING id`,
        [caseId]
      ),
    ]);
    const updateCount = updates.reduce((total, result) => total + result.rowCount, 0);
    if (updateCount !== 1) {
      throw new Error(`Case version CAS admitted ${updateCount} concurrent updates instead of one`);
    }

    const dispositions = await Promise.all([
      first.query(
        `UPDATE internal_cases
         SET disposition = 'ack-first', status = 'ACKNOWLEDGED', version = version + 1, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND status = 'OPEN' AND version = 2
         RETURNING id`,
        [caseId, TENANT_ID]
      ),
      second.query(
        `UPDATE internal_cases
         SET disposition = 'ack-second', status = 'ACKNOWLEDGED', version = version + 1, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 AND status = 'OPEN' AND version = 2
         RETURNING id`,
        [caseId, TENANT_ID]
      ),
    ]);
    const dispositionCount = dispositions.reduce((total, result) => total + result.rowCount, 0);
    if (dispositionCount !== 1) {
      throw new Error(
        `setCaseDisposition CAS admitted ${dispositionCount} concurrent OPEN to ACKNOWLEDGED updates`
      );
    }

    const monitoredId = '33333333-3333-4333-8333-333333333333';
    const alertId = '44444444-4444-4444-8444-444444444444';
    await setup.query(
      `INSERT INTO monitored_domains (id, domain_id, alert_channels, created_by, tenant_id)
       VALUES ($1, $2, '{}'::jsonb, 'system', $3)`,
      [monitoredId, DOMAIN_ID, TENANT_ID]
    );
    await setup.query(
      `INSERT INTO alerts (id, monitored_domain_id, title, description, severity, status, tenant_id)
       VALUES ($1, $2, 'Canonical alert', 'Seeded concurrent claim', 'high', 'pending', $3)`,
      [alertId, monitoredId, TENANT_ID]
    );
    const claims = await Promise.all([
      first.query(
        `UPDATE alerts
         SET notification_claimed_until = now() + interval '30 seconds',
             notification_claim_token = gen_random_uuid()
         WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
           AND (notification_claimed_until IS NULL OR notification_claimed_until < now())
         RETURNING id`,
        [alertId, TENANT_ID]
      ),
      second.query(
        `UPDATE alerts
         SET notification_claimed_until = now() + interval '30 seconds',
             notification_claim_token = gen_random_uuid()
         WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
           AND (notification_claimed_until IS NULL OR notification_claimed_until < now())
         RETURNING id`,
        [alertId, TENANT_ID]
      ),
    ]);
    const claimCount = claims.reduce((total, result) => total + result.rowCount, 0);
    if (claimCount !== 1) {
      throw new Error(
        `Notification claim CAS admitted ${claimCount} concurrent claims instead of one`
      );
    }

    console.log(
      '✅ Isolated canonical-signal uniqueness, case-version CAS, disposition CAS, and notification claim verification passed'
    );
  } finally {
    await Promise.allSettled([first.end(), second.end()]);
    try {
      await setup.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    } finally {
      await setup.end();
    }
  }
}

main().catch((error) => {
  console.error('❌ Isolated operations concurrency verification failed:', error);
  process.exitCode = 1;
});
