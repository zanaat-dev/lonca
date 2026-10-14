import { TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type {
  CareInstruction,
  ExportBatchAcceptedResponse,
  ExportBatchStatus,
  ExportCategoryAttribute,
  ExportPackage,
  ExportPackageItem,
  ExportPriceUpdateInput,
  ExportProduct,
  ExportProductInput,
  ExportStockUpdateInput,
  GetExportPackageItemsParams,
  ListExportPackagesV2Params,
  ListExportPackagesV3Params,
  ListExportProductsParams,
  ProductComposition,
  ProductOrigin,
} from '../types/export-center.js';

/** Trendyol caps every Export Center batch at 5000 items per call. */
const MAX_BATCH_ITEMS = 5000;

/**
 * Trendyol Export Center (İhracat Merkezi / AutoFT) — Türkiye-based
 * sellers exporting to Trendyol's international platforms.
 *
 * **Service base URL**: same `apigw.trendyol.com` as the main marketplace,
 * with a distinct path prefix `/integration/ecgw/v{N}/{sellerId}/…`.
 *
 * The Export Center requires sellers to first complete Trendyol's "İhracat
 * Merkezi" application; the same `apiKey`/`apiSecret` then authorize
 * these paths. Calls from non-enrolled sellers return `401`.
 *
 * 12 endpoints across four surfaces — products (list/create/price/stock),
 * batch status, packages (V2/V3 list + item detail), and lookup
 * (categories, care instructions, compositions, origins).
 *
 * NOTE: per-endpoint body / response shapes are documented in HTML tables
 * on developers.trendyol.com — the SDK accepts `Record<string, unknown>`
 * bodies and surfaces row-level `raw` accessors so undocumented fields
 * stay reachable.
 */
export class ExportCenterResource {
  private readonly limiter: TokenBucketRateLimiter;

  constructor(
    private readonly transport: TrendyolTransport,
    limiter?: TokenBucketRateLimiter,
  ) {
    this.limiter = limiter ?? new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 60_000 });
  }

  // ─── Products ────────────────────────────────────────────────────────────

  /**
   * List Export Center-approved products. Uses Trendyol's `pageKey`
   * pagination — the first call leaves `pageKey` empty; subsequent
   * calls pass the `x-paging-key` value from the previous response.
   */
  async listProducts(params: ListExportProductsParams = {}): Promise<ExportProduct[]> {
    const query: Record<string, string | number | undefined> = {};
    if (params.barcodes && params.barcodes.length > 0) query.barcodes = params.barcodes.join(',');
    if (params.pageKey) query.pageKey = params.pageKey;
    if (params.size !== undefined) query.size = params.size;

    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v2/${this.transport.sellerId}/products`,
      query: Object.keys(query).length ? query : undefined,
      rateLimiter: this.limiter,
    });
    const rows = pickArray(data);
    return rows.map((r) => ({ raw: (r ?? {}) as Record<string, unknown> }));
  }

  /**
   * Create Export Center products. Maximum 5000 per call. Returns a
   * `batchId` you can poll via `getBatchStatus(batchId)`.
   *
   * @throws {ValidationError} when `products` is empty / oversized.
   */
  async createProducts(products: ExportProductInput[]): Promise<ExportBatchAcceptedResponse> {
    this.assertBatch(products, 'createProducts');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/ecgw/v2/${this.transport.sellerId}/products`,
      body: { products },
      rateLimiter: this.limiter,
    });
    return normalizeBatchResponse(data);
  }

  /**
   * Update Export Center prices. **Trendyol allows one price update per
   * barcode per day.** Returns a `batchId`.
   *
   * @throws {ValidationError} when `priceInfos` is empty / oversized.
   */
  async updatePrices(priceInfos: ExportPriceUpdateInput[]): Promise<ExportBatchAcceptedResponse> {
    this.assertBatch(priceInfos, 'updatePrices');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/prices`,
      body: { priceInfos },
      rateLimiter: this.limiter,
    });
    return normalizeBatchResponse(data);
  }

  /**
   * Update Export Center stocks. Returns a `batchId`. Sellers using
   * Trendyol's shared inventory cannot use this endpoint (per portal docs).
   * Sent as `{ stocks: [{ barcode, stock }] }`, the body the portal documents
   * (it used to go out as `{ items }`).
   *
   * @throws {ValidationError} when `items` is empty / oversized.
   */
  async updateStocks(items: ExportStockUpdateInput[]): Promise<ExportBatchAcceptedResponse> {
    this.assertBatch(items, 'updateStocks');
    const data = await this.transport.request<unknown>({
      method: 'POST',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/stocks`,
      body: { stocks: items },
      rateLimiter: this.limiter,
    });
    return normalizeBatchResponse(data);
  }

  // ─── Batch status ────────────────────────────────────────────────────────

  /**
   * Look up the status of a previously-submitted batch. Trendyol retains
   * batch records for **24 hours** only — older `batchId`s return `404`.
   */
  async getBatchStatus(batchId: string): Promise<ExportBatchStatus> {
    if (!batchId) {
      throw new ValidationError({ message: 'exportCenter.getBatchStatus: batchId is required' });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/check-status`,
      query: { batchId },
      rateLimiter: this.limiter,
    });
    return normalizeBatchStatus(data);
  }

  // ─── Packages ────────────────────────────────────────────────────────────

  /** List daily Export Center packages (V2 — query-based filters). */
  async listPackagesV2(params: ListExportPackagesV2Params = {}): Promise<ExportPackage[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v2/${this.transport.sellerId}/packages`,
      query: {
        trackingNumber: params.trackingNumber,
        status: params.status,
        creationStartDate: params.creationStartDate,
        creationEndDate: params.creationEndDate,
        size: params.size,
        boutiqueId: params.boutiqueId,
      },
      rateLimiter: this.limiter,
    });
    return pickArray(data).map(normalizePackage);
  }

  /** List Export Center packages (V3 — consolidated, page-based). */
  async listPackagesV3(params: ListExportPackagesV3Params = {}): Promise<ExportPackage[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v3/${this.transport.sellerId}/packages`,
      query: {
        status: params.status,
        page: params.offset !== undefined ? params.offset : undefined,
        size: params.limit,
        creationStartDate: params.creationStartDate,
        creationEndDate: params.creationEndDate,
      },
      rateLimiter: this.limiter,
    });
    return pickArray(data).map(normalizePackage);
  }

  /** Get the line items inside an Export Center package. */
  async getPackageItems(params: GetExportPackageItemsParams): Promise<ExportPackageItem[]> {
    if (!params || !params.packageId) {
      throw new ValidationError({
        message: 'exportCenter.getPackageItems: packageId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v2/${this.transport.sellerId}/packages/items`,
      query: {
        packageId: params.packageId,
        status: params.status,
        page: params.offset,
        size: params.limit,
      },
      rateLimiter: this.limiter,
    });
    return pickArray(data).map((r) => ({ raw: (r ?? {}) as Record<string, unknown> }));
  }

  // ─── Lookup ──────────────────────────────────────────────────────────────

  /** Get the required attributes for an Export Center category. */
  async getCategoryAttributes(categoryId: number | string): Promise<ExportCategoryAttribute[]> {
    if (categoryId === undefined || categoryId === null || categoryId === '') {
      throw new ValidationError({
        message: 'exportCenter.getCategoryAttributes: categoryId is required',
      });
    }
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/lookup/product-categories/${encodeURIComponent(String(categoryId))}/attributes`,
      rateLimiter: this.limiter,
    });
    return pickArray(data).map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const out: ExportCategoryAttribute = { raw: row };
      if (typeof row.attributeId === 'number' || typeof row.attributeId === 'string') {
        out.attributeId = row.attributeId;
      }
      if (typeof row.attributeName === 'string') out.attributeName = row.attributeName;
      if (typeof row.required === 'boolean') out.required = row.required;
      if (Array.isArray(row.values)) out.values = row.values;
      return out;
    });
  }

  /** Get the care-instruction lookup values used by `createProducts`. */
  async getCareInstructions(): Promise<CareInstruction[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/lookup/care-instructions`,
      rateLimiter: this.limiter,
    });
    return pickArray(data).map(normalizeNamedRef);
  }

  /** Get the material-composition lookup values used by `createProducts`. */
  async getCompositions(): Promise<ProductComposition[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/lookup/compositions`,
      rateLimiter: this.limiter,
    });
    return pickArray(data).map(normalizeNamedRef);
  }

  /** Get the country-of-origin lookup values used by `createProducts`. */
  async getOrigins(): Promise<ProductOrigin[]> {
    const data = await this.transport.request<unknown>({
      method: 'GET',
      path: `/integration/ecgw/v1/${this.transport.sellerId}/lookup/origins`,
      rateLimiter: this.limiter,
    });
    return pickArray(data).map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const out: ProductOrigin = { raw: row };
      if (typeof row.id === 'number' || typeof row.id === 'string') out.id = row.id;
      if (typeof row.name === 'string') out.name = row.name;
      if (typeof row.countryCode === 'string') out.countryCode = row.countryCode;
      return out;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private assertBatch(items: unknown[], methodLabel: string): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError({
        message: `exportCenter.${methodLabel}: items must not be empty`,
      });
    }
    if (items.length > MAX_BATCH_ITEMS) {
      throw new ValidationError({
        message: `exportCenter.${methodLabel}: max ${MAX_BATCH_ITEMS} items per call (got ${items.length})`,
      });
    }
  }
}

// ─── Normalizers ──────────────────────────────────────────────────────────

function pickArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.content)) return obj.content;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.products)) return obj.products;
    if (Array.isArray(obj.packages)) return obj.packages;
  }
  return [];
}

function normalizeBatchResponse(data: unknown): ExportBatchAcceptedResponse {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    batchId: String(obj.batchId ?? obj.batchRequestId ?? obj.id ?? ''),
    raw: obj,
  };
}

function normalizeBatchStatus(data: unknown): ExportBatchStatus {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: ExportBatchStatus = { raw: obj };
  if (typeof obj.batchId === 'string') out.batchId = obj.batchId;
  if (typeof obj.status === 'string') out.status = obj.status;
  if (typeof obj.itemCount === 'number') out.itemCount = obj.itemCount;
  if (typeof obj.failedItemCount === 'number') out.failedItemCount = obj.failedItemCount;
  if (Array.isArray(obj.items)) out.items = obj.items as Array<Record<string, unknown>>;
  return out;
}

function normalizePackage(row: unknown): ExportPackage {
  const r = (row ?? {}) as Record<string, unknown>;
  const out: ExportPackage = { raw: r };
  if (typeof r.packageNumber === 'string') out.packageNumber = r.packageNumber;
  if (typeof r.status === 'string') out.status = r.status as ExportPackage['status'];
  return out;
}

function normalizeNamedRef<
  T extends { id?: number | string; name?: string; raw: Record<string, unknown> },
>(row: unknown): T {
  const r = (row ?? {}) as Record<string, unknown>;
  const out = { raw: r } as T;
  if (typeof r.id === 'number' || typeof r.id === 'string') out.id = r.id;
  if (typeof r.name === 'string') out.name = r.name;
  return out;
}
