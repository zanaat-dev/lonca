import {
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
  type CursorPaginationParams,
} from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  CancelPackageItemInput,
  CargoInvoiceItem,
  LaborCostInput,
  ListOrdersStreamParams,
  OrderAddress,
  OrderCustomer,
  OrderLine,
  PackageHistoryEntry,
  ProcessAlternativeDeliveryInput,
  QuantitySplit,
  UpdateBoxInfoInput,
  ShipmentPackage,
  ShipmentPackageStatus,
  SplitGroup,
  SplitPackagePlan,
  TrendyolCargoProvider,
  UpdatePackageStatusInput,
} from '../types/order.js';
import type {
  CompensationItemDetail,
  CompensationTicket,
  ListCompensationTicketsParams,
} from '../types/returns.js';

/** Trendyol caps `size` at 200; default 200. */
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
/**
 * Effective 2026-06-08, `getShipmentPackages` caps total reachable records at
 * 10,000 — requests past that offset return HTTP 429. Use `listStream()` for
 * full scans. We fail fast client-side before issuing a doomed request.
 */
const MAX_OFFSET_RECORDS = 10_000;

export interface ListOrdersParams extends CursorPaginationParams {
  status?: ShipmentPackageStatus;
  orderNumber?: string;
  /** Filter packages updated on or after this date (Trendyol expects ms-epoch). */
  startDate?: Date;
  /** Filter packages updated on or before this date. */
  endDate?: Date;
}

// ─── Wire shapes (verified via raw inspect on STAGE 2026-05-25) ─────────────

interface TrendyolPackageHistoryNode {
  status?: string;
  createdDate?: number;
  [key: string]: unknown;
}

interface TrendyolOrderLineNode {
  lineId?: number | string;
  quantity?: number;
  productName?: string;
  barcode?: string;
  productSize?: string;
  productColor?: string;
  stockCode?: string;
  contentId?: number | string;
  sellerId?: number | string;
  productCategoryId?: number | string;
  salesCampaignId?: number | string;
  currencyCode?: string;
  lineUnitPrice?: number;
  lineGrossAmount?: number;
  lineSellerDiscount?: number;
  lineTyDiscount?: number;
  lineTotalDiscount?: number;
  vatRate?: number;
  commission?: number;
  orderLineItemStatusName?: string;
  businessUnit?: string;
  fastDeliveryOptions?: unknown[];
  discountDetails?: unknown[];
  [key: string]: unknown;
}

interface TrendyolAddressNode {
  id?: number | string;
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
  addressLines?: { addressLine1?: string; addressLine2?: string };
}

interface TrendyolShipmentPackageNode {
  /** Default field name on `getShipmentPackages` (orders.list). */
  shipmentPackageId?: number | string;
  /** Field name used by `getShipmentPackagesStream` (orders.listStream). */
  id?: number | string;
  orderNumber?: string;
  shipmentNumber?: number | string;
  originPackageIds?: Array<number | string> | null;
  warehouseId?: number | string;
  supplierId?: number | string;

  status?: string;
  shipmentPackageStatus?: string;

  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerId?: number | string;
  taxNumber?: string | null;
  identityNumber?: string;

  orderDate?: number;
  lastModifiedDate?: number;
  agreedDeliveryDate?: number;
  estimatedDeliveryStartDate?: number;
  estimatedDeliveryEndDate?: number;
  originShipmentDate?: number;

  currencyCode?: string;
  packageTotalPrice?: number;
  packageGrossAmount?: number;
  packageSellerDiscount?: number;
  packageTyDiscount?: number;
  packageTotalDiscount?: number;

  invoiceAddress?: TrendyolAddressNode;
  shipmentAddress?: TrendyolAddressNode;
  deliveryAddressType?: string;

  cargoTrackingNumber?: number | string;
  cargoProviderName?: string;
  cargoProviderId?: number | string;
  cargoSenderNumber?: string;

  deliveryType?: string;
  /** Undocumented and not seen on prod; kept so a value Trendyol does send still reaches `whoPays`. */
  whoPays?: number;
  timeSlotId?: number;
  fastDelivery?: boolean;
  fastDeliveryType?: string;
  deliveredByService?: boolean;

