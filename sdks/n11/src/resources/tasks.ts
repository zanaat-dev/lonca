import {
  NotFoundError,
  ServerError,
  TimeoutError,
  ValidationError,
  type TokenBucketRateLimiter,
} from '@lonca/core';
import type { N11Transport } from '../transport.js';
import type {
  N11ProductTask,
  N11TaskDetails,
  N11TaskItemResult,
  N11TaskPollOptions,
} from '../types/task.js';

/** Documented maximum SKUs per task request. */
export const MAX_SKUS_PER_TASK = 1000;
/** Task-details page size; one page holds a whole task. */
const TASK_DETAILS_PAGE_SIZE = 1000;

interface ProductTaskWire {
  id?: number | string;
  type?: string;
  status?: string;
  reasons?: string[] | null;
}

interface TaskItemWire {
  itemCode?: string | null;
  status?: string;
  reasons?: string[] | null;
  sku?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface TaskDetailsWire {
  taskId?: number | string;
  status?: string;
  createdDate?: string | null;
  modifiedDate?: string | null;
  skus?: { content?: TaskItemWire[] | null; last?: boolean; totalPages?: number } | null;
}

/** Reject an empty or oversized batch before it reaches n11. */
export function checkBatchSize(method: string, items: readonly unknown[]): void {
  if (items.length === 0) {
    throw new ValidationError({ message: `${method}: items must not be empty` });
  }
  if (items.length > MAX_SKUS_PER_TASK) {
    throw new ValidationError({
      message: `${method}: at most ${MAX_SKUS_PER_TASK} items per request, got ${items.length}`,
    });
  }
}

/** n11 fails a price with more than 2 decimals per SKU; catch it before sending. */
export function checkPrice(method: string, field: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || Number(value.toFixed(2)) !== value) {
    throw new ValidationError({
      message: `${method}: ${field} must be a non-negative amount with at most 2 decimals`,
    });
  }
}

/**
 * Queue a product task. n11 answers `{ id, type, status, reasons }`; a
 * `REJECT` status means nothing was queued and is thrown as `ValidationError`.
 * Request-level mistakes (missing integrator, empty `skus`, malformed values)
 * come back as HTTP 500 `TASK_ERR_*` and are mapped to `ValidationError` by
 * `mapHttpError`.
 */
export async function submitTask(
  transport: N11Transport,
  path: string,
  skus: unknown[],
  limiter?: TokenBucketRateLimiter,
): Promise<N11ProductTask> {
  const data = await transport.request<ProductTaskWire | undefined>({
    method: 'POST',
    path,
    body: { payload: { integrator: transport.integratorName, skus } },
    rateLimiter: limiter,
  });
  const task: N11ProductTask = {
    taskId: data?.id === undefined || data.id === null ? '' : String(data.id),
    type: data?.type ?? '',
    status: data?.status ?? '',
    reasons: data?.reasons ?? [],
  };
  if (task.status === 'REJECT') {
    throw new ValidationError({
      message: 'n11 rejected the task',
      data: { task },
      issues: task.reasons.map((message) => ({ message })),
    });
  }
  if (!task.taskId) {
    throw new ServerError({ message: 'n11 returned no task id', data: { response: data } });
  }
  return task;
}

/**
 * Read a task's details (`POST /ms/product/task-details/page-query`), every
 * page. An unknown task id answers `200 {}`, thrown as `NotFoundError`.
 */
export async function getTaskDetails(
  transport: N11Transport,
  taskId: string,
  limiter?: TokenBucketRateLimiter,
): Promise<N11TaskDetails> {
  const items: N11TaskItemResult[] = [];
  let first: TaskDetailsWire | undefined;
  for (let page = 0; ; page++) {
    const data = await transport.request<TaskDetailsWire | undefined>({
      method: 'POST',
      path: '/ms/product/task-details/page-query',
      body: { taskId: Number(taskId), pageable: { page, size: TASK_DETAILS_PAGE_SIZE } },
      // A read sent as POST: safe to retry.
      idempotent: true,
      rateLimiter: limiter,
    });
    if (data?.taskId === undefined || data.taskId === null) {
      throw new NotFoundError({ message: `n11 task ${taskId} not found`, data: { taskId } });
    }
    first ??= data;
    for (const row of data.skus?.content ?? []) {
      // While the task runs n11 adds a row with no itemCode ("N sku işlenmeye alındı.").
      if (!row.itemCode) continue;
      items.push(normalizeItem(row));
    }
    const totalPages = data.skus?.totalPages ?? 1;
    if (data.skus?.last !== false || page + 1 >= totalPages) break;
  }
  const details: N11TaskDetails = {
    taskId: String(first.taskId),
    status: first.status ?? '',
    items,
    successCount: items.filter((i) => i.status === 'SUCCESS').length,
    failCount: items.filter((i) => i.status === 'FAIL').length,
  };
  if (first.createdDate) details.createdDate = first.createdDate;
  if (first.modifiedDate) details.modifiedDate = first.modifiedDate;
  return details;
}

function normalizeItem(row: TaskItemWire): N11TaskItemResult {
  const item: N11TaskItemResult = {
    stockCode: String(row.itemCode),
    status: row.status ?? '',
    reasons: row.reasons ?? [],
    raw: row,
  };
  const productId = row.sku?.n11ProductId;
  if (typeof productId === 'number' || typeof productId === 'string') {
    item.n11ProductId = String(productId);
  }
  return item;
}

/**
 * Poll a task until it is `PROCESSED` or `REJECT`, or the timeout elapses.
 *
 * @throws {TimeoutError} when the task is still running after `timeoutMs`;
 *   `error.data` carries `{ taskId, lastStatus, lastResult }`.
 */
export async function pollTask(
  getDetails: (taskId: string) => Promise<N11TaskDetails>,
  taskId: string,
  opts: N11TaskPollOptions = {},
): Promise<N11TaskDetails> {
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    opts.signal?.throwIfAborted();
    const result = await getDetails(taskId);
    if (result.status === 'PROCESSED' || result.status === 'REJECT') return result;
    if (Date.now() >= deadline) {
      throw new TimeoutError({
        message: `n11 task ${taskId} did not finish within ${timeoutMs}ms (last status: ${result.status})`,
        data: { taskId, lastStatus: result.status, lastResult: result },
      });
    }
    await delay(pollIntervalMs, opts.signal);
  }
}

/** Split `items` into chunks of at most {@link MAX_SKUS_PER_TASK}. */
export function chunk<T>(items: readonly T[], size = MAX_SKUS_PER_TASK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
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
