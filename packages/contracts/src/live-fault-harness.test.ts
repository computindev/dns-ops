import { describe, expect, it } from 'vitest';
import {
  authorizeControlledFaultMutation,
  type ControlledFaultHarnessPolicy,
  validateControlledFaultHarnessPolicy,
} from './live-fault-harness.js';

const fingerprint = `sha256:${'a'.repeat(64)}`;

function policy(): ControlledFaultHarnessPolicy {
  return {
    testDomain: 'faults.example.test',
    testWebHost: 'www.faults.example.test',
    testMailSubdomain: 'mail.faults.example.test',
    providerKind: 'example-provider',
    zoneId: 'zone-123',
    providerCredentialFingerprint: fingerprint,
    allowlist: [
      {
        name: 'www.faults.example.test',
        types: ['CNAME'],
        mutationIds: ['LIVE-01'],
      },
      {
        name: '_dmarc.mail.faults.example.test',
        types: ['TXT'],
        mutationIds: ['LIVE-03'],
      },
    ],
  };
}

describe('controlled live-fault harness policy', () => {
  it('authorizes an exact allowlisted mutation without holding a credential value', () => {
    const authorization = authorizeControlledFaultMutation(policy(), {
      zoneId: 'zone-123',
      name: 'WWW.FAULTS.EXAMPLE.TEST.',
      type: 'CNAME',
      mutationId: 'LIVE-01',
    });

    expect(authorization).toEqual({
      zoneId: 'zone-123',
      name: 'www.faults.example.test',
      type: 'CNAME',
      mutationId: 'LIVE-01',
      providerKind: 'example-provider',
      providerCredentialFingerprint: fingerprint,
    });
  });

  it('rejects a zone, name, type, or mutation that is not explicitly allowlisted', () => {
    expect(() =>
      authorizeControlledFaultMutation(policy(), {
        zoneId: 'other-zone',
        name: 'www.faults.example.test',
        type: 'CNAME',
        mutationId: 'LIVE-01',
      })
    ).toThrow('zone is not authorized');

    expect(() =>
      authorizeControlledFaultMutation(policy(), {
        zoneId: 'zone-123',
        name: 'outside.example.test',
        type: 'CNAME',
        mutationId: 'LIVE-01',
      })
    ).toThrow('not allowlisted');

    expect(() =>
      authorizeControlledFaultMutation(policy(), {
        zoneId: 'zone-123',
        name: 'www.faults.example.test',
        type: 'A',
        mutationId: 'LIVE-01',
      })
    ).toThrow('not allowlisted');

    expect(() =>
      authorizeControlledFaultMutation(policy(), {
        zoneId: 'zone-123',
        name: 'www.faults.example.test',
        type: 'CNAME',
        mutationId: 'LIVE-02',
      })
    ).toThrow('not allowlisted');
  });

  it('rejects a policy that carries a credential value or escapes the designated test domain', () => {
    const withToken = {
      ...policy(),
      providerToken: 'must-not-be-accepted',
    } as ControlledFaultHarnessPolicy;
    expect(() => validateControlledFaultHarnessPolicy(withToken)).toThrow(
      'must not contain a provider credential'
    );

    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: [
          {
            name: 'outside.example.test',
            types: ['TXT'],
            mutationIds: ['LIVE-03'],
          },
        ],
      })
    ).toThrow('inside testDomain');

    const withNestedToken = {
      ...policy(),
      allowlist: [
        {
          ...policy().allowlist[0],
          providerToken: 'must-not-be-accepted',
        },
      ],
    } as unknown as ControlledFaultHarnessPolicy;
    expect(() => validateControlledFaultHarnessPolicy(withNestedToken)).toThrow(
      'must not contain a provider credential'
    );

    const inheritedTokenEntry = Object.assign(
      Object.create({ providerToken: 'must-not-be-accepted' }),
      policy().allowlist[0]
    );
    const withInheritedNestedToken = {
      ...policy(),
      allowlist: [inheritedTokenEntry],
    } as unknown as ControlledFaultHarnessPolicy;
    expect(() => validateControlledFaultHarnessPolicy(withInheritedNestedToken)).toThrow(
      'must be plain enumerable data objects'
    );
  });

  it('rejects non-enumerable, symbol, and accessor-backed configuration fields', () => {
    const withHiddenToken = policy();
    Object.defineProperty(withHiddenToken, 'providerToken', {
      value: 'must-not-be-accepted',
    });
    expect(() => validateControlledFaultHarnessPolicy(withHiddenToken)).toThrow(
      'must not contain a provider credential'
    );

    const withSymbolToken = policy();
    Object.defineProperty(withSymbolToken, Symbol('providerToken'), {
      value: 'must-not-be-accepted',
      enumerable: true,
    });
    expect(() => validateControlledFaultHarnessPolicy(withSymbolToken)).toThrow(
      'must not contain a provider credential'
    );

    const withAccessor = policy();
    Object.defineProperty(withAccessor, 'allowlist', {
      enumerable: true,
      get: () => policy().allowlist,
    });
    expect(() => validateControlledFaultHarnessPolicy(withAccessor)).toThrow(
      'must contain only enumerable data fields'
    );
  });

  it('rejects malformed policy objects before they can be treated as configuration', () => {
    expect(() =>
      validateControlledFaultHarnessPolicy(null as unknown as ControlledFaultHarnessPolicy)
    ).toThrow('must be plain enumerable data objects');

    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        testDomain: 42,
      } as unknown as ControlledFaultHarnessPolicy)
    ).toThrow('testDomain must be a non-empty string');

    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: [null],
      } as unknown as ControlledFaultHarnessPolicy)
    ).toThrow('must be plain enumerable data objects');

    const sparseAllowlist = new Array(2);
    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: sparseAllowlist,
      } as unknown as ControlledFaultHarnessPolicy)
    ).toThrow('must not be sparse');

    const hugeSparseAllowlist = new Array(4_294_967_295);
    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: hugeSparseAllowlist,
      } as unknown as ControlledFaultHarnessPolicy)
    ).toThrow('no more than 64 values');
  });

  it('bounds and deduplicates approved record types and mutation IDs', () => {
    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: [
          {
            name: 'www.faults.example.test',
            types: ['CNAME', 'CNAME'],
            mutationIds: ['LIVE-01'],
          },
        ],
      })
    ).toThrow('must not contain duplicates');

    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        allowlist: new Array(65).fill(policy().allowlist[0]),
      })
    ).toThrow('no more than 64 values');
  });

  it('requires a scoped fingerprint and a strict mail subdomain', () => {
    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        providerCredentialFingerprint: 'not-a-fingerprint',
      })
    ).toThrow('sha256');

    expect(() =>
      validateControlledFaultHarnessPolicy({
        ...policy(),
        testMailSubdomain: 'faults.example.test',
      })
    ).toThrow('strict subdomain');
  });
});
