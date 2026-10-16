import type { N11Transport } from '../transport.js';
import { asArray, asObject, type XmlNode } from '../soap/xml.js';
import { text } from '../soap/values.js';

const SERVICE = 'cityService';

/** A city (`CityData`). */
export interface N11City {
  /** Plate code, e.g. `"34"` for İstanbul (`cityCode`); the key for {@link LocationsResource.getDistricts}. */
  code: string;
  /** n11's internal id (`cityId`), e.g. `"2534"`. */
  id: string;
  name: string;
}

/** A district (`DistrictData`) or a neighborhood (`NeighborhoodData`). */
export interface N11District {
  id: string;
  name: string;
}

/** A neighborhood (`NeighborhoodData`). */
export type N11Neighborhood = N11District;

function city(node: XmlNode | undefined): N11City {
  const c = asObject(node);
  return { code: text(c.cityCode) ?? '', id: text(c.cityId) ?? '', name: text(c.cityName) ?? '' };
}

function idName(node: XmlNode): N11District {
  const d = asObject(node);
  return { id: text(d.id) ?? '', name: text(d.name) ?? '' };
}

/**
 * Address reference data (SOAP `CityService`): cities, districts and
 * neighborhoods.
 *
 * Source: `api.n11.com/ws/CityService.wsdl` and the 2020 SOAP manual (the new
 * portal has no page for it; n11 said on 2026-10-13 that cities stay on SOAP).
 * Verified on n11's test store on 2026-10-16.
 */
export class LocationsResource {
  constructor(private readonly transport: N11Transport) {}

  /** The 81 Turkish cities (`GetCities`), in n11's order (alphabetical, by Turkish name). */
  async getCities(): Promise<N11City[]> {
    const response = await this.transport.soap({ service: SERVICE, operation: 'GetCities' });
    return asArray(asObject(response.cities).city).map(city);
  }

  /**
   * One city by plate code (`GetCity`). A code n11 does not know fails with
   * `SELLER_API.invalidAttributeValue` (`ValidationError`). n11 also answers
   * some codes that `getCities` does not list (99 was "Novosibirsk").
   */
  async getCity(cityCode: string | number): Promise<N11City> {
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetCity',
      fields: { cityCode: String(cityCode) },
    });
    return city(response.city);
  }

  /**
   * Districts of a city (`GetDistrict`), by plate code (`N11City.code`, not
   * its `id`). An unknown code answers with an empty list.
   */
  async getDistricts(cityCode: string | number): Promise<N11District[]> {
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetDistrict',
      fields: { cityCode: String(cityCode) },
    });
    return asArray(asObject(response.districts).district).map(idName);
  }

  /** Neighborhoods of a district (`GetNeighborhoods`). An unknown id answers with an empty list. */
  async getNeighborhoods(districtId: string | number): Promise<N11Neighborhood[]> {
    const response = await this.transport.soap({
      service: SERVICE,
      operation: 'GetNeighborhoods',
      fields: { districtId: String(districtId) },
    });
    return asArray(asObject(response.neighborhoods).neighborhood).map(idName);
  }
}
