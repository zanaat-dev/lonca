import { describe, expect, it, vi } from 'vitest';
import { paginate, TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '../resources/orders.js';
import type { N11Transport } from '../transport.js';

/**
 * Fixture shaped after a `GET /rest/delivery/v1/shipmentPackages` row as prod
 * answered it on 2026-10-10. Every value is invented.
 */
function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    billingAddress: {
      address: 'Örnek Mah. 1. Sok. No:1',
      city: 'İstanbul',
      district: 'Kadıköy',
      neighborhood: 'Örnek',
      fullName: 'Ada Yılmaz',
      gsm: '5550000000',
      tcId: '',
      postalCode: '34000',
      taxId: null,
      taxHouse: null,
      invoiceType: 1,
      countryCode: null,
    },
    shippingAddress: {
      address: 'Örnek Mah. 1. Sok. No:1',
      city: 'İstanbul',
      district: 'Kadıköy',
      neighborhood: 'Örnek',
      fullName: 'Ada Yılmaz',
      gsm: '5550000000',
      tcId: '',
      postalCode: '34000',
    },
    orderNumber: '200000000001',
    id: '300000001',
    customerEmail: 'ada@example.invalid',
    customerfullName: 'Ada Yılmaz',
    customerId: 4000001,
    taxId: null,
    taxOffice: null,
    tcIdentityNumber: '',
    cargoSenderNumber: 'SND-1',
    cargoTrackingNumber: 'TRK-1',
    cargoTrackingLink: 'https://example.invalid/track/TRK-1',
    shipmentCompanyId: 344,
    cargoProviderName: 'Örnek Kargo',
    shipmentMethod: 1,
    installmentChargeWithVATprice: 0,
    lines: [
      {
        quantity: 2,
        productId: 100000001,
        productName: 'Örnek Ürün',
        stockCode: 'SKU-RED-42',
        variantAttributes: [{ name: 'Renk', value: 'Kırmızı' }],
        customTextOptionValues: [],
        price: 150.5,
        dueAmount: 291,
        sellerCouponDiscount: 0,
        sellerDiscount: 10,
        mallDiscount: 0,
        sellerInvoiceAmount: 291,
        orderLineId: 500000001,
        orderItemLineItemStatusName: 'Delivered',
        vatRate: 20,
        commissionRate: 12,
        barcode: null,
        sender: 'SELLER',
      },
    ],
    lastModifiedDate: 1760000000000,
    agreedDeliveryDate: 1760100000000,
    totalAmount: 301,
    totalDiscountAmount: 10,
    packageHistories: [{ createdDate: 1759900000000, status: 'Created' }, { status: 'Picking' }],
    shipmentPackageStatus: 'Delivered',
    sellerId: 2000001,
    micro: null,
    deliveryAddressType: null,
    isReturned: false,
    ...overrides,
  };
}

function pageResponse(content: unknown[], extra: Record<string, unknown> = {}) {
  return { pageCount: content.length, totalPages: 1, page: 0, size: 50, content, ...extra };
}

function mockTransport(...responses: unknown[]) {
  const request = vi.fn();
  for (const r of responses) request.mockResolvedValueOnce(r);
  return { transport: { request } as unknown as N11Transport, request };
}

