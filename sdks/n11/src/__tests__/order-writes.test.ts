import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@lonca/core';
import { CatalogResource } from '../resources/catalog.js';
import { ClaimsResource } from '../resources/claims.js';
import { OrdersResource } from '../resources/orders.js';
import { QuestionsResource } from '../resources/questions.js';
import { parseXml, type XmlObject } from '../soap/xml.js';
import type { N11Transport } from '../transport.js';

/**
 * Shapes follow what n11's test store answered on 2026-10-13 (REST line
 * results, split results, SOAP `result` elements). Every value is invented.
 */
function mockTransport(...responses: unknown[]) {
  const request = vi.fn();
  const soap = vi.fn();
  for (const r of responses) {
    request.mockResolvedValueOnce(r);
    soap.mockResolvedValueOnce(r);
  }
  return { transport: { request, soap } as unknown as N11Transport, request, soap };
}

function xml(inner: string): XmlObject {
  return parseXml(`<R>${inner}</R>`).R as XmlObject;
}

const success = '<result><status>success</status></result>';

describe('OrdersResource writes (REST)', () => {
  it('approve sends numeric line ids with status Picking and maps per-line results', async () => {
    const { transport, request } = mockTransport({
      content: [
        { lineId: 400000001, status: 'SUCCESS', reasons: null },
        {
          lineId: 400000002,
          status: 'FAIL',
          reasons: 'Sipariş onaylamak için uygun statüde değildir.',
        },
      ],
    });
    const results = await new OrdersResource(transport).approve(['400000001', 400000002]);
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: 'PUT',
      path: '/rest/order/v1/update',
      body: { lines: [{ lineId: 400000001 }, { lineId: 400000002 }], status: 'Picking' },
    });
    expect(request.mock.calls[0]![0]).not.toHaveProperty('rateLimiter');
    expect(results).toEqual([
      { lineId: '400000001', status: 'SUCCESS' },
      {
        lineId: '400000002',
        status: 'FAIL',
        reason: 'Sipariş onaylamak için uygun statüde değildir.',
      },
    ]);
  });

  it('approve copes with an empty answer and sparse rows', async () => {
    const { transport } = mockTransport(undefined, { content: [{}] });
    const resource = new OrdersResource(transport);
    expect(await resource.approve([1])).toEqual([]);
    expect(await resource.approve([1])).toEqual([{ lineId: '', status: '' }]);
  });

  it.each([
    ['approve', (r: OrdersResource) => r.approve([])],
    ['splitPackage', (r: OrdersResource) => r.splitPackage([])],
    ['splitPackageByQuantity', (r: OrdersResource) => r.splitPackageByQuantity({ packages: [] })],
    ['createCollectionRequest', (r: OrdersResource) => r.createCollectionRequest([])],
    ['updateLaborCosts', (r: OrdersResource) => r.updateLaborCosts([])],
  ])('%s rejects an empty list before sending', async (_name, call) => {
    const { transport, request } = mockTransport();
    await expect(call(new OrdersResource(transport))).rejects.toBeInstanceOf(ValidationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('splitPackage sends one group per new package and normalises the result', async () => {
    const { transport, request } = mockTransport({
      code: 200,
      message: 'OK',
      splitPackageOrderItems: [
        {
          orderNumber: 200000000001,
          packageId: 500000001,
          orderLineId: 400000001,
          stockCode: 'SKU-1',
          quantity: 1,
        },
        {},
      ],
    });
    const result = await new OrdersResource(transport).splitPackage([['400000001'], [400000002]]);
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: 'POST',
      path: '/rest/delivery/v1/splitCombinePackage',
      body: { splitGroups: [{ orderLineIds: [400000001] }, { orderLineIds: [400000002] }] },
    });
    expect(result).toEqual({
      code: 200,
      message: 'OK',
      items: [
        {
          orderNumber: '200000000001',
          packageId: '500000001',
          lineId: '400000001',
          stockCode: 'SKU-1',
          quantity: 1,
        },
        {},
      ],
    });
  });

  it('splitPackageByQuantity sends packages and optional cancellations', async () => {
    const { transport, request } = mockTransport(undefined, undefined);
    const resource = new OrdersResource(transport);
    expect(
      await resource.splitPackageByQuantity({
        packages: [[{ lineId: '400000001', quantity: 2 }]],
        cancel: [{ lineId: '400000001', quantity: 1, reasonId: 61 }],
      }),
    ).toEqual({ items: [] });
    expect(request.mock.calls[0]![0]).toMatchObject({
      path: '/rest/delivery/v1/splitPackageByQuantity',
      body: {
        splitPackages: [{ packageDetails: [{ orderLineId: 400000001, quantities: 2 }] }],
        cancelledItems: [{ cancelReasonId: 61, orderLineId: 400000001, quantity: 1 }],
      },
    });
    await resource.splitPackageByQuantity({ packages: [[{ lineId: 1, quantity: 1 }]] });
    expect(request.mock.calls[1]![0].body).not.toHaveProperty('cancelledItems');
  });

  it('createCollectionRequest maps the lines and returns code/message', async () => {
    const { transport, request } = mockTransport({ code: 200, message: 'OK' }, undefined);
    const resource = new OrdersResource(transport);
    const line = {
      packageId: '500000001',
      lineId: '400000001',
      boxQuantity: 1,
      desi: 2.5,
      shipmentCompany: 'HLZ' as const,
    };
    expect(await resource.createCollectionRequest([line])).toEqual({ code: 200, message: 'OK' });
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: 'PUT',
      path: '/rest/delivery/v1/collectionRequest',
      body: {
        collectionRequestDetails: [
          {
            id: '500000001',
            orderLineId: 400000001,
            boxQuantity: 1,
            desi: 2.5,
            shipmentCompany: 'HLZ',
          },
        ],
      },
    });
    expect(await resource.createCollectionRequest([line])).toEqual({});
  });

  it('updateLaborCosts sends amounts and VAT (null when unset) and keeps details', async () => {
    const details = { totalLaborCostExcludingVAT: 10, laborVatRate: 20, amountExcludingVAT: 90 };
    const { transport, request } = mockTransport({
      content: [{ lineId: 400000001, status: 'SUCCESS', reasons: '', details }],
    });
    const results = await new OrdersResource(transport).updateLaborCosts([
      { lineId: '400000001', amountExcludingVat: 10 },
      { lineId: 400000002, amountExcludingVat: 5, vatRate: 10 },
    ]);
    expect(request.mock.calls[0]![0]).toMatchObject({
      method: 'PUT',
      path: '/rest/order/v1/labor-costs',
      body: {
        laborCostDetails: [
          { orderLineId: 400000001, totalLaborCostExcludingVAT: 10, laborVatRate: null },
          { orderLineId: 400000002, totalLaborCostExcludingVAT: 5, laborVatRate: 10 },
        ],
      },
    });
    expect(results).toEqual([{ lineId: '400000001', status: 'SUCCESS', details }]);
  });
});

