export const DOMAIN_PURPOSES = [
  'WEB',
  'MAIL',
  'WEB_AND_MAIL',
  'REDIRECT',
  'PARKED',
  'UNKNOWN',
] as const;

export type DomainPurpose = (typeof DOMAIN_PURPOSES)[number];

export const DOMAIN_CRITICALITIES = ['HIGH', 'NORMAL', 'LOW'] as const;

export type DomainCriticality = (typeof DOMAIN_CRITICALITIES)[number];

export interface InternalDomainProfile {
  domainId: string;
  purpose: DomainPurpose;
  responsibleActorId?: string;
  criticality: DomainCriticality;
}

export type DomainEvidenceCheck =
  | 'RDAP_EXPIRATION'
  | 'TLS_CERTIFICATE'
  | 'HTTP_REACHABILITY'
  | 'REDIRECT_TOPOLOGY'
  | 'HOMEPAGE_INDEXABILITY';

export type EvidenceApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

/**
 * Purpose is declared by an operator and is never inferred from observed DNS or
 * web behavior. RDAP applies to every registered portfolio domain; web checks
 * require an explicit web or redirect purpose.
 */
export function evidenceApplicability(
  purpose: DomainPurpose,
  check: DomainEvidenceCheck
): EvidenceApplicability {
  if (check === 'RDAP_EXPIRATION') return 'APPLICABLE';
  if (purpose === 'UNKNOWN') return 'UNKNOWN';

  if (purpose === 'WEB' || purpose === 'WEB_AND_MAIL') return 'APPLICABLE';
  if (purpose === 'REDIRECT') {
    return check === 'HOMEPAGE_INDEXABILITY' ? 'NOT_APPLICABLE' : 'APPLICABLE';
  }

  return 'NOT_APPLICABLE';
}
