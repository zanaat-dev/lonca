import { describe, expect, it } from 'vitest';
import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '@lonca/core';
import { mapHttpError, parseRetryAfter } from '../errors.js';

describe('mapHttpError', () => {
  it('maps 401 to AuthError', () => {
    const err = mapHttpError(401, { exception: 'ClientApiAuthenticationException' });
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it('maps 403 to ValidationError (likely missing User-Agent)', () => {
    const err = mapHttpError(403, null);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.retryable).toBe(false);
  });

  it('keeps the JSON 403 mapping (ValidationError with normalized issues)', () => {
    const err = mapHttpError(403, { errors: [{ message: 'User-Agent missing' }] });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.issues).toEqual([{ message: 'User-Agent missing' }]);
  });

  it('maps a non-JSON (HTML) 403 to AuthError and never leaks the body', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>secret-ray-id</body></html>';
    const err = mapHttpError(403, html);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(
      'Trendyol rejected the request before it reached the API (HTTP 403, non-JSON body) — check IP allowlisting / credentials / User-Agent',
    );
    // Redaction: only a kind + length hint, never the raw server body.
    expect(err.data).toEqual({ bodyKind: 'html', bodyLength: html.length });
    expect(JSON.stringify(err.data)).not.toContain('Cloudflare');
    expect(JSON.stringify(err.data)).not.toContain('secret-ray-id');
    expect(err.issues).toEqual([]);
  });

  it('maps a non-JSON (text) 401 to AuthError with the redacted hint', () => {
    const err = mapHttpError(401, 'access denied');
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toContain('HTTP 401, non-JSON body');
    expect(err.data).toEqual({ bodyKind: 'text', bodyLength: 13 });
  });

  it('maps 404 to NotFoundError', () => {
    const err = mapHttpError(404, null);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.retryable).toBe(false);
  });

  it('maps 429 to RateLimitError, preserving retryAfterMs', () => {
    const err = mapHttpError(429, null, 5000);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
  });

  it.each([500, 502, 503, 504])('maps %i to ServerError (retryable)', (status) => {
    const err = mapHttpError(status, null);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.retryable).toBe(true);
  });

  it('maps 400 / 422 to ValidationError carrying the first message (stage answer, 2026-10-14)', () => {
    const err = mapHttpError(400, {
      exception: 'TrendyolBusinessException',
      errors: [
        {
          key: 'invalid.cargo.provider.for.box.info',
          message: 'Sadece CEVAMP … koli bilgisi beslenebilir',
        },
      ],
    });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(
      'Trendyol rejected the request (400): Sadece CEVAMP … koli bilgisi beslenebilir',
    );
    expect(mapHttpError(422, null)).toMatchObject({
      message: 'Trendyol rejected the request (422)',
      status: 422,
    });
  });

  it('maps unknown statuses to a non-retryable LoncaError', () => {
    const err = mapHttpError(418, { foo: 'bar' });
    expect(err).toBeInstanceOf(LoncaError);
    expect(err.code).toBe('UNKNOWN');
    expect(err.retryable).toBe(false);
    expect(err.data).toEqual({ body: { foo: 'bar' } });
  });

  it('issues defaults to [] when the body has no errors array', () => {
    expect(mapHttpError(400, { foo: 'bar' }).issues).toEqual([]);
    expect(mapHttpError(400, null).issues).toEqual([]);
  });

  it('normalizes { errors: [{ field, message }] } into issues', () => {
    const err = mapHttpError(400, {
      errors: [{ field: 'barcode', message: 'barcode is required' }],
    });
    expect(err.issues).toEqual([{ field: 'barcode', message: 'barcode is required' }]);
  });

  it('normalizes { errors: [string] } into issues', () => {
    const err = mapHttpError(400, { errors: ['something went wrong'] });
    expect(err.issues).toEqual([{ message: 'something went wrong' }]);
  });

  it('reads errors nested under { body: { errors } }', () => {
    const err = mapHttpError(400, { body: { errors: [{ message: 'nested' }] } });
    expect(err.issues).toEqual([{ message: 'nested' }]);
  });

  it('copies only field/code/message into issues, never extra (PII) fields', () => {
    const err = mapHttpError(400, {
      errors: [{ field: 'x', code: 'E1', message: 'bad', identityNumber: '12345678901' }],
    });
    expect(err.issues).toEqual([{ field: 'x', code: 'E1', message: 'bad' }]);
    expect(JSON.stringify(err.issues)).not.toContain('12345678901');
  });
});

describe('parseRetryAfter', () => {
  it('returns undefined when header is null', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('parses an integer number of seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('treats a non-positive delay as no hint (avoids a zero-delay retry storm)', () => {
    // A literal `Retry-After: 0` must not collapse exponential backoff to an
    // immediate retry — it is ignored so the caller falls back to backoff.
    expect(parseRetryAfter('0')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });

  it('parses an HTTP-date into a positive delay', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(8_000);
    expect(ms).toBeLessThan(12_000);
  });

  it('ignores past HTTP-dates (no positive delay to honor)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBeUndefined();
  });

  it('returns undefined for garbage', () => {
    expect(parseRetryAfter('not a date')).toBeUndefined();
  });
});
