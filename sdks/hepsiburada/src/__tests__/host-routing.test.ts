/**
 * Transport-level host-routing tests.
 *
 * The developer portal's OpenAPI documents (`specs/hepsiburada/*.json`,
 * `servers[0]`) put five resources on dedicated service hosts that the SDK
 * used to route through `oms-external`, where every call died with 401/404
 * (measured on SIT, 2026-08-30 — see `probe-snapshots/README.md`). These
 * tests pin the **full URL** each resource emits through a real
 * `HepsiburadaTransport` with an injected `fetch`, so a future refactor
 * can't silently point a resource back at the wrong host.
 */

import { describe, expect, it, vi } from 'vitest';
import { buildClient } from '../client.js';
import { HepsiburadaTransport, type HepsiburadaEnvironment } from '../transport.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(env: HepsiburadaEnvironment) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
  const transport = new HepsiburadaTransport({
    merchantId: 'MID-1',
    username: 'user',
    password: 'pass',
    env,
    integratorName: 'TestIntegrator',
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client: buildClient(transport), fetchMock };
}

function firstCall(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
  return { url: String(url), init };
}

const DATES = { recordDateStart: '2026-08-01', recordDateEnd: '2026-08-28' };

describe.each([
  ['sit', '-sit'],
  ['prod', ''],
] as const)('host routing (%s)', (env, suffix) => {
  it(`accounting.listTransactions → mpfinance-external${suffix} with required Offset/Limit`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.accounting.listTransactions(DATES);
    const { url } = firstCall(fetchMock);
    expect(url).toMatch(
      new RegExp(
        `^https://mpfinance-external${suffix}\\.hepsiburada\\.com/transactions/merchantid/MID-1\\?`,
      ),
    );
    expect(url).toContain('Offset=0');
    expect(url).toContain('Limit=100');
    expect(url).toContain('RecordDateStart=2026-08-01');
  });

  it(`suppliers.getListingUpdateRequest → supplier-api-external${suffix}`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.suppliers.getListingUpdateRequest('REQ-1');
    expect(firstCall(fetchMock).url).toBe(
      `https://supplier-api-external${suffix}.hepsiburada.com/suppliers/MID-1/listingUpdateRequests/REQ-1`,
    );
  });

  it(`questions.list → api-asktoseller-merchant${suffix} with the merchantId header`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.questions.list({ page: 0, size: 10 });
    const { url, init } = firstCall(fetchMock);
    expect(url).toBe(
      `https://api-asktoseller-merchant${suffix}.hepsiburada.com/api/v1.0/issues?page=0&size=10`,
    );
    expect((init.headers as Record<string, string>).merchantId).toBe('MID-1');
    // The shared header set still rides along.
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('TestIntegrator');
  });

  it(`promotions → diskonto-external${suffix} (discounts carry required page/pagesize)`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.promotions.listCategories();
    await client.promotions.listDiscounts();
    const categoriesUrl = String(fetchMock.mock.calls[0]![0]);
    const discountsUrl = String(fetchMock.mock.calls[1]![0]);
    expect(categoriesUrl).toBe(
      `https://diskonto-external${suffix}.hepsiburada.com/categories/MID-1`,
    );
    expect(discountsUrl).toBe(
      `https://diskonto-external${suffix}.hepsiburada.com/self-campaign/MID-1/discounts?page=1&pagesize=100`,
    );
  });

  it(`productUpdates → mpop${suffix} under the /ticket-api base path`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.productUpdates.getUpdateStatus('TRK-1');
    expect(firstCall(fetchMock).url).toBe(
      `https://mpop${suffix}.hepsiburada.com/ticket-api/api/integrator/status/TRK-1`,
    );
  });

  it(`productUpdates import / history → mpop${suffix}/ticket-api (multipart file on the POST)`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.productUpdates.importUpdates([{ hbSku: 'HB-1', productName: 'Yeni' }]);
    await client.productUpdates.getUpdateHistory('HB-1');
    const [importUrl, importInit] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(String(importUrl)).toBe(
      `https://mpop${suffix}.hepsiburada.com/ticket-api/api/integrator/import`,
    );
    expect(importInit.method).toBe('POST');
    // multipart: the transport leaves Content-Type to fetch, which adds the boundary.
    expect(importInit.body).toBeInstanceOf(FormData);
    expect(new Headers(importInit.headers).has('content-type')).toBe(false);
    const file = (importInit.body as FormData).get('file') as File;
    expect(JSON.parse(await file.text())).toEqual({
      merchantId: 'MID-1',
      items: [{ hbSku: 'HB-1', productName: 'Yeni' }],
    });
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `https://mpop${suffix}.hepsiburada.com/ticket-api/api/integrator/merchant/MID-1/hbSku/HB-1`,
    );
  });

  it(`claims → oms-external${suffix} for list/actions, claim-stub-external${suffix} for create`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.claims.list();
    await client.claims.accept('CLM-1');
    await client.claims.create({ orderNumber: 'O-1' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `https://oms-external${suffix}.hepsiburada.com/claims/merchantId/MID-1?offset=0&limit=100`,
    );
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      `https://oms-external${suffix}.hepsiburada.com/claims/number/CLM-1/accept`,
    );
    expect(String(fetchMock.mock.calls[2]![0])).toBe(
      `https://claim-stub-external${suffix}.hepsiburada.com/claims/merchant/MID-1/create`,
    );
  });

  it(`catalog.getTrackingIdHistory → mpop${suffix} under /product/api/products`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.catalog.getTrackingIdHistory();
    expect(firstCall(fetchMock).url).toBe(
      `https://mpop${suffix}.hepsiburada.com/product/api/products/trackingId-history`,
    );
  });

  it(`existing resources keep their hosts (orders → oms-external${suffix}, catalog → mpop${suffix})`, async () => {
    const { client, fetchMock } = makeClient(env);
    await client.orders.list({ offset: 0, limit: 1 });
    await client.catalog.listProducts({ page: 0, size: 1 });
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      new RegExp(`^https://oms-external${suffix}\\.hepsiburada\\.com/orders/merchantId/MID-1`),
    );
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(
      new RegExp(`^https://mpop${suffix}\\.hepsiburada\\.com/product/api/products/`),
    );
  });
});
