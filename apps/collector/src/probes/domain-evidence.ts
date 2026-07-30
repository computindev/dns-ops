import {
  type DomainEvidenceCheck,
  type EvidenceCheckResult,
  type ExternalEvidenceData,
  evidenceApplicability,
  purposeUndeclaredUnknown,
  type UnknownResolution,
} from '@dns-ops/contracts';
import {
  DomainProfileRepository,
  DomainRepository,
  type IDatabaseAdapter,
  ProbeObservationRepository,
  SnapshotRepository,
} from '@dns-ops/db';
import { getEnvConfig } from '../config/env.js';
import { externalEvidenceToObservation } from './external-evidence-persistence.js';
import { collectHttpWebEvidence, type HttpWebCollectionOptions } from './http-web.js';
import { collectRdapExpirationEvidence, type RdapCollectionOptions } from './rdap.js';
import { getProbeSemaphore, initProbeSemaphore } from './semaphore.js';
import {
  collectTlsCertificateEvidence,
  type TLSCertificateCollectionOptions,
} from './tls-certificate.js';

export interface DomainEvidenceCollectionOptions {
  activeProbesEnabled?: boolean;
  rdap?: RdapCollectionOptions;
  tls?: TLSCertificateCollectionOptions;
  http?: HttpWebCollectionOptions;
}

const configuredProbes = getEnvConfig().probes;
initProbeSemaphore(configuredProbes.concurrency);

function unavailable(check: string): EvidenceCheckResult<ExternalEvidenceData> {
  const unknown: UnknownResolution = {
    reason: 'UNSUPPORTED_CHECK',
    explanation: `${check} collection is disabled until active probes are explicitly enabled.`,
    action: 'NOT_CURRENTLY_OBSERVABLE',
    actionLabel: `${check} is not currently observable`,
    blocking: true,
  };
  return { status: 'UNKNOWN', unknown };
}

type PendingResult = {
  result: EvidenceCheckResult<ExternalEvidenceData>;
  check: DomainEvidenceCheck;
  hostname: string;
  port?: number;
};

export async function collectAndPersistDomainEvidence(
  db: IDatabaseAdapter,
  input: { snapshotId: string; tenantId: string; domainId: string; domain: string },
  options: DomainEvidenceCollectionOptions = {}
): Promise<number> {
  const snapshot = await new SnapshotRepository(db).findById(input.snapshotId);
  const domain = await new DomainRepository(db).findById(input.domainId);
  if (
    !snapshot ||
    snapshot.domainId !== input.domainId ||
    !domain ||
    domain.tenantId !== input.tenantId ||
    domain.normalizedName !== input.domain.toLowerCase()
  ) {
    throw new Error('Snapshot or domain is outside the tenant');
  }

  const profile = await new DomainProfileRepository(db).findByDomainId(
    input.domainId,
    input.tenantId
  );
  const purpose = profile?.purpose ?? 'UNKNOWN';
  const enabled = options.activeProbesEnabled ?? configuredProbes.enabled;
  const timeoutMs = configuredProbes.timeoutMs;
  const semaphore = getProbeSemaphore();
  const runProbe = <T>(collect: () => Promise<T>) => semaphore.run(collect);
  const results: PendingResult[] = [];

  if (evidenceApplicability(purpose, 'RDAP_EXPIRATION') === 'APPLICABLE') {
    results.push({
      result: enabled
        ? await runProbe(() =>
            collectRdapExpirationEvidence(input.domain, {
              ...options.rdap,
              timeoutMs: options.rdap?.timeoutMs ?? timeoutMs,
            })
          )
        : unavailable('RDAP expiration'),
      check: 'RDAP_EXPIRATION',
      hostname: input.domain,
      port: 443,
    });
  }

  if (evidenceApplicability(purpose, 'TLS_CERTIFICATE') === 'APPLICABLE') {
    results.push({
      result: enabled
        ? await runProbe(() =>
            collectTlsCertificateEvidence(input.domain, {
              ...options.tls,
              timeoutMs: options.tls?.timeoutMs ?? timeoutMs,
            })
          )
        : unavailable('TLS certificate'),
      check: 'TLS_CERTIFICATE',
      hostname: input.domain,
      port: 443,
    });
  }

  const webApplicability = evidenceApplicability(purpose, 'HTTP_REACHABILITY');
  if (webApplicability === 'UNKNOWN') {
    const result: EvidenceCheckResult<ExternalEvidenceData> = {
      status: 'UNKNOWN',
      unknown: purposeUndeclaredUnknown('Web evidence'),
    };
    results.push({ result, check: 'HTTP_REACHABILITY', hostname: input.domain });
    results.push({ result, check: 'REDIRECT_TOPOLOGY', hostname: input.domain });
    results.push({ result, check: 'HOMEPAGE_INDEXABILITY', hostname: input.domain });
  } else if (webApplicability === 'APPLICABLE') {
    const web = enabled
      ? await runProbe(() =>
          collectHttpWebEvidence(input.domain, {
            ...options.http,
            timeoutMs: options.http?.timeoutMs ?? timeoutMs,
          })
        )
      : null;
    if (web) {
      for (const start of web.starts) {
        results.push({
          result: start.reachability,
          check: 'HTTP_REACHABILITY',
          hostname: input.domain,
        });
        results.push({
          result: start.redirect,
          check: 'REDIRECT_TOPOLOGY',
          hostname: input.domain,
        });
      }
      if (evidenceApplicability(purpose, 'HOMEPAGE_INDEXABILITY') === 'APPLICABLE') {
        results.push({
          result: web.indexability,
          check: 'HOMEPAGE_INDEXABILITY',
          hostname: input.domain,
        });
      }
    } else {
      results.push({
        result: unavailable('HTTP reachability'),
        check: 'HTTP_REACHABILITY',
        hostname: input.domain,
      });
      results.push({
        result: unavailable('Redirect topology'),
        check: 'REDIRECT_TOPOLOGY',
        hostname: input.domain,
      });
      if (evidenceApplicability(purpose, 'HOMEPAGE_INDEXABILITY') === 'APPLICABLE') {
        results.push({
          result: unavailable('Homepage indexability'),
          check: 'HOMEPAGE_INDEXABILITY',
          hostname: input.domain,
        });
      }
    }
  }

  const observations = results.flatMap(({ result, check, hostname, port }) => {
    const observation = externalEvidenceToObservation(input.snapshotId, result, {
      check,
      hostname,
      port,
    });
    return observation ? [observation] : [];
  });
  if (observations.length === 0) return 0;
  return (await new ProbeObservationRepository(db).createMany(observations)).length;
}
