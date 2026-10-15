import {
  moneyFromMajor,
  TokenBucketRateLimiter,
  TRY,
  ValidationError,
  type CursorPage,
  type Money,
} from '@lonca/core';
import type { N11Transport } from '../transport.js';
import type {
  CancelN11OrderItemParams,
  ListN11OrdersParams,
  N11Address,
  N11CollectionRequestLine,
  N11LaborCost,
  N11LineResult,
  N11OrderLine,
  N11PackageHistory,
  N11ShipmentPackage,
  N11SplitResult,
  SendN11InvoiceLinkParams,
  SplitN11PackageByQuantityParams,
} from '../types/order.js';
import { asText } from '../soap/xml.js';

/** Page size used when `limit` is omitted. */
const DEFAULT_PAGE_SIZE = 50;
/** Documented maximum; prod silently clamps larger values to 100. */
const MAX_PAGE_SIZE = 100;

type Nullable<T> = T | null | undefined;

interface N11AddressWire {
  fullName?: Nullable<string>;
  address?: Nullable<string>;
  city?: Nullable<string>;
  district?: Nullable<string>;
  neighborhood?: Nullable<string>;
  postalCode?: Nullable<string>;
  gsm?: Nullable<string>;
  tcId?: Nullable<string>;
  taxId?: Nullable<string>;
  taxHouse?: Nullable<string>;
  invoiceType?: Nullable<number>;
  countryCode?: Nullable<string>;
}

interface N11OrderLineWire {
  orderLineId?: number | string;
  productId?: Nullable<number | string>;
  productName?: Nullable<string>;
  stockCode?: Nullable<string>;
  barcode?: Nullable<string>;
  quantity?: number;
  price?: Nullable<number>;
  dueAmount?: Nullable<number>;
  sellerInvoiceAmount?: Nullable<number>;
  sellerDiscount?: Nullable<number>;
  sellerCouponDiscount?: Nullable<number>;
  mallDiscount?: Nullable<number>;
  orderItemLineItemStatusName?: Nullable<string>;
  vatRate?: Nullable<number>;
  commissionRate?: Nullable<number>;
  sellerDiscountedPrice?: Nullable<number>;
  totalSellerDiscountPrice?: Nullable<number>;
  totalMallDiscountPrice?: Nullable<number>;
  installmentChargeWithVAT?: Nullable<number>;
  totalLaborCostExcludingVAT?: Nullable<number>;
  sellerCampaignCommissionDiscount?: Nullable<number>;
  sellerCampaignCommissionRate?: Nullable<number>;
  netMarketplaceFeeRate?: Nullable<number>;
  netMarketingFeeRate?: Nullable<number>;
  taxDeductionRate?: Nullable<number>;
  deliveryFeeType?: Nullable<number>;
  sender?: Nullable<string>;
  productOrigin?: Nullable<string>;
  variantAttributes?: Nullable<{ name?: string; value?: string }[]>;
}

/** One package of `GET /rest/delivery/v1/shipmentPackages` as observed on prod (2026-10-10). */
interface N11PackageWire {
  id?: number | string;
  orderNumber?: string;
  shipmentPackageStatus?: string;
  customerId?: Nullable<number | string>;
  /** Lower-case `f` on the wire. */
  customerfullName?: Nullable<string>;
  customerEmail?: Nullable<string>;
  tcIdentityNumber?: Nullable<string>;
  taxId?: Nullable<string>;
  taxOffice?: Nullable<string>;
  billingAddress?: Nullable<N11AddressWire>;
  shippingAddress?: Nullable<N11AddressWire>;
  deliveryAddressType?: Nullable<string>;
  shipmentCompanyId?: Nullable<number | string>;
  cargoProviderName?: Nullable<string>;
  cargoTrackingNumber?: Nullable<string>;
  cargoTrackingLink?: Nullable<string>;
  cargoSenderNumber?: Nullable<string>;
  shipmentMethod?: Nullable<number>;
  totalAmount?: Nullable<number>;
  totalDiscountAmount?: Nullable<number>;
  isReturned?: Nullable<boolean>;
  lastModifiedDate?: Nullable<number>;
  agreedDeliveryDate?: Nullable<number>;
  installmentChargeWithVATprice?: Nullable<number>;
  sellerId?: Nullable<number | string>;
  micro?: Nullable<boolean>;
  invoiceLink?: Nullable<string>;
  invoiceDate?: Nullable<number>;
  etgbNo?: Nullable<string>;
  etgbDate?: Nullable<number>;
  hsCode?: Nullable<string>;
  lines?: Nullable<N11OrderLineWire[]>;
  packageHistories?: Nullable<{ status?: string; createdDate?: Nullable<number> }[]>;
}

