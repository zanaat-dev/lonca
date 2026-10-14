/**
 * Misc types for Trendyol's smaller surfaces — invoices, finance,
 * common labels, test orders, and location lookups. Most shapes are
 * loosely typed (`Record<string, unknown>`) because the Trendyol response
 * shapes here are wide and seldom-evolved; callers drill into `raw` for
 * fields beyond the stable surface.
 */
import type { CursorPaginationParams, MutationResult } from '@lonca/core';

// ─── Invoices ─────────────────────────────────────────────────────────────

export interface UploadInvoiceFileInput {
  /** Trendyol shipment package ID (required). */
  shipmentPackageId: number;
  /** Invoice file (PDF / JPEG / PNG, max 10 MB). */
  file: Blob;
  /** ms-epoch — mandatory for micro-export orders, optional otherwise. */
  invoiceDateTime?: number;
  /**
   * Invoice number — mandatory for micro-export orders. Format:
   * `[A-Za-z0-9]{3}(20[2-9][0-9])\d{9}`.
   */
  invoiceNumber?: string;
}

export interface SendInvoiceLinkInput {
  invoiceLink: string;
  shipmentPackageId: number;
  /** ms-epoch. */
  invoiceDateTime?: number;
  /**
   * e-Archive / e-Invoice number: 3 letters or digits, the year, 9 digits
   * (`LON2026000000001`). Any other shape is refused with 400 "Fatura numarası
   * hatalıdır" (stage, 2026-10-14).
   */
  invoiceNumber?: string;
}

export interface DeleteInvoiceLinkInput {
  serviceSourceId?: number;
  channelId?: number;
  customerId?: number;
  /** Forward-compatible: pass any extra fields Trendyol may add. */
  [key: string]: unknown;
}

// ─── Finance ──────────────────────────────────────────────────────────────

/**
 * One row from Trendyol's current-account statement — returned by both
 * `finance.getSettlements()` and `finance.getOtherFinancials()` (both
 * endpoints share the `FinancialTransaction` wire schema).
 *
 * Field set verified against the spec on 2026-05-25. The SDK exposes the
 * stable subset; anything Trendyol adds later remains accessible via `raw`.
 */
export interface FinancialTransaction {
  /** Transaction ID (string per Trendyol). */
  id: string;
  /** ISO 8601 UTC (from ms-epoch `transactionDate`). */
  transactionDate?: string;
  /** Product barcode when the transaction is tied to a SKU. */
  barcode?: string | null;
  /** Transaction category (e.g. `'Satış'`, `'Ödeme'`). */
  transactionType?: string;
  /** Receipt ID ("dekont no") when applicable. */
  receiptId?: number | null;
  description?: string | null;

  /** Debit amount on the seller's account. */
  debt?: number;
  /** Credit amount on the seller's account. */
  credit?: number;

  paymentPeriod?: number | null;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  commissionInvoiceSerialNumber?: string | null;
  /** Net seller revenue after Trendyol's cut. */
  sellerRevenue?: number | null;

  orderNumber?: string | null;
  paymentOrderId?: number | null;
  /** ISO 8601 UTC (from ms-epoch `paymentDate`). */
  paymentDate?: string;

  sellerId?: number;
  storeId?: number | null;
  storeName?: string | null;
  storeAddress?: string | null;
  country?: string | null;

  /** Untouched raw row — pull any undocumented fields from here. */
  raw: Record<string, unknown>;
}

/**
 * Aliases preserved for source-compatibility with `0.5.0`. Both legacy
 * names now resolve to the unified `FinancialTransaction`.
 *
 * @deprecated since `0.5.1` — use `FinancialTransaction`.
 */
export type SettlementRow = FinancialTransaction;
/** @deprecated since `0.5.1` — use `FinancialTransaction`. */
export type OtherFinancialRow = FinancialTransaction;

/**
 * Shared filter shape for both finance endpoints.
 * `transactionType` lets you scope to one settlement category.
 */
export interface ListFinanceParams extends CursorPaginationParams {
  startDate?: Date;
  endDate?: Date;
  /**
   * **Required** by Trendyol's CHE finance API (it returns 500 without one),
   * e.g. `'Sale'`, `'Return'`, `'Discount'`, `'DeductionInvoices'`. The SDK
   * throws a `ValidationError` if omitted.
   */
  transactionType?: string;
  /**
   * Page size. Trendyol's finance API only accepts **500 or 1000** — the SDK
   * clamps any value to the nearest of those (default 500).
   */
  limit?: number;
}

// ─── Common labels ────────────────────────────────────────────────────────

export interface CreateCommonLabelInput {
  /** Currently the only documented format Trendyol accepts. */
  format: 'ZPL' | (string & {});
  boxQuantity?: number;
  /** Volumetric height (height × width × depth / 3000 → desi). */
  volumetricHeight?: number;
}

/** One label entry inside a `CommonLabel` response. */
export interface CommonLabelEntry {
  /** Encoded label payload (e.g. ZPL string `^XA...^XZ`). */
  label: string;
  format: 'ZPL' | (string & {});
}

