import type { CursorPaginationParams, Money } from '@lonca/core';

/**
 * Product approval status, as documented for the `productStatus` filter of
 * `GET /ms/product-query`. The response's `status` field is assumed to use the
 * same vocabulary (the documented example returns `"Active"`); unknown values
 * pass through as plain strings.
 */
export type N11ProductStatus =
  | 'Active'
  | 'InCatalogApproval'
  | 'Suspended'
  | 'CatalogRejected'
  | 'Prohibited'
  | 'Unlisted'
  | 'InApproval'
  | (string & {});

/** Sale status (`saleStatus`): on sale or out of stock. */
export type N11SaleStatus = 'On_Sale' | 'Out_Of_Stock' | (string & {});

/** Who ships the item: the seller, or n11's own warehouse (n11depom). */
export type N11Sender = 'SELLER' | 'N11' | (string & {});

/** One attribute on a listed product (`attributes[]`). */
export interface N11ProductAttribute {
  attributeId: string;
  attributeName?: string;
  attributeValue?: string;
}

/**
 * One seller product (SKU) from `GET /ms/product-query`.
 *
 * IDs are strings (Lonca convention; n11 also warns that numeric IDs grow in
 * width over time). Prices are {@link Money} in minor units; n11's `TL`
 * currency code is normalised to ISO 4217 `TRY`.
 */
export interface N11Product {
  /** n11 product code (`n11ProductId`). */
  id: string;
  /** Seller stock code — the key every write service uses. */
  stockCode: string;
  title: string;
  /** HTML description. */
  description?: string;
  categoryId: string;
  /** Model / group code that ties variants together. */
  productMainId?: string;
  status: N11ProductStatus;
  saleStatus?: N11SaleStatus;
  /** Days needed before handing the parcel to the carrier. */
  preparingDay?: number;
  /** Name of the shipment template defined in Seller Office. */
  shipmentTemplate?: string;
  maxPurchaseQuantity?: number;
  catalogId?: string;
  barcode?: string;
  /** Catalogue group id. */
  groupId?: string;
  salePrice?: Money;
  listPrice?: Money;
  quantity?: number;
  /** VAT rate in percent (documented values: 0, 1, 10, 20). */
  vatRate?: number;
  /** Commission rate in percent. */
  commissionRate?: number;
  sender?: N11Sender;
  attributes: N11ProductAttribute[];
  images: string[];
  /** Untouched raw row — read fields not modelled yet (`customTextOptions`, `rejectInfo`, …). */
  raw: Record<string, unknown>;
}

/** Filters for {@link ProductsResource.list}; every field is optional. */
export interface ListN11ProductsParams extends CursorPaginationParams {
  /** n11 product code. */
  id?: string;
  /** Group (model) code. */
  productMainId?: string;
  /** Seller stock code — one value per request. */
  stockCode?: string;
  saleStatus?: 'On_Sale' | 'Out_Of_Stock';
  productStatus?: N11ProductStatus;
  brandName?: string;
  /**
   * Sent comma-separated as one `categoryIds` value. At most 1000 ids: n11
   * answers a longer list with a `500`, so the SDK rejects it before sending.
   */
  categoryIds?: readonly (string | number)[];
  /** Defaults to `SELLER` server-side. `ALL` includes n11depom stock. */
  sender?: 'SELLER' | 'N11' | 'ALL';
}