/**
 * Page envelope. Unlike `product-query` this is not Spring's: `page`, `size`,
 * `totalPages`, and a `pageCount` that on prod equals the number of rows in
 * the page, not the number of pages.
 */
interface N11PackagePageWire {
  content?: N11PackageWire[];
  totalPages?: number;
  page?: number;
  size?: number;
  pageCount?: number;
}

function money(value: Nullable<number>): Money | undefined {
  return typeof value === 'number' ? moneyFromMajor(value, TRY) : undefined;
}

function isoFromEpoch(value: Nullable<number>): string | undefined {
  return typeof value === 'number' ? new Date(value).toISOString() : undefined;
}

function idOf(value: Nullable<number | string>): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

/** Copy the defined, non-null, non-empty entries of `source` onto `target`. */
function assignDefined<T extends object>(target: T, source: Partial<Record<keyof T, unknown>>): T {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && value !== '') {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}

function normalizeAddress(node: Nullable<N11AddressWire>): N11Address | undefined {
  if (!node) return undefined;
  return assignDefined<N11Address>({}, node);
}

function normalizeLine(node: N11OrderLineWire): N11OrderLine {
  return assignDefined<N11OrderLine>(
    {
      lineId: String(node.orderLineId ?? ''),
      quantity: node.quantity ?? 0,
      variantAttributes: (node.variantAttributes ?? []).map((a) => ({
        name: a.name ?? '',
        value: a.value ?? '',
      })),
      raw: node as Record<string, unknown>,
    },
    {
      productId: idOf(node.productId),
      productName: node.productName,
      stockCode: node.stockCode,
      barcode: node.barcode,
      price: money(node.price),
      dueAmount: money(node.dueAmount),
      sellerInvoiceAmount: money(node.sellerInvoiceAmount),
      sellerDiscount: money(node.sellerDiscount),
      sellerCouponDiscount: money(node.sellerCouponDiscount),
      mallDiscount: money(node.mallDiscount),
      status: node.orderItemLineItemStatusName,
      vatRate: node.vatRate,
      commissionRate: node.commissionRate,
      sellerDiscountedPrice: money(node.sellerDiscountedPrice),
      totalSellerDiscount: money(node.totalSellerDiscountPrice),
      totalMallDiscount: money(node.totalMallDiscountPrice),
      installmentCharge: money(node.installmentChargeWithVAT),
      laborCostExcludingVat: money(node.totalLaborCostExcludingVAT),
      sellerCampaignCommissionDiscount: money(node.sellerCampaignCommissionDiscount),
      sellerCampaignCommissionRate: node.sellerCampaignCommissionRate,
      marketplaceFeeRate: node.netMarketplaceFeeRate,
      marketingFeeRate: node.netMarketingFeeRate,
      taxDeductionRate: node.taxDeductionRate,
      deliveryFeeType: node.deliveryFeeType,
      sender: node.sender,
      productOrigin: node.productOrigin,
    },
  );
}

function normalizeHistory(node: {
  status?: string;
  createdDate?: Nullable<number>;
}): N11PackageHistory {
  return assignDefined<N11PackageHistory>(
    { status: node.status ?? '' },
    { createdAt: isoFromEpoch(node.createdDate) },
  );
}

