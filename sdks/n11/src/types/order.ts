import type { CursorPaginationParams, Money } from '@lonca/core';

/**
 * Shipment-package status (`shipmentPackageStatus`). Every value below is
 * accepted by the `status` filter on prod; an unknown filter value answers 200
 * with an empty page rather than an error.
 */
export type N11PackageStatus =
  | 'Created'
  | 'Picking'
  | 'Shipped'
  | 'Cancelled'
  | 'Delivered'
  | 'Unpacked'
  | 'UnSupplied'
  | (string & {});

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
