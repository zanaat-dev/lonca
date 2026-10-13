import {
  AuthError,
  LoncaError,
  type LoncaErrorIssue,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';
import { asObject, asText, parseXml, type XmlObject } from './xml.js';

/**
 * The `result` element every n11 SOAP response carries
 * (`ResultInfo { status, errorCode, errorMessage, errorCategory }`).
 */
export interface SoapResultInfo {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
}

function issuesOf(info: SoapResultInfo): LoncaErrorIssue[] {
  if (!info.errorMessage && !info.errorCode) return [];
  const issue: LoncaErrorIssue = { message: info.errorMessage ?? info.errorCode ?? '' };
  if (info.errorCode) issue.code = info.errorCode;
  return [issue];
}

/**
 * Turn a `result.status: "failure"` (sent with HTTP 200) into a `LoncaError`.
 *
 * n11 documents error **codes** only for the REST services, so the mapping
 * below is keyed on substrings:
 *
 * - a code or category mentioning authentication → `AuthError` (a wrong
 *   secret answers HTTP 200 with `SELLER_API.authenticationFailed`, verified
 *   on prod 2026-10-10);
 * - `maxCallLimit` / a "limit" code (the legacy manual's over-limit code, and
 *   the question list's once-a-minute rule) → `RateLimitError`;
 * - a "not found" code (`SELLER_API.productQuestion.notFound`,
 *   `SELLER_API.order.not.found`, seen on the test store 2026-10-13) →
 *   `NotFoundError`;
 * - `systemError` ("Sistemde bir hata oluştu.") → `ServerError`;
 * - anything else → `ValidationError` (not retried). Writes on an id in the
 *   wrong state answer codes like `SELLER_API.claimReturn.invalidRequestForApprove`.
 */
export function mapSoapFailure(operation: string, info: SoapResultInfo, status = 200): LoncaError {
  const code = `${info.errorCode ?? ''} ${info.errorCategory ?? ''}`.toLowerCase();
  const data = { result: info } as Record<string, unknown>;
  const issues = issuesOf(info);
  if (code.includes('auth')) {
    return new AuthError({
      message: `n11 rejected the credentials (${operation}) — check appKey / appSecret`,
      status,
      data,
      issues,
    });
  }
  if (code.includes('limit')) {
    return new RateLimitError({
      message: `n11 rate limit exceeded (${operation})`,
      status,
      data,
      issues,
    });
  }
  if (/not\.?found/.test(code)) {
    return new NotFoundError({
      message: `n11 resource not found (${operation})`,
      status,
      data,
      issues,
    });
  }
  if (code.includes('systemerror')) {
    return new ServerError({ message: `n11 server error (${operation})`, status, data, issues });
  }
  return new ValidationError({
    message: `n11 rejected the request (${operation})`,
    status,
    data,
    issues,
  });
}

/** Read `Envelope > Body > Fault` from a parsed SOAP response, if present. */
function faultOf(doc: XmlObject): { code?: string; message?: string } | undefined {
  const body = asObject(asObject(doc.Envelope).Body);
  if (!('Fault' in body)) return undefined;
  const fault = asObject(body.Fault);
  return { code: asText(fault.faultcode), message: asText(fault.faultstring) };
}

/**
 * Map a non-2xx SOAP response. `body` is the raw response text (the shared
 * requester falls back to text when the body is not JSON).
 *
 * - a SOAP `Fault` whose `faultcode` is a client fault → `ValidationError`;
 * - any other fault, or an unparsable body, follows the HTTP status:
 *   `401`/`403` → `AuthError`, `429` → `RateLimitError`, `5xx` → `ServerError`
 *   (retried — every SOAP call the SDK makes is a read), other `4xx` →
 *   `ValidationError`.
 *
 * Fault strings go to `issues`, never to `message`.
 */
export function mapSoapHttpError(status: number, body: unknown, retryAfterMs?: number): LoncaError {
  let fault: { code?: string; message?: string } | undefined;
  if (typeof body === 'string' && body.includes('<')) {
    try {
      fault = faultOf(parseXml(body));
    } catch {
      // Not XML after all (an HTML error page, …): fall back to the status.
    }
  }
  const data = { body } as Record<string, unknown>;
  const issues: LoncaErrorIssue[] = fault?.message ? [{ message: fault.message }] : [];
  if (fault?.code) issues.forEach((issue) => (issue.code = fault.code));
  if (status === 401 || status === 403) {
    return new AuthError({
      message: `n11 rejected the credentials (HTTP ${status})`,
      status,
      data,
      issues,
    });
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
  if (fault?.code && /client$/i.test(fault.code)) {
    return new ValidationError({
      message: `n11 rejected the request (HTTP ${status})`,
      status,
      data,
      issues,
    });
  }
  if (status >= 500) {
    return new ServerError({ message: `n11 server error (${status})`, status, data, issues });
  }
  if (status >= 400) {
    return new ValidationError({
      message: `n11 rejected the request (HTTP ${status})`,
      status,
      data,
      issues,
    });
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
