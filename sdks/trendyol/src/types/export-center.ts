/**
 * Trendyol Export Center (İhracat Merkezi / AutoFT) types.
 *
 * Source: developers.trendyol.com — `autoft-*` documentation pages.
 *
 * The Export Center is Trendyol's program for sellers exporting from
 * Türkiye to Trendyol's international platforms. It shares the same API
 * gateway (`apigw.trendyol.com`) and HMAC auth as the main marketplace
 * surface — the distinguishing factor is the path prefix:
 * `/integration/ecgw/v{N}/{sellerId}/…`
 *
 * Per-endpoint shapes are loosely typed (`Record<string, unknown>`)
 * because Trendyol's docs document fields in HTML tables; the SDK keeps
 * payloads loose and surfaces the raw response. Operations that need
 * stronger typing in practice should consult the portal pages.
 */

import type { OffsetPaginationParams } from '@lonca/core';

// ─── Products ──────────────────────────────────────────────────────────────

/** Query parameters for `exportCenter.listProducts()`. */
export interface ListExportProductsParams {
  /** Optional list of barcodes to filter to. */
  barcodes?: string[];
  /**
   * Page cursor — empty for the first request, then use the `x-paging-key`
   * value from the previous response's headers for subsequent pages.
   */
  pageKey?: string;
  /** Page size. Default: 20, max: 100. */
  size?: number;
}

/** One product row returned by `listProducts()`. Loose; consult portal for the documented field set. */
export interface ExportProduct {
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * Payload for `exportCenter.createProducts()` — see "Ürün Oluşturma V2"
 * on the developer portal for the documented field set per product.
 * Max 5000 items per call.
 */
export type ExportProductInput = Record<string, unknown>;

/**
 * One row of `exportCenter.updatePrices()`: `{ barcode, buyingPrice, rrp? }`
 * per the portal ("autoft-update-prices"; `barcode` and `buyingPrice` are
 * required).
 */
export type ExportPriceUpdateInput = Record<string, unknown>;

/**
 * One row of `exportCenter.updateStocks()`: `{ barcode, stock }` per the
 * portal ("autoft-update-stocks"; both required).
 */
export type ExportStockUpdateInput = Record<string, unknown>;

/** Returned by every async batch endpoint — poll status via `getBatchStatus(batchId)`. */
export interface ExportBatchAcceptedResponse {
  /** UUID returned by Trendyol. Surfaces in the response body or `Location` header. */
  batchId: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

// ─── Batch status ───────────────────────────────────────────────────────────

/** Status of a previously-submitted batch. */
export interface ExportBatchStatus {
  batchId?: string;
  status?: string;
  itemCount?: number;
  failedItemCount?: number;
  items?: Array<Record<string, unknown>>;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

// ─── Packages ───────────────────────────────────────────────────────────────

/** Status enum for Export Center packages — `new | pending | completed | cancelled`. */
export type ExportPackageStatus = 'new' | 'pending' | 'completed' | 'cancelled';

/** Query parameters for `exportCenter.listPackagesV2()`. */
export interface ListExportPackagesV2Params {
  /** Cargo tracking number filter. */
  trackingNumber?: string;
  /** Status filter. */
  status?: ExportPackageStatus;
  /** UTC milliseconds. */
  creationStartDate?: number;
  /** UTC milliseconds. */
  creationEndDate?: number;
  /** Page size; max 100. */
  size?: number;
  /** Boutique-specific filter (when used by partner businesses). */
  boutiqueId?: number;
}

/** Query parameters for `exportCenter.listPackagesV3()`. Uses page-based pagination. */
export interface ListExportPackagesV3Params extends OffsetPaginationParams {
  status?: ExportPackageStatus;
  creationStartDate?: number;
  creationEndDate?: number;
}

/** Query parameters for `exportCenter.getPackageItems()`. */
export interface GetExportPackageItemsParams extends OffsetPaginationParams {
  /** Required. */
  packageId: string;
  status?: ExportPackageStatus;
}

/** One package row returned by the list endpoints. */
export interface ExportPackage {
  packageNumber?: string;
  status?: ExportPackageStatus;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One package-item row returned by `getPackageItems()`. */
export interface ExportPackageItem {
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

// ─── Lookup ────────────────────────────────────────────────────────────────

/** Attribute definition for a leaf Export Center category. */
export interface ExportCategoryAttribute {
  attributeId?: number | string;
  attributeName?: string;
  required?: boolean;
  /** Allowed values (for enum-style attributes). */
  values?: unknown[];
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One care-instruction lookup row. */
export interface CareInstruction {
  id?: number | string;
  name?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One material-composition lookup row. */
export interface ProductComposition {
  id?: number | string;
  name?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** One country-of-origin lookup row. */
export interface ProductOrigin {
  id?: number | string;
  name?: string;
  countryCode?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}
