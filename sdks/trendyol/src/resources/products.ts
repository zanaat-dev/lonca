import {
  TokenBucketRateLimiter,
  ValidationError,
  type CursorPage,
  type CursorPaginationParams,
} from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  ApprovedProductStatus,
  BatchRequestItemResult,
  BatchRequestResult,
  BuyboxInfo,
  NamedRef,
  Product,
  ProductAttribute,
  ProductBase,
  ProductStockPrice,
  ProductStockPriceVariant,
  ProductVariant,
  UnapprovedProduct,
  UnapprovedProductRejectReason,
} from '../types/product.js';
import type {
  BatchAcceptedResponse,
  CreateProductV2Input,
  UpdateContentInput,
  UpdateDeliveryInfoInput,
  UpdateUnapprovedInput,
  UpdateVariantInput,
} from '../types/product-write.js';

const DEFAULT_PAGE_SIZE = 50;
/** Trendyol caps `page × size` at 10,000; we cap `size` defensively. */
const MAX_PAGE_SIZE = 1000;
/** The inventory-and-price endpoint caps `size` at 100 (tighter than `list`). */
const MAX_INVENTORY_PAGE_SIZE = 100;

export interface ListProductsParams extends CursorPaginationParams {
  /** Filter by a single barcode. */
  barcode?: string;
  /** Filter products updated on or after this date (Trendyol expects ms-epoch). */
  startDate?: Date;
  /** Filter products updated on or before this date. */
  endDate?: Date;
}

/**
 * Filters for `products.listInventoryAndPrice` (Trendyol's lightweight
 * `inventory-and-price` approved-product filter). All filters are optional;
 * pass none to page through every approved product's stock + price.
 */
export interface ListInventoryAndPriceParams extends CursorPaginationParams {
  /** Filter by a single barcode. */
  barcode?: string;
  /** Filter by a single contentId. */
  contentId?: string;
  /** Filter by the seller's stock code. */
  stockCode?: string;
  /** Filter by the seller's productMainId. */
  productMainId?: string;
  /** Filter by listing status (archived / blacklisted / locked / onSale / notOnSale). */
  status?: ApprovedProductStatus;
  /**
   * Sort by `SellerCreatedDate`. `ASC` = oldest→newest, `DESC` = newest→oldest.
   */
  orderByDirection?: 'ASC' | 'DESC';
  /**
   * Storefront code sent as the `storeFrontCode` header. Required on the
   * International marketplace; optional on the Türkiye marketplace.
   */
  storeFrontCode?: string;
}

/** Date field to filter against on `listUnapproved` (default: server choice). */
export type UnapprovedDateQueryType = 'CREATED_DATE' | 'LAST_MODIFIED_DATE';

export interface ListUnapprovedProductsParams extends CursorPaginationParams {
  barcode?: string;
  startDate?: Date;
  endDate?: Date;
  /** Choose which date `startDate`/`endDate` apply to. */
  dateQueryType?: UnapprovedDateQueryType;
  /**
   * Optional override of the seller-scoped query (rare; defaults to the
   * client's `sellerId`).
   */
  supplierId?: number;
}

/** Trendyol caps `barcodes` at 10 for the buybox endpoint. */
const MAX_BUYBOX_BARCODES = 10;

// ─── Wire types (Trendyol's real shape, verified live) ──────────────────────

interface TrendyolRef {
  id?: number | string;
  name?: string;
}

interface TrendyolAttributeNode {
  attributeId?: number | string;
  attributeName?: string;
  attributeValueId?: number | string;
  attributeValue?: string;
}

interface TrendyolVariantNode {
  variantId?: number | string;
  barcode?: string;
  commission?: number;
  attributes?: TrendyolAttributeNode[];
  productUrl?: string;
  onSale?: boolean;
  stock?: { quantity?: number } | number;
  [key: string]: unknown;
}

interface TrendyolProductNode {
  contentId?: number | string;
  productMainId?: string;
  title?: string;
  description?: string;
  brand?: TrendyolRef;
  category?: TrendyolRef;
  images?: Array<{ url?: string } | string>;
  attributes?: TrendyolAttributeNode[];
  variants?: TrendyolVariantNode[];
  creationDate?: number;
  lastModifiedDate?: number;
  lastModifiedBy?: string;
  [key: string]: unknown;
}

interface TrendyolFilterResponse {
  content?: TrendyolProductNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
  nextPageToken?: string;
}

