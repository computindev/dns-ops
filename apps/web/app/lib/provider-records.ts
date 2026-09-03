/**
 * Provider-aligned copy records — issue #59.
 *
 * Builds the three provider-aligned mail records (MX, SPF, DKIM) for Google
 * Workspace and Microsoft 365 so an operator can paste them into their DNS
 * provider instead of retyping them. Static values are the providers'
 * published defaults; per-tenant values are `<placeholder>` markers the
 * operator fills from the provider admin console. Clipboard only — this
 * module never applies or proposes DNS changes.
 */

export type CopyableProvider = 'google-workspace' | 'microsoft-365';

export interface ProviderRecord {
  /** Record category within the provider setup (always the trio MX/SPF/DKIM). */
  kind: 'MX' | 'SPF' | 'DKIM';
  type: 'MX' | 'TXT' | 'CNAME';
  /** Record name relative to the zone ('@' = zone apex). */
  name: string;
  value: string;
  /** Set when the value contains a per-tenant `<placeholder>`. */
  note?: string;
}

/** Trim, lowercase, and strip one trailing dot so names render consistently. */
export function normalizeZoneName(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

const TENANT_PLACEHOLDER = /<[^>]+>/;

export function hasTenantPlaceholder(value: string): boolean {
  return TENANT_PLACEHOLDER.test(value);
}

export function providerRecords(provider: CopyableProvider, domain: string): ProviderRecord[] {
  const zone = normalizeZoneName(domain);

  if (provider === 'google-workspace') {
    return [
      { kind: 'MX', type: 'MX', name: '@', value: '10 smtp.google.com.' },
      {
        kind: 'SPF',
        type: 'TXT',
        name: '@',
        value: 'v=spf1 include:_spf.google.com ~all',
      },
      {
        kind: 'DKIM',
        type: 'TXT',
        name: `google._domainkey.${zone}`,
        value: 'v=DKIM1; k=rsa; p=<public key generated in the Google Admin console>',
        note: 'Generate the key in Google Admin → Apps → Google Workspace → Gmail → Authenticate email.',
      },
    ];
  }

  return [
    {
      kind: 'MX',
      type: 'MX',
      name: '@',
      value: '10 <mx-token>.mail.protection.outlook.com.',
      note: '<mx-token> is shown in the Microsoft 365 admin center when the domain is added (the initial .onmicrosoft.com domain).',
    },
    {
      kind: 'SPF',
      type: 'TXT',
      name: '@',
      value: 'v=spf1 include:spf.protection.outlook.com -all',
    },
    {
      kind: 'DKIM',
      type: 'CNAME',
      name: `selector1._domainkey.${zone}`,
      value: 'selector1-<domainGUID>._domainkey.<tenantDomain>.onmicrosoft.com.',
      note: 'Enable DKIM in the Microsoft Defender portal first; it issues the <domainGUID>.',
    },
    {
      kind: 'DKIM',
      type: 'CNAME',
      name: `selector2._domainkey.${zone}`,
      value: 'selector2-<domainGUID>._domainkey.<tenantDomain>.onmicrosoft.com.',
      note: 'Enable DKIM in the Microsoft Defender portal first; it issues the <domainGUID>.',
    },
  ];
}

const PROVIDER_NAMES: Record<CopyableProvider, string> = {
  'google-workspace': 'Google Workspace',
  'microsoft-365': 'Microsoft 365',
};

export function providerName(provider: CopyableProvider): string {
  return PROVIDER_NAMES[provider];
}

/** Clipboard block: every record with its host and value, plus the no-apply notice. */
export function recordsToClipboardText(provider: CopyableProvider, domain: string): string {
  const zone = normalizeZoneName(domain);
  const lines: string[] = [
    `${PROVIDER_NAMES[provider]} mail records for ${zone}`,
    'Paste into your DNS provider. Values in <angle brackets> are tenant-specific — fill them from your provider admin console. Nothing is applied by this tool.',
    '',
  ];

  for (const record of providerRecords(provider, zone)) {
    const host = record.name === '@' ? zone : record.name;
    lines.push(`${record.kind} ${record.type} · ${host}`);
    lines.push(`  ${record.value}`);
    if (record.note) lines.push(`  note: ${record.note}`);
  }

  return lines.join('\n');
}
