import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { AccountingResource } from '../resources/accounting.js';
import { CatalogResource } from '../resources/catalog.js';
import { CategoriesResource } from '../resources/categories.js';
import { OrdersResource } from '../resources/orders.js';
import { ProductUpdatesResource } from '../resources/product-updates.js';
import { PromotionsResource } from '../resources/promotions.js';
import { QuestionsResource } from '../resources/questions.js';
import { SuppliersResource } from '../resources/suppliers.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-2b') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Orders extension ─────────────────────────────────────────────────────

describe('OrdersResource — Phase 2b status-bucketed + actions', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it.each([
    ['listCancelled', '/orders/merchantId/M-2b/cancelled'],
    ['listPaymentAwaiting', '/orders/merchantId/M-2b/paymentawaiting'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
    });
    await (r(transport) as unknown as Record<string, (p?: unknown) => Promise<unknown>>)[method]!(
      {},
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', service: 'oms', path }),
    );
  });

  it.each([
    ['listShippedPackages', '/packages/merchantId/M-2b/shipped'],
    ['listDeliveredPackages', '/packages/merchantId/M-2b/delivered'],
    ['listUndeliveredPackages', '/packages/merchantId/M-2b/undelivered'],
    ['listUnpackedPackages', '/packages/merchantId/M-2b/status/unpacked'],
    ['listMissingInvoicePackages', '/packages/merchantId/M-2b/missing-invoice'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport({
      totalCount: 0,
      limit: 0,
      offset: 0,
      pageCount: 0,
      items: [],
    });
    await (r(transport) as unknown as Record<string, (p?: unknown) => Promise<unknown>>)[method]!(
      {},
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', service: 'oms', path }),
    );
  });

  it('getByOrderNumber GETs /orders/merchantId/{id}/ordernumber/{n}', async () => {
    const transport = mockTransport({ orderNumber: 'HBO-1', status: 'Open' });
    const order = await r(transport).getByOrderNumber('HBO-1');
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'oms',
        path: '/orders/merchantId/M-2b/ordernumber/HBO-1',
      }),
    );
    expect(order.orderNumber).toBe('HBO-1');
  });

  it('getPackage / getPackageLabel build correct paths', async () => {
    const t1 = mockTransport({ packageNumber: 'HBP-1', status: 'Open' });
    await r(t1).getPackage('HBP-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantId/M-2b/packagenumber/HBP-1',
    );

    const t2 = mockTransport({ url: 'https://hb.example/label.pdf', format: 'PDF' });
    const label = await r(t2).getPackageLabel('HBP-1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantId/M-2b/packagenumber/HBP-1/labels',
    );
    expect(label.url).toBe('https://hb.example/label.pdf');
    expect(label.format).toBe('PDF');
  });

  it.each([
    ['markPackageInTransit', 'intransit'],
    ['markPackageDelivered', 'deliver'],
    ['markPackageUndelivered', 'undeliver'],
  ] as const)('%s POSTs /packages/.../packagenumber/{n}/%s', async (method, action) => {
    const transport = mockTransport();
    await (r(transport) as unknown as Record<string, (a: string, b?: unknown) => Promise<unknown>>)[
      method
    ]!('HBP-1', { reason: 'demo' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'oms',
        path: `/packages/merchantId/M-2b/packagenumber/HBP-1/${action}`,
        body: { reason: 'demo' },
      }),
    );
  });

  it.each([
    'markPackageInTransit',
    'markPackageDelivered',
    'markPackageUndelivered',
    'getPackage',
    'getPackageLabel',
  ] as const)('%s throws ValidationError on empty packageNumber', async (method) => {
    await expect(
      (r(mockTransport()) as unknown as Record<string, (a: string) => Promise<unknown>>)[method]!(
        '',
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('createPackages POSTs body to /packages/merchantId/{id}', async () => {
    const transport = mockTransport({ packageNumber: 'HBP-2' });
    await r(transport).createPackages({ lineItems: ['L1', 'L2'] });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'oms',
        path: '/packages/merchantId/M-2b',
        body: { lineItems: ['L1', 'L2'] },
      }),
    );
  });

  it.each([
    ['splitPackage', 'POST', '/packages/merchantId/M-2b/packagenumber/HBP-1/split'],
    ['unpackPackage', 'POST', '/packages/merchantId/M-2b/packagenumber/HBP-1/unpack'],
    [
      'updatePackageCargoCompany',
      'PUT',
      '/packages/merchantId/M-2b/packagenumber/HBP-1/changecargocompany',
    ],
    ['sendInvoiceLink', 'PUT', '/packages/merchantId/M-2b/packagenumber/HBP-1/invoice'],
    ['updateParcelInfo', 'PUT', '/packages/merchantId/M-2b/packagenumber/HBP-1/parcel-info'],
    ['updatePackageWarehouse', 'PUT', '/packages/merchantId/M-2b/packagenumber/HBP-1/warehouse'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport();
    await (
      r(transport) as unknown as Record<string, (n: string, body: unknown) => Promise<unknown>>
    )[method]!('HBP-1', { foo: 'bar' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path, body: { foo: 'bar' } }),
    );
  });

  it.each([
    ['cancelLineItem', 'POST', '/lineitems/merchantId/M-2b/id/L1/cancelbymerchant'],
    ['updateLineItemCargoCompany', 'PUT', '/lineitems/merchantId/M-2b/orderlineid/L1/cargocompany'],
    ['updateLineItemLaborCost', 'PUT', '/lineitems/merchantId/M-2b/orderlineid/L1/laborcost'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport();
    await (
      r(transport) as unknown as Record<string, (id: string, body: unknown) => Promise<unknown>>
    )[method]!('L1', { foo: 'bar' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'oms', path, body: { foo: 'bar' } }),
    );
  });

  it('getChangeableCargoCompaniesForLineItem builds correct path', async () => {
    const transport = mockTransport([{ code: 'ARAS', name: 'Aras' }]);
    const out = await r(transport).getChangeableCargoCompaniesForLineItem('L1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/delivery/changeablecargocompanies/merchantId/M-2b/orderlineid/L1',
    );
    expect(out[0]).toMatchObject({ code: 'ARAS', name: 'Aras' });
  });

  it('getChangeableCargoCompaniesForPackage + getPackageableLineItems build correct paths', async () => {
    const t1 = mockTransport([]);
    await r(t1).getChangeableCargoCompaniesForPackage('HBP-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/packages/merchantId/M-2b/packagenumber/HBP-1/changablecargocompanies',
    );
    const t2 = mockTransport([]);
    await r(t2).getPackageableLineItems('L1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/lineitems/merchantId/M-2b/packageablewith/lineitemid/L1',
    );
  });
});

