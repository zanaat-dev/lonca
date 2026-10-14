import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { ExportCenterResource } from '../resources/export-center.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, sellerId = 42) {
  return {
    sellerId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new ExportCenterResource(t, fastLimiter());

// ─── Products ────────────────────────────────────────────────────────────

describe('ExportCenterResource.listProducts', () => {
  it('GETs /integration/ecgw/v2/{id}/products with no query by default', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listProducts();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/ecgw/v2/42/products',
      }),
    );
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toBeUndefined();
  });

  it('forwards barcodes (joined CSV), pageKey, size', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listProducts({ barcodes: ['HB1', 'HB2'], pageKey: 'tok-1', size: 50 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ barcodes: 'HB1,HB2', pageKey: 'tok-1', size: 50 });
  });

  it('unwraps content / items / data envelopes + surfaces raw', async () => {
    const rowsContent = await r(mockTransport({ content: [{ barcode: 'A' }] })).listProducts();
    expect(rowsContent[0]!.raw).toMatchObject({ barcode: 'A' });
    const rowsArray = await r(mockTransport([{ barcode: 'B' }])).listProducts();
    expect(rowsArray[0]!.raw).toMatchObject({ barcode: 'B' });
  });

  it('omits an empty barcodes list and an empty pageKey from the query', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listProducts({ barcodes: [], pageKey: '', size: 0 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // size: 0 is still a value the caller set, so it is forwarded.
    expect(call.query).toEqual({ size: 0 });
  });

  it.each([
    ['items', { items: [{ barcode: 'I' }] }, 'I'],
    ['data', { data: [{ barcode: 'D' }] }, 'D'],
    ['products', { products: [{ barcode: 'P' }] }, 'P'],
    ['packages', { packages: [{ barcode: 'K' }] }, 'K'],
  ] as const)('unwraps the %s envelope', async (_key, body, barcode) => {
    const rows = await r(mockTransport(body)).listProducts();
    expect(rows).toEqual([{ raw: { barcode } }]);
  });

  it('prefers content over the other envelope keys', async () => {
    const rows = await r(
      mockTransport({ content: [{ barcode: 'C' }], items: [{ barcode: 'I' }] }),
    ).listProducts();
    expect(rows).toEqual([{ raw: { barcode: 'C' } }]);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not-json'],
    ['an object with no list', { content: 'nope', totalElements: 0 }],
  ])('returns [] when the response is %s', async (_label, body) => {
    expect(await r(mockTransport(body)).listProducts()).toEqual([]);
  });

  it('maps null rows to an empty raw object', async () => {
    expect(await r(mockTransport([null])).listProducts()).toEqual([{ raw: {} }]);
  });

  it('uses its own limiter when none is injected', async () => {
    const transport = mockTransport([]);
    await new ExportCenterResource(transport).listProducts();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.rateLimiter).toBeInstanceOf(TokenBucketRateLimiter);
  });
});

