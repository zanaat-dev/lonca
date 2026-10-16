import type { CursorPage } from '@lonca/core';
import type { N11Transport } from '../transport.js';
import { asArray, asObject, type XmlNode, type XmlObject } from '../soap/xml.js';
import {
  assign,
  money,
  nextPage,
  num,
  pageCursor,
  paging,
  soapDate,
  text,
} from '../soap/values.js';
import type {
  DenyN11ReturnParams,
  ListN11CancelsParams,
  ListN11ReturnsParams,
  PostponeN11ReturnParams,
  N11CancelClaim,
  N11ReasonType,
  N11ReturnClaim,
} from '../types/claim.js';

const RETURN_SERVICE = 'returnService';
const CANCEL_SERVICE = 'claimCancelService';

function period(start: Date | string | undefined, end: Date | string | undefined) {
  if (start === undefined && end === undefined) return undefined;
  return { startDate: soapDate(start), endDate: soapDate(end) };
}

function normalizeReturn(node: XmlNode): N11ReturnClaim {
  const c = asObject(node);
  return assign<N11ReturnClaim>(
    {
      id: text(c.claimReturnId) ?? '',
      status: text(c.status) ?? '',
      raw: c as Record<string, unknown>,
    },
    {
      executer: text(c.executer),
      sender: text(c.sender),
      reasonType: text(c.returnReasonType),
      reasonDescription: text(c.returnReasonDescription),
      orderNumber: text(c.orderNumber),
      shipmentMethod: text(c.shipmentMethod),
      bundleName: text(c.bundleName),
      sellerCampaignNumber: text(c.sellerCampaignNumber),
      campaignNumber: text(c.campaignNumber),
      requestDate: text(c.requestDate),
      pendingRequestDate: text(c.pendingRequestDate),
      pendedDate: text(c.pendedDate),
      cancelledDate: text(c.cancelledDate),
      deniedDate: text(c.deniedDate),
      approvedDate: text(c.approvedDate),
      paymentDate: text(c.paymentDate),
      sellerShipmentCompany: text(c.sellerShipmentCompany),
      sellerTrackingNumber: text(c.sellerTrackingNumber),
      shipmentCompany: text(c.shipmentCompany),
      trackingNumber: text(c.trackingNumber),
      deliveryFeeType: text(c.deliveryFeeType),
      productId: text(c.productId),
      skuId: text(c.skuId),
      productName: text(c.productName),
      attributesNames: text(c.attributesNames),
      quantity: num(c.quantity),
      unitPrice: money(c.unitPrice),
      finalPrice: money(c.finalPrice),
      buyerName: text(c.buyerName),
      buyerEmail: text(c.buyerEmail),
      buyerPhone: text(c.buyerPhone),
      approvalRemainingTime: text(c.approvalRemainingTime),
    },
  );
}

function normalizeCancel(node: XmlNode): N11CancelClaim {
  const c = asObject(node);
  return assign<N11CancelClaim>(
    {
      id: text(c.claimCancelId) ?? '',
      status: text(c.status) ?? '',
      raw: c as Record<string, unknown>,
    },
    {
      executer: text(c.executer),
      reasonType: text(c.cancelReasonType),
      reasonDescription: text(c.cancelReasonDescription),
      denyReasonType: text(c.denyReasonType),
      orderNumber: text(c.orderNumber),
      paymentDate: text(c.paymentDate),
      shipmentCompany: text(c.shipmentCompany),
      deliveryFeeType: text(c.deliveryFeeType),
      buyerName: text(c.buyerName),
      buyerEmail: text(c.buyerEmail),
      buyerPhone: text(c.buyerPhone),
      shipmentMethod: text(c.shipmentMethod),
      bundleName: text(c.bundleName),
      requestDate: text(c.requestDate),
      deniedDate: text(c.deniedDate),
      completedDate: text(c.completedDate),
      productId: text(c.productId),
      skuId: text(c.skuId),
      productName: text(c.productName),
      quantity: num(c.quantity),
      unitPrice: money(c.unitPrice),
      finalPrice: money(c.finalPrice),
    },
  );
}

