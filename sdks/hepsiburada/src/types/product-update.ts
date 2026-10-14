/**
 * Hepsiburada Product Update types (`urun-guncelleme-entegrasyonu`).
 *
 * Source: developers.hepsiburada.com `urun-guncelleme-entegrasyonu` v1.0.
 * Async upload flow — POST returns a `trackingId` you poll via
 * `getUpdateStatus(trackingId)`.
 */

/** Single update-history row for a specific (merchantId, hbSku) pair. */
export interface ProductUpdateHistoryEntry {
  trackingId?: string;
  status?: string;
  /** When the update request was created (the spec's field). */
  createdAt?: string;
  modifiedAt?: string;
  /** Untouched raw row. */
  raw: Record<string, unknown>;
}

/** Response from `productUpdates.importUpdates()`. */
export interface ProductUpdateReceipt {
  trackingId: string;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/** Status lookup for a single tracking-id. */
export interface ProductUpdateStatus {
  trackingId?: string;
  status?: string;
  /** `false` when Hepsiburada rejected the batch, e.g. code `4009` "Variant is not found." for an unknown `hbSku`. */
  success?: boolean;
  /** Hepsiburada's result code (`0` on success). */
  code?: number;
  message?: string;
  rows?: Array<Record<string, unknown>>;
  /** Untouched raw response. */
  raw: Record<string, unknown>;
}

/**
 * One product in `productUpdates.importUpdates()`, as the portal documents the
 * `items[]` of the upload file ("Ürün Güncelleme Servisi"). Send only the
 * fields you want to change, so Hepsiburada's own corrections are kept; an
 * empty attribute value (`''`) clears that attribute.
 */
export type ProductUpdateItem = {
  /** Hepsiburada SKU of a listing of this merchant. */
  hbSku: string;
  productName?: string;
  productDescription?: string;
  /** Product video URL. */
  video?: string;
  /** Attribute values by attribute key, e.g. `{ renk_variant_property: 'Siyah' }`. */
  attributes?: Record<string, string>;
} & Partial<Record<`image${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, string>>;

/**
 * Input of `productUpdates.importUpdates()`.
 *
 * @deprecated Kept for compatibility; type the rows as {@link ProductUpdateItem}.
 */
export type ProductUpdateInput = unknown[];