function normalizePackage(row: N11PackageWire): N11ShipmentPackage {
  return assignDefined<N11ShipmentPackage>(
    {
      id: String(row.id ?? ''),
      orderNumber: row.orderNumber ?? '',
      status: row.shipmentPackageStatus ?? '',
      lines: (row.lines ?? []).map(normalizeLine),
      histories: (row.packageHistories ?? []).map(normalizeHistory),
      raw: row as Record<string, unknown>,
    },
    {
      customerId: idOf(row.customerId),
      customerFullName: row.customerfullName,
      customerEmail: row.customerEmail,
      tcIdentityNumber: row.tcIdentityNumber,
      taxId: row.taxId,
      taxOffice: row.taxOffice,
      billingAddress: normalizeAddress(row.billingAddress),
      shippingAddress: normalizeAddress(row.shippingAddress),
      deliveryAddressType: row.deliveryAddressType,
      shipmentCompanyId: idOf(row.shipmentCompanyId),
      cargoProviderName: row.cargoProviderName,
      cargoTrackingNumber: row.cargoTrackingNumber,
      cargoTrackingLink: row.cargoTrackingLink,
      cargoSenderNumber: row.cargoSenderNumber,
      shipmentMethod: row.shipmentMethod,
      totalAmount: money(row.totalAmount),
      totalDiscountAmount: money(row.totalDiscountAmount),
      isReturned: row.isReturned,
      lastModifiedAt: isoFromEpoch(row.lastModifiedDate),
      agreedDeliveryAt: isoFromEpoch(row.agreedDeliveryDate),
      installmentCharge: money(row.installmentChargeWithVATprice),
      sellerId: idOf(row.sellerId),
      isMicroExport: row.micro ?? undefined,
      invoiceLink: row.invoiceLink,
      invoiceAt: isoFromEpoch(row.invoiceDate),
      etgbNo: row.etgbNo,
      etgbAt: isoFromEpoch(row.etgbDate),
      hsCode: row.hsCode,
    },
  );
}

