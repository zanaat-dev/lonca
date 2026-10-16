import { describe, expect, it, vi } from 'vitest';
import { paginate } from '@lonca/core';
import { FinanceResource } from '../resources/finance.js';
import { parseXml, type XmlObject } from '../soap/xml.js';
import { isoDay } from '../soap/values.js';
import type { N11Transport } from '../transport.js';

/**
 * Responses are XML parsed with the SDK's own parser. Element names follow
 * what n11's test store sent on 2026-10-16 (the WSDL's list wrappers plus
 * `taxDeduction` / `taxDeductionRate`); every value is invented.
 */
function response(inner: string): XmlObject {
  return parseXml(`<R>${inner}</R>`).R as XmlObject;
}

function mockTransport(...responses: XmlObject[]) {
  const soap = vi.fn();
  for (const r of responses) soap.mockResolvedValueOnce(r);
  return { transport: { soap } as unknown as N11Transport, soap };
}

const tl = (amount: number) => ({ amount, currency: 'TRY' });

const metadata = (current: number, pageCount: number) =>
  `<metadata><currentPage>${current}</currentPage><pageSize>2</pageSize><totalCount>3</totalCount><pageCount>${pageCount}</pageCount></metadata>`;

const settlement = (day: string, status: string) =>
  `<settlementList><deductionAmount>12.5</deductionAmount><paymentAmount>100</paymentAmount>` +
  `<remittanceDate>2026-03-13</remittanceDate><settlementAmount>87.5</settlementAmount>` +
  `<settlementDate>${day}</settlementDate><status>${status}</status></settlementList>`;

const line = (id: number, tracking = '') =>
  `<orderItemSettlement><adFee>0.5</adFee><adFeeVat>0.1</adFeeVat><buyerEmail>a***@example.invalid</buyerEmail>` +
  `<buyerName>A*** B***</buyerName><commission>12.5</commission><completedDate>2026-03-09</completedDate>` +
  `<deductionAmount>15.25</deductionAmount><orderItemId>${id}</orderItemId><orderNumber>200000000001</orderNumber>` +
  `<paymentAmount>100</paymentAmount><paymentDate>2026-03-05</paymentDate><productId>700000001</productId>` +
  `<productName>Örnek Fincan</productName><remittanceDate>2026-03-13</remittanceDate>` +
  `<sellerCouponDiscount>0</sellerCouponDiscount><sellerDiscount>2</sellerDiscount>` +
  `<settlementAmount>80</settlementAmount><settlementDate>2026-03-10</settlementDate>` +
  `<shippingDate>2026-03-06</shippingDate><trackingNumber>${tracking}</trackingNumber>` +
  `<defermentOfPayment>4.75</defermentOfPayment><cargoPrice>0</cargoPrice><serviceFee>0.6</serviceFee>` +
  `<serviceFeeVat>0.12</serviceFeeVat><taxDeduction>1.67</taxDeduction><taxDeductionRate>20</taxDeductionRate>` +
  `</orderItemSettlement>`;

describe('isoDay', () => {
  it('formats a Date as YYYY-MM-DD on the Istanbul calendar day', () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Istanbul (UTC+3).
    expect(isoDay(new Date('2025-12-31T22:30:00Z'))).toBe('2026-01-01');
    expect(isoDay('2026-03-11')).toBe('2026-03-11');
    expect(isoDay(undefined)).toBeUndefined();
  });
});

