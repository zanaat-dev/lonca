import { buildClient, type HepsiburadaClient } from './client.js';
import { HepsiburadaTransport } from './transport.js';

/** A request the fake client received, normalized for matching in a `handler`. */
export interface FakeHepsiburadaRequest {
  method: string;
  /** URL path only — no host, no query string. */
  path: string;
  /** Parsed query parameters. */
  query: URLSearchParams;
  /** Parsed JSON request body, when present; a multipart body as its `FormData`. */
  body?: unknown;
}

export interface HepsiburadaFakeSeed {
  /**
   * Return the raw JSON Hepsiburada would respond with for a request, or
   * `undefined` to fall through to a permissive empty default (empty lists /
   * pages) so untouched endpoints don't throw.
   */
  handler?: (req: FakeHepsiburadaRequest) => unknown;
}

/**
 * Build an in-memory {@link HepsiburadaClient} for unit tests.
 *
 * It is the real client graph wired over a fake `fetch`, so your tests exercise
 * the SDK's real request building and response normalization — no network, no
 * structural-compat guessing. Unhandled endpoints return empty lists/pages;
 * drive the endpoints your test touches with `seed.handler`.
 *
 * @example
 * ```ts
 * const client = createFakeHepsiburadaClient({
 *   handler: (req) =>
 *     req.path.includes('/listings/merchantid/')
 *       ? { listings: [{ listingId: 'L1' }], totalCount: 1, limit: 50, offset: 0 }
 *       : undefined,
 * });
 * const page = await client.listings.list({ offset: 0, limit: 50 });
 * page.items[0].listingId; // 'L1'
 * ```
 */
export function createFakeHepsiburadaClient(seed: HepsiburadaFakeSeed = {}): HepsiburadaClient {
  const fakeFetch: typeof fetch = (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl);
    const req: FakeHepsiburadaRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body: parseBody(init?.body),
    };

    const handled = seed.handler?.(req);
    return Promise.resolve(jsonResponse(handled !== undefined ? handled : defaultResponse()));
  };

  const transport = new HepsiburadaTransport({
    merchantId: '00000000-0000-0000-0000-000000000000',
    username: 'fake',
    password: 'fake',
    env: 'sit',
    integratorName: 'fake',
    fetch: fakeFetch,
  });

  return buildClient(transport);
}

/**
 * Permissive empty shape satisfying both the array-or-`items` list normalizers
 * and the `listings` / offset-page normalizers, so an un-seeded endpoint
 * resolves to "nothing" instead of throwing.
 */
function defaultResponse(): unknown {
  return { items: [], listings: [], totalCount: 0, limit: 0, offset: 0, pageCount: 0 };
}

function parseBody(body: unknown): unknown {
  if (body instanceof FormData) return body;
  if (typeof body !== 'string') return undefined;
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
