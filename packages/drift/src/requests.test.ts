import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSpecs, type SpecFile } from './openapi.js';
import { buildOperationIndex } from './operations.js';
import {
  captureRequest,
  checkRequest,
  createRequestRecorder,
  mediaKind,
  type CapturedRequest,
} from './requests.js';

const SPECS: SpecFile[] = [
  {
    id: 'shop/api.json',
    marketplace: 'shop',
    document: {
      servers: [{ url: 'https://api.shop.test/v1' }],
      components: {
        schemas: {
          Item: {
            type: 'object',
            required: ['sku', 'quantity'],
            properties: {
              sku: { type: 'string' },
              quantity: { type: 'integer' },
              note: { type: 'string' },
            },
          },
        },
        parameters: {
          Merchant: { name: 'merchantId', in: 'header', required: true },
        },
        requestBodies: {
          Items: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
              },
            },
          },
        },
      },
      paths: {
        '/items': {
          post: {
            parameters: [
              { $ref: '#/components/parameters/Merchant' },
              { name: 'dryRun', in: 'query', required: true },
            ],
            requestBody: { $ref: '#/components/requestBodies/Items' },
          },
          get: { parameters: [{ name: 'page', in: 'query' }] },
        },
        '/upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    required: ['file'],
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      Files: { type: 'array', items: { type: 'string', format: 'binary' } },
                      Answer: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        '/ref-upload': {
          post: {
            requestBody: {
              content: {
                'multipart/form-data': { schema: { $ref: '#/components/schemas/Upload' } },
              },
            },
          },
        },
        '/free': {
          put: {
            requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
          },
          post: { requestBody: { content: { '*/*': { schema: { type: 'string' } } } } },
          patch: { requestBody: { content: { 'application/json': {} } } },
        },
        '/optional-body': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
    },
  },
];
(SPECS[0]!.document.components!.schemas as Record<string, unknown>).Upload = {
  required: ['file'],
  properties: { file: { $ref: '#/components/schemas/Binary' } },
};
(SPECS[0]!.document.components!.schemas as Record<string, unknown>).Binary = {
  type: 'string',
  format: 'binary',
};

const index = buildOperationIndex(SPECS);
const check = (request: CapturedRequest) => checkRequest(request, index, SPECS);
const kinds = (request: CapturedRequest) =>
  check(request).findings.map((f) => `${f.severity} ${f.kind} ${f.path}`);

