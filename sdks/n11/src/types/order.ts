import type { CursorPaginationParams, Money } from '@lonca/core';

/**
 * Shipment-package status (`shipmentPackageStatus`). Every value below is
 * accepted by the `status` filter on prod; an unknown filter value answers 200
 * with an empty page rather than an error.
 */
export type N11PackageStatus = KnownN11PackageStatus | (string & {});

/**
 * The closed set of documented package statuses, mapped exhaustively by
 * `statusMap` / `normalizeStatus`.
 */
export type KnownN11PackageStatus =
  'Created' | 'Picking' | 'Shipped' | 'Cancelled' | 'Delivered' | 'Unpacked' | 'UnSupplied';

/** A billing or shipping address on a package. */
export interface N11Address {
  fullName?: string;
  address?: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  postalCode?: string;
  gsm?: string;
  /** Turkish identity number; may be empty since 2025-10-15 (n11 changelog). */
  tcId?: string;
  /** Billing only. */
  taxId?: string;
  /** Billing only. */
  taxHouse?: string;
  /** Billing only (`invoiceType` on the wire). */
  invoiceType?: number;
  /** Billing only. */
  countryCode?: string;
}

/** One order line in a package (`lines[]`). */
export interface N11OrderLine {
  /** `orderLineId` — the id order-line updates (approve, cancel, labour cost) take. */
  lineId: string;
  productId?: string;
  productName?: string;
  stockCode?: string;
  barcode?: string;
  quantity: number;
  /** Unit price. */
  price?: Money;
  dueAmount?: Money;
  /** `(price × quantity) − (sellerDiscount + sellerCouponDiscount)` per n11's docs. */
  sellerInvoiceAmount?: Money;
  sellerDiscount?: Money;
  sellerCouponDiscount?: Money;
  /** Discount funded by n11. */
  mallDiscount?: Money;
  /** Line status label (`orderItemLineItemStatusName`). */
  status?: string;
  vatRate?: number;
  commissionRate?: number;
  /** Variant attributes such as colour and size. */
  variantAttributes: { name: string; value: string }[];
  /** Untouched raw line (fees, campaign rates, … not modelled yet). */
  raw: Record<string, unknown>;
}

/** One entry of `packageHistories[]`. */
export interface N11PackageHistory {
  status: string;
  /** ISO-8601, from the wire's epoch-millisecond `createdDate`. */
  createdAt?: string;
}

/**
 * One shipment package from `GET /rest/delivery/v1/shipmentPackages`.
 *
 * n11 lists orders per package, like Trendyol's shipment packages. Ids are
 * strings; amounts are {@link Money} in Turkish lira (the endpoint sends no
 * currency); epoch-millisecond timestamps become ISO-8601 strings.
 */
export interface N11ShipmentPackage {
  /** Package id (`id`). */
  id: string;
  orderNumber: string;
  status: N11PackageStatus;
  customerId?: string;
  customerFullName?: string;
  customerEmail?: string;
  /** Buyer's identity number (`tcIdentityNumber`). */
  tcIdentityNumber?: string;
  taxId?: string;
  taxOffice?: string;
  billingAddress?: N11Address;
  /** For pick-up-point orders this is the point's address (n11 changelog 2026-08-03). */
  shippingAddress?: N11Address;
  /** `KTN`, `EASYPOINT`, `PUP`, … for pick-up-point orders; absent for home delivery. */
  deliveryAddressType?: string;
  shipmentCompanyId?: string;
  cargoProviderName?: string;
  /**
   * The package's campaign code. n11 serves no label file; print this value as
   * a CODE-128 barcode to make the cargo label (n11 support, 2026-10-14).
   */
  cargoTrackingNumber?: string;
  cargoTrackingLink?: string;
  cargoSenderNumber?: string;
  shipmentMethod?: number;
  totalAmount?: Money;
  totalDiscountAmount?: Money;
  isReturned?: boolean;
  /** ISO-8601. */
  lastModifiedAt?: string;
  /** ISO-8601. */
  agreedDeliveryAt?: string;
  lines: N11OrderLine[];
  histories: N11PackageHistory[];
  /** Untouched raw package (`micro`, `invoiceLink`, `etgbNo`, … not modelled yet). */
  raw: Record<string, unknown>;
}

