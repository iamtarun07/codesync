/**
 * Bearer-token fallback for the auth cookie.
 *
 * The server's httpOnly cookie stays the primary mechanism. It is only ever
 * dropped when the API lives on a different site than the frontend and the
 * browser blocks third-party cookies — which is exactly the case a user hits on
 * a second device (Safari/iOS, Chrome incognito, Brave, Firefox ETP strict all
 * block by default). Without a fallback, login returns 200 and every request
 * after it fails with UNAUTHENTICATED.
 *
 * Trade-off: unlike the httpOnly cookie this value IS readable by scripts, so an
 * XSS on the frontend can steal it. Removing this file is only safe once the API
 * is served same-site as the app (api.example.com + app.example.com sharing a
 * registrable domain, or the API reverse-proxied under the app's origin), at
 * which point the cookie alone works everywhere.
 */
const KEY = 'codesync_token';

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Private-mode Safari and blocked-storage settings throw on access.
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — the cookie is the only channel left */
  }
}