function json(url: string, body: unknown, headers: Record<string, string> = {}): CapturedRequest {
  return captureRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('captureRequest', () => {
  it('records method, url and lower-cased header names; no body for a GET', () => {
    expect(
      captureRequest(new URL('https://api.shop.test/v1/items?page=1'), {
        headers: { 'X-Trace': '1', Accept: 'application/json' },
      }),
    ).toEqual({
      method: 'GET',
      url: 'https://api.shop.test/v1/items?page=1',
      headers: ['accept', 'x-trace'],
      bodyKind: 'none',
    });
  });

  it('reads method and headers from a Request when init has none', () => {
    const request = new Request('https://api.shop.test/v1/items', {
      method: 'DELETE',
      headers: { 'X-A': '1' },
    });
    expect(captureRequest(request)).toMatchObject({
      method: 'DELETE',
      headers: ['x-a'],
      bodyKind: 'none',
    });
  });

  it('parses a JSON body by content type, or by its first character when untyped', () => {
    expect(json('https://x.test/a', [{ a: 1 }]).json).toEqual([{ a: 1 }]);
    expect(captureRequest('https://x.test/a', { method: 'POST', body: '{"b":2}' })).toMatchObject({
      bodyKind: 'json',
      json: { b: 2 },
    });
  });

  it('falls back to text for unparsable JSON and for non-JSON strings', () => {
    expect(
      captureRequest('https://x.test/a', {
        method: 'POST',
        body: '{oops',
        headers: { 'content-type': 'application/json' },
      }).bodyKind,
    ).toBe('text');
    expect(captureRequest('https://x.test/a', { method: 'POST', body: 'plain' }).bodyKind).toBe(
      'text',
    );
  });

  it('lists multipart parts as file or text, and form fields once each', () => {
    const form = new FormData();
    form.append('file', new Blob(['{}']), 'a.json');
    form.append('Answer', 'Evet');
    expect(captureRequest('https://x.test/a', { method: 'POST', body: form })).toMatchObject({
      bodyKind: 'multipart',
      parts: [
        { name: 'file', kind: 'file' },
        { name: 'Answer', kind: 'text' },
      ],
    });
    const params = new URLSearchParams([
      ['a', '1'],
      ['a', '2'],
      ['b', '3'],
    ]);
    expect(captureRequest('https://x.test/a', { method: 'POST', body: params })).toMatchObject({
      bodyKind: 'form',
      parts: [
        { name: 'a', kind: 'text' },
        { name: 'b', kind: 'text' },
      ],
    });
  });

  it('marks other bodies as binary', () => {
    expect(
      captureRequest('https://x.test/a', { method: 'POST', body: new Blob(['x']) }).bodyKind,
    ).toBe('binary');
  });
});

describe('createRequestRecorder', () => {
  it('answers 200 with the canned body and hands the requests over once', async () => {
    const recorder = createRequestRecorder((r) => ({ echo: r.method }));
    const response = await recorder.fetch('https://x.test/a', { method: 'PUT' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echo: 'PUT' });
    expect(recorder.take().map((r) => r.method)).toEqual(['PUT']);
    expect(recorder.take()).toEqual([]);
  });

  it('answers {} by default, and for a respond that returns nothing', async () => {
    expect(await (await createRequestRecorder().fetch('https://x.test/a')).json()).toEqual({});
    expect(
      await (await createRequestRecorder(() => undefined).fetch('https://x.test/a')).json(),
    ).toEqual({});
  });
});

describe('checkRequest', () => {
  const items = 'https://api.shop.test/v1/items?dryRun=1';

  it('passes a request that matches the documented body, header and query', () => {
    expect(kinds(json(items, [{ sku: 'A', quantity: 1 }], { merchantId: 'M' }))).toEqual([]);
  });

  it('reports an unmatched operation', () => {
    const result = check(captureRequest('https://api.shop.test/v1/nope', { method: 'POST' }));
    expect(result.operation).toMatchObject({ unmatched: true });
    expect(result.findings.map((f) => f.kind)).toEqual(['unmatched-operation']);
  });

  it('reports a missing required header and query parameter, and an undocumented query', () => {
    expect(
      kinds(json('https://api.shop.test/v1/items?extra=1', [{ sku: 'A', quantity: 1 }])),
    ).toEqual([
      'breaking request-param-missing header:merchantId',
      'breaking request-param-missing ?dryRun',
      'warning request-param-undocumented ?extra',
    ]);
  });

  it('compares a JSON body: missing required and wrong types break, extra fields warn', () => {
    expect(kinds(json(items, [{ sku: 1, extra: true }], { merchantId: 'M' }))).toEqual([
      'warning undocumented-field [].extra',
      'breaking missing-required [].quantity',
      'breaking type-mismatch [].sku',
    ]);
  });

  it('reports a JSON body where the operation documents multipart (the 2026-10-14 bug)', () => {
    expect(kinds(json('https://api.shop.test/v1/upload', [{ hbSku: 'A' }]))).toEqual([
      'breaking request-content-type ',
    ]);
  });

  it('checks multipart parts: required, undocumented and file-vs-text', () => {
    const form = new FormData();
    form.append('Answer', 'Evet');
    form.append('Files', 'not-a-file');
    form.append('Files', 'again');
    form.append('Other', 'x');
    expect(
      kinds(captureRequest('https://api.shop.test/v1/upload', { method: 'POST', body: form })),
    ).toEqual([
      'breaking missing-required file',
      'breaking type-mismatch Files',
      'warning undocumented-field Other',
    ]);
    const good = new FormData();
    good.append('file', new Blob(['[]']), 'f.json');
    expect(
      kinds(captureRequest('https://api.shop.test/v1/upload', { method: 'POST', body: good })),
    ).toEqual([]);
  });

  it('resolves a $ref multipart schema and its binary property', () => {
    const form = new FormData();
    form.append('file', 'text');
    expect(
      kinds(captureRequest('https://api.shop.test/v1/ref-upload', { method: 'POST', body: form })),
    ).toEqual(['breaking type-mismatch file']);
  });

  it('accepts any part under a property-less schema, and anything under */*', () => {
    const form = new FormData();
    form.append('x', '1');
    expect(
      kinds(captureRequest('https://api.shop.test/v1/free', { method: 'PUT', body: form })),
    ).toEqual([]);
    expect(
      kinds(
        captureRequest('https://api.shop.test/v1/free', { method: 'POST', body: new Blob(['x']) }),
      ),
    ).toEqual([]);
  });

  it('skips the body comparison for a media type without a schema, and for text bodies', () => {
    expect(
      kinds(captureRequest('https://api.shop.test/v1/free', { method: 'PATCH', body: '{"a":1}' })),
    ).toEqual([]);
  });

  it('handles bodies the operation does not document, and missing bodies', () => {
    expect(
      kinds(captureRequest('https://api.shop.test/v1/items?page=1', { method: 'GET', body: null })),
    ).toEqual([]);
    expect(
      kinds({
        ...captureRequest('https://api.shop.test/v1/items?page=1'),
        bodyKind: 'json',
        json: {},
      }),
    ).toEqual(['warning request-body-unexpected ']);
    expect(kinds(captureRequest(items, { method: 'POST', headers: { merchantId: 'M' } }))).toEqual([
      'breaking request-body-missing ',
    ]);
    expect(
      kinds(captureRequest('https://api.shop.test/v1/optional-body', { method: 'POST' })),
    ).toEqual([]);
  });

  it('drops not-observed and downgrades undocumented-null', () => {
    const findings = check(
      json(items, [{ sku: 'A', quantity: 1, note: null }], { merchantId: 'M' }),
    ).findings;
    expect(findings.map((f) => `${f.severity} ${f.kind}`)).toEqual(['info undocumented-null']);
  });
});

describe('mediaKind', () => {
  it.each([
    ['application/json', 'json'],
    ['application/*+json', 'json'],
    ['text/json', 'json'],
    ['multipart/form-data', 'multipart'],
    ['application/x-www-form-urlencoded', 'form'],
    ['text/plain', 'text'],
    ['*/*', 'any'],
    ['application/octet-stream', 'binary'],
  ])('%s → %s', (type, kind) => {
    expect(mediaKind(type)).toBe(kind);
  });
});

describe('real specs: the Hepsiburada multipart endpoints', () => {
  const specs = loadSpecs(fileURLToPath(new URL('../../../specs', import.meta.url)), [
    'hepsiburada',
  ]);
  const real = buildOperationIndex(specs);

  it('flags the JSON body the SDK sent before 1.3.0 and passes the multipart file it sends now', () => {
    const url = 'https://mpop-sit.hepsiburada.com/ticket-api/api/integrator/import';
    const before = checkRequest(json(url, [{ hbSku: 'A' }]), real, specs);
    expect(before.operation).toMatchObject({ spec: 'hepsiburada/mpop-product-updates.json' });
    expect(before.findings.map((f) => f.kind)).toEqual(['request-content-type']);
    const form = new FormData();
    form.append('file', new Blob(['{}']), 'f.json');
    expect(
      checkRequest(captureRequest(url, { method: 'POST', body: form }), real, specs).findings,
    ).toEqual([]);
  });
});
