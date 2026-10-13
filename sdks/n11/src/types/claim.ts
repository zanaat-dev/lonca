import type { CursorPaginationParams, Money } from '@lonca/core';

/** Return-claim status. n11 lists `REQUESTED` when none (or an unknown one) is sent. */
export type N11ReturnStatus =
  | 'REQUESTED'
  | 'APPROVAL_WAITING'
  | 'CANCELLED'
  | 'DENIED'
  | 'PENDING'
  | 'PENDED'
  | 'APPROVED'
  | 'MANUAL_REFUND'
  | 'ALL'
  | (string & {});

/** Cancel-claim status. */
export type N11CancelStatus =
  | 'REQUESTED'
  | 'RETRACTED'
  | 'COMPLETED'
  | 'DENIED'
  | 'REJECT'
  | 'MANUAL_REFUND'
  | 'ALL'
  | (string & {});

/** Who performed the last action on a claim. */
export type N11ClaimExecuter =
  'BUYER' | 'SELLER' | 'OPERATOR' | 'SYSTEM' | 'SHIPMENT' | (string & {});

/** What `searchQuery` matches against. */
export type N11ClaimSearchType =
  'BUYEREMAIL' | 'RECIPIENTS' | 'BUYERNAME' | 'ORDERID' | 'PRODUCTID' | (string & {});

interface ClaimSearchParams extends CursorPaginationParams {
  executer?: N11ClaimExecuter;
  /** Required when `searchQuery` is set. */
  searchInfoType?: N11ClaimSearchType;
  searchQuery?: string;
  /** Window start; a `Date` is sent as its Turkish calendar day (`DD/MM/YYYY`). */
  startDate?: Date | string;
  endDate?: Date | string;
}

/** Filters for {@link ClaimsResource.listReturns}. n11 pages returns 20 at a time. */
export interface ListN11ReturnsParams extends ClaimSearchParams {
  status?: N11ReturnStatus;
  /** `SELLER` (default server-side), `N11` (n11depom) or `ALL`. */
  sender?: 'SELLER' | 'N11' | 'ALL';
}

/** Filters for {@link ClaimsResource.listCancels}. */
export interface ListN11CancelsParams extends ClaimSearchParams {
  status?: N11CancelStatus;
  /** Which date the window applies to (`searchDate.searchDateType`). */
  searchDateType?: string;
}

/** One return claim (`claimReturnList.claimReturn`). Dates are `DD/MM/YYYY` strings. */
export interface N11ReturnClaim {
  id: string;
  status: N11ReturnStatus;
  executer?: N11ClaimExecuter;
  sender?: string;
  reasonType?: string;
  reasonDescription?: string;
  orderNumber?: string;
  shipmentMethod?: string;
  bundleName?: string;
  sellerCampaignNumber?: string;
  campaignNumber?: string;
  requestDate?: string;
  pendingRequestDate?: string;
  pendedDate?: string;
  cancelledDate?: string;
  deniedDate?: string;
  approvedDate?: string;
  paymentDate?: string;
  sellerShipmentCompany?: string;
  sellerTrackingNumber?: string;
  shipmentCompany?: string;
  trackingNumber?: string;
  deliveryFeeType?: string;
  productId?: string;
  skuId?: string;
  productName?: string;
  attributesNames?: string;
  quantity?: number;
  unitPrice?: Money;
  finalPrice?: Money;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  approvalRemainingTime?: string;
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}

/**
 * One cancel claim (`claimCancelList.claimCancel`). Dates are `DD/MM/YYYY` strings. The buyer,
 * payment-date, shipment-company and delivery-fee fields are not in the WSDL but are sent on prod.
 */
export interface N11CancelClaim {
  id: string;
  status: N11CancelStatus;
  executer?: N11ClaimExecuter;
  reasonType?: string;
  reasonDescription?: string;
  denyReasonType?: string;
  orderNumber?: string;
  shipmentMethod?: string;
  bundleName?: string;
  requestDate?: string;
  deniedDate?: string;
  completedDate?: string;
  paymentDate?: string;
  shipmentCompany?: string;
  deliveryFeeType?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  productId?: string;
  skuId?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: Money;
  finalPrice?: Money;
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}

/** An entry of a reason-type list (deny / pending reasons). */
export interface N11ReasonType {
  id: string;
  value: string;
}

/** Input for `claims.denyReturn` (`ClaimReturnDeny`). */
export interface DenyN11ReturnParams {
  claimReturnId: string | number;
  /** From `claims.getReturnDenyReasons()`. */
  denyReasonId: string | number;
  /** Explanation shown with the denial (required by n11). */
  note: string;
  /**
   * Leave unset when the reason is "Ürün Mağazaya Ulaşmadı". `CAMPAIGN`: n11
   * issues a campaign code for sending the item back. `CUSTOM`: you ship it
   * yourself and send `trackingNumber`.
   */
  returnShipmentType?: 'CAMPAIGN' | 'CUSTOM';
  shipmentCompanyId?: string | number;
  trackingNumber?: string;
  deliveryReceiptNumber?: string;
  /** Up to three evidence image URLs. */
  imageUrls?: readonly string[];
  videoUrl?: string;
  /** Deny part of the claimed quantity (WSDL field; not described in the docs). */
  splitQuantity?: number;
}

/** Input for `claims.postponeReturn` (`ClaimReturnPending`). */
export interface PostponeN11ReturnParams {
  claimReturnId: string | number;
  /** From `claims.getReturnPendingReasons()`. */
  pendingReasonId: string | number;
  /** How many days to postpone. */
  days: number;
  note: string;
}
