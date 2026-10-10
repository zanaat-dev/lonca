/**
 * The closed set of Trendyol shipment-package statuses the SDK maps
 * exhaustively (see `statusMap` / `normalizeStatus`). Kept separate from the
 * open wire type {@link ShipmentPackageStatus} so the status map stays
 * exhaustive at compile time while unknown wire values stay representable.
 */
export type KnownShipmentPackageStatus =
  | 'Created'
  | 'Picking'
  | 'Invoiced'
  | 'Shipped'
  | 'Cancelled'
  | 'Delivered'
  | 'UnDelivered'
  | 'Returned'
  | 'UnSupplied'
  | 'Awaiting'
  | 'UnPacked'
  | 'AtCollectionPoint'
  | 'Verified';

/**
 * Trendyol shipment-package status as it appears on the wire.
 *
 * Trendyol uses ~13 distinct values (see {@link KnownShipmentPackageStatus}).
 * Open (`string & {}`) so a status Trendyol adds later still type-checks; fold
 * it into the closed `NormalizedOrderStatus` vocab with `normalizeStatus`.
 */
export type ShipmentPackageStatus = KnownShipmentPackageStatus | (string & {});

export interface OrderAddressLines {
  addressLine1?: string;
  addressLine2?: string;
}

/**
 * A customer or invoice/shipment address returned alongside a shipment package.
 * Field set is conservative — Trendyol returns many optional locality fields
 * and we surface them as-is.
 */
export interface OrderAddress {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  fullAddress?: string;
  shortAddress?: string;
  city?: string;
  cityCode?: number;
  district?: string;
  districtId?: number;
  neighborhoodId?: number;
  countyId?: number;
  countyName?: string;
  stateName?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
  addressLines?: OrderAddressLines;
}

/** Customer details on a shipment package (a subset of what Trendyol exposes). */
export interface OrderCustomer {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  taxNumber?: string;
  identityNumber?: string;
}

export interface OrderLineDiscountDetail {
  lineItemPrice?: number;
  lineItemSellerDiscount?: number;
  lineItemTyDiscount?: number;
}

/** A single item line inside a shipment package. */
export interface OrderLine {
  /** Trendyol's `lineId`. */
  id: string;
  quantity: number;
  productName: string;
  barcode: string;
  productSize?: string;
  productColor?: string;
  stockCode?: string;
  contentId?: string;
  sellerId?: string;
  productCategoryId?: string;
  salesCampaignId?: string;

  currencyCode?: string;
  lineUnitPrice: number;
  lineGrossAmount: number;
  lineSellerDiscount?: number;
  lineTyDiscount?: number;
  lineTotalDiscount?: number;
  vatRate?: number;
  commission?: number;

  orderLineItemStatusName?: string;
  businessUnit?: string;
  fastDeliveryOptions?: unknown[];
  discountDetails?: OrderLineDiscountDetail[];

  /** Untouched raw line response. */
  raw: Record<string, unknown>;
}

/** A status transition entry in `packageHistories`. */
export interface PackageHistoryEntry {
  status?: ShipmentPackageStatus;
  /** ISO 8601 UTC string (converted from Trendyol's ms-epoch). */
  createdAt?: string;
  raw: Record<string, unknown>;
}

/**
 * A package line update tuple used by `updatePackageStatus` and
 * `cancelPackageItem`. `lineId` is the per-line ID from `ShipmentPackage.lines[].lineId`.
 */
export interface PackageLineUpdate {
  lineId: number;
  quantity: number;
}

/**
 * Input for `orders.updatePackageStatus`. Trendyol restricts the seller-side
 * status push to `Picking` (mark as being prepared) and `Invoiced`
 * (invoice issued); other transitions are driven by Trendyol / the cargo
 * provider. `lines` is optional and only used when transitioning subset of
 * line items.
 */
