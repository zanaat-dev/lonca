import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, TokenBucketRateLimiter } from '@lonca/core';
import { ClaimsResource } from '../resources/claims.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}

const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new ClaimsResource(t, fastLimiter());

describe('ClaimsResource.create', () => {
  it('POSTs to /claims/create with the typed input as body', async () => {
    const transport = mockTransport({ claimId: 'abc' });
    await r(transport).create({
      orderNumber: 'O1',
      claimItems: [{ barcode: 'B1', quantity: 1, reasonId: 401 }],
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/integration/order/sellers/42/claims/create',
        body: {
          orderNumber: 'O1',
          claimItems: [{ barcode: 'B1', quantity: 1, reasonId: 401 }],
        },
      }),
    );
  });

  it('maps claimId, claimItemIds and the return tracking number (stage answer, 2026-10-14)', async () => {
    const raw = {
      claimId: 'c9f0cffa-2e17-4928-9156-358f843881a4',
      cargoTrackingNumber: 7330000174454378,
      claimItemIds: ['c96289b2', '1989c140'],
    };
    await expect(
      r(mockTransport(raw)).create({
        orderNumber: '750489847',
        shipmentCompanyId: 17,
        claimItems: [{ barcode: 'B1', quantity: 2, reasonId: 401 }],
      }),
    ).resolves.toEqual({
      claimId: 'c9f0cffa-2e17-4928-9156-358f843881a4',
      claimItemIds: ['c96289b2', '1989c140'],
      cargoTrackingNumber: '7330000174454378',
      raw,
    });
    await expect(
      r(mockTransport(undefined)).create({
        orderNumber: 'O1',
        claimItems: [{ barcode: 'B1', quantity: 1, reasonId: 401 }],
      }),
    ).resolves.toEqual({ claimItemIds: [], raw: undefined });
  });

  it('throws ValidationError on empty claimItems', async () => {
    const transport = mockTransport();
    await expect(r(transport).create({ orderNumber: 'O1', claimItems: [] })).rejects.toThrow(
      /claimItems must not be empty/,
    );
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('ClaimsResource.createIssue', () => {
  it('POSTs to /claims/{id}/issue with FormData body', async () => {
    const transport = mockTransport();
    await r(transport).createIssue('CLM-1', {
      claimIssueReasonId: 5,
      claimItemIdList: ['it-1', 'it-2'],
      description: 'red sebebi',
    });

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/integration/order/sellers/42/claims/CLM-1/issue');
    expect(call.body).toBeInstanceOf(FormData);

    const fd = call.body as FormData;
    expect(fd.get('claimIssueReasonId')).toBe('5');
    expect(fd.get('claimItemIdList')).toBe('it-1,it-2');
    expect(fd.get('description')).toBe('red sebebi');
  });

  it('attaches files when provided', async () => {
    const transport = mockTransport();
    const blob1 = new Blob(['hello'], { type: 'application/pdf' });
    const blob2 = new Blob(['world'], { type: 'image/jpeg' });

    await r(transport).createIssue('CLM-1', {
      claimIssueReasonId: 1,
      claimItemIdList: ['x'],
      description: 'd',
      files: [blob1, blob2],
    });

    const fd = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0].body as FormData;
    expect(fd.getAll('files')).toHaveLength(2);
  });

  it('throws ValidationError on empty claimItemIdList', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).createIssue('C1', {
        claimIssueReasonId: 1,
        claimItemIdList: [],
        description: 'd',
      }),
    ).rejects.toThrow(/claimItemIdList must not be empty/);
  });

  it('throws ValidationError on empty description', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).createIssue('C1', {
        claimIssueReasonId: 1,
        claimItemIdList: ['x'],
        description: '',
      }),
    ).rejects.toThrow(/description is required/);
  });

  it('throws ValidationError on >500-char description', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).createIssue('C1', {
        claimIssueReasonId: 1,
        claimItemIdList: ['x'],
        description: 'x'.repeat(501),
      }),
    ).rejects.toThrow(/≤500 chars/);
  });
});

describe('ClaimsResource.approveLineItems', () => {
  it('PUTs to /claims/{id}/items/approve with the input as body + returns a { raw } envelope', async () => {
    const transport = mockTransport({ approved: true });
    const out = await r(transport).approveLineItems('CLM-1', {
      claimLineItemIdList: ['line-1', 'line-2'],
    });

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/integration/order/sellers/42/claims/CLM-1/items/approve',
        body: { claimLineItemIdList: ['line-1', 'line-2'] },
      }),
    );
    // Mutation methods now return the API response on `.raw` (was bare `unknown`).
    expect(out).toEqual({ raw: { approved: true } });
  });

  it('throws ValidationError on empty list', async () => {
    const transport = mockTransport();
    await expect(r(transport).approveLineItems('C1', { claimLineItemIdList: [] })).rejects.toThrow(
      /must not be empty/,
    );
  });
});

