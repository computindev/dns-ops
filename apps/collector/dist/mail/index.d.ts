/**
 * Mail checking module exports
 */
export { COMMON_SELECTORS, checkDKIM, checkDMARC, checkSPF, type DKIMCheckResult, type MailCheckResult, PROVIDER_SELECTORS, type ProviderSelectorInfo, performMailCheck, type RecordCheckResult, type SelectorProvenance, } from './checker.js';
export { applyDmarcAuthorDomainExistence, DMARC_TREE_WALK_QUERY_LIMIT, type DmarcDiscoveryQuery, type DmarcPolicyDiscoveryResult, discoverDmarcPolicy, } from './dmarc-discovery.js';
export { resolveDomainExists, resolveTXT } from './dns.js';
//# sourceMappingURL=index.d.ts.map