  commercial?: boolean;
  micro?: boolean;
  giftBoxRequested?: boolean;
  containsDangerousProduct?: boolean;
  isCod?: boolean;
  is4P?: boolean;

  invoiceLink?: string;
  createdBy?: string;

  lines?: TrendyolOrderLineNode[];
  packageHistories?: TrendyolPackageHistoryNode[];

  [key: string]: unknown;
}

interface TrendyolGetOrdersResponse {
  content?: TrendyolShipmentPackageNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs === 0) {
    return undefined;
  }
  return new Date(epochMs).toISOString();
}

function normalizeAddress(node: TrendyolAddressNode | undefined): OrderAddress | undefined {
  if (!node) return undefined;
  const out: OrderAddress = {};
  if (node.id !== undefined) out.id = String(node.id);
  if (node.firstName !== undefined) out.firstName = node.firstName;
  if (node.lastName !== undefined) out.lastName = node.lastName;
  if (node.fullName !== undefined) out.fullName = node.fullName;
  if (node.company !== undefined) out.company = node.company;
  if (node.address1 !== undefined) out.address1 = node.address1;
  if (node.address2 !== undefined) out.address2 = node.address2;
  if (node.fullAddress !== undefined) out.fullAddress = node.fullAddress;
  if (node.shortAddress !== undefined) out.shortAddress = node.shortAddress;
  if (node.city !== undefined) out.city = node.city;
  if (node.cityCode !== undefined) out.cityCode = node.cityCode;
  if (node.district !== undefined) out.district = node.district;
  if (node.districtId !== undefined) out.districtId = node.districtId;
  if (node.neighborhoodId !== undefined) out.neighborhoodId = node.neighborhoodId;
  if (node.countyId !== undefined) out.countyId = node.countyId;
  if (node.countyName !== undefined) out.countyName = node.countyName;
  if (node.stateName !== undefined) out.stateName = node.stateName;
  if (node.postalCode !== undefined) out.postalCode = node.postalCode;
  if (node.countryCode !== undefined) out.countryCode = node.countryCode;
  if (node.phone !== undefined) out.phone = node.phone;
  if (node.addressLines !== undefined) out.addressLines = node.addressLines;
  return out;
}

function normalizeLine(node: TrendyolOrderLineNode): OrderLine {
  const out: OrderLine = {
    id: node.lineId !== undefined ? String(node.lineId) : '',
    quantity: typeof node.quantity === 'number' ? node.quantity : 0,
    productName: node.productName ?? '',
    barcode: node.barcode ?? '',
    lineUnitPrice: typeof node.lineUnitPrice === 'number' ? node.lineUnitPrice : 0,
    lineGrossAmount: typeof node.lineGrossAmount === 'number' ? node.lineGrossAmount : 0,
    raw: node as Record<string, unknown>,
  };
  if (node.productSize !== undefined) out.productSize = node.productSize;
  if (node.productColor !== undefined) out.productColor = node.productColor;
  if (node.stockCode !== undefined) out.stockCode = node.stockCode;
  if (node.contentId !== undefined) out.contentId = String(node.contentId);
  if (node.sellerId !== undefined) out.sellerId = String(node.sellerId);
  if (node.productCategoryId !== undefined) out.productCategoryId = String(node.productCategoryId);
  if (node.salesCampaignId !== undefined) out.salesCampaignId = String(node.salesCampaignId);
  if (node.currencyCode !== undefined) out.currencyCode = node.currencyCode;
  if (node.lineSellerDiscount !== undefined) out.lineSellerDiscount = node.lineSellerDiscount;
  if (node.lineTyDiscount !== undefined) out.lineTyDiscount = node.lineTyDiscount;
  if (node.lineTotalDiscount !== undefined) out.lineTotalDiscount = node.lineTotalDiscount;
  if (node.vatRate !== undefined) out.vatRate = node.vatRate;
  if (node.commission !== undefined) out.commission = node.commission;
  if (node.orderLineItemStatusName !== undefined) {
    out.orderLineItemStatusName = node.orderLineItemStatusName;
  }
  if (node.businessUnit !== undefined) out.businessUnit = node.businessUnit;
  if (Array.isArray(node.fastDeliveryOptions)) out.fastDeliveryOptions = node.fastDeliveryOptions;
  if (Array.isArray(node.discountDetails)) {
    out.discountDetails = node.discountDetails as OrderLine['discountDetails'];
  }
  return out;
}

