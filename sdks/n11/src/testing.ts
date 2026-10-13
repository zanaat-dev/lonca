import { buildClient, type N11Client } from './client.js';
import { N11Transport } from './transport.js';

/** A request the fake client received, normalized for matching in a `handler`. */
export interface FakeN11Request {
  method: string;
  /** URL path only — no host, no query string (SOAP calls: `/ws/<service>/`). */
  path: string;
  /** Parsed query parameters. */
  query: URLSearchParams;
  /** Parsed JSON body for REST calls; the raw envelope for SOAP calls. */
  body?: unknown;
  /** For SOAP calls: the operation name, e.g. `GetProductQuestionList`. */
  soapOperation?: string;
}

export interface N11FakeSeed {
  /**
   * Return what n11 would answer, or `undefined` for a permissive default.
   *
   * - REST: the JSON body. Defaults: empty pages and lists, a queued task
   *   (`{ id: 1, status: 'IN_QUEUE' }`) for product writes, and a `PROCESSED`
   *   task with no SKU results for task details.
   * - SOAP: the inner XML of `<Operation>Response` (for example
   *   `'<result><status>success</status></result><productQuestions>…'`).
   *   Default: a bare success result.
   */
  handler?: (req: FakeN11Request) => unknown;
}

/**
 * Build an in-memory {@link N11Client} for unit tests.
 *
 * It is the real client graph wired over a fake `fetch`, so your tests exercise
 * the SDK's real request building and response normalization, REST and SOAP
 * alike — no network. Unhandled calls get permissive defaults; drive the ones
 * your test touches with `seed.handler`.
 *
 * @example
 * ```ts
 * const client = createFakeN11Client({
 *   handler: (req) =>
 *     req.path === '/ms/product-query'
 *       ? { content: [{ n11ProductId: 1, stockCode: 'SKU-1', title: 'Örnek' }], totalPages: 1 }
 *       : undefined,
 * });
 * const page = await client.products.list();
 * page.items[0].stockCode; // 'SKU-1'
 * ```
 */
export function createFakeN11Client(seed: N11FakeSeed = {}): N11Client {
  const fakeFetch: typeof fetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const isSoap = url.pathname.startsWith('/ws/');
    const req: FakeN11Request = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body: isSoap ? body : parseJson(body),
    };
    if (isSoap) {
      const operation = /<sch:(\w+)Request>/.exec(body ?? '')?.[1] ?? '';
      req.soapOperation = operation;
      const handled = seed.handler?.(req);
      const inner =
        typeof handled === 'string' ? handled : '<result><status>success</status></result>';
      return Promise.resolve(soapResponse(operation, inner));
    }
    const handled = seed.handler?.(req);
    return Promise.resolve(jsonResponse(handled !== undefined ? handled : defaultRest(req)));
  };

  return buildClient(
    new N11Transport({
      appKey: 'fake',
      appSecret: 'fake',
      env: 'prod',
      integratorName: 'fake',
      fetch: fakeFetch,
    }),
  );
}

function defaultRest(req: FakeN11Request): unknown {
  if (req.path.startsWith('/ms/product/tasks/')) {
    return { id: 1, type: 'FAKE', status: 'IN_QUEUE', reasons: [] };
  }
  if (req.path === '/ms/product/task-details/page-query') {
    const taskId = (req.body as { taskId?: unknown } | undefined)?.taskId ?? 1;
    return { taskId, status: 'PROCESSED', skus: { content: [], last: true, totalPages: 1 } };
  }
  return { content: [], categories: [], categoryAttributes: [], totalPages: 0, last: true };
}

function parseJson(body: string | undefined): unknown {
  if (body === undefined) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function soapResponse(operation: string, inner: string): Response {
  return new Response(
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">' +
      `<SOAP-ENV:Header/><SOAP-ENV:Body><ns3:${operation}Response xmlns:ns3="http://www.n11.com/ws/schemas">` +
      `${inner}</ns3:${operation}Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
    { status: 200, headers: { 'content-type': 'text/xml;charset=utf-8' } },
  );
}
