import { describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '@lonca/core';
import { LocationsResource } from '../resources/locations.js';
import type { TrendyolTransport } from '../transport.js';

function mockTransport(response: unknown = undefined) {
  return {
    sellerId: 42,
    request: vi.fn().mockResolvedValue(response),
  } as unknown as TrendyolTransport;
}
const fastLimiter = () => new TokenBucketRateLimiter({ capacity: 1000, intervalMs: 1 });
const r = (t: TrendyolTransport) => new LocationsResource(t, fastLimiter());
const lastCall = (t: TrendyolTransport) =>
  (t.request as ReturnType<typeof vi.fn>).mock.calls[0]![0];

describe('LocationsResource — rate limiter', () => {
  it('forwards the injected limiter on every call', async () => {
    const limiter = fastLimiter();
    const transport = mockTransport([]);
    await new LocationsResource(transport, limiter).getCountries();
    expect(lastCall(transport).rateLimiter).toBe(limiter);
  });

  it('falls back to its own limiter when none is injected', async () => {
    const transport = mockTransport([]);
    await new LocationsResource(transport).getTurkeyCities();
    expect(lastCall(transport).rateLimiter).toBeInstanceOf(TokenBucketRateLimiter);
  });
});

// ─── Countries ───────────────────────────────────────────────────────────

describe('LocationsResource.getCountries', () => {
  it('GETs /member/countries and normalizes', async () => {
    const transport = mockTransport([
      { code: 'TR', name: 'Türkiye' },
      { code: 'AZ', name: 'Azerbaijan' },
    ]);
    const countries = await r(transport).getCountries();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/integration/member/countries' }),
    );
    expect(countries).toHaveLength(2);
    expect(countries[0]).toMatchObject({ code: 'TR', name: 'Türkiye' });
    expect(countries[0]!.raw).toEqual({ code: 'TR', name: 'Türkiye' });
  });

  it('code falls back code → id → empty string', async () => {
    const [byCode, byId, none] = await r(
      mockTransport([{ code: 'TR', id: 1 }, { id: 99, name: 'Katar' }, { name: 'Unknown' }]),
    ).getCountries();
    expect(byCode!.code).toBe('TR');
    expect(byId).toStrictEqual({ code: '99', name: 'Katar', raw: { id: 99, name: 'Katar' } });
    expect(none).toStrictEqual({ code: '', name: 'Unknown', raw: { name: 'Unknown' } });
  });

  it('returns [] for an empty list, a non-array, or an enveloped response', async () => {
    // The wire is a bare array; envelopes are not unwrapped.
    expect(await r(mockTransport([])).getCountries()).toEqual([]);
    expect(await r(mockTransport(undefined)).getCountries()).toEqual([]);
    expect(await r(mockTransport({ content: [{ code: 'TR' }] })).getCountries()).toEqual([]);
  });
});

// ─── Cities ──────────────────────────────────────────────────────────────

describe('LocationsResource — cities', () => {
  it.each([
    ['getTurkeyCities', '/integration/member/countries/domestic/TR/cities'],
    ['getAzerbaijanCities', '/integration/member/countries/domestic/AZ/cities'],
  ] as const)('%s GETs %s', async (method, path) => {
    const transport = mockTransport([]);
    await r(transport)[method]();
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path }),
    );
  });

  it('getCitiesByCountry url-encodes the country code', async () => {
    const transport = mockTransport([]);
    await r(transport).getCitiesByCountry('A E/1');
    expect(lastCall(transport).path).toBe('/integration/member/countries/A%20E%2F1/cities');
  });

  it('exposes the internal id separately from the display code', async () => {
    // Verified live: wire is { id: 100, name: 'Adana', code: '1' }. The nested
    // districts endpoint keys off `id` (100), not `code` ('1') — which 500s.
    const transport = mockTransport([{ id: 100, name: 'Adana', code: '1' }]);
    const [city] = await r(transport).getTurkeyCities();
    expect(city).toMatchObject({ id: '100', code: '1', name: 'Adana' });
  });

  it('fills City.countryCode from the lookup (city rows carry no country field)', async () => {
    // Docs and the prod wire baseline agree: a city row is { id, code?, name } only.
    const row = { id: 100, name: 'Adana', code: '1' };
    const [tr] = await r(mockTransport([row])).getTurkeyCities();
    const [az] = await r(mockTransport([{ id: 5, name: 'Bakı' }])).getAzerbaijanCities();
    const [ae] = await r(mockTransport([{ id: 7, name: 'Dubai' }])).getCitiesByCountry('AE');
    expect(tr!.countryCode).toBe('TR');
    expect(az!.countryCode).toBe('AZ');
    expect(ae!.countryCode).toBe('AE');
    expect(tr!.raw).toEqual(row);
  });

  it('code falls back to the id, then to an empty string; id stays undefined when absent', async () => {
    const [byId, none] = await r(
      mockTransport([{ id: 5, name: 'Bakı' }, { name: 'Nameless' }]),
    ).getAzerbaijanCities();
    expect(byId).toStrictEqual({
      id: '5',
      code: '5',
      name: 'Bakı',
      countryCode: 'AZ',
      raw: { id: 5, name: 'Bakı' },
    });
    expect(none).toStrictEqual({
      id: undefined,
      code: '',
      name: 'Nameless',
      countryCode: 'AZ',
      raw: { name: 'Nameless' },
    });
  });

  it('keeps a code-only row (no id) without inventing an id', async () => {
    const [city] = await r(mockTransport([{ code: 34, name: 'İstanbul' }])).getTurkeyCities();
    expect(city).toMatchObject({ id: undefined, code: '34', name: 'İstanbul' });
  });

  it('returns [] for a non-array response', async () => {
    expect(await r(mockTransport(undefined)).getTurkeyCities()).toEqual([]);
    expect(await r(mockTransport({ cities: [{ id: 1 }] })).getCitiesByCountry('AE')).toEqual([]);
  });
});

