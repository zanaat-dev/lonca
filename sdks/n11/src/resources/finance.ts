import type { CursorPage, CursorPaginationParams } from '@lonca/core';
import type { N11Transport } from '../transport.js';
import { asArray, asObject, type XmlNode, type XmlObject } from '../soap/xml.js';
import { assign, isoDay, money, nextPage, num, pageCursor, paging, text } from '../soap/values.js';
import type {
  ListN11SettlementsParams,
  N11Deferment,
  N11DefermentUsage,
  N11Settlement,
  N11SettlementDetail,
  N11SettlementLine,
  N11SettlementSummary,
  N11ShipmentDeferment,
} from '../types/finance.js';

const SERVICE = 'settlementService';
/** n11 caps `pageSize` at 100 (a larger value is answered with 100). */
const MAX_PAGE_SIZE = 100;

function pageSize(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

function normalizeSettlement(node: XmlNode): N11Settlement {
  const s = asObject(node);
  return assign<N11Settlement>(
    {
      settlementDate: text(s.settlementDate) ?? '',
      status: text(s.status) ?? '',
      raw: s as Record<string, unknown>,
    },
    {
      remittanceDate: text(s.remittanceDate),
      paymentAmount: money(s.paymentAmount),
      deductionAmount: money(s.deductionAmount),
      settlementAmount: money(s.settlementAmount),
    },
  );
}

function normalizeSummary(node: XmlNode | undefined): N11SettlementSummary {
  const s = asObject(node);
  return assign<N11SettlementSummary>(
    {},
    {
      salesAmount: money(s.salesAmount),
      sellerWithdraw: money(s.sellerWithdraw),
      releaseDeferment: money(s.releaseDeferment),
      deductionAmount: money(s.deductionAmount),
      defermentOfPayment: money(s.defermentOfPayment),
      paymentToECash: money(s.paymentToECash),
      remittance: money(s.remittance),
    },
  );
}

function normalizeLine(node: XmlNode): N11SettlementLine {
  const l = asObject(node);
  return assign<N11SettlementLine>(
    { lineId: text(l.orderItemId) ?? '', raw: l as Record<string, unknown> },
    {
      orderNumber: text(l.orderNumber),
      productId: text(l.productId),
      productName: text(l.productName),
      buyerName: text(l.buyerName),
      buyerEmail: text(l.buyerEmail),
      trackingNumber: text(l.trackingNumber),
      paymentAmount: money(l.paymentAmount),
      deductionAmount: money(l.deductionAmount),
      settlementAmount: money(l.settlementAmount),
      sellerDiscount: money(l.sellerDiscount),
      sellerCouponDiscount: money(l.sellerCouponDiscount),
      commissionRate: num(l.commission),
      adFee: money(l.adFee),
      adFeeVat: money(l.adFeeVat),
      serviceFee: money(l.serviceFee),
      serviceFeeVat: money(l.serviceFeeVat),
      cargoPrice: money(l.cargoPrice),
      defermentOfPayment: money(l.defermentOfPayment),
      taxDeduction: money(l.taxDeduction),
      taxDeductionRate: num(l.taxDeductionRate),
      paymentDate: text(l.paymentDate),
      shippingDate: text(l.shippingDate),
      completedDate: text(l.completedDate),
      settlementDate: text(l.settlementDate),
      remittanceDate: text(l.remittanceDate),
    },
  );
}

function normalizeDeferment(node: XmlNode): N11Deferment {
  const d = asObject(node);
  return assign<N11Deferment>(
    {},
    {
      deferredDate: text(d.deferredDate),
      amount: money(d.amount),
      reason: text(d.defermentReasonDetail),
    },
  );
}

function normalizeShipmentDeferment(node: XmlNode): N11ShipmentDeferment {
  const d = asObject(node);
  return assign<N11ShipmentDeferment>(
    {},
    {
      orderNumber: text(d.orderNumber),
      campaignNumber: text(d.campaignNumber),
      createdDate: text(d.createdDate),
      cargoWeight: num(d.cargoWeightFromShipmentCompany),
      amount: money(d.deferredAmount),
      shipmentCompanyName: text(d.shipmentCompanyName),
    },
  );
}

function normalizeUsage(node: XmlNode): N11DefermentUsage {
  const u = asObject(node);
  return assign<N11DefermentUsage>(
    {},
    {
      orderNumber: text(u.orderNumber),
      orderDate: text(u.orderDate),
      productId: text(u.productId),
      productTitle: text(u.productTitle),
      amount: money(u.amount),
    },
  );
}

/** Rows of a wrapped list (`<wrapper><item/>…</wrapper>`). */
function rows(parent: XmlObject, wrapper: string, item: string): XmlNode[] {
  return asArray(asObject(parent[wrapper])[item]);
}

/**
 * Settlements (SOAP `SettlementService`): what n11 pays out per day and the
 * order lines, fees and deferments behind it.
 *
 * Source: `api.n11.com/ws/SettlementService.wsdl` and the 2020 SOAP manual;
 * the new portal has no page for it, and n11 (2026-10-13) says finance stays
 * on SOAP. Verified on n11's test store on 2026-10-16. Live responses follow
 * the WSDL's list wrappers (`orderItemSettlements.orderItemSettlement`), not
 * the manual's examples, and add `taxDeduction` / `taxDeductionRate` per line.
 */
export class FinanceResource {
  constructor(private readonly transport: N11Transport) {}

  /**
   * Settlement days in a window (`GetSettlementList`). n11 pages by `limit`
   * (at most 100, the default). A day can appear more than once with
   * different statuses.
   */
  async listSettlements(params: ListN11SettlementsParams): Promise<CursorPage<N11Settlement>> {
    const current = pageCursor(params.cursor, 'settlements');
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetSettlementList',
      fields: {
        startDate: isoDay(params.startDate),
        endDate: isoDay(params.endDate),
        pagingData: { currentPage: current, pageSize: pageSize(params.limit) },
      },
    });
    const data = asObject(response.settlementListData);
    const list = asArray(data.settlementList);
    const result: CursorPage<N11Settlement> = { items: list.map(normalizeSettlement) };
    const next = nextPage(current, list.length, paging(data.metadata));
    if (next !== undefined) result.nextCursor = next;
    return result;
  }

  /**
   * One settlement day (`GetSettlementDetail`): its totals, the order lines
   * (paged by `limit`, at most 100) and the deferments. A day without a
   * settlement answers with zero totals and no lines.
   *
   * @param date The settlement day: a `Date` (sent as its Turkish calendar
   *   day) or a `YYYY-MM-DD` string, e.g. `settlementDate` from
   *   {@link listSettlements}.
   */
  async getSettlementDetail(
    date: Date | string,
    params: CursorPaginationParams = {},
  ): Promise<N11SettlementDetail> {
    const current = pageCursor(params.cursor, 'settlement lines');
    const day = isoDay(date);
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetSettlementDetail',
      fields: {
        date: day,
        pagingData: { currentPage: current, pageSize: pageSize(params.limit) },
      },
    });
    const detail = asObject(response.settlementDetail);
    const lineData = asObject(detail.orderItemSettlementDataList);
    const lines = rows(lineData, 'orderItemSettlements', 'orderItemSettlement');
    const deferred = asObject(detail.defermentSettlementUsageDataList);
    const result = assign<N11SettlementDetail>(
      {
        date: day,
        summary: normalizeSummary(detail.settlement),
        items: lines.map(normalizeLine),
        deferments: rows(deferred, 'deferments', 'deferment').map(normalizeDeferment),
        shipmentDeferments: rows(deferred, 'defermentSppUsages', 'defermentSppUsage').map(
          normalizeShipmentDeferment,
        ),
        defermentUsages: rows(
          deferred,
          'defermentSettlementUsages',
          'defermentSettlementUsage',
        ).map(normalizeUsage),
        raw: detail as Record<string, unknown>,
      },
      {
        totalDeferment: money(deferred.financialTotalDeferment),
        totalReturnDeferment: money(deferred.totalReturnDefermentAmount),
      },
    );
    const next = nextPage(current, lines.length, paging(lineData.metadata));
    if (next !== undefined) result.nextCursor = next;
    return result;
  }
}
