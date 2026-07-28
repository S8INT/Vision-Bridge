/**
 * Lightweight access-token registry for non-React service modules.
 *
 * The AuthContext holds the JWT access token in React state. Plain service
 * modules (imagingService, analyticsService, …) run outside the React tree and
 * cannot call hooks, so AuthContext mirrors the current token here via
 * `setAuthToken`. Services then attach it with `getAuthHeaders()`.
 */

let currentAccessToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentAccessToken = token;
}

export function getAuthToken(): string | null {
  return currentAccessToken;
}

export function getAuthHeaders(): Record<string, string> {
  return currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {};
}
