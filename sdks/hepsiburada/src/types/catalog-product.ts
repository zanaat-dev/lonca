/**
 * Hepsiburada Catalog Product (merchant SKU rows) types.
 *
 * Source: `katalog-urun-entegrasyonu` v1.0 (developers.hepsiburada.com) +
 * discovery-first against `mpop[-sit].hepsiburada.com/product/api/products/*`.
 *
 * The catalog tracks per-field revision history, validation state,
 * matching state, and product-quality scoring per merchant SKU.
 */

/**
 * Paging for the catalog list endpoints. Hepsiburada pages the catalog by
 * **page number** (`page` / `size`, zero-based). `offset` / `limit` are
 * accepted as an alias so the methods plug straight into `paginateOffset`
 * from `@lonca/core` — `offset` must then be a whole multiple of `limit`,
 * because the API cannot address an arbitrary row offset. Use one style per
 * call, not both.
 *
 * @example
 * for await (const p of paginateOffset((q) => client.catalog.listProducts(q), { limit: 100 })) {
 *   console.log(p.merchantSku);
 * }
 */
export interface CatalogPagingParams {
  /** Zero-based page index. Omitted ⇒ Hepsiburada's default (`0`). */
  page?: number;
  /** Rows per page. Omitted ⇒ Hepsiburada applies its own default page size. */
  size?: number;
  /** Row offset (`paginateOffset` style). Must be a multiple of `limit`. */
  offset?: number;
  /** Rows per page (`paginateOffset` style alias of `size`). */
  limit?: number;
}

/** Query parameters for `catalog.listProducts()`. */
export interface ListCatalogProductsParams extends CatalogPagingParams {
  /** Narrow to one barcode (documented filter; verified live). */
  barcode?: string;
  /** Narrow to one merchant SKU (documented filter; verified live). */
  merchantSku?: string;
  /** Narrow to one Hepsiburada SKU (documented filter; verified live). */
  hbSku?: string;
}

/**
 * Catalog lifecycle status exactly as Hepsiburada's product API spells it —
 * the closed enum documented for the `productStatus` query parameter of
 * `products-by-merchant-and-status` (and the `status` field on
 * `all-products-of-merchant` rows). Values are UPPER_SNAKE; the API answers
 * HTTP 500 to anything else, including differently-cased spellings
 * (verified live 2026-08).
 */
export type CatalogProductLifecycleStatus =
  | 'WAITING'
  | 'IN_EXTERNAL_PROGRESS'
  | 'PRE_MATCHED'
  | 'MATCHED'
  | 'REJECTED'
  | 'MATCHED_WITH_STAGED'
  | 'MISSING_INFO'
  | 'CREATED'
  | 'BLOCKED';

/** Query parameters for `catalog.listProductsByStatus()`. */
export interface ListProductsByStatusParams extends CatalogPagingParams {
  /**
   * Lifecycle status to filter by — **required** by Hepsiburada (sent as the
   * `productStatus` query parameter). Use the API's UPPER_SNAKE vocabulary
   * (`'MATCHED'`, `'WAITING'`, …): the server returns HTTP 500 for unknown or
   * differently-cased values. Strings outside the documented union are passed
   * through unchanged so a newly added status works before this type catches up.
   */
  status: CatalogProductLifecycleStatus | (string & {});
  /**
   * Documented optional boolean filter, sent as `taskStatus`. Passed through
   * as-is — Hepsiburada does not document what it selects.
   */
  taskStatus?: boolean;
  /** Documented `version` query parameter (Hepsiburada's default is `1`). Passed through as-is. */
  version?: number;
  /**
   * @deprecated Not a documented parameter — Hepsiburada ignores it (verified
   *   live). It is no longer sent and will be removed in a future minor.
   */
  modifiedAtSince?: string;
}

/** One field on a catalog product (value + revision history). */
export interface CatalogField<V = string> {
  value: V;
  mandatory?: boolean;
  detail?: {
    revisedBy?: string;
    revisionDate?: string;
  };
  history?: Array<{
    revisedBy?: string;
    revisionDate?: string;
    value?: V;
  }>;
}

/** One `{ name, value }` attribute pair (e.g. on `matchedHbProductInfo[]`). */
export interface CatalogAttributePair {
  /** Attribute name (e.g. `'Renk'`). */
  name?: string;
  /** Attribute value, always a string on the wire. */
  value?: string;
}

/** One `{ name, value, mandatory }` attribute on a `listProducts` row. */
export interface CatalogProductAttribute extends CatalogAttributePair {
  /** Whether the category requires the attribute. */
  mandatory?: boolean;
}

