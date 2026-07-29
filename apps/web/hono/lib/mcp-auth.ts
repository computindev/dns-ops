import { createHash, timingSafeEqual } from 'node:crypto';

export const MCP_SCOPES = [
  'DOMAIN_READ',
  'SIGNAL_READ',
  'CASE_READ',
  'CASE_WRITE',
  'SCAN_REQUEST',
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export interface McpPrincipal {
  tokenHash: string;
  tenantId: string;
  actorId: string;
  scopes: McpScope[];
  disabled?: boolean;
}

export interface AuthenticatedMcpPrincipal {
  tenantId: string;
  actorId: string;
  scopes: ReadonlySet<McpScope>;
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseMcpPrincipals(secret: string | undefined): McpPrincipal[] {
  if (!secret) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error('MCP principal configuration is invalid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('MCP principal configuration must be an array');
  return parsed.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('MCP principal is invalid');
    const value = candidate as Record<string, unknown>;
    if (
      typeof value.tokenHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.tokenHash) ||
      typeof value.tenantId !== 'string' ||
      !value.tenantId ||
      typeof value.actorId !== 'string' ||
      !value.actorId ||
      !Array.isArray(value.scopes) ||
      value.scopes.some((scope) => !MCP_SCOPES.includes(scope as McpScope)) ||
      (typeof value.disabled !== 'undefined' && typeof value.disabled !== 'boolean')
    )
      throw new Error('MCP principal has invalid fields');
    return {
      tokenHash: value.tokenHash,
      tenantId: value.tenantId,
      actorId: value.actorId,
      scopes: value.scopes as McpScope[],
      disabled: value.disabled as boolean | undefined,
    };
  });
}

function fixedEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authenticateMcpBearer(
  authorization: string | undefined,
  principals: readonly McpPrincipal[]
): AuthenticatedMcpPrincipal | null {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/);
  if (!match) return null;
  const tokenHash = hashMcpToken(match[1]);
  const principal = principals.find((candidate) => fixedEqual(candidate.tokenHash, tokenHash));
  if (!principal || principal.disabled) return null;
  return {
    tenantId: principal.tenantId,
    actorId: principal.actorId,
    scopes: new Set(principal.scopes),
  };
}

export function requireMcpScope(principal: AuthenticatedMcpPrincipal, scope: McpScope): void {
  if (!principal.scopes.has(scope)) throw new Error('MCP scope denied');
}