export interface UpdatePackageStatusInput {
  status: 'Picking' | 'Invoiced';
  lines?: PackageLineUpdate[];
}

/**
 * Input for `orders.cancelPackageItem` — Trendyol's "supply failure" notification.
 * Marks specific line items as un-suppliable. `reasonId` is a numeric code
 * Trendyol publishes separately (e.g. `577` = "tedarik edemiyorum"); consult
 * Trendyol's seller panel or the "Tedarik Edememe" docs for current values.
 */
export interface CancelPackageItemInput {
  lines: PackageLineUpdate[];
  reasonId: number;
}

/**
 * One row from `orders.getCargoInvoiceItems` — a cargo invoice line item
 * that ties a parcel ID to its cargo fee. Useful for reconciling Trendyol's
 * cargo deductions against your shipped packages.
 */
export interface CargoInvoiceItem {
  /** e.g. "Gönderi Kargo Bedeli" (outbound) or "İade Kargo Bedeli" (return). */
  shipmentPackageType?: string;
  /** Cargo parcel unique ID. */
  parcelUniqueId?: number | string;
  orderNumber?: string;
  /** Fee charged in this row. */
  amount?: number;
  /** Desi value used to compute the fee. */
  desi?: number;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * Filter params for `orders.listStream` — the streaming alternative to
 * `orders.list`. Uses Trendyol's opaque `nextCursor` (forwarded as the
 * `@lonca/core` `CursorPaginationParams.cursor`) instead of page-index
 * pagination.
 */
export interface ListOrdersStreamParams {
  cursor?: string;
  limit?: number;
  /**
   * CSV of package-item statuses to filter by (e.g.
   * `'Created,Picking,Invoiced'`). Trendyol accepts the same status
   * vocabulary as `ShipmentPackageStatus`.
   */
  packageItemStatuses?: string;
  /** Lower bound for `lastModified` (Trendyol expects ms-epoch). */
  lastModifiedStartDate?: Date;
  /** Upper bound for `lastModified`. */
  lastModifiedEndDate?: Date;
}

/**
 * Box / packaging metadata for `orders.updateBoxInfo`. Both fields are
 * optional but at least one should be set for the call to be meaningful.
 */
export interface UpdateBoxInfoInput {
  /** Desi value (volumetric weight used by Trendyol for shipping cost). */
  deci?: number;
  /** Number of physical boxes in the shipment. */
  boxQuantity?: number;
}

/**
 * Per-line labor cost for `orders.updateLaborCosts`. The Trendyol API
 * accepts a raw array of these (no envelope) — the SDK forwards as-is.
 */
export interface LaborCostInput {
  orderLineId: number;
  /** Labor cost charged per single unit of this line. */
  laborCostPerItem: number;
}

/**
 * Trendyol cargo provider codes accepted by `orders.changeCargoProvider`.
 * Use the string union for autocomplete; `(string & {})` keeps unknown
 * codes type-compatible so Trendyol can add providers without breaking
 * callers.
 */
export type TrendyolCargoProvider =
  | 'YKMP'
  | 'ARASMP'
  | 'SURATMP'
  | 'HOROZMP'
  | 'DHLECOMMP'
  | 'PTTMP'
  | 'CEVAMP'
  | 'TEXMP'
  | 'KOLAYGELSINMP'
  | 'CEVATEDARIK'
  | (string & {});

/**
 * Per-line quantity split for `orders.splitPackageByQuantity`. Each item
 * in `quantities` becomes its own new package containing that many units
 * of `orderLineId`.
 *
 * @example
 * // splits 5 units of line 100 into 3 packages: 2 + 2 + 1
 * { orderLineId: 100, quantities: [2, 2, 1] }
 */
export interface QuantitySplit {
  orderLineId: number;
  quantities: number[];
}

/**
 * A group of line IDs that should become a new package together,
 * for `orders.multiSplitPackage`.
 */
export interface SplitGroup {
  orderLineIds: number[];
}