function epoch(value: Date | number | undefined): number | undefined {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * n11 order reads (`GET https://api.n11.com/rest/delivery/v1/shipmentPackages`).
 *
 * Source: developer.n11.com → "Sipariş Listeleme Servisi" (at most 1000
 * requests/minute, `size` at most 100, a 15-day date window, nothing before
 * November 2024). Response shape verified against prod on 2026-10-10.
 *
 * Rate limit: the documented 1000 requests/minute is applied by default; pass
 * a limiter to share one bucket across clients using the same key.
 */
export class OrdersResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: N11Transport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  /**
   * List shipment packages, one page at a time. The 0-based page index is the
   * `CursorPage` cursor, so `paginate()` from `@lonca/core` drives it.
   */
  async list(params: ListN11OrdersParams = {}): Promise<CursorPage<N11ShipmentPackage>> {
    const page = parsePageCursor(params.cursor);
    const size = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const data = await this.transport.request<N11PackagePageWire | undefined>({
      method: 'GET',
      path: '/rest/delivery/v1/shipmentPackages',
      query: {
        status: params.status,
        startDate: epoch(params.startDate),
        endDate: epoch(params.endDate),
        orderNumber: params.orderNumber,
        orderByField: params.orderByField,
        orderByDirection: params.orderByDirection,
        page,
        size,
      },
      rateLimiter: this.limiter,
    });

    const rows = data?.content ?? [];
    const result: CursorPage<N11ShipmentPackage> = { items: rows.map(normalizePackage) };
    const totalPages = data?.totalPages;
    if (rows.length > 0 && (totalPages === undefined || page + 1 < totalPages)) {
      result.nextCursor = String(page + 1);
    }
    return result;
  }

  /**
   * Approve order lines (`PUT /rest/order/v1/update`, status `Picking`). Only
   * lines in `Created` can be approved. n11 processes the valid lines and
   * reports the rest per line; a line id it does not know is left out of the
   * result entirely (observed on the test store), so compare the result with
   * what you sent.
   */
  async approve(lineIds: readonly (string | number)[]): Promise<N11LineResult[]> {
    requireItems('orders.approve', lineIds);
    const data = await this.transport.request<LineResultsWire | undefined>({
      method: 'PUT',
      path: '/rest/order/v1/update',
      body: { lines: lineIds.map((id) => ({ lineId: Number(id) })), status: 'Picking' },
    });
    return lineResults(data);
  }

  /**
   * Split a `Picking` package into new packages
   * (`POST /rest/delivery/v1/splitCombinePackage`): each group of line ids
   * becomes one package, and lines you leave out form another. The original
   * package becomes `Unpacked`; the new ones are `Picking` with their own id
   * and campaign code.
   */
  async splitPackage(groups: readonly (readonly (string | number)[])[]): Promise<N11SplitResult> {
    requireItems('orders.splitPackage', groups);
    const data = await this.transport.request<SplitResultWire | undefined>({
      method: 'POST',
      path: '/rest/delivery/v1/splitCombinePackage',
      body: { splitGroups: groups.map((ids) => ({ orderLineIds: ids.map(Number) })) },
    });
    return splitResult(data);
  }

  /**
   * Split a `Picking` package by quantity, optionally cancelling quantities at
   * the same time (`POST /rest/delivery/v1/splitPackageByQuantity`). Lines of
   * one order only. n11 authorises this service per store, on request.
   */
  async splitPackageByQuantity(params: SplitN11PackageByQuantityParams): Promise<N11SplitResult> {
    requireItems('orders.splitPackageByQuantity', params.packages);
    const body: Record<string, unknown> = {
      splitPackages: params.packages.map((lines) => ({
        packageDetails: lines.map((l) => ({
          orderLineId: Number(l.lineId),
          quantities: l.quantity,
        })),
      })),
    };
    if (params.cancel?.length) {
      body.cancelledItems = params.cancel.map((c) => ({
        cancelReasonId: c.reasonId,
        orderLineId: Number(c.lineId),
        quantity: c.quantity,
      }));
    }
    const data = await this.transport.request<SplitResultWire | undefined>({
      method: 'POST',
      path: '/rest/delivery/v1/splitPackageByQuantity',
      body,
    });
    return splitResult(data);
  }

  /**
   * Ask a logistics company (Horoz, Ceva, Borusan) to collect a `Picking`
   * package (`PUT /rest/delivery/v1/collectionRequest`). Send every line of
   * the package. Returns n11's `{ code, message }`.
   *
   * Only packages shipped by one of those logistics companies qualify. A line
   * shipped with a parcel carrier (Aras, Yurtiçi, …) fails with
   * `SELLER_API.orderItemInvalidForCollectionRequest`, and a store n11 has not
   * enabled fails with "Satıcı toplama talebi için uygun değil" (both
   * `ValidationError`).
   */
  async createCollectionRequest(
    lines: readonly N11CollectionRequestLine[],
  ): Promise<{ code?: number; message?: string }> {
    requireItems('orders.createCollectionRequest', lines);
    const data = await this.transport.request<{ code?: number; message?: string } | undefined>({
      method: 'PUT',
      path: '/rest/delivery/v1/collectionRequest',
      body: {
        collectionRequestDetails: lines.map((l) => ({
          id: l.packageId,
          orderLineId: Number(l.lineId),
          boxQuantity: l.boxQuantity,
          desi: l.desi,
          shipmentCompany: l.shipmentCompany,
        })),
      },
    });
    const result: { code?: number; message?: string } = {};
    if (data?.code !== undefined) result.code = data.code;
    if (data?.message !== undefined) result.message = data.message;
    return result;
  }

  /**
   * Add labour costs to order lines (`PUT /rest/order/v1/labor-costs`), for
   * the jewellery categories n11 lists (gold, silver, diamond, …; the list is
   * on the endpoint's docs page). Results are per line, like {@link approve};
   * a line in another category comes back `FAIL` "kategori uyumsuzdur".
   */
  async updateLaborCosts(costs: readonly N11LaborCost[]): Promise<N11LineResult[]> {
    requireItems('orders.updateLaborCosts', costs);
    const data = await this.transport.request<LineResultsWire | undefined>({
      method: 'PUT',
      path: '/rest/order/v1/labor-costs',
      body: {
        laborCostDetails: costs.map((c) => ({
          orderLineId: Number(c.lineId),
          totalLaborCostExcludingVAT: c.amountExcludingVat,
          laborVatRate: c.vatRate ?? null,
        })),
      },
    });
    return lineResults(data);
  }

  /**
   * Cancel part of an approved order line (SOAP `ClaimCancelPartial`). Lines
   * still `Created` cannot be cancelled this way (the seller rejects them in
   * Seller Office). A line in the wrong state fails with
   * `SELLER_API.claimCancel.invalidRequestForPartial` (`ValidationError`).
   */
  async cancelItem(params: CancelN11OrderItemParams): Promise<void> {
    await this.transport.soap({
      service: 'claimCancelService',
      operation: 'ClaimCancelPartial',
      fields: {
        orderItemId: String(params.lineId),
        cancelQuantity: params.quantity,
        cancelReasonTypeId: String(params.reasonId),
        cancelReasonDescription: params.description,
      },
      idempotent: false,
    });
  }

  /**
   * Attach an invoice link to an order (SOAP `SaveLinkSellerInvoice`). An
   * unknown order number fails with `SELLER_API.order.not.found`
   * (`NotFoundError`).
   *
   * @throws {ValidationError} when `url` is not HTTPS or is longer than 2048
   *   characters (checked before sending).
   */
  async sendInvoiceLink(params: SendN11InvoiceLinkParams): Promise<{ url?: string }> {
    if (!params.url.startsWith('https://') || params.url.length > 2048) {
      throw new ValidationError({
        message: 'orders.sendInvoiceLink: url must be an https:// link of at most 2048 characters',
      });
    }
    const invoiceDate =
      params.invoiceDate instanceof Date ? params.invoiceDate.getTime() : params.invoiceDate;
    const response = await this.transport.soap({
      service: 'sellerInvoiceService',
      operation: 'SaveLinkSellerInvoice',
      fields: {
        url: params.url,
        orderNumber: params.orderNumber,
        invoiceDateTime: invoiceDate,
        invoiceNumber: params.invoiceNumber,
      },
      idempotent: false,
    });
    const url = asText(response.url);
    return url ? { url } : {};
  }
}

