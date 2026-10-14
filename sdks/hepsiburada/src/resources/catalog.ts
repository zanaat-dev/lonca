import {
  TokenBucketRateLimiter,
  ValidationError,
  type MutationResult,
  type OffsetPage,
} from '@lonca/core';
import { resolveCatalogPaging, type ResolvedCatalogPaging } from '../catalog-paging.js';
import type { HepsiburadaTransport } from '../transport.js';
import type {
  CatalogMatchedHbProduct,
  CatalogProduct,
  CatalogProductAttribute,
  CatalogProductStatus,
  CatalogTaskDetail,
  CatalogTrackingReceipt,
  CatalogValidationResult,
  CheckProductStatusInput,
  DeleteBySkuInput,
  FastListingInput,
  ListCatalogProductsParams,
  ListProductsByStatusParams,
  PreMatchActionInput,
  TrackingIdHistoryEntry,
  CatalogUploadProduct,
  UploadProductsInput,
} from '../types/catalog-product.js';

const SERVICE = 'mpop' as const;
const BASE_PATH = '/product/api/products';

/**
 * Hepsiburada Catalog Products (`katalog-urun-entegrasyonu` —
 * product surface).
 *
 * **Service base URL**: `mpop[-sit].hepsiburada.com`, `/product/api/products/*`.
 *
 * Covers the full 11-endpoint product CRUD surface — read (list / by-status /
 * history), upload (file / fast-listing), pre-match approve/reject, delete
 * (async with tracking-id polling), and status checks.
 */