// ─── Catalog extension ───────────────────────────────────────────────────

describe('CatalogResource — Phase 2b mutations + tracking', () => {
  const r = (t: HepsiburadaTransport) => new CatalogResource(t, fastLimiter());

  it('listProductsByStatus query passes through (status → productStatus)', async () => {
    const transport = mockTransport([]);
    await r(transport).listProductsByStatus({ status: 'MATCHED', page: 0, size: 50 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/product/api/products/products-by-merchant-and-status');
    expect(call.query).toMatchObject({
      merchantId: 'M-2b',
      productStatus: 'MATCHED',
      page: 0,
      size: 50,
    });
  });

  it('listProducts resolves typed content (title/category/brand/images) from the fields map', async () => {
    const transport = mockTransport([
      {
        id: 'CP-1',
        merchantSku: 'SKU-1',
        fields: {
          // Hepsiburada keys the title as `productName`, not `title`.
          productName: { value: 'Kırmızı Tişört' },
          categoryId: { value: 18021982 }, // numeric → stringified
          categoryName: { value: 'Tişört' },
          brand: { value: 'LoncaBrand' },
          description: { value: 'Pamuklu' },
          images: { value: ['https://img/1.jpg', { url: 'https://img/2.jpg' }] },
        },
      },
    ]);
    const [p] = (await r(transport).listProducts({ page: 0, size: 1 })).items;
    expect(p!.title).toBe('Kırmızı Tişört');
    expect(p!.categoryId).toBe('18021982');
    expect(p!.categoryName).toBe('Tişört');
    expect(p!.brand).toBe('LoncaBrand');
    expect(p!.description).toBe('Pamuklu');
    expect(p!.images).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
    // `fields` + `raw` stay untouched.
    expect(p!.fields).toBeDefined();
    expect(p!.raw).toMatchObject({ merchantSku: 'SKU-1' });
  });

  it('listProducts leaves content undefined when no known key matches (never guesses)', async () => {
    const transport = mockTransport([{ id: 'CP-2', fields: { randomAttr: { value: 'x' } } }]);
    const [p] = (await r(transport).listProducts({ page: 0, size: 1 })).items;
    expect(p!.title).toBeUndefined();
    expect(p!.categoryId).toBeUndefined();
    expect(p!.brand).toBeUndefined();
    expect(p!.images).toBeUndefined();
  });

  it('listProducts unwraps the Spring-page envelope ({ data: [...] }) + resolves top-level content', async () => {
    // Real `all-products-of-merchant` shape (verified live 2026-06): rows carry
    // content as TOP-LEVEL fields (no `fields` revision-map), wrapped in an
    // envelope. Before the fix the SDK saw a non-array and returned [].
    const transport = mockTransport({
      success: true,
      totalElements: 928378,
      totalPages: 185676,
      number: 0,
      data: [
        {
          merchantSku: 'MSKU-9',
          barcode: 'BAR-9',
          hbSku: 'HBSKU-9',
          productName: 'My Collection 6520 Çanta',
          brand: 'My Collection',
          images: ['https://img/a.jpg', 'https://img/b.jpg'],
          categoryId: 301143, // numeric on the wire
          categoryName: 'Bebek Bakım Çantası',
          description: 'Deri çanta',
          status: 'Active',
        },
      ],
    });
    const page = await r(transport).listProducts({ page: 0, size: 5 });
    expect(page.items).toHaveLength(1); // envelope unwrapped (was silently [] pre-fix)
    expect(page.totalCount).toBe(928378);
    expect(page.pageCount).toBe(185676);
    const p = page.items[0]!;
    expect(p.title).toBe('My Collection 6520 Çanta'); // from top-level productName
    expect(p.brand).toBe('My Collection');
    expect(p.images).toEqual(['https://img/a.jpg', 'https://img/b.jpg']);
    expect(p.categoryId).toBe('301143'); // numeric → stringified
    expect(p.categoryName).toBe('Bebek Bakım Çantası');
    expect(p.description).toBe('Deri çanta');
    expect(p.merchantSku).toBe('MSKU-9');
    expect(p.status).toBe('Active');
  });

  it('listProducts resolves content from the raw top level + CSV images when fields is absent', async () => {
    const transport = mockTransport([
      { id: 'CP-3', name: 'Mavi Pantolon', images: 'https://a.jpg, https://b.jpg' },
    ]);
    const [p] = (await r(transport).listProducts({ page: 0, size: 1 })).items;
    expect(p!.title).toBe('Mavi Pantolon'); // falls back to `name`, then raw
    expect(p!.images).toEqual(['https://a.jpg', 'https://b.jpg']);
  });

  it('getProductStatus / getDeleteProcess require tracking id', async () => {
    await expect(r(mockTransport()).getProductStatus('')).rejects.toThrow(/trackingId/);
    await expect(r(mockTransport()).getDeleteProcess('')).rejects.toThrow(/trackingId/);
  });

  it('uploadProductViaFile rejects empty array', async () => {
    await expect(r(mockTransport()).uploadProductViaFile([])).rejects.toThrow(/non-empty/);
  });

  it('uploadProductViaFile POSTs the products as a JSON file in the multipart `file` field', async () => {
    // The SIT answer: the mpop envelope with the tracking id under `data`.
    const transport = mockTransport({
      success: true,
      code: 0,
      version: 1,
      message: null,
      data: { trackingId: 'TRK-1' },
    });
    const receipt = await r(transport).uploadProductViaFile([
      { categoryId: 18021982, attributes: { merchantSku: 'SKU-1', UrunAdi: 'Ürün' } },
      { categoryId: 18021982, merchant: 'OTHER', attributes: { merchantSku: 'SKU-2' } },
    ]);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/product/api/products/import');
    expect(call.body).toBeInstanceOf(FormData);
    const file = (call.body as FormData).get('file') as File;
    expect(file.name).toBe('integrator.json');
    // `merchant` defaults to the client's merchant id; one the caller sets is kept.
    expect(JSON.parse(await file.text())).toEqual([
      {
        categoryId: 18021982,
        merchant: 'M-2b',
        attributes: { merchantSku: 'SKU-1', UrunAdi: 'Ürün' },
      },
      { categoryId: 18021982, merchant: 'OTHER', attributes: { merchantSku: 'SKU-2' } },
    ]);
    expect(receipt.trackingId).toBe('TRK-1');
  });

  it.each([
    ['no categoryId', [{ attributes: { merchantSku: 'SKU-1' } }], /needs a categoryId/],
    ['no merchantSku', [{ categoryId: 1, attributes: {} }], /needs attributes.merchantSku/],
    ['no attributes', [{ categoryId: 1 }], /needs attributes.merchantSku/],
    ['a null row', [null], /needs a categoryId/],
  ])('uploadProductViaFile rejects a row with %s before sending', async (_label, rows, message) => {
    const transport = mockTransport();
    await expect(r(transport).uploadProductViaFile(rows as unknown[])).rejects.toThrow(message);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('getProductStatus maps the envelope result and the per-product rows (SIT shape)', async () => {
    const row = {
      merchantSku: 'SKU-1',
      importStatus: 'FAILED',
      importMessages: [{ severity: 'ERROR', message: 'Category is not a leaf category' }],
    };
    const status = await r(
      mockTransport({ success: true, code: 0, message: null, data: [row] }),
    ).getProductStatus('TRK-1');
    expect(status).toMatchObject({ success: true, code: 0, rows: [row] });
  });

  it.each([
    ['uploadFastListing', '/product/api/products/fastlisting'],
    ['approvePreMatch', '/product/api/products/approve-prematch'],
    ['rejectPreMatch', '/product/api/products/reject-prematch'],
    ['checkProductStatus', '/product/api/products/check-product-status'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!(
      {
        foo: 'bar',
      },
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', service: 'mpop', path, body: { foo: 'bar' } }),
    );
  });

  it.each(['approvePreMatch', 'rejectPreMatch', 'checkProductStatus'] as const)(
    '%s returns the API response wrapped in a { raw } envelope',
    async (method) => {
      const transport = mockTransport({ ok: true, trackingId: 'TRK-9' });
      const out = await (
        r(transport) as unknown as Record<string, (body: unknown) => Promise<{ raw: unknown }>>
      )[method]!({ foo: 'bar' });
      expect(out).toEqual({ raw: { ok: true, trackingId: 'TRK-9' } });
    },
  );

  it('deleteByMerchantSkuList requires non-empty list', async () => {
    await expect(r(mockTransport()).deleteByMerchantSkuList({} as never)).rejects.toThrow(
      /non-empty/,
    );
    await expect(
      r(mockTransport()).deleteByMerchantSkuList({ merchantSkuList: [] }),
    ).rejects.toThrow(/non-empty/);
  });

  it('deleteByMerchantSkuList POSTs to /delete-process + returns trackingId', async () => {
    const transport = mockTransport({ trackingId: 'TRK-D1' });
    const receipt = await r(transport).deleteByMerchantSkuList({ merchantSkuList: ['M-001'] });
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/product/api/products/delete-process',
    );
    expect(receipt.trackingId).toBe('TRK-D1');
  });
});

// ─── Categories extension ────────────────────────────────────────────────

describe('CategoriesResource — Phase 2b getAttributeValues', () => {
  const r = (t: HepsiburadaTransport) => new CategoriesResource(t, fastLimiter());

  it('GETs /product/api/categories/{cat}/attribute/{attr}/values on mpop', async () => {
    const transport = mockTransport({
      success: true,
      code: 0,
      message: null,
      data: [{ id: 1, name: 'Kırmızı' }],
    });
    const out = await r(transport).getAttributeValues(60123456, 100);
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/product/api/categories/60123456/attribute/100/values',
    );
    expect(out[0]).toMatchObject({ id: 1, name: 'Kırmızı' });
    expect(out[0]!.raw).toBeDefined();
  });

  it('throws on missing categoryId or attributeId', async () => {
    await expect(r(mockTransport()).getAttributeValues('', 100)).rejects.toThrow(/categoryId/);
    await expect(r(mockTransport()).getAttributeValues(1, '')).rejects.toThrow(/attributeId/);
  });

  it('surfaces API success:false as ValidationError', async () => {
    const transport = mockTransport({
      success: false,
      code: 1003,
      message: 'Category is not a leaf',
      data: null,
    });
    await expect(r(transport).getAttributeValues(1, 1)).rejects.toThrow(/code=1003/);
  });
});

// ─── Product Updates ─────────────────────────────────────────────────────

describe('ProductUpdatesResource', () => {
  const r = (t: HepsiburadaTransport) => new ProductUpdatesResource(t, fastLimiter());

  it('importUpdates POSTs a multipart file to /ticket-api/api/integrator/import on mpop', async () => {
    const transport = mockTransport({ trackingId: 'TRK-U1' });
    const receipt = await r(transport).importUpdates([{ hbSku: 'HB-1', productName: 'Yeni' }]);
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.service).toBe('mpop');
    expect(call.path).toBe('/ticket-api/api/integrator/import');
    expect(call.body).toBeInstanceOf(FormData);
    expect(receipt.trackingId).toBe('TRK-U1');
  });

  it('importUpdates rejects empty array', async () => {
    await expect(r(mockTransport()).importUpdates([])).rejects.toThrow(/non-empty/);
  });

  it('getUpdateStatus / getUpdateHistory build correct /ticket-api paths', async () => {
    const t1 = mockTransport({ trackingId: 'TRK-1', status: 'Done' });
    await r(t1).getUpdateStatus('TRK-1');
    expect((t1.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/ticket-api/api/integrator/status/TRK-1',
    );

    const t2 = mockTransport([{ trackingId: 'TRK-1', status: 'Done' }]);
    await r(t2).getUpdateHistory('HBC-1');
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/ticket-api/api/integrator/merchant/M-2b/hbSku/HBC-1',
    );
  });
});

// ─── Suppliers ───────────────────────────────────────────────────────────

describe('SuppliersResource', () => {
  const r = (t: HepsiburadaTransport) => new SuppliersResource(t, fastLimiter());

  it.each([
    ['searchOpenPurchaseOrders', 'POST', '/suppliers/M-2b/openPurchaseOrders/search'],
    ['searchSupplierListings', 'POST', '/suppliers/M-2b/supplierlistings/search'],
    ['searchListingUpdateRequests', 'POST', '/suppliers/M-2b/listingUpdateRequests/search'],
    ['createListingUpdateRequest', 'POST', '/suppliers/M-2b/listingUpdateRequests'],
  ] as const)('%s sends %s to %s', async (method, verb, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!(
      {
        pageNumber: 0,
      },
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: verb,
        service: 'supplier-api',
        path,
        body: { pageNumber: 0 },
      }),
    );
  });

  it('getListingUpdateRequest GETs /suppliers/{id}/listingUpdateRequests/{rid}', async () => {
    const transport = mockTransport({ requestId: 'REQ-1' });
    await r(transport).getListingUpdateRequest('REQ-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/suppliers/M-2b/listingUpdateRequests/REQ-1',
    );
  });

  it('throws on empty requestId / falsy input', async () => {
    await expect(r(mockTransport()).getListingUpdateRequest('')).rejects.toThrow(/requestId/);
    await expect(
      r(mockTransport()).createListingUpdateRequest(
        undefined as unknown as Record<string, unknown>,
      ),
    ).rejects.toThrow(/input is required/);
  });
});

