/**
 * Probes Module - Bead 10 / AUTH-003
 *
 * Non-DNS probe sandbox for safe MTA-STS/SMTP/TLS checks.
 * Tenant-scoped allowlist for multi-tenant isolation.
 */
export type { AllowlistEntry, TenantScopedAllowlist } from './allowlist.js';
export { createTenantAllowlist, ProbeAllowlist, ProbeAllowlistManager, probeAllowlist, probeAllowlistManager, } from './allowlist.js';
export type { MTASTSPolicy, MTASTSProbeResult } from './mta-sts.js';
export { fetchMTASTSPolicy, validateMTASTSTxtRecord } from './mta-sts.js';
export type {} from './semaphore.js';
export { getProbeSemaphore, resetProbeSemaphore, Semaphore } from './semaphore.js';
export type { SMTPProbeResult } from './smtp-starttls.js';
export { probeMXHosts, probeSMTPStarttls } from './smtp-starttls.js';
export type { SSRFCheckResult } from './ssrf-guard.js';
export { checkResolvedIP, checkSSRF, validateUrl } from './ssrf-guard.js';
//# sourceMappingURL=index.d.ts.map