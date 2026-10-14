/**
 * Faz 1.4 — the last `Promise<unknown>` return types are gone. Every method
 * below either maps a spec-documented response onto a typed shape (fixtures
 * derived from `specs/hepsiburada/*.json` examples / schemas) or resolves to
 * the shared `MutationResult` `{ raw }` envelope when the spec documents no
 * body worth modelling (bare string, `204`, `{ success }` only, or no spec).
 *
 * Faz 1.3b — `categories.list` is `OffsetPage`-aligned and `CatalogProduct.id`
 * is optional instead of an `''` sentinel.
 */
import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { CatalogResource } from '../resources/catalog.js';
import { CategoriesResource } from '../resources/categories.js';
import { OrdersResource } from '../resources/orders.js';
import { PromotionsResource } from '../resources/promotions.js';
import { QuestionsResource } from '../resources/questions.js';
import { ShippingResource } from '../resources/shipping.js';
import { SuppliersResource } from '../resources/suppliers.js';
import { TestOrdersResource } from '../resources/test-orders.js';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CreateListingUpdateRequestInput,
  CreateTlDiscountInput,
  InvoiceLinkInput,
  LaborCostInput,
  ParcelInfoInput,
  WarehouseInput,
} from '../index.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-typed') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const lastCall = (t: HepsiburadaTransport) =>
  (t.request as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;

type RawFn = (...args: unknown[]) => Promise<{ raw: unknown }>;
const method = (resource: object, name: string): RawFn =>
  (resource as unknown as Record<string, RawFn>)[name]!.bind(resource);

// ─── Orders ───────────────────────────────────────────────────────────────

describe('orders — typed return surface', () => {
  const r = (t: HepsiburadaTransport) => new OrdersResource(t, fastLimiter());

  it('createPackages maps the CreateDeliveryResponse (201) onto PackageReceipt', async () => {
    const body = { barcode: 'BC-123', packageNumber: 'HBP-9' };
    const out = await r(mockTransport(body)).createPackages({ lineItems: ['L1'] });
    expect(out).toEqual({ packageNumber: 'HBP-9', barcode: 'BC-123', raw: body });
  });

  it('createPackages keeps only raw when the body is not the documented shape', async () => {
    const input = { lineItems: ['L1'] };
    expect(await r(mockTransport('OK')).createPackages(input)).toEqual({ raw: 'OK' });
    expect(await r(mockTransport({ packageNumber: 42 })).createPackages(input)).toEqual({
      raw: { packageNumber: 42 },
    });
    expect(await r(mockTransport()).createPackages(input)).toEqual({ raw: undefined });
  });

  it.each([
    ['splitPackage', { lineItems: ['L1'] }],
    ['unpackPackage', {}],
    ['markPackageInTransit', { trackingNumber: 'TR-1' }],
    ['markPackageDelivered', {}],
    ['markPackageUndelivered', { reason: 'x' }],
    ['updatePackageCargoCompany', { cargoCompany: 'MNG' }],
    ['sendInvoiceLink', { invoiceLink: 'https://x' } satisfies InvoiceLinkInput],
    ['updateParcelInfo', { totalDesi: 1 } satisfies ParcelInfoInput],
    ['updatePackageWarehouse', { shippingAddressLabel: 'W' } satisfies WarehouseInput],
  ] as const)('%s resolves to a MutationResult (200 string / 204 empty)', async (name, body) => {
    expect(await method(r(mockTransport('OK')), name)('HBP-1', body)).toEqual({ raw: 'OK' });
    expect(await method(r(mockTransport()), name)('HBP-1', body)).toEqual({ raw: undefined });
  });

  it.each([
    ['cancelLineItem', { reason: 'out-of-stock' }],
    ['updateLineItemCargoCompany', { cargoCompany: 'MNG' }],
    ['updateLineItemLaborCost', { unitLaborCost: 1 } satisfies LaborCostInput],
  ] as const)('%s resolves to a MutationResult (200 string / 204 empty)', async (name, body) => {
    expect(await method(r(mockTransport('OK')), name)('L1', body)).toEqual({ raw: 'OK' });
    expect(await method(r(mockTransport()), name)('L1', body)).toEqual({ raw: undefined });
  });
});

// ─── Promotions ───────────────────────────────────────────────────────────

describe('promotions — typed return surface', () => {
  const r = (t: HepsiburadaTransport) => new PromotionsResource(t, fastLimiter());

  it.each(['createTlDiscount', 'createPercentDiscount', 'createXyDiscount'] as const)(
    '%s maps CreateSelfCampaignResponse onto DiscountReceipt',
    async (name) => {
      const body = { success: true, data: { campaignId: 4711 } };
      expect(
        await method(
          r(mockTransport(body)),
          name,
        )({ discountAmount: 50 } satisfies CreateTlDiscountInput),
      ).toEqual({
        success: true,
        campaignId: 4711,
        raw: body,
      });
    },
  );

  it('create* tolerates a flat envelope, a failure body and a non-object body', async () => {
    const create = (body: unknown) => r(mockTransport(body)).createTlDiscount({ amount: 1 });
    expect(await create({ success: true, campaignId: 7 })).toEqual({
      success: true,
      campaignId: 7,
      raw: { success: true, campaignId: 7 },
    });
    expect(await create({ success: false })).toEqual({ success: false, raw: { success: false } });
    // A stringly-typed id is not the documented integer — left on raw only.
    expect(await create({ success: true, data: { campaignId: '7' } })).toEqual({
      success: true,
      raw: { success: true, data: { campaignId: '7' } },
    });
    expect(await create('x')).toEqual({ raw: 'x' });
    expect(await create(undefined)).toEqual({ raw: undefined });
  });

  it('cancelDiscount resolves to a MutationResult ({ success } only in the spec)', async () => {
    expect(await r(mockTransport({ success: true })).cancelDiscount({ campaignId: 1 })).toEqual({
      raw: { success: true },
    });
  });
});

// ─── Questions / shipping / test orders → MutationResult ──────────────────

describe('questions — MutationResult surface', () => {
  const r = (t: HepsiburadaTransport) => new QuestionsResource(t, fastLimiter());

  it('create resolves to a MutationResult carrying the 201 number[] body on raw', async () => {
    expect(await r(mockTransport([42])).create({ productSku: 'S', question: 'q' })).toEqual({
      raw: [42],
    });
  });

  it.each(['answer', 'reject'] as const)('%s resolves to a MutationResult', async (name) => {
    expect(await method(r(mockTransport('Created')), name)('Q-1', { Answer: 'Evet' })).toEqual({
      raw: 'Created',
    });
  });
});

describe('shipping — MutationResult surface', () => {
  const r = (t: HepsiburadaTransport) => new ShippingResource(t, fastLimiter());

  it.each(['createProfile', 'updateProfile'] as const)(
    '%s resolves to a MutationResult',
    async (name) => {
      expect(await method(r(mockTransport({ ok: true })), name)({ profileName: 'P' })).toEqual({
        raw: { ok: true },
      });
    },
  );
});

describe('testOrders — MutationResult surface', () => {
  it('create resolves to a MutationResult', async () => {
    const out = await new TestOrdersResource(
      mockTransport({ orderNumber: 'TO-1' }),
      fastLimiter(),
    ).create({ lines: [] });
    expect(out).toEqual({ raw: { orderNumber: 'TO-1' } });
  });
});

// ─── Suppliers ────────────────────────────────────────────────────────────

describe('suppliers — typed return surface', () => {
  const r = (t: HepsiburadaTransport) => new SuppliersResource(t, fastLimiter());

  it('searchOpenPurchaseOrders unwraps { data: { totalCount, rows } } into typed rows', async () => {
    const row = {
      purchaseOrderNumber: 'PO-1',
      lineNumber: 1,
      sku: 'SKU-1',
      barcode: ['8690000000001'],
      operationStatus: 'Actionable',
      purchaseOrderUnitPrice: 12.5,
      isSent: false,
      remainingQuantity: null, // nullable in the spec → not surfaced
      undocumented: 'kept on raw only',
    };
    const body = { data: { totalCount: 1, rows: [row] }, message: null, errorCode: null };
    const out = await r(mockTransport(body)).searchOpenPurchaseOrders({ pageNumber: 0 });
    expect(out.totalCount).toBe(1);
    expect(out.items).toEqual([
      {
        purchaseOrderNumber: 'PO-1',
        lineNumber: 1,
        sku: 'SKU-1',
        barcode: ['8690000000001'],
        operationStatus: 'Actionable',
        purchaseOrderUnitPrice: 12.5,
        isSent: false,
        raw: row,
      },
    ]);
    expect(out.message).toBeUndefined();
    expect(out.errorCode).toBeUndefined();
    expect(out.raw).toBe(body);
  });

  it('searchSupplierListings maps SupplierListingItem rows', async () => {
    const row = {
      sku: 'SKU-1',
      merchantSku: 'M-1',
      price: 10.5,
      currencyCode: 'TRY',
      lastPurchasePriceUpdateDate: '2026-01-01',
      stock: 3,
      unitPerPackage: 6,
      status: 'Active',
      listingType: 'Normal',
    };
    const out = await r(
      mockTransport({ data: { totalCount: 9, rows: [row] } }),
    ).searchSupplierListings({ pageNumber: 0 });
    expect(out.totalCount).toBe(9);
    expect(out.items[0]).toEqual({ ...row, raw: row });
  });

  it('searchListingUpdateRequests maps ListingUpdateRequestSummaryResponse rows', async () => {
    const row = {
      requestId: '3f2c9a2e-0000-4000-8000-000000000001',
      createdDateTime: '2026-02-01',
      operationSource: 'Api',
      rowCount: 2,
    };
    const out = await r(
      mockTransport({ data: { totalCount: 1, rows: [row] } }),
    ).searchListingUpdateRequests({ pageNumber: 0 });
    expect(out.items[0]).toEqual({ ...row, raw: row });
  });

  it('search results tolerate data:null, a missing envelope, malformed rows and a non-object body', async () => {
    const search = (body: unknown) =>
      r(mockTransport(body)).searchSupplierListings({ pageNumber: 0 });
    expect(await search({ data: null })).toEqual({ items: [], raw: { data: null } });
    const flat = { totalCount: 2, rows: [{ sku: 'A' }] };
    expect(await search(flat)).toEqual({
      totalCount: 2,
      items: [{ sku: 'A', raw: { sku: 'A' } }],
      raw: flat,
    });
    expect((await search({ data: { rows: 'nope' } })).items).toEqual([]);
    expect((await search({ data: { rows: [null, 'x'] } })).items).toEqual([
      { raw: {} },
      { raw: {} },
    ]);
    expect(await search('nope')).toEqual({ items: [], raw: 'nope' });
    expect(await search(undefined)).toEqual({ items: [], raw: undefined });
  });

  it('surfaces message / errorCode from the envelope', async () => {
    const body = { data: null, message: 'Forbidden', errorCode: 'E403' };
    expect(await r(mockTransport(body)).searchOpenPurchaseOrders({ pageNumber: 0 })).toEqual({
      items: [],
      message: 'Forbidden',
      errorCode: 'E403',
      raw: body,
    });
  });

  it('getListingUpdateRequest maps ListingUpdateRequestDetailResponse', async () => {
    const item = {
      sku: 'SKU-1',
      price: 1,
      priceApprovalStatus: 'Approved',
      salable: true,
      currencyCode: 'TRY',
      stock: 'bad', // wrong wire type → raw only
    };
    const body = {
      data: {
        requestId: 'REQ-1',
        createdDateTime: '2026-02-01',
        requestItems: [item],
      },
      message: null,
      errorCode: null,
    };
    const out = await r(mockTransport(body)).getListingUpdateRequest('REQ-1');
    expect(out).toEqual({
      requestId: 'REQ-1',
      createdDateTime: '2026-02-01',
      requestItems: [
        {
          sku: 'SKU-1',
          price: 1,
          priceApprovalStatus: 'Approved',
          salable: true,
          currencyCode: 'TRY',
          raw: item,
        },
      ],
      raw: body,
    });
    expect(
      await r(
        mockTransport({ data: { requestId: 'REQ-2', requestItems: null } }),
      ).getListingUpdateRequest('REQ-2'),
    ).toMatchObject({ requestId: 'REQ-2', requestItems: [] });
  });

  it('createListingUpdateRequest maps GuidIdResult onto ListingUpdateRequestReceipt', async () => {
    const body = {
      data: { id: '3f2c9a2e-0000-4000-8000-000000000002' },
      message: null,
      errorCode: null,
    };
    const input = { requestItems: [] } satisfies CreateListingUpdateRequestInput;
    expect(await r(mockTransport(body)).createListingUpdateRequest(input)).toEqual({
      id: '3f2c9a2e-0000-4000-8000-000000000002',
      raw: body,
    });
    expect(await r(mockTransport({ data: {} })).createListingUpdateRequest({ items: [] })).toEqual({
      raw: { data: {} },
    });
  });
});

// ─── Faz 1.3b — categories.list OffsetPage alignment ──────────────────────

describe('categories.list — OffsetPage alignment', () => {
  const r = (t: HepsiburadaTransport) => new CategoriesResource(t, fastLimiter());
  const envelope = (over: Record<string, unknown> = {}) => ({
    success: true,
    code: 0,
    version: 1,
    message: null,
    totalElements: 27555,
    totalPages: 276,
    number: 2,
    numberOfElements: 100,
    first: false,
    last: false,
    data: [{ categoryId: 1, name: 'A', leaf: true }],
    ...over,
  });

  it('returns the OffsetPage fields next to the (deprecated) Spring fields', async () => {
    const page = await r(mockTransport(envelope())).list({ page: 2, size: 100 });
    expect(page).toMatchObject({
      totalCount: 27555,
      pageCount: 276,
      limit: 100,
      offset: 200,
      totalElements: 27555,
      totalPages: 276,
      number: 2,
      numberOfElements: 100,
    });
    expect(page.items).toBe(page.data);
    expect(page.items[0]).toMatchObject({ categoryId: 1, name: 'A', leaf: true });
  });

  it('accepts offset / limit and converts them to page / size on the wire', async () => {
    const transport = mockTransport(envelope());
    const page = await r(transport).list({ offset: 200, limit: 100, leaf: true });
    expect(lastCall(transport).query).toEqual({
      page: 2,
      size: 100,
      leaf: true,
      status: undefined,
      available: undefined,
    });
    expect(page.offset).toBe(200);
    expect(page.limit).toBe(100);
  });

  it('rejects an offset that is not a multiple of limit, and mixed paging styles', async () => {
    await expect(r(mockTransport()).list({ offset: 150, limit: 100 })).rejects.toThrow(
      ValidationError,
    );
    await expect(r(mockTransport()).list({ page: 1, limit: 100 })).rejects.toThrow(ValidationError);
  });

  it('falls back to the server page size when no size was requested', async () => {
    const page = await r(mockTransport(envelope({ number: 0, numberOfElements: 1 }))).list();
    expect(page).toMatchObject({ limit: 1, offset: 0, totalCount: 27555, pageCount: 276 });
  });
});

// ─── Faz 1.3b — CatalogProduct.id optional ────────────────────────────────

describe('CatalogProduct.id', () => {
  const list = async (rows: unknown[]) => {
    const transport = mockTransport({
      success: true,
      totalElements: rows.length,
      totalPages: 1,
      number: 0,
      numberOfElements: rows.length,
      data: rows,
    });
    return new CatalogResource(transport, fastLimiter()).listProductsByStatus({
      status: 'MATCHED',
    });
  };

  it('is absent (not an empty-string sentinel) when the wire row has no id', async () => {
    const page = await list([{ merchantSku: 'SKU-1' }]);
    expect(page.items[0]).not.toHaveProperty('id');
    expect(page.items[0]!.merchantSku).toBe('SKU-1');
  });

  it('keeps a string id and stringifies a numeric one', async () => {
    const page = await list([{ id: 'abc' }, { id: 12 }]);
    expect(page.items.map((p) => p.id)).toEqual(['abc', '12']);
  });
});
