import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { CatalogResource } from '../resources/catalog.js';
import { CategoriesResource } from '../resources/categories.js';
import { OrdersResource } from '../resources/orders.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-2a') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Orders ──────────────────────────────────────────────────────────────

describe('OrdersResource', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it('list GETs /orders/merchantId/{id} on oms service', async () => {
    const transport = mockTransport({
      totalCount: 2,
      limit: 100,
      offset: 0,
      pageCount: 1,
      items: [
        { orderNumber: 'HBO-1', status: 'Open', createdDate: '2026-05-01T10:00:00Z' },
        { orderNumber: 'HBO-2', status: 'Shipped' },
      ],
    });
    const page = await r(transport).list({ status: 'Open', limit: 100, offset: 0 });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'oms',
        path: '/orders/merchantId/M-2a',
        query: expect.objectContaining({ status: 'Open', limit: 100, offset: 0 }),
      }),
    );
    expect(page.totalCount).toBe(2);
    expect(page.items[0]).toMatchObject({ orderNumber: 'HBO-1', status: 'Open' });
    expect(page.items[0]!.raw).toBeDefined();
  });

  it('list normalizes empty/malformed responses to zero-page', async () => {
    const page = await r(mockTransport(null)).list();
    expect(page).toEqual({ totalCount: 0, limit: 0, offset: 0, pageCount: 0, items: [] });
  });

  it('list forwards beginDate / endDate filters', async () => {
    const transport = mockTransport({ totalCount: 0, items: [] });
    await r(transport).list({ beginDate: '2026-01-01', endDate: '2026-02-01' });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({
      // Always sent: the order lists answer 400 without them (SIT, 2026-10-14).
      offset: 0,
      limit: 100,
      status: undefined,
      // Sent lower case, as the spec documents them.
      begindate: '2026-01-01',
      enddate: '2026-02-01',
    });
  });

  it('order lists keep an explicit offset / limit, including 0', async () => {
    const transport = mockTransport({ totalCount: 0, items: [] });
    await r(transport).listCancelled({ offset: 200, limit: 0 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({ offset: 200, limit: 0 });
  });

  it('listPackages GETs /packages/merchantId/{id} and unwraps raw array', async () => {
    const transport = mockTransport([
      { packageNumber: 'HBP-1', orderNumber: 'HBO-1', status: 'Open', cargoCompany: 'ARAS' },
    ]);
    const pkgs = await r(transport).listPackages({ status: 'Open' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'oms',
        path: '/packages/merchantId/M-2a',
      }),
    );
    expect(pkgs[0]).toMatchObject({
      packageNumber: 'HBP-1',
      orderNumber: 'HBO-1',
      status: 'Open',
      cargoCompany: 'ARAS',
    });
    expect(pkgs[0]!.raw).toBeDefined();
  });

  it('listPackages returns [] on non-array', async () => {
    const pkgs = await r(mockTransport({ unexpected: true })).listPackages();
    expect(pkgs).toEqual([]);
  });
});

// ─── Categories ──────────────────────────────────────────────────────────

