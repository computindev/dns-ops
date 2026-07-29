import { describe, expect, it } from 'vitest';
import {
  authenticateMcpBearer,
  hashMcpToken,
  parseMcpPrincipals,
  requireMcpScope,
} from './mcp-auth.js';

const token = 'this-is-a-long-random-mcp-token-value-1234567890';
const tenantId = '11111111-1111-4111-8111-111111111111';
const principal = {
  principalId: 'mcp-operator-a',
  actorId: 'actor-a',
  tenantId,
  tokenSha256: hashMcpToken(token),
  scopes: ['CASE_READ', 'SCAN_REQUEST'],
  enabled: true,
};
const secret = JSON.stringify([principal]);

describe('MCP static principal authentication', () => {
  it('derives principal, tenant, actor, and scopes solely from a token hash', () => {
    const authenticated = authenticateMcpBearer(`Bearer ${token}`, parseMcpPrincipals(secret));
    expect(authenticated).toMatchObject({
      principalId: 'mcp-operator-a',
      tenantId,
      actorId: 'actor-a',
    });
    expect(authenticated?.scopes.has('SCAN_REQUEST')).toBe(true);
  });

  it('rejects disabled, malformed, and unknown bearer tokens', () => {
    const disabled = parseMcpPrincipals(JSON.stringify([{ ...principal, enabled: false }]));
    expect(authenticateMcpBearer(`Bearer ${token}`, disabled)).toBeNull();
    expect(authenticateMcpBearer('Bearer short', parseMcpPrincipals(secret))).toBeNull();
    expect(authenticateMcpBearer(`Bearer ${token}x`, parseMcpPrincipals(secret))).toBeNull();
  });

  it('rejects raw tokens and invalid principal configuration', () => {
    expect(() =>
      parseMcpPrincipals(JSON.stringify([{ ...principal, tokenSha256: token }]))
    ).toThrow('invalid fields');
    const authenticated = authenticateMcpBearer(`Bearer ${token}`, parseMcpPrincipals(secret));
    expect(authenticated).not.toBeNull();
    if (!authenticated) throw new Error('Expected test principal');
    expect(() => requireMcpScope(authenticated, 'CASE_WRITE')).toThrow('scope denied');
  });
});