/** One validation finding on a catalog row. */
export interface CatalogValidationResult {
  /** Name of the attribute that failed validation. */
  attributeName?: string;
  /** Human-readable validation message. */
  message?: string;
}

/** One open task on a `listProductsByStatus` row (spec `taskDetails[]`). */
export interface CatalogTaskDetail {
  reason?: string;
  url?: string;
  /** Comments on the task; element shape undocumented, passed through. */
  commentList?: unknown[];
}

/** The Hepsiburada product a `listProductsByStatus` row was matched to (spec `matchedHbProductInfo[]`). */
export interface CatalogMatchedHbProduct {
  hbSku?: string;
  productName?: string;
  brand?: string;
  /** Image URLs in display order. */
  images?: string[];
  /** Variant-defining attributes of the matched product. */
  variantTypeAttributes?: CatalogAttributePair[];
}

/**
 * One row in the merchant's catalog, from either list endpoint. The two
 * endpoints return **different** row shapes (spec `mpop-catalog.json`,
 * confirmed on the prod wire 2026-10); each field says which one fills it:
 *
 * - `catalog.listProducts()` (`all-products-of-merchant`): `merchantSku`,
 *   `barcode`, `hbSku`, `variantGroupId`, `title`, `brand`, `images`,
 *   `categoryId`, `categoryName`, `description`, `price`, `tax`, `status`,
 *   the three attribute lists, `validationResults`, `rejectReasons`.
 * - `catalog.listProductsByStatus()` (`products-by-merchant-and-status`):
 *   `merchantSku`, `barcode`, `hbSku`, `variantGroupId`, `title`,
 *   `productStatus` (also copied to `status`), `taskDetails`,
 *   `validationResults`, `matchedHbProductInfo`, `rejectReasonsMessages`,
 *   `videoStatus`.
 *
 * Every field is optional and only set when the wire value has the documented
 * JSON type. Fields marked `@deprecated` are documented by neither endpoint
 * and absent from the prod wire — they are never populated in practice.
 */