/** Filters for {@link OrdersResource.list}. */
export interface ListN11OrdersParams extends CursorPaginationParams {
  /** One status per request. */
  status?: N11PackageStatus;
  /**
   * Window start (a `Date` or epoch ms). n11 caps the window at 15 days: with
   * `startDate` alone it returns 15 days from that point; with no dates, the
   * last ~15 days (observed on prod). Which date the window applies to is set
   * by `orderByField`.
   */
  startDate?: Date | number;
  /** Window end (a `Date` or epoch ms). */
  endDate?: Date | number;
  orderNumber?: string;
  /**
   * Which package date `startDate` / `endDate` filter on. `true`: the last
   * update (`lastModifiedDate`). `false` or omitted: the creation date. The
   * name is n11's; it is a boolean on the wire (confirmed by n11, 2026-10-13).
   */
  orderByField?: boolean;
  orderByDirection?: 'ASC' | 'DESC';
}

/** One line's outcome from `orders.approve` / `orders.updateLaborCosts` (HTTP 200, per line). */
export interface N11LineResult {
  lineId: string;
  /** `SUCCESS` or `FAIL`. */
  status: 'SUCCESS' | 'FAIL' | (string & {});
  /** n11's message, e.g. "Sipariş onaylamak için uygun statüde değildir." */
  reason?: string;
  /** For labour costs: what n11 stored and computed (`amountExcludingVAT`). */
  details?: Record<string, unknown>;
}

/** A package created by `orders.splitPackage` / `orders.splitPackageByQuantity`. */
export interface N11SplitPackageItem {
  orderNumber?: string;
  /** New package id. */
  packageId?: string;
  /** Line id in the new package (`splitPackageByQuantity` creates new line ids). */
  lineId?: string;
  stockCode?: string;
  quantity?: number;
}

/** Result of a package split. */
export interface N11SplitResult {
  code?: number;
  message?: string;
  items: N11SplitPackageItem[];
}

/** Input for `orders.splitPackageByQuantity`. */
export interface SplitN11PackageByQuantityParams {
  /** One entry per new package: the lines and quantities it should hold. */
  packages: { lineId: string | number; quantity: number }[][];
  /**
   * Lines to cancel while splitting (n11 does not allow a cancel alone).
   * `reasonId`: 61 out of stock, 62 defective, 63 wrong price, 64 force
   * majeure, 65 other. A cancelled package becomes `UnSupplied`.
   */
  cancel?: { lineId: string | number; quantity: number; reasonId: 61 | 62 | 63 | 64 | 65 }[];
}

/** One line of `orders.createCollectionRequest`. */
export interface N11CollectionRequestLine {
  /** Package id / campaign code (`cargoTrackingNumber`). */
  packageId: string;
  lineId: string | number;
  boxQuantity: number;
  /** Total desi (volumetric weight). */
  desi: number;
  /** `HLZ` Horoz Lojistik, `CEVA` Ceva Lojistik, `BL` Ceva Tedarik Zinciri (Borusan). */
  shipmentCompany: 'HLZ' | 'CEVA' | 'BL';
}

/** One line of `orders.updateLaborCosts`. */
export interface N11LaborCost {
  lineId: string | number;
  /** Labour cost excluding VAT, in major units. */
  amountExcludingVat: number;
  /** Default 20. */
  vatRate?: 0 | 1 | 10 | 20;
}

/** Input for `orders.cancelItem` (SOAP `ClaimCancelPartial`). */
export interface CancelN11OrderItemParams {
  /** The order line id (`orderItemId`). */
  lineId: string | number;
  quantity: number;
  /** From `claims.getCancelDenyReasons()` (61 "Stokta Kalmayan Ürün", …). */
  reasonId: string | number;
  description?: string;
}

/** Input for `orders.sendInvoiceLink` (SOAP `SaveLinkSellerInvoice`). */
export interface SendN11InvoiceLinkParams {
  orderNumber: string;
  /** HTTPS link to a PDF, PNG or JPEG, at most 2048 characters. */
  url: string;
  /** Required for micro-export (e-İhracat) orders. */
  invoiceNumber?: string;
  /** Required for micro-export orders; sent as epoch ms. */
  invoiceDate?: Date | number;
}
