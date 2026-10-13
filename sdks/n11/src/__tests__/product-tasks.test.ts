import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NotFoundError,
  ServerError,
  TimeoutError,
  TokenBucketRateLimiter,
  ValidationError,
} from '@lonca/core';
import { mapHttpError } from '../errors.js';
import { InventoryResource } from '../resources/inventory.js';
import { ProductsResource } from '../resources/products.js';
import { chunk, pollTask } from '../resources/tasks.js';
import type { N11Transport } from '../transport.js';
import type { N11ProductCreateItem, N11TaskDetails } from '../types/task.js';

/**
 * Fixtures shaped after the task responses seen on n11's test store
 * (2026-10-13). Every value is invented.
 */
function taskResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 900000001,
    type: 'SKU_UPDATE',
    status: 'IN_QUEUE',
    reasons: ['1 sku işlenmeye alındı.'],
    ...overrides,
  };
}

function detailsResponse(
  status: string,
  content: unknown[],
  skus: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    taskId: 900000001,
    skus: { content, last: true, totalPages: 1, number: 0, size: 1000, ...skus },
    createdDate: '13-10-2026 11:00:31',
    modifiedDate: '13-10-2026 11:00:31',
    status,
  };
}

const placeholder = {
  taskId: 900000001,
  ownerId: 3000001,
  status: 'FAIL',
  reasons: ['1 sku işlenmeye alındı.'],
};

function result(itemCode: string, status: 'SUCCESS' | 'FAIL', sku: Record<string, unknown> = {}) {
  const reasons = status === 'SUCCESS' ? ['Başarıyla tamamlandı.'] : ['Örnek hata.'];
  return {
    id: 1,
    version: 0,
    taskId: 900000001,
    ownerId: 3000001,
    itemCode,
    status,
    sku: { ...sku, reasons },
    reasons,
  };
}

function mockTransport(...responses: unknown[]) {
  const request = vi.fn();
  for (const r of responses) request.mockResolvedValueOnce(r);
  return {
    transport: { request, integratorName: 'ExampleIntegrator' } as unknown as N11Transport,
    request,
  };
}

