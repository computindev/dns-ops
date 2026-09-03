import { describe, expect, it } from 'vitest';
import {
  hasTenantPlaceholder,
  normalizeZoneName,
  providerName,
  providerRecords,
  recordsToClipboardText,
} from './provider-records.js';

describe('provider-records copy blocks (issue #59)', () => {
  it('returns the MX/SPF/DKIM trio for Google Workspace', () => {
    const records = providerRecords('google-workspace', 'Example.com.');
    expect(records.map((r) => r.kind)).toEqual(['MX', 'SPF', 'DKIM']);
    expect(records[0]).toMatchObject({ type: 'MX', name: '@', value: '10 smtp.google.com.' });
    expect(records[1]?.value).toBe('v=spf1 include:_spf.google.com ~all');
    expect(records[2]).toMatchObject({
      type: 'TXT',
      name: 'google._domainkey.example.com',
    });
  });

  it('returns MX/SPF plus the selector1/selector2 DKIM CNAME pair for Microsoft 365', () => {
    const records = providerRecords('microsoft-365', 'example.com');
    expect(records.map((r) => r.kind)).toEqual(['MX', 'SPF', 'DKIM', 'DKIM']);
    expect(records[0]?.value).toContain('.mail.protection.outlook.com.');
    expect(records[1]?.value).toBe('v=spf1 include:spf.protection.outlook.com -all');
    expect(records[2]).toMatchObject({
      type: 'CNAME',
      name: 'selector1._domainkey.example.com',
    });
    expect(records[3]).toMatchObject({
      type: 'CNAME',
      name: 'selector2._domainkey.example.com',
    });
  });

  it('marks every per-tenant value with a <placeholder> and a note', () => {
    for (const provider of ['google-workspace', 'microsoft-365'] as const) {
      for (const record of providerRecords(provider, 'example.com')) {
        if (record.note) {
          expect(hasTenantPlaceholder(record.value)).toBe(true);
          expect(record.note.length).toBeGreaterThan(10);
        } else {
          expect(hasTenantPlaceholder(record.value)).toBe(false);
        }
      }
    }
  });

  it('keeps provider values aligned: no cross-provider endpoints', () => {
    const google = JSON.stringify(providerRecords('google-workspace', 'example.com'));
    const microsoft = JSON.stringify(providerRecords('microsoft-365', 'example.com'));
    expect(google).not.toMatch(/outlook|microsoft/i);
    expect(microsoft).not.toMatch(/google/i);
  });

  it('renders a clipboard block with provider name, FQDN hosts, and the no-apply notice', () => {
    const text = recordsToClipboardText('google-workspace', 'example.com');
    expect(text.startsWith('Google Workspace mail records for example.com')).toBe(true);
    expect(text).toContain('10 smtp.google.com.');
    expect(text).toContain('google._domainkey.example.com');
    expect(text).toContain('Nothing is applied by this tool');
    expect(providerName('microsoft-365')).toBe('Microsoft 365');
  });

  it('normalizes zone names used in hosts', () => {
    expect(normalizeZoneName('  Example.COM. ')).toBe('example.com');
  });
});