describe('ClaimsResource.list', () => {
  it('sends orderNumber and comma-separated claimIds', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).list({ orderNumber: '931144167', claimIds: [1, '2'] });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({ orderNumber: '931144167', claimIds: '1,2' });
  });

  it('turns the 404 "order.not.found" answer for a search with no match into an empty page', async () => {
    const transport = {
      sellerId: 42,
      request: vi.fn().mockRejectedValue(
        new NotFoundError({
          message: 'Trendyol resource not found',
          status: 404,
          data: {
            body: {
              exception: 'SupplierApiDomainNotFoundException',
              errors: [{ key: 'order.not.found', message: 'Order not found for claim' }],
            },
          },
        }),
      ),
    } as unknown as TrendyolTransport;
    await expect(r(transport).list()).resolves.toEqual({ items: [] });
  });

  it('still throws any other 404', async () => {
    const transport = {
      sellerId: 42,
      request: vi.fn().mockRejectedValue(
        new NotFoundError({
          message: 'nope',
          status: 404,
          data: { body: { errors: [{ key: 'other' }] } },
        }),
      ),
    } as unknown as TrendyolTransport;
    await expect(r(transport).list()).rejects.toBeInstanceOf(NotFoundError);
    const bare = {
      sellerId: 42,
      request: vi.fn().mockRejectedValue(new NotFoundError({ message: 'nope', status: 404 })),
    } as unknown as TrendyolTransport;
    await expect(r(bare).list()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('GETs /claims with default page+size', async () => {
    const transport = mockTransport({ content: [], totalPages: 0 });
    await r(transport).list();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/order/sellers/42/claims',
        query: { page: 0, size: 50 },
      }),
    );
  });

  it('forwards filters + cursor + emits nextCursor while more pages remain', async () => {
    const transport = mockTransport({ content: [], totalPages: 3 });
    const start = new Date('2026-01-01T00:00:00Z');

    const page = await r(transport).list({
      cursor: '0',
      limit: 200,
      claimItemStatus: 'WaitingInAction',
      startDate: start,
    });

    expect(page.nextCursor).toBe('1');
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toMatchObject({
      page: 0,
      size: 200,
      claimItemStatus: 'WaitingInAction',
      startDate: start.getTime(),
    });
  });

  it('normalizes claim shape with ISO dates and accepts both `id` and `claimId`', async () => {
    const transport = mockTransport({
      totalPages: 1,
      content: [
        {
          claimId: 'CLM-1',
          orderNumber: 'O1',
          orderDate: 1779363893000,
          claimDate: 1779363993000,
          customerFirstName: 'Test',
          customerLastName: 'User',
        },
      ],
    });

    const page = await r(transport).list();
    expect(page.items[0]).toMatchObject({
      id: 'CLM-1',
      orderNumber: 'O1',
      orderDate: new Date(1779363893000).toISOString(),
      claimDate: new Date(1779363993000).toISOString(),
      customerFirstName: 'Test',
      customerLastName: 'User',
    });
  });

  it('falls back to `id` when `claimId` is absent', async () => {
    const transport = mockTransport({
      totalPages: 1,
      content: [{ id: 'X', orderNumber: 'O2' }],
    });
    const page = await r(transport).list();
    expect(page.items[0]!.id).toBe('X');
  });
});

describe('ClaimsResource.getIssueReasons', () => {
  it('GETs the unscoped /claim-issue-reasons endpoint (no sellerId in path)', async () => {
    const transport = mockTransport([
      { id: 1, name: 'reason-1' },
      { id: 2, name: 'reason-2' },
    ]);
    const reasons = await r(transport).getIssueReasons();

    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/order/claim-issue-reasons',
      }),
    );
    expect(reasons).toEqual([
      { id: 1, name: 'reason-1' },
      { id: 2, name: 'reason-2' },
    ]);
  });
});

describe('ClaimsResource.getItemAudits', () => {
  it('GETs /claims/items/{id}/audit and url-encodes the id', async () => {
    const transport = mockTransport([{ event: 'created' }]);
    await r(transport).getItemAudits('item id/1');

    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/integration/order/sellers/42/claims/items/item%20id%2F1/audit');
  });

  it('wraps each row as { raw } regardless of array vs { content }', async () => {
    const transport1 = mockTransport([{ a: 1 }, { b: 2 }]);
    const a = await r(transport1).getItemAudits('x');
    expect(a).toEqual([{ raw: { a: 1 } }, { raw: { b: 2 } }]);

    const transport2 = mockTransport({ content: [{ c: 3 }] });
    const b = await r(transport2).getItemAudits('x');
    expect(b).toEqual([{ raw: { c: 3 } }]);

    const transport3 = mockTransport({});
    const c = await r(transport3).getItemAudits('x');
    expect(c).toEqual([]);
  });
});
