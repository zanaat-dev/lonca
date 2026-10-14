import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { ClaimsResource } from '../resources/claims.js';
import { ShippingResource } from '../resources/shipping.js';
import { TestOrdersResource } from '../resources/test-orders.js';
import type { HepsiburadaTransport } from '../transport.js';

function mockTransport(response: unknown = undefined, merchantId = 'M-42') {
  return {
    merchantId,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HepsiburadaTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });

// ─── Shipping ────────────────────────────────────────────────────────────

describe('ShippingResource', () => {
  const r = (t: HepsiburadaTransport) => new ShippingResource(t, fastLimiter());

  it('getCargoFirms GETs /cargoFirms/{merchantId} on shipping service', async () => {
    const transport = mockTransport([{ id: 1, name: 'Aras', code: 'ARAS' }]);
    const firms = await r(transport).getCargoFirms();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        service: 'shipping',
        path: '/cargoFirms/M-42',
      }),
    );
    expect(firms[0]).toMatchObject({ id: 1, name: 'Aras', code: 'ARAS' });
    expect(firms[0]!.raw).toBeDefined();
  });

  it('getCargoFirms unwraps { items: [] } / { data: [] } envelopes too', async () => {
    const fromItems = await r(mockTransport({ items: [{ name: 'X' }] })).getCargoFirms();
    expect(fromItems[0]!.name).toBe('X');
    const fromData = await r(mockTransport({ data: [{ name: 'Y' }] })).getCargoFirms();
    expect(fromData[0]!.name).toBe('Y');
  });

  it('getCargoFirms unwraps the live { cargoFirms: [...] } envelope', async () => {
    // Verified live: this endpoint wraps rows under `cargoFirms`, which the SDK
    // previously did not unwrap → always returned [].
    const firms = await r(
      mockTransport({ cargoFirms: [{ id: 1, name: 'Aras' }], error: null }),
    ).getCargoFirms();
    expect(firms).toHaveLength(1);
    expect(firms[0]!.name).toBe('Aras');
  });

  it('listProfiles GETs /profiles/{merchantId}', async () => {
    const transport = mockTransport([{ profileName: 'P1' }]);
    const profiles = await r(transport).listProfiles();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/profiles/M-42', service: 'shipping' }),
    );
    expect(profiles[0]!.profileName).toBe('P1');
  });

  it('listProfiles unwraps the live { profiles: [...] } envelope', async () => {
    // Verified live: rows live under `profiles` (not bare array / items / data).
    const profiles = await r(
      mockTransport({ profiles: [{ profileName: 'P9' }], error: null }),
    ).listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.profileName).toBe('P9');
  });

  it('createProfile POSTs to /profile/createByMerchantId with body', async () => {
    const transport = mockTransport({ ok: true });
    await r(transport).createProfile({ profileName: 'New', cargoFirms: 'ARAS,MNG' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'shipping',
        path: '/profile/createByMerchantId',
        body: { merchantId: 'M-42', profileName: 'New', cargoFirms: 'ARAS,MNG' },
      }),
    );
  });

  it('updateProfile PUTs to /profile/updateByMerchantId', async () => {
    const transport = mockTransport();
    await r(transport).updateProfile({ profileName: 'Existing' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        service: 'shipping',
        path: '/profile/updateByMerchantId',
      }),
    );
  });

  it('createProfile / updateProfile throw on falsy input', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).createProfile(null as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input is required/);
    await expect(
      r(transport).updateProfile(undefined as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input is required/);
  });
});

// ─── Claims ──────────────────────────────────────────────────────────────