function createItem(overrides: Partial<N11ProductCreateItem> = {}): N11ProductCreateItem {
  return {
    stockCode: 'SKU-1',
    title: 'Örnek Ürün',
    description: '<p>Örnek</p>',
    categoryId: '1000002',
    productMainId: 'MODEL-1',
    preparingDay: 3,
    shipmentTemplate: 'Standart',
    quantity: 5,
    salePrice: 149.9,
    listPrice: 199,
    vatRate: 20,
    images: [{ url: 'https://example.invalid/1.jpg', order: 1 }],
    attributes: [
      { id: '1', valueId: '2000001' },
      { id: 429, customValue: 'Kırmızı' },
    ],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductsResource.create', () => {
  it('posts the task envelope with the integrator and numeric ids', async () => {
    const { transport, request } = mockTransport(taskResponse({ type: 'PRODUCT_CREATE' }));
    const task = await new ProductsResource(transport).create([
      createItem({ maxPurchaseQuantity: 2, catalogId: '300000001', barcode: '8690000000001' }),
    ]);

    expect(task).toEqual({
      taskId: '900000001',
      type: 'PRODUCT_CREATE',
      status: 'IN_QUEUE',
      reasons: ['1 sku işlenmeye alındı.'],
    });
    const call = request.mock.calls[0]![0];
    expect(call).toMatchObject({ method: 'POST', path: '/ms/product/tasks/product-create' });
    expect(call.body).toEqual({
      payload: {
        integrator: 'ExampleIntegrator',
        skus: [
          {
            title: 'Örnek Ürün',
            description: '<p>Örnek</p>',
            categoryId: 1000002,
            currencyType: 'TL',
            productMainId: 'MODEL-1',
            preparingDay: 3,
            shipmentTemplate: 'Standart',
            stockCode: 'SKU-1',
            quantity: 5,
            images: [{ url: 'https://example.invalid/1.jpg', order: 1 }],
            attributes: [
              { id: 1, valueId: 2000001, customValue: null },
              { id: 429, valueId: null, customValue: 'Kırmızı' },
            ],
            salePrice: 149.9,
            listPrice: 199,
            vatRate: 20,
            maxPurchaseQuantity: 2,
            catalogId: 300000001,
            barcode: '8690000000001',
          },
        ],
      },
    });
  });

  it('sends a null catalogId as null and omits unset optional fields', async () => {
    const { transport, request } = mockTransport(taskResponse(), taskResponse());
    const resource = new ProductsResource(transport);
    await resource.create([createItem({ catalogId: null, currencyType: 'USD' })]);
    const sku = request.mock.calls[0]![0].body.payload.skus[0];
    expect(sku.catalogId).toBeNull();
    expect(sku.currencyType).toBe('USD');
    await resource.create([createItem()]);
    const plain = request.mock.calls[1]![0].body.payload.skus[0];
    expect(plain).not.toHaveProperty('catalogId');
    expect(plain).not.toHaveProperty('barcode');
    expect(plain).not.toHaveProperty('maxPurchaseQuantity');
  });

  it.each([
    ['an empty batch', [] as N11ProductCreateItem[]],
    ['more than 1000 items', Array.from({ length: 1001 }, () => createItem())],
    ['3 decimals', [createItem({ salePrice: 1.005 })]],
    ['a negative price', [createItem({ listPrice: -1 })]],
    ['listPrice below salePrice', [createItem({ salePrice: 200, listPrice: 199 })]],
  ])('rejects %s before sending', async (_label, items) => {
    const { transport, request } = mockTransport();
    await expect(new ProductsResource(transport).create(items)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('throws ValidationError with the reasons when n11 rejects the task', async () => {
    const { transport } = mockTransport(
      taskResponse({ status: 'REJECT', reasons: ['Örnek red nedeni.'] }),
    );
    const error = await new ProductsResource(transport).create([createItem()]).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.issues).toEqual([{ message: 'Örnek red nedeni.' }]);
  });

  it('throws ServerError when the answer carries no task id', async () => {
    const { transport } = mockTransport(undefined);
    await expect(new ProductsResource(transport).create([createItem()])).rejects.toBeInstanceOf(
      ServerError,
    );
  });

  it('passes an injected rate limiter through', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 5, intervalMs: 1000 });
    const { transport, request } = mockTransport(taskResponse());
    await new ProductsResource(transport, limiter).delete(['SKU-1']);
    expect(request.mock.calls[0]![0].rateLimiter).toBe(limiter);
  });
});