// ─── Districts ───────────────────────────────────────────────────────────

describe('LocationsResource — districts', () => {
  it.each([
    [
      'getTurkeyDistricts',
      (res: LocationsResource) => res.getTurkeyDistricts(34),
      '/integration/member/countries/domestic/TR/cities/34/districts',
    ],
    [
      'getAzerbaijanDistricts',
      (res: LocationsResource) => res.getAzerbaijanDistricts(1),
      '/integration/member/countries/domestic/AZ/cities/1/districts',
    ],
    [
      'getDistrictsByCity',
      (res: LocationsResource) => res.getDistrictsByCity('AE', 7),
      '/integration/member/countries/AE/cities/7/districts',
    ],
  ] as const)('%s GETs %s', async (_name, call, path) => {
    const transport = mockTransport([]);
    await call(r(transport));
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path }),
    );
  });

  it('url-encodes the city id and country code', async () => {
    const tr = mockTransport([]);
    await r(tr).getTurkeyDistricts('34/x y');
    expect(lastCall(tr).path).toBe(
      '/integration/member/countries/domestic/TR/cities/34%2Fx%20y/districts',
    );

    const az = mockTransport([]);
    await r(az).getAzerbaijanDistricts('a/b');
    expect(lastCall(az).path).toBe(
      '/integration/member/countries/domestic/AZ/cities/a%2Fb/districts',
    );

    const intl = mockTransport([]);
    await r(intl).getDistrictsByCity('A E', '7/8');
    expect(lastCall(intl).path).toBe('/integration/member/countries/A%20E/cities/7%2F8/districts');
  });

  it('maps a prod-shaped district row ({ code, id, name } — no city reference)', async () => {
    const row = { code: '1757', id: 1757, name: 'Kadıköy' };
    const [district] = await r(mockTransport([row])).getTurkeyDistricts(100);
    expect(district).toStrictEqual({ id: '1757', code: '1757', name: 'Kadıköy', raw: row });
    expect(district!.cityCode).toBeUndefined();
  });

  it('code falls back to the id, then to an empty string', async () => {
    const [byId, codeOnly, none] = await r(
      mockTransport([{ id: 7, name: 'Deira' }, { code: 'D1' }, {}]),
    ).getDistrictsByCity('AE', 7);
    expect(byId).toMatchObject({ id: '7', code: '7', name: 'Deira' });
    expect(codeOnly).toMatchObject({ id: undefined, code: 'D1', name: undefined });
    expect(none).toStrictEqual({ id: undefined, code: '', name: undefined, raw: {} });
  });

  it('returns [] for a non-array response', async () => {
    expect(await r(mockTransport(null)).getTurkeyDistricts(34)).toEqual([]);
    expect(await r(mockTransport({ content: [{ id: 1 }] })).getAzerbaijanDistricts(1)).toEqual([]);
  });
});

// ─── Neighborhoods ───────────────────────────────────────────────────────

describe('LocationsResource.getTurkeyNeighborhoods', () => {
  it('GETs the nested TR path with both ids url-encoded', async () => {
    const transport = mockTransport([]);
    await r(transport).getTurkeyNeighborhoods(34, 100);
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/integration/member/countries/domestic/TR/cities/34/districts/100/neighborhoods',
      }),
    );

    const encoded = mockTransport([]);
    await r(encoded).getTurkeyNeighborhoods('3/4', 'a b');
    expect(lastCall(encoded).path).toBe(
      '/integration/member/countries/domestic/TR/cities/3%2F4/districts/a%20b/neighborhoods',
    );
  });

  it('maps a prod-shaped neighborhood row ({ id, name, postCode } — no code)', async () => {
    const row = { id: 40123, name: 'Caferağa Mah.', postCode: '34710' };
    const [nb] = await r(mockTransport([row])).getTurkeyNeighborhoods(100, 1757);
    expect(nb).toStrictEqual({
      id: '40123',
      code: '40123', // deprecated: mirrors the id
      name: 'Caferağa Mah.',
      postCode: '34710',
      raw: row,
    });
    expect(nb!.districtCode).toBeUndefined();
  });

  it('ignores a wire `code` — Neighborhood.code always mirrors the id', async () => {
    const [nb] = await r(mockTransport([{ id: 1, code: 'X-9', name: 'A' }])).getTurkeyNeighborhoods(
      1,
      2,
    );
    expect(nb).toMatchObject({ id: '1', code: '1' });
  });

  it('leaves Neighborhood.postCode undefined when the row has none or a non-string', async () => {
    const [a, b, c] = await r(
      mockTransport([{ id: 1, name: 'A' }, { id: 2, name: 'B', postCode: 34710 }, { name: 'C' }]),
    ).getTurkeyNeighborhoods(100, 1757);
    expect(a!.postCode).toBeUndefined();
    expect(b!.postCode).toBeUndefined();
    expect(c).toMatchObject({ id: undefined, code: '' });
  });

  it('returns [] for an empty list or a non-array response', async () => {
    expect(await r(mockTransport([])).getTurkeyNeighborhoods(1, 2)).toEqual([]);
    expect(await r(mockTransport({ items: [{ id: 1 }] })).getTurkeyNeighborhoods(1, 2)).toEqual([]);
  });
});
