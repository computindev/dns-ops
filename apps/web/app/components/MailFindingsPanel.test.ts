import { describe, expect, it } from 'vitest';
import { parseActionableTypeIds, parseFindingSimulationResult } from './MailFindingsPanel.js';

const guidance = {
  kind: 'GUIDANCE_ONLY',
  title: 'Confirm authorized senders with the mail provider',
  explanation: 'Review provider instructions before planning a DNS change.',
  playbookId: 'mail.spf.provider-confirmation',
  requiresProviderConfirmation: true,
  executableMutation: null,
} as const;

describe('MailFindingsPanel simulation guards', () => {
  it('uses only supportedTypeIds returned by actionable-type discovery', () => {
    expect(
      parseActionableTypeIds({
        mode: 'GUIDANCE_ONLY',
        guidanceSupportedTypes: [{ type: 'mail.no-spf-record' }],
        supportedTypeIds: ['mail.no-spf-record'],
      })
    ).toEqual(['mail.no-spf-record']);

    expect(() =>
      parseActionableTypeIds({
        mode: 'GUIDANCE_ONLY',
        supportedTypeIds: ['mail.no-spf-record', 42],
      })
    ).toThrow(/per-finding guidance is unavailable/i);
  });

  it('keeps only guidance fields from a guidance-only response', () => {
    const result = parseFindingSimulationResult({
      mode: 'GUIDANCE_ONLY',
      proposedChanges: [],
      guidanceOnlySuggestions: [{ ...guidance, providerRecord: 'must not render' }],
      detectedProvider: 'unknown',
      projectedFindings: [{ title: 'must not render' }],
      summary: { changesProposed: 0 },
    });

    expect(result).toEqual({
      mode: 'GUIDANCE_ONLY',
      proposedChanges: [],
      guidanceOnlySuggestions: [guidance],
    });
    expect(result).not.toHaveProperty('detectedProvider');
    expect(result).not.toHaveProperty('projectedFindings');
  });

  it('rejects proposed mutations and non-null executable mutations', () => {
    expect(() =>
      parseFindingSimulationResult({
        mode: 'GUIDANCE_ONLY',
        proposedChanges: [{ name: 'example.com', type: 'TXT' }],
        guidanceOnlySuggestions: [],
      })
    ).toThrow(/guidance-only results are required/i);

    expect(() =>
      parseFindingSimulationResult({
        mode: 'GUIDANCE_ONLY',
        proposedChanges: [],
        guidanceOnlySuggestions: [{ ...guidance, executableMutation: { action: 'apply' } }],
      })
    ).toThrow(/guidance-only results are required/i);
  });
});
