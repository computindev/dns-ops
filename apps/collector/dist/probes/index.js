/**
 * Probes Module - Bead 10 / AUTH-003
 *
 * Non-DNS probe sandbox for safe MTA-STS/SMTP/TLS checks.
 * Tenant-scoped allowlist for multi-tenant isolation.
 */
// Allowlist
export { createTenantAllowlist, ProbeAllowlist, ProbeAllowlistManager, probeAllowlist, probeAllowlistManager, } from './allowlist.js';
// MTA-STS Probe
export { fetchMTASTSPolicy, validateMTASTSTxtRecord } from './mta-sts.js';
// Probe Semaphore (concurrency control)
export { getProbeSemaphore, resetProbeSemaphore, Semaphore } from './semaphore.js';
// SMTP STARTTLS Probe
export { probeMXHosts, probeSMTPStarttls } from './smtp-starttls.js';
// SSRF Guard
export { checkResolvedIP, checkSSRF, validateUrl } from './ssrf-guard.js';
//# sourceMappingURL=index.js.map