/**
 * API Principal tests (#66)
 *
 * Hash-only runtime principal configuration: token → SHA-256 → stored
 * principal, tenant/actor derived server-side only, legacy path gated behind
 * a literal-true flag that defaults off.
 */

import { describe, expect, it } from 'vitest';
import {
  type ApiPrincipal,
  authenticateApiKey,
  compareSecret,
  hashApiToken,
  isLegacyApiKeyAuthEnabled,
  parseApiPrincipals,
} from './api-principal.js';

const TOKEN = 'principal-test-token-0123456789abcdef0123456789';
const OTHER_TOKEN = 'another-principal-token-0123456789abcdef01234567';
const TENANT_A = '550e8400-e29b-41d4-a716-446655440000';
const TENANT_B = '660e8400-e29b-41d4-a716-446655440000';

function principalEntry(overrides: Partial<ApiPrincipal> = {}): Record<string, unknown> {
  return {
    principalId: 'principal-1',
    tokenSha256: hashApiTokenSync(TOKEN),
    tenantId: TENANT_A,
    actorId: 'stored-actor',
    enabled: true,
    ...overrides,
  };
}

// Synchronous stand-in for test fixtures only; production paths use hashApiToken.
import { createHash } from 'node:crypto';

function hashApiTokenSync(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function legacyOff() {
  return { enabled: false, secret: 'legacy-shared-secret-123' };
}

function legacyOn() {
  return { enabled: true, secret: 'legacy-shared-secret-123' };
}

describe('hashApiToken', () => {
  it('produces the known SHA-256 hex digest', async () => {
    expect(await hashApiToken(TOKEN)).toBe(hashApiTokenSync(TOKEN));
    expect(await hashApiToken(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes deterministically and distinctly', async () => {
    expect(await hashApiToken(TOKEN)).toBe(await hashApiToken(TOKEN));
    expect(await hashApiToken(TOKEN)).not.toBe(await hashApiToken(OTHER_TOKEN));
  });
});

describe('compareSecret', () => {
  it('accepts matching non-empty secrets', async () => {
    expect(await compareSecret('shared-secret', 'shared-secret')).toBe(true);
  });

  it('rejects mismatched secrets', async () => {
    expect(await compareSecret('shared-secret', 'wrong-secret')).toBe(false);
  });

  it('rejects empty or missing secrets', async () => {
    expect(await compareSecret('', 'shared-secret')).toBe(false);
    expect(await compareSecret('shared-secret', '')).toBe(false);
    expect(await compareSecret(undefined, 'shared-secret')).toBe(false);
    expect(await compareSecret('shared-secret', undefined)).toBe(false);
  });
});

describe('isLegacyApiKeyAuthEnabled', () => {
  it('is enabled only for the literal "true"', () => {
    expect(isLegacyApiKeyAuthEnabled('true')).toBe(true);
    expect(isLegacyApiKeyAuthEnabled(undefined)).toBe(false);
    expect(isLegacyApiKeyAuthEnabled('false')).toBe(false);
    expect(isLegacyApiKeyAuthEnabled('True')).toBe(false);
    expect(isLegacyApiKeyAuthEnabled('1')).toBe(false);
    expect(isLegacyApiKeyAuthEnabled('')).toBe(false);
  });
});

describe('parseApiPrincipals', () => {
  it('returns an empty list when unset', () => {
    expect(parseApiPrincipals(undefined)).toEqual([]);
    expect(parseApiPrincipals('')).toEqual([]);
  });

  it('parses a valid principal entry', () => {
    const principals = parseApiPrincipals(JSON.stringify([principalEntry()]));
    expect(principals).toHaveLength(1);
    expect(principals[0]).toEqual({
      principalId: 'principal-1',
      tokenSha256: hashApiTokenSync(TOKEN),
      tenantId: TENANT_A,
      actorId: 'stored-actor',
      enabled: true,
    });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseApiPrincipals('{')).toThrow('invalid JSON');
  });

  it('throws when configuration is not an array', () => {
    expect(() => parseApiPrincipals('{"principalId":"x"}')).toThrow('must be an array');
  });

  it('throws on a raw token where a hash is required', () => {
    expect(() =>
      parseApiPrincipals(JSON.stringify([principalEntry({ tokenSha256: TOKEN })]))
    ).toThrow('invalid fields');
  });

  it('throws on unknown fields including raw token or secret keys', () => {
    const rawSecretEntries: Array<Record<string, unknown>> = [
      { ...principalEntry(), token: 'raw-token-value' },
      { ...principalEntry(), secret: 'raw-secret-value' },
      { ...principalEntry(), apiKey: 'raw-key-value' },
      { ...principalEntry(), scopes: ['reports:read'] },
    ];
    for (const entry of rawSecretEntries) {
      expect(() => parseApiPrincipals(JSON.stringify([entry]))).toThrow('unknown fields');
    }
  });

  it('throws on non-hex or wrong-length token hashes', () => {
    expect(() =>
      parseApiPrincipals(JSON.stringify([principalEntry({ tokenSha256: 'Z'.repeat(64) })]))
    ).toThrow('invalid fields');
    expect(() =>
      parseApiPrincipals(JSON.stringify([principalEntry({ tokenSha256: 'a'.repeat(63) })]))
    ).toThrow('invalid fields');
  });

  it('throws on non-canonical tenant UUIDs', () => {
    expect(() =>
      parseApiPrincipals(JSON.stringify([principalEntry({ tenantId: 'my-tenant' })]))
    ).toThrow('invalid fields');
    expect(() => parseApiPrincipals(JSON.stringify([principalEntry({ tenantId: '' })]))).toThrow(
      'invalid fields'
    );
  });

  it('throws on missing or invalid fields', () => {
    const invalid: Array<Record<string, unknown>> = [
      { principalId: '' },
      { actorId: '' },
      { enabled: 'yes' },
      { enabled: 1 },
    ];
    for (const overrides of invalid) {
      expect(() => parseApiPrincipals(JSON.stringify([principalEntry(overrides)]))).toThrow(
        'invalid fields'
      );
    }
  });

  it('throws on duplicate principal ids and duplicate token hashes', () => {
    expect(() =>
      parseApiPrincipals(JSON.stringify([principalEntry(), principalEntry({ tenantId: TENANT_B })]))
    ).toThrow('Duplicate API principalId: principal-1');
    expect(() =>
      parseApiPrincipals(
        JSON.stringify([
          principalEntry(),
          principalEntry({ principalId: 'principal-2', tenantId: TENANT_B }),
        ])
      )
    ).toThrow('Duplicate API principal token hash');
    expect(() =>
      parseApiPrincipals(
        JSON.stringify([
          principalEntry(),
          principalEntry({
            principalId: 'principal-2',
            tokenSha256: hashApiTokenSync(OTHER_TOKEN),
            tenantId: TENANT_B,
          }),
        ])
      )
    ).not.toThrow();
  });
});

describe('authenticateApiKey', () => {
  const principals = () => parseApiPrincipals(JSON.stringify([principalEntry()]));

  it('maps a bare token to the stored principal identity', async () => {
    const auth = await authenticateApiKey(TOKEN, principals(), legacyOff());
    expect(auth).toEqual({ tenantId: TENANT_A, actorId: 'stored-actor' });
  });

  it('rejects unknown tokens', async () => {
    expect(await authenticateApiKey(OTHER_TOKEN, principals(), legacyOff())).toBeNull();
  });

  it('rejects disabled principals', async () => {
    const disabled = parseApiPrincipals(JSON.stringify([principalEntry({ enabled: false })]));
    expect(await authenticateApiKey(TOKEN, disabled, legacyOff())).toBeNull();
  });

  it('rejects malformed bare tokens', async () => {
    expect(await authenticateApiKey('short', principals(), legacyOff())).toBeNull();
    expect(
      await authenticateApiKey('has space and symbols!@#', principals(), legacyOff())
    ).toBeNull();
    expect(await authenticateApiKey(undefined, principals(), legacyOff())).toBeNull();
  });

  it('rejects legacy credentials when the legacy gate is off', async () => {
    const header = `forged-tenant:forged-actor:${'legacy-shared-secret-123'}`;
    expect(await authenticateApiKey(header, principals(), legacyOff())).toBeNull();
    expect(
      await authenticateApiKey(header, principals(), { enabled: false, secret: undefined })
    ).toBeNull();
  });

  it('accepts legacy credentials only when explicitly enabled and the secret matches', async () => {
    const header = `legacy-tenant:legacy-actor:${'legacy-shared-secret-123'}`;
    expect(await authenticateApiKey(header, principals(), legacyOn())).toEqual({
      tenantId: 'legacy-tenant',
      actorId: 'legacy-actor',
    });
    expect(
      await authenticateApiKey('legacy-tenant:legacy-actor:wrong', principals(), legacyOn())
    ).toBeNull();
    expect(
      await authenticateApiKey('legacy-tenant:legacy-actor:', principals(), {
        enabled: true,
        secret: undefined,
      })
    ).toBeNull();
  });

  it('rejects legacy credentials with trailing fields', async () => {
    expect(
      await authenticateApiKey(
        'legacy-tenant:legacy-actor:legacy-shared-secret-123:ignored',
        principals(),
        legacyOn()
      )
    ).toBeNull();
  });

  it('rejects invalid legacy identifiers even when enabled', async () => {
    expect(
      await authenticateApiKey(
        'tenant with spaces:actor:legacy-shared-secret-123',
        principals(),
        legacyOn()
      )
    ).toBeNull();
    expect(
      await authenticateApiKey(
        'tenant:actor with spaces:legacy-shared-secret-123',
        principals(),
        legacyOn()
      )
    ).toBeNull();
  });

  it('accepts UUID legacy identifiers when enabled', async () => {
    const header = `${TENANT_B}:actor-1:${'legacy-shared-secret-123'}`;
    expect(await authenticateApiKey(header, principals(), legacyOn())).toEqual({
      tenantId: TENANT_B,
      actorId: 'actor-1',
    });
  });
});
