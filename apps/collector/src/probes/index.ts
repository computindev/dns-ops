/**
 * Probes Module - Bead 10 / AUTH-003
 *
 * Non-DNS probe sandbox for safe MTA-STS/SMTP/TLS checks.
 * Tenant-scoped allowlist for multi-tenant isolation.
 */

export type { AllowlistEntry, TenantScopedAllowlist } from './allowlist.js';
// Allowlist
export {
  createTenantAllowlist,
  ProbeAllowlist,
  ProbeAllowlistManager,
  probeAllowlist,
  probeAllowlistManager,
} from './allowlist.js';
export { externalEvidenceToObservation } from './external-evidence-persistence.js';
export type {
  HttpWebCollectionOptions,
  HttpWebCollectionResult,
  HttpWebStartEvidence,
} from './http-web.js';
export { collectHttpWebEvidence } from './http-web.js';
export type { MTASTSPolicy, MTASTSProbeResult } from './mta-sts.js';
// MTA-STS Probe
export { fetchMTASTSPolicy, validateMTASTSTxtRecord } from './mta-sts.js';
export type { RdapCollectionOptions } from './rdap.js';
export { collectRdapExpirationEvidence } from './rdap.js';
export type {} from './semaphore.js';
// Probe Semaphore (concurrency control)
export { getProbeSemaphore, resetProbeSemaphore, Semaphore } from './semaphore.js';
export type { SMTPProbeResult } from './smtp-starttls.js';
// SMTP STARTTLS Probe
export { probeMXHosts, probeSMTPStarttls } from './smtp-starttls.js';
export type { SSRFCheckResult } from './ssrf-guard.js';
// SSRF Guard
export { checkResolvedIP, checkSSRF, resolveAndCheck, validateUrl } from './ssrf-guard.js';
export type {
  TLSCertificateCollectionOptions,
  TLSConnector,
  TLSProbeSocket,
  TLSSocketFactory,
} from './tls-certificate.js';
export { collectTlsCertificateEvidence } from './tls-certificate.js';
