/**
 * API Principal Authentication (#66)
 *
 * Hash-only runtime principal configuration following the MCP precedent
 * (apps/web/hono/lib/mcp-auth.ts): an opaque `X-API-Key` token is SHA-256
 * hashed and matched against server-stored principal entries. Tenant and
 * actor identity are derived server-side from the matched principal only —
 * callers can never assert them.
 *
 * The legacy `tenantId:actorId:secret` format survives for one release only,
 * gated behind ENABLE_LEGACY_API_KEY_AUTH, which enables legacy auth only for
 * the literal string "true" (default off in every environment, including
 * production). See docs/security/api-principal-migration.md for rotation and
 * the removal trigger.
 */

// Type declarations for runtime globals (available in Node.js 18+ and Workers).
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  };
};
declare const TextEncoder: {
  new (): { encode(input: string): Uint8Array };
};

/** Stored principal entry: hashes only, never raw tokens. */
export interface ApiPrincipal {
  principalId: string;
  tokenSha256: string;
  tenantId: string;
  actorId: string;
  enabled: boolean;
}

/** Identity derived from a verified principal (or the gated legacy path). */
export interface AuthenticatedApiPrincipal {
  tenantId: string;
  actorId: string;
}

/** Legacy compatibility gate. Off unless the flag is the literal "true". */
export interface LegacyApiKeyOptions {
  enabled: boolean;
  secret: string | undefined;
}

const TOKEN_REGEX = /^[A-Za-z0-9_-]{32,}$/;
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;
/** Exact key set of a stored principal entry — unknown keys (e.g. raw `token`/
 * `secret`) are configuration errors, not silently ignored. */
const PRINCIPAL_KEYS = ['principalId', 'tokenSha256', 'tenantId', 'actorId', 'enabled'] as const;
const CANONICAL_TENANT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
const LEGACY_IDENTIFIER_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legacy auth is enabled only for the literal "true" — unset/false/anything else is off. */
export function isLegacyApiKeyAuthEnabled(flag: string | undefined): boolean {
  return flag === 'true';
}

/** Hash an opaque API token to its lowercase hex SHA-256 digest. */
export async function hashApiToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Bounded, fixed-work comparison of two 64-char hex digests. Comparing only
 * digests (never raw tokens) — a prefix leak reveals nothing without a
 * SHA-256 preimage.
 */
function fixedWorkEqualHex(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/**
 * Compare non-empty secrets through SHA-256 digests and a bounded, fixed-work
 * hex comparison. Missing or empty values never authenticate.
 */
export async function compareSecret(
  supplied: string | undefined,
  expected: string | undefined
): Promise<boolean> {
  if (!supplied || !expected) return false;
  const [suppliedHash, expectedHash] = await Promise.all([
    hashApiToken(supplied),
    hashApiToken(expected),
  ]);
  return fixedWorkEqualHex(suppliedHash, expectedHash);
}

/**
 * Parse API_PRINCIPALS_JSON. Returns [] when unset. Throws on malformed
 * configuration so callers fail closed — never fall back to legacy on error.
 */
export function parseApiPrincipals(secret: string | undefined): ApiPrincipal[] {
  if (!secret) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error('API principal configuration is invalid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('API principal configuration must be an array');

  const principals: ApiPrincipal[] = [];
  const seenPrincipalIds = new Set<string>();
  const seenTokenHashes = new Set<string>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('API principal is invalid');
    }
    const value = candidate as Record<string, unknown>;
    const unknownKeys = Object.keys(value).filter((key) => !PRINCIPAL_KEYS.includes(key as never));
    if (unknownKeys.length > 0) {
      // Field names only — never echo values, which could be raw secrets.
      throw new Error(`API principal has unknown fields: ${unknownKeys.join(', ')}`);
    }
    if (
      typeof value.principalId !== 'string' ||
      !value.principalId ||
      typeof value.tokenSha256 !== 'string' ||
      !SHA256_HEX_REGEX.test(value.tokenSha256) ||
      typeof value.tenantId !== 'string' ||
      !CANONICAL_TENANT_UUID_REGEX.test(value.tenantId) ||
      typeof value.actorId !== 'string' ||
      !value.actorId ||
      typeof value.enabled !== 'boolean'
    ) {
      throw new Error('API principal has invalid fields');
    }
    if (seenPrincipalIds.has(value.principalId)) {
      throw new Error(`Duplicate API principalId: ${value.principalId}`);
    }
    if (seenTokenHashes.has(value.tokenSha256)) {
      throw new Error('Duplicate API principal token hash');
    }
    seenPrincipalIds.add(value.principalId);
    seenTokenHashes.add(value.tokenSha256);
    principals.push({
      principalId: value.principalId,
      tokenSha256: value.tokenSha256,
      tenantId: value.tenantId.toLowerCase(),
      actorId: value.actorId,
      enabled: value.enabled,
    });
  }
  return principals;
}

/**
 * Authenticate an `X-API-Key` header value against the stored principals.
 *
 * - Bare opaque token (no ':'): hash → match enabled principal → stored identity.
 * - `tenantId:actorId:secret`: exactly three colon-separated fields; legacy
 *   path only when `legacy.enabled` is true (literal flag) and the shared
 *   secret matches. Never reached otherwise.
 *
 * Returns null for unknown/disabled tokens, malformed credentials, or when the
 * legacy gate is off.
 */
export async function authenticateApiKey(
  apiKey: string | undefined,
  principals: readonly ApiPrincipal[],
  legacy: LegacyApiKeyOptions
): Promise<AuthenticatedApiPrincipal | null> {
  if (!apiKey) return null;

  if (!apiKey.includes(':')) {
    if (!TOKEN_REGEX.test(apiKey)) return null;
    const tokenHash = await hashApiToken(apiKey);
    const principal = principals.find(
      (candidate) => candidate.enabled && fixedWorkEqualHex(candidate.tokenSha256, tokenHash)
    );
    if (!principal) return null;
    return { tenantId: principal.tenantId, actorId: principal.actorId };
  }

  if (!legacy.enabled) return null;

  const parts = apiKey.split(':');
  if (parts.length !== 3) return null;
  const [tenantId, actorId, secret] = parts;
  if (!legacy.secret) return null;
  // Compare digests, not raw secrets, so the comparison is bounded/fixed-work.
  if (!fixedWorkEqualHex(await hashApiToken(secret), await hashApiToken(legacy.secret))) {
    return null;
  }
  if (
    !tenantId ||
    !actorId ||
    !(LEGACY_IDENTIFIER_UUID_REGEX.test(tenantId) || LEGACY_IDENTIFIER_REGEX.test(tenantId)) ||
    !(LEGACY_IDENTIFIER_UUID_REGEX.test(actorId) || LEGACY_IDENTIFIER_REGEX.test(actorId))
  ) {
    return null;
  }
  return { tenantId, actorId };
}
