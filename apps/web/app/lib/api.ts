/**
 * Authenticated fetch wrapper
 * Automatically includes credentials (cookies) for same-origin requests
 */

export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const headers = init?.headers || {};

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
