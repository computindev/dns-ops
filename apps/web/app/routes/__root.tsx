import { QueryClientProvider } from '@tanstack/react-query';
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
  const isLoggingOut = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only pathname matters for re-checking auth
  useEffect(() => {
    setMounted(true);
    if (isLoggingOut.current) {
      isLoggingOut.current = false;
      return;
    }
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((raw) => {
        const data = raw as Record<string, unknown>;
        if (data.authenticated) {
          setIsAuthenticated(true);
          setUserEmail((data.email as string | undefined) || null);
        } else {
          setIsAuthenticated(false);
          setUserEmail(null);
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = async () => {
    isLoggingOut.current = true;
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    flushSync(() => {
      setIsAuthenticated(false);
      setUserEmail(null);
    });
    navigate({ to: '/login' });
  };

  // During SSR and hydration, render a stable placeholder
  if (!mounted) {
    return (
      <Link
        to="/login"
        className="focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium"
      >
        Login
      </Link>
    );
  }

  if (isAuthenticated) {
    return (
      <>
        <span className="text-sm text-gray-500">{userEmail}</span>
        <button
          type="button"
          onClick={handleLogout}
          className="focus-ring rounded text-gray-600 hover:text-gray-900 text-sm"
        >
          Logout
        </button>
      </>
    );
  }

  return (
    <Link
      to="/login"
      className="focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium"
    >
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
          <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                  <Link to="/" className="focus-ring text-xl font-bold text-gray-900 rounded">
                    DNS Ops Workbench
                  </Link>
                  <nav className="flex gap-6 items-center">
                    <Link
                      to="/"
                      className="focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium"
                    >
                      Home
                    </Link>
                    <Link
                      to="/portfolio"
                      className="focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium"
                    >
                      Portfolio
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
