import { describe, expect, it, vi } from 'vitest';
import { LocationsResource } from '../resources/locations.js';
import { parseXml, type XmlObject } from '../soap/xml.js';
import type { N11Transport } from '../transport.js';

/**
 * Responses are XML parsed with the SDK's own parser; element names follow
 * what n11's test store sent on 2026-10-16. Names and ids are illustrative.
 */
function response(inner: string): XmlObject {
  return parseXml(`<R><result><status>success</status></result>${inner}</R>`).R as XmlObject;
}

function mockTransport(...responses: XmlObject[]) {
  const soap = vi.fn();
  for (const r of responses) soap.mockResolvedValueOnce(r);
  return { resource: new LocationsResource({ soap } as unknown as N11Transport), soap };
}

const cityXml = (code: number, name: string) =>
  `<city><cityCode>${code}</cityCode><cityId>${2500 + code}</cityId><cityName>${name}</cityName></city>`;

describe('LocationsResource', () => {
  it('lists cities', async () => {
    const { resource, soap } = mockTransport(
      response(`<cities>${cityXml(1, 'Adana')}${cityXml(2, 'Adıyaman')}</cities>`),
    );
    expect(await resource.getCities()).toEqual([
      { code: '1', id: '2501', name: 'Adana' },
      { code: '2', id: '2502', name: 'Adıyaman' },
    ]);
    expect(soap.mock.calls[0]![0]).toEqual({ service: 'cityService', operation: 'GetCities' });
  });

  it('reads one city by plate code', async () => {
    const { resource, soap } = mockTransport(response(cityXml(34, 'İstanbul')));
    expect(await resource.getCity(34)).toEqual({ code: '34', id: '2534', name: 'İstanbul' });
    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'cityService',
      operation: 'GetCity',
      fields: { cityCode: '34' },
    });
  });

  it('lists districts of a city, a single one included', async () => {
    const { resource, soap } = mockTransport(
      response(
        '<districts><district><id>22966</id><name>Gölyaka</name></district>' +
          '<district><id>23200</id><name>Düzce Merkez</name></district></districts>',
      ),
      response('<districts><district><id>1</id><name>Tek</name></district></districts>'),
    );
    expect(await resource.getDistricts('81')).toEqual([
      { id: '22966', name: 'Gölyaka' },
      { id: '23200', name: 'Düzce Merkez' },
    ]);
    expect(await resource.getDistricts(1)).toEqual([{ id: '1', name: 'Tek' }]);
    expect(soap.mock.calls.map((c) => c[0].fields)).toEqual([
      { cityCode: '81' },
      { cityCode: '1' },
    ]);
  });

  it('lists neighborhoods of a district', async () => {
    const { resource, soap } = mockTransport(
      response(
        '<neighborhoods><neighborhood><id>26004</id><name>Afanoğlu</name></neighborhood>' +
          '<neighborhood><id>26006</id><name>Akbıyıklar</name></neighborhood></neighborhoods>',
      ),
    );
    expect(await resource.getNeighborhoods(23200)).toEqual([
      { id: '26004', name: 'Afanoğlu' },
      { id: '26006', name: 'Akbıyıklar' },
    ]);
    expect(soap.mock.calls[0]![0]).toEqual({
      service: 'cityService',
      operation: 'GetNeighborhoods',
      fields: { districtId: '23200' },
    });
  });

  it('answers unknown codes with empty lists, as n11 does', async () => {
    const { resource } = mockTransport(
      response('<districts/>'),
      response('<neighborhoods/>'),
      response(''),
    );
    expect(await resource.getDistricts(99)).toEqual([]);
    expect(await resource.getNeighborhoods(1)).toEqual([]);
    expect(await resource.getCities()).toEqual([]);
  });

  it('keeps empty strings for a city element with missing children', async () => {
    const { resource } = mockTransport(response('<city/>'));
    expect(await resource.getCity(1)).toEqual({ code: '', id: '', name: '' });
  });
});
