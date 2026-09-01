/**
 * Mail Checker - Live DNS Lookup Utility
 *
 * **IMPORTANT: This is NOT the authoritative mail evidence source.**
 *
 * This module performs live DNS lookups for mail security checks:
 * - DMARC, DKIM, SPF (core authentication)
 * - MX records with null MX detection
 * - MTA-STS (Mail Transfer Agent Strict Transport Security)
 * - TLS-RPT (SMTP TLS Reporting)
 *
 * ## Two Usage Patterns
 *
 * **1. Live Preview Only (`/mail/check` endpoint):**
 *    - Ephemeral diagnostics without persistence
 *    - Use for: quick checks, previews, debugging
 *    - Results are NOT stored - for operator eyes only
 *
 * **2. Snapshot-Backed Collection (`/mail` endpoint with snapshotId):**
 *    - Calls this checker, then persists results via:
 *      - ObservationRepository (DNS observations)
 *      - MailEvidenceRepository (mail evidence summary)
 *      - DkimSelectorRepository (selector provenance)
 *    - This is the AUTHORITATIVE path for mail evidence
 *
 * ## Authoritative Evidence Path
 *
 * DNS Collection → Observations → MailEvidence → Findings
 *
 * The checker.ts module is a utility for DNS lookups only.
 * All persistent mail evidence flows through collect-mail.ts routes.
 *
 * @see collect-mail.ts for the authoritative collection endpoint
 * @see MailEvidenceRepository for persisted evidence storage
 */
import { parseDMARC, parseSPF } from '@dns-ops/parsing';
import { resolveMX, resolveTXT } from './dns.js';
// Provider selector mapping with confidence scores
export const PROVIDER_SELECTORS = {
    google: { selector: 'google', confidence: 0.95 },
    'google-workspace': { selector: 'google', confidence: 0.95 },
    microsoft: { selector: 'selector1', confidence: 0.9 },
    'microsoft-365': { selector: 'selector1', confidence: 0.9 },
    outlook: { selector: 'selector1', confidence: 0.9 },
    zoho: { selector: 'zoho', confidence: 0.95 },
    default: { selector: 'default', confidence: 0.3 },
};
// Common DKIM selectors to try as fallback
export const COMMON_SELECTORS = ['default', 'dkim', 'mail', 'email'];
/**
 * Perform complete mail check (MX, DMARC, DKIM, SPF, MTA-STS, TLS-RPT)
 */
export async function performMailCheck(domain, options) {
    const [mx, dmarc, dkim, spf, mtaSts, tlsRpt] = await Promise.all([
        checkMX(domain),
        checkDMARC(domain),
        checkDKIM(domain, options),
        checkSPF(domain),
        checkMtaSts(domain),
        checkTlsRpt(domain),
    ]);
    return {
        domain,
        mx,
        dmarc,
        dkim,
        spf,
        mtaSts,
        tlsRpt,
        checkedAt: new Date(),
    };
}
/**
 * Check DMARC record
 */
export async function checkDMARC(domain) {
    try {
        const records = await resolveTXT(`_dmarc.${domain}`);
        const dmarcRecord = records.find((r) => r.includes('v=DMARC1'));
        if (!dmarcRecord) {
            return {
                present: false,
                valid: false,
                errors: ['No DMARC record found'],
            };
        }
        const parsed = parseDMARC(dmarcRecord);
        return {
            present: true,
            valid: parsed !== null,
            record: dmarcRecord,
            parsed: parsed || undefined,
            errors: parsed ? undefined : ['Failed to parse DMARC record'],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            present: false,
            valid: false,
            errors: [`DNS error: ${message}`],
        };
    }
}
/**
 * Check DKIM record with selector discovery
 */
export async function checkDKIM(domain, options) {
    const triedSelectors = [];
    // Priority 1: Explicit selectors from operator
    if (options?.explicitSelectors?.length) {
        for (const selector of options.explicitSelectors) {
            triedSelectors.push(selector);
            const result = await tryDKIMSelector(domain, selector);
            if (result.present) {
                return {
                    ...result,
                    selector,
                    selectorProvenance: 'operator',
                    triedSelectors: [...triedSelectors],
                };
            }
        }
    }
    // Priority 2: Provider heuristic
    if (options?.preferredProvider) {
        const providerInfo = PROVIDER_SELECTORS[options.preferredProvider];
        if (providerInfo) {
            triedSelectors.push(providerInfo.selector);
            const result = await tryDKIMSelector(domain, providerInfo.selector);
            if (result.present) {
                return {
                    ...result,
                    selector: providerInfo.selector,
                    selectorProvenance: 'provider',
                    provider: options.preferredProvider,
                    triedSelectors: [...triedSelectors],
                };
            }
        }
    }
    // Priority 3: Common selector dictionary
    for (const selector of COMMON_SELECTORS) {
        if (!triedSelectors.includes(selector)) {
            triedSelectors.push(selector);
            const result = await tryDKIMSelector(domain, selector);
            if (result.present) {
                return {
                    ...result,
                    selector,
                    selectorProvenance: 'default',
                    triedSelectors: [...triedSelectors],
                };
            }
        }
    }
    return {
        present: false,
        valid: false,
        selectorProvenance: 'default',
        triedSelectors: [...triedSelectors],
        errors: [`No DKIM record found. Tried selectors: ${triedSelectors.join(', ')}`],
    };
}
/**
 * Try a specific DKIM selector
 */