/**
 * Read a reason-type list. The WSDL wraps each entry (`<list><item>…</item></list>`),
 * but prod repeats the list element itself, one per reason
 * (`<list><id/><value/></list><list>…`; observed 2026-10-10). Both are accepted.
 */
function reasons(list: XmlNode | undefined, item: string): N11ReasonType[] {
  return asArray(list)
    .flatMap((node) => {
      const wrapped = asObject(node)[item];
      return wrapped === undefined ? [node] : asArray(wrapped);
    })
    .map((node) => {
      const r = asObject(node);
      return { id: text(r.id) ?? '', value: text(r.value) ?? '' };
    });
}

function page<T>(
  response: XmlObject,
  rows: XmlNode[],
  current: number,
  map: (n: XmlNode) => T,
): CursorPage<T> {
  const result: CursorPage<T> = { items: rows.map(map) };
  const next = nextPage(current, rows.length, paging(response.pagingData));
  if (next !== undefined) result.nextCursor = next;
  return result;
}

/**
 * Return and cancel claims (SOAP `ReturnService` / `ClaimCancelService`).
 *
 * Source: developer.n11.com → "İade Talepleri Servisi" / "Parçalı İptal
 * Talebi" and the two WSDLs. The lists and reason types were verified against
 * prod on 2026-10-10 (list dates are `DD/MM/YYYY` strings). n11 fixes the page
 * size (20 per page); `limit` is ignored.
 *
 * The return writes (`approveReturn`, `denyReturn`, `postponeReturn`) use the
 * WSDL's element names; on n11's test store (2026-10-13) a claim that is
 * already approved answered each with an "uygun durumda değildir" failure
 * (`ValidationError`), which confirms the request shape, but no claim in a
 * writable state was available to see a success. Partial cancel is
 * `orders.cancelItem`.
 */
export class ClaimsResource {
  constructor(private readonly transport: N11Transport) {}

