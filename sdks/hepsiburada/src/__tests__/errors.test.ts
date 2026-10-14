import { describe, expect, it } from 'vitest';
import { AuthError, NotFoundError, ValidationError } from '@lonca/core';
import { mapHttpError } from '../errors.js';

describe('hepsiburada mapHttpError', () => {
  it('maps 401 to AuthError and surfaces the raw body on data', () => {
    const err = mapHttpError(401, { message: 'bad creds' });
    expect(err).toBeInstanceOf(AuthError);
    expect(err.data).toEqual({ body: { message: 'bad creds' } });
  });

  it('maps 403 to AuthError with a fixed message, never echoing the raw body', () => {
    const err = mapHttpError(403, { message: 'merchant 12345 not allowed on /oms/orders' });
    expect(err).toBeInstanceOf(AuthError);
    // The raw 403 body can echo request context — it must not land in `message`.
    expect(err.message).not.toContain('12345');
    expect(err.message).toBe(
      'Hepsiburada forbidden (check credentials, permissions, or User-Agent header)',
    );
    // …but stays available for debugging.
    expect(err.data).toEqual({ body: { message: 'merchant 12345 not allowed on /oms/orders' } });
  });

  it('maps 403 "MerchantHasNoLine" (an order the merchant does not have) to NotFoundError', () => {
    const body = { code: 1005, message: 'MerchantHasNoLine : 1' };
    const err = mapHttpError(403, body);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('MerchantHasNoLine : 1');
    expect(err.data).toEqual({ body });
  });

  it('normalizes { errors: [{ message, code }] } into issues', () => {
    const err = mapHttpError(400, { errors: [{ code: 'E1', message: 'sku invalid' }] });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.issues).toEqual([{ code: 'E1', message: 'sku invalid' }]);
  });

  it('normalizes a flat { message } into a single issue', () => {
    expect(mapHttpError(422, { message: 'oops' }).issues).toEqual([{ message: 'oops' }]);
  });

  it('falls back to { title } when present', () => {
    expect(mapHttpError(400, { title: 'Bad Request' }).issues).toEqual([
      { message: 'Bad Request' },
    ]);
  });

  it('issues is [] when nothing is parseable', () => {
    expect(mapHttpError(500, null).issues).toEqual([]);
  });

  it('copies only field/code/message into issues, never extra (PII) fields', () => {
    const err = mapHttpError(400, {
      errors: [{ code: 'E', message: 'm', phone: '5551234567' }],
    });
    expect(err.issues).toEqual([{ code: 'E', message: 'm' }]);
    expect(JSON.stringify(err.issues)).not.toContain('5551234567');
  });
});
