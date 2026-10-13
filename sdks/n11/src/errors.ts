import {
  AuthError,
  LoncaError,
  type LoncaErrorIssue,
  normalizeIssueEntries,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';

/**
 * Map an n11 HTTP error response to a `@lonca/core` error.
 *
 * n11's three REST path families answer errors differently (observed on prod,
 * 2026-10-10, read-only GETs):
 *
 * - `/ms/…` (products) — a Spring envelope `{ "@type", name, message,
 *   description, urlStack, errors: [{ reason }] }`. A wrong `appsecret` is
 *   `401 SellerApiUserUnauthorizedException`; a **missing** auth header and
 *   bad parameters (`size` over 250, an unknown enum value, a negative page)
 *   come back as `500 InternalServerException` whose `message` names the Java
 *   exception (`MissingRequestHeaderException`, `ConstraintViolationException`,
 *   `IllegalArgumentException`, …). Those 500s are client errors, so they map
 *   to `AuthError` / `ValidationError` instead of a retryable `ServerError`.
 * - `/rest/…` (orders) — a wrong `appsecret` is `400 { code, status: "failure",
 *   errorCode: "SELLER_API.authenticationFailed", errorMessage, errorCategory }`.
 * - `/cdn/…` (categories) — a wrong key is `403 text/plain` ("Authentication
 *   failed"); an unknown or non-leaf category is `400 { errorCode:
 *   "invalidInput", errorMessage }`.
 *
 * Otherwise the usual status mapping applies:
 *
 * - `401` / `403` → `AuthError`
 * - `400` / `422` → `ValidationError`
 * - `404` → `NotFoundError`
 * - `429` → `RateLimitError` (carries `retryAfterMs` when the server sent `Retry-After`). n11
 *   does not send 429 (n11 support, 2026-10-13): bursts get the client IP suspended instead,
 *   and what that response looks like is unknown
 * - `5xx` → `ServerError` (retryable)
 * - other → `LoncaError` with code `UNKNOWN`
 *
 * The raw body stays on `error.data.body`; user-facing messages are fixed
 * strings so a server message that echoes request context never leaks into
 * logs that print `error.message`.
 */
export function mapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  const data = { body } as Record<string, unknown>;
  const issues = normalizeErrorIssues(body);
  const kind = classifyBody(body);
  if (status === 401 || status === 403 || kind === 'auth') {
    return new AuthError({
      message: `n11 rejected the credentials (HTTP ${status}) — check appKey / appSecret`,
      status,
      data,
      issues,
    });
  }
  if (status === 400 || status === 422 || kind === 'validation') {
    return new ValidationError({
      message: `n11 rejected the request (HTTP ${status})`,
      status,
      data,
      issues,
    });
  }
  if (status === 404) {
    return new NotFoundError({ message: 'n11 resource not found', status, data, issues });
  }
  if (status === 429) {
    return new RateLimitError({
      message: 'n11 rate limit exceeded',
      status,
      retryAfterMs,
      data,
      issues,
    });
  }
  if (status >= 500) {
    return new ServerError({ message: `n11 server error (${status})`, status, data, issues });
  }
  return new LoncaError({
    code: 'UNKNOWN',
    message: `n11 unexpected response (${status})`,
    status,
    data,
    issues,
    retryable: false,
  });
}

/**
 * Java exception names n11's `/ms` services report inside a `500
 * InternalServerException` for what is really a bad request (observed on prod).
 */
const CLIENT_EXCEPTIONS = new Set([
  'ConstraintViolationException',
  'IllegalArgumentException',
  'MethodArgumentTypeMismatchException',
  'MissingServletRequestParameterException',
]);

/** Spot auth / validation failures that n11 sends with a misleading HTTP status. */
function classifyBody(body: unknown): 'auth' | 'validation' | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.errorCode === 'string' && b.errorCode.endsWith('authenticationFailed')) {
    return 'auth';
  }
  if (b['@type'] !== 'InternalServerException' || typeof b.message !== 'string') return undefined;
  if (b.message === 'MissingRequestHeaderException') return 'auth';
  if (CLIENT_EXCEPTIONS.has(b.message)) return 'validation';
  return undefined;
}

/**
 * Best-effort extraction of issues. Error bodies seen on the wire carry them as
 * `errors: [{ reason }]` (`/ms`), `{ errorCode, errorMessage }` (`/rest`,
 * `/cdn`) or a flat `message`; the documented 2xx bodies of the write services
 * use `reasons: string[]`. Only `{ field, code, message }` are copied — never
 * the raw payload.
 */
function normalizeErrorIssues(body: unknown): LoncaErrorIssue[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    return normalizeIssueEntries(b.errors.map(withReasonAsMessage));
  }
  if (Array.isArray(b.reasons) && b.reasons.length > 0) return normalizeIssueEntries(b.reasons);
  if (typeof b.errorMessage === 'string') {
    const issue: LoncaErrorIssue = { message: b.errorMessage };
    if (typeof b.errorCode === 'string') issue.code = b.errorCode;
    return [issue];
  }
  if (typeof b.message === 'string') return [{ message: b.message }];
  return [];
}

/** n11's Spring envelope names the text `reason`; `normalizeIssueEntries` reads `message`. */
function withReasonAsMessage(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as Record<string, unknown>;
  if (typeof e.message !== 'string' && typeof e.reason === 'string') {
    return { ...e, message: e.reason };
  }
  return entry;
}