// ─── Inventory-and-price (stock + price only) wire shape ────────────────────
// Verified live against Trendyol STAGE on 2026-06-03 (seller 2738):
// response keys totalElements/totalPages/page/size/nextPageToken/content;
// variant keys variantId/barcode/salePrice/listPrice/quantity/stockCode/
// stockLastModifiedDate. `storeFrontCode` header is NOT required on the
// Türkiye marketplace (200 without it).

interface TrendyolStockPriceVariantNode {
  variantId?: number | string;
  barcode?: string;
  salePrice?: number;
  listPrice?: number;
  quantity?: number;
  stockCode?: string;
  /** ms-epoch; `null` when stock was never updated. */
  stockLastModifiedDate?: number | null;
  [key: string]: unknown;
}

interface TrendyolStockPriceNode {
  contentId?: number | string;
  productMainId?: string;
  variants?: TrendyolStockPriceVariantNode[];
  [key: string]: unknown;
}

interface TrendyolStockPriceResponse {
  content?: TrendyolStockPriceNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
  nextPageToken?: string;
}

// ─── Unapproved (draft) products wire shape (verified STAGE 2026-05-25) ────

interface TrendyolUnapprovedRejectReason {
  rejectReason?: string;
  rejectReasonDetail?: string;
}

interface TrendyolUnapprovedNode {
  supplierId?: number | string;
  productMainId?: string;
  status?: string;
  createDateTime?: number;
  lastUpdateDate?: number;
  lastPriceChangeDate?: number;
  lastStockChangeDate?: number;
  brand?: TrendyolRef;
  category?: TrendyolRef;
  barcode?: string;
  title?: string;
  description?: string;
  quantity?: number;
  listPrice?: number;
  salePrice?: number;
  vatRate?: number;
  dimensionalWeight?: number | null;
  stockCode?: string;
  origin?: string | null;
  /** Spec calls this `media`; live wire returns `images`. We accept both. */
  images?: Array<{ url?: string } | string>;
  media?: Array<{ url?: string } | string>;
  attributes?: TrendyolAttributeNode[];
  rejectReasonDetails?: TrendyolUnapprovedRejectReason[];
  locationBasedDelivery?: 'ENABLED' | 'DISABLED' | null;
  lotNumber?: string | null;
  specialConsumptionTax?: number | null;
  sgrPrice?: number | null;
  [key: string]: unknown;
}