describe('ProductsResource.update / delete', () => {
  it('sends only the fields that are set', async () => {
    const { transport, request } = mockTransport(taskResponse({ type: 'PRODUCT_UPDATE' }));
    await new ProductsResource(transport).update([
      {
        stockCode: 'SKU-1',
        status: 'Suspended',
        deleteMaxPurchaseQuantity: true,
        attributes: [{ id: 1000004, valueId: 2000001, customValue: null }],
      },
    ]);
    const call = request.mock.calls[0]![0];
    expect(call.path).toBe('/ms/product/tasks/product-update');
    expect(call.body.payload.skus).toEqual([
      {
        stockCode: 'SKU-1',
        status: 'Suspended',
        deleteMaxPurchaseQuantity: true,
        attributes: [{ id: 1000004, valueId: 2000001, customValue: null }],
      },
    ]);
  });

  it('rejects an item with nothing to update', async () => {
    const { transport, request } = mockTransport();
    await expect(
      new ProductsResource(transport).update([{ stockCode: 'SKU-1' }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(request).not.toHaveBeenCalled();
  });

  it('deletes by stock code', async () => {
    const { transport, request } = mockTransport(taskResponse({ type: 'PRODUCT_DELETE' }));
    await new ProductsResource(transport).delete(['SKU-1', 'SKU-2']);
    const call = request.mock.calls[0]![0];
    expect(call.path).toBe('/ms/product/tasks/product-delete');
    expect(call.body.payload.skus).toEqual([{ stockCode: 'SKU-1' }, { stockCode: 'SKU-2' }]);
  });
});

describe('ProductsResource.getTask', () => {
  it('normalises results and drops the in-progress placeholder row', async () => {
    const { transport, request } = mockTransport(
      detailsResponse('IN_QUEUE', [
        placeholder,
        result('SKU-1', 'SUCCESS', { n11ProductId: 700000001 }),
        result('SKU-2', 'FAIL'),
      ]),
    );
    const details = await new ProductsResource(transport).getTask('900000001');

    expect(request.mock.calls[0]![0]).toMatchObject({
      method: 'POST',
      path: '/ms/product/task-details/page-query',
      body: { taskId: 900000001, pageable: { page: 0, size: 1000 } },
      idempotent: true,
    });
    expect(details).toMatchObject({
      taskId: '900000001',
      status: 'IN_QUEUE',
      successCount: 1,
      failCount: 1,
      createdDate: '13-10-2026 11:00:31',
      modifiedDate: '13-10-2026 11:00:31',
    });
    expect(details.items.map(({ raw: _raw, ...rest }) => rest)).toEqual([
      {
        stockCode: 'SKU-1',
        status: 'SUCCESS',
        reasons: ['Başarıyla tamamlandı.'],
        n11ProductId: '700000001',
      },
      { stockCode: 'SKU-2', status: 'FAIL', reasons: ['Örnek hata.'] },
    ]);
  });

  it('reads every page of a large task', async () => {
    const { transport, request } = mockTransport(
      detailsResponse('PROCESSED', [result('SKU-1', 'SUCCESS')], { last: false, totalPages: 2 }),
      detailsResponse('PROCESSED', [result('SKU-2', 'SUCCESS')], { last: true, totalPages: 2 }),
    );
    const details = await new ProductsResource(transport).getTask('900000001');
    expect(details.items.map((i) => i.stockCode)).toEqual(['SKU-1', 'SKU-2']);
    expect(request.mock.calls[1]![0].body.pageable.page).toBe(1);
  });

  it('copes with sparse rows and a missing skus page', async () => {
    const { transport } = mockTransport(
      { taskId: 900000001 },
      detailsResponse('PROCESSED', [{ itemCode: 'SKU-1', sku: null }]),
    );
    const resource = new ProductsResource(transport);
    expect(await resource.getTask('900000001')).toEqual({
      taskId: '900000001',
      status: '',
      items: [],
      successCount: 0,
      failCount: 0,
    });
    const sparse = await resource.getTask('900000001');
    expect(sparse.items[0]).toMatchObject({ stockCode: 'SKU-1', status: '', reasons: [] });
  });

  it('throws NotFoundError for an unknown task (n11 answers 200 {})', async () => {
    const { transport } = mockTransport({});
    await expect(new ProductsResource(transport).getTask('1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('ProductsResource.waitForTask / pollTask', () => {
  it('polls until the task is PROCESSED', async () => {
    const { transport, request } = mockTransport(
      detailsResponse('IN_QUEUE', [placeholder]),
      detailsResponse('PROCESSED', [result('SKU-1', 'SUCCESS')]),
    );
    const details = await new ProductsResource(transport).waitForTask('900000001', {
      pollIntervalMs: 1,
    });
    expect(details.status).toBe('PROCESSED');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stops on REJECT', async () => {
    const { transport } = mockTransport(detailsResponse('REJECT', []));
    const details = await new ProductsResource(transport).waitForTask('900000001');
    expect(details.status).toBe('REJECT');
  });

  it('throws TimeoutError with the last result', async () => {
    const running: N11TaskDetails = {
      taskId: '9',
      status: 'IN_QUEUE',
      items: [],
      successCount: 0,
      failCount: 0,
    };
    const error = await pollTask(async () => running, '9', {
      timeoutMs: 0,
      pollIntervalMs: 1,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.data).toMatchObject({ taskId: '9', lastStatus: 'IN_QUEUE' });
  });

  it('honours an abort signal before and during the wait', async () => {
    const running: N11TaskDetails = {
      taskId: '9',
      status: 'IN_QUEUE',
      items: [],
      successCount: 0,
      failCount: 0,
    };
    const aborted = AbortSignal.abort(new Error('stop'));
    await expect(pollTask(async () => running, '9', { signal: aborted })).rejects.toThrow('stop');

    const controller = new AbortController();
    const pending = pollTask(async () => running, '9', {
      pollIntervalMs: 60_000,
      signal: controller.signal,
    });
    await new Promise((r) => setTimeout(r, 5));
    controller.abort(new Error('later'));
    await expect(pending).rejects.toThrow('later');
  });

  it('stops when the signal aborts while a poll is in flight', async () => {
    const controller = new AbortController();
    const pending = pollTask(
      async () => {
        controller.abort(new Error('mid-poll'));
        return { taskId: '9', status: 'IN_QUEUE', items: [], successCount: 0, failCount: 0 };
      },
      '9',
      { pollIntervalMs: 60_000, signal: controller.signal },
    );
    await expect(pending).rejects.toThrow('mid-poll');
  });

  it('rejects with a default error when aborted without a reason', async () => {
    const running: N11TaskDetails = {
      taskId: '9',
      status: 'IN_QUEUE',
      items: [],
      successCount: 0,
      failCount: 0,
    };
    const controller = new AbortController();
    let calls = 0;
    const pending = pollTask(
      async () => {
        calls++;
        return running;
      },
      '9',
      { pollIntervalMs: 60_000, signal: controller.signal },
    );
    await new Promise((r) => setTimeout(r, 5));
    Object.defineProperty(controller.signal, 'reason', { value: undefined });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe('InventoryResource', () => {
  it('sends stock-only and price-pair updates', async () => {
    const { transport, request } = mockTransport(taskResponse());
    const task = await new InventoryResource(transport).update([
      { stockCode: 'SKU-1', quantity: 3 },
      { stockCode: 'SKU-2', salePrice: 1450.5, listPrice: 1600, currencyType: 'TL' },
    ]);
    expect(task.type).toBe('SKU_UPDATE');
    const call = request.mock.calls[0]![0];
    expect(call.path).toBe('/ms/product/tasks/price-stock-update');
    expect(call.body.payload.skus).toEqual([
      { stockCode: 'SKU-1', quantity: 3 },
      { stockCode: 'SKU-2', listPrice: 1600, salePrice: 1450.5, currencyType: 'TL' },
    ]);
  });

  it.each([
    ['a lone salePrice', { stockCode: 'S', salePrice: 10 }],
    ['a lone listPrice', { stockCode: 'S', listPrice: 10 }],
    ['nothing to change', { stockCode: 'S' }],
    ['3 decimals', { stockCode: 'S', salePrice: 10.123, listPrice: 11 }],
    ['listPrice below salePrice', { stockCode: 'S', salePrice: 11, listPrice: 10 }],
    ['a fractional quantity', { stockCode: 'S', quantity: 1.5 }],
    ['a negative quantity', { stockCode: 'S', quantity: -1 }],
  ])('rejects %s before sending', async (_label, item) => {
    const { transport, request } = mockTransport();
    await expect(new InventoryResource(transport).update([item])).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('updateAndWait submits chunks of 1000 and waits for each', async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ stockCode: `S${i}`, quantity: 1 }));
    const { transport, request } = mockTransport(
      taskResponse({ id: 1 }),
      detailsResponse('PROCESSED', [result('S0', 'SUCCESS')]),
      taskResponse({ id: 2 }),
      detailsResponse('PROCESSED', [result('S1000', 'FAIL')]),
    );
    const results = await new InventoryResource(transport).updateAndWait(items, {
      pollIntervalMs: 1,
    });
    expect(results.map((r) => [r.successCount, r.failCount])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(request.mock.calls[0]![0].body.payload.skus).toHaveLength(1000);
    expect(request.mock.calls[2]![0].body.payload.skus).toHaveLength(1);
    expect(request.mock.calls[3]![0].body.taskId).toBe(2);
  });

  it('updateAndWait checks every item before sending anything', async () => {
    const { transport, request } = mockTransport();
    const resource = new InventoryResource(transport);
    await expect(resource.updateAndWait([])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      resource.updateAndWait([
        { stockCode: 'A', quantity: 1 },
        { stockCode: 'B', salePrice: 1 },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('task helpers', () => {
  it('chunks by 1000 by default', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([])).toEqual([]);
  });

  it('maps a TASK_ERR_* 500 to ValidationError, not a retryable ServerError', () => {
    const error = mapHttpError(500, {
      errorCode: 'TASK_ERR_008',
      errorMessage: 'payload.integrator must not be blank',
    });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.issues).toEqual([
      { code: 'TASK_ERR_008', message: 'payload.integrator must not be blank' },
    ]);
  });
});
