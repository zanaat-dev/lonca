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
import type {
  N11ProductAttributeInput,
  N11ProductCreateItem,
  N11ProductTask,
  N11ProductUpdateItem,
  N11TaskDetails,
  N11TaskPollOptions,
} from '../types/task.js';
import { checkBatchSize, checkPrice, getTaskDetails, pollTask, submitTask } from './tasks.js';

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

  /**
   * Upload new products (`POST /ms/product/tasks/product-create`), at most
   * 1000 SKUs per call. Returns the queued task; read the per-SKU outcome with
   * {@link getTask} or {@link waitForTask}. Create tasks can take from seconds
   * to about 15 minutes (observed), so give `waitForTask` a longer `timeoutMs`.
   * Common per-SKU failures: a price above the category's cap ("fahiş fiyat",
   * e.g. "Maximum 42,000 TL"), a missing mandatory attribute, an invalid
   * category, or an image n11 cannot fetch.
   *
   * @throws {ValidationError} for an empty or oversized batch, a price with
   *   more than 2 decimals, or `listPrice` below `salePrice` (all checked
   *   before sending), and for a task n11 rejects.
   */
  async create(items: readonly N11ProductCreateItem[]): Promise<N11ProductTask> {
    checkBatchSize('products.create', items);
    for (const item of items) {
      checkPrice('products.create', 'salePrice', item.salePrice);
      checkPrice('products.create', 'listPrice', item.listPrice);
      if (item.listPrice < item.salePrice) {
        throw new ValidationError({
          message: `products.create: listPrice must not be below salePrice (${item.stockCode})`,
        });
      }
    }
    return submitTask(
      this.transport,
      '/ms/product/tasks/product-create',
      items.map(createSku),
      this.limiter,
    );
  }

  /**
   * Update products (`POST /ms/product/tasks/product-update`), at most 1000
   * SKUs per call: status (`Active` / `Suspended`), preparing day, shipment
   * template, model code, purchase limit, description, VAT and product-safety
   * attributes. Title, brand and other base attributes can only be changed by
   * n11. Prices and stock go through `inventory.update`.
   *
   * @throws {ValidationError} for an empty or oversized batch, or an item with
   *   nothing but a `stockCode` (n11 would fail it).
   */
  async update(items: readonly N11ProductUpdateItem[]): Promise<N11ProductTask> {
    checkBatchSize('products.update', items);
    const skus = items.map((item) => {
      const sku = updateSku(item);
      if (Object.keys(sku).length < 2) {
        throw new ValidationError({
          message: `products.update: ${item.stockCode} has no field to update`,
        });
      }
      return sku;
    });
    return submitTask(this.transport, '/ms/product/tasks/product-update', skus, this.limiter);
  }

  /**
   * Delete products by stock code (`POST /ms/product/tasks/product-delete`),
   * at most 1000 per call. An unknown stock code fails per SKU, not the call.
   */
  async delete(stockCodes: readonly string[]): Promise<N11ProductTask> {
    checkBatchSize('products.delete', stockCodes);
    return submitTask(
      this.transport,
      '/ms/product/tasks/product-delete',
      stockCodes.map((stockCode) => ({ stockCode })),
      this.limiter,
    );
  }

  /**
   * Read a task's state and per-SKU results
   * (`POST /ms/product/task-details/page-query`). Works for every task type,
   * including `inventory.update` tasks.
   *
   * @throws {NotFoundError} for an unknown task id.
   */
  getTask(taskId: string): Promise<N11TaskDetails> {
    return getTaskDetails(this.transport, taskId, this.limiter);
  }

  /**
   * Poll {@link getTask} until the task is `PROCESSED` or `REJECT`.
   *
   * @throws {TimeoutError} when it is still running after `opts.timeoutMs`.
   */
  waitForTask(taskId: string, opts: N11TaskPollOptions = {}): Promise<N11TaskDetails> {
    return pollTask((id) => this.getTask(id), taskId, opts);
  }
}

function attributeInput(attribute: N11ProductAttributeInput) {
  return {
    id: Number(attribute.id),
    valueId:
      attribute.valueId === undefined || attribute.valueId === null
        ? null
        : Number(attribute.valueId),
    customValue: attribute.customValue ?? null,
  };
}

function createSku(item: N11ProductCreateItem): Record<string, unknown> {
  const sku: Record<string, unknown> = {
    title: item.title,
    description: item.description,
    categoryId: Number(item.categoryId),
    currencyType: item.currencyType ?? 'TL',
    productMainId: item.productMainId,
    preparingDay: item.preparingDay,
    shipmentTemplate: item.shipmentTemplate,
    stockCode: item.stockCode,
    quantity: item.quantity,
    images: item.images.map(({ url, order }) => ({ url, order })),
    attributes: item.attributes.map(attributeInput),
    salePrice: item.salePrice,
    listPrice: item.listPrice,
    vatRate: item.vatRate,
  };
  if (item.maxPurchaseQuantity !== undefined) sku.maxPurchaseQuantity = item.maxPurchaseQuantity;
  if (item.catalogId !== undefined) {
    sku.catalogId = item.catalogId === null ? null : Number(item.catalogId);
  }
  if (item.barcode !== undefined) sku.barcode = item.barcode;
  return sku;
}

function updateSku(item: N11ProductUpdateItem): Record<string, unknown> {
  const sku: Record<string, unknown> = { stockCode: item.stockCode };
  const fields = [
    'status',
    'preparingDay',
    'shipmentTemplate',
    'deleteProductMainId',
    'productMainId',
    'deleteMaxPurchaseQuantity',
    'maxPurchaseQuantity',
    'description',
    'vatRate',
  ] as const;
  for (const field of fields) {
    if (item[field] !== undefined) sku[field] = item[field];
  }
  if (item.attributes !== undefined) sku.attributes = item.attributes.map(attributeInput);
  return sku;
}

function parsePageCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const page = Number(cursor);
  if (!Number.isInteger(page) || page < 0) {
    throw new TypeError(`n11 products cursor must be a non-negative page index, got "${cursor}"`);
  }
  return page;
}
