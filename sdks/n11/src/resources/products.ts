import {
  moneyFromMajor,
  TRY,
  ValidationError,
  type CursorPage,
  type Money,
  type TokenBucketRateLimiter,
} from '@lonca/core';
import type { N11Transport } from '../transport.js';
import type { ListN11ProductsParams, N11Product, N11ProductAttribute } from '../types/product.js';

/** Server default page size when `size` is omitted (documented). */
const DEFAULT_PAGE_SIZE = 20;
/** Documented maximum `size` for `GET /ms/product-query`. */
const MAX_PAGE_SIZE = 250;
/** n11 answers more `categoryIds` than this with a `500` (n11 support, 2026-10-13). */
const MAX_CATEGORY_IDS = 1000;

/**
 * One row of `GET /ms/product-query`. Field names and types match prod
 * (2026-10-10): ids and amounts are JSON numbers, `barcode` and
 * `maxPurchaseQuantity` can be `null`, and `rejectInfo` is absent on active
 * products. Every field stays optional.
 */
interface N11ProductWire {
  n11ProductId?: number | string;
  sellerId?: number;
  sellerNickname?: string;
  stockCode?: string;
  title?: string;
  description?: string | null;
  categoryId?: number | string;
  productMainId?: string | null;
  status?: string;
  saleStatus?: string;
  preparingDay?: number;
  shipmentTemplate?: string;
  maxPurchaseQuantity?: number | null;
  customTextOptions?: unknown[];
  catalogId?: number | string | null;
  barcode?: string | null;
  groupId?: number | string | null;
  currencyType?: string;
  salePrice?: number | null;
  listPrice?: number | null;
  quantity?: number;
  attributes?: { attributeId?: number | string; attributeName?: string; attributeValue?: string }[];
  imageUrls?: string[];
  vatRate?: number;
  commissionRate?: number;
  sender?: string;
  rejectInfo?: unknown;
}

/** Spring-Data-style page envelope documented for `GET /ms/product-query`. */
interface N11ProductQueryResponse {
  content?: N11ProductWire[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
  numberOfElements?: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
}

/** n11 writes Turkish lira as `TL`; Lonca uses ISO 4217. */
function toCurrency(code: string | undefined): string {
  if (!code || code === 'TL') return TRY;
  return code;
}

function toMoney(value: number | null | undefined, currency: string): Money | undefined {
  return typeof value === 'number' ? moneyFromMajor(value, currency) : undefined;
}

function optionalId(value: number | string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function toAttribute(node: NonNullable<N11ProductWire['attributes']>[number]): N11ProductAttribute {
  const attr: N11ProductAttribute = { attributeId: String(node.attributeId ?? '') };
  if (node.attributeName !== undefined) attr.attributeName = node.attributeName;
  if (node.attributeValue !== undefined) attr.attributeValue = node.attributeValue;
  return attr;
}

function normalizeProduct(row: N11ProductWire): N11Product {
  const currency = toCurrency(row.currencyType);
  const product: N11Product = {
    id: String(row.n11ProductId ?? ''),
    stockCode: row.stockCode ?? '',
    title: row.title ?? '',
    categoryId: String(row.categoryId ?? ''),
    status: row.status ?? '',
    attributes: (row.attributes ?? []).map(toAttribute),
    images: row.imageUrls ?? [],
    raw: row as Record<string, unknown>,
  };
  if (row.description) product.description = row.description;
  if (row.productMainId) product.productMainId = row.productMainId;
  if (row.saleStatus) product.saleStatus = row.saleStatus;
  if (typeof row.preparingDay === 'number') product.preparingDay = row.preparingDay;
  if (row.shipmentTemplate) product.shipmentTemplate = row.shipmentTemplate;
  if (typeof row.maxPurchaseQuantity === 'number') {
    product.maxPurchaseQuantity = row.maxPurchaseQuantity;
  }
  const catalogId = optionalId(row.catalogId);
  if (catalogId) product.catalogId = catalogId;
  if (row.barcode) product.barcode = row.barcode;
  const groupId = optionalId(row.groupId);
  if (groupId) product.groupId = groupId;
  const salePrice = toMoney(row.salePrice, currency);
  if (salePrice) product.salePrice = salePrice;
  const listPrice = toMoney(row.listPrice, currency);
  if (listPrice) product.listPrice = listPrice;
  if (typeof row.quantity === 'number') product.quantity = row.quantity;
  if (typeof row.vatRate === 'number') product.vatRate = row.vatRate;
  if (typeof row.commissionRate === 'number') product.commissionRate = row.commissionRate;
  if (row.sender) product.sender = row.sender;
  return product;
}

/**
 * n11 seller-product reads (`GET https://api.n11.com/ms/product-query`).
 *
 * Source: https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/
 * — the request filters, the 0-based `page` / `size` (default 20, max 250)
 * pagination and the response fields below all come from that page, and were
 * checked against prod on 2026-10-10: `size` over 250 is rejected (`500
 * ConstraintViolationException`, mapped to `ValidationError`), a page past the
 * end answers an empty `content`, and a single `categoryIds` value filters.
 * n11 confirmed (2026-10-13) that several `categoryIds` go comma-separated in
 * one value, at most 1000 of them.
 *
 * Rate limit: no per-endpoint limit is documented, so no limiter is applied by
 * default. n11 has no 429: a client that keeps sending requests milliseconds
 * apart is treated as an attack and its IP is suspended, then restricted.
 * Inject a limiter through the constructor when paging through a large catalogue.
 */
export class ProductsResource {
  constructor(
    private readonly transport: N11Transport,
    private readonly limiter?: TokenBucketRateLimiter,
  ) {}

  /**
   * List the seller's products, one page at a time.
   *
   * n11 paginates by 0-based page index; the SDK exposes it as the opaque
   * `cursor` of `@lonca/core`'s `CursorPage` (like `@lonca/trendyol`), so
   * `paginate()` drives it. Following the portal's advice, a page is the last
   * one when it comes back empty or when `page + 1 >= totalPages`.
   *
   * @example
   * ```ts
   * import { paginate } from '@lonca/core';
   * for await (const product of paginate((p) => client.products.list({ ...p, saleStatus: 'On_Sale' }))) {
   *   console.log(product.stockCode, product.quantity);
   * }
   * ```
   */
  async list(params: ListN11ProductsParams = {}): Promise<CursorPage<N11Product>> {
    if (params.categoryIds && params.categoryIds.length > MAX_CATEGORY_IDS) {
      throw new ValidationError({
        message: `products.list: categoryIds accepts at most ${MAX_CATEGORY_IDS} ids`,
      });
    }
    const page = parsePageCursor(params.cursor);
    const size = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const data = await this.transport.request<N11ProductQueryResponse | undefined>({
      method: 'GET',
      path: '/ms/product-query',
      query: {
        id: params.id,
        productMainId: params.productMainId,
        stockCode: params.stockCode,
        saleStatus: params.saleStatus,
        productStatus: params.productStatus,
        brandName: params.brandName,
        categoryIds: params.categoryIds,
        sender: params.sender,
        page,
        size,
      },
      rateLimiter: this.limiter,
    });

    const rows = data?.content ?? [];
    const result: CursorPage<N11Product> = { items: rows.map(normalizeProduct) };
    const totalPages = data?.totalPages;
    const hasMore =
      rows.length > 0 && data?.last !== true && (totalPages === undefined || page + 1 < totalPages);
    if (hasMore) result.nextCursor = String(page + 1);
    return result;
  }
}

function parsePageCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 0) {
    throw new TypeError(`n11 products cursor must be a non-negative page index, got "${cursor}"`);
  }
  return page;
}