function normalizeHistory(node: TrendyolPackageHistoryNode): PackageHistoryEntry {
  const out: PackageHistoryEntry = { raw: node as Record<string, unknown> };
  if (node.status !== undefined) out.status = node.status;
  const createdAt = toIso(node.createdDate);
  if (createdAt) out.createdAt = createdAt;
  return out;
}

function normalizeCustomer(node: TrendyolShipmentPackageNode): OrderCustomer {
  const out: OrderCustomer = {
    firstName: node.customerFirstName ?? '',
    lastName: node.customerLastName ?? '',
  };
  if (node.customerId !== undefined) out.id = String(node.customerId);
  if (node.customerEmail !== undefined) out.email = node.customerEmail;
  if (node.taxNumber !== undefined && node.taxNumber !== null) out.taxNumber = node.taxNumber;
  if (node.identityNumber !== undefined) out.identityNumber = node.identityNumber;
  return out;
}

/**
 * Normalize one raw Trendyol shipment-package node into the public
 * `ShipmentPackage` shape. Exported so consumers handling Trendyol
 * webhooks can reuse the SDK's normalization logic on the event body
 * (Trendyol POSTs the same shape it returns from `getShipmentPackages`).
 *
 * For full-webhook parsing use `parseWebhookEvent(rawBody)` from the
 * top-level package, which calls this internally per item.
 */
export function normalizeShipmentPackage(rawNode: unknown): ShipmentPackage {
  return normalizePackage((rawNode ?? {}) as TrendyolShipmentPackageNode);
}

function normalizePackage(node: TrendyolShipmentPackageNode): ShipmentPackage {
  const pkgId = node.shipmentPackageId ?? node.id;
  const out: ShipmentPackage = {
    id: pkgId !== undefined ? String(pkgId) : '',
    orderNumber: node.orderNumber ?? '',
    status: (node.status as ShipmentPackageStatus) ?? '',
    customer: normalizeCustomer(node),
    orderDate: toIso(node.orderDate) ?? '',
    lastModifiedDate: toIso(node.lastModifiedDate) ?? '',
    currencyCode: node.currencyCode ?? '',
    packageTotalPrice: typeof node.packageTotalPrice === 'number' ? node.packageTotalPrice : 0,
    packageGrossAmount: typeof node.packageGrossAmount === 'number' ? node.packageGrossAmount : 0,
    packageSellerDiscount:
      typeof node.packageSellerDiscount === 'number' ? node.packageSellerDiscount : 0,
    packageTyDiscount: typeof node.packageTyDiscount === 'number' ? node.packageTyDiscount : 0,
    packageTotalDiscount:
      typeof node.packageTotalDiscount === 'number' ? node.packageTotalDiscount : 0,
    lines: (node.lines ?? []).map(normalizeLine),
    packageHistories: (node.packageHistories ?? []).map(normalizeHistory),
    raw: node as Record<string, unknown>,
  };

  if (node.shipmentNumber !== undefined) out.shipmentNumber = String(node.shipmentNumber);
  if (node.originPackageIds !== undefined && node.originPackageIds !== null) {
    out.originPackageIds = node.originPackageIds.map((id) => String(id));
  }
  if (node.warehouseId !== undefined) out.warehouseId = String(node.warehouseId);
  if (node.supplierId !== undefined) out.supplierId = String(node.supplierId);
  if (node.shipmentPackageStatus !== undefined) {
    out.shipmentPackageStatus = node.shipmentPackageStatus as ShipmentPackageStatus;
  }

  const agreed = toIso(node.agreedDeliveryDate);
  if (agreed) out.agreedDeliveryDate = agreed;
  const estStart = toIso(node.estimatedDeliveryStartDate);
  if (estStart) out.estimatedDeliveryStartDate = estStart;
  const estEnd = toIso(node.estimatedDeliveryEndDate);
  if (estEnd) out.estimatedDeliveryEndDate = estEnd;
  const origin = toIso(node.originShipmentDate);
  if (origin) out.originShipmentDate = origin;

  const invoice = normalizeAddress(node.invoiceAddress);
  if (invoice) out.invoiceAddress = invoice;
  const shipment = normalizeAddress(node.shipmentAddress);
  if (shipment) out.shipmentAddress = shipment;
  if (node.deliveryAddressType !== undefined) out.deliveryAddressType = node.deliveryAddressType;

  if (node.cargoTrackingNumber !== undefined) {
    out.cargoTrackingNumber = String(node.cargoTrackingNumber);
  }
  if (node.cargoProviderName !== undefined) out.cargoProviderName = node.cargoProviderName;
  if (node.cargoProviderId !== undefined) out.cargoProviderId = String(node.cargoProviderId);
  if (node.cargoSenderNumber !== undefined) out.cargoSenderNumber = node.cargoSenderNumber;

  if (node.deliveryType !== undefined) out.deliveryType = node.deliveryType;
  if (node.whoPays !== undefined) out.whoPays = node.whoPays;
  if (node.timeSlotId !== undefined) out.timeSlotId = node.timeSlotId;
  if (typeof node.fastDelivery === 'boolean') out.fastDelivery = node.fastDelivery;
  if (node.fastDeliveryType !== undefined) out.fastDeliveryType = node.fastDeliveryType;
  if (typeof node.deliveredByService === 'boolean')
    out.deliveredByService = node.deliveredByService;

  if (typeof node.commercial === 'boolean') out.commercial = node.commercial;
  if (typeof node.micro === 'boolean') out.micro = node.micro;
  if (typeof node.giftBoxRequested === 'boolean') out.giftBoxRequested = node.giftBoxRequested;
  if (typeof node['3pByTrendyol'] === 'boolean') {
    out.threePByTrendyol = node['3pByTrendyol'];
  }
  if (typeof node.containsDangerousProduct === 'boolean') {
    out.containsDangerousProduct = node.containsDangerousProduct;
  }
  if (typeof node.isCod === 'boolean') out.isCod = node.isCod;
  if (typeof node.is4P === 'boolean') out.is4P = node.is4P;

  if (node.invoiceLink !== undefined) out.invoiceLink = node.invoiceLink;
  if (node.createdBy !== undefined) out.createdBy = node.createdBy;

  return out;
}