/**
 * Response from `labels.getCommon()` — Trendyol's wire shape is
 * `{ data: [{ label, format }] }`. SDK surfaces the array directly via
 * `labels` for ergonomic access; `raw` is the untouched response.
 */
export interface CommonLabel {
  labels: CommonLabelEntry[];
  raw: Record<string, unknown>;
}

// ─── Test orders (STAGE-only utility) ─────────────────────────────────────

/**
 * Payload for `testOrders.create()`. Top-level requireds are
 * `customer`, `invoiceAddress`, `lines`, `seller`, `shippingAddress`;
 * each sub-object has its own field rules (see Trendyol's
 * `createTestOrder` reference). Kept loose because the inner schema is
 * deep and used only in STAGE.
 */
export interface CreateTestOrderInput {
  customer: Record<string, unknown>;
  invoiceAddress: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  seller: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Result of `testOrders.create()`. Trendyol's `createTestOrder` reference
 * documents the response as `{ orderNumber: string }`; `raw` keeps the
 * untouched body.
 */
export interface CreateTestOrderResult extends MutationResult {
  /** Order number of the created test order (absent when the body had none). */
  orderNumber?: string;
}

/**
 * Optional body for `testOrders.setClaimsWaitingInAction()`. Trendyol's
 * `updateTestOrderStatus` doc shows `{ shipmentPackageId }` — the
 * `orderShipmentPackageId` returned by `claims.list`.
 */
export interface SetClaimsWaitingInActionInput {
  shipmentPackageId: string | number;
}

/** One order line targeted by `testOrders.updateStatus()`. */
export interface TestOrderStatusLine {
  /** Line id from the test order (doc example: `4944785`). */
  lineId: string | number;
  /** Quantity of the line to move. */
  quantity: number;
  [key: string]: unknown;
}

/**
 * Optional extras for `testOrders.updateStatus()`. Trendyol's
 * `status-updates-on-test-orders` doc shows a `{ lines, params, status }`
 * body; omitted, the SDK keeps sending `{ status }` alone as before.
 */
export interface UpdateTestOrderStatusOptions {
  /** Order lines to move to the target status. */
  lines?: TestOrderStatusLine[];
  /** Doc-level `params` object (the doc's example sends `{}`). */
  params?: Record<string, unknown>;
}

export type TestOrderStatus =
  | 'Created'
  | 'Picking'
  | 'Invoiced'
  | 'Shipped'
  | 'AtCollectionPoint'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned'
  | 'UnDelivered'
  | (string & {});

// ─── Locations ────────────────────────────────────────────────────────────

export interface Country {
  /** ISO country code (e.g. `'TR'`, `'AZ'`). */
  code: string;
  name?: string;
  raw: Record<string, unknown>;
}

export interface City {
  /**
   * Trendyol's internal city id — the value the **nested** endpoints expect
   * (`getTurkeyDistricts(city.id)`). Distinct from `code` (the plate-style
   * display code, e.g. `"1"` for Adana); passing `code` there returns 500.
   */
  id?: string;
  code: string;
  name?: string;
  /**
   * The country the city belongs to — the country code of the lookup that returned it
   * (`'TR'` for `getTurkeyCities`, `'AZ'` for `getAzerbaijanCities`, the argument of
   * `getCitiesByCountry`). Trendyol's city rows carry no country field (neither the docs nor
   * the prod wire), so the SDK fills it from the request; earlier versions read a wire field
   * that never arrives and always left it `undefined`.
   */
  countryCode?: string;
  raw: Record<string, unknown>;
}

export interface District {
  /** Trendyol's internal district id — pass to `getTurkeyNeighborhoods(cityId, district.id)`. */
  id?: string;
  /** Trendyol's district code (the prod wire's `code`; falls back to the id when a row has none). */
  code: string;
  name?: string;
  /**
   * @deprecated Trendyol's district rows carry no city reference — neither the docs nor the prod
   * wire (2026-10-10) have one — so this is always `undefined`. Keep the city you passed to
   * `getTurkeyDistricts` / `getAzerbaijanDistricts` / `getDistrictsByCity` instead.
   */
  cityCode?: string;
  raw: Record<string, unknown>;
}

export interface Neighborhood {
  /** Trendyol's internal neighborhood id. */
  id?: string;
  /**
   * @deprecated Trendyol's neighborhood rows have no code (prod wire 2026-10-10: `id`, `name`,
   * `postCode`; the docs list `id` and `name`), so this is always the same value as `id` (`''`
   * when the row has no id). Use `id`.
   */
  code: string;
  name?: string;
  /** The neighborhood's postal code (prod wire `postCode`; not in Trendyol's docs). */
  postCode?: string;
  /**
   * @deprecated Trendyol's neighborhood rows carry no district reference — neither the docs nor
   * the prod wire (2026-10-10) have one — so this is always `undefined`. Keep the district you
   * passed to `getTurkeyNeighborhoods` instead.
   */
  districtCode?: string;
  raw: Record<string, unknown>;
}
