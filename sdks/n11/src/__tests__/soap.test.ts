import { describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  LoncaError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TokenBucketRateLimiter,
  ValidationError,
} from '@lonca/core';
import { mapSoapFailure, mapSoapHttpError } from '../soap/errors.js';
import { N11Transport } from '../transport.js';

/** A SOAP response envelope the way a JAX-WS server writes it. Values are invented. */
function soapResponse(operation: string, inner: string, init: ResponseInit = {}): Response {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header/>' +
      `<SOAP-ENV:Body><ns3:${operation}Response xmlns:ns3="http://www.n11.com/ws/schemas">${inner}` +
      `</ns3:${operation}Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
    { status: 200, headers: { 'content-type': 'text/xml;charset=utf-8' }, ...init },
  );
}

function fault(code: string, message: string, status = 500): Response {
  return new Response(
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body>' +
      `<SOAP-ENV:Fault><faultcode>${code}</faultcode><faultstring>${message}</faultstring></SOAP-ENV:Fault>` +
      '</SOAP-ENV:Body></SOAP-ENV:Envelope>',
    { status, headers: { 'content-type': 'text/xml' } },
  );
}

function makeTransport(fetchImpl: typeof fetch) {
  return new N11Transport({
    appKey: 'key&1',
    appSecret: 'secret<2',
    env: 'prod',
    integratorName: 'TestIntegrator',
    fetch: fetchImpl,
  });
}

describe('N11Transport.soap', () => {
  it('posts an escaped envelope to /ws/<service>/ with SOAP headers and no auth headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        soapResponse('GetX', '<result><status>success</status></result><value>7</value>'),
      );
    const response = await makeTransport(fetchMock).soap({
      service: 'productService',
      operation: 'GetX',
      fields: { search: { name: 'a & b', missing: undefined }, pagingData: { currentPage: 0 } },
    });

    expect(response).toEqual({ result: { status: 'success' }, value: '7' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.n11.com/ws/productService/');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
      SOAPAction: '""',
    });
    expect(init.body).toBe(
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas">' +
        '<soapenv:Header/><soapenv:Body><sch:GetXRequest>' +
        '<auth><appKey>key&amp;1</appKey><appSecret>secret&lt;2</appSecret></auth>' +
        '<search><name>a &amp; b</name></search><pagingData><currentPage>0</currentPage></pagingData>' +
        '</sch:GetXRequest></soapenv:Body></soapenv:Envelope>',
    );
  });

  it('passes the rate limiter through', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, intervalMs: 1000 });
    const acquire = vi.spyOn(limiter, 'acquire');
    const fetchMock = vi.fn().mockResolvedValue(soapResponse('GetX', ''));
    await makeTransport(fetchMock).soap({ service: 's', operation: 'GetX', rateLimiter: limiter });
    expect(acquire).toHaveBeenCalledOnce();
  });

  it('returns an empty object when the expected response element is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    await expect(
      makeTransport(fetchMock).soap({ service: 's', operation: 'GetX' }),
    ).resolves.toEqual({});
  });

  it('throws on result.status failure (HTTP 200) with the error fields as issues', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        soapResponse(
          'GetX',
          '<result><status>failure</status><errorCode>SELLER_API.authenticationFailed</errorCode>' +
            '<errorMessage>Apide doğrulama işlemi başarısız oldu.</errorMessage><errorCategory>SELLER_API</errorCategory></result>',
        ),
      );
    const error = await makeTransport(fetchMock)
      .soap({ service: 's', operation: 'GetX' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).issues).toEqual([
      {
        code: 'SELLER_API.authenticationFailed',
        message: 'Apide doğrulama işlemi başarısız oldu.',
      },
    ]);
    expect((error as AuthError).message).not.toContain('Apide');
  });

  it('retries a 5xx fault because every SOAP call is a read', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fault('SOAP-ENV:Server', 'temporary'))
      .mockResolvedValueOnce(soapResponse('GetX', '<ok>1</ok>'));
    await expect(
      makeTransport(fetchMock).soap({ service: 's', operation: 'GetX' }),
    ).resolves.toEqual({
      ok: '1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('N11Transport.soap idempotency', () => {
  it('does not retry a write on a 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fault('SOAP-ENV:Server', 'down', 503));
    await expect(
      makeTransport(fetchMock).soap({ service: 's', operation: 'SaveX', idempotent: false }),
    ).rejects.toBeInstanceOf(ServerError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('mapSoapFailure', () => {
  it.each([
    [{ errorCode: 'SELLER_API.authenticationFailed' }, AuthError],
    [{ errorCategory: 'AUTHENTICATION' }, AuthError],
    [{ errorCode: 'maxCallLimit.reached' }, RateLimitError],
    [{ errorCode: 'validation.date' }, ValidationError],
    [{ errorCode: 'SELLER_API.productQuestion.notFound' }, NotFoundError],
    [{ errorCode: 'SELLER_API.order.not.found' }, NotFoundError],
    [{ errorCode: 'systemError' }, ServerError],
    [{ errorCode: 'SELLER_API.claimReturn.invalidRequestForApprove' }, ValidationError],
    [{}, ValidationError],
  ])('maps %j', (info, ErrorClass) => {
    const error = mapSoapFailure('GetX', { status: 'failure', ...info });
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.status).toBe(200);
    expect(error.message).toContain('GetX');
  });

  it('uses the code as the issue message when there is no message', () => {
    expect(mapSoapFailure('GetX', { errorCode: 'x.y' }).issues).toEqual([
      { code: 'x.y', message: 'x.y' },
    ]);
    expect(mapSoapFailure('GetX', {}).issues).toEqual([]);
  });
});

describe('mapSoapHttpError', () => {
  const faultXml = (code: string) =>
    `<soap:Envelope xmlns:soap="x"><soap:Body><soap:Fault><faultcode>${code}</faultcode>` +
    '<faultstring>Unmarshalling Error</faultstring></soap:Fault></soap:Body></soap:Envelope>';

  it('maps a client fault to ValidationError with the fault as issue', () => {
    const error = mapSoapHttpError(500, faultXml('soap:Client'));
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.issues).toEqual([{ code: 'soap:Client', message: 'Unmarshalling Error' }]);
    expect(error.message).not.toContain('Unmarshalling');
  });

  it('maps a server fault to a retryable ServerError', () => {
    const error = mapSoapHttpError(500, faultXml('soap:Server'));
    expect(error).toBeInstanceOf(ServerError);
    expect(error.retryable).toBe(true);
  });

  it.each([
    [401, AuthError],
    [403, AuthError],
    [429, RateLimitError],
    [400, ValidationError],
    [503, ServerError],
  ])('maps HTTP %i without a fault body', (status, ErrorClass) => {
    expect(mapSoapHttpError(status, 'Authentication failed')).toBeInstanceOf(ErrorClass);
  });

  it('carries retryAfterMs on 429', () => {
    expect(mapSoapHttpError(429, undefined, 2000).retryAfterMs).toBe(2000);
  });

  it('tolerates an unparsable or fault-less XML body', () => {
    expect(mapSoapHttpError(502, '<html><body>Bad gateway')).toBeInstanceOf(ServerError);
    const error = mapSoapHttpError(500, '<a><Envelope/></a>');
    expect(error).toBeInstanceOf(ServerError);
    expect(error.issues).toEqual([]);
  });

  it('maps an unexpected status to UNKNOWN', () => {
    const error = mapSoapHttpError(302, '');
    expect(error).toBeInstanceOf(LoncaError);
    expect(error.code).toBe('UNKNOWN');
  });
});