describe('CategoriesResource', () => {
  const r = (t: HepsiburadaTransport) => new CategoriesResource(t, fastLimiter());

  it('list GETs /product/api/categories/get-all-categories on mpop service', async () => {
    const transport = mockTransport({
      success: true,
      code: 0,
      version: 1,
      message: null,
      totalElements: 27555,
      totalPages: 13778,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      data: [
        {
          categoryId: 60002258,
          name: '2. Sınıf',
          displayName: '2. Sınıf',
          parentCategoryId: 60002256,
          paths: ['Kitap', '2. Sınıf'],
          leaf: false,
          status: 'INACTIVE',
          type: 'HB',
          sortId: '2',
          available: false,
          productTypes: [],
          merge: false,
        },
      ],
    });
    const page = await r(transport).list({ page: 0, size: 100, leaf: true });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'mpop',
        path: '/product/api/categories/get-all-categories',
        query: { page: 0, size: 100, leaf: true },
      }),
    );
    expect(page.totalElements).toBe(27555);
    expect(page.first).toBe(true);
    expect(page.data[0]).toMatchObject({
      categoryId: 60002258,
      name: '2. Sınıf',
      paths: ['Kitap', '2. Sınıf'],
    });
  });

  it('list normalizes empty response', async () => {
    const page = await r(mockTransport(null)).list();
    expect(page).toEqual({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
      number: 0,
      totalPages: 0,
      totalElements: 0,
      numberOfElements: 0,
      first: false,
      last: false,
      success: false,
      code: 0,
      message: null,
      data: [],
    });
  });

  it('getAttributes GETs /product/api/categories/{id}/attributes', async () => {
    const transport = mockTransport({
      success: true,
      code: 0,
      message: null,
      data: [
        { id: 100, name: 'Renk', mandatory: true, values: ['Kırmızı', 'Mavi'] },
        { id: 101, name: 'Beden', mandatory: false },
      ],
    });
    const attrs = await r(transport).getAttributes(60123456);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'mpop',
        path: '/product/api/categories/60123456/attributes',
      }),
    );
    expect(attrs[0]).toMatchObject({ id: 100, name: 'Renk', mandatory: true });
    expect(attrs[0]!.raw).toBeDefined();
  });

  it('getAttributes flattens the live nested data buckets with a group tag', async () => {
    // Verified live: `data` is an object with three attribute buckets, not a
    // bare array — the SDK previously returned [] for this real shape.
    const transport = mockTransport({
      success: true,
      code: 0,
      message: null,
      data: {
        baseAttributes: [{ id: 1, name: 'Marka' }],
        attributes: [{ id: 2, name: 'Renk', mandatory: true }],
        variantAttributes: [{ id: 3, name: 'Beden' }],
      },
    });
    const attrs = await r(transport).getAttributes(60123456);
    expect(attrs).toHaveLength(3);
    expect(attrs.find((a) => a.id === 1)).toMatchObject({ name: 'Marka', group: 'base' });
    expect(attrs.find((a) => a.id === 2)).toMatchObject({
      name: 'Renk',
      group: 'category',
      mandatory: true,
    });
    expect(attrs.find((a) => a.id === 3)).toMatchObject({ name: 'Beden', group: 'variant' });
  });

  it('getAttributes throws ValidationError when API returns success:false (non-leaf)', async () => {
    const transport = mockTransport({
      success: false,
      code: 1003,
      message: 'Category is not a leaf category and is not an available category',
      data: null,
    });
    await expect(r(transport).getAttributes(60000000)).rejects.toThrow(ValidationError);
    await expect(r(transport).getAttributes(60000000)).rejects.toThrow(/code=1003/);
    await expect(r(transport).getAttributes(60000000)).rejects.toThrow(/not a leaf/);
  });

  it('getAttributes throws on empty categoryId', async () => {
    await expect(r(mockTransport()).getAttributes('' as unknown as string)).rejects.toThrow(
      /categoryId is required/,
    );
  });

  it('getAttributes URL-encodes the categoryId path segment', async () => {
    const transport = mockTransport({ success: true, code: 0, message: null, data: [] });
    await r(transport).getAttributes('cat/with/slashes');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/product/api/categories/cat%2Fwith%2Fslashes/attributes');
  });
});

// ─── Catalog ─────────────────────────────────────────────────────────────

describe('CatalogResource', () => {
  const r = (t: HepsiburadaTransport) => new CatalogResource(t, fastLimiter());

  it('listProducts GETs /product/api/products/all-products-of-merchant/{id} on mpop service', async () => {
    const transport = mockTransport([
      {
        id: 'cat-1',
        merchantSku: 'M-001',
        status: 'Active',
        listingStatus: 'Created',
        productQuality: 87,
        fields: { Barcode: { value: 'TEST-SIT', mandatory: true } },
      },
    ]);
    const { items: rows } = await r(transport).listProducts({ page: 0, size: 100 });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'mpop',
        path: '/product/api/products/all-products-of-merchant/M-2a',
        query: expect.objectContaining({ page: 0, size: 100 }),
      }),
    );
    expect(rows[0]).toMatchObject({
      id: 'cat-1',
      merchantSku: 'M-001',
      status: 'Active',
      productQuality: 87,
    });
    expect(rows[0]!.fields?.Barcode).toBeDefined();
    expect(rows[0]!.raw).toBeDefined();
  });

  it('listProducts returns an empty page on non-array', async () => {
    const page = await r(mockTransport(null)).listProducts();
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
    expect(page.pageCount).toBe(0);
  });

  it('listProducts URL-encodes the merchantId path segment', async () => {
    const transport = mockTransport([], 'M/with slashes');
    await r(transport).listProducts();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/product/api/products/all-products-of-merchant/M%2Fwith%20slashes');
  });
});