// ─── Accounting ──────────────────────────────────────────────────────────

describe('AccountingResource', () => {
  const r = (t: HepsiburadaTransport) => new AccountingResource(t, fastLimiter());

  it('listTransactions GETs /transactions/merchantid/{id} on mpfinance with PascalCase params', async () => {
    const transport = mockTransport([{ transactionId: 'T-1', amount: 99.9, currency: 'TRY' }]);
    const rows = await r(transport).listTransactions({
      beginDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.service).toBe('mpfinance');
    expect(call.path).toBe('/transactions/merchantid/M-2b');
    // Legacy beginDate/endDate map onto the spec's OrderDateStart/OrderDateEnd;
    // Offset/Limit are required by the API and defaulted by the SDK.
    expect(call.query).toMatchObject({
      OrderDateStart: '2026-01-01',
      OrderDateEnd: '2026-02-01',
      Offset: 0,
      Limit: 100,
    });
    expect(rows[0]).toMatchObject({ transactionId: 'T-1', amount: 99.9, currency: 'TRY' });
  });

  it('listTransactions passes spec-named filters through in PascalCase', async () => {
    const transport = mockTransport([]);
    await r(transport).listTransactions({
      offset: 5,
      limit: 10,
      orderNumber: 'HBO-9',
      sku: 'SKU-9',
      recordDateStart: '2026-08-01',
      recordDateEnd: '2026-08-28',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      Offset: 5,
      Limit: 10,
      OrderNumber: 'HBO-9',
      Sku: 'SKU-9',
      RecordDateStart: '2026-08-01',
      RecordDateEnd: '2026-08-28',
    });
    // No lowercase duplicates leak onto the wire.
    expect(call.query).not.toHaveProperty('offset');
    expect(call.query).not.toHaveProperty('beginDate');
  });

  it('listTransactions unwraps various envelopes', async () => {
    const fromItems = await r(
      mockTransport({ items: [{ transactionId: 'T-X' }] }),
    ).listTransactions();
    expect(fromItems[0]!.transactionId).toBe('T-X');
    const fromData = await r(
      mockTransport({ data: [{ transactionId: 'T-Y' }] }),
    ).listTransactions();
    expect(fromData[0]!.transactionId).toBe('T-Y');
  });
});

// ─── Questions ───────────────────────────────────────────────────────────

describe('QuestionsResource', () => {
  const r = (t: HepsiburadaTransport) => new QuestionsResource(t, fastLimiter());

  it.each([
    ['list', 'GET', '/api/v1.0/issues'],
    ['getCountByStatus', 'GET', '/api/v1.0/issues/count'],
  ] as const)(
    '%s sends %s to %s on asktoseller with the merchantId header',
    async (method, verb, path) => {
      const transport = mockTransport({ items: [] });
      await (r(transport) as unknown as Record<string, () => Promise<unknown>>)[method]!();
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: verb,
          service: 'asktoseller',
          path,
          headers: { merchantId: 'M-2b' },
        }),
      );
    },
  );

  it('list maps offset/limit → page/size and beginDate/endDate → minCreatedAt/maxCreatedAt', async () => {
    const transport = mockTransport({ items: [] });
    await r(transport).list({
      offset: 2,
      limit: 25,
      beginDate: '2026-08-01',
      endDate: '2026-08-28',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      page: 2,
      size: 25,
      minCreatedAt: '2026-08-01',
      maxCreatedAt: '2026-08-28',
    });
    expect(call.query).not.toHaveProperty('offset');
    expect(call.query).not.toHaveProperty('beginDate');
  });

  it('list prefers explicit page/size over the deprecated aliases', async () => {
    const transport = mockTransport({ items: [] });
    await r(transport).list({ page: 3, size: 5, offset: 9, limit: 99 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({ page: 3, size: 5 });
  });

  it('get GETs /api/v1.0/issues/{n}', async () => {
    const transport = mockTransport({ number: 'Q-1', text: 'Bu nedir?' });
    const q = await r(transport).get('Q-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/api/v1.0/issues/Q-1',
    );
    expect(q.text).toBe('Bu nedir?');
  });

  it.each([
    ['answer', '/api/v1.0/issues/Q-1/answer', { Answer: 'Evet' }],
    ['reject', '/api/v1.0/issues/Q-1/reject', { rejectReason: 'spam' }],
  ] as const)('%s POSTs to %s', async (method, path, body) => {
    const transport = mockTransport({});
    await (
      r(transport) as unknown as Record<string, (id: string, body: unknown) => Promise<unknown>>
    )[method]!('Q-1', body);
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(path);
  });

  it('answer sends multipart `Answer` and `Files` parts with the merchantId header', async () => {
    const transport = mockTransport('6acf35064d6bcea1c68fdd7e');
    const photo = new File(['png'], 'etiket.png', { type: 'image/png' });
    const result = await r(transport).answer('Q-1', { Answer: 'Stokta var.', Files: [photo] });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.headers).toEqual({ merchantId: 'M-2b' });
    expect(call.body).toBeInstanceOf(FormData);
    const form = call.body as FormData;
    expect(form.get('Answer')).toBe('Stokta var.');
    expect((form.getAll('Files')[0] as File).name).toBe('etiket.png');
    expect(result.raw).toBe('6acf35064d6bcea1c68fdd7e');
  });

  it('answer takes the lower-case `answer` key as `Answer` and sends extra keys as text parts', async () => {
    const transport = mockTransport('ok');
    await r(transport).answer('Q-1', { answer: 'Evet', note: 7 });
    const form = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].body as FormData;
    expect(form.get('Answer')).toBe('Evet');
    expect(form.has('answer')).toBe(false);
    expect(form.get('note')).toBe('7');
  });

  it.each([
    ['no answer', {}, /1-2000 characters/],
    ['a blank answer', { Answer: '  ' }, /1-2000 characters/],
    ['a 2001-character answer', { Answer: 'x'.repeat(2001) }, /1-2000 characters/],
    ['a non-Blob file', { Answer: 'Evet', Files: ['etiket.png'] }, /Blob or File/],
  ])('answer rejects %s before sending', async (_label, input, message) => {
    const transport = mockTransport();
    await expect(r(transport).answer('Q-1', input)).rejects.toThrow(message);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('getCountByStatus surfaces the flat per-status body as byStatus', async () => {
    // Real Ask-the-Seller shape, verified on SIT 2026-08-30.
    const transport = mockTransport({
      waitingForAnswer: 1,
      answered: 2,
      reported: 0,
      autoClosedInLastWeek: 0,
    });
    const out = await r(transport).getCountByStatus();
    expect(out.byStatus).toEqual({
      waitingForAnswer: 1,
      answered: 2,
      reported: 0,
      autoClosedInLastWeek: 0,
    });
  });

  it('throws on missing question number / falsy input', async () => {
    await expect(r(mockTransport()).get('')).rejects.toThrow(/number/);
    await expect(r(mockTransport()).answer('', { Answer: 'x' })).rejects.toThrow(/number/);
    await expect(
      r(mockTransport()).answer('Q-1', null as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input/);
  });
});

// ─── Promotions ──────────────────────────────────────────────────────────

describe('PromotionsResource', () => {
  const r = (t: HepsiburadaTransport) => new PromotionsResource(t, fastLimiter());

  it.each([
    ['listCategories', 'GET', '/categories/M-2b'],
    ['getBudgets', 'GET', '/self-campaign/M-2b/budgets'],
    ['getLimits', 'GET', '/self-campaign/M-2b/limits'],
    ['listDiscounts', 'GET', '/self-campaign/M-2b/discounts'],
  ] as const)('%s sends %s to %s on diskonto', async (method, verb, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, () => Promise<unknown>>)[method]!();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: verb, service: 'diskonto', path }),
    );
  });

  it('listCategories unwraps the PascalCase { Data } envelope and maps categoryName', async () => {
    // Real diskonto shape, verified on SIT 2026-08-30.
    const transport = mockTransport({
      Data: [{ categoryId: 28001496, categoryLevel: 4, categoryName: 'Bisküvi', isLeaf: true }],
      Success: true,
    });
    const rows = await r(transport).listCategories();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoryId: 28001496, name: 'Bisküvi' });
    expect(rows[0]!.raw).toMatchObject({ categoryLevel: 4 });
  });

  it('listDiscounts sends the required page/pagesize params (defaulted)', async () => {
    const transport = mockTransport({});
    await r(transport).listDiscounts();
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].query).toEqual({
      page: 1,
      pagesize: 100,
    });

    const t2 = mockTransport({});
    await r(t2).listDiscounts({ page: 3, pageSize: 10 });
    expect((t2.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].query).toEqual({
      page: 3,
      pagesize: 10,
    });
  });

  it('getDiscount GETs /self-campaign/{id}/discount/{cid}', async () => {
    const transport = mockTransport({ campaignId: 'C-1', type: 'PERCENT' });
    const d = await r(transport).getDiscount('C-1');
    expect((transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].path).toBe(
      '/self-campaign/M-2b/discount/C-1',
    );
    expect(d.campaignId).toBe('C-1');
  });

  it.each([
    ['createTlDiscount', '/self-campaign/M-2b/tl-discount'],
    ['createPercentDiscount', '/self-campaign/M-2b/percent-discount'],
    ['createXyDiscount', '/self-campaign/M-2b/xy-discount'],
    ['cancelDiscount', '/self-campaign/M-2b/cancel-discount'],
  ] as const)('%s POSTs to %s', async (method, path) => {
    const transport = mockTransport({});
    await (r(transport) as unknown as Record<string, (body: unknown) => Promise<unknown>>)[method]!(
      {
        foo: 'bar',
      },
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', service: 'diskonto', path, body: { foo: 'bar' } }),
    );
  });

  it('throws on missing campaignId / falsy input', async () => {
    await expect(r(mockTransport()).getDiscount('')).rejects.toThrow(/campaignId/);
    await expect(
      r(mockTransport()).createTlDiscount(undefined as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input/);
  });
});