interface TrendyolUnapprovedResponse {
  content?: TrendyolUnapprovedNode[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
  size?: number;
  nextPageToken?: string;
}

// ─── Buybox + ProductBase wire shapes ──────────────────────────────────────

interface TrendyolBuyboxInfoNode {
  barcode?: string;
  buyboxOrder?: number;
  buyboxPrice?: number;
  hasMultipleSeller?: boolean;
  secondBuyboxPrice?: number | null;
  thirdBuyboxPrice?: number | null;
  [key: string]: unknown;
}

interface TrendyolBuyboxResponse {
  buyboxInfo?: TrendyolBuyboxInfoNode[];
  /** Some Trendyol responses use `content` instead — accept both defensively. */
  content?: TrendyolBuyboxInfoNode[];
}

interface TrendyolProductBaseResponse {
  barcode?: string;
  approved?: boolean;
  approvedDate?: number;
  archived?: boolean;
  listingId?: string;
  contentId?: number | string;
  [key: string]: unknown;
}

interface TrendyolBatchResultResponse {
  batchRequestId?: string;
  status?: string;
  itemCount?: number;
  failedItemCount?: number;
  items?: Array<{
    requestItem?: unknown;
    status?: string;
    failureReasons?: string[];
  }>;
  creationDate?: number;
  lastModification?: number;
  sourceType?: string;
  batchRequestType?: string;
  notes?: string;
  objectKey?: string;
  storeFrontCode?: string;
  [key: string]: unknown;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function normalizeRef(ref: TrendyolRef | undefined): NamedRef {
  return {
    id: ref?.id !== undefined ? String(ref.id) : '',
    name: ref?.name ?? '',
  };
}

function normalizeAttribute(attr: TrendyolAttributeNode): ProductAttribute {
  const out: ProductAttribute = {
    attributeId: attr.attributeId !== undefined ? String(attr.attributeId) : '',
  };
  if (attr.attributeName !== undefined) out.attributeName = attr.attributeName;
  if (attr.attributeValueId !== undefined) {
    out.attributeValueId = String(attr.attributeValueId);
  }
  if (attr.attributeValue !== undefined) out.attributeValue = attr.attributeValue;
  return out;
}

function normalizeImages(images: TrendyolProductNode['images']): string[] {
  if (!images) return [];
  return images
    .map((img) => (typeof img === 'string' ? img : img?.url))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function normalizeStock(stock: TrendyolVariantNode['stock']): number | undefined {
  if (typeof stock === 'number') return stock;
  if (stock && typeof stock === 'object' && typeof stock.quantity === 'number') {
    return stock.quantity;
  }
  return undefined;
}

function normalizeVariant(variant: TrendyolVariantNode): ProductVariant {
  const out: ProductVariant = {
    variantId: variant.variantId !== undefined ? String(variant.variantId) : '',
    barcode: variant.barcode ?? '',
    attributes: (variant.attributes ?? []).map(normalizeAttribute),
    raw: variant as Record<string, unknown>,
  };
  if (typeof variant.commission === 'number') out.commission = variant.commission;
  if (variant.productUrl !== undefined) out.productUrl = variant.productUrl;
  if (typeof variant.onSale === 'boolean') out.onSale = variant.onSale;
  const stock = normalizeStock(variant.stock);
  if (stock !== undefined) out.stock = stock;
  return out;
}

function toIso(epochMs: number | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return undefined;
  return new Date(epochMs).toISOString();
}

function normalizeProduct(node: TrendyolProductNode): Product {
  const out: Product = {
    contentId: node.contentId !== undefined ? String(node.contentId) : '',
    productMainId: node.productMainId ?? '',
    title: node.title ?? '',
    brand: normalizeRef(node.brand),
    category: normalizeRef(node.category),
    images: normalizeImages(node.images),
    attributes: (node.attributes ?? []).map(normalizeAttribute),
    variants: (node.variants ?? []).map(normalizeVariant),
    createdAt: toIso(node.creationDate) ?? '',
    updatedAt: toIso(node.lastModifiedDate) ?? '',
    raw: node as Record<string, unknown>,
  };
  if (node.description !== undefined) out.description = node.description;
  if (node.lastModifiedBy !== undefined) out.lastModifiedBy = node.lastModifiedBy;
  return out;
}

function normalizeStockPriceVariant(node: TrendyolStockPriceVariantNode): ProductStockPriceVariant {
  const out: ProductStockPriceVariant = {
    variantId: node.variantId !== undefined ? String(node.variantId) : '',
    barcode: node.barcode ?? '',
    raw: node as Record<string, unknown>,
  };
  if (typeof node.salePrice === 'number') out.salePrice = node.salePrice;
  if (typeof node.listPrice === 'number') out.listPrice = node.listPrice;
  if (typeof node.quantity === 'number') out.quantity = node.quantity;
  if (node.stockCode !== undefined) out.stockCode = node.stockCode;
  if (node.stockLastModifiedDate !== undefined && node.stockLastModifiedDate !== null) {
    const iso = toIso(node.stockLastModifiedDate);
    if (iso) out.stockLastModifiedAt = iso;
  }
  return out;
}

function normalizeStockPrice(node: TrendyolStockPriceNode): ProductStockPrice {
  return {
    contentId: node.contentId !== undefined ? String(node.contentId) : '',
    productMainId: node.productMainId ?? '',
    variants: (node.variants ?? []).map(normalizeStockPriceVariant),
    raw: node as Record<string, unknown>,
  };
}

function normalizeUnapprovedRejectReason(
  r: TrendyolUnapprovedRejectReason,
): UnapprovedProductRejectReason {
  const out: UnapprovedProductRejectReason = {};
  if (r.rejectReason !== undefined) out.rejectReason = r.rejectReason;
  if (r.rejectReasonDetail !== undefined) out.rejectReasonDetail = r.rejectReasonDetail;
  return out;
}

function normalizeUnapproved(node: TrendyolUnapprovedNode): UnapprovedProduct {
  // Spec calls it `media`, live wire calls it `images` — accept both, prefer `images`.
  const imagesSource = node.images ?? node.media;
  const out: UnapprovedProduct = {
    productMainId: node.productMainId ?? '',
    brand: normalizeRef(node.brand),
    category: normalizeRef(node.category),
    barcode: node.barcode ?? '',
    title: node.title ?? '',
    images: normalizeImages(imagesSource),
    attributes: (node.attributes ?? []).map(normalizeAttribute),
    rejectReasonDetails: (node.rejectReasonDetails ?? []).map(normalizeUnapprovedRejectReason),
    raw: node as Record<string, unknown>,
  };
  if (node.supplierId !== undefined) out.supplierId = String(node.supplierId);
  if (node.status !== undefined) out.status = node.status as UnapprovedProduct['status'];
  if (node.description !== undefined) out.description = node.description;
  if (typeof node.quantity === 'number') out.quantity = node.quantity;
  if (typeof node.listPrice === 'number') out.listPrice = node.listPrice;
  if (typeof node.salePrice === 'number') out.salePrice = node.salePrice;
  if (typeof node.vatRate === 'number') out.vatRate = node.vatRate;
  if (node.dimensionalWeight !== undefined && node.dimensionalWeight !== null) {
    out.dimensionalWeight = node.dimensionalWeight;
  }
  if (node.stockCode !== undefined) out.stockCode = node.stockCode;
  if (node.origin !== undefined) out.origin = node.origin;
  if (node.locationBasedDelivery !== undefined) {
    out.locationBasedDelivery = node.locationBasedDelivery;
  }
  if (node.lotNumber !== undefined) out.lotNumber = node.lotNumber;
  if (node.specialConsumptionTax !== undefined) {
    out.specialConsumptionTax = node.specialConsumptionTax;
  }
  if (node.sgrPrice !== undefined) out.sgrPrice = node.sgrPrice;
  const createdAt = toIso(node.createDateTime);
  if (createdAt) out.createdAt = createdAt;
  const updatedAt = toIso(node.lastUpdateDate);
  if (updatedAt) out.updatedAt = updatedAt;
  const priceChanged = toIso(node.lastPriceChangeDate);
  if (priceChanged) out.lastPriceChangedAt = priceChanged;
  const stockChanged = toIso(node.lastStockChangeDate);
  if (stockChanged) out.lastStockChangedAt = stockChanged;
  return out;
}

function normalizeBuyboxInfo(node: TrendyolBuyboxInfoNode): BuyboxInfo {
  const out: BuyboxInfo = {
    barcode: node.barcode ?? '',
    raw: node as Record<string, unknown>,
  };
  if (typeof node.buyboxOrder === 'number') out.buyboxOrder = node.buyboxOrder;
  if (typeof node.buyboxPrice === 'number') out.buyboxPrice = node.buyboxPrice;
  if (typeof node.hasMultipleSeller === 'boolean') {
    out.hasMultipleSeller = node.hasMultipleSeller;
  }
  if (node.secondBuyboxPrice !== undefined) out.secondBuyboxPrice = node.secondBuyboxPrice;
  if (node.thirdBuyboxPrice !== undefined) out.thirdBuyboxPrice = node.thirdBuyboxPrice;
  return out;
}

function normalizeProductBase(data: TrendyolProductBaseResponse): ProductBase {
  const out: ProductBase = {
    barcode: data.barcode ?? '',
    approved: !!data.approved,
    archived: !!data.archived,
    raw: data as Record<string, unknown>,
  };
  const approvedAt = toIso(data.approvedDate);
  if (approvedAt) out.approvedAt = approvedAt;
  if (data.listingId !== undefined) out.listingId = data.listingId;
  if (data.contentId !== undefined) out.contentId = String(data.contentId);
  return out;
}

function normalizeBatchResult(data: TrendyolBatchResultResponse): BatchRequestResult {
  const items: BatchRequestItemResult[] = (data.items ?? []).map((item) => {
    const result: BatchRequestItemResult = {};
    if (item.requestItem !== undefined) result.requestItem = item.requestItem;
    if (item.status !== undefined) result.status = item.status;
    if (item.failureReasons !== undefined) result.failureReasons = item.failureReasons;
    return result;
  });
  const out: BatchRequestResult = {
    batchRequestId: typeof data.batchRequestId === 'string' ? data.batchRequestId : '',
    status: (data.status as BatchRequestResult['status']) ?? 'PROCESSING',
    items,
    raw: data as Record<string, unknown>,
  };
  if (typeof data.itemCount === 'number') out.itemCount = data.itemCount;
  if (typeof data.failedItemCount === 'number') out.failedItemCount = data.failedItemCount;
  const createdAt = toIso(data.creationDate);
  if (createdAt) out.createdAt = createdAt;
  const lastModifiedAt = toIso(data.lastModification);
  if (lastModifiedAt) out.lastModifiedAt = lastModifiedAt;
  if (data.sourceType !== undefined) out.sourceType = data.sourceType;
  if (data.batchRequestType !== undefined) out.batchRequestType = data.batchRequestType;
  if (data.notes !== undefined) out.notes = data.notes;
  if (data.objectKey !== undefined) out.objectKey = data.objectKey;
  if (data.storeFrontCode !== undefined) out.storeFrontCode = data.storeFrontCode;
  return out;
}

/** Trendyol caps `items[]` at 1000 for every async write endpoint. */
const MAX_WRITE_ITEMS = 1000;
/** Trendyol's documented service-limits cap delete at 100 req/min (separate bucket). */
const DELETE_RATE_PER_MIN = 100;

/**
 * Trendyol product read + write + lifecycle + batch-result endpoints.
 *
 * Rate limits (per Trendyol service limits):
 * - filterProducts (approved + unapproved + getProductBase): 2000 req/min
 * - getBatchRequestResult: 1000 req/min
 * - getBuyboxInformation: 1000 req/min
 * - create/update/archive/unlock product writes: 1000 req/min (shared bucket)
 * - delete: 100 req/min (separate bucket)
 */
export class ProductsResource {
  private readonly filterLimiter: TokenBucketRateLimiter;
  private readonly batchLimiter: TokenBucketRateLimiter;
  private readonly buyboxLimiter: TokenBucketRateLimiter;
  private readonly writeLimiter: TokenBucketRateLimiter;
  private readonly deleteLimiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    options: {
      filterLimiter?: TokenBucketRateLimiter;
      batchLimiter?: TokenBucketRateLimiter;
      buyboxLimiter?: TokenBucketRateLimiter;
      writeLimiter?: TokenBucketRateLimiter;
      deleteLimiter?: TokenBucketRateLimiter;
    } = {},
  ) {
    this.filterLimiter =
      options.filterLimiter ?? new TokenBucketRateLimiter({ capacity: 2000, intervalMs: 60_000 });
    this.batchLimiter =
      options.batchLimiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
    this.buyboxLimiter =
      options.buyboxLimiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
    this.writeLimiter =
      options.writeLimiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
    this.deleteLimiter =
      options.deleteLimiter ??
      new TokenBucketRateLimiter({ capacity: DELETE_RATE_PER_MIN, intervalMs: 60_000 });
  }

  private validateBarcodes(barcodes: string[], methodLabel: string): void {
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      throw new ValidationError({ message: `${methodLabel}: barcodes must not be empty` });
    }
    if (barcodes.length > MAX_WRITE_ITEMS) {
      throw new ValidationError({
        message: `${methodLabel}: max ${MAX_WRITE_ITEMS} barcodes per call (got ${barcodes.length})`,
      });
    }
  }