describe('ExportCenterResource.createProducts / updatePrices / updateStocks', () => {
  it.each([
    ['createProducts', 'POST', '/integration/ecgw/v2/42/products', 'products'],
    ['updatePrices', 'POST', '/integration/ecgw/v1/42/prices', 'priceInfos'],
    ['updateStocks', 'POST', '/integration/ecgw/v1/42/stocks', 'stocks'],
  ] as const)('%s POSTs to %s with body wrapper %s', async (method, verb, path, key) => {
    const transport = mockTransport({ batchId: 'BR-1' });
    const resource = r(transport);
    const items = [{ barcode: 'X' }];
    await resource[method](items);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, path, body: { [key]: items } }),
    );
  });

  it.each(['createProducts', 'updatePrices', 'updateStocks'] as const)(
    '%s throws on empty array',
    async (method) => {
      const resource = r(mockTransport({}));
      await expect(resource[method]([])).rejects.toThrow(ValidationError);
    },
  );

  it.each(['createProducts', 'updatePrices', 'updateStocks'] as const)(
    '%s throws on >5000 items',
    async (method) => {
      const resource = r(mockTransport({}));
      const oversized = Array.from({ length: 5001 }, () => ({ barcode: 'X' }));
      await expect(resource[method](oversized)).rejects.toThrow(/max 5000/);
    },
  );

  it('createProducts returns { batchId, raw } envelope', async () => {
    const transport = mockTransport({ batchId: 'BR-7' });
    const out = await r(transport).createProducts([{ barcode: 'A' }]);
    expect(out.batchId).toBe('BR-7');
    expect(out.raw).toBeDefined();
  });

  it('createProducts falls back to batchRequestId / id on the wire', async () => {
    const out = await r(mockTransport({ batchRequestId: 'B-2' })).createProducts([{ x: 1 }]);
    expect(out.batchId).toBe('B-2');
  });

  it('updatePrices falls back to a numeric id and stringifies it', async () => {
    const out = await r(mockTransport({ id: 77 })).updatePrices([{ barcode: 'A' }]);
    expect(out).toEqual({ batchId: '77', raw: { id: 77 } });
  });

  it.each([
    ['an object without any id', { accepted: true }, { accepted: true }],
    ['undefined', undefined, {}],
    ['a string', 'OK', {}],
  ])('updateStocks returns batchId "" for %s', async (_label, body, raw) => {
    const out = await r(mockTransport(body)).updateStocks([{ barcode: 'A' }]);
    expect(out).toEqual({ batchId: '', raw });
  });

  it('rejects a non-array input before calling the API', async () => {
    const transport = mockTransport({});
    await expect(
      r(transport).createProducts(undefined as unknown as Array<{ barcode: string }>),
    ).rejects.toThrow(/createProducts: items must not be empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('accepts exactly 5000 items', async () => {
    const transport = mockTransport({ batchId: 'B-5000' });
    const items = Array.from({ length: 5000 }, () => ({ barcode: 'X' }));
    await expect(r(transport).updateStocks(items)).resolves.toMatchObject({ batchId: 'B-5000' });
  });
});

// ─── Batch status ────────────────────────────────────────────────────────

describe('ExportCenterResource.getBatchStatus', () => {
  it('GETs /check-status?batchId=...', async () => {
    const transport = mockTransport({ batchId: 'B-1', status: 'DONE', itemCount: 3 });
    const out = await r(transport).getBatchStatus('B-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/ecgw/v1/42/check-status',
        query: { batchId: 'B-1' },
      }),
    );
    expect(out).toMatchObject({ batchId: 'B-1', status: 'DONE', itemCount: 3 });
  });

  it('throws on empty batchId', async () => {
    await expect(r(mockTransport()).getBatchStatus('')).rejects.toThrow(/batchId is required/);
  });

  it('surfaces failedItemCount and the per-item rows', async () => {
    const items = [{ barcode: 'A', status: 'FAILED', failureReasons: ['bad price'] }];
    const out = await r(
      mockTransport({
        batchId: 'B-1',
        status: 'COMPLETED',
        itemCount: 1,
        failedItemCount: 1,
        items,
      }),
    ).getBatchStatus('B-1');
    expect(out).toMatchObject({ failedItemCount: 1, items });
  });

  it('drops fields with unexpected wire types but keeps them in raw', async () => {
    const wire = { batchId: 123, status: null, itemCount: '3', failedItemCount: '0', items: {} };
    const out = await r(mockTransport(wire)).getBatchStatus('B-1');
    expect(out).toStrictEqual({ raw: wire });
  });

  it('returns { raw: {} } for a non-object response', async () => {
    expect(await r(mockTransport(undefined)).getBatchStatus('B-1')).toStrictEqual({ raw: {} });
  });
});

// ─── Packages ────────────────────────────────────────────────────────────

