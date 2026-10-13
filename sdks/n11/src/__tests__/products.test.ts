import { describe, expect, it, vi } from 'vitest';
import { paginate, TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { ProductsResource } from '../resources/products.js';
import type { N11Transport } from '../transport.js';

/**
 * Fixture shaped after the documented `GET /ms/product-query` example
 * (developer.n11.com → Satıcı Ürün Sorgulama). Every value is invented.
 */
function productRow(overrides: Record<string, unknown> = {}) {
  return {
    n11ProductId: 100000001,
    sellerId: 2000001,
    sellerNickname: 'ornek-magaza',
    stockCode: 'SKU-RED-42',
    title: 'Örnek Ürün Kırmızı 42 Numara',
    description: '<p>Örnek açıklama</p>',
    categoryId: 1000002,
    productMainId: 'MODEL-1',
    status: 'Active',
    saleStatus: 'On_Sale',
    preparingDay: 3,
    shipmentTemplate: 'Standart',
    maxPurchaseQuantity: 5,
    customTextOptions: [],
    catalogId: 300000001,
    barcode: null,
    groupId: 40000001,
    currencyType: 'TL',
    salePrice: 1599.9,
    listPrice: 1999,
    quantity: 12,
    attributes: [
      { attributeId: 1, attributeName: 'Marka', attributeValue: 'Örnek Marka' },
      { attributeId: 429, attributeName: 'Renk', attributeValue: 'Kırmızı' },
    ],
    imageUrls: ['https://example.invalid/img/1.jpg'],
    vatRate: 20,
    commissionRate: 12,
    sender: 'SELLER',
    ...overrides,
  };
}

function pageResponse(content: unknown[], extra: Record<string, unknown> = {}) {
  return {
    content,
    pageable: { pageNumber: 0, pageSize: 20, offset: 0, paged: true, unpaged: false },
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    numberOfElements: content.length,
    size: 20,
    first: true,
    last: true,
    empty: content.length === 0,
    ...extra,
  };
}

function mockTransport(...responses: unknown[]) {
  const request = vi.fn();
  for (const r of responses) request.mockResolvedValueOnce(r);
  return { transport: { request } as unknown as N11Transport, request };
}

describe('ProductsResource.list', () => {
  it('calls GET /ms/product-query with page 0 and the documented default size 20', async () => {
    const { transport, request } = mockTransport(pageResponse([]));
    await new ProductsResource(transport).list();

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/ms/product-query',
        query: expect.objectContaining({ page: 0, size: 20 }),
      }),
    );
  });

  it('forwards every documented filter and clamps size to 250', async () => {
    const { transport, request } = mockTransport(pageResponse([]));
    await new ProductsResource(transport).list({
      cursor: '2',
      limit: 1000,
      id: '100000001',
      productMainId: 'MODEL-1',
      stockCode: 'SKU-RED-42',
      saleStatus: 'Out_Of_Stock',
      productStatus: 'CatalogRejected',
      brandName: 'Örnek Marka',
      categoryIds: [1000002, 1000003],
      sender: 'ALL',
    });

    expect(request.mock.calls[0]![0].query).toEqual({
      id: '100000001',
      productMainId: 'MODEL-1',
      stockCode: 'SKU-RED-42',
      saleStatus: 'Out_Of_Stock',
      productStatus: 'CatalogRejected',
      brandName: 'Örnek Marka',
      categoryIds: [1000002, 1000003],
      sender: 'ALL',
      page: 2,
      size: 250,
    });
  });

  it('rejects more than 1000 categoryIds before sending', async () => {
    const { transport, request } = mockTransport(pageResponse([]));
    const resource = new ProductsResource(transport);
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    await expect(resource.list({ categoryIds: ids })).rejects.toBeInstanceOf(ValidationError);
    expect(request).not.toHaveBeenCalled();
    await resource.list({ categoryIds: ids.slice(0, 1000) });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('passes an injected rate limiter through to the transport', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, intervalMs: 1000 });
    const { transport, request } = mockTransport(pageResponse([]));
    await new ProductsResource(transport, limiter).list();
    expect(request.mock.calls[0]![0].rateLimiter).toBe(limiter);
  });

  it('normalises a documented row: string ids, Money in kuruş, TL → TRY', async () => {
    const { transport } = mockTransport(pageResponse([productRow()]));
    const page = await new ProductsResource(transport).list();

    expect(page.nextCursor).toBeUndefined();
    const [product] = page.items;
    expect(product).toMatchObject({
      id: '100000001',
      stockCode: 'SKU-RED-42',
      title: 'Örnek Ürün Kırmızı 42 Numara',
      description: '<p>Örnek açıklama</p>',
      categoryId: '1000002',
      productMainId: 'MODEL-1',
      status: 'Active',
      saleStatus: 'On_Sale',
      preparingDay: 3,
      shipmentTemplate: 'Standart',
      maxPurchaseQuantity: 5,
      catalogId: '300000001',
      groupId: '40000001',
      salePrice: { amount: 159990, currency: 'TRY' },
      listPrice: { amount: 199900, currency: 'TRY' },
      quantity: 12,
      vatRate: 20,
      commissionRate: 12,
      sender: 'SELLER',
      attributes: [
        { attributeId: '1', attributeName: 'Marka', attributeValue: 'Örnek Marka' },
        { attributeId: '429', attributeName: 'Renk', attributeValue: 'Kırmızı' },
      ],
      images: ['https://example.invalid/img/1.jpg'],
    });
    expect(product!.barcode).toBeUndefined();
    expect(product!.raw.sellerNickname).toBe('ornek-magaza');
  });

  it('keeps non-TL currencies and tolerates a sparse row', async () => {
    const { transport } = mockTransport(
      pageResponse([
        productRow({
          currencyType: 'USD',
          salePrice: 10.5,
          listPrice: null,
          barcode: '8690000000001',
        }),
        { n11ProductId: 5, stockCode: 'S', title: 'T', categoryId: 9, attributes: [{}] },
        {},
      ]),
    );
    const { items } = await new ProductsResource(transport).list();

    expect(items[0]!.salePrice).toEqual({ amount: 1050, currency: 'USD' });
    expect(items[0]!.listPrice).toBeUndefined();
    expect(items[0]!.barcode).toBe('8690000000001');
    expect(items[1]).toEqual({
      id: '5',
      stockCode: 'S',
      title: 'T',
      categoryId: '9',
      status: '',
      attributes: [{ attributeId: '' }],
      images: [],
      raw: { n11ProductId: 5, stockCode: 'S', title: 'T', categoryId: 9, attributes: [{}] },
    });
    expect(items[2]!.id).toBe('');
  });

  it('sets nextCursor while page + 1 < totalPages', async () => {
    const { transport } = mockTransport(
      pageResponse([productRow()], { totalPages: 3, number: 1, last: false }),
    );
    const page = await new ProductsResource(transport).list({ cursor: '1' });
    expect(page.nextCursor).toBe('2');
  });

  it('stops on an empty page, on last: true, or on the final page index', async () => {
    const { transport } = mockTransport(
      pageResponse([], { totalPages: 5, last: false }),
      pageResponse([productRow()], { totalPages: 5, last: true }),
      pageResponse([productRow()], { totalPages: 5, last: false }),
    );
    const resource = new ProductsResource(transport);
    expect((await resource.list()).nextCursor).toBeUndefined();
    expect((await resource.list()).nextCursor).toBeUndefined();
    expect((await resource.list({ cursor: '4' })).nextCursor).toBeUndefined();
  });

  it('keeps going without totalPages until an empty page, and handles an empty body', async () => {
    const { transport } = mockTransport(
      { content: [productRow()] },
      { content: [productRow({ n11ProductId: 2 })] },
      undefined,
    );
    const ids: string[] = [];
    for await (const product of paginate((p) => new ProductsResource(transport).list(p))) {
      ids.push(product.id);
    }
    expect(ids).toEqual(['100000001', '2']);
  });

  it('rejects a cursor that is not a page index', async () => {
    const { transport } = mockTransport();
    await expect(new ProductsResource(transport).list({ cursor: 'abc' })).rejects.toThrow(
      TypeError,
    );
    await expect(new ProductsResource(transport).list({ cursor: '-1' })).rejects.toThrow(TypeError);
  });
});