export class CatalogResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: HepsiburadaTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 120, intervalMs: 60_000 });
  }

  // ─── Read ─────────────────────────────────────────────────────────────

  /**
   * List the merchant's catalog rows, one page at a time, optionally narrowed
   * to a single `barcode` / `merchantSku` / `hbSku`.
   *
   * Returns an `OffsetPage` mapped from Hepsiburada's Spring-style envelope
   * (`totalElements` → `totalCount`, `totalPages` → `pageCount`, `data` →
   * `items`). Page by `page` / `size`, or by `offset` / `limit` to drive it
   * with `paginateOffset` (pass `limit` — the API pages by number, so
   * `offset` must be a multiple of it). A filter that matches nothing comes
   * back as HTTP 200 `success: false, code: 4014` with an empty `data` array;
   * that is surfaced as an empty page, not an error.
   *
   * @throws {ValidationError} when `offset` / `limit` cannot be expressed as a page.
   */
  async listProducts(params: ListCatalogProductsParams = {}): Promise<OffsetPage<CatalogProduct>> {
    const paging = resolveCatalogPaging(params, 'catalog.listProducts');
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/all-products-of-merchant/${encodeURIComponent(this.transport.merchantId)}`,
      query: {
        barcode: params.barcode,
        merchantSku: params.merchantSku,
        hbSku: params.hbSku,
        page: paging.page,
        size: paging.size,
      },
      rateLimiter: this.limiter,
    });
    return toCatalogPage(data, paging);
  }

  /**
   * List catalog rows filtered by lifecycle status (`'MATCHED'`, `'WAITING'`,
   * `'MISSING_INFO'`, … — see `CatalogProductLifecycleStatus`).
   *
   * Hepsiburada requires the status (query parameter `productStatus`) and
   * answers HTTP 500 — not 400 — when it is missing or not one of its
   * UPPER_SNAKE values, so the SDK validates presence up front. A status
   * bucket with no rows comes back as HTTP 200 `success: false, code: 4008`
   * with an empty `data` array; that is surfaced as an empty page, not an error.
   *
   * Returns an `OffsetPage` (see `listProducts` for the envelope mapping and
   * the `offset` / `limit` alias that makes it work with `paginateOffset`).
   *
   * @throws {ValidationError} when `status` is missing or empty, or when
   *   `offset` / `limit` cannot be expressed as a page.
   */
  async listProductsByStatus(
    params: ListProductsByStatusParams,
  ): Promise<OffsetPage<CatalogProduct>> {
    if (!params || typeof params.status !== 'string' || params.status.length === 0) {
      throw new ValidationError({
        message:
          'catalog.listProductsByStatus: status is required (e.g. "MATCHED", "WAITING" — Hepsiburada\'s UPPER_SNAKE vocabulary)',
      });
    }
    const paging = resolveCatalogPaging(params, 'catalog.listProductsByStatus');
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/products-by-merchant-and-status`,
      query: {
        merchantId: this.transport.merchantId,
        productStatus: params.status,
        taskStatus: params.taskStatus,
        version: params.version,
        page: paging.page,
        size: paging.size,
      },
      rateLimiter: this.limiter,
    });
    return toCatalogPage(data, paging);
  }

  /** Look up status for a single tracking-id (returned by an earlier upload). */
  async getProductStatus(trackingId: string): Promise<CatalogProductStatus> {
    if (!trackingId) {
      throw new ValidationError({ message: 'catalog.getProductStatus: trackingId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/status/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeProductStatus(data);
  }

  /** Get the upload-history feed for the merchant's tracking ids. */
  async getTrackingIdHistory(): Promise<TrackingIdHistoryEntry[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/trackingId-history`,
      rateLimiter: this.limiter,
    });
    // The documented response is the mpop `{ success, code, message, data }`
    // envelope, so rows normally arrive under `data`.
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown[] })?.items)
        ? (data as { items: unknown[] }).items
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? (data as { data: unknown[] }).data
          : [];
    return rows.map(normalizeTrackingIdHistoryEntry);
  }

  // ─── Write ─────────────────────────────────────────────────────────────

  /**
   * Upload one or more products. Returns a `trackingId` you can poll via
   * `getProductStatus(trackingId)`; per-product results (`importStatus`,
   * `importMessages`) arrive in its `rows`.
   *
   * Hepsiburada takes the products as a JSON file (an array) in the multipart
   * field `file`; the SDK builds that file and fills in `merchant` from the
   * client when a row has none. (A plain JSON body is answered with a 500 —
   * verified on SIT, 2026-10-14.)
   *
   * @throws {ValidationError} when `products` is empty, or a row has no
   *   `categoryId` or `attributes.merchantSku` (checked before sending).
   */
  async uploadProductViaFile(
    products: readonly CatalogUploadProduct[] | UploadProductsInput,
  ): Promise<CatalogTrackingReceipt> {
    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError({
        message: 'catalog.uploadProductViaFile: products array is required (non-empty)',
      });
    }
    const rows = products.map((row: unknown, i) => {
      const product = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const attributes = product.attributes as Record<string, unknown> | undefined;
      if (product.categoryId === undefined || product.categoryId === null) {
        throw new ValidationError({
          message: `catalog.uploadProductViaFile: row ${i} needs a categoryId`,
        });
      }
      if (typeof attributes?.merchantSku !== 'string' || attributes.merchantSku === '') {
        throw new ValidationError({
          message: `catalog.uploadProductViaFile: row ${i} needs attributes.merchantSku`,
        });
      }
      return { ...product, merchant: product.merchant ?? this.transport.merchantId };
    });
    const body = new FormData();
    body.append(
      'file',
      new Blob([JSON.stringify(rows)], { type: 'application/json' }),
      'integrator.json',
    );
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/import`,
      body,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Upload a fast-listing payload (Hepsiburada's "Hızlı Ürün Yükleme" flow). */
  async uploadFastListing(input: FastListingInput): Promise<CatalogTrackingReceipt> {
    if (!input || (Array.isArray(input) && input.length === 0)) {
      throw new ValidationError({ message: 'catalog.uploadFastListing: input is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/fastlisting`,
      body: input,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Approve a product Hepsiburada has pre-matched to an existing catalog entry. */
  async approvePreMatch(input: PreMatchActionInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.approvePreMatch: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/approve-prematch`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Reject a pre-match Hepsiburada has proposed. */
  async rejectPreMatch(input: PreMatchActionInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.rejectPreMatch: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/reject-prematch`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  /** Check upload status for one or more tracking ids in a single request. */
  async checkProductStatus(input: CheckProductStatusInput): Promise<MutationResult> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({ message: 'catalog.checkProductStatus: input is required' });
    }
    return {
      raw: await this.transport.request<unknown>({
        method: 'POST',
        service: SERVICE,
        path: `${BASE_PATH}/check-product-status`,
        body: input,
        rateLimiter: this.limiter,
      }),
    };
  }

  // ─── Delete ────────────────────────────────────────────────────────────

  /**
   * Delete one or more products by merchant SKU. Returns a `trackingId` you
   * can poll via `getDeleteProcess(trackingId)`.
   */
  async deleteByMerchantSkuList(input: DeleteBySkuInput): Promise<CatalogTrackingReceipt> {
    if (!input || typeof input !== 'object') {
      throw new ValidationError({
        message: 'catalog.deleteByMerchantSkuList: input is required',
      });
    }
    const list = Array.isArray(input.merchantSkuList) ? input.merchantSkuList : null;
    if (!list || list.length === 0) {
      throw new ValidationError({
        message: 'catalog.deleteByMerchantSkuList: merchantSkuList must be a non-empty array',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'POST',
      service: SERVICE,
      path: `${BASE_PATH}/delete-process`,
      body: input,
      rateLimiter: this.limiter,
    });
    return normalizeTrackingReceipt(data);
  }

  /** Look up the status of an in-flight delete request by tracking-id. */
  async getDeleteProcess(trackingId: string): Promise<CatalogProductStatus> {
    if (!trackingId) {
      throw new ValidationError({ message: 'catalog.getDeleteProcess: trackingId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      service: SERVICE,
      path: `${BASE_PATH}/delete-process/${encodeURIComponent(trackingId)}`,
      rateLimiter: this.limiter,
    });
    return normalizeProductStatus(data);
  }
}

// ─── Normalizers ───────────────────────────────────────────────────────────

/**
 * Catalog list endpoints wrap rows in a Spring-style page envelope
 * (`{ data: [...], totalElements, totalPages, number, ... }`) — verified against
 * live `all-products-of-merchant` (2026-06). Other/older surfaces may return a
 * bare array or a `{ content }` / `{ items }` envelope. Unwrap defensively so a
 * non-array response never silently drops every row.
 */
function unwrapCatalogRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['data', 'content', 'items']) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/**
 * Map a catalog list response onto `OffsetPage`. The live shape is the Spring
 * envelope `{ totalElements, totalPages, number, numberOfElements, data[] }`
 * (verified 2026-08 on both list endpoints, including the `success: false`
 * empty-result variant, which carries zeros). Nothing is guessed:
 *
 * - `totalCount` ← `totalElements`; `pageCount` ← `totalPages`
 * - `limit` ← the requested `size`, else the server's `numberOfElements`
 *   (equal to its page size on every page but the last)
 * - `offset` ← the server's page index (`number`) × `limit`
 * - a bare array / envelope without paging metadata is an un-paged result:
 *   one page holding exactly the rows received.
 */
function toCatalogPage(data: unknown, paging: ResolvedCatalogPaging): OffsetPage<CatalogProduct> {
  const items = unwrapCatalogRows(data).map(normalizeCatalogProduct);
  const envelope =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const num = (key: string): number | undefined => {
    const value = envelope?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const totalElements = num('totalElements');
  const totalPages = num('totalPages');

  if (totalElements === undefined && totalPages === undefined) {
    const limit = paging.size ?? items.length;
    return {
      totalCount: items.length,
      limit,
      offset: (paging.page ?? 0) * limit,
      pageCount: items.length > 0 ? 1 : 0,
      items,
    };
  }

  const limit = paging.size ?? num('numberOfElements') ?? items.length;
  const totalCount = totalElements ?? items.length;
  return {
    totalCount,
    limit,
    offset: (num('number') ?? paging.page ?? 0) * limit,
    pageCount: totalPages ?? (limit > 0 ? Math.ceil(totalCount / limit) : 0),
    items,
  };
}

/** String fields copied as-is (both list endpoints, plus the deprecated legacy names). */
const PRODUCT_STRING_FIELDS = [
  'merchantSku',
  'barcode',
  'hbSku',
  'variantGroupId',
  'status',
  'productStatus',
  'price',
  'tax',
  'videoStatus',
  // Deprecated: documented by neither endpoint, absent on the prod wire.
  'createdAt',
  'createdBy',
  'modifiedAt',
  'modifiedBy',
  'preMatchedSku',
  'siblingSku',
  'listingStatus',
  'listingFailureReason',
  'validationStatus',
  'productType',
  'uploadDate',
] as const satisfies ReadonlyArray<keyof CatalogProduct>;

/**
 * Map one row of either catalog list endpoint onto {@link CatalogProduct}
 * (`all-products-of-merchant` and `products-by-merchant-and-status` return
 * different row shapes — spec `mpop-catalog.json`, prod wire 2026-10). Fields
 * are copied when they carry the documented JSON type; nothing is guessed.
 */
function normalizeCatalogProduct(row: unknown): CatalogProduct {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: CatalogProduct = { raw: r };
  for (const key of PRODUCT_STRING_FIELDS) {
    const value = r[key];
    if (typeof value === 'string') out[key] = value;
  }
  // `products-by-merchant-and-status` names the lifecycle status `productStatus`.
  if (out.status === undefined && out.productStatus !== undefined) out.status = out.productStatus;
  if (typeof r.id === 'string') out.id = r.id;
  else if (typeof r.id === 'number') out.id = String(r.id);
  if (typeof r.productQuality === 'number') out.productQuality = r.productQuality;
  if (typeof r.categoryScore === 'number') out.categoryScore = r.categoryScore;
  if (r.fields && typeof r.fields === 'object') {
    out.fields = r.fields as Record<string, never>;
  }
  const baseAttributes = toAttributes(r.baseAttributes);
  if (baseAttributes) out.baseAttributes = baseAttributes;
  const productAttributes = toAttributes(r.productAttributes);
  if (productAttributes) out.productAttributes = productAttributes;
  const variantTypeAttributes = toAttributes(r.variantTypeAttributes);
  if (variantTypeAttributes) out.variantTypeAttributes = variantTypeAttributes;
  if (Array.isArray(r.validationResults)) {
    out.validationResults = objectRows(r.validationResults).map((v) => {
      const result: CatalogValidationResult = {};
      if (typeof v.attributeName === 'string') result.attributeName = v.attributeName;
      if (typeof v.message === 'string') result.message = v.message;
      return result;
    });
  }
  const rejectReasons = toStrings(r.rejectReasons);
  if (rejectReasons) out.rejectReasons = rejectReasons;
  const rejectReasonsMessages = toStrings(r.rejectReasonsMessages);
  if (rejectReasonsMessages) out.rejectReasonsMessages = rejectReasonsMessages;
  if (Array.isArray(r.taskDetails)) {
    out.taskDetails = objectRows(r.taskDetails).map((t) => {
      const task: CatalogTaskDetail = {};
      if (typeof t.reason === 'string') task.reason = t.reason;
      if (typeof t.url === 'string') task.url = t.url;
      if (Array.isArray(t.commentList)) task.commentList = t.commentList;
      return task;
    });
  }
  if (Array.isArray(r.matchedHbProductInfo)) {
    out.matchedHbProductInfo = objectRows(r.matchedHbProductInfo).map((m) => {
      const matched: CatalogMatchedHbProduct = {};
      if (typeof m.hbSku === 'string') matched.hbSku = m.hbSku;
      if (typeof m.productName === 'string') matched.productName = m.productName;
      if (typeof m.brand === 'string') matched.brand = m.brand;
      const images = toStrings(m.images);
      if (images) matched.images = images;
      const variants = toAttributes(m.variantTypeAttributes, false);
      if (variants) matched.variantTypeAttributes = variants;
      return matched;
    });
  }
  // Content fields. Both list endpoints send them at the top level
  // (`productName`, and on `all-products-of-merchant` also `categoryId`,
  // `categoryName`, `brand`, `description`, `images`). The legacy per-SKU
  // `fields` map and the alternative key spellings are still tried first /
  // as fallbacks for back-compat; `undefined` when none match (never guessed).
  const fields = r.fields as Record<string, { value?: unknown }> | undefined;
  const title = pickContentString(fields, r, 'productName', 'name', 'title');
  if (title !== undefined) out.title = title;
  const categoryId = pickContentString(fields, r, 'categoryId', 'categoryID');
  if (categoryId !== undefined) out.categoryId = categoryId;
  const categoryName = pickContentString(fields, r, 'categoryName', 'category');
  if (categoryName !== undefined) out.categoryName = categoryName;
  const brand = pickContentString(fields, r, 'brand', 'brandName');
  if (brand !== undefined) out.brand = brand;
  const description = pickContentString(fields, r, 'description');
  if (description !== undefined) out.description = description;
  const images = pickContentImages(fields, r, 'images', 'image', 'imageUrls');
  if (images !== undefined) out.images = images;
  return out;
}

/** The object elements of an array (non-objects dropped). */
function objectRows(value: unknown[]): Array<Record<string, unknown>> {
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  );
}

/**
 * A `{ name, value, mandatory }[]` attribute list (`withMandatory: false` for
 * the `{ name, value }[]` pairs of `matchedHbProductInfo[]`); `undefined` when
 * not an array.
 */
function toAttributes(value: unknown, withMandatory = true): CatalogProductAttribute[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return objectRows(value).map((a) => {
    const attribute: CatalogProductAttribute = {};
    if (typeof a.name === 'string') attribute.name = a.name;
    if (typeof a.value === 'string') attribute.value = a.value;
    if (withMandatory && typeof a.mandatory === 'boolean') attribute.mandatory = a.mandatory;
    return attribute;
  });
}

/** The string elements of an array; `undefined` when not an array. */
function toStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Resolve a string content field from the catalog `fields` map (value side),
 * falling back to the raw top level. Tries each key in order; `undefined` when
 * none carry a usable value. Numbers are stringified (e.g. numeric `categoryId`).
 */
function pickContentString(
  fields: Record<string, { value?: unknown }> | undefined,
  raw: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const fromField = coerceString(fields?.[key]?.value);
    if (fromField !== undefined) return fromField;
    const fromRaw = coerceString(raw[key]);
    if (fromRaw !== undefined) return fromRaw;
  }
  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') return value ? value : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Resolve image URLs from the catalog `fields` map / raw — accepts `string[]`,
 * `{ url | imageUrl }[]`, or a CSV string. `undefined` when none match.
 */
function pickContentImages(
  fields: Record<string, { value?: unknown }> | undefined,
  raw: Record<string, unknown>,
  ...keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const urls = coerceImages(fields?.[key]?.value) ?? coerceImages(raw[key]);
    if (urls && urls.length) return urls;
  }
  return undefined;
}

function coerceImages(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const urls = value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const u = (item as { url?: unknown }).url ?? (item as { imageUrl?: unknown }).imageUrl;
          return typeof u === 'string' ? u.trim() : undefined;
        }
        return undefined;
      })
      .filter((s): s is string => !!s);
    return urls.length ? urls : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const urls = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return urls.length ? urls : undefined;
  }
  return undefined;
}

function normalizeTrackingReceipt(data: unknown): CatalogTrackingReceipt {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  // The upload answers with the mpop envelope: `{ success, code, data: { trackingId } }`.
  const inner = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<
    string,
    unknown
  >;
  return {
    trackingId: String(obj.trackingId ?? obj.id ?? inner.trackingId ?? ''),
    raw: obj,
  };
}

function normalizeProductStatus(data: unknown): CatalogProductStatus {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: CatalogProductStatus = { raw: obj };
  if (typeof obj.trackingId === 'string') out.trackingId = obj.trackingId;
  if (typeof obj.status === 'string') out.status = obj.status;
  if (typeof obj.success === 'boolean') out.success = obj.success;
  if (typeof obj.code === 'number') out.code = obj.code;
  if (typeof obj.message === 'string') out.message = obj.message;
  if (Array.isArray(obj.rows)) out.rows = obj.rows as Array<Record<string, unknown>>;
  else if (Array.isArray(obj.items)) out.rows = obj.items as Array<Record<string, unknown>>;
  else if (Array.isArray(obj.data)) out.rows = obj.data as Array<Record<string, unknown>>;
  return out;
}

function normalizeTrackingIdHistoryEntry(row: unknown): TrackingIdHistoryEntry {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const out: TrackingIdHistoryEntry = { raw: r };
  if (typeof r.trackingId === 'string') out.trackingId = r.trackingId;
  if (typeof r.createdAt === 'string') out.createdAt = r.createdAt;
  if (typeof r.status === 'string') out.status = r.status;
  return out;
}
