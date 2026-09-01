/**
 * Mail Rules Pack - Bead 09
 *
 * First benchmark-backed mail rules:
 * 1. MX present/absent
 * 2. Null MX posture
 * 3. SPF exists/malformed/absent
 * 4. DMARC exists/policy posture
 * 5. DKIM key presence for discovered selectors
 * 6. MTA-STS TXT presence
 * 7. TLS-RPT TXT presence
 * 8. BIMI as info-only
 */

import type { Observation } from '@dns-ops/db';
import { assessFirstLevelSpf, parseDMARC, parseSPF } from '@dns-ops/parsing';
import type { Rule, RuleContext, RuleResult } from '../engine/index.js';

// =============================================================================
// Rule 1: MX Record Presence
// =============================================================================

export const mxPresenceRule: Rule = {
  id: 'mail.mx-presence.v1',
  name: 'MX Record Presence',
  description: 'Detects presence or absence of MX records',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    // Find MX observations for the apex domain
    const mxObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'MX' && obs.queryName.toLowerCase() === context.domainName.toLowerCase()
    );

    const successfulObs = mxObservations.filter((obs) => obs.status === 'success');
    const hasMx = successfulObs.some((obs) => obs.answerSection && obs.answerSection.length > 0);

    // Check for Null MX (0 .)
    const nullMxObs = successfulObs.find((obs) =>
      obs.answerSection?.some((a) => /^0\s+\.$/.test(a.data.trim()))
    );

    if (nullMxObs) {
      return {
        finding: {
          type: 'mail.null-mx-configured',
          title: `Null MX configured for ${context.domainName}`,
          description: `${context.domainName} has a Null MX record (priority 0, target "."), explicitly indicating that the domain does not accept email. This is a valid configuration for domains that should not receive mail.`,
          severity: 'info',
          confidence: 'certain',
          riskPosture: 'safe',
          blastRadius: 'none',
          reviewOnly: false,
          evidence: mxObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status}${obs.answerSection ? ` - ${obs.answerSection.map((a) => a.data).join(', ')}` : ''}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
      };
    }

    if (!hasMx) {
      // Check if there were any failures
      const failures = mxObservations.filter(
        (obs) => obs.status === 'timeout' || obs.status === 'error' || obs.status === 'refused'
      );

      if (failures.length > 0 && successfulObs.length === 0) {
        return {
          finding: {
            type: 'mail.mx-query-failed',
            title: `MX query failed for ${context.domainName}`,
            description: `Could not determine MX status for ${context.domainName} due to query failures: ${failures.map((f) => f.status).join(', ')}. This is not the same as "no MX record".`,
            severity: 'medium',
            confidence: 'low',
            riskPosture: 'medium',
            blastRadius: 'single-domain',
            reviewOnly: true,
            evidence: mxObservations.map((obs) => ({
              observationId: obs.id,
              description: `${obs.vantageType}: ${obs.status}${obs.errorMessage ? ` - ${obs.errorMessage}` : ''}`,
            })),
            ruleId: this.id,
            ruleVersion: this.version,
          },
        };
      }

      return {
        finding: {
          type: 'mail.no-mx-record',
          title: `No MX record for ${context.domainName}`,
          description: `${context.domainName} has no MX record. Mail will fall back to A/AAAA record lookups (if they exist). This is discouraged per RFC 5321 but may be intentional.`,
          severity: 'medium',
          confidence: 'certain',
          riskPosture: 'medium',
          blastRadius: 'single-domain',
          reviewOnly: false,
          evidence: mxObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Review MX routing readiness',
            description:
              'Declare whether this domain receives mail, then obtain exact targets from the confirmed provider. This guidance contains no approved record value.',
            action: 'Playbook: mail.mx.purpose-and-provider',
            riskPosture: 'medium',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    // Has MX - get the values
    const mxRecordSet = context.recordSets.find(
      (rs) => rs.type === 'MX' && rs.name.toLowerCase() === context.domainName.toLowerCase()
    );

    return {
      finding: {
        type: 'mail.mx-present',
        title: `MX record present for ${context.domainName}`,
        description: `${context.domainName} has MX record(s): ${mxRecordSet?.values.join(', ') || 'configured'}. Mail delivery is explicitly configured.`,
        severity: 'info',
        confidence: 'certain',
        riskPosture: 'safe',
        blastRadius: 'none',
        reviewOnly: false,
        evidence: mxObservations.map((obs) => ({
          observationId: obs.id,
          description: `${obs.vantageType}: ${obs.answerSection?.map((a) => a.data).join(', ') || 'no answer'}`,
        })),
        ruleId: this.id,
        ruleVersion: this.version,
      },
    };
  },
};

// =============================================================================
// Rule 2: SPF Record Analysis
// =============================================================================

export const spfRule: Rule = {
  id: 'mail.spf-analysis.v1',
  name: 'SPF Record Analysis',
  description: 'Analyzes SPF record presence, validity, and configuration',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    // Find all TXT record queries at apex
    const allTxtObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'TXT' && obs.queryName.toLowerCase() === context.domainName.toLowerCase()
    );

    // Filter to successful observations for SPF detection
    const successfulTxtObs = allTxtObservations.filter((obs) => obs.status === 'success');

    // Check if any TXT queries failed entirely
    const failedTxtObs = allTxtObservations.filter(
      (obs) => obs.status === 'timeout' || obs.status === 'error' || obs.status === 'refused'
    );

    // Look for SPF record in successful answers
    let spfRecord: string | null = null;
    let spfObservation: Observation | null = null;

    for (const obs of successfulTxtObs) {
      for (const answer of obs.answerSection || []) {
        if (answer.data.includes('v=spf1')) {
          spfRecord = answer.data;
          spfObservation = obs;
          break;
        }
      }
      if (spfRecord) break;
    }

    // If no SPF found and some TXT queries failed, report uncertainty
    if (!spfRecord && failedTxtObs.length > 0 && successfulTxtObs.length === 0) {
      return {
        finding: {
          type: 'mail.spf-query-failed',
          title: `SPF query failed for ${context.domainName}`,
          description: `Could not determine SPF status for ${context.domainName} due to query failures: ${failedTxtObs.map((f) => f.status).join(', ')}. This is not the same as "no SPF record".`,
          severity: 'medium',
          confidence: 'low',
          riskPosture: 'medium',
          blastRadius: 'single-domain',
          reviewOnly: true,
          evidence: allTxtObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status}${obs.errorMessage ? ` - ${obs.errorMessage}` : ''}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
      };
    }

    if (!spfRecord) {
      return {
        finding: {
          type: 'mail.no-spf-record',
          title: `No SPF record for ${context.domainName}`,
          description: `${context.domainName} has no SPF record. Without SPF, anyone can forge email appearing to come from this domain. This is a security risk.`,
          severity: 'high',
          confidence: 'certain',
          riskPosture: 'high',
          blastRadius: 'single-domain',
          reviewOnly: false,
          evidence: allTxtObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status} — no SPF record found`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Review SPF readiness',
            description:
              'Inventory authorized senders and confirm provider instructions before planning SPF. This guidance contains no approved record value.',
            action: 'Playbook: mail.spf.provider-confirmation',
            riskPosture: 'medium',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    // Parse SPF record
    const parsed = parseSPF(spfRecord);

    if (!parsed) {
      return {
        finding: {
          type: 'mail.spf-malformed',
          title: `Malformed SPF record for ${context.domainName}`,
          description: `${context.domainName} has an SPF record that could not be parsed: "${spfRecord}". This may cause mail delivery issues as receiving servers may reject or flag emails.`,
          severity: 'critical',
          confidence: 'certain',
          riskPosture: 'critical',
          blastRadius: 'single-domain',
          reviewOnly: true,
          evidence: spfObservation
            ? [
                {
                  observationId: spfObservation.id,
                  description: `Raw SPF record: ${spfRecord}`,
                },
              ]
            : [],
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Review SPF syntax',
            description: `The SPF record has syntax errors that need correction.`,
            action: 'Playbook: mail.spf.syntax-review',
            riskPosture: 'high',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    const assessment = assessFirstLevelSpf(parsed);
    if (assessment.status === 'DIRECT_SYNTAX_INVALID') {
      return {
        finding: {
          type: 'mail.spf-malformed',
          title: `Malformed directly published SPF record for ${context.domainName}`,
          description: `${context.domainName} has directly visible SPF syntax that cannot be assessed safely. ${assessment.limitation}`,
          severity: 'critical',
          confidence: 'certain',
          riskPosture: 'critical',
          blastRadius: 'single-domain',
          reviewOnly: true,
          evidence: spfObservation
            ? [
                {
                  observationId: spfObservation.id,
                  description: `First-level SPF assessment: ${JSON.stringify(assessment)}`,
                },
              ]
            : [],
          ruleId: this.id,
          ruleVersion: this.version,
        },
      };
    }

    // Analyze only directly visible configuration. Dependencies remain unresolved.
    const issues: string[] = [];

    // Check for ~all (softfail) vs -all (hardfail)
    const allMechanism = parsed.mechanisms.find((m) => m.type === 'all');
    if (allMechanism) {
      if (allMechanism.prefix === '~') {
        issues.push('Softfail (~all) - emails may be delivered but flagged');
      } else if (allMechanism.prefix === '?') {
        issues.push('Neutral (?all) - no enforcement, effectively no protection');
      } else if (allMechanism.prefix === '+') {
        issues.push('Pass (+all) - DANGEROUS: allows all senders');
      }
    } else {
      issues.push('No all mechanism - may cause unexpected behavior');
    }

    // Check for include mechanisms
    const includes = parsed.mechanisms.filter((m) => m.type === 'include');
    if (
      includes.length === 0 &&
      !parsed.mechanisms.some((m) => ['a', 'mx', 'ip4', 'ip6'].includes(m.type))
    ) {
      issues.push('No sender sources defined');
    }

    const severity = issues.some((i) => i.includes('DANGEROUS'))
      ? 'critical'
      : issues.length > 0
        ? 'medium'
        : 'info';

    return {
      finding: {
        type: 'mail.spf-present',
        title: `SPF record present for ${context.domainName}`,
        description: `${context.domainName} has directly valid published SPF syntax within a FIRST_LEVEL_ONLY assessment. completeEvaluation=false. ${issues.length > 0 ? `Direct issues: ${issues.join('; ')}. ` : ''}${assessment.limitation}`,
        severity,
        confidence: 'certain',
        riskPosture:
          severity === 'critical' ? 'critical' : severity === 'medium' ? 'medium' : 'safe',
        blastRadius: 'single-domain',
        reviewOnly: severity !== 'info',
        evidence: spfObservation
          ? [
              {
                observationId: spfObservation.id,
                description: `First-level SPF assessment: ${JSON.stringify(assessment)}`,
              },
            ]
          : [],
        ruleId: this.id,
        ruleVersion: this.version,
      },
      suggestions:
        issues.length > 0
          ? [
              {
                title: 'Review SPF configuration',
                description: `The SPF record has configuration issues that may affect mail delivery.`,
                action: 'Playbook: mail.spf.first-level-review',
                riskPosture: 'medium',
                blastRadius: 'single-domain',
                reviewOnly: true,
              },
            ]
          : undefined,
    };
  },
};

// =============================================================================
// Rule 3: DMARC Record Analysis
// =============================================================================

export const dmarcRule: Rule = {
  id: 'mail.dmarc-analysis.v1',
  name: 'DMARC Record Analysis',
  description: 'Analyzes DMARC record presence, validity, and policy',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    // Find DMARC TXT record
    const allDmarcObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'TXT' &&
        obs.queryName.toLowerCase() === `_dmarc.${context.domainName}`.toLowerCase()
    );
    const dmarcObservations = allDmarcObservations.filter((obs) => obs.status === 'success');

    let dmarcRecord: string | null = null;
    let dmarcObservation: Observation | null = null;

    for (const obs of dmarcObservations) {
      for (const answer of obs.answerSection || []) {
        if (answer.data.includes('v=DMARC1')) {
          dmarcRecord = answer.data;
          dmarcObservation = obs;
          break;
        }
      }
      if (dmarcRecord) break;
    }

    if (!dmarcRecord) {
      return {
        finding: {
          type: 'mail.no-dmarc-record',
          title: `No DMARC record for ${context.domainName}`,
          description: `${context.domainName} has no DMARC record. Without DMARC, receiving servers have no policy guidance for handling SPF/DKIM failures. This is a security risk.`,
          severity: 'high',
          confidence: 'certain',
          riskPosture: 'high',
          blastRadius: 'single-domain',
          reviewOnly: false,
          evidence: allDmarcObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status} — no DMARC record found`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Review DMARC readiness',
            description:
              'Confirm aligned senders and an operated report destination before planning DMARC. This guidance contains no approved record value.',
            action: 'Playbook: mail.dmarc.monitoring-readiness',
            riskPosture: 'medium',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    // Parse DMARC record
    const parsed = parseDMARC(dmarcRecord);

    if (!parsed) {
      return {
        finding: {
          type: 'mail.dmarc-malformed',
          title: `Malformed DMARC record for ${context.domainName}`,
          description: `${context.domainName} has a DMARC record that could not be parsed: "${dmarcRecord}". This may cause mail delivery issues.`,
          severity: 'critical',
          confidence: 'certain',
          riskPosture: 'critical',
          blastRadius: 'single-domain',
          reviewOnly: true,
          evidence: dmarcObservation
            ? [
                {
                  observationId: dmarcObservation.id,
                  description: `Raw DMARC: ${dmarcRecord}`,
                },
              ]
            : [],
          ruleId: this.id,
          ruleVersion: this.version,
        },
      };
    }

    // Analyze DMARC policy
    const policy = parsed.policy;
    const subdomainPolicy = parsed.subdomainPolicy;
    const rua = parsed.rua;
    const pct = parsed.percentage ?? 100;

    let severity: 'info' | 'low' | 'medium' | 'high' | 'critical' = 'info';
    const notes: string[] = [];

    if (policy === 'none') {
      severity = 'medium';
      notes.push('Policy is "none" - monitoring only, no enforcement');
    } else if (policy === 'quarantine') {
      severity = 'info';
      notes.push('Policy is "quarantine" - failed emails go to spam');
    } else if (policy === 'reject') {
      severity = 'info';
      notes.push('Policy is "reject" - failed emails are rejected');
    }

    if (!rua || rua.length === 0) {
      notes.push('No aggregate report URI (rua) - no visibility into failures');
      if (severity === 'info') severity = 'low';
    }

    if (pct < 100) {
      notes.push(`Partial deployment: ${pct}% of emails affected`);
    }

    if (subdomainPolicy && subdomainPolicy !== policy) {
      notes.push(`Subdomain policy (${subdomainPolicy}) differs from main policy (${policy})`);
    }

    return {
      finding: {
        type: 'mail.dmarc-present',
        title: `DMARC record present for ${context.domainName}`,
        description: `${context.domainName} has a valid DMARC record with policy "${policy}". ${notes.length > 0 ? `Notes: ${notes.join('; ')}` : 'Configuration looks good.'}`,
        severity,
        confidence: 'certain',
        riskPosture: severity === 'info' ? 'safe' : 'medium',
        blastRadius: 'single-domain',
        reviewOnly: severity !== 'info',
        evidence: dmarcObservation
          ? [
              {
                observationId: dmarcObservation.id,
                description: `Policy: ${policy}${subdomainPolicy ? `, Subdomain: ${subdomainPolicy}` : ''}, RUA: ${rua?.join(', ') || 'none'}, Pct: ${pct}%`,
              },
            ]
          : [],
        ruleId: this.id,
        ruleVersion: this.version,
      },
      suggestions:
        policy === 'none'
          ? [
              {
                title: 'Strengthen DMARC policy',
                description:
                  'Review aggregate reports and confirmed sender alignment before considering enforcement. This guidance contains no approved record value.',
                action: 'Playbook: mail.dmarc.enforcement-readiness',
                riskPosture: 'medium',
                blastRadius: 'single-domain',
                reviewOnly: true,
              },
            ]
          : undefined,
    };
  },
};

// =============================================================================
// Rule 4: DKIM Key Presence
// =============================================================================

export const dkimRule: Rule = {
  id: 'mail.dkim-presence.v1',
  name: 'DKIM Key Presence',
  description: 'Checks for DKIM public keys at discovered selectors',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    // Find DKIM observations (selector._domainkey.domain)
    const domainLower = context.domainName.toLowerCase();
    const dkimObservations = context.observations.filter((obs) => {
      const queryNameLower = obs.queryName.toLowerCase();
      return (
        obs.queryType === 'TXT' &&
        queryNameLower.includes('._domainkey.') &&
        queryNameLower.endsWith(`._domainkey.${domainLower}`)
      );
    });

    if (dkimObservations.length === 0) {
      return {
        finding: {
          type: 'mail.no-dkim-queried',
          title: `No DKIM selectors discovered for ${context.domainName}`,
          description: `No DKIM selectors were discovered for ${context.domainName}. This could mean: (1) no DKIM is configured, (2) selectors use non-standard names, or (3) selector discovery heuristics didn't match. DKIM is recommended for email authentication.`,
          severity: 'medium',
          confidence: 'heuristic',
          riskPosture: 'medium',
          blastRadius: 'single-domain',
          reviewOnly: false,
          evidence: [],
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Review DKIM setup',
            description: `DKIM provides cryptographic email authentication and is recommended.`,
            action: 'Playbook: mail.dkim.selector-evidence',
            riskPosture: 'low',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    // Check which selectors have valid keys
    const validKeys: Array<{ selector: string; observation: Observation }> = [];
    const invalidKeys: Array<{ selector: string; observation: Observation; reason: string }> = [];

    for (const obs of dkimObservations) {
      const selector = obs.queryName.split('._domainkey.')[0];

      if (obs.status !== 'success') {
        invalidKeys.push({ selector, observation: obs, reason: `Query failed: ${obs.status}` });
        continue;
      }

      const txtData = obs.answerSection?.[0]?.data;
      if (!txtData) {
        invalidKeys.push({ selector, observation: obs, reason: 'Empty response' });
        continue;
      }

      // Basic DKIM key validation - require BOTH version tag and key
      if (txtData.includes('k=') && txtData.includes('v=DKIM1')) {
        validKeys.push({ selector, observation: obs });
      } else {
        invalidKeys.push({ selector, observation: obs, reason: 'No valid DKIM key data found' });
      }
    }

    if (validKeys.length === 0) {
      return {
        finding: {
          type: 'mail.dkim-no-valid-keys',
          title: `No valid DKIM keys found for ${context.domainName}`,
          description: `DKIM selectors were queried but no valid keys were found. Attempted: ${invalidKeys.map((k) => k.selector).join(', ')}. ${invalidKeys.map((k) => `${k.selector}: ${k.reason}`).join('; ')}`,
          severity: 'high',
          confidence: 'certain',
          riskPosture: 'high',
          blastRadius: 'single-domain',
          reviewOnly: false,
          evidence: dkimObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.queryName}: ${obs.status}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
      };
    }

    return {
      finding: {
        type: 'mail.dkim-keys-present',
        title: `DKIM keys present for ${context.domainName}`,
        description: `Valid DKIM keys found for selectors: ${validKeys.map((k) => k.selector).join(', ')}. ${invalidKeys.length > 0 ? `Additional selectors queried but invalid: ${invalidKeys.map((k) => k.selector).join(', ')}` : ''}`,
        severity: 'info',
        confidence: 'certain',
        riskPosture: 'safe',
        blastRadius: 'none',
        reviewOnly: false,
        evidence: validKeys.map((k) => ({
          observationId: k.observation.id,
          description: `Selector ${k.selector}: valid DKIM key`,
        })),
        ruleId: this.id,
        ruleVersion: this.version,
      },
    };
  },
};

// =============================================================================
// Rule 5: MTA-STS Presence
// =============================================================================

export const mtaStsRule: Rule = {
  id: 'mail.mta-sts-presence.v1',
  name: 'MTA-STS Presence',
  description: 'Checks for MTA-STS TXT record',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    const mtaStsObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'TXT' &&
        obs.queryName.toLowerCase() === `_mta-sts.${context.domainName}`.toLowerCase()
    );

    const successfulObs = mtaStsObservations.filter((obs) => obs.status === 'success');
    const hasMtaSts = successfulObs.some((obs) =>
      obs.answerSection?.some((a) => a.data.includes('v=STSv1'))
    );

    if (!hasMtaSts) {
      return {
        finding: {
          type: 'mail.no-mta-sts',
          title: `No MTA-STS for ${context.domainName}`,
          description: `${context.domainName} has no MTA-STS policy. MTA-STS enforces TLS encryption for inbound mail and prevents downgrade attacks. Recommended for security-conscious domains.`,
          severity: 'low',
          confidence: 'certain',
          riskPosture: 'low',
          blastRadius: 'none',
          reviewOnly: false,
          evidence: mtaStsObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Consider MTA-STS',
            description: `MTA-STS enforces TLS for email and prevents downgrade attacks.`,
            action: 'Playbook: mail.mta-sts.readiness',
            riskPosture: 'low',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    return {
      finding: {
        type: 'mail.mta-sts-present',
        title: `MTA-STS configured for ${context.domainName}`,
        description: `${context.domainName} has an MTA-STS TXT record indicating TLS enforcement policy is configured.`,
        severity: 'info',
        confidence: 'certain',
        riskPosture: 'safe',
        blastRadius: 'none',
        reviewOnly: false,
        evidence: mtaStsObservations.map((obs) => ({
          observationId: obs.id,
          description: `${obs.vantageType}: ${obs.answerSection?.map((a) => a.data).join(', ') || 'present'}`,
        })),
        ruleId: this.id,
        ruleVersion: this.version,
      },
    };
  },
};

// =============================================================================
// Rule 6: TLS-RPT Presence
// =============================================================================

export const tlsRptRule: Rule = {
  id: 'mail.tls-rpt-presence.v1',
  name: 'TLS-RPT Presence',
  description: 'Checks for TLS-RPT TXT record',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    const tlsRptObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'TXT' &&
        obs.queryName.toLowerCase() === `_smtp._tls.${context.domainName}`.toLowerCase()
    );

    const successfulObs = tlsRptObservations.filter((obs) => obs.status === 'success');
    const hasTlsRpt = successfulObs.some((obs) =>
      obs.answerSection?.some((a) => a.data.includes('v=TLSRPTv1'))
    );

    if (!hasTlsRpt) {
      return {
        finding: {
          type: 'mail.no-tls-rpt',
          title: `No TLS-RPT for ${context.domainName}`,
          description: `${context.domainName} has no TLS-RPT record. TLS-RPT provides reports on TLS connectivity issues for inbound mail. Useful for monitoring MTA-STS effectiveness.`,
          severity: 'low',
          confidence: 'certain',
          riskPosture: 'low',
          blastRadius: 'none',
          reviewOnly: false,
          evidence: tlsRptObservations.map((obs) => ({
            observationId: obs.id,
            description: `${obs.vantageType}: ${obs.status}`,
          })),
          ruleId: this.id,
          ruleVersion: this.version,
        },
        suggestions: [
          {
            title: 'Consider TLS-RPT',
            description: `TLS-RPT provides reports on TLS connectivity issues for inbound mail.`,
            action: 'Playbook: mail.tls-rpt.reporting-readiness',
            riskPosture: 'low',
            blastRadius: 'single-domain',
            reviewOnly: true,
          },
        ],
      };
    }

    return {
      finding: {
        type: 'mail.tls-rpt-present',
        title: `TLS-RPT configured for ${context.domainName}`,
        description: `${context.domainName} has a TLS-RPT TXT record for receiving TLS connectivity reports.`,
        severity: 'info',
        confidence: 'certain',
        riskPosture: 'safe',
        blastRadius: 'none',
        reviewOnly: false,
        evidence: tlsRptObservations.map((obs) => ({
          observationId: obs.id,
          description: `${obs.vantageType}: ${obs.answerSection?.map((a) => a.data).join(', ') || 'present'}`,
        })),
        ruleId: this.id,
        ruleVersion: this.version,
      },
    };
  },
};

// =============================================================================
// Rule 7: BIMI Presence (Info Only)
// =============================================================================

export const bimiRule: Rule = {
  id: 'mail.bimi-presence.v1',
  name: 'BIMI Presence',
  description: 'Checks for BIMI TXT record (info only)',
  version: '1.0.0',
  enabled: true,

  evaluate(context: RuleContext): RuleResult | null {
    const bimiObservations = context.observations.filter(
      (obs) =>
        obs.queryType === 'TXT' &&
        obs.queryName.toLowerCase() === `default._bimi.${context.domainName}`.toLowerCase()
    );

    const successfulObs = bimiObservations.filter((obs) => obs.status === 'success');
    const hasBimi = successfulObs.some((obs) =>
      obs.answerSection?.some((a) => a.data.includes('v=BIMI1'))
    );

    if (!hasBimi) {
      // BIMI is optional, so we don't report absence unless specifically queried
      return null;
    }

    return {
      finding: {
        type: 'mail.bimi-present',
        title: `BIMI configured for ${context.domainName}`,
        description: `${context.domainName} has a BIMI record for email logo display. Note: BIMI requires a validated DMARC policy (p=quarantine or p=reject) and a trademarked logo or VMC certificate.`,
        severity: 'info',
        confidence: 'certain',
        riskPosture: 'safe',
        blastRadius: 'none',
        reviewOnly: false,
        evidence: bimiObservations.map((obs) => ({
          observationId: obs.id,
          description: `${obs.vantageType}: BIMI record present`,
        })),
        ruleId: this.id,
        ruleVersion: this.version,
      },
    };
  },
};

// =============================================================================
// All Mail Rules Export
// =============================================================================

export const mailRules: Rule[] = [
  mxPresenceRule,
  spfRule,
  dmarcRule,
  dkimRule,
  mtaStsRule,
  tlsRptRule,
  bimiRule,
];
