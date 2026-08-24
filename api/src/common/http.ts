import { ServiceUnavailableException } from '@nestjs/common';

// Default ceiling for any outbound call to a third-party API (Eskiz / didox /
// soliq). Without this a stalled upstream that accepts the connection but never
// responds would hang the request indefinitely (e.g. the booking-confirm flow
// that awaits an SMS send).
export const EXTERNAL_TIMEOUT_MS = 10_000;

// fetch() with a hard timeout. A timeout (or any abort) is surfaced as a 503
// ServiceUnavailableException so callers can treat it like any other upstream
// failure instead of leaking an opaque AbortError.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = EXTERNAL_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new ServiceUnavailableException(`Upstream timed out after ${ms}ms: ${url}`);
    }
    throw e;
  }
}

// Marks an upstream failure that retrying cannot fix: bad credentials, a
// malformed request, a missing document. Distinct from a timeout or a 5xx,
// which are worth backing off and trying again.
//
// Without this every failure looked transient, so a rejected didox token was
// retried 5 times per booking — ~60 pointless auth attempts across one
// month-end run, and ~8 minutes before the real reason reached the operator.
export function markPermanent<T>(e: T): T {
  (e as any).permanentUpstream = true;
  return e;
}

export function isPermanentUpstream(e: unknown): boolean {
  return !!(e as any)?.permanentUpstream;
}

// 4xx means "your request is wrong" and will stay wrong. 429 is the exception:
// it explicitly asks you to come back later.
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}
