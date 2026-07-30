export const DMARC_TREE_WALK_QUERY_LIMIT = 8;

export interface DmarcDiscoveryQuery {
  name: string;
  domain: string;
  outcome: 'NO_RECORD' | 'SINGLE_RECORD' | 'MULTIPLE_RECORDS' | 'DNS_ERROR';
  record?: string;
  error?: string;
}

export interface DmarcPolicyDiscoveryResult {
  status: 'FOUND' | 'NOT_FOUND' | 'UNKNOWN';
  authorDomain: string;
  policyDomain?: string;
  organizationalDomain?: string;
  source?: 'AUTHOR_DOMAIN' | 'ORGANIZATIONAL_DOMAIN' | 'PUBLIC_SUFFIX_DOMAIN';
  record?: string;
  authorDomainExists?: boolean;
  effectivePolicy?: 'none' | 'quarantine' | 'reject';
  effectivePolicyTag?: 'p' | 'sp' | 'np';
  policyApplication: 'DETERMINED' | 'REQUIRES_DOMAIN_EXISTENCE' | 'INVALID_POLICY' | 'NO_POLICY';
  queries: DmarcDiscoveryQuery[];
  queryLimit: typeof DMARC_TREE_WALK_QUERY_LIMIT;
  error?: string;
}

interface DiscoveredRecord {
  domain: string;
  record: string;
  psd?: 'y' | 'n';
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/\.$/, '').toLowerCase();
}

function currentDmarcRecords(records: string[]): string[] {
  return records.filter((record) => /^v[\t ]*=[\t ]*DMARC1(?:[\t ]*;|[\t ]*$)/.test(record));
}

function tagValues(record: string, tag: string): string[] {
  const values: string[] = [];
  for (const term of record.split(';')) {
    const equalIndex = term.indexOf('=');
    if (equalIndex < 0) continue;
    const name = term.slice(0, equalIndex).trim().toLowerCase();
    if (name === tag) values.push(term.slice(equalIndex + 1).trim());
  }
  return values;
}

function tagValue(record: string, tag: string): string | undefined {
  return tagValues(record, tag)[0];
}

function psdTag(record: string): 'y' | 'n' | undefined {
  const value = tagValue(record, 'psd');
  return value === 'y' || value === 'n' ? value : undefined;
}

function policyTag(
  record: string,
  tag: 'p' | 'sp' | 'np'
): 'none' | 'quarantine' | 'reject' | undefined {
  const value = tagValue(record, tag);
  return value === 'none' || value === 'quarantine' || value === 'reject' ? value : undefined;
}

function isValidDmarcUri(candidate: string): boolean {
  const uri = candidate.trim();
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9\-._~:/?#[\]@$&'()*+;=%]*$/.test(uri)) {
    return false;
  }
  return !/%(?![0-9A-Fa-f]{2})/.test(uri);
}

function hasValidReportingUri(record: string): boolean {
  const rua = tagValue(record, 'rua');
  return rua?.split(',').some(isValidDmarcUri) ?? false;
}

function determinedPolicy(
  record: string,
  policy: 'none' | 'quarantine' | 'reject',
  tag: 'p' | 'sp' | 'np'
): Pick<
  DmarcPolicyDiscoveryResult,
  'effectivePolicy' | 'effectivePolicyTag' | 'policyApplication'
> {
  const effectivePolicy =
    tagValue(record, 't') === 'y' ? (policy === 'reject' ? 'quarantine' : 'none') : policy;
  return { effectivePolicy, effectivePolicyTag: tag, policyApplication: 'DETERMINED' };
}

function invalidPolicyFallback(
  record: string
):
  | Pick<DmarcPolicyDiscoveryResult, 'effectivePolicy' | 'effectivePolicyTag' | 'policyApplication'>
  | undefined {
  const hasInvalidPolicyTag = (['p', 'sp', 'np'] as const).some((tag) => {
    const values = tagValues(record, tag);
    return values.length > 1 || (values.length === 1 && policyTag(record, tag) === undefined);
  });
  if (!hasInvalidPolicyTag && tagValue(record, 'p') !== undefined) return undefined;
  return hasValidReportingUri(record)
    ? determinedPolicy(record, 'none', 'p')
    : { policyApplication: 'INVALID_POLICY' };
}

function effectivePolicy(
  record: string,
  source: DmarcPolicyDiscoveryResult['source'],
  authorDomainExists?: boolean
): Pick<
  DmarcPolicyDiscoveryResult,
  'effectivePolicy' | 'effectivePolicyTag' | 'policyApplication'
> {
  const fallback = invalidPolicyFallback(record);
  if (fallback) return fallback;

  if (source === 'AUTHOR_DOMAIN') {
    const policy = policyTag(record, 'p');
    return policy ? determinedPolicy(record, policy, 'p') : { policyApplication: 'INVALID_POLICY' };
  }
  if (authorDomainExists === undefined) {
    return { policyApplication: 'REQUIRES_DOMAIN_EXISTENCE' };
  }

  const candidateTags: Array<'p' | 'sp' | 'np'> = authorDomainExists
    ? ['sp', 'p']
    : ['np', 'sp', 'p'];
  for (const tag of candidateTags) {
    const policy = policyTag(record, tag);
    if (policy) {
      return determinedPolicy(record, policy, tag);
    }
  }

  return { policyApplication: 'INVALID_POLICY' };
}

