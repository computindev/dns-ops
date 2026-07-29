import { describe, expect, it } from 'vitest';
import {
  authenticateMcpBearer,
  hashMcpToken,
  parseMcpPrincipals,
  requireMcpScope,
} from './mcp-auth.js';

const token = 'this-is-a-long-random-mcp-token-value-1234567890';
const secret = JSON.stringify([
  {
    tokenHash: hashMcpToken(token),
    tenantId: 'tenant-a',
    actorId: 'actor-a',
    scopes: ['CASE_READ', 'SCAN_REQUEST'],
  },
]);

describe('MCP static principal authentication', () => {
  it('derives tenant, actor, and scopes solely from a token hash', () => {
    const principal = authenticateMcpBearer(`Bearer ${token}`, parseMcpPrincipals(secret));
    expect(principal).toMatchObject({ tenantId: 'tenant-a', actorId: 'actor-a' });
    expect(principal?.scopes.has('SCAN_REQUEST')).toBe(true);
  });

  it('rejects disabled, malformed, and unknown bearer tokens', () => {
    const disabled = parseMcpPrincipals(
      JSON.stringify([
        {
          tokenHash: hashMcpToken(token),
          tenantId: 'tenant-a',
          actorId: 'actor-a',
          scopes: [],
          disabled: true,
        },
      ])
    );
    expect(authenticateMcpBearer(`Bearer ${token}`, disabled)).toBeNull();
    expect(authenticateMcpBearer('Bearer short', parseMcpPrincipals(secret))).toBeNull();
    expect(authenticateMcpBearer(`Bearer ${token}x`, parseMcpPrincipals(secret))).toBeNull();
  });

  it('rejects raw tokens and invalid principal configuration', () => {
    expect(() =>
      parseMcpPrincipals(
        JSON.stringify([{ tokenHash: token, tenantId: 't', actorId: 'a', scopes: [] }])
      )
    ).toThrow('invalid fields');
    const principal = authenticateMcpBearer(`Bearer ${token}`, parseMcpPrincipals(secret));
    expect(principal).not.toBeNull();
    if (!principal) throw new Error('Expected test principal');
    expect(() => requireMcpScope(principal, 'CASE_WRITE')).toThrow('scope denied');
  });
});
