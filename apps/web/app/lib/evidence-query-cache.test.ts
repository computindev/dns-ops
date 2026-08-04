import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  clearAuthenticatedQueryCache,
  didPrincipalChange,
  invalidateDomainEvidenceQueries,
  isAuthenticationCacheEpochKey,
} from './evidence-query-cache.js';

describe('evidence query cache isolation', () => {
  it('recognizes cross-tab authentication cache notifications', () => {
    expect(isAuthenticationCacheEpochKey('dns-ops-auth-cache-epoch')).toBe(true);
    expect(isAuthenticationCacheEpochKey('other-key')).toBe(false);
  });

  it('detects a principal change across independent browser-tab session refreshes', () => {
    expect(
      didPrincipalChange('tenant-a:operator@example.com', 'tenant-b:operator@example.com')
    ).toBe(true);
    expect(
      didPrincipalChange('tenant-a:operator@example.com', 'tenant-a:operator@example.com')
    ).toBe(false);
  });

  it('resets active observers as well as inactive previous-principal evidence', async () => {
    const client = new QueryClient();
    client.setQueryData(['domain-evidence', 'shared.example'], { tenant: 'previous' });
    client.setQueryData(['domain-profile', 'shared.example'], { tenant: 'previous' });

    const observer = new QueryObserver(client, {
      queryKey: ['domain-evidence', 'shared.example'],
      queryFn: async () => ({ tenant: 'new' }),
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await clearAuthenticatedQueryCache(client);

    expect(client.getQueryData(['domain-evidence', 'shared.example'])).toBeUndefined();
    expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
    expect(client.getQueryData(['domain-profile', 'shared.example'])).toBeUndefined();
  });

  it('invalidates profile and evidence after a fresh scan', async () => {
    const client = new QueryClient();
    client.setQueryData(['domain-evidence', 'example.com'], { snapshot: 'old' });
    client.setQueryData(['domain-profile', 'example.com'], { purpose: 'WEB' });

    await invalidateDomainEvidenceQueries(client, 'example.com');

    expect(client.getQueryState(['domain-evidence', 'example.com'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['domain-profile', 'example.com'])?.isInvalidated).toBe(true);
  });
});