/**
 * One package's contents for `orders.splitMultiPackagesByQuantity`. Each
 * element of the outer array becomes a new package; each `packageDetails`
 * entry carries an `orderLineId` and the **single** quantity assigned to
 * that package (note: singular `quantities`, despite the field name).
 */
export interface PackageDetail {
  orderLineId: number;
  /** Quantity of this line to include in this package (singular integer). */
  quantities: number;
}

export interface SplitPackagePlan {
  packageDetails: PackageDetail[];
}

/**
 * Input for `orders.processAlternativeDelivery`. Used when the seller is
 * shipping via a non-Trendyol cargo provider — provide either a phone number
 * (which Trendyol SMSes the tracking link to) or a direct tracking URL.
 */
export interface ProcessAlternativeDeliveryInput {
  /** When true, `trackingInfo` is a phone number; when false, a tracking URL. */
  isPhoneNumber: boolean;
  trackingInfo: string;
  /** Provider-specific extra parameters (Trendyol forwards verbatim). */
  params: Record<string, string>;
}

/**
 * A Trendyol order — Trendyol models orders as "shipment packages". A single
 * customer order may produce multiple shipment packages (one per warehouse,
 * one per cancellation, etc.).
 *
 * `id` is the `shipmentPackageId` (the operational unit); `orderNumber`
 * groups packages that came from the same customer order.
 */
export interface ShipmentPackage {
  // ─── IDs ───
  /** `shipmentPackageId` — the operational identifier for this package. */
  id: string;
  orderNumber: string;
  shipmentNumber?: string;
  originPackageIds?: string[] | null;
  warehouseId?: string;
  supplierId?: string;

  // ─── Status ───
  status: ShipmentPackageStatus;
  /** Usually identical to `status`; surfaced for completeness. */
  shipmentPackageStatus?: ShipmentPackageStatus;

  // ─── Customer ───
  customer: OrderCustomer;

  // ─── Dates (ISO 8601 UTC) ───
  orderDate: string;
  lastModifiedDate: string;
  agreedDeliveryDate?: string;
  estimatedDeliveryStartDate?: string;
  estimatedDeliveryEndDate?: string;
  originShipmentDate?: string;

  // ─── Pricing ───
  currencyCode: string;
  packageTotalPrice: number;
  packageGrossAmount: number;
  packageSellerDiscount: number;
  packageTyDiscount: number;
  packageTotalDiscount: number;

  // ─── Addresses ───
  invoiceAddress?: OrderAddress;
  shipmentAddress?: OrderAddress;
  deliveryAddressType?: string;

  // ─── Cargo ───
  cargoTrackingNumber?: string;
  cargoProviderName?: string;
  cargoProviderId?: string;
  cargoSenderNumber?: string;

  // ─── Delivery ───
  deliveryType?: string;
  /**
   * @deprecated Not in Trendyol's documentation and absent from every production order sample;
   * it was only seen once on a stage package (May 2026). Still passed through when Trendyol
   * sends it, but do not rely on it. It will be removed in the next major version.
   */
  whoPays?: number;
  timeSlotId?: number;
  fastDelivery?: boolean;
  fastDeliveryType?: string;
  deliveredByService?: boolean;

  // ─── Flags ───
  commercial?: boolean;
  micro?: boolean;
  giftBoxRequested?: boolean;
  /** Renamed from Trendyol's wire field `3pByTrendyol` (identifier cannot start with a digit). */
  threePByTrendyol?: boolean;
  containsDangerousProduct?: boolean;
  isCod?: boolean;
  is4P?: boolean;

  // ─── Misc ───
  invoiceLink?: string;
  createdBy?: string;

  // ─── Nested ───
  lines: OrderLine[];
  packageHistories: PackageHistoryEntry[];

  /** Untouched raw response for fields not modeled yet. */
  raw: Record<string, unknown>;
}
