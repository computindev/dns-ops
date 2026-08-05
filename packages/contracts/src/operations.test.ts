import { describe, expect, it } from 'vitest';
import { internalConditionKey } from './operations.js';

describe('internalConditionKey', () => {
  it('normalizes bounded discriminators', () => {
    expect(
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', ' Homepage ')
    ).toBe('tenant:domain:HTTP_ENDPOINT_UNAVAILABLE:homepage');
  });

  it('rejects empty and oversized discriminators', () => {
    expect(() =>
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', ' ')
    ).toThrow('1-64');
    expect(() =>
      internalConditionKey('tenant', 'domain', 'HTTP_ENDPOINT_UNAVAILABLE', 'x'.repeat(65))
    ).toThrow('1-64');
  });
});