  /**
   * Return claims (`ClaimReturnList`). n11 lists `REQUESTED` claims when no
   * status is given, but only those whose return shipment has reached the
   * seller: a claim still on its way back reads `REQUESTED` yet shows up under
   * `status: 'ALL'` only (test store, 2026-10-16). The seller can decide on a
   * claim only once it is listed under `REQUESTED`.
   */
  async listReturns(params: ListN11ReturnsParams = {}): Promise<CursorPage<N11ReturnClaim>> {
    const current = pageCursor(params.cursor, 'returns');
    const response = await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnList',
      fields: {
        searchData: {
          status: params.status,
          executer: params.executer,
          searchInfoType: params.searchInfoType,
          searchQuery: params.searchQuery,
          period: period(params.startDate, params.endDate),
          sender: params.sender,
        },
        pagingData: { currentPage: current },
      },
    });
    const rows = asArray(asObject(response.claimReturnList).claimReturn);
    return page(response, rows, current, normalizeReturn);
  }

  /**
   * Cancel claims (`ClaimCancelList`). Buyer cancel requests were retired long
   * ago, says n11 (2026-10-13), and of the cancel-claim service only the
   * partial cancel (`ClaimCancelPartial`) is still active, so this list may
   * hold old claims only. It still answers on prod (2026-10-10).
   */
  async listCancels(params: ListN11CancelsParams = {}): Promise<CursorPage<N11CancelClaim>> {
    const current = pageCursor(params.cursor, 'cancels');
    const window = period(params.startDate, params.endDate);
    const response = await this.transport.soap({
      service: CANCEL_SERVICE,
      operation: 'ClaimCancelList',
      fields: {
        searchData: {
          status: params.status,
          executer: params.executer,
          searchInfoType: params.searchInfoType,
          searchQuery: params.searchQuery,
          searchDate:
            window || params.searchDateType
              ? { searchDateType: params.searchDateType, period: window }
              : undefined,
        },
        pagingData: { currentPage: current },
      },
    });
    const rows = asArray(asObject(response.claimCancelList).claimCancel);
    return page(response, rows, current, normalizeCancel);
  }

  /** Reasons a seller may give when denying a return (`ClaimReturnDenyReasonTypes`). */
  async getReturnDenyReasons(): Promise<N11ReasonType[]> {
    const response = await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnDenyReasonTypes',
    });
    return reasons(response.denyReasonTypeDataList, 'denyReasonTypeData');
  }

  /** Reasons a seller may give when postponing a return (`ClaimReturnPendingReasonTypes`). */
  async getReturnPendingReasons(): Promise<N11ReasonType[]> {
    const response = await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnPendingReasonTypes',
    });
    return reasons(response.pendingReasonTypeDataList, 'pendingReasonTypeData');
  }

  /**
   * Approve a return (`ClaimReturnApprove`). `splitQuantity` (a WSDL field the
   * docs do not describe) approves part of the claimed quantity.
   */
  async approveReturn(
    claimReturnId: string | number,
    opts: { splitQuantity?: number } = {},
  ): Promise<void> {
    await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnApprove',
      fields: { claimReturnId: String(claimReturnId), splitQuantity: opts.splitQuantity },
      idempotent: false,
    });
  }

  /**
   * Deny a return (`ClaimReturnDeny`). `denyReasonId` comes from
   * {@link getReturnDenyReasons}. n11's rules for the shipment fields: leave
   * `returnShipmentType` empty when the reason is "Ürün Mağazaya Ulaşmadı";
   * otherwise `CAMPAIGN` (leave carrier, tracking and receipt empty; n11
   * issues a campaign code) or `CUSTOM` (send `trackingNumber` once the item
   * is shipped back).
   *
   * "Leave empty" means an empty element: the shipment fields are always sent,
   * empty when unset, as in n11's example. Without them n11 answered a
   * `CAMPAIGN` denial with "trackingNumber alanı geçersizdir" (test store,
   * 2026-10-16). A denial opens a deny request and the claim stays
   * `REQUESTED` while n11 operations review it; its `sellerCampaignNumber` is
   * then the code for sending the item back to the buyer.
   */
  async denyReturn(params: DenyN11ReturnParams): Promise<void> {
    await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnDeny',
      fields: {
        claimReturnId: String(params.claimReturnId),
        denyReasonId: String(params.denyReasonId),
        denyReasonNote: params.note,
        returnShipmentType: params.returnShipmentType ?? '',
        shipmentCompanyId:
          params.shipmentCompanyId === undefined ? '' : String(params.shipmentCompanyId),
        trackingNumber: params.trackingNumber ?? '',
        deliveryReceiptNumber: params.deliveryReceiptNumber ?? '',
        imageFirstUrl: params.imageUrls?.[0],
        imageSecondUrl: params.imageUrls?.[1],
        imageThirdUrl: params.imageUrls?.[2],
        videoUrl: params.videoUrl,
        splitQuantity: params.splitQuantity,
      },
      idempotent: false,
    });
  }

  /**
   * Postpone a return decision (`ClaimReturnPending`). `pendingReasonId` comes
   * from {@link getReturnPendingReasons}.
   */
  async postponeReturn(params: PostponeN11ReturnParams): Promise<void> {
    await this.transport.soap({
      service: RETURN_SERVICE,
      operation: 'ClaimReturnPending',
      fields: {
        claimReturnId: String(params.claimReturnId),
        pendingReasonId: String(params.pendingReasonId),
        pendingDayCount: params.days,
        pendingReasonNote: params.note,
      },
      idempotent: false,
    });
  }

  /** Reasons a seller may give when denying a cancel claim (`ClaimCancelDenyReasonType`). */
  async getCancelDenyReasons(): Promise<N11ReasonType[]> {
    const response = await this.transport.soap({
      service: CANCEL_SERVICE,
      operation: 'ClaimCancelDenyReasonType',
    });
    return reasons(response.denyReasonTypeDataList, 'denyReasonTypeData');
  }
}
