import type { QueryClient } from '@tanstack/react-query';

const AUTH_CACHE_EPOCH_KEY = 'dns-ops-auth-cache-epoch';

export function notifyAuthenticationChange(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_CACHE_EPOCH_KEY, String(Date.now()));
  }
}

export function isAuthenticationCacheEpochKey(key: string | null): boolean {
  return key === AUTH_CACHE_EPOCH_KEY;
}

export function didPrincipalChange(previous: string | null, next: string | null): boolean {
  return previous !== next;
}

/** Clear all tenant-bound query results whenever the authenticated principal changes. */
export async function clearAuthenticatedQueryCache(queryClient: QueryClient): Promise<void> {
  // resetQueries notifies active observers and clears their result data;
  // clear() alone removes cache entries but can leave mounted observers rendering
  // the prior principal's last result.
  await queryClient.cancelQueries();
  await queryClient.resetQueries();
  queryClient.removeQueries({ type: 'inactive' });
}

/** Refresh profile/evidence alongside the domain snapshot after a new scan. */
export async function invalidateDomainEvidenceQueries(
  queryClient: QueryClient,
  domain: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['domain-evidence', domain] }),
    queryClient.invalidateQueries({ queryKey: ['domain-profile', domain] }),
  ]);
}
