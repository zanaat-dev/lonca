/**
 * Hepsiburada OMS (Order Management) types.
 *
 * Source: `siparis-olusturma-entegrasyonu` v1.0 (developers.hepsiburada.com)
 * + discovery-first against `oms-external-sit.hepsiburada.com` (2026-05).
 *
 * - Most list endpoints return `{ totalCount, limit, offset, pageCount, items }` —
 *   the shared `OffsetPage<T>` shape from `@lonca/core`.
 * - The unfiltered `/packages` list returns a **raw array** (no envelope).
 * - Action endpoints (deliver, intransit, undeliver, cancel, etc.) accept
 *   loose `Record<string, unknown>` bodies — Hepsiburada's portal docs the
 *   exact field set per endpoint; the SDK passes payloads through unchanged.
 *   They answer with a bare string (`200`) or no body (`204`), so they resolve
 *   to `MutationResult` (`{ raw }`) — except `createPackages`, whose
 *   documented `201` body is surfaced as `PackageReceipt`.
 */

import type { OffsetPage } from '@lonca/core';

/**
 * Wrapper for the orders / packages list endpoints. Equivalent to
 * `OffsetPage<T>` from `@lonca/core` — kept as a named export for
 * back-compat and discoverability.
 *
 * @deprecated Prefer importing `OffsetPage` from `@lonca/core` directly.
 *   This alias will stay exported for the lifetime of the `0.x` line.
 */
export type OrdersPage<T = Order> = OffsetPage<T>;

/** Query parameters shared across all list endpoints. */
export interface ListOrdersParams {
  /** Zero-based offset. Default: 0. */
  offset?: number;
  /**
   * Page size. The order lists (`list`, `listCancelled`, …) default to 100,
   * Hepsiburada's maximum there; the package lists send no default.
   */
  limit?: number;
  /**
   * Filter by status (open enum: `Open`, `Shipped`, `Delivered`, `Cancelled`, …).
   * Used only by `list()`; status-specific helpers (e.g. `listCancelled`) bake the
   * status into the path instead.
   */
  status?: string;
  /**
   * Window start as `yyyy-MM-dd HH:mm`, e.g. `'2026-10-14 00:00'` (sent as
   * `begindate`). Other formats (`yyyy-MM-dd`, ISO 8601, with seconds) are not
   * an error: the list just comes back empty (SIT, 2026-10-14).
   */
  beginDate?: string;
  /** Window end as `yyyy-MM-dd HH:mm` (sent as `enddate`); see `beginDate`. */
  endDate?: string;
}

/** Query parameters for `orders.listPackages()` and the status-specific helpers. */
export type ListPackagesParams = ListOrdersParams;

/**
 * A price on an order line, exactly as `oms-external` sends it: a major-unit
 * decimal (`amount`, e.g. `149.9` lira) plus an ISO 4217 code (`currency`).
 * Not converted to `@lonca/core` `Money` (integer minor units) — use
 * `moneyFromMajor(amount, currency)` for that.
 */
export interface OrderPrice {
  /** Major-unit decimal amount. */
  amount?: number;
  /** ISO 4217 currency code (e.g. `'TRY'`). */
  currency?: string;
}

/**
 * One order row.
 *
 * `orders.list()` rows are **order lines** (`items[]` of
 * `GET /orders/merchantid/{merchantId}`: one row per line item, so an order
 * with two lines appears twice with the same `orderNumber`). The line fields
 * below mirror that object (spec `oms-external.json`, confirmed on the prod
 * wire 2026-10). `orders.getByOrderNumber()` maps the order-detail root onto
 * the same type; it carries `orderNumber`, `orderId`, `orderDate`,
 * `createdDate` and a nested `customer`, the line fields stay on `raw.items`.
 * Every field is optional and only set when the wire value has the documented
 * JSON type.
 */