describe('OrdersResource writes (SOAP)', () => {
  it('cancelItem calls ClaimCancelPartial as a non-idempotent write', async () => {
    const { transport, soap } = mockTransport(xml(success));
    await new OrdersResource(transport).cancelItem({
      lineId: 400000001,
      quantity: 1,
      reasonId: 61,
      description: 'Stok bitti',
    });
    expect(soap).toHaveBeenCalledWith({
      service: 'claimCancelService',
      operation: 'ClaimCancelPartial',
      fields: {
        orderItemId: '400000001',
        cancelQuantity: 1,
        cancelReasonTypeId: '61',
        cancelReasonDescription: 'Stok bitti',
      },
      idempotent: false,
    });
  });

  it('sendInvoiceLink sends the link (and micro-export fields) in WSDL order', async () => {
    const { transport, soap } = mockTransport(
      xml(
        `${success}<url>https://example.invalid/f.pdf</url><orderNumber>200000000001</orderNumber>`,
      ),
      xml(success),
    );
    const resource = new OrdersResource(transport);
    expect(
      await resource.sendInvoiceLink({
        orderNumber: '200000000001',
        url: 'https://example.invalid/f.pdf',
        invoiceNumber: 'N112026000000001',
        invoiceDate: new Date(1780903800000),
      }),
    ).toEqual({ url: 'https://example.invalid/f.pdf' });
    const call = soap.mock.calls[0]![0];
    expect(call).toMatchObject({
      service: 'sellerInvoiceService',
      operation: 'SaveLinkSellerInvoice',
      idempotent: false,
    });
    expect(Object.entries(call.fields)).toEqual([
      ['url', 'https://example.invalid/f.pdf'],
      ['orderNumber', '200000000001'],
      ['invoiceDateTime', 1780903800000],
      ['invoiceNumber', 'N112026000000001'],
    ]);
    expect(
      await resource.sendInvoiceLink({
        orderNumber: '1',
        url: 'https://example.invalid/f.pdf',
        invoiceDate: 5,
      }),
    ).toEqual({});
    expect(soap.mock.calls[1]![0].fields.invoiceDateTime).toBe(5);
  });

  it.each([['http://example.invalid/f.pdf'], [`https://example.invalid/${'a'.repeat(2048)}`]])(
    'sendInvoiceLink rejects %s before sending',
    async (url) => {
      const { transport, soap } = mockTransport();
      await expect(
        new OrdersResource(transport).sendInvoiceLink({ orderNumber: '1', url }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(soap).not.toHaveBeenCalled();
    },
  );
});

describe('ClaimsResource writes', () => {
  it('approveReturn sends the claim id and optional split quantity', async () => {
    const { transport, soap } = mockTransport(xml(success), xml(success));
    const claims = new ClaimsResource(transport);
    await claims.approveReturn(27000001);
    await claims.approveReturn('27000002', { splitQuantity: 1 });
    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'returnService',
      operation: 'ClaimReturnApprove',
      fields: { claimReturnId: '27000001', splitQuantity: undefined },
      idempotent: false,
    });
    expect(soap.mock.calls[1]![0].fields).toEqual({ claimReturnId: '27000002', splitQuantity: 1 });
  });

  it('denyReturn sends the fields in WSDL order', async () => {
    const { transport, soap } = mockTransport(xml(success), xml(success));
    const claims = new ClaimsResource(transport);
    await claims.denyReturn({
      claimReturnId: 27000001,
      denyReasonId: 3,
      note: 'Ürün kullanılmış',
      returnShipmentType: 'CUSTOM',
      shipmentCompanyId: 345,
      trackingNumber: 'TRK1',
      deliveryReceiptNumber: 'R1',
      imageUrls: ['https://example.invalid/1.jpg', 'https://example.invalid/2.jpg'],
      videoUrl: 'https://example.invalid/v.mp4',
      splitQuantity: 1,
    });
    const call = soap.mock.calls[0]![0];
    expect(call).toMatchObject({ operation: 'ClaimReturnDeny', idempotent: false });
    expect(Object.keys(call.fields)).toEqual([
      'claimReturnId',
      'denyReasonId',
      'denyReasonNote',
      'returnShipmentType',
      'shipmentCompanyId',
      'trackingNumber',
      'deliveryReceiptNumber',
      'imageFirstUrl',
      'imageSecondUrl',
      'imageThirdUrl',
      'videoUrl',
      'splitQuantity',
    ]);
    expect(call.fields).toMatchObject({
      claimReturnId: '27000001',
      denyReasonId: '3',
      shipmentCompanyId: '345',
      imageFirstUrl: 'https://example.invalid/1.jpg',
      imageSecondUrl: 'https://example.invalid/2.jpg',
      imageThirdUrl: undefined,
    });
    await claims.denyReturn({ claimReturnId: 1, denyReasonId: 1, note: 'x' });
    expect(soap.mock.calls[1]![0].fields.shipmentCompanyId).toBeUndefined();
  });

  it('postponeReturn sends reason, day count and note', async () => {
    const { transport, soap } = mockTransport(xml(success));
    await new ClaimsResource(transport).postponeReturn({
      claimReturnId: 27000001,
      pendingReasonId: 2,
      days: 3,
      note: 'Kargo bekleniyor',
    });
    expect(soap).toHaveBeenCalledWith({
      service: 'returnService',
      operation: 'ClaimReturnPending',
      fields: {
        claimReturnId: '27000001',
        pendingReasonId: '2',
        pendingDayCount: 3,
        pendingReasonNote: 'Kargo bekleniyor',
      },
      idempotent: false,
    });
  });
});