describe('ClaimsResource', () => {
  const r = (t: HepsiburadaTransport) => new ClaimsResource(t, fastLimiter());

  it('list defaults offset/limit (Hepsiburada rejects a missing limit with 400)', async () => {
    const transport = mockTransport([]);
    await r(transport).list();
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.service).toBe('oms');
    expect(call.path).toBe('/claims/merchantId/M-42');
    // Was `undefined` before — that produced `400 LimitCannotBeEmpty` live.
    expect(call.query).toEqual({ offset: 0, limit: 100 });
  });

  it('list lets caller override the default limit/offset', async () => {
    const transport = mockTransport([]);
    await r(transport).list({ limit: 5 });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({ offset: 0, limit: 5 });
  });

  it('list forwards beginDate / endDate / offset / limit', async () => {
    const transport = mockTransport([]);
    await r(transport).list({
      beginDate: '2026-01-01 00:00',
      endDate: '2026-02-01 00:00',
      offset: 0,
      limit: 50,
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.query).toEqual({
      beginDate: '2026-01-01 00:00',
      endDate: '2026-02-01 00:00',
      offset: 0,
      limit: 50,
    });
  });

  it('listByStatus GETs /claims/merchantId/{id}/status/{status} with extra date filters', async () => {
    const transport = mockTransport([{ claimNumber: 'C-1', status: 'Open' }]);
    const rows = await r(transport).listByStatus('Open', {
      offset: 10,
      limit: 5,
      statusBeginDate: '2026-02-01 00:00',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.path).toBe('/claims/merchantId/M-42/status/Open');
    expect(call.query).toEqual({
      offset: 10,
      limit: 5,
      statusBeginDate: '2026-02-01 00:00',
    });
    expect(rows[0]).toMatchObject({ claimNumber: 'C-1', status: 'Open' });
  });

  it('listByStatus defaults offset/limit and forwards every date filter, URL-encoding the status', async () => {
    const transport = mockTransport([]);
    await r(transport).listByStatus('Awaiting Action', {
      beginDate: '2026-01-01 00:00',
      endDate: '2026-02-01 00:00',
      statusBeginDate: '2026-01-15 00:00',
      statusEndDate: '2026-01-31 00:00',
    });
    const call = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.service).toBe('oms');
    expect(call.path).toBe('/claims/merchantId/M-42/status/Awaiting%20Action');
    expect(call.query).toEqual({
      beginDate: '2026-01-01 00:00',
      endDate: '2026-02-01 00:00',
      statusBeginDate: '2026-01-15 00:00',
      statusEndDate: '2026-01-31 00:00',
      offset: 0,
      limit: 100,
    });
  });

  it('listByStatus throws on empty status', async () => {
    const transport = mockTransport([]);
    await expect(r(transport).listByStatus('' as unknown as string)).rejects.toThrow(
      /status is required/,
    );
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('maps claimNumber / status / createdAt and keeps the raw row', async () => {
    const row = {
      claimNumber: 'C-1',
      status: 'NewRequest',
      createdAt: '2026-02-01T10:00:00',
      orderNumber: 'O-1',
    };
    await expect(r(mockTransport([row])).list()).resolves.toEqual([
      { claimNumber: 'C-1', status: 'NewRequest', createdAt: '2026-02-01T10:00:00', raw: row },
    ]);
    // Absent fields stay absent (never invented).
    await expect(r(mockTransport([{ orderNumber: 'O-2' }])).list()).resolves.toEqual([
      { raw: { orderNumber: 'O-2' } },
    ]);
  });

  it.each([
    ['items', { items: [{ claimNumber: 'C-I' }] }, 'C-I'],
    ['data', { data: [{ claimNumber: 'C-D' }] }, 'C-D'],
    ['claims', { claims: [{ claimNumber: 'C-C' }], totalCount: 1 }, 'C-C'],
  ] as const)('unwraps the { %s: [...] } envelope', async (_key, response, expected) => {
    const byList = await r(mockTransport(response)).list();
    expect(byList.map((c) => c.claimNumber)).toEqual([expected]);
    const byStatus = await r(mockTransport(response)).listByStatus('NewRequest');
    expect(byStatus.map((c) => c.claimNumber)).toEqual([expected]);
  });

  it('prefers `items` over `data` / `claims` when several envelopes are present', async () => {
    const rows = await r(
      mockTransport({ items: [{ claimNumber: 'A' }], data: [{ claimNumber: 'B' }] }),
    ).list();
    expect(rows.map((c) => c.claimNumber)).toEqual(['A']);
  });

  it('returns [] for an unrecognised or empty response instead of throwing', async () => {
    for (const response of [undefined, null, {}, { claims: null }, 'nope']) {
      await expect(r(mockTransport(response)).list()).resolves.toEqual([]);
    }
  });

  it.each(['accept', 'reject', 'preApprovalConfirm'] as const)(
    '%s POSTs to /claims/number/{number}/<action> on oms service',
    async (action) => {
      const transport = mockTransport();
      const resource = r(transport);
      const path = {
        accept: '/claims/number/CLM-1/accept',
        reject: '/claims/number/CLM-1/reject',
        preApprovalConfirm: '/claims/number/CLM-1/preapprovalconfirm',
      }[action];
      await resource[action]('CLM-1', { foo: 'bar' });
      expect(transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          service: 'oms',
          path,
          body: { foo: 'bar' },
        }),
      );
    },
  );

  it.each(['accept', 'reject', 'preApprovalConfirm'] as const)(
    '%s throws on empty claimNumber',
    async (action) => {
      const transport = mockTransport();
      const resource = r(transport);
      await expect(resource[action]('' as unknown as string)).rejects.toThrow(
        /claimNumber is required/,
      );
    },
  );

  it('create POSTs to /claims/merchant/{id}/create on claim-stub service', async () => {
    const transport = mockTransport({ claimNumber: 'CLM-2' });
    const out = await r(transport).create({ orderNumber: 'O-1', lines: [] });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'claim-stub',
        path: '/claims/merchant/M-42/create',
        body: { orderNumber: 'O-1', lines: [] },
      }),
    );
    // Action mutations now return a typed { raw } envelope (the API response on `.raw`).
    expect(out).toEqual({ raw: { claimNumber: 'CLM-2' } });
  });

  it('create throws on falsy input', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create(undefined as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input is required/);
  });
});

// ─── Test orders ─────────────────────────────────────────────────────────

describe('TestOrdersResource', () => {
  const r = (t: HepsiburadaTransport) => new TestOrdersResource(t, fastLimiter());

  it('create POSTs to /orders/merchantId/{id} on oms-stub service', async () => {
    const transport = mockTransport({ orderNumber: 'TO-1' });
    const out = await r(transport).create({ customer: {}, lines: [] });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        service: 'oms-stub',
        path: '/orders/merchantId/M-42',
        body: { customer: {}, lines: [] },
      }),
    );
    expect(out).toEqual({ raw: { orderNumber: 'TO-1' } });
  });

  it('create throws on falsy input', async () => {
    const transport = mockTransport();
    await expect(
      r(transport).create(undefined as unknown as Record<string, unknown>),
    ).rejects.toThrow(/input is required/);
  });
});
