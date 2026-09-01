/**
 * Mail checking module exports
 */
export { COMMON_SELECTORS, checkDKIM, checkDMARC, checkSPF, PROVIDER_SELECTORS, performMailCheck, } from './checker.js';
export { applyDmarcAuthorDomainExistence, DMARC_TREE_WALK_QUERY_LIMIT, discoverDmarcPolicy, } from './dmarc-discovery.js';
export { resolveDomainExists, resolveTXT } from './dns.js';
//# sourceMappingURL=index.js.map