describe('QuestionsResource.answer', () => {
  it('sends SaveProductAnswer as a write', async () => {
    const { transport, soap } = mockTransport(xml(success));
    await new QuestionsResource(transport).answer(117000001, 'Yarın kargoda.');
    expect(soap).toHaveBeenCalledWith({
      service: 'productService',
      operation: 'SaveProductAnswer',
      fields: { productQuestionId: '117000001', answer: 'Yarın kargoda.' },
      idempotent: false,
    });
  });

  it.each([[''], ['   '], ['a'.repeat(2049)]])(
    'rejects answer %j before sending',
    async (answer) => {
      const { transport, soap } = mockTransport();
      await expect(new QuestionsResource(transport).answer(1, answer)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(soap).not.toHaveBeenCalled();
    },
  );
});

describe('CatalogResource.search', () => {
  const product = (id: number, usc = '') =>
    `<product><catalogId>${id}</catalogId><categoryId>1000002</categoryId>` +
    `<categoryName>Örnek Kategori</categoryName><productTitle>Örnek Ürün ${id}</productTitle>` +
    (usc ? `<usc>${usc}</usc>` : '') +
    `</product>`;

  it('joins multi-value filters with commas and flattens every response group', async () => {
    const { transport, soap } = mockTransport(
      xml(
        `${success}<warning>Örnek uyarı</warning><searchResponses>` +
          `<searchResponse><products>${product(1, '8690000000001')}${product(2)}</products></searchResponse>` +
          `<searchResponse><products>${product(3)}</products></searchResponse>` +
          `</searchResponses>`,
      ),
    );
    const result = await new CatalogResource(transport).search({
      barcodes: ['8690000000001', '8690000000002'],
      page: 1,
    });
    expect(soap).toHaveBeenCalledWith({
      service: 'catalogService',
      operation: 'SearchCatalog',
      fields: {
        productTitles: undefined,
        categoryId: undefined,
        uscs: '8690000000001,8690000000002',
        brandName: undefined,
        catalogIds: undefined,
        currentPage: 1,
      },
    });
    expect(result.warning).toBe('Örnek uyarı');
    expect(result.items).toEqual([
      {
        catalogId: '1',
        title: 'Örnek Ürün 1',
        categoryId: '1000002',
        categoryName: 'Örnek Kategori',
        barcode: '8690000000001',
      },
      {
        catalogId: '2',
        title: 'Örnek Ürün 2',
        categoryId: '1000002',
        categoryName: 'Örnek Kategori',
      },
      {
        catalogId: '3',
        title: 'Örnek Ürün 3',
        categoryId: '1000002',
        categoryName: 'Örnek Kategori',
      },
    ]);
  });

  it('answers no matches (empty products) with an empty list', async () => {
    const { transport, soap } = mockTransport(
      xml(
        `${success}<searchResponses><searchResponse><products/></searchResponse></searchResponses>`,
      ),
      xml(
        `${success}<searchResponses><searchResponse><products><product><categoryId>1</categoryId></product></products></searchResponse></searchResponses>`,
      ),
    );
    const catalog = new CatalogResource(transport);
    expect(await catalog.search({ titles: ['Güzel Yazı Defteri'], categoryId: 1001012 })).toEqual({
      items: [],
    });
    expect(soap.mock.calls[0]![0].fields).toMatchObject({
      productTitles: 'Güzel Yazı Defteri',
      categoryId: '1001012',
      currentPage: 0,
    });
    expect((await catalog.search({ brandName: 'Örnek' })).items).toEqual([
      { catalogId: '', categoryId: '1' },
    ]);
  });

  it.each([
    ['11 barcodes', { barcodes: Array.from({ length: 11 }, (_, i) => String(i)) }],
    ['a short title', { titles: ['Kısa'], categoryId: 1 }],
    ['a title without category', { titles: ['Yeterince uzun başlık'] }],
    ['a category alone', { categoryId: 1 }],
    ['no filter', {}],
  ])('rejects %s before sending', async (_label, params) => {
    const { transport, soap } = mockTransport();
    await expect(new CatalogResource(transport).search(params)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(soap).not.toHaveBeenCalled();
  });

  it('allows a category with a brand', async () => {
    const { transport } = mockTransport(xml(success));
    expect(
      await new CatalogResource(transport).search({ categoryId: 1, brandName: 'Örnek' }),
    ).toEqual({ items: [] });
  });
});
