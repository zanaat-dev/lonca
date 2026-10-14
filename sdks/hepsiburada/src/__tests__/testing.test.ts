import { describe, expect, it, vi } from 'vitest';
import { createFakeHepsiburadaClient, type FakeHepsiburadaRequest } from '../testing.js';
import type * as TransportModule from '../transport.js';

/**
 * The fake client hands its `fetch` to a real `HepsiburadaTransport`. The
 * transport always calls it with a string URL, a method and a JSON body, so the
 * fake's handling of the other `fetch` inputs (a `URL`, a `Request`, no `init`,
 * a non-JSON body) is only reachable by calling that `fetch` directly. Wrap the
 * transport to capture it; behaviour is otherwise unchanged.
 */
const captured = vi.hoisted(() => ({ fetch: undefined as typeof fetch | undefined }));
vi.mock('../transport.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TransportModule>();
  class CapturingTransport extends actual.HepsiburadaTransport {
    constructor(config: ConstructorParameters<typeof actual.HepsiburadaTransport>[0]) {
      super(config);
      captured.fetch = config.fetch;
    }
  }
  return { ...actual, HepsiburadaTransport: CapturingTransport };
});

describe('createFakeHepsiburadaClient', () => {
  it('exposes capabilities like a real client', () => {
    const client = createFakeHepsiburadaClient();
    expect(client.capabilities.scheduledPricing).toBe(true);
    expect(client.capabilities.listingUpdatedAt).toBe(false);
  });

  it('listings.list returns an empty OffsetPage by default', async () => {
    const client = createFakeHepsiburadaClient();
    const page = await client.listings.list({ offset: 0, limit: 50 });
    expect(page.items).toEqual([]);
    expect(page.pageCount).toBe(0);
  });

  it('seeds listing rows through a handler', async () => {
    const client = createFakeHepsiburadaClient({
      handler: (req) =>
        req.path.includes('/listings/merchantid/')
          ? { listings: [{ listingId: 'L1' }], totalCount: 1, limit: 50, offset: 0 }
          : undefined,
    });
    const page = await client.listings.list({ offset: 0, limit: 50 });
    expect(page.items.map((l) => l.listingId)).toEqual(['L1']);
  });

  it('surfaces customerName from a nested customer object via orders.list', async () => {
    const client = createFakeHepsiburadaClient({
      handler: (req) =>
        req.method === 'GET' && req.path.includes('/orders')
          ? {
              totalCount: 1,
              limit: 50,
              offset: 0,
              pageCount: 1,
              items: [
                { orderNumber: 'HBO-9', customer: { firstName: 'Ada', lastName: 'Lovelace' } },
              ],
            }
          : undefined,
    });
    const page = await client.orders.list({ offset: 0, limit: 50 });
    expect(page.items[0]!.customerName).toBe('Ada Lovelace');
  });

  it('gives the handler the method, host-less path, parsed query and no body for a GET', async () => {
    const seen: FakeHepsiburadaRequest[] = [];
    const client = createFakeHepsiburadaClient({ handler: (req) => void seen.push(req) });
    await client.claims.listByStatus('NewRequest', { limit: 5 });
    expect(seen).toHaveLength(1);
    const req = seen[0]!;
    expect(req.method).toBe('GET');
    expect(req.path).toBe(
      '/claims/merchantId/00000000-0000-0000-0000-000000000000/status/NewRequest',
    );
    expect(Object.fromEntries(req.query)).toEqual({ offset: '0', limit: '5' });
    expect(req.body).toBeUndefined();
  });

  it('gives the handler the body of a POST (multipart as FormData) and returns its response', async () => {
    const seen: FakeHepsiburadaRequest[] = [];
    const client = createFakeHepsiburadaClient({
      handler: (req) => {
        seen.push(req);
        return req.path === '/ticket-api/api/integrator/import'
          ? { trackingId: 'TRK-FAKE' }
          : undefined;
      },
    });
    const receipt = await client.productUpdates.importUpdates([{ hbSku: 'HB-1' }]);
    expect(receipt.trackingId).toBe('TRK-FAKE');
    // A multipart body reaches the handler as its FormData.
    expect(seen[0]).toMatchObject({ method: 'POST' });
    const file = (seen[0]!.body as FormData).get('file') as File;
    expect(JSON.parse(await file.text())).toMatchObject({ items: [{ hbSku: 'HB-1' }] });
  });

  it('resolves un-seeded list endpoints across resources to empty results', async () => {
    const client = createFakeHepsiburadaClient();
    await expect(client.claims.list()).resolves.toEqual([]);
    await expect(client.catalog.getTrackingIdHistory()).resolves.toEqual([]);
    await expect(client.productUpdates.getUpdateHistory('HB-1')).resolves.toEqual([]);
    await expect(client.productUpdates.getUpdateStatus('TRK-1')).resolves.toMatchObject({
      rows: [],
    });
  });

  describe('fake fetch (called directly)', () => {
    const fakeFetch = (handler: (req: FakeHepsiburadaRequest) => unknown) => {
      createFakeHepsiburadaClient({ handler });
      return captured.fetch!;
    };

    it('accepts a URL object and defaults the method to GET when init is omitted', async () => {
      const seen: FakeHepsiburadaRequest[] = [];
      const f = fakeFetch((req) => void seen.push(req));
      const res = await f(new URL('https://mpop-sit.hepsiburada.com/x/y?a=1'));
      expect(seen[0]).toMatchObject({ method: 'GET', path: '/x/y', body: undefined });
      expect(seen[0]!.query.get('a')).toBe('1');
      // Un-handled → the permissive empty default.
      await expect(res.json()).resolves.toMatchObject({ items: [], totalCount: 0 });
    });

    it('accepts a Request object and upper-cases the method', async () => {
      const seen: FakeHepsiburadaRequest[] = [];
      const f = fakeFetch((req) => {
        seen.push(req);
        return { ok: true };
      });
      const res = await f(new Request('https://oms-external-sit.hepsiburada.com/orders?offset=2'), {
        method: 'post',
      });
      expect(seen[0]).toMatchObject({ method: 'POST', path: '/orders' });
      expect(seen[0]!.query.get('offset')).toBe('2');
      await expect(res.json()).resolves.toEqual({ ok: true });
    });

    it('passes a non-JSON string body through unparsed', async () => {
      const seen: FakeHepsiburadaRequest[] = [];
      const f = fakeFetch((req) => void seen.push(req));
      await f('https://mpop-sit.hepsiburada.com/upload', { method: 'POST', body: 'a=1&b=2' });
      expect(seen[0]!.body).toBe('a=1&b=2');
    });
  });
});