describe('FinanceResource.listSettlements', () => {
  it('sends ISO days and a capped page size, and follows the next cursor', async () => {
    const { transport, soap } = mockTransport(
      response(
        `<result><status>success</status></result><settlementListData>${metadata(0, 2)}` +
          `${settlement('2026-03-10', 'Success')}${settlement('2026-03-11', 'Wait_Remittance')}` +
          `</settlementListData>`,
      ),
      response(
        `<settlementListData>${metadata(1, 2)}${settlement('2026-03-12', 'Failed')}</settlementListData>`,
      ),
    );
    const resource = new FinanceResource(transport);

    const first = await resource.listSettlements({
      startDate: new Date('2026-03-09T21:30:00Z'),
      endDate: '2026-03-12',
      limit: 500,
    });

    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'settlementService',
      operation: 'GetSettlementList',
      fields: {
        startDate: '2026-03-10',
        endDate: '2026-03-12',
        pagingData: { currentPage: 0, pageSize: 100 },
      },
    });
    expect(first.nextCursor).toBe('1');
    expect(first.items[0]).toEqual({
      settlementDate: '2026-03-10',
      status: 'Success',
      remittanceDate: '2026-03-13',
      paymentAmount: tl(10000),
      deductionAmount: tl(1250),
      settlementAmount: tl(8750),
      raw: expect.objectContaining({ settlementDate: '2026-03-10' }),
    });

    const second = await resource.listSettlements({
      startDate: '2026-03-10',
      endDate: '2026-03-12',
      cursor: first.nextCursor,
    });
    expect(soap.mock.calls[1]![0].fields.pagingData).toEqual({ currentPage: 1, pageSize: 100 });
    expect(second.items.map((s) => s.status)).toEqual(['Failed']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('returns an empty page when n11 sends no rows', async () => {
    const { transport } = mockTransport(
      response(`<settlementListData>${metadata(0, 0)}</settlementListData>`),
    );
    const page = await new FinanceResource(transport).listSettlements({
      startDate: '2026-03-12',
      endDate: '2026-03-10',
    });
    expect(page).toEqual({ items: [] });
  });

  it('rejects a cursor that is not a page index', async () => {
    const { transport } = mockTransport();
    await expect(
      new FinanceResource(transport).listSettlements({
        startDate: '2026-03-10',
        endDate: '2026-03-12',
        cursor: 'next',
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe('FinanceResource.getSettlementDetail', () => {
  it('reads a day: totals, paged lines and deferments', async () => {
    const { transport, soap } = mockTransport(
      response(
        '<result><status>success</status></result><settlementDetail>' +
          '<settlement><salesAmount>200</salesAmount><sellerWithdraw>0</sellerWithdraw>' +
          '<releaseDeferment>0</releaseDeferment><deductionAmount>30.5</deductionAmount>' +
          '<defermentOfPayment>9.5</defermentOfPayment><paymentToECash>160</paymentToECash>' +
          '<remittance>0</remittance></settlement>' +
          `<orderItemSettlementDataList>${metadata(0, 2)}<orderItemSettlements>${line(1, '123456')}${line(2)}` +
          '</orderItemSettlements></orderItemSettlementDataList>' +
          '<defermentSettlementUsageDataList><financialTotalDeferment>9.5</financialTotalDeferment>' +
          '<totalReturnDefermentAmount>0</totalReturnDefermentAmount>' +
          '<deferments><deferment><deferredDate>10.03.2026 12:00</deferredDate><amount>4.75</amount>' +
          '<defermentReasonDetail>Erken ödeme ücreti</defermentReasonDetail></deferment></deferments>' +
          '<defermentSppUsages><defermentSppUsage><orderNumber>200000000002</orderNumber>' +
          '<campaignNumber>110000000000001</campaignNumber><createdDate>01.03.2026 00:01</createdDate>' +
          '<cargoWeightFromShipmentCompany>2</cargoWeightFromShipmentCompany><deferredAmount>0.1</deferredAmount>' +
          '<shipmentCompanyName>Örnek Kargo</shipmentCompanyName></defermentSppUsage></defermentSppUsages>' +
          '<defermentSettlementUsages><defermentSettlementUsage><orderNumber>200000000003</orderNumber>' +
          '<orderDate>2026-02-20</orderDate><productId>700000002</productId><productTitle>Örnek Tabak</productTitle>' +
          '<amount>3.2</amount></defermentSettlementUsage></defermentSettlementUsages>' +
          '</defermentSettlementUsageDataList></settlementDetail>',
      ),
    );

    const detail = await new FinanceResource(transport).getSettlementDetail(
      new Date('2026-03-10T08:00:00Z'),
      { limit: 2 },
    );

    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'settlementService',
      operation: 'GetSettlementDetail',
      fields: { date: '2026-03-10', pagingData: { currentPage: 0, pageSize: 2 } },
    });
    expect(detail.date).toBe('2026-03-10');
    expect(detail.nextCursor).toBe('1');
    expect(detail.summary).toEqual({
      salesAmount: tl(20000),
      sellerWithdraw: tl(0),
      releaseDeferment: tl(0),
      deductionAmount: tl(3050),
      defermentOfPayment: tl(950),
      paymentToECash: tl(16000),
      remittance: tl(0),
    });
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toEqual({
      lineId: '1',
      orderNumber: '200000000001',
      productId: '700000001',
      productName: 'Örnek Fincan',
      buyerName: 'A*** B***',
      buyerEmail: 'a***@example.invalid',
      trackingNumber: '123456',
      paymentAmount: tl(10000),
      deductionAmount: tl(1525),
      settlementAmount: tl(8000),
      sellerDiscount: tl(200),
      sellerCouponDiscount: tl(0),
      commissionRate: 12.5,
      adFee: tl(50),
      adFeeVat: tl(10),
      serviceFee: tl(60),
      serviceFeeVat: tl(12),
      cargoPrice: tl(0),
      defermentOfPayment: tl(475),
      taxDeduction: tl(167),
      taxDeductionRate: 20,
      paymentDate: '2026-03-05',
      shippingDate: '2026-03-06',
      completedDate: '2026-03-09',
      settlementDate: '2026-03-10',
      remittanceDate: '2026-03-13',
      raw: expect.objectContaining({ orderItemId: '1' }),
    });
    expect(detail.items[1]!.trackingNumber).toBeUndefined();
    expect(detail.totalDeferment).toEqual(tl(950));
    expect(detail.totalReturnDeferment).toEqual(tl(0));
    expect(detail.deferments).toEqual([
      { deferredDate: '10.03.2026 12:00', amount: tl(475), reason: 'Erken ödeme ücreti' },
    ]);
    expect(detail.shipmentDeferments).toEqual([
      {
        orderNumber: '200000000002',
        campaignNumber: '110000000000001',
        createdDate: '01.03.2026 00:01',
        cargoWeight: 2,
        amount: tl(10),
        shipmentCompanyName: 'Örnek Kargo',
      },
    ]);
    expect(detail.defermentUsages).toEqual([
      {
        orderNumber: '200000000003',
        orderDate: '2026-02-20',
        productId: '700000002',
        productTitle: 'Örnek Tabak',
        amount: tl(320),
      },
    ]);
  });

  it('answers a day without a settlement with zero totals and no lines', async () => {
    const { transport } = mockTransport(
      response(
        '<settlementDetail><settlement><salesAmount>0</salesAmount></settlement>' +
          `<orderItemSettlementDataList>${metadata(0, 0)}</orderItemSettlementDataList>` +
          '<defermentSettlementUsageDataList><deferments/><defermentSppUsages/>' +
          '<defermentSettlementUsages/></defermentSettlementUsageDataList></settlementDetail>',
      ),
    );
    const detail = await new FinanceResource(transport).getSettlementDetail('2026-03-14');
    expect(detail).toMatchObject({
      date: '2026-03-14',
      summary: { salesAmount: tl(0) },
      items: [],
      deferments: [],
      shipmentDeferments: [],
      defermentUsages: [],
    });
    expect(detail.nextCursor).toBeUndefined();
  });

  it('pages the lines of a day with paginate()', async () => {
    const day = (current: number, ids: number[]) =>
      response(
        '<settlementDetail><settlement/><orderItemSettlementDataList>' +
          metadata(current, 2) +
          '<orderItemSettlements>' +
          ids
            .map(
              (id) => `<orderItemSettlement><orderItemId>${id}</orderItemId></orderItemSettlement>`,
            )
            .join('') +
          '</orderItemSettlements></orderItemSettlementDataList></settlementDetail>',
      );
    const { transport, soap } = mockTransport(day(0, [1, 2]), day(1, [3]));
    const resource = new FinanceResource(transport);

    const ids: string[] = [];
    for await (const settled of paginate((p) => resource.getSettlementDetail('2026-03-10', p), {
      limit: 2,
    })) {
      ids.push(settled.lineId);
    }
    expect(ids).toEqual(['1', '2', '3']);
    expect(soap.mock.calls.map((c) => c[0].fields.pagingData.currentPage)).toEqual([0, 1]);
  });
});
