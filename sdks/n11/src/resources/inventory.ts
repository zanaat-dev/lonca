import { ValidationError, type TokenBucketRateLimiter } from '@lonca/core';
import type { N11Transport } from '../transport.js';
import type {
  N11PriceStockUpdate,
  N11ProductTask,
  N11TaskDetails,
  N11TaskPollOptions,
} from '../types/task.js';
import {
  checkBatchSize,
  checkPrice,
  chunk,
  getTaskDetails,
  pollTask,
  submitTask,
} from './tasks.js';

const METHOD = 'inventory.update';

/**
 * n11 price and stock updates (`POST /ms/product/tasks/price-stock-update`).
 *
 * Source: developer.n11.com → "Ürün Fiyat-Stok Güncelleme"; behaviour checked
 * on n11's test store on 2026-10-13: a stock-only update works, a price change
 * needs `salePrice` and `listPrice` together, more than 2 decimals or a
 * `listPrice` below `salePrice` fails the SKU, an unknown stock code fails the
 * SKU, and a stock code sent twice in one task is applied twice in order.
 *
 * Rate limit: n11 publishes no figure for this service (it "varies with the
 * number of products") and suspends IPs that send requests milliseconds apart.
 * {@link updateAndWait} submits chunks one after another and waits for each,
 * which keeps a large sync well spaced; inject a limiter to share a budget.
 */
export class InventoryResource {
  constructor(
    private readonly transport: N11Transport,
    private readonly limiter?: TokenBucketRateLimiter,
  ) {}

  /**
   * Queue one price/stock task of at most 1000 SKUs. Returns the task; read
   * per-SKU outcomes with `products.getTask(taskId)`.
   *
   * @throws {ValidationError} for an empty or oversized batch, an item with
   *   neither stock nor prices, a lone `salePrice` or `listPrice`, a price with
   *   more than 2 decimals, or `listPrice` below `salePrice` (all checked
   *   before sending).
   */
  async update(items: readonly N11PriceStockUpdate[]): Promise<N11ProductTask> {
    checkBatchSize(METHOD, items);
    return submitTask(
      this.transport,
      '/ms/product/tasks/price-stock-update',
      items.map(priceStockSku),
      this.limiter,
    );
  }

  /**
   * Split `items` into tasks of at most 1000 SKUs, submit them one by one and
   * wait for each to finish. Returns one {@link N11TaskDetails} per task; read
   * `failCount` / `items[]` for per-SKU outcomes.
   *
   * @throws {ValidationError} when `items` is empty or an item is invalid (the
   *   whole list is checked before the first task is sent).
   * @throws {TimeoutError} when a task does not finish within `opts.timeoutMs`.
   */
  async updateAndWait(
    items: readonly N11PriceStockUpdate[],
    opts: N11TaskPollOptions = {},
  ): Promise<N11TaskDetails[]> {
    if (items.length === 0) {
      throw new ValidationError({ message: 'inventory.updateAndWait: items must not be empty' });
    }
    items.forEach(priceStockSku);
    const results: N11TaskDetails[] = [];
    for (const batch of chunk(items)) {
      const { taskId } = await this.update(batch);
      results.push(
        await pollTask((id) => getTaskDetails(this.transport, id, this.limiter), taskId, opts),
      );
    }
    return results;
  }
}

function priceStockSku(item: N11PriceStockUpdate): Record<string, unknown> {
  const hasSale = item.salePrice !== undefined;
  const hasList = item.listPrice !== undefined;
  if (hasSale !== hasList) {
    throw new ValidationError({
      message: `${METHOD}: send salePrice and listPrice together (${item.stockCode})`,
    });
  }
  if (!hasSale && item.quantity === undefined) {
    throw new ValidationError({
      message: `${METHOD}: ${item.stockCode} has neither quantity nor prices`,
    });
  }
  checkPrice(METHOD, 'salePrice', item.salePrice);
  checkPrice(METHOD, 'listPrice', item.listPrice);
  if (hasSale && item.listPrice! < item.salePrice!) {
    throw new ValidationError({
      message: `${METHOD}: listPrice must not be below salePrice (${item.stockCode})`,
    });
  }
  if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 0)) {
    throw new ValidationError({
      message: `${METHOD}: quantity must be a non-negative integer (${item.stockCode})`,
    });
  }
  const sku: Record<string, unknown> = { stockCode: item.stockCode };
  if (item.quantity !== undefined) sku.quantity = item.quantity;
  if (hasSale) {
    sku.listPrice = item.listPrice;
    sku.salePrice = item.salePrice;
  }
  if (item.currencyType !== undefined) sku.currencyType = item.currencyType;
  return sku;
}