  private async submitWrite<T>(
    endpoint: string,
    items: T[],
    methodLabel: string,
  ): Promise<BatchAcceptedResponse> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError({ message: `${methodLabel}: items must not be empty` });
    }
    if (items.length > MAX_WRITE_ITEMS) {
      throw new ValidationError({
        message: `${methodLabel}: max ${MAX_WRITE_ITEMS} items per call (got ${items.length})`,
      });
    }
    const data = await this.transport.request<BatchAcceptedResponse>({
      method: 'POST',
      path: `/integration/product/sellers/${this.transport.sellerId}${endpoint}`,
      body: { items },
      rateLimiter: this.writeLimiter,
    });
    return { batchRequestId: data?.batchRequestId ?? '' };
  }

  /**
   * List approved products. Use `paginate()` from `@lonca/core` to iterate
   * lazily across pages.
   *
   * **Approved only:** this endpoint silently excludes products still in review
   * or rejected — use {@link listUnapproved} for those. Date fields on the
   * returned {@link Product} (`createdAt` / `updatedAt`) are ISO 8601 UTC
   * **strings**, not `Date` objects.
   *
   * Trendyol exposes both page-based and `nextPageToken`-based pagination
   * (the latter required when the dataset exceeds 10,000 items). The SDK
   * picks the right strategy automatically — pass our opaque `cursor` from
   * the previous response and we forward it as `nextPageToken`.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const product of paginate((p) => client.products.list(p))) {
   *   for (const variant of product.variants) {
   *     console.log(variant.barcode, product.title);
   *   }
   * }
   * ```
   */
  async list(params: ListProductsParams = {}): Promise<CursorPage<Product>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const query: Record<string, string | number | undefined> = { size };
    if (params.cursor) {
      query.nextPageToken = params.cursor;
    } else {
      query.page = 0;
    }
    if (params.barcode) query.barcode = params.barcode;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();

    const data = await this.transport.request<TrendyolFilterResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/approved`,
      query,
      rateLimiter: this.filterLimiter,
    });

    const items = (data.content ?? []).map(normalizeProduct);
    const page: CursorPage<Product> = { items };
    if (data.nextPageToken) {
      page.nextCursor = data.nextPageToken;
    }
    return page;
  }

  /**
   * List **stock and price** for approved products — Trendyol's lightweight
   * `inventory-and-price` filter. A slim alternative to {@link list} when you
   * only need pricing + stock: the response carries `contentId`,
   * `productMainId`, and a `variants[]` array with `barcode`, `salePrice`,
   * `listPrice`, `quantity`, `stockCode`, and `stockLastModifiedAt` — nothing
   * else.
   *
   * Filter by `barcode`, `contentId`, `stockCode`, `productMainId`, or listing
   * `status`. Sort with `orderByDirection` (`SellerCreatedDate`). `size` caps
   * at **100** here (tighter than `list`'s 1000).
   *
   * Pagination follows the same convention as {@link list}: pass our opaque
   * `cursor` from the previous response and we forward it as `nextPageToken`
   * (required once the dataset exceeds 10,000 items).
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const p of paginate((q) =>
   *   client.products.listInventoryAndPrice({ ...q, status: 'onSale' }),
   * )) {
   *   for (const v of p.variants) {
   *     console.log(v.barcode, v.quantity, v.salePrice);
   *   }
   * }
   * ```
   */
  async listInventoryAndPrice(
    params: ListInventoryAndPriceParams = {},
  ): Promise<CursorPage<ProductStockPrice>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_INVENTORY_PAGE_SIZE);
    const query: Record<string, string | number | undefined> = { size };
    if (params.cursor) {
      query.nextPageToken = params.cursor;
    } else {
      query.page = 0;
    }
    if (params.barcode) query.barcode = params.barcode;
    if (params.contentId) query.contentId = params.contentId;
    if (params.stockCode) query.stockCode = params.stockCode;
    if (params.productMainId) query.productMainId = params.productMainId;
    if (params.status) query.status = params.status;
    if (params.orderByDirection) query.orderByDirection = params.orderByDirection;

    const headers = params.storeFrontCode ? { storeFrontCode: params.storeFrontCode } : undefined;

    const data = await this.transport.request<TrendyolStockPriceResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/approved/inventory-and-price`,
      query,
      headers,
      rateLimiter: this.filterLimiter,
    });

    const items = (data.content ?? []).map(normalizeStockPrice);
    const page: CursorPage<ProductStockPrice> = { items };
    if (data.nextPageToken) {
      page.nextCursor = data.nextPageToken;
    }
    return page;
  }

  /**
   * Poll a batch request returned by an async write (e.g. `createProducts`,
   * `updatePriceAndInventory`).
   *
   * Trendyol retains batch results for **4 hours** after the originating
   * request — poll within that window.
   *
   * @param batchRequestId The opaque ID returned by the originating call.
   */
  async getBatchStatus(batchRequestId: string): Promise<BatchRequestResult> {
    const id = encodeURIComponent(batchRequestId);
    const data = await this.transport.request<TrendyolBatchResultResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/batch-requests/${id}`,
      rateLimiter: this.batchLimiter,
    });
    return normalizeBatchResult(data);
  }

  /**
   * List **unapproved** (draft / rejected / pending-review) products.
   *
   * Wire shape is intentionally flatter than the approved-product shape:
   * each barcode is one top-level item with `barcode`, `quantity`, `salePrice`
   * etc. at the root. Rejected drafts carry `rejectReasonDetails` so you can
   * surface why Trendyol's content team turned them down.
   *
   * Pagination follows the same convention as `list()`: `cursor` from the
   * previous response forwards as `nextPageToken`.
   *
   * @example
   * ```ts
   * const page = await client.products.listUnapproved({ limit: 50 });
   * for (const draft of page.items) {
   *   if (draft.status === 'rejected') {
   *     console.warn(draft.barcode, draft.rejectReasonDetails);
   *   }
   * }
   * ```
   */
  async listUnapproved(
    params: ListUnapprovedProductsParams = {},
  ): Promise<CursorPage<UnapprovedProduct>> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const query: Record<string, string | number | undefined> = { size };
    if (params.cursor) {
      query.nextPageToken = params.cursor;
    } else {
      query.page = 0;
    }
    if (params.barcode) query.barcode = params.barcode;
    if (params.startDate) query.startDate = params.startDate.getTime();
    if (params.endDate) query.endDate = params.endDate.getTime();
    if (params.dateQueryType) query.dateQueryType = params.dateQueryType;
    if (params.supplierId !== undefined) query.supplierId = params.supplierId;

    const data = await this.transport.request<TrendyolUnapprovedResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/unapproved`,
      query,
      rateLimiter: this.filterLimiter,
    });

    const items = (data.content ?? []).map(normalizeUnapproved);
    const page: CursorPage<UnapprovedProduct> = { items };
    if (data.nextPageToken) {
      page.nextCursor = data.nextPageToken;
    }
    return page;
  }

  /**
   * Fetch the basic lifecycle status of a single product by barcode.
   *
   * Cheap and useful as a polling primitive after `createProducts`: poll
   * this endpoint until `approved` flips to `true` (or use
   * `client.products.getBatchStatus()` to track the originating batch).
   *
   * @param barcode The product barcode to look up.
   */
  async getBase(barcode: string): Promise<ProductBase> {
    const code = encodeURIComponent(barcode);
    const data = await this.transport.request<TrendyolProductBaseResponse>({
      method: 'GET',
      path: `/integration/product/sellers/${this.transport.sellerId}/product/${code}`,
      rateLimiter: this.filterLimiter,
    });
    return normalizeProductBase(data);
  }

  /**
   * Fetch buybox information for up to 10 barcodes in one call.
   *
   * Returns rank (`buyboxOrder === 1` means you hold the buybox), the
   * current buybox price, and — beyond the spec — the second and third
   * competing prices when other sellers are present.
   *
   * @param barcodes 1–10 product barcodes.
   * @throws {ValidationError} when `barcodes` is empty or longer than 10.
   */
  async getBuyboxInfo(barcodes: string[]): Promise<BuyboxInfo[]> {
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      throw new ValidationError({
        message: 'getBuyboxInfo: barcodes must be a non-empty array',
      });
    }
    if (barcodes.length > MAX_BUYBOX_BARCODES) {
      throw new ValidationError({
        message: `getBuyboxInfo: max ${MAX_BUYBOX_BARCODES} barcodes per call (got ${barcodes.length})`,
      });
    }

    const data = await this.transport.request<TrendyolBuyboxResponse>({
      method: 'POST',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/buybox-information`,
      body: { barcodes },
      rateLimiter: this.buyboxLimiter,
    });

    const list = data.buyboxInfo ?? data.content ?? [];
    return list.map(normalizeBuyboxInfo);
  }

  /**
   * Create products (V2). Async batch — returns a `batchRequestId` you can
   * poll with `getBatchStatus`. Max 1000 items per call.
   *
   * Trendyol requires the full V2 attribute payload — fetch via
   * `categories.getAttributes` (and `categories.getAttributeValues` for
   * values when `allowCustom === false`). Shipment / returning warehouse
   * IDs come from `suppliers.getAddresses`.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async create(items: CreateProductV2Input[]): Promise<BatchAcceptedResponse> {
    return this.submitWrite('/v2/products', items, 'createProducts');
  }

  /**
   * Update **content** of approved products (title, description, images,
   * attributes). Identified by `contentId`. Partial update is supported
   * except for attributes — if you update ANY attribute, send ALL of them.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async updateContent(items: UpdateContentInput[]): Promise<BatchAcceptedResponse> {
    return this.submitWrite('/products/content-bulk-update', items, 'updateContent');
  }

  /**
   * Update **variant** fields of approved products (stockCode, vatRate,
   * dimensionalWeight, warehouse IDs, location-based delivery, lot). Identified
   * by `barcode`. The barcode itself cannot be changed via this endpoint.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async updateVariants(items: UpdateVariantInput[]): Promise<BatchAcceptedResponse> {
    return this.submitWrite('/products/variant-bulk-update', items, 'updateVariants');
  }

  /**
   * Update **unapproved** (draft) products. Identified by `barcode`. All
   * other fields are optional partial updates. Use this to fix drafts that
   * Trendyol rejected — `client.products.listUnapproved` surfaces the
   * `rejectReasonDetails` you need to act on.
   *
   * **Gotcha (verified live STAGE 2026-05-25):** Trendyol's V2 spec claims
   * only `barcode` is required, but the endpoint returns HTTP 500
   * (`TrendyolSystemException` / `TypeError`) when too many optional fields
   * are omitted. In practice, send at least `title`, `description`,
   * `productMainId`, `brandId`, `categoryId`, `stockCode`,
   * `dimensionalWeight`, `vatRate`, `images[]`, and `attributes[]` (an
   * empty array is OK for the latter). The SDK forwards your payload
   * as-is; trim fields only if you have verified the server accepts it
   * (stage answered `{ barcode, title }` alone with a 500 "TrendyolSystemException"
   * and the full payload with a batch, 2026-10-14).
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async updateUnapproved(items: UpdateUnapprovedInput[]): Promise<BatchAcceptedResponse> {
    return this.submitWrite('/products/unapproved-bulk-update', items, 'updateUnapproved');
  }

  /**
   * Update product **delivery information** (deliveryDuration,
   * fastDeliveryType). Identified by `barcode`.
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   */
  async updateDeliveryInfo(items: UpdateDeliveryInfoInput[]): Promise<BatchAcceptedResponse> {
    return this.submitWrite('/products/delivery-info-bulk-update', items, 'updateDeliveryInfo');
  }

  /**
   * Delete products by barcode. Trendyol allows deletion of unapproved
   * products and approved products that have been archived for more than a
   * day (and have not been sales-stopped by Trendyol).
   *
   * Async batch — returns `{ batchRequestId }` to poll via `getBatchStatus`.
   * Separately rate-limited at **100 req/min** (much tighter than create/update).
   *
   * @param barcodes 1–1000 barcodes.
   * @throws {ValidationError} when `barcodes` is empty or longer than 1000.
   */
  async delete(barcodes: string[]): Promise<BatchAcceptedResponse> {
    this.validateBarcodes(barcodes, 'delete');
    const data = await this.transport.request<BatchAcceptedResponse>({
      method: 'DELETE',
      path: `/integration/product/sellers/${this.transport.sellerId}/products`,
      body: { items: barcodes.map((barcode) => ({ barcode })) },
      rateLimiter: this.deleteLimiter,
    });
    return { batchRequestId: data?.batchRequestId ?? '' };
  }

  /**
   * Archive products by barcode (Trendyol's `archived=true` state).
   * Archived products are not visible to customers; pair with `delete`
   * after the 24-hour archive cool-down to remove them entirely.
   *
   * Async batch — returns `{ batchRequestId }`.
   *
   * @throws {ValidationError} when `barcodes` is empty or longer than 1000.
   */
  async archive(barcodes: string[]): Promise<BatchAcceptedResponse> {
    return this.setArchivedState(barcodes, true, 'archive');
  }

  /**
   * Unarchive products by barcode (Trendyol's `archived=false` state).
   * Restores visibility for previously-archived products.
   *
   * @throws {ValidationError} when `barcodes` is empty or longer than 1000.
   */
  async unarchive(barcodes: string[]): Promise<BatchAcceptedResponse> {
    return this.setArchivedState(barcodes, false, 'unarchive');
  }

  private async setArchivedState(
    barcodes: string[],
    archived: boolean,
    methodLabel: string,
  ): Promise<BatchAcceptedResponse> {
    this.validateBarcodes(barcodes, methodLabel);
    const data = await this.transport.request<BatchAcceptedResponse>({
      method: 'PUT',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/archive-state`,
      body: { items: barcodes.map((barcode) => ({ barcode, archived })) },
      rateLimiter: this.writeLimiter,
    });
    return { batchRequestId: data?.batchRequestId ?? '' };
  }

  /**
   * Unlock products whose sale was paused by Trendyol due to pricing
   * issues (under/over-pricing, critical price error, supplier issues).
   * Restores selling status for the listed barcodes.
   *
   * Async batch — returns `{ batchRequestId }`.
   *
   * @throws {ValidationError} when `barcodes` is empty or longer than 1000.
   */
  async unlock(barcodes: string[]): Promise<BatchAcceptedResponse> {
    this.validateBarcodes(barcodes, 'unlock');
    const data = await this.transport.request<BatchAcceptedResponse>({
      method: 'PUT',
      path: `/integration/product/sellers/${this.transport.sellerId}/products/unlock`,
      body: { items: barcodes.map((barcode) => ({ barcode })) },
      rateLimiter: this.writeLimiter,
    });
    return { batchRequestId: data?.batchRequestId ?? '' };
  }
}