export interface Order {
  orderNumber?: string;
  /** Hepsiburada order id (wire `orderId`). */
  orderId?: string;
  /** Order line (line item) id — the id the line-item actions take (wire `id`). */
  id?: string;
  /** Line status (`Open`, `Unpacked`, …). */
  status?: string;
  /**
   * Customer display name, surfaced from the raw row's candidate fields
   * (`customerName`, `customer.name`, `customer.firstName/lastName`,
   * `recipientName`). `null` when Hepsiburada omits all of them — so callers
   * stop guessing from `raw`.
   */
  customerName?: string | null;
  /** Hepsiburada customer id. */
  customerId?: string;
  /** ISO 8601 order date-time (wire `orderDate`). */
  orderDate?: string;
  /** ISO 8601 date-time of the line's last status change (wire `lastStatusUpdateDate`). */
  lastStatusUpdateDate?: string;
  /** ISO 8601 date-time by which the line must ship (wire `dueDate`). */
  dueDate?: string;
  /** Package number once the line is packed. */
  packageNumber?: string;
  /** Hepsiburada SKU. */
  sku?: string;
  /** Merchant SKU (wire `merchantSKU`, upper-case `SKU`). */
  merchantSku?: string;
  /** Product barcode. */
  barcode?: string;
  /** Product name of the line. */
  name?: string;
  /** Quantity on the line. */
  quantity?: number;
  /** Cargo company name. */
  cargoCompany?: string;
  /** Unit price. */
  unitPrice?: OrderPrice;
  /** Line total (`unitPrice × quantity` after discounts) — not the order total. */
  totalPrice?: OrderPrice;
  /** VAT amount. */
  vat?: number;
  /** VAT rate (percent). */
  vatRate?: number;
  /**
   * ISO 8601 creation date-time. Documented only on the order-detail root
   * (`orders.getByOrderNumber()`); `orders.list()` rows carry
   * {@link orderDate} instead and leave this unset.
   */
  createdDate?: string;
  /**
   * @deprecated Neither documented nor sent by Hepsiburada — never populated.
   *   Use {@link orderNumber}. Will be removed in the next major.
   */
  externalOrderNumber?: string;
  /**
   * @deprecated Neither documented nor sent by Hepsiburada — never populated.
   *   The nearest real field is {@link lastStatusUpdateDate} (the last status
   *   change, not any modification). Will be removed in the next major.
   */
  modifiedDate?: string;
  /**
   * @deprecated Neither documented nor sent by Hepsiburada — never populated.
   *   List rows are order lines: use {@link totalPrice} for the line total and
   *   sum the lines of one `orderNumber` for an order total. Will be removed
   *   in the next major.
   */
  total?: number | string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One shipping-package row. */
export interface ShippingPackage {
  packageNumber?: string;
  orderNumber?: string;
  status?: string;
  cargoCompany?: string;
  trackingNumber?: string;
  createdDate?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One available cargo company option returned by the changeable-cargo endpoints. */
export interface CargoCompanyOption {
  code?: string;
  name?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Package label (PDF / image URL or base64 payload). */
export interface PackageLabel {
  /** When Hepsiburada returns a downloadable URL. */
  url?: string;
  /** When Hepsiburada returns a base64-encoded inline payload. */
  base64?: string;
  /** Label format (PDF / ZPL / etc.) if surfaced. */
  format?: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * Receipt returned by `orders.createPackages()` — the spec's
 * `CreateDeliveryResponse` (`201`): the number of the package that was just
 * created and its cargo barcode. Both are optional on the wire; the untouched
 * body is on `raw`.
 */
export interface PackageReceipt {
  /** Number of the newly created package (`packageNumber`). */
  packageNumber?: string;
  /** Cargo barcode / delivery code of the new package. */
  barcode?: string;
  /** Untouched parsed response body. */
  raw: unknown;
}

/**
 * Body for `orders.createPackages()` — one or more line-item groups to pack.
 * Hepsiburada's portal docs the field set; the SDK accepts any object.
 */
/**
 * Body for `orders.createPackages()` — the spec's `CreatePackageRequest`.
 * The lines go in `lineItemRequests`; a `lineItems` list is not read
 * (Hepsiburada answers `400 "Line items empty or null"`, SIT 2026-10-14).
 */
export type CreatePackagesInput = {
  /** The order lines to pack, with the quantity of each. */
  lineItemRequests?: { id: string; quantity: number; serialNumbers?: string[] }[];
  /** Cargo company of the lines (it must match the lines' own cargo company). */
  cargoCompany?: string;
  /** Cargo company short name, e.g. `'YK'`. */
  carrier?: string;
  barcode?: string;
  /** Volumetric weight. */
  deci?: number;
  parcelQuantity?: number;
  warehouse?: Record<string, unknown>;
  creationReason?: string;
} & Record<string, unknown>;

/** One new package of `orders.splitPackage()` (the spec's `PackageDetail`). */
export type SplitPackageDetail = {
  lines: { orderLineId: string; quantity: number }[];
  cargoCompany?: string;
  /** Cargo company short name. */
  carrier?: string;
  barcode?: string;
  deci?: number;
  parcelQuantity?: number;
  warehouse?: Record<string, unknown>;
} & Record<string, unknown>;

/** Body for `orders.splitPackage()` — the spec's `SplitPackageRequest`. */
export type SplitPackageInput = {
  /** One entry per package the split produces. */
  packageDetails?: SplitPackageDetail[];
  /** Lines to cancel while splitting. */
  cancelledItems?: { orderLineId: string; quantity: number; cancelReasonId: number }[];
} & Record<string, unknown>;

/**
 * Body for `orders.cancelLineItem()` — the spec's `CancelByMerchantRequest`
 * (`{ reasonId }`). Only lines that are not packaged yet can be cancelled.
 */
export type CancelLineItemInput = {
  /** Hepsiburada's cancel reason id. */
  reasonId?: number;
} & Record<string, unknown>;

/**
 * Body for the deliver / intransit / undeliver status transitions — the
 * spec's `ExternalInfoRequest` (in transit), `ExternalDeliverRequest`
 * (delivered) and `ExternalUnDeliverRequest` (not delivered). An undelivered
 * transition needs `undeliveredReason`; a `reason` field is not read
 * (`400 "incorrect undeliveredReason value"`, SIT 2026-10-14).
 */
export type PackageStatusInput = {
  /** In transit: cargo tracking number. */
  trackingNumber?: string;
  /** In transit: tracking URL. */
  trackingUrl?: string;
  /** In transit: tracking phone number. */
  trackingPhoneNumber?: string;
  /** In transit: when the package was handed to the carrier. */
  shippedDate?: string;
  /** In transit: estimated arrival. */
  estimatedArrivalDate?: string;
  /** In transit: volumetric weight. */
  deci?: number;
  /** In transit: shipping cost. */
  cost?: number;
  /** In transit: VAT of the package. */
  tax?: number;
  /** Delivered: who received the package. */
  receivedBy?: string;
  /** Delivered: when it was received. */
  receivedDate?: string;
  /** Delivered: codes of digital products. */
  digitalCodes?: string[];
  /** Not delivered: Hepsiburada's undelivered-reason value. */
  undeliveredReason?: string;
  /** Not delivered: when delivery failed. */
  undeliveredDate?: string;
} & Record<string, unknown>;

/**
 * Body for cargo-company-change updates (line item or package level) — the
 * spec's `ChangeLineCargoCompanyRequest`. The field is `CargoCompanyShortName`
 * (PascalCase, as published); a `cargoCompany` field is not read
 * (`400 CargoCompanyNotFound`, SIT 2026-10-14).
 */
export type ChangeCargoCompanyInput = {
  /** Short name of the new cargo company, from `getChangeableCargoCompaniesFor*` (e.g. `'YK'`). */
  CargoCompanyShortName?: string;
} & Record<string, unknown>;

/**
 * Body for `orders.updateLineItemLaborCost()` — the spec's
 * `UpdateLaborCostRequest` (`oms-external.json`).
 */
export type LaborCostInput = {
  /** Labor cost per unit. */
  unitLaborCost?: number;
} & Record<string, unknown>;

/** One invoice entry in {@link InvoiceLinkInput}'s `invoices` list. */
export type InvoiceLinkItem = {
  /** Invoice issue date. */
  arrangementDate?: string;
  /** Invoice content type (`pdf` / `html`); when set the link is not re-queried. */
  contentType?: string;
  /** Invoice URL. */
  invoiceLink?: string;
  /** Order number the invoice belongs to. */
  orderNumber?: string;
  /** Invoice row number. */
  rowNumber?: string;
  /** Invoice serial number. */
  serialNumber?: string;
} & Record<string, unknown>;

/**
 * Body for `orders.sendInvoiceLink()` — the spec's `AddInvoiceOfPackageRequest`:
 * either a single link (`invoiceLink` + `serialNumber` / `rowNumber`) or a
 * multi-invoice `invoices` list.
 */
export type InvoiceLinkInput = {
  /** Invoice issue date. */
  arrangementDate?: string;
  /** Invoice URL. */
  invoiceLink?: string;
  /** Multiple invoices for the package. */
  invoices?: InvoiceLinkItem[];
  /** Invoice row number. */
  rowNumber?: string;
  /** Invoice serial number. */
  serialNumber?: string;
} & Record<string, unknown>;

/**
 * Body for `orders.updateParcelInfo()` — the spec's
 * `UpdateDeliveryParcelInfoRequest`.
 */
export type ParcelInfoInput = {
  /** Total volumetric weight (desi) of the package. */
  totalDesi?: number;
  /** Total number of parcels. */
  totalParcel?: number;
} & Record<string, unknown>;

/**
 * Body for `orders.updatePackageWarehouse()` — the spec's
 * `UpdateDeliveryWarehouseRequest`.
 */
export type WarehouseInput = {
  /** Short label identifying the warehouse shipping address. */
  shippingAddressLabel?: string;
} & Record<string, unknown>;
