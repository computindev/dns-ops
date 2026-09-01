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
import { type DMARCRecord, type SPFRecord } from '@dns-ops/parsing';
import { type MxRecord } from './dns.js';
export interface MailCheckResult {
    domain: string;
    mx: MxCheckResult;
    dmarc: RecordCheckResult;
    dkim: DKIMCheckResult;
    spf: RecordCheckResult;
    mtaSts: MtaStsCheckResult;
    tlsRpt: TlsRptCheckResult;
    checkedAt: Date;
}
export interface RecordCheckResult {
    present: boolean;
    valid: boolean;
    record?: string;
    parsed?: DMARCRecord | SPFRecord;
    errors?: string[];
}
export interface MxCheckResult {
    present: boolean;
    isNullMx: boolean;
    records: MxRecord[];
    errors?: string[];
}
export interface MtaStsCheckResult {
    present: boolean;
    valid: boolean;
    record?: string;
    version?: string;
    id?: string;
    errors?: string[];
}
export interface TlsRptCheckResult {
    present: boolean;
    valid: boolean;
    record?: string;
    version?: string;
    rua?: string[];
    errors?: string[];
}
export interface DKIMCheckResult extends RecordCheckResult {
    selector?: string;
    selectorProvenance: SelectorProvenance;
    triedSelectors: string[];
    provider?: string;
}
export type SelectorProvenance = 'managed' | 'heuristic' | 'operator' | 'provider' | 'default';
export interface ProviderSelectorInfo {
    selector: string;
    confidence: number;
}
export declare const PROVIDER_SELECTORS: Record<string, ProviderSelectorInfo>;
export declare const COMMON_SELECTORS: string[];
/**
 * Perform complete mail check (MX, DMARC, DKIM, SPF, MTA-STS, TLS-RPT)
 */
export declare function performMailCheck(domain: string, options?: {
    preferredProvider?: string;
    explicitSelectors?: string[];
}): Promise<MailCheckResult>;
/**
 * Check DMARC record
 */
export declare function checkDMARC(domain: string): Promise<RecordCheckResult>;
/**
 * Check DKIM record with selector discovery
 */
export declare function checkDKIM(domain: string, options?: {
    preferredProvider?: string;
    explicitSelectors?: string[];
}): Promise<DKIMCheckResult>;
/**
 * Check SPF record
 */
export declare function checkSPF(domain: string): Promise<RecordCheckResult>;
/**
 * Check MX records
 * Detects null MX (RFC 7505) - priority 0 with empty exchange
 */
export declare function checkMX(domain: string): Promise<MxCheckResult>;
/**
 * Check MTA-STS record
 * Format: v=STSv1; id=...
 */
export declare function checkMtaSts(domain: string): Promise<MtaStsCheckResult>;
/**
 * Check TLS-RPT record
 * Format: v=TLSRPTv1; rua=mailto:...
 */
export declare function checkTlsRpt(domain: string): Promise<TlsRptCheckResult>;
//# sourceMappingURL=checker.d.ts.map