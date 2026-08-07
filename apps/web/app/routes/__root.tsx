import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useLocation,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  clearAuthenticatedQueryCache,
  didPrincipalChange,
  isAuthenticationCacheEpochKey,
  notifyAuthenticationChange,
} from '../lib/evidence-query-cache.js';
import '../styles/app.css';

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    title: 'DNS Ops Workbench',
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [{ rel: 'stylesheet', href: '/_build/assets/client.css' }],
  }),
});

function AuthNav() {
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLoggingOut = useRef(false);
  const principalRef = useRef<string | null>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isAuthenticationCacheEpochKey(event.key)) void clearAuthenticatedQueryCache(queryClient);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only pathname matters for re-checking auth
  useEffect(() => {
    setMounted(true);
    if (isLoggingOut.current) {
      isLoggingOut.current = false;
      return;
    }
    void clearAuthenticatedQueryCache(queryClient);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then((res) => res.json())
      .then((raw) => {
        const data = raw as Record<string, unknown>;
        if (data.authenticated) {
          const email = (data.email as string | undefined) || null;
          const tenant = (data.tenant as string | undefined) || null;
          const principal = `${tenant ?? ''}:${email ?? ''}`;
          if (didPrincipalChange(principalRef.current, principal)) {
            void clearAuthenticatedQueryCache(queryClient);
            principalRef.current = principal;
          }
          setIsAuthenticated(true);
          setUserEmail(email);
        } else {
          if (didPrincipalChange(principalRef.current, null))
            void clearAuthenticatedQueryCache(queryClient);
          principalRef.current = null;
          setIsAuthenticated(false);
          setUserEmail(null);
        }
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location.pathname]);

  const handleLogout = async () => {
    isLoggingOut.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
    await clearAuthenticatedQueryCache(queryClient);
    notifyAuthenticationChange();
    flushSync(() => {
      setIsAuthenticated(false);
      setUserEmail(null);
    });
    navigate({ to: '/login' });
  };

  // During SSR and hydration, render a stable placeholder
  if (!mounted) {
    return (
      <Link to="/login" className="ds-nav-link">
        Login
      </Link>
    );
  }

  if (isAuthenticated) {
    return (
      <>
        <span className="text-sm text-muted">{userEmail}</span>
        <button
          type="button"
          onClick={handleLogout}
          className="ds-nav-link cursor-pointer border-0 bg-transparent"
        >
          Logout
        </button>
      </>
    );
  }

  return (
    <Link to="/login" className="ds-nav-link">
      Login
    </Link>
  );
}

function RootComponent() {
  const router = useRouter();
  const queryClient = router.options.context.queryClient;

  return (
    <QueryClientProvider client={queryClient}>
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body>
          <div className="ds-app-shell">
            <header className="ds-app-header">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                  <Link to="/" className="ds-wordmark">
                    DNS Ops Workbench
                  </Link>
                  <nav className="flex gap-6 items-center">
                    <Link to="/" className="ds-nav-link">
                      Home
                    </Link>
                    <Link to="/portfolio" className="ds-nav-link">
                      Portfolio
                    </Link>
                    <Link to="/cases" className="ds-nav-link">
                      Cases
                    </Link>
                    <AuthNav />
                  </nav>
                </div>
              </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Outlet />
            </main>
          </div>
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  );
}
