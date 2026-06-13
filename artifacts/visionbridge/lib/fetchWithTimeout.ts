/**
 * fetchWithTimeout
 *
 * Drop-in replacement for `fetch` that aborts after `timeoutMs` milliseconds
 * and throws a descriptive error. Safe to use everywhere in the app — on
 * slow 2G/3G connections in low-resource settings, plain `fetch` can hang
 * indefinitely.
 *
 * Default timeout:   15 s  (auth + API calls)
 * Upload timeout:    60 s  (image multipart uploads — pass explicitly)
 */

export const DEFAULT_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 60_000;

export class RequestTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs / 1000}s — check your network connection. (${url})`
    );
    this.name = "RequestTimeoutError";
  }
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = init ?? {};

  const controller = new AbortController();

  const timerId = setTimeout(() => {
    controller.abort(new RequestTimeoutError(String(input), timeoutMs));
  }, timeoutMs);

  // If the caller passed its own signal, abort our controller when it fires.
  callerSignal?.addEventListener("abort", () => controller.abort(callerSignal.reason));

  return fetch(input, { ...rest, signal: controller.signal }).then(
    (res) => { clearTimeout(timerId); return res; },
    (err) => {
      clearTimeout(timerId);
      if (err?.name === "AbortError") {
        const url = String(input);
        throw new RequestTimeoutError(url, timeoutMs);
      }
      throw err;
    },
  );
}