/**
 * Trendyol order (shipment-package) endpoints.
 *
 * Rate limit (per Trendyol service limits): tunable via the constructor with a
 * generous default.
 *
 * Pagination: `getShipmentPackages` (`list`) uses page-based pagination (not
 * nextPageToken). The SDK exposes `CursorPage<ShipmentPackage>` so the caller
 * can iterate with `paginate()` from `@lonca/core`; the opaque cursor encodes
 * the page index.
 *
 * **2026-06-08 limit:** `getShipmentPackages` reaches at most 10,000 records —
 * requests past that offset return HTTP 429. For full scans, periodic syncs, or
 * exports use {@link OrdersResource.listStream} (`getShipmentPackagesStream`),
 * which paginates with an opaque cursor and is not subject to the cap. Note the
 * stream endpoint exposes only the last 3 months of orders.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * List shipment packages for the seller.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const pkg of paginate((p) => client.orders.list({ ...p, status: 'Created' }))) {
   *   console.log(pkg.id, pkg.status, pkg.customer.firstName);
   * }
   * ```
   */
  async list(params: ListOrdersParams = {}): Promise<CursorPage<ShipmentPackage>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    if ((page + 1) * size > MAX_OFFSET_RECORDS) {
      throw new ValidationError({
        message: `getShipmentPackages can reach at most ${MAX_OFFSET_RECORDS} records (page ${page} × size ${size} exceeds it); use listStream() for full scans`,
      });
    }

    const query: Record<string, string | number | undefined> = { page, size };
    if (params.status) query.status = params.status;
    if (params.orderNumber) query.orderNumber = params.orderNumber;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();

    const data = await this.transport.request<TrendyolGetOrdersResponse>({
      method: 'GET',
      path: `/integration/order/sellers/${this.transport.sellerId}/orders`,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map(normalizePackage);
    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    const result: CursorPage<ShipmentPackage> = { items };
    // Only advertise a next page when the server has one AND fetching it would
    // stay within the 10k-record offset cap. Emitting a cursor whose page would
    // trip the guard above makes `paginate()` throw mid-iteration after yielding
    // ~10k rows; instead the stream ends cleanly and the caller is steered to
    // `listStream()` for full scans (see the cap guard and class docs).
    const nextPageWithinCap = (page + 2) * size <= MAX_OFFSET_RECORDS;
    if (page + 1 < totalPages && nextPageWithinCap) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Push a shipment-package status update.
   *
   * Trendyol restricts the seller-side push to two transitions:
   * - `Picking`  — order picked up from the shelf / being prepared
   * - `Invoiced` — invoice issued, ready for cargo handoff
   *
   * Other transitions (`Shipped`, `Delivered`, etc.) are driven by Trendyol
   * or the cargo provider — call `processAlternativeDelivery` or
   * `manualDeliverByPackageId` if you ship outside Trendyol's cargo
   * network.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async updatePackageStatus(
    packageId: string | number,
    input: UpdatePackageStatusInput,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: this.packagePath(packageId),
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Notify Trendyol that one or more line items cannot be supplied
   * ("Tedarik Edememe Bildirimi"). Marks the listed line IDs as
   * `UnSupplied`. Trendyol cancels those quantities and notifies the
   * customer.
   *
   * `reasonId` is a numeric code Trendyol publishes separately — consult
   * the seller panel or the "Tedarik Edememe" docs for current values.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async cancelPackageItem(
    packageId: string | number,
    input: CancelPackageItemInput,
  ): Promise<void> {
    if (!Array.isArray(input?.lines) || input.lines.length === 0) {
      throw new ValidationError({ message: 'cancelPackageItem: lines must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/items/unsupplied`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Extend the agreed delivery date for a shipment package by 1, 2, or 3 days.
   * Trendyol enforces the [1, 3] range server-side; the SDK validates client-side
   * to fail fast.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async extendDeliveryDate(packageId: string | number, extendedDayCount: 1 | 2 | 3): Promise<void> {
    if (![1, 2, 3].includes(extendedDayCount)) {
      throw new ValidationError({
        message: `extendDeliveryDate: extendedDayCount must be 1, 2, or 3 (got ${extendedDayCount})`,
      });
    }
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/extended-agreed-delivery-date`,
      body: { extendedDayCount },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Notify Trendyol of an alternative delivery channel — used when the
   * seller is shipping via a non-Trendyol cargo provider. Trendyol then
   * either SMSes the customer the tracking link (when `isPhoneNumber` is
   * `true`) or stores the tracking URL on the package directly.
   *
   * Returns void; Trendyol responds with 200 + empty body on success.
   */
  async processAlternativeDelivery(
    packageId: string | number,
    input: ProcessAlternativeDeliveryInput,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/alternative-delivery`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Split a shipment package by moving a set of line IDs into a new
   * package. The original package keeps the remaining lines.
   *
   * @param packageId    The package to split.
   * @param orderLineIds Line IDs to move into the new package (1+).
   * @throws {ValidationError} when `orderLineIds` is empty.
   */
  async splitPackage(packageId: string | number, orderLineIds: number[]): Promise<void> {
    if (!Array.isArray(orderLineIds) || orderLineIds.length === 0) {
      throw new ValidationError({ message: 'splitPackage: orderLineIds must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'POST',
      path: `${this.packagePath(packageId)}/split`,
      body: { orderLineIds },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Split a shipment package by quantity. Each `QuantitySplit` entry
   * carves a single line into multiple packages — e.g. `{ orderLineId: 100,
   * quantities: [2, 2, 1] }` splits 5 units of line 100 into three packages
   * of 2 + 2 + 1.
   *
   * @throws {ValidationError} when `quantitySplit` is empty.
   */
  async splitPackageByQuantity(
    packageId: string | number,
    quantitySplit: QuantitySplit[],
  ): Promise<void> {
    if (!Array.isArray(quantitySplit) || quantitySplit.length === 0) {
      throw new ValidationError({
        message: 'splitPackageByQuantity: quantitySplit must not be empty',
      });
    }
    await this.transport.request<unknown>({
      method: 'POST',
      path: `${this.packagePath(packageId)}/quantity-split`,
      body: { quantitySplit },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Split a shipment package into multiple new packages by grouping line
   * IDs. Each `SplitGroup` becomes one new package containing the listed
   * line IDs.
   *
   * @throws {ValidationError} when `splitGroups` is empty.
   */
  async multiSplitPackage(packageId: string | number, splitGroups: SplitGroup[]): Promise<void> {
    if (!Array.isArray(splitGroups) || splitGroups.length === 0) {
      throw new ValidationError({ message: 'multiSplitPackage: splitGroups must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'POST',
      path: `${this.packagePath(packageId)}/multi-split`,
      body: { splitGroups },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Split a shipment package into multiple new packages, each containing a
   * mix of line items at specific quantities. This is the most expressive
   * split — use it when you need fine-grained control over which line IDs
   * and how many of each end up in each new package.
   *
   * @throws {ValidationError} when `splitPackages` is empty.
   */
  async splitMultiPackagesByQuantity(
    packageId: string | number,
    splitPackages: SplitPackagePlan[],
  ): Promise<void> {
    if (!Array.isArray(splitPackages) || splitPackages.length === 0) {
      throw new ValidationError({
        message: 'splitMultiPackagesByQuantity: splitPackages must not be empty',
      });
    }
    await this.transport.request<unknown>({
      method: 'POST',
      path: `${this.packagePath(packageId)}/split-packages`,
      body: { splitPackages },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Change the cargo provider on an existing shipment package. Use one of
   * Trendyol's documented marketplace cargo codes (`'YKMP'`, `'ARASMP'`,
   * `'SURATMP'`, etc.) — see `TrendyolCargoProvider` for the full list.
   */
  async changeCargoProvider(
    packageId: string | number,
    cargoProvider: TrendyolCargoProvider,
  ): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/cargo-providers`,
      body: { cargoProvider },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Mark a shipment package as manually delivered via its package ID.
   * Used when the seller delivered the order outside Trendyol's cargo
   * network and needs to flip the package to `Delivered` after handover.
   *
   * No request body; Trendyol responds with 200 + empty body on success.
   */
  async manualDeliverByPackageId(packageId: string | number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/manual-invoice-delivery`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Manual-deliver variant that takes the cargo tracking number instead
   * of the package ID. Useful when you only have the tracking number on
   * hand (e.g., from a cargo provider webhook).
   *
   * Note the path structure: tracking number sits at a sibling location,
   * not under `/shipment-packages/{id}/...`.
   */
  async manualDeliverByTrackingNumber(cargoTrackingNumber: string | number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/order/sellers/${this.transport.sellerId}/shipment-packages/manual-invoice-delivery-by-tracking-number/${encodeURIComponent(String(cargoTrackingNumber))}`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Mark a package as delivered through an authorized service ("yetkili
   * servis"). For appliance / installation-required products that are
   * delivered + installed by a third-party service partner.
   */
  async markDeliveredByService(packageId: string | number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/delivered-by-service`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Update box / packaging metadata on a shipment package (desi value
   * and/or number of boxes). Either field can be sent alone.
   */
  async updateBoxInfo(packageId: string | number, input: UpdateBoxInfoInput): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/box-info`,
      body: input,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Update labor costs for one or more order lines.
   *
   * **Wire note:** Trendyol's request body is a raw array (no envelope),
   * not `{ items: [...] }`. The SDK forwards `items` verbatim.
   *
   * @throws {ValidationError} when `items` is empty.
   */
  async updateLaborCosts(packageId: string | number, items: LaborCostInput[]): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError({ message: 'updateLaborCosts: items must not be empty' });
    }
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/labor-costs`,
      body: items,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Reassign a shipment package to a different warehouse. `warehouseId`
   * comes from `client.suppliers.getAddresses()` (filter by `isShipmentAddress`).
   */
  async updateWarehouse(packageId: string | number, warehouseId: number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/warehouse`,
      body: { warehouseId },
      rateLimiter: this.limiter,
    });
  }

  /**
   * Stream variant of `list()`. Trendyol's `getShipmentPackagesStream`
   * returns the same `ShipmentPackage` shape but paginates with an opaque
   * cursor — useful when the dataset is large and page-based pagination
   * would hit the 10 000-record cap.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const pkg of paginate((p) =>
   *   client.orders.listStream({ ...p, packageItemStatuses: 'Created,Picking' }),
   * )) {
   *   console.log(pkg.id, pkg.status);
   * }
   * ```
   */
  async listStream(params: ListOrdersStreamParams = {}): Promise<CursorPage<ShipmentPackage>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const query: Record<string, string | number | undefined> = { size };
    if (params.cursor) query.nextCursor = params.cursor;
    if (params.packageItemStatuses) query.packageItemStatuses = params.packageItemStatuses;
    if (params.lastModifiedStartDate) {
      query.lastModifiedStartDate = params.lastModifiedStartDate.getTime();
    }
    if (params.lastModifiedEndDate) {
      query.lastModifiedEndDate = params.lastModifiedEndDate.getTime();
    }

    interface StreamResponse {
      content?: TrendyolShipmentPackageNode[];
      size?: number;
      hasMore?: boolean;
      nextCursor?: string;
    }
    const data = await this.transport.request<StreamResponse>({
      method: 'GET',
      path: `/integration/order/sellers/${this.transport.sellerId}/orders/stream`,
      query,
      rateLimiter: this.limiter,
    });

    const items = (data.content ?? []).map(normalizePackage);
    const result: CursorPage<ShipmentPackage> = { items };
    if (data.hasMore && data.nextCursor) {
      result.nextCursor = data.nextCursor;
    }
    return result;
  }

  /**
   * Fetch the per-parcel cargo-fee breakdown for a single cargo invoice
   * (Trendyol's `getCargoInvoiceItems`). Useful for reconciling Trendyol's
   * cargo deductions against your shipped packages.
   *
   * `invoiceSerialNumber` is sourced from the Current Account Statement
   * ("Cari Hesap Ekstresi") with `transactionType=DeductionInvoices`.
   *
   * Page-based pagination internally (cursor encodes the page index).
   */
  async getCargoInvoiceItems(
    invoiceSerialNumber: string,
    params: CursorPaginationParams = {},
  ): Promise<CursorPage<CargoInvoiceItem>> {
    const size = Math.min(params.limit ?? 500, 500);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    interface WireRow {
      shipmentPackageType?: string;
      parcelUniqueId?: number | string;
      orderNumber?: string;
      amount?: number;
      desi?: number;
      [key: string]: unknown;
    }
    interface WireResponse {
      page?: number;
      size?: number;
      totalPages?: number;
      totalElements?: number;
      content?: WireRow[];
    }

    const data = await this.transport.request<WireResponse>({
      method: 'GET',
      path: `/integration/finance/che/sellers/${this.transport.sellerId}/cargo-invoice/${encodeURIComponent(invoiceSerialNumber)}/items`,
      query: { page, size },
      rateLimiter: this.limiter,
    });

    const items: CargoInvoiceItem[] = (data.content ?? []).map((row) => {
      const out: CargoInvoiceItem = { raw: row as Record<string, unknown> };
      if (row.shipmentPackageType !== undefined) out.shipmentPackageType = row.shipmentPackageType;
      if (row.parcelUniqueId !== undefined) {
        out.parcelUniqueId =
          typeof row.parcelUniqueId === 'string' ? row.parcelUniqueId : String(row.parcelUniqueId);
      }
      if (row.orderNumber !== undefined) out.orderNumber = row.orderNumber;
      if (typeof row.amount === 'number') out.amount = row.amount;
      if (typeof row.desi === 'number') out.desi = row.desi;
      return out;
    });

    const totalPages = typeof data.totalPages === 'number' ? data.totalPages : 0;
    const result: CursorPage<CargoInvoiceItem> = { items };
    if (page + 1 < totalPages) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Notify Trendyol that a shipped package was returned to you (manual
   * return flow, e.g. customer dropped it at your address or you got the
   * package back without going through Trendyol's return cargo).
   *
   * No body; Trendyol responds with 200 + empty body on success.
   */
  async manualReturnByPackageId(packageId: string | number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `${this.packagePath(packageId)}/manual-return`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Manual-return variant that takes the cargo tracking number instead of
   * the package ID. Useful when the cargo provider's webhook only carries
   * the tracking number.
   *
   * Sibling path (not under `/{packageId}/...`).
   */
  async manualReturnByTrackingNumber(cargoTrackingNumber: string | number): Promise<void> {
    await this.transport.request<unknown>({
      method: 'PUT',
      path: `/integration/order/sellers/${this.transport.sellerId}/shipment-packages/manual-return-by-tracking-number/${encodeURIComponent(String(cargoTrackingNumber))}`,
      rateLimiter: this.limiter,
    });
  }

  /**
   * Fetch Trendyol Express compensation tickets (claims filed when a
   * shipment is lost or damaged in transit). Page-based pagination
   * internally; the SDK exposes the cursor convention.
   *
   * Note the different base path — `/integration/tex/compensation/...`,
   * not the regular `/integration/order/...`.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * const tickets = await client.orders.getCompensationTickets({
   *   startDate: new Date('2026-01-01'),
   *   endDate: new Date('2026-02-01'),
   * });
   * for (const t of tickets.items) {
   *   console.log(t.orderNumber, t.currentState, t.stateMessage);
   * }
   * ```
   */
  async getCompensationTickets(
    params: ListCompensationTicketsParams = {},
  ): Promise<CursorPage<CompensationTicket>> {
    const size = Math.min(params.limit ?? 200, 200);
    const page = params.cursor ? Number.parseInt(params.cursor, 10) : 0;

    const query: Record<string, string | number | undefined> = { page, size };
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();

    interface WireItem {
      itemAmount?: number;
      itemCode?: string;
      itemCount?: number;
      itemName?: string;
    }
    interface WireTicket {
      cargoProvider?: string;
      compensateReason?: string;
      createDate?: number;
      currentState?: string;
      deliveryNumber?: string;
      itemDetails?: WireItem[];
      orderNumber?: string;
      requestedBy?: string;
      stateMessage?: string;
      totalItemsAmount?: string;
      [key: string]: unknown;
    }
    interface WireResponse {
      totalCount?: number;
      /**
       * Trendyol's docs say `data: { items: [...] }` but typical Trendyol
       * paginated responses use `content: [...]` — accept both defensively.
       */
      data?: { items?: WireTicket[]; content?: WireTicket[] } | WireTicket[];
      content?: WireTicket[];
    }

    const res = await this.transport.request<WireResponse>({
      method: 'GET',
      path: `/integration/tex/compensation/sellers/${this.transport.sellerId}/tickets`,
      query,
      rateLimiter: this.limiter,
    });

    const tickets: WireTicket[] = Array.isArray(res.data)
      ? res.data
      : (res.data?.items ?? res.data?.content ?? res.content ?? []);

    const items: CompensationTicket[] = tickets.map((t) => {
      const itemDetails: CompensationItemDetail[] = (t.itemDetails ?? []).map((d) => {
        const out: CompensationItemDetail = {};
        if (typeof d.itemAmount === 'number') out.itemAmount = d.itemAmount;
        if (d.itemCode !== undefined) out.itemCode = d.itemCode;
        if (typeof d.itemCount === 'number') out.itemCount = d.itemCount;
        if (d.itemName !== undefined) out.itemName = d.itemName;
        return out;
      });
      const out: CompensationTicket = {
        itemDetails,
        raw: t as Record<string, unknown>,
      };
      if (t.cargoProvider !== undefined) out.cargoProvider = t.cargoProvider;
      if (t.compensateReason !== undefined) out.compensateReason = t.compensateReason;
      const createdAt = toIso(t.createDate);
      if (createdAt) out.createdAt = createdAt;
      if (t.currentState !== undefined) {
        out.currentState = t.currentState as CompensationTicket['currentState'];
      }
      if (t.deliveryNumber !== undefined) out.deliveryNumber = t.deliveryNumber;
      if (t.orderNumber !== undefined) out.orderNumber = t.orderNumber;
      if (t.requestedBy !== undefined) out.requestedBy = t.requestedBy;
      if (t.stateMessage !== undefined) out.stateMessage = t.stateMessage;
      if (t.totalItemsAmount !== undefined) out.totalItemsAmount = t.totalItemsAmount;
      return out;
    });

    // Paging derived from totalCount vs page*size.
    const result: CursorPage<CompensationTicket> = { items };
    const total = typeof res.totalCount === 'number' ? res.totalCount : 0;
    if ((page + 1) * size < total) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  private packagePath(packageId: string | number): string {
    return `/integration/order/sellers/${this.transport.sellerId}/shipment-packages/${encodeURIComponent(String(packageId))}`;
  }
}