export interface CatalogProduct {
  /** Merchant SKU. Both endpoints. */
  merchantSku?: string;
  /** Product barcode. Both endpoints. */
  barcode?: string;
  /** Hepsiburada SKU (`HBV…`) once matched. Both endpoints. */
  hbSku?: string;
  /** Variant group id. Both endpoints. */
  variantGroupId?: string;
  /**
   * Lifecycle status (`CatalogProductLifecycleStatus` vocabulary). Wire
   * `status` on `listProducts` rows; copied from `productStatus` on
   * `listProductsByStatus` rows.
   */
  status?: string;
  /** Lifecycle status as `listProductsByStatus` rows spell it (wire `productStatus`). */
  productStatus?: string;
  /**
   * Product title, from the wire's `productName` (both endpoints; also tried:
   * the legacy `fields` map, `name`, `title`). `undefined` when absent —
   * never guessed.
   */
  title?: string;
  /** Hepsiburada category id, stringified from the wire number. `listProducts` only. */
  categoryId?: string;
  /** Human-readable category name. `listProducts` only. */
  categoryName?: string;
  /** Brand name. `listProducts` only. */
  brand?: string;
  /** Product description. `listProducts` only. */
  description?: string;
  /** Image URLs in display order. `listProducts` only. */
  images?: string[];
  /** Price — a **string** on the wire (spec and prod), passed through unparsed. `listProducts` only. */
  price?: string;
  /** VAT rate — a string on the wire, passed through. `listProducts` only. */
  tax?: string;
  /** Base (common) attributes. `listProducts` only. */
  baseAttributes?: CatalogProductAttribute[];
  /** Category-specific attributes. `listProducts` only. */
  productAttributes?: CatalogProductAttribute[];
  /** Variant-defining attributes. `listProducts` only. */
  variantTypeAttributes?: CatalogProductAttribute[];
  /** Validation findings. Both endpoints. */
  validationResults?: CatalogValidationResult[];
  /** Rejection reasons. `listProducts` only. */
  rejectReasons?: string[];
  /** Rejection reason messages. `listProductsByStatus` only. */
  rejectReasonsMessages?: string[];
  /** Open tasks on the row. `listProductsByStatus` only. */
  taskDetails?: CatalogTaskDetail[];
  /** The Hepsiburada product(s) the row was matched to. `listProductsByStatus` only. */
  matchedHbProductInfo?: CatalogMatchedHbProduct[];
  /** Product video status. `listProductsByStatus` only. */
  videoStatus?: string;
  /**
   * @deprecated Neither list endpoint documents or sends a row id — never
   *   populated. Identify rows by {@link merchantSku} / {@link hbSku}. Will be
   *   removed in the next major.
   */
  id?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  createdAt?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  createdBy?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  modifiedAt?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  modifiedBy?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Use `matchedHbProductInfo[].hbSku`. Will be removed in the next major. */
  preMatchedSku?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  siblingSku?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  listingStatus?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Use {@link rejectReasons} / {@link rejectReasonsMessages}. Will be removed in the next major. */
  listingFailureReason?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Use {@link validationResults}. Will be removed in the next major. */
  validationStatus?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  productType?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  uploadDate?: string;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  productQuality?: number;
  /** @deprecated Not sent by either list endpoint — never populated. Will be removed in the next major. */
  categoryScore?: number;
  /**
   * @deprecated Neither list endpoint sends a per-field `fields` map — never
   *   populated. The content it was meant to carry is on the typed fields
   *   above (`title`, `brand`, the attribute lists, …). Will be removed in the
   *   next major.
   */
  fields?: Record<string, CatalogField<unknown>>;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * Receipt returned by upload endpoints — Hepsiburada synchronously returns
 * an opaque `trackingId` you can poll via `catalog.getProductStatus()`.
 */
export interface CatalogTrackingReceipt {
  trackingId: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** Status check result for a tracking-id. */
export interface CatalogProductStatus {
  trackingId?: string;
  status?: string;
  /** Envelope result: `false` when Hepsiburada rejected the request itself. */
  success?: boolean;
  /** Hepsiburada's result code (`0` on success). */
  code?: number;
  message?: string;
  /** Per-row results when the upload contained multiple products. */
  rows?: Array<Record<string, unknown>>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** One tracking-id history entry. */
export interface TrackingIdHistoryEntry {
  trackingId?: string;
  createdAt?: string;
  status?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/**
 * One product for `catalog.uploadProductViaFile()`, as the portal documents
 * the upload file ("Ürün Bilgisi Gönderme"). Attribute keys are Hepsiburada's
 * own (`merchantSku`, `VaryantGroupID`, `Barcode`, `UrunAdi`, `UrunAciklamasi`,
 * `Marka`, `GarantiSuresi`, `kg`, `tax_vat_rate`, `price`, `stock`,
 * `Image1`–`Image10`, `Video1`, plus the category's attributes such as
 * `renk_variant_property`); `catalog.getAttributes` lists them per category.
 */
export interface CatalogUploadProduct {
  /** A leaf category id; anything else fails the row ("Category is not a leaf category"). */
  categoryId: number;
  /** Merchant id; the SDK fills in the client's merchant id when omitted. */
  merchant?: string;
  attributes: { merchantSku: string } & Record<string, string | number>;
}

/**
 * Body for `catalog.uploadProductViaFile()`.
 *
 * @deprecated Kept for compatibility; type the rows as {@link CatalogUploadProduct}.
 */
export type UploadProductsInput = unknown[];

/** Body for `catalog.uploadFastListing()`. */
export type FastListingInput = unknown[] | Record<string, unknown>;

/**
 * One `{ merchant, merchantSkuList }` group — the spec's
 * `MerchantAndMerchantSkuListDTO` (`mpop-catalog.json`). Both fields are
 * required per spec; the hints stay optional in TS and extra fields pass
 * through.
 */
export type MerchantSkuGroup = {
  /** Merchant id (GUID). Required per spec. */
  merchant?: string;
  /** Merchant SKUs to act on. Required per spec. */
  merchantSkuList?: string[];
} & Record<string, unknown>;

/**
 * Body for `catalog.approvePreMatch()` / `catalog.rejectPreMatch()` — the
 * spec (`integratorApprovePreMatch` / `integratorRejectPreMatch`) takes an
 * **array** of {@link MerchantSkuGroup}; a plain object also passes through
 * unchanged for backwards compatibility.
 */
export type PreMatchActionInput = MerchantSkuGroup[] | MerchantSkuGroup;

/** Body for `catalog.deleteByMerchantSkuList()` — Hepsiburada wants an SKU list. */
export type DeleteBySkuInput = { merchantSkuList?: string[]; [key: string]: unknown };

/**
 * One product for `catalog.deleteByMerchantSkuList()` — the spec's
 * `MerchantAndMerchantSkuDTO`. `merchant` defaults to the client's merchant id.
 */
export interface DeleteBySkuItem {
  merchantSku: string;
  merchant?: string;
}

/**
 * Body for `catalog.checkProductStatus()` — the spec (`checkProductStatus`)
 * takes an **array** of {@link MerchantSkuGroup}; a plain object also passes
 * through unchanged for backwards compatibility.
 */
export type CheckProductStatusInput = MerchantSkuGroup[] | MerchantSkuGroup;
