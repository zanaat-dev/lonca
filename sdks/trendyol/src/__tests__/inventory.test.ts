import { describe, expect, it, vi } from 'vitest';
import { ServerError, TimeoutError, ValidationError } from '@lonca/core';
import { InventoryResource, isBatchSettled, pollBatchStatus } from '../resources/inventory.js';
import type { TrendyolTransport } from '../transport.js';
import type { BatchRequestResult, BatchRequestStatus } from '../types/product.js';

function mockTransport(response: unknown) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

function batchResult(status: BatchRequestStatus, batchRequestId = 'b1'): BatchRequestResult {
  return { batchRequestId, status, items: [], raw: {} };
}

describe('InventoryResource.update', () => {
  it('POSTs to /inventory/sellers/{sellerId}/products/price-and-inventory', async () => {
    const transport = mockTransport({ batchRequestId: 'abc' });
    const resource = new InventoryResource(transport);

    await resource.update([{ barcode: 'X1', quantity: 10 }]);

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/inventory/sellers/42/products/price-and-inventory',
      }),
    );
  });

  it('sends the items array as the request body verbatim', async () => {
    const transport = mockTransport({ batchRequestId: 'abc' });
    const resource = new InventoryResource(transport);

    const items = [
      { barcode: 'X1', quantity: 10, salePrice: 99.9, listPrice: 129.9 },
      { barcode: 'X2', quantity: 0 },
    ];
    await resource.update(items);

    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ body: { items } }));
  });

  it('returns the batchRequestId', async () => {
    const transport = mockTransport({ batchRequestId: 'batch-123' });
    const resource = new InventoryResource(transport);

    const result = await resource.update([{ barcode: 'X', quantity: 1 }]);

    expect(result).toEqual({ batchRequestId: 'batch-123' });
  });

  it('throws ServerError when the response carries no batchRequestId', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    await expect(resource.update([{ barcode: 'X', quantity: 1 }])).rejects.toBeInstanceOf(
      ServerError,
    );
  });

  it('rejects an empty items array with ValidationError', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    await expect(resource.update([])).rejects.toBeInstanceOf(ValidationError);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('rejects more than 1000 items with ValidationError', async () => {
    const transport = mockTransport({});
    const resource = new InventoryResource(transport);

    const items = Array.from({ length: 1001 }, (_, i) => ({ barcode: `B${i}`, quantity: 1 }));

    await expect(resource.update(items)).rejects.toBeInstanceOf(ValidationError);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('InventoryResource.updateAndWait', () => {
  it('submits, polls until COMPLETED, and returns the batch result', async () => {
    const transport = mockTransport({ batchRequestId: 'b1' });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(batchResult('PROCESSING'))
      .mockResolvedValueOnce(batchResult('COMPLETED'));
    const resource = new InventoryResource(transport, getStatus);

    const results = await resource.updateAndWait([{ barcode: 'X', quantity: 1 }], {
      pollIntervalMs: 1,
    });

    expect(results.map((r) => r.status)).toEqual(['COMPLETED']);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('chunks >1000 items into multiple submits, one batch result per chunk', async () => {
    const request = vi.fn().mockResolvedValue({ batchRequestId: 'b' });
    const transport = { sellerId: 42, request } as unknown as TrendyolTransport;
    const getStatus = vi.fn().mockResolvedValue(batchResult('COMPLETED', 'b'));
    const resource = new InventoryResource(transport, getStatus);

    const items = Array.from({ length: 1500 }, (_, i) => ({ barcode: `B${i}`, quantity: 1 }));
    const results = await resource.updateAndWait(items, { pollIntervalMs: 1 });

    expect(request).toHaveBeenCalledTimes(2); // 1000 + 500
    expect(results).toHaveLength(2);
  });

  it('throws when no poller was injected (resource built without a client)', async () => {
    const transport = mockTransport({ batchRequestId: 'b1' });
    const resource = new InventoryResource(transport);

    await expect(resource.updateAndWait([{ barcode: 'X', quantity: 1 }])).rejects.toThrow(
      /requires a batch-status poller/,
    );
  });
});

describe('pollBatchStatus', () => {
  it('throws TimeoutError when the batch never settles', async () => {
    const getStatus = vi.fn().mockResolvedValue(batchResult('PROCESSING'));

    await expect(pollBatchStatus(getStatus, 'b1', { timeoutMs: 0 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it('returns immediately when already terminal', async () => {
    const getStatus = vi.fn().mockResolvedValue(batchResult('FAILED'));

    const result = await pollBatchStatus(getStatus, 'b1');

    expect(result.status).toBe('FAILED');
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('settles a PROCESSING batch once every item is final (Trendyol stage, 2026-10-14)', async () => {
    const stuck: BatchRequestResult = {
      ...batchResult('PROCESSING'),
      itemCount: 1,
      failedItemCount: 0,
      items: [{ status: 'SUCCESS', failureReasons: [] }],
    };
    const getStatus = vi.fn().mockResolvedValue(stuck);
    await expect(pollBatchStatus(getStatus, 'b1', { timeoutMs: 1000 })).resolves.toBe(stuck);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});

describe('pollBatchStatus — COMPLETED before the items', () => {
  it('keeps polling a COMPLETED batch until its items arrive', async () => {
    const early: BatchRequestResult = { ...batchResult('COMPLETED'), itemCount: 1, items: [] };
    const done: BatchRequestResult = {
      ...early,
      items: [{ status: 'SUCCESS', failureReasons: [] }],
    };
    const getStatus = vi.fn().mockResolvedValueOnce(early).mockResolvedValueOnce(done);
    await expect(pollBatchStatus(getStatus, 'b1', { pollIntervalMs: 0 })).resolves.toBe(done);
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('returns a COMPLETED batch still missing items when the timeout elapses', async () => {
    const early: BatchRequestResult = { ...batchResult('COMPLETED'), itemCount: 2, items: [] };
    const getStatus = vi.fn().mockResolvedValue(early);
    await expect(pollBatchStatus(getStatus, 'b1', { timeoutMs: 0 })).resolves.toBe(early);
  });
});

describe('isBatchSettled', () => {
  const items = (...statuses: (string | undefined)[]) => statuses.map((status) => ({ status }));

  it.each([
    ['COMPLETED', undefined, [], true],
    ['FAILED', undefined, [], true],
    // Product-create batches read COMPLETED before their items appear (stage, 2026-10-14).
    ['COMPLETED', 1, [], false],
    ['COMPLETED', 1, items('SUCCESS'), true],
    ['PROCESSING', 2, items('SUCCESS', 'FAILED'), true],
    ['PROCESSING', 2, items('SUCCESS'), false],
    ['PROCESSING', 2, items('SUCCESS', 'PENDING'), false],
    ['PROCESSING', 1, items(undefined), false],
    ['PROCESSING', 0, [], false],
    ['COMPLETED', 0, [], true],
    ['PROCESSING', undefined, items('SUCCESS'), false],
  ] as const)('%s with itemCount %s and items %j → %s', (status, itemCount, list, expected) => {
    expect(
      isBatchSettled({
        ...batchResult(status as BatchRequestStatus),
        ...(itemCount === undefined ? {} : { itemCount }),
        items: [...list],
      }),
    ).toBe(expected);
  });
});
