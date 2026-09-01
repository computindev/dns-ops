/**
 * DNS Ops Workbench - Parsing Package
 *
 * Utilities for parsing DNS responses, mail records (SPF, DMARC, DKIM),
 * and formatting in dig-style output.
 */

export * from './diff/index.js';
export * from './dig/index.js';
// DNS exports (excluding normalizeDomain to avoid conflict with domain)
export {
  getWildcardBase,
  isWildcard,
  MAX_DNS_CNAME_HOPS,
  type NormalizedDNSOwner,
  normalizeDomain as normalizeDNSDomain,
  type ParsedAnswer,
  parseDNSAnswer,
  parseTXTRecord,
  tryNormalizeDNSOwner,
} from './dns/index.js';
export * from './dns/recordset.js';

// DNS Result-based parsing (gradual migration)
export {
  type DNSAnswer,
  DNSParseError,
  type DNSParseErrorCode,
  isDNSParseError,
  parseDNSAnswerResult,
  parseDNSAnswersResult,
  parseRecordSetResult,
  parseRecordSetsSafe,
  parseTXTRecordResult,
  partitionDNSAnswerResults,
  partitionRecordSetResults,
  type RecordSetParseError,
  type RecordSetResult,
  type TXTRecord,
} from './dns/result.js';

// Domain exports - CANONICAL domain normalization
export {
  DomainNormalizationError,
  isPunycode,
  isValidDomain,
  type NormalizedDomain,
  normalizeDomain,
  tryNormalizeDomain,
} from './domain/index.js';

// Domain Result-based parsing (gradual migration)
export {
  type DomainValidationCode,
  DomainValidationError,
  isDomainValidationError,
  normalizeDomainResult,
  normalizeDomainResultAsync,
  normalizeDomainsResult,
  partitionDomainResults,
  tryNormalizeDomainResult,
} from './domain/result.js';

// IDN exports (re-exported from domain for backward compatibility)
export {
  fromPunycode,
  toPunycode,
} from './idn/index.js';
export * from './mail/index.js';

// Mail Result-based parsing (gradual migration)
export {
  isMailParseError,
  type MailParseCode,
  MailParseError,
  parseAnyMailRecord,
  parseDKIMResult,
  parseDMARCResult,
  parseMailRecordsResult,
  parseMTASTSResult,
  parseSPFResult,
  partitionMailResults,
} from './mail/result.js';