describe('ExportCenterResource — packages', () => {
  it('listPackagesV2 GETs /v2/{id}/packages with query', async () => {
    const transport = mockTransport({ content: [{ packageNumber: 'PKG-1', status: 'new' }] });
    const out = await r(transport).listPackagesV2({
      status: 'new',
      trackingNumber: 'TRK1',
      size: 50,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v2/42/packages');
    expect(call.query).toMatchObject({ trackingNumber: 'TRK1', status: 'new', size: 50 });
    expect(out[0]).toMatchObject({ packageNumber: 'PKG-1', status: 'new' });
  });

  it('listPackagesV3 uses /v3 path + page/size from limit/offset', async () => {
    const transport = mockTransport({ content: [] });
    await r(transport).listPackagesV3({ offset: 2, limit: 25, status: 'completed' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v3/42/packages');
    expect(call.query).toMatchObject({ status: 'completed', page: 2, size: 25 });
  });

  it('getPackageItems GETs /v2/{id}/packages/items with packageId in query', async () => {
    const transport = mockTransport({ content: [{ barcode: 'A' }] });
    await r(transport).getPackageItems({ packageId: 'PKG-1', status: 'pending', limit: 30 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v2/42/packages/items');
    expect(call.query).toMatchObject({ packageId: 'PKG-1', status: 'pending', size: 30 });
  });

  it('getPackageItems throws when packageId is missing', async () => {
    await expect(
      r(mockTransport()).getPackageItems({ packageId: '' } as { packageId: string }),
    ).rejects.toThrow(/packageId is required/);
  });

  it('listPackagesV2 forwards every filter and sends them all undefined by default', async () => {
    const transport = mockTransport([]);
    await r(transport).listPackagesV2({
      trackingNumber: 'TRK1',
      status: 'new',
      creationStartDate: 1_700_000_000_000,
      creationEndDate: 1_700_086_400_000,
      size: 100,
      boutiqueId: 9,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({
      trackingNumber: 'TRK1',
      status: 'new',
      creationStartDate: 1_700_000_000_000,
      creationEndDate: 1_700_086_400_000,
      size: 100,
      boutiqueId: 9,
    });

    const bare = mockTransport([]);
    await r(bare).listPackagesV2();
    const bareCall = (bare.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(Object.values(bareCall.query).every((v) => v === undefined)).toBe(true);
  });

  it('listPackagesV3 maps offset 0 to page 0 and leaves page undefined without an offset', async () => {
    const first = mockTransport([]);
    await r(first).listPackagesV3({ offset: 0, creationStartDate: 1, creationEndDate: 2 });
    const firstCall = (first.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(firstCall.query).toMatchObject({ page: 0, creationStartDate: 1, creationEndDate: 2 });

    const bare = mockTransport([]);
    await r(bare).listPackagesV3();
    const bareCall = (bare.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(bareCall.query.page).toBeUndefined();
    expect(bareCall.query.size).toBeUndefined();
  });

  it('listPackagesV3 unwraps the packages envelope and normalizes rows', async () => {
    const out = await r(
      mockTransport({
        packages: [{ packageNumber: 'PKG-9', status: 'completed', weight: 2 }, null],
      }),
    ).listPackagesV3();
    expect(out).toStrictEqual([
      {
        packageNumber: 'PKG-9',
        status: 'completed',
        raw: { packageNumber: 'PKG-9', status: 'completed', weight: 2 },
      },
      { raw: {} },
    ]);
  });

  it('normalizePackage drops non-string packageNumber / status', async () => {
    const row = { packageNumber: 123, status: 4 };
    const [pkg] = await r(mockTransport({ content: [row] })).listPackagesV2();
    expect(pkg).toStrictEqual({ raw: row });
  });

  it('getPackageItems maps offset to page, unwraps items and keeps raw rows', async () => {
    const transport = mockTransport({ items: [{ barcode: 'A', quantity: 2 }, null] });
    const out = await r(transport).getPackageItems({ packageId: 'PKG-1', offset: 3 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ packageId: 'PKG-1', status: undefined, page: 3, size: undefined });
    expect(out).toEqual([{ raw: { barcode: 'A', quantity: 2 } }, { raw: {} }]);
  });

  it('getPackageItems throws without calling the API when params are missing', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).getPackageItems(undefined as unknown as { packageId: string }),
    ).rejects.toThrow(/packageId is required/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

// ─── Lookup ──────────────────────────────────────────────────────────────

describe('ExportCenterResource — lookup', () => {
  it('getCategoryAttributes GETs the right path + url-encodes category id', async () => {
    const transport = mockTransport([{ attributeId: 100, attributeName: 'Color', required: true }]);
    const out = await r(transport).getCategoryAttributes('cat/with/slashes');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe(
      '/integration/ecgw/v1/42/lookup/product-categories/cat%2Fwith%2Fslashes/attributes',
    );
    expect(out[0]).toMatchObject({ attributeId: 100, attributeName: 'Color', required: true });
  });

  it('getCategoryAttributes throws on missing id', async () => {
    await expect(r(mockTransport()).getCategoryAttributes('' as unknown as string)).rejects.toThrow(
      /categoryId is required/,
    );
  });

  it.each([
    ['getCareInstructions', '/integration/ecgw/v1/42/lookup/care-instructions'],
    ['getCompositions', '/integration/ecgw/v1/42/lookup/compositions'],
    ['getOrigins', '/integration/ecgw/v1/42/lookup/origins'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport([{ id: 1, name: 'Sample' }]);
    const resource = r(transport);
    const out = await resource[method]();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path }),
    );
    expect(out[0]).toMatchObject({ id: 1, name: 'Sample' });
  });

  it('getOrigins surfaces countryCode when present', async () => {
    const out = await r(
      mockTransport([{ id: 1, name: 'Türkiye', countryCode: 'TR' }]),
    ).getOrigins();
    expect(out[0]).toMatchObject({ id: 1, name: 'Türkiye', countryCode: 'TR' });
  });

  it('getOrigins keeps a string id and drops fields with unexpected types', async () => {
    const odd = { id: true, name: 5, countryCode: 90 };
    const out = await r(
      mockTransport({ data: [{ id: 'TR', name: 'Türkiye' }, odd, null] }),
    ).getOrigins();
    expect(out).toStrictEqual([
      { id: 'TR', name: 'Türkiye', raw: { id: 'TR', name: 'Türkiye' } },
      { raw: odd },
      { raw: {} },
    ]);
  });

  it('getCategoryAttributes keeps a string attributeId and the values list', async () => {
    const values = [{ id: 1, name: 'Red' }];
    const [attr] = await r(
      mockTransport({
        content: [{ attributeId: 'A-1', attributeName: 'Color', required: false, values }],
      }),
    ).getCategoryAttributes(411);
    expect(attr).toMatchObject({ attributeId: 'A-1', required: false, values });
  });

  it('getCategoryAttributes drops fields with unexpected types but keeps them in raw', async () => {
    const odd = { attributeId: null, attributeName: 1, required: 'yes', values: 'Red' };
    const out = await r(mockTransport([odd, null])).getCategoryAttributes(411);
    expect(out).toStrictEqual([{ raw: odd }, { raw: {} }]);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('getCategoryAttributes throws on a %s id without calling the API', async (_label, id) => {
    const transport = mockTransport();
    await expect(r(transport).getCategoryAttributes(id as unknown as string)).rejects.toThrow(
      /categoryId is required/,
    );
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('getCategoryAttributes accepts category id 0', async () => {
    const transport = mockTransport([]);
    await r(transport).getCategoryAttributes(0);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/integration/ecgw/v1/42/lookup/product-categories/0/attributes');
  });

  it.each(['getCareInstructions', 'getCompositions'] as const)(
    '%s keeps a string id and drops fields with unexpected types',
    async (method) => {
      const odd = { id: {}, name: null };
      const out = await r(mockTransport({ items: [{ id: 'C-1', name: 'Wool' }, odd, null] }))[
        method
      ]();
      expect(out).toStrictEqual([
        { id: 'C-1', name: 'Wool', raw: { id: 'C-1', name: 'Wool' } },
        { raw: odd },
        { raw: {} },
      ]);
    },
  );
});