async function tryDKIMSelector(domain, selector) {
    try {
        const records = await resolveTXT(`${selector}._domainkey.${domain}`);
        const dkimRecord = records[0];
        // Basic validation: should contain v=DKIM1 or k= (key type)
        const valid = dkimRecord.includes('v=DKIM1') || dkimRecord.includes('k=');
        return {
            present: true,
            valid,
            record: dkimRecord,
        };
    }
    catch (_error) {
        return {
            present: false,
            valid: false,
        };
    }
}
/**
 * Check SPF record
 */
export async function checkSPF(domain) {
    try {
        const records = await resolveTXT(domain);
        const spfRecord = records.find((r) => r.startsWith('v=spf1'));
        if (!spfRecord) {
            return {
                present: false,
                valid: false,
                errors: ['No SPF record found'],
            };
        }
        const parsed = parseSPF(spfRecord);
        return {
            present: true,
            valid: parsed !== null,
            record: spfRecord,
            parsed: parsed || undefined,
            errors: parsed ? undefined : ['Failed to parse SPF record'],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            present: false,
            valid: false,
            errors: [`DNS error: ${message}`],
        };
    }
}
/**
 * Check MX records
 * Detects null MX (RFC 7505) - priority 0 with empty exchange
 */
export async function checkMX(domain) {
    try {
        const records = await resolveMX(domain);
        if (records.length === 0) {
            return {
                present: false,
                isNullMx: false,
                records: [],
                errors: ['No MX records found'],
            };
        }
        // Detect null MX: single record with priority 0 and empty/root exchange
        const isNullMx = records.length === 1 &&
            records[0].priority === 0 &&
            (records[0].exchange === '' || records[0].exchange === '.');
        return {
            present: true,
            isNullMx,
            records,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            present: false,
            isNullMx: false,
            records: [],
            errors: [`DNS error: ${message}`],
        };
    }
}
/**
 * Check MTA-STS record
 * Format: v=STSv1; id=...
 */
export async function checkMtaSts(domain) {
    try {
        const records = await resolveTXT(`_mta-sts.${domain}`);
        const mtaStsRecord = records.find((r) => r.includes('v=STSv1'));
        if (!mtaStsRecord) {
            return {
                present: false,
                valid: false,
                errors: ['No MTA-STS record found'],
            };
        }
        // Parse v= and id= from record
        const versionMatch = mtaStsRecord.match(/v=(\S+)/);
        const idMatch = mtaStsRecord.match(/id=(\S+)/);
        const version = versionMatch ? versionMatch[1].replace(/;$/, '') : undefined;
        const id = idMatch ? idMatch[1].replace(/;$/, '') : undefined;
        // Valid if has version and id
        const valid = version === 'STSv1' && id !== undefined;
        return {
            present: true,
            valid,
            record: mtaStsRecord,
            version,
            id,
            errors: valid ? undefined : ['Invalid MTA-STS record format'],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            present: false,
            valid: false,
            errors: [`DNS error: ${message}`],
        };
    }
}
/**
 * Check TLS-RPT record
 * Format: v=TLSRPTv1; rua=mailto:...
 */
export async function checkTlsRpt(domain) {
    try {
        const records = await resolveTXT(`_smtp._tls.${domain}`);
        const tlsRptRecord = records.find((r) => r.includes('v=TLSRPTv1'));
        if (!tlsRptRecord) {
            return {
                present: false,
                valid: false,
                errors: ['No TLS-RPT record found'],
            };
        }
        // Parse v= and rua= from record
        const versionMatch = tlsRptRecord.match(/v=(\S+)/);
        const ruaMatch = tlsRptRecord.match(/rua=([^;]+)/);
        const version = versionMatch ? versionMatch[1].replace(/;$/, '') : undefined;
        const rua = ruaMatch
            ? ruaMatch[1]
                .split(',')
                .map((u) => u.trim())
                .filter(Boolean)
            : undefined;
        // Valid if has version and at least one rua
        const valid = version === 'TLSRPTv1' && rua !== undefined && rua.length > 0;
        return {
            present: true,
            valid,
            record: tlsRptRecord,
            version,
            rua,
            errors: valid ? undefined : ['Invalid TLS-RPT record format'],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            present: false,
            valid: false,
            errors: [`DNS error: ${message}`],
        };
    }
}
//# sourceMappingURL=checker.js.map