describe('OrdersResource.list', () => {
  it('calls GET /rest/delivery/v1/shipmentPackages with page 0 and size 50 by default', async () => {
    const { transport, request } = mockTransport(pageResponse([]));
    await new OrdersResource(transport).list();
    const call = request.mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/rest/delivery/v1/shipmentPackages');
    expect(call.query).toMatchObject({ page: 0, size: 50 });
    expect(call.rateLimiter).toBeInstanceOf(TokenBucketRateLimiter);
  });

  it('passes filters, converts dates to epoch ms and clamps size to 100', async () => {
    const { transport, request } = mockTransport(pageResponse([]), pageResponse([]));
    const resource = new OrdersResource(transport);
    await resource.list({
      status: 'Shipped',
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: 1760000000000,
      orderNumber: '200000000001',
      orderByField: true,
      orderByDirection: 'DESC',
      limit: 500,
      cursor: '2',
    });
    expect(request.mock.calls[0]![0].query).toEqual({
      status: 'Shipped',
      startDate: Date.parse('2026-10-01T00:00:00Z'),
      endDate: 1760000000000,
      orderNumber: '200000000001',
      orderByField: true,
      orderByDirection: 'DESC',
      page: 2,
      size: 100,
    });
    await resource.list({ limit: 0 });
    expect(request.mock.calls[1]![0].query.size).toBe(1);
  });

  it('uses an injected rate limiter', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, intervalMs: 1000 });
    const { transport, request } = mockTransport(pageResponse([]));
    await new OrdersResource(transport, limiter).list();
    expect(request.mock.calls[0]![0].rateLimiter).toBe(limiter);
  });

  it('normalises a package: string ids, TRY money, ISO dates, addresses without nulls', async () => {
    const { transport } = mockTransport(pageResponse([packageRow()]));
    const { items, nextCursor } = await new OrdersResource(transport).list();
    expect(nextCursor).toBeUndefined();
    const pkg = items[0]!;
    expect(pkg).toMatchObject({
      id: '300000001',
      orderNumber: '200000000001',
      status: 'Delivered',
      customerId: '4000001',
      customerFullName: 'Ada Yılmaz',
      customerEmail: 'ada@example.invalid',
      shipmentCompanyId: '344',
      cargoProviderName: 'Örnek Kargo',
      cargoTrackingNumber: 'TRK-1',
      shipmentMethod: 1,
      isReturned: false,
      lastModifiedAt: new Date(1760000000000).toISOString(),
      agreedDeliveryAt: new Date(1760100000000).toISOString(),
      totalAmount: { amount: 30100, currency: 'TRY' },
      totalDiscountAmount: { amount: 1000, currency: 'TRY' },
    });
    // null / empty-string fields are dropped, not copied
    expect(pkg.tcIdentityNumber).toBeUndefined();
    expect(pkg.taxId).toBeUndefined();
    expect(pkg.deliveryAddressType).toBeUndefined();
    expect(pkg.billingAddress).toEqual({
      address: 'Örnek Mah. 1. Sok. No:1',
      city: 'İstanbul',
      district: 'Kadıköy',
      neighborhood: 'Örnek',
      fullName: 'Ada Yılmaz',
      gsm: '5550000000',
      postalCode: '34000',
      invoiceType: 1,
    });
    expect(pkg.histories).toEqual([
      { status: 'Created', createdAt: new Date(1759900000000).toISOString() },
      { status: 'Picking' },
    ]);
    const line = pkg.lines[0]!;
    expect(line).toMatchObject({
      lineId: '500000001',
      productId: '100000001',
      productName: 'Örnek Ürün',
      stockCode: 'SKU-RED-42',
      quantity: 2,
      price: { amount: 15050, currency: 'TRY' },
      dueAmount: { amount: 29100, currency: 'TRY' },
      sellerInvoiceAmount: { amount: 29100, currency: 'TRY' },
      sellerDiscount: { amount: 1000, currency: 'TRY' },
      sellerCouponDiscount: { amount: 0, currency: 'TRY' },
      mallDiscount: { amount: 0, currency: 'TRY' },
      status: 'Delivered',
      vatRate: 20,
      commissionRate: 12,
      variantAttributes: [{ name: 'Renk', value: 'Kırmızı' }],
    });
    expect(line.barcode).toBeUndefined();
    expect(line.raw).toHaveProperty('customTextOptionValues');
    expect(pkg.raw).toHaveProperty('micro', null);
  });

  it('tolerates a sparse package', async () => {
    const { transport } = mockTransport(
      pageResponse([
        {
          billingAddress: null,
          lines: [{ variantAttributes: [{}] }],
          packageHistories: [{}],
        },
      ]),
    );
    const [pkg] = (await new OrdersResource(transport).list()).items;
    expect(pkg).toMatchObject({ id: '', orderNumber: '', status: '' });
    expect(pkg!.billingAddress).toBeUndefined();
    expect(pkg!.lines[0]).toMatchObject({
      lineId: '',
      quantity: 0,
      variantAttributes: [{ name: '', value: '' }],
    });
    expect(pkg!.histories).toEqual([{ status: '' }]);
  });

  it('pages with totalPages and stops on an empty page or a missing body', async () => {
    const { transport } = mockTransport(
      pageResponse([packageRow()], { totalPages: 2 }),
      pageResponse([packageRow({ id: '300000002' })], { totalPages: 2, page: 1 }),
    );
    const ids: string[] = [];
    for await (const pkg of paginate((p) => new OrdersResource(transport).list(p)))
      ids.push(pkg.id);
    expect(ids).toEqual(['300000001', '300000002']);

    const empty = mockTransport(pageResponse([], { totalPages: 3 }), undefined);
    const resource = new OrdersResource(empty.transport);
    expect((await resource.list()).nextCursor).toBeUndefined();
    expect(await resource.list()).toEqual({ items: [] });
  });

  it('keeps paging when totalPages is absent and rows came back', async () => {
    const { transport } = mockTransport({ content: [packageRow()] });
    expect((await new OrdersResource(transport).list()).nextCursor).toBe('1');
  });

  it.each(['-1', '1.5', 'abc'])('rejects the invalid cursor %s', async (cursor) => {
    const { transport } = mockTransport();
    await expect(new OrdersResource(transport).list({ cursor })).rejects.toThrow(TypeError);
  });
});
