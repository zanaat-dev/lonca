import { ServerError, TimeoutError, ValidationError } from '@lonca/core';
import type { TrendyolTransport } from '../transport.js';
import type { PriceInventoryUpdate, UpdatePriceInventoryResponse } from '../types/inventory.js';
import type { BatchRequestResult } from '../types/product.js';

/** Trendyol's hard limit for items per `updatePriceAndInventory` call. */
const MAX_ITEMS_PER_REQUEST = 1000;

interface TrendyolBatchRequestResponse {
  batchRequestId?: string;
}

/** Function that resolves a batch request's current status (i.e. `products.getBatchStatus`). */
type BatchStatusPoller = (batchRequestId: string) => Promise<BatchRequestResult>;

/** Options controlling how {@link InventoryResource.updateAndWait} / {@link pollBatchStatus} poll. */
export interface BatchPollOptions {
  /** Delay between status polls, in ms. Default: `2000`. */
  pollIntervalMs?: number;
  /** Total time to wait for a batch to settle before throwing `TimeoutError`, in ms. Default: `120000`. */
  timeoutMs?: number;
  /** Abort the wait early. The rejection carries the signal's reason. */
  signal?: AbortSignal;
}

/** Item statuses after which Trendyol does not touch an item again. */
const FINAL_ITEM_STATUSES = new Set(['SUCCESS', 'FAILED']);

/**
 * Whether a batch is done, judged by its items first: every one of its
 * `itemCount` items has a final status (`SUCCESS` / `FAILED`). The batch
 * status alone is not reliable either way on Trendyol stage (2026-10-14): a
 * stock batch stayed `PROCESSING` for good although its item was `SUCCESS`,
 * and a product-create batch turned `COMPLETED` a few seconds before its item
 * result appeared. A `COMPLETED` / `FAILED` batch without an `itemCount` is
 * settled as before.
 */
export function isBatchSettled(result: BatchRequestResult): boolean {
  const expected = result.itemCount;
  if (typeof expected === 'number' && expected > 0) {
    return (
      result.items.length >= expected &&
      result.items.every((item) => FINAL_ITEM_STATUSES.has(item.status ?? ''))
    );
  }
  return result.status === 'COMPLETED' || result.status === 'FAILED';
}

/**
 * Poll a Trendyol batch request until it settles (see {@link isBatchSettled}:
 * `COMPLETED` / `FAILED`, or every item final) or the timeout elapses.
 *
 * Standalone so callers can poll an id obtained elsewhere (e.g. a persisted
 * `batchRequestId` from a previous process) without going through
 * {@link InventoryResource.updateAndWait}.
 *
 * When the timeout elapses on a batch whose status already reads `COMPLETED`
 * / `FAILED`, that last result is returned (some items may be missing)
 * rather than thrown.
 *
 * @throws {TimeoutError} when the batch does not settle within `timeoutMs`;
 *   `error.data` carries `{ batchRequestId, lastStatus, lastResult }`.
 */
export async function pollBatchStatus(
  getStatus: BatchStatusPoller,
  batchRequestId: string,
  opts: BatchPollOptions = {},
): Promise<BatchRequestResult> {
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    opts.signal?.throwIfAborted();
    const result = await getStatus(batchRequestId);
    if (isBatchSettled(result)) {
      return result;
    }
    if (Date.now() >= deadline) {
      if (result.status === 'COMPLETED' || result.status === 'FAILED') return result;
      throw new TimeoutError({
        message: `Trendyol batch ${batchRequestId} did not settle within ${timeoutMs}ms (last status: ${result.status})`,
        data: { batchRequestId, lastStatus: result.status, lastResult: result },
      });
    }
    await delay(pollIntervalMs, opts.signal);
  }
}

/**
 * Trendyol stock & price update endpoint (a.k.a. `updatePriceAndInventory`).
 *
 * Rate limit: **none** — Trendyol explicitly lists this endpoint as
 * `NO LIMIT` in its service limits table. The `15-minute duplicate
 * suppression` rule still applies on Trendyol's side, but that's a
 * server-side concern.
 *
 * The endpoint is asynchronous. {@link InventoryResource.update} returns the
 * `batchRequestId`; poll it yourself with `products.getBatchStatus`, or let
 * {@link InventoryResource.updateAndWait} chunk, submit, and poll for you.
 */
export class InventoryResource {
  /**
   * @param transport Trendyol transport.
   * @param getBatchStatus Batch-status poller (wired by `createTrendyolClient`
   *   to `products.getBatchStatus`). Required only for `updateAndWait`.
   */
  constructor(
    private readonly transport: TrendyolTransport,
    private readonly getBatchStatus?: BatchStatusPoller,
  ) {}

  /**
   * Update price and/or stock for one or more SKUs (by barcode).
   *
   * @example
   * ```ts
   * const { batchRequestId } = await client.inventory.update([
   *   { barcode: 'ABC123', quantity: 42, salePrice: 199.9, listPrice: 249.9 },
   *   { barcode: 'XYZ789', quantity: 0 },
   * ]);
   * const status = await client.products.getBatchStatus(batchRequestId);
   * ```
   *
   * @throws {ValidationError} when `items` is empty or longer than 1000.
   * @throws {ServerError} when Trendyol accepts the request but returns no
   *   `batchRequestId` (an unpollable response — surfaced loudly instead of
   *   handing back an empty id).
   */
  async update(items: PriceInventoryUpdate[]): Promise<UpdatePriceInventoryResponse> {
    if (items.length === 0) {
      throw new ValidationError({ message: 'updatePriceAndInventory: items must not be empty' });
    }
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      throw new ValidationError({
        message: `updatePriceAndInventory: max ${MAX_ITEMS_PER_REQUEST} items per request, got ${items.length}`,
      });
    }

    const data = await this.transport.request<TrendyolBatchRequestResponse>({
      method: 'POST',
      path: `/integration/inventory/sellers/${this.transport.sellerId}/products/price-and-inventory`,
      body: { items },
    });

    if (!data.batchRequestId) {
      throw new ServerError({
        message: 'Trendyol updatePriceAndInventory returned no batchRequestId',
        data: { response: data },
      });
    }

    return { batchRequestId: data.batchRequestId };
  }

  /**
   * Submit price/stock updates and wait for them to settle.
   *
   * Splits `items` into chunks of ≤1000, submits each via {@link update}, and
   * polls each `batchRequestId` to a terminal state. Returns one
   * `BatchRequestResult` per chunk (read `failedItemCount` / `items[]` for
   * per-barcode outcomes). Compose `@lonca/core`'s `retry` around this for
   * transient-error resilience.
   *
   * @throws {ValidationError} when `items` is empty.
   * @throws {TimeoutError} when any chunk does not settle within `timeoutMs`;
   *   `error.data.batchRequestId` identifies the stuck chunk.
   */
  async updateAndWait(
    items: PriceInventoryUpdate[],
    opts: BatchPollOptions = {},
  ): Promise<BatchRequestResult[]> {
    if (items.length === 0) {
      throw new ValidationError({ message: 'updateAndWait: items must not be empty' });
    }
    const getStatus = this.getBatchStatus;
    if (!getStatus) {
      throw new Error(
        'updateAndWait requires a batch-status poller; obtain the client via createTrendyolClient()',
      );
    }

    const results: BatchRequestResult[] = [];
    for (const batch of chunk(items, MAX_ITEMS_PER_REQUEST)) {
      const { batchRequestId } = await this.update(batch);
      results.push(await pollBatchStatus(getStatus, batchRequestId, opts));
    }
    return results;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