export function applyDmarcAuthorDomainExistence(
  discovery: DmarcPolicyDiscoveryResult,
  authorDomainExists: boolean | undefined
): DmarcPolicyDiscoveryResult {
  if (discovery.status !== 'FOUND' || !discovery.record || !discovery.source) return discovery;
  return {
    ...discovery,
    authorDomainExists,
    ...effectivePolicy(discovery.record, discovery.source, authorDomainExists),
  };
}

function childBelow(authorLabels: string[], ancestorDomain: string): string | undefined {
  const ancestorLabels = ancestorDomain.split('.');
  if (authorLabels.length <= ancestorLabels.length) return undefined;
  return authorLabels.slice(-(ancestorLabels.length + 1)).join('.');
}

/**
 * Discover the DMARC policy applicable to an Author Domain using the RFC 9989
 * DNS Tree Walk. The resolver is injected so deterministic fixtures can prove
 * the query sequence without making live DNS requests.
 */
export async function discoverDmarcPolicy(
  authorDomainInput: string,
  resolveTxt: (name: string) => Promise<string[]>,
  options: { authorDomainExists?: boolean } = {}
): Promise<DmarcPolicyDiscoveryResult> {
  const authorDomain = normalizeDomain(authorDomainInput);
  const authorLabels = authorDomain.split('.').filter(Boolean);
  const queries: DmarcDiscoveryQuery[] = [];
  const discovered: DiscoveredRecord[] = [];

  const query = async (domain: string): Promise<DiscoveredRecord | 'ERROR' | undefined> => {
    const name = `_dmarc.${domain}`;
    try {
      const records = currentDmarcRecords(await resolveTxt(name));
      if (records.length === 0) {
        queries.push({ name, domain, outcome: 'NO_RECORD' });
        return undefined;
      }
      if (records.length > 1) {
        queries.push({ name, domain, outcome: 'MULTIPLE_RECORDS' });
        return undefined;
      }

      const record = records[0];
      const found = { domain, record, psd: psdTag(record) };
      queries.push({ name, domain, outcome: 'SINGLE_RECORD', record });
      return found;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      queries.push({ name, domain, outcome: 'DNS_ERROR', error: message });
      return 'ERROR';
    }
  };

  const unknown = (): DmarcPolicyDiscoveryResult => ({
    status: 'UNKNOWN',
    authorDomain,
    policyApplication: 'NO_POLICY',
    queries,
    queryLimit: DMARC_TREE_WALK_QUERY_LIMIT,
    error: 'DMARC policy discovery stopped because a DNS query failed',
  });

  const direct = await query(authorDomain);
  if (direct === 'ERROR') return unknown();
  if (direct) {
    const source = 'AUTHOR_DOMAIN' as const;
    return {
      status: 'FOUND',
      authorDomain,
      policyDomain: authorDomain,
      organizationalDomain: direct.psd === 'n' ? authorDomain : undefined,
      source,
      record: direct.record,
      authorDomainExists: options.authorDomainExists,
      ...effectivePolicy(direct.record, source, options.authorDomainExists),
      queries,
      queryLimit: DMARC_TREE_WALK_QUERY_LIMIT,
    };
  }

  let targetLabels =
    authorLabels.length <= DMARC_TREE_WALK_QUERY_LIMIT
      ? authorLabels.slice(1)
      : authorLabels.slice(-7);
  const walkStartingDomain = targetLabels.join('.');

  while (targetLabels.length > 0 && queries.length < DMARC_TREE_WALK_QUERY_LIMIT) {
    const domain = targetLabels.join('.');
    const found = await query(domain);
    if (found === 'ERROR') return unknown();
    if (found) {
      discovered.push(found);
      if (found.psd) break;
    }
    targetLabels = targetLabels.slice(1);
  }

  if (discovered.length === 0) {
    return {
      status: 'NOT_FOUND',
      authorDomain,
      policyApplication: 'NO_POLICY',
      queries,
      queryLimit: DMARC_TREE_WALK_QUERY_LIMIT,
    };
  }

  let organizationalDomain: string | undefined;
  for (const found of discovered) {
    if (found.psd === 'n') {
      organizationalDomain = found.domain;
      break;
    }
    if (found.psd === 'y' && found.domain !== walkStartingDomain) {
      organizationalDomain = childBelow(authorLabels, found.domain);
      break;
    }
  }
  organizationalDomain ??= discovered.at(-1)?.domain;

  const organizationalRecord = discovered.find((found) => found.domain === organizationalDomain);
  const publicSuffixRecord = discovered.find((found) => found.psd === 'y');
  const applicable = organizationalRecord ?? publicSuffixRecord;

  if (!applicable) {
    return {
      status: 'NOT_FOUND',
      authorDomain,
      organizationalDomain,
      policyApplication: 'NO_POLICY',
      queries,
      queryLimit: DMARC_TREE_WALK_QUERY_LIMIT,
    };
  }

  const source =
    applicable.domain === organizationalDomain
      ? ('ORGANIZATIONAL_DOMAIN' as const)
      : ('PUBLIC_SUFFIX_DOMAIN' as const);

  return {
    status: 'FOUND',
    authorDomain,
    policyDomain: applicable.domain,
    organizationalDomain,
    source,
    record: applicable.record,
    authorDomainExists: options.authorDomainExists,
    ...effectivePolicy(applicable.record, source, options.authorDomainExists),
    queries,
    queryLimit: DMARC_TREE_WALK_QUERY_LIMIT,
  };
}
