import type { CursorPage, CursorPaginationParams, Money } from '@lonca/core';

/**
 * Settlement status. Seen on n11's test store: `Success`, `Failed`; the 2020
 * SOAP manual also shows `Confirmed` and `Wait_Remittance`.
 */
export type N11SettlementStatus =
  'Success' | 'Failed' | 'Confirmed' | 'Wait_Remittance' | (string & {});

/** Filters for {@link FinanceResource.listSettlements}. */
export interface ListN11SettlementsParams extends CursorPaginationParams {
  /**
   * Window start, by settlement day — **required** by n11. A `Date` is sent as
   * its Turkish calendar day (`YYYY-MM-DD`); a string is sent as given and
   * must be `YYYY-MM-DD` (`DD/MM/YYYY` fails with `SELLER_API.invalidDate`).
   */
  startDate: Date | string;
  /** Window end — **required** by n11. A start after the end gives an empty page. */
  endDate: Date | string;
}

/** One row of `GetSettlementList`: a settlement day's totals. Dates are `YYYY-MM-DD`. */
export interface N11Settlement {
  /** The settlement day; pass it to `finance.getSettlementDetail`. */
  settlementDate: string;
  status: N11SettlementStatus;
  /** Day the money is (or was) sent to the seller's bank (`remittanceDate`). */
  remittanceDate?: string;
  /** Sales paid by buyers (`paymentAmount`). */
  paymentAmount?: Money;
  /** Everything n11 kept: commission, fees, discounts and deferments (`deductionAmount`). */
  deductionAmount?: Money;
  /** What the seller receives (`settlementAmount`). */
  settlementAmount?: Money;
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}

/** `settlementDetail.settlement`: the day's totals. */
export interface N11SettlementSummary {
  salesAmount?: Money;
  sellerWithdraw?: Money;
  releaseDeferment?: Money;
  deductionAmount?: Money;
  defermentOfPayment?: Money;
  /** Paid into the seller's n11 e-wallet (`paymentToECash`). */
  paymentToECash?: Money;
  /** Sent to the seller's bank (`remittance`). */
  remittance?: Money;
}

/**
 * One order line of a settlement day (`orderItemSettlement`). Amounts are in
 * Turkish lira. On the test store, `settlementAmount` = `paymentAmount` −
 * `deductionAmount` − `defermentOfPayment`, and `deductionAmount` included
 * the `sellerDiscount`.
 */
export interface N11SettlementLine {
  /** Order line id (`orderItemId`), the `lineId` of `orders.list`. */
  lineId: string;
  orderNumber?: string;
  productId?: string;
  productName?: string;
  buyerName?: string;
  buyerEmail?: string;
  /** Cargo tracking number; missing on some lines. */
  trackingNumber?: string;
  paymentAmount?: Money;
  deductionAmount?: Money;
  settlementAmount?: Money;
  sellerDiscount?: Money;
  sellerCouponDiscount?: Money;
  /**
   * Commission **rate** in percent (`commission`). The test store sent the
   * same value (12.2) on a 649.90 TL and a 5,000 TL line.
   */
  commissionRate?: number;
  adFee?: Money;
  adFeeVat?: Money;
  serviceFee?: Money;
  serviceFeeVat?: Money;
  cargoPrice?: Money;
  defermentOfPayment?: Money;
  /**
   * `taxDeduction`, not in the WSDL or the docs. On the test store it was
   * the VAT contained in `paymentAmount` − `sellerDiscount` at
   * `taxDeductionRate` (100 TL at 20 % → 16.67).
   */
  taxDeduction?: Money;
  /** `taxDeductionRate` in percent (20, 10 and 0 seen); not in the WSDL. */
  taxDeductionRate?: number;
  paymentDate?: string;
  shippingDate?: string;
  completedDate?: string;
  settlementDate?: string;
  remittanceDate?: string;
  /** Untouched parsed element. */
  raw: Record<string, unknown>;
}

/** A deduction deferred to this day (`deferments.deferment`). */
export interface N11Deferment {
  /** `DD.MM.YYYY HH:mm` (`deferredDate`). */
  deferredDate?: string;
  amount?: Money;
  /** n11's free-text reason, e.g. an early-payment fee or a return. */
  reason?: string;
}

/** A shipping cost deferred to this day (`defermentSppUsages.defermentSppUsage`). */
export interface N11ShipmentDeferment {
  orderNumber?: string;
  campaignNumber?: string;
  /** `DD.MM.YYYY HH:mm`. */
  createdDate?: string;
  /** Weight (desi) the cargo company reported (`cargoWeightFromShipmentCompany`). */
  cargoWeight?: number;
  amount?: Money;
  shipmentCompanyName?: string;
}

/** A deferment used against an order (`defermentSettlementUsages.defermentSettlementUsage`). */
export interface N11DefermentUsage {
  orderNumber?: string;
  orderDate?: string;
  productId?: string;
  productTitle?: string;
  amount?: Money;
}

/**
 * `GetSettlementDetail` for one day. `items` and `nextCursor` page through the
 * order lines; the other fields are the same on every page.
 */
export interface N11SettlementDetail extends CursorPage<N11SettlementLine> {
  /** The day that was asked for, as sent. */
  date: string;
  summary: N11SettlementSummary;
  /** `financialTotalDeferment`. */
  totalDeferment?: Money;
  /** `totalReturnDefermentAmount`. */
  totalReturnDeferment?: Money;
  deferments: N11Deferment[];
  shipmentDeferments: N11ShipmentDeferment[];
  defermentUsages: N11DefermentUsage[];
  /** Untouched parsed `settlementDetail` element. */
  raw: Record<string, unknown>;
}
