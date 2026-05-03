import { redirect } from '@tanstack/react-router';

/**
 * Route beforeLoad guard that requires authentication.
 * Redirects to /login if the user is not authenticated.
 */
export async function requireAuthGuard() {
  if (typeof window === 'undefined') return;

  const res = await fetch('/api/auth/me', { credentials: 'include' });
  const data = (await res.json()) as Record<string, unknown>;

  if (!data.authenticated) {
    throw redirect({ to: '/login' });
  }
}
