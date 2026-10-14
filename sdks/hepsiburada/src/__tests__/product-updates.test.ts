import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, TokenBucketRateLimiter, ValidationError } from '@lonca/core';
import { ProductUpdatesResource } from '../resources/product-updates.js';
import { mapHttpError } from '../errors.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-pu') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: HepsiburadaTransport) => new ProductUpdatesResource(t, fastLimiter());
const lastCall = (t: HepsiburadaTransport) =>
  (t.request as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;

/**
 * `PageResponseIntegratorImportStatusDto` as the portal spec documents it for
 * `GET /api/integrator/status/{trackingId}` (`mpop-product-updates.json`).
 */
const statusPage = (data: unknown[]) => ({
  success: true,
  code: 0,
  version: 1,
  message: null,
  totalElements: data.length,
  totalPages: 1,
  number: 0,
  numberOfElements: data.length,
  first: true,
  last: true,
  data,
});

/** The JSON file inside the multipart `file` field of an import request. */
async function uploadedFile(body: unknown): Promise<{ name: string; type: string; json: unknown }> {
  expect(body).toBeInstanceOf(FormData);
  const file = (body as FormData).get('file');
  expect(file).toBeInstanceOf(Blob);
  const blob = file as File;
  return { name: blob.name, type: blob.type, json: JSON.parse(await blob.text()) };
}

describe('productUpdates.importUpdates', () => {
  it('POSTs the rows as a `{ merchantId, items }` JSON file in the multipart `file` field', async () => {
    const limiter = fastLimiter();
    const transport = mockTransport({ trackingId: 'TRK-U1' });
    const rows = [
      { hbSku: 'HB-1', productName: 'Yeni ad', image1: 'https://img/1.jpg' },
      { hbSku: 'HB-2', attributes: { malzeme: '' } },
    ];
    await new ProductUpdatesResource(transport, limiter).importUpdates(rows);
    const call = lastCall(transport);
    expect(call).toMatchObject({
      method: 'POST',
      service: 'mpop',
      path: '/ticket-api/api/integrator/import',
    });
    expect(await uploadedFile(call.body)).toEqual({
      name: 'integrator-ticket-upload.json',
      type: 'application/json',
      json: { merchantId: 'M-pu', items: rows },
    });
    expect(call.query).toBeUndefined();
    // The resource's own limiter is handed to the transport on every call.
    expect(call.rateLimiter).toBe(limiter);
  });

  it.each([
    ['no hbSku', [{ productName: 'x' }]],
    ['an empty hbSku', [{ hbSku: '' }]],
    ['a non-object row', [{ hbSku: 'HB-1' }, null]],
  ])('rejects a batch with %s before sending', async (_label, rows) => {
    const transport = mockTransport();
    await expect(r(transport).importUpdates(rows as unknown[])).rejects.toThrow(
      /needs a non-empty hbSku/,
    );
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('returns the trackingId and the untouched response', async () => {
    const response = { trackingId: 'TRK-U1', success: true };
    await expect(r(mockTransport(response)).importUpdates([{ hbSku: 'HB-1' }])).resolves.toEqual({
      trackingId: 'TRK-U1',
      raw: response,
    });
  });

  it('falls back to `id` (stringified) when the response carries no trackingId', async () => {
    const receipt = await r(mockTransport({ id: 42 })).importUpdates([{ hbSku: 'HB-1' }]);
    expect(receipt.trackingId).toBe('42');
  });

  it('never throws on a bodiless / non-object response: empty trackingId, empty raw', async () => {
    for (const response of [undefined, null, 'accepted']) {
      await expect(r(mockTransport(response)).importUpdates([{ hbSku: 'HB-1' }])).resolves.toEqual({
        trackingId: '',
        raw: {},
      });
    }
  });

  it('rejects an empty or non-array batch client-side, without a request', async () => {
    const transport = mockTransport();
    await expect(r(transport).importUpdates([])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      r(transport).importUpdates({ hbSku: 'HB-1' } as unknown as unknown[]),
    ).rejects.toThrow(/non-empty/);
    expect(transport.request).not.toHaveBeenCalled();
  });
});

describe('productUpdates.getUpdateStatus', () => {
  it('maps success, code and message of a rejected batch (SIT answer for an unknown hbSku)', async () => {
    const status = await r(
      mockTransport({
        ...statusPage([]),
        success: false,
        code: 4009,
        message: 'Variant is not found.',
      }),
    ).getUpdateStatus('TRK-1');
    expect(status).toMatchObject({
      success: false,
      code: 4009,
      message: 'Variant is not found.',
      rows: [],
    });
  });

  it('GETs /ticket-api/api/integrator/status/{trackingId} on mpop with the id URL-encoded', async () => {
    const transport = mockTransport(statusPage([]));
    await r(transport).getUpdateStatus('TRK 1/2');
    const call = lastCall(transport);
    expect(call).toMatchObject({
      method: 'GET',
      service: 'mpop',
      path: '/ticket-api/api/integrator/status/TRK%201%2F2',
    });
    expect(call.body).toBeUndefined();
  });

  it('rejects an empty trackingId client-side, without a request', async () => {
    const transport = mockTransport();
    await expect(r(transport).getUpdateStatus('')).rejects.toBeInstanceOf(ValidationError);
    await expect(r(transport).getUpdateStatus('')).rejects.toThrow(/trackingId is required/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('maps rows from the documented page envelope (`data[]`)', async () => {
    const item = {
      merchantId: 'M-pu',
      items: [{ hbSku: 'HB-1', productStatus: 'COMPLETED', message: null, updateResults: [] }],
    };
    const status = await r(mockTransport(statusPage([item]))).getUpdateStatus('TRK-1');
    // Rows were dropped before (only `rows` / `items` were read), although the
    // spec puts them under `data`.
    expect(status.rows).toEqual([item]);
    expect(status.raw.totalElements).toBe(1);
    // `message: null` and the absent top-level `status` are not invented.
    expect(status).not.toHaveProperty('message');
    expect(status).not.toHaveProperty('status');
    expect(status).not.toHaveProperty('trackingId');
  });

  it('maps string trackingId / status / message and reads `rows`, then `items`', async () => {
    const fromRows = await r(
      mockTransport({
        trackingId: 'TRK-1',
        status: 'Done',
        message: 'ok',
        rows: [{ hbSku: 'A' }],
        items: [{ hbSku: 'ignored' }],
        data: [{ hbSku: 'ignored' }],
      }),
    ).getUpdateStatus('TRK-1');
    expect(fromRows).toMatchObject({
      trackingId: 'TRK-1',
      status: 'Done',
      message: 'ok',
      rows: [{ hbSku: 'A' }],
    });

    const fromItems = await r(
      mockTransport({ items: [{ hbSku: 'B' }], data: [{ hbSku: 'ignored' }] }),
    ).getUpdateStatus('TRK-1');
    expect(fromItems.rows).toEqual([{ hbSku: 'B' }]);
  });

  it('ignores fields of the wrong JSON type instead of coercing them', async () => {
    const response = { trackingId: 7, status: true, message: { text: 'x' }, rows: 'nope' };
    await expect(r(mockTransport(response)).getUpdateStatus('TRK-1')).resolves.toEqual({
      raw: response,
    });
  });

  it('returns `{ raw: {} }` for a bodiless / non-object response', async () => {
    await expect(r(mockTransport(null)).getUpdateStatus('TRK-1')).resolves.toEqual({ raw: {} });
    await expect(r(mockTransport('OK')).getUpdateStatus('TRK-1')).resolves.toEqual({ raw: {} });
  });

  it('propagates transport errors (an unknown id is a 404, not an empty status)', async () => {
    const transport = {
      merchantId: 'M-pu',
      request: vi.fn().mockRejectedValue(mapHttpError(404, { message: 'not found' })),
    } as unknown as HepsiburadaTransport;
    await expect(r(transport).getUpdateStatus('TRK-404')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('productUpdates.getUpdateHistory', () => {
  it('GETs /ticket-api/api/integrator/merchant/{merchantId}/hbSku/{hbSku} with both segments URL-encoded', async () => {
    const transport = mockTransport([], 'M pu/1');
    await r(transport).getUpdateHistory('HB SKU/1');
    expect(lastCall(transport)).toMatchObject({
      method: 'GET',
      service: 'mpop',
      path: '/ticket-api/api/integrator/merchant/M%20pu%2F1/hbSku/HB%20SKU%2F1',
    });
  });

  it('rejects an empty hbSku client-side, without a request', async () => {
    const transport = mockTransport();
    await expect(r(transport).getUpdateHistory('')).rejects.toBeInstanceOf(ValidationError);
    await expect(r(transport).getUpdateHistory('')).rejects.toThrow(/hbSku is required/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('maps trackingId / status / createdAt / modifiedAt per row and keeps the raw row', async () => {
    const row = {
      trackingId: 'TRK-1',
      status: 'COMPLETED',
      modifiedAt: '2026-08-30T10:00:00',
      createdAt: '2026-08-30T09:00:00',
    };
    const [entry] = await r(mockTransport([row])).getUpdateHistory('HB-1');
    expect(entry).toEqual({
      trackingId: 'TRK-1',
      status: 'COMPLETED',
      createdAt: '2026-08-30T09:00:00',
      modifiedAt: '2026-08-30T10:00:00',
      raw: row,
    });
  });

  it('unwraps `{ items }` and the mpop `{ data }` envelope as well as a bare array', async () => {
    const fromItems = await r(mockTransport({ items: [{ trackingId: 'I' }] })).getUpdateHistory(
      'HB-1',
    );
    expect(fromItems.map((e) => e.trackingId)).toEqual(['I']);
    const fromData = await r(
      mockTransport({ success: true, code: 0, data: [{ trackingId: 'D' }] }),
    ).getUpdateHistory('HB-1');
    expect(fromData.map((e) => e.trackingId)).toEqual(['D']);
  });

  it('returns [] when no row list can be found (null, non-array `data`, unknown envelope)', async () => {
    for (const response of [null, undefined, { success: true, data: {} }, { results: [{}] }]) {
      await expect(r(mockTransport(response)).getUpdateHistory('HB-1')).resolves.toEqual([]);
    }
  });

  it('keeps non-object rows as empty entries and ignores non-string fields', async () => {
    const entries = await r(
      mockTransport([null, 'x', { trackingId: 1, status: null, modifiedAt: 0 }]),
    ).getUpdateHistory('HB-1');
    expect(entries).toEqual([
      { raw: {} },
      { raw: {} },
      { raw: { trackingId: 1, status: null, modifiedAt: 0 } },
    ]);
  });
});
