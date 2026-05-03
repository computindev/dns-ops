/**
 * Auth Pending Component
 *
 * Renders while route beforeLoad auth guard is checking credentials.
 * Prevents flash of unauthenticated content during hydration.
 * Identical HTML on SSR and client — no hydration mismatch.
 */

export function AuthPending() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <div
          className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"
          role="status"
          aria-label="Verifying authentication"
        />
        <p className="mt-3 text-sm text-gray-500">Verifying session...</p>
      </div>
    </div>
  );
}