interface LineResultsWire {
  content?: {
    lineId?: number | string;
    status?: string;
    reasons?: string | null;
    details?: Record<string, unknown> | null;
  }[];
}

interface SplitResultWire {
  code?: number;
  message?: string;
  splitPackageOrderItems?: {
    orderNumber?: string | number;
    packageId?: string | number;
    orderLineId?: string | number;
    stockCode?: string;
    quantity?: number;
  }[];
}

function requireItems(method: string, items: readonly unknown[]): void {
  if (items.length === 0) {
    throw new ValidationError({ message: `${method}: at least one item is required` });
  }
}

function lineResults(data: LineResultsWire | undefined): N11LineResult[] {
  return (data?.content ?? []).map((row) => {
    const result: N11LineResult = { lineId: String(row.lineId ?? ''), status: row.status ?? '' };
    if (row.reasons) result.reason = row.reasons;
    if (row.details) result.details = row.details;
    return result;
  });
}

function splitResult(data: SplitResultWire | undefined): N11SplitResult {
  const result: N11SplitResult = {
    items: (data?.splitPackageOrderItems ?? []).map((item) => {
      const out: N11SplitResult['items'][number] = {};
      if (item.orderNumber !== undefined) out.orderNumber = String(item.orderNumber);
      if (item.packageId !== undefined) out.packageId = String(item.packageId);
      if (item.orderLineId !== undefined) out.lineId = String(item.orderLineId);
      if (item.stockCode !== undefined) out.stockCode = item.stockCode;
      if (item.quantity !== undefined) out.quantity = item.quantity;
      return out;
    }),
  };
  if (data?.code !== undefined) result.code = data.code;
  if (data?.message !== undefined) result.message = data.message;
  return result;
}

function parsePageCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 0) {
    throw new TypeError(`n11 orders cursor must be a non-negative page index, got "${cursor}"`);
  }
  return page;
}
